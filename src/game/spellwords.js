// Learning spells by listening to the things trying to kill you.
//
// Casters in Asheron's Call say their spells out loud, and the words are the
// spell. A drudge mystic that heals itself has just told you how; if you're
// paying attention you can say it back. That's the whole mechanic: no trainer,
// no unlock, just a rare moment in an ordinary fight that leaves you with
// something you didn't have.
//
// Two rules keep it from becoming noise:
//   - only casters shout, and casters are almost always humanoid (or the undead
//     things that used to be)
//   - a shout only teaches when it would actually teach you something. A
//     Regeneration II from a low drudge is worth nothing to someone already at
//     IV, so they hear it and move on.
//
// The level a monster teaches comes off its own level, so the deeper you hunt
// the better the words you catch — which is what makes an old spell worth
// re-learning rather than a box ticked once.

import { BUFF_SPELLS, buffAt, clampBuffLevel, effectText, MAX_BUFF_LEVEL } from '../data/buffSpells.js';
import { kindOf } from '../data/bestiary.js';
import { learnSpell, spellLevel, vitalClass } from './buffs.js';
import { pick, chance } from '../engine/rng.js';
import { addLog } from './state.js';

// Per monster attack. Deliberately small — this should be something that happens
// to you every so often, not a second loot table.
export const SPELLWORD_CHANCE = 0.006;

// Names that mark a monster as a caster regardless of kind, for the ones whose
// whole job is magic.
const CASTER_NAMES = /mystic|shaman|lich|wisp|banshee|virindi|warlock|sorcer|spirit/i;

// Who casts. Humanoids make and use magic; the undead remember how. Everything
// else is claws.
export function isCaster(monster) {
  if (!monster || !monster.name) return false;
  if (CASTER_NAMES.test(monster.name)) return true;
  const kind = kindOf(monster.name);
  return kind === 'humanoid' || kind === 'undead';
}

// What rank a monster of this level knows. A level-2 drudge teaches I; you need
// to be deep in the Direlands before anything is shouting VIII.
export function taughtLevel(monsterLevel) {
  return clampBuffLevel(1 + Math.floor((monsterLevel || 1) / 8));
}

// Rolls one monster attack's worth of overheard casting. Returns the spell id
// learned, or null — which is almost always.
export function rollSpellword(state, monster) {
  if (!isCaster(monster) || state.hero.dead) return null;
  if (!chance(SPELLWORD_CHANCE)) return null;

  const spell = pick(BUFF_SPELLS);
  const level = taughtLevel(monster.level);
  const known = spellLevel(state, spell.id);

  // It said the words either way; whether they're worth anything to you is the
  // difference between a moment and a line of noise.
  if (known >= level) {
    addLog(state, `${monster.name} shouts, "${spell.words}!" — words you already know.`, 'dim');
    return null;
  }

  addLog(state, `${monster.name} shouts, "${spell.words}!"`, 'boss');
  learnSpell(state, spell.id, level);
  const learned = buffAt(spell.id, level);
  addLog(
    state,
    `You watch what it does, and repeat the words: "${spell.words}..." You've learned ${learned.name}. [${effectText(spell.id, level)}]`,
    vitalClass(spell.id)
  );
  return spell.id;
}

export { MAX_BUFF_LEVEL };
