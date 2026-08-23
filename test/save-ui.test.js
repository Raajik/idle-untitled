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
  s.location = { regionId: 'holtburg', poiId: 'drudge-hideout' };
  s.lastSeen = Date.now() - 3600 * 1000; // 1 hour ago
  const summary = applyOfflineProgress(s);
  assert.ok(summary);
  assert.ok(summary.kills > 100);
  assert.ok(s.pyreals > 0);
  assert.ok(s.hero.level > 1);
});

test('offline progress finishes an in-progress walk and trains Athletics', () => {
  const s = createInitialState();
  s.travel = { kind: 'region', id: 'holtburg', remaining: 10, duration: 30 };
  s.lastSeen = Date.now() - 120 * 1000; // 2 minutes ago, plenty to finish a 10s walk
  applyOfflineProgress(s);
  assert.equal(s.travel, null);
  assert.equal(s.location.regionId, 'holtburg');
  assert.ok(s.hero.skills.athletics.xp > 0 || s.hero.skills.athletics.rank > 0);
});

test('offline progress ignores short absences', () => {
  const s = createInitialState();
  s.lastSeen = Date.now() - 30 * 1000; // 30 seconds
  assert.equal(applyOfflineProgress(s), null);
});

test('progressive UI unlocks derive from game state', () => {
  const s = createInitialState();
  let tabs = unlockedTabs(s).map((t) => t.id);
  // Both hidden ones are routable from the start: the footer gear and the
  // Upkeep panel's gear have to work on a save with nothing else open.
  assert.deepEqual(tabs, ['battle', 'settings', 'upkeep']); // minimal start

  s.hero.level = 2;
  tabs = unlockedTabs(s).map((t) => t.id);
  assert.ok(tabs.includes('attributes'));
  assert.ok(!tabs.includes('inventory'));

  s.inventory.push({ id: 1, slot: 'weapon', power: 5, spells: [], rarity: 'Common', name: 'Worn Sword' });
  s.progress.totalPyrealsEarned = 10000;
  s.progress.totalClears = 1;
  s.progress.visitedPois = ['drudge-hideout'];
  s.enlightenment.count = 1;
  tabs = unlockedTabs(s).map((t) => t.id);
  for (const id of ['attributes', 'skills', 'inventory', 'training', 'enlightenment', 'overview']) {
    assert.ok(tabs.includes(id), `expected ${id} unlocked`);
  }
});

test('inventory unlocks from owning gear alone, with no kill-drop needed', () => {
  const s = createInitialState();
  assert.ok(!unlockedTabs(s).some((t) => t.id === 'inventory'));

  s.inventory.push({ id: 1, slot: 'ring', power: 1, spells: [], rarity: 'Common', name: 'Plain Ring' });
  assert.ok(unlockedTabs(s).some((t) => t.id === 'inventory'));
});
