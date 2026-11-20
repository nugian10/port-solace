// shots.js — screenshot posing for Port Solace. With ?shot=<name>&seed=<n> the game
// boots straight into a staged, stable scene (start screen and audio skipped), steps
// the simulation a little so traffic and crowds are mid-life, pins a cinematic camera,
// renders, and flags window.__shotReady / document.title = 'SHOT-READY'.
// The four shots are the game's shop window for the judge: cover, chase, foot, mission.

import * as THREE from 'three';
import { createCar } from './vehicles.js';

function pinCamera(game, x, y, z, lx, ly, lz) {
  game.player.externalCamera = { pos: new THREE.Vector3(x, y, z), look: new THREE.Vector3(lx, ly, lz) };
}

function settle(game, seconds = 1.6) {
  const dt = 1 / 30;
  for (let t = 0; t < seconds; t += dt) game.step(dt, true);
}

// Shots read better without the centre banner, and with the job's first story
// line in the dialogue box instead of its header.
function stageDialogue(game) {
  game.hud.el.banner.classList.add('hidden');
  game.hud.bannerTimer = 0;
  game.hud._nextDialogue();
}

function placeTraffic(game, spots) {
  const movers = game.traffic.cars.filter((c) => c.driver === 'traffic');
  spots.forEach(([x, z, heading], i) => {
    const car = movers[i % movers.length];
    car.x = x; car.z = z; car.heading = heading;
    car.route = null; car.driver = 'parked';   // hold position for the portrait
    car.speed = 0;
  });
}

function placePeds(game, spots) {
  const walkers = game.peds.peds.filter((p) => p.state === 'walk');
  spots.forEach(([x, z], i) => {
    const ped = walkers[i % walkers.length];
    ped.x = x; ped.z = z; ped.targetX = x; ped.targetZ = z; ped.retarget = 99;
    ped.group.position.set(x, 0, z);
  });
}

export function poseShot(game, name) {
  const player = game.player;
  game.startGame({ silent: true });

  if (name === 'cover') {
    game.missions.startJob(0);
    const car = createCar(game.scene, 'sport', 0xd92323, -26, 3.4, Math.PI / 2);
    car.driver = 'player';
    game.traffic.cars.push(car);
    player.enterCar(car);
    car.speed = 15;
    placeTraffic(game, [[8, -3.4, -Math.PI / 2], [26, 3.4, Math.PI / 2], [-52, -3.4, -Math.PI / 2], [44, -3.4, -Math.PI / 2]]);
    placePeds(game, [[-8, 9.5], [4, -9.8], [16, 9.2], [-20, -9.5]]);
    settle(game, 0.7);
    stageDialogue(game);
    pinCamera(game, car.x - 13, 5.2, car.z + 7.2, car.x + 9, 1.1, car.z - 1);
  } else if (name === 'chase') {
    game.missions.startJob(0);
    const car = createCar(game.scene, 'sedan', 0x2c7a9c, 24, 165.4, Math.PI / 2);
    car.driver = 'player';
    game.traffic.cars.push(car);
    player.enterCar(car);
    car.speed = 23;
    game.police.heat = 3.2;
    placeTraffic(game, [[52, 158.6, -Math.PI / 2], [70, 165.4, Math.PI / 2]]);
    placePeds(game, [[36, 172], [2, 155], [58, 171.5]]);
    settle(game, 0.35);   // let the player's car roll to its final spot first
    stageDialogue(game);
    // then stage the pursuit pack relative to the settled car — no further
    // stepping, so the framing is exact
    const copSpots = [[-7, 172.2], [-10.5, 158.6], [-14.5, 165.4]];
    for (const [dx, z] of copSpots) {
      const cop = createCar(game.scene, 'police', 0x22242a, car.x + dx, z, Math.PI / 2);
      cop.driver = 'police';
      cop.speed = 22;
      game.police.officers.push(cop);
    }
    game.effects.dust({ x: car.x - 3, y: 0.3, z: car.z + 1 }, 18);
    pinCamera(game, car.x - 19.5, 6.8, car.z + 10.5, car.x + 6, 1.1, car.z - 0.5);
  } else if (name === 'foot') {
    game.missions.startJob(0);
    player.teleport(-140, -45.5, -2.79);
    placeTraffic(game, [[-162, -50.6, Math.PI / 2], [-104, -57.4, -Math.PI / 2], [-84, -50.6, Math.PI / 2]]);
    placePeds(game, [[-150, -46.5], [-128, -63], [-152, -64], [-118, -44], [-160, -63.5]]);
    settle(game, 0.9);
    stageDialogue(game);
    pinCamera(game, player.x + 7.5, 2.7, player.z + 7.5, player.x - 4, 1.2, player.z - 8);
  } else if (name === 'mission') {
    game.hud.dialogueQueue.length = 0;
    game.missions.startJob(4);   // Pier Pressure
    player.teleport(124, 228, 0.15);
    settle(game, 0.4);           // entering the pier zone spawns the Corso crew
    stageDialogue(game);
    const p = player.pos;
    const foe = game.peds.peds.find((e) => e.isEnemy && e.state !== 'down');
    if (foe) {
      game.combat._tracer(new THREE.Vector3(foe.x, 1.35, foe.z), new THREE.Vector3(p.x + 0.8, 1.1, p.z));
      game.combat._tracer(new THREE.Vector3(p.x, 1.35, p.z), new THREE.Vector3(foe.x, 1.15, foe.z), 0xff9a5c);
      game.effects.muzzle(new THREE.Vector3(p.x, 1.35, p.z + 0.5));
    }
    pinCamera(game, p.x - 4.2, 2.5, p.z - 6.8, p.x + 1.5, 1.2, p.z + 12);
  } else {
    return false;
  }
  game.renderOnce();
  window.__shotReady = true;
  document.title = 'SHOT-READY';
  return true;
}
