// Tests for the old woman, a monster who casts spells on you.
// Each turn she can see you, she rolls 1-20:
//   1-2  - sends you all the way back to the start of floor 1 (a brand-new floor 1)
//   3-4   - heals you completely
//   5-6   - confuses you: your next 3 moves go in random directions
//   7-8   - makes you forget your map of this floor
//   9-10  - summons 2 rats or bats next to her
//   11-20 - no spell; she acts like any other monster
// Run from the repo root with:  node --test tests/

const test = require('node:test');
const assert = require('node:assert/strict');
const { startGame, withRandom } = require('./helpers');

// A game on a simple test floor 3: one big open room with a wall all around.
// The floor's start (the center of rooms[0]) is (5, 5). The player stands at
// (9, 5) and the old woman at (9, 8), awake and able to see the player.
function arena() {
  const game = startGame();
  game.peek(`
    depth = 3;
    stats.deepest = 3;
    map = [];
    for (let y = 0; y < MAP_H; y++) {
      map.push([]);
      for (let x = 0; x < MAP_W; x++) {
        const edge = x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1;
        map[y].push(edge ? WALL : FLOOR);
      }
    }
    rooms = [{ x: 2, y: 2, w: 7, h: 7 }];
    stairs = null;
    items = [];
    explored = map.map(row => row.map(() => false));
    player.x = 9;
    player.y = 5;
    monsters = [];
  `);
  addMonster(game, 'old woman', 9, 8, true);
  game.peek('computeFOV()');
  return game;
}

function addMonster(game, name, x, y, awake) {
  game.peek(`
    const t = MONSTER_TYPES[${JSON.stringify(name)}];
    monsters.push({ name: ${JSON.stringify(name)}, x: ${x}, y: ${y}, hp: t.hp, atk: t.atk,
                    def: t.def, ch: t.ch, color: t.color, awake: ${awake} });
  `);
}

const playerSpot = game => game.peek('[player.x, player.y]');
const oldWoman = game => game.peek('monsters.find(m => m.name === "old woman")');

test('the old woman is a monster drawn with sprite 15', () => {
  const game = startGame();
  const t = game.peek('MONSTER_TYPES["old woman"]');
  assert.ok(t, 'MONSTER_TYPES needs an "old woman" entry');
  assert.equal(t.sprite, 15);

  // She has to actually show up somewhere in the dungeon.
  const floors = game.peek('Array.from({ length: MAX_DEPTH }, (_, i) => i + 1)');
  assert.ok(floors.some(d => t.weight(d) > 0), 'her weight is 0 on every floor');
});

test('a roll of 1 or 2 out of 20 sends you all the way back to floor 1', () => {
  for (const roll of [0, 0.099]) {        // Math.random() below 0.1 = 1 or 2 on a d20
    const game = arena();
    withRandom(roll, () => game.press(' '));   // wait a turn so she gets to act

    assert.equal(game.peek('depth'), 1, `roll ${roll} should send you to floor 1`);
    assert.deepEqual(playerSpot(game), game.peek('(c => [c.x, c.y])(roomCenter(rooms[0]))'),
      'you should be at the start of the floor');
    assert.match(game.peek('messages.map(m => m.text).join(" ")'), /old woman/i);
  }
});

test('floor 1 is a fresh floor, and you keep your pack and stats', () => {
  const game = arena();
  game.peek('player.hp = 17; player.maxHp = 40; player.atk = 8; inventory = ["scroll"]');
  withRandom(0, () => game.press(' '));

  assert.equal(game.peek('monsters.some(m => m.name === "old woman")'), false);
  assert.equal(game.peek('visible[player.y][player.x]'), true, 'you see from your new spot');
  assert.deepEqual(game.peek('[player.hp, player.maxHp, player.atk]'), [17, 40, 8]);
  assert.deepEqual(game.peek('inventory'), ['scroll']);
});

test('monsters from the old floor stop acting once you are gone', () => {
  const game = arena();
  // With every dice roll at 0, the new floor 1 always starts at (3, 3). An awake
  // orc next to that spot on the *old* floor must not get to hit you there.
  addMonster(game, 'orc', 3, 4, true);
  const hp = game.peek('player.hp');
  withRandom(0, () => game.press(' '));

  assert.deepEqual(playerSpot(game), [3, 3]);
  assert.equal(game.peek('player.hp'), hp);
});

test('a roll of 3 or 4 out of 20 heals you completely', () => {
  for (const roll of [0.1, 0.199]) {
    const game = arena();
    game.peek('player.hp = 5');
    withRandom(roll, () => game.press(' '));

    assert.equal(game.peek('player.hp'), game.peek('player.maxHp'), `roll ${roll} should heal`);
    assert.deepEqual(playerSpot(game), [9, 5], 'healing should not move you');
  }
});

test('any other roll: no spell, she just walks toward you', () => {
  for (const roll of [0.5, 0.999]) {
    const game = arena();
    game.peek('player.hp = 5');
    withRandom(roll, () => game.press(' '));

    assert.equal(game.peek('player.hp'), 5, `roll ${roll} should not heal`);
    assert.deepEqual(playerSpot(game), [9, 5], `roll ${roll} should not move you`);
    assert.deepEqual([oldWoman(game).x, oldWoman(game).y], [9, 7], 'she should step closer');
  }
});

// ----- Confuse -----

test('a roll of 5 or 6 out of 20 confuses you for 3 moves', () => {
  for (const roll of [0.2, 0.299]) {
    const game = arena();
    withRandom(roll, () => game.press(' '));

    assert.equal(game.peek('player.confused'), 3, `roll ${roll} should confuse you`);
    assert.deepEqual(playerSpot(game), [9, 5]);
    assert.match(game.peek('messages.map(m => m.text).join(" ")'), /confused|dizzy/i);
  }
});

test('while confused, you move in a random direction instead of the one you pressed', () => {
  const game = arena();
  game.peek('monsters = []; player.confused = 3');
  withRandom(0, () => game.press('w'));   // pressed up; a roll of 0 picks "right"

  assert.deepEqual(playerSpot(game), [10, 5]);
  assert.equal(game.peek('player.confused'), 2);
});

test('confusion wears off after 3 moves', () => {
  const game = arena();
  game.peek('monsters = []; player.confused = 3');
  for (let i = 0; i < 3; i++) withRandom(0, () => game.press('w'));
  assert.equal(game.peek('player.confused'), 0);
  assert.deepEqual(playerSpot(game), [12, 5]);

  withRandom(0, () => game.press('w'));   // now up really means up
  assert.deepEqual(playerSpot(game), [12, 4]);
});

test('stumbling into a wall while confused still uses up your turn', () => {
  const game = arena();
  game.peek('monsters = []; player.confused = 3; player.x = MAP_W - 2; computeFOV()');
  const turns = game.peek('stats.turns');
  withRandom(0, () => game.press('a'));   // pressed left; stumbles right, into the wall

  assert.equal(game.peek('player.x'), game.peek('MAP_W - 2'));
  assert.equal(game.peek('stats.turns'), turns + 1);
  assert.equal(game.peek('player.confused'), 2);
});

test('waiting a turn does not use up your confusion', () => {
  const game = arena();
  game.peek('monsters = []; player.confused = 3');
  game.press(' ');
  assert.equal(game.peek('player.confused'), 3);
});

// ----- Forget -----

test('a roll of 7 or 8 out of 20 makes you forget the map of this floor', () => {
  for (const roll of [0.3, 0.399]) {
    const game = arena();
    game.peek('explored = map.map(row => row.map(() => true))');   // pretend you've seen it all
    withRandom(roll, () => game.press(' '));

    // Only what you can see right now is still on your map.
    assert.equal(game.peek('explored.every((row, y) => row.every((e, x) => e === visible[y][x]))'),
      true, `roll ${roll} should wipe your map`);
    assert.match(game.peek('messages.map(m => m.text).join(" ")'), /forget|fades/i);
  }
});

// ----- Summon -----

test('a roll of 9 or 10 out of 20 summons 2 rats or bats next to her', () => {
  for (const roll of [0.4, 0.499]) {
    const game = arena();
    withRandom(roll, () => game.press(' '));

    const helpers = game.peek('monsters.filter(m => m.name !== "old woman")');
    const her = oldWoman(game);
    assert.equal(helpers.length, 2, `roll ${roll} should summon 2`);
    for (const m of helpers) {
      assert.ok(m.name === 'rat' || m.name === 'bat', `summoned a ${m.name}`);
      assert.equal(m.awake, true, 'summoned monsters are already hunting you');
      // Right next to her. (This also shows they didn't get to move on the turn they appeared.)
      assert.equal(Math.abs(m.x - her.x) + Math.abs(m.y - her.y), 1);
      assert.equal(game.peek(`map[${m.y}][${m.x}]`), game.peek('FLOOR'));
    }
    const spots = helpers.map(m => `${m.x},${m.y}`);
    assert.equal(new Set(spots).size, 2, 'two monsters on the same tile');
  }
});

test('summoning fails if there is no room next to her', () => {
  const game = arena();
  // She's at (9, 8). Wall off three sides and put a sleeping slime on the fourth.
  game.peek('map[8][10] = WALL; map[8][8] = WALL; map[9][9] = WALL; computeFOV()');
  addMonster(game, 'slime', 9, 7, false);
  withRandom(0.4, () => game.press(' '));

  assert.equal(game.peek('monsters.length'), 2);
});

// ----- Seeing you -----

test('she can only cast while she can see you', () => {
  const game = arena();
  // A solid wall between her and the player.
  game.peek('for (let x = 1; x < MAP_W - 1; x++) map[7][x] = WALL; computeFOV()');
  game.peek('player.hp = 5');

  withRandom(0, () => game.press(' '));
  assert.deepEqual(playerSpot(game), [9, 5]);
  withRandom(0.1, () => game.press(' '));
  assert.equal(game.peek('player.hp'), 5);
});

test('killing her counts like any other monster', () => {
  const game = arena();
  game.peek('monsters[0].hp = 1; player.y = 7');   // stand right next to her
  withRandom(0.5, () => game.press('s'));                               // attack downward

  assert.equal(game.peek('monsters.length'), 0);
  assert.equal(game.peek('stats.kills["old woman"]'), 1);
});
