// config.js — Port Solace: shared constants, the city layout plan and the seeded RNG.
// Everything spatial in the game derives from the numbers here, so the road network,
// the traffic routes, the minimap and the mission markers all agree with each other.

export const WORLD = {
  // Streets form a square grid. Road centre lines sit at these coordinates on both axes;
  // city blocks fill the squares between neighbouring streets.
  roadLines: [-162, -108, -54, 0, 54, 108, 162],
  roadWidth: 14,          // asphalt width of every street
  laneOffset: 3.4,        // traffic keeps this far right of a centre line
  sidewalk: 3.2,          // pavement ring around each block
  blockSize: 40,          // building plot square between streets (54 pitch - 14 road)
  cityEdge: 176,          // buildings and play stay inside this on x and z (north/west/east)
  beachStart: 184,        // sand begins at z = beachStart on the south side
  waterStart: 216,        // open water begins here; the marina pier reaches into it
  waterLevel: -0.55,
  groundY: 0,
};

export const GAME = {
  title: 'PORT SOLACE',
  subtitle: 'a small-time driver story',
  heroName: 'Marlo Venn',
  saveKey: 'port-solace-save-v1',
  gravity: 22,
  walkSpeed: 6.2,
  sprintSpeed: 9.6,
  playerRadius: 0.55,
  playerHealth: 100,
  interactRange: 3.6,
  startCash: 40,
  hospitalFee: 120,
  stationFee: 90,
};

export const WANTED = {
  maxStars: 5,
  // heat is a float; stars shown = ceil of the band the heat sits in
  theftHeat: 1.05,
  hitPedHeat: 1.2,
  hitCarHeat: 0.45,
  shotHeat: 0.8,
  witnessRadius: 26,
  decayPerSecond: 0.055,   // while no officer can see the player
  seenGraceSeconds: 4,     // heat holds this long after losing sight before decaying
  policePerStar: 1.6,
  policeCap: 7,
  bustedSeconds: 2.4,      // an officer this close, this long, on foot = busted
  bustedRange: 2.6,
};

// --- deterministic RNG (mulberry32) so ?seed= builds the same city every time ---
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length) % list.length];
}

export function randRange(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

// District flavour per block, keyed by grid indices (ix, iz) of the block's west/north corner.
// The map reads: downtown in the middle, market to the west, plaza east, beachfront south.
export function districtAt(ix, iz) {
  if (iz >= 4) return 'beachfront';
  if (ix <= 1 && iz >= 1 && iz <= 3) return 'market';
  if (ix >= 4 && iz <= 2) return 'plaza';
  if (ix >= 2 && ix <= 3 && iz >= 1 && iz <= 3) return 'downtown';
  return 'residential';
}

// Named places the story uses. Coordinates are on streets or the pier so markers sit reachable.
export const PLACES = {
  startAlley:    { x: -131, z: -131, label: 'Callejon Court' },
  marketStall:   { x: -150, z: -20,  label: 'Mercado Steps' },
  marinaGate:    { x: 128,  z: 196,  label: 'Marina Gate' },
  chopGarage:    { x: 150,  z: -140, label: 'Tideworks Garage' },
  plazaFountain: { x: 132,  z: -84,  label: 'Plaza Fountain' },
  safehouse:     { x: -140, z: 132,  label: 'Casa Venn, Gull Street' },
  hotel:         { x: 60,   z: 178,  label: 'Hotel Brisa' },
  lookout:       { x: -168, z: 168,  label: 'Gull Point Lookout' },
  pierEnd:       { x: 128,  z: 246,  label: 'Pier 9, Marina Solace' },
  hospital:      { x: -27,  z: -168, label: 'St. Alba Hospital' },
  station:       { x: 27,   z: 168,  label: 'Port Solace Police, South Post' },
  goldCoupeSpot: { x: 108,  z: 200,  label: 'Marina Promenade' },
  mansion:       { x: -108, z: 178,  label: 'Villa Serena Gate' },
};
