import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import { tickCombat, activeAttackCost, canAffordAttack, activeAttackInterval } from '../src/game/combat.js';
import { derivedStats } from '../src/game/hero.js';
import {
  MELEE_STANCES,
  ARCHERY_STANCES,
  staminaCostForWindup,
  MAX_ATTACK_STAMINA_COST,
  LONGEST_WINDUP_SECONDS,
} from '../src/data/combatStances.js';

function atPoi(poiId = 'holtburg-meeting-hall') {
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

test('a fresh hero can still fight without stalling out', () => {
  // Stamina should be a pressure, not a handbrake: the opening stance on a
  // level-1 hero has to sustain itself against passive regen.
  const s = atPoi();
  let stalledTicks = 0;
  let liveTicks = 0;
  for (let i = 0; i < 2400; i++) {
    tickCombat(s, 0.25);
    if (s.hero.dead) continue;
    liveTicks++;
    if (!canAffordAttack(s)) stalledTicks++;
  }
  assert.ok(s.progress.totalKills > 0);
  assert.ok(stalledTicks / liveTicks < 0.25, `stalled ${((stalledTicks / liveTicks) * 100).toFixed(0)}% of the fight`);
});
