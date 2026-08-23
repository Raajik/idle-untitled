// Using the things you carry: drinking a potion, and the auto-healing a Healing
// Kit pays for.
//
// Auto-healing is a trade, not free health. It buys HP with Stamina — the same
// pool your attacks come out of — so leaving it on means fighting slower to stay
// standing. That's the decision it exists to create, and it's why the exchange
// rate is deliberately unkind.

import { getConsumable } from '../data/consumables.js';
import { derivedStats } from './hero.js';
import { applyBuff } from './buffs.js';
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
