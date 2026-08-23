// What Tinkering does with a material, per weapon class.
//
// Working a weapon is a decision, not a slot pull: a given material always
// teaches the same property, so you farm the dungeon that drops the thing you
// want. Velvet, brass and oak are wanted by every class — accuracy, guard and
// speed are universal virtues — while each class has one or two of its own, so
// most dungeons stay worth visiting whatever you're holding.
//
// Values are spell ids from data/spells.js. Non-weapon slots aren't listed here;
// they still roll a random applicable spell (see game/tinkering.js), since armor
// and jewelry have no equivalent of a weapon class to key off.

export const TINKER_RECIPES = {
  melee: {
    iron: 'weaponDamage', // sharper
    granite: 'minDamage', // tempered: rolls closer to its best hit
    velvet: 'hitChance', // a grip that doesn't slip
    brass: 'guard', // fittings you can turn a blow with — melee can use all three layers
    oak: 'attackSpeed', // a lighter haft
  },
  ranged: {
    mahogany: 'weaponDamage',
    velvet: 'hitChance',
    brass: 'evasion',
    oak: 'attackSpeed',
  },
  magic: {
    'green-garnet': 'magicDamage',
    velvet: 'hitChance',
    brass: 'evasion',
    opal: 'spellEfficiency', // less mana per cast
    oak: 'attackSpeed', // casting speed is the same property under the hood
  },
};

// The spell a material teaches a weapon of this class, or null if that class has
// no use for it.
export function recipeFor(weaponClassName, materialId) {
  const recipes = TINKER_RECIPES[weaponClassName];
  return (recipes && recipes[materialId]) || null;
}

// Every material a weapon class accepts, for the Tinkering tab to list.
export function materialsForWeaponClass(weaponClassName) {
  return Object.keys(TINKER_RECIPES[weaponClassName] || {});
}
