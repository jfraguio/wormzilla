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
  const MAX_PARTICLES = 900;
  const BLOOM_SCALE = 0.42;
  const START_MASS = 22;
  const MAX_AI_MASS = 900;

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
      this.runStats = { massEaten: 0, kills: 0, killedBy: '', cause: '' };
      this.finalMass = 0;
      this.finalStats = null;
      this.deathTimer = 0;
      this.deathPos = { x: 0, y: 0 };
      this.ended = false;
      this.deathReason = '';

      this.pointer = {
        x: 0, y: 0, inside: false, down: false,
        touchActive: false, touchId: -1,
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
      const dt = clamp((ts - this.lastTs) / 1000, 0.001, 0.05);
      this.lastTs = ts;
      this.renderTime += dt;
      this._update(dt);
      this._render(dt);
      if (this.onFrame) this.onFrame(dt);
      global.requestAnimationFrame(this._loop);
    }

    _resize() {
      const w = Math.max(320, global.innerWidth || 1);
      const h = Math.max(240, global.innerHeight || 1);
      this.w = w;
      this.h = h;
      this.dpr = Math.min(2, global.devicePixelRatio || 1);
      this.canvas.width = Math.round(w * this.dpr);
      this.canvas.height = Math.round(h * this.dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.bloomCanvas.width = Math.max(2, Math.round(w * BLOOM_SCALE));
      this.bloomCanvas.height = Math.max(2, Math.round(h * BLOOM_SCALE));
      this.ctx.imageSmoothingEnabled = true;
      this.bctx.imageSmoothingEnabled = true;
      if (!this.pointer.inside) {
        this.pointer.x = w * 0.66;
        this.pointer.y = h * 0.5;
      }
      this._makeStars();
    }

    /* ═══════════════════════ ESTADOS ═══════════════════════ */
    start(skinId) {
      this._resetWorld(true, skinId);
      this.mode = 'playing';
      this.keys.clear();
      this.pointer.down = false;
      this.pointer.touchActive = false;
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
    }

    resume() {
      if (this.mode !== 'paused') return;
      this.mode = 'playing';
      this.audio.setDucked(false);
      this.pointer.down = false;
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
        cause: this.runStats.cause
      };
    }

    /* ═══════════════════════ MUNDO ═══════════════════════ */
    _resetWorld(withPlayer, skinId) {
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
      this.combo = 0;
      this.comboTimer = 0;
      this.comboMax = 0;
      this.runTime = 0;
      this.runStats = { massEaten: 0, kills: 0, killedBy: '', cause: '' };
      this.finalMass = 0;
      this.finalStats = null;
      this.ended = false;
      this.deathTimer = 0;
      this.deathReason = '';
      this.edgeWarning = 0;
      this.shake = 0;
      this.spawnedNames.clear();

      this._createFood(FOOD_TARGET);

      if (withPlayer) {
        const skin = (global.WZ && WZ.getSkin) ? WZ.getSkin(skinId) : null;
        this._createAICohort(3);
        this._spawnPlayer(skin);
        this.mode = 'playing';
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
        spawnProtect: 0
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

      for (const s of this.snakes) {
        if (s.alive) this._updateSnake(s, worldDt);
      }
      this._buildHash();
      this._handleCollisions();
      this._cleanupDead();

      this._updateFood(worldDt);
      this._updateParticles(worldDt);
      this._updateFloats(worldDt);
      this._updateGold(worldDt);

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
      let boosting = false;
      if (s.isPlayer) {
        s.targetAngle = this._playerDesiredAngle(s);
        boosting = this._isBoosting() && s.mass > 12;
      } else {
        this._aiThink(s, dt);
        s.targetAngle = s.ai.desired;
        boosting = s.ai.boostTimer > 0 && s.mass > 30;
        if (boosting) s.ai.boostTimer -= dt;
      }

      const diff = angDiff(s.angle, s.targetAngle);
      const maxTurn = s.turnRate * (boosting ? 0.9 : 1) * dt;
      s.angle += clamp(diff, -maxTurn, maxTurn);

      const speed = s.baseSpeed * (boosting ? 1.68 : 1);
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

      if (s.isPlayer) {
        if (boosting) this._emitBoostTrail(s);
        else if (Math.random() < dt * 8) this._emitIdleTrail(s);
      } else if (s.ai) {
        s.ai.trailTimer -= dt;
        if (s.ai.trailTimer <= 0) {
          s.ai.trailTimer = rand(0.18, 0.5);
          this._emitIdleTrail(s);
        }
      }

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
      return false;
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

      /* Buscar comida cercana */
      let targetX = null, targetY = null;
      let bestScore = Infinity;
      const lookR2 = 640 * 640;
      const cosA = Math.cos(s.angle), sinA = Math.sin(s.angle);
      for (let i = 0; i < this.food.length; i++) {
        const o = this.food[i];
        const dx = o.x - s.x, dy = o.y - s.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > lookR2) continue;
        let sc = d2;
        const dot = (dx * cosA + dy * sinA) / (Math.sqrt(d2) + 0.001);
        if (dot < -0.25) sc *= 2.0;
        if (o.kind === 'gold') sc *= 0.18;
        else if (o.kind === 'loot') sc /= (1 + o.value * 0.22);
        if (sc < bestScore) {
          bestScore = sc;
          targetX = o.x;
          targetY = o.y;
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

    /* ═══════════════════════ HASH / COLISIONES ═══════════════════════ */
    _buildHash() {
      this.hash.clear();
      for (const s of this.snakes) {
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
      const cx = Math.floor(s.x / CELL);
      const cy = Math.floor(s.y / CELL);
      const reach = s.radius + 34;
      const cells = Math.ceil(reach / CELL) + 1;
      for (let ox = -cells; ox <= cells; ox++) {
        for (let oy = -cells; oy <= cells; oy++) {
          const arr = this.hash.get((cx + ox + 500) * 2000 + (cy + oy + 500));
          if (!arr) continue;
          for (let i = 0; i < arr.length; i++) {
            const p = arr[i];
            const owner = p.owner;
            if (!owner || owner === s || !owner.alive) continue;
            const threshold = s.radius * 0.57 + owner.radius * 0.82;
            const dx = p.x - s.x, dy = p.y - s.y;
            if (dx * dx + dy * dy < threshold * threshold) return owner;
          }
        }
      }
      return null;
    }

    _handleCollisions() {
      const alive = this.snakes.filter((s) => s.alive);

      /* Cabeza con cabeza */
      for (let i = 0; i < alive.length; i++) {
        const a = alive[i];
        if (!a.alive) continue;
        for (let j = i + 1; j < alive.length; j++) {
          const b = alive[j];
          if (!b.alive) continue;
          if ((a.isPlayer && a.spawnProtect > 0) || (b.isPlayer && b.spawnProtect > 0)) continue;
          const rr = (a.radius + b.radius) * 0.56;
          if (dist2(a.x, a.y, b.x, b.y) < rr * rr) {
            this._killSnake(a, b, 'head');
            this._killSnake(b, a, 'head');
          }
        }
      }

      /* Cabeza contra cuerpo */
      for (const s of this.snakes) {
        if (!s.alive) continue;
        const owner = this._headBodyHit(s);
        if (owner && owner.alive && s.alive) {
          if (s.spawnProtect > 0 || owner.spawnProtect > 0) continue;
          this._killSnake(s, owner, 'body');
        }
      }

      /* Borde del anillo */
      for (const s of this.snakes) {
        if (!s.alive || s.spawnProtect > 0) continue;
        if (Math.hypot(s.x, s.y) > WORLD_R + 12) {
          this._killSnake(s, null, 'border');
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
        } else {
          this.runStats.cause = killer ? 'IMPACTO CONTRA ' + killer.name : 'EL VACÍO';
        }
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
        this._addFloat(s.x, s.y, 'BAJA', '#ff6ad5', true);
        if (near) {
          this.audio.kill(this._panFor(s.x));
          this.shake = 9;
        }
        if (this.callbacks && this.callbacks.onKill) this.callbacks.onKill(s);
      } else if (near) {
        this.audio.kill(this._panFor(s.x) * 0.5);
        this.shake = 5;
      }
      this._explode(s, 46);
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
      const heads = [];
      if (player) heads.push(player);
      for (const s of this.snakes) if (s.alive && !s.isPlayer) heads.push(s);

      let deficit = 0;
      for (let i = this.food.length - 1; i >= 0; i--) {
        const o = this.food[i];

        if (o.kind === 'gold') {
          o.phase += dt * 1.7;
          let eater = null;
          for (let h = 0; h < heads.length; h++) {
            const s = heads[h];
            const rr = s.radius * 0.92 + o.r + 6;
            const dx = o.x - s.x, dy = o.y - s.y;
            if (dx * dx + dy * dy < rr * rr) { eater = s; break; }
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

        /* Imán del jugador */
        if (player) {
          const pullR = player.radius * 4.4 + o.r * 2.2;
          const dx = player.x - o.x, dy = player.y - o.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < pullR * pullR && d2 > 64) {
            const d = Math.sqrt(d2);
            const f = (1 - d / pullR) * 620 * dt;
            o.x += (dx / d) * f;
            o.y += (dy / d) * f;
          }
        }

        let eater = null;
        for (let h = 0; h < heads.length; h++) {
          const s = heads[h];
          const rr = s.radius * 0.92 + o.r + 6;
          const dx = o.x - s.x, dy = o.y - s.y;
          if (dx * dx + dy * dy < rr * rr) { eater = s; break; }
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

    /* ═══════════════════════ PARTÍCULAS ═══════════════════════ */
    _spawnParticles(x, y, color, count, spMin, spMax, lifeMin, lifeMax, sizeMin, sizeMax, drag) {
      const n = Math.min(count, MAX_PARTICLES - this.particles.length);
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
          drag: drag === undefined ? 2.6 : drag
        });
      }
      if (this.particles.length > MAX_PARTICLES) {
        this.particles.splice(0, this.particles.length - MAX_PARTICLES);
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
        const growth = Math.pow(11.6 / p.radius, 0.62);
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

      /* muestra de comida */
      ctx.fillStyle = 'rgba(80,190,240,.2)';
      for (let i = 0; i < this.food.length; i += 9) {
        const o = this.food[i];
        if (o.kind === 'gold') continue;
        ctx.fillRect(o.x * scale - 0.6, o.y * scale - 0.6, 1.2, 1.2);
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
      this.visibleFood = [];
      for (const o of this.food) {
        if (o.x > this.view.x0 - 40 && o.x < this.view.x1 + 40 &&
            o.y > this.view.y0 - 40 && o.y < this.view.y1 + 40) {
          this.visibleFood.push(o);
        }
      }
      this.visibleSnakes = [];
      for (const s of this.snakes) {
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
        const scale = 1 + 0.16 * Math.sin(o.phase * 2.2 + this.renderTime * 2.8);
        const size = o.r * (o.kind === 'gold' ? 9 : 7) * scale;
        b.globalAlpha = o.kind === 'gold' ? 0.72 : 0.4;
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
        const size = p.radius * 15;
        b.globalAlpha = 0.55;
        b.drawImage(this._glowSprite(p.skin.glow), p.x - size / 2, p.y - size / 2, size, size);
        if (p.boostPulse > 0) {
          b.globalAlpha = 0.4 * p.boostPulse;
          b.fillStyle = p.skin.glow;
          b.beginPath();
          b.arc(p.x, p.y, p.radius * (1.6 + (1 - p.boostPulse) * 2.4), 0, TAU);
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
      b.strokeStyle = WZ.rgba(s.skin.glow, 0.17);
      b.lineWidth = s.radius * 2.5;
      b.beginPath();
      b.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < n; i += 2) b.lineTo(pts[i].x, pts[i].y);
      if (n % 2 === 0) b.lineTo(pts[n - 1].x, pts[n - 1].y);
      b.stroke();

      b.strokeStyle = WZ.rgba(s.skin.glow, 0.075);
      b.lineWidth = s.radius * 4.2;
      b.beginPath();
      b.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < n; i += 3) b.lineTo(pts[i].x, pts[i].y);
      b.stroke();

      const hg = s.radius * (s.skin.bigHead ? 6.2 : 4.2);
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
      this._drawParticles(ctx);
      this._drawFloats(ctx);
      ctx.restore();

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.72;
      ctx.drawImage(this.bloomCanvas, 0, 0, this.w, this.h);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      this._drawScreenFx(ctx);
    }

    _spine(s) {
      const pts = this._spineCache || (this._spineCache = []);
      pts.length = 0;
      pts.push({ x: s.x, y: s.y });
      const body = s.points;
      for (let i = 0; i < body.length; i++) {
        const p = body[i];
        const last = pts[pts.length - 1];
        const dx = p.x - last.x, dy = p.y - last.y;
        if (dx * dx + dy * dy > 2.2) pts.push(p);
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
      ctx.globalAlpha = 0.92;
      ctx.drawImage(this.floorTex, -WORLD_R, -WORLD_R, WORLD_R * 2, WORLD_R * 2);
      ctx.globalAlpha = 1;
    }

    _drawGrid(ctx) {
      const spacing = 160;
      const z = this.cam.zoom;
      const halfW = this.w / (2 * z) + 80;
      const halfH = this.h / (2 * z) + 80;
      const x0 = Math.floor((this.cam.x - halfW) / spacing) * spacing;
      const y0 = Math.floor((this.cam.y - halfH) / spacing) * spacing;
      const x1 = this.cam.x + halfW;
      const y1 = this.cam.y + halfH;
      ctx.fillStyle = 'rgba(92,170,225,.16)';
      for (let x = x0; x < x1; x += spacing) {
        for (let y = y0; y < y1; y += spacing) {
          if (x * x + y * y > WORLD_R * WORLD_R) continue;
          const ix = Math.round(x / spacing);
          const iy = Math.round(y / spacing);
          if ((ix + iy) % 4 === 0) {
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
        const size = o.r * (o.kind === 'gold' ? 6 : 4.2) * pulse;
        ctx.globalAlpha = o.kind === 'gold' ? 0.7 : 0.4;
        ctx.drawImage(this._glowSprite(o.color), o.x - size / 2, o.y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      for (let i = 0; i < this.visibleFood.length; i++) {
        const o = this.visibleFood[i];
        const pulse = 1 + 0.16 * Math.sin(o.phase * 2.1 + this.renderTime * 2.7);
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

    _drawSnakeBody(ctx, s) {
      const pts = this._spine(s);
      const n = pts.length;
      if (n < 3) return;
      const skin = s.skin;
      const R = s.radius;
      const ghost = !!skin.ghost;
      const mainEnd = Math.max(2, Math.min(n - 1, Math.floor(n * 0.86)));

      const path = new Path2D();
      path.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i <= mainEnd; i++) path.lineTo(pts[i].x, pts[i].y);

      ctx.save();
      if (ghost) ctx.globalAlpha = 0.82;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      /* Contorno continuo: silueta limpia incluso en curvas cerradas. */
      ctx.globalAlpha = ghost ? 0.3 : 0.62;
      ctx.strokeStyle = '#02060e';
      ctx.lineWidth = R * 2 + Math.max(2.5, R * 0.2);
      ctx.stroke(path);

      /* Base del cuerpo. */
      ctx.globalAlpha = ghost ? 0.82 : 1;
      ctx.strokeStyle = skin.colors[0];
      ctx.lineWidth = R * 2;
      ctx.stroke(path);

      if (skin.pattern === 'chrome' || skin.pattern === 'stars') {
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
        ctx.stroke(path);
      } else {
        /* Bandas suaves mediante trazos discontinuos sobre la misma ruta. */
        const cols = skin.colors;
        const N = cols.length;
        if (N > 1) {
          const band = skin.band || 34;
          const offset = skin.pattern === 'rainbow' ? this.renderTime * 24 : 0;
          ctx.lineCap = 'butt';
          for (let i = 0; i < N; i++) {
            ctx.strokeStyle = cols[i];
            ctx.setLineDash([band, band * (N - 1)]);
            ctx.lineDashOffset = -i * band - offset;
            ctx.stroke(path);
          }
          ctx.setLineDash([]);
          ctx.lineCap = 'round';
        }
      }

      /* Cola afilada (tramo final). */
      if (mainEnd < n - 1) {
        ctx.globalAlpha = ghost ? 0.3 : 0.58;
        ctx.strokeStyle = '#02060e';
        for (let i = mainEnd + 1; i < n; i++) {
          const p0 = pts[i - 1], p1 = pts[i];
          const t = i / (n - 1);
          const taper = 1 - (t - 0.86) / 0.14 * 0.76;
          const width = R * 2 * Math.max(0.08, taper);
          ctx.lineWidth = width + Math.max(1.2, R * 0.12);
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();
        }
        ctx.globalAlpha = ghost ? 0.82 : 1;
        ctx.lineCap = 'round';
        for (let i = mainEnd + 1; i < n; i++) {
          const p0 = pts[i - 1], p1 = pts[i];
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

      /* Sombra inferior */
      ctx.globalAlpha = ghost ? 0.12 : 0.16;
      ctx.strokeStyle = '#01040a';
      ctx.lineWidth = Math.max(1, R * 0.5);
      ctx.save();
      ctx.translate(0, R * 0.3);
      ctx.stroke(path);
      ctx.restore();

      /* Brillo tubular */
      ctx.globalAlpha = ghost ? 0.18 : 0.2;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1, R * 0.38);
      ctx.save();
      ctx.translate(0, -R * 0.3);
      ctx.stroke(path);
      ctx.restore();

      ctx.globalAlpha = ghost ? 0.82 : 1;

      /* Patrón */
      this._drawSkinPattern(ctx, s, pts, n, R);

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
      const R = s.radius;
      const hr = R * (skin.bigHead ? 1.14 : 1.04);
      const ageBlink = Math.sin(this.renderTime * 1.25 + s.phase) > 0.987;
      const ghost = !!skin.ghost;

      /* Aura de cabeza */
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = ghost ? 0.22 : 0.32;
      const gs = hr * 3.8;
      ctx.drawImage(this._glowSprite(skin.glow), s.x - gs / 2, s.y - gs / 2, gs, gs);
      ctx.restore();

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
        ctx.restore();
      }

      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      if (ghost) ctx.globalAlpha = 0.86;

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
      const zoom = this.cam.zoom;
      const fontSize = Math.max(8, 11 / zoom);
      const y = s.y - s.radius - 13 / zoom;
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
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        if (!this._inView(p.x, p.y, 30)) continue;
        const a = Math.max(0, p.life / p.max);
        ctx.globalAlpha = a * 0.85;
        const size = p.size * (0.6 + a * 0.8) * 4.2;
        ctx.drawImage(this._glowSprite(p.color), p.x - size / 2, p.y - size / 2, size, size);
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
      const n = Math.round(clamp((this.w * this.h) / 9000, 130, 290));
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
      global.addEventListener('resize', this._resize);
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
          this.pointer.touchActive = true;
          this.pointer.touchId = e.pointerId;
          this.pointer.anchorX = e.clientX;
          this.pointer.anchorY = e.clientY;
          this.pointer.x2 = e.clientX;
          this.pointer.y2 = e.clientY;
          this.pointer.x = e.clientX;
          this.pointer.y = e.clientY;
          this.pointer.moved = false;
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
