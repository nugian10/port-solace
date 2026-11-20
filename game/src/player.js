// player.js — Marlo Venn, the player: on-foot third-person movement with a mouse-orbit
// camera, car theft and entry, arcade driving with a smoothed chase camera and speed
// FOV kick, plus the respawn/teleport hooks the missions and penalties use.

import * as THREE from 'three';
import { GAME, WORLD } from './config.js';
import { input } from './input.js';
import { makePersonMesh } from './pedestrians.js';
import { collideCircle, isWater, isOnPier } from './city.js';
import { stepCarPhysics, collideCarWorld, syncCarMesh } from './vehicles.js';
import { fovKick } from './effects.js';
import { sound } from './audio.js';

export class Player {
  constructor(scene, camera, rng) {
    this.camera = camera;
    this.mesh = makePersonMesh(rng, { shirt: 0x0e7c86, pants: 0x2b3a4a, skin: 0xc68863, hair: 0x14100c });
    scene.add(this.mesh);
    this.x = -131; this.z = -124;
    this.heading = Math.PI * 0.75;
    this.speed = 0;
    this.walkPhase = 0;
    this.mode = 'foot';              // 'foot' | 'drive'
    this.car = null;
    this.health = GAME.playerHealth;
    this.camYaw = this.heading + Math.PI;
    this.camPitch = 0.32;
    this.camDistance = 6.8;
    this.baseFov = 62;
    this.cameraPos = new THREE.Vector3(this.x - 6, 3, this.z - 6);
    this.externalCamera = null;      // shots/tests can pin the camera: {pos, look}
    this.drivingTime = 0;
  }

  get pos() {
    return this.mode === 'drive' && this.car
      ? { x: this.car.x, z: this.car.z }
      : { x: this.x, z: this.z };
  }

  get speedNow() {
    return this.mode === 'drive' && this.car ? Math.abs(this.car.speed) : Math.abs(this.speed);
  }

  teleport(x, z, heading = this.heading) {
    if (this.mode === 'drive') this.exitCar(true);
    this.x = x; this.z = z; this.heading = heading;
    this.camYaw = heading + Math.PI;
    this.speed = 0;
    this._syncMesh();
  }

  enterCar(car) {
    this.mode = 'drive';
    this.car = car;
    car.driver = 'player';
    car.route = null;
    this.mesh.visible = false;
    this.camYaw = car.heading + Math.PI;
    sound.engine(0, 0, true);
  }

  exitCar(silent = false) {
    const car = this.car;
    if (!car) return;
    car.driver = 'parked';
    car.speed = 0;
    this.mode = 'foot';
    this.car = null;
    // step out on the left side of the car
    const rx = -Math.cos(car.heading), rz = Math.sin(car.heading);
    this.x = car.x + rx * 2.3;
    this.z = car.z + rz * 2.3;
    this.heading = car.heading;
    this.mesh.visible = true;
    if (!silent) sound.engine(0, 0, false);
    this._syncMesh();
  }

  // ctx: { colliders, traffic, effects, onEnterCar(car, wasMoving) }
  update(dt, ctx) {
    const mouse = input.drainMouse();
    if (!this.externalCamera) {
      this.camYaw -= mouse.dx * 0.0032;
      this.camPitch = Math.max(0.06, Math.min(1.15, this.camPitch + mouse.dy * 0.0028));
    }
    if (this.mode === 'drive') this._updateDriving(dt, ctx);
    else this._updateOnFoot(dt, ctx);
    this._updateCamera(dt);
  }

  _updateOnFoot(dt, ctx) {
    const fwd = input.axis('KeyS', 'KeyW') + input.axis('ArrowDown', 'ArrowUp');
    const strafe = input.axis('KeyA', 'KeyD') + input.axis('ArrowLeft', 'ArrowRight');
    const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    const moving = fwd !== 0 || strafe !== 0;
    const targetSpeed = sprint ? GAME.sprintSpeed : GAME.walkSpeed;
    if (moving) {
      const moveAngle = this.camYaw + Math.atan2(strafe, fwd) + Math.PI;
      const vx = Math.sin(moveAngle) * targetSpeed;
      const vz = Math.cos(moveAngle) * targetSpeed;
      let nx = this.x + vx * dt;
      let nz = this.z + vz * dt;
      if (isWater(nx, nz) && !isOnPier(nx, nz)) {
        // wade a step or two, no further
        if (nz > WORLD.waterStart + 2.5) nz = this.z;
      }
      const [cx, cz] = collideCircle(ctx.colliders, nx, nz, GAME.playerRadius);
      this.x = cx; this.z = cz;
      this.x = Math.max(-184, Math.min(184, this.x));
      this.z = Math.max(-184, Math.min(264, this.z));
      let diff = moveAngle - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.heading += diff * Math.min(1, dt * 12);
      this.speed = targetSpeed;
    } else {
      this.speed = 0;
    }
    this.walkPhase += dt * (this.speed > 0 ? 9 : 0);
    this._syncMesh();

    if (input.hit('KeyE') && ctx.traffic) {
      const car = ctx.traffic.nearestTakeable(this.x, this.z, GAME.interactRange + 1.2);
      if (car) {
        const wasParked = car.driver === 'parked';
        this.enterCar(car);
        if (ctx.onEnterCar) ctx.onEnterCar(car, wasParked);
      }
    }
  }

  _updateDriving(dt, ctx) {
    const car = this.car;
    const throttle = input.axis('KeyS', 'KeyW') + input.axis('ArrowDown', 'ArrowUp');
    const steer = input.axis('KeyD', 'KeyA') + input.axis('ArrowRight', 'ArrowLeft');
    const brake = input.down('Space');
    stepCarPhysics(car, { throttle, steer, brake }, dt);
    const hitWall = collideCarWorld(car, ctx.colliders);
    if (hitWall && Math.abs(car.speed) > 8) ctx.effects?.addShake(0.25);
    syncCarMesh(car);
    this.drivingTime += dt;
    const ratio = Math.abs(car.speed) / 35;
    sound.engine(ratio, Math.abs(throttle), true);
    if (Math.abs(car.speed) > 5 && Math.random() < dt * 6) {
      const back = { x: car.x - Math.sin(car.heading) * 2, y: 0.25, z: car.z - Math.cos(car.heading) * 2 };
      ctx.effects?.dust(back, Math.abs(car.speed));
    }
    if (input.hit('KeyE')) {
      this.exitCar();
      if (ctx.onExitCar) ctx.onExitCar();
    }
  }

  _updateCamera(dt) {
    const cam = this.camera;
    if (this.externalCamera) {
      cam.position.copy(this.externalCamera.pos);
      cam.lookAt(this.externalCamera.look);
      cam.fov = this.baseFov;
      cam.updateProjectionMatrix();
      return;
    }
    if (this.mode === 'drive' && this.car) {
      const car = this.car;
      // camera yaw eases toward behind-the-car; the mouse can still swing it
      let diff = (car.heading + Math.PI) - this.camYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(car.speed) > 2) this.camYaw += diff * Math.min(1, dt * (Math.abs(car.speed) > 14 ? 3.4 : 1.6));
      const back = 9.6, up = 3.4 + this.camPitch * 2.2;
      const flat = back * Math.cos(this.camPitch * 0.5);
      const desired = new THREE.Vector3(
        car.x + Math.sin(this.camYaw) * flat,
        up,
        car.z + Math.cos(this.camYaw) * flat,
      );
      this.cameraPos.lerp(desired, 1 - Math.pow(0.0001, dt));
      cam.position.copy(this.cameraPos);
      cam.lookAt(car.x - Math.sin(this.camYaw) * 6, 1.4, car.z - Math.cos(this.camYaw) * 6);
      const targetFov = fovKick(this.baseFov, Math.abs(car.speed) / 35);
      if (Math.abs(cam.fov - targetFov) > 0.1) { cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 5); cam.updateProjectionMatrix(); }
    } else {
      const dist = this.camDistance;
      const cx = this.x + Math.sin(this.camYaw) * dist * Math.cos(this.camPitch);
      const cz = this.z + Math.cos(this.camYaw) * dist * Math.cos(this.camPitch);
      const cy = 1.6 + Math.sin(this.camPitch) * dist;
      this.cameraPos.set(cx, Math.max(0.7, cy), cz);
      cam.position.copy(this.cameraPos);
      cam.lookAt(this.x, 1.55, this.z);
      if (Math.abs(cam.fov - this.baseFov) > 0.1) { cam.fov += (this.baseFov - cam.fov) * Math.min(1, dt * 5); cam.updateProjectionMatrix(); }
    }
  }

  aimDirection() {
    const v = new THREE.Vector3();
    this.camera.getWorldDirection(v);
    return v;
  }

  aimOrigin() {
    return this.mode === 'drive' && this.car
      ? new THREE.Vector3(this.car.x, 1.4, this.car.z)
      : new THREE.Vector3(this.x, 1.5, this.z);
  }

  _syncMesh() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    const u = this.mesh.userData;
    const swing = this.speed > 0 ? 0.6 : 0;
    u.legL.rotation.x = Math.sin(this.walkPhase) * swing;
    u.legR.rotation.x = -Math.sin(this.walkPhase) * swing;
    u.armL.rotation.x = -Math.sin(this.walkPhase) * swing * 0.7;
    u.armR.rotation.x = Math.sin(this.walkPhase) * swing * 0.7;
  }
}
