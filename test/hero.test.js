import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xpForLevel, totalXpForLevel, levelFromTotalXp, grantXp, derivedStats, raiseAttribute, attributeCost, heroDps } from '../src/game/hero.js';
import { createInitialState } from '../src/game/state.js';

test('xpForLevel is strictly increasing (cubic AC curve)', () => {
  for (let lvl = 1; lvl < 50; lvl++) {
    assert.ok(xpForLevel(lvl + 1) > xpForLevel(lvl));
  }
  assert.equal(xpForLevel(1), 8);
  assert.equal(xpForLevel(2), 64);
});

test('level derives from total XP earned (cubic)', () => {
  assert.equal(levelFromTotalXp(0), 1);
  assert.equal(levelFromTotalXp(7), 1);
  assert.equal(levelFromTotalXp(8), 2);
  assert.equal(levelFromTotalXp(totalXpForLevel(5)), 5);
});

test('grantXp adds spendable XP and derives level', () => {
  const s = createInitialState();
  const levels = grantXp(s, 500);
  assert.ok(levels > 1);
  assert.ok(s.hero.level > 2);
  assert.equal(s.hero.xp, 500); // all XP is available to spend
  assert.equal(s.progress.totalXpEarned, 500);
});

test('raiseAttribute spends XP and rejects when too costly', () => {
  const s = createInitialState();
  assert.equal(raiseAttribute(s, 'str'), false); // no XP yet
  s.hero.xp = 1000;
  const before = s.hero.str;
  const cost = attributeCost(before);
  assert.equal(raiseAttribute(s, 'str'), true);
  assert.equal(s.hero.str, before + 1);
  assert.equal(s.hero.xp, 1000 - cost);
  assert.equal(raiseAttribute(s, 'nope'), false);
});

test('derivedStats scale with base stats', () => {
  const s = createInitialState();
  const before = derivedStats(s);
  s.hero.str = 20;
  s.hero.end = 20;
  const after = derivedStats(s);
  assert.ok(after.atk > before.atk);
  assert.ok(after.maxHp > before.maxHp);
  assert.ok(after.def > before.def);
});

test('equipment raises derived stats', () => {
  const s = createInitialState();
  const before = derivedStats(s);
  s.equipment.weapon = { slot: 'weapon', power: 10, spells: [{ id: 'atkPct', value: 10 }] };
  const after = derivedStats(s);
  assert.ok(after.atk > before.atk);
});

test('heroDps is positive and never zero against high def', () => {
  const s = createInitialState();
  assert.ok(heroDps(s, 0) > 0);
  assert.ok(heroDps(s, 99999) > 0); // floored at 1 dmg/hit
});
