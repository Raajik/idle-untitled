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
  let rafTimer = null;
  let intervalTimer = null;

  function run(now) {
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
  }

  function raf(now) {
    run(now);
    rafTimer = requestAnimationFrame(raf);
  }

  // Browsers throttle requestAnimationFrame to a stop in hidden tabs — which,
  // for an idle game, means it stops idling exactly when the player switches
  // away to do something else. setInterval helps but Chrome throttles it too
  // (down to ~1 fire/minute after a few minutes hidden). A Web Worker's timer
  // is NOT throttled, so the worker is the heartbeat: it pings every tick and
  // the page catches up on whatever time actually passed. The two drivers
  // coexist because `last` is shared — whichever fires sees real elapsed time.
  let worker = null;
  let workerUrl = null;

  function startWorker() {
    try {
      const src = 'setInterval(() => postMessage(0), ' + TICK_MS + ')';
      workerUrl = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      worker = new Worker(workerUrl);
      worker.onmessage = () => {
        if (document.visibilityState === 'visible') return; // rAF owns foreground timing
        run(performance.now());
      };
    } catch (e) {
      // Workers unavailable (file:// in some browsers): fall back to an interval,
      // accepting its throttling rather than stopping outright.
      intervalTimer = setInterval(() => {
        if (document.visibilityState === 'visible') return; // rAF owns foreground timing
        run(performance.now());
      }, TICK_MS);
    }
  }

  return {
    start() {
      rafTimer = requestAnimationFrame(raf);
      startWorker();
    },
    stop() {
      if (rafTimer !== null) cancelAnimationFrame(rafTimer);
      rafTimer = null;
      if (worker) { worker.terminate(); worker = null; }
      if (workerUrl) { URL.revokeObjectURL(workerUrl); workerUrl = null; }
      if (intervalTimer !== null) clearInterval(intervalTimer);
      intervalTimer = null;
    },
  };
}
