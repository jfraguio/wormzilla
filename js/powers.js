/* ═══════════════════════════════════════════════════════════
   WORMZILLA · poderes, efectos mágicos y previsualizaciones
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const POWERS = [
    {
      id: 'nova', name: 'NOVA', kind: 'active', price: 2200, rarity: 'PODER',
      color: '#ff5fd2', glow: '#ff3ec8', colors: ['#ff9be6', '#ff3ec8', '#8b5cff'],
      cooldown: 24, duration: 0, radius: 520,
      desc: 'ONDA EXPANSIVA QUE DESTRUYE SERPIENTES CERCANAS',
      tag: 'ACTIVO · 24S',
      icon: '<path d="M12 2l2.1 6.4L20 11l-5.9 2.6L12 20l-2.1-6.4L4 11l5.9-2.6L12 2z" fill="currentColor"/>'
    },
    {
      id: 'micro', name: 'MICRO', kind: 'active', price: 1300, rarity: 'PODER',
      color: '#3df5ff', glow: '#3df5ff', colors: ['#c8feff', '#3df5ff', '#2b89ff'],
      cooldown: 16, duration: 5.5, scale: 0.45, speed: 1.18,
      desc: 'CUERPO MÍNIMO, VELOCIDAD EXTREMA. ESQUIVA TODO',
      tag: 'ACTIVO · 16S',
      icon: '<circle cx="12" cy="12" r="4.3" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.1" stroke-dasharray="2 3"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/>'
    },
    {
      id: 'titan', name: 'TITÁN', kind: 'active', price: 1500, rarity: 'PODER',
      color: '#ffc247', glow: '#ff9d1f', colors: ['#fff0bd', '#ffc247', '#9c5b00'],
      cooldown: 20, duration: 6.5, scale: 1.85, speed: 0.82,
      desc: 'CUERPO COLOSAL. LOS RIVALES SE ESTRELLAN CONTRA TI',
      tag: 'ACTIVO · 20S',
      icon: '<path d="M12 2l8 4.6v10.8L12 22l-8-4.6V6.6L12 2z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 6.5l4.4 2.5v5.9L12 17.5l-4.4-2.6V9z" fill="currentColor" opacity=".55"/>'
    },
    {
      id: 'phantom', name: 'FANTASMA', kind: 'active', price: 2600, rarity: 'PODER',
      color: '#b388ff', glow: '#8b5cff', colors: ['#e9dbff', '#b388ff', '#5b2bd9'],
      cooldown: 26, duration: 4.5, speed: 1.08,
      desc: 'ATRAVIESA LOS CUERPOS Y DESAPARECE ENTRE LA LUZ',
      tag: 'ACTIVO · 26S',
      icon: '<path d="M6 21V10a6 6 0 0 1 12 0v11l-3-2-3 2-3-2-3 2z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="9.5" cy="10" r="1.2" fill="currentColor"/><circle cx="14.5" cy="10" r="1.2" fill="currentColor"/>'
    },
    {
      id: 'magnet', name: 'MAGNETO', kind: 'passive', price: 900, rarity: 'PODER',
      color: '#57ff9a', glow: '#2bff8c', colors: ['#d6ffe9', '#57ff9a', '#0b9f61'],
      cooldown: 0, duration: 0, magnetRadius: 2.35, magnetPull: 1.45,
      desc: 'ATRAE ORBES DESDE MUCHO MÁS LEJOS. SIEMPRE ACTIVO',
      tag: 'PASIVO',
      icon: '<path d="M5 4v8a7 7 0 0 0 14 0V4h-4v8a3 3 0 0 1-6 0V4H5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>'
    }
  ];

  const EFFECTS = [
    {
      id: 'sparks', name: 'CHISPAS', price: 0, rarity: 'EFECTO',
      color: '#eaffff', glow: '#7df9ff', colors: ['#ffffff', '#c8feff', '#7df9ff'],
      mode: 'spark', rate: 0.075, tag: 'ESTELA · DESTELLO',
      desc: 'DESTELLO QUE ATURDE A LOS RIVALES CERCANOS',
      perk: { type: 'flash', name: 'DESTELLO', cooldown: 15, radius: 285, stun: 0.95 },
      icon: '<path d="M12 2l1.7 6.1L20 10l-6.3 1.9L12 18l-1.7-6.1L4 10l6.3-1.9L12 2z" fill="currentColor"/>'
    },
    {
      id: 'fire', name: 'PIRO', price: 300, rarity: 'EFECTO',
      color: '#ffb020', glow: '#ff7b22', colors: ['#ffe98a', '#ff9d1f', '#ff3d1f'],
      mode: 'ember', rate: 0.055, tag: 'ESTELA · PIROCLASTO',
      desc: 'PIROCLASTO QUE QUEMA Y TE DA LA MASA DEL RIVAL',
      perk: { type: 'flare', name: 'PIROCLASTO', cooldown: 14, radius: 245, stun: 1.05, drain: 0.05 },
      icon: '<path d="M12 2c1.4 4.1 5.4 6.5 5.4 11.1A5.4 5.4 0 0 1 12 18.5a5.4 5.4 0 0 1-5.4-5.4C6.6 8.5 10.6 6.1 12 2z" fill="currentColor"/><path d="M12 9c.7 2.1 2.5 3.2 2.5 5.1a2.5 2.5 0 0 1-5 0C9.5 12.2 11.3 11.1 12 9z" fill="#fff3c4" opacity=".85"/>'
    },
    {
      id: 'neon', name: 'NEÓN ELÉCTRICO', price: 450, rarity: 'EFECTO',
      color: '#3df5ff', glow: '#3df5ff', colors: ['#3df5ff', '#ff3ec8', '#fff38a'],
      mode: 'streak', rate: 0.065, tag: 'ESTELA · DESCARGA',
      desc: 'DESCARGA ELÉCTRICA QUE FRENA AL RIVAL MÁS CERCANO',
      perk: { type: 'zap', name: 'DESCARGA', cooldown: 12, radius: 560, stun: 0.95, drain: 0.04 },
      icon: '<path d="M13.5 2 4 13.2h6.1L9.3 22 20 9.8h-6.2L13.5 2z" fill="currentColor"/>'
    },
    {
      id: 'rainbow', name: 'PRISMA', price: 500, rarity: 'EFECTO',
      color: '#ff6ad5', glow: '#ff6ad5', colors: ['#ff3b5c', '#ffb800', '#28e07a', '#00cfff', '#8b5cff'],
      mode: 'rainbow', rate: 0.055, tag: 'ESTELA · PRISMA',
      desc: 'PRISMA: UN INSTANTE DE VELOCIDAD E INMUNIDAD',
      perk: { type: 'prism', name: 'PRISMA', cooldown: 20, duration: 1.35, speed: 1.3, range: 330 },
      icon: '<path d="M3 17a9 9 0 0 1 18 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6.5 17a5.5 5.5 0 0 1 11 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".65"/><path d="M10 17a2 2 0 0 1 4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".4"/>'
    },
    {
      id: 'void', name: 'VACÍO', price: 750, rarity: 'EFECTO',
      color: '#8b5cff', glow: '#8b5cff', colors: ['#a98bff', '#ff3ec8', '#4d2bff'],
      mode: 'void', rate: 0.06, tag: 'ESTELA · SINGULARIDAD',
      desc: 'SINGULARIDAD QUE ABSORBE ORBES Y FRENA RIVALES',
      perk: { type: 'singularity', name: 'SINGULARIDAD', cooldown: 16, radius: 520, duration: 1.9, slow: 0.55 },
      icon: '<path d="M12 3a9 9 0 1 0 9 9 6 6 0 1 1-6-6 3 3 0 1 1-3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'
    },
    {
      id: 'orbit', name: 'ÓRBITA', price: 1000, rarity: 'EFECTO',
      color: '#ffd45e', glow: '#ffd45e', colors: ['#7df9ff', '#ffd45e', '#ff6ad5'],
      mode: 'orbit', rate: 0.12, tag: 'AURA · GUARDIÁN',
      desc: 'GUARDIÁN ORBITAL QUE CASTIGA A QUIEN SE ACERQUE',
      perk: { type: 'orbitguard', name: 'GUARDIÁN', cooldown: 13, radius: 215, stun: 1.2, drain: 0.05 },
      icon: '<circle cx="12" cy="12" r="3.2" fill="currentColor"/><ellipse cx="12" cy="12" rx="9" ry="4" fill="none" stroke="currentColor" stroke-width="1.3" transform="rotate(-25 12 12)"/><circle cx="19" cy="9" r="1.4" fill="currentColor"/>'
    }
  ];

  /* Premios que aparecen entre los orbes. */
  const PICKUPS = [
    {
      id: 'shield', name: 'INMUNIDAD', short: 'ESCUDO', duration: 6.5,
      color: '#7df9ff', glow: '#3df5ff',
      desc: 'ESCUDO TEMPORAL: LOS IMPACTOS Y EL MONSTRUO NO TE MATAN'
    },
    {
      id: 'magnet', name: 'MAGNETISMO', short: 'IMÁN', duration: 10,
      color: '#57ff9a', glow: '#2bff8c',
      desc: 'ATRAE ORBES Y PREMIOS DESDE MUCHÍSIMO MÁS LEJOS'
    },
    {
      id: 'frenzy', name: 'FURIA', short: 'FURIA', duration: 7,
      color: '#ff9a3d', glow: '#ff5f2e',
      desc: 'VELOCIDAD Y GIRO EXTREMOS DURANTE UNOS SEGUNDOS'
    },
    {
      id: 'bolt', name: 'RAYO', short: 'RAYO', duration: 0,
      color: '#ffe85c', glow: '#ffcb45',
      desc: 'FRÍE AL INSTANTE A LA SERPIENTE MÁS CERCANA'
    }
  ];

  const powerById = Object.create(null);
  const effectById = Object.create(null);
  const pickupById = Object.create(null);
  for (const p of POWERS) powerById[p.id] = p;
  for (const e of EFFECTS) effectById[e.id] = e;
  for (const u of PICKUPS) pickupById[u.id] = u;

  function getPower(id) {
    return id && id !== 'none' ? (powerById[id] || null) : null;
  }

  function getEffect(id) {
    return id && id !== 'none' ? (effectById[id] || null) : null;
  }

  function getPickup(id) {
    return id ? (pickupById[id] || null) : null;
  }

  /* Fondo mágico animado para las cartas de poder/efecto. */
  function drawMagicPreview(ctx, item, w, h, time) {
    ctx.clearRect(0, 0, w, h);
    if (!item) return;
    const colors = item.colors || [item.color || '#7df9ff'];
    const glow = item.glow || item.color || '#7df9ff';
    const cx = w * 0.5;
    const cy = h * 0.52;
    const maxR = Math.min(w, h) * 0.48;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 1.6);
    bg.addColorStop(0, WZ.rgba(glow, 0.2));
    bg.addColorStop(0.55, WZ.rgba(glow, 0.055));
    bg.addColorStop(1, WZ.rgba(glow, 0));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const mode = item.mode || item.id;
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.1);

    if (mode === 'nova') {
      for (let i = 0; i < 4; i++) {
        const t = (time * 0.42 + i * 0.25) % 1;
        const r = 18 + t * maxR * 1.15;
        ctx.globalAlpha = (1 - t) * 0.5;
        ctx.strokeStyle = colors[i % colors.length];
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.85;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(time * 0.35);
      ctx.strokeStyle = colors[0];
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 13, Math.sin(a) * 13);
        ctx.lineTo(Math.cos(a) * (24 + pulse * 9), Math.sin(a) * (24 + pulse * 9));
        ctx.stroke();
      }
      ctx.restore();
    } else if (mode === 'micro') {
      ctx.strokeStyle = WZ.rgba(colors[0], 0.45);
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 3; i++) {
        const r = 20 + i * 17 + pulse * 3;
        ctx.globalAlpha = 0.5 - i * 0.09;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = colors[1];
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cx - 8, cy - 4, maxR * 0.52, 0.2, Math.PI * 1.25);
      ctx.stroke();
      ctx.strokeStyle = colors[0];
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(cx + 23, cy + 26);
      ctx.lineTo(cx + 46, cy + 48);
      ctx.stroke();
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = colors[0];
      for (let i = 0; i < 12; i++) {
        const a = time * 0.6 + i * 1.7;
        const r = maxR * (0.25 + ((i * 0.127) % 0.6));
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.7, 1 + (i % 2), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (mode === 'titan') {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(time * 0.12);
      ctx.strokeStyle = WZ.rgba(colors[1], 0.55);
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const r = maxR * (0.55 + pulse * 0.03);
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.strokeStyle = WZ.rgba(colors[0], 0.3);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, maxR * 0.38, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = colors[2];
      for (let i = 0; i < 4; i++) {
        const a = time * 0.35 + i * Math.PI / 2;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * maxR * 0.5, cy + Math.sin(a) * maxR * 0.5, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (mode === 'phantom') {
      for (let i = 0; i < 3; i++) {
        const off = Math.sin(time * 1.2 + i * 2.1) * 12;
        ctx.globalAlpha = 0.14 + i * 0.07;
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        ctx.ellipse(cx + off * (i + 1) * 0.6, cy + Math.sin(time + i) * 8, maxR * 0.32, maxR * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = WZ.rgba(colors[0], 0.5);
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 7]);
      ctx.lineDashOffset = -time * 16;
      ctx.beginPath();
      ctx.arc(cx, cy, maxR * 0.62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (mode === 'magnet') {
      ctx.strokeStyle = WZ.rgba(colors[1], 0.45);
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 4; i++) {
        ctx.globalAlpha = 0.35 - i * 0.06;
        ctx.beginPath();
        ctx.arc(cx, cy, 25 + i * 16, -0.9, 0.9);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, 25 + i * 16, Math.PI - 0.9, Math.PI + 0.9);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.9;
      for (let i = 0; i < 14; i++) {
        const t = (time * 0.35 + i * 0.11) % 1;
        const a = i * 2.4 + time * 0.2;
        const r = 105 * (1 - t);
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.72, 1.4 + (i % 3), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (mode === 'spark') {
      ctx.globalAlpha = 0.8;
      for (let i = 0; i < 26; i++) {
        const a = i * 2.37 + time * (0.25 + i * 0.003);
        const r = (i * 0.091) % 1;
        const x = cx + Math.cos(a) * maxR * r * 1.2;
        const y = cy + Math.sin(a * 1.3) * maxR * r * 0.75;
        const tw = 0.35 + 0.65 * Math.abs(Math.sin(time * 2.2 + i));
        ctx.globalAlpha = tw * 0.65;
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        ctx.arc(x, y, 1 + (i % 3) * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      /* estela curva */
      for (let i = 0; i < 14; i++) {
        const t = i / 14;
        const x = cx - maxR * 0.8 + t * maxR * 1.6;
        const y = cy + Math.sin(t * 5 + time * 1.3) * maxR * 0.24;
        ctx.globalAlpha = 0.25 + t * 0.45;
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        ctx.arc(x, y, 1.5 + t * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (mode === 'ember') {
      for (let i = 0; i < 22; i++) {
        const t = (time * 0.5 + i * 0.083) % 1;
        const x = cx + Math.sin(i * 2.3 + time) * maxR * 0.55 + (i / 22 - 0.5) * maxR * 0.8;
        const y = cy + maxR * 0.45 - t * maxR * 1.0;
        ctx.globalAlpha = (1 - t) * 0.85;
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        ctx.arc(x, y, 1.5 + (1 - t) * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = colors[2];
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const x = cx - 70 + i * 12;
        const y = cy + 28 - Math.sin(i * 0.8 + time * 2) * 6;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else if (mode === 'streak') {
      ctx.lineCap = 'round';
      for (let i = 0; i < 12; i++) {
        const a = i * 2.1 + time * 0.5;
        const r = maxR * (0.2 + (i * 0.073) % 0.8);
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r * 0.7;
        const l = 8 + (i % 4) * 5;
        ctx.globalAlpha = 0.35 + (i % 3) * 0.15;
        ctx.strokeStyle = colors[i % colors.length];
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a + 1.4) * l, y + Math.sin(a + 1.4) * l);
        ctx.stroke();
      }
    } else if (mode === 'rainbow') {
      for (let band = 0; band < colors.length; band++) {
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = colors[band];
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        const rr = maxR * (0.4 + band * 0.11);
        const a0 = 3.5 + Math.sin(time * 0.4 + band) * 0.2;
        const a1 = 5.9 + Math.sin(time * 0.3 + band) * 0.2;
        ctx.arc(cx, cy, rr, a0, a1);
        ctx.stroke();
      }
      for (let i = 0; i < 18; i++) {
        const t = (time * 0.4 + i * 0.11) % 1;
        const x = cx - maxR * 0.75 + t * maxR * 1.5;
        const y = cy + 20 + Math.sin(t * 5 + time) * 10;
        ctx.globalAlpha = (1 - t) * 0.65;
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        ctx.arc(x, y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (mode === 'void') {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(time * 0.18);
      for (let arm = 0; arm < 3; arm++) {
        ctx.strokeStyle = WZ.rgba(colors[arm % colors.length], 0.55);
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 30; i++) {
          const t = i / 30;
          const a = t * 4.2 + arm * Math.PI * 2 / 3;
          const r = 8 + t * maxR * 0.9;
          const x = Math.cos(a) * r, y = Math.sin(a) * r;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
      for (let i = 0; i < 8; i++) {
        const a = i * 2.2 + time * 0.7;
        const r = maxR * (0.25 + (i * 0.09) % 0.55);
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (mode === 'orbit') {
      ctx.save();
      ctx.translate(cx, cy);
      for (let i = 0; i < 3; i++) {
        const a = time * (1.1 + i * 0.15) + i * Math.PI * 2 / 3;
        const rx = maxR * 0.65;
        const ry = maxR * 0.27;
        ctx.strokeStyle = WZ.rgba(colors[i], 0.35);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, -0.35, 0, Math.PI * 2);
        ctx.stroke();
        const x = Math.cos(a) * rx;
        const y = Math.sin(a) * ry;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = colors[i];
        ctx.beginPath();
        ctx.arc(x, y, 4 + (i % 2), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    /* motas comunes */
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 10; i++) {
      const a = i * 2.1 + time * 0.3;
      const r = maxR * (0.2 + (i * 0.137) % 0.9);
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.65, 0.9 + (i % 2), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  global.WZ = global.WZ || {};
  global.WZ.POWERS = POWERS;
  global.WZ.EFFECTS = EFFECTS;
  global.WZ.PICKUPS = PICKUPS;
  global.WZ.getPower = getPower;
  global.WZ.getEffect = getEffect;
  global.WZ.getPickup = getPickup;
  global.WZ.drawMagicPreview = drawMagicPreview;
})(window);
