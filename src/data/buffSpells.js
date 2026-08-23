// Self-buff spells — the Life Magic side of casting, as opposed to the War Magic
// attack spells in data/combatStances.js.
//
// Every spell has a LEVEL. Regeneration II is twice Regeneration I and costs more
// to cast; the level is what you gain when you learn one again from a better
// source. Alcott starts you at I on all three, and after that you learn by
// listening: a monster that casts one shouts its spellwords, and if you catch
// them you can say them back (see game/spellwords.js).
//
// DESCRIPTIONS ARE PLAIN, DELIBERATELY. Every castable thing in this game states
// what it does and nothing else — "+2 Health regeneration for 30 minutes" — and
// any flavour lives in the moment you learn it or the log line when it lands.
// Flavour text on a permanent UI row is read once and then in the way forever.
// `effectText()` below is the one place that sentence is built, so anything
// castable added later reads the same way for free.
//
// `effect` keys are getBonuses() keys from game/hero.js. Casting one applies a
// timed buff (see game/buffs.js) and trains Life Magic.

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

export const MAX_BUFF_LEVEL = 8;
export const BUFF_SECONDS = 30 * 60;

// `words` are the spellwords a caster shouts, and the ones you repeat back.
// `vital` drives the colour every mention of this spell is drawn in, so a
// player can tell what a spell touches without reading it.
export const BUFF_SPELLS = [
  {
    id: 'regeneration',
    name: 'Regeneration',
    words: 'Boquar Zhapaj',
    vital: 'hp',
    effectKey: 'hpRegenFlat',
    unit: 'Health regeneration',
    baseMana: 8,
  },
  {
    id: 'rejuvenation',
    name: 'Rejuvenation',
    words: 'Boquar Zhavik',
    vital: 'stamina',
    effectKey: 'staminaRegenFlat',
    unit: 'Stamina regeneration',
    baseMana: 8,
  },
  {
    id: 'renewal',
    name: 'Renewal',
    words: 'Boquar Zhaloi',
    vital: 'mana',
    effectKey: 'manaRegenFlat',
    unit: 'Mana regeneration',
    baseMana: 8,
  },
];

export function getBuffSpell(id) {
  return BUFF_SPELLS.find((s) => s.id === id) || null;
}

export function buffSpellByWords(words) {
  const wanted = String(words || '').trim().toLowerCase();
  return BUFF_SPELLS.find((s) => s.words.toLowerCase() === wanted) || null;
}

export function clampBuffLevel(level) {
  return Math.max(1, Math.min(MAX_BUFF_LEVEL, Math.round(level || 1)));
}

export function romanFor(level) {
  return ROMAN[clampBuffLevel(level)];
}

// "Regeneration II"
export function buffSpellName(id, level) {
  const spell = getBuffSpell(id);
  if (!spell) return '';
  return `${spell.name} ${romanFor(level)}`;
}

// The one place a castable thing's effect becomes a sentence. Plain, present
// tense, no adjectives: what it does and how long it lasts.
export function effectText(id, level) {
  const spell = getBuffSpell(id);
  if (!spell) return '';
  return `+${clampBuffLevel(level)} ${spell.unit} for 30 minutes`;
}

// Mana scales with the level, so a high rank is worth casting rather than free.
export function buffManaCost(id, level) {
  const spell = getBuffSpell(id);
  if (!spell) return 0;
  return Math.round(spell.baseMana * (0.7 + 0.3 * clampBuffLevel(level)));
}

// Everything game/buffs.js needs to actually apply one.
export function buffAt(id, level) {
  const spell = getBuffSpell(id);
  if (!spell) return null;
  const lvl = clampBuffLevel(level);
  return {
    id: spell.id,
    level: lvl,
    name: buffSpellName(id, lvl),
    words: spell.words,
    vital: spell.vital,
    manaCost: buffManaCost(id, lvl),
    seconds: BUFF_SECONDS,
    effect: { [spell.effectKey]: lvl },
    desc: effectText(id, lvl),
  };
}

// What Alcott teaches on the way out the door: the first rank of each.
export const ALCOTT_TAUGHT_SPELLS = BUFF_SPELLS.map((s) => s.id);
