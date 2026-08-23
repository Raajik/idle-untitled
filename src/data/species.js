// What hurts what.
//
// Every creature belongs to a species, and every species has exactly three
// weaknesses: a primary worth +45%, a secondary worth +30%, and a tertiary worth
// +15%. Nothing is outright resisted — the choice is always "which of these is
// best here", never "this attack is wasted", which keeps a build from being shut
// out of a dungeon it walked to.
//
// Two rules shaped the table, and a test in test/species.test.js holds both:
//
//   1. Primaries lean elemental and secondaries lean physical, which is the
//      Asheron's Call convention — an armoured thing you crush, a cold-blooded
//      thing you burn.
//   2. Across the whole table, all seven damage types carry a comparable total
//      weight. A weakness list nobody's damage type appears on is a dead type,
//      and the point is that every one of them is eventually worth carrying.
//
// THESE FIGURES ARE OURS, NOT CANON. acpedia's real vulnerability tables
// weren't reachable when this was written, so the numbers below are derived from
// each species' own flavour. Correcting one is a one-line change and the test
// will tell you if it unbalances the spread.

export const WEAKNESS_TIERS = [
  { key: 'primary', bonusPct: 45 },
  { key: 'secondary', bonusPct: 30 },
  { key: 'tertiary', bonusPct: 15 },
];

export const SPECIES = {
  drudge: { label: 'Drudge', weaknesses: ['fire', 'bludgeon', 'slash'] },
  banderling: { label: 'Banderling', weaknesses: ['lightning', 'pierce', 'slash'] },
  shreth: { label: 'Shreth', weaknesses: ['cold', 'slash', 'bludgeon'] },
  mosswart: { label: 'Mosswart', weaknesses: ['acid', 'slash', 'pierce'] },
  lugian: { label: 'Lugian', weaknesses: ['bludgeon', 'cold', 'pierce'] },
  virindi: { label: 'Virindi', weaknesses: ['acid', 'pierce', 'bludgeon'] },
  undead: { label: 'Undead', weaknesses: ['fire', 'bludgeon', 'acid'] },
  spirit: { label: 'Spirit', weaknesses: ['lightning', 'slash', 'acid'] },
  golem: { label: 'Golem', weaknesses: ['acid', 'bludgeon', 'lightning'] },
  vermin: { label: 'Vermin', weaknesses: ['cold', 'pierce', 'slash'] },
  mukkir: { label: 'Mukkir', weaknesses: ['fire', 'slash', 'cold'] },
  olthoi: { label: 'Olthoi', weaknesses: ['lightning', 'pierce', 'fire'] },
  gromnie: { label: 'Gromnie', weaknesses: ['cold', 'pierce', 'fire'] },
  reedshark: { label: 'Reedshark', weaknesses: ['lightning', 'slash', 'cold'] },
  critter: { label: 'Critter', weaknesses: ['pierce', 'fire', 'bludgeon'] },
  ursuin: { label: 'Ursuin', weaknesses: ['slash', 'pierce', 'fire'] },
  armoredillo: { label: 'Armoredillo', weaknesses: ['bludgeon', 'acid', 'lightning'] },
  lurker: { label: 'Lurker', weaknesses: ['acid', 'bludgeon', 'cold'] },
};

export const SPECIES_IDS = Object.keys(SPECIES);

// Name -> species, first match wins. Ordered so the specific beats the general
// ("Rat King" is vermin before "king" means anything).
const RULES = [
  [/drudge/i, 'drudge'],
  [/banderling/i, 'banderling'],
  [/mosswart/i, 'mosswart'],
  [/lugian/i, 'lugian'],
  [/virindi/i, 'virindi'],
  [/lich|skeleton|zombie|wight|undead|the lost light|daiklos/i, 'undead'],
  [/wisp|banshee|lost soul|tormented spirit|the innocent one/i, 'spirit'],
  [/golem|the deep foreman/i, 'golem'],
  [/rat|mite/i, 'vermin'],
  [/mukkir/i, 'mukkir'],
  [/olthoi/i, 'olthoi'],
  [/gromnie|fern guardian/i, 'gromnie'],
  [/reedshark/i, 'reedshark'],
  [/armoredillo|ironback/i, 'armoredillo'],
  [/ursuin/i, 'ursuin'],
  [/lurker|the mire warden/i, 'lurker'],
  [/shreth/i, 'shreth'],
  [/rabbit|chicken|auroch|carenzi/i, 'critter'],
  // Named humanoids that don't wear their species in their name.
  [/brogord|asuger/i, 'drudge'],
];

const DEFAULT_SPECIES = 'critter';

export function speciesOf(name) {
  if (!name) return DEFAULT_SPECIES;
  for (const [pattern, id] of RULES) {
    if (pattern.test(name)) return id;
  }
  return DEFAULT_SPECIES;
}

export function isSpeciesKnown(name) {
  return RULES.some(([pattern]) => pattern.test(name || ''));
}

export function speciesLabel(id) {
  return (SPECIES[id] || {}).label || id;
}

// The bonus percentage this damage type gets against this creature: 45/30/15 if
// it's on the list, 0 if it isn't. Never negative — see the note at the top.
export function weaknessBonusPct(damageType, monsterName) {
  // No target means no bonus. Falling through to the default species here would
  // hand out a weakness against nothing in particular.
  if (!monsterName || !damageType) return 0;
  const species = SPECIES[speciesOf(monsterName)];
  if (!species) return 0;
  const index = species.weaknesses.indexOf(damageType);
  return index === -1 ? 0 : WEAKNESS_TIERS[index].bonusPct;
}

// As a damage multiplier, which is how combat consumes it.
export function weaknessMultiplier(damageType, monsterName) {
  return 1 + weaknessBonusPct(damageType, monsterName) / 100;
}

// The three weaknesses of whatever this is, for the UI to show once you've met
// one — [{ damageType, bonusPct }], strongest first.
export function weaknessesOf(monsterName) {
  const species = SPECIES[speciesOf(monsterName)];
  if (!species) return [];
  return species.weaknesses.map((damageType, i) => ({ damageType, bonusPct: WEAKNESS_TIERS[i].bonusPct }));
}
