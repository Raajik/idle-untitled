import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStepper, TICK_MS } from '../src/engine/loop.js';

test('stepper produces no ticks below the tick interval', () => {
  const step = createStepper({ tickMs: 250, renderMs: 100, saveMs: 10000 });
  for (let i = 0; i < 10; i++) {
    const s = step(16); // typical frame delta
    assert.equal(s.ticks, 0);
  }
});

test('stepper accumulates frame deltas into ticks', () => {
  const step = createStepper({ tickMs: 250, renderMs: 100, saveMs: 10000 });
  let total = 0;
  for (let i = 0; i < 100; i++) total += step(16).ticks;
  // 100 frames * 16ms = 1600ms -> expect ~6 ticks (1600/250 = 6.4)
  assert.ok(total >= 6 && total <= 7, `expected ~6 ticks, got ${total}`);
});

test('stepper fires render on its interval', () => {
  const step = createStepper({ tickMs: 250, renderMs: 100, saveMs: 10000 });
  let renders = 0;
  for (let i = 0; i < 100; i++) {
    if (step(16).doRender) renders++;
  }
  // 1600ms / 100ms = 16 renders
  assert.ok(renders >= 15 && renders <= 17, `expected ~16 renders, got ${renders}`);
});

test('stepper fires autosave on its interval', () => {
  const step = createStepper({ tickMs: 250, renderMs: 100, saveMs: 1000 });
  let saves = 0;
  for (let i = 0; i < 200; i++) {
    if (step(16).doSave) saves++;
  }
  // 3200ms / 1000ms = 3 saves
  assert.equal(saves, 3);
});

test('stepper handles a large clamped dt without exploding ticks', () => {
  const step = createStepper({ tickMs: 250, renderMs: 100, saveMs: 10000 });
  const s = step(1000); // clamped max
  assert.equal(s.ticks, 4);
});
