// effects.js — Port Solace's juice: a pooled particle system (dust, sparks, smoke,
// splashes), brake-light glow handled by the vehicle meshes, speed FOV kick and a
// short screen shake. Particles live in one THREE.Points cloud so they cost one draw.

import * as THREE from 'three';

const MAX = 900;

export class Effects {
  constructor(scene) {
    this.positions = new Float32Array(MAX * 3);
    this.colours = new Float32Array(MAX * 3);
    this.velocities = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);       // seconds remaining
    this.maxLife = new Float32Array(MAX);
    this.gravity = new Float32Array(MAX);
    this.head = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colours, 3));
    // soft round sprite so dust and smoke read as puffs, not dice
    const puff = document.createElement('canvas');
    puff.width = puff.height = 64;
    const pg = puff.getContext('2d');
    const grad = pg.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    pg.fillStyle = grad;
    pg.fillRect(0, 0, 64, 64);
    const mat = new THREE.PointsMaterial({
      size: 0.6, vertexColors: true, transparent: true, opacity: 0.9,
      depthWrite: false, sizeAttenuation: true, map: new THREE.CanvasTexture(puff),
      alphaTest: 0.02,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    for (let i = 0; i < MAX; i++) this.positions[i * 3 + 1] = -100;
    this.shake = 0;
  }

  spawn(x, y, z, vx, vy, vz, r, g, b, life, gravity) {
    const i = this.head;
    this.head = (this.head + 1) % MAX;
    this.positions.set([x, y, z], i * 3);
    this.velocities.set([vx, vy, vz], i * 3);
    this.colours.set([r, g, b], i * 3);
    this.life[i] = life;
    this.maxLife[i] = life;
    this.gravity[i] = gravity;
  }

  burst(pos, count, spread, up, colour, life, gravity) {
    for (let n = 0; n < count; n++) {
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * spread;
      this.spawn(pos.x, pos.y, pos.z,
        Math.cos(a) * s, Math.random() * up, Math.sin(a) * s,
        colour[0], colour[1], colour[2], life * (0.5 + Math.random() * 0.8), gravity);
    }
  }

  dust(pos, speed) {
    this.burst(pos, 2, 1.2, 1.4, [0.76, 0.66, 0.5], 0.7, -0.4);
    if (speed > 8) this.burst(pos, 1, 0.8, 1, [0.7, 0.6, 0.45], 0.9, -0.3);
  }

  sparks(pos) { this.burst(pos, 10, 3.2, 2.6, [1, 0.72, 0.25], 0.4, 4); }
  smoke(pos) { this.burst(pos, 3, 0.7, 2.2, [0.25, 0.24, 0.24], 1.4, -1.2); }
  splash(pos) { this.burst(pos, 8, 1.6, 3.4, [0.65, 0.85, 0.95], 0.6, 6); }
  muzzle(pos) { this.burst(pos, 3, 0.5, 0.4, [1, 0.85, 0.4], 0.09, 0); }
  bloodlessPuff(pos) { this.burst(pos, 5, 1.4, 1.6, [0.85, 0.8, 0.75], 0.35, 2); }

  addShake(amount) { this.shake = Math.min(0.6, this.shake + amount); }

  update(dt, camera) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const j = i * 3;
      if (this.life[i] <= 0) { this.positions[j + 1] = -100; continue; }
      this.velocities[j + 1] -= this.gravity[i] * dt;
      this.positions[j] += this.velocities[j] * dt;
      this.positions[j + 1] += this.velocities[j + 1] * dt;
      this.positions[j + 2] += this.velocities[j + 2] * dt;
      if (this.positions[j + 1] < 0.05) this.positions[j + 1] = 0.05;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    if (this.shake > 0.001 && camera) {
      camera.position.x += (Math.random() - 0.5) * this.shake * 0.35;
      camera.position.y += (Math.random() - 0.5) * this.shake * 0.3;
      this.shake *= Math.pow(0.02, dt);
    } else this.shake = 0;
  }
}

// Speed-based field-of-view kick, shared by the on-foot and driving cameras.
export function fovKick(baseFov, speedRatio) {
  return baseFov + speedRatio * speedRatio * 9;
}
