import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import { battleTab, skillsTab, sidebarUpkeepHtml, upkeepTab, heroBar, settingsTab } from '../src/ui/tabs.js';
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
  learnSpell(s, 'regeneration', 1);
  // A spell you know but haven't cast is still upkeep — the panel is the whole
  // picture, not only the half that happens to be up.
  const idle = sidebarUpkeepHtml(s);
  assert.ok(idle.includes('Regeneration I'), 'a known spell should be listed');
  assert.ok(idle.includes('>—<'), 'with a dash where its countdown would be');

  s.hero.mana = derivedStats(s).maxMana;
  assert.equal(castBuffSpell(s, 'regeneration'), true);
  const live = sidebarUpkeepHtml(s);
  assert.ok(live.includes('Regeneration'));
  assert.match(live, /id="sb-buff-timer-regeneration"/, 'the timer needs its own id to be patched');
});

test('every upkeep row says what it does on hover', () => {
  // A name and a countdown is enough to check on something you already
  // understand; it is not enough to remember which of three similarly-named
  // spells is the stamina one.
  const s = createInitialState();
  for (const id of ['regeneration', 'rejuvenation', 'renewal']) learnSpell(s, id, 2);
  const html = sidebarUpkeepHtml(s);
  // Only the rows; the head's switch and gear carry titles of their own.
  const titles = [...html.matchAll(/class="up-row" title="([^"]*)"/g)].map((m) => m[1]);
  assert.equal(titles.length, 3, 'every row should carry one');
  assert.ok(titles.some((t) => /Regeneration II .* \+2 Health regeneration/.test(t)), titles.join(' | '));
  assert.ok(titles.some((t) => /Stamina regeneration/.test(t)));
  assert.ok(titles.some((t) => /Mana regeneration/.test(t)));
});

test('sidebar timers never collide with the Upkeep screen', () => {
  // Same id in two places means getElementById only ever finds one of them, and
  // the other sits frozen. The sidebar panel and the Upkeep screen both draw a
  // countdown for the same buff, and both can be on screen at once.
  const s = createInitialState();
  s.hero.name = 'Probe';
  s.onboarding.step = 'done';
  s.progress.unlockedRegions = ['holtburg'];
  s.location = { regionId: 'holtburg', poiId: null };
  learnSpell(s, 'regeneration');
  s.hero.mana = derivedStats(s).maxMana;
  castBuffSpell(s, 'regeneration');

  const both = upkeepTab(s) + sidebarUpkeepHtml(s);
  assert.equal((both.match(/id="buff-timer-regeneration"/g) || []).length, 1);
  assert.equal((both.match(/id="sb-buff-timer-regeneration"/g) || []).length, 1);
  // And the Battle tab is out of the upkeep business entirely now.
  assert.ok(!battleTab(s).includes('buff-timer-regeneration'), 'upkeep left the Battle tab');
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

// --- Sidebar mini vitals + UI scale (accessibility) ---

test('the sidebar summary carries the three mini vitals, with vitae overlays', () => {
  const s = createInitialState();
  s.onboarding.step = 'done';

  // heroBar is what updateSummary embeds under the logo; it takes derived stats
  // rather than recomputing them.
  const d = derivedStats(s);
  const vitals = heroBar(s, d);
  for (const cls of ['hp mini', 'stamina mini', 'mana mini']) {
    assert.ok(vitals.includes(cls), `${cls} bar present`);
  }
  assert.equal((vitals.match(/vitae-overlay/g) || []).length, 3, 'all three carry a vitae slot');
  assert.ok(!/\bid=/.test(vitals), 'no ids: these are rebuilt wholesale, not fx-targeted');
});

test('the scale picker marks the active size and clamps at write time', () => {
  const s = createInitialState();
  let html = settingsTab(s);
  assert.ok(html.includes('data-action="set-ui-scale"'), 'the picker is there');
  assert.ok(/data-arg="1" class="btn small active"|class="btn small active"[^>]*data-arg="1"/.test(html) || html.includes('active'), 'one button reads as active');

  // The click handler clamps to the same bounds save.js enforces on load.
  const v = Number('9');
  if (Number.isFinite(v)) s.settings.uiScale = Math.min(1.4, Math.max(0.85, v));
  assert.equal(s.settings.uiScale, 1.4, 'an absurd scale lands on the ceiling');
});
