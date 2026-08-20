// Fixed-timestep game loop. Game logic ticks at TICK_HZ; rendering is separate.

export const TICK_HZ = 4;
const TICK_MS = 1000 / TICK_HZ;

export function createLoop({ tick, render, autosave }) {
  let last = null;
  let renderAccum = 0;
  let saveAccum = 0;
  let timer = null;

  function frame(now) {
    if (last === null) last = now;
    let elapsed = now - last;
    last = now;
    // Clamp huge gaps (tab was throttled/hidden) so we don't burst hundreds of ticks;
    // real away-progress is handled by the offline simulation on load.
    if (elapsed > 1000) elapsed = 1000;

    while (elapsed >= TICK_MS) {
      tick(TICK_MS / 1000);
      elapsed -= TICK_MS;
    }

    renderAccum += elapsed;
    if (renderAccum >= 500) {
      render();
      renderAccum = 0;
    }

    saveAccum += elapsed;
    if (saveAccum >= 10000) {
      autosave();
      saveAccum = 0;
    }

    timer = requestAnimationFrame(frame);
  }

  return {
    start() {
      timer = requestAnimationFrame(frame);
    },
    stop() {
      if (timer !== null) cancelAnimationFrame(timer);
      timer = null;
    },
  };
}
