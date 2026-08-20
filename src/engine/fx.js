// Lightweight visual-effects event bus. Game logic pushes events; the UI layer
// drains them each frame and translates them into flashes/floating numbers.
// Kept module-local so it never pollutes the save.

const queue = [];

export function pushFx(event) {
  queue.push(event);
}

export function drainFx() {
  return queue.splice(0, queue.length);
}
