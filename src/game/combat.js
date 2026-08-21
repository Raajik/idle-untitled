// Combat: pure tick-based battle resolution. Mutates state; no DOM access.

import { getZone, ZONES } from '../data/zones.js';
import { pick, rand } from '../engine/rng.js';
import { pushFx } from '../engine/fx.js';
import { derivedStats, grantXp } from './hero.js';
import { rollDrop, maybeAutoEquip } from './loot.js';
import { addLog } from './state.js';

const MONSTER_ATTACK_INTERVAL = 1.2; // seconds
const RESPAWN_DELAY = 3.0;

// Gentle per-kill ramp within a zone: +1% stats per kill.
function ramp(killsInZone) {
  return 1 + killsInZone * 0.01;
}

export function spawnMonster(state) {
  const zone = getZone(state.progress.zone);
  const needsBoss =
    state.progress.killsInZone >= zone.killsToBoss && !state.progress[`bossDead_${state.progress.zone}`];

  const def = needsBoss ? zone.boss : pick(zone.monsters);
  // Bosses are a fixed challenge (no per-kill ramp); normal monsters ramp gently.
  const r = needsBoss ? 1 : ramp(state.progress.killsInZone);
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

  if (levels > 0) {
    addLog(state, `Level up! Now level ${state.hero.level} (+${levels * 3} stat points)`, 'good');
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
  const h = state.hero;
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
        // Losing to the boss makes it retreat — you fall back to grinding normal
        // monsters and can challenge it again once stronger.
        state.progress.killsInZone = 0;
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
