// Trophies: the things you cut off a corpse that aren't gear and aren't
// tinkering stock. Rat tails, raw meat, and whatever else turns out to be worth
// carrying. They stack in `state.trophies` (id -> count) and are spent on quest
// and turn-in rewards.
//
// Kept separate from data/materials.js on purpose: materials feed Tinkering and
// have a slot category, while trophies are inert until something asks for them.
// A monster names the ones it leaves behind via its `drops` list (see
// data/tutorial.js and data/regions.js), and game/loot.js rolls them.

export const TROPHIES = [
  {
    id: 'raw-meat',
    name: 'Raw Meat',
    desc: 'Stringy, and going off already. Someone in Holtburg will want it anyway.',
  },
  {
    id: 'rat-tail',
    name: 'Rat Tail',
    desc: 'Proof of a rat, more or less. They are counted by the handful.',
  },
  {
    id: 'pristine-rat-tail',
    name: 'Pristine Rat Tail',
    desc: 'Unusually long, unusually intact. Worth more than a handful of the ordinary sort.',
  },
];

export function getTrophy(id) {
  return TROPHIES.find((t) => t.id === id) || null;
}
