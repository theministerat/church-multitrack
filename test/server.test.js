const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');
const { createServer } = require('../src/server');
const { scanLibrary } = require('../src/library');

function makeLibrary() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cmt-'));
  fs.mkdirSync(path.join(root, 'Song 10'));
  fs.mkdirSync(path.join(root, 'Song 2'));
  fs.mkdirSync(path.join(root, 'Empty'));
  fs.writeFileSync(path.join(root, 'Song 2', 'Pad.wav'), 'RIFF');
  fs.writeFileSync(path.join(root, 'Song 2', 'notes.txt'), 'x');
  fs.writeFileSync(path.join(root, 'Song 10', 'Keys.wav'), 'RIFF');
  fs.writeFileSync(path.join(root, 'secret.wav'), 'RIFF');
  return root;
}

test('library lists song folders with audio, in natural order', () => {
  const songs = scanLibrary(makeLibrary());
  assert.deepEqual(songs.map((s) => s.name), ['Song 2', 'Song 10']);
  assert.deepEqual(songs[0].layers, [{ id: 'Pad.wav', name: 'Pad', file: 'Song 2/Pad.wav' }]);
});

test('server serves audio, UI and syncs state over WebSocket', async () => {
  const root = makeLibrary();
  const server = createServer({
    libraryRoot: root,
    uiRoot: path.join(__dirname, '..', 'ui'),
    port: 0,
    host: '127.0.0.1',
  });
  const port = await server.start();
  const base = `http://127.0.0.1:${port}`;
  try {
    const page = await fetch(base + '/');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Church Multitrack/);

    const audio = await fetch(base + '/audio/Song%202/Pad.wav');
    assert.equal(audio.status, 200);
    assert.equal(await audio.text(), 'RIFF');

    for (const bad of ['/audio/..%2F..%2Fetc%2Fpasswd', '/audio/Song%202/notes.txt', '/..%2Fpackage.json']) {
      assert.equal((await fetch(base + bad)).status, 404, bad);
    }

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const messages = [];
    const next = () =>
      new Promise((resolve) => {
        if (messages.length) return resolve(messages.shift());
        ws.once('message', () => resolve(messages.shift()));
      });
    ws.on('message', (d) => messages.push(JSON.parse(d.toString())));
    await new Promise((r) => ws.once('open', r));

    const first = await next();
    assert.equal(first.state.currentSongId, 'Song 2');
    assert.equal(first.info.libraryRoot, root);

    ws.send(JSON.stringify({ type: 'command', command: { type: 'play' } }));
    assert.equal((await next()).state.playing, true);
    assert.equal(server.getState().playing, true);

    fs.mkdirSync(path.join(root, 'Song 3'));
    fs.writeFileSync(path.join(root, 'Song 3', 'Bass.wav'), 'RIFF');
    ws.send(JSON.stringify({ type: 'rescan' }));
    assert.equal((await next()).state.songs.length, 3);
    ws.close();
  } finally {
    await server.stop();
  }
});
