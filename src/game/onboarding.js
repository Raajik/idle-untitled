// The opening beat: name the hero, then Alcott asks whether you've seen a Lifestone
// before. "Yes" skips straight to the ordinary game; "No" gets Alcott's explanation
// and flags the next walk into Holtburg as the scripted tutorial journey.

import { ALCOTT_GIFTS, getConsumable } from '../data/consumables.js';
import { ALCOTT_TAUGHT_SPELLS, getBuffSpell } from '../data/buffSpells.js';
import { grantConsumable } from './consumables.js';
import { learnSpell } from './buffs.js';
import { addLog } from './state.js';

// Whichever way the intro goes, Alcott doesn't send anyone down that road
// empty-handed: a kit, a potion, and the three spells every Isparian is expected
// to know. The kit is what makes auto-healing possible at all, and the potion is
// the first alchemy anyone ever meets.
function alcottOutfitsYou(state) {
  for (const id of ALCOTT_GIFTS) {
    grantConsumable(state, id);
    const def = getConsumable(id);
    if (def && def.unlocks === 'autoHealUnlocked') state.progress.autoHealUnlocked = true;
  }
  for (const id of ALCOTT_TAUGHT_SPELLS) learnSpell(state, id, 1);

  const gifts = ALCOTT_GIFTS.map((id) => getConsumable(id).name).join(' and a ');
  const spells = ALCOTT_TAUGHT_SPELLS.map((id) => getBuffSpell(id).name).join(', ');
  addLog(state, `Alcott presses a ${gifts} into your hands.`, 'good');
  addLog(state, `He walks you through ${spells} until you can hold all three. "Every Isparian knows these. Now you do."`, 'good');
}

export function setHeroName(state, rawName) {
  const name = rawName.trim().slice(0, 24);
  if (!name) return false;
  state.hero.name = name;
  state.onboarding.step = 'seen-lifestone';
  return true;
}

export function answerSeenLifestone(state, hasSeenBefore) {
  if (state.onboarding.step !== 'seen-lifestone') return false;
  if (hasSeenBefore) {
    state.onboarding.step = 'done';
    addLog(state, `"Good, good — one less thing to explain." Alcott waves you toward the road to Holtburg.`, 'dim');
    alcottOutfitsYou(state);
  } else {
    state.onboarding.step = 'alcott-explains';
  }
  return true;
}

export function acknowledgeAlcottIntro(state) {
  if (state.onboarding.step !== 'alcott-explains') return false;
  state.onboarding.step = 'done';
  state.onboarding.tutorialPending = true;
  addLog(state, `Alcott points toward a distant village. "That's Holtburg. Stay sharp — and if you find trouble, my friend Thorolf there can help you get your bearings."`, 'dim');
  alcottOutfitsYou(state);
  return true;
}
