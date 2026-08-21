// Combat: pure tick-based battle resolution. Mutates state; no DOM access.
// Combat only runs when the hero is standing at a POI (not travelling, not in town).
// Difficulty within a POI ("depth") rises with time spent and kills, resets when
// you travel away, and gates the boss in as a random encounter rather than a
// one-time unlock.

import { getPoiById } from '../data/regions.js';
import { monsterStatsForLevel, bossStatsForLevel } from '../data/monsterScaling.js';
import { TUTORIAL_ROAD } from '../data/tutorial.js';
import { pick } from '../engine/rng.js';
import { pushFx } from '../engine/fx.js';
import { fmt } from '../engine/format.js';
import { derivedStats, grantXp } from './hero.js';
import { rollDrop, maybeAutoEquip } from './loot.js';
import { addLog } from './state.js';
import { tickTravel, arrive } from './travel.js';
import { tickRecallCooldown } from './lifestone.js';
import { trainSkill, defensiveChance, hitChance, activeWeaponSkill, grantRunXp, RECALL_XP_ON_DEATH, COMBAT_SKILL_XP } from './skills.js';

const MONSTER_ATTACK_INTERVAL = 1.2; // seconds
const RESPAWN_DELAY = 3.0;

const DEPTH_CAP = 3.0;
const BOSS_DEPTH_THRESHOLD = 0.75;
const BOSS_CHANCE_AT_THRESHOLD = 0.075;
const BOSS_CHANCE_CAP = 0.28;
const MIN_TRASH_AFTER_BOSS = 3;

const HERO_STAMINA_COST_PER_DEFEND = 4;
const MONSTER_STAMINA_COST_PER_DODGE = 3;

const DEFEND_LAYERS = [
  ['dodge', 'Dodge'],
  ['block', 'Block'],
  ['parry', 'Parry'],
];

// Difficulty multiplier for the current POI: rises with time spent and kills,
// capped so a POI can't scale forever.
export function computeDepth(progress) {
  return Math.min(DEPTH_CAP, progress.timeInPoi * 0.0025 + progress.killsInPoi * 0.01);
}

function bossChance(depth) {
  if (depth < BOSS_DEPTH_THRESHOLD) return 0;
  const t = (depth - BOSS_DEPTH_THRESHOLD) / (DEPTH_CAP - BOSS_DEPTH_THRESHOLD);
  return BOSS_CHANCE_AT_THRESHOLD + t * (BOSS_CHANCE_CAP - BOSS_CHANCE_AT_THRESHOLD);
}

function resolvePoi(state) {
  return state.location.poiId === TUTORIAL_ROAD.id ? TUTORIAL_ROAD : getPoiById(state.location.poiId);
}

export function spawnMonster(state) {
  const poi = resolvePoi(state);
  const p = state.progress;
  const depth = computeDepth(p);
  p.poiDepth = depth;

  const canRollBoss = p.killsSinceBoss >= MIN_TRASH_AFTER_BOSS && Math.random() < bossChance(depth);
  const def = canRollBoss ? poi.boss : pick(poi.monsters);
  const base = canRollBoss ? bossStatsForLevel(def.level) : monsterStatsForLevel(def.level);
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
    isBoss: canRollBoss,
    dodge: base.dodge,
    maxStamina: Math.round(base.maxStamina * (1 + depth * 0.5)),
    stamina: Math.round(base.maxStamina * (1 + depth * 0.5)),
  };
  if (canRollBoss) addLog(state, `☠ ${def.name} appears!`, 'boss');
}

function dealDamage(rawAtk, targetDef, critChance) {
  const variance = 0.9 + Math.random() * 0.2;
  let dmg = Math.max(1, Math.round((rawAtk - targetDef) * variance));
  const crit = Math.random() * 100 < critChance;
  if (crit) dmg *= 2;
  return { dmg, crit };
}

// Rolls the hero's defensive layers (Dodge, Block, Parry, then Resistance for the
// attack's damage type) in order. Each layer only trains and can only succeed while
// the hero has stamina to spend; running out of stamina mid-swing just means the
// remaining layers are skipped. Returns the layer name that avoided the hit, or null.
function tryDefend(state, dmgType) {
  const h = state.hero;
  const layers = [...DEFEND_LAYERS, ['resistance', null]];
  for (const [key, label] of layers) {
    const skill = key === 'resistance' ? h.skills.resistance[dmgType] : h.skills[key];
    const name = label || `${dmgType[0].toUpperCase()}${dmgType.slice(1)} Resistance`;
    trainSkill(state, skill, name, COMBAT_SKILL_XP);
    if (h.stamina < HERO_STAMINA_COST_PER_DEFEND) continue;
    if (Math.random() * 100 < defensiveChance(skill.rank)) {
      h.stamina -= HERO_STAMINA_COST_PER_DEFEND;
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
  if (m.isBoss) {
    p.bossesKilled += 1;
    p.killsSinceBoss = 0;
    addLog(state, `☠ ${m.name} defeated! +${fmt(m.xp)} XP, +${fmt(pyrealsGain)} pyreals`, 'boss');
  } else {
    p.killsInPoi += 1;
    p.killsSinceBoss += 1;
    addLog(state, `${m.name} slain. +${fmt(m.xp)} XP, +${fmt(pyrealsGain)} pyreals`, 'dim');
  }

  if (levels > 0) {
    addLog(state, `Level up! Now level ${state.hero.level}.`, 'good');
    pushFx({ type: 'levelup' });
  }

  if (state.location.poiId === TUTORIAL_ROAD.id) return; // roadside critters carry nothing to loot

  const drop = rollDrop(state, m.isBoss);
  if (drop) {
    p.totalDrops += 1;
    if (maybeAutoEquip(state, drop)) {
      addLog(state, `⚔ Auto-equipped ${drop.name} [${drop.rarity}]`, 'loot-line');
    } else {
      state.inventory.push(drop);
      addLog(state, `⚔ Loot: ${drop.name} [${drop.rarity}]`, 'loot-line');
    }
  }
}

// Fires once, the first time the hero ever dies: Alcott's second beat, which
// unlocks Lifestone Recall. Every death (not just the first) nudges Recall's xp.
function handleHeroDeath(state) {
  const p = state.progress;
  trainSkill(state, state.hero.skills.lifestone.recall, 'Lifestone Recall', RECALL_XP_ON_DEATH);
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
  grantRunXp(state, dt);
  if (state.travel.remaining <= 0) {
    state.monster = null;
    arrive(state);
    state.onboarding.tutorialPending = false;
  }
}

// One game tick. dt in seconds.
export function tickCombat(state, dt) {
  tickRecallCooldown(state, dt);

  if (state.travel && state.travel.tutorial) {
    tickTutorialJourney(state, dt);
  } else if (tickTravel(state, dt)) {
    return; // travelling: no combat, Run trains instead
  }

  const h = state.hero;
  if (!state.location.poiId) return; // in town: nothing to fight

  const stats = derivedStats(state);

  if (h.hp === 0) h.hp = stats.maxHp; // initialize on first tick
  if (h.stamina === 0) h.stamina = stats.maxStamina;
  if (h.mana === 0) h.mana = stats.maxMana;

  if (h.dead) {
    h.respawnTimer -= dt;
    if (h.respawnTimer <= 0) {
      h.dead = false;
      h.hp = stats.maxHp;
      addLog(state, 'You awaken at your Lifestone, ready to fight again.', 'dim');
    }
    return;
  }

  state.progress.timeInPoi += dt;
  if (!state.monster) spawnMonster(state);
  const m = state.monster;

  // Hero attacks (the monster may dodge, spending its stamina to do so)
  h.attackTimer += dt;
  const attackInterval = 1 / stats.spd;
  while (h.attackTimer >= attackInterval) {
    h.attackTimer -= attackInterval;

    if (m.stamina >= MONSTER_STAMINA_COST_PER_DODGE && Math.random() * 100 < m.dodge) {
      m.stamina -= MONSTER_STAMINA_COST_PER_DODGE;
      pushFx({ type: 'dodge', target: 'monster' });
      addLog(state, `${m.name} dodges your attack!`, 'dim');
      continue;
    }

    const weaponSkill = activeWeaponSkill(state);
    trainSkill(state, weaponSkill.skill, weaponSkill.label, COMBAT_SKILL_XP);
    if (Math.random() * 100 >= hitChance(weaponSkill.skill.rank)) {
      addLog(state, `You swing and miss ${m.name}.`, 'dim');
      continue;
    }

    const { dmg, crit } = dealDamage(stats.atk, m.def, stats.critChance);
    m.hp -= dmg;
    pushFx({ type: 'hit', target: 'monster', dmg, crit });
    if (crit) addLog(state, `Critical hit! ${dmg} damage to ${m.name}.`, 'dim');
    if (m.hp <= 0) {
      pushFx({ type: 'kill', target: 'monster' });
      onMonsterDeath(state);
      spawnMonster(state);
      // No heal on kill — the Lifestone (respawn) is how you recover. Skills (Healing,
      // Cooking, Life Magic) will add in-fight recovery later.
      return;
    }
  }

  // Monster attacks (hero may Dodge/Block/Parry/Resist based on its damage type)
  h.monsterTimer += dt;
  while (h.monsterTimer >= MONSTER_ATTACK_INTERVAL) {
    h.monsterTimer -= MONSTER_ATTACK_INTERVAL;

    const avoidedBy = tryDefend(state, m.dmgType);
    if (avoidedBy) {
      pushFx({ type: 'dodge', target: 'hero' });
      addLog(state, `${avoidedBy}! You avoid ${m.name}'s attack.`, 'dim');
      continue;
    }

    const { dmg } = dealDamage(m.atk, stats.def, 0);
    h.hp -= dmg;
    pushFx({ type: 'hit', target: 'hero', dmg });
    if (h.hp <= 0) {
      h.hp = 0;
      h.dead = true;
      h.respawnTimer = RESPAWN_DELAY;
      handleHeroDeath(state);
      if (m.isBoss) {
        // Losing to the boss makes it retreat — depth is kept, so you can challenge
        // it again once you've clawed back the trash kills needed to re-roll it.
        state.monster = null;
        addLog(state, `The ${m.name} batters you down and retreats into the depths. Regain your strength and try again.`, 'boss');
      } else {
        addLog(state, `You fall to ${m.name}. Your Lifestone shimmers, calling you back...`, 'boss');
      }
      return;
    }
  }

  // Slow passive regen for all three vitals (healing/meditation are skills, not a given)
  h.hp = Math.min(stats.maxHp, h.hp + stats.maxHp * 0.01 * dt);
  h.stamina = Math.min(stats.maxStamina, h.stamina + stats.maxStamina * 0.03 * dt);
  h.mana = Math.min(stats.maxMana, h.mana + stats.maxMana * 0.02 * dt);
}

// Bail on the current tutorial-road encounter instead of fighting it. Always
// succeeds; trains Run a little for the trouble, same as any other travel time.
export function fleeTutorialEncounter(state) {
  if (!(state.travel && state.travel.tutorial) || !state.monster) return false;
  addLog(state, `You break away and keep moving, leaving the ${state.monster.name} behind.`, 'dim');
  state.monster = null;
  grantRunXp(state, 8);
  return true;
}
