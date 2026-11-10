  let userLat = null;
  let userLng = null;
  let gameStarted = false;
  let autoCenterEnabled = true;
  let compassActive = false;
  let smoothedHeading = null;
  let headingFrameQueued = false;
  let allowLowAccuracyStart = false;
  let gridAreaWarned = false;
  
  let activeTarget = null;
  let distanceInterval = null;

  // Game Economy, Inventory & Land Ownership State
  const savedGold = localStorage.getItem('rpg_player_gold');
  let playerGold = (savedGold !== null) ? parseInt(savedGold, 10) || 0 : 0;
  
  const PLOT_PRICE = 100;
  const MIN_START_ACCURACY_FEET = 30; 
  const INTERACTION_RADIUS_FEET = 150;
  
  function getResource(name) {
    return parseInt(localStorage.getItem(`rpg_resource_${name}`) || '0', 10);
  }
  function addResource(name, amount) {
    const newAmount = getResource(name) + amount;
    localStorage.setItem(`rpg_resource_${name}`, newAmount);
    return newAmount;
  }
  
  const savedPlots = JSON.parse(localStorage.getItem('rpg_claimed_plots') || '[]');
  const claimedPlotIds = new Set(savedPlots);
  
  const savedInventory = JSON.parse(localStorage.getItem('rpg_player_inventory') || '[]');
  const playerInventory = new Set(savedInventory);
  
  const savedBuildings = JSON.parse(
    localStorage.getItem('rpg_buildings') || '{}'
  );
  
  const plotBuildings = savedBuildings;  
  
  let questState = {};
  
  try {
      questState = JSON.parse(localStorage.getItem("rpg_quest_state")) || {};
  } catch {
      questState = {};
      localStorage.removeItem("rpg_quest_state");
  }

  let selectedPlotId = null;

  // Gold Spawning & Gathering System
  let activeGoldNodes = [];
  const MAX_GOLD_NODES = 30;
  const MAX_DESPAWN_DISTANCE_FEET = 800;
   
  const NPC_DEFS = {
      timberPete: {
          id: "timberPete",
          name: "Timber Pete",
          img: "pete.png",
          talkRadius: INTERACTION_RADIUS_FEET,
          spawnRadius: 1,
          offsetX: 0.25,
          offsetY: 0.25,
          tradeItem: "axe",
          tradeType: "gold",
          price: 20,
		  
		  tradeText: "A good axe is worth its weight in gold. Need one?",
  
          appearsOnQuest: "bramble_intro_quest",
  
          disabledKey: "rpg_npc_disabled_pete"
      },
  
      minerGus: {
          id: "minerGus",
          name: "Miner Gus",
          img: "gus.png",
          talkRadius: INTERACTION_RADIUS_FEET,
          spawnRadius: 1,
          offsetX: 0.75,
          offsetY: 0.25,
          tradeItem: "mining pick",
          tradeType: "Wood",
          price: 20,
		  
		  tradeText: "I'm running short on good handles. Bring me some wood and I'll make you a mining pick.",
  
          appearsOnQuest: "bramble_second_quest",
  
          disabledKey: "rpg_npc_disabled_gus"
      }
  };
  
  const QUEST_NPC_DEFS = {
      rangerBramble: {
          id: "rangerBramble",
          name: "Ranger Bramblefoot",
          img: "bramblefoot.png",
          talkRadius: INTERACTION_RADIUS_FEET,
          spawnRadius: 1,
          offsetX: 0.25,
          offsetY: 0.80,
          disabledKey: "rpg_npc_disabled_bramble",
          quests: [
              {
                  questId: "bramble_intro_quest",
                  title: "Buy an Axe",
                  objectives: [
                      { text: "Gather gold", count: () => playerGold, max: NPC_DEFS.timberPete.price, doneWhen: () => playerInventory.has("axe") },
                      { text: "Buy an axe from Timber Pete", flag: () => playerInventory.has("axe") }
                  ],
                  requiredItems: ["axe"],
                  rewardGold: 20,
                  rewardItems: [],
                  disappearOnComplete: false,
                  dialog: {
                      offer: "To begin your journey, you’ll need to earn some gold. Walk around and gather at least 20 gold, then visit Timber Pete to buy yourself an axe. Will you take on this task?",
                      inProgress: "You're making progress. Gather enough gold and buy an axe from Timber Pete.",
                      readyToTurnIn: "Excellent work! That axe will serve you well.",
                      completed: "Here's 20 gold for your effort. You're ready for the next step."
                  }
              },
              {
                  questId: "bramble_second_quest",
                  title: "Get a Mining Pick",
                  objectives: [
                      { text: "Gather wood", count: () => getResource("Wood"), max: NPC_DEFS.minerGus.price, doneWhen: () => playerInventory.has("mining pick") },
                      { text: "Trade wood to Miner Gus for a mining pick", flag: () => playerInventory.has("mining pick") }
                  ],
                  requiredItems: ["mining pick"],
                  rewardGold: 30,
                  rewardItems: [],
                  disappearOnComplete: true,
                  dialog: {
                      offer: "Now that you have that shiny new axe, go cut down some trees and gather wood. Miner Gus will trade you a mining pick for 20 wood. Will you take on this task?",
                      inProgress: "Keep chopping! You’ll need enough wood to trade with Miner Gus.",
                      readyToTurnIn: "Well done! With that mining pick, you’re ready to gather stone and ore.",
                      completed: "Here's 30 gold for your effort. You've proven yourself again, adventurer."
                  }
              }
          ]
      },
      beginnerQuestGrubwick: {
          id: "beginnerQuestGrubwick",
          name: "Grubwick",
          img: "grubwick.png",
          talkRadius: INTERACTION_RADIUS_FEET,
          spawnRadius: 1,
          offsetX: 0.25,
          offsetY: 0.80,
          disabledKey: "rpg_npc_disabled_grubwick",
          appearsAfterQuest: "bramble_second_quest",
          quests: [
              {
                  questId: "grubwick_crafting_quest",
                  title: "Build a Workbench",
                  objectives: [
                      { text: "Buy a plot of land", flag: () => claimedPlotIds.size > 0, hint: () => `Costs ${PLOT_PRICE} gold. Tap a square on the map.` },
                      { text: "Build a workbench", flag: () => Object.values(plotBuildings).includes("workbench"), hint: () => `Needs ${formatCosts(BUILDING_DEFS.workbench.costs)}` },
                      { text: "Craft a wooden sword", flag: () => playerInventory.has("wooden sword"), hint: () => `Needs ${formatCosts(GEAR_DEFS.woodenSword.costs)}, crafted at your workbench` }
                  ],
                  requiredItems: ["wooden sword"],
                  rewardGold: 50,
                  rewardItems: [],
                  disappearOnComplete: false,
                  dialog: {
                      offer: "Ah! There you are, adventurer! I have another challenge for you. First, buy yourself a plot of land and build a workbench. Pick somewhere you visit often—you'll be using that workbench plenty! Once you've got it built, gather what you need and craft yourself a wooden sword. Think you can manage that?",
                      inProgress: "Still working on that workbench and wooden sword? Make sure to place that workbench somewhere handy—it's going to be your main hub for crafting.",
                      readyToTurnIn: "Ha! Now that's a proper adventurer's weapon! A wooden sword isn't much to look at, but every great warrior has to start somewhere.",
                      completed: "Excellent work! You've got yourself a place to craft and a sword to match. Here's 50 gold for your trouble. Keep that sword close—you never know what might be lurking out there!"
                  }
              }
          ]
      }
  };

  // NPC Merchant State
  let npcNodes = {}; // { npcId: { lat, lng, marker } }

  // Gold pickup sound effect
  const coinAudio = new Audio('coin.mp3');
  
  // Tree chop sound effect
  const chopSound = new Audio('axe_chop.mp3');

  // Resource Item System
  let activeItemNodes = [];
  let currentGridCenterKey = null;
  
  const ITEM_DEFS = {
    tree: {
      id: 'tree',
      name: 'Tree',
      resourceName: 'Wood',
  
      mainImage: 'tree.png',
      collectedImage: 'cut_tree.png',
      zoomImage: 'wood.png',
  
      requiredTool: 'axe',
  
      percentage: 25, // 25% of ALL tiles get a tree
  
      normalWidth: 96,
      normalHeight: 96,
      zoomWidth: 48,
      zoomHeight: 48,
      zoomThreshold: 17.75,
  
      respawnMs: 5 * 60 * 1000,
  
      yieldWeights: [1, 1, 1, 1, 2, 2, 2, 3, 3, 4, 5]
    },
    
    stone: {
      id: 'stone',
      name: 'Stone',
      resourceName: 'Stone',
    
      mainImage: 'stone.png',
      collectedImage: '',
      zoomImage: 'stone.png',
    
      requiredTool: 'mining pick',
    
      percentage: 19, // 19% of ALL tiles get stone
    
      normalWidth: 48,
      normalHeight: 48,
      zoomWidth: 48,
      zoomHeight: 48,
      zoomThreshold: 17.75,
    
      respawnMs: 5 * 60 * 1000,
    
      yieldWeights: [1, 1, 1, 2, 2, 2, 3]
    },
	
    copper: {
      id: 'copper',
      name: 'Copper',
      resourceName: 'Copper Ore',
    
      mainImage: 'copper_node.png',
      collectedImage: '',
      zoomImage: 'copper_node.png',
    
      requiredTool: 'mining pick',
    
      percentage: 8, // 8% of ALL tiles get copper
    
      normalWidth: 48,
      normalHeight: 48,
      zoomWidth: 48,
      zoomHeight: 48,
      zoomThreshold: 17.75,
    
      respawnMs: 5 * 60 * 1000,
    
      yieldWeights: [1, 1, 1, 2, 2, 2, 3]
    },
	
    tin: {
      id: 'tin',
      name: 'Tin',
      resourceName: 'Tin Ore',
    
      mainImage: 'tin_node.png',
      collectedImage: '',
      zoomImage: 'tin_node.png',
    
      requiredTool: 'mining pick',
    
      percentage: 7, // 7% of ALL tiles get tin
    
      normalWidth: 48,
      normalHeight: 48,
      zoomWidth: 48,
      zoomHeight: 48,
      zoomThreshold: 17.75,
    
      respawnMs: 5 * 60 * 1000,
    
      yieldWeights: [1, 1, 1, 2, 2, 2, 3]
    },

    iron: {
      id: 'iron',
      name: 'Iron',
      resourceName: 'Iron Ore',
    
      mainImage: 'iron_node.png',
      collectedImage: '',
      zoomImage: 'iron_node.png',
    
      requiredTool: 'mining pick',
    
      percentage: 5, // 5% of ALL tiles get iron
    
      normalWidth: 48,
      normalHeight: 48,
      zoomWidth: 48,
      zoomHeight: 48,
      zoomThreshold: 17.75,
    
      respawnMs: 5 * 60 * 1000,
    
      yieldWeights: [1, 1, 1, 2, 2, 2, 3]
    }	
  };
  
  const BUILDING_DEFS = {
    workbench: {
      id: 'workbench',
      name: 'Workbench',
      image: 'workbench.png',
      width: 52,
      height: 52,
      costs: { Wood: 10, Stone: 5 }
    },
    forge: {
      id: 'forge',
      name: 'Forge',
      image: 'forge.png',
      width: 96,
      height: 96,
      costs: { Stone: 15, 'Iron Ore': 5 }
    }
  };
  
  const BASE_COMBAT_SKILL = 10;
  const BASE_ENDURANCE = 20;
  
  const GEAR_DEFS = {
    woodenSword: {
      id: 'wooden sword',
      name: 'Wooden Sword',
      icon: '🗡️',
      statType: 'combatSkill',
      modifier: 1,
      craftedAt: 'workbench',
      costs: { Wood: 20 }
    },
  
    bronzeSword: {
      id: 'bronze sword',
      name: 'Bronze Sword',
      icon: '🗡️',
      statType: 'combatSkill',
      modifier: 2,
      craftedAt: 'workbench',
      costs: { 'Bronze Ingot': 4 }
    },
  
    ironSword: {
      id: 'iron sword',
      name: 'Iron Sword',
      icon: '🗡️',
      statType: 'combatSkill',
      modifier: 3,
      craftedAt: 'workbench',
      costs: { 'Iron Ingot': 6 }
    },
  
    woodenShield: {
      id: 'wooden shield',
      name: 'Wooden Shield',
      icon: '🛡️',
      statType: 'endurance',
      modifier: 1,
      craftedAt: 'workbench',
      costs: { Wood: 20 }
    },
  
    bronzeShield: {
      id: 'bronze shield',
      name: 'Bronze Shield',
      icon: '🛡️',
      statType: 'endurance',
      modifier: 2,
      craftedAt: 'workbench',
      costs: { 'Bronze Ingot': 4 }
    },
  
    ironShield: {
      id: 'iron shield',
      name: 'Iron Shield',
      icon: '🛡️',
      statType: 'endurance',
      modifier: 3,
      craftedAt: 'workbench',
      costs: { 'Iron Ingot': 6 }
    }
  };
  
  const SMELTING_RECIPES = {
    copperIngot: {
      id: 'Copper Ingot',
      name: 'Copper Ingot',
      icon: '🟧',
      type: 'resource',
      craftedAt: 'forge',
      costs: { 'Copper Ore': 2 },
      yieldAmount: 1
    },
    tinIngot: {
      id: 'Tin Ingot',
      name: 'Tin Ingot',
      icon: '⬜',
      type: 'resource',
      craftedAt: 'forge',
      costs: { 'Tin Ore': 2 },
      yieldAmount: 1
    },
    bronzeIngot: {
      id: 'Bronze Ingot',
      name: 'Bronze Ingot',
      icon: '🟫',
      type: 'resource',
      craftedAt: 'forge',
      costs: { 'Copper Ingot': 2, 'Tin Ingot': 2 },
      yieldAmount: 1
    },
    ironIngot: {
      id: 'Iron Ingot',
      name: 'Iron Ingot',
      icon: '⬛',
      type: 'resource',
      craftedAt: 'forge',
      costs: { 'Iron Ore': 2 },
      yieldAmount: 1
    }
  };

  function getRecipesForBuilding(buildingId) {
    return [
      ...Object.values(GEAR_DEFS).filter(g => g.craftedAt === buildingId),
      ...Object.values(SMELTING_RECIPES).filter(r => r.craftedAt === buildingId)
    ];
  }
  
  function getBestGearModifier(statType) {
    let best = 0;
    for (const key in GEAR_DEFS) {
      const gear = GEAR_DEFS[key];
      if (gear.statType === statType && playerInventory.has(gear.id)) {
        if (gear.modifier > best) best = gear.modifier;
      }
    }
    return best;
  }
  
  function getEffectiveCombatSkill() {
    return BASE_COMBAT_SKILL + getBestGearModifier('combatSkill');
  }
  
  function getEffectiveEndurance() {
    return BASE_ENDURANCE + getBestGearModifier('endurance');
  }

  let wakeLock = null;
  async function requestWakeLock() {
    if ('wakeLock' in navigator) {
      try { wakeLock = await navigator.wakeLock.request('screen'); } catch (err) {}
    }
  }

  document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
      await requestWakeLock();
    }
  });

  const map = new maplibregl.Map({
    container: 'map',
    style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
    center: [0, 0],
    zoom: 2,
	maxZoom: 17.95
  });

  const geolocate = new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    trackUserLocation: true,
    showUserLocation: false,
    showAccuracyCircle: true
  });

  map.addControl(geolocate);

  // Player Marker
  const playerContainer = document.createElement('div');
  playerContainer.className = 'player-marker-container';

  const playerImg = document.createElement('img');
  playerImg.className = 'player-marker-icon';
  playerImg.src = 'player.png';
  playerContainer.appendChild(playerImg);

  const playerMarker = new maplibregl.Marker({
    element: playerContainer,
    anchor: 'center'
  });

  // Global degree steps
  // US-only grid. Every tile is a true square of GRID_CELL_M meters, laid out in a
  // Lambert Conformal Conic projection (the standard projection for maps of the lower 48).
  // This projection keeps shapes square and keeps size within about 1% across the whole
  // continental US (roughly 162-165 ft per tile). The tradeoff is that the grid rotates a
  // little relative to north as you move east or west of GRID_CENTRAL_LNG.
  const GRID_CELL_M = 50;
  const EARTH_R = 6371000;                 // matches getDistanceFeet()
  const GRID_CENTRAL_LNG = -83;            // grid is perfectly aligned with north along this meridian (eastern KY)
  const GRID_ORIGIN_LAT = 39;
  const GRID_PARALLEL_1 = 29.75;
  const GRID_PARALLEL_2 = 44.5;

  const LNG_GRID_SIZE_STORAGE_KEY = 'rpg_lng_grid_size_deg'; // oldest per-player scale (migration only)
  const GRID_VERSION_KEY = 'rpg_grid_version';

  const LCC_D = Math.PI / 180;
  const LCC_P1 = GRID_PARALLEL_1 * LCC_D;
  const LCC_P2 = GRID_PARALLEL_2 * LCC_D;
  const LCC_N = Math.log(Math.cos(LCC_P1) / Math.cos(LCC_P2)) /
                Math.log(Math.tan(Math.PI / 4 + LCC_P2 / 2) / Math.tan(Math.PI / 4 + LCC_P1 / 2));
  const LCC_F = Math.cos(LCC_P1) * Math.pow(Math.tan(Math.PI / 4 + LCC_P1 / 2), LCC_N) / LCC_N;
  const LCC_LNG0 = GRID_CENTRAL_LNG * LCC_D;

  function lccRho(lat) {
    return EARTH_R * LCC_F / Math.pow(Math.tan(Math.PI / 4 + (lat * LCC_D) / 2), LCC_N);
  }

  const LCC_RHO0 = lccRho(GRID_ORIGIN_LAT);

  function projectLatLng(lat, lng, lng0Rad = LCC_LNG0) {
    const theta = LCC_N * (lng * LCC_D - lng0Rad);
    const rho = lccRho(lat);
    return { x: rho * Math.sin(theta), y: LCC_RHO0 - rho * Math.cos(theta) };
  }

  function unprojectXY(x, y, lng0Rad = LCC_LNG0) {
    const dy = LCC_RHO0 - y;
    const rho = Math.sqrt(x * x + dy * dy);
    const theta = Math.atan2(x, dy);
    const lat = (2 * Math.atan(Math.pow(EARTH_R * LCC_F / rho, 1 / LCC_N)) - Math.PI / 2) / LCC_D;
    const lng = (lng0Rad + theta / LCC_N) / LCC_D;
    return { lat, lng };
  }

  function latLngToGrid(lat, lng) {
    const p = projectLatLng(lat, lng);
    return {
      gridX: Math.floor(p.x / GRID_CELL_M),
      gridY: Math.floor(p.y / GRID_CELL_M)
    };
  }

  // gx/gy may include a fraction (e.g. cell + 0.5 = the cell's center).
  function gridToLatLng(gx, gy) {
    return unprojectXY(gx * GRID_CELL_M, gy * GRID_CELL_M);
  }

  // Roughly the lower 48 (the grid still works outside, but tiles are tilted/resized).
  function isInSupportedArea(lat, lng) {
    return lat >= 24.3 && lat <= 49.6 && lng >= -125.2 && lng <= -66.5;
  }

  // Converts saves made with an older grid to the current one (runs once).
  //   no flag + old per-player scale key -> original grid (0.00045 deg x saved lng step)
  //   flag '2'                            -> short-lived Mercator grid (0.00059 deg)
  //   flag '3'                            -> US grid that was aligned along 96 W
  function migrateGridIfNeeded() {
    const version = localStorage.getItem(GRID_VERSION_KEY);
    if (version === '4') return;

    let centerOf = null; // (oldGridX, oldGridY) -> { lat, lng } of that old cell's center

    if (version === '3') {
      const OLD_LNG0 = -96 * LCC_D;
      centerOf = (gx, gy) => unprojectXY(
        (gx + 0.5) * GRID_CELL_M,
        (gy + 0.5) * GRID_CELL_M,
        OLD_LNG0
      );
    } else if (version === '2') {
      const CELL = 0.00059;
      centerOf = (gx, gy) => ({
        lat: (2 * Math.atan(Math.exp((gy + 0.5) * CELL * LCC_D)) - Math.PI / 2) / LCC_D,
        lng: (gx + 0.5) * CELL
      });
    } else {
      const oldLngDeg = Number(localStorage.getItem(LNG_GRID_SIZE_STORAGE_KEY));
      if (oldLngDeg > 0 && isFinite(oldLngDeg)) {
        centerOf = (gx, gy) => ({ lat: (gy + 0.5) * 0.00045, lng: (gx + 0.5) * oldLngDeg });
      }
    }

    if (centerOf) {
      const convert = (plotId) => {
        const parts = plotId.split('_');
        if (parts.length !== 3) return null;
        const oy = Number(parts[1]);
        const ox = Number(parts[2]);
        if (!isFinite(ox) || !isFinite(oy)) return null;

        const c = centerOf(ox, oy);
        const g = latLngToGrid(c.lat, c.lng);
        return `plot_${g.gridY}_${g.gridX}`;
      };

      const oldPlots = [...claimedPlotIds];
      const oldBuildings = Object.assign({}, plotBuildings);

      claimedPlotIds.clear();
      for (const k of Object.keys(plotBuildings)) delete plotBuildings[k];

      for (const id of oldPlots) {
        const n = convert(id);
        if (n) claimedPlotIds.add(n);
      }
      for (const [id, b] of Object.entries(oldBuildings)) {
        const n = convert(id);
        if (n) plotBuildings[n] = b;
      }

      localStorage.setItem('rpg_claimed_plots', JSON.stringify([...claimedPlotIds]));
      localStorage.setItem('rpg_buildings', JSON.stringify(plotBuildings));

      // Resource cooldowns were tied to the old tiles, so let everything respawn.
      collectedItems = {};
      saveCollectedItems();
    }

    localStorage.removeItem(LNG_GRID_SIZE_STORAGE_KEY);
    localStorage.setItem(GRID_VERSION_KEY, '4');
  }

  function getDistanceFeet(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const distanceMeters = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return distanceMeters * 3.28084;
  }
  
  // Changes whenever gold, tools or resources change, so cards know when to redraw.
  function getStateSignature() {
      const names = [
          ...Object.values(ITEM_DEFS).map(d => d.resourceName),
          ...Object.values(SMELTING_RECIPES).map(r => r.id)
      ];

      return [
          playerGold,
          [...playerInventory].join(','),
          names.map(n => getResource(n)).join(',')
      ].join('|');
  }

  function startLiveDistanceUpdates(targetType, targetNode, renderFn) {
      if (distanceInterval) clearInterval(distanceInterval);
  
      activeTarget = { type: targetType, node: targetNode };
  
      let lastKey = null;
      let lastFirstNode = null;

      function update() {
          if (!userLat || !userLng) return;

          const distRaw = getDistanceFeet(
              userLat,
              userLng,
              targetNode.lat,
              targetNode.lng
          );

          const inRange = distRaw <= INTERACTION_RADIUS_FEET;
          const box = document.getElementById('plot-info');

          // While in range the card shows buttons, so only rebuild it when something
          // that affects it changes (or something else overwrote the card).
          const key = inRange
              ? `in|${getStateSignature()}`
              : `out|${distRaw.toFixed(0)}`;

          if (key === lastKey && box && box.firstChild === lastFirstNode) return;

          lastKey = key;
          renderFn(distRaw.toFixed(0));
          lastFirstNode = box ? box.firstChild : null;
      }
  
      update();
      distanceInterval = setInterval(update, 1000);
  }
  
  function stopLiveDistanceUpdates() {
      if (distanceInterval) clearInterval(distanceInterval);
      distanceInterval = null;
      activeTarget = null;
  }

  function clearItems() {
    activeItemNodes.forEach(node => node.marker.remove());
    activeItemNodes = [];
  }
  
  function removeItemsFromClaimedPlots() {
    for (let i = activeItemNodes.length - 1; i >= 0; i--) {
      const node = activeItemNodes[i];
  
      const plotId = `plot_${node.tileKey}`;
  
      if (claimedPlotIds.has(plotId)) {
        node.marker.remove();
        activeItemNodes.splice(i, 1);
      }
    }
  }

  function getTileRandom(gridX, gridY) {
    let hash = Math.sin(gridX * 12.9898 + gridY * 78.233) * 43758.5453123;
    return hash - Math.floor(hash);
  }
  
  function getItemPlacementScore(gridX, gridY, itemId) {
      let itemHash = 0;
  
      for (let i = 0; i < itemId.length; i++) {
          itemHash = ((itemHash << 5) - itemHash) + itemId.charCodeAt(i);
          itemHash |= 0;
      }
  
      const hash =
          Math.sin(
              gridX * 12.9898 +
              gridY * 78.233 +
              itemHash * 37.719
          ) * 43758.5453123;
  
      return hash - Math.floor(hash);
  }
  
  function getItemStorageKey(itemDef, tileKey) {
    return `${itemDef.id}_${tileKey}`;
  }

  const COLLECTED_STORAGE_KEY = 'rpg_collected_items';
  let collectedItems = {};

  function saveCollectedItems() {
    try {
      localStorage.setItem(COLLECTED_STORAGE_KEY, JSON.stringify(collectedItems));
    } catch (err) {}
  }

  // Drops entries whose respawn time has passed. Returns true if anything was removed.
  function pruneCollectedItems() {
    const now = Date.now();
    let changed = false;
    for (const key of Object.keys(collectedItems)) {
      const def = ITEM_DEFS[key.split('_')[0]];
      const t = collectedItems[key];
      if (!def || !(t > 0) || now - t >= def.respawnMs) {
        delete collectedItems[key];
        changed = true;
      }
    }
    return changed;
  }

  function loadCollectedItems() {
    try {
      collectedItems = JSON.parse(localStorage.getItem(COLLECTED_STORAGE_KEY) || '{}') || {};
    } catch (err) {
      collectedItems = {};
    }

    // One-time migration of the old one-key-per-tile format.
    const PREFIX = 'rpg_item_';
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith(PREFIX)) continue;
      const t = parseInt(localStorage.getItem(k) || '0', 10);
      const newKey = k.slice(PREFIX.length);
      if (t > 0 && !(collectedItems[newKey] >= t)) collectedItems[newKey] = t;
      localStorage.removeItem(k);
    }

    pruneCollectedItems();
    saveCollectedItems();
  }

  function isItemCollected(def, tileKey) {
    const t = collectedItems[getItemStorageKey(def, tileKey)] || 0;
    return t > 0 && Date.now() - t < def.respawnMs;
  }

  loadCollectedItems();
  
  function spawnItems() {
      if (!userLat || !userLng) return;
      if (collectionInterval) return;
	  const priorTarget = activeTarget;
  
      const { gridX: centerGridX, gridY: centerGridY } =
          latLngToGrid(userLat, userLng);
  
      const newCenterKey = `${centerGridY}_${centerGridX}`;
  
      if (currentGridCenterKey === newCenterKey) {
          updateItemVisibility();
          return;
      }
  
      currentGridCenterKey = newCenterKey;
  
      clearItems();
  
      const gridRadius = 4;
  
      // Build the complete 9x9 grid.
      const candidateCells = [];
  
      for (let x = -gridRadius; x <= gridRadius; x++) {
          for (let y = -gridRadius; y <= gridRadius; y++) {
              candidateCells.push({
                  gridX: centerGridX + x,
                  gridY: centerGridY + y
              });
          }
      }
  
      // Each tile independently determines whether it contains a resource.
      for (const cell of candidateCells) {
  
          const tileKey = `${cell.gridY}_${cell.gridX}`;
          
          // Owned plots are reserved for the player's buildings.
          // No trees, stones, or other natural resources can spawn here.
          const plotId = `plot_${tileKey}`;
          
          if (claimedPlotIds.has(plotId)) continue;
          
          // Determine which resource, if any, belongs on this tile.
          // One roll per tile, so each percentage is the true share of all tiles.
          const tileRoll = getTileRandom(cell.gridX, cell.gridY);
          let selectedDef = null;
          let cumulative = 0;

          for (const itemKey in ITEM_DEFS) {
              const d = ITEM_DEFS[itemKey];
              cumulative += d.percentage / 100;

              if (tileRoll < cumulative) {
                  selectedDef = d;
                  break;
              }
          }
  
          // No resource on this tile.
          if (!selectedDef) continue;
  
          const def = selectedDef;
  
          const { lat: itemLat, lng: itemLng } =
              gridToLatLng(cell.gridX + 0.50, cell.gridY + 0.50);
  
          // Check whether this exact resource on this exact tile
          // is currently collected.
          const isCollected = isItemCollected(def, tileKey);
  
          const container = document.createElement('div');
          container.className = 'item-marker-container';
  
          const img = document.createElement('img');
          img.className = 'item-marker-icon';
  
          if (isCollected) {
              if (def.collectedImage) {
                  img.src = def.collectedImage;
              } else {
                  img.style.display = 'none';
              }
          } else {
              img.src = def.mainImage;
          }
  
          container.appendChild(img);
  
          const marker = new maplibregl.Marker({
              element: container,
              anchor: 'center'
          })
              .setLngLat([itemLng, itemLat])
              .addTo(map);
  
          const node = {
              id: `${def.id}_${tileKey}`,
              itemType: def.id,
              def,
              tileKey,
              lat: itemLat,
              lng: itemLng,
              marker,
              element: container,
              img,
              isCollected
          };
  
          if (isCollected) {
              container.style.pointerEvents = 'none';
          }
  
          activeItemNodes.push(node);
  
          container.addEventListener('click', e => {
              e.stopPropagation();
  
              if (node.isCollected) return;
  
              closeBackpackIfOpen(false);
              clearSelectedPlot();
              ensureUIPanelVisible();
  
              renderItemCard(node);
          });
      }
	  
      // Restore buildings on owned plots.
      for (const plotId of claimedPlotIds) {
        const buildingId = plotBuildings[plotId];
      
        if (!buildingId) continue;
      
        const def = BUILDING_DEFS[buildingId];
      
        if (!def) continue;
      
        spawnBuildingOnPlot(plotId, def);
      }
  
      updateItemVisibility();

      // The grid was rebuilt, so re-attach any open item/building card to the fresh node.
      if (priorTarget && priorTarget === activeTarget) {
          let rebound = false;

          if (priorTarget.type === 'item') {
              const n = activeItemNodes.find(x => x.id === priorTarget.node.id);
              if (n && !n.isCollected) {
                  renderItemCard(n);
                  rebound = true;
              }
          } else if (priorTarget.type === 'building') {
              const b = buildingNodes[priorTarget.node.plotId];
              if (b) {
                  renderBuildingCard(b);
                  rebound = true;
              }
          }

          if (!rebound) {
              stopLiveDistanceUpdates();
              renderSelectedPlotCard();
          }
      }
  }

  function renderItemCard(node) {
    const container = document.getElementById('plot-info');
  
    const def = node.def;
  
    startLiveDistanceUpdates("item", node, dist => {
      const distNum = Number(dist);
      const inRange = distNum <= INTERACTION_RADIUS_FEET;
      const hasTool = playerInventory.has(def.requiredTool);
  
      if (!hasTool) {
        container.innerHTML = `
          <b>${def.name}:</b><br/>
          <b>Distance:</b> ${dist} ft away<br/>
          <small style="color:#f7f7f7;">
            ⚠️ You need ${def.requiredTool} to collect this resource!
          </small>
        `;
        return;
      }
  
      if (!inRange) {
        container.innerHTML = `
          <b>${def.name}:</b><br/>
          <b>Distance:</b> ${dist} ft away<br/>
          <small style="color:#f7f7f7;">
            Walk within ${INTERACTION_RADIUS_FEET} ft to collect!
          </small>
        `;
        return;
      }
  
      container.innerHTML = `
        <b>${def.name}:</b><br/>
        <b>✅ In range</b><br/>
        <button id="collect-item-btn"
                class="btn buy-btn"
                style="margin-top:6px;">
          Collect ${def.name}
        </button>
      `;
  
      document
        .getElementById('collect-item-btn')
        .addEventListener('click', (e) => {
            startItemCollectionCountdown(node);
        });
    });
  }

  function collectItem(node) {
      const def = node.def;
  
      if (!playerInventory.has(def.requiredTool)) return;
      if (node.isCollected) return;
  
      // Immediately lock this node.
      node.isCollected = true;
  
      // Persist the collected state immediately.
      collectedItems[getItemStorageKey(def, node.tileKey)] = Date.now();
      pruneCollectedItems();
      saveCollectedItems();
  
      // Give the player the resource.
      const yieldWeights = def.yieldWeights;
  
      const yieldAmount =
          yieldWeights[Math.floor(Math.random() * yieldWeights.length)];
  
      addResource(def.resourceName, yieldAmount);
  
      // Force the collected visual state.
      if (def.collectedImage) {
          node.img.src = def.collectedImage;
      } else {
          node.img.style.display = 'none';
      }
      node.element.style.pointerEvents = 'none';
  
      updateInventoryDisplay();
  
      // Trigger the item popup above the player's head
      showItemPopup(yieldAmount, def.resourceName);
      
      showToast(`Collected +${yieldAmount} ${def.resourceName}!`, 4500);
  
      stopLiveDistanceUpdates();
  
      renderCollectedItemCard(node);
  }

  function renderCollectedItemCard(node) {
    const container = document.getElementById('plot-info');
  
    container.innerHTML = `
      <b>${node.def.name}</b><br/>
      <span style="color:#ffffff;">
        This resource has been collected.
      </span><br/>
      <small style="color:#f1f5f9;">
        Respawns in ${node.def.respawnMs / 60000} minutes.
      </small>
    `;
  }
  
  function updateItemVisibility() {
    const zoom = map.getZoom();
  
    activeItemNodes.forEach(node => {
      const def = node.def;
  
      const isZoomedOut = zoom < def.zoomThreshold;
  
      node.element.style.width =
        `${isZoomedOut ? def.zoomWidth : def.normalWidth}px`;
  
      node.element.style.height =
        `${isZoomedOut ? def.zoomHeight : def.normalHeight}px`;
  
      if (node.isCollected) {
        // Collected resources can optionally disappear while zoomed out.
        node.element.style.display = isZoomedOut ? 'none' : 'flex';
        return;
      }
  
      node.element.style.display = 'flex';
  
      const wantedSrc = isZoomedOut ? def.zoomImage : def.mainImage;
      if (node.img.getAttribute('src') !== wantedSrc) node.img.src = wantedSrc;
    });
  }
  
  function checkItemRespawns() {
    let changed = false;

    for (const node of activeItemNodes) {
      if (!node.isCollected) continue;
      if (isItemCollected(node.def, node.tileKey)) continue;

      node.isCollected = false;
      node.element.style.pointerEvents = '';
      node.img.style.display = '';
      changed = true;
    }

    if (pruneCollectedItems()) saveCollectedItems();
    if (changed) updateItemVisibility();
  }

  let collectionInterval = null;
  let collectionChopTimeouts = [];
  let collectionCancelCheck = null;
  let collectionProgressInterval = null;

  function cancelAnyActiveCollection() {
      collectionChopTimeouts.forEach(id => clearTimeout(id));
      collectionChopTimeouts = [];

      if (collectionInterval) {
          clearTimeout(collectionInterval);
          collectionInterval = null;
      }
  
      if (collectionCancelCheck) {
          clearInterval(collectionCancelCheck);
          collectionCancelCheck = null;
      }
  
      if (collectionProgressInterval) {
          clearInterval(collectionProgressInterval);
          collectionProgressInterval = null;
      }
  
      const progressBox = document.getElementById('collection-progress');
  
      if (progressBox) {
          progressBox.style.display = 'none';
      }
  }

  function startItemCollectionCountdown(node) {
      stopLiveDistanceUpdates();
      cancelAnyActiveCollection();
  
      const container = document.getElementById('plot-info');
      const progressBox = document.getElementById('collection-progress');
      const progressBar = document.getElementById('collection-progress-bar');
  
      progressBox.style.display = 'block';
      progressBar.style.width = '100%';
  
      container.innerHTML = `
        <b>Collecting ${node.def.name}...</b><br/>
        <small>Stay within range for 5 seconds!</small>
      `;
  
      const startTime = performance.now();
  
      const playChopSound = () => {
          const sfx = chopSound.cloneNode();
          sfx.currentTime = 0;
          sfx.play().catch(() => {});
      };
  
      // Exactly 5 chops: 0s, 1s, 2s, 3s, and 4s.
      for (let i = 0; i < 5; i++) {
          collectionChopTimeouts.push(setTimeout(() => {
              // Don't play if collection was cancelled.
              if (!collectionInterval) return;

              playChopSound();
          }, i * 1000));
      }
  
      // Progress bar animation.
      collectionProgressInterval = setInterval(() => {
          const elapsed = performance.now() - startTime;
          const progress = Math.min(elapsed / 5000, 1);
  
          progressBar.style.width = `${(1 - progress) * 100}%`;
  
          if (progress >= 1) {
              clearInterval(collectionProgressInterval);
              collectionProgressInterval = null;
          }
      }, 50);
  
      // Finish exactly 5 seconds after starting.
      collectionInterval = setTimeout(() => {
          collectionInterval = null;
  
          if (collectionProgressInterval) {
              clearInterval(collectionProgressInterval);
              collectionProgressInterval = null;
          }
  
          progressBar.style.width = '0%';
  
          finishItemCollection(node);
      }, 5000);
  
      collectionCancelCheck = setInterval(() => {
          if (!userLat || !userLng) return;
  
          const dist = getDistanceFeet(
              userLat,
              userLng,
              node.lat,
              node.lng
          );
  
          if (dist > INTERACTION_RADIUS_FEET) {
              cancelItemCollection();
          }
      }, 300);
  }
  
  function cancelItemCollection() {
    cancelAnyActiveCollection();

    document.getElementById('plot-info').innerHTML = `
      <b>❌ Collection Cancelled</b><br/>
      <small>You moved too far away!</small>
    `;
  }
  
  function finishItemCollection(node) {
      cancelAnyActiveCollection();
      stopLiveDistanceUpdates();
      collectItem(node);
  }
  
  function spawnNPC(def) {
  
      // NPC does not appear until their required quest is accepted.
      if (def.appearsOnQuest && !isQuestAccepted(def.appearsOnQuest)) {
          return;
      }
  
      if (def.appearsAfterQuest && !isQuestComplete(def.appearsAfterQuest)) return;

      const disabled = localStorage.getItem(def.disabledKey) === "true";
      if (disabled) return;
      if (!userLat || !userLng) return;
  
      if (npcNodes[def.id]?.marker) {
          npcNodes[def.id].marker.remove();
      }
      if (npcNodes[def.id]?.indicatorMarker) {
          npcNodes[def.id].indicatorMarker.remove();
      }
  
      const { gridX, gridY } = latLngToGrid(userLat, userLng);
      const radius = def.spawnRadius;
  
      let offsetX = 0, offsetY = 0;
      while (offsetX === 0 && offsetY === 0) {
          offsetX = Math.floor(Math.random() * (radius * 2 + 1)) - radius;
          offsetY = Math.floor(Math.random() * (radius * 2 + 1)) - radius;
      }
  
      const targetGridX = gridX + offsetX;
      const targetGridY = gridY + offsetY;
  
      const { lat: npcLat, lng: npcLng } =
          gridToLatLng(targetGridX + def.offsetX, targetGridY + def.offsetY);
  
      const container = document.createElement("div");
      container.className = "npc-marker-container";
  
      const img = document.createElement("img");
      img.className = "npc-marker-icon";
      img.src = def.img;
      container.appendChild(img);
  
      const marker = new maplibregl.Marker({ element: container, anchor: "center" })
          .setLngLat([npcLng, npcLat])
          .addTo(map);
  
      let indicatorEl = null;
      let indicatorMarker = null;
      if (def.quests) {
          indicatorEl = document.createElement("div");
          indicatorEl.className = "npc-quest-indicator";
  
          indicatorMarker = new maplibregl.Marker({
              element: indicatorEl,
              anchor: "bottom",
              offset: [0, -25]
          })
              .setLngLat([npcLng, npcLat])
              .addTo(map);
      }
  
      npcNodes[def.id] = { lat: npcLat, lng: npcLng, marker, indicatorEl, indicatorMarker };
  
      if (def.quests) {
          updateQuestIndicator(def);
      }
  
      container.addEventListener("click", (e) => {
          e.stopPropagation();
          cancelAnyActiveCollection();
          clearSelectedPlot();
          closeBackpackIfOpen(false);
          ensureUIPanelVisible();
          renderNPCCard(def);
      });
  }

  function moveNPC(def) {
      const node = npcNodes[def.id];
      if (!node || !userLat || !userLng) return;
  
      const dist = getDistanceFeet(userLat, userLng, node.lat, node.lng);
      if (dist <= def.talkRadius + 50) {
          return;
      }
  
      const { gridX, gridY } = latLngToGrid(userLat, userLng);
      const radius = def.spawnRadius;
  
      const { gridX: currentGridX, gridY: currentGridY } = latLngToGrid(node.lat, node.lng);
  
      const offsetX = Math.floor(Math.random() * 3) - 1;
      const offsetY = Math.floor(Math.random() * 3) - 1;
  
      let newGridX = Math.max(gridX - radius, Math.min(gridX + radius, currentGridX + offsetX));
      let newGridY = Math.max(gridY - radius, Math.min(gridY + radius, currentGridY + offsetY));
  
      const moved = gridToLatLng(newGridX + def.offsetX, newGridY + def.offsetY);
      node.lat = moved.lat;
      node.lng = moved.lng;
  
      node.marker.setLngLat([node.lng, node.lat]);
      if (node.indicatorMarker) {
          node.indicatorMarker.setLngLat([node.lng, node.lat]);
      }
  
      const infoElem = document.getElementById("plot-info");
      if (infoElem && infoElem.innerText.includes(def.name)) {
          renderNPCCard(def);
      }
  }
  
  function checkNPCProximity(def) {
      const node = npcNodes[def.id];
      if (!node || !userLat || !userLng) return;
  
      const { gridX, gridY } = latLngToGrid(userLat, userLng);
      const { gridX: npcGridX, gridY: npcGridY } = latLngToGrid(node.lat, node.lng);
  
      if (Math.abs(npcGridX - gridX) > 4 ||
          Math.abs(npcGridY - gridY) > 4) {
          spawnNPC(def);
      }
  }
  
  function initNPCMovement() {
      const FOUR_MINUTES_MS = 4 * 60 * 1000;
  
      setInterval(() => {
          for (const key in NPC_DEFS) {
              moveNPC(NPC_DEFS[key]);
          }
          for (const key in QUEST_NPC_DEFS) {
              moveNPC(QUEST_NPC_DEFS[key]);
          }
      }, FOUR_MINUTES_MS);
  }

  function renderNPCCard(def) {
      if (QUEST_NPC_DEFS[def.id]) {
          renderQuestNPC(QUEST_NPC_DEFS[def.id]);
          return;
      }  
  
      const node = npcNodes[def.id];
      if (!node || !userLat || !userLng) return;
  
      const container = document.getElementById("plot-info");
  
      startLiveDistanceUpdates("npc", node, (distRounded) => {
          const dist = Number(distRounded);
          const inRange = dist <= def.talkRadius;
  
          if (!inRange) {
              container.innerHTML = `
                  <b>${def.name}:</b><br/>
                  <b>Distance:</b> ${distRounded} ft away<br/>
                  <small style="color:#f7f7f7;">Walk within ${def.talkRadius} ft to trade.</small>
              `;
              return;
          }
  
          let canAfford = false;
          let requirementLabel = "";
          
          if (def.tradeType === "gold") {
              canAfford = playerGold >= def.price;
              requirementLabel = `${def.price} Gold`;
          }
          
          if (def.tradeType === "Wood") {
              canAfford = getResource('Wood') >= def.price;
              requirementLabel = `${def.price} Wood`;
          }
  
          container.innerHTML = `
              <b>${def.name}:</b><br/>
              <i>"${def.tradeText}"</i><br/>
              <b>Item:</b> ${def.tradeItem}<br/>
              <b>Cost:</b> ${requirementLabel}<br/>
              <button id="npc-buy-btn" class="btn buy-btn" ${canAfford ? "" : "disabled"}>
                  Trade for ${def.tradeItem}
              </button>
          `;
  
          if (canAfford) {
              document.getElementById("npc-buy-btn").addEventListener("click", () => {
                  buyNPCItem(def);
              });
          }
      });
  }

  function buyNPCItem(def) {
      if (playerInventory.has(def.tradeItem)) return;
  
      if (def.tradeType === "gold") {
          if (playerGold < def.price) return;
          playerGold -= def.price;
      }
  
      if (def.tradeType === "Wood") {
          if (getResource('Wood') < def.price) return;
          addResource('Wood', -def.price);
      }
  
      playerInventory.add(def.tradeItem);
  
      localStorage.setItem('rpg_player_gold', playerGold);
      localStorage.setItem("rpg_player_inventory", JSON.stringify([...playerInventory]));
  
      localStorage.setItem(def.disabledKey, "true");
  
      npcNodes[def.id]?.marker?.remove();
      npcNodes[def.id] = null;
      
      updateGoldDisplay();
      updateInventoryDisplay();
      updateAllQuestIndicators();
      
      showToast(`Acquired ${def.tradeItem}!`, 4500);
      
      // NPC has left, so clear their card from the UI.
      stopLiveDistanceUpdates();
      clearSelectedPlot();
      renderSelectedPlotCard();
  }
  
  function spawnAvailableNPCs() {
      // Merchant NPCs
      for (const key in NPC_DEFS) {
          const def = NPC_DEFS[key];
  
          if (!def.appearsOnQuest || isQuestAccepted(def.appearsOnQuest)) {
              spawnNPC(def);
          }
      }
  
      // Quest NPCs
      for (const key in QUEST_NPC_DEFS) {
          const def = QUEST_NPC_DEFS[key];
  
          if (
              !def.appearsAfterQuest ||
              isQuestComplete(def.appearsAfterQuest)
          ) {
              spawnNPC(def);
          }
      }
  }
  
  function formatCosts(costs) {
      return Object.entries(costs).map(([res, amt]) => `${amt} ${res}`).join(', ');
  }

  function getObjectiveStatus(obj) {
      if (obj.flag) {
          const done = !!obj.flag();
          return { done, cur: done ? 1 : 0, max: 1, showCount: false };
      }

      const raw = Number(obj.count()) || 0;
      const done = raw >= obj.max || !!(obj.doneWhen && obj.doneWhen());

      return {
          done,
          cur: done ? obj.max : Math.min(raw, obj.max),
          max: obj.max,
          showCount: true
      };
  }

  // Every quest the player can currently see, in order: complete, active or available.
  function getQuestEntries() {
      const entries = [];

      for (const key in QUEST_NPC_DEFS) {
          const npc = QUEST_NPC_DEFS[key];
          let reachedIncomplete = false;

          for (const quest of npc.quests) {
              if (isQuestComplete(quest.questId)) {
                  entries.push({ npc, quest, state: 'complete' });
                  continue;
              }

              // Only the first unfinished quest of an NPC is ever shown.
              if (reachedIncomplete) break;
              reachedIncomplete = true;

              if (isQuestAccepted(quest.questId)) {
                  entries.push({ npc, quest, state: 'active' });
              } else {
                  const unlocked = !npc.appearsAfterQuest || isQuestComplete(npc.appearsAfterQuest);
                  const gone = npc.disabledKey && localStorage.getItem(npc.disabledKey) === 'true';
                  if (unlocked && !gone) entries.push({ npc, quest, state: 'available' });
              }
          }
      }

      return entries;
  }

  function renderQuestObjectiveHTML(obj) {
      const st = getObjectiveStatus(obj);
      const hint = (!st.done && obj.hint) ? (typeof obj.hint === 'function' ? obj.hint() : obj.hint) : '';
      const pct = Math.round((st.cur / st.max) * 100);

      return `
        <li class="quest-obj${st.done ? ' done' : ''}">
          <div class="quest-obj-row">
            <span class="quest-obj-check">${st.done ? '✅' : '⬜'}</span>
            <span class="quest-obj-text">${obj.text}</span>
            ${st.showCount ? `<span class="quest-obj-count">${st.cur}/${st.max}</span>` : ''}
          </div>
          ${st.showCount && !st.done ? `<div class="quest-obj-bar"><div style="width:${pct}%"></div></div>` : ''}
          ${hint ? `<div class="quest-obj-hint">${hint}</div>` : ''}
        </li>`;
  }

  function updateQuestUI() {
      const entries = getQuestEntries();
      const active = entries.filter(e => e.state === 'active');
      const available = entries.filter(e => e.state === 'available');
      const complete = entries.filter(e => e.state === 'complete');

      const list = document.getElementById('quests-list');

      if (list) {
          let html = '';

          for (const e of active) {
              const ready = e.quest.requiredItems.every(item => playerInventory.has(item));

              html += `
                <div class="quest-entry">
                  <div class="quest-title">📜 ${e.quest.title || e.quest.questId}</div>
                  <div class="quest-giver">from ${e.npc.name}</div>
                  <ul class="quest-objectives">${(e.quest.objectives || []).map(renderQuestObjectiveHTML).join('')}</ul>
                  ${ready ? `<div class="quest-turnin">➡ Return to ${e.npc.name} to turn in this quest.</div>` : ''}
                </div>`;
          }

          for (const e of available) {
              html += `
                <div class="quest-entry">
                  <div class="quest-title">❗ New quest</div>
                  <div class="quest-giver">${e.npc.name} has a task for you. Look for the ? above their head on the map.</div>
                </div>`;
          }

          if (!active.length && !available.length) {
              html += `<div class="quests-empty">No active quests right now.</div>`;
          }

          if (complete.length) {
              html += `
                <div class="quest-section-title">Completed</div>
                <ul class="quest-complete-list">
                  ${complete.map(e => `<li>${e.quest.title || e.quest.questId}</li>`).join('')}
                </ul>`;
          }

          list.innerHTML = html;
      }

      const tracker = document.getElementById('quest-tracker');

      if (tracker) {
          let text = '';

          if (active.length) {
              const e = active[0];
              const ready = e.quest.requiredItems.every(item => playerInventory.has(item));

              if (ready) {
                  text = `📜 Return to ${e.npc.name}`;
              } else {
                  const next = (e.quest.objectives || []).find(o => !getObjectiveStatus(o).done);

                  if (next) {
                      const st = getObjectiveStatus(next);
                      text = `📜 ${next.text}${st.showCount ? ` ${st.cur}/${st.max}` : ''}`;
                  } else {
                      text = `📜 ${e.quest.title || e.quest.questId}`;
                  }
              }
          } else if (available.length) {
              text = `❗ New quest: find ${available[0].npc.name}`;
          }

          tracker.textContent = text;
          tracker.style.display = text ? 'block' : 'none';
      }
  }

  function isQuestAccepted(questId) {
      return questState[questId] === 'accepted' || questState[questId] === true;
  }
  
  function acceptQuest(questId) {
      questState[questId] = 'accepted';
      updateQuestUI();
      localStorage.setItem("rpg_quest_state", JSON.stringify(questState));
  }
  
  function isQuestComplete(questId) {
      return questState[questId] === true;
  }
  
  function completeQuest(questId) {
      questState[questId] = true;
      updateQuestUI();
      localStorage.setItem("rpg_quest_state", JSON.stringify(questState));
  }
  
  function spawnQuestNPCsUnlockedByQuest(questId) {
      for (const key in QUEST_NPC_DEFS) {
          const def = QUEST_NPC_DEFS[key];
  
          if (def.appearsAfterQuest === questId) {
              spawnNPC(def);
          }
      }
  }
  
  function getQuestIndicatorState(def) {
      if (!def.quests) return null;
  
      const nextQuest = def.quests.find(q => !isQuestComplete(q.questId));
      if (!nextQuest) return 'none';
  
      if (!isQuestAccepted(nextQuest.questId)) return 'available';
  
      const hasAllItems = nextQuest.requiredItems.every(item => playerInventory.has(item));
      return hasAllItems ? 'ready' : 'in-progress';
  }
  
  function updateQuestIndicator(def) {
      if (!def.quests) return;
  
      const node = npcNodes[def.id];
      if (!node || !node.indicatorEl) return;
  
      const state = getQuestIndicatorState(def);
      const el = node.indicatorEl;
  
      el.className = 'npc-quest-indicator';
      if (state === 'available') {
          el.classList.add('available');
          el.innerText = '?';
      } else if (state === 'in-progress') {
          el.classList.add('in-progress');
          el.innerText = '?';
      } else if (state === 'ready') {
          el.classList.add('ready');
          el.innerText = '!';
      }
      // 'none' leaves only the base class, which is display:none
  }
  
  function updateAllQuestIndicators() {
      for (const key in QUEST_NPC_DEFS) {
          updateQuestIndicator(QUEST_NPC_DEFS[key]);
      }
  }
  
  function renderQuestNPC(def) {
      const container = document.getElementById("plot-info");
      const node = npcNodes[def.id];
  
      if (!node) {
          container.innerHTML = `<b>${def.name}:</b><br/><small style="color:#94a3b8;">They are no longer around.</small>`;
          return;
      }
  
      stopLiveDistanceUpdates();
  
      startLiveDistanceUpdates("npc", node, (dist) => {
          const inRange = Number(dist) <= def.talkRadius;
  
          if (!inRange) {
              container.innerHTML = `
                  <b>${def.name}:</b><br/>
                  <b>Distance:</b> ${dist} ft away<br/>
                  <small style="color:#f7f7f7;">Walk within ${def.talkRadius} ft to talk.</small>
              `;
              return;
          }
  
          const nextQuest = def.quests.find(q => !isQuestComplete(q.questId));
  
          if (!nextQuest) {
              container.innerHTML = `
                  <b>${def.name}:</b><br/>
                  <i>You’ve completed all my tasks. Well done!</i>
              `;
              return;
          }
  
          const dialog = nextQuest.dialog;
          const accepted = isQuestAccepted(nextQuest.questId);
  
          if (!accepted) {
              container.innerHTML = `
                  <b>${def.name}:</b><br/>
                  <i>${dialog.offer}</i><br/>
                  <button id="quest-accept-btn" class="btn buy-btn" style="margin-top:6px;">Accept Quest</button>
              `;
  
               document.getElementById('quest-accept-btn').addEventListener('click', () => {
                   acceptQuest(nextQuest.questId);
               
                   // Spawn any NPC that becomes available from this quest.
                   for (const key in NPC_DEFS) {
                       const npcDef = NPC_DEFS[key];
               
                       if (npcDef.appearsOnQuest === nextQuest.questId) {
                           spawnNPC(npcDef);
                       }
                   }
               
                   updateQuestIndicator(def);
                   renderQuestNPC(def);
               });
              return;
          }
  
          const hasAllItems = nextQuest.requiredItems.every(item => playerInventory.has(item));
  
          if (!hasAllItems) {
              container.innerHTML = `
                  <b>${def.name}:</b><br/>
                  <i>${dialog.inProgress}</i>
              `;
              return;
          }
  
          container.innerHTML = `
              <b>${def.name}:</b><br/>
              <i>${dialog.readyToTurnIn}</i><br/>
              <button id="quest-turnin-btn" class="btn buy-btn" style="margin-top:6px;">Turn In Quest</button>
          `;
  
          document.getElementById('quest-turnin-btn').addEventListener('click', () => {
              playerGold += nextQuest.rewardGold;
              updateGoldDisplay();
              localStorage.setItem("rpg_player_gold", playerGold);
              
              // Popup for Gold Reward
              if (nextQuest.rewardGold > 0) {
                  showFloatingPopup(`+${nextQuest.rewardGold} Gold`, false);
              }
          
              // Popup(s) for Item Rewards
              for (const item of nextQuest.rewardItems) {
                  playerInventory.add(item);
                  showFloatingPopup(`+1 ${item}`, true);
              }
              
              localStorage.setItem("rpg_player_inventory", JSON.stringify([...playerInventory]));
              updateInventoryDisplay();
          
              completeQuest(nextQuest.questId);
              
              // Spawn any quest NPCs unlocked by completing this quest.
              spawnQuestNPCsUnlockedByQuest(nextQuest.questId);
              
              showToast(dialog.completed, 8000);
          
              if (nextQuest.disappearOnComplete && node.marker) {
                  node.marker.remove();
                  node.indicatorMarker?.remove();
				  
                  // Permanently remove this NPC until the game is reset.
                  if (def.disabledKey) {
                      localStorage.setItem(def.disabledKey, "true");
                  }				  
				  
                  npcNodes[def.id] = null;
              } else {
                  updateQuestIndicator(def);
              }
          
              renderQuestNPC(def);
          });
      });
  }
  
  let toastTimer = null;

  function showToast(message, ms = 4000) {
    let el = document.getElementById('game-toast');

    if (!el) {
      el = document.createElement('div');
      el.id = 'game-toast';
      el.className = 'game-toast'; // styled in styles.css
      document.body.appendChild(el);
    }

    el.textContent = message;
    el.style.opacity = '1';

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.opacity = '0'; }, ms);
  }

  function showFloatingPopup(textString, isItem = false) {
    if (!userLat || !userLng) return;
  
    const wrapper = document.createElement('div');
    wrapper.style.pointerEvents = 'none';
  
    const textElem = document.createElement('div');
    textElem.className = isItem 
      ? 'floating-popup-text item-popup' 
      : 'floating-popup-text';
    textElem.innerText = textString;
    wrapper.appendChild(textElem);
  
    const popupMarker = new maplibregl.Marker({
      element: wrapper,
      anchor: 'bottom',
      offset: [0, -40] // Nudges above the player icon
    })
      .setLngLat([userLng, userLat])
      .addTo(map);
  
    setTimeout(() => popupMarker.remove(), 1200);
  }
  
  // Wrapper for backward compatibility with existing gold calls
  function showGoldPopup(amount) {
    showFloatingPopup(`+${amount} Gold`, false);
  }
  
  // Dedicated helper for item popups
  function showItemPopup(amount, itemName) {
    showFloatingPopup(`+${amount} ${itemName}`, true);
  }
  
  function collectCoin(node) {
      if (node.isCollecting) return;
      node.isCollecting = true;
  
      const sound = coinAudio.cloneNode();
      sound.volume = 0.6;
      sound.play().catch(() => {});
  
      const startLng = node.lng;
      const startLat = node.lat;
      const startTime = performance.now();
      const duration = 350;
  
      function pullAnimation(now) {
          const elapsed = now - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const ease = progress * progress;
  
          const currentLng = startLng + (userLng - startLng) * ease;
          const currentLat = startLat + (userLat - startLat) * ease;
  
          node.marker.setLngLat([currentLng, currentLat]);
  
          const markerElem = node.marker.getElement();
          if (markerElem) markerElem.style.opacity = (1 - ease).toString();
  
          if (progress < 1) {
              requestAnimationFrame(pullAnimation);
          } else {
              playerGold += node.value;
              localStorage.setItem('rpg_player_gold', playerGold);
              updateGoldDisplay();
              showGoldPopup(node.value);
          
              node.marker.remove();
          
              const idx = activeGoldNodes.indexOf(node);
              if (idx !== -1) activeGoldNodes.splice(idx, 1);
          
              renderSelectedPlotCard();
          }
      }
  
      requestAnimationFrame(pullAnimation);
  }

  function cleanupDistantCoins() {
    if (!userLat || !userLng) return;
    for (let i = activeGoldNodes.length - 1; i >= 0; i--) {
      const node = activeGoldNodes[i];
      const dist = getDistanceFeet(userLat, userLng, node.lat, node.lng);
      if (dist > MAX_DESPAWN_DISTANCE_FEET) {
        node.marker.remove();
        activeGoldNodes.splice(i, 1);
      }
    }
  }

  function spawnSingleCoin() {
    if (!userLat || !userLng) return;
  
    cleanupDistantCoins();
  
    if (activeGoldNodes.length >= MAX_GOLD_NODES) return;
  
    const gridRadius = 3;
    const { gridX: playerGridX, gridY: playerGridY } = latLngToGrid(userLat, userLng);
  
    const POSITIONS = [
      { x: 0.50, y: 0.50 },
      { x: 0.20, y: 0.20 },
      { x: 0.80, y: 0.20 },
      { x: 0.20, y: 0.80 },
      { x: 0.80, y: 0.80 },
      { x: 0.50, y: 0.20 },
      { x: 0.50, y: 0.80 },
      { x: 0.20, y: 0.50 },
      { x: 0.80, y: 0.50 }
    ];
  
    for (let attempt = 0; attempt < 15; attempt++) {
      const offsetX = Math.floor(Math.random() * (gridRadius * 2 + 1)) - gridRadius;
      const offsetY = Math.floor(Math.random() * (gridRadius * 2 + 1)) - gridRadius;
  
      const targetGridX = playerGridX + offsetX;
      const targetGridY = playerGridY + offsetY;
      const cellId = `plot_${targetGridY}_${targetGridX}`;
  
      const slotIndex = Math.floor(Math.random() * POSITIONS.length);
      const slotId = `${cellId}_slot_${slotIndex}`;
  
      if (activeGoldNodes.some(node => node.slotId === slotId)) continue;
  
      const pos = POSITIONS[slotIndex];
      const { lat: goldLat, lng: goldLng } =
        gridToLatLng(targetGridX + pos.x, targetGridY + pos.y);
  
      const weights = [1, 1, 1, 1, 1, 1, 2, 2, 3, 4, 5];
      const coinValue = weights[Math.floor(Math.random() * weights.length)];
  
      const goldContainer = document.createElement('div');
      goldContainer.className = 'gold-marker-container';
  
      const goldImg = document.createElement('img');
      goldImg.className = 'gold-marker-icon';
      goldImg.src = 'gold.png';
      goldContainer.appendChild(goldImg);
  
      const nodeId = `coin_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
  
      const marker = new maplibregl.Marker({
        element: goldContainer,
        anchor: 'center'
      }).setLngLat([goldLng, goldLat]).addTo(map);
  
      const goldNode = { 
        id: nodeId, 
        cellId: cellId, 
        slotId: slotId, 
        lat: goldLat, 
        lng: goldLng, 
        value: coinValue,
        marker: marker 
      };
      
      activeGoldNodes.push(goldNode);
  
      goldContainer.addEventListener('click', (e) => {
          e.stopPropagation();
          cancelAnyActiveCollection();
          clearSelectedPlot();
          closeBackpackIfOpen(false);
      
          const dist = getDistanceFeet(userLat, userLng, goldNode.lat, goldNode.lng);
      
          if (dist <= INTERACTION_RADIUS_FEET) {
              collectCoin(goldNode);
              return;
          }
      
          ensureUIPanelVisible();
      
          const container = document.getElementById('plot-info');
      
          startLiveDistanceUpdates("coin", goldNode, (distRounded) => {
              const distNow = Number(distRounded);
              const valueLabel = coinValue === 5 ? '🌟 RARE GOLD CACHE' : '🪙 Gold Coin';
      
              if (distNow <= INTERACTION_RADIUS_FEET) {
                  collectCoin(goldNode);
                  stopLiveDistanceUpdates();
                  return;
              }
      
              container.innerHTML = `
                  <b>${valueLabel}:</b> +${coinValue} Gold<br/>
                  <b>Distance:</b> ${distRounded} ft away<br/>
                  <small style="color:#f7f7f7;">Walk within ${INTERACTION_RADIUS_FEET} ft to pick up!</small>
              `;
          });
      });
  
      break;
    }
  }

  function initCoinSpawns() {
    const initialCount = Math.floor(Math.random() * 5) + 8;
    for (let i = 0; i < initialCount; i++) {
      spawnSingleCoin();
    }
    setInterval(spawnSingleCoin, 10000);
  }

  function checkCoinProximity() {
      for (let i = activeGoldNodes.length - 1; i >= 0; i--) {
          const node = activeGoldNodes[i];
          if (node.isCollecting) continue;
  
          const dist = getDistanceFeet(userLat, userLng, node.lat, node.lng);
  
          if (dist <= INTERACTION_RADIUS_FEET) {
              collectCoin(node);
          }
      }
  }

  function createPlotFeature(gridX, gridY) {
    const sw = gridToLatLng(gridX, gridY);
    const se = gridToLatLng(gridX + 1, gridY);
    const ne = gridToLatLng(gridX + 1, gridY + 1);
    const nw = gridToLatLng(gridX, gridY + 1);
  
    const plotId = `plot_${gridY}_${gridX}`;
  
    return {
      type: 'Feature',
      properties: {
        plotId: plotId,
        isClaimed: claimedPlotIds.has(plotId),
        isSelected: (plotId === selectedPlotId)
      },
      geometry: {
        type: 'Polygon',
        coordinates: [[[sw.lng, sw.lat], [se.lng, se.lat], [ne.lng, ne.lat], [nw.lng, nw.lat], [sw.lng, sw.lat]]]
      }
    };
  }

  function generateSquareGrid(centerLat, centerLng) {
    const features = [];
    const gridRadius = 4;
  
    const { gridX: centerGridX, gridY: centerGridY } = latLngToGrid(centerLat, centerLng);
  
    for (let x = -gridRadius; x <= gridRadius; x++) {
      for (let y = -gridRadius; y <= gridRadius; y++) {
        features.push(createPlotFeature(centerGridX + x, centerGridY + y));
      }
    }
    return features;
  }

  function refreshMapGrid() {
    if (map.getSource('square-plots') && userLat && userLng) {
      map.getSource('square-plots').setData({
        type: 'FeatureCollection',
        features: generateSquareGrid(userLat, userLng)
      });
    }
  }

  function updateGoldDisplay() {
      document.getElementById('inv-gold-amount').innerText = playerGold;
      updateQuestUI();
  }

  function updateInventoryDisplay() {
      const items = [];
  
      // Tools
      if (playerInventory.has('axe')) items.push('🪓 Axe');
      if (playerInventory.has('mining pick')) items.push('⛏️ Mining Pick');
	  for (const gearKey in GEAR_DEFS) {
        const gear = GEAR_DEFS[gearKey];
        if (playerInventory.has(gear.id)) items.push(`${gear.icon} ${gear.name}`);
      }
  
      // Emoji map for dynamic resources
      const resourceEmojis = {
          'Wood': '🪵',
          'Stone': '🪨',
          'Copper Ore': '🟠',
          'Tin Ore': '⚪',
          'Iron Ore': '🟤',
          'Copper Ingot': '🟧',
          'Tin Ingot': '⬜',
		  'Bronze Ingot': '🟫',
          'Iron Ingot': '⬛'
      };
	  
      const trackedResourceNames = [
          ...Object.values(ITEM_DEFS).map(def => def.resourceName),
          ...Object.values(SMELTING_RECIPES).map(r => r.id)
      ];
      
      trackedResourceNames.forEach(name => {
          const amount = getResource(name);
          if (amount > 0) {
              const emoji = resourceEmojis[name] || '📦';
              items.push(`${emoji} ${name} x${amount}`);
          }
      });
  
      const listText = items.length > 0 ? items.join(', ') : 'Empty';
      document.getElementById('inv-items-list').innerText = listText;
	  
      // Update bottom stat bar
      const combatElem = document.getElementById('stat-combat-skill');
      const enduranceElem = document.getElementById('stat-endurance');
      if (combatElem) combatElem.innerText = getEffectiveCombatSkill();
      if (enduranceElem) enduranceElem.innerText = getEffectiveEndurance();
      updateQuestUI();	
	
  }

  function renderSelectedPlotCard() {
    const container = document.getElementById('plot-info');
  
    if (!selectedPlotId) {
      container.innerHTML = `<i>Tap any square, coin, or NPC to inspect.</i>`;
      return;
    }
  
    if (claimedPlotIds.has(selectedPlotId)) {
  
      const buildingId = plotBuildings[selectedPlotId];
  
      if (buildingId && BUILDING_DEFS[buildingId]) {
        const building = BUILDING_DEFS[buildingId];
  
        container.innerHTML = `
          <b>Status:</b>
          <span class="badge claimed">Claimed (Owned)</span><br/>
          <b>Building:</b> 🛠️ ${building.name}
        `;
  
      } else {
        container.innerHTML = `
          <b>Status:</b>
          <span class="badge claimed">Claimed (Owned)</span><br/>
          <button id="build-plot-btn" class="btn buy-btn">
            🛠️ Build
          </button>
        `;
  
        document
          .getElementById('build-plot-btn')
          .addEventListener('click', buildOnSelectedPlot);
      }
  
    } else {
  
      const canAfford = playerGold >= PLOT_PRICE;
      const buttonText = canAfford
        ? `🛒 Buy Plot (${PLOT_PRICE} Gold)`
        : `❌ Need ${PLOT_PRICE} Gold`;
  
      const disabledAttr = canAfford ? '' : 'disabled';
  
      container.innerHTML = `
        <b>Price:</b> 💰 ${PLOT_PRICE} Gold<br/>
        <b>Status:</b> <span class="badge wild">Wilderness</span><br/>
        <button id="buy-plot-btn" class="btn buy-btn" ${disabledAttr}>
          ${buttonText}
        </button>
      `;
  
      if (canAfford) {
        document
          .getElementById('buy-plot-btn')
          .addEventListener('click', buySelectedPlot);
      }
    }
  }
  
  function buildOnSelectedPlot() {
    if (!selectedPlotId) return;
    if (!claimedPlotIds.has(selectedPlotId)) return;
  
    const container = document.getElementById('plot-info');
    const existingBuilding = plotBuildings[selectedPlotId];
  
    if (existingBuilding) {
      container.innerHTML = `
        <b>Status:</b> <span class="badge claimed">Claimed (Owned)</span><br/>
        <b>Building:</b> 🛠️ ${BUILDING_DEFS[existingBuilding]?.name || 'Unknown'}<br/>
        <small>This plot already has a building.</small>
      `;
      return;
    }
  
    let html = `<b>Build on Plot</b><br/><br/>`;
  
    Object.values(BUILDING_DEFS).forEach(def => {
      const costEntries = Object.entries(def.costs);
      const canAfford = costEntries.every(([res, amt]) => getResource(res) >= amt);
      const costText = costEntries.map(([res, amt]) => `${amt} ${res}`).join(', ');
  
      html += `
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
          <img src="${def.image}" width="${def.width}" height="${def.height}" style="image-rendering: pixelated;" />
          <div style="flex:1;">
            <b>${def.name}</b><br/>
            <small>Requires: ${costText}</small><br/>
            <button id="build-btn-${def.id}" class="btn buy-btn" style="margin-top:4px;" ${canAfford ? '' : 'disabled'}>
              ${canAfford ? `🛠️ Build ${def.name}` : '❌ Not Enough Resources'}
            </button>
          </div>
        </div>
      `;
    });
  
    html += `<button id="back-to-plot-btn" class="btn" style="margin-top:6px; background:#475569;">← Back</button>`;
  
    container.innerHTML = html;
  
    document.getElementById('back-to-plot-btn').addEventListener('click', renderSelectedPlotCard);
  
    Object.values(BUILDING_DEFS).forEach(def => {
      const costEntries = Object.entries(def.costs);
      const canAfford = costEntries.every(([res, amt]) => getResource(res) >= amt);
      if (!canAfford) return;
  
      document.getElementById(`build-btn-${def.id}`).addEventListener('click', () => {
        buildOnPlot(def);
      });
    });
  }
  
  function buildOnPlot(def) {
    if (!selectedPlotId) return;
    if (!claimedPlotIds.has(selectedPlotId)) return;
    if (plotBuildings[selectedPlotId]) return;
  
    const canAfford = Object.entries(def.costs).every(([res, amt]) => getResource(res) >= amt);
    if (!canAfford) return;
  
    Object.entries(def.costs).forEach(([res, amt]) => addResource(res, -amt));
  
    plotBuildings[selectedPlotId] = def.id;
    localStorage.setItem('rpg_buildings', JSON.stringify(plotBuildings));
  
    updateInventoryDisplay();
    spawnBuildingOnPlot(selectedPlotId, def);
    renderSelectedPlotCard();
  }
  
  let buildingNodes = {}; // { plotId: { lat, lng, marker, def, plotId } }
  
  function spawnBuildingOnPlot(plotId, def) {
    // Remove any existing marker for this plot before recreating it.
    if (buildingNodes[plotId]?.marker) {
      buildingNodes[plotId].marker.remove();
    }
  
    // plot_123_456
    const parts = plotId.split('_');
    if (parts.length !== 3) return;
  
    const gridY = Number(parts[1]);
    const gridX = Number(parts[2]);
    if (!Number.isFinite(gridX) || !Number.isFinite(gridY)) return;
  
    const { lat: buildingLat, lng: buildingLng } =
      gridToLatLng(gridX + 0.50, gridY + 0.50);
  
    const container = document.createElement('div');
    container.className = 'building-marker-container';
    container.dataset.buildingPlot = plotId;
    container.style.width = `${def.width}px`;
    container.style.height = `${def.height}px`;
  
    const img = document.createElement('img');
    img.src = def.image;
    img.width = def.width;
    img.height = def.height;
    img.style.width = `${def.width}px`;
    img.style.height = `${def.height}px`;
    img.style.imageRendering = 'pixelated';
    img.style.filter = 'drop-shadow(0px 4px 6px rgba(0,0,0,0.4))';
  
    container.appendChild(img);
  
    const marker = new maplibregl.Marker({
      element: container,
      anchor: 'center'
    })
      .setLngLat([buildingLng, buildingLat])
      .addTo(map);
  
    buildingNodes[plotId] = { lat: buildingLat, lng: buildingLng, marker, def, plotId };
  
    container.addEventListener('click', (e) => {
      e.stopPropagation();
      cancelAnyActiveCollection();
      clearSelectedPlot();
      closeBackpackIfOpen(false);
      ensureUIPanelVisible();
      renderBuildingCard(buildingNodes[plotId]);
    });
  }
  
  function renderBuildingCard(node) {
    const container = document.getElementById('plot-info');
    const buildingDef = node.def;
  
    startLiveDistanceUpdates("building", node, dist => {
      const inRange = Number(dist) <= INTERACTION_RADIUS_FEET;
  
      if (!inRange) {
        container.innerHTML = `
          <b>${buildingDef.name}:</b><br/>
          <b>Distance:</b> ${dist} ft away<br/>
          <small style="color:#f7f7f7;">Walk within ${INTERACTION_RADIUS_FEET} ft to use.</small>
        `;
        return;
      }
  
      const recipes = getRecipesForBuilding(buildingDef.id);
  
      if (recipes.length === 0) {
        container.innerHTML = `
          <b>${buildingDef.name}</b><br/>
          <small>Nothing to craft here yet.</small>
        `;
        return;
      }
  
      let html = `<b>${buildingDef.name}</b><br/><small>Choose something to craft:</small><br/><br/>`;
  
      recipes.forEach(recipe => {
        const isGear = recipe.type !== 'resource';
        const alreadyOwned = isGear && playerInventory.has(recipe.id);
        const costEntries = Object.entries(recipe.costs);
        const canAfford = costEntries.every(([res, amt]) => getResource(res) >= amt);
        const costText = costEntries.map(([res, amt]) => `${amt} ${res}`).join(', ');
      
        let buttonLabel, buttonDisabled;
        if (alreadyOwned) {
          buttonLabel = '✅ Already Owned';
          buttonDisabled = true;
        } else if (!canAfford) {
          buttonLabel = '❌ Not Enough Resources';
          buttonDisabled = true;
        } else {
          buttonLabel = isGear ? `🛠️ Craft ${recipe.name}` : `🔥 Smelt ${recipe.name}`;
          buttonDisabled = false;
        }
      
        html += `
          <div style="margin-bottom:10px;">
            <b>${recipe.icon} ${recipe.name}</b><br/>
            <small>Requires: ${costText}</small><br/>
            <button id="craft-btn-${recipe.id.replace(/\s+/g, '-')}"
                    class="btn buy-btn"
                    style="margin-top:4px;"
                    ${buttonDisabled ? 'disabled' : ''}>
              ${buttonLabel}
            </button>
          </div>
        `;
      });
      
      container.innerHTML = html;
      
      recipes.forEach(recipe => {
        const isGear = recipe.type !== 'resource';
        if (isGear && playerInventory.has(recipe.id)) return;
      
        const canAfford = Object.entries(recipe.costs).every(([res, amt]) => getResource(res) >= amt);
        if (!canAfford) return;
      
        document
          .getElementById(`craft-btn-${recipe.id.replace(/\s+/g, '-')}`)
          .addEventListener('click', () => craftItem(recipe, node));
      });
    });
  }
  
  function craftItem(recipe, buildingNode) {
    const isGear = recipe.type !== 'resource';
  
    if (isGear && playerInventory.has(recipe.id)) return;
  
    for (const [res, amt] of Object.entries(recipe.costs)) {
      if (getResource(res) < amt) return;
    }
    for (const [res, amt] of Object.entries(recipe.costs)) {
      addResource(res, -amt);
    }
  
    if (isGear) {
      playerInventory.add(recipe.id);
      localStorage.setItem("rpg_player_inventory", JSON.stringify([...playerInventory]));
      showFloatingPopup(`+1 ${recipe.name}`, true);
      showToast(`Crafted ${recipe.name}!`, 4500);
    } else {
      addResource(recipe.id, recipe.yieldAmount);
      showFloatingPopup(`+${recipe.yieldAmount} ${recipe.name}`, true);
      showToast(`Smelted ${recipe.yieldAmount} ${recipe.name}!`, 4500);
    }
  
    updateInventoryDisplay();
    renderBuildingCard(buildingNode);
  }

  function buySelectedPlot() {
    if (!selectedPlotId || claimedPlotIds.has(selectedPlotId)) return;
  
    if (playerGold >= PLOT_PRICE) {
      playerGold -= PLOT_PRICE;
      claimedPlotIds.add(selectedPlotId);
  
      localStorage.setItem('rpg_player_gold', playerGold);
      localStorage.setItem(
        'rpg_claimed_plots',
        JSON.stringify(Array.from(claimedPlotIds))
      );
  
      // Now that the plot is officially saved as owned,
      // remove any resources currently occupying it.
      removeItemsFromClaimedPlots();
  
      updateGoldDisplay();
      closeBackpackIfOpen(false);
      ensureUIPanelVisible();
      renderSelectedPlotCard();
      refreshMapGrid();
    }
  }

  function updateAutoCenterUI() {
      const btn = document.getElementById('autocenter-button');
  
      if (autoCenterEnabled) {
          btn.classList.add('active');
      } else {
          btn.classList.remove('active');
      }
  }
  
  // Which panel is showing: 'explorer' | 'backpack' | 'quests' | null (all closed, buttons visible).
  function setPanel(which) {
      const show = (id, on) => {
          const el = document.getElementById(id);
          if (el) el.style.display = on ? 'block' : 'none';
      };

      show('ui-panel', which === 'explorer');
      show('inventory-panel', which === 'backpack');
      show('quests-panel', which === 'quests');

      const buttonsVisible = which === null;
      show('toggle-ui-btn', buttonsVisible);
      show('inventory-btn', buttonsVisible);
      show('quests-btn', buttonsVisible);
  }

  function isPanelOpen(id) {
      return document.getElementById(id).style.display === 'block';
  }

  function ensureUIPanelVisible() {
      if (document.getElementById('ui-panel').style.display === 'none') {
          setPanel('explorer');
      }
  }

  
  // Closes the Backpack or Quests panel (name kept from before the Quests panel existed).
  // restoreButton = false means the caller is about to show the Explorer Panel anyway.
  function closeBackpackIfOpen(restoreButton = true) {
      if (isPanelOpen('inventory-panel') || isPanelOpen('quests-panel')) {
          setPanel(restoreButton ? null : 'explorer');
      }
  }

  
  function clearSelectedPlot() {
      selectedPlotId = null;
      refreshMapGrid();
  }

  // UI & GEOLOCATION EVENT LISTENERS
  if (!new URLSearchParams(window.location.search).has('dev')) {
      document.getElementById('dev-reset-btn').style.display = 'none';
  }

  document.getElementById('dev-reset-btn').addEventListener('click', () => {
      if (confirm("Reset all gold, inventory, resources, buildings, and wipe owned plots?")) {
  
          localStorage.removeItem('rpg_player_gold');
          localStorage.removeItem('rpg_claimed_plots');
          localStorage.removeItem('rpg_player_inventory');
		  localStorage.removeItem('rpg_buildings');
          localStorage.removeItem(COLLECTED_STORAGE_KEY);
          collectedItems = {};
          for (const pid in buildingNodes) {
              buildingNodes[pid]?.marker?.remove();
              delete buildingNodes[pid];
          }
          
          localStorage.removeItem("rpg_quest_state");
		  localStorage.removeItem(LNG_GRID_SIZE_STORAGE_KEY);
          questState = {};
          
          playerGold = 0;
          claimedPlotIds.clear();
          playerInventory.clear();
          selectedPlotId = null;
		  
          for (const plotId in plotBuildings) {
            delete plotBuildings[plotId];
          }
          
          for (const key of Object.keys(localStorage)) {
              if (
                  key.startsWith('rpg_item_') ||
                  key.startsWith('rpg_resource_')
              ) {
                  localStorage.removeItem(key);
              }
          }
          
          updateGoldDisplay();
          updateInventoryDisplay();
          renderSelectedPlotCard();
          refreshMapGrid();
          
          currentGridCenterKey = null;
          spawnItems();
  
          // Reset merchant NPCs
          for (const key in NPC_DEFS) {
              const def = NPC_DEFS[key];
              localStorage.removeItem(def.disabledKey);
  
              if (npcNodes[def.id]?.marker) {
                  npcNodes[def.id].marker.remove();
              }
              npcNodes[def.id] = null;
          }
  
          // Reset & respawn quest NPCs
          for (const key in QUEST_NPC_DEFS) {
              const def = QUEST_NPC_DEFS[key];
          
              if (def.disabledKey) {
                  localStorage.removeItem(def.disabledKey);
              }
          
              if (npcNodes[def.id]?.marker) {
                  npcNodes[def.id].marker.remove();
              }
          
              if (npcNodes[def.id]?.indicatorMarker) {
                  npcNodes[def.id].indicatorMarker.remove();
              }
          
              npcNodes[def.id] = null;
          }
  
          // Respawn everyone
          for (const key in NPC_DEFS) {
              spawnNPC(NPC_DEFS[key]);
          }
          for (const key in QUEST_NPC_DEFS) {
              spawnNPC(QUEST_NPC_DEFS[key]);
          }
  
          alert("Save data cleared!");
      }
  });

  document.getElementById('start-btn').addEventListener('click', () => {
    const startBtn = document.getElementById('start-btn');

    startBtn.innerText = 'LOADING...';
    startBtn.disabled = true;

    document.getElementById('start-status').innerText = 'Acquiring GPS fix...';

    geolocate.trigger();

    // If GPS never reaches the required accuracy, let the player start anyway.
    setTimeout(() => {
      if (gameStarted || document.getElementById('start-anyway-btn')) return;

      const b = document.createElement('button');
      b.id = 'start-anyway-btn';
            b.innerText = 'Start anyway (low accuracy)';
      b.style.marginTop = '12px';

      b.addEventListener('click', () => {
        allowLowAccuracyStart = true;
        b.disabled = true;
        document.getElementById('start-status').innerText = 'Starting on next GPS update...';
      });

      document.getElementById('start-overlay').appendChild(b);
    }, 20000);
  });

  document.getElementById('autocenter-button').addEventListener('click', () => {
      autoCenterEnabled = !autoCenterEnabled;
      updateAutoCenterUI();
  
      if (autoCenterEnabled && userLat && userLng) {
          map.flyTo({
              center: [userLng, userLat],
              zoom: 17.95,
              essential: true
          });
      }
  });
  
  // Toggle Panel Visibility Listeners
  function switchPanel(which) {
      setPanel(which);
      cancelAnyActiveCollection();
      stopLiveDistanceUpdates();
  }

  document.getElementById('close-ui-btn').addEventListener('click', () => switchPanel(null));
  document.getElementById('toggle-ui-btn').addEventListener('click', () => switchPanel('explorer'));
  document.getElementById('inventory-btn').addEventListener('click', () => switchPanel('backpack'));
  document.getElementById('close-inventory-btn').addEventListener('click', () => switchPanel(null));

  document.getElementById('quests-btn').addEventListener('click', () => {
      updateQuestUI();
      switchPanel('quests');
  });
  document.getElementById('close-quests-btn').addEventListener('click', () => switchPanel(null));
  document.getElementById('quest-tracker').addEventListener('click', () => {
      updateQuestUI();
      switchPanel('quests');
  });


  geolocate.on('geolocate', (e) => {
      userLat = e.coords.latitude;
      userLng = e.coords.longitude;
	  
	  const accuracyFt = e.coords.accuracy * 3.28084;
      
      migrateGridIfNeeded();

      if (!gridAreaWarned && !isInSupportedArea(userLat, userLng)) {
        gridAreaWarned = true;
        showToast('You appear to be outside the continental US. The game still works, but tiles may be tilted or a different size.', 9000);
      }    
      if (!wakeLock) requestWakeLock();
      cleanupDistantCoins();
	  
      if (!gameStarted) {
	  
        if (accuracyFt > MIN_START_ACCURACY_FEET && !allowLowAccuracyStart) {
            document.getElementById('start-status').innerText =
                `Improving GPS signal... (${accuracyFt.toFixed(0)} ft, need ${MIN_START_ACCURACY_FEET} ft)`;
            return;
        }	  
	  
        gameStarted = true;
        document.getElementById('start-overlay').style.display = 'none';
        
        setPanel('explorer');
        updateGoldDisplay();
        updateInventoryDisplay();    
        playerMarker.setLngLat([userLng, userLat]).addTo(map);
        refreshMapGrid();
        spawnItems();
        initCoinSpawns();
        spawnAvailableNPCs();
        initNPCMovement();
        setInterval(checkItemRespawns, 30000);
		
        map.jumpTo({ center: [userLng, userLat], zoom: 17.95 });
      } else {
        playerMarker.setLngLat([userLng, userLat]);
        refreshMapGrid();
        spawnItems();
        checkCoinProximity();
        for (const key in NPC_DEFS) {
            checkNPCProximity(NPC_DEFS[key]);
        }  
        for (const key in QUEST_NPC_DEFS) {
            checkNPCProximity(QUEST_NPC_DEFS[key]);
        }
        updateAllQuestIndicators();
        if (autoCenterEnabled) {
          if (compassActive) {
            map.jumpTo({
              center: [userLng, userLat],
              zoom: 17.95
            });
          } else {
            map.easeTo({ 
              center: [userLng, userLat], 
              bearing: 0,
              pitch: 0,
              zoom: 17.95, 
              duration: 500, 
              essential: true 
            });
          }
        }
      }    

      document.getElementById('status').innerText = `Signal Active (${accuracyFt.toFixed(0)} ft accuracy)`;
  });

  geolocate.on('error', (e) => {
    let errorMsg = 'Unknown GPS Error';
    if (e.code === 1) errorMsg = 'Permission Denied - Please enable location access';
    if (e.code === 2) errorMsg = 'Position Unavailable';
    if (e.code === 3) errorMsg = 'GPS Timed Out';

    const statusElem = gameStarted ? document.getElementById('status') : document.getElementById('start-status');
    if (statusElem) {
      statusElem.innerHTML = `<span style="color:#ef4444;">⚠️ ${errorMsg}</span>`;
    }
  });

  // MAP INITIALIZATION & LAYER SETUP
  map.on('load', () => {
    try {
      const style = map.getStyle();
      if (style && style.layers) {
        style.layers.forEach(layer => {
          const id = layer.id.toLowerCase();
  
          // 1. Hide buildings
          if (id.includes('building')) {
            map.setLayoutProperty(layer.id, 'visibility', 'none');
          }
  
          // 2. Water styling
          if (id.includes('water') || id.includes('river') || id.includes('lake') || id.includes('ocean')) {
            if (layer.type === 'fill') map.setPaintProperty(layer.id, 'fill-color', '#2b65ec');
            else if (layer.type === 'line') map.setPaintProperty(layer.id, 'line-color', '#1d4ed8');
          }
  
          // 3. Background styling
          if (layer.type === 'background') {
            map.setPaintProperty(layer.id, 'background-color', '#3e7b41');
          }
  
          // 4. Land / Parks styling
          if ((id.includes('land') || id.includes('park') || id.includes('green') || id.includes('wood')) && layer.type === 'fill' && !id.includes('water')) {
            map.setPaintProperty(layer.id, 'fill-color', '#488a4b');
          }
  
          // 5. Roads, Highways, Streets, and BRIDGES
          if ((id.includes('road') || id.includes('highway') || id.includes('street') || id.includes('bridge') || id.includes('tunnel')) && layer.type === 'line') {
            if (id.includes('bridge')) {
              // Dark brown for wooden bridges
              map.setPaintProperty(layer.id, 'line-color', '#63462a'); 
            } else if (id.includes('case')) {
              // Darker casing border for roads
              map.setPaintProperty(layer.id, 'line-color', '#5c4028');
            } else {
              // Normal light dirt-path roads
              map.setPaintProperty(layer.id, 'line-color', '#9e7853');
            }
          }
  
          // 6. Hide symbols/labels
          if (layer.type === 'symbol') {
            map.setLayoutProperty(layer.id, 'visibility', 'none');
          }
        });
      }
    } catch (err) {
      console.warn('Map styling override warning:', err);
    }

    map.addSource('square-plots', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    map.addLayer({
      id: 'plots-fill',
      type: 'fill',
      source: 'square-plots',
      paint: { 'fill-color': '#000000', 'fill-opacity': 0 }
    });

    map.addLayer({
      id: 'plots-outline',
      type: 'line',
      source: 'square-plots',
      filter: ['all', ['!', ['get', 'isClaimed']], ['!', ['get', 'isSelected']]],
      paint: { 'line-color': '#1e293b', 'line-width': 2, 'line-opacity': 0.7 }
    });

    map.addLayer({
      id: 'plots-selected-outline',
      type: 'line',
      source: 'square-plots',
      filter: ['get', 'isSelected'],
      paint: { 'line-color': '#ef4444', 'line-width': 2, 'line-opacity': 0.8 }
    });

    map.addLayer({
      id: 'plots-claimed-outline',
      type: 'line',
      source: 'square-plots',
      filter: ['get', 'isClaimed'],
      paint: { 'line-color': '#eab308', 'line-width': 2, 'line-opacity': 0.8 }
    });

    map.on('zoom', updateItemVisibility);

    map.on('dragstart', () => {
      if (autoCenterEnabled || compassActive) {
        autoCenterEnabled = false;
        compassActive = false;
        smoothedHeading = null;
        if (compassBtn) compassBtn.classList.remove('active');
        window.removeEventListener('deviceorientationabsolute', handleDeviceOrientation, true);
        window.removeEventListener('deviceorientation', handleDeviceOrientation, true);
        updateAutoCenterUI();
      }
    });

    map.on('zoomstart', (e) => {
      if (e.originalEvent && autoCenterEnabled) {
        autoCenterEnabled = false;
        updateAutoCenterUI();
      }
    });

    map.on('click', 'plots-fill', (e) => {
      if (e.features.length > 0) {
	    cancelAnyActiveCollection();
	    stopLiveDistanceUpdates();
	    closeBackpackIfOpen(false);
        selectedPlotId = e.features[0].properties.plotId;
        ensureUIPanelVisible();
        renderSelectedPlotCard();
        refreshMapGrid();
      }
    });

    // --- COMPASS & ORIENTATION LOGIC ---
    const compassBtn = document.getElementById('compass-btn');
    const compassNeedle = document.getElementById('compass-needle');

    function getScreenOrientationAngle() {
      if (window.screen && window.screen.orientation && window.screen.orientation.angle !== undefined) {
        return window.screen.orientation.angle;
      }
      return window.orientation || 0;
    }

    function tiltCompensatedHeading(alpha, beta, gamma) {
      const rad = Math.PI / 180;
      const x = (beta || 0) * rad, y = (gamma || 0) * rad, z = (alpha || 0) * rad;
      const cY = Math.cos(y), cZ = Math.cos(z);
      const sX = Math.sin(x), sY = Math.sin(y), sZ = Math.sin(z);

      const Vx = -cZ * sY - sZ * sX * cY;
      const Vy = -sZ * sY + cZ * sX * cY;

      let h = Math.atan(Vx / Vy);
      if (Vy < 0) h += Math.PI;
      else if (Vx < 0) h += 2 * Math.PI;
      return h / rad;
    }

    function getHeadingDegrees(event) {
      // iOS already tilt-compensates this value
      if (event.webkitCompassHeading != null) return event.webkitCompassHeading;
      // Android: only trust absolute (true north) readings
      if (event.alpha == null) return null;
      if (!event.absolute && event.type !== 'deviceorientationabsolute') return null;
      return tiltCompensatedHeading(event.alpha, event.beta, event.gamma);
    }

    function smoothAngle(prev, next, k = 0.15) {
      if (prev === null) return next;
      const diff = ((next - prev + 540) % 360) - 180; // shortest way around
      return (prev + diff * k + 360) % 360;
    }

    function handleDeviceOrientation(event) {
      if (!compassActive) return;
      const raw = getHeadingDegrees(event);
      if (raw === null || isNaN(raw)) return;

      smoothedHeading = smoothAngle(smoothedHeading, raw);

      if (headingFrameQueued) return;
      headingFrameQueued = true;
      requestAnimationFrame(() => {
        headingFrameQueued = false;
        if (!compassActive || smoothedHeading === null) return;
        const opts = { bearing: smoothedHeading };
        if (autoCenterEnabled && userLat && userLng) opts.center = [userLng, userLat];
        map.jumpTo(opts);
      });
    }


    function updateCompassUI() {
      if (!compassNeedle) return;
      const bearing = map.getBearing();
      compassNeedle.style.transform = `rotate(${-bearing}deg)`;
    }

    map.on('rotate', updateCompassUI);

    if (compassBtn) {
      compassBtn.addEventListener('click', async () => {
        compassActive = !compassActive;
        smoothedHeading = null;

        if (compassActive) {
          autoCenterEnabled = true;
          updateAutoCenterUI();

          if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
              const response = await DeviceOrientationEvent.requestPermission();
              if (response !== 'granted') {
                compassActive = false;
                alert('Device orientation permission denied.');
                return;
              }
            } catch (err) {
              console.error(err);
            }
          }

          compassBtn.classList.add('active');

          if ('ondeviceorientationabsolute' in window) {
            window.addEventListener('deviceorientationabsolute', handleDeviceOrientation, true);
          } else {
            window.addEventListener('deviceorientation', handleDeviceOrientation, true);
          }
        } else {
          compassBtn.classList.remove('active');
          window.removeEventListener('deviceorientationabsolute', handleDeviceOrientation, true);
          window.removeEventListener('deviceorientation', handleDeviceOrientation, true);

          map.easeTo({
            bearing: 0,
            pitch: 0,
            duration: 500,
            essential: true
          });
        }
      });
    }

    if (userLat && userLng) {
      refreshMapGrid();
      spawnItems();
    }
  });