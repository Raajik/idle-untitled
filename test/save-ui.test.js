import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOfflineProgress } from '../src/save.js';
import { createInitialState } from '../src/game/state.js';
import { unlockedTabs } from '../src/ui/unlocks.js';

test('offline progress grants kills, gold and xp proportional to time away', () => {
  const s = createInitialState();
  s.hero.str = 50; // strong enough to farm slimes quickly
  s.hero.vit = 50;
  s.lastSeen = Date.now() - 3600 * 1000; // 1 hour ago
  const summary = applyOfflineProgress(s);
  assert.ok(summary);
  assert.ok(summary.kills > 100);
  assert.ok(s.gold > 0);
  assert.ok(s.hero.level > 1);
});

test('offline progress ignores short absences', () => {
  const s = createInitialState();
  s.lastSeen = Date.now() - 30 * 1000; // 30 seconds
  assert.equal(applyOfflineProgress(s), null);
});

test('progressive UI unlocks derive from game state', () => {
  const s = createInitialState();
  let tabs = unlockedTabs(s).map((t) => t.id);
  assert.deepEqual(tabs, ['battle', 'settings']); // minimal start

  s.hero.level = 2;
  tabs = unlockedTabs(s).map((t) => t.id);
  assert.ok(tabs.includes('hero'));
  assert.ok(!tabs.includes('equipment'));

  s.progress.totalDrops = 1;
  s.progress.totalGoldEarned = 100;
  s.progress.bossesKilled = 1;
  s.rebirth.count = 1;
  tabs = unlockedTabs(s).map((t) => t.id);
  for (const id of ['hero', 'equipment', 'training', 'rebirth', 'overview']) {
    assert.ok(tabs.includes(id), `expected ${id} unlocked`);
  }
});
