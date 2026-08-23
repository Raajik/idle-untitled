// Combat: pure tick-based battle resolution. Mutates state; no DOM access.
// Combat only runs when the hero is standing at a hunting POI — not travelling,
// not meditating, not in town, and not at a site POI like a budding Lifestone.
// Monsters arrive in waves (see game/waves.js) — difficulty rises with the wave
// number, and clearing the last wave pays out the POI's gathering material and
// starts the waves over.

import { getPoiById, isMagicDamageType, isSite } from '../data/regions.js';
import { monsterStatsForLevel } from '../data/monsterScaling.js';
import { TUTORIAL_ROAD } from '../data/tutorial.js';
import {
  MELEE_STANCES,
  ARCHERY_STANCES,
  MAGIC_SPELLS,
  BLEED_TICK_SECONDS,
  BLEED_DURATION_SECONDS,
  BLEED_MAX_STACKS,
  BLEED_DAMAGE_PER_STACK_PCT,
  staminaCostForWindup,
} from '../data/combatStances.js';
import { pick } from '../engine/rng.js';
import { pushFx } from '../engine/fx.js';
import { fmt } from '../engine/format.js';
import { derivedStats, grantXp } from './hero.js';
import { rollDrop, maybeAutoEquip } from './loot.js';
import { addLog } from './state.js';
import { tickTravel, arrive } from './travel.js';
import { tickRecallCooldown, respawnAtLifestone } from './lifestone.js';
import { tickMeditation } from './meditation.js';
import { tickJumpCooldown } from './shortcuts.js';
import { beginWaveIfNeeded, recordWaveKill, waveDifficulty } from './waves.js';
import { tickBuildings } from './buildings.js';
import {
  trainSkill,
  trainAttribute,
  defensiveChance,
  resistanceMitigationPct,
  hitChance,
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

// Passive in-combat regen, as a fraction of each vital's maximum per second.
//
// Stamina's rate is deliberately below what swinging costs (roughly 1.1-1.6 a
// second, see data/combatStances.js), so fighting runs you down and your attack
// rate settles at whatever regen can pay for. That's the intended pressure: it
// makes Endurance and Quickness worth raising, and it's the problem that
// Meditation answers now and that healing/alchemy/magic will answer better.
const HP_REGEN_PER_SECOND = 0.01;
const STAMINA_REGEN_PER_SECOND = 0.015;
const MANA_REGEN_PER_SECOND = 0.02;

function resolvePoi(state) {
  return state.location.poiId === TUTORIAL_ROAD.id ? TUTORIAL_ROAD : getPoiById(state.location.poiId);
}

// The tutorial road reuses the combat tick but isn't a real POI — no waves, no
// wave scaling, no clears (and no loot; see onMonsterDeath).
function onTutorialRoad(state) {
  return state.location.poiId === TUTORIAL_ROAD.id;
}

export function spawnMonster(state) {
  const poi = resolvePoi(state);
  const p = state.progress;
  const tutorial = onTutorialRoad(state);
  if (!tutorial) beginWaveIfNeeded(state);

  const depth = tutorial ? 0 : waveDifficulty(p.wave);
  const def = pick(poi.monsters);
  const base = monsterStatsForLevel(def.level);
  const r = 1 + depth;
  state.monster = {
    name: def.name,
    level: def.level,
    dmgType: def.dmgType,
    maxHp: Math.round(base.hp * r),
    hp: Math.round(base.hp * r),
    atk: Math.round(base.atk * r),
    def: Math.round(base.def * r),
    xp: base.xp,
    pyreals: base.pyreals,
    dodge: base.dodge,
    maxStamina: Math.round(base.maxStamina * (1 + depth * 0.5)),
    stamina: Math.round(base.maxStamina * (1 + depth * 0.5)),
  };
}

function dealDamage(rawAtk, targetDef, critChance, critMult = 2) {
  const variance = 0.9 + Math.random() * 0.2;
  let dmg = Math.max(1, Math.round((rawAtk - targetDef) * variance));
  const crit = Math.random() * 100 < critChance;
  if (crit) dmg *= critMult;
  return { dmg, crit };
}

// Shared by melee/archery/magic: the monster may spend stamina to dodge entirely.
function rollMonsterDodge(state) {
  const m = state.monster;
  if (m.stamina >= MONSTER_STAMINA_COST_PER_DODGE && Math.random() * 100 < m.dodge) {
    m.stamina -= MONSTER_STAMINA_COST_PER_DODGE;
    pushFx({ type: 'dodge', target: 'monster' });
    addLog(state, `${m.name} dodges your attack!`, 'dim');
    return true;
  }
  return false;
}

// Applies hit damage to the current monster; returns true if the kill was
// handled (caller should stop attacking this tick — state.monster is gone).
function applyDamageToMonster(state, dmg, crit) {
  const m = state.monster;
  m.hp -= dmg;
  pushFx({ type: 'hit', target: 'monster', dmg, crit });
  if (crit) addLog(state, `Critical hit! ${dmg} damage to ${m.name}.`, 'dim');
  if (m.hp <= 0) {
    pushFx({ type: 'kill', target: 'monster' });
    onMonsterDeath(state);
    spawnMonster(state);
    return true;
  }
  return false;
}

// Devastating melee stance stacks a bleed on the monster: each new stack adds
// its own damage-per-tick and refreshes the whole effect's remaining duration
// (rather than layering independent timers), capped at BLEED_MAX_STACKS.
function applyBleed(state, heroAtk) {
  const m = state.monster;
  if (!m.bleed) m.bleed = { stacks: 0, dmgPerStack: 0, remaining: 0, timer: 0 };
  m.bleed.stacks = Math.min(BLEED_MAX_STACKS, m.bleed.stacks + 1);
  m.bleed.dmgPerStack = Math.max(1, Math.round(heroAtk * BLEED_DAMAGE_PER_STACK_PCT));
  m.bleed.remaining = BLEED_DURATION_SECONDS;
}

// Ticks any active bleed on the current monster once per BLEED_TICK_SECONDS.
// Returns true if the kill was handled (caller should stop this tick).
function tickBleed(state, dt) {
  const m = state.monster;
  if (!m || !m.bleed || m.bleed.stacks <= 0) return false;
  m.bleed.timer += dt;
  while (m.bleed.timer >= BLEED_TICK_SECONDS) {
    m.bleed.timer -= BLEED_TICK_SECONDS;
    const dmg = m.bleed.stacks * m.bleed.dmgPerStack;
    m.hp -= dmg;
    pushFx({ type: 'hit', target: 'monster', dmg, crit: false });
    addLog(state, `${m.name} bleeds for ${dmg}.`, 'dim');
    m.bleed.remaining -= BLEED_TICK_SECONDS;
    if (m.bleed.remaining <= 0) m.bleed.stacks = 0;
    if (m.hp <= 0) {
      pushFx({ type: 'kill', target: 'monster' });
      onMonsterDeath(state);
      spawnMonster(state);
      return true;
    }
  }
  return false;
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
function tryDefend(state, stats) {
  const h = state.hero;
  const m = state.monster;
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
    const chance = Math.min(95, defensiveChance(skill.rank) + bonus);
    if (Math.random() * 100 < chance) {
      h.stamina -= HERO_STAMINA_COST_PER_DEFEND;
      for (const [attr, xp] of ATTR_ON_DEFEND_SUCCESS[key]) trainAttribute(state, attr, xp);
      return name;
    }
  }
  return null;
}

function onMonsterDeath(state) {
  const m = state.monster;
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

  if (onTutorialRoad(state)) return; // roadside critters carry nothing to loot, and aren't a wave

  const drop = rollDrop(state);
  if (drop) {
    p.totalDrops += 1;
    if (maybeAutoEquip(state, drop)) {
      addLog(state, `⚔ Auto-equipped ${drop.name} [${drop.rarity}]`, 'loot-line');
    } else {
      state.inventory.push(drop);
      addLog(state, `⚔ Loot: ${drop.name} [${drop.rarity}]`, 'loot-line');
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
    state.monster = null;
    arrive(state);
    state.onboarding.tutorialPending = false;
  }
}

// The current attack bar's target interval (or cast time) for whichever
// combat mode is active — shared by the UI (fill %) and tickCombat itself.
export function activeAttackInterval(state, stats) {
  const h = state.hero;
  const mode = h.combat.mode;
  if (mode === 'archery') {
    const stance = ARCHERY_STANCES[h.combat.archeryStance];
    return stance.interval ?? 1 / stats.spd;
  }
  if (mode === 'magic') {
    return MAGIC_SPELLS[h.combat.magicSpell].castTime;
  }
  const stance = MELEE_STANCES[h.combat.meleeStance];
  return stance.interval ?? 1 / stats.spd;
}

// What the active attack costs: which vital it draws on and how much one attack
// spends. Melee and archery pay Stamina scaled 1-5 to the length of the windup
// (see data/combatStances.js); magic pays its spell's mana.
export function activeAttackCost(state, stats = derivedStats(state)) {
  const h = state.hero;
  const mode = h.combat.mode;
  if (mode === 'magic') {
    const spell = MAGIC_SPELLS[h.combat.magicSpell];
    return { resource: spell.resource, amount: spell.manaCost };
  }
  const stance = mode === 'archery' ? ARCHERY_STANCES[h.combat.archeryStance] : MELEE_STANCES[h.combat.meleeStance];
  return { resource: stance.resource, amount: staminaCostForWindup(activeAttackInterval(state, stats)) };
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

// One game tick. dt in seconds.
export function tickCombat(state, dt) {
  tickRecallCooldown(state, dt);
  tickJumpCooldown(state, dt);
  tickBuildings(state);

  if (state.travel && state.travel.tutorial) {
    tickTutorialJourney(state, dt);
  } else if (tickTravel(state, dt)) {
    return; // travelling: no combat, Athletics trains instead
  }

  if (tickMeditation(state, dt)) return; // meditating: resting instead of fighting

  const h = state.hero;
  if (!state.location.poiId) return; // in town: nothing to fight
  if (isSite(resolvePoi(state))) return; // a site (e.g. a budding Lifestone): nothing to fight either

  const stats = derivedStats(state);

  if (h.hp === null) h.hp = stats.maxHp; // fill the vitals in on the first tick
  if (h.stamina === null) h.stamina = stats.maxStamina;
  if (h.mana === null) h.mana = stats.maxMana;

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
  if (!state.monster) spawnMonster(state);

  if (tickBleed(state, dt)) return;
  const m = state.monster;

  // Hero attacks (the monster may dodge, spending its stamina to do so). Which
  // block runs depends on the chosen combat mode; each picks its own attack
  // bar timing (stance interval / spell cast time) instead of a flat 1/spd.
  const mode = h.combat.mode;

  if (mode === 'archery') {
    const stance = ARCHERY_STANCES[h.combat.archeryStance];
    const attackInterval = stance.interval ?? 1 / stats.spd;
    const staminaCost = staminaCostForWindup(attackInterval);
    h.attackTimer += dt;
    while (h.attackTimer >= attackInterval) {
      if (h.stamina - staminaCost < DEFENSIVE_STAMINA_RESERVE) {
        h.attackTimer = attackInterval; // too winded to loose the arrow; hold the bar full
        break;
      }
      h.attackTimer -= attackInterval;
      h.stamina -= staminaCost; // the effort is spent whether or not the shot lands
      if (rollMonsterDodge(state)) continue;

      const weaponSkill = activeWeaponSkill(state);
      trainSkill(state, weaponSkill.skill, weaponSkill.label, COMBAT_SKILL_XP);
      trainAttribute(state, 'coord', ARCHERY_COORD_XP);
      const chance = Math.min(95, Math.max(0, hitChance(weaponSkill.skill.rank) + stance.accuracyMod));
      if (Math.random() * 100 >= chance) {
        addLog(state, `Your shot goes wide of ${m.name}.`, 'dim');
        continue;
      }

      const { dmg, crit } = dealDamage(stats.atk, m.def, stats.critChance);
      if (applyDamageToMonster(state, dmg, crit)) return;
    }
  } else if (mode === 'magic') {
    const spell = MAGIC_SPELLS[h.combat.magicSpell];
    h.attackTimer += dt;
    while (h.attackTimer >= spell.castTime) {
      if (h.mana < spell.manaCost) {
        h.attackTimer = spell.castTime; // spell held on the tongue until the mana is there
        break;
      }
      h.attackTimer -= spell.castTime;
      h.mana -= spell.manaCost;
      if (rollMonsterDodge(state)) continue;

      const warSkill = h.skills.offense.war;
      trainSkill(state, warSkill, 'War Magic', COMBAT_SKILL_XP);
      trainAttribute(state, 'focus', MAGIC_ATTR_XP);
      trainAttribute(state, 'self', MAGIC_ATTR_XP);
      if (Math.random() * 100 >= hitChance(warSkill.rank)) {
        addLog(state, `Your ${spell.label} fizzles past ${m.name}.`, 'dim');
        continue;
      }

      const { dmg, crit } = dealDamage(stats.magicAtk * spell.dmgMult, m.def, stats.critChance, spell.critMult);
      if (applyDamageToMonster(state, dmg, crit)) return;
    }
  } else {
    const stance = MELEE_STANCES[h.combat.meleeStance];
    const attackInterval = stance.interval ?? 1 / stats.spd;
    const staminaCost = staminaCostForWindup(attackInterval);
    h.attackTimer += dt;
    while (h.attackTimer >= attackInterval) {
      if (h.stamina - staminaCost < DEFENSIVE_STAMINA_RESERVE) {
        h.attackTimer = attackInterval; // too winded to swing; hold the bar full
        break;
      }
      h.attackTimer -= attackInterval;
      h.stamina -= staminaCost; // the effort is spent whether or not the blow lands
      if (rollMonsterDodge(state)) continue;

      const weaponSkill = activeWeaponSkill(state);
      trainSkill(state, weaponSkill.skill, weaponSkill.label, COMBAT_SKILL_XP);
      trainAttribute(state, 'str', MELEE_ATTR_XP);
      trainAttribute(state, 'coord', MELEE_ATTR_XP);
      trainAttribute(state, 'quick', MELEE_ATTR_XP);
      if (Math.random() * 100 >= hitChance(weaponSkill.skill.rank)) {
        addLog(state, `You swing and miss ${m.name}.`, 'dim');
        continue;
      }

      const { dmg, crit } = dealDamage(stats.atk * stance.dmgMult, m.def, stats.critChance);
      if (stance.bleed) applyBleed(state, stats.atk);
      // No heal on kill — the Lifestone (respawn) is how you recover. Skills (Healing,
      // Cooking, Life Magic) will add in-fight recovery later.
      if (applyDamageToMonster(state, dmg, crit)) return;
    }
  }

  // Monster attacks (hero may Dodge/Block/Parry to avoid entirely; otherwise
  // Resistance for the attack's damage type reduces how much gets through)
  h.monsterTimer += dt;
  while (h.monsterTimer >= MONSTER_ATTACK_INTERVAL) {
    h.monsterTimer -= MONSTER_ATTACK_INTERVAL;

    const avoidedBy = tryDefend(state, stats);
    if (avoidedBy) {
      pushFx({ type: 'dodge', target: 'hero' });
      addLog(state, `${avoidedBy}! You avoid ${m.name}'s attack.`, 'dim');
      continue;
    }

    const resistSkill = h.skills.resistance[m.dmgType];
    const resistName = `${m.dmgType[0].toUpperCase()}${m.dmgType.slice(1)} Resistance`;
    trainSkill(state, resistSkill, resistName, COMBAT_SKILL_XP);
    const mitigation = Math.min(95, resistanceMitigationPct(resistSkill.rank) + (stats.resistanceBonus[m.dmgType] || 0));

    const { dmg: rawDmg } = dealDamage(m.atk, stats.def, 0);
    const dmg = Math.max(1, Math.round(rawDmg * (1 - mitigation / 100)));
    h.hp -= dmg;
    trainAttribute(state, 'end', HIT_TAKEN_END_XP);
    pushFx({ type: 'hit', target: 'hero', dmg });
    if (h.hp <= 0) {
      h.hp = 0;
      h.dead = true;
      h.respawnTimer = RESPAWN_DELAY;
      handleHeroDeath(state);
      addLog(state, `You fall to ${m.name}. Your Lifestone shimmers, calling you back...`, 'boss');
      return;
    }
  }

  // Slow passive regen for all three vitals (healing/meditation are skills, not a given)
  h.hp = Math.min(stats.maxHp, h.hp + stats.maxHp * HP_REGEN_PER_SECOND * dt);
  h.stamina = Math.min(stats.maxStamina, h.stamina + stats.maxStamina * STAMINA_REGEN_PER_SECOND * dt);
  h.mana = Math.min(stats.maxMana, h.mana + stats.maxMana * MANA_REGEN_PER_SECOND * dt);
}

// Bail on the current tutorial-road encounter instead of fighting it. Always
// succeeds; trains Run a little for the trouble, same as any other travel time.
export function fleeTutorialEncounter(state) {
  if (!(state.travel && state.travel.tutorial) || !state.monster) return false;
  addLog(state, `You break away and keep moving, leaving the ${state.monster.name} behind.`, 'dim');
  state.monster = null;
  grantAthleticsXp(state, 8);
  return true;
}
