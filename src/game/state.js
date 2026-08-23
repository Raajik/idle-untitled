// Central game state. One object, mutated by game logic, read by the UI.

import { DAMAGE_TYPES } from '../data/regions.js';
import { freshBuildings } from '../data/buildings.js';
import { EQUIP_SLOTS } from '../data/items.js';

export const SAVE_VERSION = 5;

function freshEquipment() {
  const e = {};
  for (const slot of EQUIP_SLOTS) e[slot] = null;
  return e;
}

function freshSkill() {
  return { rank: 0, xp: 0 };
}

function freshResistance() {
  const r = {};
  for (const t of DAMAGE_TYPES) r[t] = freshSkill();
  return r;
}

// Keys match skills.js OFFENSE_SKILLS; duplicated here (rather than imported) to
// avoid a state.js <-> skills.js import cycle (skills.js needs addLog from here).
const OFFENSE_SKILL_KEYS = ['unarmed', 'sword', 'spear', 'axe', 'mace', 'life', 'war', 'void', 'bow', 'crossbow'];
const GATHERING_SKILL_KEYS = ['mining', 'foraging', 'woodcutting', 'fishing', 'skinning'];

function freshOffense() {
  const o = {};
  for (const k of OFFENSE_SKILL_KEYS) o[k] = freshSkill();
  return o;
}

function freshGathering() {
  const g = {};
  for (const k of GATHERING_SKILL_KEYS) g[k] = freshSkill();
  return g;
}

export function createInitialState() {
  return {
    version: SAVE_VERSION,
    pyreals: 0,
    onboarding: {
      step: 'name', // 'name' -> 'seen-lifestone' -> ['alcott-explains' if 'no'] -> 'done'
      tutorialPending: false, // set once Alcott points you at Holtburg; consumed on first arrival
    },
    hero: {
      name: '',
      level: 1,
      // Everyone starts at 1 in everything — see ATTRIBUTE_BASE in game/skills.js,
      // which anchors the attribute XP curve to the same number.
      str: 1,
      end: 1,
      coord: 1,
      quick: 1,
      focus: 1,
      self: 1,
      attrXp: { str: 0, end: 0, coord: 0, quick: 0, focus: 0, self: 0 }, // progress toward each attribute's next point
      // null = "not filled in yet"; the first combat tick sets these to their maxima.
      // Deliberately not 0: attacks spend whole points of Stamina, so a hero can land
      // on exactly 0, and a 0-means-uninitialized sentinel would hand them a free refill.
      hp: null,
      stamina: null,
      mana: null,
      // Asheron's Call's death penalty (see game/vitae.js): a percentage off the
      // hero's body, arriving in 5-point lumps and leaving one point at a time
      // as `xpRemaining` experience is earned.
      vitae: { pct: 0, xpRemaining: 0 },
      knownSpells: [], // self-buff spell ids (see data/buffSpells.js); Alcott teaches the first three
      // combat timers (each monster carries its own; see game/combat.js)
      attackTimer: 0,
      respawnTimer: 0,
      dead: false,
      combat: {
        mode: 'melee', // 'melee' | 'archery' | 'magic' | 'void'
        meleeStance: 0, // 0-4: fastest/lightest to the 4s heavy bleed swing
        archeryStance: 0, // 0-4: fastest/least accurate to slowest/most accurate
        magicSpell: 'arc', // 'arc' | 'volley' | 'streak'
        voidSpell: 'arc', // 'arc' | 'corruption' | 'streak' (see VOID_SPELLS)
        warElement: 'auto', // 'auto' or a member of CASTABLE_ELEMENTS (see data/elements.js)
      },
      skills: {
        athletics: freshSkill(), // renamed from run; also powers Jump/shortcuts
        dodge: freshSkill(),
        block: freshSkill(),
        parry: freshSkill(),
        magicResistance: freshSkill(), // avoids magic-based attacks only (see isMagicDamageType)
        resistance: freshResistance(),
        offense: freshOffense(),
        gathering: freshGathering(),
        tinkering: freshSkill(),
        salvaging: freshSkill(), // scales how much material breaking an item down returns
        lifestone: { recall: freshSkill() },
      },
    },
    location: { regionId: null, poiId: null }, // null,null = still on the road to Holtburg
    travel: null, // { kind: 'region'|'poi', id, remaining, duration }
    progress: {
      unlockedRegions: [], // arrived at
      visitedPois: [],
      wave: 1, // current wave at this POI, 1..WAVES_PER_POI (resets on travel away)
      waveMonstersLeft: 0, // monsters still standing in the current wave; 0 = roll a new wave
      poiClears: {}, // poiId -> how many full clears (10 waves) you've done there
      totalClears: 0,
      timeInPoi: 0,
      killsInPoi: 0,
      totalKills: 0,
      totalPyrealsEarned: 0,
      totalXpEarned: 0,
      totalDrops: 0,
      aetheriaSlots: 0,
      firstDeathHandled: false, // whether Alcott's "death teaches lessons" beat has fired
      // Where you respawn. You start bound to the stone you woke beside on the road
      // (regionId null = not in any region yet), a full 3-minute walk short of
      // Holtburg — growing the budding Lifestone there moves this to Holtburg's hub.
      boundLifestone: { regionId: null, poiId: null },
      lifestoneGrowth: {}, // poiId -> 0..LIFESTONE_GROWTH_REQUIRED for each budding Lifestone
      quests: {}, // poiId -> 'active' | 'done'; drives the ! marker on a POI tile
      recallUnlocked: false,
      tookTownTour: false, // the Town Hall tour, which is what opens the General Store
      autoHealUnlocked: false, // set by receiving a Healing Kit
      alchemyUnlocked: false, // set by drinking your first potion
      recallCooldown: 0, // seconds remaining until Recall can be used again
      jumpCooldown: 0, // seconds remaining until a shortcut Jump can be used again
      rotCooldown: 0, // seconds until Corruption can be cast again (see data/combatStances.js)
    },
    // Everything currently engaged, front of the list first — the hero swings at
    // that one while all of them swing back. Up to MAX_SWARM (see game/waves.js).
    monsters: [],
    equipment: freshEquipment(), // one entry per instance in data/items.js EQUIP_SLOTS
    inventory: [],
    achievements: [], // earned achievement ids (see data/achievements.js); permanent, survives Enlightenment
    materials: {}, // materialId -> count, no cap
    trophies: {}, // trophyId -> count (see data/trophies.js); quest and turn-in stock
    consumables: {}, // consumableId -> charges remaining (see data/consumables.js)
    buffs: [], // running timed effects: { id, name, remaining, effect } (see game/buffs.js)
    buildings: freshBuildings(), // buildingId -> { level, stock, rotatesAt }; only the General Store starts open
    training: { atk: 0, hp: 0, pyreals: 0 },
    enlightenment: {
      souls: 0,
      count: 0,
      upgrades: {}, // id -> rank
    },
    settings: {
      autoEquip: true, // charter: QoL free from the start
      autoHeal: false, // spend Stamina and Healing Kit charges to stay standing
      autoCastSpells: [], // self-buff spell ids kept up automatically
      autoDrink: [], // consumable ids re-drunk when their buff lapses
      autoSalvage: 'off', // 'off' or a rarity name: drops at or below it are broken down on sight
    },
    log: [], // recent combat log lines (newest last)
    ui: {
      seenUnlocks: [], // ids the player has been toasted about
      activeTab: 'battle',
      activeBuilding: null, // which building panel is expanded in the Battle tab's town view
      activeShopTab: 'weapons', // which shelf of an open shop you're looking at
      activeSkillTab: 'offense', // which group of skills the Skills tab is showing
      activePoiTier: null, // which level band of POIs is showing; null = wherever you are
      collapsed: {}, // sectionId -> true when folded away (see `section` in ui/tabs.js)
      inventoryFilter: { slot: 'all', rarity: 'all', spellId: 'all' },
      selectedItemId: null, // which slot in the Inventory grid is open in the detail panel
    },
    lastSeen: Date.now(),
  };
}

// Reset everything an Enlightenment resets, keeping souls/upgrades/settings/unlock memory.
export function resetRun(state) {
  const fresh = createInitialState();
  const name = state.hero.name;
  const recallSkill = state.hero.skills.lifestone;
  const recallUnlocked = state.progress.recallUnlocked;
  const firstDeathHandled = state.progress.firstDeathHandled;
  state.pyreals = fresh.pyreals;
  state.hero = fresh.hero;
  state.hero.name = name;
  state.hero.skills.lifestone = recallSkill;
  state.location = fresh.location;
  state.travel = fresh.travel;
  state.progress = fresh.progress;
  state.progress.recallUnlocked = recallUnlocked;
  state.progress.firstDeathHandled = firstDeathHandled;
  state.monsters = [];
  state.equipment = fresh.equipment;
  state.inventory = fresh.inventory;
  state.materials = fresh.materials;
  state.trophies = fresh.trophies;
  state.consumables = fresh.consumables;
  state.buffs = fresh.buffs;
  state.buildings = freshBuildings(); // town is rebuilt from scratch: buildings cost run currency, like Training
  state.training = fresh.training;
  state.log = fresh.log;
  // keep: enlightenment, achievements, settings, ui.seenUnlocks, lastSeen, onboarding,
  // hero.name, Recall skill/unlock. Vitae lives on state.hero, so a reborn hero starts clean.
}

const MAX_LOG = 60;

export function addLog(state, text, cls = 'dim') {
  state.log.push({ text, cls, t: Date.now() });
  if (state.log.length > MAX_LOG) state.log.splice(0, state.log.length - MAX_LOG);
}
