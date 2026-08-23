// Achievements: one-time, permanent rewards for reaching a particular state.
// Unlike the Enlightenment upgrade tree these aren't bought, and unlike the
// unlocks table in ui/unlocks.js they aren't just UI gating — each one carries a
// real effect that feeds game/hero.js getBonuses().
//
// `effect` keys are getBonuses() keys. The regen ones are flat points per second
// on top of the percentage trickle in game/combat.js, so they matter most to a
// hero whose pools are still small.

export const ACHIEVEMENTS = [
  {
    id: 'vitae-hardened',
    name: 'Hardened by Vitae',
    desc: 'Carry the full 40% — whether you spent it at a Lifestone or earned it the hard way.',
    reward: '+5 HP, Stamina and Mana regeneration per second',
    effect: { hpRegenFlat: 5, staminaRegenFlat: 5, manaRegenFlat: 5 },
  },
];

export function getAchievement(id) {
  return ACHIEVEMENTS.find((a) => a.id === id) || null;
}

export function hasAchievement(state, id) {
  return state.achievements.includes(id);
}

// Every earned achievement's effects, summed, as a { key: value } object for
// game/hero.js to fold into its bonus table.
export function achievementBonuses(state) {
  const bonuses = {};
  for (const id of state.achievements) {
    const achievement = getAchievement(id);
    if (!achievement) continue;
    for (const [key, value] of Object.entries(achievement.effect)) {
      bonuses[key] = (bonuses[key] || 0) + value;
    }
  }
  return bonuses;
}
