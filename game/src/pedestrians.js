// pedestrians.js — the people of Port Solace: low-poly walkers who stroll the
// sidewalks, cross at corners, flee from gunfire and speeding cars, and fall when hit.
// Mission rivals are pedestrians with health and a grudge, driven from combat.js.

import * as THREE from 'three';
import { WORLD, makeRng, pick } from './config.js';
import { collideCircle, isWater } from './city.js';

const SKIN = [0xf2c49b, 0xc68863, 0x8a5a3b, 0x6e4530, 0xffdbac];
const SHIRTS = [0xe2543e, 0x2c7a9c, 0xf2b13d, 0x51a06b, 0xe5e7ea, 0xc86f8a, 0x7a4a8e, 0x274156, 0xff8c42, 0x3ec1d3];
const PANTS = [0x2b3a4a, 0x5a4632, 0x707880, 0x30323a, 0x7a2e35];

const legGeo = new THREE.BoxGeometry(0.17, 0.78, 0.2);
const torsoGeo = new THREE.BoxGeometry(0.52, 0.72, 0.28);
const armGeo = new THREE.BoxGeometry(0.13, 0.66, 0.16);
const headGeo = new THREE.BoxGeometry(0.3, 0.34, 0.3);

export function makePersonMesh(rng, opts = {}) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: opts.skin ?? pick(rng, SKIN) });
  const shirt = new THREE.MeshLambertMaterial({ color: opts.shirt ?? pick(rng, SHIRTS) });
  const pants = new THREE.MeshLambertMaterial({ color: opts.pants ?? pick(rng, PANTS) });
  const legL = new THREE.Mesh(legGeo, pants); legL.position.set(0.14, 0.39, 0);
  const legR = new THREE.Mesh(legGeo, pants); legR.position.set(-0.14, 0.39, 0);
  const torso = new THREE.Mesh(torsoGeo, shirt); torso.position.y = 1.14;
  const armL = new THREE.Mesh(armGeo, shirt); armL.position.set(0.34, 1.16, 0);
  const armR = new THREE.Mesh(armGeo, shirt); armR.position.set(-0.34, 1.16, 0);
  const head = new THREE.Mesh(headGeo, skin); head.position.y = 1.68;
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.32),
    new THREE.MeshLambertMaterial({ color: opts.hair ?? pick(rng, [0x2a1c10, 0x4a2f18, 0x14100c, 0x8a8f98, 0xb5541e]) }));
  hair.position.y = 1.88;
  for (const m of [legL, legR, torso, armL, armR, head]) m.castShadow = true;
  group.add(legL, legR, torso, armL, armR, head, hair);
  group.userData = { legL, legR, armL, armR, torso, head };
  return group;
}

export class PedestrianSystem {
  constructor(scene, seed = 7, colliders = []) {
    this.scene = scene;
    this.rng = makeRng(seed * 733 + 21);
    this.colliders = colliders;
    this.peds = [];
    for (let i = 0; i < 42; i++) this.peds.push(this._spawnWalker());
  }

  _sidewalkSpawn() {
    // pick a street, walk its pavement: offset just outside the asphalt
    const rng = this.rng;
    const horizontal = rng() < 0.5;
    const line = pick(rng, WORLD.roadLines);
    const side = rng() < 0.5 ? 1 : -1;
    const off = side * (WORLD.roadWidth / 2 + 1.6);
    const along = -168 + rng() * 336;
    return horizontal ? { x: along, z: line + off } : { x: line + off, z: along };
  }

  _spawnWalker() {
    const rng = this.rng;
    const { x, z } = this._sidewalkSpawn();
    const group = makePersonMesh(rng);
    group.position.set(x, 0, z);
    this.scene.add(group);
    const ped = {
      group, x, z, heading: rng() * Math.PI * 2,
      speed: 0, walkPhase: rng() * 6.28,
      state: 'walk',           // walk | flee | down | dead | enemy | passenger
      stateTime: 0, threat: null,
      health: 100, isEnemy: false, id: this.peds.length,
      targetX: x, targetZ: z, retarget: 0,
    };
    this._pickTarget(ped);
    return ped;
  }

  spawnEnemy(x, z, opts = {}) {
    const group = makePersonMesh(this.rng, { shirt: 0x30323a, pants: 0x22242a, ...opts });
    group.position.set(x, 0, z);
    this.scene.add(group);
    const ped = {
      group, x, z, heading: Math.PI, speed: 0, walkPhase: 0,
      state: 'enemy', stateTime: 0, threat: null,
      health: opts.health ?? 60, isEnemy: true, id: 1000 + this.peds.length,
      targetX: x, targetZ: z, retarget: 0, shootCd: 1 + Math.random() * 2,
    };
    this.peds.push(ped);
    return ped;
  }

  _pickTarget(ped) {
    // wander: aim along the street network — a random point on a nearby pavement
    const rng = this.rng;
    const horizontal = rng() < 0.5;
    const line = pick(rng, WORLD.roadLines);
    const side = rng() < 0.5 ? 1 : -1;
    const off = side * (WORLD.roadWidth / 2 + 1.6);
    const along = Math.max(-170, Math.min(176, (horizontal ? ped.x : ped.z) + (rng() - 0.5) * 160));
    ped.targetX = horizontal ? along : line + off;
    ped.targetZ = horizontal ? line + off : along;
    ped.retarget = 6 + rng() * 10;
  }

  alarm(x, z, radius = 24) {
    for (const ped of this.peds) {
      if (ped.state !== 'walk') continue;
      if (Math.hypot(ped.x - x, ped.z - z) < radius) {
        ped.state = 'flee';
        ped.threat = { x, z };
        ped.stateTime = 2.5 + Math.random() * 2;
      }
    }
  }

  knockDown(ped, cause) {
    if (ped.state === 'down' || ped.state === 'dead') return;
    ped.state = 'down';
    ped.stateTime = ped.isEnemy ? 999 : 3.5;
    if (ped.isEnemy) ped.health = 0;
    ped.group.rotation.x = -Math.PI / 2;
    ped.group.position.y = 0.25;
    if (cause) this.alarm(ped.x, ped.z, 18);
  }

  update(dt, threats = []) {
    for (const ped of this.peds) {
      const g = ped.group;
      if (ped.state === 'dead' || ped.state === 'passenger') continue;
      if (ped.state === 'down') {
        ped.stateTime -= dt;
        if (ped.stateTime <= 0 && !ped.isEnemy) {
          ped.state = 'walk';
          g.rotation.x = 0; g.position.y = 0;
          this._pickTarget(ped);
        }
        continue;
      }
      if (ped.state === 'enemy') { this._updateEnemy(ped, dt); continue; }

      // flee from the nearest live threat (gunfire point, fast car, player menace)
      let threat = ped.state === 'flee' ? ped.threat : null;
      for (const t of threats) {
        if (Math.hypot(ped.x - t.x, ped.z - t.z) < (t.radius ?? 9)) { threat = t; break; }
      }
      let speedTarget = 1.5;
      if (threat) {
        ped.state = 'flee';
        ped.stateTime = Math.max(ped.stateTime, 1.2);
        const away = Math.atan2(ped.x - threat.x, ped.z - threat.z);
        ped.targetX = ped.x + Math.sin(away) * 18;
        ped.targetZ = ped.z + Math.cos(away) * 18;
        speedTarget = 4.6;
      } else if (ped.state === 'flee') {
        ped.stateTime -= dt;
        if (ped.stateTime <= 0) { ped.state = 'walk'; this._pickTarget(ped); }
      }

      ped.retarget -= dt;
      if (ped.retarget <= 0 && ped.state === 'walk') this._pickTarget(ped);
      const dx = ped.targetX - ped.x, dz = ped.targetZ - ped.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.4) {
        const targetHeading = Math.atan2(dx, dz);
        let diff = targetHeading - ped.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        ped.heading += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));
        ped.speed += (speedTarget - ped.speed) * Math.min(1, dt * 4);
        ped.x += Math.sin(ped.heading) * ped.speed * dt;
        ped.z += Math.cos(ped.heading) * ped.speed * dt;
      } else {
        ped.speed *= 0.8;
        if (ped.state === 'walk') this._pickTarget(ped);
      }
      if (isWater(ped.x, ped.z)) { ped.z = WORLD.waterStart - 1; ped.stateTime = 0; }
      const [cx, cz] = collideCircle(this.colliders, ped.x, ped.z, 0.45);
      ped.x = cx; ped.z = cz;
      ped.x = Math.max(-182, Math.min(182, ped.x));
      ped.z = Math.max(-182, Math.min(262, ped.z));
      this._animate(ped, dt);
    }
  }

  _updateEnemy(ped, dt) {
    // combat.js steers enemies through ped.intent; here we just animate + integrate.
    const intent = ped.intent || { moveX: 0, moveZ: 0, face: ped.heading };
    ped.heading = intent.face;
    ped.x += intent.moveX * dt;
    ped.z += intent.moveZ * dt;
    ped.speed = Math.hypot(intent.moveX, intent.moveZ);
    const [cx, cz] = collideCircle(this.colliders, ped.x, ped.z, 0.45);
    ped.x = cx; ped.z = cz;
    this._animate(ped, dt);
  }

  _animate(ped, dt) {
    const g = ped.group;
    g.position.set(ped.x, 0, ped.z);
    g.rotation.y = ped.heading;
    ped.walkPhase += dt * (2 + ped.speed * 2.4);
    const swing = Math.min(1, ped.speed / 2) * 0.55;
    const u = g.userData;
    u.legL.rotation.x = Math.sin(ped.walkPhase) * swing;
    u.legR.rotation.x = -Math.sin(ped.walkPhase) * swing;
    u.armL.rotation.x = -Math.sin(ped.walkPhase) * swing * 0.8;
    u.armR.rotation.x = Math.sin(ped.walkPhase) * swing * 0.8;
  }

  nearest(x, z, maxDist, states = ['walk', 'flee']) {
    let best = null, bestD = maxDist;
    for (const ped of this.peds) {
      if (!states.includes(ped.state)) continue;
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d < bestD) { bestD = d; best = ped; }
    }
    return best;
  }

  countAliveEnemies() {
    return this.peds.filter((p) => p.isEnemy && p.state !== 'down' && p.state !== 'dead').length;
  }
}
