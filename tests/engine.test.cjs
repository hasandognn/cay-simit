const test = require('node:test');
const assert = require('node:assert/strict');
const { Engine, COLS, ROWS } = require('../dist/engine.js');
const seeded = seed => () => {
  seed |= 0; seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
function invariant(e) {
  assert.equal(e.matches().length, 0, 'Settled board has no unprocessed matches');
  assert.equal(e.board.flat().length, COLS * ROWS);
  assert.ok(e.board.flat().every(p => p && p.type >= 0 && p.type <= 5));
  assert.equal(new Set(e.board.flat().map(p => p.id)).size, COLS * ROWS);
  if (e.status === 'playing') assert.ok(e.legalMoves().length > 0);
}
test('150 complete seeded rounds settle, preserve IDs, and restore correctly', () => {
  for (let level = 0; level < 5; level++) for (let seed = 1; seed <= 30; seed++) {
    const random = seeded(seed), game = new Engine(level, random);
    invariant(game);
    while (game.status === 'playing') {
      const moves = game.legalMoves(), move = moves[Math.floor(random() * moves.length)], before = game.moves;
      const result = move.special ? game.activate(move.a) : game.swap(move.a, move.b);
      assert.ok(result.valid); assert.equal(game.moves, before - 1);
      invariant(game);
      assert.deepEqual(Engine.restore(game.snapshot()).snapshot(), game.snapshot());
    }
    assert.equal(game.status, game.complete() ? 'won' : 'lost');
    assert.equal(game.swap({ x: 0, y: 0 }, { x: 1, y: 0 }).valid, false);
  }
});
test('invalid swaps roll back without consuming a move', () => {
  const e = new Engine(0, seeded(32)), before = e.snapshot();
  let tried = false;
  for (let y = 0; y < ROWS && !tried; y++) for (let x = 0; x < COLS - 1 && !tried; x++) {
    const a = { x, y }, b = { x: x + 1, y };
    if (!e.movable(e.get(a.x, a.y)) || !e.movable(e.get(b.x, b.y))) continue;
    e.exchange(a, b); const legal = e.matches().length; e.exchange(a, b);
    if (!legal) { assert.equal(e.swap(a, b).valid, false); tried = true; }
  }
  assert.ok(tried); assert.deepEqual(e.snapshot(), before);
});
test('baskets cannot swap, and two-hit baskets remain fixed under gravity', () => {
  const e = new Engine(1, seeded(19));
  const id = e.get(3, 4).id, moves = e.moves;
  assert.equal(e.swap({ x: 3, y: 4 }, { x: 4, y: 4 }).valid, false);
  const events = [];
  e.clear(new Set([4 * COLS + 3]), new Map(), events, 1);
  assert.equal(e.get(3, 4).hp, 1); e.fall();
  assert.equal(e.get(3, 4).id, id); assert.equal(e.moves, moves);
});
test('boosters consume stock, not moves; depleted boosters cannot be used', () => {
  const e = new Engine(0, seeded(12)), moves = e.moves;
  for (let i = 0; i < 3; i++) assert.ok(e.boost('hammer', { x: 0, y: 0 }).valid);
  assert.equal(e.boosters.hammer, 0); assert.equal(e.boost('hammer', { x: 0, y: 0 }).valid, false);
  assert.ok(e.boost('shuffle').valid); assert.equal(e.boosters.shuffle, 1);
  assert.equal(e.moves, moves); invariant(e);
});
test('a four-match clears all four foods and visibly creates a distinct rocket', () => {
  const e = new Engine(0, seeded(8));
  e.board = Array.from({ length: ROWS }, (_, y) => Array.from({ length: COLS }, (_, x) => e.piece((x + y * 2) % 5)));
  [0, 0, 1, 0, 2, 3, 4].forEach((t, x) => { e.board[0][x].type = t; });
  e.board[1][2].type = 0;
  const foodIds = [e.get(0, 0).id, e.get(1, 0).id, e.get(2, 1).id, e.get(3, 0).id];
  const result = e.swap({ x: 2, y: 0 }, { x: 2, y: 1 });
  assert.ok(result.valid);
  const creation = result.events.find(event => event.kind === 'create');
  const clearing = result.events[result.events.indexOf(creation) - 1];
  assert.equal(clearing.kind, 'clear');
  for (let x = 0; x < 4; x++) assert.ok(clearing.positions.some(p => p.x === x && p.y === 0));
  assert.equal(creation.state.collected[0], 4);
  assert.ok(foodIds.every(id => !creation.state.board.flat().some(p => p?.id === id)));
  assert.ok(creation.pieces.some(p => p.special === 'row'));
  assert.ok(creation.state.board.flat().some(p => p?.special === 'row' && !foodIds.includes(p.id)));
});
test('a rocket clears its row without counting its original food twice', () => {
  const e = new Engine(0, seeded(13));
  e.board = Array.from({ length: ROWS }, (_, y) => Array.from({ length: COLS }, (_, x) => e.piece((x + y * 2) % 5)));
  e.board[0].forEach(p => { p.type = 2; });
  e.board[0][0] = { ...e.piece(0), special: 'row' };
  e.collected[0] = 4;
  const moves = e.moves, activated = e.activate({ x: 0, y: 0 });
  assert.ok(activated.valid); assert.equal(e.moves, moves - 1);
  assert.ok(activated.events.some(event => event.kind === 'clear' && event.positions.length >= 7));
  const firstFall = activated.events.find(event => event.kind === 'fall');
  assert.equal(firstFall.state.collected[0], 4);
  assert.equal(firstFall.state.collected[2], 6);
});
test('a basket next to the transformation cell receives the match hit', () => {
  const e = new Engine(0, seeded(18)), events = [];
  e.board = Array.from({ length: ROWS }, (_, y) => Array.from({ length: COLS }, (_, x) => e.piece((x + y * 2) % 5)));
  e.board[1][2] = { ...e.piece(5), hp: 1 };
  e.clear(new Set([0, 1, 2, 3]), new Map([[2, 'row']]), events, 1);
  assert.equal(e.get(2, 1), null);
  assert.equal(e.collected[5], 1);
  assert.equal(e.get(2, 0).special, 'row');
});
test('shuffle preserves every basket, settles, and provides a legal move', () => {
  const e = new Engine(4, seeded(44));
  const baskets = () => e.board.flatMap((row, y) => row.flatMap((p, x) => p.type === 5 ? [{ ...p, x, y }] : []));
  const before = baskets(); e.shuffle();
  assert.deepEqual(baskets(), before); invariant(e);
});
test('corrupted or missing saves are rejected', () => {
  assert.equal(Engine.restore(null), null);
  assert.equal(Engine.restore({ board: [] }), null);
  const save = new Engine().snapshot(); save.board[0][0].id = save.board[0][1].id;
  assert.equal(Engine.restore(save), null);
});
test('a power-up cannot invisibly match the food it replaced', () => {
  const e = new Engine(0, seeded(42));
  e.board = Array.from({ length: ROWS }, (_, y) => Array.from({ length: COLS }, (_, x) => e.piece((x + y * 2) % 5)));
  [0, 0, 0, 3, 4, 2, 1].forEach((type, x) => { e.board[0][x].type = type; });
  assert.ok(e.matches().some(group => group.includes(0) && group.includes(2)));
  e.board[0][1].special = 'row';
  assert.ok(!e.matches().some(group => group.includes(0) || group.includes(1) || group.includes(2)));
  assert.ok(e.activate({ x: 1, y: 0 }).valid);
  invariant(e);
});
test('power effects include their origin, type, and actual score gain', () => {
  const e = new Engine(0, seeded(4));
  e.board[0][0].special = 'bomb';
  const result = e.activate({ x: 0, y: 0 });
  const clear = result.events.find(event => event.kind === 'clear');
  assert.deepEqual(clear.activated[0], { x: 0, y: 0, special: 'bomb' });
  assert.ok(clear.points > 0);
  const rocket = new Engine(0, seeded(4)).boost('rocket', { x: 2, y: 4 });
  assert.deepEqual(rocket.events[0].activated, [{ x: 2, y: 4, special: 'row' }]);
});
test('reload at every visual stage restores the already-resolved turn', () => {
  const e = new Engine(0, seeded(17));
  const move = e.legalMoves()[0], result = e.swap(move.a, move.b);
  const committed = e.snapshot();
  for (const _ of result.events) {
    const restored = Engine.restore(committed);
    assert.ok(restored); assert.deepEqual(restored.snapshot(), committed);
  }
});
