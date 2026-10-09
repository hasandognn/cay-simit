(() => {
  'use strict';
  const { Engine, LEVELS, NAMES, COLS, ROWS } = window.TeaGame;
  const districts = window.TeaDistricts;
  const $ = id => document.getElementById(id);
  const boardEl = $('board'), modal = $('modal'), content = $('modalContent');
  const STORAGE = 'cay-simit-v1';
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  let motion = !motionQuery.matches;
  const defaultGuidance = 'Yan yana taşları değiştir, 3 tanesini eşleştir.';
  const svg = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const art = type => `<span class="piece-art piece-${type}" aria-hidden="true"></span>`;
  const powerNames = { row: 'Satır roketi', bomb: 'Çevre bombası', rainbow: 'Renk yıldızı' };
  const powerArt = kind => `<span class="power-art power-${kind}" aria-hidden="true"><img src="assets/${kind === 'row' ? 'rocket' : kind}.svg" alt="" draggable="false"><span class="power-caption">${{ row: 'ROKET', bomb: 'BOMBA', rainbow: 'YILDIZ' }[kind]}</span></span>`;
  let profile;
  try { profile = JSON.parse(localStorage.getItem(STORAGE)); } catch { /* Storage may be unavailable. */ }
  if (!profile || typeof profile !== 'object') profile = {};
  profile = {
    unlocked: Math.max(0, Math.min(LEVELS.length - 1, Number.isInteger(profile.unlocked) ? profile.unlocked : 0)),
    coins: Number.isSafeInteger(profile.coins) && profile.coins >= 0 ? profile.coins : 0,
    best: Array.isArray(profile.best) ? profile.best.slice(0, LEVELS.length).map(n => [1, 2, 3].includes(n) ? n : 0) : [],
    sound: profile.sound !== false,
    motion: profile.motion !== false,
    haptics: profile.haptics === true,
    active: profile.active,
    awarded: profile.awarded === true,
    seenHelp: profile.seenHelp === true,
  };
  let engine = Engine.restore(profile.active) || new Engine(profile.unlocked);
  if (!profile.active || engine.status === 'playing') profile.awarded = false;
  let view = engine.snapshot(), busy = false, selected = null, activeBooster = null;
  let hintTimer, toastTimer, comboTimer, pointer, suppressClickUntil = 0, audioContext;
  let turnId = 0;
  let shownDistrict = -1;
  const nodes = new Map();
  const movements = new Map(), targetNodes = new Map();
  const effects = new window.TeaEffects($('fxCanvas'), () => motion);
  const wait = ms => new Promise(resolve => setTimeout(resolve, motion && !document.hidden ? ms : Math.min(ms, 20)));
  function motionPreference() {
    motion = profile.motion && !motionQuery.matches;
    document.body.classList.toggle('reduce-motion', !motion);
    if (!motion) effects.clear();
  }
  motionPreference();
  motionQuery.addEventListener('change', motionPreference);
  function haptic(duration = 10) { if (profile.haptics && navigator.vibrate) { try { navigator.vibrate(duration); } catch {} } }
  const save = () => {
    profile.active = engine.snapshot();
    try { localStorage.setItem(STORAGE, JSON.stringify(profile)); } catch { /* The game also works without storage. */ }
  };
  function sound(type = 'tap', chain = 1) {
    if (!profile.sound) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
      const notes = type === 'win' ? [523, 659, 784, 1047] : type === 'clear' ? [440 + Math.min(chain, 8) * 80, 660 + Math.min(chain, 8) * 90] : type === 'bad' ? [180, 150] : [420];
      notes.forEach((hz, i) => {
        const osc = audioContext.createOscillator(), gain = audioContext.createGain();
        const now = audioContext.currentTime + i * .085;
        osc.type = 'sine'; osc.frequency.setValueAtTime(hz, now);
        gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(.075, now + .008); gain.gain.exponentialRampToValueAtTime(.001, now + .18);
        osc.connect(gain); gain.connect(audioContext.destination); osc.start(now); osc.stop(now + .19);
      });
    } catch { /* Audio is an optional enhancement. */ }
  }
  function toast(message) {
    $('toast').textContent = message; $('toast').classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2700);
  }
  function guidance(message = defaultGuidance) { $('guidance').textContent = message; }
  function applyDistrict() {
    if (shownDistrict === engine.level) return;
    shownDistrict = engine.level;
    const d = districts[engine.level];
    document.body.dataset.district = d.id;
    document.body.style.setProperty('--district', d.color);
    document.body.style.setProperty('--district-soft', d.soft);
    document.body.style.setProperty('--district-icon', `url("assets/district-${d.icon}.svg")`);
    const hero = document.querySelector('.garden-art');
    hero.src = d.image; hero.alt = d.alt;
    document.querySelector('.garden').setAttribute('aria-label', `${d.name} manzarası`);
    document.querySelectorAll('.garden-title span').forEach((span, i) => { span.textContent = d.title[i]; });
    $('districtButton').innerHTML = `<img class="district-icon" src="assets/district-${d.icon}.svg" alt=""> İSTANBUL · ${d.name.toLocaleUpperCase('tr-TR')} <span class="map-cue">↗</span>`;
    $('districtButton').setAttribute('aria-label', `${d.name}, İstanbul bölüm haritasını aç`);
    document.querySelector('.journey-icon').innerHTML = `<img class="district-icon" src="assets/district-${d.icon}.svg" alt="">`;
  }
  function render(state = engine.snapshot(), animate = true, phase = '') {
    applyDistrict();
    view = state;
    const size = { w: boardEl.clientWidth / COLS, h: boardEl.clientHeight / ROWS };
    const alive = new Set();
    let longestMovement = 0;
    const spawnRows = new Map();
    if (phase === 'fall') {
      // New pieces enter each basket-bounded column in order, with constant spacing.
      for (let x = 0; x < COLS; x++) {
        let segment = [];
        const place = () => {
          const fresh = segment.filter(({ p }) => !nodes.has(p.id));
          fresh.forEach(({ p, y }) => spawnRows.set(p.id, y - fresh.length));
          segment = [];
        };
        for (let y = 0; y < ROWS; y++) {
          const p = state.board[y][x];
          if (p?.type === 5) place();
          else if (p) segment.push({ p, y });
        }
        place();
      }
    }
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const p = state.board[y][x];
      if (!p) continue;
      alive.add(p.id);
      let node = nodes.get(p.id);
      const fresh = !node;
      if (fresh) {
        node = document.createElement('button'); node.className = 'tile'; node.type = 'button';
        nodes.set(p.id, node); boardEl.appendChild(node);
      }
      const signature = `${p.type}:${p.special || ''}:${p.hp || ''}`;
      if (node.dataset.signature !== signature) {
        node.innerHTML = (p.special ? powerArt(p.special) : art(p.type)) + (p.type === 5 && p.hp > 1 ? `<span class="basket-strength">${p.hp}</span>` : '');
        node.dataset.signature = signature;
      }
      node.className = `tile${p.type === 5 ? ' basket' : ''}${p.special ? ` special special-${p.special}` : ''}${selected?.x === x && selected?.y === y ? ' selected' : ''}`;
      node.dataset.x = x; node.dataset.y = y; node.dataset.id = p.id;
      node.setAttribute('aria-label', `${y + 1}. satır, ${x + 1}. sütun: ${p.special ? powerNames[p.special] + ', dokunarak patlat' : NAMES[p.type]}${p.type === 5 ? `, ${p.hp} darbe` : ''}`);
      node.setAttribute('aria-pressed', selected?.x === x && selected?.y === y ? 'true' : 'false');
      node.style.width = `${size.w}px`; node.style.height = `${size.h}px`;
      const destination = `translate(${x * size.w}px,${y * size.h}px)`;
      const sourceY = fresh ? (spawnRows.get(p.id) ?? y - 2) : Number(node.dataset.row ?? y);
      const origin = fresh ? `translate(${x * size.w}px,${sourceY * size.h}px)` : node.style.transform;
      node.dataset.row = y;
      movements.get(p.id)?.cancel(); movements.delete(p.id);
      node.style.transform = destination; node.style.opacity = '1';
      if (animate && motion && !document.hidden && node.animate && origin !== destination) {
        const falling = phase === 'fall';
        const frames = falling
          ? [{ transform: origin, opacity: fresh ? 0 : 1 }, { transform: destination, opacity: 1 }]
          : [{ transform: origin }, { transform: destination }];
        const duration = falling ? Math.min(420, 260 + Math.abs(y - sourceY) * 26) : 180;
        const animation = node.animate(frames, { duration, easing: falling ? 'cubic-bezier(.22,.55,.3,1)' : 'cubic-bezier(.2,.7,.3,1)' });
        longestMovement = Math.max(longestMovement, duration);
        movements.set(p.id, animation);
        animation.finished.then(() => { if (movements.get(p.id) === animation) movements.delete(p.id); }).catch(() => {});
      }
    }
    for (const [id, node] of nodes) if (!alive.has(id)) { movements.get(id)?.cancel(); movements.delete(id); node.remove(); nodes.delete(id); }
    $('moves').textContent = state.moves;
    $('moves').parentElement.classList.toggle('low', state.moves <= 5);
    $('score').textContent = state.score.toLocaleString('tr-TR');
    $('scoreFill').style.width = `${Math.min(100, state.score / 6000 * 100)}%`;
    document.querySelectorAll('.progress-star').forEach((star, i) => star.classList.toggle('earned', state.score >= [1600, 3700, 6000][i]));
    $('levelTitle').textContent = `BÖLÜM ${engine.level + 1} · ${districts[engine.level].name.toLocaleUpperCase('tr-TR')}`;
    $('levelTitle').setAttribute('aria-label', `${districts[engine.level].name}, bölüm ${engine.level + 1}, haritayı aç`);
    $('coins').textContent = profile.coins.toLocaleString('tr-TR');
    renderTargets(state);
    for (const kind of ['hammer', 'rocket', 'shuffle']) {
      $(`${kind}Count`).textContent = state.boosters[kind];
      $(`${kind}Button`).disabled = busy || state.status !== 'playing' || !state.boosters[kind];
    }
    boardEl.setAttribute('aria-busy', String(busy));
    return longestMovement;
  }
  function renderTargets(state) {
    const types = Object.keys(engine.config.targets);
    if (types.join(',') !== [...targetNodes.keys()].join(',')) {
      targetNodes.clear(); $('targets').replaceChildren();
      types.forEach(t => {
        const node = document.createElement('div'); node.className = 'target'; node.dataset.type = t;
        node.innerHTML = art(t) + '<b></b>'; $('targets').appendChild(node); targetNodes.set(t, node);
      });
    }
    for (const [t, total] of Object.entries(engine.config.targets)) {
      const left = Math.max(0, total - (state.collected[t] || 0));
      const node = targetNodes.get(t), old = Number(node.dataset.remaining);
      node.classList.toggle('done', left === 0); node.setAttribute('aria-label', `${NAMES[t]}: ${left} kaldı`);
      node.querySelector('b').textContent = left || '✓'; node.dataset.remaining = left;
      if (left < old && motion && node.animate) node.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.2)', offset: .4 }, { transform: 'scale(1)' }], { duration: 280 });
    }
  }
  function layoutTiles() {
    // Resizing must not replay a turn or erase an in-progress clear effect.
    const w = boardEl.clientWidth / COLS, h = boardEl.clientHeight / ROWS;
    for (const node of nodes.values()) {
      movements.get(+node.dataset.id)?.cancel();
      node.style.width = `${w}px`; node.style.height = `${h}px`;
      node.style.transform = `translate(${+node.dataset.x * w}px,${+node.dataset.y * h}px)`;
    }
    movements.clear(); effects.resize();
  }
  function nodeAt(pos) { const p = view.board[pos.y]?.[pos.x]; return p ? nodes.get(p.id) : null; }
  function clearHint() { clearTimeout(hintTimer); for (const node of nodes.values()) node.classList.remove('hint'); }
  function scheduleHint() {
    clearHint();
    if (busy || engine.status !== 'playing' || modal.open || activeBooster) return;
    hintTimer = setTimeout(() => {
      if (busy || modal.open || activeBooster || selected) return;
      const move = engine.legalMoves()[0];
      if (move) { nodeAt(move.a)?.classList.add('hint'); nodeAt(move.b)?.classList.add('hint'); }
    }, engine.moves === engine.config.moves ? 2200 : 4800);
  }
  function clearEffects(event, timing) {
    if (!motion || document.hidden) return;
    effects.burst(event, timing);
    if (event.power) document.querySelector('.board-frame').animate?.([{ translate: '0 0' }, { translate: '-2px 1px', offset: .2 }, { translate: '2px -1px', offset: .45 }, { translate: '-1px 0', offset: .7 }, { translate: '0 0' }], { duration: 220 });
    if (event.points && event.positions.length) {
      const center = event.positions.reduce((sum, p) => ({ x: sum.x + p.x, y: sum.y + p.y }), { x: 0, y: 0 });
      const popup = document.createElement('span'); popup.className = 'score-popup'; popup.textContent = `+${event.points}`;
      popup.style.left = `${(center.x / event.positions.length + .5) / COLS * 100}%`;
      popup.style.top = `${(center.y / event.positions.length + .5) / ROWS * 100}%`;
      $('effects').appendChild(popup); setTimeout(() => popup.remove(), 700);
    }
    const flown = new Set();
    for (const pos of event.positions) {
      const p = event.state.board[pos.y][pos.x], target = p && targetNodes.get(String(p.type));
      if (!p || p.special || !target || flown.has(p.type) || +target.dataset.remaining <= 0) continue;
      const source = nodeAt(pos); if (!source) continue;
      flown.add(p.type);
      const a = source.getBoundingClientRect(), b = target.getBoundingClientRect();
      const fly = document.createElement('span'); fly.className = `fly-food piece-art piece-${p.type}`;
      const size = Math.min(42, a.width);
      fly.style.cssText = `left:${a.x + (a.width - size) / 2}px;top:${a.y}px;width:${size}px;height:${size}px`;
      document.body.appendChild(fly);
      const dx = b.x + b.width / 2 - a.x - a.width / 2, dy = b.y + b.height / 2 - a.y - size / 2;
      const delay = timing.delayAt(pos) + 70;
      fly.style.opacity = '0';
      const animation = fly.animate?.([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${dx * .35}px,${dy * .65 - 18}px) scale(.85)`, offset: .55, opacity: 1 }, { transform: `translate(${dx}px,${dy}px) scale(.35)`, opacity: 0 }], { duration: 410, delay, fill: 'forwards', easing: 'cubic-bezier(.3,0,.6,1)' });
      if (animation) animation.finished.then(() => fly.remove()).catch(() => fly.remove());
      setTimeout(() => fly.remove(), delay + 500);
    }
  }
  function comboLabel(text, power = false) {
    clearTimeout(comboTimer); $('combo').classList.remove('show'); $('combo').textContent = text;
    $('combo').classList.toggle('power-message', power);
    requestAnimationFrame(() => $('combo').classList.add('show'));
    comboTimer = setTimeout(() => $('combo').classList.remove('show'), 820);
  }
  async function perform(result) {
    if (!result.events.length) return;
    const thisTurn = ++turnId, currentGame = engine;
    busy = true; selected = null; cancelBooster(); clearHint();
    // Rules resolve synchronously. Persist that finished state before visual playback,
    // so leaving or reloading the page during a cascade cannot undo the move.
    save();
    const newPowers = new Set();
    try {
    for (const event of result.events) {
      if (thisTurn !== turnId || document.hidden) break;
      const movementDuration = render(event.state, event.kind !== 'create', event.kind);
      if (event.kind === 'swap') { sound(); await wait(185); }
      if (event.kind === 'invalid') {
        event.positions.forEach(pos => nodeAt(pos)?.classList.add('shake'));
        sound('bad'); guidance('En az 3 aynı taş yan yana gelmeli. Hamlen harcanmadı.'); await wait(250);
      }
      if (event.kind === 'clear') {
        const timing = window.TeaEffects.plan(event);
        event.positions.forEach(pos => { const node = nodeAt(pos); if (node) { node.style.setProperty('--pop-delay', `${timing.delayAt(pos)}ms`); node.classList.add('clearing'); } });
        event.cracked.forEach(pos => { const node = nodeAt(pos); if (node) { node.style.setProperty('--pop-delay', `${timing.delayAt(pos)}ms`); node.classList.add('cracked'); } });
        clearEffects(event, timing); sound('clear', event.chain); haptic(event.power ? 18 : 8);
        if (event.chain > 1) comboLabel(event.chain > 3 ? 'Tadından yenmez!' : event.chain > 2 ? 'Oh, mis!' : 'Afiyet olsun!', event.power);
        else if (event.power) comboLabel('Şahane!', true);
        await wait(timing.duration);
      }
      if (event.kind === 'create') {
        event.pieces.forEach(piece => { nodes.get(piece.id)?.classList.add('power-born'); newPowers.add(piece.id); });
        const name = powerNames[event.pieces[0].special];
        comboLabel(`${name === 'Satır roketi' ? 'Roket' : name} hazır!`);
        guidance(`${name} oluştu. Dokunarak patlatabilirsin.`);
        await wait(280);
      }
      if (event.kind === 'fall') await wait(movementDuration + 24);
      if (event.kind === 'shuffle') { toast(event.automatic ? 'Eşleşme kalmadı, taşlar tazelendi.' : 'Taşlar tazelendi. Yeni bir başlangıç!'); await wait(300); }
    }
    } catch (error) {
      console.warn('Visual playback recovered; the resolved board is preserved.', error);
      effects.clear();
    } finally {
      if (thisTurn === turnId) { busy = false; render(engine.snapshot(), false); save(); }
    }
    if (thisTurn !== turnId || currentGame !== engine) return;
    if (engine.status !== 'playing') { if (!document.hidden) finish(); }
    else {
      const power = engine.board.flat().find(p => newPowers.has(p.id));
      if (power) { guidance(`${powerNames[power.special]} hazır. Dokunarak patlat!`); toast(`${powerNames[power.special]} kazandın! Dokunarak patlat.`); }
      else if (result.valid) guidance();
      scheduleHint();
    }
  }
  function choose(x, y) {
    if (busy || modal.open || engine.status !== 'playing') return;
    clearHint();
    const piece = engine.get(x, y), pos = { x, y };
    if (!piece) return;
    if (activeBooster) { void perform(engine.boost(activeBooster, pos)); return; }
    if (piece.type === 5) { sound('bad'); toast('Sepetin yanındaki taşları eşleştirerek onu topla.'); return; }
    if (selected && Math.abs(selected.x - x) + Math.abs(selected.y - y) === 1) { void perform(engine.swap(selected, pos)); return; }
    if (piece.special) { void perform(engine.activate(pos)); return; }
    selected = selected?.x === x && selected?.y === y ? null : pos;
    sound(); render(view, false); scheduleHint();
  }
  boardEl.addEventListener('click', e => {
    if (e.detail !== 0 && Date.now() < suppressClickUntil) return;
    const node = e.target.closest('.tile'); if (node) choose(Number(node.dataset.x), Number(node.dataset.y));
  });
  boardEl.addEventListener('pointerdown', e => {
    const node = e.target.closest('.tile');
    if (!node || pointer || !e.isPrimary || e.button !== 0 || busy || modal.open || engine.status !== 'playing') return;
    clearHint(); node.classList.add('pressed');
    pointer = { px: e.clientX, py: e.clientY, x: Number(node.dataset.x), y: Number(node.dataset.y), id: e.pointerId, handled: false, node };
    try { boardEl.setPointerCapture(e.pointerId); } catch { /* Native click remains available. */ }
  });
  function swipe(start, clientX, clientY) {
    const dx = clientX - start.px, dy = clientY - start.py;
    const threshold = Math.max(12, boardEl.clientWidth / COLS * .26);
    if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold || activeBooster) return false;
    start.handled = true; start.node.classList.remove('pressed'); selected = null;
    suppressClickUntil = Date.now() + 450;
    const to = Math.abs(dx) > Math.abs(dy) ? { x: start.x + Math.sign(dx), y: start.y } : { x: start.x, y: start.y + Math.sign(dy) };
    if (to.x >= 0 && to.x < COLS && to.y >= 0 && to.y < ROWS) void perform(engine.swap(start, to));
    return true;
  }
  boardEl.addEventListener('pointermove', e => {
    if (!pointer || e.pointerId !== pointer.id || pointer.handled || busy) return;
    swipe(pointer, e.clientX, e.clientY);
  });
  boardEl.addEventListener('pointerup', e => {
    if (!pointer || e.pointerId !== pointer.id) return;
    const start = pointer; pointer = null;
    start.node.classList.remove('pressed');
    if (boardEl.hasPointerCapture(e.pointerId)) boardEl.releasePointerCapture(e.pointerId);
    // Pointer capture retargets click to the board. Handle taps here, once.
    suppressClickUntil = Date.now() + 450;
    if (start.handled || busy || modal.open) return;
    if (!swipe(start, e.clientX, e.clientY)) choose(start.x, start.y);
  });
  function cancelPointer() { pointer?.node.classList.remove('pressed'); pointer = null; }
  boardEl.addEventListener('pointercancel', cancelPointer);
  boardEl.addEventListener('lostpointercapture', cancelPointer);
  boardEl.addEventListener('keydown', e => {
    const node = e.target.closest('.tile'); if (!node || busy) return;
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[e.key]) {
      e.preventDefault(); const [dx, dy] = arrows[e.key];
      nodeAt({ x: Math.max(0, Math.min(COLS - 1, +node.dataset.x + dx)), y: Math.max(0, Math.min(ROWS - 1, +node.dataset.y + dy)) })?.focus();
    }
  });
  function cancelBooster() {
    activeBooster = null; document.querySelectorAll('.booster').forEach(b => b.classList.remove('active'));
    document.querySelector('.board-frame').classList.remove('targeting'); guidance();
  }
  document.querySelectorAll('[data-booster]').forEach(button => button.addEventListener('click', () => {
    if (busy || modal.open || engine.status !== 'playing') return;
    const kind = button.dataset.booster;
    if (!engine.boosters[kind]) return;
    clearHint(); sound(); selected = null;
    if (kind === 'shuffle') { void perform(engine.boost(kind)); return; }
    if (activeBooster === kind) { cancelBooster(); render(); scheduleHint(); return; }
    cancelBooster(); activeBooster = kind; button.classList.add('active');
    document.querySelector('.board-frame').classList.add('targeting');
    guidance(kind === 'hammer' ? 'Kırmak istediğin taşa dokun. İptal için tokmağa tekrar bas.' : 'Temizlemek istediğin satıra dokun.'); render();
  }));
  function openDialog(html, { dismissible = true } = {}) {
    clearHint(); selected = null; render(view, false);
    modal.classList.remove('district-map-dialog');
    content.innerHTML = html; $('closeModal').hidden = !dismissible;
    modal.dataset.dismissible = String(dismissible);
    if (!modal.open) modal.showModal();
  }
  function closeDialog() { modal.close(); scheduleHint(); }
  $('closeModal').addEventListener('click', closeDialog);
  modal.addEventListener('cancel', e => { if (modal.dataset.dismissible === 'false') e.preventDefault(); });
  modal.addEventListener('close', scheduleHint);
  modal.addEventListener('click', e => {
    const bounds = modal.getBoundingClientRect();
    if (e.target === modal && modal.dataset.dismissible !== 'false' && (e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom)) closeDialog();
  });
  function help() {
    if (busy) return;
    openDialog(`<div class="modal-eyebrow">KÜÇÜK BİR MOLA</div><h1 class="modal-title" id="modalTitle">Nasıl oynanır?</h1><div class="help-piece-row">${[0,1,2,3,4].map(art).join('')}</div><div class="help-step"><span>1</span><div><b>Değiştir, eşleştir.</b>Bir taşı yanındakine doğru kaydır veya iki taşa sırayla dokun. En az 3 aynı taşı yan yana getir.</div></div><div class="help-step"><span>2</span><div><b>Sepetleri sofraya taşı.</b>Sepetlerin yanında eşleştirme yap. Üzerinde 2 yazan sepetler iki darbe ister.</div></div><div class="help-step"><span>3</span><div><b>Daha büyük eşleşme, daha çok keyif.</b>4 taş: satır roketi. 5 taş: renk yıldızı. T veya L: çevre bombası. Özel taşa dokunarak çalıştır.</div></div><div class="help-step"><span>✦</span><div><b>Hamleler bitmeden hedefleri tamamla.</b>Alttaki güçlendiriciler hamle harcamaz. Her bölümde yenilenir. Geçersiz eşleşme hamle harcamaz.</div></div><button class="primary-button" id="playNow">Çaylar hazır, başlayalım ${svg('arrow')}</button>`);
    $('playNow').onclick = () => { profile.seenHelp = true; save(); closeDialog(); };
  }
  function settings() {
    if (busy) { toast('Taşlar yerleşiyor, bir saniye…'); return; }
    openDialog(`<div class="modal-eyebrow">KEYFİNE GÖRE</div><h1 class="modal-title" id="modalTitle">Küçük ayarlar</h1>
      <div class="settings-row"><span>${svg('sound')} Oyun sesleri</span><button class="switch" id="soundToggle" role="switch" aria-label="Oyun sesleri" aria-checked="${profile.sound}"></button></div>
      <div class="settings-row"><span>${svg('star')} Canlı efektler</span><button class="switch" id="motionToggle" role="switch" aria-label="Canlı efektler" aria-checked="${profile.motion}"></button></div>
      ${navigator.vibrate ? `<div class="settings-row"><span>Hafif titreşim</span><button class="switch" id="hapticToggle" role="switch" aria-label="Hafif titreşim" aria-checked="${profile.haptics}"></button></div>` : ''}
      <div class="settings-actions"><button class="primary-button" id="resumeButton">Oyuna dön ${svg('arrow')}</button><button class="secondary-button" id="restartButton">Bu bölüme yeniden başla</button><button class="secondary-button" id="settingsMap">Bölümler</button></div>`);
    $('soundToggle').onclick = () => { profile.sound = !profile.sound; $('soundToggle').setAttribute('aria-checked', String(profile.sound)); save(); sound(); };
    $('motionToggle').onclick = () => { profile.motion = !profile.motion; $('motionToggle').setAttribute('aria-checked', String(profile.motion)); motionPreference(); save(); };
    if ($('hapticToggle')) $('hapticToggle').onclick = () => { profile.haptics = !profile.haptics; $('hapticToggle').setAttribute('aria-checked', String(profile.haptics)); save(); haptic(); };
    $('resumeButton').onclick = closeDialog;
    $('restartButton').onclick = () => { closeDialog(); start(engine.level); };
    $('settingsMap').onclick = map;
  }
  function map() {
    if (busy) { toast('Taşlar yerleşiyor, bir saniye…'); return; }
    openDialog(`<div class="modal-eyebrow">BİR ŞEHİR, BEŞ GÜZEL MOLA</div><h1 class="modal-title" id="modalTitle">İstanbul yolculuğu</h1><p class="map-intro">Her semtte yeni bir manzara.<br>Sofrayı tamamla, sıradaki durağa geç.</p><div class="map-progress">${districts.map((_, i) => `<i class="${i <= profile.unlocked ? 'open' : ''}"></i>`).join('')} ${profile.unlocked + 1} / ${districts.length} durak açık</div>
      <div class="istanbul-map" role="group" aria-label="İstanbul semtleri ve bölüm ilerlemesi">
        <svg class="map-geography" viewBox="0 0 400 660" preserveAspectRatio="none" aria-hidden="true"><defs><pattern id="map-waves" width="45" height="35" patternUnits="userSpaceOnUse"><path d="M5 20q8-5 16 0t16 0" fill="none" stroke="#ffffff50" stroke-width="2"/></pattern></defs><rect width="400" height="660" fill="url(#map-waves)"/><path d="M0 0h226q-100 75-50 165t-45 155q-65 50-40 145t-10 195H0Z" fill="#e5e9c8"/><path d="M400 0h-55q-70 140-25 225t-10 170q-50 95 10 165t30 100h50Z" fill="#dce9c5"/><path d="M120 79C120 132 280 145 280 205S120 267 120 330s160 62 160 125-160 61-160 126" fill="none" stroke="#ffffffa8" stroke-width="12" stroke-linecap="round"/><path d="M120 79C120 132 280 145 280 205S120 267 120 330s160 62 160 125-160 61-160 126" fill="none" stroke="#baae7c" stroke-width="3" stroke-dasharray="2 10" stroke-linecap="round"/><g fill="#92b995" opacity=".6"><circle cx="23" cy="180" r="12"/><circle cx="35" cy="192" r="9"/><circle cx="376" cy="323" r="14"/><circle cx="364" cy="339" r="10"/><circle cx="25" cy="453" r="13"/><circle cx="39" cy="469" r="9"/></g></svg>
        <span class="map-sea-label" aria-hidden="true">BOĞAZ</span>
        ${districts.map((d, i) => `<button class="map-node${engine.level === i ? ' current' : ''}" style="--x:${i % 2 ? 70 : 30}%;--y:${12 + i * 19}%;--stop:${d.color}" data-level="${i}" ${i > profile.unlocked ? 'disabled' : ''} ${engine.level === i ? 'aria-current="step"' : ''} aria-label="${d.name}, bölüm ${i + 1}, ${i > profile.unlocked ? 'kilitli' : profile.best[i] ? `${profile.best[i]} yıldız, tekrar oyna` : engine.level === i ? 'mevcut bölüm, devam et' : 'oyna'}">${engine.level === i ? '<span class="map-current-tag">BURADASIN</span>' : ''}<div class="map-picture"><img src="${d.image}" alt="" loading="lazy"><span class="map-landmark"><img src="assets/district-${d.icon}.svg" alt=""></span><span class="map-number">${i > profile.unlocked ? svg('lock') : i + 1}</span></div><strong>${d.name}</strong><small>${LEVELS[i].name}</small><span class="map-stars">${i > profile.unlocked ? 'Kilitli' : profile.best[i] ? '★'.repeat(profile.best[i]) + '☆'.repeat(3 - profile.best[i]) : engine.level === i ? 'Devam et →' : 'Başlayalım →'}</span></button>`).join('')}
      </div><p class="map-footnote">Temsili İstanbul rotası<br>Bölümü tamamla, sıradaki semti keşfet.</p><button class="secondary-button map-return" id="mapReturn">Oyuna dön</button>`);
    modal.classList.add('district-map-dialog');
    $('mapReturn').onclick = closeDialog;
    content.querySelectorAll('[data-level]').forEach(b => b.onclick = () => {
      const level = Number(b.dataset.level);
      if (level > profile.unlocked) return;
      if (level === engine.level && engine.status === 'playing') { closeDialog(); return; }
      if (engine.status === 'playing' && engine.moves < engine.config.moves) {
        openDialog(`<div class="modal-eyebrow">YENİ BİR MOLA</div><h1 class="modal-title" id="modalTitle">Bölüm değiştirilsin mi?</h1><p class="modal-copy">Bu bölümdeki mevcut turun sıfırlanacak. Kazandığın yıldızlar ve altınlar korunur.</p><button class="primary-button" id="changeLevel">${LEVELS[level].name} bölümüne git</button><button class="secondary-button" id="keepPlaying">Oyuna dön</button>`);
        $('changeLevel').onclick = () => { closeDialog(); start(level); }; $('keepPlaying').onclick = closeDialog;
      } else { closeDialog(); start(level); }
    });
  }
  function start(level) {
    turnId++; cancelPointer(); effects.clear(); targetNodes.clear();
    engine = new Engine(level); profile.awarded = false; selected = null; busy = false;
    cancelBooster(); render(engine.snapshot(), false); save(); scheduleHint();
    $('hostText').innerHTML = 'Çaylar benden,<br><strong>eşleştirmeler senden!</strong>';
  }
  function finish() {
    clearHint();
    const won = engine.status === 'won', stars = engine.stars();
    let reward = profile.best[engine.level] ? 25 : 100 + stars * 25;
    if (won && !profile.awarded) {
      profile.coins += reward; profile.best[engine.level] = Math.max(profile.best[engine.level] || 0, stars);
      profile.unlocked = Math.max(profile.unlocked, Math.min(LEVELS.length - 1, engine.level + 1));
      profile.awarded = true; save(); sound('win'); effects.celebrate();
    }
    render();
    if (won) {
      $('hostText').innerHTML = 'Eline sağlık!<br><strong>Bir çay daha?</strong>';
      const last = engine.level === LEVELS.length - 1;
      openDialog(`<div class="modal-eyebrow">${last ? 'BOĞAZ TURU TAMAMLANDI' : 'SOFRA HAZIR'}</div><h1 class="modal-title" id="modalTitle">${last ? 'Keyfine doyulmaz!' : 'Eline sağlık!'}</h1><div class="result-stars">${[1,2,3].map(n => `<svg class="${n <= stars ? 'earned' : ''}" aria-label="${n <= stars ? 'Kazanılan yıldız' : 'Boş yıldız'}"><use href="#i-star"/></svg>`).join('')}</div><p class="modal-copy">${engine.score.toLocaleString('tr-TR')} puan · ${engine.moves} hamle arttı<br>${last ? 'Beş mahalle, beş güzel sofra. Yeniden oynamaya ne dersin?' : 'Kahvaltı tamam, sıradaki durak seni bekliyor.'}</p><div class="result-reward"><span class="coin">₺</span> Bölüm ödülü alındı</div><button class="primary-button" id="nextLevel">${last ? 'Yolculuğa yeniden çık' : 'Sıradaki bölüm'} ${svg('arrow')}</button><button class="secondary-button" id="resultMap">Boğaz yolculuğu</button>`, { dismissible: false });
      $('nextLevel').onclick = () => { closeDialog(); start(last ? 0 : engine.level + 1); };
      $('resultMap').onclick = map;
    } else {
      openDialog(`<div class="piece-art piece-1 result-basket" aria-hidden="true"></div><div class="modal-eyebrow">ÇAY MOLASI</div><h1 class="modal-title" id="modalTitle">Bir daha deneyelim mi?</h1><p class="modal-copy">Hamleler bitti ama çayımız hâlâ sıcak.<br>Sepetlerin yakınındaki eşleşmelere öncelik ver.</p><button class="primary-button" id="retryLevel">Yeniden dene ${svg('arrow')}</button><button class="secondary-button" id="resultMap">Bölümlere bak</button>`, { dismissible: false });
      $('retryLevel').onclick = () => { closeDialog(); start(engine.level); }; $('resultMap').onclick = map;
    }
  }
  $('settingsButton').onclick = settings; $('helpButton').onclick = help; $('mapButton').onclick = map; $('brandButton').onclick = map; $('districtButton').onclick = map; $('levelTitle').onclick = map;
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.open) { selected = null; cancelBooster(); render(); scheduleHint(); } });
  new ResizeObserver(layoutTiles).observe(boardEl);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelPointer(); clearHint(); effects.clear(); save(); }
    else if (!busy && engine.status !== 'playing' && !modal.open) finish();
    else scheduleHint();
  });
  window.addEventListener('pagehide', () => { save(); effects.clear(); });
  render(engine.snapshot(), false); save(); scheduleHint();
  if (engine.status !== 'playing') finish();
})();
