// Save/load (localStorage), export/import, and offline progress simulation.

import { createInitialState, SAVE_VERSION, addLog } from './game/state.js';
import { derivedStats, heroDps, grantXp } from './game/hero.js';
import { getPoiById } from './data/regions.js';
import { monsterStatsForLevel } from './data/monsterScaling.js';
import { generateItem, maybeAutoEquip, DROP_CHANCE } from './game/loot.js';
import { poiItemPower } from './data/items.js';
import { fmt } from './engine/format.js';
import { skipTravel } from './game/travel.js';

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
  const rawSkills = (raw.hero && raw.hero.skills) || {};
  state.hero.skills = { ...fresh.hero.skills, ...rawSkills };
  state.hero.skills.resistance = { ...fresh.hero.skills.resistance, ...(rawSkills.resistance || {}) };
  state.progress = { ...fresh.progress, ...(raw.progress || {}) };
  state.location = { ...fresh.location, ...(raw.location || {}) };
  state.travel = raw.travel !== undefined ? raw.travel : fresh.travel;
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

  // Pre-level-rework saves may have a stale in-progress monster instance missing the
  // newer fields (level, dmgType, stamina) — drop it so a fresh one spawns next tick.
  if (state.monster && state.monster.level === undefined) state.monster = null;

  // Migrate pre-region saves (flat zone/poi index) into the Holtburg region + POI system.
  // These saves predate depth-based difficulty, so we drop them into Holtburg's town hub.
  const isPreRegion = raw.progress && (raw.progress.zone !== undefined || raw.progress.poi !== undefined) && !raw.location;
  if (isPreRegion) {
    delete state.progress.zone;
    delete state.progress.poi;
    delete state.progress.highestZone;
    delete state.progress.highestPoi;
    delete state.progress.killsInZone;
    state.progress.unlockedRegions = ['holtburg'];
    state.progress.visibleRegions = ['holtburg'];
    state.location = { regionId: 'holtburg', poiId: 'holtburg-meeting-hall' };
    if (!state.progress.visitedPois.includes('holtburg-meeting-hall')) {
      state.progress.visitedPois.push('holtburg-meeting-hall');
    }
  }
  // Belt-and-suspenders: strip any leftover legacy keys even if the save already had `location`.
  delete state.progress.zone;
  delete state.progress.poi;
  delete state.progress.highestZone;
  delete state.progress.highestPoi;
  delete state.progress.killsInZone;

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

  // Migrate the old single Hero/Equipment tabs into the Hero category's subsections.
  if (state.ui.activeTab === 'hero') state.ui.activeTab = 'attributes';
  if (state.ui.activeTab === 'equipment') state.ui.activeTab = 'inventory';

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
// from the hero's current DPS vs the average monster in the current POI. Loot is sampled
// at the expected drop count (capped), keeping only auto-equips to avoid inventory floods.
// If the hero was travelling or in town, we just finish the walk / do nothing.

const MAX_OFFLINE_DROPS_KEPT = 8;

export function applyOfflineProgress(state) {
  const now = Date.now();
  const elapsedSec = Math.max(0, (now - (state.lastSeen || now)) / 1000);
  if (elapsedSec < 60) return null; // not worth reporting under a minute

  // Finish an in-progress walk instantly if enough time passed; Run trains for the
  // skipped time either way. `null` means the walk still isn't done.
  const afterTravel = skipTravel(state, elapsedSec);
  const remaining = afterTravel === null ? 0 : afterTravel;

  if (!state.location.poiId) return null; // travelling or in town: nothing to simulate

  const poi = getPoiById(state.location.poiId);
  const depth = state.progress.poiDepth || 0;
  const monsterStats = poi.monsters.map((m) => monsterStatsForLevel(m.level));
  const avgOf = (key) => monsterStats.reduce((s, m) => s + m[key], 0) / monsterStats.length;
  const avgMonsterHp = avgOf('hp') * (1 + depth);
  const avgDef = Math.round(avgOf('def') * (1 + depth));
  const dps = heroDps(state, avgDef);
  if (dps <= 0) return null;

  const kills = Math.floor((remaining * dps) / avgMonsterHp);
  if (kills <= 0) return null;

  const avgXp = avgOf('xp');
  const avgPyreals = avgOf('pyreals');
  const avgAtk = avgOf('atk');

  const stats = derivedStats(state);
  const pyrealsGain = Math.round(kills * avgPyreals * (1 + stats.pyrealsPct / 100));
  const levelsBefore = state.hero.level;
  grantXp(state, kills * avgXp);
  state.pyreals += pyrealsGain;
  state.progress.totalPyrealsEarned += pyrealsGain;
  state.progress.totalKills += kills;
  state.progress.killsInPoi += kills;
  state.progress.timeInPoi += remaining;

  // Sample expected drops, keep the best few
  const expectedDrops = Math.min(Math.round(kills * DROP_CHANCE), 200);
  const kept = [];
  for (let i = 0; i < expectedDrops; i++) {
    const item = generateItem(Math.round(poiItemPower(avgAtk) * (1 + depth)), { luckPct: stats.luckPct });
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
