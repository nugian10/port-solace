// vehicles.js — Port Solace's cars: the mesh factory (sedans, hatches, vans, sports
// coupes, taxis, police interceptors built from boxes and cylinders), the shared arcade
// driving physics, and the traffic system that keeps the streets moving on the road grid.

import * as THREE from 'three';
import { WORLD, makeRng, pick } from './config.js';
import { collideCircle } from './city.js';

export const CAR_TYPES = {
  sedan:  { length: 4.3, width: 1.85, height: 0.62, cabinH: 0.52, maxSpeed: 27, accel: 10.5, mass: 1 },
  hatch:  { length: 3.7, width: 1.8,  height: 0.66, cabinH: 0.55, maxSpeed: 25, accel: 11,   mass: 0.9 },
  van:    { length: 4.9, width: 2.0,  height: 1.15, cabinH: 0.75, maxSpeed: 22, accel: 8.5,  mass: 1.4 },
  sport:  { length: 4.4, width: 1.95, height: 0.48, cabinH: 0.4,  maxSpeed: 35, accel: 14,   mass: 1 },
  taxi:   { length: 4.3, width: 1.85, height: 0.62, cabinH: 0.52, maxSpeed: 27, accel: 10.5, mass: 1 },
  police: { length: 4.5, width: 1.9,  height: 0.6,  cabinH: 0.5,  maxSpeed: 33, accel: 13,   mass: 1.1 },
};

export const CAR_COLOURS = [0xd94f30, 0x2c7a9c, 0xf2b13d, 0x51a06b, 0xe5e7ea, 0x8a8f98, 0x7a4a8e, 0xc86f8a, 0x274156, 0xf2ead8];

const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1c1e22 });
const glassMat = new THREE.MeshPhongMaterial({ color: 0x18242e, shininess: 90 });
const chromeMat = new THREE.MeshLambertMaterial({ color: 0xb9c0c7 });

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// Build one car mesh. Forward is +Z in local space; heading rotates the group.
export function makeCarMesh(type, colour) {
  const spec = CAR_TYPES[type];
  const group = new THREE.Group();
  const paint = new THREE.MeshPhongMaterial({ color: colour, shininess: 60 });
  const body = box(spec.width, spec.height, spec.length, paint, 0, 0.42 + spec.height / 2, 0);
  group.add(body);
  const cabinW = spec.width * 0.86;
  const cabin = box(cabinW, spec.cabinH, spec.length * 0.48, glassMat, 0, 0.42 + spec.height + spec.cabinH / 2 - 0.06, -spec.length * 0.04);
  group.add(cabin);
  // bumpers + lights
  group.add(box(spec.width * 0.98, 0.18, 0.25, chromeMat, 0, 0.5, spec.length / 2 + 0.05));
  group.add(box(spec.width * 0.98, 0.18, 0.25, chromeMat, 0, 0.5, -spec.length / 2 - 0.05));
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  group.add(box(0.34, 0.14, 0.06, headMat, spec.width * 0.3, 0.78, spec.length / 2 + 0.14));
  group.add(box(0.34, 0.14, 0.06, headMat, -spec.width * 0.3, 0.78, spec.length / 2 + 0.14));
  const brakeMat = new THREE.MeshLambertMaterial({ color: 0x550f0f, emissive: 0xff2211, emissiveIntensity: 0.25 });
  group.add(box(0.36, 0.13, 0.06, brakeMat, spec.width * 0.3, 0.8, -spec.length / 2 - 0.14));
  group.add(box(0.36, 0.13, 0.06, brakeMat, -spec.width * 0.3, 0.8, -spec.length / 2 - 0.14));

  const wheels = [];
  const wheelPos = [
    [spec.width / 2 - 0.05, spec.length * 0.32], [-spec.width / 2 + 0.05, spec.length * 0.32],
    [spec.width / 2 - 0.05, -spec.length * 0.32], [-spec.width / 2 + 0.05, -spec.length * 0.32],
  ];
  wheelPos.forEach(([x, z], i) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.36, z);
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.castShadow = true;
    pivot.add(wheel);
    group.add(pivot);
    wheels.push({ pivot, wheel, front: i < 2 });
  });

  if (type === 'sport') {
    const spoiler = box(spec.width * 0.9, 0.08, 0.4, paint, 0, 1.12, -spec.length / 2 + 0.3);
    group.add(spoiler);
    group.add(box(0.08, 0.22, 0.3, chromeMat, spec.width * 0.35, 0.95, -spec.length / 2 + 0.3));
    group.add(box(0.08, 0.22, 0.3, chromeMat, -spec.width * 0.35, 0.95, -spec.length / 2 + 0.3));
  }
  if (type === 'taxi') {
    const sign = box(0.7, 0.22, 0.3, new THREE.MeshBasicMaterial({ color: 0xffe98a }), 0, 1.62, -0.1);
    group.add(sign);
    const stripe = box(spec.width + 0.03, 0.2, spec.length * 0.9, new THREE.MeshLambertMaterial({ color: 0x22242a }), 0, 0.62, 0);
    group.add(stripe);
  }
  let lightBar = null;
  if (type === 'police') {
    const barBase = box(1.1, 0.09, 0.4, chromeMat, 0, 1.5, -0.1);
    group.add(barBase);
    const redMat = new THREE.MeshBasicMaterial({ color: 0xff2a22 });
    const blueMat = new THREE.MeshBasicMaterial({ color: 0x2266ff });
    const red = box(0.5, 0.16, 0.36, redMat, 0.28, 1.62, -0.1);
    const blue = box(0.5, 0.16, 0.36, blueMat, -0.28, 1.62, -0.1);
    group.add(red); group.add(blue);
    const door = box(spec.width + 0.02, 0.5, 1.6, new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }), 0, 0.85, 0.2);
    group.add(door);
    lightBar = { red, blue, redMat, blueMat };
  }
  group.userData = { wheels, brakeMat, lightBar };
  return group;
}

let carSerial = 0;
export function createCar(scene, type, colour, x, z, heading) {
  const group = makeCarMesh(type, colour);
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  scene.add(group);
  return {
    id: carSerial++,
    type, colour,
    group,
    x, z, heading,
    speed: 0, steer: 0,
    radius: 1.7,
    driver: 'parked',        // 'parked' | 'traffic' | 'player' | 'police' | 'mission'
    route: null,
    health: 100,
    brakeLight: 0,
    dead: false,
  };
}

export function syncCarMesh(car) {
  car.group.position.set(car.x, 0, car.z);
  car.group.rotation.y = car.heading;
  const { wheels, brakeMat } = car.group.userData;
  for (const w of wheels) {
    w.wheel.rotation.x += car.speed * 0.055;
    if (w.front) w.pivot.rotation.y = car.steer * 0.85;
  }
  brakeMat.emissiveIntensity = car.brakeLight > 0 ? 1.6 : 0.25;
}

// Shared arcade physics. controls: { throttle -1..1, steer -1..1 (left+), brake bool }
export function stepCarPhysics(car, controls, dt) {
  const spec = CAR_TYPES[car.type];
  const targetSteer = (controls.steer || 0) * 0.52;
  car.steer += (targetSteer - car.steer) * Math.min(1, dt * 7);
  if (controls.brake && car.speed > 0.5) {
    car.speed = Math.max(0, car.speed - 24 * dt);
    car.brakeLight = 1;
  } else if (controls.throttle > 0) {
    car.speed += spec.accel * controls.throttle * dt * (1 - Math.max(0, car.speed) / (spec.maxSpeed * 1.25));
    car.brakeLight = 0;
  } else if (controls.throttle < 0) {
    if (car.speed > 0.6) { car.speed = Math.max(0, car.speed - 20 * dt); car.brakeLight = 1; }
    else { car.speed = Math.max(-8, car.speed + spec.accel * 0.7 * controls.throttle * dt); car.brakeLight = 0; }
  } else {
    car.speed -= car.speed * 0.35 * dt;             // engine braking / drag
    if (Math.abs(car.speed) < 0.04) car.speed = 0;
    car.brakeLight = 0;
  }
  car.speed = Math.min(car.speed, spec.maxSpeed);
  if (car.speed !== 0) {
    const grip = 2.9; // wheelbase factor
    car.heading -= car.steer * (car.speed / grip) * dt * 0.62;
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
  }
}

// Keep a car out of buildings and inside the playable shore/city bounds.
export function collideCarWorld(car, colliders) {
  const [nx, nz] = collideCircle(colliders, car.x, car.z, car.radius);
  if (nx !== car.x || nz !== car.z) {
    car.x = nx; car.z = nz;
    if (Math.abs(car.speed) > 6) car.speed *= 0.35;
    else car.speed *= 0.6;
    return true;
  }
  const edge = WORLD.cityEdge + 6;
  car.x = Math.max(-edge, Math.min(edge, car.x));
  car.z = Math.max(-edge, Math.min(268, car.z));
  return false;
}

// Pairwise car bumps: push apart, trade a little speed, report hard hits.
export function resolveCarPairs(cars, onBump) {
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    const a = cars[i], b = cars[j];
    if (a.dead || b.dead) continue;
    const dx = b.x - a.x, dz = b.z - a.z;
    const d2 = dx * dx + dz * dz;
    const min = a.radius + b.radius + 0.55;
    if (d2 > min * min || d2 === 0) continue;
    const d = Math.sqrt(d2);
    const push = (min - d) / 2;
    const ux = dx / d, uz = dz / d;
    a.x -= ux * push; a.z -= uz * push;
    b.x += ux * push; b.z += uz * push;
    const rel = Math.abs(a.speed - b.speed) + Math.min(Math.abs(a.speed), Math.abs(b.speed)) * 0.4;
    if (rel > 3) {
      a.speed *= 0.72; b.speed *= 0.72;
      if (onBump) onBump(a, b, rel);
    }
  }
}

// ---------------- traffic ----------------
// Traffic cars follow lanes on the grid with pure-pursuit waypoints and simple
// junction decisions (straight / left / right, never a U-turn mid-block).

function laneCoord(axis, line, dirSign) {
  // returns the fixed-axis coordinate of the correct lane for travel direction
  return axis === 'h' ? line + dirSign * WORLD.laneOffset : line - dirSign * WORLD.laneOffset;
}

function headingFor(axis, dirSign) {
  return axis === 'h' ? dirSign * Math.PI / 2 : (dirSign > 0 ? 0 : Math.PI);
}

export class TrafficSystem {
  constructor(scene, seed = 7, colliders = []) {
    this.scene = scene;
    this.rng = makeRng(seed * 331 + 7);
    this.colliders = colliders;
    this.cars = [];
    const types = ['sedan', 'hatch', 'van', 'sedan', 'hatch', 'taxi'];
    for (let i = 0; i < 15; i++) {
      const axis = this.rng() < 0.5 ? 'h' : 'v';
      const line = pick(this.rng, WORLD.roadLines);
      const dirSign = this.rng() < 0.5 ? 1 : -1;
      const along = -160 + this.rng() * 320;
      const lane = laneCoord(axis, line, dirSign);
      const x = axis === 'h' ? along : lane;
      const z = axis === 'h' ? lane : along;
      const type = pick(this.rng, types);
      const colour = type === 'taxi' ? 0xf2b13d : pick(this.rng, CAR_COLOURS);
      const car = createCar(scene, type, colour, x, z, headingFor(axis, dirSign));
      car.driver = 'traffic';
      car.route = { axis, line, dirSign, turnAt: null, choice: 'straight' };
      car.speed = 6 + this.rng() * 5;
      this.cars.push(car);
    }
    // parked cars along street edges
    for (let i = 0; i < 18; i++) {
      const horizontal = this.rng() < 0.5;
      const line = pick(this.rng, WORLD.roadLines);
      const along = -165 + this.rng() * 330;
      const side = this.rng() < 0.5 ? 1 : -1;
      const off = side * (WORLD.roadWidth / 2 - 1.35);
      const x = horizontal ? along : line + off;
      const z = horizontal ? line + off : along;
      if (z > WORLD.beachStart - 4) continue;
      const type = pick(this.rng, ['sedan', 'hatch', 'van', 'sport']);
      const car = createCar(scene, type, pick(this.rng, CAR_COLOURS), x, z,
        horizontal ? Math.PI / 2 : 0);
      car.driver = 'parked';
      this.cars.push(car);
    }
  }

  _nextJunction(car) {
    const r = car.route;
    const pos = r.axis === 'h' ? car.x : car.z;
    let best = null;
    for (const line of WORLD.roadLines) {
      const d = (line - pos) * r.dirSign;
      if (d > 4 && (best === null || d < best.d)) best = { line, d };
    }
    return best;
  }

  _planTurn(car) {
    const r = car.route;
    const j = this._nextJunction(car);
    if (!j) { r.turnAt = null; return; }
    r.turnAt = j.line;
    const roll = this.rng();
    r.choice = roll < 0.55 ? 'straight' : (roll < 0.78 ? 'left' : 'right');
    if (Math.abs(j.line) >= 162) r.choice = roll < 0.5 ? 'left' : 'right'; // edge: must turn
  }

  _waypoint(car) {
    const r = car.route;
    if (r.turnAt === null) this._planTurn(car);
    const lane = laneCoord(r.axis, r.line, r.dirSign);
    const pos = r.axis === 'h' ? car.x : car.z;
    if (r.turnAt !== null && r.choice !== 'straight') {
      const distToJunction = (r.turnAt - pos) * r.dirSign;
      if (distToJunction < 13) {
        // aim around the corner onto the junction street's lane
        const newAxis = r.axis === 'h' ? 'v' : 'h';
        // turning right keeps the same rotational sense; compute new dirSign:
        // heading vectors: h:+x=(1,0) right turn -> +z; left turn -> -z (in x,z plane with z south)
        let newDir;
        if (r.axis === 'h') newDir = (r.choice === 'right' ? 1 : -1) * r.dirSign;
        else newDir = (r.choice === 'right' ? -1 : 1) * r.dirSign;
        const newLane = laneCoord(newAxis, r.turnAt, newDir);
        return newAxis === 'v'
          ? { x: newLane, z: car.z + newDir * 16 }
          : { x: car.x + newDir * 16, z: newLane };
      }
    }
    return r.axis === 'h'
      ? { x: car.x + r.dirSign * 16, z: lane }
      : { x: lane, z: car.z + r.dirSign * 16 };
  }

  _maybeCompleteTurn(car) {
    const r = car.route;
    if (r.turnAt === null || r.choice === 'straight') {
      if (r.turnAt !== null) {
        const pos = r.axis === 'h' ? car.x : car.z;
        if ((r.turnAt - pos) * r.dirSign < -3) { r.turnAt = null; }
      }
      return;
    }
    const pos = r.axis === 'h' ? car.x : car.z;
    if ((r.turnAt - pos) * r.dirSign < 2) {
      const newAxis = r.axis === 'h' ? 'v' : 'h';
      let newDir;
      if (r.axis === 'h') newDir = (r.choice === 'right' ? 1 : -1) * r.dirSign;
      else newDir = (r.choice === 'right' ? -1 : 1) * r.dirSign;
      r.line = r.turnAt;
      r.axis = newAxis;
      r.dirSign = newDir;
      r.turnAt = null;
      r.choice = 'straight';
    }
  }

  update(dt, blockers = []) {
    for (const car of this.cars) {
      if (car.driver !== 'traffic') { syncCarMesh(car); continue; }
      this._maybeCompleteTurn(car);
      const wp = this._waypoint(car);
      const dx = wp.x - car.x, dz = wp.z - car.z;
      const targetHeading = Math.atan2(dx, dz);
      let diff = targetHeading - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, diff * 1.6));

      // obstacle scan: anything slow or stopped ahead in our lane
      let throttle = 0.75, braking = false;
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      for (const other of this.cars) {
        if (other === car || other.dead) continue;
        const ox = other.x - car.x, oz = other.z - car.z;
        const ahead = ox * fx + oz * fz;
        const side = Math.abs(ox * fz - oz * fx);
        if (ahead > 0 && ahead < 10 && side < 2.3) {
          if (ahead < 5.5) { throttle = 0; braking = true; }
          else throttle = Math.min(throttle, 0.25);
        }
      }
      for (const b of blockers) {
        const ox = b.x - car.x, oz = b.z - car.z;
        const ahead = ox * fx + oz * fz;
        const side = Math.abs(ox * fz - oz * fx);
        if (ahead > 0 && ahead < 7 && side < 2) { throttle = 0; braking = true; }
      }
      const cruise = 10.5;
      if (car.speed > cruise) { throttle = 0; braking = car.speed > cruise + 3; }
      stepCarPhysics(car, { throttle, steer, brake: braking }, dt);
      collideCarWorld(car, this.colliders);
      syncCarMesh(car);
    }
  }

  // A traffic car the player is standing next to can be taken like any parked car.
  nearestTakeable(x, z, maxDist) {
    let best = null, bestD = maxDist;
    for (const car of this.cars) {
      if (car.driver !== 'parked' && car.driver !== 'traffic') continue;
      if (car.driver === 'traffic' && car.speed > 3) continue;
      const d = Math.hypot(car.x - x, car.z - z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }
}
