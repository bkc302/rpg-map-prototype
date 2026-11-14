  let userLat = null;
  let userLng = null;
  let gameStarted = false;
  let autoCenterEnabled = true;
  let gridVisible = localStorage.getItem('rpg_show_grid') !== 'false';
  let allowLowAccuracyStart = false;
  let gridAreaWarned = false;

  // Stop long-presses from selecting text or opening the browser's search / context menu.
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('selectstart', e => e.preventDefault());
  
  let activeTarget = null;
  let distanceInterval = null;

  // Game Economy, Inventory & Land Ownership State
  const savedGold = localStorage.getItem('rpg_player_gold');
  let playerGold = (savedGold !== null) ? parseInt(savedGold, 10) || 0 : 0;
  
  const PLOT_PRICE = 100;
  const MIN_START_ACCURACY_FEET = 30; 
  const INTERACTION_RADIUS_FEET = 150;

  // How much decorative grass is scattered on the map: 1 = just a few patches, 10 = lots.
  const GRASS_AMOUNT = 5;
  
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
                  rewardXP: 25,
                  xpBackfill: true,
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
                  rewardXP: 35,
                  xpBackfill: true,
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
                  rewardXP: 60,
                  xpBackfill: true,
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
              },
              {
                  questId: "grubwick_forge_quest",
                  rewardXP: 80,
                  xpBackfill: true,
                  title: "Fire Up the Forge",
                  objectives: [
                      { text: "Have an empty plot to build on", flag: () => isBuildingBuilt("forge") || [...claimedPlotIds].some(id => !plotBuildings[id]), hint: () => `Each plot holds one building. Buy another plot for ${PLOT_PRICE} gold.` },
                      { text: "Gather stone", count: () => getResource("Stone"), max: () => BUILDING_DEFS.forge.costs["Stone"], doneWhen: () => isBuildingBuilt("forge") },
                      { text: "Gather iron ore", count: () => getResource("Iron Ore"), max: () => BUILDING_DEFS.forge.costs["Iron Ore"], doneWhen: () => isBuildingBuilt("forge") },
                      { text: "Build a forge", flag: () => isBuildingBuilt("forge"), hint: "Tap a plot you own that has no building, then choose Build." },
                      { text: "Gather copper ore", count: () => getResource("Copper Ore"), max: () => SMELTING_RECIPES.copperIngot.costs["Copper Ore"], doneWhen: () => getResource("Copper Ingot") >= 1 },
                      { text: "Smelt a copper ingot", flag: () => getResource("Copper Ingot") >= 1, hint: "Walk up to your forge and tap it." }
                  ],
                  requiredItems: [],
                  requiredBuildings: ["forge"],
                  requiredResources: { "Copper Ingot": 1 },
                  rewardGold: 75,
                  rewardItems: [],
                  disappearOnComplete: false,
                  dialog: {
                      offer: "A workbench is a fine start, but real gear needs metal! Build yourself a forge, then smelt me a copper ingot to prove you can work it. You'll need stone and iron ore for the forge, a spare plot to put it on, and copper ore for the ingot. Up for it?",
                      inProgress: "Still working on that forge? You'll need a spare plot, plenty of stone and iron ore to build it, and two copper ore to smelt an ingot.",
                      readyToTurnIn: "A forge, and a copper ingot to show for it! There's nothing like the glow of fresh metal.",
                      completed: "Fine work! Here's 75 gold for your trouble. Timber Pete has been asking after you, by the way. He's got a job that calls for a sturdy shield."
                  }
              },
              {
                  questId: "grubwick_goblin_quest",
                  title: "First Blood",
                  objectives: [
                      { text: "Defeat goblins", count: () => getQuestProgress("grubwick_goblin_quest"), max: 3, hint: "Tap a goblin on the map, then press Fight. Your health slowly comes back over time." }
                  ],
                  requiredItems: [],
                  kill: { family: "goblin", count: 3 },
                  rewardGold: 75,
                  rewardXP: 60,
                  rewardItems: [],
                  disappearOnComplete: false,
                  dialog: {
                      offer: "You've got a forge, a sword and a shield. Time to put them to use! Goblins have been creeping around here. Tap one and press Fight, and remember you can always walk away if it goes badly. Beat three of them for me. Ready?",
                      inProgress: "Still hunting? Goblins wander all over. Tap one to see how tough it is before you fight. If you're hurt, rest first.",
                      readyToTurnIn: "Three goblins down! You're turning into a real adventurer.",
                      completed: "Well done! Here's 75 gold and some well-earned experience. Keep fighting and you'll grow stronger. Ranger Bramblefoot is looking for someone who can handle goblins. Reach level 2 and he'll find you."
                  }
              }
          ]
      },

      timberPeteQuest: {
          id: "timberPeteQuest",
          name: "Timber Pete",
          img: "pete.png",
          talkRadius: INTERACTION_RADIUS_FEET,
          spawnRadius: 1,
          offsetX: 0.75,
          offsetY: 0.75,
          disabledKey: "rpg_npc_disabled_pete_quest",
          appearsAfterQuest: "grubwick_forge_quest",
          quests: [
              {
                  questId: "pete_shield_quest",
                  rewardXP: 60,
                  xpBackfill: true,
                  title: "A Sturdy Shield",
                  objectives: [
                      { text: "Gather wood", count: () => getResource("Wood"), max: () => GEAR_DEFS.woodenShield.costs["Wood"], doneWhen: () => playerInventory.has("wooden shield") },
                      { text: "Craft a wooden shield", flag: () => playerInventory.has("wooden shield"), hint: () => `Needs ${formatCosts(GEAR_DEFS.woodenShield.costs)}, crafted at your workbench` }
                  ],
                  requiredItems: ["wooden shield"],
                  rewardGold: 60,
                  rewardItems: [],
                  disappearOnComplete: true,
                  dialog: {
                      offer: "Well, if it isn't the adventurer with my axe! The woods are getting wilder these days. A good wooden shield will keep you in one piece. Craft one at your workbench and I'll make it worth your while. Interested?",
                      inProgress: "No shield yet? Chop some wood and craft one at your workbench. Twenty pieces ought to do it.",
                      readyToTurnIn: "Now that's a fine shield! It'll take a knock or two for you.",
                      completed: "Here's 60 gold for your trouble. Say, Miner Gus was asking about you too. Something about metal, naturally."
                  }
              }
          ]
      },

      minerGusQuest: {
          id: "minerGusQuest",
          name: "Miner Gus",
          img: "gus.png",
          talkRadius: INTERACTION_RADIUS_FEET,
          spawnRadius: 1,
          offsetX: 0.50,
          offsetY: 0.80,
          disabledKey: "rpg_npc_disabled_gus_quest",
          appearsAfterQuest: "pete_shield_quest",
          quests: [
              {
                  questId: "gus_bronze_quest",
                  rewardXP: 120,
                  xpBackfill: true,
                  title: "Bronze Work",
                  objectives: [
                      { text: "Smelt bronze ingots", count: () => getResource("Bronze Ingot"), max: 2, hint: () => `At your forge. Each needs ${formatCosts(SMELTING_RECIPES.bronzeIngot.costs)}, so smelt copper and tin ore into ingots first.` }
                  ],
                  requiredItems: [],
                  requiredResources: { "Bronze Ingot": 2 },
                  rewardGold: 100,
                  rewardItems: [],
                  disappearOnComplete: true,
                  dialog: {
                      offer: "Hey there! How's that mining pick treating you? Now that you've got a forge, show me what it can do. Smelt me two bronze ingots. Copper and tin, mixed just right. Think you can manage that?",
                      inProgress: "Bronze takes patience. Smelt your copper and tin into ingots first, then combine them at the forge. Two copper ingots and two tin ingots make one bronze.",
                      readyToTurnIn: "Beautiful! Look at that color. That's proper bronze.",
                      completed: "Here's 100 gold for your trouble. Bronze won't be the last metal you work with. Keep that sword sharp. Something tells me you'll need it before long."
                  }
              }
          ]
      },

      rangerBrambleHunt: {
          id: "rangerBrambleHunt",
          name: "Ranger Bramblefoot",
          img: "bramblefoot.png",
          talkRadius: INTERACTION_RADIUS_FEET,
          spawnRadius: 1,
          offsetX: 0.20,
          offsetY: 0.50,
          disabledKey: "rpg_npc_disabled_bramble_hunt",
          appearsAfterQuest: "bramble_second_quest",
          appearsAtLevel: 2,
          quests: [
              {
                  questId: "bramble_goblin_hunt",
                  title: "Goblin Trouble",
                  minLevel: 2,
                  objectives: [
                      { text: "Defeat goblins", count: () => getQuestProgress("bramble_goblin_hunt"), max: 5 }
                  ],
                  requiredItems: [],
                  kill: { family: "goblin", count: 5 },
                  rewardGold: 120,
                  rewardXP: 100,
                  rewardItems: [],
                  disappearOnComplete: false,
                  dialog: {
                      locked: "The goblins are getting bolder, but you are not ready for the real trouble yet. Come back at level 2.",
                      offer: "Ah, there you are! The goblins are getting bolder and I need five of them gone from these parts. Any goblin counts, raiders too. Defeat five and I will make it worth your while.",
                      inProgress: "Still out there with the goblins? Keep at it. Five of them, any kind.",
                      readyToTurnIn: "Five goblins fewer! The woods feel safer already.",
                      completed: "Excellent! Here's 120 gold and some experience. There's worse out there, though: goblin raiders. Come back when you've reached level 4."
                  }
              },
              {
                  questId: "bramble_raider_hunt",
                  title: "Raider Hunt",
                  minLevel: 4,
                  objectives: [
                      { text: "Defeat Goblin Raiders", count: () => getQuestProgress("bramble_raider_hunt"), max: 3 }
                  ],
                  requiredItems: [],
                  kill: { id: "goblinRaider", count: 3 },
                  rewardGold: 250,
                  rewardXP: 300,
                  rewardItems: [],
                  disappearOnComplete: false,
                  dialog: {
                      locked: "Goblin raiders are far too dangerous for you right now. Come back when you have reached level 4.",
                      offer: "Goblin raiders have been spotted. They're bigger, meaner and well armed. Defeat three Goblin Raiders and I will pay you very well. Take your best gear!",
                      inProgress: "The raiders hit hard. Rest up between fights and use your best gear.",
                      readyToTurnIn: "Three raiders down. You have my respect, adventurer.",
                      completed: "Magnificent! Here's 250 gold and plenty of experience. Brutes are out there too. Be careful."
                  }
              }
          ]
      },

      timberPeteOrders: {
          id: "timberPeteOrders",
          name: "Timber Pete",
          img: "pete.png",
          talkRadius: INTERACTION_RADIUS_FEET,
          spawnRadius: 1,
          offsetX: 0.70,
          offsetY: 0.30,
          disabledKey: "rpg_npc_disabled_pete_orders",
          appearsAfterQuest: "pete_shield_quest",
          appearsAtLevel: 3,
          quests: [
              {
                  questId: "pete_lumber_order",
                  title: "Lumber Order",
                  minLevel: 3,
                  objectives: [
                      { text: "Gather wood", count: () => getResource("Wood"), max: 40, hint: "Trees and goblins both give wood." }
                  ],
                  requiredItems: [],
                  requiredResources: { "Wood": 40 },
                  rewardGold: 100,
                  rewardXP: 80,
                  rewardItems: [],
                  disappearOnComplete: true,
                  dialog: {
                      locked: "I've got a big lumber order, but it's too much for a beginner. Come back at level 3.",
                      offer: "Business is booming! I've got a big lumber order and I'm short on wood. Bring me 40 wood and I'll pay you well. Chop it yourself, or goblins sometimes carry some. Deal?",
                      inProgress: "Still gathering? I need 40 wood. Trees are good for that, and goblins sometimes drop some.",
                      readyToTurnIn: "That's a fine pile of lumber! Exactly what I needed.",
                      completed: "Here's 100 gold and a little extra for the effort. Pleasure doing business!"
                  }
              }
          ]
      },

      minerGusIron: {
          id: "minerGusIron",
          name: "Miner Gus",
          img: "gus.png",
          talkRadius: INTERACTION_RADIUS_FEET,
          spawnRadius: 1,
          offsetX: 0.30,
          offsetY: 0.65,
          disabledKey: "rpg_npc_disabled_gus_iron",
          appearsAfterQuest: "gus_bronze_quest",
          appearsAtLevel: 5,
          quests: [
              {
                  questId: "gus_iron_quest",
                  title: "Iron Will",
                  minLevel: 5,
                  objectives: [
                      { text: "Smelt iron ingots", count: () => getResource("Iron Ingot"), max: () => GEAR_DEFS.ironSword.costs["Iron Ingot"], doneWhen: () => playerInventory.has("iron sword"), hint: () => `Each needs ${formatCosts(SMELTING_RECIPES.ironIngot.costs)}, smelted at your forge.` },
                      { text: "Craft an iron sword", flag: () => playerInventory.has("iron sword"), hint: () => `Needs ${formatCosts(GEAR_DEFS.ironSword.costs)}, crafted at your workbench` }
                  ],
                  requiredItems: ["iron sword"],
                  rewardGold: 300,
                  rewardXP: 400,
                  rewardItems: [],
                  disappearOnComplete: true,
                  dialog: {
                      locked: "You're getting good with metal, but iron is for the more experienced. Come back at level 5.",
                      offer: "You've mastered bronze. Now for the real thing: iron! Smelt some iron ingots and craft yourself an iron sword. Show me you can handle it.",
                      inProgress: "Iron takes a lot of ore. Smelt it into ingots at your forge, then craft the sword at your workbench.",
                      readyToTurnIn: "An iron sword! Now THAT is a proper weapon.",
                      completed: "Magnificent! Here's 300 gold and plenty of experience. You're becoming a legend, adventurer."
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
      mainImages: ['tree.png', 'tree2.png'],   // each tree picks one of these (looks only)
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
    return BASE_COMBAT_SKILL + getBestGearModifier('combatSkill') + levelCombatBonus(getLevel());
  }
  
  function getEffectiveEndurance() {
    return BASE_ENDURANCE + getBestGearModifier('endurance') + levelEnduranceBonus(getLevel());
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
	maxZoom: 17.95,
    // North is always up: no rotating or tilting. Panning and zooming still work.
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    maxPitch: 0
  });

  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();

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

  // ---------- grass patches (decoration only: no clicks, no gameplay) ----------
  const GRASS_IMAGES = ['grass1.png', 'grass2.png', 'grass3.png', 'grass4.png'];
  const GRASS_MIN_ZOOM = 17.75;    // grass is hidden when zoomed out further than this
  const GRASS_PATCH_SLOTS = 6;     // most patches one tile can ever hold
  let grassNodes = [];

  // Which patches belong on a tile. Everything comes from the tile's position, so the grass
  // is always in the same places, and raising GRASS_AMOUNT only ADDS patches.
  function getGrassPatchesForTile(gridX, gridY) {
    const amount = Math.min(10, Math.max(1, Number(GRASS_AMOUNT) || 1));
    const chance = (amount * 0.3) / GRASS_PATCH_SLOTS;   // on average, amount x 0.3 patches per tile
    const patches = [];

    for (let k = 0; k < GRASS_PATCH_SLOTS; k++) {
      if (getItemPlacementScore(gridX, gridY, `grass_${k}_show`) >= chance) continue;

      const fx = 0.08 + 0.84 * getItemPlacementScore(gridX, gridY, `grass_${k}_x`);
      const fy = 0.08 + 0.84 * getItemPlacementScore(gridX, gridY, `grass_${k}_y`);
      const pick = getItemPlacementScore(gridX, gridY, `grass_${k}_img`);
      const image = GRASS_IMAGES[Math.min(GRASS_IMAGES.length - 1, Math.floor(pick * GRASS_IMAGES.length))];

      patches.push({ fx, fy, image });
    }

    return patches;
  }

  function spawnGrass(cells) {
    for (const cell of cells) {
      for (const patch of getGrassPatchesForTile(cell.gridX, cell.gridY)) {
        const { lat, lng } = gridToLatLng(cell.gridX + patch.fx, cell.gridY + patch.fy);

        const container = document.createElement('div');
        container.className = 'grass-marker-container';

        const img = document.createElement('img');
        img.className = 'grass-marker-icon';
        img.src = patch.image;
        img.alt = '';
        img.draggable = false;
        container.appendChild(img);

        const marker = new maplibregl.Marker({ element: container, anchor: 'center' })
          .setLngLat([lng, lat])
          .addTo(map);

        const node = { marker, element: container, broken: false };

        // Picture missing: just skip that patch.
        img.onerror = () => {
          node.broken = true;
          container.style.display = 'none';
        };

        grassNodes.push(node);
      }
    }
  }

  function clearGrass() {
    grassNodes.forEach(node => node.marker.remove());
    grassNodes = [];
  }

  function clearItems() {
    activeItemNodes.forEach(node => node.marker.remove());
    activeItemNodes = [];
    clearGrass();
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
  
  // Which picture this tile's resource uses. A type can list several `mainImages`;
  // the choice comes from the tile's position, so a given tree always looks the same.
  function pickMainImage(def, gridX, gridY) {
    const options = (def.mainImages && def.mainImages.length) ? def.mainImages : [def.mainImage];
    if (options.length === 1) return options[0];

    const r = getItemPlacementScore(gridX, gridY, `${def.id}_look`);
    return options[Math.min(options.length - 1, Math.floor(r * options.length))];
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
  
      // Decorative grass first, so it is drawn underneath everything else.
      spawnGrass(candidateCells);

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
          const mainImage = pickMainImage(def, cell.gridX, cell.gridY);
  
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
              img.src = mainImage;
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
              isCollected,
              mainImage
          };
  
          if (isCollected) {
              container.style.pointerEvents = 'none';
          }
  
          activeItemNodes.push(node);

          // If an alternate picture (e.g. tree2.png) is missing, use the normal one
          // so the resource never turns invisible.
          img.onerror = () => {
              if (mainImage !== def.mainImage && node.mainImage === mainImage) {
                  node.mainImage = def.mainImage;
                  if (img.getAttribute('src') === mainImage) img.src = def.mainImage;
              }
          };
  
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
      if (priorTarget && priorTarget === activeTarget &&
          (priorTarget.type === 'item' || priorTarget.type === 'building')) {
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
  
      showGainToast(yieldAmount, def.resourceName);
  
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

    const showGrass = zoom >= GRASS_MIN_ZOOM;
    grassNodes.forEach(node => {
      node.element.style.display = (showGrass && !node.broken) ? '' : 'none';
    });
  
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
  
      const wantedSrc = isZoomedOut ? def.zoomImage : node.mainImage;
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

  // Shared by gathering and crafting: a 5 second action that needs you to stay in range.
  const TIMED_ACTION_MS = 5000;

  function startTimedAction({ headline, lat, lng, chops = false, cancelTitle, onComplete }) {
      stopLiveDistanceUpdates();
      cancelAnyActiveCollection();

      const container = document.getElementById('plot-info');
      const progressBox = document.getElementById('collection-progress');
      const progressBar = document.getElementById('collection-progress-bar');

      progressBox.style.display = 'block';
      progressBar.style.width = '100%';

      container.innerHTML = `
        <b>${headline}</b><br/>
        <small>Stay within range for 5 seconds!</small>
      `;

      const startTime = performance.now();

      if (chops) {
          const playChopSound = () => {
              const sfx = chopSound.cloneNode();
              sfx.currentTime = 0;
              sfx.play().catch(() => {});
          };

          // Exactly 5 chops: 0s, 1s, 2s, 3s, and 4s.
          for (let i = 0; i < 5; i++) {
              collectionChopTimeouts.push(setTimeout(() => {
                  // Don't play if it was cancelled.
                  if (!collectionInterval) return;

                  playChopSound();
              }, i * 1000));
          }
      }

      // Progress bar animation.
      collectionProgressInterval = setInterval(() => {
          const elapsed = performance.now() - startTime;
          const progress = Math.min(elapsed / TIMED_ACTION_MS, 1);

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

          cancelAnyActiveCollection();
          stopLiveDistanceUpdates();
          onComplete();
      }, TIMED_ACTION_MS);

      collectionCancelCheck = setInterval(() => {
          if (!userLat || !userLng) return;

          const dist = getDistanceFeet(userLat, userLng, lat, lng);

          if (dist > INTERACTION_RADIUS_FEET) {
              cancelAnyActiveCollection();

              document.getElementById('plot-info').innerHTML = `
                <b>❌ ${cancelTitle}</b><br/>
                <small>You moved too far away!</small>
              `;
          }
      }, 300);
  }

  function startItemCollectionCountdown(node) {
      startTimedAction({
          headline: `Collecting ${node.def.name}...`,
          lat: node.lat,
          lng: node.lng,
          chops: true,
          cancelTitle: 'Collection Cancelled',
          onComplete: () => collectItem(node)
      });
  }

  
  function spawnNPC(def) {
  
      // NPC does not appear until their required quest is accepted.
      if (def.appearsOnQuest && !isQuestAccepted(def.appearsOnQuest)) {
          return;
      }
  
      if (def.appearsAfterQuest && !isQuestComplete(def.appearsAfterQuest)) return;
      if (def.appearsAtLevel && getLevel() < def.appearsAtLevel) return;

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
  
  function isBuildingBuilt(buildingId) {
      return Object.values(plotBuildings).includes(buildingId);
  }

  // A quest can ask for: gear/tools in the backpack (requiredItems), buildings the player
  // has built (requiredBuildings), and resources to hand over (requiredResources).
  function isQuestReady(quest) {
      const hasItems = (quest.requiredItems || []).every(item => playerInventory.has(item));
      const hasBuildings = (quest.requiredBuildings || []).every(isBuildingBuilt);
      const hasKills = !quest.kill || getQuestProgress(quest.questId) >= quest.kill.count;
      const hasResources = Object.entries(quest.requiredResources || {})
          .every(([res, amt]) => getResource(res) >= amt);

      return hasItems && hasBuildings && hasResources && hasKills;
  }

  function formatCosts(costs) {
      return Object.entries(costs).map(([res, amt]) => `${amt} ${res}`).join(', ');
  }

  function getObjectiveStatus(obj) {
      if (obj.flag) {
          const done = !!obj.flag();
          return { done, cur: done ? 1 : 0, max: 1, showCount: false };
      }

      const max = typeof obj.max === 'function' ? obj.max() : obj.max;
      const raw = Number(obj.count()) || 0;
      const done = raw >= max || !!(obj.doneWhen && obj.doneWhen());

      return {
          done,
          cur: done ? max : Math.min(raw, max),
          max,
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
                  const unlocked = (!npc.appearsAfterQuest || isQuestComplete(npc.appearsAfterQuest)) &&
                           (!npc.appearsAtLevel || getLevel() >= npc.appearsAtLevel);
                  const levelOk = getLevel() >= (quest.minLevel || 0);
                  const gone = npc.disabledKey && localStorage.getItem(npc.disabledKey) === 'true';
                  if (unlocked && levelOk && !gone) entries.push({ npc, quest, state: 'available' });
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
              const ready = isQuestReady(e.quest);

              html += `
                <div class="quest-entry">
                  <div class="quest-title">📜 ${e.quest.title || e.quest.questId}</div>
                  <div class="quest-giver">from ${e.npc.name}</div>
                  ${formatReward(e.quest) ? `<div class="quest-reward">Reward: ${formatReward(e.quest)}</div>` : ''}
                  <ul class="quest-objectives">${(e.quest.objectives || []).map(renderQuestObjectiveHTML).join('')}</ul>
                  ${ready ? `<div class="quest-turnin">➡ Return to ${e.npc.name} to turn in this quest.${e.quest.requiredResources ? ` (you will hand over ${formatCosts(e.quest.requiredResources)})` : ''}</div>` : ''}
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
              const ready = isQuestReady(e.quest);

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
  
      if (!isQuestAccepted(nextQuest.questId)) {
          // Not offered until you are a high enough level.
          return (nextQuest.minLevel || 0) > getLevel() ? 'none' : 'available';
      }
  
      return isQuestReady(nextQuest) ? 'ready' : 'in-progress';
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

          // Some quests are not offered until you reach a certain level.
          if (!accepted && getLevel() < (nextQuest.minLevel || 0)) {
              container.innerHTML = `
                  <b>${def.name}:</b><br/>
                  <i>${dialog.locked || `Come back when you have reached level ${nextQuest.minLevel}.`}</i><br/>
                  <small style="color:#f7f7f7;">You are level ${getLevel()}. This needs level ${nextQuest.minLevel}.</small>
              `;
              return;
          }
  
          if (!accepted) {
              container.innerHTML = `
                  <b>${def.name}:</b><br/>
                  <i>${dialog.offer}</i><br/>
                  ${formatReward(nextQuest) ? `<small>Reward: ${formatReward(nextQuest)}</small><br/>` : ''}
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
  
          const hasAllItems = isQuestReady(nextQuest);
  
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
              ${nextQuest.requiredResources ? `<small>Hand over: ${formatCosts(nextQuest.requiredResources)}</small><br/>` : ''}
              <button id="quest-turnin-btn" class="btn buy-btn" style="margin-top:6px;">Turn In Quest</button>
          `;
  
          document.getElementById('quest-turnin-btn').addEventListener('click', () => {
              if (isQuestComplete(nextQuest.questId) || !isQuestReady(nextQuest)) return;

              // Hand over any required resources.
              for (const [res, amt] of Object.entries(nextQuest.requiredResources || {})) {
                  addResource(res, -amt);
              }

              playerGold += nextQuest.rewardGold;
              updateGoldDisplay();
              localStorage.setItem("rpg_player_gold", playerGold);
              
              // Popup for Gold Reward
              if (nextQuest.rewardGold > 0) {
                  showGainToast(nextQuest.rewardGold, 'Gold', 5000);
              }
          
              // Popup(s) for Item Rewards
              for (const item of nextQuest.rewardItems) {
                  playerInventory.add(item);
                  showGainToast(1, item, 5000);
              }
              
              localStorage.setItem("rpg_player_inventory", JSON.stringify([...playerInventory]));
              updateInventoryDisplay();
          
              completeQuest(nextQuest.questId);
              
              // Spawn any quest NPCs unlocked by completing this quest.
              spawnQuestNPCsUnlockedByQuest(nextQuest.questId);

              if (nextQuest.rewardXP) {
                  markQuestXPPaid(nextQuest.questId);
                  gainXP(nextQuest.rewardXP);
              }
              
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
  
  // =====================================================================
  // LEVELS & XP
  // =====================================================================
  const MAX_LEVEL = 30;
  // Quests finished before they gave XP pay it out once, the first time the game loads.
  // Set to false to skip that.
  const BACKFILL_LEGACY_QUEST_XP = true;

  const XP_BASE = 100;   // XP to go from level 1 to 2. It doubles with every level after that.

  // What each level gives you, on top of your gear.
  const LEVEL_BONUS = {
    endurancePerLevel: 2,   // +2 Endurance (max HP) for every level after 1
    combatSkillEvery: 2     // +1 Combat Skill every 2 levels (levels 2, 4, 6, ...)
  };

  function xpForNextLevel(level) {
    return XP_BASE * Math.pow(2, level - 1);   // 100, 200, 400, 800, ...
  }

  function levelCombatBonus(level) {
    return Math.floor(level / LEVEL_BONUS.combatSkillEvery);
  }

  function levelEnduranceBonus(level) {
    return (level - 1) * LEVEL_BONUS.endurancePerLevel;
  }

  let playerLevel = null;   // null until first used (loaded from the save)
  let playerXP = 0;         // XP earned toward the NEXT level

  function loadProgress() {
    const lvl = parseInt(localStorage.getItem('rpg_player_level'), 10);
    const xp = parseInt(localStorage.getItem('rpg_player_xp'), 10);

    playerLevel = (Number.isFinite(lvl) && lvl >= 1) ? Math.min(lvl, MAX_LEVEL) : 1;
    playerXP = (Number.isFinite(xp) && xp >= 0) ? xp : 0;
  }

  function saveProgress() {
    localStorage.setItem('rpg_player_level', String(playerLevel));
    localStorage.setItem('rpg_player_xp', String(playerXP));
  }

  function getLevel() {
    if (playerLevel === null) loadProgress();
    return playerLevel;
  }

  function updateXPDisplay() {
    const level = getLevel();
    const fill = document.getElementById('xp-bar-fill');
    const text = document.getElementById('xp-bar-text');
    if (!fill || !text) return;

    if (level >= MAX_LEVEL) {
      fill.style.width = '100%';
      text.textContent = `Lv ${level} · MAX`;
      return;
    }

    const need = xpForNextLevel(level);
    fill.style.width = `${Math.min(100, (playerXP / need) * 100)}%`;
    text.textContent = `Lv ${level} · ${playerXP}/${need} XP`;
  }

  function gainXP(amount) {
    const level = getLevel();
    if (!(amount > 0) || level >= MAX_LEVEL) return;

    playerXP += amount;

    let leveledUp = false;
    while (playerLevel < MAX_LEVEL && playerXP >= xpForNextLevel(playerLevel)) {
      playerXP -= xpForNextLevel(playerLevel);
      playerLevel++;
      leveledUp = true;
    }
    if (playerLevel >= MAX_LEVEL) playerXP = 0;

    saveProgress();
    updateXPDisplay();
    showGainToast(amount, 'XP');

    if (leveledUp) onLevelUp();
  }

  function onLevelUp() {
    setPlayerHP(getMaxHP());      // a level-up fully heals you
    updateInventoryDisplay();     // stat pills + quest list
    showToast(`Level up! You are now level ${playerLevel}.`, 6000, 'levelup');

    spawnNewlyAvailableNPCs();
    updateAllQuestIndicators();
  }

  // After a level-up (or quest), bring in any NPC that was waiting for it
  // without moving the ones already on the map.
  function spawnNewlyAvailableNPCs() {
    for (const key in QUEST_NPC_DEFS) {
      const def = QUEST_NPC_DEFS[key];
      if (npcNodes[def.id]) continue;
      spawnNPC(def);   // spawnNPC itself checks quest / level / disabled rules
    }
  }

  // ---------- quest XP bookkeeping ----------
  // `rpg_quest_xp_paid` remembers which quests already paid their XP, so nothing pays twice.
  function getPaidQuestXP() {
    try {
      const list = JSON.parse(localStorage.getItem('rpg_quest_xp_paid'));
      return Array.isArray(list) ? list : [];
    } catch (err) {
      return [];
    }
  }

  function markQuestXPPaid(questId) {
    const paid = getPaidQuestXP();
    if (!paid.includes(questId)) {
      paid.push(questId);
      localStorage.setItem('rpg_quest_xp_paid', JSON.stringify(paid));
    }
  }

  // Pays XP for older quests you had already finished before quests gave XP.
  function backfillQuestXP() {
    if (!BACKFILL_LEGACY_QUEST_XP) return;

    const paid = getPaidQuestXP();
    let total = 0;
    const newlyPaid = [];

    for (const key in QUEST_NPC_DEFS) {
      for (const quest of QUEST_NPC_DEFS[key].quests) {
        if (!quest.xpBackfill || !quest.rewardXP) continue;
        if (!isQuestComplete(quest.questId) || paid.includes(quest.questId)) continue;

        total += quest.rewardXP;
        newlyPaid.push(quest.questId);
      }
    }

    if (newlyPaid.length === 0) return;

    localStorage.setItem('rpg_quest_xp_paid', JSON.stringify(paid.concat(newlyPaid)));
    showToast('Bonus XP for quests you already finished!', 6000, 'xp-backfill');
    gainXP(total);
  }

  // "75 gold · 60 XP"
  function formatReward(quest) {
    const parts = [];
    if (quest.rewardGold > 0) parts.push(`${quest.rewardGold} gold`);
    if (quest.rewardXP > 0) parts.push(`${quest.rewardXP} XP`);
    for (const item of quest.rewardItems || []) parts.push(item);
    return parts.join(' · ');
  }

  // ---------- kill counts for quests ----------
  function getQuestProgressMap() {
    try {
      return JSON.parse(localStorage.getItem('rpg_quest_progress')) || {};
    } catch (err) {
      return {};
    }
  }

  function getQuestProgress(questId) {
    return getQuestProgressMap()[questId] || 0;
  }

  // Counts a kill toward every accepted, unfinished quest that asks for it.
  function recordKill(def) {
    const progress = getQuestProgressMap();
    let changed = false;

    for (const key in QUEST_NPC_DEFS) {
      for (const quest of QUEST_NPC_DEFS[key].quests) {
        const k = quest.kill;
        if (!k || !isQuestAccepted(quest.questId) || isQuestComplete(quest.questId)) continue;

        const matches = (k.id && k.id === def.id) || (k.family && k.family === def.family);
        if (!matches) continue;

        const cur = progress[quest.questId] || 0;
        if (cur >= k.count) continue;

        progress[quest.questId] = cur + 1;
        changed = true;
        showToast(`${quest.title}: ${cur + 1}/${k.count}`, 3000, `questprog:${quest.questId}`);
      }
    }

    if (changed) {
      localStorage.setItem('rpg_quest_progress', JSON.stringify(progress));
      updateQuestUI();
      updateAllQuestIndicators();
    }
  }

  // =====================================================================
  // COMBAT: roaming monsters and turn-based fights on the map
  // =====================================================================

  const GOBLIN_MOVEMENT = {
    speedFeetPerSec: 2.5,
    wanderMinFeet: 30,
    wanderMaxFeet: 120,
    idleMinMs: 3000,
    idleMaxMs: 9000
  };

  // `image` is the picture used on the map (color/borderColor are the fallback square).
  // `drops`: each entry rolls on its own. type 'gold' or 'resource' (with a `name`).
  // Which tiers appear depends on your level (spawnMinPlayerLevel / spawnMaxPlayerLevel).
  const MONSTER_DEFS = {
    goblin: {
      id: 'goblin', family: 'goblin', name: 'Goblin', level: 1,
      image: 'goblin.png', color: '#4d7c0f', borderColor: '#1a2e05', size: 48,
      combatSkill: 9, endurance: 28, xp: 20,
      drops: [
        { type: 'gold', min: 5, max: 12, chance: 0.75 },
        { type: 'resource', name: 'Wood', min: 1, max: 3, chance: 0.5 },
        { type: 'resource', name: 'Stone', min: 1, max: 2, chance: 0.4 }
      ],
      spawnMinPlayerLevel: 1, spawnMaxPlayerLevel: 4, spawnWeight: 1,
      ...GOBLIN_MOVEMENT
    },

    goblinRaider: {
      id: 'goblinRaider', family: 'goblin', name: 'Goblin Raider', level: 3,
      image: 'goblin.png', color: '#a16207', borderColor: '#422006', size: 48,
      combatSkill: 10, endurance: 38, xp: 80,
      drops: [
        { type: 'gold', min: 12, max: 25, chance: 0.85 },
        { type: 'resource', name: 'Wood', min: 2, max: 4, chance: 0.55 },
        { type: 'resource', name: 'Stone', min: 2, max: 3, chance: 0.5 }
      ],
      spawnMinPlayerLevel: 2, spawnMaxPlayerLevel: 6, spawnWeight: 2,
      ...GOBLIN_MOVEMENT
    },

    goblinBrute: {
      id: 'goblinBrute', family: 'goblin', name: 'Goblin Brute', level: 5,
      image: 'goblin.png', color: '#991b1b', borderColor: '#450a0a', size: 48,
      combatSkill: 12, endurance: 46, xp: 320,
      drops: [
        { type: 'gold', min: 25, max: 45, chance: 0.9 },
        { type: 'resource', name: 'Wood', min: 3, max: 5, chance: 0.6 },
        { type: 'resource', name: 'Stone', min: 2, max: 4, chance: 0.55 }
      ],
      spawnMinPlayerLevel: 4, spawnMaxPlayerLevel: 99, spawnWeight: 2,
      ...GOBLIN_MOVEMENT
    }
  };

  // All the numbers you will want to tune live here.
  const COMBAT = {
    roundMs: 2500,                           // time between fight rounds
    firstRoundMs: 800,                       // delay before the first round
    fightRangeFeet: INTERACTION_RADIUS_FEET, // how close you must be to START a fight
    escapeFeet: 200,                         // get this far away to end a fight
    missChance: 0.10,
    maxDamage: 8,
    defeatHp: 1,                             // HP you are left with after losing (there is no death)
    hpRegenMs: 10000,                        // 1 HP back every this many ms (not while fighting)

    maxMonsters: 3,
    spawnMinFeet: 250,
    spawnMaxFeet: 600,
    despawnFeet: 1000,
    spawnCheckMs: 8000,
    moveTickMs: 100
  };

  const FEET_TO_M = 1 / 3.28084;

  function randRange(a, b) { return a + Math.random() * (b - a); }
  function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

  // ---------- player HP ----------
  let playerHP = null;   // null until first used (loaded from the save)
  let hpClockMs = 0;     // when the next regen point started counting

  function getMaxHP() {
    return getEffectiveEndurance();
  }

  function savePlayerHP() {
    localStorage.setItem('rpg_player_hp', String(playerHP));
    localStorage.setItem('rpg_hp_time', String(hpClockMs));
  }

  function loadPlayerHP() {
    const max = getMaxHP();
    const now = Date.now();
    const savedHP = localStorage.getItem('rpg_player_hp');

    if (savedHP === null) {
      playerHP = max;
      hpClockMs = now;
      return;
    }

    const parsed = Number(savedHP);
    let hp = Math.max(0, Math.min(Number.isFinite(parsed) ? parsed : max, max));
    let clock = Number(localStorage.getItem('rpg_hp_time')) || now;

    // Heal for the time the game was closed.
    const gained = Math.floor((now - clock) / COMBAT.hpRegenMs);
    if (gained > 0 && hp < max) {
      hp = Math.min(max, hp + gained);
      clock += gained * COMBAT.hpRegenMs;
    }
    if (hp >= max) clock = now;

    playerHP = hp;
    hpClockMs = clock;
    savePlayerHP();
  }

  function getHP() {
    if (playerHP === null) loadPlayerHP();
    return playerHP;
  }

  function setPlayerHP(value) {
    playerHP = Math.max(0, Math.min(Math.round(value), getMaxHP()));
    hpClockMs = Date.now();
    savePlayerHP();
    updateHPDisplay();
  }

  function updateHPDisplay() {
    const el = document.getElementById('stat-endurance');
    if (el) el.innerText = `${getHP()}/${getMaxHP()}`;
  }

  function regenTick() {
    if (activeFight) return;

    const max = getMaxHP();
    const hp = getHP();

    if (hp >= max) {
      hpClockMs = Date.now();
      return;
    }

    const gained = Math.floor((Date.now() - hpClockMs) / COMBAT.hpRegenMs);
    if (gained > 0) {
      playerHP = Math.min(max, hp + gained);
      hpClockMs += gained * COMBAT.hpRegenMs;
      if (playerHP >= max) hpClockMs = Date.now();
      savePlayerHP();
      updateHPDisplay();
    }
  }

  // ---------- damage ----------
  // Every 2 points of skill advantage is worth +1 damage. Hits do at least 1.
  function rollDamage(attackSkill, defendSkill) {
    if (Math.random() < COMBAT.missChance) return 0;

    const base = 1 + Math.floor(Math.random() * 3);      // 1-3
    const bonus = (attackSkill - defendSkill) * 0.5;

    return Math.min(COMBAT.maxDamage, Math.max(1, Math.round(base + bonus)));
  }

  // Floating text on the map at any position (damage numbers).
  function showFloatingPopupAt(lat, lng, text, extraClass = '', offsetY = -30) {
    const wrapper = document.createElement('div');
    wrapper.style.pointerEvents = 'none';

    const el = document.createElement('div');
    el.className = 'floating-popup-text' + (extraClass ? ' ' + extraClass : '');
    el.innerText = text;
    wrapper.appendChild(el);

    const popupMarker = new maplibregl.Marker({
      element: wrapper,
      anchor: 'bottom',
      offset: [0, offsetY]
    })
      .setLngLat([lng, lat])
      .addTo(map);

    setTimeout(() => popupMarker.remove(), 1200);
  }

  // ---------- monsters on the map ----------
  let monsterNodes = [];
  let monsterMoveInterval = null;
  let monsterSpawnInterval = null;
  let lastMoveTick = 0;
  let combatInitialized = false;

  // Picks a monster type that suits your level (weighted by spawnWeight).
  function pickMonsterDef() {
    const lvl = getLevel();
    const pool = Object.values(MONSTER_DEFS)
      .filter(d => lvl >= d.spawnMinPlayerLevel && lvl <= d.spawnMaxPlayerLevel);

    if (pool.length === 0) return MONSTER_DEFS.goblin;

    const total = pool.reduce((sum, d) => sum + d.spawnWeight, 0);
    let roll = Math.random() * total;

    for (const d of pool) {
      roll -= d.spawnWeight;
      if (roll < 0) return d;
    }
    return pool[pool.length - 1];
  }

  function createMonsterElement(def) {
    const container = document.createElement('div');
    container.className = 'monster-marker-container';

    const wrap = document.createElement('div');
    wrap.className = 'monster-wrap';

    const hpBar = document.createElement('div');
    hpBar.className = 'monster-hp';
    const hpFill = document.createElement('div');
    hpBar.appendChild(hpFill);

    const makeSquare = () => {
      const sq = document.createElement('div');
      sq.className = 'monster-body';
      sq.style.background = def.color;
      sq.style.borderColor = def.borderColor;
      sq.style.width = `${def.size}px`;
      sq.style.height = `${def.size}px`;
      return sq;
    };

    let body;
    if (def.image) {
      body = document.createElement('img');
      body.src = def.image;
      body.className = 'monster-img';
      body.draggable = false;
      body.style.width = `${def.size}px`;
      body.style.height = `${def.size}px`;
      // If the picture can't be loaded, show the colored square instead.
      body.onerror = () => {
        if (body.parentNode) wrap.replaceChild(makeSquare(), body);
      };
    } else {
      body = makeSquare();
    }

    const badge = document.createElement('div');
    badge.className = 'monster-level';
    badge.textContent = `Lv ${def.level}`;

    wrap.appendChild(hpBar);
    wrap.appendChild(body);
    wrap.appendChild(badge);
    container.appendChild(wrap);

    return { container, hpBar, hpFill };
  }

  function updateMonsterHpBar(node) {
    const show = node.engaged || node.hp < node.def.endurance;
    node.hpBar.classList.toggle('show', show);
    node.hpFill.style.width = `${Math.max(0, (node.hp / node.def.endurance) * 100)}%`;
  }

  function spawnMonster(def = pickMonsterDef()) {
    if (!userLat || !userLng) return null;

    const p = projectLatLng(userLat, userLng);
    const angle = Math.random() * Math.PI * 2;
    const dist = randRange(COMBAT.spawnMinFeet, COMBAT.spawnMaxFeet) * FEET_TO_M;
    const x = p.x + Math.cos(angle) * dist;
    const y = p.y + Math.sin(angle) * dist;
    const ll = unprojectXY(x, y);

    const parts = createMonsterElement(def);

    const marker = new maplibregl.Marker({ element: parts.container, anchor: 'center' })
      .setLngLat([ll.lng, ll.lat])
      .addTo(map);

    const node = {
      id: `monster_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      def,
      x, y,
      lat: ll.lat,
      lng: ll.lng,
      hp: def.endurance,
      state: 'idle',
      idleUntil: Date.now() + randRange(def.idleMinMs, def.idleMaxMs),
      target: null,
      engaged: false,
      marker,
      element: parts.container,
      hpBar: parts.hpBar,
      hpFill: parts.hpFill
    };

    updateMonsterHpBar(node);
    monsterNodes.push(node);

    parts.container.addEventListener('click', (e) => {
      e.stopPropagation();
      cancelAnyActiveCollection();
      clearSelectedPlot();
      closeBackpackIfOpen(false);
      ensureUIPanelVisible();
      renderMonsterCard(node);
    });

    return node;
  }

  function removeMonster(node) {
    node.marker.remove();

    const idx = monsterNodes.indexOf(node);
    if (idx !== -1) monsterNodes.splice(idx, 1);

    if (activeTarget && activeTarget.node === node) {
      stopLiveDistanceUpdates();
      renderSelectedPlotCard();
    }
  }

  // Monsters wander: walk smoothly to a nearby spot, stand still for a while, repeat.
  function moveMonsters() {
    const now = Date.now();
    const dt = Math.min(0.5, (now - (lastMoveTick || now)) / 1000);
    lastMoveTick = now;

    for (let i = monsterNodes.length - 1; i >= 0; i--) {
      const node = monsterNodes[i];

      // Far from the player: remove it (a new one will spawn nearby).
      if (userLat && userLng && !node.engaged &&
          getDistanceFeet(userLat, userLng, node.lat, node.lng) > COMBAT.despawnFeet) {
        removeMonster(node);
        continue;
      }

      if (node.engaged) continue; // fighting: stand still

      const def = node.def;

      if (node.state === 'idle') {
        if (now >= node.idleUntil) {
          const angle = Math.random() * Math.PI * 2;
          const d = randRange(def.wanderMinFeet, def.wanderMaxFeet) * FEET_TO_M;
          node.target = { x: node.x + Math.cos(angle) * d, y: node.y + Math.sin(angle) * d };
          node.state = 'walking';
        }
        continue;
      }

      const dx = node.target.x - node.x;
      const dy = node.target.y - node.y;
      const dist = Math.hypot(dx, dy);
      const step = def.speedFeetPerSec * FEET_TO_M * dt;

      if (dist <= step) {
        node.x = node.target.x;
        node.y = node.target.y;
        node.state = 'idle';
        node.idleUntil = now + randRange(def.idleMinMs, def.idleMaxMs);
      } else {
        node.x += (dx / dist) * step;
        node.y += (dy / dist) * step;
      }

      const ll = unprojectXY(node.x, node.y);
      node.lat = ll.lat;
      node.lng = ll.lng;
      node.marker.setLngLat([ll.lng, ll.lat]);
    }
  }

  function renderMonsterCard(node) {
    if (activeFight) {
      if (activeFight.node === node) {
        stopLiveDistanceUpdates();
        renderFightCard(true);
      } else {
        showToast('Finish your current fight first!', 2500, 'fight-busy');
      }
      return;
    }

    const container = document.getElementById('plot-info');

    startLiveDistanceUpdates('monster', node, dist => {
      const def = node.def;
      const inRange = Number(dist) <= COMBAT.fightRangeFeet;
      const stats = `<small>Lv ${def.level} · Combat Skill ${def.combatSkill} · Endurance ${node.hp}/${def.endurance} · ${def.xp} XP</small><br/>`;

      if (!inRange) {
        container.innerHTML = `
          <b>${def.name}</b><br/>
          ${stats}
          <b>Distance:</b> ${dist} ft away<br/>
          <small style="color:#f7f7f7;">Walk within ${COMBAT.fightRangeFeet} ft to fight.</small>
        `;
        return;
      }

      const hurt = getHP() <= getMaxHP() * 0.25
        ? `<small style="color:#fca5a5;">⚠️ You are hurt (${getHP()}/${getMaxHP()} HP). Rest first?</small><br/>`
        : '';

      container.innerHTML = `
        <b>${def.name}</b><br/>
        ${stats}
        <b>✅ In range</b><br/>
        ${hurt}
        <button id="fight-btn" class="btn buy-btn" style="margin-top:6px;">⚔️ Fight</button>
      `;

      document.getElementById('fight-btn').addEventListener('click', () => startFight(node));
    });
  }

  // ---------- fights ----------
  let activeFight = null;   // { node, round, log, nextRoundAt, cardNode }
  let fightInterval = null;

  function startFight(node) {
    if (activeFight || !monsterNodes.includes(node)) return;
    if (getHP() <= 0) return;

    if (userLat && userLng &&
        getDistanceFeet(userLat, userLng, node.lat, node.lng) > COMBAT.fightRangeFeet) {
      return;
    }

    stopLiveDistanceUpdates();
    cancelAnyActiveCollection();

    node.engaged = true;
    node.element.classList.add('engaged');
    updateMonsterHpBar(node);

    activeFight = {
      node,
      round: 0,
      log: ['The fight begins!'],
      nextRoundAt: Date.now() + COMBAT.firstRoundMs,
      cardNode: null
    };

    fightInterval = setInterval(fightTick, 250);
    renderFightCard(true);
  }

  function fightTick() {
    const f = activeFight;
    if (!f) return;

    // Running away: get far enough from the monster and the fight ends.
    if (userLat && userLng) {
      const d = getDistanceFeet(userLat, userLng, f.node.lat, f.node.lng);
      if (d > COMBAT.escapeFeet) {
        endFight('escaped');
        return;
      }
    }

    const now = Date.now();

    // If the phone was asleep, don't replay the rounds it missed.
    if (now - f.nextRoundAt > COMBAT.roundMs * 2) f.nextRoundAt = now;

    if (now >= f.nextRoundAt) {
      resolveFightRound();
      if (!activeFight) return;
      f.nextRoundAt += COMBAT.roundMs;
    }

    renderFightCard(false);
  }

  function resolveFightRound() {
    const f = activeFight;
    const node = f.node;
    const def = node.def;

    f.round++;

    // You swing first.
    const dealt = rollDamage(getEffectiveCombatSkill(), def.combatSkill);
    node.hp = Math.max(0, node.hp - dealt);
    updateMonsterHpBar(node);

    if (dealt > 0) {
      showFloatingPopupAt(node.lat, node.lng, `-${dealt}`, 'dmg-dealt');
      f.log.push(`You hit the ${def.name} for ${dealt}.`);
    } else {
      showFloatingPopupAt(node.lat, node.lng, 'Miss', 'dmg-miss');
      f.log.push('You miss!');
    }

    if (node.hp <= 0) {
      endFight('victory');
      return;
    }

    // Then it swings back.
    const taken = rollDamage(def.combatSkill, getEffectiveCombatSkill());

    if (taken > 0) {
      playerHP = Math.max(0, getHP() - taken);
      savePlayerHP();
      updateHPDisplay();
      showFloatingPopupAt(userLat, userLng, `-${taken}`, 'dmg-taken', -40);
      f.log.push(`The ${def.name} hits you for ${taken}.`);
    } else {
      f.log.push(`The ${def.name} misses!`);
    }

    if (f.log.length > 4) f.log.splice(0, f.log.length - 4);

    if (getHP() <= 0) endFight('defeat');
  }

  function renderFightCard(force = false) {
    const f = activeFight;
    if (!f) return;

    const box = document.getElementById('plot-info');

    // Don't overwrite a different card the player has opened since.
    if (!force && f.cardNode && box.firstChild !== f.cardNode) return;

    const def = f.node.def;
    const hp = getHP();
    const maxHp = getMaxHP();
    const hpPct = Math.max(0, (hp / maxHp) * 100);
    const foePct = Math.max(0, (f.node.hp / def.endurance) * 100);
    const secs = Math.max(0, Math.ceil((f.nextRoundAt - Date.now()) / 1000));
    const dist = (userLat && userLng)
      ? Math.round(getDistanceFeet(userLat, userLng, f.node.lat, f.node.lng))
      : 0;

    box.innerHTML = `
      <b>⚔️ Fighting the ${def.name}</b><br/>
      <div class="fight-row"><span>You</span><span>${hp}/${maxHp}</span></div>
      <div class="fight-bar"><div class="fight-bar-fill you" style="width:${hpPct}%"></div></div>
      <div class="fight-row"><span>${def.name}</span><span>${f.node.hp}/${def.endurance}</span></div>
      <div class="fight-bar"><div class="fight-bar-fill foe" style="width:${foePct}%"></div></div>
      <div class="fight-log">${f.log.join('<br/>')}</div>
      <div class="fight-run">Next round in ${secs}s. To run away, walk until you are ${COMBAT.escapeFeet} ft from it (now ${dist} ft).</div>
    `;

    f.cardNode = box.firstChild;
  }

  function showFightResult(f, title, text) {
    const box = document.getElementById('plot-info');
    if (f.cardNode && box.firstChild !== f.cardNode) return; // player is looking at something else
    box.innerHTML = `<b>${title}</b><br/>${text}`;
  }

  // What a monster leaves behind: each drop entry rolls on its own.
  function rollDrops(def) {
    const found = [];

    for (const d of def.drops || []) {
      if (Math.random() >= d.chance) continue;

      found.push({
        type: d.type,
        name: d.type === 'gold' ? 'Gold' : d.name,
        amount: randInt(d.min, d.max)
      });
    }

    return found;
  }

  function applyDrop(drop) {
    if (drop.type === 'gold') {
      playerGold += drop.amount;
      localStorage.setItem('rpg_player_gold', playerGold);
      updateGoldDisplay();
    } else {
      addResource(drop.name, drop.amount);
      updateInventoryDisplay();
    }

    showGainToast(drop.amount, drop.name);
  }

  function endFight(result) {
    const f = activeFight;
    if (!f) return;

    clearInterval(fightInterval);
    fightInterval = null;
    activeFight = null;

    const node = f.node;
    const def = node.def;

    node.engaged = false;
    node.element.classList.remove('engaged');

    if (result === 'victory') {
      const drops = rollDrops(def);

      setPlayerHP(getHP());   // restarts the healing clock
      removeMonster(node);

      showToast('Victory!', 3500, 'victory');
      drops.forEach(applyDrop);
      recordKill(def);
      gainXP(def.xp);         // last, so a level-up message is the newest line

      const dropText = drops.length
        ? ` It dropped ${drops.map(d => `${d.amount} ${d.name.toLowerCase()}`).join(', ')}.`
        : '';
      showFightResult(f, '🏆 Victory!', `You defeated the ${def.name} and earned ${def.xp} XP.${dropText}`);
      return;
    }

    // The monster recovers if you leave or beat you.
    node.hp = def.endurance;
    updateMonsterHpBar(node);

    if (result === 'defeat') {
      // There is no death: you just don't win, so no XP and no drops.
      setPlayerHP(COMBAT.defeatHp);

      showToast('You were beaten. No XP this time.', 5000, 'defeat');
      showFightResult(f, '💫 Beaten', `The ${def.name} got the better of you. No XP this time. Rest and try again.`);
      return;
    }

    // escaped
    setPlayerHP(getHP());
    showToast('You got away!', 3000, 'escaped');
    showFightResult(f, '🏃 You got away', `The ${def.name} loses interest and wanders off.`);
  }

  function initCombat() {
    if (combatInitialized) return;
    combatInitialized = true;

    updateHPDisplay();
    updateXPDisplay();

    for (let i = 0; i < 2; i++) spawnMonster();

    monsterMoveInterval = setInterval(moveMonsters, COMBAT.moveTickMs);
    monsterSpawnInterval = setInterval(() => {
      if (monsterNodes.length < COMBAT.maxMonsters) spawnMonster();
    }, COMBAT.spawnCheckMs);

    setInterval(regenTick, 1000);

    backfillQuestXP();
  }

  // ---------- Messages at the bottom of the screen ----------
  // They stack (newest at the bottom), so several can show at once without overlapping.
  const MAX_TOASTS = 4;
  let toastStack = null;
  let activeToasts = [];   // { el, key, timer, total }

  function getToastStack() {
    if (!toastStack) {
      toastStack = document.createElement('div');
      toastStack.id = 'toast-stack';
      document.body.appendChild(toastStack);
    }
    return toastStack;
  }

  function removeToast(rec) {
    clearTimeout(rec.timer);

    const i = activeToasts.indexOf(rec);
    if (i !== -1) activeToasts.splice(i, 1);

    rec.el.style.opacity = '0';
    setTimeout(() => rec.el.remove(), 250);
  }

  // `key` (optional): a message with the same key replaces the one already showing
  // instead of adding another line.
  function showToast(message, ms = 4000, key = null) {
    let rec = key ? activeToasts.find(t => t.key === key) : null;

    if (rec) {
      rec.el.textContent = message;
      rec.el.style.opacity = '1';
      clearTimeout(rec.timer);
    } else {
      const el = document.createElement('div');
      el.className = 'game-toast'; // styled in styles.css
      el.textContent = message;
      getToastStack().appendChild(el);

      rec = { el, key, timer: null, total: 0 };
      activeToasts.push(rec);

      while (activeToasts.length > MAX_TOASTS) removeToast(activeToasts[0]);
    }

    rec.timer = setTimeout(() => removeToast(rec), ms);
    return rec;
  }

  // "Collected +5 Gold!" Picking up more of the same thing while the message is
  // still showing adds to it, so a trail of coins is one line, not many.
  function showGainToast(amount, name, ms = 3000) {
    const key = `gain:${name}`;
    const existing = activeToasts.find(t => t.key === key);
    const total = (existing ? existing.total : 0) + amount;

    const rec = showToast(`Collected +${total} ${name}!`, ms, key);
    rec.total = total;
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
              const couldAffordPlot = playerGold >= PLOT_PRICE;

              playerGold += node.value;
              localStorage.setItem('rpg_player_gold', playerGold);
              updateGoldDisplay();
              showGainToast(node.value, 'Gold');

              node.marker.remove();

              const idx = activeGoldNodes.indexOf(node);
              if (idx !== -1) activeGoldNodes.splice(idx, 1);

              // Leave the open card alone, unless this coin changes what it shows:
              if (activeTarget && activeTarget.node === node) {
                  // it was this coin's own card
                  stopLiveDistanceUpdates();
                  renderSelectedPlotCard();
              } else if (selectedPlotId && !claimedPlotIds.has(selectedPlotId) &&
                         !couldAffordPlot && playerGold >= PLOT_PRICE) {
                  // the Buy Plot button just became affordable
                  renderSelectedPlotCard();
              }
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

          const dist = getDistanceFeet(userLat, userLng, goldNode.lat, goldNode.lng);

          // Close enough: just grab it, without touching whatever is open.
          if (dist <= INTERACTION_RADIUS_FEET) {
              collectCoin(goldNode);
              return;
          }

          cancelAnyActiveCollection();
          clearSelectedPlot();
          closeBackpackIfOpen(false);
          ensureUIPanelVisible();
      
          const container = document.getElementById('plot-info');
      
          startLiveDistanceUpdates("coin", goldNode, (distRounded) => {
              const distNow = Number(distRounded);
              const valueLabel = coinValue === 5 ? '🌟 RARE GOLD CACHE' : '🪙 Gold Coin';
      
              if (distNow <= INTERACTION_RADIUS_FEET) {
                  collectCoin(goldNode);
                  stopLiveDistanceUpdates();
                  renderSelectedPlotCard();
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
      updateHPDisplay();
      updateXPDisplay();
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
  
  function recipeIsAffordable(recipe) {
    return Object.entries(recipe.costs).every(([res, amt]) => getResource(res) >= amt);
  }

  // Tapping Craft / Smelt starts a 5 second timer. Stay near the building until it finishes.
  function craftItem(recipe, buildingNode) {
    const isGear = recipe.type !== 'resource';

    if (isGear && playerInventory.has(recipe.id)) return;
    if (!recipeIsAffordable(recipe)) return;

    const verb = isGear ? 'Crafting' : 'Smelting';

    startTimedAction({
      headline: `${verb} ${recipe.name}...`,
      lat: buildingNode.lat,
      lng: buildingNode.lng,
      cancelTitle: `${verb} Cancelled`,
      onComplete: () => finishCrafting(recipe, buildingNode)
    });
  }

  function finishCrafting(recipe, buildingNode) {
    const isGear = recipe.type !== 'resource';

    // Check again: nothing is spent until the 5 seconds are up.
    if ((isGear && playerInventory.has(recipe.id)) || !recipeIsAffordable(recipe)) {
      showToast('Not enough resources!', 3000, 'craft-fail');
      renderBuildingCard(buildingNode);
      return;
    }

    for (const [res, amt] of Object.entries(recipe.costs)) {
      addResource(res, -amt);
    }

    if (isGear) {
      playerInventory.add(recipe.id);
      localStorage.setItem("rpg_player_inventory", JSON.stringify([...playerInventory]));
      showToast(`Crafted ${recipe.name}!`, 4500);
    } else {
      addResource(recipe.id, recipe.yieldAmount);
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
      show('menu-panel', which === 'menu');
      if (which !== 'menu') disarmStartOver();

      const buttonsVisible = which === null;
      show('toggle-ui-btn', buttonsVisible);
      show('inventory-btn', buttonsVisible);
      show('quests-btn', buttonsVisible);
      show('menu-btn', buttonsVisible);
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
      if (isPanelOpen('inventory-panel') || isPanelOpen('quests-panel') || isPanelOpen('menu-panel')) {
          setPanel(restoreButton ? null : 'explorer');
      }
  }

  
  function clearSelectedPlot() {
      selectedPlotId = null;
      refreshMapGrid();
  }

  // UI & GEOLOCATION EVENT LISTENERS
  // ===== MENU: EXPORT / IMPORT / START OVER =====
  // Everything the game saves lives in localStorage under keys that start with "rpg_".
  const SAVE_PREFIX = 'rpg_';
  const LAST_EXPORT_KEY = 'rpg_last_export';
  const NEVER_EXPORTED_KEYS = [LAST_EXPORT_KEY];

  function getGameStorageKeys() {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(SAVE_PREFIX)) keys.push(k);
      }
      return keys;
  }

  function readGameStorage() {
      const data = {};
      for (const k of getGameStorageKeys()) data[k] = localStorage.getItem(k);
      return data;
  }

  function clearGameStorage(keep = []) {
      for (const k of getGameStorageKeys()) {
          if (!keep.includes(k)) localStorage.removeItem(k);
      }
  }

  function collectSave() {
      const data = readGameStorage();
      for (const k of NEVER_EXPORTED_KEYS) delete data[k];

      return {
          game: 'wayfarer',
          saveVersion: 1,
          exportedAt: new Date().toISOString(),
          data
      };
  }

  function updateLastExportText() {
      const el = document.getElementById('last-export-text');
      if (!el) return;

      const iso = localStorage.getItem(LAST_EXPORT_KEY);
      const d = iso ? new Date(iso) : null;

      el.textContent = (d && !isNaN(d))
          ? `Last export: ${d.toLocaleString()}`
          : 'Last export: never';
  }

  async function exportSave() {
      const json = JSON.stringify(collectSave(), null, 2);
      const filename = `wayfarer-save-${new Date().toISOString().slice(0, 10)}.json`;

      // Phones: the share sheet lets you save to Files / Drive or send it to yourself.
      try {
          if (typeof File === 'function' && navigator.canShare) {
              const file = new File([json], filename, { type: 'application/json' });

              if (navigator.canShare({ files: [file] })) {
                  await navigator.share({ files: [file], title: 'Wayfarer save' });
                  localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString());
                  updateLastExportText();
                  showToast('Save exported', 3000);
                  return;
              }
          }
      } catch (err) {
          if (err && err.name === 'AbortError') return; // player closed the share sheet
          // anything else: fall through to a normal download
      }

      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);

      localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString());
      updateLastExportText();
      showToast('Save downloaded', 3000);
  }

  function isValidSave(obj) {
      if (!obj || typeof obj !== 'object' || obj.game !== 'wayfarer') return false;

      const d = obj.data;
      if (!d || typeof d !== 'object' || Array.isArray(d)) return false;

      const entries = Object.entries(d);
      if (entries.length === 0 || entries.length > 5000) return false;

      return entries.every(([k, v]) =>
          k.startsWith(SAVE_PREFIX) && k.length <= 200 &&
          typeof v === 'string' && v.length <= 2000000
      );
  }

  async function importSaveFromFile(file) {
      let obj;

      try {
          obj = JSON.parse(await file.text());
      } catch (err) {
          showToast('That file is not a valid save.', 4000);
          return;
      }

      if (!isValidSave(obj)) {
          showToast('That file is not a Wayfarer save.', 4000);
          return;
      }

      const d = obj.exportedAt ? new Date(obj.exportedAt) : null;
      const when = (d && !isNaN(d)) ? d.toLocaleString() : 'unknown date';
      const gold = obj.data['rpg_player_gold'] || '0';

      if (!confirm(`Replace your current progress with this save?\n\nSaved: ${when}\nGold: ${gold}\n\nThis cannot be undone.`)) {
          return;
      }

      const backup = readGameStorage();

      try {
          clearGameStorage(NEVER_EXPORTED_KEYS);
          for (const [k, v] of Object.entries(obj.data)) {
              if (NEVER_EXPORTED_KEYS.includes(k)) continue;
              localStorage.setItem(k, v);
          }
      } catch (err) {
          // Something went wrong part-way (e.g. storage full): put the old progress back.
          clearGameStorage();
          for (const [k, v] of Object.entries(backup)) localStorage.setItem(k, v);
          showToast('Import failed. Your progress was not changed.', 5000);
          return;
      }

      window.location.reload();
  }

  let startOverArmed = false;
  let startOverTimer = null;

  function disarmStartOver() {
      startOverArmed = false;
      clearTimeout(startOverTimer);
      startOverTimer = null;

      const btn = document.getElementById('start-over-btn');
      if (btn) {
          btn.textContent = 'Start Over';
          btn.classList.remove('armed');
      }
  }

  document.getElementById('export-save-btn').addEventListener('click', exportSave);

  document.getElementById('import-save-btn').addEventListener('click', () => {
      document.getElementById('import-file-input').click();
  });

  document.getElementById('import-file-input').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (file) importSaveFromFile(file);
  });

  // Two taps: the first arms the button, the second (within 5 seconds) erases everything.
  document.getElementById('start-over-btn').addEventListener('click', () => {
      const btn = document.getElementById('start-over-btn');

      if (!startOverArmed) {
          startOverArmed = true;
          btn.textContent = 'Tap again to erase EVERYTHING';
          btn.classList.add('armed');
          startOverTimer = setTimeout(disarmStartOver, 5000);
          return;
      }

      clearGameStorage([LAST_EXPORT_KEY, 'rpg_show_grid']);
      window.location.reload();
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

  document.getElementById('menu-btn').addEventListener('click', () => {
      updateLastExportText();
      switchPanel('menu');
  });
  document.getElementById('close-menu-btn').addEventListener('click', () => switchPanel(null));
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
        initCombat();
		
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
      if (autoCenterEnabled) {
        autoCenterEnabled = false;
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

    // --- GRID SHOW / HIDE ---
    // Hides the grid lines (unowned and owned). The red outline of a tapped square stays visible,
    // and squares can still be tapped while the grid is hidden.
    const GRID_LINE_LAYERS = ['plots-outline', 'plots-claimed-outline'];
    const gridToggleBtn = document.getElementById('grid-toggle-btn');

    function applyGridVisibility() {
      for (const id of GRID_LINE_LAYERS) {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, 'visibility', gridVisible ? 'visible' : 'none');
        }
      }

      if (gridToggleBtn) gridToggleBtn.classList.toggle('active', gridVisible);
    }

    if (gridToggleBtn) {
      gridToggleBtn.addEventListener('click', () => {
        gridVisible = !gridVisible;

        try {
          localStorage.setItem('rpg_show_grid', gridVisible ? 'true' : 'false');
        } catch (err) {}

        applyGridVisibility();
        showToast(gridVisible ? 'Grid shown' : 'Grid hidden', 1500, 'grid');
      });
    }

    applyGridVisibility();


    if (userLat && userLng) {
      refreshMapGrid();
      spawnItems();
    }
  });