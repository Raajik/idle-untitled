// Renderer: sidebar nav, hero summary, active tab, toasts, event delegation.
// Split into two parts:
//   - render(): full structural rebuild (tab switch, unlocks, player actions)
//   - frame():  per-animation-frame in-place updates for live combat + fx

import { topLevelEntries, childTabs, drainNewUnlocks, UNLOCKS } from './unlocks.js';
import { battleTab, attributesTab, skillsTab, inventoryTab, trainingTab, rebirthTab, recallTab, tinkeringTab, overviewTab, settingsTab, battleDockHtml } from './tabs.js';
import { startTravelToRegion, startTravelToPoi } from '../game/travel.js';
import { raiseAttribute, derivedStats, xpForLevel, totalXpForLevel } from '../game/hero.js';
import { equipItem, salvageItem } from '../game/loot.js';
import { buyTraining } from '../game/training.js';
import { performRebirth, buyUpgrade } from '../game/prestige.js';
import { exportSave, importSave, hardReset, saveGame, suppressSave } from '../save.js';
import { drainFx } from '../engine/fx.js';
import { fmt, formatDuration } from '../engine/format.js';
import { computeDepth, fleeTutorialEncounter } from '../game/combat.js';
import { activeWeaponSkill } from '../game/skills.js';
import { setHeroName, answerSeenLifestone, acknowledgeAlcottIntro } from '../game/onboarding.js';
import { recallTo } from '../game/lifestone.js';
import { jumpTo } from '../game/shortcuts.js';
import { startGathering } from '../game/gathering.js';
import { applyTinkering } from '../game/tinkering.js';
import { buyItem, sellItem, healService } from '../game/shop.js';
import { getMaterial } from '../data/materials.js';
import { addLog } from '../game/state.js';

const TAB_RENDERERS = {
  battle: battleTab,
  attributes: attributesTab,
  skills: skillsTab,
  inventory: inventoryTab,
  training: trainingTab,
  rebirth: rebirthTab,
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
  const tutorialMonster = t && t.tutorial ? (state.monster ? 'm' : 'nm') : '';
  const gatherKey = state.gathering ? state.gathering.nodeId : '';
  return `${state.onboarding.step}|${t ? t.kind + ':' + t.id : ''}|${state.location.regionId}|${state.location.poiId}|${tutorialMonster}|${gatherKey}|${state.ui.activeShop || ''}`;
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
  const main = document.getElementById('main');
  const dock = document.getElementById('battle-dock');

  let lastLogLen = 0;
  let menuRenderFrames = 0;
  let lastBattleKey = null;

  function updateSummary() {
    const d = derivedStats(state);
    summary.innerHTML = `<b>Lv ${state.hero.level}</b> · <span class="gold">${fmt(state.pyreals)}p</span>` +
      (state.rebirth.count > 0 ? `\n<span class="soul">${state.rebirth.souls} souls</span> · run ${state.rebirth.count + 1}` : '') +
      `\nATK ${d.atk} · HP ${Math.ceil(state.hero.hp)}/${d.maxHp}`;
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

  function updateDock() {
    if (state.ui.activeTab === 'battle' || state.onboarding.step !== 'done') {
      dock.classList.add('hidden');
    } else {
      dock.classList.remove('hidden');
      dock.innerHTML = battleDockHtml(state);
    }
  }

  function render() {
    // Toasts for newly unlocked features
    for (const u of drainNewUnlocks(state)) toast(u.toast);

    renderNav();
    updateSummary();
    main.innerHTML = TAB_RENDERERS[state.ui.activeTab](state);
    updateDock();
    lastLogLen = state.log.length;
    menuRenderFrames = 0;
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

  // --- in-place live updates for battle/overview tabs ---
  function setBar(id, pct, label) {
    const fill = document.getElementById(id + '-fill');
    const lab = document.getElementById(id + '-label');
    if (fill) fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
    if (lab) lab.textContent = label;
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

  function updateLive() {
    const d = derivedStats(state);
    const h = state.hero;
    const m = state.monster;

    updateSummary();

    if (m) {
      const nameEl = document.getElementById('m-name');
      if (nameEl) {
        nameEl.textContent = `${m.name} (Lv ${m.level})` + (m.isBoss ? ' ☠ BOSS' : '');
        nameEl.className = m.isBoss ? 'soul' : '';
      }
      setBar('m-hp', (m.hp / m.maxHp) * 100, `${Math.max(0, Math.ceil(m.hp))} / ${m.maxHp}`);
      setText('m-meta', `ATK ${m.atk} · DEF ${m.def} · ${m.dmgType}`);
    }

    setBar('h-hp', (h.hp / d.maxHp) * 100, h.dead ? 'Dead... reviving' : `${Math.ceil(h.hp)} / ${d.maxHp} HP`);
    const xpProgress = state.progress.totalXpEarned - totalXpForLevel(h.level);
    setBar('h-xp', (xpProgress / xpForLevel(h.level)) * 100, `XP ${fmt(xpProgress)} / ${fmt(xpForLevel(h.level))}`);
    setBar('h-sta', (h.stamina / d.maxStamina) * 100, `${Math.ceil(h.stamina)} / ${d.maxStamina} Stamina`);
    setBar('h-mana', (h.mana / d.maxMana) * 100, `${Math.ceil(h.mana)} / ${d.maxMana} Mana`);
    setText('h-stats', `ATK ${d.atk} · DEF ${d.def} · SPD ${d.spd.toFixed(2)}/s · Crit ${d.critChance.toFixed(1)}% · ${fmt(state.pyreals)} pyreals`);
    const aw = activeWeaponSkill(state);
    setText('h-attack-line', `${aw.weaponName ? `Attacking with ${aw.weaponName}` : 'Fighting unarmed'}, ${aw.label} (Rank ${aw.skill.rank}).`);

    const ovLine = document.getElementById('ov-hero-line');
    if (ovLine) ovLine.innerHTML = `Level ${h.level} · <span class="gold">${fmt(state.pyreals)} pyreals</span> · <span class="soul">${state.rebirth.souls} souls</span>`;
    if (state.location.poiId) {
      setText('ov-kills', `+${Math.round(computeDepth(state.progress) * 100)}% difficulty`);
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

  function updateGatherCountdown() {
    const g = state.gathering;
    if (!g) return;
    setText(`gather-timer-${g.nodeId}`, formatDuration(g.remaining));
  }

  function frame() {
    applyFx();
    const fresh = drainNewUnlocks(state);
    if (fresh.length) {
      for (const u of fresh) toast(u.toast);
      render();
      return;
    }
    if (state.ui.activeTab !== 'battle') updateDock(); // dock is hidden on Battle itself

    if (state.ui.activeTab === 'battle') {
      const key = battleStructureKey(state);
      if (key !== lastBattleKey) {
        // Travel started/finished, or arrived somewhere new: the set of panels and
        // tiles actually changed shape, so rebuild rather than patch.
        lastBattleKey = key;
        render();
      } else if (state.travel) {
        updateTravelCountdown();
        if (state.travel.tutorial) updateLive();
      } else if (state.location.poiId) {
        updateLive();
      } else if (state.gathering) {
        updateGatherCountdown();
      }
      // else: standing in town with nothing travelling/gathering — nothing to patch this frame.
    } else if (state.ui.activeTab === 'overview') {
      updateLive();
    } else {
      // menu tabs: refresh periodically so gold/level stay current
      menuRenderFrames += 1;
      if (menuRenderFrames >= 30) render();
    }
  }

  // Enter submits the name field without needing to click Continue.
  document.getElementById('app').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'name-input') {
      if (setHeroName(state, e.target.value)) render();
    }
  });

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
      case 'raise': raiseAttribute(state, arg); break;
      case 'equip': equipItem(state, Number(arg)); break;
      case 'toggle-autoequip': state.settings.autoEquip = !state.settings.autoEquip; break;
      case 'train': buyTraining(state, arg); break;
      case 'rebirth': performRebirth(state); break;
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
      case 'jump-shortcut': jumpTo(state, arg); break;
      case 'start-gather': startGathering(state, arg); break;
      case 'open-shop': state.ui.activeShop = arg; break;
      case 'close-shop': state.ui.activeShop = null; break;
      case 'buy-item': {
        const [shopId, idx] = arg.split(':');
        buyItem(state, shopId, Number(idx));
        break;
      }
      case 'sell-item': sellItem(state, Number(arg)); break;
      case 'heal-service': healService(state); break;
      case 'apply-tinker': {
        const sel = document.getElementById(`tinker-material-${arg}`);
        if (sel) applyTinkering(state, arg, sel.value);
        break;
      }
      case 'salvage-item': {
        const result = salvageItem(state, Number(arg));
        if (result) {
          const material = getMaterial(result.material);
          addLog(state, `Salvaged ${result.name} into ${result.amount} ${material ? material.name : result.material}.`, 'dim');
        }
        break;
      }
      case 'export': {
        const ta = document.getElementById('save-io');
        if (ta) ta.value = exportSave(state);
        break;
      }
      case 'import': {
        const ta = document.getElementById('save-io');
        if (ta && ta.value.trim()) {
          const loaded = importSave(ta.value);
          if (loaded) {
            onImport(loaded);
            toast('Save imported!');
          } else {
            toast('Import failed — invalid save data.');
          }
        }
        break;
      }
      case 'hard-reset':
        if (confirm('Really delete ALL progress? This cannot be undone.')) {
          hardReset();
          suppressSave();
          location.reload();
          return;
        }
        break;
    }
    render();
  });

  return { render, frame };
}
