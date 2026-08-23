// Everything that can be left running by itself: self-buffs on auto-cast,
// potions on auto-drink, and auto-heal. Switching them on one at a time was the
// clunky part — by the time you know a thing exists you almost always want it
// kept up, so the sidebar carries a single switch for all of it and the Upkeep
// screen keeps the per-entry choices for when you actually want to differ.

import { BUFF_SPELLS } from '../data/buffSpells.js';
import { knowsSpell, isAutoCast, toggleAutoCast } from './buffs.js';
import { canAutoDrink, isAutoDrink, toggleAutoDrink, upkeepConsumables } from './consumables.js';

// Every automation available RIGHT NOW, as { kind, id, on }. A spell you have
// not learned and a potion you have never held are not choices yet: they neither
// count against "everything is on" nor get switched by the toggle.
export function upkeepEntries(state) {
  const out = [];
  for (const sp of BUFF_SPELLS) {
    if (knowsSpell(state, sp.id)) out.push({ kind: 'spell', id: sp.id, on: isAutoCast(state, sp.id) });
  }
  for (const c of upkeepConsumables(state)) {
    if (canAutoDrink(c.id)) out.push({ kind: 'drink', id: c.id, on: isAutoDrink(state, c.id) });
  }
  if (state.progress.autoHealUnlocked) out.push({ kind: 'heal', id: 'auto-heal', on: !!state.settings.autoHeal });
  return out;
}

export function upkeepAllOn(state) {
  const entries = upkeepEntries(state);
  return entries.length > 0 && entries.every((e) => e.on);
}

export function setAllUpkeep(state, on) {
  let changed = 0;
  for (const e of upkeepEntries(state)) {
    if (e.on === on) continue;
    if (e.kind === 'spell') toggleAutoCast(state, e.id);
    else if (e.kind === 'drink') toggleAutoDrink(state, e.id);
    else state.settings.autoHeal = on;
    changed++;
  }
  return changed;
}

// One press: everything on, unless everything already is, in which case
// everything off. Deliberately nothing in between — a switch that cycled through
// partial states would be the clunkiness again, in one control instead of five.
export function toggleAllUpkeep(state) {
  const on = !upkeepAllOn(state);
  setAllUpkeep(state, on);
  return on;
}
