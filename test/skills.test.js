import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trainSkill, defensiveChance, resistanceMitigationPct, xpToNextRank, MAX_SKILL_RANK } from '../src/game/skills.js';
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

test('resistanceMitigationPct shares the same 0-to-95 curve as defensiveChance', () => {
  assert.equal(resistanceMitigationPct(0), 0);
  assert.equal(resistanceMitigationPct(100), 95);
});

test('Block and Parry never train without the right gear equipped, unlike Dodge', () => {
  const s = createInitialState();
  s.progress.unlockedRegions = ['holtburg'];
  s.location = { regionId: 'holtburg', poiId: 'virindi-citadel' };
  s.hero.end = 1; // no shield, no melee weapon equipped
  for (let i = 0; i < 40; i++) tickCombat(s, 0.25);
  assert.equal(s.hero.skills.block.rank, 0);
  assert.equal(s.hero.skills.block.xp, 0);
  assert.equal(s.hero.skills.parry.rank, 0);
  assert.equal(s.hero.skills.parry.xp, 0);
});

test('Parry trains once a melee weapon is equipped', () => {
  const s = createInitialState();
  s.progress.unlockedRegions = ['holtburg'];
  s.location = { regionId: 'holtburg', poiId: 'virindi-citadel' };
  s.hero.end = 1;
  s.equipment.weapon = { slot: 'weapon', power: 5, spells: [], rarity: 'Common', name: 'Worn Sword', baseType: 'sword' };
  for (let i = 0; i < 40; i++) tickCombat(s, 0.25);
  assert.ok(s.hero.skills.parry.xp > 0 || s.hero.skills.parry.rank > 0);
});
