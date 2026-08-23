import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import { tickCombat } from '../src/game/combat.js';
import { derivedStats } from '../src/game/hero.js';
import { setHeroName, answerSeenLifestone, acknowledgeAlcottIntro } from '../src/game/onboarding.js';
import {
  knownBuff,
  castBuffSpell,
  canCastBuffSpell,
  toggleAutoCast,
  tickBuffs,
  hasBuff,
  knowsSpell,
  AUTOCAST_REFRESH_SECONDS,
} from '../src/game/buffs.js';
import { useConsumable, charges, canAutoHeal, STAMINA_PER_HP } from '../src/game/consumables.js';
import { BUFF_SPELLS, BUFF_SECONDS, ALCOTT_TAUGHT_SPELLS } from '../src/data/buffSpells.js';
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
  // Spells carry a level now; what you cast is the rank you know.
  const known = knownBuff(s, spell.id);
  assert.equal(known.seconds, BUFF_SECONDS, 'buff spells last half an hour');

  const manaBefore = s.hero.mana;
  castBuffSpell(s, spell.id);
  assert.equal(s.hero.mana, manaBefore - known.manaCost);

  tickBuffs(s, known.seconds - 1);
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
  assert.equal(s.buffs.find((b) => b.id === spell.id).remaining, BUFF_SECONDS);
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
  // POI" branch, which left anyone in town or on the road unable to cast or
  // drink — both of which check whether there's anything to spend.
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

// --- The one switch ------------------------------------------------------
// Upkeep used to be five separate toggles behind a folded section on the Battle
// tab. The sidebar now carries a single switch for all of it, and a gear to the
// screen where you can still choose between them.

import { upkeepEntries, upkeepAllOn, setAllUpkeep, toggleAllUpkeep } from '../src/game/upkeep.js';
import { learnSpell, isAutoCast } from '../src/game/buffs.js';
import { grantConsumable, isAutoDrink } from '../src/game/consumables.js';
import { sidebarUpkeepHtml, upkeepTab } from '../src/ui/tabs.js';

function withEverything() {
  const s = createInitialState();
  for (const id of ['regeneration', 'rejuvenation', 'renewal']) learnSpell(s, id, 1);
  grantConsumable(s, 'stamina-potion', 3);
  grantConsumable(s, 'healing-kit', 5);
  s.progress.autoHealUnlocked = true;
  return s;
}

test('only what you actually have counts as a choice', () => {
  const bare = createInitialState();
  assert.deepEqual(upkeepEntries(bare), [], 'a hero who knows nothing has nothing to keep up');
  assert.equal(upkeepAllOn(bare), false, 'and "all on" is not vacuously true');

  const s = withEverything();
  const kinds = upkeepEntries(s).map((e) => e.kind);
  assert.equal(kinds.filter((k) => k === 'spell').length, 3);
  assert.ok(kinds.includes('drink'), 'a potion in the pack is a choice');
  assert.ok(kinds.includes('heal'), 'so is auto-heal, once a kit has taught you it exists');
});

test('the switch turns everything on, then everything off', () => {
  const s = withEverything();
  assert.equal(toggleAllUpkeep(s), true);
  assert.ok(upkeepAllOn(s));
  for (const id of ['regeneration', 'rejuvenation', 'renewal']) assert.ok(isAutoCast(s, id), id);
  assert.ok(isAutoDrink(s, 'stamina-potion'));
  assert.equal(s.settings.autoHeal, true);

  assert.equal(toggleAllUpkeep(s), false);
  assert.equal(upkeepAllOn(s), false);
  assert.deepEqual(s.settings.autoCastSpells, []);
  assert.deepEqual(s.settings.autoDrink, []);
  assert.equal(s.settings.autoHeal, false);
});

test('a half-on upkeep goes all the way on, not the other way', () => {
  // Pressing the switch while some of it is running must never turn OFF the
  // thing you were relying on — the case you mean is "and the rest of it too".
  const s = withEverything();
  setAllUpkeep(s, true);
  s.settings.autoHeal = false; // now partial
  assert.equal(upkeepAllOn(s), false);
  assert.equal(toggleAllUpkeep(s), true, 'partial reads as off');
  assert.equal(s.settings.autoHeal, true);
  assert.ok(isAutoCast(s, 'regeneration'), 'and what was already on stays on');
});

test('switching all of something already switched changes nothing', () => {
  const s = withEverything();
  setAllUpkeep(s, true);
  assert.equal(setAllUpkeep(s, true), 0, 'nothing gets double-toggled back off');
  assert.ok(upkeepAllOn(s));
  assert.equal(s.settings.autoCastSpells.length, 3, 'and no duplicate entries');
});

test('the sidebar head carries the switch, the count, and the way in', () => {
  const s = withEverything();
  const off = sidebarUpkeepHtml(s);
  assert.ok(off.includes('data-action="toggle-all-upkeep"'), 'one press for the lot');
  assert.ok(off.includes('data-tab="upkeep"'), 'and a gear to the full screen');
  assert.ok(off.includes('0/5'), `expected a count of what is running, got: ${off.slice(0, 200)}`);
  assert.ok(!/class="up-switch on"/.test(off));

  setAllUpkeep(s, true);
  const on = sidebarUpkeepHtml(s);
  assert.ok(on.includes('5/5'));
  assert.ok(on.includes('up-switch on'), 'the switch shows its state');
  assert.ok(on.includes('aria-pressed="true"'));
});

test('the panel offers no switch when there is nothing to switch', () => {
  const s = createInitialState();
  grantConsumable(s, 'healing-kit', 1); // a kit alone is not something you drink
  assert.ok(!sidebarUpkeepHtml(s).includes('toggle-all-upkeep'), 'a switch over nothing is a broken button');
});

test('the Upkeep screen is reachable and says what it is even when empty', () => {
  const bare = createInitialState();
  const empty = upkeepTab(bare);
  assert.ok(empty.includes('Upkeep'), 'the route must never throw, however bare the save');
  assert.ok(empty.includes('General Store'), 'and should say where the rest of it comes from');

  const s = withEverything();
  const full = upkeepTab(s);
  assert.ok(full.includes('data-action="set-all-upkeep" data-arg="on"'));
  assert.ok(full.includes('data-action="set-all-upkeep" data-arg="off"'));
  assert.ok(full.includes('0 of 5 kept up'));
  assert.ok(full.includes('toggle-autocast'), 'and every choice individually');
  assert.ok(full.includes('toggle-autodrink'));
  assert.ok(full.includes('toggle-autoheal'));
});
