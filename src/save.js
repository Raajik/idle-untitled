// Save/load (localStorage), export/import, and offline progress simulation.

import { createInitialState, SAVE_VERSION, addLog } from './game/state.js';
import { derivedStats, heroDps, grantXp } from './game/hero.js';
import { getZone } from './data/zones.js';
import { generateItem, maybeAutoEquip, DROP_CHANCE } from './game/loot.js';
import { fmt } from './engine/format.js';

const SAVE_KEY = 'idle-untitled-save-v1';

let saveSuppressed = false;

// Stop saves until reload (used by hard reset so unload handlers can't re-write the save).
export function suppressSave() {
  saveSuppressed = true;
}

export function saveGame(state) {
  if (saveSuppressed) return;
  state.lastSeen = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Save failed:', e);
  }
}

function migrate(raw) {
  const fresh = createInitialState();
  const state = { ...fresh, ...raw };
  // deep-merge critical nested objects so old saves gain new fields
  state.hero = { ...fresh.hero, ...(raw.hero || {}) };
  state.progress = { ...fresh.progress, ...(raw.progress || {}) };
  state.rebirth = { ...fresh.rebirth, ...(raw.rebirth || {}) };
  state.training = { ...fresh.training, ...(raw.training || {}) };
  state.settings = { ...fresh.settings, ...(raw.settings || {}) };
  state.ui = { ...fresh.ui, ...(raw.ui || {}) };

  // Migrate pre-pyreals saves: gold -> pyreals (also the training track and progress counters).
  if (state.pyreals === undefined && raw.gold !== undefined) state.pyreals = raw.gold;
  if (state.training.gold !== undefined) {
    state.training.pyreals = state.training.gold;
    delete state.training.gold;
  }
  if (state.progress.totalGoldEarned !== undefined) {
    state.progress.totalPyrealsEarned = state.progress.totalGoldEarned;
    delete state.progress.totalGoldEarned;
  }

  // Normalize item slots (trinket -> amulet, charm -> ring) from pre-AC-theme saves.
  const remap = (slot) => (slot === 'trinket' ? 'amulet' : slot === 'charm' ? 'ring' : slot);
  state.equipment = { ...fresh.equipment, ...(raw.equipment || {}) };
  for (const slot of Object.keys(state.equipment)) {
    const item = state.equipment[slot];
    const newSlot = remap(slot);
    if (newSlot !== slot) {
      delete state.equipment[slot];
      state.equipment[newSlot] = state.equipment[newSlot] || item;
    }
    if (item && remap(item.slot) !== item.slot) item.slot = remap(item.slot);
  }
  state.inventory = (raw.inventory || []).map((it) => ({ ...it, slot: remap(it.slot) }));

  state.version = SAVE_VERSION;
  return state;
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch (e) {
    console.warn('Load failed:', e);
    return null;
  }
}

export function exportSave(state) {
  state.lastSeen = Date.now();
  return btoa(unescape(encodeURIComponent(JSON.stringify(state))));
}

export function importSave(str) {
  try {
    const parsed = JSON.parse(decodeURIComponent(escape(atob(str.trim()))));
    return migrate(parsed);
  } catch (e) {
    return null;
  }
}

export function hardReset() {
  localStorage.removeItem(SAVE_KEY);
}

// --- Offline progress ---
// Analytical approximation: kills = elapsed / secondsPerKill, where secondsPerKill comes
// from the hero's current DPS vs the average monster in the current zone. Loot is sampled
// at the expected drop count (capped), keeping only auto-equips to avoid inventory floods.

const MAX_OFFLINE_DROPS_KEPT = 8;

export function applyOfflineProgress(state) {
  const now = Date.now();
  const elapsedSec = Math.max(0, (now - (state.lastSeen || now)) / 1000);
  if (elapsedSec < 60) return null; // not worth reporting under a minute

  const zone = getZone(state.progress.zone);
  const avgMonster =
    zone.monsters.reduce((s, m) => s + m.hp, 0) / zone.monsters.length;
  const dps = heroDps(state, Math.round(zone.monsters[0].def));
  if (dps <= 0) return null;

  const kills = Math.floor((elapsedSec * dps) / avgMonster);
  if (kills <= 0) return null;

  const avgXp = zone.monsters.reduce((s, m) => s + m.xp, 0) / zone.monsters.length;
  const avgPyreals = zone.monsters.reduce((s, m) => s + m.pyreals, 0) / zone.monsters.length;

  const stats = derivedStats(state);
  const pyrealsGain = Math.round(kills * avgPyreals * (1 + stats.pyrealsPct / 100));
  const levelsBefore = state.hero.level;
  grantXp(state, kills * avgXp);
  state.pyreals += pyrealsGain;
  state.progress.totalPyrealsEarned += pyrealsGain;
  state.progress.totalKills += kills;

  // Sample expected drops, keep the best few
  const expectedDrops = Math.min(Math.round(kills * DROP_CHANCE), 200);
  const kept = [];
  for (let i = 0; i < expectedDrops; i++) {
    const item = generateItem(state.progress.zone, { luckPct: stats.luckPct });
    if (maybeAutoEquip(state, item)) {
      kept.push(item);
      if (kept.length > MAX_OFFLINE_DROPS_KEPT) kept.shift();
    }
  }

  const hours = elapsedSec / 3600;
  const summary = {
    elapsedSec,
    kills,
    pyrealsGain,
    levelsGained: state.hero.level - levelsBefore,
    equips: kept.length,
  };
  addLog(
    state,
    `Welcome back! Away ${hours < 1 ? Math.round(elapsedSec / 60) + 'm' : hours.toFixed(1) + 'h'}: ${fmt(kills)} kills, +${fmt(pyrealsGain)} pyreals${summary.levelsGained ? `, +${summary.levelsGained} levels` : ''}.`,
    'good'
  );
  return summary;
}
