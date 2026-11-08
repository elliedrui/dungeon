// Tests for the sprite graphics: drawTile(), the G toggle, and the text-mode fallback.
// Run from the repo root with:  node --test tests/
//
// The setup that runs the game in Node is in helpers.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DUNGEON, startGame } = require('./helpers');

// Pretends sprites.png finished loading.
function loadSheet(game) {
  game.peek('sheet.complete = true; sheet.naturalWidth = SHEET_COLS * SPRITE; sheet.onload()');
}

test('drawTile cuts the right square out of the sprite sheet', () => {
  const game = startGame();
  loadSheet(game);
  game.calls.length = 0;
  game.peek('cam = { x: 10, y: 5 }; drawTile(19, "!", "#fff", 12, 8)');

  // The sheet has 8 sprites per row, so sprite 19 is row 2, column 3 (19 = 2 * 8 + 3).
  // Map tile (12, 8) is 2 tiles right and 3 tiles down from the camera's corner.
  const size = game.peek('SPRITE');
  assert.equal(game.peek('SHEET_COLS'), 8);
  assert.deepEqual(game.calls, [
    ['drawImage', game.peek('sheet'), 3 * size, 2 * size, size, size, 2 * 32, 3 * 32, 32, 32],
  ]);
});

test('remembered (dim) tiles get a dark layer drawn over the sprite', () => {
  const game = startGame();
  loadSheet(game);
  game.calls.length = 0;
  game.peek('cam = { x: 0, y: 0 }; drawTile(48, ".", "#777", 1, 1, true)');

  assert.equal(game.calls.length, 2);
  assert.equal(game.calls[0][0], 'drawImage');
  assert.deepEqual(game.calls[1], ['fillRect', 32, 32, 32, 32, 'rgba(0, 0, 0, 0.65)']);
});

test('in text mode, drawTile draws the character instead of a sprite', () => {
  const game = startGame();
  loadSheet(game);
  game.press('g');
  game.calls.length = 0;
  game.peek('cam = { x: 0, y: 0 }; drawTile(97, "@", "#ffe066", 3, 2)');

  // The character goes in the middle of the tile.
  assert.deepEqual(game.calls, [['fillText', '@', 3 * 32 + 16, 2 * 32 + 16, '#ffe066']]);
});

test('G switches between graphics and text, and remembers the choice', () => {
  const game = startGame();
  loadSheet(game);
  assert.equal(game.peek('useGraphics'), true);

  game.press('g');
  assert.equal(game.peek('useGraphics'), false);
  assert.equal(game.storage.get('dungeon-crawler-text-mode'), '1');

  game.press('g');
  assert.equal(game.peek('useGraphics'), true);
  assert.equal(game.storage.get('dungeon-crawler-text-mode'), '0');
});

test('a game started after choosing text mode opens in text mode', () => {
  const game = startGame({ 'dungeon-crawler-text-mode': '1' });
  loadSheet(game);
  assert.equal(game.peek('useGraphics'), false);
});

test('pressing G does not spend a turn', () => {
  const game = startGame();
  loadSheet(game);
  const turns = game.peek('stats.turns');
  game.press('g');
  assert.equal(game.peek('stats.turns'), turns);
});

test('if sprites.png fails to load, the game falls back to text mode', () => {
  const game = startGame();
  game.peek('sheet.onerror()');

  assert.equal(game.peek('useGraphics'), false);
  assert.match(game.peek('messages.at(-1).text'), /Could not load sprites\.png/);

  // G can't switch to graphics that aren't there.
  game.press('g');
  assert.equal(game.peek('useGraphics'), false);
  assert.match(game.peek('messages.at(-1).text'), /Graphics are unavailable/);

  // And a full redraw only uses text, never the broken image.
  game.calls.length = 0;
  game.peek('draw()');
  assert.ok(game.calls.some(c => c[0] === 'fillText'));
  assert.ok(!game.calls.some(c => c[0] === 'drawImage'));
});

test('every sprite number points at a real picture in sprites.png', () => {
  // A PNG stores its width and height at bytes 16 and 20.
  const png = fs.readFileSync(path.join(DUNGEON, 'sprites.png'));
  const game = startGame();
  const size = game.peek('SPRITE');
  assert.equal(png.readUInt32BE(16), game.peek('SHEET_COLS') * size, 'the sheet is SHEET_COLS sprites wide');
  const count = (png.readUInt32BE(16) / size) * (png.readUInt32BE(20) / size);

  const used = game.peek(`[
    ...Object.entries(SPRITES),
    ...Object.entries(MONSTER_TYPES).map(([name, t]) => [name, t.sprite]),
    ...Object.keys(ITEM_TYPES).map(type => [type, itemLook(type).sprite]),
    ...POTION_LOOKS.map(look => [look.adj + ' potion', look.sprite]),
  ]`);
  for (const [name, sprite] of used) {
    assert.ok(Number.isInteger(sprite) && sprite >= 0 && sprite < count,
      `${name} has sprite ${sprite}, but the sheet only has 0 to ${count - 1}`);
  }
});

test('every monster and item can be drawn in text mode too', () => {
  const game = startGame();
  const looks = game.peek(`[
    ...Object.entries(MONSTER_TYPES),
    ...Object.keys(ITEM_TYPES).map(type => [type, itemLook(type)]),
  ]`);
  for (const [name, look] of looks) {
    assert.ok(look.ch && look.color, `${name} needs a ch and a color for text mode`);
  }
});
