import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import {
  tickCombat,
  activeAttackCost,
  canAffordAttack,
  activeAttackInterval,
  DEFENSIVE_STAMINA_RESERVE,
} from '../src/game/combat.js';
import { derivedStats } from '../src/game/hero.js';
import {
  MELEE_STANCES,
  ARCHERY_STANCES,
  staminaCostForWindup,
  MAX_ATTACK_STAMINA_COST,
  LONGEST_WINDUP_SECONDS,
} from '../src/data/combatStances.js';

function atPoi(poiId = 'drudge-hideout') {
  const s = createInitialState();
  s.progress.unlockedRegions = ['holtburg'];
  s.location = { regionId: 'holtburg', poiId };
  s.progress.boundLifestone = { regionId: 'holtburg', poiId }; // don't get relocated mid-test
  return s;
}

test('windup length sets the cost, 1 to 5, clamped at both ends', () => {
  assert.equal(staminaCostForWindup(LONGEST_WINDUP_SECONDS), MAX_ATTACK_STAMINA_COST);
  assert.equal(staminaCostForWindup(0.1), 1); // never free, however fast
  assert.equal(staminaCostForWindup(99), MAX_ATTACK_STAMINA_COST); // never more than the cap
  // Monotonic: a longer windup never costs less than a shorter one.
  let prev = 0;
  for (let w = 0.2; w <= LONGEST_WINDUP_SECONDS; w += 0.2) {
    const cost = staminaCostForWindup(w);
    assert.ok(cost >= prev, `cost dipped at windup ${w}`);
    prev = cost;
  }
});

test('the melee stance ladder spans the full 1-5 range', () => {
  const s = atPoi();
  const d = derivedStats(s);
  const costs = MELEE_STANCES.map((st) => staminaCostForWindup(st.interval ?? 1 / d.spd));
  assert.equal(costs[0], 1);
  assert.equal(costs[costs.length - 1], MAX_ATTACK_STAMINA_COST);
});

test('melee and archery cost a comparable amount of stamina per second', () => {
  // Archery's ladder tops out at a 2.8s windup against melee's 4.0s. Assigning
  // 1-5 by position rather than by windup made archery ~45% pricier per second
  // and stalled a fresh hero for most of a fight; this guards that regression.
  const s = atPoi();
  const d = derivedStats(s);
  const perSecond = (stances) =>
    stances.map((st) => {
      const windup = st.interval ?? 1 / d.spd;
      return staminaCostForWindup(windup) / windup;
    });
  const all = [...perSecond(MELEE_STANCES), ...perSecond(ARCHERY_STANCES)];
  assert.ok(Math.max(...all) / Math.min(...all) < 1.6, `stamina-per-second spread too wide: ${all.map((n) => n.toFixed(2))}`);
});

test('a melee swing spends stamina', () => {
  const s = atPoi();
  s.hero.combat.meleeStance = 4; // Devastating: the 4s, 5-stamina swing
  const d = derivedStats(s);
  s.hero.stamina = d.maxStamina;
  const before = s.hero.stamina;

  for (let i = 0; i < 20; i++) tickCombat(s, 0.25); // ~5s: one full windup
  assert.ok(s.hero.stamina < before, 'swinging should cost stamina');
});

test('activeAttackCost reports what the current stance actually spends', () => {
  const s = atPoi();
  const d = derivedStats(s);
  for (let i = 0; i < MELEE_STANCES.length; i++) {
    s.hero.combat.meleeStance = i;
    const cost = activeAttackCost(s, d);
    assert.equal(cost.resource, 'stamina');
    assert.equal(cost.amount, staminaCostForWindup(activeAttackInterval(s, d)));
  }
  s.hero.combat.mode = 'magic';
  assert.equal(activeAttackCost(s, d).resource, 'mana');
});

test('running out of stamina parks the attack bar at full instead of resetting it', () => {
  const s = atPoi();
  s.hero.combat.meleeStance = 4; // 5 stamina a swing
  const d = derivedStats(s);
  const interval = activeAttackInterval(s, d);
  s.hero.hp = d.maxHp;
  s.hero.mana = d.maxMana;
  s.hero.stamina = 0.5; // winded, but NOT 0 — that is the "uninitialized" sentinel
  s.hero.attackTimer = interval; // wound all the way up

  assert.equal(canAffordAttack(s, d), false);
  const killsBefore = s.progress.totalKills;
  tickCombat(s, 0.25);

  assert.equal(s.hero.attackTimer, interval, 'the bar should hold at full, not snap back to 0');
  assert.equal(s.progress.totalKills, killsBefore, 'no attack should have gone off');
});

test('hitting exactly zero stamina does not hand out a free refill', () => {
  // 0 used to double as "not filled in yet", so landing on it refilled the pool.
  const s = atPoi();
  const d = derivedStats(s);
  s.hero.hp = d.maxHp;
  s.hero.mana = d.maxMana;
  s.hero.stamina = 0;

  tickCombat(s, 0.25);
  assert.ok(s.hero.stamina < d.maxStamina * 0.5, `stamina jumped to ${s.hero.stamina} of ${d.maxStamina}`);
});

test('a fresh hero is genuinely limited by stamina, but still kills', () => {
  // Fighting is meant to outpace passive regen, so a level-1 hero spends most of
  // the fight waiting on their next swing — that's the pressure that makes
  // Endurance worth raising and recovery worth seeking out. It has to bite
  // without stopping progress outright.
  const s = atPoi();
  // Padded with armor rather than Endurance: dying would skip ticks and hand out
  // vitae, both of which move the number this test is trying to measure, and
  // raising END would shrink the very stamina pressure under test.
  s.equipment.chest = { id: 1, slot: 'chest', power: 200, spells: [], rarity: 'Common', name: 'Test Plate' };
  let stalledTicks = 0;
  let liveTicks = 0;
  for (let i = 0; i < 2400; i++) {
    tickCombat(s, 0.25);
    if (s.hero.dead) continue;
    liveTicks++;
    if (!canAffordAttack(s)) stalledTicks++;
  }
  const stalled = stalledTicks / liveTicks;
  assert.ok(stalled > 0.3, `stamina should bite, but only stalled ${(stalled * 100).toFixed(0)}%`);
  assert.ok(s.progress.totalKills > 0, 'a stamina-limited hero should still be killing things');
});

test('an endurance-heavy hero grows out of the stamina wall', () => {
  // Regen is a fraction of the pool, so raising Endurance and Quickness is the
  // in-game answer to being winded — the wall has to actually come down.
  const s = atPoi();
  s.hero.end = 40;
  s.hero.quick = 40;
  s.hero.combat.meleeStance = 2; // Heavy: middle of the cost ladder
  let stalledTicks = 0;
  let liveTicks = 0;
  for (let i = 0; i < 2400; i++) {
    tickCombat(s, 0.25);
    if (s.hero.dead) continue;
    liveTicks++;
    if (!canAffordAttack(s)) stalledTicks++;
  }
  assert.ok(stalledTicks / liveTicks < 0.2, `still stalled ${((stalledTicks / liveTicks) * 100).toFixed(0)}% with 40 END/QUICK`);
});

test('attacks stop while there is still stamina left to defend with', () => {
  // Being winded should cost damage, not your guard: if attacks could drain the
  // pool to nothing, Dodge/Block/Parry would all fail too and an unattended hero
  // would spiral into repeated deaths instead of just fighting slower. Attacks
  // therefore stop DEFENSIVE_STAMINA_RESERVE short of empty, leaving enough for
  // one defensive roll.
  const setup = (stamina) => {
    const s = atPoi();
    s.hero.combat.meleeStance = 4; // the most expensive swing
    const d = derivedStats(s);
    s.hero.hp = d.maxHp;
    s.hero.mana = d.maxMana;
    s.hero.stamina = stamina;
    s.hero.attackTimer = activeAttackInterval(s, d); // wound all the way up
    return s;
  };

  const cost = activeAttackCost(setup(50)).amount;
  // One point short of cost + reserve: the swing must not go off, and the hero
  // must still be holding more than a single defensive roll's worth.
  const winded = setup(cost + DEFENSIVE_STAMINA_RESERVE - 1);
  assert.equal(canAffordAttack(winded), false);
  const before = winded.hero.stamina;
  tickCombat(winded, 0.25);
  assert.ok(winded.hero.stamina >= before, 'a blocked swing should not have spent anything');

  // Exactly at the threshold, it does go off.
  const ready = setup(cost + DEFENSIVE_STAMINA_RESERVE);
  assert.equal(canAffordAttack(ready), true);
  tickCombat(ready, 0.25);
  assert.ok(ready.hero.stamina < cost + DEFENSIVE_STAMINA_RESERVE, 'the swing should have spent its cost');
});

test('not fighting restores stamina faster than fighting does', () => {
  const fighting = atPoi();
  const resting = atPoi();
  resting.location = { regionId: 'holtburg', poiId: null }; // stood in town, swinging at nothing
  for (const st of [fighting, resting]) {
    const d = derivedStats(st);
    st.hero.hp = d.maxHp;
    st.hero.mana = d.maxMana;
    st.hero.stamina = 1;
  }
  for (let i = 0; i < 40; i++) {
    tickCombat(fighting, 0.25);
    tickCombat(resting, 0.25);
  }
  assert.ok(resting.hero.stamina > fighting.hero.stamina, `idle ${resting.hero.stamina} vs fight ${fighting.hero.stamina}`);
});

test('regen runs wherever you are, so idling is always a way back', () => {
  // In town, at a site, and on the road: none of these have a fight to tick, and
  // all of them have to give stamina back or you can be stranded empty.
  const places = [
    { regionId: 'holtburg', poiId: null },
    { regionId: 'holtburg', poiId: 'budding-lifestone' },
    { regionId: null, poiId: null },
  ];
  for (const location of places) {
    const s = atPoi();
    s.location = location;
    s.hero.hp = 1;
    s.hero.stamina = 1;
    s.hero.mana = 0;
    for (let i = 0; i < 40; i++) tickCombat(s, 0.25);
    const where = `${location.regionId}/${location.poiId}`;
    assert.ok(s.hero.stamina > 1, `no stamina regen at ${where}`);
    assert.ok(s.hero.hp > 1, `no health regen at ${where}`);
    assert.ok(s.hero.mana > 0, `no mana regen at ${where}`);
  }
});

test('the dead do not regenerate', () => {
  const s = atPoi();
  s.hero.hp = 1;
  s.hero.stamina = 1;
  s.hero.dead = true;
  s.hero.respawnTimer = 999;
  for (let i = 0; i < 20; i++) tickCombat(s, 0.25);
  assert.equal(s.hero.stamina, 1, 'a corpse should not catch its breath');
});
