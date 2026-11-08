// Tests for throwing potions: press T, then a pack number (1-9), then a direction.
// The potion flies up to THROW_RANGE tiles and smashes on the first monster in
// its way: poison hurts it, healing heals it, strength makes it stronger.
// Run from the repo root with:  node --test tests/

const test = require('node:test');
const assert = require('node:assert/strict');
const { startGame, openFloor, withRandom } = require('./helpers');

// A game on a simple open floor (a wall all around), with the player at (10, 10),
// no monsters, and a pack of [poison, scroll, healing, strength].
function field() {
  const game = startGame();
  openFloor(game);
  game.peek("inventory = ['poison', 'scroll', 'healing', 'strength']; identified = []");
  return game;
}

// Adds a monster and returns a function that reads it back later. (It's found by
// its place in the monster list, since it may have walked somewhere else by then.)
function addMonster(game, name, x, y) {
  const index = game.peek(`monsters.push(makeMonster(${JSON.stringify(name)}, ${x}, ${y})) - 1`);
  return () => game.peek(`monsters[${index}]`);
}

// Throws the potion in pack slot `slot` (1-9) in direction `dir` ('w', 'a', 's' or 'd').
// Dice rolls are fixed at `roll` so damage is predictable.
function throwIt(game, slot, dir, roll = 0) {
  withRandom(roll, () => {
    game.press('t');
    game.press(String(slot));
    game.press(dir);
  });
}

const lastMessages = (game, n = 6) => game.peek(`messages.slice(-${n}).map(m => m.text).join(' | ')`);

// ----- Poison -----

test('thrown poison hurts the monster it hits, 6 to 10 damage', () => {
  for (const [roll, damage] of [[0, 6], [0.999, 10]]) {
    const game = field();
    // A troll: 24 HP, so it survives either way, and 2 defense, which poison ignores.
    const troll = addMonster(game, 'troll', 13, 10);
    throwIt(game, 1, 'd', roll);

    assert.equal(troll().hp, 24 - damage, `roll ${roll}`);
    assert.equal(troll().awake, true, 'getting hit wakes it up');
  }
});

test('thrown poison can kill, and the kill counts', () => {
  const game = field();
  addMonster(game, 'goblin', 13, 10);
  game.peek('monsters[0].hp = 3');
  throwIt(game, 1, 'd');

  assert.equal(game.peek('monsters.length'), 0);
  assert.equal(game.peek('stats.kills.goblin'), 1);
});

test('killing the boss with a throw wins the game', () => {
  const game = field();
  game.peek('depth = MAX_DEPTH');
  addMonster(game, 'dark wizard', 13, 10);
  game.peek('monsters[0].hp = 3');
  throwIt(game, 1, 'd');

  assert.equal(game.peek('gameOver'), true);
  assert.equal(game.peek('won'), true);
});

test('the potion is used up and the throw takes one turn', () => {
  const game = field();
  addMonster(game, 'troll', 13, 10);
  const turns = game.peek('stats.turns');

  withRandom(0, () => game.press('t'));
  withRandom(0, () => game.press('1'));
  assert.equal(game.peek('stats.turns'), turns, 'choosing what to throw is free');

  withRandom(0, () => game.press('d'));
  assert.equal(game.peek('stats.turns'), turns + 1);
  assert.deepEqual(game.peek('inventory'), ['scroll', 'healing', 'strength']);
});

// ----- Where it lands -----

test('it hits the first monster in line, not the one behind it', () => {
  const game = field();
  const front = addMonster(game, 'troll', 12, 10);
  const back = addMonster(game, 'troll', 14, 10);
  throwIt(game, 1, 'd');

  assert.equal(front().hp, 24 - 6);
  assert.equal(back().hp, 24);
});

test('it flies up to 6 tiles, and no farther', () => {
  const game = field();
  const near = addMonster(game, 'troll', 10, 16);    // 6 tiles down
  throwIt(game, 1, 's');
  assert.equal(near().hp, 24 - 6);

  const game2 = field();
  const far = addMonster(game2, 'troll', 10, 17);    // 7 tiles down
  throwIt(game2, 1, 's');
  assert.equal(far().hp, 24);
  assert.deepEqual(game2.peek('inventory'), ['scroll', 'healing', 'strength'], 'a miss still loses the potion');
});

test('walls stop it', () => {
  const game = field();
  game.peek('map[10][12] = WALL');
  const troll = addMonster(game, 'troll', 13, 10);
  throwIt(game, 1, 'd');
  assert.equal(troll().hp, 24);
});

test('you can throw in all four directions', () => {
  for (const [dir, x, y] of [['w', 10, 7], ['a', 7, 10], ['s', 10, 13], ['d', 13, 10]]) {
    const game = field();
    const troll = addMonster(game, 'troll', x, y);
    throwIt(game, 1, dir);
    assert.equal(troll().hp, 24 - 6, `throwing ${dir}`);
  }
});

// ----- Other potions, and learning what they are -----

test('a potion that hits a monster is identified; one that misses is not', () => {
  const game = field();
  addMonster(game, 'troll', 13, 10);
  throwIt(game, 1, 'd');
  assert.deepEqual(game.peek('identified'), ['poison']);

  const game2 = field();
  throwIt(game2, 1, 'd');   // nobody there
  assert.deepEqual(game2.peek('identified'), []);
  // The message uses the potion's look, since you still don't know what it was.
  assert.match(lastMessages(game2), new RegExp(game2.peek('potionLooks.poison.adj')));
  assert.doesNotMatch(lastMessages(game2), /poison/);
});

test('a thrown healing potion heals the monster to full', () => {
  const game = field();
  const troll = addMonster(game, 'troll', 13, 10);
  game.peek('monsters[0].hp = 5');
  throwIt(game, 3, 'd');

  assert.equal(troll().hp, 24);
  assert.ok(game.peek('identified').includes('healing'));
});

test('a thrown strength potion makes the monster stronger', () => {
  const game = field();
  const troll = addMonster(game, 'troll', 13, 10);
  throwIt(game, 4, 'd');

  assert.equal(troll().atk, 7 + 1);
  assert.ok(game.peek('identified').includes('strength'));
});

// ----- Choosing what to throw -----

test('only potions can be thrown', () => {
  const game = field();
  game.press('t');
  game.press('2');   // the scroll

  assert.match(lastMessages(game, 1), /only throw potions/i);
  assert.deepEqual(game.peek('inventory'), ['poison', 'scroll', 'healing', 'strength']);
  game.press('1');   // you can still pick a potion instead
  assert.match(lastMessages(game, 1), /which way/i);
});

test('with no potions, T just tells you so', () => {
  const game = field();
  game.peek('inventory = ["scroll"]');
  game.press('t');

  assert.match(lastMessages(game, 1), /no potions/i);
  assert.equal(game.peek('throwing'), null);
});

test('Esc cancels a throw at either step, and costs nothing', () => {
  for (const steps of [['t', 'Escape'], ['t', '1', 'Escape']]) {
    const game = field();
    const turns = game.peek('stats.turns');
    for (const key of steps) game.press(key);

    assert.equal(game.peek('throwing'), null);
    assert.equal(game.peek('stats.turns'), turns);
    assert.deepEqual(game.peek('inventory'), ['poison', 'scroll', 'healing', 'strength']);
  }
});

test('while choosing, other keys do nothing', () => {
  const game = field();
  game.press('t');
  game.press('w');   // not a pack number: you don't walk
  game.press('m');   // and the map doesn't open
  assert.deepEqual(game.peek('[player.x, player.y]'), [10, 10]);
  assert.equal(game.peek('showMap'), false);

  game.press('1');
  game.press(' ');   // "wait" isn't a direction
  game.press('5');   // and neither is a number
  assert.equal(game.peek('stats.turns'), 0);
  assert.notEqual(game.peek('throwing'), null, 'still waiting for a direction');
});

test('the throw prompt is not saved: a reloaded game is not mid-throw', () => {
  const game = field();
  game.press('t');
  const reloaded = startGame({ 'dungeon-crawler-save': game.storage.get('dungeon-crawler-save') });
  assert.equal(reloaded.peek('throwing'), null);
});
