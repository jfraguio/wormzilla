/* ═══════════════════════════════════════════════════════════
   WORMZILLA · núcleo del juego
   Arena orbital, serpientes IA, colisiones, cámara y render.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const TAU = Math.PI * 2;
  const WORLD_R = 2400;
  const SPACING = 7;
  const CELL = 92;
  const AI_COUNT = 24;
  const FOOD_TARGET = 2300;
  const BASE_MAX_PARTICLES = 900;
  const BLOOM_SCALE = 0.38;
  const START_MASS = 22;
  const MAX_AI_MASS = 900;
  const FOOD_CELL = 320;
  const PICKUP_MAX = 2;
  const SURVIVAL_STEP = 30;

  const FOOD_COLORS = [
    '#46f7ff', '#5dff8e', '#c8ff4a', '#ffe85c', '#ff9a3d',
    '#ff5fa2', '#c06bff', '#5f9dff', '#7dfff0', '#ff6b6b'
  ];

  const AI_NAMES = [
    'KRAKEN', 'VÍBORA', 'NEÓN', 'GLITCH', 'HYDRA', 'OROCHI', 'NOVA',
    'ZERO', 'PIXEL', 'SOMBRA', 'TITÁN', 'LÁSER', 'MANTA', 'ECLIPSE',
    'RIFT', 'BYTE', 'VENENO', 'COMETA', 'ONDA', 'ASTRO', 'MAMBA',
    'CÓBRA', 'DRAGÓN', 'MAGMA', 'PRISMA', 'SABLE', 'VOLT', 'ÓXIDO',
    'HALO', 'QUASAR', 'NÉBULA', 'SERPENT', 'CERO', 'AXIOM', 'FLUX'
  ];

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const dist2 = (x1, y1, x2, y2) => {
    const dx = x2 - x1, dy = y2 - y1;
    return dx * dx + dy * dy;
  };
  const mod = (n, m) => ((n % m) + m) % m;
  const angDiff = (a, b) => {
    let d = (b - a + Math.PI) % TAU;
    if (d < 0) d += TAU;
    return d - Math.PI;
  };
  const smoothstep = (t) => t * t * (3 - 2 * t);

  class Game {
    constructor(canvas, audio) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.audio = audio;
      this.bloomCanvas = document.createElement('canvas');
      this.bctx = this.bloomCanvas.getContext('2d');

      this.w = 1;
      this.h = 1;
      this.dpr = 1;
      this.time = 0;
      this.renderTime = 0;
      this.mode = 'menu';
      this.timeAccum = 0;
      this.lastTs = 0;

      this.snakes = [];
      this.player = null;
      this.food = [];
      this.regularFood = 0;
      this.particles = [];
      this.floats = [];
      this.respawns = [];
      this.goldOrb = null;
      this.goldTimer = 14;
      this.foodDeficit = 0;
      this.power = null;
      this.effect = null;
      this.powerCooldown = 0;
      this.powerTimer = 0;
      this.powerDuration = 0;
      this.powerStateId = null;
      this.powerReadyPinged = true;
      this.shockwaves = [];
      this.beams = [];

      /* Premios, monstruo y supervivencia. */
      this.pickupTimer = rand(10, 18);
      this.pickupCount = 0;
      this.monster = null;
      this.monsterEvent = {
        state: 'idle', timer: 0, total: 0, nextIn: rand(38, 52), tier: 0,
        warnX: 0, warnY: 0
      };
      this.survivalTier = 0;
      this.survivalTimer = SURVIVAL_STEP;
      this.buffSignature = '';

      /* Calidad adaptativa. */
      this.quality = 1;
      this.qualityCap = 1;
      this.qualityTimer = 0;
      this.slowStreak = 0;
      this.fastStreak = 0;
      this.frameSum = 0;
      this.frameCount = 0;
      this.maxParticles = BASE_MAX_PARTICLES;
      this.dprCap = 2;
      this.bloomEnabled = true;
      this._resizeQueued = false;
      this._headList = [];
      this._ribbonPts = [];
      this.foodGrid = new Map();
      this.foodGridTimer = 0;

      this.cam = { x: 0, y: 0, zoom: 0.8 };
      this.camTarget = { x: 0, y: 0, zoom: 0.8 };
      this.shake = 0;
      this.shakeX = 0;
      this.shakeY = 0;
      this.edgeWarning = 0;
      this.warnCooldown = 0;

      this.combo = 0;
      this.comboTimer = 0;
      this.comboMax = 0;
      this.runTime = 0;
      this.runStats = { massEaten: 0, kills: 0, killedBy: '', cause: '', survivalBonus: 0, escapes: 0, pickups: 0 };
      this.finalMass = 0;
      this.finalStats = null;
      this.deathTimer = 0;
      this.deathPos = { x: 0, y: 0 };
      this.ended = false;
      this.deathReason = '';

      this.pointer = {
        x: 0, y: 0, inside: false, down: false,
        touchActive: false, touchId: -1,
        touchBoostHeld: false, lastTapAt: 0, lastTapX: 0, lastTapY: 0,
        anchorX: 0, anchorY: 0, x2: 0, y2: 0, moved: false
      };
      this.keys = new Set();
      this.boostAudioOn = false;
      this.touchMode = false;
      this.lastTouchAt = 0;
      try {
        const coarse = !!(global.matchMedia && global.matchMedia('(pointer: coarse)').matches);
        const noHover = !!(global.matchMedia && global.matchMedia('(hover: none)').matches);
        const touchPoints = (global.navigator && global.navigator.maxTouchPoints) || 0;
        this.touchMode = coarse || (touchPoints > 0 && noHover);
      } catch (err) { /* noop */ }
      if (this.touchMode && document.body) document.body.classList.add('touch-mode');

      /* Calidad inicial según el equipo: evita arrancar ahogado en móviles. */
      let q = 1;
      try {
        const cores = global.navigator && global.navigator.hardwareConcurrency || 8;
        const mem = global.navigator && global.navigator.deviceMemory || 8;
        if (this.touchMode) q = 0.74;
        if (cores <= 4) q = Math.min(q, 0.8);
        if (cores <= 2) q = Math.min(q, 0.55);
        if (mem <= 3) q = Math.min(q, 0.6);
        if (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) q = Math.min(q, 0.5);
      } catch (err) { /* noop */ }
      this.quality = q;
      this.qualityCap = q;
      this._applyQuality(false);

      this.hash = new Map();
      this.sprites = new Map();
      this.stars = [];
      this.view = { x0: -99999, x1: 99999, y0: -99999, y1: 99999 };
      this.visibleFood = [];
      this.visibleSnakes = [];
      this.menuFocus = null;
      this.menuTimer = 0;
      this.audioTimer = 0;

      this.spawnedNames = new Set();

      this._resize = this._resize.bind(this);
      this._onResize = this._onResize.bind(this);
      this._loop = this._loop.bind(this);
      this._onPointerMove = this._onPointerMove.bind(this);
      this._onPointerDown = this._onPointerDown.bind(this);
      this._onPointerUp = this._onPointerUp.bind(this);
      this._onKeyDown = this._onKeyDown.bind(this);
      this._onKeyUp = this._onKeyUp.bind(this);

      this._resize();
      this._buildBackground();
      this._buildFloor();
      this._makeStars();
      this._bindInput();

      this._resetWorld(false);

      this.lastTs = performance.now();
      global.requestAnimationFrame(this._loop);
    }

    /* ═══════════════════════ CICLO ═══════════════════════ */
    _loop(ts) {
      const rawMs = Math.min(120, ts - this.lastTs);
      const dt = clamp(rawMs / 1000, 0.001, 0.05);
      this.lastTs = ts;
      this.renderTime += dt;
      this._trackQuality(rawMs, dt);
      this._update(dt);
      this._render(dt);
      if (this.onFrame) this.onFrame(dt);
      global.requestAnimationFrame(this._loop);
    }

    _applyQuality(resize) {
      const q = clamp(this.quality, 0.35, 1);
      this.quality = q;
      this.maxParticles = Math.round(320 + q * 580);
      this.bloomEnabled = q > 0.42;
      const cap = q < 0.55 ? 1 : q < 0.8 ? 1.25 : q < 0.9 ? 1.5 : 2;
      const changed = cap !== this.dprCap;
      this.dprCap = cap;
      if (resize && changed && this.canvas) {
        clearTimeout(this._qualityResize);
        this._qualityResize = setTimeout(() => this._resize(), 260);
      }
    }

    _trackQuality(frameMs, dt) {
      if (document.hidden) return;
      this.frameSum += Math.min(80, frameMs);
      this.frameCount++;
      this.qualityTimer += dt;
      if (this.qualityTimer < 1) return;
      const avg = this.frameSum / Math.max(1, this.frameCount);
      this.qualityTimer = 0;
      this.frameSum = 0;
      this.frameCount = 0;
      if (avg > 22.5) {
        this.slowStreak++;
        this.fastStreak = 0;
      } else if (avg < 17.8) {
        this.fastStreak++;
        this.slowStreak = 0;
      } else {
        this.slowStreak = 0;
        this.fastStreak = 0;
      }
      if (this.slowStreak >= 2 && this.quality > 0.4) {
        this.slowStreak = 0;
        this.quality = Math.max(0.4, this.quality - 0.12);
        this._applyQuality(true);
      } else if (this.fastStreak >= 5 && this.quality < this.qualityCap) {
        this.fastStreak = 0;
        this.quality = Math.min(this.qualityCap, this.quality + 0.06);
        this._applyQuality(false);
      }
    }

    _resize() {
      const w = Math.max(320, global.innerWidth || 1);
      const h = Math.max(240, global.innerHeight || 1);
      const sizeChanged = w !== this.w || h !== this.h;
      this.w = w;
      this.h = h;
      this.dpr = Math.min(this.dprCap, global.devicePixelRatio || 1);
      this.canvas.width = Math.round(w * this.dpr);
      this.canvas.height = Math.round(h * this.dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      const bs = this.quality < 0.55 ? BLOOM_SCALE * 0.72 : BLOOM_SCALE;
      this.bloomCanvas.width = Math.max(2, Math.round(w * bs));
      this.bloomCanvas.height = Math.max(2, Math.round(h * bs));
      this.ctx.imageSmoothingEnabled = true;
      this.bctx.imageSmoothingEnabled = true;
      if (!this.pointer.inside) {
        this.pointer.x = w * 0.66;
        this.pointer.y = h * 0.5;
      }
      if (sizeChanged) this._makeStars();
    }

    _onResize() {
      if (this._resizeQueued) return;
      this._resizeQueued = true;
      global.requestAnimationFrame(() => {
        this._resizeQueued = false;
        this._resize();
      });
    }

    /* ═══════════════════════ ESTADOS ═══════════════════════ */
    start(skinId, powerId, effectId) {
      this._resetWorld(true, skinId, powerId, effectId);
      this.mode = 'playing';
      this.keys.clear();
      this.pointer.down = false;
      this.pointer.touchActive = false;
      this.pointer.touchBoostHeld = false;
      this.pointer.lastTapAt = 0;
      this.audio.setDucked(false);
      this.audio.setBoost(false);
      this.boostAudioOn = false;
      if (this.audio && this.audio.start) this.audio.start();
    }

    pause() {
      if (this.mode !== 'playing') return;
      this.mode = 'paused';
      this.audio.setDucked(true);
      this.audio.setBoost(false);
      this.boostAudioOn = false;
      this.pointer.down = false;
      this.pointer.touchActive = false;
      this.pointer.touchBoostHeld = false;
      this.pointer.touchId = -1;
    }

    resume() {
      if (this.mode !== 'paused') return;
      this.mode = 'playing';
      this.audio.setDucked(false);
      this.pointer.down = false;
      this.pointer.touchActive = false;
      this.pointer.touchBoostHeld = false;
      this.pointer.touchId = -1;
    }

    toMenu() {
      this._resetWorld(false);
      this.mode = 'menu';
      this.audio.setDucked(true);
      this.audio.setBoost(false);
      this.boostAudioOn = false;
    }

    abandon() {
      if (this.mode !== 'playing' && this.mode !== 'paused') return;
      const stats = this.getRunStats();
      this.ended = true;
      this.mode = 'menu';
      this._resetWorld(false);
      this.audio.setDucked(true);
      this.audio.setBoost(false);
      this.boostAudioOn = false;
      if (this.callbacks && this.callbacks.onRunEnd) this.callbacks.onRunEnd(stats, 'quit');
    }

    getRunStats() {
      const mass = this.finalMass || (this.player ? this.player.mass : START_MASS);
      return {
        mass: Math.floor(mass),
        score: Math.floor(mass),
        massEaten: Math.floor(this.runStats.massEaten),
        kills: this.runStats.kills,
        time: this.runTime,
        killedBy: this.runStats.killedBy,
        cause: this.runStats.cause,
        survivalBonus: Math.floor(this.runStats.survivalBonus || 0),
        escapes: this.runStats.escapes || 0,
        pickups: this.runStats.pickups || 0
      };
    }

    /* ═══════════════════════ MUNDO ═══════════════════════ */
    _resetWorld(withPlayer, skinId, powerId, effectId) {
      this.player = null;
      this.snakes.length = 0;
      this.food.length = 0;
      this.particles.length = 0;
      this.floats.length = 0;
      this.respawns.length = 0;
      this.regularFood = 0;
      this.goldOrb = null;
      this.goldTimer = rand(12, 20);
      this.foodDeficit = 0;
      this.power = null;
      this.effect = null;
      this.powerCooldown = 0;
      this.powerTimer = 0;
      this.powerDuration = 0;
      this.powerStateId = null;
      this.powerReadyPinged = true;
      this.shockwaves.length = 0;
      this.beams.length = 0;
      this.pickupTimer = rand(10, 18);
      this.pickupCount = 0;
      this.monster = null;
      this.monsterEvent = {
        state: 'idle', timer: 0, total: 0, nextIn: rand(38, 52), tier: 0,
        warnX: 0, warnY: 0
      };
      this.survivalTier = 0;
      this.survivalTimer = SURVIVAL_STEP;
      this.buffSignature = '';
      this.combo = 0;
      this.comboTimer = 0;
      this.comboMax = 0;
      this.runTime = 0;
      this.runStats = { massEaten: 0, kills: 0, killedBy: '', cause: '', survivalBonus: 0, escapes: 0, pickups: 0 };
      this.finalMass = 0;
      this.finalStats = null;
      this.ended = false;
      this.deathTimer = 0;
      this.deathReason = '';
      this.edgeWarning = 0;
      this.shake = 0;
      this.spawnedNames.clear();
      this.pointer.down = false;
      this.pointer.touchActive = false;
      this.pointer.touchBoostHeld = false;
      this.pointer.touchId = -1;
      this.pointer.lastTapAt = 0;
      if (this.hash) this.hash.clear();
      if (this.foodGrid) this.foodGrid.clear();
      this.foodGridTimer = 0;

      this._createFood(FOOD_TARGET);

      if (withPlayer) {
        const skin = (global.WZ && WZ.getSkin) ? WZ.getSkin(skinId) : null;
        this._createAICohort(3);
        this._spawnPlayer(skin);
        this.mode = 'playing';
        this._applyLoadout(powerId, effectId);
        if (this.player) {
          this.cam.x = this.camTarget.x = this.player.x;
          this.cam.y = this.camTarget.y = this.player.y;
          this.cam.zoom = 1.25;
          this.pointer.x = this.w * 0.5 + Math.cos(this.player.angle) * 220;
          this.pointer.y = this.h * 0.5 + Math.sin(this.player.angle) * 220;
        }
      } else {
        this._createAICohort(5);
        this._chooseMenuFocus(true);
        this.mode = 'menu';
      }
    }

    _applyLoadout(powerId, effectId) {
      this.power = (global.WZ && WZ.getPower) ? WZ.getPower(powerId) : null;
      this.effect = (global.WZ && WZ.getEffect) ? WZ.getEffect(effectId) : null;
      this.powerCooldown = 0;
      this.powerTimer = 0;
      this.powerDuration = 0;
      this.powerStateId = null;
      this.powerReadyPinged = true;
      const p = this.player;
      if (!p) return;
      p.radiusScale = 1;
      p.powerSpeed = 1;
      p.effectTimer = 0;
      p.effect = this.effect;
      p.effectCd = this.effect && this.effect.perk ? rand(2, 5) : 0;
      p.powerMagnet = !!(this.power && this.power.kind === 'passive' && this.power.id === 'magnet');
    }

    getPowerState() {
      if (!this.power || !this.player) return null;
      return {
        id: this.power.id,
        name: this.power.name,
        kind: this.power.kind,
        icon: this.power.icon,
        color: this.power.color,
        glow: this.power.glow,
        cooldown: this.powerCooldown,
        cooldownTotal: this.power.cooldown || 0,
        running: this.powerTimer > 0,
        timer: this.powerTimer,
        duration: this.powerDuration,
        ready: this.powerCooldown <= 0 && this.powerTimer <= 0
      };
    }

    activatePower() {
      if (this.mode !== 'playing' || !this.player || !this.player.alive) return false;
      const pw = this.power;
      if (!pw || pw.kind !== 'active') return false;
      if (this.powerCooldown > 0) {
        this.audio.warn();
        return false;
      }
      const p = this.player;
      this.powerCooldown = pw.cooldown || 12;
      this.powerDuration = pw.duration || 0;
      this.powerTimer = this.powerDuration;
      this.powerStateId = this.powerTimer > 0 ? pw.id : null;
      this.powerReadyPinged = false;

      if (pw.id === 'nova') {
        this._novaBurst(p, pw);
      } else {
        if (pw.id === 'micro' || pw.id === 'titan') {
          p.radiusScale = pw.scale || 1;
        } else if (pw.id === 'phantom') {
          p.radiusScale = 1;
        }
        p.powerSpeed = pw.speed || 1;
        this._spawnParticles(p.x, p.y, pw.glow, 34, 40, 230, 0.35, 0.9, 1.4, 3.4);
        this._addFloat(p.x, p.y - p.radius * 2, pw.name, pw.color, true);
      }

      if (this.audio && this.audio.powerActivate) this.audio.powerActivate(pw.id);
      if (this.callbacks && this.callbacks.onPowerUsed) this.callbacks.onPowerUsed(pw);
      return true;
    }

    _novaBurst(p, pw) {
      const radius = pw.radius || 520;
      this.shockwaves.push({
        x: p.x, y: p.y, t: 0, life: 0.9, max: radius + 100, color: pw.glow
      });
      this._spawnParticles(p.x, p.y, pw.glow, 64, 60, 430, 0.35, 1.1, 1.6, 4.2);
      this._spawnParticles(p.x, p.y, '#ffffff', 20, 30, 190, 0.25, 0.6, 1.2, 2.8);
      this.shake = Math.max(this.shake, 20);
      let kills = 0;
      for (const s of this.snakes) {
        if (s.isPlayer || !s.alive) continue;
        const dx = s.x - p.x, dy = s.y - p.y;
        if (dx * dx + dy * dy < radius * radius) {
          this._killSnake(s, p, 'nova');
          kills++;
        }
      }
      this._addFloat(p.x, p.y - 34, kills ? 'NOVA ×' + kills : 'NOVA', pw.color, true);
      if (this.monster) {
        const md = Math.hypot(this.monster.x - p.x, this.monster.y - p.y);
        if (md < radius + this.monster.radius) {
          this.monster.stunTimer = Math.max(this.monster.stunTimer, 2.2);
          this.monster.lungeTelegraph = 0;
          this.monster.lungeTimer = 0;
          const a = Math.atan2(this.monster.y - p.y, this.monster.x - p.x);
          this.monster.x += Math.cos(a) * 240;
          this.monster.y += Math.sin(a) * 240;
          this._addFloat(this.monster.x, this.monster.y - this.monster.radius, 'ATURDIDO', pw.color, true);
        }
      }
      if (this.audio && this.audio.powerNova) this.audio.powerNova(kills);
      if (this.callbacks && this.callbacks.onNova) this.callbacks.onNova(kills);
    }

    _endPowerEffect() {
      const p = this.player;
      if (!p) {
        this.powerStateId = null;
        return;
      }
      if (this.powerStateId === 'micro' || this.powerStateId === 'titan' || this.powerStateId === 'phantom') {
        p.radiusScale = 1;
        p.powerSpeed = 1;
        this._spawnParticles(p.x, p.y, this.power ? this.power.glow : '#7df9ff', 18, 20, 120, 0.3, 0.7, 1, 2.4);
        if (this.mode === 'playing' && this.audio && this.audio.powerEnd) this.audio.powerEnd();
      }
      this.powerStateId = null;
    }

    _createAICohort(bigCount) {
      for (let i = 0; i < AI_COUNT; i++) {
        const big = i < bigCount;
        const mass = big ? rand(180, 420) : 22 + Math.pow(Math.random(), 2.1) * 170;
        this._spawnAI(mass);
      }
    }

    _chooseMenuFocus(snap) {
      let best = null;
      for (const s of this.snakes) {
        if (!s.alive) continue;
        if (!best || s.mass > best.mass) best = s;
      }
      if (best) {
        this.menuFocus = best;
        this.menuTimer = rand(10, 16);
        const t = this._menuCamTarget(best);
        this.camTarget.x = t.x;
        this.camTarget.y = t.y;
        this.camTarget.zoom = t.zoom;
        if (snap) {
          this.cam.x = this.camTarget.x;
          this.cam.y = this.camTarget.y;
          this.cam.zoom = t.zoom;
        }
      } else {
        this.camTarget.x = 0;
        this.camTarget.y = 0;
        this.camTarget.zoom = 0.62;
        if (snap) {
          this.cam.x = 0;
          this.cam.y = 0;
          this.cam.zoom = 0.62;
        }
      }
    }

    _menuCamTarget(f) {
      const base = clamp(Math.min(this.w, this.h) / 1120, 0.55, 0.86);
      const zoom = base * clamp(12 / f.radius, 0.7, 1.08);
      return {
        x: f.x + Math.cos(f.angle) * 35 - (this.w * 0.29) / zoom,
        y: f.y + Math.sin(f.angle) * 35 - (this.h * 0.21) / zoom,
        zoom
      };
    }

    _spawnPlayer(skin) {
      let best = null;
      let bestClear = -Infinity;
      for (let tries = 0; tries < 70; tries++) {
        const ang = rand(0, TAU);
        const rad = rand(0, 620);
        const x = Math.cos(ang) * rad;
        const y = Math.sin(ang) * rad;
        const heading = ang + Math.PI + rand(-0.45, 0.45);
        let minD2 = Infinity;
        let minHeadD2 = Infinity;

        for (const s of this.snakes) {
          if (!s.alive) continue;
          const dh = dist2(x, y, s.x, s.y);
          if (dh < minD2) minD2 = dh;
          if (dh < minHeadD2) minHeadD2 = dh;
          const pts = s.points;
          for (let i = 0; i < pts.length; i += 4) {
            const d = dist2(x, y, pts[i].x, pts[i].y);
            if (d < minD2) minD2 = d;
          }
        }

        /* Comprobar también el cuerpo inicial que arrastrará el jugador. */
        const cosH = Math.cos(heading), sinH = Math.sin(heading);
        for (let k = 1; k <= 8; k++) {
          const bx = x - cosH * k * 30;
          const by = y - sinH * k * 30;
          for (const s of this.snakes) {
            if (!s.alive) continue;
            const d = dist2(bx, by, s.x, s.y);
            if (d < minD2) minD2 = d;
            const pts = s.points;
            for (let i = 0; i < pts.length; i += 5) {
              const dd = dist2(bx, by, pts[i].x, pts[i].y);
              if (dd < minD2) minD2 = dd;
            }
          }
        }

        const score = minD2 + Math.min(minHeadD2, 900 * 900) * 0.35;
        if (score > bestClear) {
          bestClear = score;
          best = { x, y, heading };
        }
        if (minHeadD2 > 680 * 680 && minD2 > 240 * 240) break;
      }
      if (!best) {
        const ang = rand(0, TAU);
        best = { x: Math.cos(ang) * 300, y: Math.sin(ang) * 300, heading: ang + Math.PI };
      }
      const s = this._createSnake({
        x: best.x, y: best.y, angle: best.heading, mass: START_MASS,
        name: 'TÚ', skin, isPlayer: true
      });
      s.spawnProtect = 3.0;
      this.player = s;
      return s;
    }

    _spawnAI(mass) {
      const skin = WZ.SKINS[randInt(0, WZ.SKINS.length - 1)];
      let x = 0, y = 0, ok = false;
      const avoidPlayer = this.player && this.player.alive ? 720 : 0;
      for (let tries = 0; tries < 40; tries++) {
        const a = rand(0, TAU);
        const r = Math.sqrt(Math.random()) * (WORLD_R - 300);
        x = Math.cos(a) * r;
        y = Math.sin(a) * r;
        ok = true;
        if (this.player) {
          if (dist2(x, y, this.player.x, this.player.y) < avoidPlayer * avoidPlayer) ok = false;
        }
        if (ok) {
          for (const o of this.snakes) {
            if (!o.alive) continue;
            if (dist2(x, y, o.x, o.y) < 340 * 340) { ok = false; break; }
          }
        }
        if (ok) break;
      }
      if (!ok) {
        const a = rand(0, TAU);
        x = Math.cos(a) * (WORLD_R - 400);
        y = Math.sin(a) * (WORLD_R - 400);
      }

      let name = AI_NAMES[randInt(0, AI_NAMES.length - 1)];
      for (let i = 0; i < 12; i++) {
        if (!this.spawnedNames.has(name)) break;
        name = AI_NAMES[randInt(0, AI_NAMES.length - 1)];
      }
      this.spawnedNames.add(name);

      let angle = rand(0, TAU);
      if (this.player && this.player.alive) {
        angle = Math.atan2(y - this.player.y, x - this.player.x);
      }
      const s = this._createSnake({
        x, y, angle, mass: Math.min(MAX_AI_MASS, mass),
        name, skin, isPlayer: false
      });
      s.ai = {
        timer: rand(0, 0.12),
        desired: s.angle,
        wander: rand(0, TAU),
        boostTimer: 0,
        skill: rand(0.55, 1),
        aggression: Math.random() < 0.4 ? rand(0.2, 0.7) : 0.05,
        trailTimer: rand(0, 0.1)
      };
      if (global.WZ && WZ.EFFECTS && Math.random() < 0.62) {
        s.effect = WZ.EFFECTS[randInt(0, WZ.EFFECTS.length - 1)];
        s.effectCd = s.effect.perk ? rand(3, 14) : 0;
      }
      return s;
    }

    _createSnake(opts) {
      const mass = opts.mass;
      const radius = this._radiusForMass(mass);
      const s = {
        isPlayer: !!opts.isPlayer,
        name: opts.name,
        skin: opts.skin,
        x: opts.x,
        y: opts.y,
        angle: opts.angle,
        targetAngle: opts.angle,
        mass,
        radius,
        speed: 0,
        alive: true,
        points: [],
        bbox: { x0: 0, y0: 0, x1: 0, y1: 0 },
        phase: rand(0, TAU),
        blinkSeed: rand(0, 10),
        trailTimer: 0,
        boostDrop: 0,
        boostPulse: 0,
        ai: null,
        growPulse: 0,
        spawnProtect: 0,
        radiusScale: 1,
        powerSpeed: 1,
        powerMagnet: false,
        effect: opts.effect || null,
        effectTimer: 0,
        effectCd: 0,
        stunTimer: 0,
        shieldTimer: 0,
        magnetTimer: 0,
        frenzyTimer: 0,
        invulnTimer: 0,
        prismTimer: 0,
        prismSpeed: 1,
        singularityTimer: 0,
        slowTimer: 0
      };
      s.turnRate = 4.55 - clamp((radius - 9) * 0.19, 0, 1.65);
      s.baseSpeed = 192 - radius * 1.55;
      const target = this._lengthForMass(mass);
      const count = Math.max(12, Math.floor(target / SPACING));
      const ca = Math.cos(s.angle), sa = Math.sin(s.angle);
      for (let i = 1; i <= count; i++) {
        const wobble = Math.sin(i * 0.09 + s.phase) * 0.35;
        const a = s.angle + wobble;
        s.points.push({
          x: s.x - Math.cos(a) * i * SPACING,
          y: s.y - Math.sin(a) * i * SPACING,
          owner: s
        });
      }
      this.snakes.push(s);
      if (opts.isPlayer) this.player = s;
      return s;
    }

    _radiusForMass(mass) {
      return 9.4 + 8.9 * Math.sqrt(clamp(mass / 1500, 0, 1));
    }

    _lengthForMass(mass) {
      return 150 + mass * 4.4;
    }

    /* ═══════════════════════ UPDATE ═══════════════════════ */
    _update(dt) {
      if (this.mode === 'paused') {
        this._updateCamera(dt, true);
        return;
      }
      this.time += dt;

      let scale = 1;
      if (this.mode === 'dying') scale = 0.34;
      else if (this.mode === 'dead') scale = 0.16;
      const worldDt = dt * scale;

      this._updateRespawns(worldDt);
      this.foodGridTimer -= worldDt;
      if (this.foodGridTimer <= 0) {
        this.foodGridTimer = 0.14;
        this._rebuildFoodGrid();
      }

      for (const s of this.snakes) {
        if (s.alive) this._updateSnake(s, worldDt);
      }
      this._buildHash();
      this._handleCollisions();
      this._cleanupDead();

      this._updateFood(worldDt);
      this._updatePickups(worldDt);
      this._updateParticles(worldDt);
      this._updateFloats(worldDt);
      this._updateGold(worldDt);
      this._updateShockwaves(dt);
      this._updateBeams(dt);
      this._updateMonster(worldDt);
      if (this.mode === 'playing') this._updateSurvival(dt);

      if (this.powerCooldown > 0) {
        this.powerCooldown = Math.max(0, this.powerCooldown - dt);
        if (this.powerCooldown === 0 && !this.powerReadyPinged) {
          this.powerReadyPinged = true;
          if (this.mode === 'playing' && this.audio && this.audio.powerReady) this.audio.powerReady();
        }
      }
      if (this.powerTimer > 0) {
        this.powerTimer = Math.max(0, this.powerTimer - dt);
        if (this.powerTimer === 0) this._endPowerEffect();
      }

      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) this.combo = 0;
      }

      if (this.mode === 'playing' && this.player) {
        this.runTime += dt;
        const d = Math.hypot(this.player.x, this.player.y);
        const target = clamp(1 - (WORLD_R - d) / 320, 0, 1);
        this.edgeWarning = target;
        if (this.edgeWarning > 0.55) {
          this.warnCooldown -= dt;
          if (this.warnCooldown <= 0) {
            this.warnCooldown = 1.5;
            this.audio.warn();
          }
        }
        this.audio.setBoost(this._isBoosting() && this.player.mass > 12);
      } else {
        this.edgeWarning *= Math.exp(-dt * 3);
        if (this.boostAudioOn) {
          this.audio.setBoost(false);
          this.boostAudioOn = false;
        }
      }

      if (this.mode === 'dying') {
        this.deathTimer -= dt;
        if (this.deathTimer <= 0) this._finalizeDeath();
      }

      this.shake *= Math.exp(-dt * 3.6);
      if (this.shake < 0.1) this.shake = 0;

      this.audioTimer -= dt;
      if (this.audioTimer <= 0) {
        this.audioTimer = 0.45;
        if (this.mode === 'playing' && this.player) {
          this.audio.setIntensity(clamp(0.34 + this.player.mass / 760, 0.34, 1));
        } else if (this.mode === 'menu') {
          this.audio.setIntensity(0.38);
        } else {
          this.audio.setIntensity(0.3);
        }
      }

      this._updateCamera(dt, false);
    }

    _updateSnake(s, dt) {
      const stunned = s.stunTimer > 0;
      if (s.stunTimer > 0) s.stunTimer = Math.max(0, s.stunTimer - dt);
      if (s.slowTimer > 0) s.slowTimer = Math.max(0, s.slowTimer - dt);
      if (s.shieldTimer > 0) s.shieldTimer = Math.max(0, s.shieldTimer - dt);
      if (s.magnetTimer > 0) s.magnetTimer = Math.max(0, s.magnetTimer - dt);
      if (s.frenzyTimer > 0) s.frenzyTimer = Math.max(0, s.frenzyTimer - dt);
      if (s.invulnTimer > 0) s.invulnTimer = Math.max(0, s.invulnTimer - dt);
      if (s.prismTimer > 0) s.prismTimer = Math.max(0, s.prismTimer - dt);
      if (s.singularityTimer > 0) s.singularityTimer = Math.max(0, s.singularityTimer - dt);

      let boosting = false;
      if (stunned) {
        s.targetAngle = s.angle;
      } else if (s.isPlayer) {
        s.targetAngle = this._playerDesiredAngle(s);
        boosting = this._isBoosting() && s.mass > 12;
      } else {
        this._aiThink(s, dt);
        s.targetAngle = s.ai.desired;
        boosting = s.ai.boostTimer > 0 && s.mass > 30;
        if (boosting) s.ai.boostTimer -= dt;
      }

      const diff = angDiff(s.angle, s.targetAngle);
      const maxTurn = s.turnRate * (boosting ? 0.9 : 1) * (s.frenzyTimer > 0 ? 1.15 : 1) * dt;
      s.angle += clamp(diff, -maxTurn, maxTurn);

      let speedMul = 1;
      if (stunned) speedMul *= 0.55;
      if (s.slowTimer > 0) speedMul *= 0.62;
      if (s.frenzyTimer > 0) speedMul *= 1.32;
      if (s.prismTimer > 0) speedMul *= s.prismSpeed || 1.3;
      const speed = s.baseSpeed * (boosting ? 1.68 : 1) * (s.powerSpeed || 1) * speedMul;
      s.speed = speed;
      s.x += Math.cos(s.angle) * speed * dt;
      s.y += Math.sin(s.angle) * speed * dt;

      if (s.growPulse > 0) s.growPulse = Math.max(0, s.growPulse - dt * 4);
      if (s.boostPulse > 0) s.boostPulse = Math.max(0, s.boostPulse - dt * 3);
      if (s.spawnProtect > 0) s.spawnProtect = Math.max(0, s.spawnProtect - dt);

      const targetRadius = this._radiusForMass(s.mass);
      s.radius += (targetRadius - s.radius) * Math.min(1, dt * 4.5);

      const last = s.points[0];
      if (last) {
        const dx = s.x - last.x, dy = s.y - last.y;
        if (dx * dx + dy * dy >= SPACING * SPACING) {
          s.points.unshift({ x: s.x, y: s.y, owner: s });
        }
      } else {
        s.points.unshift({ x: s.x, y: s.y, owner: s });
      }

      const targetCount = Math.max(12, Math.floor(this._lengthForMass(s.mass) / SPACING));
      while (s.points.length > targetCount) s.points.pop();

      if (boosting && s.mass > 12) {
        s.mass = Math.max(10, s.mass - 2.1 * dt);
        s.boostDrop -= dt;
        if (s.boostDrop <= 0) {
          s.boostDrop = 0.55;
          const dropMass = 1.5;
          s.mass = Math.max(9, s.mass - dropMass * 0.5);
          const bx = s.x - Math.cos(s.angle) * (s.radius * 1.6 + 8);
          const by = s.y - Math.sin(s.angle) * (s.radius * 1.6 + 8);
          this._addFood({
            x: bx + rand(-4, 4), y: by + rand(-4, 4),
            r: 3.4, value: 1.5, color: s.skin.colors[randInt(0, s.skin.colors.length - 1)],
            kind: 'loot', vx: -Math.cos(s.angle) * 28 + rand(-10, 10),
            vy: -Math.sin(s.angle) * 28 + rand(-10, 10),
            phase: rand(0, TAU), life: 0
          });
        }
        if (s.isPlayer) {
          s.boostPulse = 1;
        }
      }

      const eff = s.isPlayer ? this.effect : s.effect;
      if (eff) {
        if (!s.isPlayer || boosting || Math.random() < dt * 10) this._emitEffectTrail(s, dt, eff);
      } else if (s.isPlayer) {
        if (boosting) this._emitBoostTrail(s);
        else if (Math.random() < dt * 8) this._emitIdleTrail(s);
      } else if (s.ai) {
        s.ai.trailTimer -= dt;
        if (s.ai.trailTimer <= 0) {
          s.ai.trailTimer = rand(0.18, 0.5);
          this._emitIdleTrail(s);
        }
      }

      this._updateSnakeEffect(s, dt);

      s.bbox.x0 = s.x;
      s.bbox.y0 = s.y;
      s.bbox.x1 = s.x;
      s.bbox.y1 = s.y;
      for (let i = 0; i < s.points.length; i += 3) {
        const p = s.points[i];
        if (p.x < s.bbox.x0) s.bbox.x0 = p.x;
        if (p.x > s.bbox.x1) s.bbox.x1 = p.x;
        if (p.y < s.bbox.y0) s.bbox.y0 = p.y;
        if (p.y > s.bbox.y1) s.bbox.y1 = p.y;
      }
    }

    _playerDesiredAngle(s) {
      /* Teclado con prioridad si se está usando */
      let kx = 0, ky = 0;
      if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) kx -= 1;
      if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) kx += 1;
      if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) ky -= 1;
      if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) ky += 1;
      if (kx || ky) return Math.atan2(ky, kx);

      if (this.touchMode) {
        if (this.pointer.touchActive) {
          const dx = this.pointer.x2 - this.pointer.anchorX;
          const dy = this.pointer.y2 - this.pointer.anchorY;
          if (dx * dx + dy * dy > 64) return Math.atan2(dy, dx);
        }
        /* Sin dedo activo se conserva el rumbo. */
        return s.targetAngle;
      }

      const sx = (s.x - this.cam.x) * this.cam.zoom + this.w / 2;
      const sy = (s.y - this.cam.y) * this.cam.zoom + this.h / 2;
      const dx = this.pointer.x - sx;
      const dy = this.pointer.y - sy;
      if (dx * dx + dy * dy < 100) return s.targetAngle;
      return Math.atan2(dy, dx);
    }

    _isBoosting() {
      if (this.mode !== 'playing') return false;
      if (this.keys.has('Space')) return true;
      if (!this.touchMode && this.pointer.down) return true;
      if (this.touchMode && this.pointer.touchActive && this.pointer.touchBoostHeld) return true;
      return false;
    }

    _rebuildFoodGrid() {
      for (const arr of this.foodGrid.values()) arr.length = 0;
      for (let i = 0; i < this.food.length; i++) {
        const o = this.food[i];
        const key = (Math.floor(o.x / FOOD_CELL) + 100) * 1000 + (Math.floor(o.y / FOOD_CELL) + 100);
        let arr = this.foodGrid.get(key);
        if (!arr) { arr = []; this.foodGrid.set(key, arr); }
        arr.push(o);
      }
    }

    _aiThink(s, dt) {
      const ai = s.ai;
      ai.timer -= dt;
      if (ai.timer > 0) return;
      ai.timer = rand(0.09, 0.17);

      const dc = Math.hypot(s.x, s.y);
      if (dc > WORLD_R - 300) {
        ai.desired = Math.atan2(-s.y, -s.x) + rand(-0.25, 0.25);
        if (s.mass > 60 && Math.random() < 0.4) ai.boostTimer = 0.45;
        return;
      }

      /* Buscar comida cercana usando la rejilla espacial. */
      let targetX = null, targetY = null;
      let bestScore = Infinity;
      const lookR2 = 640 * 640;
      const cosA = Math.cos(s.angle), sinA = Math.sin(s.angle);
      const gx0 = Math.floor((s.x - 640) / FOOD_CELL);
      const gx1 = Math.floor((s.x + 640) / FOOD_CELL);
      const gy0 = Math.floor((s.y - 640) / FOOD_CELL);
      const gy1 = Math.floor((s.y + 640) / FOOD_CELL);
      for (let gx = gx0; gx <= gx1; gx++) {
        for (let gy = gy0; gy <= gy1; gy++) {
          const arr = this.foodGrid.get((gx + 100) * 1000 + (gy + 100));
          if (!arr || !arr.length) continue;
          for (let fi = 0; fi < arr.length; fi++) {
            const o = arr[fi];
            const dx = o.x - s.x, dy = o.y - s.y;
            const d2 = dx * dx + dy * dy;
            if (d2 > lookR2) continue;
            let sc = d2;
            const dot = (dx * cosA + dy * sinA) / (Math.sqrt(d2) + 0.001);
            if (dot < -0.25) sc *= 2.0;
            if (o.kind === 'gold') sc *= 0.18;
            else if (o.kind === 'pickup') sc *= 0.32;
            else if (o.kind === 'loot') sc /= (1 + o.value * 0.22);
            if (sc < bestScore) {
              bestScore = sc;
              targetX = o.x;
              targetY = o.y;
            }
          }
        }
      }

      /* Caza oportunista */
      if (Math.random() < ai.aggression * 0.55) {
        let prey = null, pd = 460 * 460;
        for (const o of this.snakes) {
          if (!o.alive || o === s) continue;
          if (o.mass >= s.mass * 0.95) continue;
          const d2 = dist2(s.x, s.y, o.x, o.y);
          if (d2 < pd) { pd = d2; prey = o; }
        }
        if (prey) {
          const lead = 0.45;
          targetX = prey.x + Math.cos(prey.angle) * prey.speed * lead;
          targetY = prey.y + Math.sin(prey.angle) * prey.speed * lead;
        }
      }

      let baseAngle;
      if (targetX !== null) baseAngle = Math.atan2(targetY - s.y, targetX - s.x);
      else {
        ai.wander += rand(-0.7, 0.7);
        baseAngle = ai.wander;
      }

      /* Evaluar candidatos evitando cuerpos */
      const offsets = [0, 0.3, -0.3, 0.62, -0.62, 0.95, -0.95, 1.35, -1.35];
      let chosen = null;
      let bestVal = -Infinity;
      for (let i = 0; i < offsets.length; i++) {
        const a = baseAngle + offsets[i];
        const clear = this._clearance(s, a);
        const turnPenalty = Math.abs(offsets[i]) * 18;
        const val = clear - turnPenalty;
        if (val > bestVal) { bestVal = val; chosen = a; }
        if (i === 0 && clear > 180) break;
      }
      ai.desired = chosen === null ? baseAngle : chosen;

      if (s.mass > 90 && Math.random() < 0.02) ai.boostTimer = rand(0.3, 0.7);
    }

    _clearance(s, angle) {
      const cosA = Math.cos(angle), sinA = Math.sin(angle);
      let minD = 999;
      const steps = [55, 120, 190];
      for (const step of steps) {
        const px = s.x + cosA * step;
        const py = s.y + sinA * step;
        const bd = WORLD_R - Math.hypot(px, py);
        if (bd < 70) return -200;
        const cells = 1;
        const cx = Math.floor(px / CELL);
        const cy = Math.floor(py / CELL);
        for (let ox = -cells; ox <= cells; ox++) {
          for (let oy = -cells; oy <= cells; oy++) {
            const arr = this.hash.get((cx + ox + 500) * 2000 + (cy + oy + 500));
            if (!arr) continue;
            for (let k = 0; k < arr.length; k++) {
              const p = arr[k];
              if (p.owner === s || !p.owner.alive) continue;
              const d = Math.hypot(p.x - px, p.y - py);
              if (d < minD) minD = d;
            }
          }
        }
      }
      return minD;
    }

    _emitEffectTrail(s, dt, eff) {
      eff = eff || (s.isPlayer ? this.effect : s.effect);
      if (!eff) return;
      s.effectTimer = (s.effectTimer || 0) - dt;
      if (s.effectTimer > 0) return;
      s.effectTimer = (eff.rate || 0.07) * (s.isPlayer ? 1 : 1.55);
      if (!this._inView(s.x, s.y, 500)) return;
      if (this.particles.length > this.maxParticles - 12) return;
      const tail = s.points.length ? s.points[s.points.length - 1] : s;
      const cols = eff.colors || [eff.color, eff.glow];
      const mode = eff.mode || 'spark';
      const push = (p) => {
        p.shape = p.shape || 'dot';
        p.life = p.life || 0.6;
        p.max = p.life;
        p.drag = p.drag === undefined ? 2.2 : p.drag;
        this.particles.push(p);
      };

      if (mode === 'orbit') {
        if (Math.random() < 0.5) return;
        const c = cols[randInt(0, cols.length - 1)];
        push({ x: s.x + rand(-8, 8), y: s.y + rand(-8, 8), vx: rand(-8, 8), vy: rand(-18, -4), life: rand(.4, .8), size: rand(.8, 1.7), color: c, drag: 1.2 });
        return;
      }

      for (let i = 0; i < (mode === 'ember' ? 2 : 2); i++) {
        let color = cols[randInt(0, cols.length - 1)];
        if (mode === 'rainbow') color = cols[Math.floor(this.renderTime * 6 + i) % cols.length];
        const a = rand(0, TAU);
        let sp = rand(10, 55);
        let vx = Math.cos(a) * sp;
        let vy = Math.sin(a) * sp;
        let size = rand(1, 2.2);
        let life = rand(.35, .75);
        let shape = 'dot';
        let drag = 2.4;
        if (mode === 'ember') {
          vx = rand(-14, 14);
          vy = rand(-48, -18);
          size = rand(1.4, 3);
          life = rand(.65, 1.15);
          drag = .9;
        } else if (mode === 'void') {
          sp = rand(4, 26);
          size = rand(1.8, 3.8);
          life = rand(.8, 1.4);
          drag = .5;
        } else if (mode === 'streak') {
          vx = Math.cos(s.angle + Math.PI + rand(-1, 1)) * rand(35, 110);
          vy = Math.sin(s.angle + Math.PI + rand(-1, 1)) * rand(35, 110);
          size = rand(1.1, 2.2);
          life = rand(.22, .42);
          shape = 'streak';
          drag = 2.8;
        } else if (mode === 'rainbow') {
          vx = Math.cos(a) * rand(8, 42);
          vy = Math.sin(a) * rand(8, 42);
          size = rand(1.2, 2.6);
          life = rand(.5, 1);
        }
        push({
          x: tail.x + rand(-5, 5),
          y: tail.y + rand(-5, 5),
          vx, vy, size, life, shape, drag, color
        });
      }
      if (mode === 'void' && Math.random() < 0.3) {
        push({ x: tail.x, y: tail.y, vx: rand(-6, 6), vy: rand(-20, -6), life: rand(.8, 1.5), size: rand(3, 5), shape: 'dot', drag: .4, color: cols[0] });
      }
    }

    _emitBoostTrail(s) {
      const p = s.points.length ? s.points[Math.min(s.points.length - 1, 3)] : s;
      const col = s.skin.colors[randInt(0, s.skin.colors.length - 1)];
      this._spawnParticles(p.x, p.y, col, 1, 8, 45, 0.22, 0.5, 1.2, 2.6);
    }

    _emitIdleTrail(s) {
      const trail = s.skin.trail;
      if (!trail) return;
      if (!this._inView(s.x, s.y, 500)) return;
      if (trail === 'spark' || trail === 'star') {
        if (Math.random() < 0.35) return;
      }
      const p = s.points.length ? s.points[s.points.length - 1] : s;
      const col = s.skin.accent;
      const count = trail === 'ember' ? 2 : 1;
      this._spawnParticles(p.x + rand(-4, 4), p.y + rand(-4, 4), col, count, 3, 18, 0.35, 0.8, 0.7, 1.8, 0.12);
    }

    /* ═══════════════════════ HABILIDADES DE ESTELA ═══════════════════════ */
    _isInvulnerable(s) {
      return !!(s && (s.shieldTimer > 0 || s.invulnTimer > 0 || this._isPhantom(s)));
    }

    _nearestRival(s, radius, canTargetPlayer) {
      let best = null;
      let bestD = radius * radius;
      for (let i = 0; i < this.snakes.length; i++) {
        const o = this.snakes[i];
        if (!o.alive || o === s) continue;
        if (!canTargetPlayer && o.isPlayer) continue;
        const d = dist2(s.x, s.y, o.x, o.y);
        if (d < bestD) { bestD = d; best = o; }
      }
      return best;
    }

    _stunSnake(s, duration) {
      if (!s || !s.alive || s.spawnProtect > 0) return false;
      if (s.shieldTimer > 0 || s.invulnTimer > 0) return false;
      const dur = s.isPlayer ? Math.max(0.35, duration * 0.62) : duration;
      s.stunTimer = Math.max(s.stunTimer, dur);
      this._spawnParticles(s.x, s.y, '#fff38a', 10, 20, 90, 0.25, 0.5, 1, 2.4, 3.2);
      if (s.isPlayer) {
        this._addFloat(s.x, s.y - s.radius * 2.2, 'ATURDIDO', '#fff38a', true);
        if (this.audio && this.audio.warn) this.audio.warn();
      }
      return true;
    }

    _stealMass(attacker, target, fraction) {
      if (!target || !target.alive) return 0;
      const amount = Math.min(Math.max(0, target.mass - 10), Math.max(0, target.mass * fraction));
      if (amount <= 0.5) return 0;
      target.mass = Math.max(10, target.mass - amount);
      const gain = amount * 0.38;
      attacker.mass = Math.min(attacker.isPlayer ? 100000 : MAX_AI_MASS, attacker.mass + gain);
      attacker.growPulse = 1;
      const count = clamp(Math.round(amount * 0.18), 2, 6);
      const value = (amount * 0.62) / count;
      for (let i = 0; i < count; i++) {
        const a = rand(0, TAU);
        this._addFood({
          x: target.x + Math.cos(a) * rand(4, 18),
          y: target.y + Math.sin(a) * rand(4, 18),
          r: 2.8 + Math.min(3, value * 0.5),
          value, color: target.skin.colors[randInt(0, target.skin.colors.length - 1)],
          kind: 'loot', vx: Math.cos(a) * rand(15, 70), vy: Math.sin(a) * rand(15, 70),
          phase: rand(0, TAU), life: 0
        });
      }
      this._spawnParticles(target.x, target.y, target.skin.glow, 16, 30, 150, 0.3, 0.7, 1.2, 3, 2.2);
      if (attacker.isPlayer) {
        this._addFloat(target.x, target.y - target.radius * 2, 'DRENADO', attacker.skin.accent, false);
      } else if (target.isPlayer) {
        this._addFloat(target.x, target.y - target.radius * 2, 'MASA DRENADA', '#ff7ca8', true);
      }
      return amount;
    }

    _updateSnakeEffect(s, dt) {
      const eff = s.isPlayer ? this.effect : s.effect;
      if (!eff || !eff.perk || this.mode !== 'playing') return;
      if (s.effectCd > 0) {
        s.effectCd = Math.max(0, s.effectCd - dt);
        return;
      }
      const perk = eff.perk;
      const isPlayer = s.isPlayer;
      const nearPlayer = this.player ? dist2(s.x, s.y, this.player.x, this.player.y) < 1400 * 1400 : false;
      if (!isPlayer && !nearPlayer) return;

      if (perk.type === 'flash' || perk.type === 'flare' || perk.type === 'orbitguard') {
        const target = this._nearestRival(s, perk.radius, true);
        if (!target) return;
        s.effectCd = perk.cooldown;
        if (perk.type === 'orbitguard') {
          this._stunSnake(target, perk.stun);
          this._stealMass(s, target, perk.drain || 0.05);
        } else {
          let hits = 0;
          for (let i = 0; i < this.snakes.length; i++) {
            const o = this.snakes[i];
            if (!o.alive || o === s) continue;
            if (dist2(s.x, s.y, o.x, o.y) > perk.radius * perk.radius) continue;
            this._stunSnake(o, perk.stun);
            if (perk.type === 'flare') this._stealMass(s, o, perk.drain || 0.05);
            hits++;
            if (hits >= 4) break;
          }
        }
        this.shockwaves.push({
          x: s.x, y: s.y, t: 0, life: 0.55, max: perk.radius * 0.72,
          color: eff.glow, thin: true
        });
        this._spawnParticles(s.x, s.y, eff.glow, 26, 40, 220, 0.25, 0.7, 1.2, 3.2, 2.2);
        this._addFloat(s.x, s.y - s.radius * 2.1, perk.name, eff.color, isPlayer || nearPlayer);
        if ((isPlayer || nearPlayer) && this.audio && this.audio.zap) this.audio.zap(this._panFor(s.x));
        if (this.callbacks && (isPlayer || nearPlayer) && this.callbacks.onEffectAbility) {
          this.callbacks.onEffectAbility(perk, s);
        }
        return;
      }

      if (perk.type === 'zap') {
        const target = this._nearestRival(s, perk.radius, true);
        if (!target) return;
        s.effectCd = perk.cooldown;
        this._stunSnake(target, perk.stun);
        this._stealMass(s, target, perk.drain || 0.04);
        this.beams.push({
          x1: s.x, y1: s.y, x2: target.x, y2: target.y,
          t: 0, life: 0.22, color: eff.color, width: 2.6
        });
        this._spawnParticles(target.x, target.y, eff.glow, 20, 30, 160, 0.2, 0.6, 1, 2.8, 2.4);
        this._addFloat(s.x, s.y - s.radius * 2.1, perk.name, eff.color, isPlayer || nearPlayer);
        if ((isPlayer || nearPlayer) && this.audio && this.audio.zap) this.audio.zap(this._panFor(target.x));
        if (this.callbacks && (isPlayer || nearPlayer) && this.callbacks.onEffectAbility) {
          this.callbacks.onEffectAbility(perk, s);
        }
        return;
      }

      if (perk.type === 'prism') {
        const rival = this._nearestRival(s, perk.range, true);
        const monsterNear = this.monster && dist2(s.x, s.y, this.monster.x, this.monster.y) < 560 * 560;
        if (!rival && !monsterNear) return;
        s.effectCd = perk.cooldown;
        s.invulnTimer = Math.max(s.invulnTimer, perk.duration);
        s.prismTimer = Math.max(s.prismTimer, perk.duration);
        s.prismSpeed = perk.speed || 1.3;
        this.shockwaves.push({
          x: s.x, y: s.y, t: 0, life: 0.45, max: 130, color: eff.glow, thin: true
        });
        this._spawnParticles(s.x, s.y, eff.glow, 22, 30, 180, 0.25, 0.65, 1.2, 3, 2);
        this._addFloat(s.x, s.y - s.radius * 2.1, perk.name, eff.color, isPlayer || nearPlayer);
        if ((isPlayer || nearPlayer) && this.audio && this.audio.powerActivate) this.audio.powerActivate('phantom');
        if (this.callbacks && (isPlayer || nearPlayer) && this.callbacks.onEffectAbility) {
          this.callbacks.onEffectAbility(perk, s);
        }
        return;
      }

      if (perk.type === 'singularity') {
        let found = 0;
        for (let i = 0; i < this.food.length; i++) {
          const o = this.food[i];
          if (o.kind === 'gold' || o.kind === 'pickup') continue;
          const dx = s.x - o.x, dy = s.y - o.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > perk.radius * perk.radius || d2 < 64) continue;
          const d = Math.sqrt(d2);
          const f = (1 - d / perk.radius) * rand(120, 230);
          o.vx += (dx / d) * f;
          o.vy += (dy / d) * f;
          found++;
        }
        if (!found) return;
        s.effectCd = perk.cooldown;
        s.singularityTimer = perk.duration;
        let slowed = 0;
        for (let i = 0; i < this.snakes.length; i++) {
          const o = this.snakes[i];
          if (!o.alive || o === s) continue;
          if (dist2(s.x, s.y, o.x, o.y) > perk.radius * perk.radius) continue;
          o.slowTimer = Math.max(o.slowTimer, perk.duration);
          slowed++;
          if (slowed >= 4) break;
        }
        this.shockwaves.push({
          x: s.x, y: s.y, t: 0, life: 0.7, max: perk.radius * 0.78, color: eff.glow, thin: true
        });
        this._addFloat(s.x, s.y - s.radius * 2.1, perk.name, eff.color, isPlayer || nearPlayer);
        if ((isPlayer || nearPlayer) && this.audio && this.audio.powerActivate) this.audio.powerActivate('nova');
        if (this.callbacks && (isPlayer || nearPlayer) && this.callbacks.onEffectAbility) {
          this.callbacks.onEffectAbility(perk, s);
        }
      }
    }

    /* ═══════════════════════ HASH / COLISIONES ═══════════════════════ */
    _buildHash() {
      for (const arr of this.hash.values()) arr.length = 0;
      for (let si = 0; si < this.snakes.length; si++) {
        const s = this.snakes[si];
        if (!s.alive) continue;
        const pts = s.points;
        for (let i = 5; i < pts.length; i += 2) {
          const p = pts[i];
          const key = (Math.floor(p.x / CELL) + 500) * 2000 + (Math.floor(p.y / CELL) + 500);
          let arr = this.hash.get(key);
          if (!arr) { arr = []; this.hash.set(key, arr); }
          arr.push(p);
        }
      }
    }

    _headBodyHit(s) {
      if (!s.alive) return null;
      const sRadius = s.radius * (s.radiusScale || 1);
      const cx = Math.floor(s.x / CELL);
      const cy = Math.floor(s.y / CELL);
      const reach = sRadius + 34;
      const cells = Math.ceil(reach / CELL) + 1;
      for (let ox = -cells; ox <= cells; ox++) {
        for (let oy = -cells; oy <= cells; oy++) {
          const arr = this.hash.get((cx + ox + 500) * 2000 + (cy + oy + 500));
          if (!arr) continue;
          for (let i = 0; i < arr.length; i++) {
            const p = arr[i];
            const owner = p.owner;
            if (!owner || owner === s || !owner.alive) continue;
            const threshold = sRadius * 0.57 + owner.radius * (owner.radiusScale || 1) * 0.82;
            const dx = p.x - s.x, dy = p.y - s.y;
            if (dx * dx + dy * dy < threshold * threshold) return owner;
          }
        }
      }
      return null;
    }

    _isPhantom(s) {
      return !!(s && s.isPlayer && this.powerStateId === 'phantom' && this.powerTimer > 0);
    }

    _handleCollisions() {
      /* Cabeza con cabeza */
      for (let i = 0; i < this.snakes.length; i++) {
        const a = this.snakes[i];
        if (!a.alive) continue;
        for (let j = i + 1; j < this.snakes.length; j++) {
          const b = this.snakes[j];
          if (!b.alive) continue;
          if ((a.isPlayer && a.spawnProtect > 0) || (b.isPlayer && b.spawnProtect > 0)) continue;
          const ra = a.radius * (a.radiusScale || 1);
          const rb = b.radius * (b.radiusScale || 1);
          const rr = (ra + rb) * 0.56;
          if (dist2(a.x, a.y, b.x, b.y) >= rr * rr) continue;
          const aSafe = this._isInvulnerable(a);
          const bSafe = this._isInvulnerable(b);
          if (aSafe && bSafe) continue;
          if (aSafe) {
            this._killSnake(b, a, 'head');
          } else if (bSafe) {
            this._killSnake(a, b, 'head');
          } else {
            this._killSnake(a, b, 'head');
            this._killSnake(b, a, 'head');
          }
        }
      }

      /* Cabeza contra cuerpo */
      for (let i = 0; i < this.snakes.length; i++) {
        const s = this.snakes[i];
        if (!s.alive) continue;
        if (this._isInvulnerable(s)) continue;
        const owner = this._headBodyHit(s);
        if (owner && owner.alive && s.alive) {
          if (s.spawnProtect > 0 || owner.spawnProtect > 0) continue;
          if (this._isPhantom(owner)) continue;
          this._killSnake(s, owner, 'body');
        }
      }

      /* Borde del anillo */
      for (let i = 0; i < this.snakes.length; i++) {
        const s = this.snakes[i];
        if (!s.alive || s.spawnProtect > 0) continue;
        const d = Math.hypot(s.x, s.y);
        if (d > WORLD_R + 12) {
          if (s.shieldTimer > 0 || s.invulnTimer > 0) {
            const k = (WORLD_R - 40) / d;
            s.x *= k;
            s.y *= k;
          } else {
            this._killSnake(s, null, 'border');
          }
        }
      }
    }

    _killSnake(s, killer, reason) {
      if (!s.alive) return;
      s.alive = false;

      if (s.isPlayer) {
        this.finalMass = s.mass;
        this.deathPos.x = s.x;
        this.deathPos.y = s.y;
        this.runStats.killedBy = killer ? killer.name : '';
        if (reason === 'border') {
          this.runStats.cause = 'EL ANILLO ORBITAL';
        } else if (reason === 'head') {
          this.runStats.cause = killer ? 'DUELO CON ' + killer.name : 'DUELO DE CABEZAS';
        } else if (reason === 'monster') {
          this.runStats.cause = 'DEVORADO POR EL MONSTRUO';
        } else if (reason === 'bolt') {
          this.runStats.cause = 'ELECTROCUTADO';
        } else {
          this.runStats.cause = killer ? 'IMPACTO CONTRA ' + killer.name : 'EL VACÍO';
        }
        this._cancelMonster();
        this.mode = 'dying';
        this.deathTimer = 1.55;
        this.shake = 30;
        this.audio.death();
        this.audio.setBoost(false);
        this.boostAudioOn = false;
        this._explode(s, 78);
        this._spawnLoot(s);
        this._addFloat(s.x, s.y, 'MASA LIBERADA', '#ff7ca8', true);
        if (this.callbacks && this.callbacks.onPlayerDeathStart) this.callbacks.onPlayerDeathStart();
        if (this.player === s) this.player = s; /* conservar referencia hasta finalizar */
        return;
      }

      /* IA eliminada */
      const near = this.player ? dist2(s.x, s.y, this.player.x, this.player.y) < 1100 * 1100 : false;
      if (killer && killer.isPlayer) {
        this.runStats.kills++;
        if (reason !== 'nova') this._addFloat(s.x, s.y, 'BAJA', '#ff6ad5', true);
        if (near && reason !== 'nova') {
          this.audio.kill(this._panFor(s.x));
          this.shake = 9;
        }
        if (this.callbacks && this.callbacks.onKill) this.callbacks.onKill(s);
      } else if (near) {
        this.audio.kill(this._panFor(s.x) * 0.5);
        this.shake = 5;
      }
      this._explode(s, reason === 'nova' ? 66 : 46);
      this._spawnLoot(s);
      this.respawns.push({ t: rand(2.2, 5.6) });
    }

    _explode(s, count) {
      const cols = s.skin.colors;
      const head = s.points.length ? s.points[Math.floor(s.points.length * 0.5)] : s;
      for (let i = 0; i < count; i++) {
        const c = cols[randInt(0, cols.length - 1)];
        const a = rand(0, TAU), sp = rand(30, 230);
        this._spawnParticles(s.x, s.y, c, 1, sp * 0.3, sp, 0.4, 1.2, 1.4, 3.8);
      }
      this._spawnParticles(s.x, s.y, '#ffffff', Math.min(24, count / 3), 20, 90, 0.2, 0.6, 1, 2.4);
      this._addFloat(head.x, head.y, '+' + Math.floor(s.mass), s.skin.accent, false);
    }

    _spawnLoot(s) {
      const colors = s.skin.colors;
      const total = Math.max(8, s.mass * 0.72);
      const count = clamp(Math.round(s.mass * 0.24), 8, 72);
      const pts = [{ x: s.x, y: s.y }].concat(s.points);
      const value = total / count;
      const radius = 3 + Math.min(4.4, Math.sqrt(value) * 0.95);
      for (let i = 0; i < count; i++) {
        const base = pts[Math.min(pts.length - 1, Math.floor((i / count) * (pts.length - 1)))];
        const a = rand(0, TAU);
        const d = rand(0, s.radius * 1.2 + 14);
        this._addFood({
          x: base.x + Math.cos(a) * d,
          y: base.y + Math.sin(a) * d,
          r: radius * rand(0.85, 1.15),
          value,
          color: colors[randInt(0, colors.length - 1)],
          kind: 'loot',
          vx: Math.cos(a) * rand(10, 85),
          vy: Math.sin(a) * rand(10, 85),
          phase: rand(0, TAU),
          life: 0
        });
      }
    }

    _cleanupDead() {
      for (let i = this.snakes.length - 1; i >= 0; i--) {
        if (!this.snakes[i].alive) this.snakes.splice(i, 1);
      }
      if (this.player && !this.player.alive && this.mode !== 'dying') {
        /* la referencia se conserva hasta finalizar la muerte */
      }
    }

    _updateRespawns(dt) {
      for (let i = this.respawns.length - 1; i >= 0; i--) {
        const r = this.respawns[i];
        r.t -= dt;
        if (r.t <= 0) {
          this.respawns.splice(i, 1);
          if (this.snakes.length < AI_COUNT + (this.player && this.player.alive ? 1 : 0)) {
            const mass = 22 + Math.pow(Math.random(), 1.8) * 190;
            this._spawnAI(mass);
          }
        }
      }
    }

    /* ═══════════════════════ COMIDA ═══════════════════════ */
    _createFood(n) {
      this.clusters = [];
      for (let c = 0; c < 34; c++) {
        const a = rand(0, TAU);
        const r = Math.sqrt(Math.random()) * (WORLD_R - 420);
        this.clusters.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
      }
      for (let i = 0; i < n; i++) this._spawnRegularFood(true);
    }

    _foodPosition() {
      let x, y;
      if (Math.random() < 0.62 && this.clusters && this.clusters.length) {
        const c = this.clusters[randInt(0, this.clusters.length - 1)];
        const a = rand(0, TAU);
        const d = Math.pow(Math.random(), 0.7) * rand(50, 210);
        x = c.x + Math.cos(a) * d;
        y = c.y + Math.sin(a) * d;
      } else {
        const a = rand(0, TAU);
        const r = Math.sqrt(Math.random()) * (WORLD_R - 130);
        x = Math.cos(a) * r;
        y = Math.sin(a) * r;
      }
      const dc = Math.hypot(x, y);
      if (dc > WORLD_R - 110) {
        x *= (WORLD_R - 160) / dc;
        y *= (WORLD_R - 160) / dc;
      }
      return { x, y };
    }

    _spawnRegularFood(initial) {
      const p = this._foodPosition();
      const roll = Math.random();
      let value, r;
      if (roll < 0.11) { value = 4; r = rand(4.4, 5.4); }
      else { value = 1; r = rand(2.3, 3.5); }
      this._addFood({
        x: p.x, y: p.y, r, value,
        color: FOOD_COLORS[randInt(0, FOOD_COLORS.length - 1)],
        kind: 'small', vx: 0, vy: 0,
        phase: rand(0, TAU), life: 0, initial: !!initial
      });
      this.regularFood++;
    }

    _addFood(o) {
      if (this.food.length > 2800) {
        for (let i = 0; i < this.food.length; i++) {
          if (this.food[i].kind === 'loot') { this.food.splice(i, 1); break; }
        }
      }
      this.food.push(o);
      return o;
    }

    _updateFood(dt) {
      const player = this.player && this.player.alive ? this.player : null;
      const heads = this._headList;
      heads.length = 0;
      const pullers = this._pullers || (this._pullers = []);
      pullers.length = 0;
      for (let i = 0; i < this.snakes.length; i++) {
        const s = this.snakes[i];
        if (!s.alive) continue;
        heads.push(s);
        if (s.powerMagnet || s.magnetTimer > 0 || s.singularityTimer > 0) pullers.push(s);
      }

      let deficit = 0;
      for (let i = this.food.length - 1; i >= 0; i--) {
        const o = this.food[i];

        if (o.kind === 'pickup') {
          o.phase += dt * 2.2;
          o.ttl -= dt;
          if (o.ttl <= 0) {
            this.food.splice(i, 1);
            this.pickupCount = Math.max(0, this.pickupCount - 1);
            continue;
          }
          if (pullers.length) this._pullFood(o, dt, pullers);
          let eater = null;
          for (let h = 0; h < heads.length; h++) {
            const s = heads[h];
            const rr = s.radius * (s.radiusScale || 1) * 0.92 + o.r + 8;
            if (dist2(o.x, o.y, s.x, s.y) < rr * rr) { eater = s; break; }
          }
          if (eater) {
            this._consumePickup(eater, o);
            this.food.splice(i, 1);
            this.pickupCount = Math.max(0, this.pickupCount - 1);
          }
          continue;
        }

        if (o.kind === 'gold') {
          o.phase += dt * 1.7;
          if (pullers.length) this._pullFood(o, dt, pullers);
          let eater = null;
          for (let h = 0; h < heads.length; h++) {
            const s = heads[h];
            const rr = s.radius * (s.radiusScale || 1) * 0.92 + o.r + 6;
            if (dist2(o.x, o.y, s.x, s.y) < rr * rr) { eater = s; break; }
          }
          if (eater) {
            this._consume(eater, o);
            this.food.splice(i, 1);
            this.goldOrb = null;
            this.goldTimer = rand(19, 32);
          }
          continue;
        }

        if (o.vx || o.vy) {
          o.x += o.vx * dt;
          o.y += o.vy * dt;
          const damp = Math.exp(-dt * 4.6);
          o.vx *= damp;
          o.vy *= damp;
          if (Math.abs(o.vx) < 0.4) o.vx = 0;
          if (Math.abs(o.vy) < 0.4) o.vy = 0;
          const dc = Math.hypot(o.x, o.y);
          if (dc > WORLD_R - 60) {
            o.x *= (WORLD_R - 60) / dc;
            o.y *= (WORLD_R - 60) / dc;
            o.vx *= -0.35;
            o.vy *= -0.35;
          }
        }

        o.phase += dt * (2.4 + (o.r % 1));
        o.life += dt;

        if (pullers.length) this._pullFood(o, dt, pullers);

        let eater = null;
        for (let h = 0; h < heads.length; h++) {
          const s = heads[h];
          const rr = s.radius * (s.radiusScale || 1) * 0.92 + o.r + 6;
          if (dist2(o.x, o.y, s.x, s.y) < rr * rr) { eater = s; break; }
        }

        if (eater) {
          this._consume(eater, o);
          this.food.splice(i, 1);
          if (o.kind === 'small') deficit++;
        }
      }

      if (deficit) this.foodDeficit += deficit;
      const need = FOOD_TARGET - this.regularFood;
      const spawnN = Math.min(5, Math.max(0, need));
      for (let i = 0; i < spawnN; i++) this._spawnRegularFood(false);
      this.foodDeficit = 0;
    }

    _pullFood(o, dt, pullers) {
      for (let p = 0; p < pullers.length; p++) {
        const s = pullers[p];
        let mult = 1;
        let strength = 1;
        if (s.powerMagnet && this.power) {
          mult = this.power.magnetRadius || 2.3;
          strength = this.power.magnetPull || 1.45;
        }
        if (s.magnetTimer > 0) {
          mult = Math.max(mult, 2.9);
          strength = Math.max(strength, 1.7);
        }
        if (s.singularityTimer > 0) {
          mult = Math.max(mult, 1.5);
          strength = Math.max(strength, 2.6);
        }
        const pR = s.radius * (s.radiusScale || 1);
        const pullR = (pR * 4.4 + o.r * 2.2) * mult;
        const dx = s.x - o.x, dy = s.y - o.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= pullR * pullR || d2 < 64) continue;
        const d = Math.sqrt(d2);
        const f = (1 - d / pullR) * 620 * strength * dt;
        o.x += (dx / d) * f;
        o.y += (dy / d) * f;
      }
    }

    _consume(s, o) {
      const value = o.value;
      s.mass = Math.min(s.isPlayer ? 100000 : MAX_AI_MASS, s.mass + value);
      s.growPulse = 1;
      if (o.kind === 'small') this.regularFood = Math.max(0, this.regularFood - 1);

      if (s.isPlayer) {
        this.runStats.massEaten += value;
        if (this.comboTimer > 0) this.combo++;
        else this.combo = 1;
        this.comboTimer = 1.25;
        this.comboMax = Math.max(this.comboMax, this.combo);
        this._spawnParticles(o.x, o.y, o.color, 4, 15, 75, 0.25, 0.6, 1.2, 2.8);
        this._addFloat(o.x, o.y, '+' + (value >= 1 ? Math.floor(value) : value.toFixed(1)), o.color, value >= 8);
        const pan = this._panFor(o.x);
        if (o.kind === 'gold') this.audio.bigEat(pan);
        else this.audio.eat(Math.min(15, this.combo - 1), pan);
        if (this.callbacks && this.callbacks.onEat) this.callbacks.onEat(value, this.combo, o.kind);
      } else {
        this._spawnParticles(o.x, o.y, o.color, 2, 10, 40, 0.2, 0.45, 0.8, 1.8);
      }
    }

    _updateGold(dt) {
      if (this.goldOrb && !this.food.includes(this.goldOrb)) this.goldOrb = null;
      if (this.goldOrb) return;
      this.goldTimer -= dt;
      if (this.goldTimer <= 0) {
        const p = this._foodPosition();
        const g = {
          x: p.x, y: p.y, r: 8.2, value: 26, color: '#ffd45e',
          kind: 'gold', vx: 0, vy: 0, phase: rand(0, TAU), life: 0
        };
        this._addFood(g);
        this.goldOrb = g;
        this.goldTimer = 999;
        if (this.callbacks && this.callbacks.onGoldSpawn) this.callbacks.onGoldSpawn(g);
      }
    }

    /* ═══════════════════════ PREMIOS ═══════════════════════ */
    _updatePickups(dt) {
      if (this.mode !== 'playing' || !this.player || !this.player.alive) return;
      if (this.pickupCount >= PICKUP_MAX) {
        this.pickupTimer = Math.max(2, this.pickupTimer);
        return;
      }
      this.pickupTimer -= dt;
      if (this.pickupTimer > 0) return;
      this._spawnPickup(false);
      const pace = clamp(22 - this.runTime / 55, 11, 22);
      this.pickupTimer = rand(pace * 0.8, pace * 1.35);
    }

    _spawnPickup(nearPlayer) {
      if (this.pickupCount >= PICKUP_MAX) return null;
      const list = global.WZ && WZ.PICKUPS ? WZ.PICKUPS : null;
      if (!list || !list.length) return null;
      const roll = Math.random();
      let def;
      if (roll < 0.31) def = WZ.getPickup('shield');
      else if (roll < 0.58) def = WZ.getPickup('magnet');
      else if (roll < 0.82) def = WZ.getPickup('frenzy');
      else def = WZ.getPickup('bolt');
      if (!def) return null;

      let x, y;
      const p = this.player && this.player.alive ? this.player : null;
      if (p) {
        const a = rand(0, TAU);
        const d = nearPlayer ? rand(170, 330) : rand(280, 720);
        x = p.x + Math.cos(a) * d;
        y = p.y + Math.sin(a) * d;
        const dc = Math.hypot(x, y);
        if (dc > WORLD_R - 180) {
          const k = (WORLD_R - 180) / dc;
          x *= k;
          y *= k;
        }
      } else {
        const pos = this._foodPosition();
        x = pos.x;
        y = pos.y;
      }
      const o = this._addFood({
        x, y, r: 11, value: 0.6, color: def.color, kind: 'pickup', pickupId: def.id,
        vx: 0, vy: 0, phase: rand(0, TAU), life: 0, ttl: 42, bob: rand(0, TAU)
      });
      this.pickupCount++;
      if (this._inView(x, y, 120)) this._addFloat(x, y - 26, 'PREMIO', def.color, true);
      if (this.callbacks && this.callbacks.onPickupSpawn) this.callbacks.onPickupSpawn(def, o);
      return o;
    }

    _consumePickup(s, o) {
      const def = global.WZ && WZ.getPickup ? WZ.getPickup(o.pickupId) : null;
      if (!def) return;
      const nearPlayer = this.player ? dist2(s.x, s.y, this.player.x, this.player.y) < 1200 * 1200 : false;
      this._spawnParticles(o.x, o.y, def.glow, 30, 40, 220, 0.3, 0.9, 1.2, 3.4, 2.4);
      this.shockwaves.push({
        x: o.x, y: o.y, t: 0, life: 0.55, max: 120, color: def.glow, thin: true
      });

      if (def.id === 'shield') {
        s.shieldTimer = Math.max(s.shieldTimer, def.duration);
      } else if (def.id === 'magnet') {
        s.magnetTimer = Math.max(s.magnetTimer, def.duration);
      } else if (def.id === 'frenzy') {
        s.frenzyTimer = Math.max(s.frenzyTimer, def.duration);
        s.mass = Math.min(s.isPlayer ? 100000 : MAX_AI_MASS, s.mass + 2);
      } else if (def.id === 'bolt') {
        this._fireBolt(s, def);
      }

      if (s.isPlayer) {
        this.runStats.pickups++;
        this._addFloat(o.x, o.y - 20, def.name, def.color, true);
        if (this.audio && this.audio.pickup) this.audio.pickup(this._panFor(o.x));
        if (this.callbacks && this.callbacks.onPickup) this.callbacks.onPickup(def);
      } else if (nearPlayer && this.audio && this.audio.pickup) {
        this.audio.pickup(this._panFor(o.x) * 0.55);
      }
    }

    _fireBolt(s, def) {
      const target = this._nearestRival(s, 1050, false);
      if (!target) {
        if (s.isPlayer) {
          s.mass = Math.min(100000, s.mass + 4);
          this._addFloat(s.x, s.y - s.radius * 2, 'RAYO SIN OBJETIVO', def.color, true);
        }
        return;
      }
      const dx = target.x - s.x, dy = target.y - s.y;
      this.beams.push({
        x1: s.x, y1: s.y, x2: target.x, y2: target.y,
        t: 0, life: 0.32, color: def.color, width: 3.2, seed: rand(0, TAU)
      });
      this._spawnParticles(target.x, target.y, def.glow, 34, 40, 240, 0.3, 0.9, 1.2, 3.6, 2.2);
      if (this._isInvulnerable(target)) {
        target.shieldTimer = 0;
        target.invulnTimer = 0;
        this._stunSnake(target, 0.8);
        this._addFloat(target.x, target.y - target.radius * 2, 'ESCUDO ROTO', '#ffffff', true);
      } else {
        this._killSnake(target, s, 'bolt');
      }
      this.shake = Math.max(this.shake, s.isPlayer ? 12 : 4);
    }

    _updateBeams(dt) {
      for (let i = this.beams.length - 1; i >= 0; i--) {
        const b = this.beams[i];
        b.t += dt;
        if (b.t >= b.life) this.beams.splice(i, 1);
      }
    }

    _drawBeams(ctx) {
      if (!this.beams.length) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const b of this.beams) {
        const k = clamp(1 - b.t / b.life, 0, 1);
        const dx = b.x2 - b.x1, dy = b.y2 - b.y1;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;
        ctx.globalAlpha = k;
        ctx.strokeStyle = b.color;
        ctx.lineWidth = b.width * (0.4 + k * 0.8);
        ctx.beginPath();
        ctx.moveTo(b.x1, b.y1);
        const segs = 6;
        for (let i = 1; i <= segs; i++) {
          const t = i / segs;
          const jag = i === segs ? 0 : Math.sin(b.seed + i * 2.7 + b.t * 34) * 14 * k;
          ctx.lineTo(b.x1 + dx * t + nx * jag, b.y1 + dy * t + ny * jag);
        }
        ctx.stroke();
        ctx.globalAlpha = k * 0.4;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(0.8, b.width * 0.35);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    /* ═══════════════════════ SUPERVIVENCIA Y MONSTRUO ═══════════════════════ */
    _updateSurvival(dt) {
      if (!this.player || !this.player.alive) return;
      this.survivalTimer -= dt;
      if (this.survivalTimer > 0) return;
      this.survivalTimer += SURVIVAL_STEP;
      this.survivalTier++;
      const bonus = 10 + this.survivalTier * 6;
      this.runStats.survivalBonus += bonus;
      const p = this.player;
      this._addFloat(p.x, p.y - p.radius * 2.7, 'SUPERVIVENCIA +' + bonus, '#b9ff3d', true);
      this._rewardBurst(p.x, p.y, 8, 2.4, ['#b9ff3d', '#7df9ff', '#ffd45e']);
      if (this.audio && this.audio.coin) this.audio.coin();
      if (this.survivalTier % 2 === 0 && this.pickupCount < PICKUP_MAX) this._spawnPickup(true);
      if (this.callbacks && this.callbacks.onSurvival) this.callbacks.onSurvival(this.survivalTier, bonus);
    }

    _rewardBurst(x, y, count, value, colors) {
      const palette = colors && colors.length ? colors : ['#ffd45e'];
      for (let i = 0; i < count; i++) {
        const a = rand(0, TAU);
        const d = rand(20, 120);
        this._addFood({
          x: x + Math.cos(a) * d,
          y: y + Math.sin(a) * d,
          r: 3 + Math.min(3, Math.sqrt(value) * 0.9),
          value,
          color: palette[randInt(0, palette.length - 1)],
          kind: 'loot',
          vx: Math.cos(a) * rand(15, 70),
          vy: Math.sin(a) * rand(15, 70),
          phase: rand(0, TAU),
          life: 0
        });
      }
    }

    _updateMonster(dt) {
      const ev = this.monsterEvent;
      if (!this.player || !this.player.alive || this.mode !== 'playing') {
        if (this.monster) this._cancelMonster();
        return;
      }
      if (ev.state === 'idle') {
        ev.nextIn -= dt;
        if (ev.nextIn <= 0) this._startMonsterWarning();
        return;
      }
      if (ev.state === 'warning') {
        ev.timer -= dt;
        if (ev.timer <= 0) this._spawnMonster();
        return;
      }
      if (ev.state === 'hunting') {
        ev.timer -= dt;
        this._steerMonster(dt);
        if (ev.state !== 'hunting' || this.mode !== 'playing' || !this.player || !this.player.alive) return;
        if (ev.timer <= 0) this._endMonster(true);
        return;
      }
      if (ev.state === 'retreat') {
        ev.timer -= dt;
        if (this.monster) {
          const m = this.monster;
          m.x += Math.cos(m.angle) * m.speed * dt;
          m.y += Math.sin(m.angle) * m.speed * dt;
          m.phase += dt * 2.4;
          m.radius = Math.max(8, m.radius - dt * 11);
        }
        if (ev.timer <= 0) this._finishMonster();
      }
    }

    _startMonsterWarning() {
      const ev = this.monsterEvent;
      const p = this.player;
      ev.tier++;
      let x = 0, y = 0;
      for (let tries = 0; tries < 22; tries++) {
        const a = rand(0, TAU);
        const d = rand(900, 1180);
        x = p.x + Math.cos(a) * d;
        y = p.y + Math.sin(a) * d;
        const dc = Math.hypot(x, y);
        if (dc > WORLD_R - 300) {
          const k = (WORLD_R - 300) / dc;
          x *= k;
          y *= k;
        }
        if (dist2(x, y, p.x, p.y) > 680 * 680) break;
      }
      if (dist2(x, y, p.x, p.y) < 680 * 680) {
        /* Jugador pegado al borde: aparecer hacia el centro. */
        const a = Math.atan2(-p.y, -p.x);
        x = p.x + Math.cos(a) * 900;
        y = p.y + Math.sin(a) * 900;
        const dc = Math.hypot(x, y);
        if (dc > WORLD_R - 260) {
          const k = (WORLD_R - 260) / dc;
          x *= k;
          y *= k;
        }
      }
      ev.warnX = x;
      ev.warnY = y;
      ev.state = 'warning';
      ev.timer = 7;
      ev.total = 7;
      if (this.audio && this.audio.monsterWarning) this.audio.monsterWarning();
      if (this.callbacks && this.callbacks.onMonsterWarning) {
        this.callbacks.onMonsterWarning(ev.timer, ev.tier);
      }
    }

    _spawnMonster() {
      const ev = this.monsterEvent;
      const p = this.player;
      const tier = ev.tier;
      const duration = clamp(16 + tier * 1.8, 16, 26);
      this.monster = {
        x: ev.warnX,
        y: ev.warnY,
        angle: Math.atan2(p.y - ev.warnY, p.x - ev.warnX),
        baseSpeed: clamp(188 + tier * 6, 188, 248),
        turnRate: clamp(2.05 + tier * 0.07, 2.05, 2.75),
        radius: 42 + Math.min(24, tier * 2.4),
        speed: 0,
        phase: rand(0, TAU),
        stunTimer: 0,
        lungeCd: rand(3.4, 5.2),
        lungeTelegraph: 0,
        lungeTimer: 0,
        lungeAim: 0,
        fade: 1,
        feed: 0
      };
      ev.state = 'hunting';
      ev.timer = duration;
      ev.total = duration;
      this.shake = Math.max(this.shake, 24);
      this._spawnParticles(this.monster.x, this.monster.y, '#ff4f70', 60, 60, 320, 0.4, 1.1, 1.4, 4, 2.2);
      if (this.audio && this.audio.monsterRoar) this.audio.monsterRoar();
      if (this.callbacks && this.callbacks.onMonsterSpawn) this.callbacks.onMonsterSpawn(duration, tier);
    }

    _steerMonster(dt) {
      const m = this.monster;
      if (!m) return;
      const p = this.player;

      if (m.stunTimer > 0) {
        m.stunTimer = Math.max(0, m.stunTimer - dt);
        if (Math.random() < dt * 7) {
          this._spawnParticles(m.x + rand(-m.radius, m.radius), m.y + rand(-m.radius, m.radius), '#fff38a', 1, 20, 90, 0.2, 0.5, 1, 2.4, 2.6);
        }
        return;
      }

      const dist = Math.hypot(p.x - m.x, p.y - m.y);
      let desired;
      if (m.lungeTimer > 0) {
        m.lungeTimer -= dt;
        desired = m.lungeAim;
      } else if (m.lungeTelegraph > 0) {
        m.lungeTelegraph -= dt;
        desired = m.lungeAim;
        if (m.lungeTelegraph <= 0) {
          m.lungeTimer = 0.52;
          m.speed = m.baseSpeed;
        }
      } else {
        m.lungeCd -= dt;
        const lead = clamp(dist / 900, 0.12, 0.42);
        const tx = p.x + Math.cos(p.angle) * p.speed * lead;
        const ty = p.y + Math.sin(p.angle) * p.speed * lead;
        desired = Math.atan2(ty - m.y, tx - m.x);
        if (m.lungeCd <= 0 && dist > 190 && dist < 980) {
          m.lungeCd = rand(4.8, 7.2);
          m.lungeTelegraph = 0.82;
          m.lungeAim = Math.atan2(p.y + Math.sin(p.angle) * p.speed * 0.22 - m.y, p.x + Math.cos(p.angle) * p.speed * 0.22 - m.x);
        }
      }

      let speedMul = 1;
      if (m.lungeTelegraph > 0) speedMul = 0.42;
      else if (m.lungeTimer > 0) speedMul = 2.15;
      else if (dist > 1550) speedMul = 1.16;
      m.speed = m.baseSpeed * speedMul;

      const turn = m.lungeTimer > 0 ? 0.5 : (m.lungeTelegraph > 0 ? 3.4 : m.turnRate);
      m.angle += clamp(angDiff(m.angle, desired), -turn * dt, turn * dt);
      m.x += Math.cos(m.angle) * m.speed * dt;
      m.y += Math.sin(m.angle) * m.speed * dt;
      m.phase += dt * (m.lungeTimer > 0 ? 9 : 3.2);

      const dc = Math.hypot(m.x, m.y);
      if (dc > WORLD_R - 70) {
        const k = (WORLD_R - 70) / dc;
        m.x *= k;
        m.y *= k;
      }

      /* Contacto con el jugador. */
      if (p.alive) {
        const hitR = m.radius + p.radius * (p.radiusScale || 1) * 0.9;
        if (dist2(m.x, m.y, p.x, p.y) < hitR * hitR) {
          if (p.spawnProtect > 0) {
            /* gracia de aparición */
          } else if (p.shieldTimer > 0 || p.invulnTimer > 0) {
            p.shieldTimer = 0;
            p.invulnTimer = 0;
            m.stunTimer = 2.2;
            const a = Math.atan2(m.y - p.y, m.x - p.x);
            m.x += Math.cos(a) * 230;
            m.y += Math.sin(a) * 230;
            m.lungeTelegraph = 0;
            m.lungeTimer = 0;
            this.shake = Math.max(this.shake, 18);
            this._spawnParticles(p.x, p.y, '#7df9ff', 40, 50, 280, 0.3, 0.9, 1.4, 3.6, 2.1);
            this._addFloat(p.x, p.y - p.radius * 2.4, 'ESCUDO ROTO', '#ffffff', true);
            if (this.audio && this.audio.zap) this.audio.zap(0);
          } else {
            this._killSnake(p, null, 'monster');
            m.feed = 1;
            return;
          }
        }
      }

      /* El monstruo también devora serpientes rivales. */
      for (let i = 0; i < this.snakes.length; i++) {
        const s = this.snakes[i];
        if (!s.alive || s.isPlayer || s.spawnProtect > 0) continue;
        const rr = m.radius + s.radius * (s.radiusScale || 1) * 0.8;
        if (dist2(m.x, m.y, s.x, s.y) < rr * rr) {
          if (this._isInvulnerable(s)) {
            s.shieldTimer = 0;
            s.invulnTimer = 0;
            m.stunTimer = Math.max(m.stunTimer, 1.2);
          } else {
            this._killSnake(s, null, 'monster');
            m.feed = 1;
            m.radius = Math.min(84, m.radius + 0.35);
          }
        }
      }
    }

    _endMonster(escaped) {
      const ev = this.monsterEvent;
      ev.state = 'retreat';
      ev.timer = 2.4;
      ev.total = 2.4;
      if (this.monster) {
        const m = this.monster;
        const p = this.player;
        m.angle = Math.atan2(m.y - p.y, m.x - p.x);
        m.speed = 300;
        m.lungeTelegraph = 0;
        m.lungeTimer = 0;
      }
      if (!escaped) return;
      const bonus = 50 + ev.tier * 20;
      this.runStats.escapes++;
      this.runStats.survivalBonus += bonus;
      this._rewardBurst(this.player.x, this.player.y, 14, 3.2, ['#ffd45e', '#ff9a3d', '#7df9ff', '#b9ff3d']);
      if (this.pickupCount < PICKUP_MAX) this._spawnPickup(true);
      this._addFloat(this.player.x, this.player.y - this.player.radius * 2.8, 'ESCAPASTE +' + bonus, '#ffd45e', true);
      this.shake = Math.max(this.shake, 12);
      this._spawnParticles(this.player.x, this.player.y, '#ffd45e', 30, 40, 220, 0.4, 1, 1.2, 3.4, 2);
      if (this.audio && this.audio.monsterEscape) this.audio.monsterEscape();
      if (this.callbacks && this.callbacks.onMonsterEscape) this.callbacks.onMonsterEscape(bonus, ev.tier);
    }

    _finishMonster() {
      const ev = this.monsterEvent;
      this.monster = null;
      ev.state = 'idle';
      ev.timer = 0;
      ev.total = 0;
      ev.warnX = 0;
      ev.warnY = 0;
      ev.nextIn = Math.max(34, rand(48, 78) - Math.min(12, this.runTime / 45));
    }

    _cancelMonster() {
      this.monster = null;
      const ev = this.monsterEvent;
      ev.state = 'idle';
      ev.timer = 0;
      ev.total = 0;
      ev.nextIn = rand(40, 62);
    }

    getThreatState() {
      const ev = this.monsterEvent;
      if (!ev || ev.state === 'idle' || !this.player) return null;
      let distance = 0;
      if (this.monster) {
        distance = Math.hypot(this.monster.x - this.player.x, this.monster.y - this.player.y);
      } else {
        distance = Math.hypot(ev.warnX - this.player.x, ev.warnY - this.player.y);
      }
      return {
        state: ev.state,
        timer: ev.timer,
        total: ev.total,
        distance,
        tier: ev.tier,
        x: this.monster ? this.monster.x : ev.warnX,
        y: this.monster ? this.monster.y : ev.warnY
      };
    }

    getBuffs() {
      const p = this.player;
      const out = [];
      if (!p || !p.alive) return out;
      if (p.shieldTimer > 0) out.push({ id: 'shield', name: 'INMUNIDAD', color: '#7df9ff', timer: p.shieldTimer, total: 6.5 });
      if (p.magnetTimer > 0) out.push({ id: 'magnet', name: 'MAGNETISMO', color: '#57ff9a', timer: p.magnetTimer, total: 10 });
      if (p.frenzyTimer > 0) out.push({ id: 'frenzy', name: 'FURIA', color: '#ff9a3d', timer: p.frenzyTimer, total: 7 });
      if (p.prismTimer > 0) out.push({ id: 'prism', name: 'PRISMA', color: '#ff6ad5', timer: p.prismTimer, total: 1.35 });
      if (p.slowTimer > 0) out.push({ id: 'slow', name: 'RALENTIZADO', color: '#8b5cff', timer: p.slowTimer, total: 1.9 });
      if (p.stunTimer > 0) out.push({ id: 'stun', name: 'ATURDIDO', color: '#fff38a', timer: p.stunTimer, total: 1 });
      const eff = p.effect || this.effect;
      if (eff && eff.perk) {
        out.push({
          id: 'effect', name: eff.name, color: eff.color,
          timer: p.effectCd, total: eff.perk.cooldown,
          ready: p.effectCd <= 0, effect: true
        });
      }
      if ((this.mode === 'playing' || this.mode === 'paused') && this.survivalTimer > 0 && out.length < 4) {
        out.push({ id: 'bonus', name: 'BONUS', color: '#b9ff3d', timer: this.survivalTimer, total: SURVIVAL_STEP });
      }
      return out;
    }

    _drawMonster(ctx) {
      const m = this.monster;
      const ev = this.monsterEvent;
      const t = this.renderTime;
      if (!m) {
        if (ev.state === 'warning') {
          const pulse = 0.55 + 0.45 * Math.sin(t * 6);
          const R = 76 + pulse * 26;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = 'rgba(255,79,112,' + (0.35 + pulse * 0.4) + ')';
          ctx.lineWidth = 2.4;
          ctx.setLineDash([10, 12]);
          ctx.lineDashOffset = -t * 40;
          ctx.beginPath(); ctx.arc(ev.warnX, ev.warnY, R, 0, TAU); ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 0.35 + pulse * 0.3;
          const gs = R * 3.2;
          ctx.drawImage(this._glowSprite('#ff4f70'), ev.warnX - gs / 2, ev.warnY - gs / 2, gs, gs);
          ctx.globalAlpha = 0.8;
          ctx.strokeStyle = '#ff8ca0';
          ctx.lineWidth = 1.4;
          for (let i = 0; i < 4; i++) {
            const a = t * 1.4 + i * Math.PI / 2;
            ctx.beginPath();
            ctx.moveTo(ev.warnX + Math.cos(a) * R * 0.45, ev.warnY + Math.sin(a) * R * 0.45);
            ctx.lineTo(ev.warnX + Math.cos(a) * R * 0.8, ev.warnY + Math.sin(a) * R * 0.8);
            ctx.stroke();
          }
          ctx.restore();
          ctx.globalAlpha = 1;
        }
        return;
      }

      const R = m.radius;
      const awake = 0.7 + 0.3 * Math.sin(t * 4.6);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gs = R * 6.4;
      ctx.globalAlpha = 0.5;
      ctx.drawImage(this._glowSprite('#ff4f70'), m.x - gs / 2, m.y - gs / 2, gs, gs);
      ctx.globalAlpha = 0.26;
      const gs2 = R * (9 + (m.lungeTelegraph > 0 ? 3 : 0));
      ctx.drawImage(this._glowSprite('#b324ff'), m.x - gs2 / 2, m.y - gs2 / 2, gs2, gs2);
      ctx.restore();

      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.angle);

      /* Tentáculos / espinas. */
      ctx.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        const a = i * TAU / 9 + Math.sin(t * 0.9 + i) * 0.16;
        const len = R * (1.45 + 0.28 * Math.sin(t * 2.2 + i * 1.7));
        const bx = Math.cos(a) * R * 0.72;
        const by = Math.sin(a) * R * 0.72;
        ctx.strokeStyle = i % 2 ? 'rgba(40,8,30,.9)' : 'rgba(90,12,48,.85)';
        ctx.lineWidth = R * (0.16 + 0.06 * (i % 3));
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(
          Math.cos(a + 0.4) * len * 0.8, Math.sin(a + 0.4) * len * 0.8,
          Math.cos(a + Math.sin(t + i) * 0.24) * len, Math.sin(a + Math.sin(t + i) * 0.24) * len
        );
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,79,112,.35)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      /* Cuerpo. */
      const grad = ctx.createRadialGradient(-R * 0.25, -R * 0.3, R * 0.1, 0, 0, R);
      grad.addColorStop(0, '#56103c');
      grad.addColorStop(0.5, '#22051f');
      grad.addColorStop(1, '#06020c');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,79,112,' + (0.55 + awake * 0.3) + ')';
      ctx.lineWidth = Math.max(2, R * 0.075);
      ctx.stroke();

      /* Anillo giratorio. */
      ctx.save();
      ctx.rotate(t * 1.1);
      ctx.strokeStyle = 'rgba(255,79,112,.42)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([R * 0.35, R * 0.42]);
      ctx.beginPath(); ctx.arc(0, 0, R * 1.18, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      /* Fauces. */
      const maw = R * 0.56;
      ctx.fillStyle = '#12000f';
      ctx.beginPath(); ctx.arc(R * 0.2, 0, maw, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,125,150,.8)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(R * 0.2, 0, maw, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(255,79,112,.9)';
      for (let i = 0; i < 8; i++) {
        const a = i * TAU / 8 + t * 0.7;
        const rr = maw * (0.72 + 0.08 * Math.sin(t * 5 + i));
        ctx.beginPath();
        ctx.arc(R * 0.2 + Math.cos(a) * rr, Math.sin(a) * rr, R * 0.055, 0, TAU);
        ctx.fill();
      }

      /* Ojos. */
      const eyeR = R * 0.16;
      for (const side of [-1, 1]) {
        const ex = R * 0.22;
        const ey = side * R * 0.6;
        const eg = ctx.createRadialGradient(ex, ey, 0, ex, ey, eyeR * 2.4);
        eg.addColorStop(0, '#fff3a8');
        eg.addColorStop(0.35, '#ffcb45');
        eg.addColorStop(1, 'rgba(255,60,80,0)');
        ctx.fillStyle = eg;
        ctx.beginPath(); ctx.arc(ex, ey, eyeR * 2.4, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff7c4';
        ctx.beginPath(); ctx.arc(ex, ey, eyeR, 0, TAU); ctx.fill();
        ctx.fillStyle = '#180206';
        ctx.beginPath(); ctx.arc(ex + eyeR * 0.28, ey, eyeR * 0.52, 0, TAU); ctx.fill();
      }
      ctx.restore();

      /* Aviso del zarpazo. */
      if (m.lungeTelegraph > 0) {
        const k = 1 - m.lungeTelegraph / 0.82;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255,40,80,' + (0.3 + k * 0.55) + ')';
        ctx.lineWidth = 2 + k * 5;
        ctx.setLineDash([14, 10]);
        ctx.lineDashOffset = -t * 80;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x + Math.cos(m.lungeAim) * 780, m.y + Math.sin(m.lungeAim) * 780);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    _drawThreatArrow(ctx, x, y, color, label) {
      if (!this.player) return;
      const z = this.cam.zoom;
      const sx = (x - this.cam.x) * z + this.w / 2;
      const sy = (y - this.cam.y) * z + this.h / 2;
      if (sx > 70 && sx < this.w - 70 && sy > 70 && sy < this.h - 70) return;
      const cx = this.w / 2, cy = this.h / 2;
      let dx = sx - cx, dy = sy - cy;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      const margin = 58;
      const scale = Math.min(
        (this.w / 2 - margin) / Math.max(0.001, Math.abs(dx)),
        (this.h / 2 - margin) / Math.max(0.001, Math.abs(dy))
      );
      const ax = cx + dx * scale;
      const ay = cy + dy * scale;
      const ang = Math.atan2(dy, dx);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(ang);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-9, 10);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-9, -10);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.26;
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 40);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 40, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
      if (label) {
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = color;
        ctx.font = '700 9px Rajdhani, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, ax - dx * 24, ay - dy * 24);
        ctx.restore();
      }
    }

    /* ═══════════════════════ PARTÍCULAS ═══════════════════════ */
    _spawnParticles(x, y, color, count, spMin, spMax, lifeMin, lifeMax, sizeMin, sizeMax, drag) {
      const n = Math.min(count, this.maxParticles - this.particles.length);
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU);
        const sp = rand(spMin, spMax);
        this.particles.push({
          x, y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: rand(lifeMin, lifeMax),
          max: lifeMax,
          size: rand(sizeMin, sizeMax),
          color,
          shape: 'dot',
          drag: drag === undefined ? 2.6 : drag
        });
      }
      if (this.particles.length > this.maxParticles) {
        this.particles.splice(0, this.particles.length - this.maxParticles);
      }
    }

    _updateParticles(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          this.particles[i] = this.particles[this.particles.length - 1];
          this.particles.pop();
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const d = Math.exp(-p.drag * dt);
        p.vx *= d;
        p.vy *= d;
      }
    }

    _updateShockwaves(dt) {
      for (let i = this.shockwaves.length - 1; i >= 0; i--) {
        const w = this.shockwaves[i];
        w.t += dt;
        if (w.t >= w.life) this.shockwaves.splice(i, 1);
      }
    }

    _drawShockwaves(ctx) {
      if (!this.shockwaves.length) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const w of this.shockwaves) {
        const k = clamp(w.t / w.life, 0, 1);
        const ease = 1 - Math.pow(1 - k, 3);
        const r = 24 + w.max * ease;
        ctx.globalAlpha = (1 - k) * 0.9;
        ctx.strokeStyle = w.color;
        ctx.lineWidth = (w.thin ? 3.2 : 10) * (1 - k) + 1;
        ctx.beginPath();
        ctx.arc(w.x, w.y, r, 0, TAU);
        ctx.stroke();
        if (!w.thin) {
          ctx.globalAlpha = (1 - k) * 0.35;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(w.x, w.y, r * 0.78, 0, TAU);
          ctx.stroke();
        }
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    _addFloat(x, y, text, color, big) {
      this.floats.push({
        x, y, text, color,
        life: big ? 1.5 : 1.0,
        max: big ? 1.5 : 1.0,
        vy: big ? -30 : -22,
        size: big ? 17 : 13
      });
      if (this.floats.length > 50) this.floats.shift();
    }

    _updateFloats(dt) {
      for (let i = this.floats.length - 1; i >= 0; i--) {
        const f = this.floats[i];
        f.life -= dt;
        if (f.life <= 0) { this.floats.splice(i, 1); continue; }
        f.y += f.vy * dt;
        f.vy *= Math.exp(-dt * 1.6);
      }
    }

    /* ═══════════════════════ CÁMARA ═══════════════════════ */
    _updateCamera(dt, paused) {
      if (this.mode === 'menu') {
        this.menuTimer -= dt;
        if (!this.menuFocus || !this.menuFocus.alive || this.menuTimer <= 0) {
          this._chooseMenuFocus();
        }
        if (this.menuFocus) {
          const f = this.menuFocus;
          const t = this._menuCamTarget(f);
          this.camTarget.x = t.x;
          this.camTarget.y = t.y;
          this.camTarget.zoom = t.zoom;
        } else {
          this.camTarget.x = 0;
          this.camTarget.y = 0;
          this.camTarget.zoom = 0.6;
        }
      } else if (this.mode === 'dying' || this.mode === 'dead') {
        this.camTarget.x = this.deathPos.x;
        this.camTarget.y = this.deathPos.y;
        this.camTarget.zoom = clamp(Math.min(this.w, this.h) / 1050, 0.55, 0.9) * 0.9;
      } else if (this.player && this.player.alive) {
        const p = this.player;
        const lead = 54 + Math.min(50, p.speed * 0.13);
        this.camTarget.x = p.x + Math.cos(p.angle) * lead;
        this.camTarget.y = p.y + Math.sin(p.angle) * lead;
        const base = clamp(Math.min(this.w, this.h) / 900, 0.68, 1.15);
        const growth = Math.pow(11.6 / (p.radius * (p.radiusScale || 1)), 0.62);
        this.camTarget.zoom = base * clamp(growth, 0.52, 1.08);
      }

      if (paused) return;
      const k = this.mode === 'menu' ? 1.4 : this.mode === 'dying' ? 1.4 : 4.2;
      const t = 1 - Math.exp(-dt * k);
      this.cam.x = lerp(this.cam.x, this.camTarget.x, t);
      this.cam.y = lerp(this.cam.y, this.camTarget.y, t);
      this.cam.zoom = lerp(this.cam.zoom, this.camTarget.zoom, 1 - Math.exp(-dt * 3.0));
    }

    _finalizeDeath() {
      if (this.ended) return;
      this.ended = true;
      this.mode = 'dead';
      this.finalStats = this.getRunStats();
      this.audio.setDucked(true);
      this.audio.setBoost(false);
      this.boostAudioOn = false;
      if (this.callbacks && this.callbacks.onRunEnd) {
        this.callbacks.onRunEnd(this.finalStats, 'death');
      }
    }

    _panFor(x) {
      if (!this.player) return 0;
      const sx = (x - this.cam.x) * this.cam.zoom;
      return clamp(sx / (this.w * 0.8), -0.75, 0.75);
    }

    /* ═══════════════════════ MINIMAPA / HUD DATA ═══════════════════════ */
    getLeaderboard(n) {
      const list = [];
      for (const s of this.snakes) {
        if (!s.alive) continue;
        list.push(s);
      }
      if (this.player && this.player.alive && !list.includes(this.player)) list.push(this.player);
      list.sort((a, b) => b.mass - a.mass);
      const res = [];
      for (let i = 0; i < Math.min(n, list.length); i++) {
        const s = list[i];
        res.push({
          name: s.name,
          mass: Math.floor(s.mass),
          color: s.skin.glow,
          isPlayer: s.isPlayer,
          rank: i + 1
        });
      }
      if (this.player && this.player.alive) {
        const rank = list.indexOf(this.player) + 1;
        if (rank > n) {
          res.push({
            name: this.player.name,
            mass: Math.floor(this.player.mass),
            color: this.player.skin.glow,
            isPlayer: true,
            rank
          });
        }
      }
      return res;
    }

    drawMinimap(ctx) {
      const size = ctx.canvas.width;
      const c = size / 2;
      const radius = c - 9;
      const scale = (c - 15) / WORLD_R;
      const t = this.renderTime;

      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.translate(c, c);

      ctx.fillStyle = 'rgba(3,8,18,.52)';
      ctx.beginPath();
      ctx.arc(0, 0, c - 2, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = 'rgba(70,150,210,.16)';
      ctx.lineWidth = 1;
      for (const r of [radius * 0.33, radius * 0.66]) {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.stroke();
      }

      /* muestra de comida y premios */
      ctx.fillStyle = 'rgba(80,190,240,.2)';
      for (let i = 0; i < this.food.length; i++) {
        const o = this.food[i];
        if (o.kind === 'pickup') {
          ctx.fillStyle = o.color;
          ctx.shadowColor = o.color;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(o.x * scale, o.y * scale, 2.6, 0, TAU);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.fillStyle = 'rgba(80,190,240,.2)';
        } else if (i % 9 === 0 && o.kind !== 'gold') {
          ctx.fillRect(o.x * scale - 0.6, o.y * scale - 0.6, 1.2, 1.2);
        }
      }

      /* barrido */
      const sweep = t * 0.55 % TAU;
      const grad = ctx.createLinearGradient(0, 0, Math.cos(sweep) * radius, Math.sin(sweep) * radius);
      grad.addColorStop(0, 'rgba(70,240,255,0)');
      grad.addColorStop(1, 'rgba(70,240,255,.14)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(sweep) * radius, Math.sin(sweep) * radius);
      ctx.stroke();

      /* serpientes */
      for (const s of this.snakes) {
        if (!s.alive || s.isPlayer) continue;
        ctx.fillStyle = s.skin.glow;
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.arc(s.x * scale, s.y * scale, s.mass > 200 ? 3.3 : 2.3, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (this.goldOrb) {
        ctx.fillStyle = '#ffd45e';
        ctx.shadowColor = '#ffb300';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(this.goldOrb.x * scale, this.goldOrb.y * scale, 2.8, 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      /* amenaza */
      const ev = this.monsterEvent;
      if (this.monster || ev.state === 'warning') {
        const mx = (this.monster ? this.monster.x : ev.warnX) * scale;
        const my = (this.monster ? this.monster.y : ev.warnY) * scale;
        const mp = 0.6 + 0.4 * Math.sin(t * 7);
        ctx.strokeStyle = 'rgba(255,79,112,' + (0.4 + mp * 0.4) + ')';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(mx, my, 5 + mp * 4, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = '#ff4f70';
        ctx.shadowColor = '#ff4f70';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(mx, my, 2.8, 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      const p = this.player && this.player.alive ? this.player : null;
      if (p) {
        const px = p.x * scale, py = p.y * scale;
        const pulse = 0.6 + 0.4 * Math.sin(t * 5);
        ctx.strokeStyle = 'rgba(120,250,255,' + (0.45 * pulse) + ')';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, 6 + pulse * 2.5, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = '#f0ffff';
        ctx.shadowColor = '#3df5ff';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(px, py, 3.1, 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(61,245,255,.85)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(p.angle) * 10, py + Math.sin(p.angle) * 10);
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(90,210,255,.32)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, TAU);
      ctx.stroke();

      ctx.fillStyle = 'rgba(150,210,240,.45)';
      ctx.font = '600 12px Rajdhani, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('N', 0, -radius + 12);
      ctx.restore();
    }

    /* ═══════════════════════ RENDER ═══════════════════════ */
    _render(dt) {
      this._shakeX = this.shake ? rand(-this.shake, this.shake) : 0;
      this._shakeY = this.shake ? rand(-this.shake, this.shake) : 0;

      this._prepVisibility();
      this._renderBloom();
      this._renderMain();
    }

    _prepVisibility() {
      const z = this.cam.zoom;
      const halfW = this.w / (2 * z);
      const halfH = this.h / (2 * z);
      this.view = {
        x0: this.cam.x - halfW - 90,
        x1: this.cam.x + halfW + 90,
        y0: this.cam.y - halfH - 90,
        y1: this.cam.y + halfH + 90
      };
      this.visibleFood.length = 0;
      for (let i = 0; i < this.food.length; i++) {
        const o = this.food[i];
        if (o.x > this.view.x0 - 40 && o.x < this.view.x1 + 40 &&
            o.y > this.view.y0 - 40 && o.y < this.view.y1 + 40) {
          this.visibleFood.push(o);
        }
      }
      this.visibleSnakes.length = 0;
      for (let i = 0; i < this.snakes.length; i++) {
        const s = this.snakes[i];
        if (!s.alive) continue;
        const b = s.bbox;
        if (b.x1 < this.view.x0 - 120 || b.x0 > this.view.x1 + 120 ||
            b.y1 < this.view.y0 - 120 || b.y0 > this.view.y1 + 120) continue;
        this.visibleSnakes.push(s);
      }
      this.visibleSnakes.sort((a, b) => {
        if (a.isPlayer) return 1;
        if (b.isPlayer) return -1;
        return a.radius - b.radius;
      });
    }

    _inView(x, y, pad) {
      return x > this.view.x0 - pad && x < this.view.x1 + pad &&
             y > this.view.y0 - pad && y < this.view.y1 + pad;
    }

    _renderBloom() {
      if (!this.bloomEnabled) return;
      const b = this.bctx;
      const bw = this.bloomCanvas.width;
      const bh = this.bloomCanvas.height;
      const z = this.cam.zoom;
      const BS = bw / this.w;
      b.setTransform(1, 0, 0, 1, 0, 0);
      b.clearRect(0, 0, bw, bh);
      b.globalCompositeOperation = 'lighter';
      b.setTransform(
        BS * z, 0, 0, BS * z,
        BS * (this.w / 2 - this.cam.x * z + this._shakeX),
        BS * (this.h / 2 - this.cam.y * z + this._shakeY)
      );
      b.lineCap = 'round';
      b.lineJoin = 'round';

      /* Anillo */
      b.strokeStyle = 'rgba(55,225,255,.11)';
      b.lineWidth = 54;
      b.beginPath(); b.arc(0, 0, WORLD_R, 0, TAU); b.stroke();
      b.strokeStyle = 'rgba(95,160,255,.22)';
      b.lineWidth = 12;
      b.beginPath(); b.arc(0, 0, WORLD_R, 0, TAU); b.stroke();

      /* Comida */
      for (let i = 0; i < this.visibleFood.length; i++) {
        const o = this.visibleFood[i];
        const big = o.kind === 'gold' || o.kind === 'pickup';
        if (!big && this.quality < 0.55) continue;
        const scale = 1 + 0.16 * Math.sin(o.phase * 2.2 + this.renderTime * 2.8);
        const size = o.r * (o.kind === 'pickup' ? 12 : o.kind === 'gold' ? 9 : 7) * scale;
        b.globalAlpha = o.kind === 'pickup' ? 0.9 : o.kind === 'gold' ? 0.72 : 0.4;
        b.drawImage(this._glowSprite(o.color), o.x - size / 2, o.y - size / 2, size, size);
      }
      b.globalAlpha = 1;

      /* Serpientes */
      for (const s of this.visibleSnakes) {
        this._bloomSnake(b, s);
      }

      /* Aura del jugador */
      if (this.player && this.player.alive) {
        const p = this.player;
        const size = p.radius * (p.radiusScale || 1) * 15;
        b.globalAlpha = 0.55;
        b.drawImage(this._glowSprite(p.skin.glow), p.x - size / 2, p.y - size / 2, size, size);
        if (p.boostPulse > 0) {
          b.globalAlpha = 0.4 * p.boostPulse;
          b.fillStyle = p.skin.glow;
          b.beginPath();
          b.arc(p.x, p.y, p.radius * (p.radiusScale || 1) * (1.6 + (1 - p.boostPulse) * 2.4), 0, TAU);
          b.fill();
        }
      }

      b.globalAlpha = 1;
      b.setTransform(1, 0, 0, 1, 0, 0);
      b.globalCompositeOperation = 'source-over';
    }

    _bloomSnake(b, s) {
      const pts = this._spine(s);
      const n = pts.length;
      if (n < 2) return;
      const R = s.radius * (s.radiusScale || 1);
      b.strokeStyle = WZ.rgba(s.skin.glow, 0.17);
      b.lineWidth = R * 2.5;
      b.beginPath();
      b.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < n; i += 2) b.lineTo(pts[i].x, pts[i].y);
      if (n % 2 === 0) b.lineTo(pts[n - 1].x, pts[n - 1].y);
      b.stroke();
      if (this.quality > 0.5) {
        b.strokeStyle = WZ.rgba(s.skin.glow, 0.075);
        b.lineWidth = R * 4.2;
        b.beginPath();
        b.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < n; i += 3) b.lineTo(pts[i].x, pts[i].y);
        b.stroke();
      }

      const hg = R * (s.skin.bigHead ? 6.2 : 4.2);
      b.globalAlpha = 0.42;
      b.drawImage(this._glowSprite(s.skin.glow), s.x - hg / 2, s.y - hg / 2, hg, hg);
      b.globalAlpha = 1;
    }

    _renderMain() {
      const ctx = this.ctx;
      const dpr = this.dpr;
      const z = this.cam.zoom;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      this._drawBackground(ctx);

      ctx.save();
      ctx.setTransform(
        dpr * z, 0, 0, dpr * z,
        dpr * (this.w / 2 - this.cam.x * z + this._shakeX),
        dpr * (this.h / 2 - this.cam.y * z + this._shakeY)
      );

      this._drawFloor(ctx);
      this._drawGrid(ctx);
      this._drawBoundary(ctx);
      this._drawFood(ctx);
      this._drawSnakes(ctx);
      this._drawShockwaves(ctx);
      this._drawMonster(ctx);
      this._drawBeams(ctx);
      this._drawParticles(ctx);
      this._drawFloats(ctx);
      ctx.restore();

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (this.bloomEnabled) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.72;
        ctx.drawImage(this.bloomCanvas, 0, 0, this.w, this.h);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }

      this._drawScreenFx(ctx);
    }

    _spine(s) {
      const pts = this._spineCache || (this._spineCache = []);
      pts.length = 0;
      pts.push({ x: s.x, y: s.y });
      const body = s.points;
      const step = this.quality < 0.55 ? 2 : 1;
      for (let i = 0; i < body.length; i += step) {
        const p = body[i];
        const last = pts[pts.length - 1];
        const dx = p.x - last.x, dy = p.y - last.y;
        if (dx * dx + dy * dy > 2.2) pts.push(p);
      }
      const tail = body.length ? body[body.length - 1] : null;
      if (tail && pts[pts.length - 1] !== tail) {
        const last = pts[pts.length - 1];
        const dx = tail.x - last.x, dy = tail.y - last.y;
        if (dx * dx + dy * dy > 2.2) pts.push(tail);
      }
      return pts;
    }

    _drawBackground(ctx) {
      ctx.fillStyle = '#04060e';
      ctx.fillRect(0, 0, this.w, this.h);

      const drift = Math.sin(this.renderTime * 0.035) * 12;
      ctx.globalAlpha = 0.95;
      ctx.drawImage(this.bgTex, -22 + drift, -18 - drift * 0.4, this.w + 44, this.h + 40);
      ctx.globalAlpha = 1;

      /* Estrellas parallax */
      ctx.save();
      for (let i = 0; i < this.stars.length; i++) {
        const st = this.stars[i];
        const sx = mod(st.x * this.w - this.cam.x * st.depth * 0.07 * this.cam.zoom, this.w + 40) - 20;
        const sy = mod(st.y * this.h - this.cam.y * st.depth * 0.07 * this.cam.zoom, this.h + 40) - 20;
        const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(this.renderTime * st.tw + st.ph));
        ctx.globalAlpha = tw * st.a;
        ctx.fillStyle = st.c;
        if (st.s > 1.25) {
          ctx.fillRect(sx - st.s * 2, sy - 0.4, st.s * 4, 0.8);
          ctx.fillRect(sx - 0.4, sy - st.s * 2, 0.8, st.s * 4);
          ctx.beginPath(); ctx.arc(sx, sy, st.s, 0, TAU); ctx.fill();
        } else {
          ctx.fillRect(sx, sy, st.s, st.s);
        }
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    _drawFloor(ctx) {
      if (this.quality < 0.46) return;
      ctx.globalAlpha = 0.92;
      ctx.drawImage(this.floorTex, -WORLD_R, -WORLD_R, WORLD_R * 2, WORLD_R * 2);
      ctx.globalAlpha = 1;
    }

    _drawGrid(ctx) {
      const spacing = this.quality < 0.6 ? 230 : 160;
      const z = this.cam.zoom;
      const halfW = this.w / (2 * z) + 80;
      const halfH = this.h / (2 * z) + 80;
      const x0 = Math.floor((this.cam.x - halfW) / spacing) * spacing;
      const y0 = Math.floor((this.cam.y - halfH) / spacing) * spacing;
      const x1 = this.cam.x + halfW;
      const y1 = this.cam.y + halfH;
      const detail = this.quality > 0.65;
      ctx.fillStyle = 'rgba(92,170,225,.16)';
      for (let x = x0; x < x1; x += spacing) {
        for (let y = y0; y < y1; y += spacing) {
          if (x * x + y * y > WORLD_R * WORLD_R) continue;
          const ix = Math.round(x / spacing);
          const iy = Math.round(y / spacing);
          if (detail && (ix + iy) % 4 === 0) {
            ctx.globalAlpha = 0.28;
            ctx.fillRect(x - 2, y - 0.7, 4, 1.4);
            ctx.fillRect(x - 0.7, y - 2, 1.4, 4);
          } else {
            ctx.globalAlpha = 0.42;
            ctx.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    _drawBoundary(ctx) {
      /* Oscurecer exterior */
      ctx.beginPath();
      ctx.rect(-WORLD_R * 2.2, -WORLD_R * 2.2, WORLD_R * 4.4, WORLD_R * 4.4);
      ctx.arc(0, 0, WORLD_R, 0, TAU, true);
      ctx.fillStyle = 'rgba(1,3,9,.56)';
      ctx.fill('evenodd');

      const danger = this.edgeWarning;
      if (!this.boundaryGrad) {
        const g = ctx.createLinearGradient(-WORLD_R, -WORLD_R, WORLD_R, WORLD_R);
        g.addColorStop(0, '#3cf4ff');
        g.addColorStop(0.35, '#378dff');
        g.addColorStop(0.7, '#a54bff');
        g.addColorStop(1, '#ff4fc8');
        this.boundaryGrad = g;
      }
      ctx.strokeStyle = danger > 0.2 ? 'rgba(255,90,130,' + (0.35 + danger * 0.55) + ')' : 'rgba(66,180,255,.26)';
      ctx.lineWidth = 13;
      ctx.beginPath(); ctx.arc(0, 0, WORLD_R + 5, 0, TAU); ctx.stroke();

      ctx.strokeStyle = this.boundaryGrad;
      ctx.lineWidth = 2.2;
      ctx.globalAlpha = 0.95;
      ctx.beginPath(); ctx.arc(0, 0, WORLD_R, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;

      /* Marcas del anillo */
      const z = this.cam.zoom;
      const viewR = Math.max(this.w, this.h) / (2 * z) + 200;
      const startA = Math.atan2(this.cam.y, this.cam.x);
      const span = Math.min(TAU, viewR / WORLD_R);
      const tickCount = Math.max(24, Math.ceil(span / (TAU / 240)));
      ctx.lineWidth = 1.2;
      for (let i = -tickCount; i <= tickCount; i++) {
        const a = startA + (i / tickCount) * span;
        const long = (Math.round(a / (Math.PI / 24)) % 4 === 0);
        const r0 = WORLD_R + 9;
        const r1 = WORLD_R + (long ? 32 : 20);
        ctx.strokeStyle = long ? 'rgba(130,235,255,.55)' : 'rgba(90,190,255,.22)';
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.stroke();
      }

      /* Anillo interior punteado */
      ctx.save();
      ctx.strokeStyle = 'rgba(110,220,255,.18)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 24]);
      ctx.lineDashOffset = -this.renderTime * 18;
      ctx.beginPath();
      ctx.arc(0, 0, WORLD_R - 18, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    _drawFood(ctx) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < this.visibleFood.length; i++) {
        const o = this.visibleFood[i];
        const pulse = 1 + 0.18 * Math.sin(o.phase * 2.1 + this.renderTime * 2.7);
        const big = o.kind === 'gold' || o.kind === 'pickup';
        if (!big && this.quality < 0.5) continue;
        const size = o.r * (o.kind === 'pickup' ? 9 : o.kind === 'gold' ? 6 : 4.2) * pulse;
        ctx.globalAlpha = o.kind === 'pickup' ? 0.85 : o.kind === 'gold' ? 0.7 : 0.4;
        ctx.drawImage(this._glowSprite(o.color), o.x - size / 2, o.y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      for (let i = 0; i < this.visibleFood.length; i++) {
        const o = this.visibleFood[i];
        const pulse = 1 + 0.16 * Math.sin(o.phase * 2.1 + this.renderTime * 2.7);
        if (o.kind === 'pickup') {
          this._drawPickup(ctx, o, pulse);
          continue;
        }
        if (o.kind === 'gold') {
          this._drawGold(ctx, o, pulse);
          continue;
        }
        ctx.fillStyle = o.color;
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r * pulse, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        ctx.beginPath();
        ctx.arc(o.x - o.r * 0.18, o.y - o.r * 0.18, o.r * 0.34, 0, TAU);
        ctx.fill();
      }
    }

    _drawPickup(ctx, o, pulse) {
      const t = this.renderTime;
      const def = global.WZ && WZ.getPickup ? WZ.getPickup(o.pickupId) : null;
      if (!def) return;
      const bob = Math.sin(t * 2.4 + (o.bob || 0)) * 3.5;
      const y = o.y + bob;
      const R = o.r * (1 + 0.08 * Math.sin(t * 3.2 + (o.bob || 0)));
      const fade = o.ttl !== undefined && o.ttl < 6 ? 0.55 + 0.45 * Math.sin(t * 12) : 1;
      ctx.save();
      ctx.translate(o.x, y);
      ctx.globalAlpha = fade;

      /* halo */
      ctx.globalCompositeOperation = 'lighter';
      const gs = R * 5.4;
      ctx.drawImage(this._glowSprite(def.glow), -gs / 2, -gs / 2, gs, gs);
      ctx.globalCompositeOperation = 'source-over';

      /* Aro */
      ctx.strokeStyle = WZ.rgba(def.color, 0.55);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 7]);
      ctx.lineDashOffset = -t * 22;
      ctx.beginPath();
      ctx.arc(0, 0, R * 2.25 + Math.sin(t * 2.8) * 1.5, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);

      /* Núcleo */
      ctx.rotate(t * (def.id === 'shield' ? 0.5 : 0.9));
      ctx.fillStyle = 'rgba(5,9,20,.9)';
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const sides = def.id === 'bolt' ? 4 : 6;
      for (let i = 0; i < sides; i++) {
        const a = -Math.PI / 2 + (i / sides) * TAU;
        const x = Math.cos(a) * R;
        const yy = Math.sin(a) * R;
        if (i === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      /* Glifo */
      ctx.strokeStyle = '#ffffff';
      ctx.fillStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.4, R * 0.15);
      ctx.lineCap = 'round';
      if (def.id === 'shield') {
        ctx.beginPath();
        ctx.moveTo(0, -R * 0.55);
        ctx.lineTo(R * 0.42, -R * 0.2);
        ctx.lineTo(R * 0.3, R * 0.4);
        ctx.lineTo(0, R * 0.62);
        ctx.lineTo(-R * 0.3, R * 0.4);
        ctx.lineTo(-R * 0.42, -R * 0.2);
        ctx.closePath();
        ctx.stroke();
      } else if (def.id === 'magnet') {
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.42, Math.PI * 0.15, Math.PI * 0.85, true);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-R * 0.4, R * 0.18); ctx.lineTo(-R * 0.4, R * 0.55);
        ctx.moveTo(R * 0.4, R * 0.18); ctx.lineTo(R * 0.4, R * 0.55);
        ctx.stroke();
      } else if (def.id === 'frenzy') {
        ctx.beginPath();
        ctx.moveTo(-R * 0.35, -R * 0.45);
        ctx.lineTo(R * 0.05, -R * 0.05);
        ctx.lineTo(-R * 0.15, -R * 0.02);
        ctx.lineTo(R * 0.35, R * 0.45);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(-R * 0.12, -R * 0.55);
        ctx.lineTo(-R * 0.38, R * 0.02);
        ctx.lineTo(-R * 0.02, R * 0.02);
        ctx.lineTo(R * 0.12, R * 0.58);
        ctx.lineTo(R * 0.4, -R * 0.05);
        ctx.lineTo(R * 0.03, -R * 0.05);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    _drawGold(ctx, o, pulse) {
      const t = this.renderTime;
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(t * 0.7);
      const R = o.r * 1.7 * pulse;
      ctx.fillStyle = '#ffe9a1';
      ctx.shadowColor = '#ffb300';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        const rr = i % 2 === 0 ? R : R * 0.36;
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,.8)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, o.r * 0.55, 0, TAU); ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = 'rgba(255,210,90,' + (0.22 + 0.12 * Math.sin(t * 2.4)) + ')';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([5, 9]);
      ctx.lineDashOffset = t * 20;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r * 3.1 + Math.sin(t * 2) * 2, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    _drawSnakes(ctx) {
      for (const s of this.visibleSnakes) {
        this._drawSnakeBody(ctx, s);
      }
      for (const s of this.visibleSnakes) {
        this._drawSnakeHead(ctx, s);
      }
    }

    _drawEffectRibbon(ctx, s, pts, R, eff) {
      if (!eff) return;
      const n = pts.length;
      if (n < 4) return;
      const tail = pts[n - 1];
      const prev = pts[Math.max(0, n - 16)];
      const ang = Math.atan2(tail.y - prev.y, tail.x - prev.x);
      const nx = Math.cos(ang + Math.PI / 2);
      const ny = Math.sin(ang + Math.PI / 2);
      const len = 100 + Math.min(230, (s.speed || 0) * 0.75);
      const colors = eff.colors || [eff.color, eff.glow];
      const t = this.renderTime;
      const phase = s.phase || 0;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = s.isPlayer ? 0.72 : 0.46;

      const passes = s.isPlayer
        ? (this.quality < 0.7 ? 2 : Math.max(2, Math.min(4, colors.length)))
        : 2;
      for (let p = 0; p < passes; p++) {
        const samples = 11;
        ctx.beginPath();
        for (let i = 0; i < samples; i++) {
          const k = i / (samples - 1);
          const d = k * len;
          const sway = Math.sin(k * 4.4 + t * (eff.mode === 'void' ? 2.2 : 4.6) + phase + p * 1.7) * (1 - k) * (eff.mode === 'streak' ? 8 : 13);
          const x = tail.x + Math.cos(ang) * d + nx * sway * (p === 0 ? 1 : 0.55 + p * 0.16);
          const y = tail.y + Math.sin(ang) * d + ny * sway * (p === 0 ? 1 : 0.55 + p * 0.16);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = colors[p % colors.length];
        ctx.lineWidth = Math.max(1.2, R * (1.1 - p * 0.22));
        ctx.stroke();
      }

      if (eff.mode === 'streak') {
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = colors[0];
        ctx.lineWidth = 1.2;
        ctx.setLineDash([8, 14]);
        ctx.lineDashOffset = -t * 42;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const k = i / 9;
          const x = tail.x + Math.cos(ang) * k * len + nx * Math.sin(k * 7 + t * 7) * 8;
          const y = tail.y + Math.sin(ang) * k * len + ny * Math.sin(k * 7 + t * 7) * 8;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    _drawSnakeBody(ctx, s) {
      const pts = this._spine(s);
      const n = pts.length;
      if (n < 3) return;
      const skin = s.skin;
      const phantom = this._isPhantom(s);
      const ghost = !!skin.ghost || phantom;
      const alphaBase = phantom ? 0.55 : ghost ? 0.82 : 1;
      const R = s.radius * (s.radiusScale || 1);
      const mainEnd = Math.max(2, Math.min(n - 1, Math.floor(n * 0.86)));

      const eff = s.effect || (s.isPlayer ? this.effect : null);
      if (eff && eff.mode !== 'orbit' && this._inView(s.x, s.y, 760) &&
          (s.isPlayer || this.quality > 0.52)) {
        this._drawEffectRibbon(ctx, s, pts, R, eff);
      }

      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i <= mainEnd; i++) ctx.lineTo(pts[i].x, pts[i].y);

      ctx.save();
      ctx.globalAlpha = alphaBase;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      /* Contorno continuo: silueta limpia incluso en curvas cerradas. */
      ctx.globalAlpha = phantom ? 0.18 : ghost ? 0.3 : 0.62;
      ctx.strokeStyle = '#02060e';
      ctx.lineWidth = R * 2 + Math.max(2.5, R * 0.2);
      ctx.stroke();

      /* Base del cuerpo. */
      ctx.globalAlpha = alphaBase;
      ctx.strokeStyle = skin.colors[0];
      ctx.lineWidth = R * 2;
      ctx.stroke();

      if ((skin.pattern === 'chrome' || skin.pattern === 'stars') && this.quality > 0.5) {
        const grad = ctx.createLinearGradient(pts[0].x, pts[0].y, pts[mainEnd].x, pts[mainEnd].y);
        const cols = skin.colors;
        if (skin.pattern === 'chrome') {
          grad.addColorStop(0, cols[0]);
          grad.addColorStop(0.35, cols[1]);
          grad.addColorStop(0.72, cols[0]);
          grad.addColorStop(1, cols[2]);
        } else {
          grad.addColorStop(0, cols[2]);
          grad.addColorStop(0.45, cols[0]);
          grad.addColorStop(1, cols[1]);
        }
        ctx.strokeStyle = grad;
        ctx.stroke();
      } else {
        /* Bandas suaves mediante trazos discontinuos sobre la misma ruta. */
        const cols = skin.colors;
        const N = cols.length;
        if (N > 1) {
          const band = skin.band || 34;
          const offset = skin.pattern === 'rainbow' ? this.renderTime * 24 : 0;
          const bands = this.quality < 0.6 ? Math.min(2, N) : N;
          ctx.lineCap = 'butt';
          for (let i = 0; i < bands; i++) {
            ctx.strokeStyle = cols[i];
            ctx.setLineDash([band, band * (N - 1)]);
            ctx.lineDashOffset = -i * band - offset;
            ctx.stroke();
          }
          ctx.setLineDash([]);
          ctx.lineCap = 'round';
        }
      }

      /* Sombra y brillo tubular, antes de la cola para no invalidar la ruta. */
      if (this.quality > 0.55) {
        ctx.globalAlpha = phantom ? 0.06 : ghost ? 0.12 : 0.16;
        ctx.strokeStyle = '#01040a';
        ctx.lineWidth = Math.max(1, R * 0.5);
        ctx.save();
        ctx.translate(0, R * 0.3);
        ctx.stroke();
        ctx.restore();

        ctx.globalAlpha = phantom ? 0.1 : ghost ? 0.18 : 0.2;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, R * 0.38);
        ctx.save();
        ctx.translate(0, -R * 0.3);
        ctx.stroke();
        ctx.restore();
      }

      /* Cola afilada (tramo final). */
      if (mainEnd < n - 1) {
        const step = this.quality < 0.6 ? 2 : 1;
        ctx.globalAlpha = phantom ? 0.18 : ghost ? 0.3 : 0.58;
        ctx.strokeStyle = '#02060e';
        for (let i = mainEnd + step; i < n; i += step) {
          const p0 = pts[i - step], p1 = pts[i];
          const t = i / (n - 1);
          const taper = 1 - (t - 0.86) / 0.14 * 0.76;
          const width = R * 2 * Math.max(0.08, taper);
          ctx.lineWidth = width + Math.max(1.2, R * 0.12);
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();
        }
        ctx.globalAlpha = alphaBase;
        ctx.lineCap = 'round';
        for (let i = mainEnd + step; i < n; i += step) {
          const p0 = pts[i - step], p1 = pts[i];
          const t = i / (n - 1);
          const taper = 1 - (t - 0.86) / 0.14 * 0.76;
          const width = R * 2 * Math.max(0.08, taper);
          if (width < 0.8) continue;
          ctx.strokeStyle = this._bodyColor(skin, i * SPACING, t);
          ctx.lineWidth = width;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();
        }
      }

      ctx.globalAlpha = alphaBase;

      /* Patrón */
      if (this.quality > 0.45 || s.isPlayer) this._drawSkinPattern(ctx, s, pts, n, R);

      ctx.restore();
    }

    _bodyColor(skin, dist, t) {
      const colors = skin.colors;
      if (skin.pattern === 'rainbow') {
        const hue = (dist * 0.55 + this.renderTime * 42) % 360;
        return 'hsl(' + hue.toFixed(1) + ',90%,61%)';
      }
      if (skin.pattern === 'chrome') {
        const w = Math.sin(dist * 0.075 + this.renderTime * 1.4) * 0.5 + 0.5;
        return WZ.mix(colors[2], colors[0], w * 0.72 + 0.18);
      }
      if (skin.pattern === 'stars') {
        const w = Math.sin(dist * 0.028 - this.renderTime * 0.8) * 0.5 + 0.5;
        return WZ.mix(colors[0], colors[1], w * 0.5);
      }
      if (skin.pattern === 'circuit') {
        return Math.floor(dist / 70) % 4 === 0 ? colors[0] : colors[2];
      }
      if (skin.pattern === 'spikes') {
        return Math.floor(dist / 42) % 2 ? colors[1] : colors[0];
      }
      if (skin.pattern === 'embers') {
        const b = Math.floor(dist / 30) % 3;
        return b === 0 ? colors[2] : (b === 1 ? colors[1] : colors[0]);
      }
      if (skin.pattern === 'diamonds' || skin.pattern === 'dots') {
        return Math.floor(dist / 42) % 2 ? WZ.mix(colors[0], colors[1], 0.35) : colors[0];
      }
      if (skin.pattern === 'corona') {
        return Math.floor(dist / 46) % 2 ? WZ.mix(colors[0], colors[1], 0.55) : colors[0];
      }
      return colors[Math.floor(dist / (skin.band || 34)) % colors.length];
    }

    _drawSkinPattern(ctx, s, pts, n, R) {
      const skin = s.skin;
      const pattern = skin.pattern;

      if (pattern === 'dots') {
        ctx.fillStyle = WZ.rgba(skin.accent, 0.55);
        for (let i = 6; i < n - 3; i += 6) {
          const p = pts[i], q = pts[i + 1];
          const dx = q.x - p.x, dy = q.y - p.y;
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len, ny = dx / len;
          const side = (i % 12 === 0 ? 1 : -1) * R * 0.32;
          ctx.beginPath();
          ctx.arc(p.x + nx * side, p.y + ny * side, Math.max(0.8, R * 0.16), 0, TAU);
          ctx.fill();
        }
      } else if (pattern === 'diamonds') {
        ctx.fillStyle = WZ.rgba(skin.accent, 0.4);
        for (let i = 6; i < n - 4; i += 7) {
          const p = pts[i];
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(Math.PI / 4);
          ctx.fillRect(-R * 0.22, -R * 0.22, R * 0.44, R * 0.44);
          ctx.restore();
        }
        ctx.strokeStyle = WZ.rgba(skin.colors[2], 0.4);
        ctx.lineWidth = 1;
        for (let i = 10; i < n - 6; i += 14) {
          const p = pts[i];
          const q = pts[i + 1];
          const nc = Math.atan2(q.y - p.y, q.x - p.x);
          ctx.beginPath();
          ctx.moveTo(p.x + Math.cos(nc) * R * 0.35, p.y + Math.sin(nc) * R * 0.35);
          ctx.lineTo(p.x - Math.cos(nc) * R * 0.35, p.y - Math.sin(nc) * R * 0.35);
          ctx.stroke();
        }
      } else if (pattern === 'circuit') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = WZ.rgba(skin.accent, 0.55);
        ctx.lineWidth = Math.max(1, R * 0.1);
        ctx.setLineDash([R * 1.1, R * 1.6]);
        ctx.lineDashOffset = -this.renderTime * 34;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 2; i < n - 4; i += 3) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
        ctx.restore();
      } else if (pattern === 'spikes') {
        ctx.fillStyle = WZ.rgba(skin.accent, 0.85);
        for (let i = 7; i < n - 5; i += 6) {
          const p = pts[i], q = pts[i + 1];
          const dx = q.x - p.x, dy = q.y - p.y;
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len, ny = dx / len;
          const t = i / n;
          const rr = R * (t > 0.86 ? 1 - (t - 0.86) / 0.14 * 0.7 : 1);
          for (const side of [-1, 1]) {
            const bx = p.x + nx * rr * side, by = p.y + ny * rr * side;
            ctx.beginPath();
            ctx.moveTo(bx + dx / len * -R * 0.25, by + dy / len * -R * 0.25);
            ctx.lineTo(bx + nx * side * R * 0.52, by + ny * side * R * 0.52);
            ctx.lineTo(bx + dx / len * R * 0.34, by + dy / len * R * 0.34);
            ctx.closePath();
            ctx.fill();
          }
        }
      } else if (pattern === 'stars') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 8; i < n - 4; i += 8) {
          const p = pts[i], q = pts[i + 1];
          const dx = q.x - p.x, dy = q.y - p.y;
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len, ny = dx / len;
          const side = (i % 16 === 0 ? 1 : -1) * R * 0.4;
          const tw = 0.35 + 0.65 * Math.abs(Math.sin(this.renderTime * 2 + i * 1.7));
          ctx.globalAlpha = tw * 0.75;
          ctx.strokeStyle = skin.accent;
          ctx.lineWidth = 1;
          const sx = p.x + nx * side, sy = p.y + ny * side;
          ctx.beginPath();
          ctx.moveTo(sx - R * 0.24, sy); ctx.lineTo(sx + R * 0.24, sy);
          ctx.moveTo(sx, sy - R * 0.24); ctx.lineTo(sx, sy + R * 0.24);
          ctx.stroke();
        }
        ctx.restore();
      } else if (pattern === 'embers') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 8; i < n - 3; i += 9) {
          const p = pts[i];
          const a = 0.2 + 0.18 * Math.sin(this.renderTime * 2 + i);
          ctx.globalAlpha = a;
          const size = R * 1.5;
          ctx.drawImage(this._glowSprite(skin.colors[2]), p.x - size / 2, p.y - size / 2, size, size);
        }
        ctx.restore();
      } else if (pattern === 'corona') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 5; i < n - 3; i += 10) {
          const p = pts[i];
          const tw = 0.5 + 0.5 * Math.sin(this.renderTime * 2.4 + i * 0.8);
          ctx.globalAlpha = 0.18 + tw * 0.25;
          ctx.fillStyle = skin.accent;
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0.7, R * 0.13), 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      } else if (pattern === 'chrome') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 10; i < n - 6; i += 16) {
          const p = pts[i];
          const a = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(this.renderTime * 1.5 + i));
          ctx.globalAlpha = a;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(p.x, p.y - R * 0.25, Math.max(0.8, R * 0.12), 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    _drawSnakeHead(ctx, s) {
      const skin = s.skin;
      const phantom = this._isPhantom(s);
      const R = s.radius * (s.radiusScale || 1);
      const hr = R * (skin.bigHead ? 1.14 : 1.04);
      const ageBlink = Math.sin(this.renderTime * 1.25 + s.phase) > 0.987;
      const ghost = !!skin.ghost || phantom;

      /* Aura de cabeza */
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = phantom ? 0.36 : ghost ? 0.22 : 0.32;
      const gs = hr * 3.8;
      ctx.drawImage(this._glowSprite(skin.glow), s.x - gs / 2, s.y - gs / 2, gs, gs);
      ctx.restore();

      const sEff = s.effect || (s.isPlayer ? this.effect : null);
      if (sEff || s.shieldTimer > 0 || s.magnetTimer > 0 || s.frenzyTimer > 0 || s.stunTimer > 0 || s.prismTimer > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const t = this.renderTime;
        const zoom = this.cam.zoom;
        if (sEff && sEff.mode === 'orbit' && (s.isPlayer || this.quality > 0.55)) {
          for (let i = 0; i < 3; i++) {
            const a = t * (1.2 + i * 0.18) + i * Math.PI * 2 / 3;
            const rx = hr * 2.25;
            const ry = hr * 1.15;
            const ox = s.x + Math.cos(a) * rx;
            const oy = s.y + Math.sin(a) * ry;
            const size = hr * (0.35 + i * 0.06);
            ctx.globalAlpha = s.isPlayer ? 0.8 : 0.5;
            const col = sEff.colors[i % sEff.colors.length];
            ctx.drawImage(this._glowSprite(col), ox - size * 1.7, oy - size * 1.7, size * 3.4, size * 3.4);
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.arc(ox, oy, size * 0.6, 0, TAU);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
        if (sEff && sEff.mode !== 'orbit') {
          ctx.globalAlpha = s.isPlayer ? 0.3 : 0.16;
          ctx.strokeStyle = sEff.glow;
          ctx.lineWidth = 1.2 / zoom;
          ctx.setLineDash([4 / zoom, 7 / zoom]);
          ctx.lineDashOffset = -t * 18;
          ctx.beginPath();
          ctx.arc(s.x, s.y, hr * 1.8, 0, TAU);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (s.shieldTimer > 0) {
          const pulse = 0.7 + 0.3 * Math.sin(t * 8);
          ctx.globalAlpha = 0.55 * pulse;
          ctx.strokeStyle = '#7df9ff';
          ctx.lineWidth = 2 / zoom;
          ctx.beginPath();
          ctx.arc(s.x, s.y, hr * (2.15 + 0.1 * pulse), 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = 0.14 * pulse;
          ctx.lineWidth = 7 / zoom;
          ctx.beginPath();
          ctx.arc(s.x, s.y, hr * 2.2, 0, TAU);
          ctx.stroke();
        }
        if (s.prismTimer > 0) {
          ctx.globalAlpha = 0.7;
          ctx.lineWidth = 2.2 / zoom;
          for (let i = 0; i < 4; i++) {
            ctx.strokeStyle = ['#ff3b5c', '#ffb800', '#28e07a', '#00cfff'][i];
            ctx.beginPath();
            ctx.arc(s.x, s.y, hr * (2.5 + i * 0.16), t * 3 + i, t * 3 + i + 1.25);
            ctx.stroke();
          }
        }
        if (s.magnetTimer > 0) {
          ctx.globalAlpha = 0.3;
          ctx.strokeStyle = '#57ff9a';
          ctx.lineWidth = 1.3 / zoom;
          ctx.setLineDash([5 / zoom, 8 / zoom]);
          ctx.lineDashOffset = -t * 22;
          ctx.beginPath();
          ctx.arc(s.x, s.y, hr * 3.4, 0, TAU);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (s.frenzyTimer > 0) {
          ctx.globalAlpha = 0.55;
          ctx.strokeStyle = '#ff9a3d';
          ctx.lineWidth = 2 / zoom;
          for (let i = 0; i < 3; i++) {
            const a = t * 6 + i * TAU / 3;
            ctx.beginPath();
            ctx.arc(s.x, s.y, hr * 2.05, a, a + 0.7);
            ctx.stroke();
          }
        }
        if (s.stunTimer > 0) {
          ctx.globalAlpha = 0.85;
          ctx.strokeStyle = '#fff38a';
          ctx.lineWidth = 1.4 / zoom;
          for (let i = 0; i < 4; i++) {
            const a = t * 9 + i * 1.7;
            const r0 = hr * 1.2;
            const r1 = hr * (1.9 + 0.25 * Math.sin(t * 12 + i));
            ctx.beginPath();
            ctx.moveTo(s.x + Math.cos(a) * r0, s.y + Math.sin(a) * r0);
            ctx.lineTo(s.x + Math.cos(a + 0.5) * r1, s.y + Math.sin(a + 0.5) * r1);
            ctx.stroke();
          }
        }
        ctx.restore();
        ctx.globalAlpha = 1;
      }

      if (s.isPlayer) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const t = this.renderTime;
        ctx.strokeStyle = WZ.rgba(skin.glow, 0.3 + 0.12 * Math.sin(t * 3));
        ctx.lineWidth = 1.3 / this.cam.zoom;
        ctx.beginPath();
        ctx.arc(s.x, s.y, hr * (1.55 + 0.06 * Math.sin(t * 3)), 0, TAU);
        ctx.stroke();
        if (s.spawnProtect > 0) {
          const a = Math.min(1, s.spawnProtect / 1.2);
          ctx.strokeStyle = WZ.rgba(skin.accent, 0.28 + 0.18 * Math.sin(t * 9));
          ctx.lineWidth = 1.6 / this.cam.zoom;
          ctx.setLineDash([6 / this.cam.zoom, 7 / this.cam.zoom]);
          ctx.lineDashOffset = -t * 26;
          ctx.beginPath();
          ctx.arc(s.x, s.y, hr * (2.05 + 0.08 * Math.sin(t * 5)), 0, TAU);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = a * 0.35;
          ctx.strokeStyle = WZ.rgba(skin.accent, 0.7);
          ctx.beginPath();
          ctx.arc(s.x, s.y, hr * 2.3, 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        if (this.powerTimer > 0 && this.power) {
          const pw = this.power;
          ctx.globalAlpha = 0.65;
          ctx.strokeStyle = pw.glow;
          ctx.lineWidth = 1.6 / this.cam.zoom;
          ctx.setLineDash([8 / this.cam.zoom, 6 / this.cam.zoom]);
          ctx.lineDashOffset = -t * 38;
          ctx.beginPath();
          ctx.arc(s.x, s.y, hr * (2.55 + 0.06 * Math.sin(t * 4)), 0, TAU);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 0.22;
          ctx.lineWidth = 5 / this.cam.zoom;
          ctx.beginPath();
          ctx.arc(s.x, s.y, hr * 2.55, 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        if (s.powerMagnet) {
          ctx.globalAlpha = 0.28;
          ctx.strokeStyle = '#57ff9a';
          ctx.lineWidth = 1.4 / this.cam.zoom;
          ctx.setLineDash([5 / this.cam.zoom, 8 / this.cam.zoom]);
          ctx.lineDashOffset = -t * 22;
          ctx.beginPath();
          ctx.arc(s.x, s.y, hr * 3.8, 0, TAU);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 0.14;
          ctx.beginPath();
          ctx.arc(s.x, s.y, hr * 5.1, 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.restore();
      }

      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      if (ghost) ctx.globalAlpha = phantom ? 0.6 : 0.86;

      /* Accesorios traseros */
      if (skin.accessory === 'horns') {
        ctx.fillStyle = '#d8ffd8';
        ctx.strokeStyle = 'rgba(3,12,7,.5)';
        ctx.lineWidth = 1;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(-hr * 0.2, side * hr * 0.62);
          ctx.quadraticCurveTo(-hr * 1.35, side * hr * 1.02, -hr * 1.85, side * hr * 0.38);
          ctx.quadraticCurveTo(-hr * 1.0, side * hr * 0.5, -hr * 0.45, side * hr * 0.28);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      } else if (skin.accessory === 'crown') {
        ctx.save();
        ctx.rotate(-this.renderTime * 0.6);
        ctx.strokeStyle = 'rgba(255,225,130,.65)';
        ctx.lineWidth = Math.max(1, hr * 0.09);
        ctx.setLineDash([hr * 0.35, hr * 0.3]);
        ctx.beginPath();
        ctx.arc(0, 0, hr * 1.5, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }

      /* Cabeza */
      const grad = ctx.createRadialGradient(hr * 0.15, -hr * 0.25, hr * 0.1, 0, 0, hr * 1.1);
      grad.addColorStop(0, WZ.mix(skin.accent, skin.colors[0], 0.2));
      grad.addColorStop(0.28, skin.colors[0]);
      grad.addColorStop(0.72, skin.colors[Math.min(1, skin.colors.length - 1)]);
      grad.addColorStop(1, skin.colors[skin.colors.length - 1]);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, hr, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = WZ.rgba('#02060e', ghost ? 0.3 : 0.62);
      ctx.lineWidth = Math.max(1.2, R * 0.15);
      ctx.stroke();

      /* Brillo superior */
      ctx.strokeStyle = 'rgba(255,255,255,.22)';
      ctx.lineWidth = Math.max(1, hr * 0.08);
      ctx.beginPath();
      ctx.arc(0, 0, hr * 0.73, -2.55, -0.6);
      ctx.stroke();

      /* Ojos */
      const er = hr * 0.3;
      const ex = hr * 0.4;
      const ey = hr * 0.43;
      const look = clamp(angDiff(s.angle, s.targetAngle) * 0.35, -0.18, 0.18);
      for (const side of [-1, 1]) {
        const y = side * ey;
        if (ageBlink) {
          ctx.strokeStyle = '#071018';
          ctx.lineWidth = Math.max(1, er * 0.6);
          ctx.beginPath();
          ctx.moveTo(ex - er, y);
          ctx.lineTo(ex + er, y);
          ctx.stroke();
          continue;
        }
        ctx.fillStyle = '#f4ffff';
        ctx.beginPath();
        ctx.arc(ex, y, er, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,10,20,.22)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = skin.eye;
        ctx.beginPath();
        ctx.arc(ex + er * (0.28 + look), y, er * 0.58, 0, TAU);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,.92)';
        ctx.beginPath();
        ctx.arc(ex + er * (0.06 + look), y - er * 0.26, er * 0.18, 0, TAU);
        ctx.fill();
      }

      /* Lengua de Wormzilla */
      if (skin.id === 'wormzilla' && Math.sin(this.renderTime * 2.1 + s.phase) > 0.93) {
        ctx.strokeStyle = '#ff4d6d';
        ctx.lineWidth = Math.max(1, hr * 0.09);
        ctx.beginPath();
        ctx.moveTo(hr * 0.9, 0);
        ctx.lineTo(hr * 1.55, 0);
        ctx.moveTo(hr * 1.55, 0);
        ctx.lineTo(hr * 1.85, -hr * 0.15);
        ctx.moveTo(hr * 1.55, 0);
        ctx.lineTo(hr * 1.85, hr * 0.15);
        ctx.stroke();
      }

      ctx.restore();

      /* Nombre */
      this._drawNameTag(ctx, s);
    }

    _drawNameTag(ctx, s) {
      if (!s.name) return;
      if (!s.isPlayer && this.quality < 0.5 && s.mass < 140) return;
      const zoom = this.cam.zoom;
      const fontSize = Math.max(8, 11 / zoom);
      const R = s.radius * (s.radiusScale || 1);
      const y = s.y - R - 13 / zoom;
      ctx.save();
      ctx.font = '600 ' + fontSize.toFixed(1) + 'px Rajdhani, sans-serif';
      try { ctx.letterSpacing = (1 / zoom) + 'px'; } catch (err) { /* noop */ }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = s.isPlayer ? 'rgba(180,255,255,.9)' : WZ.rgba(s.skin.glow, 0.63);
      ctx.shadowColor = 'rgba(0,0,0,.85)';
      ctx.shadowBlur = 4 / zoom;
      ctx.fillText(s.name, s.x, y);
      ctx.restore();
    }

    _drawParticles(ctx) {
      if (!this.particles.length) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const stride = this.quality < 0.55 ? 2 : 1;
      for (let i = 0; i < this.particles.length; i += stride) {
        const p = this.particles[i];
        if (!this._inView(p.x, p.y, 30)) continue;
        const a = Math.max(0, p.life / p.max);
        ctx.globalAlpha = a * 0.85;
        if (p.shape === 'streak') {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(0.8, p.size * 0.9);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05);
          ctx.stroke();
        } else {
          const size = p.size * (0.6 + a * 0.8) * 4.2;
          ctx.drawImage(this._glowSprite(p.color), p.x - size / 2, p.y - size / 2, size, size);
        }
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    _drawFloats(ctx) {
      if (!this.floats.length) return;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const f of this.floats) {
        if (!this._inView(f.x, f.y, 60)) continue;
        const a = Math.min(1, f.life / (f.max * 0.35));
        const size = f.size / this.cam.zoom;
        ctx.globalAlpha = a;
        ctx.font = '800 ' + size.toFixed(1) + 'px Rajdhani, sans-serif';
        ctx.fillStyle = f.color;
        ctx.shadowColor = 'rgba(0,0,0,.8)';
        ctx.shadowBlur = 4;
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    _drawScreenFx(ctx) {
      /* Aviso de borde */
      if (this.edgeWarning > 0.02) {
        const flicker = 0.72 + 0.28 * Math.sin(this.renderTime * 7);
        const g = ctx.createRadialGradient(
          this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.26,
          this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.74
        );
        g.addColorStop(0, 'rgba(255,30,80,0)');
        g.addColorStop(0.62, 'rgba(255,30,80,0)');
        g.addColorStop(1, 'rgba(255,32,84,' + (0.32 * this.edgeWarning * flicker).toFixed(3) + ')');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, this.w, this.h);
      }

      /* Ambiente del monstruo. */
      const threat = this.getThreatState();
      if (threat && (threat.state === 'hunting' || threat.state === 'warning')) {
        const hunting = threat.state === 'hunting';
        const pulse = hunting ? 0.72 + 0.28 * Math.sin(this.renderTime * 5.5) : 0.4 + 0.2 * Math.sin(this.renderTime * 3);
        const g = ctx.createRadialGradient(
          this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.2,
          this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.78
        );
        g.addColorStop(0, 'rgba(255,30,80,0)');
        g.addColorStop(0.55, 'rgba(255,30,80,0)');
        g.addColorStop(1, hunting ? 'rgba(255,20,70,' + (0.24 * pulse).toFixed(3) + ')' : 'rgba(255,90,40,' + (0.12 * pulse).toFixed(3) + ')');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, this.w, this.h);
        this._drawThreatArrow(ctx, threat.x, threat.y, hunting ? '#ff4f70' : '#ff9a3d', hunting ? 'MONSTRUO' : 'AMENAZA');
      } else if (threat && threat.state === 'retreat') {
        this._drawThreatArrow(ctx, threat.x, threat.y, '#6bff9a', 'HUIDA');
      }

      /* Reticle de ratón */
      if (!this.touchMode && this.mode === 'playing' && this.pointer.inside) {
        const x = this.pointer.x, y = this.pointer.y;
        const t = this.renderTime;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(90,250,255,.58)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, 8 + Math.sin(t * 4) * 1.1, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(90,250,255,.35)';
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2 + t * 0.9;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(a) * 12, y + Math.sin(a) * 12);
          ctx.lineTo(x + Math.cos(a) * 17, y + Math.sin(a) * 17);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(220,255,255,.9)';
        ctx.beginPath();
        ctx.arc(x, y, 1.7, 0, TAU);
        ctx.fill();
        ctx.restore();
      }

      /* Joystick táctil */
      if (this.touchMode && this.mode === 'playing' && this.pointer.touchActive) {
        const ax = this.pointer.anchorX;
        const ay = this.pointer.anchorY;
        let dx = this.pointer.x2 - ax;
        let dy = this.pointer.y2 - ay;
        const len = Math.hypot(dx, dy);
        const max = 34;
        if (len > max) { dx = dx / len * max; dy = dy / len * max; }
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(60,230,255,.1)';
        ctx.beginPath(); ctx.arc(ax, ay, 46, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(110,235,255,.38)';
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(ax, ay, 46, 0, TAU); ctx.stroke();
        ctx.strokeStyle = 'rgba(140,250,255,.6)';
        ctx.beginPath(); ctx.arc(ax, ay, 8, 0, TAU); ctx.stroke();
        const glow = ctx.createRadialGradient(ax + dx, ay + dy, 0, ax + dx, ay + dy, 34);
        glow.addColorStop(0, 'rgba(130,255,255,.42)');
        glow.addColorStop(1, 'rgba(60,200,255,0)');
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(ax + dx, ay + dy, 34, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(180,255,255,.35)';
        ctx.beginPath(); ctx.arc(ax + dx, ay + dy, 16, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(190,255,255,.6)';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(ax + dx, ay + dy, 16, 0, TAU); ctx.stroke();
        ctx.restore();
      }
    }

    /* ═══════════════════════ SPRITES / TEXTURAS ═══════════════════════ */
    _glowSprite(color) {
      let c = this.sprites.get(color);
      if (c) return c;
      c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, WZ.rgba(color, 1));
      grad.addColorStop(0.22, WZ.rgba(color, 0.62));
      grad.addColorStop(0.52, WZ.rgba(color, 0.18));
      grad.addColorStop(1, WZ.rgba(color, 0));
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      this.sprites.set(color, c);
      return c;
    }

    _buildBackground() {
      const c = document.createElement('canvas');
      c.width = 1200;
      c.height = 900;
      const g = c.getContext('2d');
      const base = g.createLinearGradient(0, 0, 0, c.height);
      base.addColorStop(0, '#050813');
      base.addColorStop(0.55, '#04060e');
      base.addColorStop(1, '#06040f');
      g.fillStyle = base;
      g.fillRect(0, 0, c.width, c.height);

      const blobs = [
        { x: 0.16, y: 0.22, r: 0.34, c: [24, 120, 170], a: 0.13 },
        { x: 0.83, y: 0.16, r: 0.3, c: [105, 45, 170], a: 0.12 },
        { x: 0.62, y: 0.82, r: 0.4, c: [20, 90, 160], a: 0.1 },
        { x: 0.3, y: 0.86, r: 0.28, c: [140, 30, 120], a: 0.08 },
        { x: 0.5, y: 0.44, r: 0.5, c: [10, 40, 80], a: 0.16 }
      ];
      for (const b of blobs) {
        const r = Math.min(c.width, c.height) * b.r;
        const rad = g.createRadialGradient(b.x * c.width, b.y * c.height, 0, b.x * c.width, b.y * c.height, r);
        rad.addColorStop(0, 'rgba(' + b.c[0] + ',' + b.c[1] + ',' + b.c[2] + ',' + b.a + ')');
        rad.addColorStop(0.55, 'rgba(' + b.c[0] + ',' + b.c[1] + ',' + b.c[2] + ',' + (b.a * 0.35) + ')');
        rad.addColorStop(1, 'rgba(' + b.c[0] + ',' + b.c[1] + ',' + b.c[2] + ',0)');
        g.fillStyle = rad;
        g.fillRect(0, 0, c.width, c.height);
      }

      /* Polvo estelar lejano */
      for (let i = 0; i < 120; i++) {
        const x = Math.random() * c.width;
        const y = Math.random() * c.height;
        g.fillStyle = 'rgba(' + randInt(150, 220) + ',' + randInt(210, 255) + ',255,' + rand(0.05, 0.22).toFixed(2) + ')';
        g.fillRect(x, y, rand(0.6, 1.5), rand(0.6, 1.5));
      }
      this.bgTex = c;
    }

    _buildFloor() {
      const size = 1100;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      const mid = size / 2;
      const maxR = size / 2;

      const rad = g.createRadialGradient(mid, mid, 0, mid, mid, maxR);
      rad.addColorStop(0, 'rgba(18,52,88,.42)');
      rad.addColorStop(0.28, 'rgba(13,38,70,.3)');
      rad.addColorStop(0.55, 'rgba(8,24,48,.18)');
      rad.addColorStop(0.82, 'rgba(5,14,30,.06)');
      rad.addColorStop(1, 'rgba(4,8,18,0)');
      g.fillStyle = rad;
      g.fillRect(0, 0, size, size);

      g.strokeStyle = 'rgba(70,145,205,.075)';
      g.lineWidth = 1.2;
      for (let r = maxR * 0.16; r < maxR; r += maxR * 0.14) {
        g.beginPath();
        g.arc(mid, mid, r, 0, TAU);
        g.stroke();
      }

      g.strokeStyle = 'rgba(70,145,205,.045)';
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * TAU;
        g.beginPath();
        g.moveTo(mid + Math.cos(a) * maxR * 0.18, mid + Math.sin(a) * maxR * 0.18);
        g.lineTo(mid + Math.cos(a) * maxR, mid + Math.sin(a) * maxR);
        g.stroke();
      }

      for (let i = 0; i < 900; i++) {
        const a = Math.random() * TAU;
        const r = Math.sqrt(Math.random()) * maxR;
        g.fillStyle = 'rgba(130,205,245,' + rand(0.02, 0.11).toFixed(2) + ')';
        g.fillRect(mid + Math.cos(a) * r, mid + Math.sin(a) * r, rand(0.6, 1.7), rand(0.6, 1.7));
      }
      this.floorTex = c;
    }

    _makeStars() {
      this.stars = [];
      const n = Math.round(clamp((this.w * this.h) / 9000, 130, 290) * (0.62 + this.quality * 0.38));
      for (let i = 0; i < n; i++) {
        this.stars.push({
          x: Math.random(),
          y: Math.random(),
          depth: rand(0.2, 1),
          s: Math.random() < 0.08 ? rand(1.3, 2.1) : rand(0.5, 1.2),
          a: rand(0.2, 0.75),
          tw: rand(0.4, 2.2),
          ph: rand(0, TAU),
          c: Math.random() < 0.2 ? '#a9efff' : (Math.random() < 0.2 ? '#d8c3ff' : '#dff4ff')
        });
      }
    }

    /* ═══════════════════════ INPUT ═══════════════════════ */
    _bindInput() {
      global.addEventListener('resize', this._onResize);
      global.addEventListener('pointermove', this._onPointerMove, { passive: false });
      global.addEventListener('pointerdown', this._onPointerDown, { passive: false });
      global.addEventListener('pointerup', this._onPointerUp, { passive: false });
      global.addEventListener('pointercancel', this._onPointerUp, { passive: false });
      global.addEventListener('pointerout', (e) => {
        if (!e.relatedTarget) this.pointer.inside = false;
      });
      global.addEventListener('keydown', this._onKeyDown);
      global.addEventListener('keyup', this._onKeyUp);
      global.addEventListener('blur', () => {
        this.keys.clear();
        this.pointer.down = false;
        this.pointer.touchActive = false;
        this.pointer.touchBoostHeld = false;
        this.pointer.touchId = -1;
        this.audio.setBoost(false);
        this.boostAudioOn = false;
      });
      this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    _onPointerMove(e) {
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.pointer.inside = true;
      if (e.pointerType === 'touch') {
        this.touchMode = true;
        this.lastTouchAt = performance.now();
        if (document.body) document.body.classList.add('touch-mode');
        if (this.pointer.touchActive && e.pointerId === this.pointer.touchId) {
          this.pointer.x2 = e.clientX;
          this.pointer.y2 = e.clientY;
          this.pointer.moved = true;
          if (this.mode === 'playing') e.preventDefault();
        }
      } else if (this.touchMode && !this.pointer.touchActive && performance.now() - this.lastTouchAt > 700) {
        this.touchMode = false;
        if (document.body) document.body.classList.remove('touch-mode');
      }
    }

    _onPointerDown(e) {
      if (e.pointerType === 'touch') {
        this.touchMode = true;
        this.lastTouchAt = performance.now();
        if (document.body) document.body.classList.add('touch-mode');
      }
      const el = e.target;
      if (el && el.closest && el.closest('button, a, input, textarea, select, .screen.open')) return;
      if (e.pointerType === 'touch') {
        if (this.mode === 'playing') {
          /* Un segundo dedo no roba el control mientras se mantiene el primero. */
          if (this.pointer.touchActive && this.pointer.touchId !== e.pointerId) return;

          const now = performance.now();
          const tapDx = e.clientX - this.pointer.lastTapX;
          const tapDy = e.clientY - this.pointer.lastTapY;
          const doubleTap = this.pointer.lastTapAt > 0 &&
            now - this.pointer.lastTapAt < 330 &&
            tapDx * tapDx + tapDy * tapDy < 70 * 70;

          this.pointer.touchActive = true;
          this.pointer.touchId = e.pointerId;
          this.pointer.anchorX = e.clientX;
          this.pointer.anchorY = e.clientY;
          this.pointer.x2 = e.clientX;
          this.pointer.y2 = e.clientY;
          this.pointer.x = e.clientX;
          this.pointer.y = e.clientY;
          this.pointer.moved = false;
          this.pointer.touchBoostHeld = doubleTap;
          if (doubleTap) {
            this.pointer.lastTapAt = 0;
            if (this.player && this.player.alive && this.player.mass > 12) {
              this._addFloat(this.player.x, this.player.y - this.player.radius * 2.2, 'TURBO', '#b9ff3d', false);
            }
          } else {
            this.pointer.lastTapAt = now;
          }
          this.pointer.lastTapX = e.clientX;
          this.pointer.lastTapY = e.clientY;
          e.preventDefault();
        }
      } else {
        if (this.touchMode && !this.pointer.touchActive && performance.now() - this.lastTouchAt > 700) {
          this.touchMode = false;
          if (document.body) document.body.classList.remove('touch-mode');
        }
        this.pointer.inside = true;
        this.pointer.x = e.clientX;
        this.pointer.y = e.clientY;
        if (this.mode === 'playing') {
          this.pointer.down = true;
          e.preventDefault();
        }
      }
    }

    _onPointerUp(e) {
      if (e.pointerType === 'touch') {
        this.lastTouchAt = performance.now();
        if (this.pointer.touchActive && e.pointerId === this.pointer.touchId) {
          this.pointer.touchActive = false;
          this.pointer.touchBoostHeld = false;
          this.pointer.touchId = -1;
        }
      } else {
        this.pointer.down = false;
      }
    }

    _onKeyDown(e) {
      if (e.code === 'Space') {
        if (this.mode === 'playing' || this.mode === 'paused') e.preventDefault();
        this.keys.add('Space');
        return;
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
        if (this.mode === 'playing') {
          this.keys.add(e.code);
          e.preventDefault();
        }
      }
    }

    _onKeyUp(e) {
      this.keys.delete(e.code);
    }
  }

  global.WZ = global.WZ || {};
  global.WZ.Game = Game;
})(window);
