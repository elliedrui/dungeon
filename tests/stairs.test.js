// Tests for the stairs boost: +5 max HP, +1 ATK and +1 DEF, but only the first time
// you reach a floor. (The old woman can send you back to floor 1, and walking
// down again shouldn't hand out the same boosts twice.)
// Run from the repo root with:  node --test

const test = require('node:test');
const assert = require('node:assert/strict');
const { startGame } = require('./helpers');

// Puts the player on the stairs of the current floor.
function onStairs(game, depth, deepest) {
  game.peek(`depth = ${depth}; stats.deepest = ${deepest}; startFloor();
             player.x = stairs.x; player.y = stairs.y;`);
}

test('reaching a new floor gives the boost', () => {
  const game = startGame();
  onStairs(game, 2, 2);
  const [maxHp, atk, def] = game.peek('[player.maxHp, player.atk, player.def]');
  game.press('>');

  assert.equal(game.peek('depth'), 3);
  assert.equal(game.peek('stats.deepest'), 3);
  assert.deepEqual(game.peek('[player.maxHp, player.atk, player.def]'), [maxHp + 5, atk + 1, def + 1]);
});

test('going back down to a floor you already reached gives no boost', () => {
  const game = startGame();
  onStairs(game, 1, 4);
  const [maxHp, atk, def] = game.peek('[player.maxHp, player.atk, player.def]');
  game.press('>');

  assert.equal(game.peek('depth'), 2);
  assert.equal(game.peek('stats.deepest'), 4);
  assert.deepEqual(game.peek('[player.maxHp, player.atk, player.def]'), [maxHp, atk, def]);
});

test('a new game starts with floor 1 as the deepest reached', () => {
  const game = startGame();
  assert.equal(game.peek('stats.deepest'), 1);
});

test('a save from before this change still loads, counting the current floor as deepest', () => {
  const old = startGame();
  old.peek('depth = 3; saveGame()');
  const save = JSON.parse(old.storage.get('dungeon-crawler-save'));
  delete save.stats.deepest;

  const game = startGame({ 'dungeon-crawler-save': JSON.stringify(save) });
  assert.equal(game.peek('depth'), 3);
  assert.equal(game.peek('stats.deepest'), 3);
});
