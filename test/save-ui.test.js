import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOfflineProgress } from '../src/save.js';
import { createInitialState } from '../src/game/state.js';
import { unlockedTabs } from '../src/ui/unlocks.js';

test('offline progress grants kills, pyreals and xp proportional to time away', () => {
  const s = createInitialState();
  s.hero.str = 50; // strong enough to farm drudges quickly
  s.hero.end = 50;
  s.progress.unlockedRegions = ['holtburg'];
  s.location = { regionId: 'holtburg', poiId: 'holtburg-meeting-hall' };
  s.lastSeen = Date.now() - 3600 * 1000; // 1 hour ago
  const summary = applyOfflineProgress(s);
  assert.ok(summary);
  assert.ok(summary.kills > 100);
  assert.ok(s.pyreals > 0);
  assert.ok(s.hero.level > 1);
});

test('offline progress finishes an in-progress walk and trains Run', () => {
  const s = createInitialState();
  s.travel = { kind: 'region', id: 'holtburg', remaining: 10, duration: 30 };
  s.lastSeen = Date.now() - 120 * 1000; // 2 minutes ago, plenty to finish a 10s walk
  applyOfflineProgress(s);
  assert.equal(s.travel, null);
  assert.equal(s.location.regionId, 'holtburg');
  assert.ok(s.hero.skills.run.xp > 0 || s.hero.skills.run.rank > 0);
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
  assert.ok(tabs.includes('attributes'));
  assert.ok(!tabs.includes('inventory'));

  s.progress.totalDrops = 1;
  s.progress.totalPyrealsEarned = 10000;
  s.progress.bossesKilled = 1;
  s.progress.visitedPois = ['holtburg-meeting-hall'];
  s.rebirth.count = 1;
  tabs = unlockedTabs(s).map((t) => t.id);
  for (const id of ['attributes', 'skills', 'inventory', 'training', 'rebirth', 'overview']) {
    assert.ok(tabs.includes(id), `expected ${id} unlocked`);
  }
});
