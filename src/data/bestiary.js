// What each creature *is*, as opposed to where it lives. Regions describe
// places; this describes the things in them, and it lives apart so a creature
// that turns up in three dungeons is classified once.
//
// Two facts, and both of them are about loot (see game/loot.js):
//
//   kind — humanoids use tools, wear armour and carry purses, so gear turns up
//          on them far more often than on something that has never held a
//          sword. Beasts, constructs and spirits are the other way round.
//   size — a rat cannot be carrying a breastplate. Anything small is capped at
//          jewelry: a ring or a bangle it swallowed or nested with is
//          believable, a set of greaves is not.
//
// Classification is by exact name with a keyword fallback, so a new monster
// added to regions.js is never silently unclassified — test/bestiary.test.js
// asserts every creature in the game resolves, and the fallback is what stops a
// typo becoming a crash.

export const KINDS = ['humanoid', 'beast', 'undead', 'construct', 'spirit'];
export const SIZES = ['small', 'medium', 'large'];

// Matched in order against a monster's name, first hit wins. Ordered so that
// more specific words come before the families that contain them.
const RULES = [
  // --- Humanoids: things that make and carry equipment ---
  [/drudge/i, 'humanoid', 'medium'],
  [/banderling/i, 'humanoid', 'medium'],
  [/mosswart/i, 'humanoid', 'medium'],
  [/lugian/i, 'humanoid', 'large'],
  [/virindi/i, 'humanoid', 'medium'],
  [/brogord|asuger|the deep foreman/i, 'humanoid', 'medium'],

  // --- Undead: were humanoid, and still wearing what they died in ---
  [/lich|skeleton|zombie|wight|undead|the lost light|daiklos/i, 'undead', 'medium'],

  // --- Spirits: no hands, no pockets ---
  [/wisp/i, 'spirit', 'small'],
  [/banshee|lost soul|tormented spirit|the innocent one/i, 'spirit', 'medium'],

  // --- Constructs: made of the floor ---
  [/golem/i, 'construct', 'large'],

  // --- Beasts ---
  [/mite/i, 'beast', 'small'],
  [/rat king/i, 'beast', 'medium'], // a king is a great many rats
  [/rat|rabbit|chicken/i, 'beast', 'small'],
  [/spawnling|nymph/i, 'beast', 'small'],
  [/mukkir queen|olthoi soldier/i, 'beast', 'large'],
  [/mukkir|olthoi/i, 'beast', 'medium'],
  [/gromnie|fern guardian/i, 'beast', 'large'],
  [/shreth|reedshark|lurker|the mire warden/i, 'beast', 'medium'],
];

const UNCLASSIFIED = { kind: 'beast', size: 'medium' };

export function classify(name) {
  if (!name) return UNCLASSIFIED;
  for (const [pattern, kind, size] of RULES) {
    if (pattern.test(name)) return { kind, size };
  }
  return UNCLASSIFIED;
}

export function kindOf(name) {
  return classify(name).kind;
}

export function sizeOf(name) {
  return classify(name).size;
}

// Whether a name matched a rule at all, rather than falling through to the
// default. Only the completeness test cares — the game is happy either way.
export function isClassified(name) {
  return RULES.some(([pattern]) => pattern.test(name || ''));
}
