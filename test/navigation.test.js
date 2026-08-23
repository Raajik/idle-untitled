import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import { battleTab } from '../src/ui/tabs.js';
import { startTravelToRegion, startTravelToPoi, arrive } from '../src/game/travel.js';
import { takeTour, tickBuildings } from '../src/game/buildings.js';
import { getRegion, tiersForRegion } from '../src/data/regions.js';
import { formatClock } from '../src/engine/format.js';
import { modifiedWalkTime } from '../src/game/skills.js';

function inHoltburg(poiId = null) {
  const s = createInitialState();
  s.hero.name = 'Probe';
  s.onboarding.step = 'done';
  s.progress.unlockedRegions = ['holtburg'];
  s.location = { regionId: 'holtburg', poiId };
  return s;
}

// --- The dead path -------------------------------------------------------

test('you can walk back to town from a point of interest', () => {
  // This was the whole navigation problem: startTravelToRegion refused whenever
  // the region was unlocked at all, so from any POI inside it the only route
  // home was dying. The button was enabled and did nothing.
  const s = inHoltburg('drudge-hideout');
  assert.equal(startTravelToRegion(s, 'holtburg'), true, 'setting out for town should be allowed');
  assert.ok(s.travel, 'and should actually start a walk');
  assert.equal(s.travel.kind, 'region');
  assert.equal(s.travel.id, 'holtburg');

  arrive(s);
  assert.deepEqual(s.location, { regionId: 'holtburg', poiId: null }, 'and land you in the hub');
});

test('standing in the hub, going to the hub is still refused', () => {
  const s = inHoltburg(null);
  assert.equal(startTravelToRegion(s, 'holtburg'), false);
  assert.equal(s.travel, null);
});

test('a walk home can be redirected like any other', () => {
  const s = inHoltburg('drudge-hideout');
  startTravelToRegion(s, 'holtburg');
  assert.equal(startTravelToPoi(s, 'colier-mine'), true, 'changing your mind mid-walk should work');
  assert.equal(s.travel.kind, 'poi');
});

test('an unreached region is still a journey, not a refusal', () => {
  const s = inHoltburg('drudge-hideout');
  assert.equal(startTravelToRegion(s, 'glenden-wood'), true);
  assert.equal(s.travel.id, 'glenden-wood');
});

// --- The town card -------------------------------------------------------

function withTown(poiId = null) {
  const s = inHoltburg(poiId);
  takeTour(s, 'holtburg:town-hall');
  tickBuildings(s);
  return s;
}

test('the town is a card in the grid, in every band', () => {
  const s = withTown('drudge-hideout');
  for (const tier of tiersForRegion(getRegion('holtburg'))) {
    s.ui.activePoiTier = tier.id;
    const html = battleTab(s);
    assert.ok(html.includes('town-tile-holtburg'), `${tier.label} should carry the town card`);
    assert.ok(html.includes('&#127968; Holtburg'), `${tier.label} should name it`);
  }
});

test('the town card travels the same way every other card does', () => {
  const s = withTown('drudge-hideout');
  const html = battleTab(s);
  assert.match(html, /id="town-tile-holtburg"[^>]*data-action="travel-region"[^>]*data-arg="holtburg"/);
});

test('the town card quotes the walk home, coloured like the rest', () => {
  const s = withTown('heart-of-innocence'); // the far edge of Holtburg
  const poi = getRegion('holtburg').pois.find((p) => p.id === 'heart-of-innocence');
  const expected = formatClock(modifiedWalkTime(poi.walkSeconds, 0));
  assert.ok(battleTab(s).includes(`Travel: ${expected}`), `expected the walk home to read ${expected}`);

  // And it shortens with Athletics, in green, like every other tile.
  s.hero.skills.athletics.rank = 40;
  const quicker = battleTab(s);
  assert.ok(quicker.includes('walk-time faster'), 'Athletics should shorten the walk home too');
});

test('standing in town, the card says so rather than offering a walk', () => {
  const s = withTown(null);
  const html = battleTab(s);
  assert.ok(html.includes('town-tile-holtburg'));
  assert.ok(/town-tile-holtburg[\s\S]{0,400}?>here</.test(html), 'it should read "here"');
});

test('the town card carries the Town Hall\'s quest marker', () => {
  const s = inHoltburg('drudge-hideout');
  s.progress.quests['holtburg:town-hall'] = 'active';
  assert.ok(battleTab(s).includes('quest-mark'), 'an unfinished tour should show on the town card');

  takeTour(s, 'holtburg:town-hall');
  const done = battleTab(s);
  const townCard = done.slice(done.indexOf('town-tile-holtburg'));
  assert.ok(!townCard.slice(0, 500).includes('quest-mark'), 'and stop once it is done');
});

test('the town card reports how much of the town is open', () => {
  const s = inHoltburg('drudge-hideout');
  assert.ok(battleTab(s).includes('2 of 12 open'), 'a fresh Holtburg has its Town Hall and its board');
  takeTour(s, 'holtburg:town-hall');
  assert.ok(battleTab(s).includes('3 of 12 open'), 'the tour opens the Store');
});

test('the map stays on screen while you walk home', () => {
  // Setting out for town used to blank your region, which took the whole POI
  // grid off screen — so there was nothing to change your mind with halfway
  // there, and no countdown on the card you had just pressed.
  const s = withTown('drudge-hideout');
  s.ui.collapsed = { regions: false };
  startTravelToRegion(s, 'holtburg');
  const html = battleTab(s);
  assert.ok(html.includes('Points of Interest'), 'the grid should survive the walk');
  assert.ok(html.includes('town-tile-holtburg'), 'including the card you pressed');
  assert.equal((html.match(/id="town-timer-holtburg"/g) || []).length, 1, 'which now counts down');
  assert.ok((html.match(/id="region-timer-holtburg"/g) || []).length <= 1, 'and never shares an id');
});

test('walking home is as far as the place you walked out to', () => {
  const near = withTown('drudge-hideout');
  startTravelToRegion(near, 'holtburg');
  const far = withTown('heart-of-innocence');
  startTravelToRegion(far, 'holtburg');
  assert.ok(far.travel.duration > near.travel.duration, 'the far edge is a longer walk back');

  // Crossing to a region you have not reached still costs that region's own trip.
  const away = withTown('drudge-hideout');
  startTravelToRegion(away, 'glenden-wood');
  assert.equal(away.location.regionId, null, 'leaving really does leave');
});
