/* Bounded canvas; no permanent animation loop. DOM and canvas share impact timings. */
(function (root) {
  'use strict';
  const LAUNCH = 140, CELL_FLIGHT = 85;
  const colors = ['#ffc46d', '#ff8fae', '#c3a0ff', '#80e7eb', '#bcebac'];
  class TeaEffects {
    constructor(canvas, enabled) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.enabled = enabled;
      this.items = []; this.raf = 0; this.width = 0; this.height = 0; this.images = {};
      for (const name of ['rocket', 'rainbow']) {
        const image = new Image(); image.src = `assets/${name}.svg`; this.images[name] = image;
      }
    }
    static plan(event) {
      const powers = (event.activated || []).filter((p, i, all) => all.findIndex(q => p.x === q.x && p.y === q.y && p.special === q.special) === i);
      const delays = new Map(), key = p => `${p.x},${p.y}`;
      const direct = pos => {
        let at = Infinity;
        for (const p of powers) {
          const dx = Math.abs(pos.x - p.x), dy = Math.abs(pos.y - p.y);
          if (!dx && !dy) at = Math.min(at, LAUNCH);
          if (p.special === 'row' && !dy) at = Math.min(at, LAUNCH + dx * CELL_FLIGHT);
          if (p.special === 'bomb' && dx <= 1 && dy <= 1) at = Math.min(at, LAUNCH + Math.hypot(dx, dy) * 60);
          if (p.special === 'rainbow') at = Math.min(at, LAUNCH + 130 + Math.hypot(dx, dy) * 24);
        }
        return at;
      };
      [...event.positions, ...(event.cracked || [])].forEach((pos, index) => {
        let at = direct(pos);
        // A basket beside a removed food receives that food's impact.
        if (!Number.isFinite(at) && event.state.board[pos.y]?.[pos.x]?.type === 5) {
          for (const q of event.positions) if (Math.abs(q.x - pos.x) + Math.abs(q.y - pos.y) === 1) at = Math.min(at, direct(q) + 25);
        }
        delays.set(key(pos), Number.isFinite(at) ? at : index % 4 * 12);
      });
      const latest = Math.max(0, ...delays.values());
      return { powers, launch: LAUNCH, cellFlight: CELL_FLIGHT, delayAt: pos => delays.get(key(pos)) || 0, duration: Math.max(powers.length ? 700 : 325, latest + 325) };
    }
    resize() {
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      if (w === this.width && h === this.height) return;
      this.clear(); this.width = w; this.height = h;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
      this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    clear() {
      cancelAnimationFrame(this.raf); this.raf = 0; this.items.length = 0;
      this.ctx?.clearRect(0, 0, this.width, this.height);
    }
    burst(event, timing = TeaEffects.plan(event)) {
      if (!this.enabled() || !this.ctx || document.hidden) return;
      this.resize();
      const cell = this.width / 7, cellH = this.height / 8;
      const palettes = [['#e5a245','#fff0b2'],['#f26b42','#ffd689'],['#fffbea','#f8d982'],['#ac6ee0','#ecc6ff'],['#fb654e','#ffbd75'],['#dca15e','#ffedb1']];
      event.positions.slice(0, 36).forEach(({ x, y }, index) => {
        const px = (x + .5) * cell, py = (y + .5) * cellH, palette = palettes[event.state.board[y][x]?.type || 0];
        const delay = timing.delayAt({ x, y }) / 1000 + .06;
        this.items.push({ kind: 'ring', x: px, y: py, age: -delay, life: .3, radius: cell * .58, color: palette[1] });
        for (let n = 0; n < 5; n++) {
          const angle = n / 5 * Math.PI * 2 + index * .7, speed = cell * (1.5 + n % 3 * .45);
          this.items.push({ kind: n % 3 ? 'chip' : 'spark', x: px, y: py, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - cell * .8, radius: 2.2 + n % 3, age: -delay, life: .4 + n % 3 * .06, color: palette[n % 2], angle });
        }
      });
      for (const power of timing.powers) {
        const x = (power.x + .5) * cell, y = (power.y + .5) * cellH, age = -timing.launch / 1000;
        this.items.push({ kind: 'charge', x, y, age: 0, life: .18, radius: cell * .65, color: '#fff3bb' });
        if (power.special === 'row') for (const dir of [-1, 1]) {
          const distance = dir < 0 ? x + cell * .5 : this.width - x + cell * .5;
          this.items.push({ kind: 'rocket', x, y, dir, distance, age, life: distance / cell * timing.cellFlight / 1000, cell, color: '#ffce73' });
        }
        if (power.special === 'bomb') {
          this.items.push({ kind: 'blast', x, y, age, life: .5, radius: cell * 1.65, color: '#ffde93' });
          for (let n = 0; n < 3; n++) this.items.push({ kind: 'shock', x, y, age: age - n * .055, life: .42, radius: cell * (1.55 + n * .12), color: ['#fff5be', '#dfabf8', '#b27ee5'][n] });
        }
        if (power.special === 'rainbow') {
          this.items.push({ kind: 'star', x, y, age: 0, life: .48, radius: cell * .7, color: '#fff6bb' });
          event.positions.slice(0, 32).forEach((pos, i) => {
            if (pos.x === power.x && pos.y === power.y) return;
            const flight = .13 + Math.hypot(pos.x - power.x, pos.y - power.y) * .024;
            this.items.push({ kind: 'ray', x, y, tx: (pos.x + .5) * cell, ty: (pos.y + .5) * cellH, age, life: flight + .12, flight, color: colors[i % colors.length] });
          });
        }
      }
      if (this.items.length > 320) this.items.splice(0, this.items.length - 320);
      this.start();
    }
    celebrate() {
      if (!this.enabled() || !this.ctx) return;
      this.resize();
      for (let i = 0; i < 75; i++) {
        const angle = -Math.PI * (.12 + Math.random() * .76);
        this.items.push({ kind: 'chip', x: this.width * .5, y: this.height * .65, vx: Math.cos(angle) * (100 + Math.random() * 180), vy: Math.sin(angle) * (180 + Math.random() * 220), radius: 3 + i % 3, age: -i % 5 * .012, life: 1.1 + i % 3 * .2, color: colors[i % colors.length], angle });
      }
      this.start();
    }
    start() {
      if (this.raf) return;
      this.last = performance.now(); this.raf = requestAnimationFrame(now => this.draw(now));
    }
    sprite(name, x, y, size, angle = 0) {
      const c = this.ctx, image = this.images[name];
      c.save(); c.translate(x, y); c.rotate(angle);
      if (image?.complete && image.naturalWidth) c.drawImage(image, -size / 2, -size / 2, size, size);
      else {
        c.fillStyle = '#ffca73'; c.beginPath(); c.moveTo(0, -size * .4); c.lineTo(size * .2, size * .25); c.lineTo(-size * .2, size * .25); c.closePath(); c.fill();
      }
      c.restore();
    }
    draw(now) {
      this.raf = 0;
      if (document.hidden || !this.enabled()) { this.clear(); return; }
      const elapsed = Math.max(0, (now - this.last) / 1000), dt = Math.min(elapsed, .04); this.last = now;
      const c = this.ctx; c.clearRect(0, 0, this.width, this.height);
      for (const p of this.items) {
        p.age += elapsed;
        if (p.age < 0 || p.age >= p.life) continue;
        const t = p.age / p.life, fade = 1 - t;
        c.save(); c.globalAlpha = fade; c.fillStyle = p.color; c.strokeStyle = p.color;
        if (p.kind === 'chip' || p.kind === 'spark') {
          p.vy += 370 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
          c.translate(p.x, p.y); c.rotate(p.angle + p.age * 7);
          if (p.kind === 'spark') {
            const r = p.radius * (1.5 - t * .7);
            c.beginPath(); c.moveTo(0, -r * 2); c.lineTo(r * .4, -r * .4); c.lineTo(r * 2, 0); c.lineTo(r * .4, r * .4); c.lineTo(0, r * 2); c.lineTo(-r * .4, r * .4); c.lineTo(-r * 2, 0); c.lineTo(-r * .4, -r * .4); c.closePath(); c.fill();
          } else c.fillRect(-p.radius, -p.radius / 2, p.radius * 2, p.radius);
        } else if (p.kind === 'ring' || p.kind === 'shock' || p.kind === 'charge') {
          c.lineWidth = (p.kind === 'shock' ? 6 : 2.5) * fade;
          const radius = p.radius * (p.kind === 'charge' ? fade : 1 - Math.pow(1 - t, 3));
          c.beginPath(); c.arc(p.x, p.y, radius, 0, Math.PI * 2); c.stroke();
        } else if (p.kind === 'rocket') {
          const x = p.x + p.dir * p.distance * t, tail = x - p.dir * p.cell * 1.5;
          c.globalAlpha = Math.min(1, fade * 5);
          const trail = c.createLinearGradient(tail, p.y, x, p.y);
          trail.addColorStop(0, '#ffb64000'); trail.addColorStop(.6, '#ffb34b99'); trail.addColorStop(1, '#fff6bf'); c.fillStyle = trail;
          c.beginPath(); c.moveTo(tail, p.y); c.quadraticCurveTo(x - p.dir * p.cell * .4, p.y - p.cell * .21, x, p.y - p.cell * .12); c.lineTo(x, p.y + p.cell * .12); c.quadraticCurveTo(x - p.dir * p.cell * .4, p.y + p.cell * .21, tail, p.y); c.fill();
          c.strokeStyle = '#fff7d4'; c.lineWidth = 2; c.beginPath(); c.moveTo(tail + p.dir * p.cell * .5, p.y); c.lineTo(x, p.y); c.stroke();
          for (let i = 0; i < 4; i++) {
            c.globalAlpha = (1 - i / 4) * .7; c.fillStyle = i % 2 ? '#fff4b1' : '#ffaf55';
            c.beginPath(); c.arc(x - p.dir * p.cell * (.45 + i * .25), p.y + Math.sin(p.age * 45 + i * 2) * p.cell * .09, 2.2 - i * .3, 0, Math.PI * 2); c.fill();
          }
          c.globalAlpha = Math.min(1, fade * 6); this.sprite('rocket', x, p.y, p.cell * .96, p.dir * Math.PI / 2);
        } else if (p.kind === 'blast') {
          const radius = p.radius * (.2 + .8 * (1 - Math.pow(fade, 3))), glow = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
          glow.addColorStop(0, '#fffcefe6'); glow.addColorStop(.3, '#ffdc8fba'); glow.addColorStop(.65, '#d994e976'); glow.addColorStop(1, '#be7ceb00');
          c.fillStyle = glow; c.fillRect(p.x - radius, p.y - radius, radius * 2, radius * 2);
          for (let i = 0; i < 8; i++) {
            const a = i * Math.PI / 4, r = radius * .72;
            c.fillStyle = i % 2 ? '#fff0c3' : '#d9b6ef'; c.globalAlpha = fade * .65;
            c.beginPath(); c.arc(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, radius * .19 * fade, 0, Math.PI * 2); c.fill();
          }
        } else if (p.kind === 'star') {
          c.globalAlpha = Math.min(1, fade * 3); this.sprite('rainbow', p.x, p.y, p.radius * (1.5 + Math.sin(t * Math.PI) * .35), t * .45);
        } else if (p.kind === 'ray') {
          const travel = Math.min(1, p.age / p.flight), tx = p.x + (p.tx - p.x) * travel, ty = p.y + (p.ty - p.y) * travel;
          c.globalAlpha = .65 * Math.min(1, (p.life - p.age) / .12); c.lineWidth = 2;
          c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(tx, ty); c.stroke();
          c.globalAlpha = 1; c.fillStyle = '#fffbe0'; c.beginPath(); c.arc(tx, ty, 3.2, 0, Math.PI * 2); c.fill();
        }
        c.restore();
      }
      this.items = this.items.filter(p => p.age < p.life);
      if (this.items.length) this.raf = requestAnimationFrame(time => this.draw(time));
      else c.clearRect(0, 0, this.width, this.height);
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = TeaEffects;
  else root.TeaEffects = TeaEffects;
})(typeof window !== 'undefined' ? window : globalThis);
