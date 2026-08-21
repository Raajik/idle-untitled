// Training: pyreals -> percentage-scaling upgrades. Costs grow exponentially per rank.

export const TRAINING_TRACKS = [
  { id: 'atk', name: 'Combat Drills', desc: '+6% ATK per rank', baseCost: 120, growth: 1.9 },
  { id: 'hp', name: 'Endurance Training', desc: '+8% Max HP per rank', baseCost: 120, growth: 1.9 },
  { id: 'pyreals', name: 'Treasure Sense', desc: '+5% Pyreals per rank', baseCost: 250, growth: 2.0 },
];

export function trainingCost(trackId, currentRank) {
  const track = TRAINING_TRACKS.find((t) => t.id === trackId);
  return Math.floor(track.baseCost * Math.pow(track.growth, currentRank));
}

export function buyTraining(state, trackId) {
  const cost = trainingCost(trackId, state.training[trackId]);
  if (state.pyreals < cost) return false;
  state.pyreals -= cost;
  state.training[trackId] += 1;
  return true;
}
