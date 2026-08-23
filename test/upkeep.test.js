import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import { tickCombat } from '../src/game/combat.js';
import { derivedStats } from '../src/game/hero.js';
import { setHeroName, answerSeenLifestone, acknowledgeAlcottIntro } from '../src/game/onboarding.js';
import {
  castBuffSpell,
  canCastBuffSpell,
  toggleAutoCast,
  tickBuffs,
  hasBuff,
  knowsSpell,
  AUTOCAST_REFRESH_SECONDS,
} from '../src/game/buffs.js';
import { useConsumable, charges, canAutoHeal, STAMINA_PER_HP } from '../src/game/consumables.js';
import { BUFF_SPELLS, ALCOTT_TAUGHT_SPELLS } from '../src/data/buffSpells.js';
import { ALCOTT_GIFTS, getConsumable } from '../src/data/consumables.js';
import { MAX_SPELL_LEVEL } from '../src/data/spells.js';

function outfittedHero() {
  const s = createInitialState();
  setHeroName(s, 'Probe');
  answerSeenLifestone(s, true); // Alcott's gifts land either way
  s.progress.unlockedRegions = ['holtburg'];
  s.location = { regionId: 'holtburg', poiId: 'drudge-hideout' };
  s.progress.boundLifestone = { regionId: 'holtburg', poiId: 'drudge-hideout' };
  const d = derivedStats(s);
  s.hero.hp = d.maxHp;
  s.hero.stamina = d.maxStamina;
  s.hero.mana = d.maxMana;
  return s;
}

test('Alcott sends nobody off empty-handed, whichever answer you give', () => {
  // "Yes" ends the intro immediately; "no" runs through Alcott's explanation
  // first. Both have to arrive at the same kit, potion and spellbook.
  const paths = {
    'seen a Lifestone before': (s) => answerSeenLifestone(s, true),
    'never seen one': (s) => {
      answerSeenLifestone(s, false);
      acknowledgeAlcottIntro(s);
    },
  };
  for (const [name, walk] of Object.entries(paths)) {
    const s = createInitialState();
    setHeroName(s, 'Probe');
    walk(s);
    assert.equal(s.onboarding.step, 'done', `${name}: intro should be over`);
    for (const id of ALCOTT_GIFTS) {
      assert.equal(charges(s, id), getConsumable(id).startingCharges, `${name}: missing ${id}`);
    }
    for (const id of ALCOTT_TAUGHT_SPELLS) assert.ok(knowsSpell(s, id), `${name}: never learned ${id}`);
    assert.ok(s.progress.autoHealUnlocked, `${name}: the kit should unlock auto-healing`);
  }
});

test('the three taught spells each raise their own regeneration', () => {
  const keys = { regeneration: 'hpRegenFlat', rejuvenation: 'staminaRegenFlat', renewal: 'manaRegenFlat' };
  for (const spell of BUFF_SPELLS) {
    const s = outfittedHero();
    const before = derivedStats(s)[keys[spell.id]];
    assert.equal(castBuffSpell(s, spell.id), true);
    assert.ok(hasBuff(s, spell.id));
    assert.equal(derivedStats(s)[keys[spell.id]], before + 1, `${spell.name} should add 1`);
  }
});

test('spells cost mana, run for thirty minutes, and then fade', () => {
  const s = outfittedHero();
  const spell = BUFF_SPELLS[0];
  assert.equal(spell.seconds, 30 * 60, 'buff spells last half an hour');

  const manaBefore = s.hero.mana;
  castBuffSpell(s, spell.id);
  assert.equal(s.hero.mana, manaBefore - spell.manaCost);

  tickBuffs(s, spell.seconds - 1);
  assert.ok(hasBuff(s, spell.id), 'still up a second before it ends');
  tickBuffs(s, 2);
  assert.equal(hasBuff(s, spell.id), false, 'gone once it runs out');
});

test('re-casting refreshes rather than stacking', () => {
  const s = outfittedHero();
  const spell = BUFF_SPELLS[0];
  s.hero.mana = 999;
  castBuffSpell(s, spell.id);
  tickBuffs(s, 600);
  castBuffSpell(s, spell.id);
  assert.equal(s.buffs.filter((b) => b.id === spell.id).length, 1, 'one buff, not two');
  assert.equal(s.buffs.find((b) => b.id === spell.id).remaining, spell.seconds);
});

test('auto-cast refreshes a buff just before it lapses, never after', () => {
  const s = outfittedHero();
  const spell = BUFF_SPELLS[0];
  s.hero.mana = 999;
  toggleAutoCast(s, spell.id);

  // It puts the buff up in the first place.
  tickCombat(s, 0.25);
  assert.ok(hasBuff(s, spell.id));

  // Wind it down to inside the refresh window and it goes straight back up.
  s.buffs.find((b) => b.id === spell.id).remaining = AUTOCAST_REFRESH_SECONDS - 1;
  tickCombat(s, 0.25);
  assert.ok(s.buffs.find((b) => b.id === spell.id).remaining > AUTOCAST_REFRESH_SECONDS);
});

test('auto-cast stays quiet when there is no mana for it', () => {
  const s = outfittedHero();
  const spell = BUFF_SPELLS[0];
  toggleAutoCast(s, spell.id);
  s.hero.mana = 0;
  tickCombat(s, 0.25);
  assert.equal(hasBuff(s, spell.id), false);
  assert.equal(canCastBuffSpell(s, spell.id), false);
});

test('the stamina potion is one drink that opens alchemy', () => {
  const s = outfittedHero();
  assert.equal(s.progress.alchemyUnlocked, false);
  assert.equal(useConsumable(s, 'stamina-potion'), true);
  assert.ok(s.progress.alchemyUnlocked);
  assert.equal(charges(s, 'stamina-potion'), 0);
  assert.equal(derivedStats(s).staminaRegenFlat, 1);
  assert.equal(useConsumable(s, 'stamina-potion'), false, 'nothing left to drink');
});

test('auto-healing buys health with stamina, and spends kit charges doing it', () => {
  const s = outfittedHero();
  s.settings.autoHeal = true;
  const d = derivedStats(s);
  s.hero.hp = 1; // well under the half-health trigger
  s.hero.stamina = d.maxStamina;

  const chargesBefore = charges(s, 'healing-kit');
  const staminaBefore = s.hero.stamina;
  tickCombat(s, 0.25);

  const healed = s.hero.hp - 1;
  assert.ok(healed > 0, 'should have patched up');
  assert.equal(charges(s, 'healing-kit'), chargesBefore - 1, 'one charge per heal');
  assert.ok(staminaBefore - s.hero.stamina >= healed * STAMINA_PER_HP - 1, 'health is paid for in stamina');
});

test('auto-healing does nothing at full health, or with an empty kit', () => {
  const s = outfittedHero();
  s.settings.autoHeal = true;
  const before = charges(s, 'healing-kit');
  tickCombat(s, 0.25); // at full health
  assert.equal(charges(s, 'healing-kit'), before, 'no charge spent while healthy');

  s.consumables['healing-kit'] = 0;
  s.hero.hp = 1;
  assert.equal(canAutoHeal(s), false);
  tickCombat(s, 0.25);
  assert.equal(charges(s, 'healing-kit'), 0);
});

test('tinkered properties now reach level 10', () => {
  assert.equal(MAX_SPELL_LEVEL, 10);
});

test('a hero has vitals before ever reaching a POI', () => {
  // They start as null and used to be filled in only inside the "standing at a
  // POI" branch, which left anyone in town or on the road unable to cast, drink
  // or meditate — all of which check whether there's anything to spend.
  const s = createInitialState();
  setHeroName(s, 'Probe');
  answerSeenLifestone(s, true);
  assert.equal(s.location.poiId, null, 'still on the road');

  tickCombat(s, 0.25);
  const d = derivedStats(s);
  assert.equal(s.hero.hp, d.maxHp);
  assert.equal(s.hero.stamina, d.maxStamina);
  assert.equal(s.hero.mana, d.maxMana);
  assert.ok(canCastBuffSpell(s, 'regeneration'), 'should be able to cast what Alcott just taught');
});
