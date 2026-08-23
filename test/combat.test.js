import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tickCombat, spawnMonster } from '../src/game/combat.js';
import { WAVES_PER_POI, waveDifficulty } from '../src/game/waves.js';
import { createInitialState } from '../src/game/state.js';
import { getPoiById } from '../src/data/regions.js';
import { derivedStats } from '../src/game/hero.js';

function atPoi(poiId) {
  const s = createInitialState();
  s.progress.unlockedRegions = ['holtburg'];
  s.location = { regionId: 'holtburg', poiId };
  return s;
}

test('spawnMonster creates a monster with full hp and opens a wave', () => {
  const s = atPoi('drudge-hideout');
  spawnMonster(s);
  assert.ok(s.monster);
  assert.equal(s.monster.hp, s.monster.maxHp);
  const poi = getPoiById('drudge-hideout');
  assert.ok(poi.monsters.some((m) => m.name === s.monster.name));
  assert.ok(s.progress.waveMonstersLeft >= 1 && s.progress.waveMonstersLeft <= 3);
});

test('monsters hit harder on later waves', () => {
  const early = atPoi('drudge-hideout');
  const late = atPoi('drudge-hideout');
  late.progress.wave = WAVES_PER_POI;
  // Same monster name on both sides so only the wave multiplier differs.
  let matched = false;
  for (let i = 0; i < 200 && !matched; i++) {
    spawnMonster(early);
    spawnMonster(late);
    if (early.monster.name === late.monster.name) matched = true;
  }
  assert.ok(matched);
  assert.ok(late.monster.maxHp > early.monster.maxHp);
});

test('no boss spawns inside a POI any more — bosses are becoming their own POIs', () => {
  const s = atPoi('drudge-hideout');
  const poi = getPoiById('drudge-hideout');
  for (let i = 0; i < 300; i++) {
    spawnMonster(s);
    assert.notEqual(s.monster.name, poi.boss.name);
  }
});

test('combat ticks eventually kill the monster and grant rewards', () => {
  const s = atPoi('drudge-hideout');
  // make hero strong enough to one-shot
  s.hero.str = 500;
  s.hero.end = 500;
  const pyrealsBefore = s.pyreals;
  for (let i = 0; i < 40; i++) tickCombat(s, 0.25);
  assert.ok(s.progress.totalKills >= 1);
  assert.ok(s.pyreals > pyrealsBefore);
  assert.ok(s.progress.totalXpEarned > 0 || s.hero.level > 1);
});

test('waves advance as the hero clears them', () => {
  const s = atPoi('drudge-hideout');
  s.hero.str = 500;
  s.hero.end = 500;
  assert.equal(s.progress.wave, 1);
  for (let i = 0; i < 200; i++) tickCombat(s, 0.25);
  assert.ok(s.progress.wave > 1 || s.progress.totalClears > 0);
  assert.ok(waveDifficulty(s.progress.wave) >= 0);
});

test('no combat happens while travelling or in town', () => {
  const s = createInitialState(); // fresh game: no location, no travel
  for (let i = 0; i < 20; i++) tickCombat(s, 0.25);
  assert.equal(s.monster, null);
  assert.equal(s.progress.totalKills, 0);
});

test('hero death respawns them at their bound Lifestone', () => {
  const s = atPoi('virindi-citadel'); // Direlands, brutal
  s.progress.boundLifestone = { regionId: 'holtburg', poiId: null };
  s.hero.end = 1; // very squishy
  let died = false;
  for (let i = 0; i < 400 && !(died && !s.hero.dead); i++) {
    tickCombat(s, 0.25);
    if (s.hero.dead) died = true;
  }
  assert.ok(died);
  assert.equal(s.hero.dead, false);
  assert.ok(s.hero.hp > 0);
  assert.deepEqual(s.location, { regionId: 'holtburg', poiId: null });
});

test('the Devastating melee stance applies a stacking bleed that ticks damage over time', () => {
  const s = atPoi('drudge-hideout');
  s.hero.combat.meleeStance = 4; // Devastating: 4s swing, applies Bleed
  s.hero.str = 30;
  s.hero.end = 30;
  spawnMonster(s);
  s.monster.hp = 100000;
  s.monster.maxHp = 100000;
  s.monster.def = 0;
  s.monster.dodge = 0;

  for (let i = 0; i < 30 && !s.monster.bleed; i++) tickCombat(s, 4.1);
  assert.ok(s.monster.bleed);
  assert.ok(s.monster.bleed.stacks >= 1);

  const hpBefore = s.monster.hp;
  for (let i = 0; i < 6; i++) tickCombat(s, 1.1);
  assert.ok(s.monster.hp < hpBefore);
});

test('melee swings grow STR, COORD, and QUICK', () => {
  const s = atPoi('drudge-hideout');
  for (let i = 0; i < 40; i++) tickCombat(s, 0.25);
  assert.ok(s.hero.attrXp.str > 0 || s.hero.str > 5);
  assert.ok(s.hero.attrXp.coord > 0 || s.hero.coord > 5);
  assert.ok(s.hero.attrXp.quick > 0 || s.hero.quick > 5);
});

test('archery grows COORD markedly faster than melee', () => {
  const melee = atPoi('drudge-hideout');
  const archery = atPoi('drudge-hideout');
  archery.hero.combat.mode = 'archery';
  archery.equipment.weapon = { slot: 'weapon', power: 5, spells: [], rarity: 'Common', name: 'Worn Bow', baseType: 'bow' };
  for (let i = 0; i < 40; i++) {
    tickCombat(melee, 0.25);
    tickCombat(archery, 0.25);
  }
  const coordProgress = (s) => (s.hero.coord - 5) * 1000 + s.hero.attrXp.coord;
  assert.ok(coordProgress(archery) > coordProgress(melee));
});

test('hero death grants a bigger END bump than a single non-lethal hit', () => {
  const s = atPoi('virindi-citadel'); // brutal, guarantees hits land
  s.hero.end = 1;
  let died = false;
  for (let i = 0; i < 400 && !died; i++) {
    tickCombat(s, 0.25);
    if (s.hero.dead) died = true;
  }
  assert.ok(died);
  // a single hit alone only grants HIT_TAKEN_END_XP (1); death adds DEATH_END_XP (15) on top.
  assert.ok(s.hero.attrXp.end > 5 || s.hero.end > 5);
});

test('Magic Resistance only trains against magic-based attacks', () => {
  const magic = atPoi('daiklos'); // all-void/acid monster pool
  magic.hero.skills.magicResistance.rank = 100; // guarantee procs so focus/self grow
  magic.hero.end = 1;
  for (let i = 0; i < 40; i++) tickCombat(magic, 0.25);
  assert.ok(magic.hero.skills.magicResistance.xp > 0 || magic.hero.skills.magicResistance.rank > 0);
  assert.ok(magic.hero.attrXp.focus > 0 || magic.hero.focus > 5);
  assert.ok(magic.hero.attrXp.self > 0 || magic.hero.self > 5);

  const physical = atPoi('drudge-hideout'); // all-bludgeon monster pool
  for (let i = 0; i < 40; i++) tickCombat(physical, 0.25);
  assert.equal(physical.hero.skills.magicResistance.rank, 0);
  assert.equal(physical.hero.skills.magicResistance.xp, 0);
});

test('magic casting drains mana, trains War Magic, and deals damage', () => {
  const s = atPoi('drudge-hideout');
  s.hero.combat.mode = 'magic';
  s.hero.combat.magicSpell = 'streak'; // fast and cheap, easy to land several casts
  s.hero.focus = 30;
  spawnMonster(s);
  s.monster.hp = 100000;
  s.monster.maxHp = 100000;
  s.monster.def = 0;
  s.monster.dodge = 0;

  const rankBefore = s.hero.skills.offense.war.rank;
  const xpBefore = s.hero.skills.offense.war.xp;
  for (let i = 0; i < 20; i++) tickCombat(s, 0.6);

  assert.ok(s.hero.skills.offense.war.xp > xpBefore || s.hero.skills.offense.war.rank > rankBefore);
  assert.ok(s.monster.hp < 100000);
  assert.ok(s.hero.mana < derivedStats(s).maxMana);
});
