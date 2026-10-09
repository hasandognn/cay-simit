/* One bounded canvas, active only while an effect is visible. No permanent animation loop. */
window.TeaEffects = class TeaEffects {
  constructor(canvas, enabled) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.enabled = enabled;
    this.items = [];
    this.raf = 0;
    this.width = 0;
    this.height = 0;
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
  burst(event) {
    if (!this.enabled() || !this.ctx || document.hidden) return;
    this.resize();
    const cell = this.width / 7, cellH = this.height / 8;
    const palettes = [['#e5a245','#fff0b2'],['#f26b42','#ffd689'],['#fffbea','#f8d982'],['#ac6ee0','#ecc6ff'],['#fb654e','#ffbd75'],['#dca15e','#ffedb1']];
    event.positions.slice(0, 32).forEach(({ x, y }, index) => {
      const px = (x + .5) * cell, py = (y + .5) * cellH;
      const colors = palettes[event.state.board[y][x]?.type || 0];
      const delay = index % 4 * .012;
      this.items.push({ kind: 'ring', x: px, y: py, age: -delay, life: .34, radius: cell * .59, color: colors[1] });
      for (let n = 0; n < 7; n++) {
        const angle = n / 7 * Math.PI * 2 + index * .7;
        const speed = cell * (1.5 + (n % 3) * .45);
        this.items.push({ kind: n % 3 ? 'chip' : 'spark', x: px, y: py, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - cell * .8, radius: 2.2 + n % 3, age: -delay, life: .42 + (n % 3) * .08, color: colors[n % 2], angle });
      }
    });
    for (const power of event.activated || []) {
      const x = (power.x + .5) * cell, y = (power.y + .5) * cellH;
      if (power.special === 'row') this.items.push({ kind: 'beam', x, y, age: 0, life: .48, radius: cell * .38, color: '#ffe6a0' });
      if (power.special === 'bomb') this.items.push({ kind: 'shock', x, y, age: 0, life: .48, radius: cell * 1.9, color: '#d9b1ff' });
      if (power.special === 'rainbow') event.positions.slice(0, 18).forEach(pos => this.items.push({ kind: 'ray', x, y, tx: (pos.x + .5) * cell, ty: (pos.y + .5) * cellH, age: 0, life: .4, color: '#fff6bb' }));
    }
    if (this.items.length > 280) this.items.splice(0, this.items.length - 280);
    this.start();
  }
  celebrate() {
    if (!this.enabled() || !this.ctx) return;
    this.resize();
    const colors = ['#ffd26f', '#f88e65', '#97d7bb', '#c7a0ed'];
    for (let i = 0; i < 75; i++) {
      const angle = -Math.PI * (.12 + Math.random() * .76);
      this.items.push({ kind: 'chip', x: this.width * .5, y: this.height * .65, vx: Math.cos(angle) * (100 + Math.random() * 180), vy: Math.sin(angle) * (180 + Math.random() * 220), radius: 3 + i % 3, age: -i % 5 * .012, life: 1.1 + i % 3 * .2, color: colors[i % colors.length], angle });
    }
    this.start();
  }
  start() {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(now => this.draw(now));
  }
  draw(now) {
    this.raf = 0;
    if (document.hidden || !this.enabled()) { this.clear(); return; }
    const dt = Math.min((now - this.last) / 1000, .04); this.last = now;
    const c = this.ctx;
    c.clearRect(0, 0, this.width, this.height);
    for (const p of this.items) {
      p.age += dt;
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
      } else if (p.kind === 'ring' || p.kind === 'shock') {
        c.lineWidth = (p.kind === 'shock' ? 7 : 3) * fade;
        c.beginPath(); c.arc(p.x, p.y, p.radius * (1 - Math.pow(1 - t, 3)), 0, Math.PI * 2); c.stroke();
        if (t < .25) { c.globalAlpha = (.25 - t) * 2; c.fillStyle = '#fffce6'; c.fill(); }
      } else if (p.kind === 'beam') {
        const reach = this.width * Math.min(1, t * 3), x1 = Math.max(0, p.x - reach), x2 = Math.min(this.width, p.x + reach);
        const glow = c.createLinearGradient(0, p.y - p.radius, 0, p.y + p.radius);
        glow.addColorStop(0, '#ffca5000'); glow.addColorStop(.4, '#ffcf7599'); glow.addColorStop(.5, '#fffbea'); glow.addColorStop(.6, '#ffcf7599'); glow.addColorStop(1, '#ffca5000');
        c.fillStyle = glow; c.fillRect(x1, p.y - p.radius, x2 - x1, p.radius * 2);
        c.fillStyle = '#fffce4';
        for (const x of [x1, x2]) { c.beginPath(); c.arc(x, p.y, 5 * fade, 0, Math.PI * 2); c.fill(); }
      } else if (p.kind === 'ray') {
        c.lineWidth = 2.5 * fade;
        c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + (p.tx - p.x) * Math.min(1, t * 4), p.y + (p.ty - p.y) * Math.min(1, t * 4)); c.stroke();
      }
      c.restore();
    }
    this.items = this.items.filter(p => p.age < p.life);
    if (this.items.length) this.raf = requestAnimationFrame(time => this.draw(time));
    else c.clearRect(0, 0, this.width, this.height);
  }
};
