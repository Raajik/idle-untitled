// Combat: pure tick-based battle resolution. Mutates state; no DOM access.

import { getZone, ZONES } from '../data/zones.js';
import { pick, rand } from '../engine/rng.js';
import { derivedStats, grantXp } from './hero.js';
import { rollDrop, maybeAutoEquip } from './loot.js';
import { addLog } from './state.js';

const MONSTER_ATTACK_INTERVAL = 1.2; // seconds
const RESPAWN_DELAY = 3.0;

// Gentle per-kill ramp within a zone: +2% stats per kill.
function ramp(killsInZone) {
  return 1 + killsInZone * 0.02;
}

export function spawnMonster(state) {
  const zone = getZone(state.progress.zone);
  const r = ramp(state.progress.killsInZone);
  const needsBoss =
    state.progress.killsInZone >= zone.killsToBoss && !state.progress[`bossDead_${state.progress.zone}`];

  const def = needsBoss ? zone.boss : pick(zone.monsters);
  state.monster = {
    name: def.name,
    maxHp: Math.round(def.hp * r),
    hp: Math.round(def.hp * r),
    atk: Math.round(def.atk * r),
    def: Math.round(def.def * r),
    xp: def.xp,
    gold: def.gold,
    isBoss: needsBoss,
  };
  if (needsBoss) addLog(state, `☠ ${def.name} appears!`, 'boss');
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

  const goldGain = Math.round(m.gold * (1 + stats.goldPct / 100));
  state.gold += goldGain;
  p.totalGoldEarned += goldGain;

  const levels = grantXp(state, m.xp);

  p.totalKills += 1;
  if (m.isBoss) {
    p[`bossDead_${p.zone}`] = true;
    p.bossesKilled += 1;
    p.bossActive = false;
    addLog(state, `☠ ${m.name} defeated! +${m.xp} XP, +${goldGain} gold`, 'boss');
    if (p.zone + 1 < ZONES.length && p.highestZone < p.zone + 1) {
      p.highestZone = p.zone + 1;
      addLog(state, `New zone unlocked: ${getZone(p.zone + 1).name}!`, 'good');
    }
  } else {
    p.killsInZone += 1;
    addLog(state, `${m.name} slain. +${m.xp} XP, +${goldGain} gold`, 'dim');
  }

  if (levels > 0) addLog(state, `Level up! Now level ${state.hero.level} (+${levels * 3} stat points)`, 'good');

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
  const h = state.hero;
  const stats = derivedStats(state);

  if (h.hp === 0) h.hp = stats.maxHp; // initialize on first tick

  if (h.dead) {
    h.respawnTimer -= dt;
    if (h.respawnTimer <= 0) {
      h.dead = false;
      h.hp = stats.maxHp;
      addLog(state, 'You revive, ready to fight again.', 'dim');
    }
    return;
  }

  if (!state.monster) spawnMonster(state);
  const m = state.monster;

  // Hero attacks
  h.attackTimer += dt;
  const attackInterval = 1 / stats.spd;
  while (h.attackTimer >= attackInterval) {
    h.attackTimer -= attackInterval;
    const { dmg, crit } = dealDamage(stats.atk, m.def, stats.critChance);
    m.hp -= dmg;
    if (crit) addLog(state, `Critical hit! ${dmg} damage to ${m.name}.`, 'dim');
    if (m.hp <= 0) {
      onMonsterDeath(state);
      spawnMonster(state);
      // HP regen between fights: recover 30% of max
      h.hp = Math.min(stats.maxHp, h.hp + Math.round(stats.maxHp * 0.3));
      return;
    }
  }

  // Monster attacks
  h.monsterTimer += dt;
  while (h.monsterTimer >= MONSTER_ATTACK_INTERVAL) {
    h.monsterTimer -= MONSTER_ATTACK_INTERVAL;
    const { dmg } = dealDamage(m.atk, stats.def, 0);
    h.hp -= dmg;
    if (h.hp <= 0) {
      h.hp = 0;
      h.dead = true;
      h.respawnTimer = RESPAWN_DELAY;
      addLog(state, `You were slain by ${m.name}... reviving soon.`, 'boss');
      return;
    }
  }

  // Slow passive regen in combat
  h.hp = Math.min(stats.maxHp, h.hp + stats.maxHp * 0.02 * dt);
}

// Travel to an unlocked zone. Only allowed between fights is NOT required — swap freely.
export function travelToZone(state, zoneIndex) {
  if (zoneIndex < 0 || zoneIndex > state.progress.highestZone) return false;
  state.progress.zone = zoneIndex;
  state.progress.killsInZone = 0;
  state.monster = null;
  state.hero.attackTimer = 0;
  addLog(state, `Traveled to ${getZone(zoneIndex).name}.`, 'good');
  return true;
}
