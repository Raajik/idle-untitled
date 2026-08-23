// Combat: pure tick-based battle resolution. Mutates state; no DOM access.
// Combat only runs when the hero is standing at a hunting POI — not travelling,
// not in town, and not at a site POI like a budding Lifestone. Regen is the
// exception: it ticks wherever you are, so standing still is always a way back.
// Monsters arrive in waves (see game/waves.js) — difficulty rises with the wave
// number, and clearing the last wave pays out the POI's gathering material and
// starts the waves over.

import { getPoiById, getRegion, isMagicDamageType, isSite } from '../data/regions.js';
import { monsterStatsForLevel } from '../data/monsterScaling.js';
import { TUTORIAL_ROAD, TUTORIAL_MONSTER_WEIGHTS } from '../data/tutorial.js';
import {
  MELEE_STANCES,
  ARCHERY_STANCES,
  MAGIC_SPELLS,
  VOID_SPELLS,
  BLEED_TICK_SECONDS,
  BLEED_DURATION_SECONDS,
  BLEED_MAX_STACKS,
  BLEED_DAMAGE_PER_STACK_PCT,
  ROT_TICK_SECONDS,
  ROT_MAX_STACKS,
  ROT_DAMAGE_PER_STACK_PCT,
  staminaCostForWindup,
} from '../data/combatStances.js';
import { traitFor } from '../data/weaponTraits.js';
import { bestElementFor, elementDamageMult, imbueOf, CASTABLE_ELEMENTS } from '../data/elements.js';
import { pick, pickWeighted } from '../engine/rng.js';
import { pushFx } from '../engine/fx.js';
import { fmt } from '../engine/format.js';
import { derivedStats, grantXp } from './hero.js';
import { rollDrop, rollTrophies, maybeAutoEquip, shouldAutoSalvage, salvageItem } from './loot.js';
import { getMaterial } from '../data/materials.js';
import { getTrophy } from '../data/trophies.js';
import { addLog } from './state.js';
import { tickTravel, arrive } from './travel.js';
import { tickRecallCooldown, respawnAtLifestone, tickLifestoneGrowth } from './lifestone.js';
import { gainVitae } from './vitae.js';
import { tickBuffs, tickAutoCast } from './buffs.js';
import { tickAutoHeal, tickAutoDrink } from './consumables.js';
import { tickJumpCooldown } from './shortcuts.js';
import { beginWaveIfNeeded, recordWaveKill, waveDifficulty } from './waves.js';
import { tickBuildings } from './buildings.js';
import {
  trainSkill,
  trainAttribute,
  defensiveChance,
  resistanceMitigationPct,
  hitChance,
  effectiveRank,
  activeWeaponSkill,
  grantAthleticsXp,
  MELEE_WEAPON_BASE_TYPES,
  RECALL_XP_ON_DEATH,
  COMBAT_SKILL_XP,
  MELEE_ATTR_XP,
  ARCHERY_COORD_XP,
  MAGIC_ATTR_XP,
  DEFEND_SUCCESS_ATTR_XP,
  MAGIC_RESIST_ATTR_XP,
  HIT_TAKEN_END_XP,
  DEATH_END_XP,
} from './skills.js';

const MONSTER_ATTACK_INTERVAL = 1.2; // seconds
const RESPAWN_DELAY = 3.0;

const HERO_STAMINA_COST_PER_DEFEND = 4;
const MONSTER_STAMINA_COST_PER_DODGE = 3;

// Attacks stop before they can spend the last of the pool, so being winded costs
// you damage but never your guard. Without this, a drained hero can't Dodge,
// Block or Parry either, which turns a bad stretch into an unattended death
// spiral rather than a slower fight.
export const DEFENSIVE_STAMINA_RESERVE = HERO_STAMINA_COST_PER_DEFEND;

// Passive regen, as a fraction of each vital's maximum per second. It runs
// everywhere and always — in a fight, in town, on the road — so idling is itself
// a way to recover and no place can strand you empty.
//
// Stamina's rate is deliberately below what swinging costs (roughly 1.1-1.6 a
// second, see data/combatStances.js), so fighting runs you down and your attack
// rate settles at whatever regen can pay for. That's the intended pressure: it
// makes Endurance and Quickness worth raising, and it's the problem that
// healing/alchemy/magic answer faster than standing still does.
const HP_REGEN_PER_SECOND = 0.01;
const STAMINA_REGEN_PER_SECOND = 0.015;
const MANA_REGEN_PER_SECOND = 0.02;

// ...but a percentage of a tiny pool is nothing at all. A hero starts on 10 of
// each, where 1.5% a second is one point every seven seconds and a single swing
// costs one — which is a standstill, not a constraint. These floors keep the
// early game moving; the percentages overtake them as the pools grow, so the
// pressure arrives when there's something to push against.
const HP_REGEN_FLOOR = 0.5;
const STAMINA_REGEN_FLOOR = 1;
const MANA_REGEN_FLOOR = 0.5;

function regenPerSecond(max, pct, floor, flat) {
  return Math.max(floor, max * pct) + flat;
}

function resolvePoi(state) {
  return state.location.poiId === TUTORIAL_ROAD.id ? TUTORIAL_ROAD : getPoiById(state.location.poiId);
}

// The tutorial road reuses the combat tick but isn't a real POI — no waves, no
// wave scaling, no clears (and no loot; see onMonsterDeath).
function onTutorialRoad(state) {
  return state.location.poiId === TUTORIAL_ROAD.id;
}

// Whoever the hero is swinging at: the front of the engaged group. Everything
// else in the group is still hitting them.
export function currentTarget(state) {
  return state.monsters[0] || null;
}

function makeMonster(def, depth) {
  const base = def.stats || monsterStatsForLevel(def.level);
  const r = 1 + depth;
  return {
    name: def.name,
    level: def.level,
    dmgType: def.dmgType,
    drops: def.drops,
    maxHp: Math.round(base.hp * r),
    hp: Math.round(base.hp * r),
    atk: Math.round(base.atk * r),
    def: Math.round(base.def * r),
    xp: base.xp,
    pyreals: base.pyreals,
    dodge: base.dodge,
    maxStamina: Math.round(base.maxStamina * (1 + depth * 0.5)),
    stamina: Math.round(base.maxStamina * (1 + depth * 0.5)),
    // Its own swing timer, so a group of eight doesn't hit in lockstep.
    attackTimer: Math.random() * MONSTER_ATTACK_INTERVAL,
  };
}

// Brings the current wave's whole group onto the field at once. The road only
// ever sends one thing at a time; dungeons roll a swarm (see game/waves.js).
export function engageWave(state) {
  const poi = resolvePoi(state);
  const p = state.progress;
  const tutorial = onTutorialRoad(state);
  const region = getRegion(state.location.regionId);
  if (!tutorial) beginWaveIfNeeded(state, region ? region.swarmMax : 1);

  const count = tutorial ? 1 : Math.max(1, p.waveMonstersLeft);
  const depth = tutorial ? 0 : waveDifficulty(p.wave);
  state.monsters = [];
  for (let i = 0; i < count; i++) {
    // Roadside critters are weighted (mostly harmless, the occasional rat) and
    // carry their own stat block; dungeon monsters roll flat off their level.
    const def = tutorial
      ? pickWeighted(poi.monsters.map((m) => ({ ...m, weight: TUTORIAL_MONSTER_WEIGHTS[m.name] || 1 })))
      : pick(poi.monsters);
    state.monsters.push(makeMonster(def, depth));
  }
}

// `minDamagePct` (Tempering) lifts the bottom of the damage band toward the top,
// so a tempered weapon rolls closer to its best hit every time; at 100 it always
// does. It narrows the spread rather than raising the ceiling.
const DAMAGE_VARIANCE_LOW = 0.9;
const DAMAGE_VARIANCE_HIGH = 1.1;

function dealDamage(rawAtk, targetDef, critChance, critMult = 2, minDamagePct = 0) {
  const lift = Math.max(0, Math.min(100, minDamagePct)) / 100;
  const low = DAMAGE_VARIANCE_LOW + (DAMAGE_VARIANCE_HIGH - DAMAGE_VARIANCE_LOW) * lift;
  const variance = low + Math.random() * (DAMAGE_VARIANCE_HIGH - low);
  let dmg = Math.max(1, Math.round((rawAtk - targetDef) * variance));
  const crit = Math.random() * 100 < critChance;
  if (crit) dmg *= critMult;
  return { dmg, crit };
}

// Shared by melee/archery/magic: the monster may spend stamina to dodge entirely.
function rollMonsterDodge(state, m) {
  if (m.stamina >= MONSTER_STAMINA_COST_PER_DODGE && Math.random() * 100 < m.dodge) {
    m.stamina -= MONSTER_STAMINA_COST_PER_DODGE;
    pushFx({ type: 'dodge', target: 'monster' });
    addLog(state, `${m.name} dodges your attack!`, 'dim');
    return true;
  }
  return false;
}

// Applies hit damage to one monster; returns true if it died (the caller should
// stop attacking this tick, since the group has shifted under it).
function applyDamageToMonster(state, m, dmg, crit) {
  m.hp -= dmg;
  pushFx({ type: 'hit', target: 'monster', dmg, crit });
  if (crit) addLog(state, `Critical hit! ${dmg} damage to ${m.name}.`, 'dim');
  if (m.hp > 0) return false;

  pushFx({ type: 'kill', target: 'monster' });
  state.monsters = state.monsters.filter((other) => other !== m);
  onMonsterDeath(state, m);
  // The wave isn't over until everything in it is down; only then does the next
  // group come on.
  if (state.monsters.length === 0) engageWave(state);
  return true;
}

// Applies one attack's worth of damage to several monsters at once — a Volley,
// or a bolt punching through the front rank.
//
// Every figure is worked out BEFORE anything is applied, and each target is
// re-checked against the field as we go. Applying as we went meant a kill on the
// primary target returned early and the rest of the group never got hit at all,
// and a kill that emptied the wave could splash the replacements.
// Returns true if anything died, which reshuffles the group.
function applyDamageToGroup(state, hits) {
  let died = false;
  for (const { monster, dmg, crit } of hits) {
    if (!state.monsters.includes(monster)) continue;
    if (applyDamageToMonster(state, monster, dmg, crit)) died = true;
  }
  return died;
}

// Devastating melee stance stacks a bleed on the monster: each new stack adds
// its own damage-per-tick and refreshes the whole effect's remaining duration
// (rather than layering independent timers), capped at BLEED_MAX_STACKS.
function applyBleed(state, m, heroAtk) {
  if (!m.bleed) m.bleed = { stacks: 0, dmgPerStack: 0, remaining: 0, timer: 0 };
  m.bleed.stacks = Math.min(BLEED_MAX_STACKS, m.bleed.stacks + 1);
  m.bleed.dmgPerStack = Math.max(1, Math.round(heroAtk * BLEED_DAMAGE_PER_STACK_PCT));
  m.bleed.remaining = BLEED_DURATION_SECONDS;
}

// Corruption settles on every monster currently engaged, stacking to
// ROT_MAX_STACKS. Unlike Bleed there's no duration: a rot runs until the thing
// it's on is dead, so stacking it early is the whole play, and the 5s cooldown
// is what stops that being three casts in the first two seconds.
function applyRot(state, magicAtk) {
  const dmgPerStack = Math.max(1, Math.round(magicAtk * ROT_DAMAGE_PER_STACK_PCT));
  let touched = 0;
  for (const m of state.monsters) {
    if (!m.rot) m.rot = { stacks: 0, dmgPerStack: 0, timer: 0 };
    if (m.rot.stacks < ROT_MAX_STACKS) touched += 1;
    m.rot.stacks = Math.min(ROT_MAX_STACKS, m.rot.stacks + 1);
    // A stronger caster's newer stacks are worth more; take the better figure
    // rather than averaging, so gear upgrades are felt immediately.
    m.rot.dmgPerStack = Math.max(m.rot.dmgPerStack, dmgPerStack);
  }
  addLog(
    state,
    touched
      ? `Corruption takes hold of ${touched === 1 ? state.monsters[0].name : `${touched} of them`}.`
      : 'Corruption seeps in, but it can hold no deeper.',
    'dim'
  );
}

// Rot damage, same shape as the bleed tick. Returns true if anything died.
function tickRot(state, dt) {
  let died = false;
  for (const m of [...state.monsters]) {
    if (!m.rot || m.rot.stacks <= 0) continue;
    m.rot.timer += dt;
    while (m.rot.timer >= ROT_TICK_SECONDS && m.hp > 0) {
      m.rot.timer -= ROT_TICK_SECONDS;
      const dmg = m.rot.stacks * m.rot.dmgPerStack;
      m.hp -= dmg;
      pushFx({ type: 'hit', target: 'monster', dmg, crit: false });
      addLog(state, `${m.name} rots for ${dmg}.`, 'dim');
      if (m.hp <= 0) {
        pushFx({ type: 'kill', target: 'monster' });
        state.monsters = state.monsters.filter((other) => other !== m);
        onMonsterDeath(state, m);
        died = true;
      }
    }
  }
  if (died && state.monsters.length === 0) engageWave(state);
  return died;
}

// Ticks any active bleed on the current monster once per BLEED_TICK_SECONDS.
// Returns true if the kill was handled (caller should stop this tick).
// Ticks bleeds on every engaged monster — a swarm can be bleeding all at once.
// Returns true if anything died, since that reshuffles the group.
function tickBleed(state, dt) {
  let died = false;
  for (const m of [...state.monsters]) {
    if (!m.bleed || m.bleed.stacks <= 0) continue;
    m.bleed.timer += dt;
    while (m.bleed.timer >= BLEED_TICK_SECONDS && m.hp > 0) {
      m.bleed.timer -= BLEED_TICK_SECONDS;
      const dmg = m.bleed.stacks * m.bleed.dmgPerStack;
      m.hp -= dmg;
      pushFx({ type: 'hit', target: 'monster', dmg, crit: false });
      addLog(state, `${m.name} bleeds for ${dmg}.`, 'dim');
      m.bleed.remaining -= BLEED_TICK_SECONDS;
      if (m.bleed.remaining <= 0) m.bleed.stacks = 0;
      if (m.hp <= 0) {
        pushFx({ type: 'kill', target: 'monster' });
        state.monsters = state.monsters.filter((other) => other !== m);
        onMonsterDeath(state, m);
        died = true;
      }
    }
  }
  if (died && state.monsters.length === 0) engageWave(state);
  return died;
}

// Attribute xp granted on a successful defensive layer, additive to that
// layer's own skill training.
const ATTR_ON_DEFEND_SUCCESS = {
  dodge: [
    ['coord', DEFEND_SUCCESS_ATTR_XP],
    ['quick', DEFEND_SUCCESS_ATTR_XP],
  ],
  block: [
    ['str', DEFEND_SUCCESS_ATTR_XP],
    ['coord', DEFEND_SUCCESS_ATTR_XP],
  ],
  parry: [
    ['str', DEFEND_SUCCESS_ATTR_XP],
    ['coord', DEFEND_SUCCESS_ATTR_XP],
  ],
  magicResistance: [
    ['focus', MAGIC_RESIST_ATTR_XP],
    ['self', MAGIC_RESIST_ATTR_XP],
  ],
};

// Rolls the hero's defensive layers in order — Dodge (always available), Block
// (only with a shield equipped), Parry (only with a melee weapon equipped),
// Magic Resistance (no gear needed, but only eligible against a magic-based
// attack — see isMagicDamageType). Each eligible layer only trains and can
// only succeed while the hero has stamina to spend; running out of stamina
// mid-swing just means the remaining layers are skipped. Returns the layer
// name that avoided the hit, or null — Resistance is NOT part of this chain;
// see the mitigation step in tickCombat.
function tryDefend(state, stats, m) {
  const h = state.hero;
  const hasShield = !!state.equipment.shield;
  const weapon = state.equipment.weapon;
  const hasMeleeWeapon = !!(weapon && MELEE_WEAPON_BASE_TYPES.includes(weapon.baseType));

  const layers = [
    ['dodge', 'Dodge', true, stats.dodgeBonus],
    ['block', 'Block', hasShield, stats.blockBonus],
    ['parry', 'Parry', hasMeleeWeapon, stats.parryBonus],
    ['magicResistance', 'Magic Resistance', isMagicDamageType(m.dmgType), stats.magicResistanceBonus],
  ];
  for (const [key, name, eligible, bonus] of layers) {
    if (!eligible) continue;
    const skill = h.skills[key];
    trainSkill(state, skill, name, COMBAT_SKILL_XP);
    if (h.stamina < HERO_STAMINA_COST_PER_DEFEND) continue;
    const rank = effectiveRank(skill.rank, stats.skillRankBonus[key]);
    const chance = Math.min(95, defensiveChance(rank) + bonus);
    if (Math.random() * 100 < chance) {
      h.stamina -= HERO_STAMINA_COST_PER_DEFEND;
      for (const [attr, xp] of ATTR_ON_DEFEND_SUCCESS[key]) trainAttribute(state, attr, xp);
      return name;
    }
  }
  return null;
}

function onMonsterDeath(state, m) {
  const p = state.progress;
  const stats = derivedStats(state);

  const pyrealsGain = Math.round(m.pyreals * (1 + stats.pyrealsPct / 100));
  state.pyreals += pyrealsGain;
  p.totalPyrealsEarned += pyrealsGain;

  const levels = grantXp(state, m.xp);

  p.totalKills += 1;
  p.killsInPoi += 1;
  addLog(state, `${m.name} slain. +${fmt(m.xp)} XP, +${fmt(pyrealsGain)} pyreals`, 'dim');

  if (levels > 0) {
    addLog(state, `Level up! Now level ${state.hero.level}.`, 'good');
    pushFx({ type: 'levelup' });
  }

  for (const { id, qty } of rollTrophies(state, m)) {
    const trophy = getTrophy(id);
    addLog(state, `You take ${qty} ${trophy ? trophy.name : id}.`, 'loot-line');
  }

  if (onTutorialRoad(state)) return; // roadside critters carry no gear, and aren't a wave

  const drop = rollDrop(state, m.name);
  if (drop) {
    p.totalDrops += 1;
    if (maybeAutoEquip(state, drop)) {
      addLog(state, `⚔ Auto-equipped ${drop.name} [${drop.rarity}]`, 'loot-line');
    } else {
      state.inventory.push(drop);
      // Auto-salvage is only ever consulted for something auto-equip already
      // passed over, so it can never destroy an upgrade.
      const broken = shouldAutoSalvage(state, drop) ? salvageItem(state, drop.id) : null;
      if (broken) {
        const material = getMaterial(broken.material);
        addLog(state, `⚙ Broke down ${drop.name} for ${broken.amount} ${material ? material.name : broken.material}.`, 'dim');
      } else {
        addLog(state, `⚔ Loot: ${drop.name} [${drop.rarity}]`, 'loot-line');
      }
    }
  }

  // Loot first, then the wave: the drop is rolled at the wave it was earned on,
  // and the "cleared!" line lands last.
  recordWaveKill(state, getPoiById(state.location.poiId));
}

// Fires once, the first time the hero ever dies: Alcott's second beat, which
// unlocks Lifestone Recall. Every death (not just the first) nudges Recall's xp.
function handleHeroDeath(state) {
  const p = state.progress;
  trainSkill(state, state.hero.skills.lifestone.recall, 'Lifestone Recall', RECALL_XP_ON_DEATH);
  trainAttribute(state, 'end', DEATH_END_XP);
  gainVitae(state, 'Death takes something with it.');
  if (p.firstDeathHandled) return;
  p.firstDeathHandled = true;
  p.recallUnlocked = true;
  addLog(
    state,
    `"Death's a fine teacher, if a rude one," Alcott says as the world knits itself back together. "You'll feel that Lifestone's pull now, wherever you've bonded with one — call on it, and it'll carry you there in an instant."`,
    'good'
  );
}

// The scripted first walk to Holtburg: the countdown keeps ticking (and Run keeps
// training) exactly like normal travel, but combat runs in parallel the whole time
// against the tutorial road's weak monster pool, rather than being suspended.
function tickTutorialJourney(state, dt) {
  state.travel.remaining -= dt;
  grantAthleticsXp(state, dt);
  if (state.travel.remaining <= 0) {
    state.monsters = [];
    arrive(state);
    state.onboarding.tutorialPending = false;
  }
}

// The current attack bar's target interval (or cast time) for whichever
// combat mode is active — shared by the UI (fill %) and tickCombat itself.
// Oak worked into a weapon speeds every windup it has, cast times included —
// hence one property rather than a separate "casting speed".
const MAX_ATTACK_SPEED_PCT = 60; // a floor on the windup, so nothing goes instant

function hastened(seconds, stats) {
  const pct = Math.min(MAX_ATTACK_SPEED_PCT, stats.attackSpeedPct || 0);
  return seconds * (1 - pct / 100);
}

// War and Void are the same machine with different ammunition: same three-slot
// shape, same cast/mana/timer handling, different table. Everything below reads
// the table rather than branching on the school, so Void cost one entry here
// instead of a parallel copy of the magic loop.
export function isMagicMode(mode) {
  return mode === 'magic' || mode === 'void';
}

export function spellTableFor(mode) {
  return mode === 'void' ? VOID_SPELLS : MAGIC_SPELLS;
}

export function activeSpell(state) {
  const h = state.hero;
  if (h.combat.mode === 'void') return VOID_SPELLS[h.combat.voidSpell] || VOID_SPELLS.arc;
  return MAGIC_SPELLS[h.combat.magicSpell] || MAGIC_SPELLS.arc;
}

// The skill a magic school trains, so Void ranks up its own line.
function magicSkillFor(state, mode) {
  return mode === 'void'
    ? { skill: state.hero.skills.offense.void, label: 'Void Magic', key: 'void' }
    : { skill: state.hero.skills.offense.war, label: 'War Magic', key: 'war' };
}

// What the weapon in hand does that others don't (see data/weaponTraits.js).
export function activeTrait(state) {
  const weapon = state.equipment.weapon;
  return traitFor(state.hero.combat.mode, weapon ? weapon.baseType : null);
}

// The element this cast will actually use. Void is void, always. War casts what
// you picked, or — on Auto — whatever lands hardest on the thing in front of it.
export function activeElement(state, target = currentTarget(state)) {
  const h = state.hero;
  if (h.combat.mode === 'void') return 'void';
  const chosen = h.combat.warElement;
  if (chosen && chosen !== 'auto') return chosen;
  const imbue = imbueOf(state.equipment.weapon);
  // Nothing to read yet: fall back to the weapon's own element, then to fire.
  if (!target) return imbue || 'fire';
  return bestElementFor(target.dmgType, imbue, CASTABLE_ELEMENTS);
}

export function activeAttackInterval(state, stats) {
  const h = state.hero;
  const mode = h.combat.mode;
  if (isMagicMode(mode)) return hastened(activeSpell(state).castTime, stats);

  const trait = activeTrait(state);
  const stance = mode === 'archery' ? ARCHERY_STANCES[h.combat.archeryStance] : MELEE_STANCES[h.combat.meleeStance];
  // A bow is quick and a crossbow is not; fists are quicker than either. The
  // trait scales the whole window, so it holds across every stance.
  return hastened((stance.interval ?? 1 / stats.spd) * (trait.speedMult ?? 1), stats);
}

// What a cast costs after Frugality (opal). Never free.
export function spellManaCost(spell, stats) {
  const pct = Math.min(90, stats.manaCostPct || 0);
  return Math.max(1, Math.round(spell.manaCost * (1 - pct / 100)));
}

// What the active attack costs: which vital it draws on and how much one attack
// spends. Melee and archery pay Stamina scaled 1-5 to the length of the windup
// (see data/combatStances.js); magic pays its spell's mana.
export function activeAttackCost(state, stats = derivedStats(state)) {
  const h = state.hero;
  const mode = h.combat.mode;
  if (isMagicMode(mode)) {
    const spell = activeSpell(state);
    return { resource: spell.resource, amount: spellManaCost(spell, stats) };
  }
  const stance = mode === 'archery' ? ARCHERY_STANCES[h.combat.archeryStance] : MELEE_STANCES[h.combat.meleeStance];
  const trait = activeTrait(state);
  const raw = staminaCostForWindup(activeAttackInterval(state, stats)) * (trait.staminaMult ?? 1);
  return { resource: stance.resource, amount: Math.max(1, Math.round(raw)) };
}

// Which vital the active attack draws on ('stamina' | 'mana' | 'life'). Used to
// color the attack bar to match that vital's own bar.
export function activeAttackResource(state) {
  return activeAttackCost(state).resource;
}

// Whether the hero can pay for the attack they're winding up. Running dry parks
// the attack bar at full instead of resetting it (see the loops in tickCombat):
// you're wound up and waiting to recover, not swinging at nothing.
export function canAffordAttack(state, stats = derivedStats(state)) {
  const { resource, amount } = activeAttackCost(state, stats);
  if (resource === 'mana') return state.hero.mana >= amount;
  return state.hero.stamina - amount >= DEFENSIVE_STAMINA_RESERVE;
}

// Vitals start as null (see game/state.js) and get their real values here. This
// runs before any of the location guards below, because a hero standing in town
// or walking the road still has HP — still regenerates it, and still needs to be
// able to cast the spells Alcott taught them, which check the mana to spend.
function fillInVitals(state) {
  const h = state.hero;
  if (h.hp !== null && h.stamina !== null && h.mana !== null) return;
  const stats = derivedStats(state);
  if (h.hp === null) h.hp = stats.maxHp;
  if (h.stamina === null) h.stamina = stats.maxStamina;
  if (h.mana === null) h.mana = stats.maxMana;
}

// One game tick. dt in seconds.
export function tickCombat(state, dt) {
  tickRecallCooldown(state, dt);
  tickJumpCooldown(state, dt);
  tickBuildings(state);
  tickLifestoneGrowth(state, dt);
  fillInVitals(state);
  tickBuffs(state, dt);
  tickAutoCast(state);
  tickAutoDrink(state);
  tickRegen(state, dt); // wherever you are, including nowhere in particular

  if (state.travel && state.travel.tutorial) {
    tickTutorialJourney(state, dt);
  } else if (tickTravel(state, dt)) {
    return; // travelling: no combat, Athletics trains instead
  }

  const h = state.hero;
  if (!state.location.poiId) return; // in town: nothing to fight
  if (isSite(resolvePoi(state))) return; // a site (e.g. a budding Lifestone): nothing to fight either

  const stats = derivedStats(state);

  if (h.dead) {
    h.respawnTimer -= dt;
    if (h.respawnTimer <= 0) {
      h.dead = false;
      h.hp = stats.maxHp;
      // The tutorial road is a scripted walk, not somewhere you can be pulled out
      // of — everywhere else, death drops you back at your bound Lifestone.
      if (onTutorialRoad(state)) {
        addLog(state, 'You awaken at your Lifestone, ready to fight again.', 'dim');
      } else {
        respawnAtLifestone(state);
      }
    }
    return;
  }

  state.progress.timeInPoi += dt;
  if (state.monsters.length === 0) engageWave(state);

  if (state.progress.rotCooldown > 0) state.progress.rotCooldown = Math.max(0, state.progress.rotCooldown - dt);
  if (tickBleed(state, dt)) return;
  if (tickRot(state, dt)) return;
  const m = currentTarget(state);
  if (!m) return;

  // Hero attacks (the monster may dodge, spending its stamina to do so). Which
  // block runs depends on the chosen combat mode; each picks its own attack
  // bar timing (stance interval / spell cast time) instead of a flat 1/spd.
  const mode = h.combat.mode;

  if (mode === 'archery') {
    const stance = ARCHERY_STANCES[h.combat.archeryStance];
    const attackInterval = activeAttackInterval(state, stats);
    // Through activeAttackCost so the figure the UI quotes, the figure
    // canAffordAttack tests, and the figure actually spent are one number.
    const staminaCost = activeAttackCost(state, stats).amount;
    h.attackTimer += dt;
    while (h.attackTimer >= attackInterval) {
      if (h.stamina - staminaCost < DEFENSIVE_STAMINA_RESERVE) {
        h.attackTimer = attackInterval; // too winded to loose the arrow; hold the bar full
        break;
      }
      h.attackTimer -= attackInterval;
      h.stamina -= staminaCost; // the effort is spent whether or not the shot lands
      if (rollMonsterDodge(state, m)) continue;

      const weaponSkill = activeWeaponSkill(state);
      trainSkill(state, weaponSkill.skill, weaponSkill.label, COMBAT_SKILL_XP);
      trainAttribute(state, 'coord', ARCHERY_COORD_XP);
      const rank = effectiveRank(weaponSkill.skill.rank, stats.skillRankBonus[weaponSkill.key]);
      const chance = Math.min(95, Math.max(0, hitChance(rank) + stance.accuracyMod + stats.hitChancePct));
      if (Math.random() * 100 >= chance) {
        addLog(state, `Your shot goes wide of ${m.name}.`, 'dim');
        continue;
      }

      const trait = activeTrait(state);
      const { dmg, crit } = dealDamage(stats.atk * (trait.dmgMult ?? 1), m.def, stats.critChance, 2, stats.minDamagePct);
      // A bolt doesn't stop at the first body. Everything behind the target takes
      // a share, which is what makes a crossbow worth its slower crank when the
      // wave came in six deep.
      const hits = [{ monster: m, dmg, crit }];
      if (trait.pierce) {
        for (const other of state.monsters.filter((o) => o !== m).slice(0, trait.pierce)) {
          const through = Math.max(1, Math.round(dmg * (trait.pierceMult ?? 0.5)));
          addLog(state, `The bolt punches through into ${other.name} for ${through}.`, 'dim');
          hits.push({ monster: other, dmg: through, crit: false });
        }
      }
      if (applyDamageToGroup(state, hits)) return;
    }
  } else if (isMagicMode(mode)) {
    const spell = activeSpell(state);
    const castTime = activeAttackInterval(state, stats);
    const manaCost = spellManaCost(spell, stats);
    const school = magicSkillFor(state, mode);
    const imbue = imbueOf(state.equipment.weapon);
    h.attackTimer += dt;
    while (h.attackTimer >= castTime) {
      // Corruption is the one spell on a cooldown: three stacks that never
      // expire would otherwise just be "cast it three times immediately".
      if (spell.rot && state.progress.rotCooldown > 0) {
        h.attackTimer = castTime;
        break;
      }
      if (h.mana < manaCost) {
        h.attackTimer = castTime; // spell held on the tongue until the mana is there
        break;
      }
      h.attackTimer -= castTime;
      h.mana -= manaCost;

      trainSkill(state, school.skill, school.label, COMBAT_SKILL_XP);
      trainAttribute(state, 'focus', MAGIC_ATTR_XP);
      trainAttribute(state, 'self', MAGIC_ATTR_XP);

      // Corruption doesn't strike anything — it settles on the whole group and
      // is not dodged. Everything else rolls to hit the target as usual.
      if (spell.rot) {
        state.progress.rotCooldown = spell.cooldown;
        applyRot(state, stats.magicAtk);
        continue;
      }

      if (rollMonsterDodge(state, m)) continue;
      const rank = effectiveRank(school.skill.rank, stats.skillRankBonus[school.key]);
      if (Math.random() * 100 >= Math.min(95, hitChance(rank) + stats.hitChancePct)) {
        addLog(state, `Your ${spell.label} fizzles past ${m.name}.`, 'dim');
        continue;
      }

      // The element is picked per cast, so Auto re-reads the target every time
      // the group in front of you changes.
      const element = activeElement(state, m);
      const power = stats.magicAtk * spell.dmgMult * elementDamageMult(element, m.dmgType, imbue);
      const { dmg, crit } = dealDamage(power, m.def, stats.critChance, spell.critMult, stats.minDamagePct);

      // Volley catches the rest of the group for a share, each rolled against
      // its own element multiplier — a mixed wave takes uneven damage from one
      // cast, which is correct and reads well in the log.
      const hits = [{ monster: m, dmg, crit }];
      if (spell.aoe) {
        for (const other of state.monsters.filter((o) => o !== m)) {
          const otherPower = stats.magicAtk * spell.dmgMult * (spell.aoeMult ?? 0.6) * elementDamageMult(element, other.dmgType, imbue);
          const hit = dealDamage(otherPower, other.def, stats.critChance, spell.critMult, stats.minDamagePct);
          hits.push({ monster: other, dmg: hit.dmg, crit: hit.crit });
        }
      }
      if (applyDamageToGroup(state, hits)) return;
    }
  } else {
    const stance = MELEE_STANCES[h.combat.meleeStance];
    const attackInterval = activeAttackInterval(state, stats);
    // Through activeAttackCost so the figure the UI quotes, the figure
    // canAffordAttack tests, and the figure actually spent are one number.
    const staminaCost = activeAttackCost(state, stats).amount;
    h.attackTimer += dt;
    while (h.attackTimer >= attackInterval) {
      if (h.stamina - staminaCost < DEFENSIVE_STAMINA_RESERVE) {
        h.attackTimer = attackInterval; // too winded to swing; hold the bar full
        break;
      }
      h.attackTimer -= attackInterval;
      h.stamina -= staminaCost; // the effort is spent whether or not the blow lands
      if (rollMonsterDodge(state, m)) continue;

      const weaponSkill = activeWeaponSkill(state);
      trainSkill(state, weaponSkill.skill, weaponSkill.label, COMBAT_SKILL_XP);
      trainAttribute(state, 'str', MELEE_ATTR_XP);
      trainAttribute(state, 'coord', MELEE_ATTR_XP);
      trainAttribute(state, 'quick', MELEE_ATTR_XP);
      const trait = activeTrait(state);
      const rank = effectiveRank(weaponSkill.skill.rank, stats.skillRankBonus[weaponSkill.key]);
      if (Math.random() * 100 >= Math.min(95, hitChance(rank) + stats.hitChancePct + (trait.hitPct ?? 0))) {
        addLog(state, `You swing and miss ${m.name}.`, 'dim');
        continue;
      }

      // A mace meets less armor than it looks like it should; an axe pays off on
      // the crit rather than the average swing.
      const facedDef = Math.round(m.def * (1 - (trait.defIgnorePct ?? 0) / 100));
      const critMult = 2 * (trait.critDmgMult ?? 1);
      const { dmg, crit } = dealDamage(stats.atk * stance.dmgMult * (trait.dmgMult ?? 1), facedDef, stats.critChance, critMult, stats.minDamagePct);
      if (stance.bleed || trait.alwaysBleed) applyBleed(state, m, stats.atk);
      // No heal on kill — the Lifestone (respawn) is how you recover. Skills (Healing,
      // Cooking, Life Magic) will add in-fight recovery later.
      if (applyDamageToMonster(state, m, dmg, crit)) return;
    }
  }

  // Patch up before the blows land, not after: a kit that only fires once you've
  // already been killed is no use to anyone.
  tickAutoHeal(state);

  // Every engaged monster attacks, each on its own timer — being surrounded means
  // taking several swings in the time you answer one. The hero may Dodge/Block/
  // Parry to avoid one entirely; otherwise Resistance for that attack's damage
  // type reduces how much gets through.
  for (const attacker of [...state.monsters]) {
    attacker.attackTimer += dt;
    while (attacker.attackTimer >= MONSTER_ATTACK_INTERVAL) {
      attacker.attackTimer -= MONSTER_ATTACK_INTERVAL;

      const avoidedBy = tryDefend(state, stats, attacker);
      if (avoidedBy) {
        pushFx({ type: 'dodge', target: 'hero' });
        addLog(state, `${avoidedBy}! You avoid ${attacker.name}'s attack.`, 'dim');
        continue;
      }

      const resistSkill = h.skills.resistance[attacker.dmgType];
      const resistName = `${attacker.dmgType[0].toUpperCase()}${attacker.dmgType.slice(1)} Mitigation`;
      trainSkill(state, resistSkill, resistName, COMBAT_SKILL_XP);
      const mitigation = Math.min(
        95,
        resistanceMitigationPct(effectiveRank(resistSkill.rank, stats.skillRankBonus[attacker.dmgType])) +
          (stats.resistanceBonus[attacker.dmgType] || 0)
      );

      const { dmg: rawDmg } = dealDamage(attacker.atk, stats.def, 0);
      const dmg = Math.max(1, Math.round(rawDmg * (1 - mitigation / 100)));
      h.hp -= dmg;
      trainAttribute(state, 'end', HIT_TAKEN_END_XP);
      pushFx({ type: 'hit', target: 'hero', dmg });
      if (h.hp <= 0) {
        h.hp = 0;
        h.dead = true;
        h.respawnTimer = RESPAWN_DELAY;
        handleHeroDeath(state);
        addLog(state, `You fall to ${attacker.name}. Your Lifestone shimmers, calling you back...`, 'boss');
        return;
      }
    }
  }

}

// Slow passive regen for all three vitals. Called once a tick from anywhere the
// hero can be — a fight, a town, a site, the road — so waiting is always an
// option, however slow a one. The dead don't recover; respawning refills them.
export function tickRegen(state, dt) {
  const h = state.hero;
  if (h.dead) return;
  const stats = derivedStats(state);
  h.hp = Math.min(stats.maxHp, h.hp + regenPerSecond(stats.maxHp, HP_REGEN_PER_SECOND, HP_REGEN_FLOOR, stats.hpRegenFlat) * dt);
  h.stamina = Math.min(stats.maxStamina, h.stamina + regenPerSecond(stats.maxStamina, STAMINA_REGEN_PER_SECOND, STAMINA_REGEN_FLOOR, stats.staminaRegenFlat) * dt);
  h.mana = Math.min(stats.maxMana, h.mana + regenPerSecond(stats.maxMana, MANA_REGEN_PER_SECOND, MANA_REGEN_FLOOR, stats.manaRegenFlat) * dt);
}

// Bail on the current tutorial-road encounter instead of fighting it. Always
// succeeds; trains Run a little for the trouble, same as any other travel time.
export function fleeTutorialEncounter(state) {
  if (!(state.travel && state.travel.tutorial) || !state.monsters.length) return false;
  addLog(state, `You break away and keep moving, leaving the ${state.monsters[0].name} behind.`, 'dim');
  state.monsters = [];
  grantAthleticsXp(state, 8);
  return true;
}
