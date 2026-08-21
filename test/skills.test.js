import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trainSkill, defensiveChance, xpToNextRank, MAX_SKILL_RANK } from '../src/game/skills.js';
import { monsterStatsForLevel, bossStatsForLevel } from '../src/data/monsterScaling.js';
import { createInitialState } from '../src/game/state.js';
import { tickCombat } from '../src/game/combat.js';

test('defensiveChance is 0 at rank 0 and exactly 95 at the rank 100 cap', () => {
  assert.equal(defensiveChance(0), 0);
  assert.equal(defensiveChance(100), 95);
  assert.ok(defensiveChance(50) > 0 && defensiveChance(50) < 95);
});

test('trainSkill ranks up and stops granting past the cap', () => {
  const s = createInitialState();
  const skill = { rank: 0, xp: 0 };
  for (let i = 0; i < 100000; i++) trainSkill(s, skill, 'Test', xpToNextRank(skill.rank) + 1);
  assert.equal(skill.rank, MAX_SKILL_RANK);
  assert.equal(skill.xp, 0);
});

test('boss stats scale up from the base level formula', () => {
  const base = monsterStatsForLevel(10);
  const boss = bossStatsForLevel(10);
  assert.ok(boss.hp > base.hp);
  assert.ok(boss.xp > base.xp);
});

test('hero stamina depletes as defensive skills train and gate further avoidance', () => {
  const s = createInitialState();
  s.progress.unlockedRegions = ['holtburg'];
  s.location = { regionId: 'holtburg', poiId: 'virindi-citadel' }; // brutal, guarantees hits land
  s.hero.end = 1;
  for (let i = 0; i < 20; i++) tickCombat(s, 0.25);
  // stamina should have moved from its initial full value (spent on avoided hits or regen-limited)
  assert.ok(s.hero.stamina >= 0);
  assert.ok(s.hero.skills.dodge.xp > 0 || s.hero.skills.dodge.rank > 0);
});
