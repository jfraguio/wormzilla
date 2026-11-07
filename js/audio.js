/* ═══════════════════════════════════════════════════════════
   WORMZILLA · motor de audio procedural
   Música electrónica generativa + SFX sintetizados (WebAudio)
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const BPM = 118;
  const STEP_DUR = 60 / BPM / 4;
  const CHORDS = [
    { root: 45, pad: [57, 60, 64, 67], arp: [69, 72, 76, 79] }, // Am7
    { root: 41, pad: [53, 57, 60, 64], arp: [65, 69, 72, 76] }, // Fmaj7
    { root: 48, pad: [55, 60, 64, 67], arp: [67, 72, 76, 79] }, // Cmaj7/G
    { root: 43, pad: [55, 59, 62, 67], arp: [67, 71, 74, 79] }  // G6
  ];
  const ARP_PATTERN = [0, 1, 2, 3, 2, 1, 3, 2, 0, 2, 1, 3, 2, 3, 1, 0];
  const EAT_SCALE = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24, 27, 29, 31, 34, 36];
  const TAU = Math.PI * 2;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const midiFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.ready = false;
      this.muted = false;
      this.intensity = 0.45;
      this.musicOn = false;
      this.step = 0;
      this.nextStep = 0;
      this._timer = null;
      this._boostNodes = null;
      this._boostOn = false;
      this._lastEat = 0;
      this._eatCombo = 0;
      this._pluckPan = 0;
    }

    /* ── Inicialización perezosa (requiere gesto del usuario) ── */
    init() {
      if (this.ctx) {
        this.resume();
        return;
      }
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return;
      let ctx;
      try { ctx = new AC(); } catch (err) { return; }
      this.ctx = ctx;

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -17;
      compressor.knee.value = 20;
      compressor.ratio.value = 3.5;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.24;

      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.82;
      master.connect(compressor);
      compressor.connect(ctx.destination);
      this.master = master;

      const music = ctx.createGain();
      music.gain.value = 0.5;
      music.connect(master);
      this.music = music;

      const sfx = ctx.createGain();
      sfx.gain.value = 0.9;
      sfx.connect(master);
      this.sfx = sfx;

      /* Reverb generativo */
      const convolver = ctx.createConvolver();
      convolver.buffer = this._makeIR(2.6, 2.4);
      const revGain = ctx.createGain();
      revGain.gain.value = 0.6;
      convolver.connect(revGain);
      revGain.connect(master);
      this.reverb = convolver;
      const revSend = ctx.createGain();
      revSend.gain.value = 0.55;
      revSend.connect(convolver);
      this.revSend = revSend;

      /* Delay rítmico */
      const delay = ctx.createDelay(1.2);
      delay.delayTime.value = STEP_DUR * 3;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.31;
      const delayFilter = ctx.createBiquadFilter();
      delayFilter.type = 'lowpass';
      delayFilter.frequency.value = 2800;
      const delayWet = ctx.createGain();
      delayWet.gain.value = 0.34;
      delay.connect(delayFilter);
      delayFilter.connect(feedback);
      feedback.connect(delay);
      delayFilter.connect(delayWet);
      delayWet.connect(master);
      const delaySend = ctx.createGain();
      delaySend.gain.value = 0.5;
      delaySend.connect(delay);
      this.delaySend = delaySend;

      this.noise = this._makeNoise(2.2);

      this.nextStep = ctx.currentTime + 0.12;
      this.step = 0;
      this.musicOn = true;
      this.ready = true;
      this._timer = global.setInterval(() => this._schedule(), 25);
      this.resume();
      this._startBoostLoop();
    }

    resume() {
      if (!this.ctx) return;
      if (this.ctx.state !== 'running') {
        this.ctx.resume().catch(() => {});
      }
    }

    _makeIR(seconds, decay) {
      const rate = this.ctx.sampleRate;
      const len = Math.floor(rate * seconds);
      const buffer = this.ctx.createBuffer(2, len, rate);
      for (let ch = 0; ch < 2; ch++) {
        const data = buffer.getChannelData(ch);
        for (let i = 0; i < len; i++) {
          const t = i / len;
          const env = Math.pow(1 - t, decay);
          data[i] = (Math.random() * 2 - 1) * env * (i < rate * 0.01 ? i / (rate * 0.01) : 1);
        }
      }
      return buffer;
    }

    _makeNoise(seconds) {
      const rate = this.ctx.sampleRate;
      const len = Math.floor(rate * seconds);
      const buffer = this.ctx.createBuffer(1, len, rate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      return buffer;
    }

    _noiseSource() {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      return src;
    }

    _pan(value) {
      if (this.ctx.createStereoPanner) {
        const p = this.ctx.createStereoPanner();
        p.pan.value = clamp(value, -1, 1);
        return p;
      }
      return this.ctx.createGain();
    }

    _send(node, amount, dest) {
      if (!node || !dest || amount <= 0) return;
      const g = this.ctx.createGain();
      g.gain.value = amount;
      node.connect(g);
      g.connect(dest);
    }

    setMuted(muted) {
      this.muted = !!muted;
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.82, t, 0.04);
      if (this.muted) this.stopBoost();
    }

    setDucked(ducked) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.music.gain.cancelScheduledValues(t);
      this.music.gain.setTargetAtTime(ducked ? 0.19 : 0.5, t, 0.22);
    }

    setIntensity(v) {
      this.intensity = clamp(v, 0.2, 1);
    }

    /* ── Secuenciador ── */
    _schedule() {
      if (!this.ctx || !this.musicOn) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;
      if (this.nextStep < now - 0.3) this.nextStep = now + 0.04;
      while (this.nextStep < now + 0.14) {
        this._playStep(this.step, this.nextStep);
        this.nextStep += STEP_DUR;
        this.step++;
      }
    }

    _playStep(step, t) {
      const bar = Math.floor(step / 16) % 4;
      const s = step % 16;
      const chord = CHORDS[bar];
      const energy = this.intensity;

      if (s % 4 === 0) this._kick(t, 0.95);
      if (s === 14 && bar % 2 === 1) this._kick(t, 0.4);

      if (s === 4 || s === 12) this._clap(t, 0.75);
      if (s % 2 === 0) this._hat(t, s % 4 === 2 ? 0.62 : 0.38, false);
      if (s === 6 || s === 14) this._hat(t, 0.5, true);
      if (s % 2 === 1 && energy > 0.58) this._shaker(t, 0.22);

      const bassPattern = { 0: 0.95, 3: 0.7, 6: 0.7, 10: 0.85, 12: 0.55, 14: 0.62 };
      if (bassPattern[s] !== undefined && energy > 0.25) {
        this._bass(t, chord.root + (s === 6 ? 12 : 0), bassPattern[s] * (0.6 + energy * 0.35));
      }

      if (s === 0) this._pad(t, chord.pad, STEP_DUR * 16 * 1.05);

      const playArp = energy > 0.62 ? true : s % 4 === 0;
      if (playArp && energy > 0.3) {
        const idx = ARP_PATTERN[s];
        const oct = s === 8 || s === 12 ? 12 : 0;
        this._pluck(t, chord.arp[idx] + oct, 0.42 + (s % 4 === 0 ? 0.2 : 0));
      }

      if (step % 64 === 0) this._sparkle(t, chord.arp[3] + 12, 0.32);
    }

    /* ── Voces musicales ── */
    _kick(t, v) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(154, t);
      o.frequency.exponentialRampToValueAtTime(46, t + 0.115);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.8 * v, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.29);
      o.connect(g); g.connect(this.music);
      o.start(t); o.stop(t + 0.31);
    }

    _clap(t, v) {
      const ctx = this.ctx;
      const src = this._noiseSource();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 1450; bp.Q.value = 0.85;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.24 * v, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.025, t + 0.028);
      g.gain.exponentialRampToValueAtTime(0.18 * v, t + 0.043);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
      src.connect(bp); bp.connect(g); g.connect(this.music);
      this._send(g, 0.22, this.revSend);
      src.start(t); src.stop(t + 0.2);
    }

    _hat(t, v, open) {
      const ctx = this.ctx;
      const src = this._noiseSource();
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 7600;
      const g = ctx.createGain();
      const dur = open ? 0.16 : 0.045;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.055 * v, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(hp); hp.connect(g); g.connect(this.music);
      src.start(t); src.stop(t + dur + 0.02);
    }

    _shaker(t, v) {
      const ctx = this.ctx;
      const src = this._noiseSource();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 6200; bp.Q.value = 1.4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.022 * v, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
      const p = this._pan((Math.random() * 2 - 1) * 0.5);
      src.connect(bp); bp.connect(g); g.connect(p); p.connect(this.music);
      src.start(t); src.stop(t + 0.07);
    }

    _bass(t, midi, v) {
      const ctx = this.ctx;
      const f = midiFreq(midi);
      const o = ctx.createOscillator();
      const sub = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = f;
      sub.type = 'sine'; sub.frequency.value = f / 2;
      filter.type = 'lowpass';
      filter.Q.value = 5.5;
      filter.frequency.setValueAtTime(720 + this.intensity * 500, t);
      filter.frequency.exponentialRampToValueAtTime(150, t + 0.17);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16 * v, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.27);
      const subGain = ctx.createGain();
      subGain.gain.value = 0.1;
      o.connect(filter); sub.connect(subGain); subGain.connect(filter);
      filter.connect(g); g.connect(this.music);
      o.start(t); o.stop(t + 0.29);
      sub.start(t); sub.stop(t + 0.29);
    }

    _pad(t, notes, dur) {
      const ctx = this.ctx;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 0.8;
      filter.frequency.setValueAtTime(420 + this.intensity * 900, t);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(0.55, t + 0.38);
      env.gain.setValueAtTime(0.55, t + dur);
      env.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.25);
      filter.connect(env);
      env.connect(this.music);
      this._send(env, 0.5, this.revSend);

      for (let i = 0; i < notes.length; i++) {
        const f = midiFreq(notes[i]);
        const pan = this._pan((i / (notes.length - 1)) * 1.1 - 0.55);
        pan.connect(filter);
        const og = ctx.createGain();
        og.gain.value = 0.026;
        og.connect(pan);
        for (const [type, detune] of [['sawtooth', -6], ['triangle', 5]]) {
          const o = ctx.createOscillator();
          o.type = type;
          o.frequency.value = f;
          o.detune.value = detune;
          o.connect(og);
          o.start(t);
          o.stop(t + dur + 1.3);
        }
      }
    }

    _pluck(t, midi, v) {
      const ctx = this.ctx;
      const f = midiFreq(midi);
      const o = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      o2.type = 'sine'; o2.frequency.value = f * 2; o2.detune.value = 4;
      filter.type = 'lowpass'; filter.frequency.value = 2900;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.075 * v, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
      const g2 = ctx.createGain(); g2.gain.value = 0.18;
      o.connect(filter); o2.connect(g2); g2.connect(filter);
      filter.connect(g);
      this._pluckPan = -this._pluckPan;
      const p = this._pan(this._pluckPan * 0.35);
      g.connect(p); p.connect(this.music);
      this._send(g, 0.16, this.revSend);
      this._send(g, 0.32, this.delaySend);
      o.start(t); o.stop(t + 0.38);
      o2.start(t); o2.stop(t + 0.38);
    }

    _sparkle(t, midi, v) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = midiFreq(midi);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.035 * v, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      o.connect(g); g.connect(this.music);
      this._send(g, 0.7, this.revSend);
      o.start(t); o.stop(t + 1.2);
    }

    /* ── SFX de juego ── */
    eat(combo, pan) {
      if (!this.ready) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const t = now + 0.002;
      const idx = Math.min(EAT_SCALE.length - 1, Math.max(0, combo));
      const note = 72 + EAT_SCALE[idx % EAT_SCALE.length] + Math.floor(idx / EAT_SCALE.length) * 12;
      const f = midiFreq(note);
      const p = this._pan(pan || 0);

      const o = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 1.04, t + 0.07);
      o2.type = 'triangle';
      o2.frequency.value = f * 2.005;
      const g2 = ctx.createGain();
      g2.gain.value = 0.12;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.105, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.115);
      o.connect(g); o2.connect(g2); g2.connect(g);
      g.connect(p); p.connect(this.sfx);
      this._send(g, 0.13, this.revSend);
      o.start(t); o.stop(t + 0.13);
      o2.start(t); o2.stop(t + 0.13);
    }

    bigEat(pan) {
      if (!this.ready) return;
      const ctx = this.ctx;
      const t = ctx.currentTime + 0.002;
      const p = this._pan(pan || 0);
      [0, 7, 12, 19].forEach((semi, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const st = t + i * 0.045;
        o.type = i % 2 ? 'triangle' : 'sine';
        o.frequency.value = midiFreq(77 + semi + 12);
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(0.08, st + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, st + 0.34);
        o.connect(g); g.connect(p); p.connect(this.sfx);
        this._send(g, 0.3, this.revSend);
        o.start(st); o.stop(st + 0.36);
      });
    }

    coin() {
      if (!this.ready) return;
      const ctx = this.ctx;
      const t = ctx.currentTime + 0.002;
      [0, 7].forEach((semi, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const st = t + i * 0.07;
        o.type = 'triangle';
        o.frequency.value = midiFreq(84 + semi);
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(0.06, st + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, st + 0.2);
        o.connect(g); g.connect(this.sfx);
        this._send(g, 0.35, this.revSend);
        o.start(st); o.stop(st + 0.22);
      });
    }

    purchase() {
      if (!this.ready) return;
      const ctx = this.ctx;
      const t = ctx.currentTime + 0.01;
      [0, 4, 7, 12, 16].forEach((semi, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const st = t + i * 0.065;
        o.type = 'triangle';
        o.frequency.value = midiFreq(72 + semi);
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(0.075, st + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, st + 0.42);
        o.connect(g); g.connect(this.sfx);
        this._send(g, 0.5, this.revSend);
        this._send(g, 0.3, this.delaySend);
        o.start(st); o.stop(st + 0.44);
      });
    }

    click() {
      if (!this.ready) return;
      const ctx = this.ctx;
      const t = ctx.currentTime + 0.001;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(1180, t);
      o.frequency.exponentialRampToValueAtTime(760, t + 0.035);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.04, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
      o.connect(g); g.connect(this.sfx);
      o.start(t); o.stop(t + 0.07);
    }

    kill(pan) {
      if (!this.ready) return;
      const ctx = this.ctx;
      const t = ctx.currentTime + 0.002;
      const p = this._pan(pan || 0);

      const src = this._noiseSource();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.setValueAtTime(1600, t);
      bp.frequency.exponentialRampToValueAtTime(280, t + 0.22);
      bp.Q.value = 0.8;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.exponentialRampToValueAtTime(0.16, t + 0.006);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      src.connect(bp); bp.connect(ng); ng.connect(p);
      src.start(t); src.stop(t + 0.32);

      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.4);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g); g.connect(p);
      o.start(t); o.stop(t + 0.52);

      const ping = ctx.createOscillator();
      const pg = ctx.createGain();
      ping.type = 'triangle';
      ping.frequency.setValueAtTime(1850, t);
      ping.frequency.exponentialRampToValueAtTime(980, t + 0.14);
      pg.gain.setValueAtTime(0.0001, t);
      pg.gain.exponentialRampToValueAtTime(0.05, t + 0.004);
      pg.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      ping.connect(pg); pg.connect(p);
      ping.start(t); ping.stop(t + 0.2);

      p.connect(this.sfx);
      this._send(p, 0.4, this.revSend);
    }

    death() {
      if (!this.ready) return;
      const ctx = this.ctx;
      const t = ctx.currentTime + 0.01;

      const o = ctx.createOscillator();
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(240, t);
      o.frequency.exponentialRampToValueAtTime(34, t + 1.25);
      f.type = 'lowpass';
      f.frequency.setValueAtTime(2400, t);
      f.frequency.exponentialRampToValueAtTime(140, t + 1.2);
      f.Q.value = 4;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      o.connect(f); f.connect(g); g.connect(this.sfx);
      this._send(g, 0.7, this.revSend);
      o.start(t); o.stop(t + 1.42);

      const src = this._noiseSource();
      const bp = ctx.createBiquadFilter();
      bp.type = 'lowpass';
      bp.frequency.setValueAtTime(3000, t);
      bp.frequency.exponentialRampToValueAtTime(180, t + 1.1);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      src.connect(bp); bp.connect(ng); ng.connect(this.sfx);
      this._send(ng, 0.5, this.revSend);
      src.start(t); src.stop(t + 1.35);
    }

    start() {
      if (!this.ready) return;
      const ctx = this.ctx;
      const t = ctx.currentTime + 0.01;
      const src = this._noiseSource();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(300, t);
      bp.frequency.exponentialRampToValueAtTime(4200, t + 0.55);
      bp.Q.value = 1.1;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.08, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
      src.connect(bp); bp.connect(g); g.connect(this.sfx);
      this._send(g, 0.4, this.revSend);
      src.start(t); src.stop(t + 0.7);

      [0, 7, 12].forEach((semi, i) => {
        const o = ctx.createOscillator();
        const og = ctx.createGain();
        const st = t + 0.1 + i * 0.06;
        o.type = 'triangle';
        o.frequency.value = midiFreq(69 + semi);
        og.gain.setValueAtTime(0.0001, st);
        og.gain.exponentialRampToValueAtTime(0.05, st + 0.01);
        og.gain.exponentialRampToValueAtTime(0.0001, st + 0.6);
        o.connect(og); og.connect(this.sfx);
        this._send(og, 0.6, this.revSend);
        o.start(st); o.stop(st + 0.62);
      });
    }

    powerNova() {
      if (!this.ready) return;
      const ctx = this.ctx;
      const t = ctx.currentTime + 0.005;

      const boom = ctx.createOscillator();
      const bg = ctx.createGain();
      boom.type = 'sine';
      boom.frequency.setValueAtTime(130, t);
      boom.frequency.exponentialRampToValueAtTime(32, t + 0.7);
      bg.gain.setValueAtTime(0.0001, t);
      bg.gain.exponentialRampToValueAtTime(0.3, t + 0.012);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      boom.connect(bg); bg.connect(this.sfx);
      this._send(bg, 0.6, this.revSend);
      boom.start(t); boom.stop(t + 0.95);

      const src = this._noiseSource();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(260, t);
      bp.frequency.exponentialRampToValueAtTime(5200, t + 0.45);
      bp.Q.value = 0.8;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      src.connect(bp); bp.connect(ng); ng.connect(this.sfx);
      this._send(ng, 0.65, this.revSend);
      src.start(t); src.stop(t + 0.75);

      [0, 7, 12, 19, 24].forEach((semi, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const st = t + 0.02 + i * 0.035;
        o.type = 'triangle';
        o.frequency.value = midiFreq(72 + semi);
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(0.05, st + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, st + 0.45);
        o.connect(g); g.connect(this.sfx);
        this._send(g, 0.55, this.revSend);
        this._send(g, 0.25, this.delaySend);
        o.start(st); o.stop(st + 0.47);
      });
    }

    powerActivate(id) {
      if (!this.ready) return;
      const ctx = this.ctx;
      const t = ctx.currentTime + 0.005;
      if (id === 'titan') {
        const o = ctx.createOscillator();
        const f = ctx.createBiquadFilter();
        const g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(70, t);
        o.frequency.exponentialRampToValueAtTime(36, t + 0.5);
        f.type = 'lowpass'; f.frequency.value = 420;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.14, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
        o.connect(f); f.connect(g); g.connect(this.sfx);
        this._send(g, 0.3, this.revSend);
        o.start(t); o.stop(t + 0.6);
        return;
      }
      const notes = id === 'micro' ? [84, 88, 91, 96] : [69, 72, 76, 81];
      notes.forEach((midi, i) => {
        const st = t + i * 0.045;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = id === 'phantom' ? 'sine' : 'triangle';
        o.frequency.value = midiFreq(midi);
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(id === 'phantom' ? 0.035 : 0.06, st + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, st + 0.6);
        o.connect(g); g.connect(this.sfx);
        this._send(g, 0.7, this.revSend);
        if (id === 'micro') this._send(g, 0.25, this.delaySend);
        o.start(st); o.stop(st + 0.62);
      });
    }

    powerEnd() {
      if (!this.ready) return;
      const ctx = this.ctx;
      const t = ctx.currentTime + 0.005;
      [76, 72].forEach((midi, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const st = t + i * 0.06;
        o.type = 'sine';
        o.frequency.value = midiFreq(midi);
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(0.028, st + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, st + 0.28);
        o.connect(g); g.connect(this.sfx);
        this._send(g, 0.4, this.revSend);
        o.start(st); o.stop(st + 0.3);
      });
    }

    powerReady() {
      if (!this.ready) return;
      const ctx = this.ctx;
      const t = ctx.currentTime + 0.005;
      [0, 7].forEach((semi, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const st = t + i * 0.07;
        o.type = 'triangle';
        o.frequency.value = midiFreq(88 + semi);
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(0.03, st + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, st + 0.25);
        o.connect(g); g.connect(this.sfx);
        this._send(g, 0.5, this.revSend);
        o.start(st); o.stop(st + 0.27);
      });
    }

    warn() {
      if (!this.ready) return;
      const ctx = this.ctx;
      const t = ctx.currentTime + 0.001;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(760, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.022, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g); g.connect(this.sfx);
      o.start(t); o.stop(t + 0.14);
    }

    pickup(pan) {
      if (!this.ready) return;
      const ctx = this.ctx;
      const t = ctx.currentTime + 0.003;
      const p = this._pan(pan || 0);
      [72, 76, 79, 84].forEach((midi, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const st = t + i * 0.045;
        o.type = 'triangle';
        o.frequency.value = midiFreq(midi);
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(0.055, st + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, st + 0.3);
        o.connect(g); g.connect(p); p.connect(this.sfx);
        this._send(g, 0.4, this.revSend);
        o.start(st); o.stop(st + 0.32);
      });
    }

    zap(pan) {
      if (!this.ready) return;
      const ctx = this.ctx;
      const t = ctx.currentTime + 0.002;
      const p = this._pan(pan || 0);
      const src = this._noiseSource();
      const bp = ctx.createBiquadFilter();
      bp.type = 'highpass';
      bp.frequency.setValueAtTime(1400, t);
      bp.frequency.exponentialRampToValueAtTime(3800, t + 0.16);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.exponentialRampToValueAtTime(0.09, t + 0.006);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      src.connect(bp); bp.connect(ng); ng.connect(p);
      src.start(t); src.stop(t + 0.22);

      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(1200, t);
      o.frequency.exponentialRampToValueAtTime(180, t + 0.18);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.035, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g); g.connect(p);
      o.start(t); o.stop(t + 0.22);
      p.connect(this.sfx);
      this._send(p, 0.3, this.revSend);
    }

    monsterWarning() {
      if (!this.ready) return;
      const ctx = this.ctx;
      const t = ctx.currentTime + 0.01;
      for (let i = 0; i < 2; i++) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const st = t + i * 0.34;
        o.type = 'sine';
        o.frequency.setValueAtTime(84, st);
        o.frequency.exponentialRampToValueAtTime(56, st + 0.3);
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(0.13, st + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, st + 0.32);
        o.connect(g); g.connect(this.sfx);
        this._send(g, 0.5, this.revSend);
        o.start(st); o.stop(st + 0.34);
      }
    }

    monsterRoar() {
      if (!this.ready) return;
      const ctx = this.ctx;
      const t = ctx.currentTime + 0.01;
      const o = ctx.createOscillator();
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(68, t);
      o.frequency.exponentialRampToValueAtTime(34, t + 1.1);
      f.type = 'lowpass';
      f.frequency.setValueAtTime(680, t);
      f.frequency.exponentialRampToValueAtTime(160, t + 1);
      f.Q.value = 5;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      o.connect(f); f.connect(g); g.connect(this.sfx);
      this._send(g, 0.6, this.revSend);
      o.start(t); o.stop(t + 1.25);

      const src = this._noiseSource();
      const bp = ctx.createBiquadFilter();
      bp.type = 'lowpass';
      bp.frequency.setValueAtTime(900, t);
      bp.frequency.exponentialRampToValueAtTime(150, t + 1);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.exponentialRampToValueAtTime(0.12, t + 0.03);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      src.connect(bp); bp.connect(ng); ng.connect(this.sfx);
      this._send(ng, 0.45, this.revSend);
      src.start(t); src.stop(t + 1.15);
    }

    monsterEscape() {
      if (!this.ready) return;
      const ctx = this.ctx;
      const t = ctx.currentTime + 0.01;
      [60, 64, 67, 72, 76].forEach((midi, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const st = t + i * 0.075;
        o.type = 'triangle';
        o.frequency.value = midiFreq(midi);
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(0.06, st + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, st + 0.5);
        o.connect(g); g.connect(this.sfx);
        this._send(g, 0.5, this.revSend);
        this._send(g, 0.2, this.delaySend);
        o.start(st); o.stop(st + 0.52);
      });
    }

    /* ── Bucle de turbo ── */
    _startBoostLoop() {
      if (!this.ctx || this._boostNodes) return;
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 460;
      bp.Q.value = 0.7;
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      src.connect(bp); bp.connect(g); g.connect(this.sfx);
      src.start();
      this._boostNodes = { src, bp, g };
    }

    setBoost(on) {
      if (!this.ready) return;
      on = !!on && !this.muted;
      if (this._boostOn === on) return;
      this._boostOn = on;
      if (!this._boostNodes) this._startBoostLoop();
      if (!this._boostNodes) return;
      const now = this.ctx.currentTime;
      const g = this._boostNodes.g.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(Math.max(0.0001, g.value), now);
      g.exponentialRampToValueAtTime(on ? 0.055 : 0.0001, now + (on ? 0.14 : 0.11));
      this._boostNodes.bp.frequency.cancelScheduledValues(now);
      this._boostNodes.bp.frequency.setTargetAtTime(on ? 720 : 420, now, 0.1);
    }

    stopBoost() {
      this.setBoost(false);
    }
  }

  global.WZ = global.WZ || {};
  global.WZ.AudioEngine = AudioEngine;
})(window);
