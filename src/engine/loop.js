// Fixed-timestep game loop. Game logic ticks at TICK_HZ; rendering and autosave
// are throttled separately. The timing math is extracted into createStepper so it
// can be unit-tested without requestAnimationFrame.

export const TICK_HZ = 4;
export const TICK_MS = 1000 / TICK_HZ;
export const RENDER_MS = 100;
export const SAVE_MS = 10000;

// Pure accumulator. `step(dt)` consumes dt milliseconds and reports how many
// ticks to run and whether to render/save this frame.
export function createStepper({ tickMs = TICK_MS, renderMs = RENDER_MS, saveMs = SAVE_MS } = {}) {
  let tickAcc = 0;
  let renderAcc = 0;
  let saveAcc = 0;

  return function step(dt) {
    let ticks = 0;
    tickAcc += dt;
    while (tickAcc >= tickMs) {
      tickAcc -= tickMs;
      ticks += 1;
    }

    let doRender = false;
    renderAcc += dt;
    while (renderAcc >= renderMs) {
      renderAcc -= renderMs;
      doRender = true;
    }

    let doSave = false;
    saveAcc += dt;
    while (saveAcc >= saveMs) {
      saveAcc -= saveMs;
      doSave = true;
    }

    return { ticks, doRender, doSave };
  };
}

export function createLoop({ tick, frame, autosave }) {
  const step = createStepper();
  let last = null;
  let timer = null;

  function raf(now) {
    if (last === null) last = now;
    let dt = now - last;
    last = now;
    // Clamp huge gaps (tab was throttled/hidden) so we don't burst hundreds of ticks;
    // real away-progress is handled by the offline simulation on load.
    if (dt > 1000) dt = 1000;

    const s = step(dt);
    for (let i = 0; i < s.ticks; i++) tick(TICK_MS / 1000);
    if (frame) frame(dt);
    if (s.doSave) autosave();

    timer = requestAnimationFrame(raf);
  }

  return {
    start() {
      timer = requestAnimationFrame(raf);
    },
    stop() {
      if (timer !== null) cancelAnimationFrame(timer);
      timer = null;
    },
  };
}
