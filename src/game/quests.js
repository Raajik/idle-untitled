// Running quests: what's open, whether you can hand it in, and what happens when
// you do.
//
// Progress isn't tracked as you play. An objective is checked against what
// you're carrying at the moment you look, which means a quest taken after you'd
// already hoarded the thing counts that hoard, and nothing has to reach into
// combat to tick a counter. The cost is that "kill N drudges" has to be counted
// somewhere, so kills are the one thing kept as a tally (state.progress.kills).

import { QUESTS, getQuest, questKey, questIdFromKey, REPUTATION_PER_QUEST } from '../data/quests.js';
import { getTrophy } from '../data/trophies.js';
import { getMaterial, totalOfKind, kindLabel } from '../data/materials.js';
import { speciesLabel } from '../data/species.js';
import { grantConsumable } from './consumables.js';
import { grantXp } from './hero.js';
import { addLog } from './state.js';

// --- Reputation ---

export function reputation(state, regionId) {
  return (state.progress.reputation && state.progress.reputation[regionId]) || 0;
}

export function grantReputation(state, regionId, amount) {
  if (!regionId || amount <= 0) return 0;
  state.progress.reputation[regionId] = reputation(state, regionId) + amount;
  return state.progress.reputation[regionId];
}

// --- Objectives ---

// How much of an objective you're currently holding.
export function objectiveHave(state, objective) {
  if (!objective) return 0;
  switch (objective.kind) {
    case 'trophy':
      return state.trophies[objective.id] || 0;
    case 'material':
      return state.materials[objective.id] || 0;
    case 'kind':
      return totalOfKind(state, objective.id);
    case 'kill':
      return (state.progress.kills && state.progress.kills[objective.id]) || 0;
    case 'item':
      return state.inventory.filter((it) => it.slot === objective.id).length;
    default:
      return 0;
  }
}

// What the objective is asking for, in words.
export function objectiveText(objective) {
  if (!objective) return '';
  const n = objective.count;
  switch (objective.kind) {
    case 'trophy': {
      const t = getTrophy(objective.id);
      return `${n} ${t ? t.name : objective.id}`;
    }
    case 'material': {
      const m = getMaterial(objective.id);
      return `${n} ${m ? m.name : objective.id}`;
    }
    case 'kind':
      return `${n} ${kindLabel(objective.id).toLowerCase()}`;
    case 'kill':
      return `${n} ${speciesLabel(objective.id)}`;
    case 'item':
      return `${n} ${objective.id.replace(/([A-Z])/g, ' $1').toLowerCase()}`;
    default:
      return '';
  }
}

export function objectiveMet(state, objective) {
  return !objective || objectiveHave(state, objective) >= objective.count;
}

// Hands over what the objective asked for. Kills aren't taken back — you can't
// un-kill a drudge — but goods are.
function spendObjective(state, objective) {
  if (!objective) return;
  const n = objective.count;
  if (objective.kind === 'trophy') state.trophies[objective.id] -= n;
  else if (objective.kind === 'material') state.materials[objective.id] -= n;
  else if (objective.kind === 'kind') {
    let owed = n;
    for (const id of Object.keys(state.materials)) {
      if (owed <= 0) break;
      if (getMaterial(id) && (state.materials[id] || 0) > 0) {
        const take = Math.min(owed, state.materials[id]);
        state.materials[id] -= take;
        owed -= take;
      }
    }
  } else if (objective.kind === 'item') {
    let owed = n;
    state.inventory = state.inventory.filter((it) => {
      if (owed > 0 && it.slot === objective.id) {
        owed -= 1;
        return false;
      }
      return true;
    });
  } else if (objective.kind === 'kill') {
    state.progress.kills[objective.id] = Math.max(0, (state.progress.kills[objective.id] || 0) - n);
  }
}

// --- Open, check, complete ---

export function questStatus(state, key) {
  return state.progress.quests[key] || null;
}

export function isQuestOpen(state, key) {
  return questStatus(state, key) === 'active';
}

// Opens every quest a town offers, on arrival. Anything already done stays done.
export function openQuestsFor(state, regionId) {
  for (const def of QUESTS) {
    const key = questKey(def.id, regionId);
    if (!state.progress.quests[key]) state.progress.quests[key] = 'active';
  }
}

// The quest a giver is currently offering in this region, or null.
export function questForGiver(state, regionId, giverType) {
  for (const def of QUESTS) {
    if (def.giver !== giverType) continue;
    const key = questKey(def.id, regionId);
    if (isQuestOpen(state, key)) return { def, key };
  }
  return null;
}

export function canCompleteQuest(state, key) {
  const def = getQuest(questIdFromKey(key));
  if (!def || !isQuestOpen(state, key)) return false;
  return objectiveMet(state, def.objective);
}

// Hands a quest in. Returns what it paid, or null if it wasn't ready.
export function completeQuest(state, key, regionId) {
  if (!canCompleteQuest(state, key)) return null;
  const def = getQuest(questIdFromKey(key));
  spendObjective(state, def.objective);
  state.progress.quests[key] = 'done';

  const rewards = def.rewards || {};
  const rep = rewards.reputation ?? REPUTATION_PER_QUEST;
  grantReputation(state, regionId, rep);
  if (rewards.xp) grantXp(state, rewards.xp);
  for (const skill of rewards.skills || []) {
    if (!state.hero.skills[skill]) state.hero.skills[skill] = { rank: 0, xp: 0 };
  }
  for (const [id, n] of Object.entries(rewards.consumables || {})) grantConsumable(state, id, n);
  if (rewards.unlocks) state.progress[rewards.unlocks] = true;

  const paid = [
    rewards.xp ? `${rewards.xp} XP` : null,
    `+${rep} reputation`,
    (rewards.skills || []).length ? `the ${(rewards.skills || []).join(', ')} skill` : null,
    Object.keys(rewards.consumables || {}).length
      ? Object.entries(rewards.consumables).map(([id, n]) => `${n} ${id.replace(/-/g, ' ')}`).join(', ')
      : null,
  ].filter(Boolean);
  addLog(state, `"${def.title}" — done. ${paid.join(' · ')}.`, 'good');
  return { def, paid };
}

// Every kill is counted by species, because "kill N of these" is the one
// objective that can't be read off what you're carrying.
export function recordKill(state, species) {
  if (!species) return;
  state.progress.kills[species] = (state.progress.kills[species] || 0) + 1;
}

export { REPUTATION_PER_QUEST };
