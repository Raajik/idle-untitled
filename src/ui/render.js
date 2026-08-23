// Renderer: sidebar nav, hero summary, active tab, toasts, event delegation.
// Split into two parts:
//   - render(): full structural rebuild (tab switch, unlocks, player actions)
//   - frame():  per-animation-frame in-place updates for live combat + fx

import { topLevelEntries, childTabs, drainNewUnlocks, UNLOCKS } from './unlocks.js';
import { battleTab, attributesTab, skillsTab, inventoryTab, trainingTab, enlightenmentTab, recallTab, tinkeringTab, overviewTab, settingsTab, battleDockHtml, sidebarUpkeepHtml, waveLine, attackBarLabel, monsterLabel } from './tabs.js';
import { startTravelToRegion, startTravelToPoi } from '../game/travel.js';
import { derivedStats, xpForLevel, totalXpForLevel } from '../game/hero.js';
import { equipItem, salvageItem, salvageAll } from '../game/loot.js';
import { buyTraining } from '../game/training.js';
import { performEnlightenment, buyUpgrade } from '../game/enlightenment.js';
import { exportSave, importSave, hardReset, saveGame, suppressSave } from '../save.js';
import { drainFx } from '../engine/fx.js';
import { TICK_MS } from '../engine/loop.js';
import { fmt, formatDuration } from '../engine/format.js';
import { fleeTutorialEncounter, activeAttackInterval, activeAttackResource } from '../game/combat.js';
import { isSite, getPoiById, REGIONS } from '../data/regions.js';
import { investToOpen, investInBuilding, takeTour, rotationRemaining } from '../game/buildings.js';
import { activeWeaponSkill } from '../game/skills.js';
import { vitaePct } from '../game/vitae.js';
import { setHeroName, answerSeenLifestone, acknowledgeAlcottIntro } from '../game/onboarding.js';
import { recallTo, sacrificeVitae } from '../game/lifestone.js';
import { castBuffSpell, toggleAutoCast } from '../game/buffs.js';
import { useConsumable, toggleAutoDrink } from '../game/consumables.js';
import { jumpTo } from '../game/shortcuts.js';
import { applyTinkering } from '../game/tinkering.js';
import { applyRending } from '../game/rending.js';
import { buyItem, sellItem, healService, buyConsumable, buyMaterial } from '../game/shop.js';
import { getMaterial } from '../data/materials.js';
import { addLog } from '../game/state.js';

const TAB_RENDERERS = {
  battle: battleTab,
  attributes: attributesTab,
  skills: skillsTab,
  inventory: inventoryTab,
  training: trainingTab,
  enlightenment: enlightenmentTab,
  recall: recallTab,
  tinkering: tinkeringTab,
  overview: overviewTab,
  settings: settingsTab,
};

// A compact key describing the Battle tab's current "shape" — which panels exist
// (onboarding step / Town / On the Road / at a POI / tutorial encounter up or not)
// and which tile is highlighted as current/travelling. Changing shape needs a full
// rebuild; anything else (just the countdown ticking, or combat) can be patched in
// place so buttons never get torn out from under a click.
function battleStructureKey(state) {
  const t = state.travel;
  const tutorialMonster = t && t.tutorial ? (state.monsters.length ? 'm' : 'nm') : '';
  // The open building's restock timestamp is part of the shape: when its stock
  // rotates out from under an open panel, the panel has to be rebuilt.
  const open = state.ui.activeBuilding;
  const buildingKey = open ? `${open}:${state.buildings[open] ? state.buildings[open].rotatesAt : ''}:${state.ui.activeShopTab}` : '';
  // Which buffs are up (not how long they have left) is part of the shape: the
  // Upkeep rows change between "Cast" and a countdown as they come and go.
  const buffKey = state.buffs.map((b) => b.id).join(',');
  const engaged = state.monsters.length;
  // Folding a section adds and removes whole panels, so it's part of the shape.
  const folded = Object.keys(state.ui.collapsed)
    .filter((k) => state.ui.collapsed[k])
    .sort()
    .join(',');
  return `${state.onboarding.step}|${t ? t.kind + ':' + t.id : ''}|${state.location.regionId}|${state.location.poiId}|${tutorialMonster}|${buildingKey}|${state.ui.activePoiTier}|${buffKey}|${engaged}|${folded}`;
}

function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

export function createRenderer(state, { onImport }) {
  const sidebar = document.getElementById('sidebar');
  const nav = document.getElementById('tab-nav');
  const summary = document.getElementById('hero-summary');
  const shortcuts = document.getElementById('nav-shortcuts');
  const upkeepPanel = document.getElementById('sidebar-upkeep');
  const settingsBtn = document.getElementById('settings-btn');
  const main = document.getElementById('main');
  const dock = document.getElementById('battle-dock');

  let lastLogLen = 0;
  let menuRenderFrames = 0;
  let lastBattleKey = null;
  // A full render() replaces #main wholesale. If that lands between a mousedown
  // and its mouseup, the browser never fires the click at all — which reads as a
  // button that needs pressing two or three times to take. The game re-renders
  // on its own several times a second (menu tabs on a timer, the Battle tab
  // whenever the fight changes shape), so this was hitting constantly. Automatic
  // renders now wait for the pointer to come up, or for a text field to lose
  // focus, rather than pulling the DOM out from under an interaction.
  let pointerDown = false;
  let renderQueued = false;
  // Wall-clock copy of hero.attackTimer, plus the last raw value we saw — a drop
  // between the two is how a landed swing is detected. See attackBarProgress.
  let smoothAttackTimer = 0;
  let lastAttackTimer = 0;

  function updateSummary() {
    const d = derivedStats(state);
    summary.innerHTML = `<b>Lv ${state.hero.level}</b> · <span class="gold">${fmt(state.pyreals)}p</span>` +
      (state.enlightenment.count > 0 ? `\n<span class="soul">${state.enlightenment.souls} souls</span> · run ${state.enlightenment.count + 1}` : '') +
      `\nATK ${d.atk} · HP ${Math.ceil(state.hero.hp)}/${d.maxHp}` +
      // Vitae is a penalty you want to notice without going looking for it.
      (vitaePct(state) > 0 ? `\n<span class="hp-text">Vitae ${vitaePct(state)}%</span>` : '');
  }

  function renderNav() {
    // Always show the sidebar: Settings (save/export/reset) must stay reachable even on a
    // fresh save with only Battle + Settings unlocked. The progressive feel comes from tabs
    // appearing over time, not from hiding the nav entirely.
    sidebar.classList.remove('hidden');

    const allTabs = UNLOCKS.filter((u) => u.kind === 'tab' && u.when(state));
    if (!allTabs.some((t) => t.id === state.ui.activeTab)) state.ui.activeTab = 'battle';

    nav.innerHTML = topLevelEntries(state)
      .map((entry) => {
        if (entry.kind === 'category') {
          const kids = childTabs(state, entry.id);
          if (kids.length === 0) return '';
          const kidBtns = kids
            .map((t) => {
              const teaser = t.teaser && t.teaser(state);
              return `<button class="tab-btn nav-child ${state.ui.activeTab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}${teaser ? ' <span class="teaser">(soon)</span>' : ''}</button>`;
            })
            .join('');
          const label = typeof entry.label === 'function' ? entry.label(state) : entry.label;
          return `<div class="nav-category"><div class="nav-category-label">${label}</div>${kidBtns}</div>`;
        }
        const teaser = entry.teaser && entry.teaser(state);
        const label = typeof entry.label === 'function' ? entry.label(state) : entry.label;
        return `<button class="tab-btn ${state.ui.activeTab === entry.id ? 'active' : ''}" data-tab="${entry.id}">${label}${teaser ? ' <span class="teaser">(soon)</span>' : ''}</button>`;
      })
      .join('');
  }

  // Quick travel back to a region hub you've already reached, so "go to town" is
  // one click from any tab instead of a scroll through the region list.
  function renderShortcuts() {
    const rows = REGIONS.filter((r) => state.progress.unlockedRegions.includes(r.id)).map((r) => {
      const here = state.location.regionId === r.id && !state.location.poiId && !state.travel;
      const heading = state.travel && state.travel.kind === 'region' && state.travel.id === r.id;
      const label = here ? `${r.name} — here` : heading ? `${r.name} — on the way` : `→ ${r.name}`;
      return `<button class="nav-shortcut" data-action="travel-region" data-arg="${r.id}" ${here || heading ? 'disabled' : ''}>${label}</button>`;
    });
    shortcuts.innerHTML = rows.join('');
    upkeepPanel.innerHTML = sidebarUpkeepHtml(state);
    settingsBtn.classList.toggle('active', state.ui.activeTab === 'settings');
  }

  function updateDock() {
    if (state.ui.activeTab === 'battle' || state.onboarding.step !== 'done') {
      dock.classList.add('hidden');
    } else {
      dock.classList.remove('hidden');
      dock.innerHTML = battleDockHtml(state);
      updateVitaeOverlay();
    }
  }

  function render() {
    // Toasts for newly unlocked features
    for (const u of drainNewUnlocks(state)) toast(u.toast);

    renderNav();
    renderShortcuts();
    updateSummary();
    main.innerHTML = TAB_RENDERERS[state.ui.activeTab](state);
    updateDock();
    updateVitaeOverlay();
    lastLogLen = state.log.length;
    menuRenderFrames = 0;
    renderQueued = false;
    lastBattleKey = battleStructureKey(state);

    const log = document.getElementById('combat-log');
    if (log) log.scrollTop = log.scrollHeight;
  }

  // --- fx helpers (operate on existing DOM) ---
  function flashBar(bar, kind) {
    bar.classList.remove('hit', 'crit', 'kill', 'level');
    void bar.offsetWidth; // reflow to restart the CSS animation
    bar.classList.add(kind);
  }

  function spawnNumber(bar, dmg, crit) {
    const el = document.createElement('div');
    el.className = 'float-dmg' + (crit ? ' crit' : '');
    el.textContent = crit ? `CRIT ${dmg}!` : `${dmg}`;
    el.style.left = 20 + Math.random() * 60 + '%';
    bar.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  function applyFx() {
    const events = drainFx();
    for (const ev of events) {
      if (ev.type === 'hit') {
        const bar = document.querySelector(`[data-target="${ev.target}"]`);
        if (bar) {
          flashBar(bar, ev.crit ? 'crit' : 'hit');
          spawnNumber(bar, ev.dmg, ev.crit);
        }
      } else if (ev.type === 'kill') {
        const bar = document.querySelector('[data-target="monster"]');
        if (bar) flashBar(bar, 'kill');
      } else if (ev.type === 'levelup') {
        const bar = document.querySelector('[data-target="hero"]');
        if (bar) flashBar(bar, 'level');
      } else if (ev.type === 'dodge') {
        const bar = document.querySelector('[data-target="hero"]');
        if (bar) {
          flashBar(bar, 'level');
          const el = document.createElement('div');
          el.className = 'float-dmg dodge';
          el.textContent = 'dodge';
          el.style.left = 30 + Math.random() * 40 + '%';
          bar.appendChild(el);
          el.addEventListener('animationend', () => el.remove());
        }
      }
    }
  }

  // Game logic ticks at TICK_HZ (4/s), so hero.attackTimer advances in 0.25s
  // jumps — reading it straight makes the attack bar stair-step. This runs a
  // wall-clock copy forward every animation frame instead.
  //
  // Two bounds keep the smoothed value honest: it never falls behind the real
  // timer, and it never runs more than one tick ahead of it, so a stalled attack
  // (a spell waiting on mana regen, say) parks the bar instead of filling it. A
  // *drop* in the real timer is what marks a landed swing — testing "smooth is
  // ahead of real" instead would fire between every pair of ticks and jitter the
  // bar back and forth by one frame's worth of fill.
  function attackBarProgress(dtMs, interval) {
    const real = state.hero.attackTimer;
    const swung = real < lastAttackTimer;
    lastAttackTimer = real;
    if (state.hero.dead || swung) {
      smoothAttackTimer = real;
    } else {
      const oneTickAhead = real + TICK_MS / 1000;
      smoothAttackTimer = Math.min(interval, oneTickAhead, Math.max(real, smoothAttackTimer + dtMs / 1000));
    }
    return smoothAttackTimer;
  }

  // Swaps the attack bar to the color of whatever vital the current attack spends.
  // Patched rather than rebuilt so switching stance mid-swing recolors instantly.
  function setAttackBarResource(resource) {
    const el = document.getElementById('atk-bar');
    if (!el) return;
    const wanted = `res-${resource}`;
    if (el.classList.contains(wanted)) return;
    el.classList.remove('res-stamina', 'res-mana', 'res-life');
    el.classList.add(wanted);
  }

  // --- in-place live updates for battle/overview tabs ---
  function setBar(id, pct, label) {
    const fill = document.getElementById(id + '-fill');
    const lab = document.getElementById(id + '-label');
    if (fill) fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
    if (lab) lab.textContent = label;
  }

  // The hatched slice on every vitals bar, sized to whatever vitae the hero is
  // carrying. Patched rather than rebuilt so it tracks a stack burning off
  // mid-fight without tearing the panel down.
  function updateVitaeOverlay() {
    const pct = vitaePct(state);
    for (const el of document.querySelectorAll('.vitae-overlay')) {
      el.style.width = `${pct}%`;
      // The bar this slice sits in also turns its number red, so a diminished
      // maximum can't be mistaken for a healthy one.
      if (el.parentElement) el.parentElement.classList.toggle('vitae-active', pct > 0);
    }
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function appendLog() {
    if (state.log.length > lastLogLen) {
      const logEl = document.getElementById('combat-log');
      if (logEl) {
        const frag = document.createDocumentFragment();
        for (const l of state.log.slice(lastLogLen)) {
          const div = document.createElement('div');
          div.className = l.cls;
          div.textContent = l.text;
          frag.appendChild(div);
        }
        logEl.appendChild(frag);
        // cap rendered nodes to avoid unbounded growth
        while (logEl.childElementCount > 60) logEl.firstElementChild.remove();
        logEl.scrollTop = logEl.scrollHeight;
      }
      lastLogLen = state.log.length;
    }
  }

  function updateLive(dtMs = 16) {
    const d = derivedStats(state);
    const h = state.hero;
    const m = state.monsters[0] || null;

    updateSummary();
    updateVitaeOverlay();

    if (m) {
      const nameEl = document.getElementById('m-name');
      if (nameEl) nameEl.textContent = monsterLabel(m);
      setBar('m-hp', (m.hp / m.maxHp) * 100, `${Math.max(0, Math.ceil(m.hp))} / ${m.maxHp}`);
      setText('m-meta', `ATK ${m.atk} · DEF ${m.def} · ${m.dmgType}`);
      for (let i = 1; i < state.monsters.length; i++) {
        const other = state.monsters[i];
        setBar(`m-hp-${i}`, (other.hp / other.maxHp) * 100, `${Math.max(0, Math.ceil(other.hp))} / ${other.maxHp}`);
      }
    }

    updateBuffTimers();

    setBar('h-hp', (h.hp / d.maxHp) * 100, h.dead ? 'Dead... reviving' : `${Math.ceil(h.hp)} / ${d.maxHp} HP`);
    const xpProgress = state.progress.totalXpEarned - totalXpForLevel(h.level);
    setBar('h-xp', (xpProgress / xpForLevel(h.level)) * 100, `XP ${fmt(xpProgress)} / ${fmt(xpForLevel(h.level))}`);
    setBar('h-sta', (h.stamina / d.maxStamina) * 100, `${Math.ceil(h.stamina)} / ${d.maxStamina} Stamina`);
    setBar('h-mana', (h.mana / d.maxMana) * 100, `${Math.ceil(h.mana)} / ${d.maxMana} Mana`);
    setText('h-stats', `ATK ${d.atk} · DEF ${d.def} · SPD ${d.spd.toFixed(2)}/s · Crit ${d.critChance.toFixed(1)}% · ${fmt(state.pyreals)} pyreals`);
    const aw = activeWeaponSkill(state);
    setText('h-attack-line', `${aw.weaponName ? `Attacking with ${aw.weaponName}` : 'Fighting unarmed'}, ${aw.label} (Rank ${aw.skill.rank}).`);

    const atkInterval = activeAttackInterval(state, d);
    const elapsed = attackBarProgress(dtMs, atkInterval);
    setBar('atk-bar', (elapsed / atkInterval) * 100, attackBarLabel(state, elapsed, atkInterval));
    setAttackBarResource(activeAttackResource(state));

    const ovLine = document.getElementById('ov-hero-line');
    if (ovLine) ovLine.innerHTML = `Level ${h.level} · <span class="gold">${fmt(state.pyreals)} pyreals</span> · <span class="soul">${state.enlightenment.souls} souls</span>`;
    if (state.location.poiId) {
      const poi = getPoiById(state.location.poiId);
      if (poi) {
        const line = waveLine(state, poi);
        setText('poi-wave-line', line); // Battle tab header
        setText('ov-kills', line); // Overview tile
      }
    }

    appendLog();
  }

  function updateTravelCountdown() {
    const t = state.travel;
    if (!t) return;
    const text = formatDuration(t.remaining);
    setText('travel-remaining', text);
    setText(t.kind === 'region' ? `region-timer-${t.id}` : `poi-timer-${t.id}`, text);
  }

  // Buff countdowns are the one bit of Upkeep that moves every second. The panel
  // is only rebuilt when a buff comes or goes (see battleStructureKey), so
  // without this the timers sit frozen at whatever they read when drawn.
  function updateBuffTimers() {
    for (const buff of state.buffs) {
      const text = formatDuration(buff.remaining);
      setText(`buff-timer-${buff.id}`, `${text} left`);
      setText(`sb-buff-timer-${buff.id}`, text); // the sidebar copy, if it's up
    }
  }

  // The hero's three vitals bars, without any of the monster/attack-bar patching
  // updateLive() does — used wherever there's no fight on (sites, town, the road).
  function updateVitals() {
    const d = derivedStats(state);
    const h = state.hero;
    updateSummary();
    updateVitaeOverlay();
    setBar('h-hp', (h.hp / d.maxHp) * 100, `${Math.ceil(h.hp)} / ${d.maxHp} HP`);
    setBar('h-sta', (h.stamina / d.maxStamina) * 100, `${Math.ceil(h.stamina)} / ${d.maxStamina} Stamina`);
    setBar('h-mana', (h.mana / d.maxMana) * 100, `${Math.ceil(h.mana)} / ${d.maxMana} Mana`);
    updateBuffTimers();
    appendLog();
  }

  function updateRotationCountdown() {
    if (!state.ui.activeBuilding) return;
    setText('rotation-timer', formatDuration(rotationRemaining(state, state.ui.activeBuilding)));
  }

  function frame(dtMs = 16) {
    applyFx();
    // The sidebar is on screen whatever tab you're on, so its countdowns tick
    // here rather than inside any one tab's update path.
    updateBuffTimers();
    const fresh = drainNewUnlocks(state);
    if (fresh.length) {
      for (const u of fresh) toast(u.toast);
      renderUnlessBusy();
      return;
    }
    if (state.ui.activeTab !== 'battle') updateDock(); // dock is hidden on Battle itself

    if (state.ui.activeTab === 'battle') {
      const key = battleStructureKey(state);
      if (key !== lastBattleKey) {
        // Travel started/finished, or arrived somewhere new: the set of panels and
        // tiles actually changed shape, so rebuild rather than patch.
        lastBattleKey = key;
        renderUnlessBusy();
      } else if (state.travel) {
        updateTravelCountdown();
        if (state.travel.tutorial) updateLive(dtMs);
      } else if (state.location.poiId) {
        // Sites have no monster, but their vitals bars still move as regen ticks.
        if (isSite(getPoiById(state.location.poiId))) updateVitals();
        else updateLive(dtMs);
      } else {
        // Standing in town. There's no fight to patch, but regen runs everywhere
        // now (see game/combat.js tickRegen) and buffs keep burning down, so the
        // vitals and timers have to keep moving alongside the restock clock.
        updateVitals();
        updateRotationCountdown();
      }
    } else if (state.ui.activeTab === 'overview') {
      updateLive(dtMs);
    } else {
      // menu tabs: refresh periodically so gold/level stay current
      menuRenderFrames += 1;
      if (menuRenderFrames >= 30) renderUnlessBusy();
    }
  }

  // Enter submits the name field without needing to click Continue.
  document.getElementById('app').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'name-input') {
      if (setHeroName(state, e.target.value)) render();
    }
  });

  function isTyping() {
    const el = document.activeElement;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
  }

  // Used by frame() for every render the player didn't ask for. Renders driven
  // by an actual click go through render() directly — by then the interaction
  // is over and rebuilding is exactly what's wanted.
  function renderUnlessBusy() {
    if (pointerDown || isTyping()) {
      renderQueued = true;
      return;
    }
    render();
  }

  function flushQueuedRender() {
    if (!renderQueued) return;
    renderQueued = false;
    // After the click has been dispatched, not before — otherwise this is the
    // very rebuild it's meant to avoid.
    setTimeout(() => {
      if (!pointerDown && !isTyping()) render();
    }, 0);
  }

  document.addEventListener('pointerdown', () => { pointerDown = true; });
  document.addEventListener('pointerup', () => { pointerDown = false; flushQueuedRender(); });
  document.addEventListener('pointercancel', () => { pointerDown = false; flushQueuedRender(); });
  document.addEventListener('focusout', () => { if (!isTyping()) flushQueuedRender(); });

  // navigator.clipboard needs a secure context and a permission; both can be
  // absent (plain http, an old browser), so every caller handles a false/null.
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  async function readClipboard() {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return null;
    }
  }

  function applyImport(text) {
    const loaded = importSave(text);
    if (loaded) {
      onImport(loaded);
      toast('Save imported!');
    } else {
      toast('Import failed — invalid save data.');
    }
    return !!loaded;
  }

  // Event delegation
  document.getElementById('app').addEventListener('click', (e) => {
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) {
      state.ui.activeTab = tabBtn.dataset.tab;
      render();
      return;
    }
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    const { action, arg } = btn.dataset;

    switch (action) {
      case 'travel-region': startTravelToRegion(state, arg); break;
      case 'travel-poi': startTravelToPoi(state, arg); break;
      case 'select-item': {
        const id = Number(arg);
        state.ui.selectedItemId = state.ui.selectedItemId === id ? null : id; // click again to close
        break;
      }
      case 'equip': equipItem(state, Number(arg)); break;
      case 'cycle-auto-salvage': state.settings.autoSalvage = arg; break;
      case 'salvage-shown': {
        const f = state.ui.inventoryFilter;
        const summary = salvageAll(state, (it) => {
          if (f.slot !== 'all' && it.slot !== f.slot) return false;
          if (f.rarity !== 'all' && it.rarity !== f.rarity) return false;
          if (f.spellId !== 'all' && !it.spells.some((sp) => sp.id === f.spellId)) return false;
          return true;
        });
        if (summary) {
          const haul = Object.entries(summary.materials)
            .map(([id, n]) => `${n} ${(getMaterial(id) || {}).name || id}`)
            .join(', ');
          addLog(state, `Broke down ${summary.count} items for ${haul}.`, 'good');
          if (summary.ranksGained > 0) toast(`Salvaging +${summary.ranksGained} while you worked.`);
        }
        state.ui.selectedItemId = null;
        break;
      }
      case 'toggle-autoequip': state.settings.autoEquip = !state.settings.autoEquip; break;
      case 'train': buyTraining(state, arg); break;
      case 'enlightenment': performEnlightenment(state); break;
      case 'buy-upgrade': buyUpgrade(state, arg); break;
      case 'submit-name': {
        const input = document.getElementById('name-input');
        if (input) setHeroName(state, input.value);
        break;
      }
      case 'answer-lifestone': answerSeenLifestone(state, arg === 'yes'); break;
      case 'ack-intro': acknowledgeAlcottIntro(state); break;
      case 'flee-tutorial': fleeTutorialEncounter(state); break;
      case 'recall': recallTo(state, arg); break;
      case 'cast-spell': castBuffSpell(state, arg); break;
      case 'toggle-autocast': toggleAutoCast(state, arg); break;
      case 'toggle-autodrink': toggleAutoDrink(state, arg); break;
      case 'use-consumable': useConsumable(state, arg); break;
      case 'toggle-autoheal': state.settings.autoHeal = !state.settings.autoHeal; break;
      case 'sacrifice-vitae': sacrificeVitae(state, arg); break;
      case 'jump-shortcut': jumpTo(state, arg); break;
      case 'open-building': state.ui.activeBuilding = arg; break;
      case 'close-building': state.ui.activeBuilding = null; break;
      case 'invest-open': investToOpen(state, arg); break;
      case 'invest-building': investInBuilding(state, arg); break;
      case 'take-tour': takeTour(state, arg); break;
      case 'set-poi-tier': state.ui.activePoiTier = arg; break;
      case 'set-skill-tab': state.ui.activeSkillTab = arg; break;
      case 'set-void-spell': state.hero.combat.voidSpell = arg; state.hero.attackTimer = 0; break;
      case 'set-war-element': state.hero.combat.warElement = arg; break;
      case 'set-shop-tab': state.ui.activeShopTab = arg; break;
      case 'toggle-section': state.ui.collapsed[arg] = !state.ui.collapsed[arg]; break;
      case 'buy-consumable': {
        const [buildingId, id] = arg.split(':');
        buyConsumable(state, buildingId, id);
        break;
      }
      case 'buy-material': {
        const [buildingId, materialId] = arg.split(':');
        buyMaterial(state, buildingId, materialId);
        break;
      }
      case 'buy-item': {
        const [buildingId, idx] = arg.split(':');
        buyItem(state, buildingId, Number(idx));
        break;
      }
      case 'sell-item': sellItem(state, Number(arg)); break;
      case 'heal-service': healService(state); break;
      case 'set-combat-mode': {
        if (arg === 'archery') {
          const weapon = state.equipment.weapon;
          const isRanged = !!(weapon && (weapon.baseType === 'bow' || weapon.baseType === 'crossbow'));
          if (!isRanged) break;
        }
        state.hero.combat.mode = arg;
        state.hero.attackTimer = 0;
        break;
      }
      case 'set-melee-stance': state.hero.combat.meleeStance = Number(arg); break;
      case 'set-archery-stance': state.hero.combat.archeryStance = Number(arg); break;
      case 'set-magic-spell': state.hero.combat.magicSpell = arg; break;
      case 'set-inventory-filter': {
        const [key, value] = arg.split(':');
        state.ui.inventoryFilter[key] = value;
        break;
      }
      case 'apply-rending': applyRending(state, arg); break;
      case 'apply-tinker': {
        const sel = document.getElementById(`tinker-material-${arg}`);
        if (sel) applyTinkering(state, arg, sel.value);
        break;
      }
      case 'salvage-item': {
        if (state.ui.selectedItemId === Number(arg)) state.ui.selectedItemId = null;
        const result = salvageItem(state, Number(arg));
        if (result) {
          const material = getMaterial(result.material);
          addLog(state, `Salvaged ${result.name} into ${result.amount} ${material ? material.name : result.material}.`, 'dim');
        }
        break;
      }
      // Export/Import work from the Settings textarea when it's on screen, and
      // from the clipboard when they're clicked from the sidebar — same action,
      // whichever surface you reached it from.
      case 'export': {
        const text = exportSave(state);
        const ta = document.getElementById('save-io');
        if (ta) ta.value = text;
        copyToClipboard(text).then((ok) =>
          toast(ok ? 'Save copied to the clipboard.' : 'Save exported to the Settings box.')
        );
        if (!ta) state.ui.activeTab = 'settings';
        break;
      }
      case 'import': {
        const ta = document.getElementById('save-io');
        if (ta && ta.value.trim()) {
          applyImport(ta.value);
          break;
        }
        // No box in front of them (or an empty one): try what they've copied.
        readClipboard().then((text) => {
          if (text && text.trim()) {
            applyImport(text);
            render();
            return;
          }
          state.ui.activeTab = 'settings';
          render();
          const box = document.getElementById('save-io');
          if (box) box.focus();
          toast('Paste your save into the box, then press Import.');
        });
        break;
      }
      // Wiping a save is the one irreversible thing in the game, and it now sits
      // one click from every screen — so the Shift key IS the confirmation, and
      // an unmodified click only explains itself.
      case 'hard-reset':
        if (!e.shiftKey) {
          toast('Hold Shift and click to wipe all progress.');
          break;
        }
        hardReset();
        suppressSave();
        location.reload();
        return;
    }
    render();
  });

  return { render, frame };
}
