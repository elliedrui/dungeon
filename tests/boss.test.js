// Tests for the dark wizard, the boss on the deepest floor. Killing it wins the game.
//   Next to you, it fights like any other monster.
//   Further away, every 3 actions it casts a spell (if it can see you):
//     30% of the time it summons ghosts, otherwise it throws a fire bolt that ignores DEF.
//   Below half health it flies into a rage and acts twice a turn.
// Run from the repo root with:  node --test tests/

const test = require('node:test');
const assert = require('node:assert/strict');
const { startGame, openFloor, withRandom } = require('./helpers');

// A game on the deepest floor, on the open test floor, with the player at (10, 10)
// and an awake dark wizard at (x, y). Nothing else is on the floor.
function bossFight(x = 14, y = 10) {
  const game = startGame();
  openFloor(game);
  game.peek(`
    depth = MAX_DEPTH;
    stats.deepest = MAX_DEPTH;
    monsters = [makeMonster('dark wizard', ${x}, ${y})];
    monsters[0].awake = true;
    computeFOV();
  `);
  return game;
}

const boss = game => game.peek('monsters.find(isBoss)');
const lastMessages = (game, n = 6) => game.peek(`messages.slice(-${n}).map(m => m.text).join(' | ')`);

test('the dark wizard is drawn with sprite 7 and never turns up at random', () => {
  const game = startGame();
  const t = game.peek('MONSTER_TYPES["dark wizard"]');
  assert.equal(t.sprite, 7);
  assert.equal(t.boss, true);
  for (let d = 1; d <= 5; d++) assert.equal(t.weight(d), 0, `weight on floor ${d}`);
});

test('the deepest floor has exactly one boss, alone in the last room', () => {
  for (let i = 0; i < 20; i++) {
    const game = startGame();
    game.peek('depth = MAX_DEPTH; startFloor()');
    const room = game.peek('rooms[rooms.length - 1]');
    const inRoom = m => m.x >= room.x && m.x < room.x + room.w && m.y >= room.y && m.y < room.y + room.h;
    const all = game.peek('monsters');
    const bosses = all.filter(m => m.name === 'dark wizard');

    assert.equal(bosses.length, 1);
    assert.ok(inRoom(bosses[0]), 'the boss should be in the last room');
    assert.deepEqual(all.filter(inRoom), bosses, 'nobody else should be in the boss room');
  }
});

test('other floors have no boss', () => {
  for (let d = 1; d < 5; d++) {
    const game = startGame();
    game.peek(`depth = ${d}; startFloor()`);
    assert.equal(game.peek('monsters.some(isBoss)'), false, `floor ${d}`);
  }
});

test('killing every other monster on the deepest floor does not win', () => {
  const game = bossFight(30, 30);   // the boss is far away
  game.peek("monsters.push(makeMonster('goblin', 11, 10)); monsters[1].hp = 1");
  withRandom(0.5, () => game.press('d'));

  assert.equal(game.peek('monsters.length'), 1, 'the goblin should be dead');
  assert.equal(game.peek('gameOver'), false);
});

test('killing the boss wins, even with other monsters still around', () => {
  const game = bossFight(11, 10);
  game.peek("monsters.push(makeMonster('goblin', 30, 30)); monsters[0].hp = 1");
  withRandom(0.5, () => game.press('d'));

  assert.equal(game.peek('gameOver'), true);
  assert.equal(game.peek('won'), true);
});

test('from a distance it throws a fire bolt that ignores your defense', () => {
  const game = bossFight();
  game.peek('player.def = 100');
  const hp = game.peek('player.hp');
  withRandom(0.5, () => game.press(' '));   // 0.5: no summon, so it's a fire bolt

  const lost = hp - game.peek('player.hp');
  assert.ok(lost >= 4 && lost <= 7, `lost ${lost} HP`);
  assert.match(lastMessages(game), /bolt of fire/);
});

test('after a spell it waits 3 actions before the next one', () => {
  const game = bossFight(30, 10);   // out of reach for a while, but in sight
  game.peek('player.x = 24; computeFOV()');
  withRandom(0.5, () => game.press(' '));
  const hp = game.peek('player.hp');
  withRandom(0.5, () => game.press(' '));
  withRandom(0.5, () => game.press(' '));
  assert.equal(game.peek('player.hp'), hp, 'no fire bolt during the cooldown');
  withRandom(0.5, () => game.press(' '));
  assert.ok(game.peek('player.hp') < hp, 'the next fire bolt comes on the 3rd action after');
});

test('a fire bolt can kill you, and the end screen names the dark wizard', () => {
  const game = bossFight();
  game.peek('player.hp = 1');
  withRandom(0.5, () => game.press(' '));

  assert.equal(game.peek('gameOver'), true);
  assert.equal(game.peek('won'), false);
  assert.equal(game.peek('stats.killedBy'), 'dark wizard');
});

test('sometimes it summons ghosts instead', () => {
  const game = bossFight();
  withRandom(0, () => game.press(' '));   // 0: below the 30% summon chance

  const ghosts = game.peek('monsters.filter(m => m.name === "ghost")');
  assert.ok(ghosts.length > 0, 'no ghosts were summoned');
  assert.ok(ghosts.every(g => g.awake), 'summoned ghosts should be hunting you');
});

test('next to you it attacks instead of casting', () => {
  const game = bossFight(11, 10);
  game.peek('player.def = 100');   // so a normal hit does nothing, but a fire bolt would
  const hp = game.peek('player.hp');
  withRandom(0.5, () => game.press(' '));
  assert.equal(game.peek('player.hp'), hp);
  assert.doesNotMatch(lastMessages(game), /bolt of fire/);
});

test('below half health it flies into a rage and acts twice a turn', () => {
  const game = bossFight(13, 10);   // 3 steps away
  game.peek('monsters[0].hp = 20; monsters[0].cooldown = 99');   // no spells, just walking
  withRandom(0.5, () => game.press(' '));

  assert.equal(boss(game).enraged, true);
  assert.match(lastMessages(game), /rage/);
  assert.equal(boss(game).x, 11, 'it should have taken 2 steps');
});

test('the status line shows the boss health once it has woken up', () => {
  const game = bossFight();
  game.peek('monsters[0].awake = false; draw()');
  assert.match(game.peek('document.getElementById("status").textContent'), /Monsters left/);
  game.peek('monsters[0].awake = true; monsters[0].hp = 30; draw()');
  assert.match(game.peek('document.getElementById("status").textContent'), /Dark wizard 30\/45/);
});

test('a saved game on the deepest floor from before the boss gets one when loaded', () => {
  const first = startGame();
  first.peek("depth = MAX_DEPTH; startFloor(); monsters = monsters.filter(m => !isBoss(m)); saveGame()");
  const game = startGame(Object.fromEntries(first.storage));
  assert.equal(game.peek('monsters.filter(isBoss).length'), 1);
});
