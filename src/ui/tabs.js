// Tab views: each returns an HTML string. Events are delegated via data-action attributes.

import { REGIONS, getRegion, getPoiById, DAMAGE_TYPES } from '../data/regions.js';
import { derivedStats, xpForLevel, totalXpForLevel, attributeCost, ATTRIBUTES } from '../game/hero.js';
import { xpToNextRank, defensiveChance, hitChance, activeWeaponSkill, recallCooldownSeconds, OFFENSE_SKILLS, MAX_SKILL_RANK } from '../game/skills.js';
import { computeDepth } from '../game/combat.js';
import { canRecall } from '../game/lifestone.js';
import { TRAINING_TRACKS, trainingCost } from '../game/training.js';
import { soulsAvailable, canRebirth, REBIRTH_UPGRADES } from '../game/prestige.js';
import { itemScore } from '../game/loot.js';
import { STARTING_SLOTS, AETHERIA_SLOTS } from '../data/items.js';
import { UNLOCKS } from './unlocks.js';
import { fmt, formatDuration } from '../engine/format.js';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function bar(cls, pct, label, id, target) {
  const w = Math.max(0, Math.min(100, pct));
  const bid = id ? ` id="${id}"` : '';
  const fid = id ? ` id="${id}-fill"` : '';
  const lid = id ? ` id="${id}-label"` : '';
  const tgt = target ? ` data-target="${target}"` : '';
  return `<div class="bar ${cls}"${bid}${tgt}><div class="fill"${fid} style="width:${w}%"></div><div class="fx-flash"></div><div class="label"${lid}>${esc(label)}</div></div>`;
}

function logHtml(state, limit = 40) {
  const lines = state.log.slice(-limit);
  return lines.map((l) => `<div class="${l.cls}">${esc(l.text)}</div>`).join('');
}

// --- Onboarding: name, the Lifestone question, and (if "no") Alcott's intro ---
function onboardingHtml(state) {
  const step = state.onboarding.step;
  const name = esc(state.hero.name || '');

  if (step === 'name') {
    return `<div class="panel intro-panel">
      <p>You feel as if you've just woken up from a very long and uncomfortable sleep. Your entire body is sore.</p>
      <p style="margin-top:8px">A voice, unfamiliar, asks: <em>"...first time?"</em></p>
      <p class="npc-speech" style="margin-top:12px">"What's your name, newbie?"</p>
      <div style="display:flex; gap:8px; margin-top:8px">
        <input type="text" id="name-input" class="text-input" maxlength="24" placeholder="Enter your name" />
        <button class="btn primary" data-action="submit-name">Continue</button>
      </div>
    </div>`;
  }

  if (step === 'seen-lifestone') {
    return `<div class="panel intro-panel">
      <p class="npc-speech">"Have you ever seen a <span class="lifestone-glow">Lifestone</span> before, ${name}?"</p>
      <div style="display:flex; gap:8px; margin-top:10px">
        <button class="btn primary" data-action="answer-lifestone" data-arg="yes">Yes</button>
        <button class="btn" data-action="answer-lifestone" data-arg="no">No</button>
      </div>
    </div>`;
  }

  // step === 'alcott-explains'
  return `<div class="panel intro-panel">
    <p class="npc-speech">"Name's Alcott. That glow behind you — that's a <span class="lifestone-glow">Lifestone</span>. It'll keep you from dying for good, though it won't spare you the pain of it. Bond with enough of them and you'll be able to call on one to travel between them in an instant."</p>
    <p style="margin-top:8px">He points toward a distant huddle of rooftops. <span class="npc-speech">"That's Holtburg. Stay sharp on the way — and if trouble finds you, my friend Thorolf there can help you get your bearings."</span></p>
    <button class="btn primary" data-action="ack-intro" style="margin-top:10px">Set out for Holtburg</button>
  </div>`;
}

// Shared monster/hero combat display used by both real POI fights and the tutorial
// road — `extraHtml` slots in anything extra (e.g. a Flee button during the tutorial).
function combatDisplayHtml(state, headerHtml, extraHtml = '') {
  const h = state.hero;
  const d = derivedStats(state);
  const m = state.monster;
  const xpProgress = state.progress.totalXpEarned - totalXpForLevel(h.level);
  const aw = activeWeaponSkill(state);
  const attackLine = aw.weaponName ? `Attacking with ${esc(aw.weaponName)}` : 'Fighting unarmed';
  return `
    <div class="panel">
      ${headerHtml}
      <div><b id="m-name" class="${m && m.isBoss ? 'soul' : ''}">${m ? esc(m.name) + ` (Lv ${m.level})` + (m.isBoss ? ' ☠ BOSS' : '') : 'Searching...'}</b></div>
      ${bar('hp', m ? (m.hp / m.maxHp) * 100 : 0, m ? `${Math.max(0, Math.ceil(m.hp))} / ${m.maxHp}` : '...', 'm-hp', 'monster')}
      <div id="m-meta" class="muted">${m ? `ATK ${m.atk} · DEF ${m.def} · ${esc(m.dmgType)}` : ''}</div>
      ${extraHtml}
      <h2 style="margin-top:14px">You — Level ${h.level}</h2>
      ${bar('xp', (xpProgress / xpForLevel(h.level)) * 100, `XP ${fmt(xpProgress)} / ${fmt(xpForLevel(h.level))}`, 'h-xp')}
      <div class="vitals-row">
        ${bar('hp', (h.hp / d.maxHp) * 100, h.dead ? 'Dead... reviving' : `${Math.ceil(h.hp)} / ${d.maxHp} HP`, 'h-hp', 'hero')}
        ${bar('stamina', (h.stamina / d.maxStamina) * 100, `${Math.ceil(h.stamina)} / ${d.maxStamina} Stamina`, 'h-sta')}
        ${bar('mana', (h.mana / d.maxMana) * 100, `${Math.ceil(h.mana)} / ${d.maxMana} Mana`, 'h-mana')}
      </div>
      <div id="h-attack-line" class="muted">${attackLine}, ${esc(aw.label)} (Rank ${aw.skill.rank}).</div>
      <div id="h-stats" class="muted">ATK ${d.atk} · DEF ${d.def} · SPD ${d.spd.toFixed(2)}/s · Crit ${d.critChance.toFixed(1)}% · ${fmt(state.pyreals)} pyreals</div>
    </div>`;
}

// --- Battle ---
export function battleTab(state) {
  if (state.onboarding.step !== 'done') return onboardingHtml(state);

  const p = state.progress;
  const travel = state.travel;

  if (travel && travel.tutorial) {
    const header = `<h2>The Road to Holtburg <span class="muted" style="font-size:0.7em">${formatDuration(travel.remaining)} remaining</span></h2>
      <p class="muted" style="margin-bottom:8px">You're unarmed and alone out here. Fight if you must, or try to slip past.</p>`;
    const fleeBtn = state.monster ? `<div class="actions" style="margin:8px 0"><button class="btn" data-action="flee-tutorial">Try to run away</button></div>` : '';
    return `
      ${combatDisplayHtml(state, header, fleeBtn)}
      <div class="panel"><h2>Combat Log</h2><div class="log" id="combat-log">${logHtml(state)}</div></div>`;
  }

  const regionTiles = REGIONS.map((r) => {
      const arrived = p.unlockedRegions.includes(r.id);
      const travelling = travel && travel.kind === 'region' && travel.id === r.id;
      const cls = ['tile', 'region-tile', arrived ? 'arrived' : '', travelling ? 'travelling' : ''].join(' ');
      const sub = travelling
        ? `<span class="travel-timer" id="region-timer-${r.id}">${formatDuration(travel.remaining)}</span>`
        : arrived
        ? '<span class="sub">arrived</span>'
        : `<span class="sub">Travel (${formatDuration(r.walkSeconds)})</span>`;
      return `<button class="${cls}" id="region-tile-${r.id}" title="Travel" data-action="travel-region" data-arg="${r.id}">${esc(r.name)}${sub}</button>`;
    })
    .join('');

  let poiSection = '';
  if (state.location.regionId) {
    const region = getRegion(state.location.regionId);
    const poiTiles = region.pois
      .map((poi) => {
        const here = state.location.poiId === poi.id;
        const travelling = travel && travel.kind === 'poi' && travel.id === poi.id;
        const cls = ['tile', 'poi-tile', here ? 'current' : '', travelling ? 'travelling' : ''].join(' ');
        const sub = travelling
          ? `<span class="travel-timer" id="poi-timer-${poi.id}">${formatDuration(travel.remaining)}</span>`
          : here
          ? '<span class="sub">here</span>'
          : `<span class="sub">Travel (${formatDuration(poi.walkSeconds)})</span>`;
        return `<button class="${cls}" id="poi-tile-${poi.id}" title="Travel" data-action="travel-poi" data-arg="${poi.id}">${esc(poi.name)}${sub}</button>`;
      })
      .join('');
    poiSection = `<div class="panel"><h2>Points of Interest — ${esc(region.name)}</h2><div class="tile-list">${poiTiles}</div></div>`;
  }

  let combatPanel = '';
  if (travel) {
    const label = travel.kind === 'region' ? getRegion(travel.id).name : getPoiById(travel.id).name;
    combatPanel = `<div class="panel"><h2>On the Road</h2>
      <p class="muted">Walking to ${esc(label)}... <span id="travel-remaining">${formatDuration(travel.remaining)}</span> remaining.</p></div>`;
  } else if (!state.location.poiId) {
    combatPanel = `<div class="panel"><h2>Town</h2><p class="muted">Pick a point of interest to start hunting.</p></div>`;
  } else {
    const poi = getPoiById(state.location.poiId);
    const depth = computeDepth(p);
    const bossNote = depth >= 0.75 ? ` · boss may appear` : '';
    const header = `<h2>${esc(poi.name)} <span class="muted" style="font-size:0.7em">+${Math.round(depth * 100)}% difficulty${bossNote}</span></h2>`;
    combatPanel = combatDisplayHtml(state, header);
  }

  return `
    <div class="panel"><h2>Regions</h2><div class="tile-list">${regionTiles}</div></div>
    ${poiSection}
    ${combatPanel}
    <div class="panel"><h2>Combat Log</h2><div class="log" id="combat-log">${logHtml(state)}</div></div>`;
}

// --- Hero / Attributes ---
export function attributesTab(state) {
  const h = state.hero;
  const d = derivedStats(state);
  const progress = state.progress.totalXpEarned - totalXpForLevel(h.level);

  const allocRows = ATTRIBUTES.map((a) => {
    const cost = attributeCost(h[a.id]);
    const can = h.xp >= cost;
    const latent = a.desc.includes('soon');
    return `<div class="alloc-row">
      <span class="name">${a.short}</span><span class="val">${h[a.id]}</span>
      <button class="btn" data-action="raise" data-arg="${a.id}" ${can ? '' : 'disabled'}>+1 · ${fmt(cost)} XP</button>
      <span class="muted${latent ? ' teaser' : ''}">${a.desc}</span></div>`;
  }).join('');

  return `
    <div class="panel">
      <h2>Level ${h.level} — ${fmt(h.xp)} XP to spend</h2>
      ${bar('xp', (progress / xpForLevel(h.level)) * 100, `XP to level ${h.level + 1}: ${fmt(progress)} / ${fmt(xpForLevel(h.level))}`)}
      <p class="muted" style="margin:8px 0">Spend XP to raise attributes. Each raise costs more than the last.</p>
      ${allocRows}
    </div>
    <div class="panel"><h2>Derived Stats</h2><div class="stat-grid">
      <div class="stat-row"><span class="k">Max HP</span><span class="v">${d.maxHp}</span></div>
      <div class="stat-row"><span class="k">ATK</span><span class="v">${d.atk}</span></div>
      <div class="stat-row"><span class="k">DEF</span><span class="v">${d.def}</span></div>
      <div class="stat-row"><span class="k">Attack speed</span><span class="v">${d.spd.toFixed(2)}/s</span></div>
      <div class="stat-row"><span class="k">Crit chance</span><span class="v">${d.critChance.toFixed(1)}%</span></div>
      <div class="stat-row"><span class="k">XP bonus</span><span class="v">+${d.xpPct}%</span></div>
      <div class="stat-row"><span class="k">Pyreals bonus</span><span class="v">+${d.pyrealsPct}%</span></div>
      <div class="stat-row"><span class="k">Loot luck</span><span class="v">+${d.luckPct}%</span></div>
    </div></div>`;
}

// --- Skills ---
function skillRow(name, skill, chanceLabel) {
  const maxed = skill.rank >= MAX_SKILL_RANK;
  const need = maxed ? 1 : xpToNextRank(skill.rank);
  return `<div class="skill-row">
    <div class="skill-head"><b>${esc(name)}</b> <span class="muted">rank ${skill.rank}/${MAX_SKILL_RANK}${chanceLabel ? ' · ' + chanceLabel : ''}</span></div>
    ${bar('xp', maxed ? 100 : (skill.xp / need) * 100, maxed ? 'MAX' : `XP ${fmt(skill.xp)} / ${fmt(need)}`)}
  </div>`;
}

export function skillsTab(state) {
  const skills = state.hero.skills;
  const run = skills.run;
  const speedPct = Math.round(100 - (100 * 100) / (100 + run.rank * 9));

  const defensiveRows = [
    ['Dodge', skills.dodge],
    ['Block', skills.block],
    ['Parry', skills.parry],
  ]
    .map(([name, skill]) => skillRow(name, skill, `${defensiveChance(skill.rank).toFixed(1)}% avoid`))
    .join('');

  const resistRows = DAMAGE_TYPES.map((t) => {
    const skill = skills.resistance[t];
    const label = t[0].toUpperCase() + t.slice(1);
    return skillRow(label, skill, `${defensiveChance(skill.rank).toFixed(1)}% avoid`);
  }).join('');

  const offenseByCategory = {};
  for (const meta of OFFENSE_SKILLS) {
    (offenseByCategory[meta.category] ||= []).push(meta);
  }
  const offenseSections = Object.entries(offenseByCategory)
    .map(([category, metas]) => {
      const rows = metas
        .map((meta) => {
          const skill = skills.offense[meta.key];
          if (meta.comingSoon) {
            return `<div class="skill-row"><div class="skill-head"><b>${esc(meta.label)}</b> <span class="muted teaser">(soon)</span></div></div>`;
          }
          return skillRow(meta.label, skill, `${hitChance(skill.rank).toFixed(1)}% to hit`);
        })
        .join('');
      return `<div class="panel"><h2>${esc(category)}</h2>${rows}</div>`;
    })
    .join('');

  return `
    <div class="panel">
      ${skillRow('Run', run, `${speedPct}% faster travel`)}
      <p class="muted" style="margin-top:4px">Trained only by walking.</p>
    </div>
    <div class="panel">
      <h2>Defensives</h2>
      <p class="muted" style="margin-bottom:8px">Each defends against any attack in sequence — Dodge, then Block, then Parry, then Resistance for the attack's damage type. Trained by facing attacks in combat; each avoided hit costs Stamina, capping out at 95% avoidance at rank 100.</p>
      ${defensiveRows}
    </div>
    <div class="panel">
      <h2>Resistance — by damage type</h2>
      ${resistRows}
    </div>
    <div class="panel"><h2>Offense</h2><p class="muted">Whichever weapon you have equipped (or bare fists) trains its own skill and governs how often your attacks connect, from even odds untrained up to 95% at rank 100.</p></div>
    ${offenseSections}`;
}

// --- Inventory ---
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

export function inventoryTab(state) {
  const slots = [...STARTING_SLOTS, ...AETHERIA_SLOTS.slice(0, state.progress.aetheriaSlots)];
  const equippedGrid = slots
    .map((s) => {
      const it = state.equipment[s];
      const label = s.startsWith('aetheria') ? `Aetheria ${s.slice(-1)}` : s;
      return `<div class="equip-slot"><div class="slot-name">${esc(label)}</div>${it ? itemHtml(state, it, true) : '<div class="muted">— empty —</div>'}</div>`;
    })
    .join('');

  const inv = state.inventory.length
    ? state.inventory.map((it) => itemHtml(state, it, false)).join('')
    : '<div class="muted">No loot yet. Monsters drop equipment as you fight.</div>';

  return `
    <div class="panel"><h2>Equipped</h2><div class="equip-grid">${equippedGrid}</div></div>
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
    const afford = state.pyreals >= cost;
    return `<div class="upgrade-row">
      <div><b>${t.name}</b> <span class="muted">rank ${rank}</span><div class="desc">${t.desc}</div></div>
      <button class="btn" data-action="train" data-arg="${t.id}" ${afford ? '' : 'disabled'}>Buy — <span class="gold">${fmt(cost)}p</span></button>
    </div>`;
  }).join('');
  return `<div class="panel"><h2>Training — <span class="gold">${fmt(state.pyreals)} pyreals</span></h2>${rows}</div>`;
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
      <p class="muted" style="margin-bottom:10px">Reset your level, pyreals, gear, and region progress in exchange for Hero Souls — permanent power that carries across every run.</p>
      <button class="btn primary" data-action="rebirth" ${can ? '' : 'disabled'}>
        ${can ? `Rebirth now — gain ${souls} souls` : `Reach Glenden Wood to unlock rebirth`}
      </button>
    </div>
    <div class="panel"><h2>Soul Upgrades</h2>${upgrades}</div>`;
}

// --- Overview (post-rebirth dashboard) ---
export function overviewTab(state) {
  const h = state.hero;
  const d = derivedStats(state);
  const m = state.monster;
  const p = state.progress;

  const tiles = [];
  const xpProgress = state.progress.totalXpEarned - totalXpForLevel(h.level);
  tiles.push(`<div class="panel"><h2>Hero</h2>
    <span id="ov-hero-line">Level ${h.level} · <span class="gold">${fmt(state.pyreals)} pyreals</span> · <span class="soul">${state.rebirth.souls} souls</span></span><br/>
    ${bar('hp', (h.hp / d.maxHp) * 100, `${Math.ceil(h.hp)} / ${d.maxHp} HP`, 'h-hp', 'hero')}
    ${bar('xp', (xpProgress / xpForLevel(h.level)) * 100, `XP ${fmt(xpProgress)} / ${fmt(xpForLevel(h.level))}`, 'h-xp')}
    <div class="muted">ATK ${d.atk} · DEF ${d.def} · SPD ${d.spd.toFixed(2)}/s</div></div>`);

  const poi = state.location.poiId ? getPoiById(state.location.poiId) : null;
  tiles.push(`<div class="panel"><h2>Battle — ${poi ? esc(poi.name) : 'Town'}</h2>
    <b id="m-name" class="${m && m.isBoss ? 'soul' : ''}">${m ? esc(m.name) + ` (Lv ${m.level})` + (m.isBoss ? ' ☠ BOSS' : '') : state.travel ? 'Travelling...' : 'Searching...'}</b>
    ${bar('hp', m ? (m.hp / m.maxHp) * 100 : 0, m ? `${Math.ceil(m.hp)} / ${m.maxHp}` : '...', 'm-hp', 'monster')}
    <div id="ov-kills" class="muted">${poi ? `+${Math.round(computeDepth(p) * 100)}% difficulty` : ''}</div></div>`);

  const unlocked = UNLOCKS.filter((u) => u.when(state)).map((u) => u.id);
  if (unlocked.includes('training')) tiles.push(`<div class="panel"><h2>Training</h2>${trainingTab(state).replace(/<div class="panel">|<\/div>$/g, '')}</div>`);

  tiles.push(`<div class="panel"><h2>Log</h2><div class="log" style="height:180px" id="combat-log">${logHtml(state, 20)}</div></div>`);

  return `<div id="overview-grid">${tiles.join('')}</div>`;
}

// --- Lifestone Recall ---
export function recallTab(state) {
  const recall = state.hero.skills.lifestone.recall;
  const need = recall.rank >= MAX_SKILL_RANK ? 1 : xpToNextRank(recall.rank);
  const cooldown = state.progress.recallCooldown;
  const ready = canRecall(state);

  const destinations = REGIONS.filter((r) => state.progress.unlockedRegions.includes(r.id))
    .map((r) => {
      const here = state.location.regionId === r.id && !state.location.poiId && !state.travel;
      return `<div class="upgrade-row">
        <div><b>${esc(r.name)}</b>${here ? ' <span class="muted">(here)</span>' : ''}</div>
        <button class="btn" data-action="recall" data-arg="${r.id}" ${ready && !here ? '' : 'disabled'}>Recall</button>
      </div>`;
    })
    .join('');

  return `
    <div class="panel">
      <h2>Lifestone Recall — rank ${recall.rank}/${MAX_SKILL_RANK}</h2>
      ${bar('xp', recall.rank >= MAX_SKILL_RANK ? 100 : (recall.xp / need) * 100, recall.rank >= MAX_SKILL_RANK ? 'MAX' : `XP ${fmt(recall.xp)} / ${fmt(need)}`)}
      <p class="muted" style="margin-top:8px">Instantly travel to any Lifestone you've bonded with. Cooldown: ${formatDuration(recallCooldownSeconds(recall.rank))} at this rank${cooldown > 0 ? ` — <span id="recall-cooldown">${formatDuration(cooldown)}</span> remaining` : ''}.</p>
    </div>
    <div class="panel"><h2>Bonded Lifestones</h2>${destinations || '<p class="muted">None yet — arrive somewhere new first.</p>'}</div>`;
}

// --- Persistent battle dock (shown on every tab except Battle itself) ---
export function battleDockHtml(state) {
  const h = state.hero;
  const d = derivedStats(state);
  const m = state.monster;
  const travel = state.travel;

  let where;
  if (travel) {
    const label = travel.kind === 'region' ? getRegion(travel.id).name : getPoiById(travel.id).name;
    where = `Walking to ${esc(label)} — ${formatDuration(travel.remaining)}`;
  } else if (!state.location.poiId) {
    where = 'Town';
  } else {
    where = esc(getPoiById(state.location.poiId).name);
  }

  const monsterHtml = m
    ? `<div class="dock-monster">
        <b class="${m.isBoss ? 'soul' : ''}">${esc(m.name)} (Lv ${m.level})${m.isBoss ? ' ☠' : ''}</b>
        ${bar('hp mini', (m.hp / m.maxHp) * 100, `${Math.max(0, Math.ceil(m.hp))}/${m.maxHp}`, 'dock-m-hp')}
      </div>`
    : `<div class="dock-monster muted">—</div>`;

  return `
    <div class="dock-where">${where}</div>
    ${monsterHtml}
    <div class="dock-hero">
      ${bar('hp mini', (h.hp / d.maxHp) * 100, `${Math.ceil(h.hp)}/${d.maxHp}`, 'dock-h-hp')}
      ${bar('stamina mini', (h.stamina / d.maxStamina) * 100, `${Math.ceil(h.stamina)}/${d.maxStamina}`, 'dock-h-sta')}
      ${bar('mana mini', (h.mana / d.maxMana) * 100, `${Math.ceil(h.mana)}/${d.maxMana}`, 'dock-h-mana')}
    </div>`;
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
      <p class="muted">Immortal Isparian Incremental (III) — a text idle RPG in Asheron's Call's world. No energy, no tokens, no premium anything. v${state.version}</p>
    </div>`;
}
