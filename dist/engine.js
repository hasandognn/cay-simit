/* Deterministic, DOM-independent match-3 rules. Browser global + Node test export. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TeaGame = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const COLS = 7, ROWS = 8, TYPES = 5;
  const NAMES = ['Simit', 'Çay', 'Peynir', 'Üzüm', 'Domates', 'Kahvaltı sepeti'];
  const LEVELS = [
    { name: 'İlk dem', place: 'Boğaz kıyısı', moves: 26, targets: { 0: 18, 1: 18, 5: 4 }, baskets: [[2, 3, 1], [4, 3, 1], [1, 6, 1], [5, 6, 1]] },
    { name: 'Sabah bereketi', place: 'Ortaköy', moves: 27, targets: { 1: 22, 2: 20, 5: 5 }, baskets: [[1, 2, 1], [5, 2, 1], [3, 4, 2], [1, 6, 1], [5, 6, 1]] },
    { name: 'Vapur keyfi', place: 'Beşiktaş', moves: 28, targets: { 0: 24, 3: 24, 5: 6 }, baskets: [[1, 2, 1], [5, 2, 1], [2, 4, 2], [4, 4, 2], [1, 6, 1], [5, 6, 1]] },
    { name: 'Bir çay daha', place: 'Üsküdar', moves: 28, targets: { 1: 28, 4: 26, 5: 6 }, baskets: [[1, 2, 2], [5, 2, 2], [2, 4, 2], [4, 4, 2], [1, 6, 2], [5, 6, 2]] },
    { name: 'Sofra şenliği', place: 'Kuzguncuk', moves: 30, targets: { 0: 30, 2: 28, 5: 7 }, baskets: [[1, 1, 2], [5, 1, 2], [2, 3, 2], [4, 3, 2], [1, 5, 2], [5, 5, 2], [3, 6, 2]] },
  ];
  const clone = value => JSON.parse(JSON.stringify(value));
  const key = (x, y) => y * COLS + x;
  const xy = k => ({ x: k % COLS, y: Math.floor(k / COLS) });
  class Engine {
    constructor(level = 0, random = Math.random) {
      this.random = random;
      this.level = Math.max(0, Math.min(LEVELS.length - 1, level));
      this.config = clone(LEVELS[this.level]);
      this.serial = 0;
      this.moves = this.config.moves;
      this.score = 0;
      this.collected = {};
      this.boosters = { hammer: 3, rocket: 2, shuffle: 2 };
      this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
      this.status = 'playing';
      this.config.baskets.forEach(([x, y, hp]) => { this.board[y][x] = { id: ++this.serial, type: 5, hp }; });
      this.fillFresh();
    }
    piece(type = Math.floor(this.random() * TYPES)) { return { id: ++this.serial, type }; }
    get(x, y) { return x >= 0 && x < COLS && y >= 0 && y < ROWS ? this.board[y][x] : null; }
    movable(p) { return p && p.type < TYPES; }
    snapshot() {
      return clone({ level: this.level, serial: this.serial, board: this.board, moves: this.moves, score: this.score, collected: this.collected, boosters: this.boosters, status: this.status });
    }
    static restore(data, random = Math.random) {
      if (!data || !Number.isInteger(data.level) || !LEVELS[data.level] || !Array.isArray(data.board) || data.board.length !== ROWS) return null;
      if (!Number.isInteger(data.moves) || data.moves < 0 || data.moves > LEVELS[data.level].moves || !Number.isFinite(data.score) || data.score < 0 || !Number.isInteger(data.serial)) return null;
      if (!['playing', 'won', 'lost'].includes(data.status) || !data.collected || !data.boosters) return null;
      if (['hammer', 'rocket', 'shuffle'].some(k => !Number.isInteger(data.boosters[k]) || data.boosters[k] < 0 || data.boosters[k] > (k === 'hammer' ? 3 : 2))) return null;
      if (Object.values(data.collected).some(n => !Number.isInteger(n) || n < 0)) return null;
      const ids = new Set();
      for (const row of data.board) {
        if (!Array.isArray(row) || row.length !== COLS) return null;
        for (const p of row) {
          if (!p || !Number.isInteger(p.id) || p.id < 1 || p.id > data.serial || ids.has(p.id) || !Number.isInteger(p.type) || p.type < 0 || p.type > 5) return null;
          if (p.type === 5 && ![1, 2].includes(p.hp)) return null;
          if (p.special && !['row', 'bomb', 'rainbow'].includes(p.special)) return null;
          ids.add(p.id);
        }
      }
      const game = new Engine(data.level, random);
      for (const field of ['serial', 'board', 'moves', 'score', 'collected', 'boosters', 'status']) game[field] = clone(data[field]);
      if (game.matches().length) return null;
      if (game.status === 'playing' && (game.moves === 0 || game.complete())) return null;
      return game;
    }
    fillFresh() {
      // Choose from candidates rather than retrying the RNG indefinitely.
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        if (this.get(x, y)?.type === 5) continue;
        const allowed = Array.from({ length: TYPES }, (_, i) => i).filter(t =>
          !(x > 1 && this.get(x - 1, y)?.type === t && this.get(x - 2, y)?.type === t) &&
          !(y > 1 && this.get(x, y - 1)?.type === t && this.get(x, y - 2)?.type === t));
        this.board[y][x] = this.piece(allowed[Math.floor(this.random() * allowed.length)]);
      }
      if (!this.legalMoves().length) this.guaranteeMove();
    }
    guaranteeMove() {
      // Top row is free in every level. This local pattern always admits a swap.
      this.board[0][0] = this.piece(0); this.board[0][1] = this.piece(1);
      this.board[0][2] = this.piece(0); this.board[1][1] = this.piece(0);
      if (this.matches().length) {
        this.board[0][3] = this.piece(2); this.board[1][0] = this.piece(3);
        this.board[1][2] = this.piece(4); this.board[2][1] = this.piece(2);
      }
    }
    matches() {
      const groups = [];
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS;) {
        const start = x, t = this.get(x, y)?.type;
        while (x < COLS && this.get(x, y)?.type === t) x++;
        if (t != null && t < TYPES && x - start >= 3) groups.push(Array.from({ length: x - start }, (_, i) => key(start + i, y)));
      }
      for (let x = 0; x < COLS; x++) for (let y = 0; y < ROWS;) {
        const start = y, t = this.get(x, y)?.type;
        while (y < ROWS && this.get(x, y)?.type === t) y++;
        if (t != null && t < TYPES && y - start >= 3) groups.push(Array.from({ length: y - start }, (_, i) => key(x, start + i)));
      }
      return groups;
    }
    exchange(a, b) { [this.board[a.y][a.x], this.board[b.y][b.x]] = [this.board[b.y][b.x], this.board[a.y][a.x]]; }
    legalMoves() {
      const moves = [];
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const a = { x, y }, p = this.get(x, y);
        if (!this.movable(p)) continue;
        if (p.special) { moves.push({ a, b: a, special: true }); continue; }
        for (const b of [{ x: x + 1, y }, { x, y: y + 1 }]) {
          const q = this.get(b.x, b.y);
          if (!this.movable(q)) continue;
          this.exchange(a, b);
          const matched = this.matches().length > 0;
          this.exchange(a, b);
          if (matched || q.special) moves.push({ a, b });
        }
      }
      return moves;
    }
    complete() { return Object.entries(this.config.targets).every(([t, n]) => (this.collected[t] || 0) >= n); }
    event(kind, extra = {}) { return { kind, state: this.snapshot(), ...extra }; }
    swap(a, b) {
      if (this.status !== 'playing' || this.moves <= 0 || Math.abs(a.x - b.x) + Math.abs(a.y - b.y) !== 1 || !this.movable(this.get(a.x, a.y)) || !this.movable(this.get(b.x, b.y))) return { valid: false, events: [] };
      this.exchange(a, b);
      const p = this.get(a.x, a.y), q = this.get(b.x, b.y);
      const events = [this.event('swap')];
      const groups = this.matches();
      if (!groups.length && !p.special && !q.special) {
        this.exchange(a, b);
        events.push(this.event('invalid', { positions: [a, b] }));
        return { valid: false, events };
      }
      this.moves--;
      if (p.special || q.special) {
        const seeds = new Set([key(a.x, a.y), key(b.x, b.y)]);
        this.clear(seeds, new Map(), events, 1, p.special === 'rainbow' ? q.type : p.type, p.special === 'rainbow' && q.special === 'rainbow');
        this.fall(); events.push(this.event('fall'));
      }
      this.resolve(events, [key(b.x, b.y), key(a.x, a.y)]);
      return { valid: true, events };
    }
    activate(pos) {
      if (this.status !== 'playing' || this.moves <= 0 || !this.get(pos.x, pos.y)?.special) return { valid: false, events: [] };
      this.moves--;
      const events = [];
      this.clear(new Set([key(pos.x, pos.y)]), new Map(), events, 1);
      this.fall(); events.push(this.event('fall')); this.resolve(events);
      return { valid: true, events };
    }
    boost(kind, pos) {
      if (this.status !== 'playing' || !this.boosters[kind] || (kind !== 'shuffle' && !this.get(pos?.x, pos?.y))) return { valid: false, events: [] };
      this.boosters[kind]--;
      const events = [];
      if (kind === 'shuffle') { this.shuffle(); events.push(this.event('shuffle')); }
      else {
        const seeds = kind === 'rocket' ? new Set(Array.from({ length: COLS }, (_, x) => key(x, pos.y))) : new Set([key(pos.x, pos.y)]);
        this.clear(seeds, new Map(), events, 1);
        this.fall(); events.push(this.event('fall'));
      }
      this.resolve(events);
      return { valid: true, events };
    }
    resolve(events, preferred = []) {
      let groups, chain = 0;
      while ((groups = this.matches()).length && chain < 30) {
        chain++;
        const seeds = new Set(groups.flat()), created = new Map();
        const intersections = [...seeds].filter(k => groups.filter(g => g.includes(k)).length > 1);
        for (const k of intersections) if (!this.get(xy(k).x, xy(k).y).special) created.set(k, 'bomb');
        for (const group of groups.filter(g => g.length >= 4)) {
          if (group.some(k => created.has(k))) continue;
          const candidates = group.filter(k => !this.get(xy(k).x, xy(k).y).special);
          const at = preferred.find(k => candidates.includes(k)) ?? candidates[Math.floor(candidates.length / 2)];
          if (at != null) created.set(at, group.length >= 5 ? 'rainbow' : 'row');
        }
        this.clear(seeds, created, events, chain);
        this.fall(); events.push(this.event('fall'));
        preferred = [];
      }
      if (chain >= 30 || !this.legalMoves().length) { this.shuffle(); events.push(this.event('shuffle', { automatic: true })); }
      this.status = this.complete() ? 'won' : this.moves <= 0 ? 'lost' : 'playing';
      events.push(this.event('settled'));
    }
    clear(seeds, created, events, chain, rainbowType, allColors = false) {
      const before = this.snapshot(), triggered = new Set(), damaged = new Set(), removed = [];
      const add = (x, y) => { if (this.get(x, y)) seeds.add(key(x, y)); };
      if (allColors) for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) add(x, y);
      // Set iterators include newly added entries, so powers chain without duplicates.
      for (const k of seeds) {
        const { x, y } = xy(k), p = this.get(x, y);
        if (!p || !p.special || triggered.has(k)) continue;
        triggered.add(k); created.delete(k);
        if (p.special === 'row') for (let xx = 0; xx < COLS; xx++) add(xx, y);
        if (p.special === 'bomb') for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) add(x + dx, y + dy);
        if (p.special === 'rainbow') {
          const counts = Array(TYPES).fill(0);
          this.board.flat().forEach(q => { if (q && q.type < TYPES) counts[q.type]++; });
          const type = rainbowType ?? counts.indexOf(Math.max(...counts));
          for (let yy = 0; yy < ROWS; yy++) for (let xx = 0; xx < COLS; xx++) if (this.get(xx, yy)?.type === type) add(xx, yy);
        }
      }
      for (const k of seeds) {
        const { x, y } = xy(k), p = this.get(x, y);
        if (!p) continue;
        if (p.type === 5) { damaged.add(k); continue; }
        if (created.has(k)) continue;
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) if (this.get(x + dx, y + dy)?.type === 5) damaged.add(key(x + dx, y + dy));
        this.collected[p.type] = (this.collected[p.type] || 0) + 1;
        this.board[y][x] = null; removed.push({ x, y });
      }
      const cracked = [];
      for (const k of damaged) {
        const { x, y } = xy(k), p = this.get(x, y);
        if (!p || p.type !== 5) continue;
        p.hp--;
        if (p.hp <= 0) { this.board[y][x] = null; this.collected[5] = (this.collected[5] || 0) + 1; removed.push({ x, y }); }
        else cracked.push({ x, y });
      }
      for (const [k, special] of created) { const { x, y } = xy(k); if (this.get(x, y)) this.board[y][x].special = special; }
      this.score += removed.length * 50 * Math.min(chain, 4) + triggered.size * 100;
      events.push({ kind: 'clear', state: before, positions: removed, cracked, chain, power: triggered.size > 0, created: [...created.keys()].map(xy) });
    }
    fall() {
      for (let x = 0; x < COLS; x++) {
        let bottom = ROWS - 1;
        while (bottom >= 0) {
          if (this.get(x, bottom)?.type === 5) { bottom--; continue; }
          let top = bottom;
          while (top >= 0 && this.get(x, top)?.type !== 5) top--;
          const pieces = [];
          for (let y = bottom; y > top; y--) if (this.get(x, y)) pieces.push(this.get(x, y));
          for (let y = bottom, i = 0; y > top; y--, i++) this.board[y][x] = pieces[i] || this.piece();
          bottom = top - 1;
        }
      }
    }
    shuffle() {
      const cells = [], pieces = [];
      this.board.forEach((row, y) => row.forEach((p, x) => { if (this.movable(p)) { cells.push({ x, y }); pieces.push(p); } }));
      for (let attempt = 0; attempt < 150; attempt++) {
        for (let i = pieces.length - 1; i > 0; i--) { const j = Math.floor(this.random() * (i + 1)); [pieces[i], pieces[j]] = [pieces[j], pieces[i]]; }
        cells.forEach(({ x, y }, i) => { this.board[y][x] = pieces[i]; });
        if (!this.matches().length && this.legalMoves().length) return;
      }
      this.fillFresh();
    }
    stars() { return this.status === 'won' ? this.score >= 6000 ? 3 : this.score >= 3700 ? 2 : 1 : 0; }
  }
  return { Engine, LEVELS, NAMES, COLS, ROWS };
});
