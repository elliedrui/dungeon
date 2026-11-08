// Tests for the scroll of mapping: reading it reveals the whole floor on the map.
// Run from the repo root with:  node --test tests/

const test = require('node:test');
const assert = require('node:assert/strict');
const { startGame, withRandom } = require('./helpers');

test('reading it marks the whole floor as explored', () => {
  const game = startGame();
  game.peek('inventory = ["mapping"]');
  game.press('1');
  assert.equal(game.peek('explored.every(row => row.every(e => e))'), true);
});

test('it is used up and takes a turn', () => {
  const game = startGame();
  game.peek('inventory = ["mapping"]');
  const turns = game.peek('stats.turns');
  game.press('1');
  assert.deepEqual(game.peek('inventory'), []);
  assert.equal(game.peek('stats.turns'), turns + 1);
});

test('afterwards the map shows the stairs and the items lying around', () => {
  const game = startGame();
  game.peek('inventory = ["mapping"]; items = [{ type: "healing", x: stairs.x, y: stairs.y - 1 }]');
  game.press('1');
  game.calls.length = 0;
  game.press('m');

  const [scale, sx, sy] = game.peek(`[MAP_SCALE,
    Math.floor((canvas.width - MAP_W * MAP_SCALE) / 2) + stairs.x * MAP_SCALE,
    Math.floor((canvas.height - MAP_H * MAP_SCALE) / 2) + stairs.y * MAP_SCALE]`);
  assert.ok(game.calls.some(c => c[0] === 'fillRect' && c[1] === sx && c[2] === sy && c[5] === '#fff'),
    'stairs not on the map');
  assert.ok(game.calls.some(c => c[0] === 'drawImage' && c[6] === sx && c[7] === sy - scale),
    'item not on the map');
});

test('it reads like a scroll, not a mystery potion', () => {
  const game = startGame();
  assert.equal(game.peek('itemName("mapping")'), 'scroll of mapping');
  const look = game.peek('itemLook("mapping")');
  assert.equal(look.ch, '?');
});

test('half the scrolls you find are mapping, half lightning', () => {
  const game = startGame();
  const found = [0, 0.499, 0.5, 0.999].map(roll => withRandom(roll, () => game.peek('randomScroll()')));
  assert.deepEqual(found, ['scroll', 'scroll', 'mapping', 'mapping']);
});

test('you cannot throw it', () => {
  const game = startGame();
  game.peek('inventory = ["mapping", "healing"]');
  game.press('t');
  game.press('1');
  assert.match(game.peek('messages.at(-1).text'), /only throw potions/i);
});
