// Gathering: a timed action at a resource node, suspending combat while it
// runs (same pattern as travel). On completion, grants a random material from
// the node's skill-themed pool plus skill xp.

import { getGatherNode } from '../data/gatherNodes.js';
import { GATHER_MATERIAL_POOLS, getMaterial } from '../data/materials.js';
import { pick } from '../engine/rng.js';
import { trainSkill } from './skills.js';
import { addLog } from './state.js';

const GATHER_XP_PER_ACTION = 12;

export function startGathering(state, nodeId) {
  const node = getGatherNode(nodeId);
  if (!node) return false;
  if (state.travel || state.gathering) return false;
  if (state.location.regionId !== node.regionId || state.location.poiId) return false; // must be in that region's town

  state.gathering = { nodeId, remaining: node.gatherSeconds, duration: node.gatherSeconds };
  addLog(state, `You set to work at the ${node.name}...`, 'dim');
  return true;
}

function finishGathering(state) {
  const node = getGatherNode(state.gathering.nodeId);
  state.gathering = null;
  if (!node) return;

  const pool = GATHER_MATERIAL_POOLS[node.skill] || [];
  const materialId = pool.length ? pick(pool) : null;
  if (materialId) {
    state.materials[materialId] = (state.materials[materialId] || 0) + 1;
    const material = getMaterial(materialId);
    addLog(state, `You gather 1 ${material ? material.name : materialId}.`, 'good');
  }
  trainSkill(state, state.hero.skills.gathering[node.skill], node.skill[0].toUpperCase() + node.skill.slice(1), GATHER_XP_PER_ACTION);
}

// Called every combat tick. Returns true if gathering consumed the tick
// (combat should not run this tick).
export function tickGathering(state, dt) {
  if (!state.gathering) return false;
  state.gathering.remaining -= dt;
  if (state.gathering.remaining <= 0) finishGathering(state);
  return true;
}
