import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import {
  BUFF_SPELLS,
  BUFF_SECONDS,
  MAX_BUFF_LEVEL,
  buffAt,
  buffSpellName,
  buffSpellByWords,
  buffManaCost,
  effectText,
  getBuffSpell,
} from '../src/data/buffSpells.js';
import { learnSpell, spellLevel, knowsSpell, knownBuff, castBuffSpell, vitalClass } from '../src/game/buffs.js';
import { isCaster, taughtLevel, rollSpellword, SPELLWORD_CHANCE } from '../src/game/spellwords.js';
import { derivedStats } from '../src/game/hero.js';
import { setHeroName, answerSeenLifestone } from '../src/game/onboarding.js';

// --- Plain descriptions ----------------------------------------------------

test('a spell states what it does and nothing else', () => {
  // The old descriptions were flavour ("Knits flesh a little faster than it
  // tears"), which reads once and then is in the way forever.
  assert.equal(effectText('regeneration', 1), '+1 Health regeneration for 30 minutes');
  assert.equal(effectText('rejuvenation', 3), '+3 Stamina regeneration for 30 minutes');
  assert.equal(effectText('renewal', 8), '+8 Mana regeneration for 30 minutes');
  for (const sp of BUFF_SPELLS) {
    const text = effectText(sp.id, 2);
    assert.match(text, /^\+\d+ /, `${sp.id} should open with the number`);
    assert.ok(!/\b(knits|wind|well|faster than)\b/i.test(text), `${sp.id} still reads as flavour`);
  }
});

test('every spell is drawn in the colour of the vital it touches', () => {
  assert.equal(vitalClass('regeneration'), 'hp-text');
  assert.equal(vitalClass('rejuvenation'), 'stamina-text');
  assert.equal(vitalClass('renewal'), 'mana-text');
  for (const sp of BUFF_SPELLS) {
    assert.ok(['hp', 'stamina', 'mana'].includes(sp.vital), `${sp.id} has no vital`);
  }
});

// --- Levels ----------------------------------------------------------------

test('a spell is worth its level, and costs more for it', () => {
  for (let level = 1; level <= MAX_BUFF_LEVEL; level++) {
    const buff = buffAt('regeneration', level);
    assert.equal(buff.effect.hpRegenFlat, level, `level ${level} should give ${level}`);
    assert.equal(buff.seconds, BUFF_SECONDS);
    if (level > 1) assert.ok(buff.manaCost > buffManaCost('regeneration', level - 1), 'higher ranks cost more');
  }
  assert.equal(buffSpellName('regeneration', 2), 'Regeneration II');
  assert.equal(buffSpellName('renewal', 8), 'Renewal VIII');
});

test('levels clamp rather than running off the end', () => {
  assert.equal(buffAt('regeneration', 99).level, MAX_BUFF_LEVEL);
  assert.equal(buffAt('regeneration', 0).level, 1);
  assert.equal(buffAt('nonsense', 3), null);
});

test('learning only ever moves you up', () => {
  const s = createInitialState();
  assert.equal(spellLevel(s, 'regeneration'), 0);
  assert.equal(learnSpell(s, 'regeneration', 3), 3);
  assert.equal(learnSpell(s, 'regeneration', 2), 0, 'a worse teacher teaches nothing');
  assert.equal(spellLevel(s, 'regeneration'), 3, 'and cannot take what you have');
  assert.equal(learnSpell(s, 'regeneration', 5), 5);
  assert.equal(learnSpell(s, 'not-a-spell', 5), 0);
});

test('what you cast is the rank you know', () => {
  const s = createInitialState();
  learnSpell(s, 'regeneration', 4);
  s.hero.mana = 999;
  const known = knownBuff(s, 'regeneration');
  assert.equal(known.name, 'Regeneration IV');
  assert.equal(castBuffSpell(s, 'regeneration'), true);
  assert.equal(derivedStats(s).hpRegenFlat, 4, 'the buff should be worth its rank');
});

test('Alcott starts you at the bottom of each', () => {
  const s = createInitialState();
  setHeroName(s, 'Probe');
  answerSeenLifestone(s, true);
  for (const sp of BUFF_SPELLS) {
    assert.equal(spellLevel(s, sp.id), 1, `${sp.id} should be taught at I`);
    assert.ok(knowsSpell(s, sp.id));
  }
});

// --- Spellwords ------------------------------------------------------------

test('every spell has words, and the words are unique', () => {
  const words = BUFF_SPELLS.map((s) => s.words);
  assert.equal(new Set(words).size, words.length, 'two spells share their words');
  assert.equal(getBuffSpell('regeneration').words, 'Boquar Zhapaj');
  assert.equal(getBuffSpell('rejuvenation').words, 'Boquar Zhavik');
  assert.equal(getBuffSpell('renewal').words, 'Boquar Zhaloi');
  assert.equal(buffSpellByWords('boquar zhapaj').id, 'regeneration', 'lookup should not care about case');
  assert.equal(buffSpellByWords('nonsense'), null);
});

test('the things that cast are the things that could', () => {
  // Humanoids make and use magic; the undead remember how. Claws do not cast.
  assert.ok(isCaster({ name: 'Drudge Mystic' }));
  assert.ok(isCaster({ name: 'Mosswart Shaman' }));
  assert.ok(isCaster({ name: 'Banderling' }), 'humanoids cast');
  assert.ok(isCaster({ name: 'Lesser Lich' }), 'so do the undead');
  assert.ok(isCaster({ name: 'Shallow Wisp' }));
  assert.equal(isCaster({ name: 'Brown Rat' }), false);
  assert.equal(isCaster({ name: 'Wild Ursuin' }), false);
  assert.equal(isCaster(null), false);
});

test('what a monster can teach comes off its own level', () => {
  assert.equal(taughtLevel(2), 1, 'a starting drudge knows the first rank');
  assert.ok(taughtLevel(60) > taughtLevel(10), 'deeper things know more');
  assert.ok(taughtLevel(1000) <= MAX_BUFF_LEVEL, 'and never more than exists');
});

test('a shout that would teach you nothing does not pretend to', () => {
  const s = createInitialState();
  for (const sp of BUFF_SPELLS) learnSpell(s, sp.id, MAX_BUFF_LEVEL);
  const before = s.log.length;
  let taught = 0;
  for (let i = 0; i < 5000; i++) {
    if (rollSpellword(s, { name: 'Drudge Mystic', level: 2 })) taught += 1;
  }
  assert.equal(taught, 0, 'a master should learn nothing from a level-2 drudge');
  for (const sp of BUFF_SPELLS) assert.equal(spellLevel(s, sp.id), MAX_BUFF_LEVEL);
  assert.ok(s.log.length > before, 'it still said the words');
});

test('listening to a caster eventually teaches you something', () => {
  const s = createInitialState();
  let learned = null;
  for (let i = 0; i < 20000 && !learned; i++) {
    learned = rollSpellword(s, { name: 'Drudge Mystic', level: 40 });
  }
  assert.ok(learned, 'a caster should teach eventually');
  assert.ok(spellLevel(s, learned) > 0);

  // The beat is two lines: what it said, and what you did with it.
  const lines = s.log.map((l) => l.text);
  assert.ok(lines.some((t) => /shouts, "Boquar/.test(t)), 'it should shout the words');
  assert.ok(lines.some((t) => /repeat the words/.test(t) && /You've learned/.test(t)), 'and you repeat them');
  // And the learn line is coloured to the vital it touches.
  const learnLine = s.log.find((l) => /You've learned/.test(l.text));
  assert.equal(learnLine.cls, vitalClass(learned));
});

test('nothing that cannot cast ever teaches anything', () => {
  const s = createInitialState();
  for (let i = 0; i < 20000; i++) {
    assert.equal(rollSpellword(s, { name: 'Brown Rat', level: 40 }), null);
  }
  assert.equal(s.log.length, 0, 'and a rat says nothing at all');
});

test('the dead learn nothing', () => {
  const s = createInitialState();
  s.hero.dead = true;
  for (let i = 0; i < 5000; i++) {
    assert.equal(rollSpellword(s, { name: 'Drudge Mystic', level: 40 }), null);
  }
});

test('overhearing is rare enough to stay a moment', () => {
  assert.ok(SPELLWORD_CHANCE > 0 && SPELLWORD_CHANCE < 0.02, `${SPELLWORD_CHANCE} is not rare`);
  const s = createInitialState();
  let shouts = 0;
  const attacks = 10000;
  for (let i = 0; i < attacks; i++) {
    const before = s.log.length;
    rollSpellword(s, { name: 'Drudge Mystic', level: 40 });
    if (s.log.length > before) shouts += 1;
  }
  const rate = shouts / attacks;
  assert.ok(rate < 0.02, `casters spoke on ${(rate * 100).toFixed(1)}% of attacks`);
  assert.ok(shouts > 0, 'but they do speak');
});
