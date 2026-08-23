// Using the things you carry: drinking a potion, and the auto-healing a Healing
// Kit pays for.
//
// Auto-healing is a trade, not free health. It buys HP with Stamina — the same
// pool your attacks come out of — so leaving it on means fighting slower to stay
// standing. That's the decision it exists to create, and it's why the exchange
// rate is deliberately unkind.

import { CONSUMABLES, getConsumable } from '../data/consumables.js';
import { derivedStats } from './hero.js';
import { applyBuff, hasBuff } from './buffs.js';
import { addLog } from './state.js';

// Stamina spent per point of health restored. At 2:1 a full stamina bar buys
// back a bit under half a full health bar, which makes auto-healing a real
// lifeline without making Stamina a second, larger health pool.
export const STAMINA_PER_HP = 2;

// Auto-healing kicks in below this share of max HP, and tops you up by at most
// this much of it per charge.
const AUTO_HEAL_TRIGGER = 0.5;
const AUTO_HEAL_PER_CHARGE = 0.25;

export function charges(state, id) {
  return state.consumables[id] || 0;
}

export function grantConsumable(state, id, amount) {
  const def = getConsumable(id);
  if (!def) return false;
  state.consumables[id] = charges(state, id) + (amount ?? def.startingCharges);
  return true;
}

// Whether the hero owns a kit with anything left in it — what makes the
// auto-heal toggle meaningful.
export function canAutoHeal(state) {
  return state.progress.autoHealUnlocked && charges(state, 'healing-kit') > 0;
}

// Drinks/uses one charge of a consumable that has something to do on use.
// Kits have no `use` of their own — they're spent by auto-healing.
export function useConsumable(state, id) {
  const def = getConsumable(id);
  if (!def || !def.buff) return false;
  if (charges(state, id) <= 0) return false;

  state.consumables[id] -= 1;
  applyBuff(state, def.buff);
  if (def.unlocks) state.progress[def.unlocks] = true;
  addLog(state, `You drink the ${def.name}. ${def.buff.name} takes hold.`, 'good');
  return true;
}

// --- Auto-upkeep ---
// A potion set to keep itself up is re-drunk when its buff runs out. Note the
// difference from spell auto-cast (game/buffs.js), which refreshes 30s EARLY so
// the effect never drops: mana grows back and potions don't, so topping up a
// running tonic would pour away whatever time was left on it. Here the buff is
// allowed to lapse first, and the gap is the price of not watching the timer.

export function isAutoDrink(state, id) {
  return state.settings.autoDrink.includes(id);
}

// Only worth offering for something that actually grants a buff — a Healing Kit
// has its own toggle, and it isn't drunk.
export function canAutoDrink(id) {
  const def = getConsumable(id);
  return !!(def && def.buff);
}

export function toggleAutoDrink(state, id) {
  if (!canAutoDrink(id)) return false;
  const list = state.settings.autoDrink;
  const at = list.indexOf(id);
  if (at === -1) list.push(id);
  else list.splice(at, 1);
  return true;
}

// Called every combat tick. Drinks anything marked for upkeep whose buff isn't
// running; silently does nothing when the pack is empty.
export function tickAutoDrink(state) {
  if (state.hero.dead) return;
  for (const id of state.settings.autoDrink) {
    if (charges(state, id) <= 0) continue;
    const def = getConsumable(id);
    if (!def || !def.buff || hasBuff(state, def.buff.id)) continue;
    useConsumable(state, id);
  }
}

// Consumables worth showing in the Upkeep list: what's in the pack, plus
// anything on auto-upkeep that has run out — otherwise running dry would hide
// the toggle you left ON, with no way to find it and switch it off.
export function upkeepConsumables(state) {
  return CONSUMABLES.filter((c) => charges(state, c.id) > 0 || isAutoDrink(state, c.id));
}

// Called every combat tick. Spends a charge and a chunk of Stamina to claw back
// health when the hero is in trouble. Returns the HP restored, or 0.
export function tickAutoHeal(state) {
  if (!state.settings.autoHeal || !canAutoHeal(state)) return 0;
  const h = state.hero;
  if (h.dead) return 0;

  const stats = derivedStats(state);
  if (h.hp > stats.maxHp * AUTO_HEAL_TRIGGER) return 0;

  const missing = stats.maxHp - h.hp;
  const affordable = Math.floor(h.stamina / STAMINA_PER_HP);
  const healed = Math.min(missing, affordable, Math.ceil(stats.maxHp * AUTO_HEAL_PER_CHARGE));
  if (healed <= 0) return 0;

  h.hp += healed;
  h.stamina -= healed * STAMINA_PER_HP;
  state.consumables['healing-kit'] -= 1;
  const left = charges(state, 'healing-kit');
  addLog(
    state,
    left > 0
      ? `You patch yourself up: +${healed} HP for ${healed * STAMINA_PER_HP} stamina. (${left} left)`
      : `You use the last of the Healing Kit: +${healed} HP.`,
    'good'
  );
  return healed;
}
