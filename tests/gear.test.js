// Tests for gear: weapons, armor, shields and helmets. You pick gear up like
// any item, then press its number to put it on. Whatever you were wearing in
// that slot is dropped at your feet.
// Run from the repo root with:  node --test

const test = require('node:test');
const assert = require('node:assert/strict');
const { startGame, openFloor, withRandom } = require('./helpers');

// A game on an open floor with no monsters and the given pack.
function field(pack) {
  const game = startGame();
  openFloor(game);
  game.peek(`inventory = ${JSON.stringify(pack)}`);
  return game;
}

const stats = game => game.peek('({ atk: player.atk, def: player.def })');

test('a new game starts with nothing worn', () => {
  const game = startGame();
  assert.deepEqual(game.peek('player.gear'), { weapon: null, armor: null, shield: null, helmet: null });
  assert.equal(game.peek("document.getElementById('gear').textContent"),
    'Wearing: no weapon   no armor   no shield   no helmet');
});

test('pressing its number puts gear on, adds its bonus and spends a turn', () => {
  const game = field(['longsword', 'chain mail']);
  const before = stats(game);
  const turns = game.peek('stats.turns');

  game.press('1');
  assert.equal(game.peek('player.gear.weapon'), 'longsword');
  assert.deepEqual(stats(game), { atk: before.atk + 3, def: before.def });
  assert.deepEqual(game.peek('inventory'), ['chain mail']);
  assert.equal(game.peek('stats.turns'), turns + 1);

  // Gear in other slots adds up.
  game.press('1');
  assert.deepEqual(stats(game), { atk: before.atk + 3, def: before.def + 3 });
  assert.match(game.peek("document.getElementById('gear').textContent"), /longsword \+3 ATK   chain mail \+3 DEF/);
});

test('swapping gear drops the old piece at your feet, and its bonus goes with it', () => {
  const game = field(['dagger', 'battle axe']);
  const before = stats(game);
  game.press('1');
  game.press('1');

  assert.equal(game.peek('player.gear.weapon'), 'battle axe');
  assert.deepEqual(stats(game), { atk: before.atk + 4, def: before.def });   // not +5
  assert.deepEqual(game.peek('inventory'), []);
  assert.deepEqual(game.peek('items'), [{ type: 'dagger', x: 10, y: 10 }]);
  assert.match(game.peek('messages.at(-1).text'), /wield the battle axe \(\+4 ATK\) and drop your dagger/);
});

test('gear no better than what you wear is left on the floor', () => {
  const game = field(['buckler', 'tower shield']);
  game.press('1');
  game.press('1');   // the buckler is dropped here
  game.press('d');   // step off
  game.press('a');   // and back on
  assert.deepEqual(game.peek('inventory'), []);
  assert.deepEqual(game.peek('items.map(i => i.type)'), ['buckler']);
  assert.match(game.peek('messages.at(-1).text'),
    /You see a buckler \(\+1 DEF\), no better than your tower shield \(\+2 DEF\)/);

  // Same bonus counts as no better, too.
  game.peek("items = [{ type: 'round shield', x: player.x + 1, y: player.y }]");
  game.press('d');
  assert.deepEqual(game.peek('inventory'), []);
});

test('better gear, or gear for an empty slot, is picked up', () => {
  const game = field(['dagger']);
  game.press('1');
  game.peek(`items = [{ type: 'longsword', x: player.x + 1, y: player.y },
                      { type: 'leather cap', x: player.x + 2, y: player.y }]`);
  game.press('d');
  game.press('d');
  assert.deepEqual(game.peek('inventory'), ['longsword', 'leather cap']);
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
  const game = field(['iron helm']);
  game.press('1');
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
  assert.equal(game.peek('messages.at(-1).text'), 'Welcome back. Your game was restored.');
  assert.deepEqual(game.peek('player.gear'), { weapon: null, armor: null, shield: null, helmet: null });
  game.peek("inventory = ['dagger']");
  game.press('1');
  assert.equal(game.peek('player.gear.weapon'), 'dagger');
});

test('gear cannot be thrown', () => {
  const game = field(['dagger', 'healing']);
  game.press('t');
  game.press('1');
  assert.match(game.peek('messages.at(-1).text'), /only throw potions/);
  assert.deepEqual(game.peek('inventory'), ['dagger', 'healing']);
});
