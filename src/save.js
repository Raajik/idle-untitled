// Save/load (localStorage), export/import, and offline progress simulation.

import { createInitialState, SAVE_VERSION, addLog } from './game/state.js';
import { derivedStats, heroDps, grantXp } from './game/hero.js';
import { getPoiById, isSite } from './data/regions.js';
import { monsterStatsForLevel } from './data/monsterScaling.js';
import { TUTORIAL_ROAD } from './data/tutorial.js';
import { generateItem, maybeAutoEquip, DROP_CHANCE } from './game/loot.js';
import { poiItemPower } from './data/items.js';
import { freshBuildings } from './data/buildings.js';
import { fmt } from './engine/format.js';
import { skipTravel } from './game/travel.js';
import { waveDifficulty, simulateWaveKills } from './game/waves.js';

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
  state.hero.skills.offense = { ...fresh.hero.skills.offense, ...(rawSkills.offense || {}) };
  state.hero.skills.gathering = { ...fresh.hero.skills.gathering, ...(rawSkills.gathering || {}) };
  state.hero.vitae = { ...fresh.hero.vitae, ...((raw.hero && raw.hero.vitae) || {}) };
  state.achievements = Array.isArray(raw.achievements) ? raw.achievements : [];
  state.trophies = { ...fresh.trophies, ...(raw.trophies || {}) };
  state.consumables = { ...fresh.consumables, ...(raw.consumables || {}) };
  state.buffs = Array.isArray(raw.buffs) ? raw.buffs : [];
  state.hero.knownSpells = Array.isArray(state.hero.knownSpells) ? state.hero.knownSpells : [];
  state.settings.autoCastSpells = Array.isArray(state.settings.autoCastSpells) ? state.settings.autoCastSpells : [];
  // Run was renamed to Athletics — carry an old save's progress over rather than losing it.
  if (rawSkills.run && !rawSkills.athletics) {
    state.hero.skills.athletics = { ...rawSkills.run };
  }
  delete state.hero.skills.run;
  state.progress = { ...fresh.progress, ...(raw.progress || {}) };
  state.location = { ...fresh.location, ...(raw.location || {}) };
  state.travel = raw.travel !== undefined ? raw.travel : fresh.travel;
  // Rebirth was renamed to Enlightenment (the Asheron's Call term for the same
  // idea) — carry an old save's souls, run count, and upgrades over intact.
  state.enlightenment = { ...fresh.enlightenment, ...(raw.enlightenment || raw.rebirth || {}) };
  delete state.rebirth;
  state.buildings = { ...freshBuildings(), ...(raw.buildings || {}) };
  state.training = { ...fresh.training, ...(raw.training || {}) };
  state.settings = { ...fresh.settings, ...(raw.settings || {}) };
  state.ui = { ...fresh.ui, ...(raw.ui || {}) };
  state.onboarding = { ...fresh.onboarding, ...(raw.onboarding || {}) };

  // Saves from before the intro/naming existed belong to players already past all
  // of that — never make an existing character re-live the "what's your name" beat.
  if (raw.onboarding === undefined) {
    state.onboarding = { step: 'done', tutorialPending: false };
  }

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

  // Gathering nodes and per-slot town shops both folded into the POI/building rework:
  // gathering is now a POI full-clear payout (see game/waves.js) and every shop is a
  // town building with its own level and rotating stock (see data/buildings.js). Old
  // saves lose their in-progress gather and their fixed shop stock — the town starts
  // over with just the General Store — but keep every material they'd banked.
  delete state.gathering;
  delete state.shops;
  delete state.progress.poiDepth;
  delete state.progress.killsSinceBoss;
  delete state.progress.bossesKilled;
  if (state.ui.activeShop !== undefined) {
    state.ui.activeBuilding = state.ui.activeShop;
    delete state.ui.activeShop;
  }

  // Binding-on-death is new: a fresh character starts bound to the roadside stone and
  // has to grow Holtburg's budding Lifestone to move it. Existing characters are long
  // past that walk, so grandfather them onto the first region they'd already reached
  // rather than yanking them back to the road the next time they die.
  if (!(raw.progress && raw.progress.boundLifestone) && state.progress.unlockedRegions.length > 0) {
    state.progress.boundLifestone = { regionId: state.progress.unlockedRegions[0], poiId: null };
  }

  // Vitals used to use 0 as their "not filled in yet" sentinel, which silently
  // refilled anyone who hit exactly 0. They use null now — an old save sitting on a
  // literal 0 was always an uninitialized one, so carry it over as such.
  for (const vital of ['hp', 'stamina', 'mana']) {
    if (state.hero[vital] === 0 || state.hero[vital] === undefined) state.hero[vital] = null;
  }

  // Holtburg's Meeting Hall is gone, and Holtburg's dungeons were re-cut so that
  // Mahogany and Green Garnet turn up early. Anyone standing in (or bound to, or
  // walking toward) the deleted POI gets moved out to the town hub.
  const GONE_POIS = ['holtburg-meeting-hall'];
  if (GONE_POIS.includes(state.location.poiId)) state.location = { regionId: 'holtburg', poiId: null };
  if (GONE_POIS.includes(state.progress.boundLifestone.poiId)) {
    state.progress.boundLifestone = { regionId: 'holtburg', poiId: null };
  }
  if (state.travel && state.travel.kind === 'poi' && GONE_POIS.includes(state.travel.id)) state.travel = null;
  state.progress.visitedPois = state.progress.visitedPois.filter((id) => !GONE_POIS.includes(id));
  for (const id of GONE_POIS) delete state.progress.poiClears[id];

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
  if (state.ui.activeTab === 'rebirth') state.ui.activeTab = 'enlightenment';

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

  state.progress.recallCooldown = Math.max(0, state.progress.recallCooldown - elapsedSec);

  // Finish an in-progress walk instantly if enough time passed; Run trains for the
  // skipped time either way. `null` means the walk still isn't done.
  const afterTravel = skipTravel(state, elapsedSec);
  const remaining = afterTravel === null ? 0 : afterTravel;

  if (!state.location.poiId) return null; // travelling or in town: nothing to simulate
  if (state.location.poiId === TUTORIAL_ROAD.id) return null; // mid-tutorial: nothing to simulate

  const poi = getPoiById(state.location.poiId);
  if (isSite(poi)) return null; // parked at a site: nothing to simulate
  // Waves keep advancing while you're away, but the sim can't know which wave each
  // kill landed on — it prices the whole stretch at the wave you left off on.
  const depth = waveDifficulty(state.progress.wave);
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
  const clears = simulateWaveKills(state, poi, kills);

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
    clears,
  };
  addLog(
    state,
    `Welcome back! Away ${hours < 1 ? Math.round(elapsedSec / 60) + 'm' : hours.toFixed(1) + 'h'}: ${fmt(kills)} kills, +${fmt(pyrealsGain)} pyreals${summary.levelsGained ? `, +${summary.levelsGained} levels` : ''}${clears ? `, ${fmt(clears)} full clears` : ''}.`,
    'good'
  );
  return summary;
}
