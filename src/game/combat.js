// Combat: pure tick-based battle resolution. Mutates state; no DOM access.
// Combat only runs when the hero is standing at a POI (not travelling, not in town).
// Difficulty within a POI ("depth") rises with time spent and kills, resets when
// you travel away, and gates the boss in as a random encounter rather than a
// one-time unlock.

import { getPoiById } from '../data/regions.js';
import { pick, rand } from '../engine/rng.js';
import { pushFx } from '../engine/fx.js';
import { fmt } from '../engine/format.js';
import { derivedStats, grantXp } from './hero.js';
import { rollDrop, maybeAutoEquip } from './loot.js';
import { addLog } from './state.js';
import { tickTravel } from './travel.js';

const MONSTER_ATTACK_INTERVAL = 1.2; // seconds
const RESPAWN_DELAY = 3.0;

const DEPTH_CAP = 3.0;
const BOSS_DEPTH_THRESHOLD = 0.75;
const BOSS_CHANCE_AT_THRESHOLD = 0.075;
const BOSS_CHANCE_CAP = 0.28;
const MIN_TRASH_AFTER_BOSS = 3;

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

export function spawnMonster(state) {
  const poi = getPoiById(state.location.poiId);
  const p = state.progress;
  const depth = computeDepth(p);
  p.poiDepth = depth;

  const canRollBoss = p.killsSinceBoss >= MIN_TRASH_AFTER_BOSS && Math.random() < bossChance(depth);
  const def = canRollBoss ? poi.boss : pick(poi.monsters);
  const r = 1 + depth;
  state.monster = {
    name: def.name,
    maxHp: Math.round(def.hp * r),
    hp: Math.round(def.hp * r),
    atk: Math.round(def.atk * r),
    def: Math.round(def.def * r),
    xp: def.xp,
    pyreals: def.pyreals,
    isBoss: canRollBoss,
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

// One game tick. dt in seconds.
export function tickCombat(state, dt) {
  if (tickTravel(state, dt)) return; // travelling: no combat, Run trains instead

  const h = state.hero;
  if (!state.location.poiId) return; // in town: nothing to fight

  const stats = derivedStats(state);

  if (h.hp === 0) h.hp = stats.maxHp; // initialize on first tick

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

  // Hero attacks
  h.attackTimer += dt;
  const attackInterval = 1 / stats.spd;
  while (h.attackTimer >= attackInterval) {
    h.attackTimer -= attackInterval;
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

  // Monster attacks (hero may dodge based on Coordination)
  h.monsterTimer += dt;
  while (h.monsterTimer >= MONSTER_ATTACK_INTERVAL) {
    h.monsterTimer -= MONSTER_ATTACK_INTERVAL;
    if (Math.random() * 100 < stats.dodge) {
      pushFx({ type: 'dodge', target: 'hero' });
      continue;
    }
    const { dmg } = dealDamage(m.atk, stats.def, 0);
    h.hp -= dmg;
    pushFx({ type: 'hit', target: 'hero', dmg });
    if (h.hp <= 0) {
      h.hp = 0;
      h.dead = true;
      h.respawnTimer = RESPAWN_DELAY;
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

  // Very slow passive regen (healing is a skill, not a given)
  h.hp = Math.min(stats.maxHp, h.hp + stats.maxHp * 0.01 * dt);
}
