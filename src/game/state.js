// Central game state. One object, mutated by game logic, read by the UI.

export const SAVE_VERSION = 1;

export function createInitialState() {
  return {
    version: SAVE_VERSION,
    pyreals: 0,
    hero: {
      level: 1,
      xp: 0,
      str: 5,
      end: 5,
      coord: 5,
      quick: 5,
      focus: 5,
      self: 5,
      hp: 0, // current HP; 0 = "initialize on first tick"
      // combat timers
      attackTimer: 0,
      monsterTimer: 0,
      respawnTimer: 0,
      dead: false,
    },
    progress: {
      zone: 0, // current zone the hero is fighting in
      highestZone: 0,
      killsInZone: 0,
      bossActive: false,
      bossesKilled: 0,
      totalKills: 0,
      totalPyrealsEarned: 0,
      totalXpEarned: 0,
      totalDrops: 0,
    },
    monster: null, // current monster instance { name, hp, maxHp, atk, def, xp, pyreals, isBoss }
    equipment: { weapon: null, armor: null, amulet: null, ring: null },
    inventory: [],
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
    },
    lastSeen: Date.now(),
  };
}

// Reset everything a rebirth resets, keeping souls/upgrades/settings/unlock memory.
export function resetRun(state) {
  const fresh = createInitialState();
  state.pyreals = fresh.pyreals;
  state.hero = fresh.hero;
  state.progress = fresh.progress;
  state.monster = null;
  state.equipment = fresh.equipment;
  state.inventory = fresh.inventory;
  state.training = fresh.training;
  state.log = fresh.log;
  // keep: rebirth, settings, ui.seenUnlocks, lastSeen
}

const MAX_LOG = 60;

export function addLog(state, text, cls = 'dim') {
  state.log.push({ text, cls, t: Date.now() });
  if (state.log.length > MAX_LOG) state.log.splice(0, state.log.length - MAX_LOG);
}
