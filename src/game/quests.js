// Running quests: what's open, whether you can hand it in, and what happens when
// you do.
//
// Progress isn't tracked as you play. An objective is checked against what
// you're carrying at the moment you look, which means a quest taken after you'd
// already hoarded the thing counts that hoard, and nothing has to reach into
// combat to tick a counter. The cost is that "kill N drudges" has to be counted
// somewhere, so kills are the one thing kept as a tally (state.progress.kills).

import {
  QUESTS,
  getQuest,
  questKey,
  questIdFromKey,
  REPUTATION_PER_QUEST,
  THOROLF_TAG,
  THOROLF_WEAPON_POWER,
  THOROLF_WEAPON_RARITY,
} from '../data/quests.js';
import { getTrophy } from '../data/trophies.js';
import { getMaterial, totalOfKind, kindLabel } from '../data/materials.js';
import { speciesLabel } from '../data/species.js';
import { grantConsumable } from './consumables.js';
import { grantXp } from './hero.js';
import { generateItem, maybeAutoEquip } from './loot.js';
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
    // Loose in the pack only. Whatever you've equipped is what you're keeping,
    // so equipping the one you settled on IS the act of choosing it.
    case 'questItem':
      return state.inventory.filter((it) => it.questTag === objective.id).length;
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
    case 'questItem':
      return `${n} borrowed weapons back in your pack`;
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
  } else if (objective.kind === 'questItem') {
    // `takeAll` means the giver wants back everything of his you're still
    // carrying, not a counted seven off the top — so "keep one" is decided by
    // what you equipped, and handing in never picks the keeper out of your pack.
    let owed = objective.takeAll ? Infinity : n;
    state.inventory = state.inventory.filter((it) => {
      if (owed > 0 && it.questTag === objective.id) {
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

// Whether a quest is allowed to exist here yet: the right town, and whatever it
// waits on already handed in. A giver can hold several quests, and this is what
// makes them a chain rather than a pile.
export function questUnlocked(state, def, regionId) {
  if (def.region && def.region !== regionId) return false;
  if (!def.requires) return true;
  return state.progress.quests[questKey(def.requires, regionId)] === 'done';
}

// Opens every quest a town offers, on arrival. Anything already done stays done,
// and anything still waiting on a prerequisite opens later — completeQuest calls
// back here so the next link appears the moment the one before it is paid out.
export function openQuestsFor(state, regionId) {
  for (const def of QUESTS) {
    if (!questUnlocked(state, def, regionId)) continue;
    const key = questKey(def.id, regionId);
    if (!state.progress.quests[key]) state.progress.quests[key] = 'active';
  }
}

// The quest a giver is currently offering in this region, or null. Definition
// order is chain order, so a giver mid-chain offers the earliest open link.
export function questForGiver(state, regionId, giverType) {
  for (const def of QUESTS) {
    if (def.giver !== giverType) continue;
    if (def.region && def.region !== regionId) continue;
    const key = questKey(def.id, regionId);
    if (isQuestOpen(state, key)) return { def, key };
  }
  return null;
}

// What the player picked for a quest that pays a choice, or null. A choice must
// be made before it can be handed in — there is no default, because the whole
// reward is the decision.
export function questChoice(state, key) {
  const chosen = (state.ui.questChoice || {})[key];
  const def = getQuest(questIdFromKey(key));
  const choice = def && def.rewards && def.rewards.choice;
  if (!choice) return null;
  return choice.options.includes(chosen) ? chosen : null;
}

export function setQuestChoice(state, key, option) {
  const def = getQuest(questIdFromKey(key));
  const choice = def && def.rewards && def.rewards.choice;
  if (!choice || !choice.options.includes(option)) return false;
  if (!state.ui.questChoice) state.ui.questChoice = {};
  state.ui.questChoice[key] = option;
  return true;
}

export function canCompleteQuest(state, key) {
  const def = getQuest(questIdFromKey(key));
  if (!def || !isQuestOpen(state, key)) return false;
  if (def.rewards && def.rewards.choice && !questChoice(state, key)) return false;
  return objectiveMet(state, def.objective);
}

// The practice rack, made real. Every weapon rolls identical — same power, same
// rarity — and carries the tag that marks it as lent rather than found.
function grantQuestWeapons(state, baseTypes, tag) {
  const granted = [];
  for (const baseType of baseTypes) {
    const item = generateItem(THOROLF_WEAPON_POWER, {
      forceSlot: 'weapon',
      forceBaseType: baseType,
      forceRarity: THOROLF_WEAPON_RARITY,
    });
    item.questTag = tag;
    state.inventory.push(item);
    granted.push(item);
  }
  // Handing someone eight weapons and letting them walk out bare-handed is how
  // the first hour became a loop of whiffing, dying, and a three-minute walk
  // back from the Lifestone. Thorolf's rack is practice gear — he'd rather see
  // one of his weapons in your hand than watch you punch a drudge. The keeper
  // is whichever you equip; the return quest already counts only what's still
  // loose in the pack, so this changes nothing about the hand-in.
  if (!state.equipment.weapon && !state.settings.autoEquip) return granted;
  for (const item of granted) {
    if (maybeAutoEquip(state, item)) break;
  }
  return granted;
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

  const weapons = rewards.weapons ? grantQuestWeapons(state, rewards.weapons, THOROLF_TAG) : [];

  const chosen = rewards.choice ? questChoice(state, key) : null;
  if (chosen && rewards.choice.kind === 'material') {
    state.materials[chosen] = (state.materials[chosen] || 0) + rewards.choice.count;
  }

  const paid = [
    rewards.xp ? `${rewards.xp} XP` : null,
    `+${rep} reputation`,
    (rewards.skills || []).length ? `the ${(rewards.skills || []).join(', ')} skill` : null,
    Object.keys(rewards.consumables || {}).length
      ? Object.entries(rewards.consumables).map(([id, n]) => `${n} ${id.replace(/-/g, ' ')}`).join(', ')
      : null,
    weapons.length ? `${weapons.length} weapons off the rack` : null,
    chosen ? `${rewards.choice.count} ${(getMaterial(chosen) || {}).name || chosen}` : null,
  ].filter(Boolean);
  addLog(state, `"${def.title}" — done. ${paid.join(' · ')}.`, 'good');

  // The next link in this giver's chain, now that this one is paid.
  openQuestsFor(state, regionId);
  return { def, paid };
}

// Every kill is counted by species, because "kill N of these" is the one
// objective that can't be read off what you're carrying.
export function recordKill(state, species) {
  if (!species) return;
  state.progress.kills[species] = (state.progress.kills[species] || 0) + 1;
}

export { REPUTATION_PER_QUEST };
