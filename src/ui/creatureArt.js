// Simple creature art, drawn rather than loaded.
//
// The game has no art pipeline and shouldn't grow one for this, so these are
// inline SVG silhouettes — one per kind from data/bestiary.js, scaled by size.
// A drudge and a rat should not be the same shape on screen, but they don't need
// to be portraits either: the job is "you can tell at a glance what you're
// fighting", the same job the item glyphs do in the inventory grid.
//
// Everything is drawn in a 32x32 box in currentColor, so a silhouette inherits
// whatever colour the row around it is using and costs nothing to recolour.

import { classify } from '../data/bestiary.js';

const SHAPES = {
  // Upright, two arms, a weapon-ish angle to the shoulders.
  humanoid: `
    <circle cx="16" cy="8" r="4.5"/>
    <path d="M16 13c-4 0-6.5 2.5-6.5 6.5V26h3.5v-6h6v6h3.5v-6.5C22.5 15.5 20 13 16 13z"/>
    <path d="M9 15l-3.5 6 2 1.2 3.2-5.5zM23 15l3.5 6-2 1.2-3.2-5.5z"/>`,
  // Low, four legs, a tail.
  beast: `
    <path d="M7 18c0-3 2.5-5 6-5h6c3.5 0 6 2 6 5s-2.5 5-6 5h-6c-3.5 0-6-2-6-5z"/>
    <circle cx="24.5" cy="14.5" r="3.5"/>
    <path d="M9 23h2v4H9zM13 23h2v4h-2zM19 23h2v4h-2zM23 23h2v4h-2z"/>
    <path d="M7 17C4 15 3 12 4 10c1.5 1.8 2.5 3.5 4 5z"/>`,
  // Humanoid, but hollow — ribs and a skull.
  undead: `
    <path d="M16 3c-3.6 0-6 2.6-6 6 0 2.2 1 3.6 2 4.6V17h8v-3.4c1-1 2-2.4 2-4.6 0-3.4-2.4-6-6-6z"/>
    <circle cx="13.5" cy="9" r="1.6" fill="#000" opacity="0.55"/>
    <circle cx="18.5" cy="9" r="1.6" fill="#000" opacity="0.55"/>
    <path d="M11 19h10v2H11zM11.5 23h9v2h-9zM12 27h8v2h-8z"/>`,
  // Blocky, mineral, no neck.
  construct: `
    <path d="M8 9h16v14H8z"/>
    <path d="M5 12h3v8H5zM24 12h3v8h-3z"/>
    <path d="M11 25h4v4h-4zM17 25h4v4h-4z"/>
    <path d="M12 13h3v3h-3zM17 13h3v3h-3z" fill="#000" opacity="0.5"/>`,
  // No feet — a trailing wisp.
  spirit: `
    <path d="M16 4c-4.4 0-7.5 3.4-7.5 8 0 5.2 2.4 9.4 4.2 12.6.9 1.6 1.4 2.4 3.3 2.4s2.4-.8 3.3-2.4C21.1 21.4 23.5 17.2 23.5 12c0-4.6-3.1-8-7.5-8z" opacity="0.75"/>
    <circle cx="13.2" cy="11" r="1.7" fill="#000" opacity="0.55"/>
    <circle cx="18.8" cy="11" r="1.7" fill="#000" opacity="0.55"/>`,
};

// Small things are drawn small. It's the cheapest possible way to make a rat
// read as a rat next to a golem, and it costs no extra shapes.
const SCALE = { small: 0.72, medium: 1, large: 1.22 };

export function creatureArt(name, { className = '' } = {}) {
  const { kind, size } = classify(name);
  const shape = SHAPES[kind] || SHAPES.beast;
  const scale = SCALE[size] || 1;
  // Scaled about the centre of the box so every sprite still sits on the same
  // baseline whatever size it is.
  const transform = scale === 1 ? '' : ` transform="translate(16 16) scale(${scale}) translate(-16 -16)"`;
  return `<svg class="creature-art ${className}" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" focusable="false" fill="currentColor"><g${transform}>${shape}</g></svg>`;
}

export { SHAPES as CREATURE_SHAPES, SCALE as CREATURE_SCALE };
