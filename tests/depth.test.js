// Tests for monsters getting stronger deeper down: +1 attack for each floor
// below floor 1. This keeps up with the +1 DEF the player gets from the stairs.
// Run from the repo root with:  node --test

const test = require('node:test');
const assert = require('node:assert/strict');
const { startGame, openFloor, withRandom } = require('./helpers');

test('on floor 1, monsters have their normal attack', () => {
  const game = startGame();
  game.peek('depth = 1');
  assert.equal(game.peek('makeMonster("orc", 5, 5).atk'), game.peek('MONSTER_TYPES.orc.atk'));
});

test('every floor deeper adds +1 attack', () => {
  const game = startGame();
  for (let depth = 1; depth <= 5; depth++) {
    game.peek(`depth = ${depth}`);
    assert.equal(game.peek('makeMonster("orc", 5, 5).atk'), 5 + (depth - 1), `floor ${depth}`);
  }
});

test('only attack goes up: HP and defense stay the same', () => {
  const game = startGame();
  game.peek('depth = 5');
  const m = game.peek('makeMonster("troll", 5, 5)');
  assert.equal(m.hp, 24);
  assert.equal(m.def, 2);
});

test('the monsters that fill a floor get the bonus', () => {
  const game = startGame();
  game.peek('depth = 4; startFloor()');
  const monsters = game.peek('monsters.map(m => [m.name, m.atk, MONSTER_TYPES[m.name].atk])');
  assert.ok(monsters.length > 0);
  for (const [name, atk, base] of monsters) assert.equal(atk, base + 3, name);
});

test("the old woman's summoned rats and bats get the bonus too", () => {
  const game = startGame();
  openFloor(game);   // so there's always room around her to summon into
  game.peek(`
    depth = 3;
    monsters = [makeMonster('old woman', player.x + 3, player.y)];
    monsters[0].awake = true;
    summon(monsters[0], ['rat', 'bat']);
  `);
  const helpers = game.peek('monsters.slice(1).map(m => [m.atk, MONSTER_TYPES[m.name].atk])');
  assert.ok(helpers.length > 0, 'nothing was summoned');
  for (const [atk, base] of helpers) assert.equal(atk, base + 2);
});

test('on floor 5, an orc still hurts a player with every stairs boost', () => {
  // The player starts with 2 DEF and gets +1 on each of the 4 stairs: 6 DEF.
  // An orc on floor 5 has 5 + 4 = 9 attack, so it hits for 9 +/- 1, minus 6.
  const game = startGame();
  game.peek('depth = 5; player.def = 6; monsters = [makeMonster("orc", 0, 0)]');
  for (const [roll, damage] of [[0, 2], [0.5, 3], [0.999, 4]]) {
    game.peek('player.hp = 100');
    withRandom(roll, () => game.peek('attack(monsters[0], player)'));
    assert.equal(game.peek('player.hp'), 100 - damage, `roll ${roll}`);
  }
});
