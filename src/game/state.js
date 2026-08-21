// Central game state. One object, mutated by game logic, read by the UI.

import { DAMAGE_TYPES } from '../data/regions.js';
import { rollShopStock } from '../data/shops.js';

export const SAVE_VERSION = 4;

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
      xp: 0,
      str: 5,
      end: 5,
      coord: 5,
      quick: 5,
      focus: 5,
      self: 5,
      hp: 0, // current HP; 0 = "initialize on first tick"
      stamina: 0, // current Stamina; 0 = "initialize on first tick"
      mana: 0, // current Mana; 0 = "initialize on first tick"
      // combat timers
      attackTimer: 0,
      monsterTimer: 0,
      respawnTimer: 0,
      dead: false,
      skills: {
        athletics: freshSkill(), // renamed from run; also powers Jump/shortcuts
        dodge: freshSkill(),
        block: freshSkill(),
        parry: freshSkill(),
        resistance: freshResistance(),
        offense: freshOffense(),
        gathering: freshGathering(),
        tinkering: freshSkill(),
        lifestone: { recall: freshSkill() },
      },
    },
    location: { regionId: null, poiId: null }, // null,null = still on the road to Holtburg
    travel: null, // { kind: 'region'|'poi', id, remaining, duration }
    gathering: null, // { nodeId, remaining, duration } — suspends combat like travel does
    progress: {
      unlockedRegions: [], // arrived at
      visitedPois: [],
      poiDepth: 0, // current POI's difficulty multiplier (resets on travel away)
      timeInPoi: 0,
      killsInPoi: 0,
      killsSinceBoss: 0,
      bossesKilled: 0,
      totalKills: 0,
      totalPyrealsEarned: 0,
      totalXpEarned: 0,
      totalDrops: 0,
      aetheriaSlots: 0,
      firstDeathHandled: false, // whether Alcott's "death teaches lessons" beat has fired
      recallUnlocked: false,
      recallCooldown: 0, // seconds remaining until Recall can be used again
      jumpCooldown: 0, // seconds remaining until a shortcut Jump can be used again
    },
    monster: null, // current monster instance { name, hp, maxHp, atk, def, xp, pyreals, isBoss }
    equipment: { weapon: null, armor: null, shield: null, amulet: null, ring: null },
    inventory: [],
    materials: {}, // materialId -> count, no cap
    shops: rollShopStock(), // shopId -> stock array, rolled once at creation
    training: { atk: 0, hp: 0, pyreals: 0 },
    rebirth: {
      souls: 0,
      count: 0,
      upgrades: {}, // id -> rank
    },
    settings: {
      autoEquip: true, // charter: QoL free from the start
    },
    log: [], // recent combat log lines (newest last)
    ui: {
      seenUnlocks: [], // ids the player has been toasted about
      activeTab: 'battle',
      activeShop: null, // which shop panel is expanded in the Battle tab's town view
    },
    lastSeen: Date.now(),
  };
}

// Reset everything a rebirth resets, keeping souls/upgrades/settings/unlock memory.
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
  state.gathering = fresh.gathering;
  state.progress = fresh.progress;
  state.progress.recallUnlocked = recallUnlocked;
  state.progress.firstDeathHandled = firstDeathHandled;
  state.monster = null;
  state.equipment = fresh.equipment;
  state.inventory = fresh.inventory;
  state.materials = fresh.materials;
  state.shops = rollShopStock();
  state.training = fresh.training;
  state.log = fresh.log;
  // keep: rebirth, settings, ui.seenUnlocks, lastSeen, onboarding, hero.name, Recall skill/unlock
}

const MAX_LOG = 60;

export function addLog(state, text, cls = 'dim') {
  state.log.push({ text, cls, t: Date.now() });
  if (state.log.length > MAX_LOG) state.log.splice(0, state.log.length - MAX_LOG);
}
