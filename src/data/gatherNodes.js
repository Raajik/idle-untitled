// Gathering nodes: explicit, clickable resource spots in town. Each ties to one
// of the 5 gathering skills and draws a random material from that skill's pool
// (see GATHER_MATERIAL_POOLS in data/materials.js) on completion.

export const GATHER_NODES = [
  { id: 'holtburg-iron-vein', regionId: 'holtburg', name: 'Iron Vein', skill: 'mining', gatherSeconds: 8 },
  { id: 'holtburg-tree-stand', regionId: 'holtburg', name: 'Old-Growth Stand', skill: 'woodcutting', gatherSeconds: 8 },
  { id: 'holtburg-game-trail', regionId: 'holtburg', name: 'Game Trail', skill: 'skinning', gatherSeconds: 8 },
  { id: 'holtburg-hedgerow', regionId: 'holtburg', name: 'Overgrown Hedgerow', skill: 'foraging', gatherSeconds: 8 },
  { id: 'holtburg-fishing-hole', regionId: 'holtburg', name: 'Quiet Fishing Hole', skill: 'fishing', gatherSeconds: 8 },
];

export function getGatherNode(nodeId) {
  return GATHER_NODES.find((n) => n.id === nodeId) || null;
}

export function nodesForRegion(regionId) {
  return GATHER_NODES.filter((n) => n.regionId === regionId);
}
