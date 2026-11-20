// police.js — Port Solace PD: the wanted system and its drivers.
// Heat is a float that crimes push up (witnessed crimes push hardest); stars are the
// band it sits in. Interceptors spawn on the road grid proportional to the stars and
// steer a pursuit of the player; lose every officer's sight and the heat bleeds away.
// An officer who keeps the player in arm's reach on foot long enough makes the bust.

import { WANTED, WORLD } from './config.js';
import { createCar, stepCarPhysics, collideCarWorld, syncCarMesh } from './vehicles.js';
import { sound } from './audio.js';

const CRIME_HEAT = {
  theft: WANTED.theftHeat,
  hitPed: WANTED.hitPedHeat,
  hitCar: WANTED.hitCarHeat,
  shot: WANTED.shotHeat,
  vandal: 0.3,
};

export class PoliceSystem {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.heat = 0;
    this.heatFloor = 0;          // missions can pin a minimum while a chase is scripted
    this.officers = [];
    this.sinceSeen = 99;         // seconds since any officer last had eyes on the player
    this.bustedTimer = 0;
    this.flashPhase = 0;
    this.spawnCooldown = 0;
  }

  get stars() {
    return Math.max(0, Math.min(WANTED.maxStars, Math.ceil(this.heat - 0.001)));
  }

  witnessed(x, z, peds) {
    for (const o of this.officers) {
      if (Math.hypot(o.x - x, o.z - z) < 42) return true;
    }
    if (peds) for (const ped of peds.peds) {
      if ((ped.state === 'walk' || ped.state === 'flee') && Math.hypot(ped.x - x, ped.z - z) < WANTED.witnessRadius) return true;
    }
    return false;
  }

  reportCrime(kind, x, z, wasWitnessed) {
    const base = CRIME_HEAT[kind] ?? 0.3;
    this.heat = Math.min(WANTED.maxStars + 0.9, this.heat + base * (wasWitnessed ? 1 : 0.22));
    void x; void z;
  }

  setHeat(value) { this.heat = Math.max(this.heat, value); }
  clearHeat() { this.heat = 0; this.heatFloor = 0; }

  desiredOfficers() {
    const s = this.stars;
    return s === 0 ? 0 : Math.min(WANTED.policeCap, Math.round(s * WANTED.policePerStar));
  }

  _spawnOfficer(playerPos) {
    // appear at a street junction a good run away from the player, never in view's lap
    for (let tries = 0; tries < 8; tries++) {
      const lx = WORLD.roadLines[Math.floor(Math.random() * WORLD.roadLines.length)];
      const lz = WORLD.roadLines[Math.floor(Math.random() * WORLD.roadLines.length)];
      const x = lx + (Math.random() - 0.5) * 8;
      const z = lz + (Math.random() - 0.5) * 8;
      const d = Math.hypot(x - playerPos.x, z - playerPos.z);
      if (d > 62 && d < 150) {
        const car = createCar(this.scene, 'police', 0x22242a, x, z, Math.random() * Math.PI * 2);
        car.driver = 'police';
        this.officers.push(car);
        return car;
      }
    }
    return null;
  }

  _removeOfficer(car) {
    this.scene.remove(car.group);
    this.officers.splice(this.officers.indexOf(car), 1);
  }

  // ctx: { player, effects, onBusted }
  update(dt, ctx) {
    const player = ctx.player;
    const ppos = player.pos;
    this.flashPhase += dt * 6;

    // spawn / despawn to match the wanted level
    this.spawnCooldown -= dt;
    const want = this.desiredOfficers();
    if (this.officers.length < want && this.spawnCooldown <= 0) {
      if (this._spawnOfficer(ppos)) this.spawnCooldown = 1.6;
    }
    for (let i = this.officers.length - 1; i >= 0; i--) {
      const o = this.officers[i];
      const d = Math.hypot(o.x - ppos.x, o.z - ppos.z);
      if ((this.stars === 0 && d > 60) || d > 260) this._removeOfficer(o);
    }

    // who can see the player right now?
    let seen = false;
    let nearest = Infinity;
    for (const o of this.officers) {
      const d = Math.hypot(o.x - ppos.x, o.z - ppos.z);
      nearest = Math.min(nearest, d);
      if (d < 58) seen = true;
    }
    if (seen) this.sinceSeen = 0; else this.sinceSeen += dt;

    // heat decay once the trail is cold
    if (this.sinceSeen > WANTED.seenGraceSeconds && this.heat > this.heatFloor) {
      this.heat = Math.max(this.heatFloor, this.heat - WANTED.decayPerSecond * dt);
    }
    if (this.heat < this.heatFloor) this.heat = this.heatFloor;

    // pursuit driving
    for (const o of this.officers) {
      const dx = ppos.x - o.x, dz = ppos.z - o.z;
      const dist = Math.hypot(dx, dz);
      const targetHeading = Math.atan2(dx, dz);
      let diff = targetHeading - o.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, diff * 1.9));
      let throttle = 1;
      if (player.mode === 'foot' && dist < 8) throttle = 0;         // pull up for the bust
      else if (dist < 4.5) throttle = 0.25;
      else if (Math.abs(diff) > 2.2) throttle = 0.3;                  // turned around: recover
      stepCarPhysics(o, { throttle, steer, brake: false }, dt);
      collideCarWorld(o, this.colliders);
      syncCarMesh(o);
      const bar = o.group.userData.lightBar;
      if (bar) {
        const on = Math.sin(this.flashPhase * 3.1) > 0;
        bar.red.visible = on; bar.blue.visible = !on;
      }
    }

    // the bust: an officer holding position beside a wanted player on foot
    if (player.mode === 'foot' && this.stars >= 1 && nearest < WANTED.bustedRange + 1.2) {
      this.bustedTimer += dt;
      if (this.bustedTimer >= WANTED.bustedSeconds) {
        this.bustedTimer = 0;
        if (ctx.onBusted) ctx.onBusted();
      }
    } else {
      this.bustedTimer = Math.max(0, this.bustedTimer - dt * 2);
    }

    sound.siren(this.officers.length ? Math.max(0, 1 - nearest / 70) : 0);
    this.nearestOfficer = nearest;
  }
}
