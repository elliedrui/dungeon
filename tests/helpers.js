// Shared setup for the tests: runs the game's <script> in Node.
//
// The game is one HTML file meant for a browser, so we pull out its <script>,
// run it in Node, and hand it fake versions of the browser things it uses
// (document, localStorage, Image, ...). The fake canvas records every drawing
// call, so a test can check *what* would have been drawn.

const fs = require('node:fs');
const path = require('node:path');

const DUNGEON = path.join(__dirname, '..', 'dungeon');
const html = fs.readFileSync(path.join(DUNGEON, 'index.html'), 'utf8');
const script = html.slice(html.indexOf('<script>') + '<script>'.length, html.indexOf('</script>'));

// Starts a fresh copy of the game. `saved` is what's already in localStorage.
// Returns:
//   peek(code) - runs code inside the game and returns the result, e.g. peek('player.hp')
//   press(key) - presses a key
//   calls      - every drawing call made on the canvas, e.g. ['drawImage', ...]
//   storage    - the fake localStorage contents
function startGame(saved = {}) {
  const calls = [];
  const ctx = {
    drawImage: (...args) => calls.push(['drawImage', ...args]),
    fillRect: (...args) => calls.push(['fillRect', ...args, ctx.fillStyle]),
    fillText: (...args) => calls.push(['fillText', ...args, ctx.fillStyle]),
    measureText: text => ({ width: text.length * 10 }),   // about right for 16px monospace
  };
  const element = () => ({
    textContent: '', style: {}, replaceChildren() {},
    classList: { add() {}, remove() {} },
    getContext: () => ctx,
  });
  const elements = {};
  let keydown;
  const document = {
    getElementById: id => (elements[id] ??= element()),
    createElement: () => ({ style: {} }),
    addEventListener: (type, fn) => { if (type === 'keydown') keydown = fn; },
  };
  const storage = new Map(Object.entries(saved));
  const localStorage = {
    getItem: k => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: k => storage.delete(k),
  };
  // A fake image that never loads by itself; tests call onload/onerror.
  class Image { constructor() { this.complete = false; this.naturalWidth = 0; } }

  // `return src => eval(src)` at the end lets us look inside the game's own variables.
  const run = new Function('document', 'localStorage', 'Image', 'setTimeout',
    script + '\nreturn src => eval(src);');
  const peek = run(document, localStorage, Image, () => {});

  return {
    peek,
    press: key => keydown({ key, preventDefault() {} }),
    calls,
    storage,
  };
}

// Replaces the floor with a simple open one: a wall all around and nothing else.
// The player stands at (10, 10). No monsters, no items, no stairs.
function openFloor(game) {
  game.peek(`
    map = [];
    for (let y = 0; y < MAP_H; y++) {
      map.push([]);
      for (let x = 0; x < MAP_W; x++) {
        const edge = x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1;
        map[y].push(edge ? WALL : FLOOR);
      }
    }
    rooms = [{ x: 2, y: 2, w: 5, h: 5 }];
    stairs = null;
    items = [];
    explored = map.map(row => row.map(() => false));
    player.x = 10;
    player.y = 10;
    monsters = [];
    computeFOV();
  `);
}

// Runs fn() with Math.random always returning `value`, so dice rolls are predictable.
function withRandom(value, fn) {
  const real = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = real; }
}

module.exports = { DUNGEON, startGame, openFloor, withRandom };
