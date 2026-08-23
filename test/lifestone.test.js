import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import { tickCombat } from '../src/game/combat.js';
import { derivedStats } from '../src/game/hero.js';
import { isSite, getPoiById } from '../src/data/regions.js';
import { vitaePct, atMaxVitae, VITAE_PER_STACK, MAX_VITAE_STACKS } from '../src/game/vitae.js';
import {
  sacrificeVitae,
  canSacrificeVitae,
  offeringCost,
  isGrown,
  lifestoneGrowth,
  respawnAtLifestone,
  LIFESTONE_GROWTH_REQUIRED,
  GROWTH_PER_OFFERING,
} from '../src/game/lifestone.js';

const SITE = 'budding-lifestone';

// Recovery is passive now, so "rested" is just a reading of the vitals rather
// than the end of a channelled action.
function isRested(state) {
  const d = derivedStats(state);
  const h = state.hero;
  return h.hp >= d.maxHp && h.stamina >= d.maxStamina && h.mana >= d.maxMana;
}

function atSite() {
  const s = createInitialState();
  s.progress.unlockedRegions = ['holtburg'];
  s.location = { regionId: 'holtburg', poiId: SITE };
  const d = derivedStats(s);
  s.hero.hp = d.maxHp;
  s.hero.stamina = d.maxStamina;
  s.hero.mana = d.maxMana;
  return s;
}

test('the budding Lifestone is a site: no monsters, no combat', () => {
  const poi = getPoiById(SITE);
  assert.ok(isSite(poi));
  const s = atSite();
  for (let i = 0; i < 40; i++) tickCombat(s, 0.25);
  assert.equal(s.monsters.length, 0);
  assert.equal(s.progress.totalKills, 0);
});

test('a fresh hero is bound to the roadside stone, a full walk short of Holtburg', () => {
  const s = createInitialState();
  assert.deepEqual(s.progress.boundLifestone, { regionId: null, poiId: null });
});

test('an offering costs vitae and nothing else', () => {
  const s = atSite();
  const d = derivedStats(s);
  const hp = s.hero.hp;
  const mana = s.hero.mana;

  assert.equal(sacrificeVitae(s, SITE), true);
  assert.equal(lifestoneGrowth(s, SITE), GROWTH_PER_OFFERING);
  assert.equal(vitaePct(s), VITAE_PER_STACK, 'the price is vitae');
  // The old version drank most of your health and mana, which turned the site
  // into offer-then-stand-about-waiting.
  assert.equal(s.hero.hp, hp, 'it should not have taken blood');
  assert.equal(s.hero.mana, mana, 'or mana');
  assert.equal(offeringCost(s).vitaePct, VITAE_PER_STACK);
});

test('offerings can be made back to back until there is nothing left to give', () => {
  const s = atSite();
  for (let i = 0; i < MAX_VITAE_STACKS; i++) {
    assert.equal(sacrificeVitae(s, SITE), true, `offering ${i + 1} should be allowed straight away`);
  }
  assert.equal(atMaxVitae(s), true);
  assert.equal(canSacrificeVitae(s, SITE), false, 'the stone can take no more');
  assert.equal(sacrificeVitae(s, SITE), false);
});

test('a body full of vitae is exactly enough to finish the stone', () => {
  const s = atSite();
  for (let i = 0; i < MAX_VITAE_STACKS; i++) sacrificeVitae(s, SITE);
  assert.ok(isGrown(s, SITE), 'spending every drop should complete it');
});

test('fully growing the Lifestone rebinds the hero to the region hub', () => {
  const s = atSite();
  const d = derivedStats(s);
  for (let i = 0; i < LIFESTONE_GROWTH_REQUIRED / GROWTH_PER_OFFERING; i++) {
    s.hero.hp = d.maxHp;
    s.hero.mana = d.maxMana;
    assert.equal(sacrificeVitae(s, SITE), true);
  }
  assert.ok(isGrown(s, SITE));
  assert.deepEqual(s.progress.boundLifestone, { regionId: 'holtburg', poiId: null });
  assert.equal(s.progress.recallUnlocked, true);
  assert.equal(sacrificeVitae(s, SITE), false); // nothing left to grow
});

test('respawning moves the hero to their bound Lifestone and resets the wave', () => {
  const s = createInitialState();
  s.progress.boundLifestone = { regionId: 'holtburg', poiId: null };
  s.location = { regionId: 'holtburg', poiId: 'daiklos' };
  s.progress.wave = 7;
  s.progress.waveMonstersLeft = 2;

  assert.equal(respawnAtLifestone(s), true);
  assert.deepEqual(s.location, { regionId: 'holtburg', poiId: null });
  assert.equal(s.progress.wave, 1);
  assert.equal(s.progress.waveMonstersLeft, 0);
  assert.equal(respawnAtLifestone(s), false); // already standing there
});
