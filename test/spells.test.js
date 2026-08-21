import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spellLevelCeiling, rollSpellLevel, rollSpell, spellBonusKey, MAX_SPELL_LEVEL } from '../src/data/spells.js';

test('spellLevelCeiling rises with POI depth and region tier, capped at MAX_SPELL_LEVEL', () => {
  assert.equal(spellLevelCeiling(0, 0), 1); // fresh Holtburg: level 1 only
  assert.ok(spellLevelCeiling(3, 0) < MAX_SPELL_LEVEL); // deep in a starting region, still capped below max
  assert.equal(spellLevelCeiling(3, 5), MAX_SPELL_LEVEL); // deep in a late-game region hits the cap
});

test('rollSpellLevel stays within 1..ceiling and skews toward the low end', () => {
  const ceiling = 8;
  let sum = 0;
  const n = 500;
  for (let i = 0; i < n; i++) {
    const lvl = rollSpellLevel(ceiling);
    assert.ok(lvl >= 1 && lvl <= ceiling);
    sum += lvl;
  }
  assert.ok(sum / n < ceiling * 0.6);
});

test('rollSpell produces a leveled, labeled spell with a valid bonus key', () => {
  const s = rollSpell('weapon', 3);
  assert.ok(s);
  assert.equal(s.level, 3);
  assert.ok(s.label.length > 0);
  assert.ok(spellBonusKey(s));
});
