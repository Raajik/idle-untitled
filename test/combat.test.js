import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tickCombat, engageWave } from '../src/game/combat.js';
import { WAVES_PER_POI, waveDifficulty } from '../src/game/waves.js';
import { createInitialState } from '../src/game/state.js';
import { ATTRIBUTE_BASE } from '../src/game/skills.js';
import { getPoiById } from '../src/data/regions.js';
import { derivedStats } from '../src/game/hero.js';

function atPoi(poiId) {
  const s = createInitialState();
  s.progress.unlockedRegions = ['holtburg'];
  s.location = { regionId: 'holtburg', poiId };
  return s;
}

test('engageWave creates a monster with full hp and opens a wave', () => {
  const s = atPoi('drudge-hideout');
  engageWave(s);
  assert.ok(s.monsters.length);
  assert.equal(s.monsters[0].hp, s.monsters[0].maxHp);
  const poi = getPoiById('drudge-hideout');
  assert.ok(poi.monsters.some((m) => m.name === s.monsters[0].name));
  assert.ok(s.progress.waveMonstersLeft >= 1 && s.progress.waveMonstersLeft <= 3);
});

test('monsters hit harder on later waves', () => {
  const early = atPoi('drudge-hideout');
  const late = atPoi('drudge-hideout');
  late.progress.wave = WAVES_PER_POI;
  // Same monster name on both sides so only the wave multiplier differs.
  let matched = false;
  for (let i = 0; i < 200 && !matched; i++) {
    engageWave(early);
    engageWave(late);
    if (early.monsters[0].name === late.monsters[0].name) matched = true;
  }
  assert.ok(matched);
  assert.ok(late.monsters[0].maxHp > early.monsters[0].maxHp);
});

test('no boss spawns inside a POI any more — bosses are becoming their own POIs', () => {
  const s = atPoi('drudge-hideout');
  const poi = getPoiById('drudge-hideout');
  for (let i = 0; i < 300; i++) {
    engageWave(s);
    assert.notEqual(s.monsters[0].name, poi.boss.name);
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
  assert.equal(s.monsters.length, 0);
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
  engageWave(s);
  s.monsters[0].hp = 100000;
  s.monsters[0].maxHp = 100000;
  s.monsters[0].def = 0;
  s.monsters[0].dodge = 0;

  for (let i = 0; i < 30 && !s.monsters[0].bleed; i++) tickCombat(s, 4.1);
  assert.ok(s.monsters[0].bleed);
  assert.ok(s.monsters[0].bleed.stacks >= 1);

  const hpBefore = s.monsters[0].hp;
  for (let i = 0; i < 6; i++) tickCombat(s, 1.1);
  assert.ok(s.monsters[0].hp < hpBefore);
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
  // Enough Endurance to still be standing — and to still have the stamina a
  // defensive roll costs — after several swings. A 1-Endurance hero runs dry and
  // dies inside the window, and a skipped defensive layer never procs, which has
  // nothing to do with what this is checking.
  const durable = (poiId) => {
    const s = atPoi(poiId);
    s.hero.end = 60;
    s.hero.skills.magicResistance.rank = 100; // guarantee procs so focus/self grow
    return s;
  };

  // Raw attrXp is not a progress meter: gaining a point subtracts the cost from
  // it, so enough procs can land it back on zero. Count points and leftover xp
  // together instead.
  const attrProgress = (s, attr) => (s.hero[attr] - ATTRIBUTE_BASE) * 100000 + s.hero.attrXp[attr];

  const magic = durable('daiklos'); // all-void/acid monster pool
  const focusBefore = attrProgress(magic, 'focus');
  const selfBefore = attrProgress(magic, 'self');
  for (let i = 0; i < 40; i++) tickCombat(magic, 0.25);
  assert.ok(magic.hero.skills.magicResistance.xp > 0 || magic.hero.skills.magicResistance.rank > 0);
  assert.ok(attrProgress(magic, 'focus') > focusBefore, 'a Magic Resistance proc should grow Focus');
  assert.ok(attrProgress(magic, 'self') > selfBefore, 'a Magic Resistance proc should grow Self');

  const physical = durable('drudge-hideout'); // no magic in this monster pool
  physical.hero.skills.magicResistance.rank = 0;
  for (let i = 0; i < 40; i++) tickCombat(physical, 0.25);
  assert.equal(physical.hero.skills.magicResistance.rank, 0);
  assert.equal(physical.hero.skills.magicResistance.xp, 0);
});

test('magic casting drains mana, trains War Magic, and deals damage', () => {
  const s = atPoi('drudge-hideout');
  s.hero.combat.mode = 'magic';
  s.hero.combat.magicSpell = 'streak'; // fast and cheap, easy to land several casts
  s.hero.focus = 30;
  // This is about mana, training and damage — not about whether a cast connects.
  // At rank 0 every cast is a coin flip, and a hero starting with 1 Self only has
  // the mana for a handful, so roughly one run in fifty saw them all miss and no
  // damage land. Enough Self to keep casting and enough War Magic to hit, while
  // staying under the rank cap so the skill can still gain xp.
  s.hero.self = 20;
  s.hero.skills.offense.war.rank = 80;
  engageWave(s);
  s.monsters[0].hp = 100000;
  s.monsters[0].maxHp = 100000;
  s.monsters[0].def = 0;
  s.monsters[0].dodge = 0;

  const rankBefore = s.hero.skills.offense.war.rank;
  const xpBefore = s.hero.skills.offense.war.xp;
  for (let i = 0; i < 20; i++) tickCombat(s, 0.6);

  assert.ok(s.hero.skills.offense.war.xp > xpBefore || s.hero.skills.offense.war.rank > rankBefore);
  assert.ok(s.monsters[0].hp < 100000);
  assert.ok(s.hero.mana < derivedStats(s).maxMana);
});
