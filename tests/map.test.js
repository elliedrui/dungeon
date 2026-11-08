// Tests for the full map: press M to see the whole floor, shrunk to fit the
// screen. It only shows tiles you've explored. (Sound on/off moved to V.)
// Run from the repo root with:  node --test tests/

const test = require('node:test');
const assert = require('node:assert/strict');
const { startGame } = require('./helpers');

// Opens the map and returns the map tiles that got drawn, as {x, y, color} in
// map coordinates. A map tile is a fillRect exactly MAP_SCALE pixels square.
function drawnMapTiles(game) {
  game.calls.length = 0;
  if (!game.peek('showMap')) game.press('m');
  else game.peek('draw()');
  const [scale, ox, oy] = game.peek(`[MAP_SCALE,
    Math.floor((canvas.width - MAP_W * MAP_SCALE) / 2),
    Math.floor((canvas.height - MAP_H * MAP_SCALE) / 2)]`);
  return game.calls
    .filter(c => c[0] === 'fillRect' && c[3] === scale && c[4] === scale)
    .map(c => ({ x: (c[1] - ox) / scale, y: (c[2] - oy) / scale, color: c[5] }));
}

test('the whole map fits on the screen', () => {
  const game = startGame();
  const [w, h] = game.peek('[MAP_W * MAP_SCALE, MAP_H * MAP_SCALE]');
  assert.ok(w <= game.peek('canvas.width') && h <= game.peek('canvas.height'));
  assert.ok(game.peek('MAP_SCALE') >= 4, 'map tiles are too small to see');
});

test('M opens the map and M closes it again', () => {
  const game = startGame();
  assert.equal(game.peek('showMap'), false);
  game.press('m');
  assert.equal(game.peek('showMap'), true);
  game.press('m');
  assert.equal(game.peek('showMap'), false);
});

test('Escape also closes the map', () => {
  const game = startGame();
  game.press('m');
  game.press('Escape');
  assert.equal(game.peek('showMap'), false);
});

test('looking at the map does not use a turn', () => {
  const game = startGame();
  const turns = game.peek('stats.turns');
  game.press('m');
  game.press('m');
  assert.equal(game.peek('stats.turns'), turns);
});

test('while the map is open, other keys do nothing', () => {
  const game = startGame();
  const before = game.peek('JSON.stringify([player, stats.turns, inventory, depth])');
  game.press('m');
  for (const key of ['w', 'a', 's', 'd', ' ', '1', '>', 'r', 'g', 'v']) game.press(key);

  assert.equal(game.peek('JSON.stringify([player, stats.turns, inventory, depth])'), before);
  assert.equal(game.peek('showMap'), true);
});

test('the map shows explored tiles only, even ones far off screen', () => {
  const game = startGame();
  // Forget everything, then "remember" one far corner of the floor. Some floor is
  // carved there first, since the corner might otherwise be solid rock with nothing to draw.
  game.peek(`
    for (let y = MAP_H - 5; y < MAP_H - 2; y++) for (let x = MAP_W - 5; x < MAP_W - 2; x++) map[y][x] = FLOOR;
    explored = map.map(row => row.map(() => false));
    visible = map.map(row => row.map(() => false));
    for (let y = MAP_H - 6; y < MAP_H; y++) for (let x = MAP_W - 6; x < MAP_W; x++) explored[y][x] = true;
  `);
  const tiles = drawnMapTiles(game).filter(t => !(t.x === game.peek('player.x') && t.y === game.peek('player.y')));

  assert.ok(tiles.length > 0, 'nothing was drawn');
  for (const t of tiles) {
    assert.equal(game.peek(`explored[${t.y}][${t.x}]`), true, `unexplored tile ${t.x},${t.y} was drawn`);
  }
});

test('tiles you can see right now are brighter than remembered ones', () => {
  const game = startGame();
  const tiles = drawnMapTiles(game);
  const [px, py] = game.peek('[player.x, player.y]');
  const seenFloor = tiles.find(t => game.peek(`visible[${t.y}][${t.x}] && map[${t.y}][${t.x}] === FLOOR`)
    && !(t.x === px && t.y === py));

  game.peek('visible = map.map(row => row.map(() => false))');   // pretend you looked away
  const remembered = drawnMapTiles(game).find(t => t.x === seenFloor.x && t.y === seenFloor.y);
  assert.notEqual(seenFloor.color, remembered.color);
});

test('you are marked on the map', () => {
  const game = startGame();
  const [px, py] = game.peek('[player.x, player.y]');
  const tiles = drawnMapTiles(game);
  // The player is drawn last, on top of the floor under them.
  const last = tiles.filter(t => t.x === px && t.y === py).at(-1);
  assert.ok(last, 'nothing drawn where you stand');
  assert.equal(last.color, '#ffe066');
});

test('the stairs show up once you have explored them', () => {
  const game = startGame();
  const [sx, sy] = game.peek('[stairs.x, stairs.y]');
  game.peek(`explored[${sy}][${sx}] = false`);
  assert.ok(!drawnMapTiles(game).some(t => t.x === sx && t.y === sy));

  game.peek(`explored[${sy}][${sx}] = true`);
  const stairTile = drawnMapTiles(game).find(t => t.x === sx && t.y === sy);
  assert.ok(stairTile, 'explored stairs not drawn');
  const floorColors = drawnMapTiles(game)
    .filter(t => game.peek(`map[${t.y}][${t.x}] === FLOOR`) && !(t.x === sx && t.y === sy))
    .map(t => t.color);
  assert.ok(!floorColors.includes(stairTile.color), 'stairs look just like floor');
});

// ----- Items on the map -----

// A floor with three items: a scroll and a potion on explored tiles, and a
// potion on a tile you haven't explored. Returns their spots.
function itemsOnFloor(game) {
  game.peek(`
    explored = map.map(row => row.map(() => false));
    visible = map.map(row => row.map(() => false));
    explored[10][20] = explored[12][40] = true;
    items = [
      { type: 'scroll',  x: 20, y: 10 },
      { type: 'healing', x: 40, y: 12 },
      { type: 'poison',  x: 50, y: 30 },   // never explored
    ];
  `);
}

// Where map tile (x, y) starts on the canvas, in pixels.
function mapPixel(game, x, y) {
  return game.peek(`[
    Math.floor((canvas.width - MAP_W * MAP_SCALE) / 2) + ${x} * MAP_SCALE,
    Math.floor((canvas.height - MAP_H * MAP_SCALE) / 2) + ${y} * MAP_SCALE]`);
}

test('in graphics mode, items you have seen are drawn on the map with their sprite', () => {
  const game = startGame();
  itemsOnFloor(game);
  game.calls.length = 0;
  game.press('m');

  const scale = game.peek('MAP_SCALE');
  const [size, cols] = game.peek('[SPRITE, SHEET_COLS]');
  const sprites = game.calls.filter(c => c[0] === 'drawImage' && c[8] === scale);
  for (const [type, x, y] of [['scroll', 20, 10], ['healing', 40, 12]]) {
    const sprite = game.peek(`itemLook('${type}').sprite`);
    const [px, py] = mapPixel(game, x, y);
    assert.ok(sprites.some(c => c[2] === (sprite % cols) * size && c[3] === Math.floor(sprite / cols) * size
                             && c[6] === px && c[7] === py), `${type} not drawn at ${x},${y}`);
  }
  assert.equal(sprites.length, 2, 'the potion on the unexplored tile should stay hidden');
});

test('in text mode, items you have seen are drawn on the map as ! and ?', () => {
  const game = startGame({ 'dungeon-crawler-text-mode': '1' });
  itemsOnFloor(game);
  game.calls.length = 0;
  game.press('m');

  const scale = game.peek('MAP_SCALE');
  const letters = game.calls.filter(c => c[0] === 'fillText' && (c[1] === '!' || c[1] === '?'));
  const [sx, sy] = mapPixel(game, 20, 10);
  const [px, py] = mapPixel(game, 40, 12);
  assert.deepEqual(letters, [
    ['fillText', '?', sx + scale / 2, sy + scale / 2, game.peek('ITEM_TYPES.scroll.color')],
    ['fillText', '!', px + scale / 2, py + scale / 2, game.peek('potionLooks.healing.color')],
  ]);
});

test('the map does not give away what an unknown potion is', () => {
  const game = startGame();
  itemsOnFloor(game);
  game.peek('identified = []');
  game.calls.length = 0;
  game.press('m');

  // It's drawn with this run's random look, e.g. "crimson", not anything tied to healing.
  const sprite = game.peek('potionLooks.healing.sprite');
  const [size, cols] = game.peek('[SPRITE, SHEET_COLS]');
  const [px, py] = mapPixel(game, 40, 12);
  const drawn = game.calls.find(c => c[0] === 'drawImage' && c[6] === px && c[7] === py);
  assert.deepEqual([drawn[2], drawn[3]], [(sprite % cols) * size, Math.floor(sprite / cols) * size]);
});

test('an item you pick up disappears from the map', () => {
  const game = startGame();
  itemsOnFloor(game);
  game.peek('items = items.filter(i => i.type !== "scroll")');   // as if picked up
  game.calls.length = 0;
  game.press('m');

  const [sx, sy] = mapPixel(game, 20, 10);
  assert.ok(!game.calls.some(c => c[0] === 'drawImage' && c[6] === sx && c[7] === sy));
});

test('the map is not saved: a reloaded game starts with it closed', () => {
  const game = startGame();
  game.press('m');
  const reloaded = startGame({ 'dungeon-crawler-save': game.storage.get('dungeon-crawler-save') });
  assert.equal(reloaded.peek('showMap'), false);
});

test('V turns the sound on and off now, and M does not', () => {
  const game = startGame();
  game.press('m');
  game.press('m');
  assert.equal(game.peek('muted'), false);

  game.press('v');
  assert.equal(game.peek('muted'), true);
  assert.equal(game.storage.get('dungeon-crawler-muted'), '1');
  game.press('v');
  assert.equal(game.peek('muted'), false);
});
