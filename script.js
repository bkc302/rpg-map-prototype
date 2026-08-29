  let userLat = null;
  let userLng = null;
  let gameStarted = false;
  let autoCenterEnabled = true;
  let compassActive = false;
  
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
  
      percentage: 25, //25 percent chance that a tile can be a tree
  
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
    
      percentage: 25, //25 percent chance that a tile can be stone
    
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
  
      costs: {
        Wood: 10,
        Stone: 5
      }
    }
  };

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
  const LAT_GRID_SIZE_DEG = 0.00045; // Fixed height (~50m)
  let LNG_GRID_SIZE_DEG = 0.00045;
  let gridInitialized = false;
  
  function initGridScaling(lat) {
    if (gridInitialized) return;
    const rad = lat * Math.PI / 180;
    LNG_GRID_SIZE_DEG = LAT_GRID_SIZE_DEG / Math.cos(rad);
    gridInitialized = true;
  }
  
  function latLngToGrid(lat, lng) {
    return {
      gridX: Math.floor(lng / LNG_GRID_SIZE_DEG),
      gridY: Math.floor(lat / LAT_GRID_SIZE_DEG)
    };
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
  
  function startLiveDistanceUpdates(targetType, targetNode, renderFn) {
      if (distanceInterval) clearInterval(distanceInterval);
  
      activeTarget = { type: targetType, node: targetNode };
  
      function update() {
          if (!userLat || !userLng) return;
  
          const dist = getDistanceFeet(
              userLat,
              userLng,
              targetNode.lat,
              targetNode.lng
          ).toFixed(0);
  
          renderFn(dist);
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
    return `rpg_item_${itemDef.id}_${tileKey}`;
  }
  
  function spawnItems() {
      if (!userLat || !userLng) return;
      if (collectionInterval) return;
	  if (activeTarget && activeTarget.type === 'item') return;
  
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
          let selectedDef = null;
  
          for (const itemKey in ITEM_DEFS) {
              const def = ITEM_DEFS[itemKey];
  
              const score = getItemPlacementScore(
                  cell.gridX,
                  cell.gridY,
                  def.id
              );
  
              if (score < def.percentage / 100) {
                  selectedDef = def;
                  break;
              }
          }
  
          // No resource on this tile.
          if (!selectedDef) continue;
  
          const def = selectedDef;
  
          const itemLat =
              (cell.gridY + 0.50) * LAT_GRID_SIZE_DEG;
  
          const itemLng =
              (cell.gridX + 0.50) * LNG_GRID_SIZE_DEG;
  
          // Check whether this exact resource on this exact tile
          // is currently collected.
          const storageKey =
              getItemStorageKey(def, tileKey);
  
          const collectedAt = parseInt(
              localStorage.getItem(storageKey) || '0',
              10
          );
  
          const isCollected =
              collectedAt > 0 &&
              Date.now() - collectedAt < def.respawnMs;
  
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
        <b>Distance:</b> ${dist} ft away (In Range)<br/>
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
      const itemStorageKey = getItemStorageKey(def, node.tileKey);
      localStorage.setItem(
          itemStorageKey,
          Date.now().toString()
      );
  
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
      
      document.getElementById('status').innerText =
          `Collected +${yieldAmount} ${def.resourceName}!`;
  
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
  
      node.img.src = isZoomedOut
        ? def.zoomImage
        : def.mainImage;
    });
  }
  
  let collectionInterval = null;
  let collectionCancelCheck = null;
  let collectionProgressInterval = null;

  function cancelAnyActiveCollection() {
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
          setTimeout(() => {
              // Don't play if collection was cancelled.
              if (!collectionInterval) return;
  
              playChopSound();
          }, i * 1000);
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
  
      const npcLat = (targetGridY + def.offsetY) * LAT_GRID_SIZE_DEG;
      const npcLng = (targetGridX + def.offsetX) * LNG_GRID_SIZE_DEG;
  
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
  
      const currentGridX = Math.floor(node.lng / LNG_GRID_SIZE_DEG);
      const currentGridY = Math.floor(node.lat / LAT_GRID_SIZE_DEG);
  
      const offsetX = Math.floor(Math.random() * 3) - 1;
      const offsetY = Math.floor(Math.random() * 3) - 1;
  
      let newGridX = Math.max(gridX - radius, Math.min(gridX + radius, currentGridX + offsetX));
      let newGridY = Math.max(gridY - radius, Math.min(gridY + radius, currentGridY + offsetY));
  
      node.lat = (newGridY + def.offsetY) * LAT_GRID_SIZE_DEG;
      node.lng = (newGridX + def.offsetX) * LNG_GRID_SIZE_DEG;
  
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
      const npcGridX = Math.floor(node.lng / LNG_GRID_SIZE_DEG);
      const npcGridY = Math.floor(node.lat / LAT_GRID_SIZE_DEG);
  
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
      
      document.getElementById("status").innerText = `Acquired ${def.tradeItem}!`;
      
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
  
  function isQuestAccepted(questId) {
      return questState[questId] === 'accepted' || questState[questId] === true;
  }
  
  function acceptQuest(questId) {
      questState[questId] = 'accepted';
      localStorage.setItem("rpg_quest_state", JSON.stringify(questState));
  }
  
  function isQuestComplete(questId) {
      return questState[questId] === true;
  }
  
  function completeQuest(questId) {
      questState[questId] = true;
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
              
              document.getElementById('status').innerText = dialog.completed;
          
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
      const goldLat = (targetGridY + pos.y) * LAT_GRID_SIZE_DEG;
      const goldLng = (targetGridX + pos.x) * LNG_GRID_SIZE_DEG;
  
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
    const minLat = gridY * LAT_GRID_SIZE_DEG;
    const maxLat = (gridY + 1) * LAT_GRID_SIZE_DEG;
    
    const minLng = gridX * LNG_GRID_SIZE_DEG;
    const maxLng = (gridX + 1) * LNG_GRID_SIZE_DEG;
  
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
        coordinates: [[[minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat], [minLng, minLat]]]
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
  }

  function updateInventoryDisplay() {
      const items = [];
  
      if (playerInventory.has('axe')) {
          items.push('🪓 Axe');
      }
  
      if (playerInventory.has('mining pick')) {
          items.push('⛏️ Mining Pick');
      }
  
      const woodAmount = getResource('Wood');
  
      if (woodAmount > 0) {
          items.push(`🪵 Wood x${woodAmount}`);
      }
  
      const stoneAmount = getResource('Stone');
  
      if (stoneAmount > 0) {
          items.push(`🪨 Stone x${stoneAmount}`);
      }
  
      const listText = items.length > 0 ? items.join(', ') : 'Empty';
  
      document.getElementById('inv-items-list').innerText = listText;
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
  
    const def = BUILDING_DEFS.workbench;
  
    const woodAmount = getResource('Wood');
    const stoneAmount = getResource('Stone');
  
    const canAfford =
      woodAmount >= def.costs.Wood &&
      stoneAmount >= def.costs.Stone;
  
    container.innerHTML = `
      <b>Build on Plot</b><br/><br/>
  
      <div style="
        display:flex;
        align-items:center;
        gap:10px;
        margin-bottom:10px;
      ">
        <img
          src="${def.image}"
          width="${def.width}"
          height="${def.height}"
          style="image-rendering: pixelated;"
        />
  
        <div>
          <b>${def.name}</b><br/>
          <small>Crafting station</small>
        </div>
      </div>
  
      <b>Requires:</b><br/>
      🪵 ${def.costs.Wood} Wood<br/>
      🪨 ${def.costs.Stone} Stone<br/><br/>
  
      <button
        id="build-workbench-btn"
        class="btn buy-btn"
        ${canAfford ? '' : 'disabled'}
      >
        ${canAfford
          ? '🛠️ Build Workbench'
          : '❌ Not Enough Resources'}
      </button>
  
      <button
        id="back-to-plot-btn"
        class="btn"
        style="margin-top:6px; background:#475569;"
      >
        ← Back
      </button>
    `;
  
    document
      .getElementById('back-to-plot-btn')
      .addEventListener('click', renderSelectedPlotCard);
  
    if (canAfford) {
      document
        .getElementById('build-workbench-btn')
        .addEventListener('click', () => {
          buildWorkbenchOnSelectedPlot();
        });
    }
  }
  
  function buildWorkbenchOnSelectedPlot() {
    if (!selectedPlotId) return;
    if (!claimedPlotIds.has(selectedPlotId)) return;
  
    // Only one building per plot for now.
    if (plotBuildings[selectedPlotId]) return;
  
    const def = BUILDING_DEFS.workbench;
  
    if (getResource('Wood') < def.costs.Wood || getResource('Stone') < def.costs.Stone) {
      return;
    }
    
    // Pay the building cost.
    addResource('Wood', -def.costs.Wood);
    addResource('Stone', -def.costs.Stone);
  
    // Save the building to this plot.
    plotBuildings[selectedPlotId] = def.id;
  
    localStorage.setItem(
      'rpg_buildings',
      JSON.stringify(plotBuildings)
    );
  
    // Update inventory immediately.
    updateInventoryDisplay();
  
    // Put the workbench on the map.
    spawnBuildingOnPlot(selectedPlotId, def);
  
    // Show the updated plot card.
    renderSelectedPlotCard();
  }
  
  function spawnBuildingOnPlot(plotId, def) {
    // Don't create duplicates.
    const existing = document.querySelector(
      `[data-building-plot="${plotId}"]`
    );
  
    if (existing) {
      existing.remove();
    }
  
    // plot_123_456
    const parts = plotId.split('_');
  
    if (parts.length !== 3) return;
  
    const gridY = Number(parts[1]);
    const gridX = Number(parts[2]);
  
    if (!Number.isFinite(gridX) || !Number.isFinite(gridY)) return;
  
    // Exact center of the plot.
    const buildingLat =
      (gridY + 0.50) * LAT_GRID_SIZE_DEG;
  
    const buildingLng =
      (gridX + 0.50) * LNG_GRID_SIZE_DEG;
  
    const container = document.createElement('div');
  
    container.className = 'building-marker-container';
    container.dataset.buildingPlot = plotId;
  
    container.style.width = `${def.width}px`;
    container.style.height = `${def.height}px`;
    container.style.pointerEvents = 'none';
  
    const img = document.createElement('img');
  
    img.src = def.image;
    img.width = def.width;
    img.height = def.height;
  
    img.style.width = `${def.width}px`;
    img.style.height = `${def.height}px`;
    img.style.imageRendering = 'pixelated';
  
    container.appendChild(img);
  
    new maplibregl.Marker({
      element: container,
      anchor: 'center'
    })
      .setLngLat([buildingLng, buildingLat])
      .addTo(map);
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
  
  function ensureUIPanelVisible() {
      const uiPanel = document.getElementById('ui-panel');
      const toggleBtn = document.getElementById('toggle-ui-btn'); 
      const inventoryBtn = document.getElementById('inventory-btn'); //NEW
  
      if (uiPanel.style.display === 'none') {
          uiPanel.style.display = 'block';
          toggleBtn.style.display = 'none';
		  inventoryBtn.style.display = 'none'; //NEW
      }
  }
  
  function closeBackpackIfOpen(restoreButton = true) {
      const invPanel = document.getElementById('inventory-panel');
      const invBtn = document.getElementById('inventory-btn');
  
      if (invPanel.style.display === 'block') {
          invPanel.style.display = 'none';
  
          if (restoreButton) {
              invBtn.style.display = 'block';
          } else {
              invBtn.style.display = 'none';
          }
      }
  }
  
  function clearSelectedPlot() {
      selectedPlotId = null;
      refreshMapGrid();
  }

  // UI & GEOLOCATION EVENT LISTENERS
  document.getElementById('dev-reset-btn').addEventListener('click', () => {
      if (confirm("Reset all gold, inventory, resources, buildings, and wipe owned plots?")) {
  
          localStorage.removeItem('rpg_player_gold');
          localStorage.removeItem('rpg_claimed_plots');
          localStorage.removeItem('rpg_player_inventory');
		  localStorage.removeItem('rpg_buildings');
          
          localStorage.removeItem("rpg_quest_state");
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
  document.getElementById('close-ui-btn').addEventListener('click', () => {
      document.getElementById('ui-panel').style.display = 'none';
      document.getElementById('toggle-ui-btn').style.display = 'block';
      document.getElementById('inventory-btn').style.display = 'block';
  
      cancelAnyActiveCollection();
      stopLiveDistanceUpdates();
  });
  
  document.getElementById('toggle-ui-btn').addEventListener('click', () => {
      document.getElementById('ui-panel').style.display = 'block';
      document.getElementById('toggle-ui-btn').style.display = 'none';
      document.getElementById('inventory-btn').style.display = 'none';
  
      cancelAnyActiveCollection();
      stopLiveDistanceUpdates();
  });
  
  document.getElementById('inventory-btn').addEventListener('click', () => {
      document.getElementById('inventory-panel').style.display = 'block';
      document.getElementById('inventory-btn').style.display = 'none';
      document.getElementById('toggle-ui-btn').style.display = 'none';
  
      cancelAnyActiveCollection();
      stopLiveDistanceUpdates();
  });
  
  document.getElementById('close-inventory-btn').addEventListener('click', () => {
      document.getElementById('inventory-panel').style.display = 'none';
      document.getElementById('inventory-btn').style.display = 'block';
      document.getElementById('toggle-ui-btn').style.display = 'block';
  
      cancelAnyActiveCollection();
      stopLiveDistanceUpdates();
  });


  geolocate.on('geolocate', (e) => {
      userLat = e.coords.latitude;
      userLng = e.coords.longitude;
	  
	  const accuracyFt = e.coords.accuracy * 3.28084;
      
      initGridScaling(userLat);    
      if (!wakeLock) requestWakeLock();
      cleanupDistantCoins();
	  
      if (!gameStarted) {
	  
        if (accuracyFt > MIN_START_ACCURACY_FEET) {
            document.getElementById('start-status').innerText =
                `Improving GPS signal... (${accuracyFt.toFixed(0)} ft, need ${MIN_START_ACCURACY_FEET} ft)`;
            return;
        }	  
	  
        gameStarted = true;
        document.getElementById('start-overlay').style.display = 'none';
        
        document.getElementById('ui-panel').style.display = 'block';
        document.getElementById('toggle-ui-btn').style.display = 'none';
		document.getElementById('inventory-btn').style.display = 'none';
        updateGoldDisplay();
        updateInventoryDisplay();    
        playerMarker.setLngLat([userLng, userLat]).addTo(map);
        refreshMapGrid();
        spawnItems();
        initCoinSpawns();
        spawnAvailableNPCs();
        initNPCMovement();
		
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

    function getHeadingDegrees(event) {
      let heading = null;
      if (event.webkitCompassHeading !== undefined && event.webkitCompassHeading !== null) {
        heading = event.webkitCompassHeading;
      } else if (event.alpha !== null && event.alpha !== undefined) {
        heading = (360 - event.alpha + getScreenOrientationAngle()) % 360;
      }
      return heading;
    }

    function handleDeviceOrientation(event) {
        if (!compassActive) return;
    
        const heading = getHeadingDegrees(event);
    
        if (heading !== null && !isNaN(heading)) {
            if (autoCenterEnabled && userLat && userLng) {
                map.jumpTo({
                    center: [userLng, userLat],
                    bearing: heading,
                    zoom: 17.95
                });
            } else {
                map.rotateTo(heading, { 
                    duration: 50,
                    zoom: 17.95
                });
            }
        }
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