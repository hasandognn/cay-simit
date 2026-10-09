const test = require('node:test');
const assert = require('node:assert/strict');
const { Engine, ROWS, COLS } = require('../dist/engine.js');
const Effects = require('../dist/effects.js');
function board() {
  const e = new Engine(0);
  e.board = Array.from({ length: ROWS }, (_, y) => Array.from({ length: COLS }, (_, x) => e.piece((x + y * 2) % 5)));
  return e;
}
test('rocket impacts reach both edges before gravity, including an adjacent two-hit basket', () => {
  for (const x of [0, 3, 6]) {
    const e = board(); e.board[3][x].special = 'row';
    e.board[4][2] = { ...e.piece(5), hp: 2 };
    const event = e.activate({ x, y: 3 }).events.find(e => e.kind === 'clear');
    const timing = Effects.plan(event);
    for (let column = 0; column < COLS; column++) {
      assert.equal(timing.delayAt({ x: column, y: 3 }), timing.launch + Math.abs(column - x) * timing.cellFlight);
    }
    assert.ok(timing.delayAt({ x: 2, y: 4 }) >= timing.delayAt({ x: 2, y: 3 }));
    for (const p of [...event.positions, ...event.cracked]) assert.ok(timing.duration >= timing.delayAt(p) + 290, 'Tile pop must finish before falling');
  }
});
test('bomb, star and chained powers leave enough time for every affected tile', () => {
  for (const special of ['bomb', 'rainbow', 'row']) {
    const e = board(); e.board[3][3].special = special; e.board[3][5].special = 'bomb';
    const events = e.activate({ x: 3, y: 3 }).events.filter(e => e.kind === 'clear');
    for (const event of events) {
      const before = JSON.stringify(event), timing = Effects.plan(event);
      for (const p of [...event.positions, ...event.cracked]) {
        assert.ok(Number.isFinite(timing.delayAt(p)) && timing.delayAt(p) >= 0);
        assert.ok(timing.duration >= timing.delayAt(p) + 290);
      }
      assert.ok(timing.duration <= 1000, 'A single clear should not stall input');
      assert.equal(JSON.stringify(event), before, 'Planning must not modify resolved gameplay');
    }
  }
});
test('rocket booster uses the same flight schedule without spending a move', () => {
  const e = board(), moves = e.moves;
  const event = e.boost('rocket', { x: 3, y: 5 }).events.find(e => e.kind === 'clear');
  const timing = Effects.plan(event);
  assert.equal(timing.powers.length, 1);
  assert.equal(timing.powers[0].special, 'row');
  assert.equal(timing.delayAt({ x: 0, y: 5 }), timing.delayAt({ x: 6, y: 5 }));
  assert.equal(e.moves, moves);
});
