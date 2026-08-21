import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xpForLevel, grantXp, derivedStats, allocateStat, heroDps } from '../src/game/hero.js';
import { createInitialState } from '../src/game/state.js';

test('xpForLevel is strictly increasing', () => {
  for (let lvl = 1; lvl < 50; lvl++) {
    assert.ok(xpForLevel(lvl + 1) > xpForLevel(lvl));
  }
});

test('grantXp handles multi-level jumps and awards stat points', () => {
  const s = createInitialState();
  const levels = grantXp(s, 10000);
  assert.ok(levels > 1);
  assert.equal(s.hero.statPoints, levels * 3);
  assert.ok(s.hero.level > 2);
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

test('allocateStat spends points only when available', () => {
  const s = createInitialState();
  assert.equal(allocateStat(s, 'str'), false); // 0 points
  s.hero.statPoints = 1;
  assert.equal(allocateStat(s, 'str'), true);
  assert.equal(s.hero.str, 6);
  assert.equal(allocateStat(s, 'nope'), false);
});

test('equipment raises derived stats', () => {
  const s = createInitialState();
  const before = derivedStats(s);
  s.equipment.weapon = { slot: 'weapon', power: 10, affixes: [{ id: 'atkPct', value: 10 }] };
  const after = derivedStats(s);
  assert.ok(after.atk > before.atk);
});

test('heroDps is positive and never zero against high def', () => {
  const s = createInitialState();
  assert.ok(heroDps(s, 0) > 0);
  assert.ok(heroDps(s, 99999) > 0); // floored at 1 dmg/hit
});
