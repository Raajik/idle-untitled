import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveGame, suppressSave } from '../src/save.js';

test('suppressSave makes saveGame a no-op (blocks unload re-save on hard reset)', () => {
  const state = { lastSeen: 0 };
  suppressSave();
  saveGame(state);
  assert.equal(state.lastSeen, 0, 'saveGame should return early and not touch lastSeen');
});
