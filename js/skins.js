/* ═══════════════════════════════════════════════════════════
   WORMZILLA · skins, progreso y utilidades de presentación
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const SKINS = [
    {
      id: 'neon', name: 'NEÓN', price: 0, rarity: 'BASE',
      colors: ['#0fffd4', '#00a8ff', '#7cffb2'], glow: '#31ffe0', accent: '#eaffff',
      eye: '#062a2e', pattern: 'bands', band: 27, trail: 'spark'
    },
    {
      id: 'viper', name: 'VÍBORA', price: 0, rarity: 'BASE',
      colors: ['#b6ff2e', '#37d95a', '#0c7a42'], glow: '#9dff3b', accent: '#eaff9d',
      eye: '#10240b', pattern: 'diamonds', band: 34, trail: 'dust'
    },
    {
      id: 'ember', name: 'ASCUA', price: 0, rarity: 'BASE',
      colors: ['#ffb020', '#ff4a24', '#ffd166'], glow: '#ff7b22', accent: '#ffe7a3',
      eye: '#2a0a04', pattern: 'embers', band: 30, trail: 'ember'
    },
    {
      id: 'venom', name: 'VENENO', price: 300, rarity: 'RARA',
      colors: ['#c6ff00', '#8a2be2', '#39ff88'], glow: '#b6ff22', accent: '#f1ffd0',
      eye: '#1a0b2a', pattern: 'dots', band: 40, trail: 'bubble'
    },
    {
      id: 'nebula', name: 'NEBULA', price: 550, rarity: 'RARA',
      colors: ['#7b5cff', '#ff3ec8', '#3ad9ff'], glow: '#b06bff', accent: '#ffdcff',
      eye: '#12072a', pattern: 'stars', band: 46, trail: 'star'
    },
    {
      id: 'chrome', name: 'CROMO', price: 900, rarity: 'ÉPICA',
      colors: ['#dfe9ff', '#7fa8d9', '#2b4a7a'], glow: '#8fd4ff', accent: '#ffffff',
      eye: '#0a1424', pattern: 'chrome', band: 52, trail: 'spark'
    },
    {
      id: 'rainbow', name: 'ARCOÍRIS', price: 1400, rarity: 'ÉPICA',
      colors: ['#ff3b5c', '#ffb800', '#28e07a', '#00cfff', '#8b5cff'], glow: '#ff6ad5', accent: '#ffffff',
      eye: '#120b1e', pattern: 'rainbow', band: 30, trail: 'rainbow'
    },
    {
      id: 'phantom', name: 'ESPECTRO', price: 2100, rarity: 'LEGENDARIA',
      colors: ['#d7f6ff', '#7fd5ff', '#2b5a8c'], glow: '#a9e8ff', accent: '#ffffff',
      eye: '#08131f', pattern: 'circuit', band: 50, trail: 'wisp', ghost: true
    },
    {
      id: 'wormzilla', name: 'WORMZILLA', price: 3200, rarity: 'LEGENDARIA',
      colors: ['#2a7a4b', '#0c3b26', '#9dff3a'], glow: '#6dff6a', accent: '#c6ff3a',
      eye: '#071a0c', pattern: 'spikes', band: 36, trail: 'spore', accessory: 'horns', bigHead: true
    },
    {
      id: 'solaris', name: 'SOLARIS', price: 4500, rarity: 'MITOLÓGICA',
      colors: ['#ffd34d', '#ff8a00', '#fff2a8'], glow: '#ffc233', accent: '#fff7cf',
      eye: '#2a1604', pattern: 'corona', band: 40, trail: 'spark', accessory: 'crown'
    }
  ];

  const byId = Object.create(null);
  for (const s of SKINS) byId[s.id] = s;

  const SAVE_KEY = 'wormzilla.save.v1';
  const DEFAULT_SAVE = {
    points: 0,
    unlocked: ['neon', 'viper', 'ember'],
    selected: 'neon',
    best: 0,
    games: 0,
    kills: 0,
    muted: false,
    seenTutorial: false
  };

  function loadSave() {
    const out = Object.assign({}, DEFAULT_SAVE, { unlocked: DEFAULT_SAVE.unlocked.slice() });
    try {
      const raw = global.localStorage.getItem(SAVE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          if (Number.isFinite(data.points)) out.points = Math.max(0, Math.floor(data.points));
          if (Number.isFinite(data.best)) out.best = Math.max(0, Math.floor(data.best));
          if (Number.isFinite(data.games)) out.games = Math.max(0, Math.floor(data.games));
          if (Number.isFinite(data.kills)) out.kills = Math.max(0, Math.floor(data.kills));
          if (typeof data.muted === 'boolean') out.muted = data.muted;
          if (typeof data.seenTutorial === 'boolean') out.seenTutorial = data.seenTutorial;
          if (Array.isArray(data.unlocked)) {
            const valid = data.unlocked.filter((id) => byId[id]);
            if (valid.length) out.unlocked = Array.from(new Set(['neon', 'viper', 'ember'].concat(valid)));
          }
          if (typeof data.selected === 'string' && byId[data.selected] && out.unlocked.includes(data.selected)) {
            out.selected = data.selected;
          }
        }
      }
    } catch (err) { /* almacenamiento no disponible: memoria */ }
    if (!out.unlocked.includes(out.selected)) out.selected = 'neon';
    return out;
  }

  function persist(save) {
    try { global.localStorage.setItem(SAVE_KEY, JSON.stringify(save)); }
    catch (err) { /* modo privado o file:// restringido */ }
  }

  function getSkin(id) { return byId[id] || SKINS[0]; }

  const numberFormat = (() => {
    try { return new Intl.NumberFormat('es-ES'); }
    catch (err) { return { format: (n) => String(n) }; }
  })();

  function fmt(n) {
    return numberFormat.format(Math.max(0, Math.floor(n)));
  }

  function timeFmt(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  /* Convierte #rrggbb a componentes. */
  function hexRgb(hex) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const v = parseInt(h, 16);
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
  }

  function mix(hexA, hexB, t) {
    const a = hexRgb(hexA), b = hexRgb(hexB);
    const r = Math.round(a.r + (b.r - a.r) * t);
    const g = Math.round(a.g + (b.g - a.g) * t);
    const bl = Math.round(a.b + (b.b - a.b) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  function rgba(hex, a) {
    const c = hexRgb(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
  }

  function colorAt(skin, t, time) {
    const colors = skin.colors;
    if (skin.pattern === 'rainbow') {
      const hue = (t * 260 + time * 34) % 360;
      return 'hsl(' + hue.toFixed(0) + ',92%,62%)';
    }
    if (skin.pattern === 'chrome') {
      const wave = Math.sin(t * 15 + time * 1.1) * 0.5 + 0.5;
      return mix(colors[1], colors[0], wave * 0.8 + 0.08);
    }
    const band = Math.floor(t * 24) % colors.length;
    if (skin.pattern === 'bands' || skin.pattern === 'embers' || skin.pattern === 'corona') {
      return colors[band];
    }
    if (skin.pattern === 'dots' || skin.pattern === 'diamonds') {
      return mix(colors[0], colors[1], (Math.floor(t * 13) % 2) * 0.42);
    }
    if (skin.pattern === 'stars') {
      return mix(colors[0], colors[2], (Math.sin(t * 9 + time) * 0.5 + 0.5) * 0.55);
    }
    if (skin.pattern === 'circuit') return colors[2];
    if (skin.pattern === 'spikes') return mix(colors[0], colors[1], Math.floor(t * 10) % 2 ? 0.55 : 0);
    return colors[Math.floor(t * colors.length) % colors.length];
  }

  /* ── Miniatura animada de piel para la tienda ── */
  function drawSkinPreview(ctx, skin, w, h, time) {
    ctx.clearRect(0, 0, w, h);
    if (w < 10 || h < 10) return;

    const baseY = h * 0.56;
    const amp = h * 0.115;
    const x0 = -16;
    const x1 = w * 0.79;
    const samples = 64;
    const pts = [];
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const x = x0 + (x1 - x0) * t;
      const y = baseY + Math.sin(t * 7.2 + time * 1.25) * amp * (0.7 + t * 0.3);
      pts.push({ x, y, t });
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const bgGlow = ctx.createRadialGradient(w * 0.52, h * 0.54, 0, w * 0.52, h * 0.54, w * 0.5);
    bgGlow.addColorStop(0, rgba(skin.glow, 0.13));
    bgGlow.addColorStop(0.55, rgba(skin.glow, 0.035));
    bgGlow.addColorStop(1, rgba(skin.glow, 0));
    ctx.fillStyle = bgGlow;
    ctx.fillRect(0, 0, w, h);

    /* Reflejo tenue */
    ctx.globalAlpha = 0.13;
    ctx.strokeStyle = rgba(skin.glow, 0.5);
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < pts.length; i += 2) {
      const p = pts[i];
      const y = h - 16 + Math.sin(p.t * 6 + time) * 1.5;
      if (i === 0) ctx.moveTo(p.x, y); else ctx.lineTo(p.x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    /* Aura */
    ctx.strokeStyle = rgba(skin.glow, 0.12);
    ctx.lineWidth = 24;
    ctx.beginPath();
    for (let i = 0; i <= samples; i++) {
      const p = pts[i];
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.strokeStyle = rgba(skin.glow, 0.15);
    ctx.lineWidth = 15;
    ctx.stroke();
    ctx.restore();

    /* Cuerpo segmentado */
    ctx.lineCap = 'round';
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const t = b.t;
      const radius = 2.6 + 7.4 * Math.pow(t, 0.72);
      ctx.strokeStyle = colorAt(skin, t, time);
      ctx.lineWidth = radius * 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    /* Brillo tubular */
    ctx.globalAlpha = skin.ghost ? 0.22 : 0.32;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const y = p.y - (2.5 + 4.2 * p.t);
      if (i === 0) ctx.moveTo(p.x, y); else ctx.lineTo(p.x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    /* Patrones */
    ctx.save();
    if (skin.pattern === 'spikes') {
      ctx.fillStyle = rgba(skin.accent, 0.88);
      for (let i = 5; i < samples - 3; i += 6) {
        const p = pts[i];
        const q = pts[i + 1];
        const ang = Math.atan2(q.y - p.y, q.x - p.x) + Math.PI / 2;
        const r = 2.6 + 7.4 * Math.pow(p.t, 0.72);
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(p.x + Math.cos(ang) * r * side, p.y + Math.sin(ang) * r * side);
          ctx.lineTo(p.x + Math.cos(ang) * (r + 5) * side + Math.cos(ang + Math.PI / 2) * 2.2,
            p.y + Math.sin(ang) * (r + 5) * side + Math.sin(ang + Math.PI / 2) * 2.2);
          ctx.lineTo(p.x + Math.cos(ang) * r * side + Math.cos(ang - Math.PI / 2) * 1.8,
            p.y + Math.sin(ang) * r * side + Math.sin(ang - Math.PI / 2) * 1.8);
          ctx.closePath();
          ctx.fill();
        }
      }
    } else if (skin.pattern === 'circuit') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(skin.accent, 0.75);
      ctx.lineWidth = 1;
      ctx.setLineDash([7, 13]);
      ctx.lineDashOffset = -time * 22;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (skin.pattern === 'stars') {
      ctx.fillStyle = rgba(skin.accent, 0.85);
      for (let i = 7; i < samples - 2; i += 8) {
        const p = pts[i];
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(time * 2 + i));
        ctx.globalAlpha = tw;
        ctx.beginPath();
        ctx.arc(p.x + Math.sin(i * 4.2) * 4, p.y - 4 - Math.cos(i) * 3, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (skin.pattern === 'dots') {
      ctx.fillStyle = rgba(skin.accent, 0.55);
      for (let i = 5; i < samples - 3; i += 5) {
        const p = pts[i];
        ctx.beginPath();
        ctx.arc(p.x, p.y + Math.sin(i * 2.3) * 3, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (skin.pattern === 'diamonds') {
      ctx.fillStyle = rgba(skin.colors[2], 0.7);
      for (let i = 6; i < samples - 4; i += 7) {
        const p = pts[i];
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-2.2, -2.2, 4.4, 4.4);
        ctx.restore();
      }
    } else if (skin.pattern === 'corona') {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 4; i < samples - 2; i += 10) {
        const p = pts[i];
        ctx.globalAlpha = 0.25 + 0.2 * Math.sin(time * 2 + i);
        ctx.fillStyle = '#fff6c5';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    /* Cabeza */
    const head = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    const angle = Math.atan2(head.y - prev.y, head.x - prev.x);
    const hr = 10.4;

    ctx.save();
    ctx.translate(head.x, head.y);
    ctx.rotate(angle);
    ctx.globalCompositeOperation = 'lighter';
    const hg = ctx.createRadialGradient(0, 0, 0, 0, 0, hr * 3.1);
    hg.addColorStop(0, rgba(skin.glow, 0.34));
    hg.addColorStop(1, rgba(skin.glow, 0));
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(0, 0, hr * 3.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (skin.accessory === 'horns') {
      ctx.save();
      ctx.translate(head.x, head.y);
      ctx.rotate(angle);
      ctx.fillStyle = '#d6ffd8';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-2, side * hr * 0.55);
        ctx.quadraticCurveTo(-13, side * hr * 0.9, -17, side * hr * 0.55);
        ctx.quadraticCurveTo(-10, side * hr * 0.48, -4, side * hr * 0.3);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    } else if (skin.accessory === 'crown') {
      ctx.save();
      ctx.translate(head.x, head.y);
      ctx.rotate(angle);
      ctx.strokeStyle = 'rgba(255,231,150,.9)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, hr + 4, -2.2, 2.2);
      ctx.stroke();
      ctx.fillStyle = '#ffe58a';
      for (let i = -2; i <= 2; i++) {
        const a = i * 0.42;
        const x = Math.cos(a) * (hr + 6), y = Math.sin(a) * (hr + 6);
        ctx.beginPath();
        ctx.moveTo(x, y - 2.5);
        ctx.lineTo(x + 1.6, y + 1.4);
        ctx.lineTo(x - 1.6, y + 1.4);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    /* Cabeza y ojos */
    ctx.fillStyle = skin.ghost ? rgba(skin.colors[0], 0.82) : skin.colors[0];
    ctx.beginPath();
    ctx.arc(head.x, head.y, hr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba('#02060e', 0.45);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.save();
    ctx.translate(head.x, head.y);
    ctx.rotate(angle);
    const eyeR = 2.9;
    for (const side of [-1, 1]) {
      const ex = hr * 0.38, ey = side * hr * 0.45;
      ctx.fillStyle = '#f4ffff';
      ctx.beginPath();
      ctx.arc(ex, ey, eyeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = skin.eye;
      ctx.beginPath();
      ctx.arc(ex + 1, ey, eyeR * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath();
      ctx.arc(ex + 0.2, ey - 0.9, 0.75, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    /* Chispas ambientales */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const sx = w * (0.14 + 0.72 * ((i * 0.213 + time * 0.008) % 1));
      const sy = h * (0.24 + 0.4 * ((i * 0.371 + time * 0.013) % 1));
      const a = 0.15 + 0.35 * (0.5 + 0.5 * Math.sin(time * 1.6 + i * 2.7));
      ctx.fillStyle = rgba(skin.accent, a * 0.5);
      ctx.beginPath();
      ctx.arc(sx, sy, 0.9 + (i % 2) * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  global.WZ = global.WZ || {};
  global.WZ.SKINS = SKINS;
  global.WZ.getSkin = getSkin;
  global.WZ.loadSave = loadSave;
  global.WZ.persist = persist;
  global.WZ.fmt = fmt;
  global.WZ.timeFmt = timeFmt;
  global.WZ.hexRgb = hexRgb;
  global.WZ.rgba = rgba;
  global.WZ.mix = mix;
  global.WZ.colorAt = colorAt;
  global.WZ.drawSkinPreview = drawSkinPreview;
  global.WZ.SAVE_KEY = SAVE_KEY;
})(window);
