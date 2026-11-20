// combat.js — Port Solace's gunplay: a hitscan pistol on the crosshair, tracer fire,
// muzzle flash, enemies who close in and shoot back, and the damage that feeds the
// WASTED screen. Buildings block shots; witnesses report the noise to the police.

import * as THREE from 'three';
import { sound } from './audio.js';

const PISTOL = { cooldown: 0.21, damage: 34, range: 90 };
const ENEMY = { damageMin: 3, damageMax: 8, range: 34, cooldownMin: 0.9, cooldownMax: 1.9 };

function raySphere(origin, dir, cx, cy, cz, r) {
  const ox = cx - origin.x, oy = cy - origin.y, oz = cz - origin.z;
  const tca = ox * dir.x + oy * dir.y + oz * dir.z;
  if (tca < 0) return -1;
  const d2 = ox * ox + oy * oy + oz * oz - tca * tca;
  if (d2 > r * r) return -1;
  return tca - Math.sqrt(r * r - d2);
}

function rayAabb(origin, dir, c) {
  // colliders are footprints; treat them as 40-tall boxes for shot blocking
  let tmin = 0, tmax = Infinity;
  const axes = [
    [origin.x, dir.x, c.minX, c.maxX],
    [origin.z, dir.z, c.minZ, c.maxZ],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-8) { if (o < lo || o > hi) return -1; }
    else {
      let t1 = (lo - o) / d, t2 = (hi - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return -1;
    }
  }
  if (origin.y > 40) return -1;
  return tmin;
}

export function segmentBlocked(colliders, x1, z1, x2, z2) {
  const origin = new THREE.Vector3(x1, 1.3, z1);
  const dir = new THREE.Vector3(x2 - x1, 0, z2 - z1);
  const len = dir.length();
  if (len < 0.01) return false;
  dir.normalize();
  for (const c of colliders) {
    const t = rayAabb(origin, dir, c);
    if (t > 0 && t < len) return true;
  }
  return false;
}

export class Combat {
  // ctx: { player, peds, police, effects, colliders, onPlayerDeath, onCrime }
  constructor(scene, ctx) {
    this.scene = scene;
    this.ctx = ctx;
    this.cooldown = 0;
    this.tracers = [];
    this.flashLight = new THREE.PointLight(0xffc46b, 0, 12);
    scene.add(this.flashLight);
    this.flashTime = 0;
  }

  _tracer(from, to, colour = 0xffe28a) {
    let tr = this.tracers.find((t) => t.life <= 0);
    if (!tr) {
      if (this.tracers.length >= 14) tr = this.tracers[0];
      else {
        const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
        const mat = new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: 0 });
        const line = new THREE.Line(geo, mat);
        line.frustumCulled = false;
        this.scene.add(line);
        tr = { line, life: 0 };
        this.tracers.push(tr);
      }
    }
    const pos = tr.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    tr.line.material.color.setHex(colour);
    tr.life = 0.07;
    tr.line.material.opacity = 0.95;
  }

  tryShoot() {
    const { player, peds, police, effects } = this.ctx;
    if (this.cooldown > 0 || player.mode !== 'foot') return false;
    this.cooldown = PISTOL.cooldown;
    const origin = player.camera.position.clone();
    const dir = player.aimDirection();
    const gunPos = new THREE.Vector3(
      player.x + Math.sin(player.heading) * 0.45, 1.35,
      player.z + Math.cos(player.heading) * 0.45);

    let bestT = PISTOL.range;
    let hitPed = null;
    for (const ped of peds.peds) {
      if (ped.state === 'down' || ped.state === 'dead' || ped.state === 'passenger') continue;
      const t = raySphere(origin, dir, ped.x, 1.15, ped.z, 0.62);
      if (t > 0 && t < bestT) { bestT = t; hitPed = ped; }
    }
    for (const c of this.ctx.colliders) {
      const t = rayAabb(origin, dir, c);
      if (t > 0 && t < bestT) { bestT = t; hitPed = null; }
    }
    const end = origin.clone().add(dir.clone().multiplyScalar(bestT));
    this._tracer(gunPos, end);
    effects.muzzle(gunPos);
    this.flashLight.position.copy(gunPos);
    this.flashLight.intensity = 14;
    this.flashTime = 0.05;
    sound.gunshot(false);
    peds.alarm(player.x, player.z, 26);
    police.reportCrime('shot', player.x, player.z, police.witnessed(player.x, player.z, peds));

    if (hitPed) {
      effects.bloodlessPuff(end);
      if (hitPed.isEnemy) {
        hitPed.health -= PISTOL.damage;
        if (hitPed.health <= 0) peds.knockDown(hitPed);
      } else {
        peds.knockDown(hitPed, true);
        police.reportCrime('hitPed', hitPed.x, hitPed.z, true);
      }
    }
    return true;
  }

  _enemyFire(ped, playerPos) {
    const from = new THREE.Vector3(ped.x, 1.35, ped.z);
    const spread = () => (Math.random() - 0.5) * 1.6;
    const to = new THREE.Vector3(playerPos.x + spread(), 1.2, playerPos.z + spread());
    this._tracer(from, to, 0xff9a5c);
    sound.gunshot(true);
    const dist = Math.hypot(ped.x - playerPos.x, ped.z - playerPos.z);
    const hitChance = Math.max(0.12, 0.52 - dist * 0.011);
    if (Math.random() < hitChance) {
      const dmg = ENEMY.damageMin + Math.random() * (ENEMY.damageMax - ENEMY.damageMin);
      this.ctx.player.health -= dmg;
      this.ctx.effects.addShake(0.12);
      if (this.ctx.onPlayerHurt) this.ctx.onPlayerHurt(dmg);
    }
  }

  update(dt) {
    const { player, peds } = this.ctx;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.flashTime > 0) { this.flashTime -= dt; if (this.flashTime <= 0) this.flashLight.intensity = 0; }
    for (const tr of this.tracers) {
      if (tr.life > 0) { tr.life -= dt; tr.line.material.opacity = Math.max(0, tr.life / 0.07) * 0.95; }
    }
    if (player.mode !== 'foot' && player.mode !== 'drive') return;
    const ppos = player.pos;
    for (const ped of peds.peds) {
      if (!ped.isEnemy || ped.state === 'down' || ped.state === 'dead') continue;
      const dx = ppos.x - ped.x, dz = ppos.z - ped.z;
      const dist = Math.hypot(dx, dz);
      const face = Math.atan2(dx, dz);
      let moveX = 0, moveZ = 0;
      const blocked = segmentBlocked(this.ctx.colliders, ped.x, ped.z, ppos.x, ppos.z);
      if (dist > 21 || blocked) {
        moveX = Math.sin(face) * 3.1; moveZ = Math.cos(face) * 3.1;
      } else if (dist < 9) {
        moveX = -Math.sin(face) * 1.6; moveZ = -Math.cos(face) * 1.6;
      } else {
        const strafeDir = (ped.id % 2 ? 1 : -1);
        moveX = Math.cos(face) * strafeDir * 1.1; moveZ = -Math.sin(face) * strafeDir * 1.1;
      }
      ped.intent = { moveX, moveZ, face };
      ped.shootCd -= dt;
      if (ped.shootCd <= 0 && dist < ENEMY.range && !blocked && player.mode === 'foot') {
        ped.shootCd = ENEMY.cooldownMin + Math.random() * (ENEMY.cooldownMax - ENEMY.cooldownMin);
        this._enemyFire(ped, ppos);
      }
    }
  }
}
