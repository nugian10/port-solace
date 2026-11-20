# Port Solace

[![Make GTA 6 on make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![Port Solace rank](https://make.fun/badge/gta6-01/nugian10/port-solace/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![Port Solace reward](https://make.fun/badge/gta6-01/nugian10/port-solace/reward.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Port Solace** is an original open-world crime game that runs entirely in a
desktop browser from static files — no server, no network requests, no build
step. Every street, car, name and line of dialogue is invented for this game.

## The story

Marlo Venn is a small-time driver who owes money in a city that never rains.
Mercado fixer **Tomas Rey** offers a way out: seven jobs across Port Solace —
a package run, a borrowed coupe, a hot suitcase, a timed dash across town, a
shootout with the Corso crew on Pier 9, a VIP fare, and one last sunset run
with the whole Solace PD looking for you. Finish the chain, keep the cash,
and the debt is history.

## What is in the game

- A procedural coastal city: downtown towers, the Mercado market streets, a
  central plaza, apartment blocks, a beachfront strip with hotels, and a
  marina pier with boats — all under a warm late-afternoon sun.
- Driving with six car types (sedan, hatch, van, sport coupe, taxi, police),
  parked cars to steal, and traffic that follows the road grid, brakes for
  obstacles and reacts to collisions.
- Pedestrians who stroll the sidewalks, flee gunfire and dive away from
  speeding cars.
- A 0–5 star wanted system: witnessed theft, hits and gunfire raise your
  heat; Solace PD cruisers spawn, pursue and ram; break line of sight and
  the stars cool off. Get caught standing in reach of a cruiser and you are
  **BUSTED**; lose all your health and you wake up at the hospital —
  **WASTED** — minus a cash penalty either way.
- A seven-job story chain with phone dialogue, in-world objective beacons
  and minimap blips, plus repeatable taxi fares in free roam.
- Pistol combat with tracers, muzzle flash and enemy gunmen who shoot back.
- A full HUD: health, cash, wanted stars and heat bar, objective line,
  dialogue box, speedometer, and a live top-down minimap with traffic,
  police and objective blips.
- Synthesized sound — engine, two-tone sirens, gunshots, cash blips and a
  little radio loop — generated with WebAudio. There are no audio files.
- Progress (cash, story progress, position) saves to `localStorage`;
  Continue picks up where you left off.

## Controls

| Input | Action |
| --- | --- |
| W A S D / arrows | Move / drive |
| Mouse | Orbit camera, aim |
| Mouse click | Shoot |
| Shift | Sprint |
| E | Enter / exit a car |
| Space | Brake |
| J | Start the next story job |
| T | Take / cancel a taxi fare |
| P or Esc | Pause |
| M | Mute |

## Run it

```sh
node serve.ts
```

then open <http://localhost:8080> in a desktop browser. That is all — the
game is static files under `game/` and works offline.

## Layout

- `game/index.html` — page shell, styles, import map
- `game/src/` — the game itself, one module per job: `config.js` (city
  layout), `city.js` (procedural city), `vehicles.js` (cars + traffic AI),
  `pedestrians.js`, `player.js`, `police.js` (wanted system),
  `combat.js`, `missions.js` (story jobs + taxi fares), `hud.js` (HUD +
  minimap), `audio.js`, `effects.js`, `input.js`, `save.js`, `shots.js`
  (screenshot posing), `main.js` (orchestrator)
- `game/vendor/three.module.min.js` — vendored Three.js r160
- `screenshots/` — the four entry screenshots
- `main.ts` — packages `game/` + `screenshots/` into an output directory
  and writes the `dossier.json` manifest

Open `http://localhost:8080/?test=1` to run the built-in self-test
(24 checks: boot, walking, driving, mission flow, police, combat, saving).

---

Entered on make.fun — [the “Make GTA 6” bounty](https://make.fun/bounty/gta6-01?ref=c9snmccq)
