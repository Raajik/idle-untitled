// AC-flavored attack stances. The bar fills to the chosen stance's interval
// (or cast time) before the attack fires — a visible tradeoff instead of pure
// automatic timing. Quickness/SPD and the offense skill's hitChance() curve
// still apply underneath; stances shift the tradeoff, they don't replace them.
//
// `resource` is which vital an attack draws on. It colors the attack bar to match
// that vital's own bar (see combat.js activeAttackCost and the `.bar.attack`
// rules in styles.css), so you can tell at a glance what a swing is spending.
// Physical swings are stamina work — Stamina is what fuels bodily effort here,
// including every Dodge/Block/Parry — while spells are cast on mana. Add 'life'
// here the day an attack pays in HP and the bar turns red for free.
//
// How much stamina a swing costs is NOT stored per stance: see
// staminaCostForWindup at the bottom of this file.

// Melee: speed <-> power. Stance 0 keeps today's `1/stats.spd` timing exactly
// (baseInterval is filled in at use-time); stances 1-3 step up fixed windup
// seconds and damage; stance 4 is the ~4s heavy swing with a stacking Bleed.
export const MELEE_STANCES = [
  { label: 'Quick', dmgMult: 1.0, bleed: false, resource: 'stamina' }, // interval = 1/spd
  { label: 'Balanced', interval: 1.6, dmgMult: 1.6, bleed: false, resource: 'stamina' },
  { label: 'Heavy', interval: 2.6, dmgMult: 2.3, bleed: false, resource: 'stamina' },
  { label: 'Crushing', interval: 3.3, dmgMult: 2.9, bleed: false, resource: 'stamina' },
  { label: 'Devastating', interval: 4.0, dmgMult: 3.5, bleed: true, resource: 'stamina' },
];

// Archery: speed <-> accuracy. Stance 0 keeps today's `1/stats.spd` timing;
// accuracyMod is added directly to hitChance()'s result (clamped 0-95).
export const ARCHERY_STANCES = [
  { label: 'Snap Shot', accuracyMod: -15, resource: 'stamina' }, // interval = 1/spd
  { label: 'Quick Draw', interval: 1.3, accuracyMod: -7, resource: 'stamina' },
  { label: 'Steady', interval: 1.8, accuracyMod: 0, resource: 'stamina' },
  { label: 'Aimed', interval: 2.3, accuracyMod: 10, resource: 'stamina' },
  { label: 'Called Shot', interval: 2.8, accuracyMod: 20, resource: 'stamina' },
];

// Magic: three spell profiles cast with the War Magic skill. War picks its
// element per cast (see data/elements.js); Volley hits the whole engaged group.
export const MAGIC_SPELLS = {
  arc: { label: 'Arc', castTime: 2.5, dmgMult: 2.6, critMult: 3.0, manaCost: 15, resource: 'mana' },
  volley: { label: 'Volley', castTime: 1.5, dmgMult: 1.4, critMult: 2.0, manaCost: 10, resource: 'mana', aoe: true, aoeMult: 0.6 },
  streak: { label: 'Streak', castTime: 0.5, dmgMult: 0.6, critMult: 2.0, manaCost: 4, resource: 'mana' },
};

// Void Magic: the same three-slot shape, always void damage, with Corruption in
// Volley's place. Corruption does no damage on impact — it lands a rot on every
// engaged monster that ticks until the thing dies, stacking three deep. That
// makes Void the patient school: it pays nothing up front and everything if the
// fight runs long, which is the opposite bet to War's burst.
export const VOID_SPELLS = {
  arc: { label: 'Nether Bolt', castTime: 2.5, dmgMult: 2.4, critMult: 3.0, manaCost: 15, resource: 'mana' },
  corruption: {
    label: 'Corruption',
    castTime: 1.5,
    dmgMult: 0,
    critMult: 1,
    manaCost: 14,
    resource: 'mana',
    rot: true,
    cooldown: 5,
  },
  streak: { label: 'Nether Streak', castTime: 0.5, dmgMult: 0.55, critMult: 2.0, manaCost: 4, resource: 'mana' },
};

// Corruption's rot: per stack, per tick, as a share of the caster's magic ATK.
// No duration — it runs until the monster dies, which is what makes stacking it
// early on a long fight worth the cast time.
export const ROT_TICK_SECONDS = 1;
export const ROT_MAX_STACKS = 3;
export const ROT_DAMAGE_PER_STACK_PCT = 0.12;

// Stamina a single physical attack costs, 1-5, scaled to the length of its windup
// — that is, to how full the attack bar gets before the blow lands.
//
// Derived rather than written on each stance so that melee and archery stay
// comparable. Hand-assigning 1-5 down each list looks tidy but isn't: archery's
// ladder tops out at a 2.8s Called Shot against melee's 4.0s Devastating, so the
// same numbers made archery ~45% more expensive per second and left a fresh hero
// stalled for most of a fight. Anchoring to the window instead keeps every stance
// within a narrow band of stamina-per-second, and any stance added later gets a
// sane cost for free. Stance 0 of each list has no fixed interval (it runs at
// 1/spd), so its cost falls out of the hero's own Quickness.
export const MAX_ATTACK_STAMINA_COST = 5;
export const LONGEST_WINDUP_SECONDS = 4.0; // the Devastating melee swing, the slowest attack in the game

export function staminaCostForWindup(seconds) {
  const scaled = Math.round((MAX_ATTACK_STAMINA_COST * seconds) / LONGEST_WINDUP_SECONDS);
  return Math.max(1, Math.min(MAX_ATTACK_STAMINA_COST, scaled));
}

export const BLEED_TICK_SECONDS = 1;
export const BLEED_DURATION_SECONDS = 5;
export const BLEED_MAX_STACKS = 5;
export const BLEED_DAMAGE_PER_STACK_PCT = 0.2; // of the hero's atk, per stack, per tick
