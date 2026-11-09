// Tests for the high-score table: the best 5 runs, kept in the browser even
// after the saved game is deleted. The end screen shows the table.
//   Score = 100 per floor reached + 10 per kill + 500 for winning.
// Run from the repo root with:  node --test tests/

const test = require('node:test');
const assert = require('node:assert/strict');
const { startGame, openFloor, withRandom } = require('./helpers');

const SCORES_KEY = 'dungeon-crawler-scores';
const savedScores = game => JSON.parse(game.storage.get(SCORES_KEY) ?? '[]');

// Ends the run by drinking poison at 1 HP.
function die(game) {
  game.peek('player.hp = 1; inventory = ["poison"]');
  withRandom(0.5, () => game.press('1'));
  assert.equal(game.peek('gameOver'), true, 'the player should have died');
}

// Ends the run with a win: kills the boss on the deepest floor.
function win(game) {
  openFloor(game);
  game.peek(`depth = MAX_DEPTH; stats.deepest = MAX_DEPTH;
             monsters = [makeMonster('dark wizard', 11, 10)]; monsters[0].hp = 1;`);
  withRandom(0.5, () => game.press('d'));
  assert.equal(game.peek('won'), true, 'the player should have won');
}

// A score table entry, for filling the table before a test.
const entry = score => ({ score, won: false, floor: 1, kills: 0, killedBy: 'rat', date: '1/1/2026' });

test('dying records your run', () => {
  const game = startGame();
  game.peek('stats.deepest = 3; stats.kills = { rat: 2, orc: 1 }');
  die(game);

  const [run] = savedScores(game);
  assert.equal(run.score, 3 * 100 + 3 * 10);
  assert.equal(run.won, false);
  assert.equal(run.floor, 3);
  assert.equal(run.kills, 3);
  assert.equal(run.killedBy, 'potion of poison');
});

test('winning records your run, with the 500 point bonus', () => {
  const game = startGame();
  win(game);

  const [run] = savedScores(game);
  assert.equal(run.won, true);
  assert.equal(run.score, 5 * 100 + 1 * 10 + 500);
});

test('the floor counted is the deepest you reached, not where you ended up', () => {
  // e.g. after the old woman sent you back to floor 1
  const game = startGame();
  game.peek('depth = 1; stats.deepest = 4');
  die(game);
  assert.equal(savedScores(game)[0].floor, 4);
});

test('only the best 5 runs are kept, best first', () => {
  const old = [500, 400, 300, 200, 100].map(entry);
  const game = startGame({ [SCORES_KEY]: JSON.stringify(old) });
  game.peek('stats.deepest = 3');   // 300 points, ties with an old run
  die(game);

  assert.deepEqual(savedScores(game).map(s => s.score), [500, 400, 300, 300, 200]);
});

test('a run that does not make the top 5 is not kept', () => {
  const old = [900, 800, 700, 600, 500].map(entry);
  const game = startGame({ [SCORES_KEY]: JSON.stringify(old) });
  die(game);   // floor 1, no kills: 100 points
  assert.deepEqual(savedScores(game).map(s => s.score), [900, 800, 700, 600, 500]);
});

test('a run is recorded only once, even if you keep pressing keys', () => {
  const game = startGame();
  die(game);
  for (const key of ['g', 'v', 'm', 'm', 'w', '1', 't']) game.press(key);
  assert.equal(savedScores(game).length, 1);
});

test('scores survive the save being deleted and a new game starting', () => {
  const game = startGame();
  die(game);
  assert.equal(game.storage.has('dungeon-crawler-save'), false);
  game.press('r');
  die(game);
  assert.equal(savedScores(game).length, 2);
});

test('the end screen shows the table and your score', () => {
  const old = [900, 50].map(entry);
  const game = startGame({ [SCORES_KEY]: JSON.stringify(old) });
  die(game);   // 100 points: second place
  game.calls.length = 0;
  game.peek('draw()');

  const texts = game.calls.filter(c => c[0] === 'fillText');
  const all = texts.map(c => c[1]).join('\n');
  assert.match(all, /Best runs/i);
  assert.match(all, /Your score: 100/);
  const rows = texts.filter(c => /^\s*\d\./.test(c[1]));
  assert.equal(rows.length, 3);
  assert.match(rows[0][1], /900/);
  assert.match(rows[1][1], /100/);
  // Your run stands out in a different color.
  assert.notEqual(rows[1][4], rows[0][4]);
  assert.equal(rows[0][4], rows[2][4]);
});

test('a long kill list wraps to fit the screen, without splitting a monster name', () => {
  const game = startGame();
  game.peek("stats.kills = { goblin: 7, 'giant rat': 14, rat: 3, slime: 9, orc: 13, bat: 4, spider: 8, crab: 5, ghost: 9, troll: 5, 'old woman': 1 }");
  die(game);
  game.calls.length = 0;
  game.peek('draw()');

  const texts = game.calls.filter(c => c[0] === 'fillText').map(c => c[1]);
  const width = game.peek('canvas.width');
  for (const t of texts) assert.ok(t.length * 10 <= width, `too wide: ${t}`);
  // Every kill is still there, each on one line.
  const all = texts.join('\n');
  for (const kill of ['7 goblins', '14 giant rats', '1 old woman']) {
    assert.ok(all.includes(kill.replaceAll(' ', ' ')), `missing ${kill}`);
  }
});

test('a broken score table in storage is treated as empty', () => {
  const game = startGame({ [SCORES_KEY]: 'not json at all' });
  die(game);
  assert.equal(savedScores(game).length, 1);
});
