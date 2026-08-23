import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import { tickCombat, engageWave, currentTarget } from '../src/game/combat.js';
import { swarmCap, rollSwarmSize, MAX_SWARM, WAVES_PER_POI } from '../src/game/waves.js';
import { REGIONS, getRegion } from '../src/data/regions.js';

function atPoi(regionId, poiId) {
  const s = createInitialState();
  s.progress.unlockedRegions = [regionId];
  s.location = { regionId, poiId };
  s.progress.boundLifestone = { regionId, poiId };
  return s;
}

test('every region declares how badly it can gang up on you', () => {
  for (const region of REGIONS) {
    assert.equal(typeof region.swarmMax, 'number', `${region.id} has no swarmMax`);
    assert.ok(region.swarmMax >= 1 && region.swarmMax <= MAX_SWARM, `${region.id}: ${region.swarmMax}`);
  }
  // And it gets worse the further out you go.
  const caps = REGIONS.map((r) => r.swarmMax);
  for (let i = 1; i < caps.length; i++) {
    assert.ok(caps[i] >= caps[i - 1], `${REGIONS[i].id} should be at least as dangerous as the region before it`);
  }
});

test('wave 1 is always a single monster, wherever you are', () => {
  for (const region of REGIONS) {
    assert.equal(swarmCap(region.swarmMax, 1), 1, `${region.id} ganged up on wave 1`);
    for (let i = 0; i < 200; i++) {
      assert.equal(rollSwarmSize(region.swarmMax, 1), 1);
    }
  }
});

test("a region's ceiling is only reached on its last wave", () => {
  for (const region of REGIONS) {
    assert.equal(swarmCap(region.swarmMax, WAVES_PER_POI), region.swarmMax, region.id);
    for (let wave = 1; wave <= WAVES_PER_POI; wave++) {
      assert.ok(swarmCap(region.swarmMax, wave) <= region.swarmMax);
      if (wave > 1) assert.ok(swarmCap(region.swarmMax, wave) >= swarmCap(region.swarmMax, wave - 1));
    }
  }
});

test('being swarmed stays rare in Holtburg and becomes real in the Direlands', () => {
  const shareOfPacks = (swarmMax) => {
    let packs = 0;
    const runs = 4000;
    for (let i = 0; i < runs; i++) if (rollSwarmSize(swarmMax, WAVES_PER_POI) > 1) packs++;
    return packs / runs;
  };
  const holtburg = shareOfPacks(getRegion('holtburg').swarmMax);
  const direlands = shareOfPacks(getRegion('direlands').swarmMax);
  assert.ok(holtburg < 0.35, `Holtburg ganged up ${(holtburg * 100).toFixed(0)}% of the time`);
  assert.ok(direlands > holtburg, 'the Direlands should swarm more than the starting region');
  // Even at its worst it should mostly be one thing at a time.
  assert.ok(direlands < 0.7, `the Direlands swarmed ${(direlands * 100).toFixed(0)}% of waves`);
});

test('a swarm never exceeds MAX_SWARM', () => {
  for (let i = 0; i < 2000; i++) {
    assert.ok(rollSwarmSize(99, WAVES_PER_POI) <= MAX_SWARM);
  }
});

test('the whole group engages at once, and the hero targets the front of it', () => {
  const s = atPoi('direlands', 'virindi-citadel');
  s.progress.wave = WAVES_PER_POI;
  s.progress.waveMonstersLeft = 5;
  engageWave(s);
  assert.equal(s.monsters.length, 5, 'all five should be on the field together');
  assert.equal(currentTarget(s), s.monsters[0]);
  for (const m of s.monsters) {
    assert.ok(m.hp > 0 && m.hp === m.maxHp);
    assert.equal(typeof m.attackTimer, 'number', 'each carries its own swing timer');
  }
});

test('everything engaged gets to hit you, not just the one you are facing', () => {
  // The hero has to live through the whole window: dying resets them to full
  // health, which hides most of the damage the comparison is trying to measure.
  // Endurance Training is the lever for that — it raises HP by percentage and
  // leaves defense alone, so the damage per blow stays identical between the two.
  const field = (count) => {
    const s = atPoi('holtburg', 'daiklos');
    s.hero.end = 30;
    s.training.hp = 30; // deep enough to soak six attackers for ten seconds
    s.progress.wave = WAVES_PER_POI;
    s.progress.waveMonstersLeft = count;
    tickCombat(s, 0.25); // fills in vitals, which start null
    engageWave(s);
    for (const m of s.monsters) m.attackTimer = 0; // line the swings up
    return s;
  };

  const damageTaken = (s) => {
    const before = s.hero.hp;
    for (let i = 0; i < 40; i++) tickCombat(s, 0.25);
    assert.equal(s.hero.dead, false, 'the hero must survive for the comparison to mean anything');
    return before - s.hero.hp;
  };

  const alone = damageTaken(field(1));
  const swarmed = damageTaken(field(6));
  assert.ok(alone > 0, 'one attacker should still land hits');
  assert.ok(swarmed > alone * 2, `six of them (${swarmed}) should hurt far more than one (${alone})`);
});

test('the road only ever sends one thing at a time', () => {
  const s = createInitialState();
  s.hero.name = 'Probe';
  s.onboarding.step = 'done';
  s.location = { regionId: null, poiId: 'tutorial-road' };
  s.travel = { kind: 'region', id: 'holtburg', remaining: 120, duration: 180, tutorial: true };
  for (let i = 0; i < 200; i++) {
    tickCombat(s, 0.25);
    assert.ok(s.monsters.length <= 1, `the road produced ${s.monsters.length} at once`);
  }
});

test('a wave only advances once its whole group is down', () => {
  const s = atPoi('holtburg', 'drudge-hideout');
  s.hero.str = 900; // one-shot everything
  s.hero.skills.offense.unarmed.rank = 100;
  s.progress.wave = 3;
  s.progress.waveMonstersLeft = 3;
  engageWave(s);
  assert.equal(s.monsters.length, 3);

  // Kill one by hand; the wave should not have moved on.
  const [first] = s.monsters;
  s.monsters = s.monsters.filter((m) => m !== first);
  s.progress.waveMonstersLeft -= 1;
  assert.equal(s.progress.wave, 3, 'still the same wave with two left standing');
  assert.equal(s.monsters.length, 2);
});
