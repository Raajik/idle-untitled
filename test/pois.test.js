import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import { battleTab } from '../src/ui/tabs.js';
import { takeTour, tickBuildings } from '../src/game/buildings.js';
import {
  REGIONS,
  POIS,
  getRegion,
  isSite,
  LEVEL_TIERS,
  TIER_SIZE,
  poiLevelRange,
  poiLevelLabel,
  tierForPoi,
  tiersForRegion,
  poisInTier,
} from '../src/data/regions.js';
import { modifiedWalkTime } from '../src/game/skills.js';

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

test('every hunting ground lands in exactly one band, and no site does', () => {
  for (const poi of POIS) {
    const tier = tierForPoi(poi);
    if (isSite(poi)) {
      assert.equal(tier, null, `${poi.name} is a site and should have no level band`);
      continue;
    }
    assert.ok(tier, `${poi.name} fell outside every band`);
    const { min } = poiLevelRange(poi);
    assert.ok(min >= tier.min && min <= tier.max, `${poi.name} (from Lv ${min}) landed in ${tier.label}`);
  }
});

test('a band is chosen by the weakest thing there, not the strongest', () => {
  // The level you can turn up at is the useful one. A POI that spans a boundary
  // belongs to the band you'd arrive in.
  const spanning = POIS.find((p) => {
    const r = poiLevelRange(p);
    return r && Math.floor((r.min - 1) / TIER_SIZE) !== Math.floor((r.max - 1) / TIER_SIZE);
  });
  assert.ok(spanning, 'expected at least one POI straddling a band boundary');
  const { min } = poiLevelRange(spanning);
  assert.equal(tierForPoi(spanning).min, Math.floor((min - 1) / TIER_SIZE) * TIER_SIZE + 1);
});

test('bosses do not inflate the band a place advertises', () => {
  // Drudge Hideout holds Lv 2-3 monsters and a Lv 6 warlord; it is a Lv 2-3 place.
  const hideout = POIS.find((p) => p.id === 'drudge-hideout');
  assert.ok(hideout.boss.level > poiLevelRange(hideout).max, 'this test needs a boss above the pack');
  assert.deepEqual(poiLevelRange(hideout), { min: 2, max: 3 });
  assert.equal(poiLevelLabel(hideout), 'Lv 2–3');
});

test('a place where everything is one level says so once', () => {
  assert.equal(poiLevelLabel({ monsters: [{ level: 4 }, { level: 4 }] }), 'Lv 4');
  assert.equal(poiLevelLabel({ monsters: [] }), '');
  assert.equal(poiLevelLabel(null), '');
});

test('a region lists only the bands it actually has ground in, in order', () => {
  for (const region of REGIONS) {
    const tiers = tiersForRegion(region);
    assert.ok(tiers.length, `${region.name} listed no bands at all`);
    for (const tier of tiers) {
      assert.ok(poisInTier(region, tier.id).length > 0, `${region.name} listed an empty ${tier.label}`);
    }
    const levelBands = tiers.filter((t) => t.id !== 'sites');
    const mins = levelBands.map((t) => t.min);
    assert.deepEqual(mins, [...mins].sort((a, b) => a - b), `${region.name} listed its bands out of order`);

    // Every POI in the region is reachable through exactly one band.
    const shown = tiers.flatMap((t) => poisInTier(region, t.id).map((p) => p.id));
    assert.equal(shown.length, new Set(shown).size, `${region.name} showed a POI twice`);
    assert.deepEqual(new Set(shown), new Set(region.pois.map((p) => p.id)));
  }
});

test('sites get their own band, listed first', () => {
  const holtburg = tiersForRegion(getRegion('holtburg'));
  assert.equal(holtburg[0].id, 'sites');
  assert.deepEqual(
    poisInTier(getRegion('holtburg'), 'sites').map((p) => p.id),
    ['budding-lifestone']
  );
  // Every region keeps a Lifestone in some state of repair, so every region has
  // a Sites band — and it always leads.
  for (const region of REGIONS) {
    const tiers = tiersForRegion(region);
    assert.equal(tiers[0].id, 'sites', `${region.name} should lead with its sites`);
    assert.ok(poisInTier(region, 'sites').some((p) => p.site === 'lifestone'), `${region.name} has no Lifestone`);
  }
});

test('a band means the same level everywhere, so its colour can too', () => {
  const band = (regionId, label) => tiersForRegion(getRegion(regionId)).find((t) => t.label === label);
  const holtburg = band('holtburg', 'Lv 11–20');
  const glenden = band('glenden-wood', 'Lv 11–20');
  assert.ok(holtburg && glenden, 'both regions should carry a Lv 11-20 band');
  assert.equal(holtburg.tone, glenden.tone, 'the same band must key the same colour in every region');
  // And it is NOT its position in the region's own list: Holtburg lists it third
  // (Sites, Lv 1-10, Lv 11-20) and Glenden Wood second (Sites, Lv 11-20).
  assert.equal(tiersForRegion(getRegion('holtburg')).indexOf(holtburg), 2);
  assert.equal(tiersForRegion(getRegion('glenden-wood')).indexOf(glenden), 1);
});

test('the bands reach well past anything in the game yet', () => {
  const deepest = Math.max(...POIS.filter((p) => !isSite(p)).map((p) => poiLevelRange(p).max));
  assert.ok(LEVEL_TIERS[LEVEL_TIERS.length - 1].max > deepest, 'there should be room left to grow into');
});

// --- What the panel actually draws ---

test('the POI list draws a band strip and equal tiles carrying their levels', () => {
  const s = inTown(null);
  const html = battleTab(s);
  assert.ok(html.includes('set-poi-tier'), 'the bands should be selectable');
  assert.ok(html.includes('Lv 1–10') && html.includes('Lv 11–20'), 'both of Holtburg\'s bands should be offered');
  assert.ok(html.includes('poi-grid'), 'tiles should be laid out as a grid of equals');
  assert.ok(html.includes('Drudge Hideout'), 'the first band shows by default');
  assert.ok(html.includes('poi-level'), 'each tile should carry its level range');
});

test('choosing a band swaps which grounds are listed', () => {
  const s = inTown(null);
  s.ui.activePoiTier = 't2'; // Lv 11-20
  const html = battleTab(s);
  assert.ok(html.includes("Hunter's Leap"), 'the chosen band should be listed');
  assert.ok(!html.includes('Drudge Hideout'), 'and the others should not');
});

test('the band you are standing in is the one that opens', () => {
  const s = inTown('daiklos'); // Lv 12-13, so the Lv 11-20 band
  const html = battleTab(s);
  assert.ok(html.includes('Daiklos'), 'arriving somewhere should show you the band you are in');
  assert.ok(!html.includes('Colier Mine'));
});

test('a stale band from another region falls back rather than showing nothing', () => {
  const s = inTown(null);
  s.ui.activePoiTier = 't6'; // Lv 51-60: real, but nothing of Holtburg's is in it
  const html = battleTab(s);
  assert.ok(html.includes('Drudge Hideout'), 'it should fall back to a band this region has');
});

test('travel time is shown as walked, and coloured against the base time', () => {
  const rested = inTown(null);
  assert.equal(rested.hero.skills.athletics.rank, 0);
  const plain = battleTab(rested);
  assert.ok(plain.includes('walk-time'), 'every tile should quote a walk time');
  assert.ok(!plain.includes('walk-time faster'), 'at rank 0 the walk is exactly the base time');
  assert.ok(!plain.includes('walk-time slower'));

  const fit = inTown(null);
  fit.hero.skills.athletics.rank = 30;
  const quick = battleTab(fit);
  assert.ok(quick.includes('walk-time faster'), 'Athletics should show up as time saved');
  assert.ok(!quick.includes('walk-time slower'));
});

test('the quoted time is the one the walk will actually take', () => {
  const s = inTown(null);
  s.hero.skills.athletics.rank = 40;
  const poi = getRegion('holtburg').pois.find((p) => p.id === 'drudge-hideout');
  const actual = modifiedWalkTime(poi.walkSeconds, 40);
  assert.ok(actual < poi.walkSeconds, 'this test needs Athletics to be doing something');
  // formatDuration rounds to whole seconds, which is what the tile shows.
  assert.ok(battleTab(s).includes(`${Math.round(actual)}s`), `expected the tile to quote ${Math.round(actual)}s`);
});
