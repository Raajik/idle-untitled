// The opening beat: name the hero, then Alcott asks whether you've seen a Lifestone
// before. "Yes" skips straight to the ordinary game; "No" gets Alcott's explanation
// and flags the next walk into Holtburg as the scripted tutorial journey.

import { addLog } from './state.js';

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
  return true;
}
