// Tests for the sound effects. Node has no speakers, so these use a fake
// AudioContext that records what each sound asks for and checks it would be
// valid in a real browser. (Whether it sounds good is up to your ears: open
// the game as index.html#sounds to try every sound.)
// Run from the repo root with:  node --test

const test = require('node:test');
const assert = require('node:assert/strict');
const { startGame, openFloor, withRandom } = require('./helpers');

// A pretend AudioContext. Every problem a browser would complain about goes in
// `problems`, and every oscillator or noise source started goes in `started`.
function fakeAudio() {
  const log = { problems: [], started: [], contexts: 0 };
  const check = (ok, what) => { if (!ok) log.problems.push(what); };

  // An AudioParam (a volume, pitch or filter setting that can change over time).
  const param = name => {
    let last = -Infinity;
    const at = (t, what) => { check(Number.isFinite(t) && t >= last, `${name}: ${what} out of order at ${t}`); last = t; };
    return {
      value: 0,
      values: [],   // everything it was set to, in order
      setValueAtTime(v, t) { check(Number.isFinite(v), `${name}: set to ${v}`); at(t, 'set'); this.values.push(v); },
      // An exponential ramp can't reach 0 or below: a browser throws.
      exponentialRampToValueAtTime(v, t) { check(Number.isFinite(v) && v > 0, `${name}: ramp to ${v}`); at(t, 'ramp'); },
    };
  };
  const node = extra => ({ connect: target => target, ...extra });
  const source = kind => {
    let startedAt = null;
    return node({
      start(t) { startedAt = t; log.started.push(source.last = this); },
      stop(t) { check(startedAt !== null && t >= startedAt, `${kind} stops (${t}) before it starts (${startedAt})`); },
    });
  };

  class AudioContext {
    constructor() { log.contexts++; this.currentTime = 0; this.sampleRate = 8000; this.destination = {}; }
    createOscillator() {
      const osc = source('oscillator');
      return Object.assign(osc, { type: 'sine', frequency: param('pitch') });
    }
    createBufferSource() { return Object.assign(source('noise'), { buffer: null, loop: false }); }
    createGain() { return node({ gain: param('volume') }); }
    createBiquadFilter() { return node({ type: 'lowpass', frequency: param('filter'), Q: { value: 1 } }); }
    createDynamicsCompressor() { return node({}); }
    createBuffer(channels, length) { const data = new Float32Array(length); return { getChannelData: () => data }; }
  }
  return { AudioContext, log };
}

// Starts a game with the fake audio in place of the browser's, until test `t` ends.
// (The game makes its AudioContext on the first sound, so the fake has to stay.)
function gameWithAudio(t, saved) {
  const fake = fakeAudio();
  const real = globalThis.AudioContext;
  globalThis.AudioContext = fake.AudioContext;
  t.after(() => { globalThis.AudioContext = real; });
  return { game: startGame(saved), log: fake.log };
}

test('every sound plays, with settings a browser would accept', t => {
  const { game, log } = gameWithAudio(t);
  const names = game.peek('Object.keys(SOUNDS)');
  assert.ok(names.length >= 20, `only ${names.length} sounds`);
  for (const name of names) {
    log.started.length = 0;
    game.peek(`SOUNDS[${JSON.stringify(name)}]()`);
    assert.ok(log.started.length > 0, `${name} played nothing`);
  }
  assert.deepEqual(log.problems, []);
});

test('with sound off, nothing plays', t => {
  const { game, log } = gameWithAudio(t, { 'dungeon-crawler-muted': '1' });
  for (const name of game.peek('Object.keys(SOUNDS)')) game.peek(`SOUNDS[${JSON.stringify(name)}]()`);
  assert.equal(log.contexts, 0, 'no AudioContext should even be made');
});

test('a hit sounds a little different each time', t => {
  const { game, log } = gameWithAudio(t);
  // The pitch the hit's low knock starts at, with two different dice rolls.
  const pitches = [0.1, 0.9].map(roll => withRandom(roll, () => {
    log.started.length = 0;
    game.peek('SOUNDS.hit()');
    return log.started.find(s => s.frequency).frequency.values[0];
  }));
  assert.notEqual(pitches[0], pitches[1]);
});

// ----- Which event plays which sound -----

// Replaces every sound with one that writes its name down, and returns that list.
function listen(game) {
  game.peek('globalThis.heard = []; for (const k in SOUNDS) SOUNDS[k] = () => heard.push(k)');
  return () => game.peek('heard');
}

test('a monster spotting you plays a sound, and the boss has its own', () => {
  const game = startGame();
  openFloor(game);
  const heard = listen(game);
  game.peek("depth = MAX_DEPTH; monsters = [makeMonster('goblin', 12, 10), makeMonster('dark wizard', 10, 13)]");
  withRandom(0.5, () => game.press(' '));
  assert.ok(heard().includes('spotted'), heard().join());
  assert.ok(heard().includes('bossWake'), heard().join());
});

test('throwing a potion whooshes, then smashes', () => {
  const game = startGame();
  openFloor(game);
  game.peek("inventory = ['healing']");
  const heard = listen(game);
  withRandom(0.5, () => { game.press('t'); game.press('1'); game.press('d'); });
  assert.deepEqual(heard().slice(0, 2), ['throw', 'smash']);
});

test('things you cannot do make a soft "nope"', () => {
  const game = startGame();
  openFloor(game);
  const heard = listen(game);
  game.press('>');                       // no stairs here
  game.peek('inventory = []');
  game.press('t');                       // nothing to throw
  assert.deepEqual(heard(), ['deny', 'deny']);
});

test("each of the old woman's spells has its own sound", () => {
  const sounds = [];
  for (const roll of [0.15, 0.25, 0.35]) {   // d20 rolls of 4, 6 and 8: heal, confuse, forget
    const game = startGame();
    openFloor(game);
    game.peek("monsters = [makeMonster('old woman', 10, 13)]; monsters[0].awake = true; player.hp = 5");
    const heard = listen(game);
    withRandom(roll, () => game.press(' '));
    sounds.push(heard().at(-1));
  }
  assert.deepEqual(sounds, ['heal', 'confuse', 'forget']);
});

test('drinking a potion gulps, then plays what it did', () => {
  const game = startGame();
  game.peek("inventory = ['strength', 'healing']; player.hp = 10");
  const heard = listen(game);
  game.press('1');
  game.press('1');
  assert.deepEqual(heard().filter(s => s !== 'spotted'), ['drink', 'buff', 'drink', 'heal']);
});
