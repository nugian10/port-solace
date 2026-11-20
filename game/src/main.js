// main.js — Port Solace's conductor: renderer, lights and the golden-hour sun,
// world construction, the game state machine (menu / play / pause / busted-wasted),
// crime wiring between the player, traffic, pedestrians and police, saving, the
// objective beacon, the live menu backdrop, screenshot mode and the headless
// self-test that ?test=1 runs synchronously.

import * as THREE from 'three';
import { GAME, PLACES } from './config.js';
import { input } from './input.js';
import { buildCity } from './city.js';
import { TrafficSystem, resolveCarPairs } from './vehicles.js';
import { PedestrianSystem } from './pedestrians.js';
import { Player } from './player.js';
import { PoliceSystem } from './police.js';
import { Combat, segmentBlocked } from './combat.js';
import { Missions } from './missions.js';
import { Hud } from './hud.js';
import { Effects } from './effects.js';
import { sound } from './audio.js';
import { hasSave, readSave, writeSave, clearSave } from './save.js';
import { poseShot } from './shots.js';
import { makeRng } from './config.js';

const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed') ?? 7) || 7;
const SHOT = params.get('shot');
const TEST = params.get('test') === '1';

class Game {
  constructor() {
    this.app = document.getElementById('app');
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!SHOT });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.classList.add('webgl');
    this.app.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xf2c184, 200, 780);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);
    this.camera.position.set(-160, 60, -160);

    const hemi = new THREE.HemisphereLight(0xbfe3ff, 0xe8c9a0, 1.15);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xffd9a0, 2.7);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -120; this.sun.shadow.camera.right = 120;
    this.sun.shadow.camera.top = 120; this.sun.shadow.camera.bottom = -120;
    this.sun.shadow.camera.near = 10; this.sun.shadow.camera.far = 420;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.sunDir = new THREE.Vector3(-0.52, 0.6, 0.42).normalize();

    const rng = makeRng(SEED);
    const city = buildCity(this.scene, SEED);
    this.city = city;
    this.colliders = city.colliders;
    this.effects = new Effects(this.scene);
    this.traffic = new TrafficSystem(this.scene, SEED, this.colliders);
    this.peds = new PedestrianSystem(this.scene, SEED, this.colliders);
    this.player = new Player(this.scene, this.camera, rng);
    this.police = new PoliceSystem(this.scene, this.colliders);
    const hudRoot = document.createElement('div');   // the HUD gets its own root:
    document.body.appendChild(hudRoot);              // setting its innerHTML must never
    this.hud = new Hud(hudRoot);                     // touch the renderer's canvas
    this.combat = new Combat(this.scene, {
      player: this.player, peds: this.peds, police: this.police,
      effects: this.effects, colliders: this.colliders,
      onPlayerHurt: () => { this.lastHurtAt = this.time; this.hud.hurtFlash(); },
    });
    this.cash = GAME.startCash;
    this.stats = { jobsCompleted: 0, faresDone: 0 };
    this.missions = new Missions(this);
    this.state = 'menu';
    this.time = 0;
    this.lastHurtAt = -99;
    this.overTimer = 0;
    this.crimeCooldown = 0;
    this.autosaveTimer = 0;
    this.menuAngle = 0;

    // the objective beacon: a soft gold pillar of light over the current marker
    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.5, 36, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd76b, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }));
    this.beacon.position.y = 18;
    this.beacon.visible = false;
    this.scene.add(this.beacon);

    input.bind(this.renderer.domElement);
    this.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'play' && !SHOT && !TEST) this.renderer.domElement.requestPointerLock?.();
    });
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.state === 'play' && !SHOT && !TEST) this._pause();
    });
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  // ---------- lifecycle ----------
  startGame({ fromSave = false, silent = false } = {}) {
    if (!silent) sound.init();
    this.police.clearHeat();
    this.player.health = GAME.playerHealth;
    if (fromSave) {
      const s = readSave();
      if (s) {
        this.cash = s.cash;
        this.missions.jobIndex = s.jobIndex;
        this.missions.jobDone = !!s.jobDone;
        this.stats.jobsCompleted = s.jobsCompleted || 0;
        this.stats.faresDone = s.faresDone || 0;
        this.player.teleport(s.x, s.z, s.heading ?? 0);
      }
    } else {
      this.cash = GAME.startCash;
      this.missions.jobIndex = 0;
      this.missions.jobDone = false;
      this.stats = { jobsCompleted: 0, faresDone: 0 };
      this.player.teleport(PLACES.startAlley.x, PLACES.startAlley.z, Math.PI * 0.75);
    }
    this.state = 'play';
    this.hud.setPlaying(true);
    this.hud.hideEnd();
    if (!fromSave) this.missions.startJob(0);
    else this.hud.toast(this.missions.jobDone ? 'Welcome back, Marlo. The city is yours.' : 'Welcome back — press J for the next job.');
  }

  saveGame() {
    const p = this.player.pos;
    writeSave({
      cash: this.cash, jobIndex: this.missions.jobIndex, jobDone: this.missions.jobDone,
      x: p.x, z: p.z, heading: this.player.heading,
      jobsCompleted: this.stats.jobsCompleted, faresDone: this.stats.faresDone,
    });
  }

  addCash(amount, label) {
    this.cash += amount;
    if (amount > 0) { this.hud.toast(`+$${amount} — ${label}`); sound.cash(); }
    else this.hud.toast(`-$${-amount} — ${label}`);
  }

  onProgress() { this.saveGame(); }

  _pause() {
    if (this.state !== 'play') return;
    this.state = 'pause';
    this.hud.showPause({
      resume: () => { this.state = 'play'; this.hud.hidePause(); },
      save: () => { this.saveGame(); this.hud.toast('Saved.'); },
      mute: () => { sound.setMuted(!sound.muted); },
      wipe: () => { clearSave(); this.hud.toast('Save deleted.'); },
    });
  }

  _penalty(kind) {
    if (this.state !== 'play') return;
    this.state = 'over';
    this.overTimer = 2.4;
    const fee = kind === 'WASTED' ? GAME.hospitalFee : GAME.stationFee;
    this.penaltyInfo = { kind, fee };
    this.hud.showEnd(kind, kind === 'WASTED'
      ? `St. Alba Hospital patches you up — $${fee}`
      : `Port Solace PD books you — $${fee} in fines`);
    sound.alarm();
  }

  _respawn() {
    const { kind, fee } = this.penaltyInfo;
    this.cash = Math.max(0, this.cash - fee);
    this.police.clearHeat();
    this.player.health = GAME.playerHealth;
    if (this.player.mode === 'drive') this.player.exitCar(true);
    const at = kind === 'WASTED' ? PLACES.hospital : PLACES.station;
    this.player.teleport(at.x, at.z, 0);
    this.hud.hideEnd();
    this.state = 'play';
  }

  // ---------- the simulation step (one frame of game time) ----------
  step(dt) {
    this.time += dt;
    if (this.state === 'over') {
      this.overTimer -= dt;
      if (this.overTimer <= 0) this._respawn();
      input.endFrame();
      return;
    }
    if (this.state !== 'play') { input.endFrame(); return; }
    const player = this.player;

    if (input.hit('KeyP')) { this._pause(); input.endFrame(); return; }
    if (input.hit('KeyM')) sound.setMuted(!sound.muted);
    if (input.hit('KeyJ')) this.missions.startNextJob();
    if (input.hit('KeyT')) this.missions.requestTaxi();
    if (input.mouseDown) this.combat.tryShoot();

    player.update(dt, {
      colliders: this.colliders, traffic: this.traffic, effects: this.effects,
      onEnterCar: (car, prevDriver) => {
        this.missions.notifyEnterCar(car);
        if (!car.playerUsed) {
          car.playerUsed = true;
          this.police.reportCrime('theft', car.x, car.z, this.police.witnessed(car.x, car.z, this.peds));
        }
        void prevDriver;
      },
      onExitCar: () => {},
    });

    const blockers = player.mode === 'foot' ? [{ x: player.x, z: player.z }] : [];
    this.traffic.update(dt, blockers);

    const threats = [];
    if (player.mode === 'drive' && Math.abs(player.car.speed) > 12) {
      threats.push({ x: player.car.x, z: player.car.z, radius: 10 });
    }
    this.peds.update(dt, threats);
    this._pedestrianHits();

    this.police.update(dt, {
      player, effects: this.effects,
      onBusted: () => this._penalty('BUSTED'),
    });
    this.combat.update(dt);
    this.missions.update(dt);

    const allCars = [...this.traffic.cars, ...this.police.officers];
    resolveCarPairs(allCars, (a, b, rel) => this._carBump(a, b, rel));
    this.crimeCooldown = Math.max(0, this.crimeCooldown - dt);

    // gentle health regen once the shooting stops
    if (this.time - this.lastHurtAt > 7 && player.health > 0 && player.health < GAME.playerHealth) {
      player.health = Math.min(GAME.playerHealth, player.health + 2.2 * dt);
    }
    if (player.health <= 0) { this._penalty('WASTED'); input.endFrame(); return; }

    this.city.update(dt, this.time);
    this.effects.update(dt, this.camera);
    this._updateSunAndBeacon(dt);
    this.autosaveTimer += dt;
    if (this.autosaveTimer > 25) { this.autosaveTimer = 0; this.saveGame(); }

    const objective = this.missions.objective();
    let hint = '';
    if (player.mode === 'foot') {
      hint = this.traffic.nearestTakeable(player.x, player.z, GAME.interactRange + 1.2) ? 'E — take this car' : '';
    } else hint = 'E — exit · Space — brake';
    this.hud.update(dt, {
      player, cash: this.cash, stars: this.police.stars, heat: this.police.heat,
      jobTitle: this.missions.currentDef ? `Job — ${this.missions.currentDef.title}` : (this.missions.jobDone ? 'Story complete' : ''),
      objective,
      driving: player.mode === 'drive',
      onFoot: player.mode === 'foot',
      speedKmh: player.mode === 'drive' ? Math.abs(player.car.speed) * 3.2 : 0,
      trafficCars: this.traffic.cars, officers: this.police.officers,
      hint,
    });
    input.endFrame();
  }

  _pedestrianHits() {
    const cars = [...this.traffic.cars, ...this.police.officers];
    for (const car of cars) {
      if (Math.abs(car.speed) < 4 || car.dead) continue;
      for (const ped of this.peds.peds) {
        if (ped.state !== 'walk' && ped.state !== 'flee' && ped.state !== 'enemy') continue;
        const d = Math.hypot(ped.x - car.x, ped.z - car.z);
        if (d < car.radius + 0.75) {
          const witnessed = this.police.witnessed(ped.x, ped.z, this.peds);
          this.peds.knockDown(ped, true);
          this.effects.bloodlessPuff({ x: ped.x, y: 1, z: ped.z });
          sound.thud();
          if (this.player.mode === 'drive' && this.player.car === car) {
            this.police.reportCrime('hitPed', ped.x, ped.z, witnessed);
            this.effects.addShake(0.3);
          }
        }
      }
    }
  }

  _carBump(a, b, rel) {
    const mid = { x: (a.x + b.x) / 2, y: 0.7, z: (a.z + b.z) / 2 };
    if (rel > 5) {
      this.effects.sparks(mid);
      sound.thud();
      a.health -= rel * 0.7; b.health -= rel * 0.7;
    }
    const playerCar = this.player.mode === 'drive' ? this.player.car : null;
    if (playerCar && (a === playerCar || b === playerCar)) {
      if (rel > 5) this.effects.addShake(Math.min(0.4, rel * 0.02));
      const other = a === playerCar ? b : a;
      if (other.driver !== 'police' && rel > 6 && this.crimeCooldown <= 0) {
        this.crimeCooldown = 0.9;
        this.police.reportCrime('hitCar', other.x, other.z, this.police.witnessed(other.x, other.z, this.peds));
      }
    }
    if ((a.health !== undefined && a.health < 35) || (b.health !== undefined && b.health < 35)) {
      const hurt = a.health < b.health ? a : b;
      this.effects.smoke({ x: hurt.x, y: 1, z: hurt.z });
    }
  }

  _updateSunAndBeacon() {
    const p = this.player.pos;
    this.sun.position.set(p.x + this.sunDir.x * 170, this.sunDir.y * 170, p.z + this.sunDir.z * 170);
    this.sun.target.position.set(p.x, 0, p.z);
    const objective = this.missions.objective();
    if (objective && objective.marker) {
      this.beacon.visible = true;
      this.beacon.position.x = objective.marker.x;
      this.beacon.position.z = objective.marker.z;
      this.beacon.material.opacity = 0.26 + Math.sin(this.time * 2.4) * 0.08;
      this.beacon.material.color.set(objective.colour || '#ffd76b');
    } else this.beacon.visible = false;
  }

  renderOnce() { this.renderer.render(this.scene, this.camera); }

  run() {
    let last = performance.now();
    const loop = (now) => {
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      if (this.state === 'play' || this.state === 'over') this.step(dt);
      else if (this.state === 'menu') {
        // slow orbit over the living city behind the start panel
        this.menuAngle += dt * 0.03;
        const r = 150;
        this.camera.position.set(Math.cos(this.menuAngle) * r, 52, 30 + Math.sin(this.menuAngle) * r);
        this.camera.lookAt(0, 4, 20);
        this.traffic.update(dt, []);
        this.peds.update(dt, []);
        this.city.update(dt, this.time += dt);
      }
      this.renderer.render(this.scene, this.camera);
    };
    requestAnimationFrame(loop);
  }
}

// ---------------- boot ----------------
const game = new Game();
window.__game = game;

if (SHOT) {
  poseShot(game, SHOT);
} else if (TEST) {
  runTests(game);
} else {
  game.hud.showStart(hasSave(),
    () => game.startGame({ fromSave: false }),
    () => game.startGame({ fromSave: true }));
  game.run();
}

// ---------------- the headless self-test ----------------
// ?test=1 steps the real simulation synchronously (no rAF involved) and asserts the
// transitions the game promises: walking, the first two jobs, theft and police
// response, gunfire, saving, and the taxi loop. Results land in the DOM and title.
function runTests(g) {
  const { player, missions, police, peds, traffic, combat } = g;
  const lines = [];
  let pass = 0, fail = 0;
  const check = (name, cond) => {
    lines.push(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
    if (cond) pass++; else fail++;
  };
  const step = (n, dt = 1 / 20) => { for (let i = 0; i < n; i++) g.step(dt); };

  g.startGame({ silent: true });
  step(2);
  check('boot: new game enters play', g.state === 'play');
  check('boot: player starts on foot', player.mode === 'foot');
  check('job 1 auto-starts with a marker', !!missions.active && !!missions.objective().marker);

  const trafficProbe = traffic.cars.filter((c) => c.driver === 'traffic').map((c) => ({ c, x: c.x, z: c.z }));
  step(60);
  check('traffic flows through the city', trafficProbe.some(({ c, x, z }) => Math.hypot(c.x - x, c.z - z) > 3));

  const z0 = player.z;
  player.camYaw = 0;
  input.inject('KeyW', true); step(30); input.inject('KeyW', false);
  check('walking moves the player', player.z < z0 - 1.2);

  player.teleport(PLACES.marketStall.x, PLACES.marketStall.z); step(2);
  check('job 1: pickup advances the step', !!missions.active && missions.active.stepIndex === 1);
  const cashBefore = g.cash;
  player.teleport(PLACES.marinaGate.x, PLACES.marinaGate.z); step(2);
  check('job 1: delivery completes the job', !missions.active && missions.jobIndex === 1);
  check('job 1: reward paid', g.cash === cashBefore + 150);

  missions.startJob(1);
  check('job 2: the marked coupe spawns', !!missions.jobCar && missions.jobCar.type === 'sport');
  player.teleport(missions.jobCar.x + 2, missions.jobCar.z); step(1);
  input.inject('KeyE', true); step(1); input.inject('KeyE', false);
  check('enter car: driving the coupe', player.mode === 'drive' && player.car === missions.jobCar);
  check('job 2: steal step completes on entry', !!missions.active && missions.active.stepIndex === 1);

  const carStart = { x: player.car.x, z: player.car.z };
  input.inject('KeyW', true); step(50); input.inject('KeyW', false);
  check('driving: the car accelerates', player.car.speed > 5);
  check('driving: the car travels', Math.hypot(player.car.x - carStart.x, player.car.z - carStart.z) > 4);

  input.inject('KeyE', true); step(1); input.inject('KeyE', false); step(1);
  check('exit car: back on foot', player.mode === 'foot');

  const parked = traffic.cars.find((c) => c.driver === 'parked' && !c.playerUsed && c !== missions.jobCar);
  const witness = peds.peds.find((p) => p.state === 'walk');
  witness.x = parked.x + 2; witness.z = parked.z + 2;
  witness.group.position.set(witness.x, 0, witness.z);
  player.teleport(parked.x - 2, parked.z); step(1);
  const heatBefore = police.heat;
  input.inject('KeyE', true); step(1); input.inject('KeyE', false);
  check('crime: witnessed theft raises heat', police.heat > heatBefore + 0.5);
  check('crime: wanted stars appear', police.stars >= 1);
  step(260);
  check('police: officers respond', police.officers.length >= 1);

  player.teleport(player.x, player.z);   // step out of the stolen car
  let foe = null, foeDir = null;
  for (const [dx, dz] of [[6, 0], [-6, 0], [0, 6], [0, -6]]) {
    if (!segmentBlocked(g.colliders, player.x, player.z, player.x + dx, player.z + dz)) {
      foe = peds.spawnEnemy(player.x + dx, player.z + dz, { health: 60 });
      foeDir = [dx, dz];
      break;
    }
  }
  check('combat: a target is placed with a clear line', !!foe);
  player.heading = Math.atan2(foeDir[0], foeDir[1]);
  g.camera.position.set(player.x - foeDir[0], 1.7, player.z - foeDir[1]);
  g.camera.lookAt(foe.x, 1.15, foe.z);
  g.camera.updateMatrixWorld(true);
  const fired = combat.tryShoot();
  check('combat: the pistol fires', fired === true);
  check('combat: the shot wounds the enemy', foe.health < 60);

  g.cash = 777;
  g.saveGame();
  const saved = readSave();
  check('save: roundtrip keeps cash and progress',
    !!saved && saved.cash === 777 && saved.jobIndex === missions.jobIndex);

  const myCar = traffic.cars.find((c) => c.playerUsed && c.driver === 'parked');
  missions.taxi.cooldown = 0;
  missions.requestTaxi();
  check('taxi: a fare is assigned', missions.taxi.state === 'toPickup' && !!missions.taxi.ped);
  if (missions.taxi.state === 'toPickup' && myCar) {
    const farePed = missions.taxi.ped;
    player.teleport(myCar.x + 2, myCar.z); step(1);
    input.inject('KeyE', true); step(1); input.inject('KeyE', false);
    if (player.mode === 'drive') {
      player.car.x = farePed.x + 3; player.car.z = farePed.z; player.car.speed = 0;
      step(2);
    }
    check('taxi: passenger boards and a destination is set', missions.taxi.state === 'toDrop' && !!missions.taxi.dest);
    missions.cancelTaxi();
    check('taxi: cancel returns to idle', missions.taxi.state === 'idle');
  } else {
    check('taxi: passenger boards and a destination is set', false);
    check('taxi: cancel returns to idle', false);
  }

  lines.push(`TEST-DONE pass=${pass} fail=${fail}`);
  const div = document.createElement('div');
  div.id = 'test-results';
  div.textContent = lines.join('\n');
  document.body.appendChild(div);
  document.title = `TEST-DONE pass=${pass} fail=${fail}`;
  console.log(lines.join('\n'));
}
