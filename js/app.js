/* ═══════════════════════════════════════════════════════════
   WORMZILLA · interfaz, tienda, progreso y arranque
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const save = WZ.loadSave();
  const audio = new WZ.AudioEngine();
  audio.setMuted(save.muted);
  const game = new WZ.Game($('scene'), audio);

  const screens = {
    menu: $('menu'),
    skins: $('skinsScreen'),
    powers: $('powersScreen'),
    rules: $('rulesScreen'),
    buy: $('buyScreen'),
    pause: $('pauseScreen'),
    death: $('deathScreen')
  };

  const hud = $('hud');
  const hudScore = $('hudScore');
  const hudKills = $('hudKills');
  const hudCombo = $('hudCombo');
  const lbRows = $('lbRows');
  const minimap = $('minimap');
  const minimapCtx = minimap.getContext('2d');
  const hint = $('hint');
  const hintText = $('hintText');
  const flashEl = $('flash');
  const toastEl = $('toast');
  const powerBtn = $('powerBtn');
  const powerIco = $('powerIco');
  const powerName = $('powerName');
  const powerCd = $('powerCd');

  const muteButtons = [$('muteBtn'), $('muteBtnHud'), $('muteBtnPause')];
  const coinEls = [$('menuPoints'), $('skinsPoints'), $('powersPoints')];

  let ui = 'menu';
  let rulesContext = 'menu';
  let buyingItem = null;
  let toastTimer = 0;
  let hintTimer = 0;
  let lastMode = null;
  let shownScore = 0;
  let lastHudTick = 0;
  let lastLbTick = 0;
  let lastMiniTick = 0;
  let lastPowerTick = 0;
  let previewAcc = 0;
  let audioStarted = false;
  let cardRefs = [];
  let powerRefs = [];
  let effectRefs = [];
  let lastTouchMode = null;
  let lastPowerIcon = '';
  let lastPowerName = '';

  const CHECK_SVG = '<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const LOCK_SVG = '<svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';

  /* ═══════════════════ AUDIO / PERSISTENCIA ═══════════════════ */
  function ensureAudio() {
    if (!audioStarted) {
      audioStarted = true;
      audio.init();
      audio.setMuted(save.muted);
      audio.setIntensity(0.38);
      audio.setDucked(game.mode !== 'playing');
    } else {
      audio.resume();
    }
  }

  function persist() {
    WZ.persist(save);
  }

  function syncPills() {
    const pts = WZ.fmt(save.points);
    for (const el of coinEls) el.textContent = pts;
    $('menuBest').textContent = WZ.fmt(save.best);
    $('menuGames').textContent = WZ.fmt(save.games);
    $('menuKills').textContent = WZ.fmt(save.kills);
  }

  function syncMute() {
    for (const btn of muteButtons) {
      if (!btn) continue;
      btn.classList.toggle('is-muted', save.muted);
      btn.setAttribute('aria-label', save.muted ? 'Activar sonido' : 'Silenciar sonido');
      btn.setAttribute('aria-pressed', save.muted ? 'true' : 'false');
    }
  }

  function toggleMute() {
    save.muted = !save.muted;
    try { persist(); } catch (err) { /* noop */ }
    if (!audioStarted) ensureAudio();
    audio.setMuted(save.muted);
    syncMute();
    audio.click();
    if (audioStarted && !save.muted) audio.resume();
  }

  /* ═══════════════════ NAVEGACIÓN / OVERLAYS ═══════════════════ */
  function hideScreens() {
    for (const key of Object.keys(screens)) screens[key].classList.remove('open');
    if (document.activeElement && document.activeElement.blur) {
      try { document.activeElement.blur(); } catch (err) { /* noop */ }
    }
    ui = 'none';
  }

  function show(name) {
    hideScreens();
    if (screens[name]) screens[name].classList.add('open');
    ui = name;
  }

  function syncMode() {
    const mode = game.mode;
    if (mode === lastMode) return;
    lastMode = mode;
    document.body.classList.remove('mode-menu', 'mode-playing', 'mode-paused', 'mode-dying', 'mode-dead');
    document.body.classList.add('mode-' + mode);
    const active = mode === 'playing' || mode === 'paused';
    hud.classList.toggle('active', active);
    hud.setAttribute('aria-hidden', active ? 'false' : 'true');
    if (!active && document.activeElement && hud.contains(document.activeElement)) {
      try { document.activeElement.blur(); } catch (err) { /* noop */ }
    }
    if (mode !== 'playing') {
      /* sin turbo táctil */
    }
    if (mode === 'dying') {
      hint.classList.add('fade');
      clearTimeout(hintTimer);
    }
  }

  function flash(danger) {
    flashEl.classList.remove('on', 'danger');
    void flashEl.offsetWidth;
    if (danger) flashEl.classList.add('danger');
    flashEl.classList.add('on');
    clearTimeout(flash._t);
    flash._t = setTimeout(() => flashEl.classList.remove('on'), 520);
  }

  function toast(text, gold) {
    toastEl.textContent = text;
    toastEl.classList.toggle('gold', !!gold);
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2800);
  }

  /* ═══════════════════ FLUJO DE PARTIDA ═══════════════════ */
  function requestPlay() {
    ensureAudio();
    if (!save.seenTutorial) {
      openRules('first');
      return;
    }
    startRun();
  }

  function controlHintText() {
    return game.touchMode
      ? 'APOYA EL DEDO Y ARRASTRA PARA GIRAR'
      : 'MUEVE EL RATÓN · MANTÉN PULSADO PARA TURBO';
  }

  function updateControlCopy() {
    const tip = $('menuTip');
    if (tip) {
      tip.textContent = game.touchMode
        ? 'APOYA EL DEDO Y ARRASTRA · SIN TURBO'
        : 'MUEVE EL RATÓN · MANTÉN PULSADO PARA TURBO';
    }
    if (game.mode === 'playing') hintText.textContent = controlHintText();
  }

  function startRun() {
    ensureAudio();
    save.seenTutorial = true;
    persist();
    hideScreens();
    ui = 'none';
    game.start(save.selected, save.selectedPower, save.selectedEffect);
    lastMode = 'playing';
    document.body.classList.remove('mode-menu', 'mode-paused', 'mode-dying', 'mode-dead');
    document.body.classList.add('mode-playing');
    hud.classList.add('active');
    hud.setAttribute('aria-hidden', 'false');
    shownScore = START_DISPLAY();
    hudScore.textContent = WZ.fmt(shownScore);
    hudKills.textContent = '0';
    hudCombo.classList.remove('show');
    hint.classList.remove('fade');
    hintText.textContent = controlHintText();
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      if (game.mode === 'playing') hint.classList.add('fade');
    }, 7200);
    flash(false);
    audio.setDucked(false);
    audio.start();
    renderLeaderboard(true);
  }

  function START_DISPLAY() { return 22; }

  function pauseGame() {
    if (game.mode !== 'playing') return;
    game.pause();
    clearTimeout(hintTimer);
    const p = game.player;
    $('pauseScore').textContent = p ? WZ.fmt(p.mass) : '0';
    $('pauseKills').textContent = WZ.fmt(game.runStats.kills);
    $('pauseTime').textContent = WZ.timeFmt(game.runTime);
    show('pause');
    syncMode();
  }

  function resumeGame() {
    if (game.mode !== 'paused') return;
    hideScreens();
    game.resume();
    syncMode();
    lastMode = 'playing';
    document.body.classList.remove('mode-paused');
    document.body.classList.add('mode-playing');
    hint.classList.remove('fade');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      if (game.mode === 'playing') hint.classList.add('fade');
    }, 4500);
    audio.setDucked(false);
  }

  function quitRun() {
    if (game.mode !== 'paused' && game.mode !== 'playing') return;
    game.abandon();
    hideScreens();
    show('menu');
    syncMode();
    lastMode = 'menu';
    document.body.classList.remove('mode-paused', 'mode-playing', 'mode-dying', 'mode-dead');
    document.body.classList.add('mode-menu');
    hud.classList.remove('active');
    hud.setAttribute('aria-hidden', 'true');
  }

  function openRules(context) {
    ensureAudio();
    rulesContext = context;
    $('rulesPlay').textContent = context === 'first' ? 'A JUGAR' : 'VOLVER';
    $('rulesPlay').classList.toggle('primary', true);
    show('rules');
  }

  function closeRules() {
    if (rulesContext === 'pause' && game.mode === 'paused') {
      show('pause');
      return;
    }
    if (rulesContext === 'first' && !save.seenTutorial) {
      show('menu');
      return;
    }
    show('menu');
  }

  /* ═══════════════════ TIENDA ═══════════════════ */
  function buildShop() {
    const grid = $('skinGrid');
    const frag = document.createDocumentFragment();
    cardRefs = [];

    WZ.SKINS.slice().sort((a, b) => a.price - b.price).forEach((skin, index) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'skin-card';
      card.dataset.id = skin.id;
      card.style.setProperty('--glow', skin.glow);
      card.style.setProperty('--i', String(index));
      card.innerHTML =
        '<div class="preview-wrap"><canvas width="480" height="240"></canvas></div>' +
        '<div class="skin-body">' +
          '<div><div class="skin-name">' + skin.name + '</div>' +
          '<div class="skin-sub">' + skin.rarity + '</div></div>' +
          '<div class="skin-state"></div>' +
        '</div>' +
        '<div class="lock-badge"></div>';
      const canvas = card.querySelector('canvas');
      cardRefs.push({ card, skin, canvas, ctx: canvas.getContext('2d'), state: card.querySelector('.skin-state'), badge: card.querySelector('.lock-badge') });
      card.addEventListener('click', () => onSkinCard(skin));
      frag.appendChild(card);
    });
    grid.appendChild(frag);
    refreshShop();
  }

  function refreshShop() {
    for (const ref of cardRefs) {
      const owned = save.unlocked.includes(ref.skin.id);
      const equipped = save.selected === ref.skin.id;
      ref.card.classList.toggle('owned', owned);
      ref.card.classList.toggle('equipped', equipped);
      ref.card.classList.toggle('locked', !owned);
      if (equipped) {
        ref.state.innerHTML = '<span class="state-check">' + CHECK_SVG + '</span> EQUIPADA';
        ref.badge.innerHTML = CHECK_SVG;
        ref.card.setAttribute('aria-label', ref.skin.name + ' equipada');
      } else if (owned) {
        ref.state.textContent = 'EQUIPAR';
        ref.badge.innerHTML = CHECK_SVG;
        ref.card.setAttribute('aria-label', 'Equipar ' + ref.skin.name);
      } else {
        ref.state.innerHTML = '<span class="coin-icon"></span>' + WZ.fmt(ref.skin.price);
        ref.badge.innerHTML = LOCK_SVG;
        ref.card.setAttribute('aria-label', ref.skin.name + ', ' + ref.skin.price + ' puntos');
      }
    }
  }

  function onSkinCard(skin) {
    ensureAudio();
    if (!save.unlocked.includes(skin.id)) {
      openBuy('skin', skin);
      return;
    }
    if (save.selected === skin.id) {
      audio.click();
      return;
    }
    save.selected = skin.id;
    persist();
    refreshShop();
    syncPills();
    audio.click();
    toast(skin.name + ' EQUIPADA');
  }

  /* ── Poderes y efectos ── */
  function buildPowers() {
    powerRefs = [];
    effectRefs = [];
    buildMagicCards($('powerGrid'), WZ.POWERS, 'power', powerRefs);
    buildMagicCards($('effectGrid'), WZ.EFFECTS, 'effect', effectRefs);
    refreshPowers();
    updateLoadout();
  }

  function buildMagicCards(grid, list, kind, refs) {
    const frag = document.createDocumentFragment();
    list.forEach((item, index) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'skin-card magic-card';
      card.dataset.id = item.id;
      card.style.setProperty('--glow', item.glow || item.color);
      card.style.setProperty('--i', String(index));
      card.title = item.desc || '';
      card.innerHTML =
        '<div class="preview-wrap magic-preview"><canvas width="480" height="240"></canvas>' +
          '<span class="magic-ico">' + svgIcon(item.icon) + '</span>' +
        '</div>' +
        '<div class="skin-body">' +
          '<div><div class="skin-name">' + item.name + '</div>' +
          '<div class="skin-sub">' + (item.tag || (kind === 'power' ? 'PODER' : 'EFECTO')) + '</div></div>' +
          '<div class="skin-state"></div>' +
        '</div>' +
        '<div class="lock-badge"></div>';
      const canvas = card.querySelector('canvas');
      refs.push({
        card, item, kind, canvas, ctx: canvas.getContext('2d'),
        state: card.querySelector('.skin-state'), badge: card.querySelector('.lock-badge')
      });
      card.addEventListener('click', () => {
        if (kind === 'power') onPowerCard(item);
        else onEffectCard(item);
      });
      frag.appendChild(card);
    });
    grid.appendChild(frag);
  }

  function svgIcon(inner) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (inner || '') + '</svg>';
  }

  function refreshPowers() {
    const all = powerRefs.concat(effectRefs);
    for (const ref of all) {
      const owned = ref.kind === 'power'
        ? save.unlockedPowers.includes(ref.item.id)
        : save.unlockedEffects.includes(ref.item.id);
      const equipped = ref.kind === 'power'
        ? save.selectedPower === ref.item.id
        : save.selectedEffect === ref.item.id;
      ref.card.classList.toggle('owned', owned);
      ref.card.classList.toggle('equipped', equipped);
      ref.card.classList.toggle('locked', !owned);
      if (equipped) {
        ref.state.innerHTML = '<span class="state-check">' + CHECK_SVG + '</span> EQUIPADO';
        ref.badge.innerHTML = CHECK_SVG;
        ref.card.setAttribute('aria-label', ref.item.name + ' equipado');
      } else if (owned) {
        ref.state.textContent = 'EQUIPAR';
        ref.badge.innerHTML = CHECK_SVG;
        ref.card.setAttribute('aria-label', 'Equipar ' + ref.item.name);
      } else {
        ref.state.innerHTML = '<span class="coin-icon"></span>' + WZ.fmt(ref.item.price);
        ref.badge.innerHTML = LOCK_SVG;
        ref.card.setAttribute('aria-label', ref.item.name + ', ' + ref.item.price + ' puntos');
      }
    }
  }

  function updateLoadout() {
    const power = WZ.getPower(save.selectedPower);
    const effect = WZ.getEffect(save.selectedEffect);
    const ps = $('slotPowerIcon');
    const es = $('slotEffectIcon');
    $('slotPowerName').textContent = power ? power.name : 'NINGUNO';
    $('slotEffectName').textContent = effect ? effect.name : 'NINGUNO';
    if (power) {
      ps.innerHTML = svgIcon(power.icon);
      ps.style.setProperty('--slot', power.color);
      ps.style.display = 'flex';
    } else {
      ps.innerHTML = '';
      ps.style.display = 'none';
    }
    if (effect) {
      es.innerHTML = svgIcon(effect.icon);
      es.style.setProperty('--slot', effect.color);
      es.style.display = 'flex';
    } else {
      es.innerHTML = '';
      es.style.display = 'none';
    }
    $('slotPowerClear').classList.toggle('show', !!power);
    $('slotEffectClear').classList.toggle('show', !!effect);
  }

  function onPowerCard(power) {
    ensureAudio();
    if (!save.unlockedPowers.includes(power.id)) {
      openBuy('power', power);
      return;
    }
    if (save.selectedPower === power.id) {
      audio.click();
      return;
    }
    save.selectedPower = power.id;
    persist();
    refreshPowers();
    updateLoadout();
    syncPills();
    audio.click();
    toast(power.name + ' EQUIPADO');
  }

  function onEffectCard(effect) {
    ensureAudio();
    if (!save.unlockedEffects.includes(effect.id)) {
      openBuy('effect', effect);
      return;
    }
    if (save.selectedEffect === effect.id) {
      audio.click();
      return;
    }
    save.selectedEffect = effect.id;
    persist();
    refreshPowers();
    updateLoadout();
    syncPills();
    audio.click();
    toast(effect.name + ' EQUIPADO');
  }

  function openBuy(kind, item) {
    buyingItem = { kind, item };
    const label = kind === 'skin' ? 'NUEVA PIEL' : kind === 'power' ? 'NUEVO PODER' : 'NUEVO EFECTO';
    $('buyKicker').innerHTML = '<span class="kicker-line"></span>' + label + '<span class="kicker-line"></span>';
    $('buyName').textContent = item.name;
    $('buyPrice').textContent = WZ.fmt(item.price);
    $('buyDesc').textContent = item.desc || '';
    $('buyGlow').style.background = item.glow || item.color;
    const iconBox = $('buyIcon');
    if (kind === 'skin') {
      iconBox.classList.remove('show');
      iconBox.innerHTML = '';
    } else {
      iconBox.style.setProperty('--glow', item.glow || item.color);
      iconBox.innerHTML = svgIcon(item.icon);
      iconBox.classList.add('show');
    }
    const missing = item.price - save.points;
    const note = $('buyNote');
    if (missing > 0) {
      note.textContent = 'TE FALTAN ' + WZ.fmt(missing) + ' PUNTOS';
      note.classList.add('bad');
      $('buyConfirm').disabled = true;
    } else {
      note.textContent = 'SALDO DISPONIBLE: ' + WZ.fmt(save.points) + ' PUNTOS';
      note.classList.remove('bad');
      $('buyConfirm').disabled = false;
    }
    drawBuyPreview();
    show('buy');
  }

  function closeBuy() {
    const kind = buyingItem ? buyingItem.kind : 'skin';
    buyingItem = null;
    show(kind === 'skin' ? 'skins' : 'powers');
    refreshShop();
    refreshPowers();
    updateLoadout();
    drawAllPreviews();
    drawPowerPreviews();
  }

  function confirmBuy() {
    if (!buyingItem) return;
    const { kind, item } = buyingItem;
    if (save.points < item.price) {
      const modal = document.querySelector('.buy-modal');
      modal.classList.remove('shake');
      void modal.offsetWidth;
      modal.classList.add('shake');
      audio.warn();
      return;
    }
    save.points -= item.price;
    if (kind === 'skin') {
      if (!save.unlocked.includes(item.id)) save.unlocked.push(item.id);
      save.selected = item.id;
    } else if (kind === 'power') {
      if (!save.unlockedPowers.includes(item.id)) save.unlockedPowers.push(item.id);
      save.selectedPower = item.id;
    } else {
      if (!save.unlockedEffects.includes(item.id)) save.unlockedEffects.push(item.id);
      save.selectedEffect = item.id;
    }
    persist();
    syncPills();
    refreshShop();
    refreshPowers();
    updateLoadout();
    audio.purchase();
    toast(item.name + ' ' + (kind === 'skin' ? 'DESBLOQUEADA' : 'DESBLOQUEADO'), true);
    const ref = cardRefs.concat(powerRefs, effectRefs).find((c) => (c.item ? c.item.id : c.skin.id) === item.id);
    if (ref) {
      ref.card.classList.remove('unlock-flash');
      void ref.card.offsetWidth;
      ref.card.classList.add('unlock-flash');
    }
    buyingItem = null;
    show(kind === 'skin' ? 'skins' : 'powers');
    drawAllPreviews();
    drawPowerPreviews();
  }

  function drawAllPreviews() {
    for (const ref of cardRefs) {
      WZ.drawSkinPreview(ref.ctx, ref.skin, ref.canvas.width, ref.canvas.height, game.renderTime);
    }
  }

  function drawPowerPreviews() {
    const all = powerRefs.concat(effectRefs);
    for (const ref of all) {
      WZ.drawMagicPreview(ref.ctx, ref.item, ref.canvas.width, ref.canvas.height, game.renderTime);
    }
  }

  function drawBuyPreview() {
    if (!buyingItem) return;
    const { kind, item } = buyingItem;
    const c = $('buyPreview');
    const ctx = c.getContext('2d');
    if (kind === 'skin') WZ.drawSkinPreview(ctx, item, c.width, c.height, game.renderTime);
    else WZ.drawMagicPreview(ctx, item, c.width, c.height, game.renderTime);
  }

  /* ═══════════════════ FIN DE PARTIDA ═══════════════════ */
  function onRunEnd(stats, reason) {
    const coins = Math.max(0, Math.floor(stats.massEaten * 0.5 + stats.kills * 40 + Math.floor(stats.time / 60) * 12));
    const previousBest = save.best;
    const newRecord = stats.score > previousBest;
    save.points += coins;
    save.games += 1;
    save.kills += stats.kills;
    if (newRecord) save.best = stats.score;
    persist();
    syncPills();
    refreshShop();
    refreshPowers();
    updateLoadout();

    if (reason === 'death') {
      $('deathScore').textContent = WZ.fmt(stats.score);
      $('deathCoins').textContent = WZ.fmt(stats.massEaten);
      $('deathKills').textContent = WZ.fmt(stats.kills);
      $('deathTime').textContent = WZ.timeFmt(stats.time);
      $('deathEarned').textContent = WZ.fmt(coins);
      $('deathCause').textContent = (stats.cause || 'EL VACÍO').toUpperCase();
      $('newRecord').classList.toggle('hidden', !newRecord);
      hud.classList.remove('active');
      hud.setAttribute('aria-hidden', 'true');
      hint.classList.add('fade');
      show('death');
      setTimeout(() => {
        if (game.mode === 'dead') {
          lastMode = 'dead';
          document.body.classList.remove('mode-menu', 'mode-playing', 'mode-paused', 'mode-dying');
          document.body.classList.add('mode-dead');
        }
      }, 20);
    } else {
      hud.classList.remove('active');
      show('menu');
      lastMode = 'menu';
      document.body.classList.remove('mode-playing', 'mode-paused', 'mode-dying', 'mode-dead');
      document.body.classList.add('mode-menu');
      if (coins > 0) toast('PARTIDA GUARDADA · +' + WZ.fmt(coins) + ' PUNTOS', true);
      else toast('PARTIDA GUARDADA');
    }
  }

  function retry() {
    if (game.mode === 'dead') startRun();
  }

  function goHome() {
    hideScreens();
    game.toMenu();
    show('menu');
    lastMode = 'menu';
    document.body.classList.remove('mode-playing', 'mode-paused', 'mode-dying', 'mode-dead');
    document.body.classList.add('mode-menu');
    hud.classList.remove('active');
    hud.setAttribute('aria-hidden', 'true');
    audio.setDucked(true);
  }

  /* ═══════════════════ HUD ═══════════════════ */
  function renderLeaderboard(force) {
    if (game.mode !== 'playing' && game.mode !== 'paused') return;
    const rows = game.getLeaderboard(6);
    let html = '';
    for (const r of rows) {
      html += '<div class="lb-row' + (r.isPlayer ? ' me' : '') + '">' +
        '<span class="lb-rank">' + r.rank + '</span>' +
        '<span class="lb-dot" style="--c:' + r.color + '"></span>' +
        '<span class="lb-name">' + r.name + '</span>' +
        '<span class="lb-score">' + WZ.fmt(r.mass) + '</span>' +
        '</div>';
    }
    if (force || lbRows.dataset.sig !== html) {
      lbRows.innerHTML = html;
      lbRows.dataset.sig = html;
    }
  }

  function updatePowerButton() {
    const st = game.getPowerState();
    const activeMode = game.mode === 'playing' || game.mode === 'paused';
    if (!st || st.kind !== 'active' || !activeMode) {
      powerBtn.classList.remove('show', 'cooling', 'running');
      return;
    }
    powerBtn.classList.add('show');
    if (lastPowerIcon !== st.icon) {
      lastPowerIcon = st.icon;
      powerIco.innerHTML = svgIcon(st.icon);
    }
    if (lastPowerName !== st.name) {
      lastPowerName = st.name;
      powerName.textContent = st.name;
    }
    const frac = st.cooldownTotal ? Math.min(1, Math.max(0, st.cooldown / st.cooldownTotal)) : 0;
    powerBtn.style.setProperty('--power', st.color);
    powerBtn.style.setProperty('--cd', frac.toFixed(3));
    powerBtn.classList.toggle('cooling', st.cooldown > 0);
    powerBtn.classList.toggle('running', st.running);
    powerCd.textContent = st.cooldown > 0 ? String(Math.ceil(st.cooldown)) : '';
    powerBtn.setAttribute('aria-label', st.cooldown > 0
      ? st.name + ': ' + Math.ceil(st.cooldown) + ' segundos'
      : 'Activar ' + st.name);
  }

  function updateHud(dt, now) {
    if (now - lastHudTick > 85) {
      lastHudTick = now;
      const p = game.player;
      const target = p && p.alive ? p.mass : (game.mode === 'dying' ? game.finalMass : shownScore);
      shownScore += (target - shownScore) * 0.28;
      if (Math.abs(target - shownScore) < 0.6) shownScore = target;
      hudScore.textContent = WZ.fmt(shownScore);
      hudKills.textContent = WZ.fmt(game.runStats.kills);
      if (p && p.alive && game.combo >= 2 && game.mode === 'playing') {
        hudCombo.textContent = '×' + game.combo;
        hudCombo.classList.add('show');
      } else {
        hudCombo.classList.remove('show');
      }
    }

    if (now - lastLbTick > 420) {
      lastLbTick = now;
      renderLeaderboard(false);
    }

    if (now - lastMiniTick > 33) {
      lastMiniTick = now;
      game.drawMinimap(minimapCtx);
    }

    if (now - lastPowerTick > 80) {
      lastPowerTick = now;
      updatePowerButton();
    }

    if (screens.skins.classList.contains('open') || screens.powers.classList.contains('open') || screens.buy.classList.contains('open')) {
      previewAcc += dt;
      if (previewAcc > 0.032) {
        previewAcc = 0;
        if (screens.skins.classList.contains('open')) drawAllPreviews();
        if (screens.powers.classList.contains('open')) drawPowerPreviews();
        if (screens.buy.classList.contains('open')) drawBuyPreview();
      }
    }
  }

  /* ═══════════════════ EVENTOS UI ═══════════════════ */
  $('playBtn').addEventListener('click', requestPlay);
  $('skinsBtn').addEventListener('click', () => { ensureAudio(); show('skins'); refreshShop(); drawAllPreviews(); });
  $('skinsBack').addEventListener('click', () => show('menu'));
  $('powersBtn').addEventListener('click', () => { ensureAudio(); show('powers'); refreshPowers(); updateLoadout(); drawPowerPreviews(); });
  $('powersBack').addEventListener('click', () => show('menu'));
  $('slotPowerClear').addEventListener('click', () => {
    save.selectedPower = 'none';
    persist();
    refreshPowers();
    updateLoadout();
    audio.click();
  });
  $('slotEffectClear').addEventListener('click', () => {
    save.selectedEffect = 'none';
    persist();
    refreshPowers();
    updateLoadout();
    audio.click();
  });
  powerBtn.addEventListener('click', () => {
    if (game.mode !== 'playing') return;
    game.activatePower();
    updatePowerButton();
  });
  $('rulesBtn').addEventListener('click', () => openRules('menu'));
  $('rulesBtnPause').addEventListener('click', () => openRules('pause'));
  $('rulesClose').addEventListener('click', closeRules);
  $('rulesPlay').addEventListener('click', () => {
    const ctx = rulesContext;
    if (ctx === 'first') {
      save.seenTutorial = true;
      persist();
      hideScreens();
      startRun();
    } else {
      closeRules();
    }
  });
  $('pauseBtn').addEventListener('click', pauseGame);
  $('resumeBtn').addEventListener('click', resumeGame);
  $('quitBtn').addEventListener('click', quitRun);
  $('retryBtn').addEventListener('click', retry);
  $('homeBtn').addEventListener('click', goHome);
  $('buyCancel').addEventListener('click', closeBuy);
  $('buyConfirm').addEventListener('click', confirmBuy);
  $('skinsScreen').addEventListener('click', (e) => {
    if (e.target === screens.skins) show('menu');
  });

  for (const btn of muteButtons) {
    if (!btn) continue;
    btn.addEventListener('click', toggleMute);
  }

  $('fsBtn').addEventListener('click', () => {
    try {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
      } else if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    } catch (err) { /* noop */ }
  });

  /* Click sonoro global para botones */
  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('button') : null;
    if (btn) audio.click();
  }, true);

  /* Primer gesto → audio */
  window.addEventListener('pointerdown', ensureAudio, true);
  window.addEventListener('keydown', ensureAudio, true);

  /* Teclado global */
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'Escape') {
      if (screens.buy.classList.contains('open')) { closeBuy(); e.preventDefault(); return; }
      if (screens.rules.classList.contains('open')) { closeRules(); e.preventDefault(); return; }
      if (screens.skins.classList.contains('open')) { show('menu'); e.preventDefault(); return; }
      if (screens.powers.classList.contains('open')) { show('menu'); e.preventDefault(); return; }
      if (game.mode === 'paused') { resumeGame(); e.preventDefault(); return; }
      if (game.mode === 'playing') { pauseGame(); e.preventDefault(); return; }
    }
    if (e.code === 'KeyE' && game.mode === 'playing') {
      game.activatePower();
      updatePowerButton();
      e.preventDefault();
      return;
    }
    if (e.code === 'KeyP' && game.mode === 'playing') {
      pauseGame();
      e.preventDefault();
      return;
    }
    if (e.code === 'KeyM') {
      toggleMute();
      return;
    }
    if (e.code === 'Enter') {
      const ae = document.activeElement;
      const onButton = ae && ae.tagName === 'BUTTON';
      if (onButton) return;
      if (game.mode === 'dead') { retry(); e.preventDefault(); return; }
      if (screens.menu.classList.contains('open')) { requestPlay(); e.preventDefault(); return; }
      if (screens.rules.classList.contains('open')) { $('rulesPlay').click(); e.preventDefault(); return; }
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.mode === 'playing') pauseGame();
  });
  window.addEventListener('blur', () => {
    if (game.mode === 'playing') pauseGame();
  });

  /* ═══════════════════ CALLBACKS DEL JUEGO ═══════════════════ */
  game.callbacks = {
    onRunEnd,
    onPlayerDeathStart() {
      flash(true);
      hint.classList.add('fade');
      clearTimeout(hintTimer);
    },
    onKill() {
      const el = document.querySelector('.score-sub');
      if (el) {
        el.classList.remove('kill-pulse');
        void el.offsetWidth;
        el.classList.add('kill-pulse');
      }
    },
    onEat(value, combo, kind) {
      if (kind === 'gold') toast('ORBE DORADO · +' + WZ.fmt(value), true);
    },
    onPowerUsed() {
      flash(false);
    },
    onNova() {
      flash(false);
    },
    onGoldSpawn() {
      /* El minimapa ya lo revela; sin texto para no romper el ritmo. */
    }
  };

  /* ═══════════════════ ARRANQUE ═══════════════════ */
  game.onFrame = (dt) => {
    syncMode();
    if (game.touchMode !== lastTouchMode) {
      lastTouchMode = game.touchMode;
      updateControlCopy();
    }
    const now = performance.now();
    if (game.mode === 'playing' || game.mode === 'paused' || game.mode === 'dying') {
      updateHud(dt, now);
    } else if (screens.skins.classList.contains('open') || screens.powers.classList.contains('open') || screens.buy.classList.contains('open')) {
      updateHud(dt, now);
    }
  };

  syncPills();
  syncMute();
  updateControlCopy();
  buildShop();
  buildPowers();
  drawAllPreviews();
  drawPowerPreviews();
  updateLoadout();
  show('menu');
  lastMode = 'menu';
  lastTouchMode = game.touchMode;
  document.body.classList.remove('mode-playing', 'mode-paused', 'mode-dying', 'mode-dead');
  document.body.classList.add('mode-menu');
  syncMode();

  /* Hook de depuración / pruebas */
  global.__wormzilla = { game, save, audio, screens };
})(window);
