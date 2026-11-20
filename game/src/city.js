// city.js — Port Solace itself: the procedural sun-soaked coastal city.
// A grid of streets with canvas-textured asphalt, raised sidewalks, and per-district
// buildings (downtown towers, market blocks with awnings and stalls, an open plaza with
// a fountain, beachfront hotels, family houses), palms, streetlights, a beach, the
// marina pier with moored boats, billboards with original local brands, and the sky.
// Exports the building colliders every mover tests against, plus pier/water queries.

import * as THREE from 'three';
import { WORLD, districtAt, makeRng } from './config.js';

export const PIER = { minX: 114, maxX: 142, minZ: 206, maxZ: 264 };

export function isOnPier(x, z) {
  return x >= PIER.minX && x <= PIER.maxX && z >= PIER.minZ && z <= PIER.maxZ;
}
export function isWater(x, z) {
  return z > WORLD.waterStart && !isOnPier(x, z);
}

// ---------- canvas texture helpers ----------
function canvasTexture(w, h, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function facadeTexture(rng, base, trim, floors, cols, litRatio) {
  return canvasTexture(256, 256, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    g.fillStyle = trim; g.fillRect(0, 0, 256, 10); g.fillRect(0, 246, 256, 10);
    const ww = 256 / cols, hh = 256 / floors;
    for (let y = 0; y < floors; y++) for (let x = 0; x < cols; x++) {
      const lit = rng() < litRatio;
      g.fillStyle = lit ? '#ffd98a' : '#22384c';
      g.fillRect(x * ww + ww * 0.22, y * hh + hh * 0.2, ww * 0.56, hh * 0.55);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(x * ww + ww * 0.22, y * hh + hh * 0.2, ww * 0.56, hh * 0.16);
    }
  });
}

function billboardTexture(lines, bg, fg, accent) {
  return canvasTexture(512, 256, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
    g.fillStyle = accent; g.fillRect(0, 0, 512, 26); g.fillRect(0, 230, 512, 26);
    g.fillStyle = fg;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const size = lines.length > 1 ? 74 : 96;
    g.font = `900 ${size}px Verdana, sans-serif`;
    lines.forEach((line, i) => {
      g.fillText(line, 256, 128 + (i - (lines.length - 1) / 2) * (size + 12));
    });
  });
}

function awningTexture(colourA, colourB) {
  return canvasTexture(128, 128, (g) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? colourA : colourB; g.fillRect(i * 16, 0, 16, 128); }
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(255,255,255,0.25)'); grad.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  });
}

const BRANDS = [
  ['SOLACE', 'COLA'], ['HOTEL', 'BRISA'], ['PALMS', 'CASINO'], ['CAFE', 'FARO'],
  ['MERCADO', 'CENTRAL'], ['TIDEWORKS', 'GARAGE'], ['VILLA', 'SERENA'], ['SOLACE', 'SURF CO.'],
];

// ---------- the build ----------
export function buildCity(scene, seed = 7) {
  const rng = makeRng(seed * 977 + 13);
  const colliders = [];
  const animated = { water: null, fountain: null, boats: [], clouds: [] };
  const city = new THREE.Group();
  scene.add(city);

  const addCollider = (cx, cz, w, d) => colliders.push({
    minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2,
  });

  // ----- ground, roads, sidewalks -----
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x9aa0a2 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(460, 470), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 20);
  ground.receiveShadow = true;
  city.add(ground);

  const roadTex = canvasTexture(128, 128, (g) => {
    g.fillStyle = '#3d4147'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#454a51';
    for (let i = 0; i < 260; i++) g.fillRect(rng() * 128, rng() * 128, 2, 2);
    g.fillStyle = '#e8e4da';
    g.fillRect(60, 6, 8, 44); g.fillRect(60, 82, 8, 44);
    g.fillStyle = '#c9a227';
    g.fillRect(0, 0, 4, 128); g.fillRect(124, 0, 4, 128);
  }, 1, 26);
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  const roadGeoX = new THREE.PlaneGeometry(392, WORLD.roadWidth);
  const roadGeoZ = new THREE.PlaneGeometry(WORLD.roadWidth, 392);
  for (const p of WORLD.roadLines) {
    const h = new THREE.Mesh(roadGeoX, roadMat);
    h.rotation.x = -Math.PI / 2; h.position.set(0, 0.01, p); h.receiveShadow = true; city.add(h);
    const v = new THREE.Mesh(roadGeoZ, roadMat);
    v.rotation.x = -Math.PI / 2; v.rotation.z = Math.PI / 2; v.position.set(p, 0.012, 0); v.receiveShadow = true; city.add(v);
  }

  const walkMat = new THREE.MeshLambertMaterial({ color: 0xcac2b2 });
  const blockPitch = WORLD.roadLines[1] - WORLD.roadLines[0]; // 54
  const slabSize = WORLD.blockSize + WORLD.sidewalk * 2;
  const slabGeo = new THREE.BoxGeometry(slabSize, 0.14, slabSize);

  // ----- building materials (a shared set of facade variants) -----
  const facadeVariants = [
    facadeTexture(rng, '#e8dcc8', '#b09a72', 10, 6, 0.4),
    facadeTexture(rng, '#d97b4f', '#a34d2a', 8, 5, 0.35),
    facadeTexture(rng, '#7fb3c8', '#4d7d94', 12, 7, 0.5),
    facadeTexture(rng, '#e5e7ea', '#9aa2ab', 14, 8, 0.45),
    facadeTexture(rng, '#f0c987', '#c1913f', 7, 5, 0.3),
    facadeTexture(rng, '#c86f8a', '#94455e', 9, 6, 0.4),
  ];
  const facadeMats = facadeVariants.map((t) => new THREE.MeshLambertMaterial({ map: t }));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x6e4a3a });
  const roofMatBlue = new THREE.MeshLambertMaterial({ color: 0x3f6d8e });

  function building(cx, cz, w, d, h, matIdx, roof = roofMat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      [facadeMats[matIdx], facadeMats[matIdx], roof, roof, facadeMats[matIdx], facadeMats[matIdx]]);
    m.position.set(cx, h / 2 + 0.12, cz);
    m.castShadow = true; m.receiveShadow = true;
    city.add(m);
    addCollider(cx, cz, w + 0.4, d + 0.4);
    return m;
  }

  // ----- blocks -----
  const lampPositions = [];
  for (let ix = 0; ix < 6; ix++) for (let iz = 0; iz < 6; iz++) {
    const west = WORLD.roadLines[ix], east = WORLD.roadLines[ix + 1];
    const north = WORLD.roadLines[iz], south = WORLD.roadLines[iz + 1];
    const cx = (west + east) / 2, cz = (north + south) / 2;
    const slab = new THREE.Mesh(slabGeo, walkMat);
    slab.position.set(cx, 0.02, cz);
    slab.receiveShadow = true;
    city.add(slab);
    const district = districtAt(ix, iz);
    const isPlaza = (ix === 4 && iz === 1);

    if (isPlaza) {
      // Open plaza: fountain, benches, planters — no buildings, fully walkable.
      const basin = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.8, 1.1, 20),
        new THREE.MeshLambertMaterial({ color: 0xdad2c0 }));
      basin.position.set(cx, 0.55, cz); basin.castShadow = true; city.add(basin);
      const waterDisc = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 4.8, 0.24, 20),
        new THREE.MeshPhongMaterial({ color: 0x3f9db8, shininess: 120, transparent: true, opacity: 0.9 }));
      waterDisc.position.set(cx, 1.05, cz); city.add(waterDisc);
      animated.fountain = waterDisc;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 3.4, 10),
        new THREE.MeshLambertMaterial({ color: 0xcfc6b2 }));
      pillar.position.set(cx, 2.4, cz); city.add(pillar);
      addCollider(cx, cz, 11.5, 11.5);
      for (let b = 0; b < 6; b++) {
        const a = (b / 6) * Math.PI * 2;
        const bench = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 0.8),
          new THREE.MeshLambertMaterial({ color: 0x7a5230 }));
        bench.position.set(cx + Math.cos(a) * 9, 0.4, cz + Math.sin(a) * 9);
        bench.rotation.y = -a;
        city.add(bench);
      }
      continue;
    }

    if (district === 'downtown') {
      const h = 34 + rng() * 34;
      building(cx, cz, 27, 27, h, Math.floor(rng() * facadeMats.length), rng() < 0.5 ? roofMat : roofMatBlue);
    } else if (district === 'market') {
      building(cx - 10, cz - 9, 17, 15, 9 + rng() * 5, 1);
      building(cx + 11, cz + 8, 15, 17, 12 + rng() * 6, 5);
      // stalls with striped awnings on the south edge
      for (let s = 0; s < 3; s++) {
        const sx = cx - 13 + s * 12, sz = cz + 16;
        const stall = new THREE.Mesh(new THREE.BoxGeometry(6, 2.4, 3.4),
          new THREE.MeshLambertMaterial({ color: 0x8a6844 }));
        stall.position.set(sx, 1.3, sz); stall.castShadow = true; city.add(stall);
        const awn = new THREE.Mesh(new THREE.BoxGeometry(7, 0.25, 4.6),
          new THREE.MeshLambertMaterial({ map: awningTexture(s % 2 ? '#c8452c' : '#2c7a9c', '#f2ead8') }));
        awn.position.set(sx, 3.1, sz); awn.rotation.x = 0.22; city.add(awn);
        addCollider(sx, sz, 6.4, 3.8);
      }
    } else if (district === 'beachfront') {
      const h = 11 + rng() * 8;
      const hotel = building(cx, cz - 4, 30, 20, h, 4);
      // balcony stripes
      const balconies = new THREE.Mesh(new THREE.BoxGeometry(30.6, h * 0.7, 0.5),
        new THREE.MeshLambertMaterial({ map: awningTexture('#f2ead8', '#e2703a'), transparent: false }));
      balconies.position.set(cx, h * 0.45, cz + 6.3);
      city.add(balconies);
      void hotel;
    } else if (district === 'plaza') {
      building(cx - 10, cz, 16, 24, 15 + rng() * 8, 2);
      building(cx + 11, cz - 6, 15, 16, 10 + rng() * 5, 3);
    } else { // residential: four houses with pitched roofs
      for (const [ox, oz] of [[-10, -10], [10, -10], [-10, 10], [10, 10]]) {
        const h = 5.5 + rng() * 2.5;
        building(cx + ox, cz + oz, 12, 11, h, Math.floor(rng() * facadeMats.length));
        const roof = new THREE.Mesh(new THREE.ConeGeometry(9.4, 3.4, 4),
          new THREE.MeshLambertMaterial({ color: 0xa34d2a }));
        roof.position.set(cx + ox, h + 1.8, cz + oz);
        roof.rotation.y = Math.PI / 4;
        roof.castShadow = true;
        city.add(roof);
      }
    }

    // streetlights on two corners of the block
    lampPositions.push([west + 9, north + 9], [east - 9, south - 9]);
  }

  // ----- streetlights -----
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 5.6, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3c4148 });
  const bulbGeo = new THREE.SphereGeometry(0.34, 8, 6);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe6a8 });
  for (const [x, z] of lampPositions) {
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(x, 2.8, z); pole.castShadow = true; city.add(pole);
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(x, 5.7, z); city.add(bulb);
  }

  // ----- billboards with original local brands -----
  const boardSpots = [
    [-54, -186, 0], [54, -186, 0], [-186, 54, Math.PI / 2], [186, -54, -Math.PI / 2],
    [-27, 186, Math.PI], [140, 186, Math.PI], [-186, -108, Math.PI / 2],
  ];
  boardSpots.forEach(([x, z, ry], i) => {
    const [l1, l2] = BRANDS[i % BRANDS.length];
    const tex = billboardTexture([l1, l2], i % 2 ? '#173a5e' : '#7a1f1f', '#fdf6e0', '#e8a33d');
    const board = new THREE.Mesh(new THREE.BoxGeometry(13, 6.4, 0.4),
      new THREE.MeshBasicMaterial({ map: tex }));
    board.position.set(x, 9.5, z); board.rotation.y = ry; city.add(board);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6.5, 0.5), poleMat);
    leg.position.set(x, 3.2, z); city.add(leg);
  });

  // ----- palms -----
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 5.4, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a44 });
  const frondTex = canvasTexture(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
    g.strokeStyle = '#3e7d32'; g.lineWidth = 7; g.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const a = -0.4 - i * 0.32;
      g.beginPath(); g.moveTo(64, 118);
      g.quadraticCurveTo(64 + Math.cos(a) * 44, 118 + Math.sin(a) * 52 - 22, 64 + Math.cos(a) * 62, 118 + Math.sin(a) * 66);
      g.stroke();
    }
  });
  const frondMat = new THREE.MeshLambertMaterial({ map: frondTex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide });
  const frondGeo = new THREE.PlaneGeometry(4.6, 4.6);
  function palm(x, z, lean) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 2.7; trunk.rotation.z = lean; trunk.castShadow = true; g.add(trunk);
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Mesh(frondGeo, frondMat);
      f.position.set(Math.sin(-lean) * 5.2, 5.6, 0);
      f.rotation.set(-0.7, (i / 5) * Math.PI * 2, 0);
      g.add(f);
    }
    g.position.set(x, 0, z);
    g.rotation.y = rng() * Math.PI * 2;
    city.add(g);
  }
  for (let x = -170; x <= 170; x += 17) palm(x + randJitter(rng, 3), 196 + randJitter(rng, 3), randJitter(rng, 0.14));
  for (let i = 0; i < 26; i++) {
    const lx = WORLD.roadLines[Math.floor(rng() * 7)];
    const lz = WORLD.roadLines[Math.floor(rng() * 7)];
    palm(lx + 10.5, lz + randJitter(rng, 60), randJitter(rng, 0.12));
  }
  palm(122, 210, 0.1); palm(136, 210, -0.08); palm(60, 190, 0.05); palm(-100, 192, 0.12);

  // ----- beach + sea -----
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(460, 60),
    new THREE.MeshLambertMaterial({ color: 0xe8cf9e }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.0, WORLD.beachStart + 22);
  sand.receiveShadow = true; city.add(sand);

  const waterTex = canvasTexture(256, 256, (g) => {
    g.fillStyle = '#2a7d9e'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3;
    for (let i = 0; i < 12; i++) {
      g.beginPath();
      const y = i * 22 + 6;
      g.moveTo(0, y); g.bezierCurveTo(70, y - 6, 180, y + 6, 256, y);
      g.stroke();
    }
  }, 10, 6);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(560, 240),
    new THREE.MeshPhongMaterial({ map: waterTex, color: 0x9fd4e8, shininess: 160, transparent: true, opacity: 0.94 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, WORLD.waterLevel, WORLD.waterStart + 118);
  city.add(water);
  animated.water = waterTex;

  // beach umbrellas
  const umbrellaCols = [0xe2543e, 0x2c7a9c, 0xf2b13d, 0x51a06b];
  for (let i = 0; i < 9; i++) {
    const ux = -150 + i * 36 + randJitter(rng, 8), uz = 200 + randJitter(rng, 8);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 5), poleMat);
    pole.position.set(ux, 1.3, uz); city.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.2, 0.9, 8),
      new THREE.MeshLambertMaterial({ color: umbrellaCols[i % 4] }));
    top.position.set(ux, 2.8, uz); top.castShadow = true; city.add(top);
  }

  // ----- marina pier + boats -----
  const deckMat = new THREE.MeshLambertMaterial({ color: 0x9a7648 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(PIER.maxX - PIER.minX, 0.5, PIER.maxZ - PIER.minZ), deckMat);
  deck.position.set((PIER.minX + PIER.maxX) / 2, -0.2, (PIER.minZ + PIER.maxZ) / 2);
  deck.receiveShadow = true; city.add(deck);
  const postGeo = new THREE.CylinderGeometry(0.22, 0.22, 1.6, 6);
  for (let z = PIER.minZ + 4; z < PIER.maxZ; z += 9) {
    for (const x of [PIER.minX + 0.6, PIER.maxX - 0.6]) {
      const post = new THREE.Mesh(postGeo, deckMat);
      post.position.set(x, 0.3, z); city.add(post);
    }
  }
  const hullCols = [0xf2ead8, 0xc8452c, 0x2c7a9c, 0xf2b13d, 0xe5e7ea, 0x51a06b];
  for (let i = 0; i < 6; i++) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.3, 9),
      new THREE.MeshLambertMaterial({ color: hullCols[i] }));
    hull.position.y = 0.35; boat.add(hull);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(1.7, 3.4, 4),
      new THREE.MeshLambertMaterial({ color: hullCols[i] }));
    bow.rotation.set(Math.PI / 2, Math.PI / 4, 0); bow.position.set(0, 0.35, 6); boat.add(bow);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.3, 3),
      new THREE.MeshLambertMaterial({ color: 0xf5f2ea }));
    cabin.position.set(0, 1.5, -0.8); boat.add(cabin);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 7, 5), poleMat);
    mast.position.set(0, 4.2, 1.6); boat.add(mast);
    const side = i % 2 ? 1 : -1;
    boat.position.set(side < 0 ? PIER.minX - 6 : PIER.maxX + 6, WORLD.waterLevel + 0.35, PIER.minZ + 10 + i * 8.5);
    boat.rotation.y = randJitter(rng, 0.15);
    city.add(boat);
    animated.boats.push({ group: boat, phase: rng() * 6.28, baseY: boat.position.y });
  }

  // crates + barriers near the marina and garage
  const crateMat = new THREE.MeshLambertMaterial({ color: 0xa8814f });
  const crateSpots = [[104, 196], [107, 198], [104.5, 193], [146, -128], [149, -131], [-140, -14], [-143, -16]];
  for (const [x, z] of crateSpots) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 2.2), crateMat);
    crate.position.set(x, 1.1, z); crate.rotation.y = rng() * 0.8; crate.castShadow = true; city.add(crate);
    addCollider(x, z, 2.6, 2.6);
  }

  // ----- sky, sun, clouds -----
  const skyTex = canvasTexture(64, 512, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#2c5f9e');
    grad.addColorStop(0.45, '#7db3dd');
    grad.addColorStop(0.75, '#f7c98a');
    grad.addColorStop(1, '#ffdfae');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 512);
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 20, 12),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }));
  city.add(sky);

  const cloudTex = canvasTexture(256, 128, (g) => {
    g.clearRect(0, 0, 256, 128);
    g.fillStyle = 'rgba(255,250,240,0.85)';
    for (const [x, y, r] of [[70, 80, 34], [120, 66, 44], [176, 80, 32], [100, 88, 38], [150, 90, 36]]) {
      g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill();
    }
  });
  const cloudMat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false });
  for (let i = 0; i < 9; i++) {
    const cloud = new THREE.Mesh(new THREE.PlaneGeometry(120, 60), cloudMat);
    cloud.position.set(randJitter(rng, 500), 130 + rng() * 60, randJitter(rng, 500));
    cloud.userData.speed = 0.6 + rng() * 0.8;
    city.add(cloud);
    animated.clouds.push(cloud);
  }

  return {
    colliders,
    update(dt, t) {
      if (animated.water) animated.water.offset.y = (t * 0.014) % 1;
      for (const b of animated.boats) {
        b.group.position.y = b.baseY + Math.sin(t * 0.9 + b.phase) * 0.14;
        b.group.rotation.z = Math.sin(t * 0.7 + b.phase) * 0.03;
      }
      if (animated.fountain) animated.fountain.rotation.y += dt * 0.4;
      for (const c of animated.clouds) {
        c.position.x += c.userData.speed * dt;
        if (c.position.x > 560) c.position.x = -560;
      }
    },
  };
}

function randJitter(rng, amt) { return (rng() - 0.5) * 2 * amt; }

// Resolve a circle (x, z, r) out of every building AABB; returns corrected [x, z].
export function collideCircle(colliders, x, z, r) {
  for (const c of colliders) {
    if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) {
      const pushLeft = x - (c.minX - r), pushRight = (c.maxX + r) - x;
      const pushUp = z - (c.minZ - r), pushDown = (c.maxZ + r) - z;
      const min = Math.min(pushLeft, pushRight, pushUp, pushDown);
      if (min === pushLeft) x = c.minX - r;
      else if (min === pushRight) x = c.maxX + r;
      else if (min === pushUp) z = c.minZ - r;
      else z = c.maxZ + r;
    }
  }
  return [x, z];
}
