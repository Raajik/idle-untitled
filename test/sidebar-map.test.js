import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import { sidebarMapHtml, poiCardHtml, hoverCardHtml, ROWS_PER_BAND } from '../src/ui/sidebarMap.js';
import { battleTab } from '../src/ui/tabs.js';
import { REGIONS, getRegion, getPoiById, tiersForRegion, poisInTier } from '../src/data/regions.js';
import { takeTour, tickBuildings } from '../src/game/buildings.js';
import { startTravelToRegion } from '../src/game/travel.js';
import { grantReputation, openQuestsFor } from '../src/game/quests.js';
import { claimRegionLifestone } from '../src/game/lifestone.js';
import { weaknessesOf } from '../src/data/species.js';
import { formatClock } from '../src/engine/format.js';
import { modifiedWalkTime } from '../src/game/skills.js';

function inHoltburg(poiId = null) {
  const s = createInitialState();
  s.hero.name = 'Probe';
  s.onboarding.step = 'done';
  s.progress.unlockedRegions = ['holtburg'];
  s.location = { regionId: 'holtburg', poiId };
  openQuestsFor(s, 'holtburg');
  return s;
}

// --- What the map lists --------------------------------------------------

test('a region you have never reached is one row, not a band', () => {
  const s = inHoltburg();
  const html = sidebarMapHtml(s);
  for (const region of REGIONS.filter((r) => r.id !== 'holtburg')) {
    assert.ok(html.includes(`map-region-${region.id}`), `${region.name} should be reachable`);
    assert.ok(!html.includes(`map-poi-${region.pois[1].id}`), `${region.name}'s dungeons are not listed yet`);
  }
});

test('a fresh save with nothing unlocked still offers the road out', () => {
  const s = inHoltburg();
  s.progress.unlockedRegions = [];
  const html = sidebarMapHtml(s);
  assert.ok(html.includes('map-region-holtburg'), 'the first region must be travelable to or the game cannot start');
});

test('the town leads its region, with its reputation', () => {
  const s = inHoltburg();
  grantReputation(s, 'holtburg', 42);
  const html = sidebarMapHtml(s);
  assert.ok(html.includes('map-town-holtburg'));
  assert.ok(html.includes('rep 42'), 'standing is worth seeing at a glance');
  assert.ok(html.indexOf('map-town-holtburg') < html.indexOf('map-region-glenden-wood'));
});

test('the region Lifestone sits with the town, not in a level band', () => {
  const s = inHoltburg();
  const html = sidebarMapHtml(s);
  assert.ok(html.includes('map-poi-budding-lifestone'), 'the stone should always be one click away');
});

test('a band you are standing in opens itself; the others do not', () => {
  const away = inHoltburg(null);
  assert.ok(!sidebarMapHtml(away).includes('map-poi-drudge-hideout'), 'bands start collapsed');

  const there = inHoltburg('drudge-hideout');
  const html = sidebarMapHtml(there);
  assert.ok(html.includes('map-poi-drudge-hideout'), 'the band holding you opens');
  assert.ok(!html.includes('map-poi-daiklos'), 'but only that one');
});

test('a band can be opened and closed by hand', () => {
  const s = inHoltburg(null);
  s.ui.expandedBands['holtburg:t1'] = true;
  assert.ok(sidebarMapHtml(s).includes('map-poi-drudge-hideout'));
  s.ui.expandedBands['holtburg:t1'] = false;
  assert.ok(!sidebarMapHtml(s).includes('map-poi-drudge-hideout'));

  // Every band offers the toggle, with a count so you know what's behind it.
  const html = sidebarMapHtml(s);
  for (const tier of tiersForRegion(getRegion('holtburg')).filter((t) => t.id !== 'sites')) {
    assert.ok(html.includes(`data-arg="holtburg:${tier.id}"`), `${tier.label} should be openable`);
    assert.ok(html.includes(tier.label));
  }
});

test('every row travels the same way the old cards did', () => {
  const s = inHoltburg('drudge-hideout');
  const html = sidebarMapHtml(s);
  assert.match(html, /id="map-town-holtburg"[^>]*data-action="travel-region"[^>]*data-arg="holtburg"/);
  assert.match(html, /id="map-poi-drudge-hideout"[^>]*data-action="travel-poi"[^>]*data-arg="drudge-hideout"/);
});

test('a row quotes the walk, coloured against its base', () => {
  const rested = inHoltburg('drudge-hideout');
  rested.ui.expandedBands['holtburg:t1'] = true;
  const plain = sidebarMapHtml(rested);
  const poi = getPoiById('holtburg-redoubt');
  assert.ok(plain.includes(formatClock(modifiedWalkTime(poi.walkSeconds, 0))));
  assert.ok(!plain.includes('t faster'), 'at rank 0 a walk costs exactly its base');

  rested.hero.skills.athletics.rank = 40;
  assert.ok(sidebarMapHtml(rested).includes('t faster'), 'Athletics shows up as time saved');
});

test('where you are is marked, and is not a walk', () => {
  const s = inHoltburg('drudge-hideout');
  const html = sidebarMapHtml(s);
  assert.match(html, /class="place-row here[^"]*" id="map-poi-drudge-hideout"/, 'the row you are on is marked');
  assert.match(html, /id="map-poi-drudge-hideout"[\s\S]{0,200}?<span class="t here">here</, 'and says "here" rather than a walk time');
});

// --- The hover card ------------------------------------------------------

test('the card carries everything the location card did', () => {
  const s = inHoltburg('drudge-hideout');
  s.progress.poiClears['green-mire-grave'] = 7;
  const card = poiCardHtml(s, getPoiById('green-mire-grave'), 'holtburg');

  assert.ok(card.includes('Green Mire Grave'));
  assert.ok(card.includes('Lv 3–4'), 'its level band');
  assert.ok(card.includes('Travel:'));
  assert.ok(card.includes('Resources:') && card.includes('Velvet per clear'), 'what a clear pays');
  assert.ok(/Clears:<\/span><span class="v">7</.test(card), 'and how many times you have done it');
  assert.ok(card.includes('Inhabitants:') && card.includes('Weaknesses:'));
});

test('weaknesses are paired to each inhabitant, never shared', () => {
  // Green Mire Grave holds three different species with three different
  // primaries; one shared "weaknesses" line would read as though all of them
  // worked on everything.
  const s = inHoltburg();
  const poi = getPoiById('green-mire-grave');
  const card = poiCardHtml(s, poi, 'holtburg');
  const primaries = new Set(poi.monsters.map((m) => weaknessesOf(m.name)[0].damageType));
  assert.ok(primaries.size > 1, 'this test needs a mixed dungeon');
  for (const m of poi.monsters) {
    assert.ok(card.includes(m.name), `${m.name} should be listed`);
    assert.ok(card.includes(`Lv ${m.level}`));
  }
  for (const type of primaries) {
    assert.ok(card.includes(`el-${type}`), `${type} should be coloured as itself`);
  }
});

test('a card mentions the jobs that point at the place', () => {
  const s = inHoltburg();
  claimRegionLifestone(s, 'holtburg');
  const site = poiCardHtml(s, getPoiById('budding-lifestone'), 'holtburg');
  assert.ok(site.includes('quest-mark'), 'an open quest should be on its card');
  assert.ok(site.includes('Sanctuary:'), 'and a site says it is one');

  s.buildings['holtburg:bounty-board'].bounties = [
    { id: 1, objective: { kind: 'material', id: 'mahogany', count: 10 }, title: 'Wanted: Mahogany', reputation: 5, xp: 1, pyreals: 1 },
  ];
  const hideout = poiCardHtml(s, getPoiById('drudge-hideout'), 'holtburg');
  assert.ok(hideout.includes('Wanted: Mahogany'), 'a bounty you could work here should say so');
  assert.ok(hideout.includes('0 / 10'), 'with how far along you are');
});

test('the map names its cards rather than carrying them', () => {
  // A scroll container clips its children on BOTH axes whatever overflow-x
  // says, so a card anchored inside the map and drawn to its right was clipped
  // away to nothing. Rows carry a key; the card is built into a layer outside
  // the sidebar (ui/render.js).
  const s = inHoltburg('drudge-hideout');
  const html = sidebarMapHtml(s);
  assert.ok(!html.includes('hovercard'), 'no card should be inlined into the scroller');
  assert.match(html, /id="map-poi-drudge-hideout"[^>]*data-card="poi:holtburg:drudge-hideout"/);
  assert.match(html, /id="map-town-holtburg"[^>]*data-card="town:holtburg"/);
});

test('every key a row carries resolves to a card', () => {
  const s = inHoltburg('drudge-hideout');
  s.ui.expandedBands['holtburg:t1'] = 'all';
  s.ui.expandedBands['holtburg:t2'] = 'all';
  const keys = [...sidebarMapHtml(s).matchAll(/data-card="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length > 5, 'this test needs a populated map');
  for (const key of keys) {
    const card = hoverCardHtml(s, key);
    assert.ok(card.includes('hovercard'), `${key} produced no card`);
  }
});

test('a key for somewhere that no longer exists is silence, not a crash', () => {
  // Saves outlive data files; a stale key must not take the sidebar down.
  const s = inHoltburg();
  for (const key of ['', null, 'poi:holtburg:no-such-place', 'town:atlantis', 'nonsense']) {
    assert.equal(hoverCardHtml(s, key), '');
  }
});

test('an unvisited region offers no card, because it has nothing to say', () => {
  const s = inHoltburg();
  const html = sidebarMapHtml(s);
  assert.match(html, /id="map-region-glenden-wood"(?![^>]*data-card)/);
});

// --- Not colliding with the grid -----------------------------------------

test('the map and the grid never share an element id', () => {
  // Both can be on screen at once, and getElementById only ever finds the first.
  const s = inHoltburg('drudge-hideout');
  s.ui.collapsed = { pois: false };
  takeTour(s, 'holtburg:town-hall');
  tickBuildings(s);
  startTravelToRegion(s, 'holtburg');

  const both = battleTab(s) + sidebarMapHtml(s);
  const ids = [...both.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  const seen = new Set();
  const duplicated = ids.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
  assert.deepEqual(duplicated, [], `duplicate ids: ${duplicated.join(', ')}`);
});

test('the Battle tab keeps the grid, folded, for comparing', () => {
  const s = inHoltburg('drudge-hideout');
  const folded = battleTab(s);
  assert.ok(!folded.includes('poi-grid'), 'travelling is faster from the map, so it starts away');
  assert.ok(folded.includes('Points of Interest'), 'but it is still there');

  s.ui.collapsed = { pois: false };
  assert.ok(battleTab(s).includes('poi-grid'), 'and unfolds to the full card grid');
});

test('the map is the only place Regions live now', () => {
  const s = inHoltburg('drudge-hideout');
  const battle = battleTab(s);
  assert.ok(!/<h2>Regions<\/h2>/.test(battle), 'the Battle tab has no Regions section');
  assert.ok(sidebarMapHtml(s).includes('travel-region'), 'the map carries every one of them');
});

test('a long band shows a few rows and offers the rest', () => {
  // Holtburg's first band holds twelve places; all of them at once would be most
  // of the sidebar.
  const s = inHoltburg('drudge-hideout');
  const html = sidebarMapHtml(s);
  const shown = (html.match(/id="map-poi-/g) || []).length;
  const band = poisInTier(getRegion('holtburg'), 't1');
  assert.ok(band.length > ROWS_PER_BAND, 'this test needs a long band');
  assert.ok(shown <= ROWS_PER_BAND + 2, `${shown} rows is too many`); // + town's Lifestone
  assert.ok(html.includes('expand-band'), 'with the rest one click away');
  assert.ok(html.includes(`${band.length - ROWS_PER_BAND} more in this band`));

  s.ui.expandedBands['holtburg:t1'] = 'all';
  const full = sidebarMapHtml(s);
  assert.ok(full.includes('map-poi-mukkir-nest'), 'asking for all of it gives all of it');
  assert.ok(!full.includes('expand-band'), 'and stops offering more');
});
