import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import { tickCombat } from '../src/game/combat.js';
import { derivedStats, grantXp } from '../src/game/hero.js';
import {
  gainVitae,
  vitaePct,
  vitaeMultiplier,
  atMaxVitae,
  xpToClearStack,
  VITAE_PER_STACK,
  MAX_VITAE_STACKS,
  MAX_VITAE_PCT,
} from '../src/game/vitae.js';
import { sacrificeVitae, canSacrificeVitae, LIFESTONE_GROWTH_REQUIRED, GROWTH_PER_OFFERING } from '../src/game/lifestone.js';
import { hasAchievement } from '../src/game/achievements.js';

function atPoi(poiId = 'drudge-hideout') {
  const s = createInitialState();
  s.progress.unlockedRegions = ['holtburg'];
  s.location = { regionId: 'holtburg', poiId };
  s.progress.boundLifestone = { regionId: 'holtburg', poiId };
  return s;
}

test('vitae stacks 5% at a time and stops at 40%', () => {
  const s = atPoi();
  for (let i = 0; i < MAX_VITAE_STACKS; i++) {
    assert.equal(gainVitae(s, 'test'), true);
  }
  assert.equal(vitaePct(s), MAX_VITAE_PCT);
  assert.ok(atMaxVitae(s));
  assert.equal(gainVitae(s, 'test'), false, 'vitae should never stack past the floor');
  assert.equal(vitaePct(s), MAX_VITAE_PCT);
});

test('vitae weakens the body without slowing it down', () => {
  const s = atPoi();
  const clean = derivedStats(s);
  gainVitae(s, 'test');
  const hurt = derivedStats(s);

  assert.equal(vitaeMultiplier(s), 1 - VITAE_PER_STACK / 100);
  assert.ok(hurt.maxHp < clean.maxHp);
  assert.ok(hurt.maxStamina < clean.maxStamina);
  assert.ok(hurt.maxMana < clean.maxMana);
  assert.ok(hurt.atk < clean.atk);
  // Speed and crit are deliberately untouched — a 40% slower fight would be
  // miserable to sit through.
  assert.equal(hurt.spd, clean.spd);
  assert.equal(hurt.critChance, clean.critChance);
});

test('earning experience burns vitae back off, one stack at a time', () => {
  const s = atPoi();
  gainVitae(s, 'test');
  gainVitae(s, 'test');
  assert.equal(vitaePct(s), 10);

  grantXp(s, xpToClearStack(s.hero.level));
  assert.equal(vitaePct(s), 5, 'one stack should have burned off');

  grantXp(s, xpToClearStack(s.hero.level) * 5); // far more than enough
  assert.equal(vitaePct(s), 0);
  assert.equal(s.hero.vitae.xpRemaining, 0);
});

test('dying leaves vitae behind', () => {
  const s = atPoi('virindi-citadel'); // Direlands, lethal to a level-1 hero
  s.location = { regionId: 'direlands', poiId: 'virindi-citadel' };
  s.progress.boundLifestone = { regionId: 'direlands', poiId: 'virindi-citadel' };
  s.hero.end = 1;
  for (let i = 0; i < 400 && vitaePct(s) === 0; i++) tickCombat(s, 0.25);
  assert.ok(vitaePct(s) > 0, 'death should have cost vitae');
});

test('carrying the full 40% earns the achievement, however you got there', () => {
  const s = atPoi();
  assert.equal(hasAchievement(s, 'vitae-hardened'), false);
  for (let i = 0; i < MAX_VITAE_STACKS; i++) gainVitae(s, 'test');
  assert.ok(hasAchievement(s, 'vitae-hardened'));

  // And it pays out: flat regen on top of the percentage trickle.
  const d = derivedStats(s);
  assert.ok(d.hpRegenFlat > 0);
  assert.ok(d.staminaRegenFlat > 0);
  assert.ok(d.manaRegenFlat > 0);
});

test('spending every drop of vitae is exactly enough to finish a Lifestone', () => {
  // The stone needs LIFESTONE_GROWTH_REQUIRED and a body holds MAX_VITAE_STACKS,
  // so the two have to line up or the site is unfinishable by sacrifice alone.
  assert.equal(GROWTH_PER_OFFERING * MAX_VITAE_STACKS, LIFESTONE_GROWTH_REQUIRED);
});

test('Sacrificing Vitae costs vitals and vitae, and is refused once you are spent', () => {
  const s = atPoi('budding-lifestone');
  s.location = { regionId: 'holtburg', poiId: 'budding-lifestone' };
  const refill = () => {
    const d = derivedStats(s);
    s.hero.hp = d.maxHp;
    s.hero.mana = d.maxMana;
  };
  refill();

  assert.equal(sacrificeVitae(s, 'budding-lifestone'), true);
  assert.equal(vitaePct(s), VITAE_PER_STACK);
  assert.ok(s.hero.hp < derivedStats(s).maxHp, 'it should have taken blood too');

  for (let i = 1; i < MAX_VITAE_STACKS; i++) {
    refill();
    assert.equal(sacrificeVitae(s, 'budding-lifestone'), true, `sacrifice ${i + 1} should be allowed`);
  }
  refill();
  assert.equal(canSacrificeVitae(s, 'budding-lifestone'), false, 'nothing left to give at the floor');
});

test('a budding Lifestone keeps growing on its own once started', () => {
  const s = atPoi('budding-lifestone');
  s.location = { regionId: 'holtburg', poiId: 'budding-lifestone' };
  s.progress.lifestoneGrowth['budding-lifestone'] = 5;
  const before = s.progress.lifestoneGrowth['budding-lifestone'];
  for (let i = 0; i < 240; i++) tickCombat(s, 0.25); // one minute
  assert.ok(s.progress.lifestoneGrowth['budding-lifestone'] > before);
});

test('an untouched Lifestone does not grow on its own', () => {
  const s = atPoi();
  for (let i = 0; i < 240; i++) tickCombat(s, 0.25);
  assert.equal(s.progress.lifestoneGrowth['budding-lifestone'], undefined);
});
