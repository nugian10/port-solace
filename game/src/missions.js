// missions.js — Port Solace's story: seven jobs for fixer Tomas Rey and the crew,
// from a first package run to the sunset getaway, plus repeatable taxi fares in
// free roam. A job is a list of steps (go-to, steal, deliver, escape, timed
// checkpoints, a pier shootout, a VIP pickup); this module owns the step machine,
// the objective marker the HUD draws, job props (the marked steal car, the VIP)
// and every reward.

import { PLACES } from './config.js';
import { createCar } from './vehicles.js';

export const JOBS = [
  {
    id: 'first-run', title: 'First Run', giver: 'Tomas Rey',
    phone: [
      'Tomas: Marlo. Heard you can drive and keep your mouth shut. Good combo.',
      'Tomas: Pick up a package at the Mercado steps. Take it to Marina Gate. Cash on delivery.',
    ],
    steps: [
      { type: 'goto', at: PLACES.marketStall, text: 'Pick up the package at the Mercado steps', r: 8 },
      { type: 'goto', at: PLACES.marinaGate, text: 'Deliver the package to Marina Gate', r: 9 },
    ],
    reward: 150,
    outro: ['Tomas: Clean work. The marina boys like you already.'],
  },
  {
    id: 'borrowed-wheels', title: 'Borrowed Wheels', giver: 'Tomas Rey',
    phone: [
      'Tomas: A red sports coupe near Plaza Fountain belongs to a man who owes me.',
      'Tomas: Take it. Bring it to Tideworks Garage. Do not scratch the paint. Much.',
    ],
    steps: [
      { type: 'steal', at: { x: 135, z: -47 }, carType: 'sport', carColour: 0xd92323, text: 'Steal the red coupe by Plaza Fountain' },
      { type: 'deliverCar', at: PLACES.chopGarage, text: 'Deliver the coupe to Tideworks Garage', r: 10 },
    ],
    reward: 250,
    outro: ['Tomas: Ha! He will see it on a postcard from nowhere. Good.'],
  },
  {
    id: 'hot-property', title: 'Hot Property', giver: 'Tomas Rey',
    phone: [
      'Tomas: There is a suitcase by the Plaza Fountain. It is, ah, warm.',
      'Tomas: The police will notice when you take it. Lose them, then come home to Casa Venn.',
    ],
    steps: [
      { type: 'goto', at: PLACES.plazaFountain, text: 'Grab the suitcase at Plaza Fountain', r: 8, heat: 3 },
      { type: 'escape', text: 'Lose the police' },
      { type: 'goto', at: PLACES.safehouse, text: 'Lie low at Casa Venn', r: 9 },
    ],
    reward: 350,
    outro: ['Tomas: You are ice, Marlo. The suitcase says thank you.'],
  },
  {
    id: 'rush-hour', title: 'Rush Hour Special', giver: 'Chef Alba',
    phone: [
      'Alba: Marlo! My kitchen is drowning. Four drops, one run, no excuses.',
      'Alba: Hotel Brisa, the Mercado, Plaza Fountain, Marina Gate. The clock is rude. Go!',
    ],
    steps: [
      {
        type: 'timed', time: 170, requireCar: true,
        checkpoints: [PLACES.hotel, PLACES.marketStall, PLACES.plazaFountain, PLACES.marinaGate],
        text: 'Make all four food drops before the timer dies',
      },
    ],
    reward: 300,
    outro: ['Alba: Everything arrived hot. You are my favourite emergency.'],
  },
  {
    id: 'pier-pressure', title: 'Pier Pressure', giver: 'Tomas Rey',
    phone: [
      'Tomas: The Corso crew thinks Pier 9 is theirs now. It is not.',
      'Tomas: Go to the pier. Settle it. Bring a steady hand, Marlo.',
    ],
    steps: [
      { type: 'shootout', at: PLACES.pierEnd, count: 5, text: 'Clear the Corso crew off Pier 9' },
    ],
    reward: 450,
    outro: ['Tomas: The pier is ours again. The gulls applaud you.'],
  },
  {
    id: 'the-big-fare', title: 'The Big Fare', giver: 'Concierge Ines',
    phone: [
      'Ines: A guest at Hotel Brisa needs Gull Point, urgently and quietly.',
      'Ines: The police may disagree with his schedule. Drive well, Marlo.',
    ],
    steps: [
      { type: 'vipPickup', at: PLACES.hotel, text: 'Pick up the guest at Hotel Brisa', r: 9 },
      { type: 'goto', at: PLACES.lookout, text: 'Take the guest to Gull Point Lookout', r: 10, requireCar: true },
    ],
    reward: 500,
    outro: ['Ines: He tipped in silence and vanished. Perfect service.'],
  },
  {
    id: 'sunset-getaway', title: 'Sunset Getaway', giver: 'Tomas Rey',
    phone: [
      'Tomas: Last one, Marlo. A gold coupe sits on the Marina Promenade, full of somebody else\'s money.',
      'Tomas: Take it to Villa Serena. Every badge in Solace will want a word. Do not stop to chat.',
    ],
    steps: [
      { type: 'steal', at: PLACES.goldCoupeSpot, carType: 'sport', carColour: 0xf2b13d, text: 'Steal the gold coupe on the Promenade', heatAfter: 3 },
      { type: 'deliverCar', at: PLACES.mansion, text: 'Deliver the coupe to Villa Serena', r: 10 },
    ],
    reward: 800,
    outro: [
      'Tomas: That is the whole board, Marlo. Port Solace is yours now.',
      'Tomas: Drive safe. Or do not. You have earned either.',
    ],
  },
];

export class Missions {
  // game: { scene, player, peds, police, traffic, hud, effects, addCash, onProgress }
  constructor(game) {
    this.game = game;
    this.jobIndex = 0;
    this.jobDone = false;
    this.active = null;          // { def, stepIndex, stepState }
    this.jobCar = null;
    this.vipPed = null;
    this.taxi = { state: 'idle', ped: null, dest: null, cooldown: 8, fare: 0 };
    this.enemiesSpawned = false;
  }

  get currentDef() { return this.active ? this.active.def : null; }

  objective() {
    if (this.taxi.state === 'toPickup') {
      return { text: 'Taxi: pick up the fare', marker: { x: this.taxi.ped.x, z: this.taxi.ped.z }, colour: '#f2b13d' };
    }
    if (this.taxi.state === 'toDrop') {
      return { text: 'Taxi: drop off your passenger', marker: this.taxi.dest, colour: '#f2b13d' };
    }
    if (!this.active) {
      if (this.jobDone) return { text: 'Free roam — press T for a taxi fare, the city is yours', marker: null };
      return { text: `Press J to take the next job: ${JOBS[this.jobIndex].title}`, marker: null };
    }
    const step = this.active.def.steps[this.active.stepIndex];
    let text = step.text;
    if (step.type === 'timed') {
      const s = this.active.stepState;
      text = `Food drops: ${s.done}/${step.checkpoints.length} — ${Math.max(0, Math.ceil(s.timeLeft))}s left`;
      return { text, marker: step.checkpoints[s.done], colour: '#7ee787' };
    }
    if (step.type === 'escape') return { text, marker: null };
    if (step.type === 'shootout' && !this.enemiesSpawned) return { text: 'Head to Pier 9', marker: step.at, colour: '#ff7b72' };
    if (step.type === 'shootout') return { text: `Clear the Corso crew: ${this.game.peds.countAliveEnemies()} left`, marker: step.at, colour: '#ff7b72' };
    return { text, marker: step.at ?? null, colour: '#ffd76b' };
  }

  startNextJob() {
    if (this.active || this.jobDone) return false;
    this.startJob(this.jobIndex);
    return true;
  }

  startJob(index) {
    const def = JOBS[index];
    if (!def) { this.jobDone = true; return; }
    this.active = { def, stepIndex: 0, stepState: null };
    this.enemiesSpawned = false;
    this._enterStep();
    this.game.hud.showDialogue([`${def.giver} — ${def.title}`, ...def.phone]);
    this.game.hud.banner(`NEW JOB — ${def.title}`);
  }

  _enterStep() {
    const step = this.active.def.steps[this.active.stepIndex];
    this.active.stepState = null;
    if (step.type === 'steal') {
      const car = createCar(this.game.scene, step.carType, step.carColour, step.at.x, step.at.z, Math.PI / 2);
      car.driver = 'parked';
      car.isMissionCar = true;
      this.game.traffic.cars.push(car);
      this.jobCar = car;
    }
    if (step.type === 'timed') {
      this.active.stepState = { done: 0, timeLeft: step.time };
    }
    if (step.type === 'vipPickup') {
      const ped = this.game.peds.spawnEnemy(step.at.x + 3, step.at.z + 2, { shirt: 0xf2ead8, pants: 0x30323a });
      ped.isEnemy = false;
      ped.state = 'walk';
      ped.health = 999;
      ped.retarget = 1e9;                    // the guest waits at the kerb, no wandering
      ped.targetX = ped.x; ped.targetZ = ped.z;
      this.vipPed = ped;
    }
    if (step.heat) this.game.police.setHeat(step.heat);
  }

  _completeStep() {
    const { def } = this.active;
    this.active.stepIndex++;
    if (this.active.stepIndex >= def.steps.length) {
      this.active = null;
      this.jobCar = null;
      this.jobIndex++;
      this.game.stats.jobsCompleted++;
      this.game.addCash(def.reward, `Job complete — ${def.title}`);
      this.game.hud.showDialogue(def.outro);
      if (this.jobIndex >= JOBS.length) {
        this.jobDone = true;
        this.game.hud.banner('STORY COMPLETE — Port Solace is yours');
      }
      if (this.game.onProgress) this.game.onProgress();
      return;
    }
    this._enterStep();
  }

  notifyEnterCar(car) {
    if (!this.active) return;
    const step = this.active.def.steps[this.active.stepIndex];
    if (step.type === 'steal' && car === this.jobCar) {
      car.isMissionCar = false;
      if (step.heatAfter) {
        this.game.police.setHeat(step.heatAfter);
        this.game.police.heatFloor = 1.4;
      }
      this._completeStep();
    }
  }

  update(dt) {
    this._updateTaxi(dt);
    if (!this.active) return;
    const step = this.active.def.steps[this.active.stepIndex];
    const player = this.game.player;
    const ppos = player.pos;

    switch (step.type) {
      case 'goto': {
        if (step.requireCar && player.mode !== 'drive') break;
        if (Math.hypot(ppos.x - step.at.x, ppos.z - step.at.z) < (step.r ?? 8)) {
          if (step.heat) this.game.police.setHeat(step.heat);
          this._completeStep();
        }
        break;
      }
      case 'deliverCar': {
        if (player.mode === 'drive' && player.car === this.jobCar) {
          if (Math.hypot(ppos.x - step.at.x, ppos.z - step.at.z) < step.r) {
            this.game.police.heatFloor = 0;
            const car = this.jobCar;
            player.exitCar(true);
            car.driver = 'parked';
            this._completeStep();
          }
        }
        break;
      }
      case 'escape': {
        if (this.game.police.stars === 0 && this.game.police.heat < 0.05) this._completeStep();
        break;
      }
      case 'timed': {
        const s = this.active.stepState;
        if (player.mode === 'drive') s.timeLeft -= dt;
        const cp = step.checkpoints[s.done];
        if (cp && Math.hypot(ppos.x - cp.x, ppos.z - cp.z) < 11) {
          s.done++;
          this.game.hud.toast(`Drop ${s.done} of ${step.checkpoints.length} done`);
          if (s.done >= step.checkpoints.length) { this._completeStep(); break; }
        }
        if (s.timeLeft <= 0) {
          s.done = 0;
          s.timeLeft = step.time;
          this.game.hud.toast('Out of time — the run restarts. Alba is furious.');
        }
        break;
      }
      case 'shootout': {
        const d = Math.hypot(ppos.x - step.at.x, ppos.z - step.at.z);
        if (!this.enemiesSpawned && d < 34) {
          this.enemiesSpawned = true;
          const spots = [[-6, -8], [5, -12], [0, 6], [-9, 2], [8, 8]];
          for (let i = 0; i < step.count; i++) {
            this.game.peds.spawnEnemy(step.at.x + spots[i][0], step.at.z + spots[i][1], { health: 60 });
          }
          this.game.hud.toast('The Corso crew is here — fight!');
        }
        if (this.enemiesSpawned && this.game.peds.countAliveEnemies() === 0) this._completeStep();
        break;
      }
      case 'vipPickup': {
        if (player.mode === 'drive' && Math.hypot(ppos.x - step.at.x, ppos.z - step.at.z) < step.r) {
          if (this.vipPed) {
            this.vipPed.state = 'passenger';
            this.vipPed.group.visible = false;
          }
          this.game.police.setHeat(2);
          this.game.police.heatFloor = 1.1;
          this._completeStep();
        }
        break;
      }
    }
    // arriving at the final goto of the VIP job releases the passenger + the heat pin
    if (this.active && this.vipPed && this.active.def.id === 'the-big-fare' && this.active.stepIndex >= this.active.def.steps.length - 1) {
      // handled at completion below via jobIndex change; see _releaseVip in update end
    }
    if (!this.active && this.vipPed) this._releaseVip();
  }

  _releaseVip() {
    const ped = this.vipPed;
    this.vipPed = null;
    this.game.police.heatFloor = 0;
    if (ped) {
      const p = this.game.player.pos;
      ped.state = 'walk';
      ped.group.visible = true;
      ped.x = p.x + 3; ped.z = p.z + 2;
      ped.group.position.set(ped.x, 0, ped.z);
    }
  }

  // ---------------- taxi ----------------
  requestTaxi() {
    if (this.taxi.state !== 'idle') { this.cancelTaxi('Fare cancelled.'); return; }
    if (this.taxi.cooldown > 0) { this.game.hud.toast('No fares right now — give it a moment.'); return; }
    const player = this.game.player;
    const ppos = player.pos;
    const ped = this.game.peds.nearest(ppos.x, ppos.z, 130, ['walk']);
    if (!ped) { this.game.hud.toast('Nobody is hailing a cab nearby.'); return; }
    this.taxi.state = 'toPickup';
    this.taxi.ped = ped;
    ped.state = 'walk';
    ped.targetX = ped.x; ped.targetZ = ped.z;
    this.game.hud.toast('Taxi fare hailed — follow the gold marker.');
  }

  cancelTaxi(message) {
    if (this.taxi.ped && this.taxi.state === 'toDrop') {
      const ped = this.taxi.ped;
      ped.state = 'walk';
      ped.group.visible = true;
      const p = this.game.player.pos;
      ped.x = p.x + 2.5; ped.z = p.z;
    }
    this.taxi.state = 'idle';
    this.taxi.ped = null;
    this.taxi.dest = null;
    this.taxi.cooldown = 6;
    if (message) this.game.hud.toast(message);
  }

  _updateTaxi(dt) {
    const t = this.taxi;
    if (t.cooldown > 0) t.cooldown -= dt;
    if (t.state === 'idle') return;
    const player = this.game.player;
    const ppos = player.pos;
    if (t.state === 'toPickup') {
      if (!t.ped || t.ped.state === 'down' || t.ped.state === 'dead') { this.cancelTaxi('The fare gave up.'); return; }
      if (player.mode === 'drive' && Math.abs(player.car.speed) < 2.5 &&
          Math.hypot(ppos.x - t.ped.x, ppos.z - t.ped.z) < 6) {
        t.ped.state = 'passenger';
        t.ped.group.visible = false;
        const dests = [PLACES.hotel, PLACES.plazaFountain, PLACES.marinaGate, PLACES.marketStall, PLACES.lookout, PLACES.safehouse, PLACES.chopGarage];
        t.dest = dests[Math.floor(Math.random() * dests.length)];
        t.fare = 25 + Math.hypot(t.dest.x - ppos.x, t.dest.z - ppos.z) * 0.32;
        t.state = 'toDrop';
        this.game.hud.toast(`Fare aboard — take them to ${t.dest.label}.`);
      }
    } else if (t.state === 'toDrop') {
      if (player.mode !== 'drive') { /* passenger waits in the car */ return; }
      if (Math.hypot(ppos.x - t.dest.x, ppos.z - t.dest.z) < 10 && Math.abs(player.car.speed) < 3) {
        const ped = t.ped;
        ped.state = 'walk';
        ped.group.visible = true;
        ped.x = ppos.x + 3; ped.z = ppos.z + 1;
        ped.group.position.set(ped.x, 0, ped.z);
        this.game.addCash(Math.round(t.fare), 'Taxi fare');
        this.game.stats.faresDone++;
        t.state = 'idle';
        t.ped = null; t.dest = null;
        t.cooldown = 14;
        if (this.game.onProgress) this.game.onProgress();
      }
    }
  }
}
