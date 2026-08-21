// Bootstrap: load save → offline progress → start loop → render.

import { createInitialState, addLog } from './game/state.js';
import { tickCombat } from './game/combat.js';
import { loadGame, saveGame, applyOfflineProgress } from './save.js';
import { createLoop } from './engine/loop.js';
import { createRenderer } from './ui/render.js';

let state = loadGame() || createInitialState();

if (state.log.length === 0) {
  addLog(state, 'You wake on the road into Holtburg, roughly 30 seconds out. Your blade moves on its own...', 'dim');
}

const offline = applyOfflineProgress(state);
if (offline && offline.kills > 0) {
  // summary is logged; could toast too once renderer exists
}

const renderer = createRenderer(state, {
  onImport(loaded) {
    state = loaded;
    saveGame(state);
    location.reload(); // simplest correct way to rebind everything to the new state
  },
});

const loop = createLoop({
  tick: (dt) => tickCombat(state, dt),
  frame: () => renderer.frame(),
  autosave: () => saveGame(state),
});

window.addEventListener('beforeunload', () => saveGame(state));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveGame(state);
});

renderer.render();
loop.start();
