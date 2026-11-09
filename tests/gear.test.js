// Tests for gear: weapons, armor, shields and helmets. Gear never goes in your
// pack: step on a piece that's better than what you're wearing and you put it
// on, dropping the old one at your feet. Worse gear stays on the floor.
// Run from the repo root with:  node --test

const test = require('node:test');
const assert = require('node:assert/strict');
const { startGame, openFloor, withRandom } = require('./helpers');

// A game on an open floor with no monsters, the player at (10, 10), and the
// given gear lying in a row to the right: (11, 10), (12, 10), ...
function field(...gear) {
  const game = startGame();
  openFloor(game);
  game.peek(`inventory = []; items = ${JSON.stringify(gear.map((type, i) => ({ type, x: 11 + i, y: 10 })))}`);
  return game;
}

const stats = game => game.peek('({ atk: player.atk, def: player.def })');
const lastMessage = game => game.peek('messages.at(-1).text');

test('a new game starts with nothing worn', () => {
  const game = startGame();
  assert.deepEqual(game.peek('player.gear'), { weapon: null, armor: null, shield: null, helmet: null });
  assert.equal(game.peek("document.getElementById('gear').textContent"),
    'Wearing: no weapon   no armor   no shield   no helmet');
});

test('stepping on gear puts it on straight away, without using the pack', () => {
  const game = field('longsword', 'chain mail');
  const before = stats(game);

  game.press('d');
  assert.equal(game.peek('player.gear.weapon'), 'longsword');
  assert.deepEqual(stats(game), { atk: before.atk + 3, def: before.def });
  assert.match(lastMessage(game), /You wield the longsword \(\+3 ATK\)/);

  // Gear in other slots adds up.
  game.press('d');
  assert.deepEqual(stats(game), { atk: before.atk + 3, def: before.def + 3 });
  assert.deepEqual(game.peek('inventory'), []);
  assert.deepEqual(game.peek('items'), []);
  assert.match(game.peek("document.getElementById('gear').textContent"), /longsword \+3 ATK   chain mail \+3 DEF/);
});

test('better gear swaps in, dropping the old piece where you stand', () => {
  const game = field('dagger', 'battle axe');
  const before = stats(game);
  game.press('d');
  game.press('d');

  assert.equal(game.peek('player.gear.weapon'), 'battle axe');
  assert.deepEqual(stats(game), { atk: before.atk + 4, def: before.def });   // not +5
  assert.deepEqual(game.peek('items'), [{ type: 'dagger', x: 12, y: 10 }]);
  assert.match(lastMessage(game), /wield the battle axe \(\+4 ATK\) and drop your dagger/);
});

test('gear no better than what you wear is left on the floor', () => {
  const game = field('tower shield', 'buckler', 'kite shield');
  game.press('d');   // tower shield, +2
  game.press('d');   // buckler, +1: worse
  assert.equal(game.peek('player.gear.shield'), 'tower shield');
  assert.match(lastMessage(game), /You see a buckler \(\+1 DEF\), no better than your tower shield \(\+2 DEF\)/);
  game.press('d');   // kite shield, +2: the same counts as no better
  assert.equal(game.peek('player.gear.shield'), 'tower shield');
  assert.deepEqual(game.peek('items.map(i => i.type)'), ['buckler', 'kite shield']);
});

test('the old piece you dropped is not picked up again', () => {
  const game = field('leather cap', 'great helm');
  game.press('d');
  game.press('d');   // the leather cap is dropped here
  game.press('a');
  game.press('d');   // back onto it
  assert.equal(game.peek('player.gear.helmet'), 'great helm');
  assert.deepEqual(game.peek('items.map(i => i.type)'), ['leather cap']);
});

test('a full pack does not stop you putting on gear', () => {
  const game = field('plate armor');
  game.peek("inventory = Array(INVENTORY_SIZE).fill('healing')");
  game.press('d');
  assert.equal(game.peek('player.gear.armor'), 'plate armor');
  assert.equal(game.peek('inventory.length'), game.peek('INVENTORY_SIZE'));
});

test('gear already in the pack (from an old save) is put on with its number, spending a turn', () => {
  const game = field();
  game.peek("inventory = ['short sword']");
  const turns = game.peek('stats.turns');
  game.press('1');
  assert.equal(game.peek('player.gear.weapon'), 'short sword');
  assert.deepEqual(game.peek('inventory'), []);
  assert.equal(game.peek('stats.turns'), turns + 1);
});

test('each floor has gear lying around, better the deeper you go', () => {
  for (let depth = 1; depth <= 5; depth++) {
    for (let run = 0; run < 20; run++) {
      const game = startGame();
      game.peek(`depth = ${depth}; startFloor()`);
      const gear = game.peek('items.filter(i => ITEM_TYPES[i.type].slot).map(i => ITEM_TYPES[i.type].depth)');
      assert.equal(gear.length, game.peek('GEAR_PER_FLOOR'));
      // Only the newest two tiers that can be found this deep.
      for (const tier of gear) assert.ok(tier <= depth && tier >= depth - 1, `tier ${tier} on floor ${depth}`);
    }
  }
});

test('every slot has gear for every tier, so nothing is missing from the table', () => {
  const game = startGame();
  const table = game.peek('Object.values(ITEM_TYPES).filter(t => t.slot).map(t => t.slot + t.depth)');
  for (const slot of game.peek('GEAR_SLOTS'))
    for (const tier of [1, 2, 3, 4]) assert.ok(table.includes(slot + tier), `no ${slot} for floor ${tier}`);
});

test('gear stays on when you take the stairs, and is saved', () => {
  const game = field('iron helm');
  game.press('d');
  game.peek('stairs = { x: player.x, y: player.y }');
  withRandom(0.5, () => game.press('>'));
  assert.equal(game.peek('player.gear.helmet'), 'iron helm');

  const reloaded = startGame({ 'dungeon-crawler-save': game.storage.get('dungeon-crawler-save') });
  assert.equal(reloaded.peek('player.gear.helmet'), 'iron helm');
});

test('a save from before gear still loads, wearing nothing', () => {
  const old = startGame();
  old.peek('saveGame()');
  const save = JSON.parse(old.storage.get('dungeon-crawler-save'));
  delete save.player.gear;
  const game = startGame({ 'dungeon-crawler-save': JSON.stringify(save) });
  assert.equal(lastMessage(game), 'Welcome back. Your game was restored.');
  assert.deepEqual(game.peek('player.gear'), { weapon: null, armor: null, shield: null, helmet: null });
});
