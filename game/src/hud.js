// hud.js — Port Solace's interface: the in-play HUD (health, cash, wanted stars,
// objective, speed), the canvas minimap, dialogue and toast feeds, damage vignette,
// and the menu overlays (start screen, pause, WASTED / BUSTED). All DOM lives here;
// index.html only carries the styling.

import { WORLD } from './config.js';

export class Hud {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div id="vignette"></div>
      <div id="hud" class="hidden">
        <div id="hud-topleft">
          <div id="healthbar"><div id="healthfill"></div></div>
          <div id="cash">$0</div>
          <div id="joblabel"></div>
        </div>
        <div id="hud-topright">
          <div id="stars"></div>
          <div id="heatbar"><div id="heatfill"></div></div>
        </div>
        <div id="banner" class="hidden"></div>
        <div id="minimap-wrap">
          <canvas id="minimap" width="190" height="190"></canvas>
          <div id="maplabel">Port Solace</div>
        </div>
        <div id="objective" class="hidden"></div>
        <div id="dialogue" class="hidden"><div id="dialogue-text"></div></div>
        <div id="toast" class="hidden"></div>
        <div id="speedo" class="hidden"><span id="speedval">0</span><small>km/h</small></div>
        <div id="crosshair" class="hidden">+</div>
        <div id="hint"></div>
      </div>
      <div id="startscreen" class="overlay hidden">
        <div class="panel">
          <h1>PORT SOLACE</h1>
          <p class="tagline">a small-time driver story</p>
          <p class="blurb">Marlo Venn owes money in a city that never rains. Run jobs for the
          Mercado fixer Tomas Rey — packages, borrowed cars, warm suitcases — and drive
          Port Solace like you own it. Steal cars, dodge the Solace PD, and finish the
          sunset run.</p>
          <div class="controls">
            <span><b>W A S D</b> move / drive</span><span><b>Mouse</b> camera</span>
            <span><b>Click</b> shoot</span><span><b>E</b> enter / exit car</span>
            <span><b>Shift</b> sprint</span><span><b>Space</b> brake</span>
            <span><b>J</b> next job</span><span><b>T</b> taxi fare</span>
            <span><b>P</b> pause</span><span><b>M</b> mute</span>
          </div>
          <div class="buttons">
            <button id="btn-new">NEW GAME</button>
            <button id="btn-continue" class="hidden">CONTINUE</button>
          </div>
          <p class="foot">An original open-world crime game. Every car, name and street is invented.</p>
        </div>
      </div>
      <div id="pausescreen" class="overlay hidden">
        <div class="panel small">
          <h2>PAUSED</h2>
          <div class="buttons">
            <button id="btn-resume">RESUME</button>
            <button id="btn-save">SAVE GAME</button>
            <button id="btn-mute">SOUND ON/OFF</button>
            <button id="btn-wipe">DELETE SAVE</button>
          </div>
        </div>
      </div>
      <div id="endscreen" class="overlay hidden"><div id="endtext">WASTED</div><div id="endsub"></div></div>
    `;
    this.el = {};
    for (const id of ['hud', 'healthfill', 'cash', 'joblabel', 'stars', 'heatfill', 'banner',
      'minimap', 'maplabel', 'objective', 'dialogue', 'dialogue-text', 'toast', 'speedo',
      'speedval', 'crosshair', 'hint', 'startscreen', 'pausescreen', 'endscreen', 'endtext',
      'endsub', 'vignette', 'btn-new', 'btn-continue', 'btn-resume', 'btn-save', 'btn-mute', 'btn-wipe']) {
      this.el[id] = root.querySelector('#' + CSS.escape(id));
    }
    this.mapCtx = this.el.minimap.getContext('2d');
    this.dialogueQueue = [];
    this.dialogueTimer = 0;
    this.bannerTimer = 0;
    this.toastTimer = 0;
    this.lastObjective = '';
  }

  showStart(hasSave, onNew, onContinue) {
    this.el.startscreen.classList.remove('hidden');
    this.el['btn-continue'].classList.toggle('hidden', !hasSave);
    this.el['btn-new'].onclick = () => { this.el.startscreen.classList.add('hidden'); onNew(); };
    this.el['btn-continue'].onclick = () => { this.el.startscreen.classList.add('hidden'); onContinue(); };
  }

  showPause(handlers) {
    this.el.pausescreen.classList.remove('hidden');
    this.el['btn-resume'].onclick = () => handlers.resume();
    this.el['btn-save'].onclick = () => handlers.save();
    this.el['btn-mute'].onclick = () => handlers.mute();
    this.el['btn-wipe'].onclick = () => handlers.wipe();
  }
  hidePause() { this.el.pausescreen.classList.add('hidden'); }

  showEnd(kind, sub) {
    this.el.endtext.textContent = kind;
    this.el.endtext.style.color = kind === 'WASTED' ? '#e23b2e' : '#3d7bd6';
    this.el.endsub.textContent = sub;
    this.el.endscreen.classList.remove('hidden');
  }
  hideEnd() { this.el.endscreen.classList.add('hidden'); }

  setPlaying(on) { this.el.hud.classList.toggle('hidden', !on); }

  banner(text) {
    this.el.banner.textContent = text;
    this.el.banner.classList.remove('hidden');
    this.bannerTimer = 2.8;
  }

  toast(text) {
    this.el.toast.textContent = text;
    this.el.toast.classList.remove('hidden');
    this.toastTimer = 3.4;
  }

  showDialogue(lines) {
    this.dialogueQueue.push(...lines);
    if (this.dialogueTimer <= 0) this._nextDialogue();
  }

  _nextDialogue() {
    const line = this.dialogueQueue.shift();
    if (line === undefined) {
      this.el.dialogue.classList.add('hidden');
      this.dialogueTimer = 0;
      return;
    }
    this.el['dialogue-text'].textContent = line;
    this.el.dialogue.classList.remove('hidden');
    this.dialogueTimer = 3.6;
  }

  hurtFlash() {
    this.el.vignette.style.opacity = '0.85';
    setTimeout(() => { this.el.vignette.style.opacity = '0'; }, 130);
  }

  // state: { player, cash, stars, heat, jobTitle, objective, speedKmh, driving, onFoot, hint }
  update(dt, state) {
    if (this.bannerTimer > 0) { this.bannerTimer -= dt; if (this.bannerTimer <= 0) this.el.banner.classList.add('hidden'); }
    if (this.toastTimer > 0) { this.toastTimer -= dt; if (this.toastTimer <= 0) this.el.toast.classList.add('hidden'); }
    if (this.dialogueTimer > 0) { this.dialogueTimer -= dt; if (this.dialogueTimer <= 0) this._nextDialogue(); }

    this.el.healthfill.style.width = `${Math.max(0, state.player.health)}%`;
    this.el.healthfill.style.background = state.player.health > 30 ? '#7ee787' : '#e23b2e';
    this.el.cash.textContent = `$${Math.round(state.cash)}`;
    this.el.joblabel.textContent = state.jobTitle || '';
    const stars = state.stars;
    this.el.stars.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
    this.el.stars.style.color = stars ? '#ffd76b' : 'rgba(255,255,255,0.25)';
    this.el.heatfill.style.width = `${Math.min(100, (state.heat / 5) * 100)}%`;

    const obj = state.objective;
    if (obj && obj.text !== this.lastObjective) {
      this.lastObjective = obj.text;
      this.el.objective.textContent = obj.text;
      this.el.objective.classList.remove('hidden');
    }
    this.el.speedo.classList.toggle('hidden', !state.driving);
    if (state.driving) this.el.speedval.textContent = String(Math.round(state.speedKmh));
    this.el.crosshair.classList.toggle('hidden', !state.onFoot);
    this.el.hint.textContent = state.hint || '';
    this._drawMinimap(state);
  }

  _drawMinimap(state) {
    const g = this.mapCtx;
    const S = 190;
    const x0 = -200, x1 = 200, z0 = -185, z1 = 275;
    const mx = (x) => ((x - x0) / (x1 - x0)) * S;
    const mz = (z) => ((z - z0) / (z1 - z0)) * S;
    g.fillStyle = '#2a7d9e'; g.fillRect(0, 0, S, S);                       // sea
    g.fillStyle = '#b8ab8d'; g.fillRect(0, 0, S, mz(WORLD.beachStart));    // land
    g.fillStyle = '#e8cf9e'; g.fillRect(0, mz(WORLD.beachStart), S, mz(WORLD.waterStart) - mz(WORLD.beachStart)); // sand
    g.fillStyle = '#8f8a7c';
    for (let ix = 0; ix < 6; ix++) for (let iz = 0; iz < 6; iz++) {
      const cx = (WORLD.roadLines[ix] + WORLD.roadLines[ix + 1]) / 2;
      const cz = (WORLD.roadLines[iz] + WORLD.roadLines[iz + 1]) / 2;
      g.fillRect(mx(cx - 20), mz(cz - 20), 40 * (S / (x1 - x0)), 40 * (S / (z1 - z0)));
    }
    g.strokeStyle = '#3d4147'; g.lineWidth = 3;
    for (const p of WORLD.roadLines) {
      g.beginPath(); g.moveTo(mx(p), 0); g.lineTo(mx(p), mz(184)); g.stroke();
      g.beginPath(); g.moveTo(0, mz(p)); g.lineTo(S, mz(p)); g.stroke();
    }
    g.fillStyle = '#9a7648';
    g.fillRect(mx(114), mz(206), (142 - 114) * (S / (x1 - x0)), (264 - 206) * (S / (z1 - z0)));

    const dot = (x, z, colour, r = 2.4) => { g.fillStyle = colour; g.beginPath(); g.arc(mx(x), mz(z), r, 0, 6.3); g.fill(); };
    for (const car of state.trafficCars) if (car.driver === 'traffic') dot(car.x, car.z, 'rgba(255,255,255,0.55)', 1.6);
    for (const o of state.officers) dot(o.x, o.z, (performance.now() % 500 < 250) ? '#ff5040' : '#4d8dff', 2.6);

    const obj = state.objective;
    if (obj && obj.marker) {
      const pulse = 4 + Math.sin(performance.now() * 0.006) * 1.6;
      g.strokeStyle = obj.colour || '#ffd76b'; g.lineWidth = 2;
      g.beginPath(); g.arc(mx(obj.marker.x), mz(obj.marker.z), pulse, 0, 6.3); g.stroke();
      dot(obj.marker.x, obj.marker.z, obj.colour || '#ffd76b', 2.2);
    }
    // player arrow
    const p = state.player.pos;
    const heading = state.player.mode === 'drive' && state.player.car ? state.player.car.heading : state.player.heading;
    g.save();
    g.translate(mx(p.x), mz(p.z));
    g.rotate(Math.atan2(Math.sin(heading), -Math.cos(heading)));
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(0, -5.5); g.lineTo(3.6, 4.4); g.lineTo(-3.6, 4.4); g.closePath(); g.fill();
    g.restore();
  }
}
