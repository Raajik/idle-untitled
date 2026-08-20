// Tab views: each returns an HTML string. Events are delegated via data-action attributes.

import { ZONES } from '../data/zones.js';
import { derivedStats, xpForLevel } from '../game/hero.js';
import { TRAINING_TRACKS, trainingCost } from '../game/training.js';
import { soulsAvailable, canRebirth, REBIRTH_UPGRADES } from '../game/prestige.js';
import { itemScore } from '../game/loot.js';
import { UNLOCKS } from './unlocks.js';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function bar(cls, pct, label) {
  const w = Math.max(0, Math.min(100, pct));
  return `<div class="bar ${cls}"><div class="fill" style="width:${w}%"></div><div class="label">${esc(label)}</div></div>`;
}

function logHtml(state, limit = 40) {
  const lines = state.log.slice(-limit);
  return lines.map((l) => `<div class="${l.cls}">${esc(l.text)}</div>`).join('');
}

// --- Battle ---
export function battleTab(state) {
  const h = state.hero;
  const d = derivedStats(state);
  const m = state.monster;
  const p = state.progress;

  const zoneButtons = ZONES.map((z, i) => {
    const locked = i > p.highestZone;
    const cls = ['btn', 'zone-btn', locked ? 'locked' : '', i === p.zone ? 'current' : ''].join(' ');
    const sub = locked ? '🔒 locked' : i === p.highestZone && p.bossesKilled <= i ? 'in progress' : 'cleared';
    return `<button class="${cls}" data-action="travel" data-arg="${i}" ${locked ? 'disabled' : ''}>${esc(z.name)}<span class="sub">${sub}</span></button>`;
  }).join('');

  const zone = ZONES[p.zone];
  const monsterPanel = m
    ? `<div><b class="${m.isBoss ? 'soul' : ''}">${esc(m.name)}${m.isBoss ? ' ☠ BOSS' : ''}</b></div>
       ${bar('hp', (m.hp / m.maxHp) * 100, `${Math.max(0, Math.ceil(m.hp))} / ${m.maxHp}`)}
       <div class="muted">ATK ${m.atk} · DEF ${m.def} · ${p.killsInZone}/${zone.killsToBoss} kills to boss</div>`
    : `<div class="muted">Searching for a monster...</div>`;

  return `
    <div class="panel"><h2>Zone</h2><div class="zone-list">${zoneButtons}</div></div>
    <div class="panel">
      <h2>${esc(zone.name)}</h2>
      ${monsterPanel}
      <h2 style="margin-top:14px">You — Level ${h.level}</h2>
      ${bar('hp', (h.hp / d.maxHp) * 100, h.dead ? 'Dead... reviving' : `${Math.ceil(h.hp)} / ${d.maxHp} HP`)}
      ${bar('xp', (h.xp / xpForLevel(h.level)) * 100, `XP ${h.xp} / ${xpForLevel(h.level)}`)}
      <div class="muted">ATK ${d.atk} · DEF ${d.def} · SPD ${d.spd.toFixed(2)}/s · Crit ${d.critChance.toFixed(1)}% · <span class="gold">${state.gold} gold</span></div>
    </div>
    <div class="panel"><h2>Combat Log</h2><div class="log" id="combat-log">${logHtml(state)}</div></div>`;
}

// --- Hero ---
export function heroTab(state) {
  const h = state.hero;
  const d = derivedStats(state);

  function allocRow(stat, name, desc) {
    const can = h.statPoints > 0;
    return `<div class="alloc-row">
      <span class="name">${name}</span><span class="val">${h[stat]}</span>
      <button class="btn" data-action="alloc" data-arg="${stat}" ${can ? '' : 'disabled'}>+1</button>
      <span class="muted">${desc}</span></div>`;
  }

  return `
    <div class="panel">
      <h2>Level ${h.level} — ${h.statPoints} stat points available</h2>
      ${allocRow('str', 'STR', '+2 ATK each')}
      ${allocRow('vit', 'VIT', '+8 Max HP, +1 DEF each')}
      ${allocRow('agi', 'AGI', '+4% attack speed, +0.3% crit each')}
    </div>
    <div class="panel"><h2>Derived Stats</h2><div class="stat-grid">
      <div class="stat-row"><span class="k">Max HP</span><span class="v">${d.maxHp}</span></div>
      <div class="stat-row"><span class="k">ATK</span><span class="v">${d.atk}</span></div>
      <div class="stat-row"><span class="k">DEF</span><span class="v">${d.def}</span></div>
      <div class="stat-row"><span class="k">Attack speed</span><span class="v">${d.spd.toFixed(2)}/s</span></div>
      <div class="stat-row"><span class="k">Crit chance</span><span class="v">${d.critChance.toFixed(1)}%</span></div>
      <div class="stat-row"><span class="k">XP bonus</span><span class="v">+${d.xpPct}%</span></div>
      <div class="stat-row"><span class="k">Gold bonus</span><span class="v">+${d.goldPct}%</span></div>
      <div class="stat-row"><span class="k">Loot luck</span><span class="v">+${d.luckPct}%</span></div>
    </div></div>`;
}

// --- Equipment ---
function itemHtml(state, item, equipped) {
  const affixes = item.affixes.map((a) => a.label).join(', ');
  const base = item.slot === 'weapon' ? `${item.power} ATK` : item.slot === 'armor' ? `${Math.floor(item.power * 0.6)} DEF, +${item.power * 2} HP` : `${item.power} power`;
  let cmp = '';
  if (!equipped) {
    const cur = state.equipment[item.slot];
    const diff = itemScore(item) - itemScore(cur);
    cmp = cur ? (diff >= 0 ? `<span class="equip-better">▲ +${diff.toFixed(0)}</span>` : `<span class="equip-worse">▼ ${diff.toFixed(0)}</span>`) : '<span class="equip-better">▲ new slot</span>';
  }
  const action = equipped
    ? ''
    : `<div class="actions"><button class="btn" data-action="equip" data-arg="${item.id}">Equip</button></div>`;
  return `<div class="item">
    <div class="name rarity-${item.rarity}">${esc(item.name)} <span class="muted">[${item.rarity} ${item.slot}]</span> ${cmp}</div>
    <div class="stats">${base}${affixes ? ' · ' + esc(affixes) : ''}</div>
    ${action}</div>`;
}

export function equipmentTab(state) {
  const slots = ['weapon', 'armor', 'trinket', 'charm'];
  const equipped = slots
    .map((s) => {
      const it = state.equipment[s];
      return `<h2 style="margin-top:8px">${s}</h2>` + (it ? itemHtml(state, it, true) : '<div class="muted">— empty —</div>');
    })
    .join('');

  const inv = state.inventory.length
    ? state.inventory.map((it) => itemHtml(state, it, false)).join('')
    : '<div class="muted">No loot yet. Monsters drop equipment as you fight.</div>';

  return `
    <div class="panel"><h2>Equipped</h2>${equipped}</div>
    <div class="panel">
      <h2>Inventory (${state.inventory.length})</h2>
      <div style="margin-bottom:8px"><button class="btn" data-action="toggle-autoequip">Auto-equip: ${state.settings.autoEquip ? 'ON' : 'OFF'}</button></div>
      ${inv}
    </div>`;
}

// --- Training ---
export function trainingTab(state) {
  const rows = TRAINING_TRACKS.map((t) => {
    const rank = state.training[t.id];
    const cost = trainingCost(t.id, rank);
    const afford = state.gold >= cost;
    return `<div class="upgrade-row">
      <div><b>${t.name}</b> <span class="muted">rank ${rank}</span><div class="desc">${t.desc}</div></div>
      <button class="btn" data-action="train" data-arg="${t.id}" ${afford ? '' : 'disabled'}>Buy — <span class="gold">${cost}g</span></button>
    </div>`;
  }).join('');
  return `<div class="panel"><h2>Training — <span class="gold">${state.gold} gold</span></h2>${rows}</div>`;
}

// --- Rebirth ---
export function rebirthTab(state) {
  const souls = soulsAvailable(state);
  const can = canRebirth(state);
  const upgrades = REBIRTH_UPGRADES.map((u) => {
    const rank = state.rebirth.upgrades[u.id] || 0;
    const maxed = rank >= u.maxRank;
    const cost = maxed ? null : u.cost(rank);
    const afford = cost !== null && state.rebirth.souls >= cost;
    return `<div class="upgrade-row">
      <div><b>${u.name}</b> <span class="muted">${rank}/${u.maxRank}</span><div class="desc">${u.desc}</div></div>
      ${maxed ? '<span class="muted">MAX</span>' : `<button class="btn" data-action="buy-upgrade" data-arg="${u.id}" ${afford ? '' : 'disabled'}>Buy — <span class="soul">${cost} souls</span></button>`}
    </div>`;
  }).join('');

  return `
    <div class="panel">
      <h2>Rebirth — <span class="soul">${state.rebirth.souls} Hero Souls</span> · ${state.rebirth.count} rebirths</h2>
      <p class="muted" style="margin-bottom:10px">Reset your level, gold, gear, and zone progress in exchange for Hero Souls — permanent power that carries across every run.</p>
      <button class="btn primary" data-action="rebirth" ${can ? '' : 'disabled'}>
        ${can ? `Rebirth now — gain ${souls} souls` : `Reach ${ZONES[1].name} to unlock rebirth`}
      </button>
    </div>
    <div class="panel"><h2>Soul Upgrades</h2>${upgrades}</div>`;
}

// --- Overview (post-rebirth dashboard) ---
export function overviewTab(state) {
  const h = state.hero;
  const d = derivedStats(state);
  const m = state.monster;
  const unlocked = UNLOCKS.filter((u) => u.when(state)).map((u) => u.id);

  const tiles = [];
  tiles.push(`<div class="panel"><h2>Hero</h2>
    Level ${h.level} · <span class="gold">${state.gold}g</span> · <span class="soul">${state.rebirth.souls} souls</span><br/>
    ${bar('hp', (h.hp / d.maxHp) * 100, `${Math.ceil(h.hp)} / ${d.maxHp} HP`)}
    ${bar('xp', (h.xp / xpForLevel(h.level)) * 100, `XP ${h.xp} / ${xpForLevel(h.level)}`)}
    <div class="muted">ATK ${d.atk} · DEF ${d.def} · SPD ${d.spd.toFixed(2)}/s</div></div>`);

  tiles.push(`<div class="panel"><h2>Battle — ${esc(ZONES[state.progress.zone].name)}</h2>
    ${m ? `<b class="${m.isBoss ? 'soul' : ''}">${esc(m.name)}</b>${bar('hp', (m.hp / m.maxHp) * 100, `${Math.ceil(m.hp)} / ${m.maxHp}`)}` : '<span class="muted">—</span>'}
    <div class="muted">${state.progress.killsInZone}/${ZONES[state.progress.zone].killsToBoss} kills to boss</div></div>`);

  if (unlocked.includes('training')) tiles.push(`<div class="panel"><h2>Training</h2>${trainingTab(state).replace(/<div class="panel">|<\/div>$/g, '')}</div>`);

  tiles.push(`<div class="panel"><h2>Log</h2><div class="log" style="height:180px" id="combat-log">${logHtml(state, 20)}</div></div>`);

  return `<div id="overview-grid">${tiles.join('')}</div>`;
}

// --- Settings ---
export function settingsTab(state) {
  return `
    <div class="panel"><h2>Save</h2>
      <p class="muted">Saved automatically every 10 seconds. You can also export your save as text to back it up or move devices.</p>
      <div style="display:flex; gap:8px; margin:10px 0">
        <button class="btn" data-action="export">Export save</button>
        <button class="btn" data-action="import">Import save</button>
        <button class="btn" data-action="hard-reset">Hard reset</button>
      </div>
      <textarea class="save-io" id="save-io" placeholder="Exported save appears here; paste a save here and click Import"></textarea>
    </div>
    <div class="panel"><h2>About</h2>
      <p class="muted">Idle Untitled — a text idle RPG. No energy, no tokens, no premium anything. v${state.version}</p>
    </div>`;
}
