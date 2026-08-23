import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import { tickCombat } from '../src/game/combat.js';
import { startTravelToRegion } from '../src/game/travel.js';
import { derivedStats } from '../src/game/hero.js';
import { rollTrophies } from '../src/game/loot.js';
import { TROPHIES, getTrophy } from '../src/data/trophies.js';
import { TUTORIAL_ROAD, TUTORIAL_MONSTER_WEIGHTS } from '../src/data/tutorial.js';
import { POIS } from '../src/data/regions.js';
import { monsterLabel } from '../src/ui/tabs.js';
import { ATTRIBUTE_BASE } from '../src/game/skills.js';

test('a fresh hero starts at 1 in everything', () => {
  const s = createInitialState();
  for (const attr of ['str', 'end', 'coord', 'quick', 'focus', 'self']) {
    assert.equal(s.hero[attr], ATTRIBUTE_BASE, `${attr} should start at ${ATTRIBUTE_BASE}`);
  }
});

test('vitals stay legible from the first point to the last', () => {
  // Hundreds, never thousands, and never a number that needs an exponent.
  const s = createInitialState();
  const start = derivedStats(s);
  assert.ok(start.maxHp >= 15 && start.maxHp <= 40, `starting HP was ${start.maxHp}`);
  assert.ok(start.maxStamina >= 12 && start.maxStamina <= 40);
  assert.ok(start.maxMana >= 12 && start.maxMana <= 40);

  for (const attr of ['str', 'end', 'coord', 'quick', 'focus', 'self']) s.hero[attr] = 100;
  const capped = derivedStats(s);
  for (const [name, value] of Object.entries({ hp: capped.maxHp, stamina: capped.maxStamina, mana: capped.maxMana })) {
    assert.ok(value < 1000, `${name} reached ${value} at 100 in every attribute — that's thousands territory`);
    assert.ok(value > 200, `${name} only reached ${value}; the curve should still be worth climbing`);
  }
});

test('every roadside critter is beatable and named in the drop weights', () => {
  const s = createInitialState();
  const hero = derivedStats(s);
  for (const monster of TUTORIAL_ROAD.monsters) {
    assert.ok(monster.stats, `${monster.name} needs its own stat block, not a dungeon level`);
    assert.ok(monster.stats.hp < hero.maxHp * 2, `${monster.name} has ${monster.stats.hp} HP against a hero's ${hero.maxHp}`);
    assert.ok(monster.stats.atk < hero.maxHp / 4, `${monster.name} hits too hard for a starting hero`);
    assert.ok(TUTORIAL_MONSTER_WEIGHTS[monster.name], `${monster.name} has no spawn weight`);
    for (const drop of monster.drops || []) {
      assert.ok(getTrophy(drop.id), `${monster.name} drops unknown trophy ${drop.id}`);
    }
  }
});

test('rabbits and chickens always leave meat; rats always leave a tail', () => {
  const byName = Object.fromEntries(TUTORIAL_ROAD.monsters.map((m) => [m.name, m]));
  for (const name of ['Rabbit', 'Chicken']) {
    const s = createInitialState();
    for (let i = 0; i < 25; i++) rollTrophies(s, byName[name]);
    assert.equal(s.trophies['raw-meat'], 25, `${name} should always drop meat`);
  }
  const s = createInitialState();
  for (let i = 0; i < 200; i++) rollTrophies(s, byName.Rat);
  assert.equal(s.trophies['rat-tail'], 200, 'every rat leaves a tail');
  assert.ok(s.trophies['pristine-rat-tail'] > 0, 'pristine tails should turn up sometimes');
  assert.ok(s.trophies['pristine-rat-tail'] < 200, 'but not every time');
});

test('the walk to Holtburg is survivable and pays out trophies', () => {
  const s = createInitialState();
  s.hero.name = 'Probe';
  s.onboarding.step = 'done';
  s.onboarding.tutorialPending = true;
  startTravelToRegion(s, 'holtburg');
  let elapsed = 0;
  while (s.travel && elapsed < 400) {
    tickCombat(s, 0.25);
    elapsed += 0.25;
  }
  assert.equal(s.travel, null, 'the journey should finish');
  assert.ok(s.progress.totalKills > 10, `only ${s.progress.totalKills} kills on the road`);
  assert.ok(s.hero.level > 1, 'the road should be worth some levels');
  const carried = TROPHIES.filter((t) => (s.trophies[t.id] || 0) > 0);
  assert.ok(carried.length >= 2, `arrived carrying only ${carried.length} kinds of trophy`);
});

test('trophies survive nothing special — they just stack', () => {
  const s = createInitialState();
  rollTrophies(s, { drops: [{ id: 'rat-tail', chance: 1, qty: 3 }] });
  rollTrophies(s, { drops: [{ id: 'rat-tail', chance: 1 }] });
  assert.equal(s.trophies['rat-tail'], 4);
  rollTrophies(s, {});
  assert.equal(s.trophies['rat-tail'], 4, 'a monster with no drops changes nothing');
});

test('every monster in the game announces itself with a level', () => {
  // The roadside critters carry explicit stat blocks rather than deriving them
  // from a level, and an early version of them dropped `level` entirely — which
  // spawned "Rabbit (Lv undefined)" into the combat panel.
  for (const monster of TUTORIAL_ROAD.monsters) {
    assert.equal(typeof monster.level, 'number', `${monster.name} has no level`);
    assert.ok(monster.level > 0);
  }
  for (const poi of POIS) {
    for (const monster of poi.monsters || []) {
      assert.equal(typeof monster.level, 'number', `${poi.id}: ${monster.name} has no level`);
    }
  }
});

test('a spawned monster carries its level through to its label', () => {
  const s = createInitialState();
  s.hero.name = 'Probe';
  s.onboarding.step = 'done';
  s.onboarding.tutorialPending = true;
  startTravelToRegion(s, 'holtburg');
  let elapsed = 0;
  while (!s.monster && elapsed < 200) {
    tickCombat(s, 0.25);
    elapsed += 0.25;
  }
  assert.ok(s.monster, 'something should have turned up on the road');
  assert.equal(typeof s.monster.level, 'number');
  const label = monsterLabel(s.monster);
  assert.ok(!label.includes('undefined'), `rendered "${label}"`);
  assert.match(label, /\(Lv \d+\)$/);
});

test('a monster with no level at all is labelled without one, not with "undefined"', () => {
  assert.equal(monsterLabel({ name: 'Mystery' }), 'Mystery');
  assert.equal(monsterLabel({ name: 'Drudge', level: 3 }), 'Drudge (Lv 3)');
  assert.equal(monsterLabel(null), '');
});
