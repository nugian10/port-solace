// audio.js — every Port Solace sound is synthesized with WebAudio; there are no audio files.
// Engine hum, a two-tone police siren, gunshots, UI blips and a lazy radio loop with a
// bassline. The context is created only after a user gesture (the start button), and the
// module stays completely inert in screenshot / self-test mode.

class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    this._buildEngine();
    this._buildSiren();
    this._startMusic();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  _buildEngine() {
    const ctx = this.ctx;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const sub = ctx.createOscillator();
    sub.type = 'square';
    sub.frequency.value = 28;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    sub.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    sub.start();
    this._engineSub = sub;
  }

  // speedRatio 0..1, throttle 0..1 — called every frame while driving
  engine(speedRatio, throttle, running) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const target = running ? 0.05 + throttle * 0.05 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.09);
    const rpm = 55 + speedRatio * 165 + throttle * 25;
    this.engineOsc.frequency.setTargetAtTime(rpm, t, 0.06);
    this._engineSub.frequency.setTargetAtTime(rpm / 2, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(280 + speedRatio * 900, t, 0.1);
  }

  _buildSiren() {
    const ctx = this.ctx;
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    this.sirenLfo = ctx.createOscillator();
    this.sirenLfo.type = 'square';
    this.sirenLfo.frequency.value = 0.65;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 160;
    this.sirenLfo.connect(lfoGain);
    lfoGain.connect(this.sirenOsc.frequency);
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.sirenLfo.start();
  }

  // level 0..1 by nearest police distance; main loop feeds it
  siren(level) {
    if (!this.ctx) return;
    this.sirenGain.gain.setTargetAtTime(level * 0.045, this.ctx.currentTime, 0.2);
  }

  _noiseBuffer() {
    if (this._noise) return this._noise;
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this._noise = buf;
    return buf;
  }

  gunshot(distant = false) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = distant ? 900 : 3400;
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(distant ? 0.12 : 0.32, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start(t); src.stop(t + 0.2);
  }

  thud() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 220;
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start(t); src.stop(t + 0.25);
  }

  blip(freq = 880, when = 0, dur = 0.09, vol = 0.12) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    const t = ctx.currentTime + when;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain); gain.connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  cash() { this.blip(990, 0, 0.08, 0.14); this.blip(1320, 0.07, 0.12, 0.14); }
  uiMove() { this.blip(520, 0, 0.05, 0.06); }
  uiPick() { this.blip(740, 0, 0.07, 0.1); }
  jobDone() { this.blip(660, 0, 0.1, 0.12); this.blip(880, 0.1, 0.1, 0.12); this.blip(1100, 0.2, 0.16, 0.12); }
  alarm() { this.blip(220, 0, 0.2, 0.16); this.blip(185, 0.18, 0.3, 0.16); }

  // A lazy coastal radio loop: I–vi–IV–V in A, bass on the beat, soft plucked chords.
  _startMusic() {
    const bassLine = [110, 0, 110, 0, 82.4, 0, 82.4, 0, 98, 0, 98, 0, 123.5, 0, 123.5, 0,
                      110, 0, 110, 0, 82.4, 0, 82.4, 0, 146.8, 0, 164.8, 0, 196, 0, 164.8, 0];
    const chords = [[220, 261.6, 329.6], [164.8, 196, 246.9], [196, 246.9, 293.7], [164.8, 207.7, 261.6]];
    this.musicTimer = window.setInterval(() => {
      if (!this.ctx || this.muted) return;
      const step = this.musicStep++;
      const bass = bassLine[step % bassLine.length];
      if (bass) this._tone(bass, 0.16, 0.05, 'triangle');
      if (step % 16 === 0) {
        const chord = chords[(step / 16) % chords.length | 0];
        for (const f of chord) this._tone(f, 1.6, 0.016, 'sine');
      }
      if (step % 8 === 4) this._tone(1568, 0.05, 0.012, 'sine');
    }, 214);
  }

  _tone(freq, dur, vol, type) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain); gain.connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.02);
  }
}

export const sound = new SoundBank();
