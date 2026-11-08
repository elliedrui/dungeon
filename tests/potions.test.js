// Tests for the potion of defense, and for potions in general.
// Run from the repo root with:  node --test tests/

const test = require('node:test');
const assert = require('node:assert/strict');
const { startGame, withRandom } = require('./helpers');

const lastMessages = game => game.peek('messages.map(m => m.text).join(" | ")');

test('drinking a potion of defense gives +1 DEF and uses up the potion', () => {
  const game = startGame();
  game.peek('inventory = ["defense"]; identified = []');
  const [def, turns] = game.peek('[player.def, stats.turns]');
  game.press('1');

  assert.equal(game.peek('player.def'), def + 1);
  assert.deepEqual(game.peek('inventory'), []);
  assert.equal(game.peek('stats.turns'), turns + 1);
  assert.ok(game.peek('identified').includes('defense'), 'drinking it tells you what it was');
  assert.match(lastMessages(game), /DEF/);
});

test('a thrown potion of defense makes the monster tougher', () => {
  const game = startGame();
  game.peek(`
    monsters = [makeMonster('troll', player.x + 1, player.y)];
    inventory = ['defense'];
  `);
  withRandom(0.5, () => { game.press('t'); game.press('1'); game.press('d'); });

  assert.equal(game.peek('monsters[0].def'), 2 + 1);
  assert.ok(game.peek('identified').includes('defense'));
});

test('until you know it, it shows up under its look, like the other potions', () => {
  const game = startGame();
  game.peek('identified = []');
  const adj = game.peek('potionLooks.defense.adj');
  assert.equal(game.peek('itemName("defense")'), `${adj} potion`);
  game.peek('identified = ["defense"]');
  assert.equal(game.peek('itemName("defense")'), 'potion of defense');
});

test('every potion kind gets its own look each run', () => {
  for (let run = 0; run < 20; run++) {
    const game = startGame();
    const kinds = game.peek('Object.keys(ITEM_TYPES).filter(t => ITEM_TYPES[t].potion)');
    assert.ok(kinds.includes('defense'));
    const looks = kinds.map(k => game.peek(`potionLooks[${JSON.stringify(k)}].adj`));
    assert.equal(new Set(looks).size, kinds.length, `two potions share a look: ${looks}`);
  }
});

test('every potion can be found in the dungeon', () => {
  const game = startGame();
  // randomPotion() rolls once: 20% poison, 15% strength, 15% defense,
  // 10% whirlwind, 40% healing.
  const found = [0, 0.199, 0.2, 0.349, 0.35, 0.499, 0.5, 0.599, 0.6, 0.999]
    .map(roll => withRandom(roll, () => game.peek('randomPotion()')));
  assert.deepEqual(found, ['poison', 'poison', 'strength', 'strength', 'defense', 'defense',
    'whirlwind', 'whirlwind', 'healing', 'healing']);
});

test('a save from before the potion of defense still loads, and gives it a free look', () => {
  const old = startGame();
  old.peek('saveGame()');
  const save = JSON.parse(old.storage.get('dungeon-crawler-save'));
  delete save.potionLooks.defense;
  const before = { ...save.potionLooks };

  const game = startGame({ 'dungeon-crawler-save': JSON.stringify(save) });
  assert.equal(game.peek('depth'), save.depth, 'the old save was not loaded');

  // The potions you already had keep their looks...
  for (const [kind, look] of Object.entries(before)) {
    assert.equal(game.peek(`potionLooks.${kind}.adj`), look.adj);
  }
  // ...and defense gets the one look nobody else is using.
  const used = Object.values(before).map(l => l.adj);
  const defense = game.peek('potionLooks.defense.adj');
  assert.ok(defense && !used.includes(defense), `defense got ${defense}`);
  assert.equal(game.peek('itemName("defense")'), `${defense} potion`);
});

test('a save from before the new sprite sheet draws its potions with the new sprites', () => {
  const old = startGame();
  old.peek('saveGame()');
  const save = JSON.parse(old.storage.get('dungeon-crawler-save'));
  // The old 16x16 sheet's potion sprites, e.g. crimson was 115.
  const oldSprites = { murky: 113, bubbling: 114, crimson: 115, sparkling: 116, fizzing: 127 };
  for (const look of Object.values(save.potionLooks)) look.sprite = oldSprites[look.adj];

  const game = startGame({ 'dungeon-crawler-save': JSON.stringify(save) });
  for (const [kind, look] of Object.entries(save.potionLooks)) {
    assert.equal(game.peek(`potionLooks.${kind}.adj`), look.adj, `${kind} kept its look`);
    assert.equal(game.peek(`potionLooks.${kind}.sprite`),
      game.peek(`POTION_LOOKS.find(l => l.adj === '${look.adj}').sprite`), `${kind} has the new sprite`);
  }
});
