import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import { battleTab, skillsTab, sidebarUpkeepHtml } from '../src/ui/tabs.js';
import { startTravelToRegion } from '../src/game/travel.js';
import { tickCombat } from '../src/game/combat.js';
import { learnSpell, castBuffSpell } from '../src/game/buffs.js';
import { grantConsumable, toggleAutoDrink } from '../src/game/consumables.js';
import { derivedStats } from '../src/game/hero.js';

function onTheRoad() {
  const s = createInitialState();
  s.hero.name = 'Probe';
  s.onboarding.step = 'done';
  s.onboarding.tutorialPending = true;
  startTravelToRegion(s, 'holtburg');
  tickCombat(s, 0.25);
  return s;
}

test('the road to Holtburg quotes a countdown the renderer can patch', () => {
  // It read the remaining time straight into the header with no id on it, so it
  // rendered once and then sat there for the whole three-minute walk.
  const s = onTheRoad();
  const html = battleTab(s);
  assert.ok(html.includes('The Road to Holtburg'), 'should be on the road');
  assert.match(html, /id="travel-remaining"/, 'the countdown needs an id to be patched per frame');
});

test('the road countdown is the only travel-remaining on screen', () => {
  // Two elements sharing an id would leave getElementById patching just one.
  const s = onTheRoad();
  const matches = battleTab(s).match(/id="travel-remaining"/g) || [];
  assert.equal(matches.length, 1);
});

test('breaking off a roadside fight is just called Flee', () => {
  const s = onTheRoad();
  let guard = 0;
  while (!s.monsters.length && guard++ < 400) tickCombat(s, 0.25);
  assert.ok(s.monsters.length, 'something should have turned up');
  const html = battleTab(s);
  assert.ok(html.includes('>Flee<'), 'the button should read Flee');
  assert.ok(!html.includes('Try to run away'));
});

test('damage-type defence is called Mitigation, not Resistance', () => {
  const s = createInitialState();
  s.ui.activeSkillTab = 'defense';
  const html = skillsTab(s);
  assert.ok(html.includes('Mitigation'), 'the section should be titled Mitigation');
  assert.ok(!/Resistance\s*—/.test(html), 'no "Resistance —" heading should survive');
  // Magic Resistance is a different skill and keeps its name.
  assert.ok(html.includes('Magic Resistance'));
});

test('the skills page shows one group at a time', () => {
  const s = createInitialState();
  const groups = ['offense', 'defense', 'gathering', 'crafting', 'general'];
  for (const id of groups) {
    s.ui.activeSkillTab = id;
    assert.ok(skillsTab(s).includes(`data-arg="${id}"`), `${id} should be offered`);
  }

  s.ui.activeSkillTab = 'offense';
  const offense = skillsTab(s);
  assert.ok(offense.includes('War Magic'));
  assert.ok(!offense.includes('Salvaging'), 'crafting should not be on the offense page');

  s.ui.activeSkillTab = 'crafting';
  const crafting = skillsTab(s);
  assert.ok(crafting.includes('Salvaging'));
  assert.ok(!crafting.includes('War Magic'));

  // Every group is a fraction of what one flat page was.
  const longest = Math.max(...groups.map((id) => { s.ui.activeSkillTab = id; return skillsTab(s).length; }));
  const all = groups.reduce((n, id) => { s.ui.activeSkillTab = id; return n + skillsTab(s).length; }, 0);
  assert.ok(longest < all * 0.55, `the tallest group is ${longest} of ${all} total`);
});

test('an unknown skill group falls back rather than rendering nothing', () => {
  const s = createInitialState();
  s.ui.activeSkillTab = 'nonsense';
  assert.ok(skillsTab(s).includes('War Magic'), 'should fall back to the first group');
});

test('the sidebar says nothing at all until there is upkeep to speak of', () => {
  const s = createInitialState();
  assert.equal(sidebarUpkeepHtml(s), '', 'a hero with no spells gets no panel');
});

test('the sidebar lists what is running, and what is merely known', () => {
  const s = createInitialState();
  learnSpell(s, 'regeneration');
  const idle = sidebarUpkeepHtml(s);
  assert.ok(idle.includes('nothing running'), 'knowing a spell earns the panel, empty');

  s.hero.mana = derivedStats(s).maxMana;
  assert.equal(castBuffSpell(s, 'regeneration'), true);
  const live = sidebarUpkeepHtml(s);
  assert.ok(live.includes('Regeneration'));
  assert.ok(!live.includes('nothing running'));
  assert.match(live, /id="sb-buff-timer-regeneration"/, 'the timer needs its own id to be patched');
});

test('sidebar timers never collide with the Upkeep panel on the Battle tab', () => {
  // Same id in two places means getElementById only ever finds one of them, and
  // the other sits frozen.
  const s = createInitialState();
  s.hero.name = 'Probe';
  s.onboarding.step = 'done';
  s.progress.unlockedRegions = ['holtburg'];
  s.location = { regionId: 'holtburg', poiId: null };
  s.ui.collapsed = { upkeep: false };
  learnSpell(s, 'regeneration');
  s.hero.mana = derivedStats(s).maxMana;
  castBuffSpell(s, 'regeneration');

  const both = battleTab(s) + sidebarUpkeepHtml(s);
  assert.equal((both.match(/id="buff-timer-regeneration"/g) || []).length, 1);
  assert.equal((both.match(/id="sb-buff-timer-regeneration"/g) || []).length, 1);
});

test('the sidebar reports automation, not just spells', () => {
  const s = createInitialState();
  learnSpell(s, 'regeneration'); // earns the panel
  grantConsumable(s, 'healing-kit', 12);
  s.progress.autoHealUnlocked = true;
  s.settings.autoHeal = true;
  assert.ok(sidebarUpkeepHtml(s).includes('Auto-heal'), 'a running auto-heal is upkeep');

  grantConsumable(s, 'stamina-potion', 3);
  toggleAutoDrink(s, 'stamina-potion');
  assert.ok(sidebarUpkeepHtml(s).includes('Stamina Potion'), 'so is a potion on upkeep');
});
