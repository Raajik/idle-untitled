// Monster stats are derived from a single `level` number instead of hand-tuned
// hp/atk/xp/pyreals per entry — keeps numbers small and consistent, and gives every
// monster a level to show the player roughly how tough it is relative to the hero.
//
// HP is tuned so a hero whose Strength has kept pace with the content (roughly
// str = 5 + level*2) needs about 8-12 successful hits to drop a normal monster —
// how MANY of the hero's swings that takes depends on their offense skill rank
// (see game/skills.js `hitChance`), so undertrained skills mean more total swings,
// not more raw monster toughness.

export function monsterStatsForLevel(level) {
  return {
    hp: Math.round(100 + level * 26),
    atk: Math.round(2 + level * 1.1),
    def: Math.floor(level * 0.4),
    xp: Math.round(12 + level * 7),
    pyreals: Math.round(8 + level * 5),
    dodge: Math.min(25, 5 + level * 0.25), // % chance to dodge the hero's attack
    maxStamina: Math.round(10 + level * 1.5), // spent each time it successfully dodges
  };
}

export function bossStatsForLevel(level) {
  const base = monsterStatsForLevel(level);
  return {
    ...base,
    hp: Math.round(base.hp * 3.2),
    atk: Math.round(base.atk * 1.3),
    def: Math.round(base.def * 1.4),
    xp: Math.round(base.xp * 6),
    pyreals: Math.round(base.pyreals * 6),
    maxStamina: Math.round(base.maxStamina * 2),
  };
}
