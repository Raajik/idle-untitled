// Renderer: sidebar nav, hero summary, active tab, toasts, event delegation.
// Split into two parts:
//   - render(): full structural rebuild (tab switch, unlocks, player actions)
//   - frame():  per-animation-frame in-place updates for live combat + fx

import { unlockedTabs, drainNewUnlocks, UNLOCKS } from './unlocks.js';
import { battleTab, heroTab, equipmentTab, trainingTab, rebirthTab, overviewTab, settingsTab } from './tabs.js';
import { travelToZone } from '../game/combat.js';
import { raiseAttribute, derivedStats, xpForLevel, totalXpForLevel } from '../game/hero.js';
import { equipItem } from '../game/loot.js';
import { buyTraining } from '../game/training.js';
import { performRebirth, buyUpgrade } from '../game/prestige.js';
import { exportSave, importSave, hardReset, saveGame, suppressSave } from '../save.js';
import { drainFx } from '../engine/fx.js';
import { fmt } from '../engine/format.js';
import { ZONES } from '../data/zones.js';

const TAB_RENDERERS = { battle: battleTab, hero: heroTab, equipment: equipmentTab, training: trainingTab, rebirth: rebirthTab, overview: overviewTab, settings: settingsTab };
const LIVE_TABS = new Set(['battle', 'overview']);

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

  let lastLogLen = 0;
  let menuRenderFrames = 0;

  function updateSummary() {
    const d = derivedStats(state);
    summary.innerHTML = `<b>Lv ${state.hero.level}</b> · <span class="gold">${fmt(state.pyreals)}p</span>` +
      (state.rebirth.count > 0 ? `\n<span class="soul">${state.rebirth.souls} souls</span> · run ${state.rebirth.count + 1}` : '') +
      `\nATK ${d.atk} · HP ${Math.ceil(state.hero.hp)}/${d.maxHp}`;
  }

  function render() {
    // Toasts for newly unlocked features
    for (const u of drainNewUnlocks(state)) toast(u.toast);

    const tabs = unlockedTabs(state);
    // Always show the sidebar: Settings (save/export/reset) must stay reachable even on a
    // fresh save with only Battle + Settings unlocked. The progressive feel comes from tabs
    // appearing over time, not from hiding the nav entirely.
    sidebar.classList.remove('hidden');

    // If active tab got locked (e.g., after rebirth resets progress), fall back to battle
    if (!tabs.some((t) => t.id === state.ui.activeTab)) state.ui.activeTab = 'battle';

    nav.innerHTML = tabs
      .map((t) => {
        const teaser = t.teaser && t.teaser(state);
        return `<button class="tab-btn ${state.ui.activeTab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}${teaser ? ' <span class="teaser">(soon)</span>' : ''}</button>`;
      })
      .join('');

    updateSummary();
    main.innerHTML = TAB_RENDERERS[state.ui.activeTab](state);
    lastLogLen = state.log.length;
    menuRenderFrames = 0;

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

  function updateLive() {
    const d = derivedStats(state);
    const h = state.hero;
    const m = state.monster;
    const zone = ZONES[state.progress.zone];

    updateSummary();

    if (m) {
      const nameEl = document.getElementById('m-name');
      if (nameEl) {
        nameEl.textContent = m.name + (m.isBoss ? ' ☠ BOSS' : '');
        nameEl.className = m.isBoss ? 'soul' : '';
      }
      setBar('m-hp', (m.hp / m.maxHp) * 100, `${Math.max(0, Math.ceil(m.hp))} / ${m.maxHp}`);
      setText('m-meta', `ATK ${m.atk} · DEF ${m.def} · ${state.progress.killsInZone}/${zone.killsToBoss} kills to boss`);
    }

    setBar('h-hp', (h.hp / d.maxHp) * 100, h.dead ? 'Dead... reviving' : `${Math.ceil(h.hp)} / ${d.maxHp} HP`);
    const xpProgress = state.progress.totalXpEarned - totalXpForLevel(h.level);
    setBar('h-xp', (xpProgress / xpForLevel(h.level)) * 100, `XP ${fmt(xpProgress)} / ${fmt(xpForLevel(h.level))}`);
    setText('h-stats', `ATK ${d.atk} · DEF ${d.def} · SPD ${d.spd.toFixed(2)}/s · Dodge ${d.dodge.toFixed(0)}% · Crit ${d.critChance.toFixed(1)}% · ${fmt(state.pyreals)} pyreals`);

    const ovLine = document.getElementById('ov-hero-line');
    if (ovLine) ovLine.innerHTML = `Level ${h.level} · <span class="gold">${fmt(state.pyreals)} pyreals</span> · <span class="soul">${state.rebirth.souls} souls</span>`;
    setText('ov-kills', `${state.progress.killsInZone}/${zone.killsToBoss} kills to boss`);

    // append only new log lines so the log doesn't rebuild (keeps scroll stable)
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

  function frame() {
    applyFx();
    const fresh = drainNewUnlocks(state);
    if (fresh.length) {
      for (const u of fresh) toast(u.toast);
      render();
      return;
    }
    if (LIVE_TABS.has(state.ui.activeTab)) {
      updateLive();
    } else {
      // menu tabs: refresh periodically so gold/level stay current
      menuRenderFrames += 1;
      if (menuRenderFrames >= 30) render();
    }
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
      case 'travel': travelToZone(state, Number(arg)); break;
      case 'raise': raiseAttribute(state, arg); break;
      case 'equip': equipItem(state, Number(arg)); break;
      case 'toggle-autoequip': state.settings.autoEquip = !state.settings.autoEquip; break;
      case 'train': buyTraining(state, arg); break;
      case 'rebirth': performRebirth(state); break;
      case 'buy-upgrade': buyUpgrade(state, arg); break;
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
