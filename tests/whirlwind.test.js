// Tests for the potion of whirlwind, which blows monsters back 3 spaces.
//   Thrown: the monster it hits flies 3 more tiles the way the potion was going.
//   Drunk:  every monster next to you is blown 3 tiles away from you.
// Either way it stops early at a wall or another monster, and does no damage.
// Run from the repo root with:  node --test tests/
//
// These tests use slimes: they're slow, so they rest on the turn after they
// wake up and stay where the wind left them.

const test = require('node:test');
const assert = require('node:assert/strict');
const { startGame, openFloor, withRandom } = require('./helpers');

// The open test floor (player at (10, 10)) with a whirlwind potion in slot 1.
function field() {
  const game = startGame();
  openFloor(game);
  game.peek("inventory = ['whirlwind']; identified = []");
  return game;
}

function addMonster(game, name, x, y) {
  const index = game.peek(`monsters.push(makeMonster(${JSON.stringify(name)}, ${x}, ${y})) - 1`);
  return () => game.peek(`monsters[${index}]`);
}

const spot = m => [m.x, m.y];
const throwRight = game => withRandom(0.5, () => { game.press('t'); game.press('1'); game.press('d'); });

// ----- Thrown -----

test('a thrown whirlwind blows the monster 3 tiles farther away', () => {
  const game = field();
  const slime = addMonster(game, 'slime', 13, 10);
  throwRight(game);
  assert.deepEqual(spot(slime()), [16, 10]);
});

test('it does no damage', () => {
  const game = field();
  const slime = addMonster(game, 'slime', 13, 10);
  throwRight(game);
  assert.equal(slime().hp, 10);
});

test('a wall stops the monster early', () => {
  const game = field();
  game.peek('map[10][15] = WALL');
  const slime = addMonster(game, 'slime', 13, 10);
  throwRight(game);
  assert.deepEqual(spot(slime()), [14, 10]);
});

test('another monster stops it early, and is not moved', () => {
  const game = field();
  const front = addMonster(game, 'slime', 13, 10);
  const back = addMonster(game, 'slime', 15, 10);
  throwRight(game);
  assert.deepEqual(spot(front()), [14, 10]);
  assert.deepEqual(spot(back()), [15, 10]);
});

test('a thrown whirlwind that hits is identified and used up', () => {
  const game = field();
  addMonster(game, 'slime', 13, 10);
  throwRight(game);
  assert.ok(game.peek('identified').includes('whirlwind'));
  assert.deepEqual(game.peek('inventory'), []);
});

// ----- Drunk -----

test('drinking it blows every monster next to you 3 tiles away', () => {
  const game = field();
  const right = addMonster(game, 'slime', 11, 10);
  const up = addMonster(game, 'slime', 10, 9);
  const far = addMonster(game, 'slime', 13, 13);   // not next to you
  withRandom(0.5, () => game.press('1'));

  assert.deepEqual(spot(right()), [14, 10]);
  assert.deepEqual(spot(up()), [10, 6]);
  assert.deepEqual(spot(far()), [13, 13]);
});

test('drinking it with nobody next to you still uses it up and tells you what it was', () => {
  const game = field();
  const turns = game.peek('stats.turns');
  withRandom(0.5, () => game.press('1'));

  assert.deepEqual(game.peek('inventory'), []);
  assert.equal(game.peek('stats.turns'), turns + 1);
  assert.ok(game.peek('identified').includes('whirlwind'));
});

// ----- Finding it -----

test('whirlwind potions turn up in the dungeon, with a look of their own', () => {
  const game = startGame();
  assert.equal(withRandom(0.55, () => game.peek('randomPotion()')), 'whirlwind');
  const adj = game.peek('potionLooks.whirlwind.adj');
  assert.equal(game.peek('itemName("whirlwind")'), `${adj} potion`);
});
