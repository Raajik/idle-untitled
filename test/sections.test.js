import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import { battleTab } from '../src/ui/tabs.js';
import { takeTour, tickBuildings } from '../src/game/buildings.js';

function inTown(poiId = null) {
  const s = createInitialState();
  s.onboarding.step = 'done';
  s.hero.name = 'Probe';
  s.progress.unlockedRegions = ['holtburg'];
  s.location = { regionId: 'holtburg', poiId };
  takeTour(s, 'holtburg:town-hall');
  tickBuildings(s);
  return s;
}

const headings = (html) =>
  [...html.matchAll(/<h2>([^<]*)<\/h2>/g)].map((m) => m[1].replace(/&gt;/g, '>'));

test('the Battle tab folds down to the fight and the log', () => {
  const s = inTown('drudge-hideout');
  const html = battleTab(s);
  // Regions are gone from here entirely — the sidebar map lists every one of
  // them permanently, with travel times, which is strictly more than the
  // section ever showed.
  assert.ok(!headings(html).some((h) => h.startsWith('Regions')), 'Regions belongs to the sidebar now');
  assert.ok(headings(html).some((h) => h.includes('Points of Interest')));
  assert.ok(html.includes('toggle-section'));
});

test('standing in town does not print the word Town twice', () => {
  // The town used to get a section header AND a placeholder combat panel.
  const s = inTown(null);
  const townish = headings(battleTab(s)).filter((h) => h.startsWith('Town'));
  assert.equal(townish.length, 1, `saw ${JSON.stringify(townish)}`);
});

test('a folded section keeps its summary and drops its body', () => {
  const s = inTown(null);
  s.ui.collapsed.pois = false;
  const open = battleTab(s);
  assert.ok(open.includes('Pick a point of interest'), 'the POI list opens on request');

  s.ui.collapsed.pois = true;
  const folded = battleTab(s);
  assert.ok(!folded.includes('Pick a point of interest'), 'the body should be gone');
  assert.ok(headings(folded).some((h) => h.includes('Points of Interest')), 'the header should stay');
  assert.ok(folded.includes('in town'), 'and so should the summary');
  assert.ok(folded.length < open.length, 'folding should actually save space');
});

test('what you fold is remembered, and folding is reversible', () => {
  const s = inTown(null);
  assert.equal(s.ui.collapsed.town, undefined, 'nothing is folded to begin with');

  s.ui.collapsed.town = true;
  assert.ok(!battleTab(s).includes('open-building'), 'a folded town hides its tiles');

  s.ui.collapsed.town = false;
  assert.ok(battleTab(s).includes('open-building'), 'unfolding brings them back');
});

test('the fight itself is never foldable', () => {
  const s = inTown('drudge-hideout');
  const html = battleTab(s);
  const foldable = [...html.matchAll(/data-action="toggle-section" data-arg="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(!foldable.includes('combat'), 'the combat panel should have no fold control');
  assert.ok(html.includes('id="m-name"'), 'and should always be on screen');
});

test('the Points of Interest grid folds itself away by default', () => {
  // Travelling is faster from the sidebar map; this grid is for comparing places
  // side by side rather than picking one, so it starts out of the way.
  const s = inTown('drudge-hideout');
  const html = battleTab(s);
  assert.ok(!html.includes('poi-grid'), 'the grid should start folded');
  assert.ok(headings(html).some((h) => h.includes('Points of Interest')), 'but its header stays');
  assert.ok(html.includes('at Drudge Hideout'), 'carrying where you are');
});
