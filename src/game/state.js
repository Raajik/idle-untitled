// Central game state. One object, mutated by game logic, read by the UI.

import { DAMAGE_TYPES } from '../data/regions.js';
import { freshBuildings } from '../data/buildings.js';

export const SAVE_VERSION = 5;

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
      str: 5,
      end: 5,
      coord: 5,
      quick: 5,
      focus: 5,
      self: 5,
      attrXp: { str: 0, end: 0, coord: 0, quick: 0, focus: 0, self: 0 }, // progress toward each attribute's next point
      // null = "not filled in yet"; the first combat tick sets these to their maxima.
      // Deliberately not 0: attacks spend whole points of Stamina, so a hero can land
      // on exactly 0, and a 0-means-uninitialized sentinel would hand them a free refill.
      hp: null,
      stamina: null,
      mana: null,
      // Asheron's Call's death penalty (see game/vitae.js): `stacks` x 5% off the
      // hero's body, worked back off by earning `xpRemaining` experience.
      vitae: { stacks: 0, xpRemaining: 0 },
      // combat timers
      attackTimer: 0,
      monsterTimer: 0,
      respawnTimer: 0,
      dead: false,
      combat: {
        mode: 'melee', // 'melee' | 'archery' | 'magic'
        meleeStance: 0, // 0-4: fastest/lightest to the 4s heavy bleed swing
        archeryStance: 0, // 0-4: fastest/least accurate to slowest/most accurate
        magicSpell: 'arc', // 'arc' | 'volley' | 'streak'
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
    meditating: false, // channelled rest; suspends combat like travel does (see game/meditation.js)
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
      recallUnlocked: false,
      recallCooldown: 0, // seconds remaining until Recall can be used again
      jumpCooldown: 0, // seconds remaining until a shortcut Jump can be used again
    },
    monster: null, // current monster instance { name, hp, maxHp, atk, def, xp, pyreals }
    equipment: { weapon: null, armor: null, shield: null, amulet: null, ring: null },
    inventory: [],
    achievements: [], // earned achievement ids (see data/achievements.js); permanent, survives Enlightenment
    materials: {}, // materialId -> count, no cap
    buildings: freshBuildings(), // buildingId -> { level, stock, rotatesAt }; only the General Store starts open
    training: { atk: 0, hp: 0, pyreals: 0 },
    enlightenment: {
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
      activeBuilding: null, // which building panel is expanded in the Battle tab's town view
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
  state.meditating = false;
  state.progress = fresh.progress;
  state.progress.recallUnlocked = recallUnlocked;
  state.progress.firstDeathHandled = firstDeathHandled;
  state.monster = null;
  state.equipment = fresh.equipment;
  state.inventory = fresh.inventory;
  state.materials = fresh.materials;
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
