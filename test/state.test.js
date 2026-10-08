const test = require('node:test');
const assert = require('node:assert');
const { createState, applyCommand, replaceSongs, getLayerMix } = require('../src/state');

const songs = [
  { id: 'A', name: 'A', layers: [{ id: 'pad.wav' }, { id: 'keys.wav' }] },
  { id: 'B', name: 'B', layers: [{ id: 'pad.wav' }] },
];

test('starts on the first song, stopped', () => {
  const s = createState(songs);
  assert.equal(s.currentSongId, 'A');
  assert.equal(s.playing, false);
});

test('play and stop', () => {
  let s = createState(songs);
  s = applyCommand(s, { type: 'play' });
  assert.equal(s.playing, true);
  s = applyCommand(s, { type: 'stop' });
  assert.equal(s.playing, false);
});

test('play does nothing with no songs', () => {
  const s = createState([]);
  assert.strictEqual(applyCommand(s, { type: 'play' }), s);
});

test('layers default on and toggle per song', () => {
  let s = createState(songs);
  assert.deepEqual(getLayerMix(s, 'A', 'pad.wav'), { on: true, volume: 0.8 });
  s = applyCommand(s, { type: 'toggleLayer', layerId: 'pad.wav' });
  assert.equal(getLayerMix(s, 'A', 'pad.wav').on, false);
  assert.equal(getLayerMix(s, 'B', 'pad.wav').on, true);
  s = applyCommand(s, { type: 'toggleLayer', songId: 'A', layerId: 'pad.wav' });
  assert.equal(getLayerMix(s, 'A', 'pad.wav').on, true);
});

test('setLayer clamps volume and ignores unknown layers', () => {
  let s = createState(songs);
  s = applyCommand(s, { type: 'setLayer', layerId: 'keys.wav', volume: 3 });
  assert.equal(getLayerMix(s, 'A', 'keys.wav').volume, 1);
  s = applyCommand(s, { type: 'setLayer', layerId: 'keys.wav', on: false });
  assert.deepEqual(getLayerMix(s, 'A', 'keys.wav'), { on: false, volume: 1 });
  assert.strictEqual(applyCommand(s, { type: 'setLayer', layerId: 'nope', on: true }), s);
});

test('selectSong ignores unknown songs', () => {
  const s = createState(songs);
  assert.equal(applyCommand(s, { type: 'selectSong', songId: 'B' }).currentSongId, 'B');
  assert.strictEqual(applyCommand(s, { type: 'selectSong', songId: 'Z' }), s);
});

test('master and fade are clamped', () => {
  let s = createState(songs);
  s = applyCommand(s, { type: 'setMaster', volume: -1 });
  assert.equal(s.master, 0);
  s = applyCommand(s, { type: 'setFade', seconds: 99 });
  assert.equal(s.fadeSeconds, 10);
  assert.strictEqual(applyCommand(s, { type: 'setMaster', volume: 'x' }), s);
});

test('rescan keeps selection and stops if the song disappeared', () => {
  let s = applyCommand(createState(songs), { type: 'selectSong', songId: 'B' });
  s = applyCommand(s, { type: 'play' });
  const kept = replaceSongs(s, songs);
  assert.equal(kept.currentSongId, 'B');
  assert.equal(kept.playing, true);
  const gone = replaceSongs(s, [songs[0]]);
  assert.equal(gone.currentSongId, 'A');
  assert.equal(gone.playing, false);
});
