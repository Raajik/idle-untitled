import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import { availableShortcutsFrom, canJump, jumpTo } from '../src/game/shortcuts.js';

test('a shortcut is only available once Athletics reaches its required rank', () => {
  const s = createInitialState();
  s.progress.unlockedRegions = ['holtburg'];
  s.location = { regionId: 'holtburg', poiId: 'holtburg-meeting-hall' };
  assert.equal(availableShortcutsFrom(s).length, 0);
  s.hero.skills.athletics.rank = 10;
  const available = availableShortcutsFrom(s);
  assert.ok(available.some((sc) => sc.id === 'meeting-hall-rat-nest'));
});

test('jumpTo instantly relocates and starts a cooldown that blocks a second jump', () => {
  const s = createInitialState();
  s.progress.unlockedRegions = ['holtburg'];
  s.location = { regionId: 'holtburg', poiId: 'holtburg-meeting-hall' };
  s.hero.skills.athletics.rank = 10;

  assert.equal(jumpTo(s, 'meeting-hall-rat-nest'), true);
  assert.equal(s.location.poiId, 'rat-nest');
  assert.ok(s.progress.jumpCooldown > 0);
  assert.equal(canJump(s), false);

  // Jumping back immediately should fail — still on cooldown.
  assert.equal(jumpTo(s, 'meeting-hall-rat-nest'), false);
  assert.equal(s.location.poiId, 'rat-nest');
});
