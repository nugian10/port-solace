// Port Solace — make.fun gta6-01 entry program (Node 22, standard library only).
//
// The game itself is the game/ folder beside this file: plain static files a desktop
// browser plays offline (game/index.html, its ES modules and one vendored three.js
// build). This program hands the entry in: it first re-checks the bundle against the
// scorer's published caps, then copies game/ and screenshots/ into the output
// directory and writes dossier.json there with the vendored make.fun library —
// byte for byte the dossier the gate rebuilds and compares.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's caps (reference/gate.json), checked before anything is copied so a
// bundle that would be refused fails here, loudly, instead of at the gate.
const CAPS = {
  gameMaxFiles: 993,
  gameMaxBytes: 50331648, // 48 MiB
  gamePathMaxBytes: 1000,
  shotMax: 4,
  shotMaxBytes: 262144, // 256 KiB
  dossierMaxBytes: 1572864, // 1.5 MiB
};

function walk(dir, base, acc) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, rel, acc);
    else acc.push({ rel, bytes: st.size });
  }
  return acc;
}

function preflight() {
  const gameDir = join(here, 'game');
  const files = walk(gameDir, '', []);
  const totalBytes = files.reduce((sum, f) => sum + f.bytes, 0);
  if (files.length > CAPS.gameMaxFiles) {
    throw new Error(`game/ holds ${files.length} files, over the ${CAPS.gameMaxFiles} cap`);
  }
  if (totalBytes > CAPS.gameMaxBytes) {
    throw new Error(`game/ is ${totalBytes} bytes, over the ${CAPS.gameMaxBytes} cap`);
  }
  for (const f of files) {
    if (Buffer.byteLength(f.rel, 'utf8') > CAPS.gamePathMaxBytes) {
      throw new Error(`game path too long: ${f.rel}`);
    }
  }
  if (!existsSync(join(gameDir, 'index.html'))) throw new Error('game/index.html is missing');

  const shotsDir = join(here, 'screenshots');
  const shots = existsSync(shotsDir)
    ? readdirSync(shotsDir).filter((n) => !n.startsWith('.')).sort()
    : [];
  if (shots.length < 3 || shots.length > CAPS.shotMax) {
    throw new Error(`screenshots/ must hold 3 or 4 images, found ${shots.length}`);
  }
  for (const name of shots) {
    const path = join(shotsDir, name);
    const { size } = statSync(path);
    if (size > CAPS.shotMaxBytes) throw new Error(`screenshot ${name} is ${size} bytes, over the 256 KiB cap`);
    const digest = createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 12);
    console.log(`port-solace: screenshot ${name} ${size} bytes sha256:${digest}`);
  }
  return { files, totalBytes, shots };
}

const manifest = preflight();

cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: CAPS.shotMax, max_bytes: CAPS.shotMaxBytes },
  game_max_files: CAPS.gameMaxFiles,
  game_max_bytes: CAPS.gameMaxBytes,
  game_path_max_bytes: CAPS.gamePathMaxBytes,
});
if (Buffer.byteLength(dossier, 'utf8') > CAPS.dossierMaxBytes) {
  throw new Error('dossier.json would exceed the 1.5 MiB cap');
}
// Cross-check: the dossier must describe exactly the bundle that was copied.
// buildDossier returns the dossier as bytes; its JSON shape is
// { cover, images: [base64...], schema, text } — the source outline is `text`.
const parsed = JSON.parse(Buffer.from(dossier).toString('utf8'));
if (!Array.isArray(parsed.images) || parsed.images.length !== manifest.shots.length || parsed.cover !== 0) {
  throw new Error('dossier.json screenshot set does not match the copied screenshots');
}
if (typeof parsed.text !== 'string' || !parsed.text.includes('game/src/main.js') || !parsed.text.includes('game/index.html')) {
  throw new Error('dossier.json source outline is missing the game entry points');
}
writeFileSync(join(out, 'dossier.json'), dossier);

console.log(`port-solace: handed in ${manifest.files.length} game files (${manifest.totalBytes} bytes), ` +
  `${manifest.shots.length} screenshots (${manifest.shots.join(', ')}), dossier ${Buffer.byteLength(dossier, 'utf8')} bytes`);
