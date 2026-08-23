// Timed buffs: anything that helps for a while and then stops. Potions grant
// them (see data/consumables.js), Life Magic spells grant them (see
// data/buffSpells.js), and both land in the same list on state so there's one
// place that knows how to count them and one place that expires them.
//
// A buff's `effect` is a bag of getBonuses() keys, folded into the hero's bonus
// table by game/hero.js — so a buff can raise anything gear can.

import { getBuffSpell, buffAt, buffSpellName, clampBuffLevel, MAX_BUFF_LEVEL } from '../data/buffSpells.js';
import { trainSkill } from './skills.js';
import { formatDuration } from '../engine/format.js';
import { addLog } from './state.js';

// Eight times what a swing trains a weapon skill (COMBAT_SKILL_XP in skills.js) —
// casting is deliberate work. Written as a literal rather than derived from that
// constant because skills.js -> hero.js -> buffs.js is a cycle, and reading it
// here at module-init time lands in the temporal dead zone.
const CAST_LIFE_XP = 8;

// Adds a buff, or restarts one already running. Re-casting refreshes rather than
// stacking — otherwise the right play would be to spam it, which isn't a choice.
export function applyBuff(state, { id, name, seconds, effect }) {
  const existing = state.buffs.find((b) => b.id === id);
  if (existing) {
    existing.remaining = Math.max(existing.remaining, seconds);
    return existing;
  }
  const buff = { id, name, remaining: seconds, effect };
  state.buffs.push(buff);
  return buff;
}

export function hasBuff(state, id) {
  return state.buffs.some((b) => b.id === id);
}

// Everything currently running, summed into one { key: value } bag.
export function buffBonuses(state) {
  const bonuses = {};
  for (const buff of state.buffs) {
    for (const [key, value] of Object.entries(buff.effect)) {
      bonuses[key] = (bonuses[key] || 0) + value;
    }
  }
  return bonuses;
}

// Counts every running buff down; drops the ones that have run out.
export function tickBuffs(state, dt) {
  if (!state.buffs.length) return;
  for (const buff of state.buffs) buff.remaining -= dt;
  const expired = state.buffs.filter((b) => b.remaining <= 0);
  if (!expired.length) return;
  state.buffs = state.buffs.filter((b) => b.remaining > 0);
  for (const buff of expired) addLog(state, `${buff.name} fades.`, 'dim');
}

// Known spells are a map of id -> level; 0 or missing means you don't have it.
export function spellLevel(state, id) {
  return state.hero.knownSpells[id] || 0;
}

export function knowsSpell(state, id) {
  return spellLevel(state, id) > 0;
}

// The spell as you know it, at the level you know it.
export function knownBuff(state, id) {
  const level = spellLevel(state, id);
  return level > 0 ? buffAt(id, level) : null;
}

export function canCastBuffSpell(state, id) {
  const known = knownBuff(state, id);
  if (!known) return false;
  if (state.hero.dead) return false;
  return state.hero.mana >= known.manaCost;
}

// Casts a known self-buff. Costs mana up front and trains Life Magic, which is
// otherwise a skill with nothing to do.
export function castBuffSpell(state, id) {
  if (!canCastBuffSpell(state, id)) return false;
  const known = knownBuff(state, id);
  state.hero.mana -= known.manaCost;
  applyBuff(state, { id: known.id, name: known.name, seconds: known.seconds, effect: known.effect });
  trainSkill(state, state.hero.skills.offense.life, 'Life Magic', CAST_LIFE_XP);
  addLog(state, `${known.name} — ${known.desc}.`, `${vitalClass(id)}`);
  return true;
}

// Which text colour a spell is always drawn in, so what it touches is legible
// before it's read.
export function vitalClass(id) {
  const spell = getBuffSpell(id);
  if (!spell) return 'good';
  return { hp: 'hp-text', stamina: 'stamina-text', mana: 'mana-text' }[spell.vital] || 'good';
}

// Auto-cast: a spell set to refresh itself goes up again as it's about to run
// out, so a buff you've decided to keep stays kept without you watching a timer.
// It re-casts on the way out rather than the instant it lapses, so the effect
// never actually drops.
export const AUTOCAST_REFRESH_SECONDS = 30;

export function isAutoCast(state, id) {
  return state.settings.autoCastSpells.includes(id);
}

export function toggleAutoCast(state, id) {
  if (!knowsSpell(state, id)) return false;
  const list = state.settings.autoCastSpells;
  const at = list.indexOf(id);
  if (at === -1) list.push(id);
  else list.splice(at, 1);
  return true;
}

// Called every combat tick. Re-casts anything marked for it that has lapsed or
// is about to; silently does nothing when there isn't the mana for it.
export function tickAutoCast(state) {
  for (const id of state.settings.autoCastSpells) {
    const buff = state.buffs.find((b) => b.id === id);
    if (buff && buff.remaining > AUTOCAST_REFRESH_SECONDS) continue;
    if (!canCastBuffSpell(state, id)) continue;
    castBuffSpell(state, id);
  }
}

// Learns a spell, or raises it if what's offered beats what you have. Returns
// the new level, or 0 if it taught you nothing.
export function learnSpell(state, id, level = 1) {
  if (!getBuffSpell(id)) return 0;
  const wanted = clampBuffLevel(level);
  if (spellLevel(state, id) >= wanted) return 0;
  state.hero.knownSpells[id] = wanted;
  return wanted;
}

export { MAX_BUFF_LEVEL };
