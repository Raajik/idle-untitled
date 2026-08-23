// Tab views: each returns an HTML string. Events are delegated via data-action attributes.

import {
  REGIONS,
  getRegion,
  getPoiById,
  isSite,
  DAMAGE_TYPES,
  poiLevelLabel,
  tierForPoi,
  tiersForRegion,
  poisInTier,
} from '../data/regions.js';
import { derivedStats, xpForLevel, totalXpForLevel, ATTRIBUTES } from '../game/hero.js';
import {
  xpToNextRank,
  xpToNextAttrPoint,
  defensiveChance,
  resistanceMitigationPct,
  hitChance,
  activeWeaponSkill,
  recallCooldownSeconds,
  jumpCooldownSeconds,
  OFFENSE_SKILLS,
  GATHERING_SKILLS,
  MAX_SKILL_RANK,
  modifiedWalkTime,
} from '../game/skills.js';
import { activeAttackInterval, activeAttackResource, activeAttackCost, canAffordAttack, activeElement, activeTrait } from '../game/combat.js';
import { WAR_DAMAGE_TYPES, damageLabel, damageGlyph, damageTypeNote, rendingName, RENDING_PER_LEVEL, MAX_RENDING_LEVEL } from '../data/elements.js';
import { gemDamageType, rendingRefusal } from '../game/rending.js';
import { weaknessesOf, speciesLabel, speciesOf } from '../data/species.js';
import { WAVES_PER_POI, waveDifficulty, clearYield, gatherMultiplier, nextMilestone } from '../game/waves.js';
import { MELEE_STANCES, ARCHERY_STANCES, MAGIC_SPELLS, VOID_SPELLS, ROT_MAX_STACKS, staminaCostForWindup } from '../data/combatStances.js';
import {
  canRecall,
  canSacrificeVitae,
  offeringCost,
  lifestoneGrowth,
  isGrown,
  hasOpenQuest,
  poiDisplayName,
  conditionOf,
  LIFESTONE_GROWTH_REQUIRED,
} from '../game/lifestone.js';
import { BUFF_SPELLS, getBuffSpell, buffSpellName, effectText } from '../data/buffSpells.js';
import { knowsSpell, knownBuff, canCastBuffSpell, isAutoCast, spellLevel as knownSpellLevel } from '../game/buffs.js';
import { getConsumable } from '../data/consumables.js';
import { charges, canAutoHeal, isAutoDrink, upkeepConsumables, STAMINA_PER_HP } from '../game/consumables.js';
import { vitaePct, atMaxVitae, xpToClearStack, VITAE_PER_STACK, MAX_VITAE_PCT } from '../game/vitae.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { availableShortcutsFrom, canJump } from '../game/shortcuts.js';
import { getMaterial, materialsForSlot, MATERIALS, RENDING_MATERIALS, totalOfKind, heldOfKind, kindLabel, materialKind, materialIcon } from '../data/materials.js';
import { creatureArt } from './creatureArt.js';
import { kindOf } from '../data/bestiary.js';
import { TROPHIES } from '../data/trophies.js';
import { canTinker, tinkerEffectFor, tinkerCostFor, tinkerCostAtLevel, TINKER_BASE_COST } from '../game/tinkering.js';
import { TINKER_RECIPES } from '../data/tinkering.js';
import {
  buildingsForRegion,
  getBuilding,
  unlockCost,
  upgradeCost,
  canAfford,
  perkText,
  MAX_BUILDING_LEVEL,
} from '../data/buildings.js';
import { rotationRemaining, buildingHasQuest, buildingQuestText } from '../game/buildings.js';
import { buyPrice, sellPrice, healCost } from '../game/shop.js';
import { TRAINING_TRACKS, trainingCost } from '../game/training.js';
import { soulsAvailable, canEnlighten, ENLIGHTENMENT_UPGRADES } from '../game/enlightenment.js';
import { itemScore, expectedSalvageYield, AUTO_SALVAGE_OFF } from '../game/loot.js';
import {
  STARTING_SLOTS,
  EQUIP_SLOTS,
  AETHERIA_SLOTS,
  RARITIES,
  SLOT_LABELS,
  SLOTS,
  itemIcon,
  slotIcon,
  slotKind,
  weaponClass,
  isArmorSlot,
  isUnderclothing,
} from '../data/items.js';
import { UNLOCKS } from './unlocks.js';
import { fmt, formatDuration, formatClock, plural } from '../engine/format.js';

// "ring1" -> "Ring", "upperArm" -> "Upper Arm". Both instances of a doubled slot
// read the same; which hand a ring is on isn't information anyone needs.
function slotLabel(equipSlot) {
  return SLOT_LABELS[slotKind(equipSlot)] || slotKind(equipSlot);
}

function cap(s) {
  return s[0].toUpperCase() + s.slice(1);
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// `vitae: true` adds the hatched overlay that eats into the right-hand end of a
// vitals bar — see vitaeOverlayHtml. Always emitted (hidden at 0%) so the
// renderer can size it every frame without rebuilding the bar.
function bar(cls, pct, label, id, target, { vitae = false } = {}) {
  const w = Math.max(0, Math.min(100, pct));
  const bid = id ? ` id="${id}"` : '';
  const fid = id ? ` id="${id}-fill"` : '';
  const lid = id ? ` id="${id}-label"` : '';
  const tgt = target ? ` data-target="${target}"` : '';
  const overlay = vitae ? '<div class="vitae-overlay"></div>' : '';
  return `<div class="bar ${cls}"${bid}${tgt}><div class="fill"${fid} style="width:${w}%"></div>${overlay}<div class="fx-flash"></div><div class="label"${lid}>${esc(label)}</div></div>`;
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

// The attack bar's text: how far into the current swing/cast you are, how long the
// whole thing takes, and what it will cost — all spelled out rather than implicit.
// When the hero can't pay, the bar parks at full and says why.
// Exported because the renderer rewrites it every frame (see ui/render.js).
export function attackBarLabel(state, elapsed, interval) {
  const { resource, amount } = activeAttackCost(state);
  if (!canAffordAttack(state)) {
    return resource === 'mana'
      ? `Gathering mana — needs ${amount}`
      : `Catching your breath — needs ${amount} stamina`;
  }
  const verb = state.hero.combat.mode === 'magic' ? 'Casting' : 'Winding up';
  return `${verb} — ${Math.min(elapsed, interval).toFixed(1)}s / ${interval.toFixed(1)}s · ${amount} ${resource}`;
}

// AC-style attack bar: a mode switcher (Melee/Archery/Magic — Archery needs a
// bow/crossbow equipped) plus, per mode, a row of stance/spell picks and a
// "reverse" bar that fills toward the chosen stance's interval or cast time.
function attackBarHtml(state, d) {
  const h = state.hero;
  const weapon = state.equipment.weapon;
  const isRanged = !!(weapon && (weapon.baseType === 'bow' || weapon.baseType === 'crossbow'));
  const mode = h.combat.mode;
  const interval = activeAttackInterval(state, d);
  const pct = (h.attackTimer / interval) * 100;
  const label = attackBarLabel(state, h.attackTimer, interval);

  const modeBtn = (id, label, disabled) => {
    const active = mode === id ? ' active' : '';
    return `<button class="btn small${active}"${disabled ? ' disabled' : ''} data-action="set-combat-mode" data-arg="${id}">${label}</button>`;
  };

  let stanceHtml;
  if (mode === 'archery') {
    stanceHtml = ARCHERY_STANCES.map(
      (s, i) =>
        `<button class="stance-seg${h.combat.archeryStance === i ? ' active' : ''}" data-action="set-archery-stance" data-arg="${i}" title="${plural(staminaCostForWindup(s.interval ?? 1 / d.spd), 'stamina', 'stamina')} per shot">${esc(s.label)}</button>`
    ).join('');
  } else if (mode === 'magic' || mode === 'void') {
    const table = mode === 'void' ? VOID_SPELLS : MAGIC_SPELLS;
    const chosen = mode === 'void' ? h.combat.voidSpell : h.combat.magicSpell;
    const action = mode === 'void' ? 'set-void-spell' : 'set-magic-spell';
    stanceHtml = Object.entries(table)
      .map(([id, sp]) => {
        const tip = [
          `${plural(sp.manaCost, 'mana', 'mana')} per cast`,
          sp.aoe ? 'Catches the whole group' : null,
          sp.rot ? `Rots every enemy · stacks ${ROT_MAX_STACKS} · ${sp.cooldown}s cooldown · never wears off` : null,
        ]
          .filter(Boolean)
          .join(' · ');
        const cooling = sp.rot && state.progress.rotCooldown > 0;
        return `<button class="stance-seg${chosen === id ? ' active' : ''}" data-action="${action}" data-arg="${id}" title="${esc(tip)}">${esc(sp.label)}${cooling ? ` <span class="muted">${Math.ceil(state.progress.rotCooldown)}s</span>` : ''}</button>`;
      })
      .join('');
  } else {
    stanceHtml = MELEE_STANCES.map(
      (s, i) => {
        const tip = [`${plural(staminaCostForWindup(s.interval ?? 1 / d.spd), 'stamina', 'stamina')} per swing`, s.bleed ? 'Applies a stacking Bleed' : null].filter(Boolean).join(' · ');
        return `<button class="stance-seg${h.combat.meleeStance === i ? ' active' : ''}" data-action="set-melee-stance" data-arg="${i}" title="${tip}">${esc(s.label)}</button>`;
      }
    ).join('');
  }

  // War throws any of the seven ordinary types, drawn as a row of square runes.
  // Void has only the one, so it says so rather than offering a choice that
  // isn't there.
  let elementRow = '';
  if (mode === 'magic') {
    const target = state.monsters[0] || null;
    const picked = activeElement(state, target);
    const glyph = (id) => {
      const type = id === 'auto' ? picked : id;
      const active = h.combat.warElement === id ? ' active' : '';
      const note = target ? damageTypeNote(type, target.name, weapon) : '';
      const tip = id === 'auto'
        ? `Auto — whatever lands hardest${target ? `, right now ${damageLabel(picked)}${note ? ` (${note})` : ''}` : ''}`
        : [damageLabel(id), note].filter(Boolean).join(' · ');
      const face = id === 'auto' ? 'A' : damageGlyph(id);
      // A type this creature is soft to is worth pointing at.
      const soft = target && damageTypeNote(type, target.name, weapon).startsWith('+') ? ' soft' : '';
      return `<button class="rune el-${type}${active}${soft}" data-action="set-war-element" data-arg="${id}" title="${esc(tip)}"><span class="rune-face">${face}</span></button>`;
    };
    const note = target ? damageTypeNote(picked, target.name, weapon) : '';
    elementRow = `<div class="rune-row">${['auto', ...WAR_DAMAGE_TYPES].map(glyph).join('')}</div>
      <div class="muted rune-line">${esc(damageLabel(picked))}${note ? ` — ${esc(note)}` : ''}${weapon && weapon.imbue ? ` · ${esc(rendingName(weapon.imbue.damageType, weapon.imbue.level))}` : ''}</div>`;
  } else if (mode === 'void') {
    elementRow = `<div class="muted rune-line"><span class="rune-face el-void">${damageGlyph('void')}</span> Void damage, always.</div>`;
  }

  // What the thing in your hands does that another wouldn't.
  const trait = activeTrait(state);
  const traitLine = trait.text ? `<div class="muted trait-line">${esc(trait.text)}</div>` : '';

  return `
    <div class="attack-bar-panel">
      <div class="combat-mode-row">
        ${modeBtn('melee', 'Melee', false)}
        ${modeBtn('archery', 'Archery', !isRanged)}
        ${modeBtn('magic', 'War', false)}
        ${modeBtn('void', 'Void', false)}
      </div>
      <div class="stance-row">${stanceHtml}</div>
      ${elementRow}
      ${traitLine}
      ${bar(`attack res-${activeAttackResource(state)}`, pct, label, 'atk-bar')}
    </div>`;
}

// Which vital a buff's effect belongs to, as a text class. Keyed off the bonus
// key rather than the spell's name so anything new that raises one of these is
// colored to match without a second list to keep in step.
const VITAL_TEXT_CLASS = {
  hpRegenFlat: 'hp-text',
  staminaRegenFlat: 'stamina-text',
  manaRegenFlat: 'mana-text',
  hpFlat: 'hp-text',
  maxManaFlat: 'mana-text',
};

// The class for whatever vital an effect touches, or '' if it isn't about one.
function vitalTextClass(effect) {
  for (const key of Object.keys(effect || {})) {
    if (VITAL_TEXT_CLASS[key]) return VITAL_TEXT_CLASS[key];
  }
  return '';
}

// A panel you can fold away. The Battle tab stacks travel, town, the fight and
// the log all at once, and most of that is navigation you only touch between
// runs -- so each section remembers whether you left it open. A folded header
// still carries a summary, so closing something never costs you the information,
// only the space.
function section(state, id, title, body, { summary = '', defaultOpen = true } = {}) {
  const open = state.ui.collapsed[id] === undefined ? defaultOpen : !state.ui.collapsed[id];
  return `<div class="panel section${open ? '' : ' folded'}">
    <button class="section-head" data-action="toggle-section" data-arg="${id}">
      <span class="caret">${open ? '\u25be' : '\u25b8'}</span>
      <h2>${title}</h2>
      ${summary ? `<span class="section-summary muted">${esc(summary)}</span>` : ''}
    </button>
    ${open ? `<div class="section-body">${body}</div>` : ''}
  </div>`;
}

// Everything you can keep running or keep drinking: the three self-buffs, the
// automation toggles they and the Healing Kit unlock, and whatever is in your
// pack. Lives next to the vitals because that's what all of it is for.
function upkeepHtml(state) {
  const spellRows = BUFF_SPELLS.filter((sp) => knowsSpell(state, sp.id))
    .map((sp) => {
      const known = knownBuff(state, sp.id);
      const buff = state.buffs.find((b) => b.id === sp.id);
      const auto = isAutoCast(state, sp.id);
      const status = buff
        ? `<span class="xp-text" id="buff-timer-${sp.id}">${formatDuration(buff.remaining)} left</span>`
        : '<span class="muted">not up</span>';
      return `<div class="upgrade-row">
        <div><b class="${vitalTextClass(known.effect)}">${esc(known.name)}</b> ${status}<div class="desc">${esc(known.desc)} · ${known.manaCost} mana</div></div>
        <div class="actions">
          <button class="btn" data-action="cast-spell" data-arg="${sp.id}" ${canCastBuffSpell(state, sp.id) ? '' : 'disabled'}>Cast</button>
          <button class="btn small${auto ? ' active' : ''}" data-action="toggle-autocast" data-arg="${sp.id}">Auto ${auto ? 'ON' : 'OFF'}</button>
        </div>
      </div>`;
    })
    .join('');

  const packRows = upkeepConsumables(state)
    .map((c) => {
      const left = charges(state, c.id);
      const buff = c.buff && state.buffs.find((b) => b.id === c.buff.id);
      const status = buff
        ? `<span class="xp-text" id="buff-timer-${buff.id}">${formatDuration(buff.remaining)} left</span>`
        : `<span class="muted">${left ? plural(left, 'charge') : 'none left'}</span>`;
      const held = buff && left ? `<span class="muted"> · ${plural(left, 'charge')}</span>` : '';
      const auto = isAutoDrink(state, c.id);
      // A drinkable can be kept up on its own; the kit has its own toggle above.
      const actions = c.buff
        ? `<button class="btn" data-action="use-consumable" data-arg="${c.id}" ${left ? '' : 'disabled'}>Use</button>
           <button class="btn small${auto ? ' active' : ''}" data-action="toggle-autodrink" data-arg="${c.id}">Auto ${auto ? 'ON' : 'OFF'}</button>`
        : '<span class="muted">Spent by auto-healing</span>';
      return `<div class="upgrade-row${left ? '' : ' spent'}">
        <div><b class="${c.buff ? vitalTextClass(c.buff.effect) : `rarity-${c.rarity}`}">${esc(c.name)}</b> ${status}${held}<div class="desc">${esc(c.desc)}${c.buff && !left && auto ? ' · Nothing left to drink.' : ''}</div></div>
        <div class="actions">${actions}</div>
      </div>`;
    })
    .join('');

  // Auto-heal stays listed once you've owned a kit — it's worth knowing the
  // feature exists — but it greys out with nothing to spend, and says so. The
  // one case it stays clickable without a kit is when it's already ON, so
  // running dry can't strand the setting in a state you can't switch off.
  const kitCharges = charges(state, 'healing-kit');
  const autoHealNote = kitCharges
    ? `Below half health, spends ${STAMINA_PER_HP} stamina and a kit charge per point of health.`
    : 'Needs a Healing Kit — nothing left to spend.';
  const autoHealRow = state.progress.autoHealUnlocked
    ? `<div class="upgrade-row${kitCharges ? '' : ' spent'}">
        <div><b>Auto-heal</b><div class="desc">${esc(autoHealNote)}</div></div>
        <button class="btn small${state.settings.autoHeal ? ' active' : ''}" data-action="toggle-autoheal" ${canAutoHeal(state) || state.settings.autoHeal ? '' : 'disabled'}>${state.settings.autoHeal ? 'ON' : 'OFF'}</button>
      </div>`
    : '';

  if (!spellRows && !packRows && !autoHealRow) return '';
  const running = state.buffs.length;
  const kit = charges(state, 'healing-kit');
  const summary = [
    running ? `${running} running` : 'nothing running',
    state.settings.autoHeal && kit ? 'auto-heal on' : null,
  ]
    .filter(Boolean)
    .join(' \u00b7 ');
  return section(
    state,
    'upkeep',
    'Upkeep',
    `${autoHealRow}
     ${spellRows}
     ${packRows}`,
    { summary, defaultOpen: false }
  );
}

// How a monster is announced. The level is appended only when there is one —
// roadside critters carry explicit stat blocks, and an early version of them had
// no level at all, which rendered a cheerful "Rabbit (Lv undefined)".
export function monsterLabel(monster) {
  if (!monster) return '';
  return monster.level == null ? monster.name : `${monster.name} (Lv ${monster.level})`;
}


// Shared monster/hero combat display used by both real POI fights and the tutorial
// road — `extraHtml` slots in anything extra (e.g. a Flee button during the tutorial).
// One row per engaged monster. The first is the one you're swinging at and gets
// the full-size bar and the fx target; the rest are shown small, because knowing
// how many are on you and roughly how hurt they are is the point.
function engagedMonstersHtml(state) {
  const monsters = state.monsters;
  if (!monsters.length) return `<div><b id="m-name">Searching...</b></div>`;

  return monsters
    .map((m, i) => {
      const pct = (m.hp / m.maxHp) * 100;
      const hp = `${Math.max(0, Math.ceil(m.hp))} / ${m.maxHp}`;
      if (i === 0) {
        return `<div class="monster-head">
            ${creatureArt(m.name, { className: `kind-${kindOf(m.name)}` })}
            <div class="monster-head-text">
              <div><b id="m-name">${esc(monsterLabel(m))}</b></div>
              ${bar('hp', pct, hp, 'm-hp', 'monster')}
              <div id="m-meta" class="muted">ATK ${m.atk} · DEF ${m.def} · ${esc(m.dmgType)}</div>
            </div>
          </div>`;
      }
      return `<div class="also-engaged">
        ${creatureArt(m.name, { className: `kind-${kindOf(m.name)} tiny` })}
        <span class="muted">${esc(monsterLabel(m))}</span>
        ${bar('hp mini', pct, hp, `m-hp-${i}`)}
      </div>`;
    })
    .join('');
}

function combatDisplayHtml(state, headerHtml, extraHtml = '') {
  const h = state.hero;
  const d = derivedStats(state);
  const xpProgress = state.progress.totalXpEarned - totalXpForLevel(h.level);
  const aw = activeWeaponSkill(state);
  const attackLine = aw.weaponName ? `Attacking with ${esc(aw.weaponName)}` : 'Fighting unarmed';
  const swarm = state.monsters.length > 1 ? `<div class="swarm-warning">Surrounded — ${state.monsters.length} on you.</div>` : '';
  return `
    <div class="panel">
      ${headerHtml}
      ${swarm}
      ${engagedMonstersHtml(state)}
      ${extraHtml}
      <h2 style="margin-top:14px">You — Level ${h.level}</h2>
      <div class="vitals-row">
        ${bar('hp', (h.hp / d.maxHp) * 100, h.dead ? 'Dead... reviving' : `${Math.ceil(h.hp)} / ${d.maxHp} HP`, 'h-hp', 'hero', { vitae: true })}
        ${bar('stamina', (h.stamina / d.maxStamina) * 100, `${Math.ceil(h.stamina)} / ${d.maxStamina} Stamina`, 'h-sta', null, { vitae: true })}
        ${bar('mana', (h.mana / d.maxMana) * 100, `${Math.ceil(h.mana)} / ${d.maxMana} Mana`, 'h-mana', null, { vitae: true })}
      </div>
      ${bar('xp', (xpProgress / xpForLevel(h.level)) * 100, `XP ${fmt(xpProgress)} / ${fmt(xpForLevel(h.level))}`, 'h-xp')}
      ${attackBarHtml(state, d)}
      <div id="h-attack-line" class="muted">${attackLine}, ${esc(aw.label)} (Rank ${aw.skill.rank}).</div>
      <div id="h-stats" class="muted">ATK ${d.atk} · DEF ${d.def} · SPD ${d.spd.toFixed(2)}/s · Crit ${d.critChance.toFixed(1)}% · ${fmt(state.pyreals)} pyreals</div>
    </div>`;
}

// --- Points of interest, banded by level ---

// What the walk will actually cost you, coloured against what it costs at rest.
// Athletics only ever shortens a walk today, so in practice this reads grey at
// rank 0 and green after — but the comparison is written both ways so that the
// first thing that slows you down (encumbrance, a curse, a heavy haul) turns
// these red without anyone having to remember this function exists.
function walkTimeHtml(state, baseSeconds) {
  const actual = modifiedWalkTime(baseSeconds, state.hero.skills.athletics.rank);
  const delta = actual - baseSeconds;
  const tone = Math.abs(delta) < 0.05 ? ' even' : delta < 0 ? ' faster' : ' slower';
  const title = `Base ${formatClock(baseSeconds)}${delta < -0.05 ? ` · Athletics saves ${formatClock(-delta)}` : ''}`;
  return `<span class="sub walk-time${tone}" title="${esc(title)}">Travel: ${formatClock(actual)}</span>`;
}

// The town, drawn as one more card at the head of every band.
//
// Going home used to be a sidebar button that read "-> Holtburg" while you were
// standing in Holtburg, and which — because of the guard in game/travel.js —
// did nothing at all when clicked from a POI. Making the town a card means
// leaving is the same gesture as arriving: same shape, same travel time in the
// same colour, same quest marker when the Town Hall wants something. It's
// pinned in every band so it's never more than a glance away, whichever
// hunting ground you happened to be looking at.
function townTileHtml(state, region, travel) {
  const here = !state.location.poiId && state.location.regionId === region.id && !travel;
  const travelling = travel && travel.kind === 'region' && travel.id === region.id;
  const cls = ['tile', 'poi-tile', 'town-card', here ? 'current' : '', travelling ? 'travelling' : ''].join(' ');

  // The walk home is the walk out: you're as far from the hub as the place you
  // went to is from it.
  const currentPoi = state.location.poiId ? getPoiById(state.location.poiId) : null;
  const backSeconds = currentPoi ? currentPoi.walkSeconds : 0;

  const when = travelling
    // Its own id: the Regions section draws a region-timer-<id> for the same
    // walk, and two elements sharing an id leaves one of them frozen.
    ? `<span class="travel-timer" id="town-timer-${region.id}">${formatDuration(travel.remaining)}</span>`
    : here
    ? '<span class="sub">here</span>'
    : walkTimeHtml(state, backSeconds);

  const shops = buildingsForRegion(region.id);
  const open = shops.filter((b) => (state.buildings[b.id] || {}).level > 0).length;
  const quest = shops.find((b) => buildingHasQuest(state, b.id));
  const marker = quest
    ? `<span class="quest-mark" title="${esc(`${quest.name}: ${buildingQuestText(state, quest.id)}`)}">!</span>`
    : '';

  return `<button class="${cls}" id="town-tile-${region.id}" title="Return to town" data-action="travel-region" data-arg="${region.id}">
    <span class="poi-name">&#127968; ${esc(region.name)} Town</span>
    <span class="poi-level">Hub</span>
    ${when}
    <span class="sub gather-note">${open} of ${shops.length} open</span>
    ${marker}
  </button>`;
}

// One hunting ground. Fixed-height so a band reads as a grid of equals rather
// than a ragged list — every tile carries the same four lines whether or not it
// has anything to say on them.
function poiTileHtml(state, poi, travel, tone) {
  const here = state.location.poiId === poi.id;
  const travelling = travel && travel.kind === 'poi' && travel.id === poi.id;
  const cls = ['tile', 'poi-tile', `tier-${tone}`, here ? 'current' : '', travelling ? 'travelling' : ''].join(' ');

  const when = travelling
    ? `<span class="travel-timer" id="poi-timer-${poi.id}">${formatDuration(travel.remaining)}</span>`
    : here
    ? '<span class="sub">here</span>'
    : walkTimeHtml(state, poi.walkSeconds);

  const material = poi.gather ? getMaterial(poi.gather.material) : null;
  const clears = state.progress.poiClears[poi.id] || 0;
  const yieldNote = material
    ? `<span class="sub gather-note">${esc(material.name)}${clears ? ` · ${fmt(clears)} clears` : ''}</span>`
    : isSite(poi)
    ? `<span class="sub gather-note">Sanctuary</span>`
    : '';

  const level = poiLevelLabel(poi);
  const levelBadge = level ? `<span class="poi-level">${level}</span>` : '<span class="poi-level muted">—</span>';

  // The marker sits in the same corner on every card, so "is there something to
  // do here" is one glance down a column rather than a read of each name.
  const quest = hasOpenQuest(state, poi.id)
    ? `<span class="quest-mark" title="${esc(poi.quest || 'Something here wants doing')}">!</span>`
    : '';

  return `<button class="${cls}" id="poi-tile-${poi.id}" title="Travel" data-action="travel-poi" data-arg="${poi.id}">
    <span class="poi-name">${esc(poiDisplayName(state, poi))}</span>
    ${levelBadge}
    ${when}
    ${yieldNote}
    ${quest}
  </button>`;
}

// The bands themselves. A region with one band shows its name rather than a row
// of one button, the same way a specialist shop skips its tab strip.
function poiTiersHtml(state, region, travel, jumpTargets) {
  const tiers = tiersForRegion(region);
  if (!tiers.length) return '<p class="muted">Nothing mapped here yet.</p>';

  // Default to wherever the hero actually is, so arriving somewhere doesn't
  // leave you looking at a band that doesn't contain you.
  const currentPoi = state.location.poiId ? getPoiById(state.location.poiId) : null;
  const homeTier = currentPoi ? (isSite(currentPoi) ? 'sites' : (tierForPoi(currentPoi) || {}).id) : null;
  const stored = state.ui.activePoiTier;
  // Sites lead when one of them is still asking for something — arriving in a
  // region should put the Lifestone that just claimed you in front of you, not
  // bury it behind a band of dungeons. Once it's restored, the hunting grounds
  // take the default back.
  const sitesWaiting = poisInTier(region, 'sites').some((p) => hasOpenQuest(state, p.id));
  const fallback = sitesWaiting && tiers.some((t) => t.id === 'sites')
    ? 'sites'
    : (tiers.find((t) => t.id !== 'sites') || tiers[0]).id;
  const active = tiers.some((t) => t.id === stored)
    ? stored
    : homeTier && tiers.some((t) => t.id === homeTier)
    ? homeTier
    : fallback;

  const strip =
    tiers.length > 1
      ? `<div class="filter-group tier-strip" style="margin-bottom:8px">${tiers
          .map((t) => {
            const count = poisInTier(region, t.id).length;
            return `<button class="btn small tier-btn tier-${t.tone}${t.id === active ? ' active' : ''}" data-action="set-poi-tier" data-arg="${t.id}">${t.label} <span class="muted">${count}</span></button>`;
          })
          .join('')}</div>`
      : `<div class="muted" style="margin-bottom:6px">${tiers[0].label}</div>`;

  const activeTone = (tiers.find((t) => t.id === active) || tiers[0]).tone;
  const townTile = townTileHtml(state, region, travel);
  const tiles = poisInTier(region, active)
    .map((poi) => {
      const tile = poiTileHtml(state, poi, travel, activeTone);
      const shortcut = jumpTargets.get(poi.id);
      // A shortcut sits beside the place it reaches, as a tile of the same size.
      const jump = shortcut
        ? `<button class="tile poi-tile jump-tile" title="${esc(shortcut.name)}" data-action="jump-shortcut" data-arg="${shortcut.id}" ${canJump(state) ? '' : 'disabled'}>
            <span class="poi-name">⚡ Jump</span>
            <span class="poi-level">${esc(poi.name)}</span>
            <span class="sub">${canJump(state) ? 'ready' : formatDuration(state.progress.jumpCooldown)}</span>
          </button>`
        : '';
      return tile + jump;
    })
    .join('');

  return `${strip}<div class="tile-list poi-grid">${townTile}${tiles}</div>`;
}

// --- Town buildings (rendered inside the Battle tab's Town panel) ---

// "1,200p · 8 metal (have 3)" — the parenthetical only appears when you're short.
// A cost names a KIND, so what it's really saying is "eight of anything metal",
// and the tooltip lists what you'd actually be spending.
function costHtml(state, cost) {
  const parts = [`${fmt(cost.pyreals)}p`];
  if (cost.materialKind) {
    const have = totalOfKind(state, cost.materialKind);
    const short = have < cost.materials ? ` (have ${fmt(have)})` : '';
    const held = heldOfKind(state, cost.materialKind);
    const title = held.length ? held.map((m) => `${m.count} ${m.name}`).join(', ') : `no ${cost.materialKind} yet`;
    parts.push(`<span title="${esc(title)}">${cost.materials} ${esc(cost.materialKind)}${short}</span>`);
  }
  return parts.join(' · ');
}

function stockHtml(state, buildingId, entry, filter = () => true) {
  const shown = entry.stock.map((item, i) => ({ item, i })).filter(({ item }) => filter(item));
  if (!shown.length) return '<p class="muted">Nothing of that sort on the shelves today.</p>';
  return shown
    .map(({ item, i }) => {
      const price = buyPrice(item);
      const spells = item.spells.map((sp) => sp.label).join(', ');
      return `<div class="item">
        <div class="name rarity-${item.rarity}"><span class="item-icon" title="${esc(slotLabel(item.slot))}">${itemIcon(item)}</span>${esc(item.name)}</div>
        <div class="stats">${itemStatLine(item)}${spells ? ' · ' + esc(spells) : ''}</div>
        <div class="actions"><button class="btn" data-action="buy-item" data-arg="${buildingId}:${i}" ${state.pyreals >= price ? '' : 'disabled'}>Buy — ${fmt(price)}p</button></div>
      </div>`;
    })
    .join('');
}

function sellHtml(state) {
  if (!state.inventory.length) return '<p class="muted">Nothing in your inventory to sell.</p>';
  return state.inventory
    .map(
      (item) => `<div class="item">
        <div class="name rarity-${item.rarity}">${esc(item.name)}</div>
        <div class="actions"><button class="btn" data-action="sell-item" data-arg="${item.id}">Sell — ${fmt(sellPrice(item))}p</button></div>
      </div>`
    )
    .join('');
}

// A shop's shelves, split by what you'd actually be looking for. A generalist
// carries all of it, which is exactly why it needs tabs; a specialist shows the
// one tab it has stock for and no chrome around it.
const SHOP_TABS = [
  { id: 'weapons', label: 'Weapons', has: (state, entry) => entry.stock.some((it) => it.slot === 'weapon') },
  { id: 'armor', label: 'Armor', has: (state, entry) => entry.stock.some((it) => it.slot !== 'weapon') },
  { id: 'consumables', label: 'Consumables', has: (state, entry) => entry.sells.length > 0 },
  { id: 'materials', label: 'Materials', has: (state, entry) => entry.exchange.length > 0 },
  { id: 'sell', label: 'Sell', has: (state) => state.inventory.length > 0 },
];

function consumablesHtml(state, buildingId, entry) {
  // Worth saying out loud that a shelf can be empty by chance, so an absent
  // potion reads as "come back later" rather than "this shop doesn't stock it".
  if (!entry.sells.length) return '<p class="muted">Nothing behind the counter today. Check back after the next delivery.</p>';
  return entry.sells
    .map(({ id, price }) => {
      const def = getConsumable(id);
      const held = charges(state, id);
      return `<div class="item">
        <div class="name rarity-${def.rarity}">${esc(def.name)}</div>
        <div class="stats">${esc(def.desc)}${held ? ` <span class="muted">· ${plural(held, 'charge')} in your pack</span>` : ''}</div>
        <div class="actions"><button class="btn" data-action="buy-consumable" data-arg="${buildingId}:${id}" ${state.pyreals >= price ? '' : 'disabled'}>Buy ${plural(def.startingCharges, 'charge')} — ${fmt(price)}p</button></div>
      </div>`;
    })
    .join('');
}

function exchangeHtml(state, buildingId, entry) {
  if (!entry.exchange.length) return '<p class="muted">No trade in raw goods here.</p>';
  const rows = entry.exchange
    .slice()
    .sort((a, b) => a.price - b.price)
    .map(({ materialId, price, stock }) => {
      const m = getMaterial(materialId);
      const held = state.materials[materialId] || 0;
      const kind = materialKind(materialId);
      const left = stock === undefined ? null : stock;
      const soldOut = left !== null && left <= 0;
      // The kind icon is the point of the row: investment asks for "8 metal", so
      // a material has to say what it counts as without a lookup elsewhere.
      return `<div class="upgrade-row${soldOut ? ' spent' : ''}">
        <div>
          <span class="kind-icon" title="${esc(kindLabel(kind))}">${materialIcon(materialId)}</span>
          <b>${esc(m ? m.name : materialId)}</b>
          <span class="muted">${esc(kindLabel(kind))} · ${fmt(held)} held</span>
          ${left !== null ? `<div class="desc">${soldOut ? 'Sold out until the next delivery.' : `${fmt(left)} in stock`}</div>` : ''}
        </div>
        <button class="btn small" data-action="buy-material" data-arg="${buildingId}:${materialId}" ${state.pyreals >= price && !soldOut ? '' : 'disabled'}>${fmt(price)}p each</button>
      </div>`;
    })
    .join('');
  return `<p class="muted" style="margin-bottom:6px">What came in on the last cart. Rates and stock both turn over with the shelves.</p>${rows}`;
}

function shopTabsHtml(state, buildingId, entry) {
  const available = SHOP_TABS.filter((t) => t.has(state, entry));
  if (!available.length) return '';
  const active = available.some((t) => t.id === state.ui.activeShopTab)
    ? state.ui.activeShopTab
    : available[0].id;

  const buttons =
    available.length > 1
      ? `<div class="filter-group" style="margin:10px 0 6px">${available
          .map((t) => `<button class="btn small${t.id === active ? ' active' : ''}" data-action="set-shop-tab" data-arg="${t.id}">${t.label}</button>`)
          .join('')}</div>`
      : `<div class="muted" style="margin:10px 0 4px">${available[0].label}</div>`;

  let body;
  if (active === 'weapons') body = stockHtml(state, buildingId, entry, (it) => it.slot === 'weapon');
  else if (active === 'armor') body = stockHtml(state, buildingId, entry, (it) => it.slot !== 'weapon');
  else if (active === 'consumables') body = consumablesHtml(state, buildingId, entry);
  else if (active === 'materials') body = exchangeHtml(state, buildingId, entry);
  else body = sellHtml(state);

  return buttons + body;
}

function buildingPanelHtml(state) {
  const buildingId = state.ui.activeBuilding;
  if (!buildingId) return '';
  const building = getBuilding(buildingId);
  const entry = building && state.buildings[buildingId];
  if (!entry) return '';

  const head = `<div class="shop-panel-head"><b>${esc(building.name)}</b><button class="btn" data-action="close-building">Close</button></div>
    <p class="muted">${esc(building.blurb)}</p>`;

  if (entry.level === 0) {
    const cost = unlockCost(building, state);
    const perk = perkText(building, 1);
    if (!cost) {
      return `<div class="shop-panel">${head}
        <p class="muted" style="margin-top:8px">Not open to you yet. The Town Hall decides who trades here.</p>
      </div>`;
    }
    const opening = building.stock ? 'Stocks gear that turns over on its own clock.' : null;
    return `<div class="shop-panel">${head}
      <div class="muted" style="margin:8px 0 4px">Closed. ${esc([perk && `Opening it grants ${perk}.`, opening].filter(Boolean).join(' '))}</div>
      <button class="btn primary" data-action="invest-open" data-arg="${buildingId}" ${canAfford(state, cost) ? '' : 'disabled'}>Invest to open — ${costHtml(state, cost)}</button>
    </div>`;
  }

  const perk = perkText(building, entry.level);
  const next = upgradeCost(building, entry.level, state);
  const nextPerk = perkText(building, entry.level + 1);
  const rotationLine = building.stock || building.sells
    ? `<div class="muted">Shelves turn over in <span id="rotation-timer">${formatDuration(rotationRemaining(state, buildingId))}</span>.</div>`
    : '';
  const investLine = next
    ? `<div class="upgrade-row">
        <div><b>Invest in the business</b><div class="desc">${esc([nextPerk, building.stock ? 'more stock, better stock, sooner' : null].filter(Boolean).join(' \u00b7 ')) || 'Grows the business'}</div></div>
        <button class="btn" data-action="invest-building" data-arg="${buildingId}" ${canAfford(state, next) ? '' : 'disabled'}>${costHtml(state, next)}</button>
      </div>`
    : `<p class="muted">Grown as far as it goes.</p>`;

  let service = '';
  if (building.service === 'heal') {
    const cost = healCost(state);
    service = `<div class="muted" style="margin:10px 0 4px">Services</div>
      <button class="btn primary" data-action="heal-service" ${cost > 0 && state.pyreals >= cost ? '' : 'disabled'}>Heal to full — ${fmt(cost)}p</button>`;
  } else if (building.service === 'tour' && !state.progress.tookTownTour) {
    service = `<div class="upgrade-row">
        <div><b>Ask how the town works</b><div class="desc">The clerk has time for you, and the General Store won't trade with a stranger.</div></div>
        <button class="btn primary" data-action="take-tour" data-arg="${buildingId}">Take the tour</button>
      </div>`;
  }

  return `<div class="shop-panel">${head}
    <div class="muted" style="margin:6px 0 2px">Level ${entry.level}/${MAX_BUILDING_LEVEL}${perk ? ` — ${esc(perk)}` : ''}</div>
    ${rotationLine}
    ${investLine}
    ${service}
    ${shopTabsHtml(state, buildingId, entry)}
  </div>`;
}

// --- Sites (POIs you visit for something other than a fight) ---

// Just the vitals. Only the Lifestone site draws these on their own — everywhere
// else they live in the combat panel. Recovery needs no control: regen runs
// wherever you are, so standing at the stone is itself how you refill for the
// next offering.
function restHtml(state) {
  const d = derivedStats(state);
  const h = state.hero;
  return `
    <div class="vitals-row">
      ${bar('hp', (h.hp / d.maxHp) * 100, `${Math.ceil(h.hp)} / ${d.maxHp} HP`, 'h-hp', 'hero', { vitae: true })}
      ${bar('stamina', (h.stamina / d.maxStamina) * 100, `${Math.ceil(h.stamina)} / ${d.maxStamina} Stamina`, 'h-sta', null, { vitae: true })}
      ${bar('mana', (h.mana / d.maxMana) * 100, `${Math.ceil(h.mana)} / ${d.maxMana} Mana`, 'h-mana', null, { vitae: true })}
    </div>`;
}

function lifestoneSiteHtml(state, poi) {
  const growth = lifestoneGrowth(state, poi.id);
  const grown = isGrown(state, poi.id);
  const cost = offeringCost(state);

  const region = getRegion(poi.regionId);
  const story = grown
    ? `<p>The stone stands waist-high now, steady, its light breathing slow and blue. It knows you. Wherever you go from here, some small part of you keeps facing this way — and when you die, that's the thread you'll follow back.</p>`
    : `<p>Something is trying to be a <span class="lifestone-glow">Lifestone</span> here. It's the size of your fist and the colour of a held breath, and its light comes and goes like it can't quite remember how. Stand close and you can feel it reaching — not for blood, exactly. For someone to have been here.</p>
       <p style="margin-top:8px">Give it that, and it grows. What it takes isn't health or mana; it's <b>${VITAE_PER_STACK}% of you</b>, the way dying takes it — you'll walk out of here a little less than you walked in, and only living will earn it back. It will thicken on its own too, if you'd rather wait.</p>`;

  const maxed = atMaxVitae(state);
  const action = grown
    ? `<p class="muted" style="margin-top:8px">This is your Lifestone now — die anywhere and you'll wake at ${esc(region.name)}.</p>`
    : `<div class="actions" style="margin-top:8px">
        <button class="btn primary" data-action="sacrifice-vitae" data-arg="${poi.id}" ${canSacrificeVitae(state, poi.id) ? '' : 'disabled'}>Sacrifice Vitae — +${cost.vitaePct}% vitae</button>
        ${maxed ? `<span class="muted">There's nothing left of you to give at ${MAX_VITAE_PCT}% vitae.</span>` : ''}
      </div>`;

  return `<div class="panel intro-panel">
    <h2>${esc(poi.name)}</h2>
    ${story}
    ${bar('mana', (growth / LIFESTONE_GROWTH_REQUIRED) * 100, grown ? 'Fully grown' : `Grown ${growth}%`, 'lifestone-growth')}
    ${action}
    <h2 style="margin-top:14px">You — Level ${state.hero.level}</h2>
    ${restHtml(state)}
  </div>`;
}

function siteHtml(state, poi) {
  if (poi.site === 'lifestone') return lifestoneSiteHtml(state, poi);
  return `<div class="panel"><h2>${esc(poi.name)}</h2><p class="muted">There's nothing to do here yet.</p></div>`;
}

// The one-line status under a POI's name: which wave you're on, how much harder
// it's making the monsters, and what a full clear will pay out. Exported because
// the renderer patches it in place every frame — waves advance mid-fight, and the
// header isn't rebuilt for that (see ui/render.js updateLive).
export function waveLine(state, poi) {
  const p = state.progress;
  const material = poi.gather ? getMaterial(poi.gather.material) : null;
  const parts = [`Wave ${p.wave}/${WAVES_PER_POI}`, `+${Math.round(waveDifficulty(p.wave) * 100)}% difficulty`];
  if (material) parts.push(`clear for ${clearYield(state, poi.gather.skill)} ${material.name}`);
  return parts.join(' · ');
}

// --- Battle ---
export function battleTab(state) {
  if (state.onboarding.step !== 'done') return onboardingHtml(state);

  const p = state.progress;
  const travel = state.travel;

  if (travel && travel.tutorial) {
    const header = `<h2>The Road to Holtburg <span class="muted" style="font-size:0.7em"><span id="travel-remaining">${formatDuration(travel.remaining)}</span> remaining</span></h2>
      <p class="muted" style="margin-bottom:8px">You're unarmed and alone out here. Fight if you must, or try to slip past.</p>`;
    const fleeBtn = state.monsters.length ? `<div class="actions" style="margin:8px 0"><button class="btn" data-action="flee-tutorial">Flee</button></div>` : '';
    return `
      ${combatDisplayHtml(state, header, fleeBtn)}
      ${upkeepHtml(state)}
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
  let townSection = '';
  if (state.location.regionId) {
    const region = getRegion(state.location.regionId);
    const jumpTargets = new Map();
    if (!travel) {
      for (const s of availableShortcutsFrom(state)) {
        const destId = s.from === state.location.poiId ? s.to : s.from;
        jumpTargets.set(destId, s);
      }
    }
    const here = state.location.poiId ? getPoiById(state.location.poiId) : null;
    poiSection = section(
      state,
      'pois',
      `${esc(region.name)} &gt; Points of Interest`,
      `${here ? '' : '<p class="muted" style="margin-bottom:6px">Pick a point of interest to start hunting.</p>'}${poiTiersHtml(state, region, travel, jumpTargets)}`,
      { summary: here ? `at ${here.name}` : 'in town' }
    );

    if (!state.location.poiId) {
      const buildingTiles = buildingsForRegion(region.id)
        .map((building) => {
          const entry = state.buildings[building.id] || { level: 0 };
          const locked = entry.level === 0;
          const cls = ['tile', 'shop-tile', locked ? 'locked' : '', state.ui.activeBuilding === building.id ? 'current' : ''].join(' ');
          // A business with no price isn't for sale — the Town Hall decides when it
          // opens — so it says so rather than quoting a figure that doesn't exist.
          const cost = locked ? unlockCost(building, state) : null;
          const sub = !locked
            ? `<span class="sub">Level ${entry.level}</span>`
            : cost
            ? `<span class="sub">Invest ${fmt(cost.pyreals)}p</span>`
            : `<span class="sub">Not open yet</span>`;
          const quest = buildingHasQuest(state, building.id)
            ? `<span class="quest-mark" title="${esc(buildingQuestText(state, building.id))}">!</span>`
            : '';
          return `<button class="${cls}" data-action="open-building" data-arg="${building.id}">${esc(building.name)}${sub}${quest}</button>`;
        })
        .join('');
      const open = buildingsForRegion(region.id).filter((b) => (state.buildings[b.id] || {}).level > 0).length;
      const total = buildingsForRegion(region.id).length;
      townSection = section(
        state,
        'town',
        `Town — ${esc(region.name)}`,
        `<div class="tile-list">${buildingTiles}</div>${buildingPanelHtml(state)}`,
        { summary: `${open} of ${total} open for business` }
      );
    }
  }

  let combatPanel = '';
  if (travel) {
    const label = travel.kind === 'region' ? getRegion(travel.id).name : getPoiById(travel.id).name;
    combatPanel = `<div class="panel"><h2>On the Road</h2>
      <p class="muted">Walking to ${esc(label)}... <span id="travel-remaining">${formatDuration(travel.remaining)}</span> remaining.</p></div>`;
  } else if (!state.location.poiId) {
    // Standing in town needs no panel of its own — the Town section is right
    // there, and the Points of Interest list carries the nudge to go fight.
    combatPanel = '';
  } else {
    const poi = getPoiById(state.location.poiId);
    if (isSite(poi)) {
      combatPanel = siteHtml(state, poi);
    } else {
      const header = `<h2>${esc(poi.name)} <span class="muted" id="poi-wave-line" style="font-size:0.7em">${esc(waveLine(state, poi))}</span></h2>`;
      combatPanel = combatDisplayHtml(state, header);
    }
  }

  // The fight itself is never foldable -- it's the thing you came to watch.
  // Everything around it is travel and housekeeping, and starts folded once
  // you're somewhere, so the default view is the fight and the log.
  const away = !!state.location.poiId;
  const regionSummary = state.location.regionId
    ? getRegion(state.location.regionId).name
    : travel
    ? 'on the road'
    : 'nowhere yet';

  return `
    ${section(state, 'regions', 'Regions', `<div class="tile-list">${regionTiles}</div>`, {
      summary: regionSummary,
      defaultOpen: !state.location.regionId,
    })}
    ${poiSection}
    ${townSection}
    ${combatPanel}
    ${upkeepHtml(state)}
    ${section(state, 'log', 'Combat Log', `<div class="log" id="combat-log">${logHtml(state)}</div>`)}`;
}

// --- Hero / Attributes ---
// The vitae banner: what it's costing you and what it takes to shed it. Only
// rendered when you're actually carrying some.
function vitaeHtml(state) {
  const pct = vitaePct(state);
  if (pct <= 0) return '';
  const v = state.hero.vitae;
  const need = xpToClearStack(state.hero.level);
  const done = Math.max(0, need - v.xpRemaining);
  return `<div class="panel">
    <h2>Vitae — ${pct}%</h2>
    <p class="muted">Death and sacrifice both leave their mark. Everything your body does is ${pct}% weaker until you earn it back${pct >= MAX_VITAE_PCT ? ' — and you are carrying all of it there is' : ''}.</p>
    ${bar('hp', (done / need) * 100, `${fmt(done)} / ${fmt(need)} XP toward shedding 5%`)}
  </div>`;
}

export function attributesTab(state) {
  const h = state.hero;
  const d = derivedStats(state);
  const progress = state.progress.totalXpEarned - totalXpForLevel(h.level);

  const attrRows = ATTRIBUTES.map((a) => {
    const need = xpToNextAttrPoint(h[a.id]);
    return `<div class="skill-row">
      <div class="skill-head"><b>${a.short}</b> <span class="muted">${h[a.id]}</span></div>
      ${bar('xp', (h.attrXp[a.id] / need) * 100, `XP ${fmt(h.attrXp[a.id])} / ${fmt(need)}`)}
      <p class="muted" style="margin-top:2px">${a.desc}</p>
    </div>`;
  }).join('');

  const earned = ACHIEVEMENTS.filter((a) => state.achievements.includes(a.id));
  const achievementPanel = earned.length
    ? `<div class="panel"><h2>Achievements</h2>${earned
        .map((a) => `<div class="upgrade-row"><div><b>★ ${esc(a.name)}</b><div class="desc">${esc(a.desc)}</div></div><span class="gold">${esc(a.reward)}</span></div>`)
        .join('')}</div>`
    : '';

  return `
    <div class="panel">
      <h2>Level ${h.level}</h2>
      ${bar('xp', (progress / xpForLevel(h.level)) * 100, `XP to level ${h.level + 1}: ${fmt(progress)} / ${fmt(xpForLevel(h.level))}`)}
    </div>
    ${vitaeHtml(state)}
    ${achievementPanel}
    <div class="panel"><h2>Attributes</h2>${attrRows}</div>
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
  const athletics = skills.athletics;
  const speedPct = Math.round(100 - (100 * 100) / (100 + athletics.rank * 9));
  const hasShield = !!state.equipment.shield;
  const weapon = state.equipment.weapon;
  const hasMeleeWeapon = !!(weapon && ['sword', 'spear', 'axe', 'mace'].includes(weapon.baseType));

  const defensiveRows = [
    ['Dodge', skills.dodge, true, ''],
    ['Block', skills.block, hasShield, 'needs a shield equipped'],
    ['Parry', skills.parry, hasMeleeWeapon, 'needs a melee weapon equipped'],
  ]
    .map(([name, skill, eligible, hint]) => {
      const chance = `${defensiveChance(skill.rank).toFixed(1)}% avoid${eligible ? '' : ` (inactive — ${hint})`}`;
      return skillRow(name, skill, chance);
    })
    .join('') + skillRow('Magic Resistance', skills.magicResistance, `${defensiveChance(skills.magicResistance.rank).toFixed(1)}% avoid (only vs. magic-based attacks)`);

  const resistRows = DAMAGE_TYPES.map((t) => {
    const skill = skills.resistance[t];
    const label = t[0].toUpperCase() + t.slice(1);
    return skillRow(label, skill, `${resistanceMitigationPct(skill.rank).toFixed(1)}% less damage taken`);
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

  const gatherRows = GATHERING_SKILLS.map((g) => {
    const rank = skills.gathering[g.key].rank;
    const next = nextMilestone(rank);
    const note = `${gatherMultiplier(rank).toFixed(2)}x haul${next ? ` · next milestone at ${next.rank}` : ' · fully mastered'}`;
    return skillRow(g.label, skills.gathering[g.key], note);
  }).join('');

  // Every skill in the game on one scroll was several screens tall. Split by what
  // you'd have come here to look at; the group you're reading is the only one
  // drawn, so the page is always about a screen.
  const groups = [
    {
      id: 'offense',
      label: 'Offense',
      body: `<div class="panel"><p class="muted">Whichever weapon you have equipped (or bare fists) trains its own skill and governs how often your attacks connect, from even odds untrained up to 95% at rank 100.</p></div>${offenseSections}`,
    },
    {
      id: 'defense',
      label: 'Defense',
      body: `<div class="panel">
          <h2>Defensives</h2>
          <p class="muted" style="margin-bottom:8px">Each defends against any attack in sequence — Dodge, then Block (shield required), then Parry (melee weapon required). Each only trains while its gear requirement is met; an avoided hit costs Stamina, capping out at 95% avoidance at rank 100.</p>
          ${defensiveRows}
        </div>
        <div class="panel">
          <h2>Mitigation — by damage type</h2>
          <p class="muted" style="margin-bottom:8px">Doesn't avoid a hit — reduces its damage, once Dodge/Block/Parry have already failed. Trains on every hit of its type that connects, capping at 95% mitigation at rank 100.</p>
          ${resistRows}
        </div>`,
    },
    {
      id: 'gathering',
      label: 'Gathering',
      body: `<div class="panel"><h2>Gathering</h2>
          <p class="muted" style="margin-bottom:8px">Trained by fully clearing a point of interest. Rank raises how much a clear yields, with a bigger step at every milestone.</p>
          ${gatherRows}
        </div>`,
    },
    {
      id: 'crafting',
      label: 'Crafting',
      body: `<div class="panel">
          ${skillRow('Tinkering', skills.tinkering)}
          <p class="muted" style="margin-top:4px">Consumes materials to add or boost an affix on equipped gear. See the Tinkering tab.</p>
          ${skillRow('Salvaging', skills.salvaging, `about ${expectedSalvageYield('Common', skills.salvaging.rank).toFixed(1)}x from a Common item`)}
          <p class="muted" style="margin-top:4px">Breaking gear down returns its material. Each rank compounds the haul, so the same drop is worth far more to a trained salvager.</p>
        </div>`,
    },
    {
      id: 'general',
      label: 'General',
      body: `<div class="panel">
          ${skillRow('Athletics', athletics, `${speedPct}% faster travel · ${formatDuration(jumpCooldownSeconds(athletics.rank))} Jump cooldown`)}
          <p class="muted" style="margin-top:4px">Trained by walking (and by using Jump). Powers travel speed and shortcut Jumps.</p>
        </div>`,
    },
  ];

  const active = groups.some((g) => g.id === state.ui.activeSkillTab) ? state.ui.activeSkillTab : groups[0].id;
  const strip = groups
    .map((g) => `<button class="btn small${g.id === active ? ' active' : ''}" data-action="set-skill-tab" data-arg="${g.id}">${g.label}</button>`)
    .join('');

  return `<div class="filter-group" style="margin-bottom:10px">${strip}</div>
    ${groups.find((g) => g.id === active).body}`;
}

// --- Tinkering ---
// Rending gems: boss loot, one per damage type, worked into a weapon that can
// actually deal that damage. Listed with the reason a gem won't go in, because
// "why is this greyed out" is the whole question at this panel.
function rendingPanelHtml(state) {
  const weapon = state.equipment.weapon;
  const held = RENDING_MATERIALS.filter((m) => (state.materials[m.id] || 0) > 0);
  const current = weapon && weapon.imbue
    ? `<p class="muted" style="margin-bottom:8px">${esc(weapon.name)} — <b>${esc(rendingName(weapon.imbue.damageType, weapon.imbue.level))}</b> (+${Math.round(weapon.imbue.level * RENDING_PER_LEVEL * 100)}% ${esc(damageLabel(weapon.imbue.damageType))} damage).</p>`
    : '';

  if (!held.length) {
    return `<div class="panel"><h2>Rending</h2>
      ${current}
      <p class="muted">No rending gems yet. They come off the deepest thing in a dungeon — clear a place out and one turns up now and then.</p>
    </div>`;
  }

  const rows = held
    .map((m) => {
      const type = gemDamageType(m.id);
      const refusal = rendingRefusal(state, m.id);
      const count = state.materials[m.id];
      return `<div class="upgrade-row${refusal ? ' spent' : ''}">
        <div>
          <b class="el-${type}">${esc(m.name)}</b> <span class="muted">${fmt(count)}</span>
          <div class="desc">${esc(damageLabel(type))} Rending — +${Math.round(RENDING_PER_LEVEL * 100)}% ${esc(damageLabel(type))} damage per level${refusal ? ` · ${esc(refusal)}` : ''}</div>
        </div>
        <button class="btn" data-action="apply-rending" data-arg="${m.id}" ${refusal ? 'disabled' : ''}>Work in</button>
      </div>`;
    })
    .join('');

  return `<div class="panel"><h2>Rending</h2>
    ${current}
    <p class="muted" style="margin-bottom:8px">A gem only goes into a weapon that already deals its damage — a mace has nothing for acid to bite on. A weapon holds one rending; another of the same gem deepens it, to ${MAX_RENDING_LEVEL}.</p>
    ${rows}
  </div>`;
}

export function tinkeringTab(state) {
  const heldMaterials = Object.entries(state.materials)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => {
      const m = getMaterial(id);
      return `<div class="stat-row"><span class="k">${esc(m ? m.name : id)}</span><span class="v">${count}</span></div>`;
    })
    .join('');

  const slotRows = EQUIP_SLOTS
    .map((slot) => {
      const item = state.equipment[slot];
      if (!item) return '';
      // A weapon only takes what its class has a use for; everything else takes
      // anything of a matching category (see game/tinkering.js tinkerEffectFor).
      const usable = materialsForSlot(slot)
        .concat(slot === 'weapon' ? MATERIALS.filter((m) => !materialsForSlot(slot).includes(m)) : [])
        .filter((m) => tinkerEffectFor(state, slot, m.id));
      const affordable = usable.filter((m) => canTinker(state, slot, m.id));
      const cls = slotKind(slot) === 'weapon' ? weaponClass(item.baseType) : null;
      const teaches = (m) => {
        const effect = tinkerEffectFor(state, slot, m.id);
        const label = effect && effect !== 'any' ? ` — ${SPELL_ID_LABELS[effect] || effect}` : '';
        return `${label} · costs ${tinkerCostFor(state, slot, m.id)}`;
      };
      const body = affordable.length
        ? `<select class="text-input" id="tinker-material-${slot}">${affordable
            .map((m) => `<option value="${m.id}">${esc(m.name)} (${state.materials[m.id]})${esc(teaches(m))}</option>`)
            .join('')}</select>
           <button class="btn" data-action="apply-tinker" data-arg="${slot}">Apply</button>`
        : `<span class="muted">Nothing to work in yet — needs ${usable.length ? usable.map((m) => `${tinkerCostFor(state, slot, m.id)} ${esc(m.name)}`).join(' / ') : `${TINKER_BASE_COST}+ of a matching material`}</span>`;
      return `<div class="upgrade-row">
        <div><b>${esc(item.name)}</b> <span class="muted">[${cls ? `${cls} weapon` : esc(slotLabel(slot))}]</span></div>
        <div class="actions">${body}</div>
      </div>`;
    })
    .join('');

  // The recipe table, so you know which dungeon to go farm before you go.
  const recipeRows = Object.entries(TINKER_RECIPES)
    .map(
      ([cls, recipes]) => `<div class="upgrade-row">
        <div><b>${cap(cls)} weapons</b><div class="desc">${Object.entries(recipes)
          .map(([id, effect]) => `${esc(getMaterial(id) ? getMaterial(id).name : id)} → ${esc(SPELL_ID_LABELS[effect] || effect)}`)
          .join(' · ')}</div></div>
      </div>`
    )
    .join('');

  return `
    <div class="panel">
      <h2>Tinkering</h2>
      <p class="muted">Works a material into an equipped item. No risk and no workmanship roll — but a weapon only takes what its kind has a use for, and each material always teaches the same thing.</p>
      <p class="muted" style="margin-top:6px">Deepening a property costs more every time: ${[0, 1, 2, 3, 4, 5]
        .map((lvl) => tinkerCostAtLevel(lvl))
        .join(' → ')} → … The same materials raise your town's buildings, so past the first few passes it's a choice.</p>
    </div>
    <div class="panel"><h2>Equipped Gear</h2>${slotRows || '<p class="muted">Nothing equipped yet.</p>'}</div>
    ${rendingPanelHtml(state)}
    <div class="panel"><h2>Weapon Recipes</h2>${recipeRows}</div>
    <div class="panel"><h2>Materials</h2>${heldMaterials || '<p class="muted">None gathered or salvaged yet.</p>'}</div>`;
}

// --- Inventory ---
const SPELL_ID_LABELS = {
  armor: 'Aegis (Armor)',
  flatDamage: 'Brutality (+ATK)',
  atkPct: 'Fury (+% ATK)',
  defensiveBoost: 'Defensive Boost',
  pyrealsPct: 'Fortune (+% Pyreals)',
  xpPct: 'Wisdom (+% XP)',
  maxManaFlat: 'Clarity (+Max Mana)',
  weaponDamage: 'Keenness (+ATK)',
  magicDamage: 'Channeling (+Magic ATK)',
  hitChance: 'Accuracy (+% to hit)',
  attackSpeed: 'Alacrity (faster attacks)',
  spellEfficiency: 'Frugality (cheaper casts)',
  minDamage: 'Tempering (higher minimum hit)',
  evasion: 'Evasion (+% Dodge)',
  guard: 'Guard (+% Dodge/Block/Parry)',
};

function filterBtn(key, value, label, current) {
  return `<button class="btn small${current === value ? ' active' : ''}" data-action="set-inventory-filter" data-arg="${key}:${value}">${esc(label)}</button>`;
}

// What a piece of gear does, in the terms its own kind is measured in. One
// place, so a shop shelf, an inventory row and a detail panel never disagree.
export function itemStatLine(item) {
  const damage = itemDamage(item);
  if (damage) return `${damage.min}–${damage.max} damage`;
  const armour = itemArmour(item);
  if (armour) return `${armour} armour`;
  return item.spells && item.spells.length ? 'enchantment only' : 'no innate stats';
}

function itemHtml(state, item, equipped) {
  const spells = item.spells.map((s) => s.label).join(', ');
  const base = itemStatLine(item);
  let cmp = '';
  if (!equipped) {
    const cur = state.equipment[item.slot];
    const diff = itemScore(item) - itemScore(cur);
    cmp = cur ? (diff >= 0 ? `<span class="equip-better">▲ +${diff.toFixed(0)}</span>` : `<span class="equip-worse">▼ ${diff.toFixed(0)}</span>`) : '<span class="equip-better">▲ new slot</span>';
  }
  const action = equipped
    ? ''
    : `<div class="actions">
        <button class="btn" data-action="equip" data-arg="${item.id}">Equip</button>
        <button class="btn" data-action="salvage-item" data-arg="${item.id}">Salvage</button>
      </div>`;
  // The icon says what it is and the colour says how good it is, so "[Rare ring]"
  // was the same two facts written out a second time.
  return `<div class="item">
    <div class="name rarity-${item.rarity}"><span class="item-icon" title="${esc(slotLabel(item.slot))}">${itemIcon(item)}</span>${esc(item.name)} ${cmp}</div>
    <div class="stats">${base}${spells ? ' · ' + esc(spells) : ''}</div>
    ${action}</div>`;
}

// A gear slot: the icon carries the item type, the frame's color carries rarity,
// and the corner number carries power. Clicking one selects it; the full stat
// block lives in a single detail panel below rather than repeated in every cell.
function slotCellHtml(state, { item, slot, equipped = false, selected = false, empty = false }) {
  const classes = ['slot', empty ? 'empty' : `rarity-${item.rarity}`, equipped ? 'equipped' : '', selected ? 'selected' : ''];
  if (empty) {
    const icon = slot ? slotIcon(slot) : '';
    return `<div class="${classes.join(' ')}"><span class="slot-icon">${icon}</span></div>`;
  }
  const title = `${item.name} — ${item.rarity} ${slotLabel(item.slot)}, ${itemStatLine(item)}`;
  const damage = itemDamage(item);
  const corner = damage ? damage.max : itemArmour(item) || item.spells.length || '';
  return `<button class="${classes.join(' ')}" title="${esc(title)}" data-action="select-item" data-arg="${item.id}">
    <span class="slot-icon">${itemIcon(item)}</span>
    <span class="slot-power">${corner}</span>
  </button>`;
}

// The paper doll: one labelled cell per equipment slot, filled or not.
function equippedGridHtml(state) {
  const slots = [...STARTING_SLOTS, ...AETHERIA_SLOTS.slice(0, state.progress.aetheriaSlots)];
  return slots
    .map((slot) => {
      const item = state.equipment[slot];
      const label = slot.startsWith('aetheria') ? `Aetheria ${slot.slice(-1)}` : slotLabel(slot);
      const cell = item
        ? slotCellHtml(state, { item, equipped: true, selected: state.ui.selectedItemId === item.id })
        : slotCellHtml(state, { slot, empty: true });
      return `<div class="doll-slot">${cell}<div class="slot-name">${esc(label)}</div></div>`;
    })
    .join('');
}

// Pads the loot grid out to full rows of empty frames so it reads as an
// inventory rather than a ragged handful of tiles.
const MIN_INVENTORY_CELLS = 24;
const INVENTORY_ROW = 8;

function inventoryGridHtml(state, items) {
  const cells = items.map((item) =>
    slotCellHtml(state, { item, selected: state.ui.selectedItemId === item.id })
  );
  const target = Math.max(MIN_INVENTORY_CELLS, Math.ceil(cells.length / INVENTORY_ROW) * INVENTORY_ROW);
  while (cells.length < target) cells.push(slotCellHtml(state, { empty: true }));
  return `<div class="slot-grid">${cells.join('')}</div>`;
}

// Full stats for whichever slot is selected, plus its actions. Selecting an
// equipped item shows it without Equip/Salvage, same as the old inline card.
function selectedItemHtml(state) {
  const id = state.ui.selectedItemId;
  if (!id) return '<p class="muted">Select an item to see what it does.</p>';
  const equipped = Object.values(state.equipment).find((it) => it && it.id === id);
  const item = equipped || state.inventory.find((it) => it.id === id);
  if (!item) return '<p class="muted">Select an item to see what it does.</p>';
  return itemHtml(state, item, !!equipped);
}

// Breaking down a bagful, and deciding what never makes it into the bag.
//
// "Salvage shown" rather than "salvage all" on purpose: the filters above are
// already how you say what you mean, so the destructive button obeys them
// instead of being a second, separate way to choose. With no filters set it IS
// salvage-all, and it says how many it's about to take either way.
function salvageControlsHtml(state, filtered) {
  const breakable = filtered.filter((it) => it.material);
  const rank = state.hero.skills.salvaging.rank;
  const setting = state.settings.autoSalvage || AUTO_SALVAGE_OFF;
  const options = [AUTO_SALVAGE_OFF, ...RARITIES.map((r) => r.name)];
  const label = (v) => (v === AUTO_SALVAGE_OFF ? 'Auto-salvage: OFF' : `Auto-salvage: ${v} and below`);

  const cycle = options[(options.indexOf(setting) + 1) % options.length];
  return `
    <button class="btn" data-action="salvage-shown" ${breakable.length ? '' : 'disabled'} title="Each item is broken down in turn, so Salvaging ranks up partway through the pile and the last of it is worth more than the first.">
      Salvage ${filtered.length === state.inventory.length ? 'all' : 'shown'}${breakable.length ? ` (${breakable.length})` : ''}
    </button>
    <button class="btn${setting === AUTO_SALVAGE_OFF ? '' : ' active'}" data-action="cycle-auto-salvage" data-arg="${cycle}" title="Drops at or below this rarity are broken down as they land. Never touches anything auto-equip wanted.">
      ${esc(label(setting))}
    </button>
    <span class="muted" style="align-self:center">Salvaging ${rank} · about ${expectedSalvageYield('Common', rank).toFixed(1)}x a Common</span>`;
}

export function inventoryTab(state) {
  const filter = state.ui.inventoryFilter;
  const filtered = state.inventory.filter((it) => {
    if (filter.slot !== 'all' && it.slot !== filter.slot) return false;
    if (filter.rarity !== 'all' && it.rarity !== filter.rarity) return false;
    if (filter.spellId !== 'all' && !it.spells.some((sp) => sp.id === filter.spellId)) return false;
    return true;
  });

  const presentSpellIds = [...new Set(state.inventory.flatMap((it) => it.spells.map((sp) => sp.id)))];
  const filterRowHtml = `<div class="filter-row">
    <div class="filter-group">${['all', ...SLOTS].map((sl) => filterBtn('slot', sl, sl === 'all' ? 'All slots' : slotLabel(sl), filter.slot)).join('')}</div>
    <div class="filter-group">${['all', ...RARITIES.map((r) => r.name)].map((r) => filterBtn('rarity', r, r === 'all' ? 'All rarities' : r, filter.rarity)).join('')}</div>
    ${presentSpellIds.length ? `<div class="filter-group">${['all', ...presentSpellIds].map((id) => filterBtn('spellId', id, id === 'all' ? 'All spells' : SPELL_ID_LABELS[id] || id, filter.spellId)).join('')}</div>` : ''}
  </div>`;

  const emptyNote = !state.inventory.length
    ? '<p class="muted">No loot yet. Monsters drop equipment as you fight.</p>'
    : !filtered.length
    ? '<p class="muted">No items match the current filters.</p>'
    : '';

  const heldMaterials = Object.entries(state.materials)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => {
      const m = getMaterial(id);
      return `<div class="stat-row"><span class="k">${esc(m ? m.name : id)}</span><span class="v">${count}</span></div>`;
    })
    .join('');

  const heldTrophies = TROPHIES.filter((t) => (state.trophies[t.id] || 0) > 0)
    .map(
      (t) => `<div class="stat-row" title="${esc(t.desc)}"><span class="k">${esc(t.name)}</span><span class="v">${fmt(state.trophies[t.id])}</span></div>`
    )
    .join('');

  return `
    <div class="panel"><h2>Equipped</h2><div class="doll-grid">${equippedGridHtml(state)}</div></div>
    <div class="panel">
      <h2>Inventory (${state.inventory.length})</h2>
      <div class="filter-group" style="margin-bottom:8px">
        <button class="btn" data-action="toggle-autoequip">Auto-equip: ${state.settings.autoEquip ? 'ON' : 'OFF'}</button>
        ${salvageControlsHtml(state, filtered)}
      </div>
      ${filterRowHtml}
      ${emptyNote}
      ${inventoryGridHtml(state, filtered)}
      <div class="slot-detail">${selectedItemHtml(state)}</div>
    </div>
    <div class="panel"><h2>Materials</h2>${heldMaterials || '<p class="muted">None gathered or salvaged yet.</p>'}</div>
    <div class="panel">
      <h2>Trophies</h2>
      ${heldTrophies || '<p class="muted">Nothing worth keeping yet.</p>'}
      ${heldTrophies ? '<p class="muted" style="margin-top:6px">Kept for quest and turn-in rewards.</p>' : ''}
    </div>`;
}

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

// --- Enlightenment ---
export function enlightenmentTab(state) {
  const souls = soulsAvailable(state);
  const can = canEnlighten(state);
  const upgrades = ENLIGHTENMENT_UPGRADES.map((u) => {
    const rank = state.enlightenment.upgrades[u.id] || 0;
    const maxed = rank >= u.maxRank;
    const cost = maxed ? null : u.cost(rank);
    const afford = cost !== null && state.enlightenment.souls >= cost;
    return `<div class="upgrade-row">
      <div><b>${u.name}</b> <span class="muted">${rank}/${u.maxRank}</span><div class="desc">${u.desc}</div></div>
      ${maxed ? '<span class="muted">MAX</span>' : `<button class="btn" data-action="buy-upgrade" data-arg="${u.id}" ${afford ? '' : 'disabled'}>Buy — <span class="soul">${plural(cost, 'soul')}</span></button>`}
    </div>`;
  }).join('');

  return `
    <div class="panel">
      <h2>Enlightenment — <span class="soul">${plural(state.enlightenment.souls, 'Hero Soul')}</span> · enlightened ${plural(state.enlightenment.count, 'time')}</h2>
      <p class="muted" style="margin-bottom:10px">Set down your level, pyreals, gear, skills, and region progress in exchange for Hero Souls — permanent power that carries into every run after.</p>
      <button class="btn primary" data-action="enlightenment" ${can ? '' : 'disabled'}>
        ${can ? `Become Enlightened — gain ${plural(souls, 'soul')}` : `Reach Glenden Wood to become Enlightened`}
      </button>
    </div>
    <div class="panel"><h2>Soul Upgrades</h2>${upgrades}</div>`;
}

// --- Overview (post-enlightenment dashboard) ---
export function overviewTab(state) {
  const h = state.hero;
  const d = derivedStats(state);
  const m = state.monsters[0] || null;
  const p = state.progress;

  const tiles = [];
  const xpProgress = state.progress.totalXpEarned - totalXpForLevel(h.level);
  tiles.push(`<div class="panel"><h2>Hero</h2>
    <span id="ov-hero-line">Level ${h.level} · <span class="gold">${fmt(state.pyreals)} pyreals</span> · <span class="soul">${state.enlightenment.souls} souls</span></span><br/>
    ${bar('hp', (h.hp / d.maxHp) * 100, `${Math.ceil(h.hp)} / ${d.maxHp} HP`, 'h-hp', 'hero', { vitae: true })}
    ${bar('xp', (xpProgress / xpForLevel(h.level)) * 100, `XP ${fmt(xpProgress)} / ${fmt(xpForLevel(h.level))}`, 'h-xp')}
    <div class="muted">ATK ${d.atk} · DEF ${d.def} · SPD ${d.spd.toFixed(2)}/s</div></div>`);

  const poi = state.location.poiId ? getPoiById(state.location.poiId) : null;
  tiles.push(`<div class="panel"><h2>Battle — ${poi ? esc(poi.name) : 'Town'}</h2>
    <b id="m-name">${m ? esc(monsterLabel(m)) : state.travel ? 'Travelling...' : 'Searching...'}</b>
    ${bar('hp', m ? (m.hp / m.maxHp) * 100 : 0, m ? `${Math.ceil(m.hp)} / ${m.maxHp}` : '...', 'm-hp', 'monster')}
    <div id="ov-kills" class="muted">${poi ? esc(waveLine(state, poi)) : ''}</div></div>`);

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
// Everything currently running, for the sidebar. The Battle tab's Upkeep section
// is where you *manage* these; this is the at-a-glance answer to "is my
// Rejuvenation still up?" from any tab, which is the question that was making
// people go back and unfold a panel to read one word.
//
// Timers carry their own sb- prefixed ids: the Battle tab's Upkeep rows can be on
// screen at the same time, and two elements sharing an id means getElementById
// only ever finds the first, leaving the other frozen.
const VITAL_TEXT_BY_NAME = { hp: 'hp-text', stamina: 'stamina-text', mana: 'mana-text' };

export function sidebarUpkeepHtml(state) {
  const rows = [];
  // Every row says what it does on hover. A name and a countdown is enough to
  // check on something you already understand; it is not enough to remember
  // which of three similarly-named spells is the stamina one.
  for (const buff of state.buffs) {
    const spell = getBuffSpell(buff.id);
    const tip = spell
      ? `${buff.name} — ${effectText(buff.id, knownSpellLevel(state, buff.id) || 1)}`
      : buff.name;
    rows.push(
      `<div class="up-row" title="${esc(tip)}"><span class="${vitalTextClass(buff.effect)}">${esc(buff.name)}</span><span class="t" id="sb-buff-timer-${buff.id}">${formatDuration(buff.remaining)}</span></div>`
    );
  }

  // Automation that's switched on is "running" too, and it's worth seeing that
  // a kit is quietly draining before it runs out rather than after.
  const kit = charges(state, 'healing-kit');
  if (state.settings.autoHeal && kit > 0) {
    const tip = `Auto-heal — below half health, spends ${STAMINA_PER_HP} stamina and a kit charge per point of health. ${plural(kit, 'charge')} left.`;
    rows.push(`<div class="up-row" title="${esc(tip)}"><span class="hp-text">Auto-heal</span><span class="t">${fmt(kit)}</span></div>`);
  }
  for (const c of upkeepConsumables(state)) {
    if (!isAutoDrink(state, c.id)) continue;
    const left = charges(state, c.id);
    if (state.buffs.some((b) => c.buff && b.id === c.buff.id)) continue; // already listed above
    const tip = `${c.name} — re-drunk whenever its effect lapses. ${left ? plural(left, 'charge') : 'None'} left.`;
    rows.push(`<div class="up-row" title="${esc(tip)}"><span class="muted">${esc(c.name)}</span><span class="t">${left ? fmt(left) : 'none'}</span></div>`);
  }

  // Spells you know but aren't running, so the panel is somewhere to see the
  // whole picture rather than only the half that happens to be up.
  for (const sp of BUFF_SPELLS) {
    const level = knownSpellLevel(state, sp.id);
    if (!level || state.buffs.some((b) => b.id === sp.id)) continue;
    const name = buffSpellName(sp.id, level);
    rows.push(
      `<div class="up-row" title="${esc(`${name} — ${effectText(sp.id, level)}`)}"><span class="${VITAL_TEXT_BY_NAME[sp.vital]}">${esc(name)}</span><span class="t">—</span></div>`
    );
  }

  // Nothing running and nothing to run: say nothing at all rather than taking up
  // room to report the absence.
  if (!rows.length) return '';
  return `<div class="up-head">Upkeep</div>${rows.join('')}`;
}

export function battleDockHtml(state) {
  const h = state.hero;
  const d = derivedStats(state);
  const m = state.monsters[0] || null;
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
        <b>${esc(monsterLabel(m))}</b>
        ${bar('hp mini', (m.hp / m.maxHp) * 100, `${Math.max(0, Math.ceil(m.hp))}/${m.maxHp}`, 'dock-m-hp')}
      </div>`
    : `<div class="dock-monster muted">—</div>`;

  return `
    <div class="dock-where">${where}</div>
    ${monsterHtml}
    <div class="dock-hero">
      ${bar('hp mini', (h.hp / d.maxHp) * 100, `${Math.ceil(h.hp)}/${d.maxHp}`, 'dock-h-hp', null, { vitae: true })}
      ${bar('stamina mini', (h.stamina / d.maxStamina) * 100, `${Math.ceil(h.stamina)}/${d.maxStamina}`, 'dock-h-sta', null, { vitae: true })}
      ${bar('mana mini', (h.mana / d.maxMana) * 100, `${Math.ceil(h.mana)}/${d.maxMana}`, 'dock-h-mana', null, { vitae: true })}
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
