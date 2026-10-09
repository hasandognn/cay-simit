(() => {
  'use strict';
  const { Engine, LEVELS, NAMES, COLS, ROWS } = window.TeaGame;
  const $ = id => document.getElementById(id);
  const boardEl = $('board'), modal = $('modal'), content = $('modalContent');
  const STORAGE = 'cay-simit-v1';
  const motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const defaultGuidance = 'Yan yana taşları değiştir, 3 tanesini eşleştir.';
  const svg = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const art = type => `<span class="piece-art piece-${type}" aria-hidden="true"></span>`;
  let profile;
  try { profile = JSON.parse(localStorage.getItem(STORAGE)); } catch { /* Storage may be unavailable. */ }
  if (!profile || typeof profile !== 'object') profile = {};
  profile = {
    unlocked: Math.max(0, Math.min(LEVELS.length - 1, Number.isInteger(profile.unlocked) ? profile.unlocked : 0)),
    coins: Number.isSafeInteger(profile.coins) && profile.coins >= 0 ? profile.coins : 0,
    best: Array.isArray(profile.best) ? profile.best.slice(0, LEVELS.length).map(n => [1, 2, 3].includes(n) ? n : 0) : [],
    sound: profile.sound !== false,
    active: profile.active,
    awarded: profile.awarded === true,
    seenHelp: profile.seenHelp === true,
  };
  let engine = Engine.restore(profile.active) || new Engine(profile.unlocked);
  if (!profile.active || engine.status === 'playing') profile.awarded = false;
  let view = engine.snapshot(), busy = false, selected = null, activeBooster = null;
  let hintTimer, toastTimer, comboTimer, pointer, suppressClickUntil = 0, audioContext;
  const nodes = new Map();
  const wait = ms => new Promise(resolve => setTimeout(resolve, motion ? ms : Math.min(ms, 25)));
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
  function render(state = engine.snapshot(), animate = true) {
    view = state;
    const size = { w: boardEl.clientWidth / COLS, h: boardEl.clientHeight / ROWS };
    const alive = new Set();
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
        node.innerHTML = art(p.type) + (p.type === 5 && p.hp > 1 ? `<span class="basket-strength">${p.hp}</span>` : '');
        node.dataset.signature = signature;
      }
      node.className = `tile${p.type === 5 ? ' basket' : ''}${p.special ? ` special special-${p.special}` : ''}${selected?.x === x && selected?.y === y ? ' selected' : ''}`;
      node.dataset.x = x; node.dataset.y = y; node.dataset.id = p.id;
      const specialLabel = p.special ? { row: ', satır roketi', bomb: ', lokum bombası', rainbow: ', renk yıldızı' }[p.special] : '';
      node.setAttribute('aria-label', `${y + 1}. satır, ${x + 1}. sütun: ${NAMES[p.type]}${specialLabel}${p.type === 5 ? `, ${p.hp} darbe` : ''}`);
      node.setAttribute('aria-pressed', selected?.x === x && selected?.y === y ? 'true' : 'false');
      node.style.width = `${size.w}px`; node.style.height = `${size.h}px`;
      const destination = `translate(${x * size.w}px,${y * size.h}px)`;
      if (fresh && animate && motion) {
        node.style.transition = 'none'; node.style.transform = `translate(${x * size.w}px,${-size.h * (1 + (ROWS - y) / 3)}px)`; node.style.opacity = '0';
        requestAnimationFrame(() => requestAnimationFrame(() => { node.style.transition = ''; node.style.transform = destination; node.style.opacity = '1'; }));
      } else {
        node.style.transition = animate && motion ? '' : 'none'; node.style.transform = destination; node.style.opacity = '1';
      }
    }
    for (const [id, node] of nodes) if (!alive.has(id)) { node.remove(); nodes.delete(id); }
    $('moves').textContent = state.moves;
    $('moves').parentElement.classList.toggle('low', state.moves <= 5);
    $('score').textContent = state.score.toLocaleString('tr-TR');
    $('scoreFill').style.width = `${Math.min(100, state.score / 6000 * 100)}%`;
    document.querySelectorAll('.progress-star').forEach((star, i) => star.classList.toggle('earned', state.score >= [1600, 3700, 6000][i]));
    $('levelTitle').textContent = `BÖLÜM ${engine.level + 1} · ${LEVELS[engine.level].name.toLocaleUpperCase('tr-TR')}`;
    $('coins').textContent = profile.coins.toLocaleString('tr-TR');
    renderTargets(state);
    for (const kind of ['hammer', 'rocket', 'shuffle']) {
      $(`${kind}Count`).textContent = state.boosters[kind];
      $(`${kind}Button`).disabled = busy || state.status !== 'playing' || !state.boosters[kind];
    }
    boardEl.setAttribute('aria-busy', String(busy));
  }
  function renderTargets(state) {
    const markup = Object.entries(engine.config.targets).map(([t, total]) => {
      const left = Math.max(0, total - (state.collected[t] || 0));
      return `<div class="target${left === 0 ? ' done' : ''}" aria-label="${NAMES[t]}: ${left} kaldı">${art(t)}<b>${left || '✓'}</b></div>`;
    }).join('');
    if ($('targets').innerHTML !== markup) $('targets').innerHTML = markup;
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
    }, 6500);
  }
  function particles(positions) {
    if (!motion) return;
    const w = boardEl.clientWidth / COLS, h = boardEl.clientHeight / ROWS;
    const colors = ['#fff9d4', '#f6bc4c', '#73c7b2', '#fa9070'];
    positions.slice(0, 22).forEach(({ x, y }, index) => {
      for (let i = 0; i < 5; i++) {
        const particle = document.createElement('i'); particle.className = 'particle';
        particle.style.left = `${(x + .5) * w}px`; particle.style.top = `${(y + .5) * h}px`;
        const angle = (i / 5) * Math.PI * 2 + index;
        particle.style.setProperty('--dx', `${Math.cos(angle) * 37}px`); particle.style.setProperty('--dy', `${Math.sin(angle) * 35 + 12}px`);
        particle.style.setProperty('--color', colors[(i + index) % colors.length]);
        $('effects').appendChild(particle); setTimeout(() => particle.remove(), 650);
      }
    });
  }
  function comboLabel(text) {
    clearTimeout(comboTimer); $('combo').classList.remove('show'); $('combo').textContent = text;
    requestAnimationFrame(() => $('combo').classList.add('show'));
    comboTimer = setTimeout(() => $('combo').classList.remove('show'), 820);
  }
  async function perform(result) {
    if (!result.events.length) return;
    busy = true; selected = null; cancelBooster(); clearHint();
    for (const event of result.events) {
      render(event.state);
      if (event.kind === 'swap') { sound(); await wait(210); }
      if (event.kind === 'invalid') {
        event.positions.forEach(pos => nodeAt(pos)?.classList.add('shake'));
        sound('bad'); guidance('En az 3 aynı taş yan yana gelmeli. Hamlen harcanmadı.'); await wait(250);
      }
      if (event.kind === 'clear') {
        event.positions.forEach(pos => nodeAt(pos)?.classList.add('clearing'));
        event.cracked.forEach(pos => nodeAt(pos)?.classList.add('cracked'));
        particles(event.positions); sound('clear', event.chain);
        if (event.chain > 1) comboLabel(event.chain > 3 ? 'Tadından yenmez!' : event.chain > 2 ? 'Oh, mis!' : 'Afiyet olsun!');
        else if (event.power) comboLabel('Şahane!');
        if (event.created.length) guidance('Özel taş hazır! Dokunarak patlatabilirsin.');
        await wait(230);
      }
      if (event.kind === 'fall') await wait(300);
      if (event.kind === 'shuffle') { toast(event.automatic ? 'Eşleşme kalmadı, taşlar tazelendi.' : 'Taşlar tazelendi. Yeni bir başlangıç!'); await wait(300); }
    }
    busy = false; render(); save();
    if (engine.status !== 'playing') { await wait(400); finish(); }
    else { if (result.valid) guidance(); scheduleHint(); }
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
    if (Date.now() < suppressClickUntil) return;
    const node = e.target.closest('.tile'); if (node) choose(Number(node.dataset.x), Number(node.dataset.y));
  });
  boardEl.addEventListener('pointerdown', e => {
    const node = e.target.closest('.tile');
    if (!node || busy || modal.open || engine.status !== 'playing') return;
    pointer = { px: e.clientX, py: e.clientY, x: Number(node.dataset.x), y: Number(node.dataset.y), id: e.pointerId };
    boardEl.setPointerCapture(e.pointerId);
  });
  boardEl.addEventListener('pointerup', e => {
    if (!pointer || e.pointerId !== pointer.id) return;
    const start = pointer; pointer = null;
    if (boardEl.hasPointerCapture(e.pointerId)) boardEl.releasePointerCapture(e.pointerId);
    const dx = e.clientX - start.px, dy = e.clientY - start.py;
    // Pointer capture retargets click to the board. Handle taps here, once.
    suppressClickUntil = Date.now() + 450;
    if (busy || modal.open) return;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18 || activeBooster) { choose(start.x, start.y); return; }
    const to = Math.abs(dx) > Math.abs(dy) ? { x: start.x + Math.sign(dx), y: start.y } : { x: start.x, y: start.y + Math.sign(dy) };
    if (to.x >= 0 && to.x < COLS && to.y >= 0 && to.y < ROWS) void perform(engine.swap(start, to));
  });
  boardEl.addEventListener('pointercancel', () => { pointer = null; });
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
    openDialog(`<div class="modal-eyebrow">KEYFİNE GÖRE</div><h1 class="modal-title" id="modalTitle">Küçük ayarlar</h1><div class="settings-row"><span>${svg('sound')} Oyun sesleri</span><button class="switch" id="soundToggle" role="switch" aria-label="Oyun sesleri" aria-checked="${profile.sound}"></button></div><div class="settings-actions"><button class="primary-button" id="resumeButton">Oyuna dön ${svg('arrow')}</button><button class="secondary-button" id="restartButton">Bu bölüme yeniden başla</button><button class="secondary-button" id="settingsMap">Bölümler</button></div>`);
    $('soundToggle').onclick = () => { profile.sound = !profile.sound; $('soundToggle').setAttribute('aria-checked', String(profile.sound)); save(); sound(); };
    $('resumeButton').onclick = closeDialog;
    $('restartButton').onclick = () => { closeDialog(); start(engine.level); };
    $('settingsMap').onclick = map;
  }
  function map() {
    if (busy) { toast('Taşlar yerleşiyor, bir saniye…'); return; }
    openDialog(`<div class="modal-eyebrow">MAHALLE MAHALLE</div><h1 class="modal-title" id="modalTitle">Boğaz yolculuğu</h1><p class="modal-copy">Her durakta başka bir kahvaltı,<br>her sofrada biraz daha İstanbul.</p><div class="level-list">${LEVELS.map((l, i) => `<button class="level-option${engine.level === i ? ' current' : ''}" data-level="${i}" ${i > profile.unlocked ? 'disabled' : ''}><span class="level-number">${i + 1}</span><span class="level-name">${l.name}<small>${l.place}</small></span><span class="level-status">${i > profile.unlocked ? 'Kilitli' : profile.best[i] ? '★'.repeat(profile.best[i]) : 'Oyna →'}</span></button>`).join('')}</div><p class="modal-copy" style="margin-bottom:0">Bölümü tamamla, sıradaki durağı aç.</p>`);
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
      profile.awarded = true; save(); sound('win');
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
  $('settingsButton').onclick = settings; $('helpButton').onclick = help; $('mapButton').onclick = map; $('brandButton').onclick = map;
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.open) { selected = null; cancelBooster(); render(); scheduleHint(); } });
  new ResizeObserver(() => { render(view, false); }).observe(boardEl);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearHint(); if (!busy) save(); } else scheduleHint(); });
  render(engine.snapshot(), false); save(); scheduleHint();
  if (engine.status !== 'playing') finish();
})();
