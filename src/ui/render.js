// Renderer: sidebar nav, hero summary, active tab, toasts, event delegation.

import { unlockedTabs, drainNewUnlocks, UNLOCKS } from './unlocks.js';
import { battleTab, heroTab, equipmentTab, trainingTab, rebirthTab, overviewTab, settingsTab } from './tabs.js';
import { travelToZone } from '../game/combat.js';
import { allocateStat, derivedStats, xpForLevel } from '../game/hero.js';
import { equipItem } from '../game/loot.js';
import { buyTraining } from '../game/training.js';
import { performRebirth, buyUpgrade } from '../game/prestige.js';
import { exportSave, importSave, hardReset, saveGame } from '../save.js';

const TAB_RENDERERS = { battle: battleTab, hero: heroTab, equipment: equipmentTab, training: trainingTab, rebirth: rebirthTab, overview: overviewTab, settings: settingsTab };

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

  function render() {
    // Toasts for newly unlocked features
    for (const u of drainNewUnlocks(state)) toast(u.toast);

    const tabs = unlockedTabs(state);
    sidebar.classList.toggle('hidden', tabs.length <= 2); // minimal until there's something to switch between

    // If active tab got locked (e.g., after rebirth resets progress), fall back to battle
    if (!tabs.some((t) => t.id === state.ui.activeTab)) state.ui.activeTab = 'battle';

    nav.innerHTML = tabs
      .map((t) => {
        const teaser = t.teaser && t.teaser(state);
        return `<button class="tab-btn ${state.ui.activeTab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}${teaser ? ' <span class="teaser">(soon)</span>' : ''}</button>`;
      })
      .join('');

    const d = derivedStats(state);
    summary.innerHTML = `<b>Lv ${state.hero.level}</b> · <span class="gold">${state.gold}g</span>` +
      (state.rebirth.count > 0 ? `\n<span class="soul">${state.rebirth.souls} souls</span> · run ${state.rebirth.count + 1}` : '') +
      `\nATK ${d.atk} · HP ${Math.ceil(state.hero.hp)}/${d.maxHp}`;

    main.innerHTML = TAB_RENDERERS[state.ui.activeTab](state);

    // keep combat log pinned to bottom
    const log = document.getElementById('combat-log');
    if (log) log.scrollTop = log.scrollHeight;
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
      case 'alloc': allocateStat(state, arg); break;
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
          location.reload();
        }
        break;
    }
    render();
  });

  return { render };
}
