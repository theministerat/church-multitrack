// Local web server: serves the control screen to the PC window and to tablets on the
// same network, streams audio files to the PC's audio engine, and keeps every screen in
// sync over a WebSocket. The state lives here; screens only send commands.

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { WebSocketServer } = require('ws');
const { createState, applyCommand, replaceSongs } = require('./state');
const { scanLibrary, resolveAudioPath } = require('./library');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
};

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) out.push(a.address);
    }
  }
  return out;
}

function createServer({ libraryRoot, uiRoot, port = 8420, host = '0.0.0.0' }) {
  let state = createState(scanLibrary(libraryRoot));
  const listeners = new Set();

  function info() {
    const actualPort = server.address() ? server.address().port : port;
    return {
      libraryRoot,
      remoteUrls: lanAddresses().map((ip) => `http://${ip}:${actualPort}/`),
    };
  }

  function broadcast() {
    const msg = JSON.stringify({ type: 'state', state, info: info() });
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(msg);
    }
    for (const fn of listeners) fn(state);
  }

  function dispatch(command) {
    const next = applyCommand(state, command);
    if (next !== state) {
      state = next;
      broadcast();
    }
    return state;
  }

  function rescan() {
    state = replaceSongs(state, scanLibrary(libraryRoot));
    broadcast();
    return state;
  }

  function sendFile(res, file) {
    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404).end('Not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': stat.size,
        'Cache-Control': 'no-cache',
      });
      fs.createReadStream(file).pipe(res);
    });
  }

  const server = http.createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch {
      res.writeHead(400).end('Bad request');
      return;
    }

    if (pathname.startsWith('/audio/')) {
      const file = resolveAudioPath(libraryRoot, pathname.slice('/audio/'.length));
      if (!file) {
        res.writeHead(404).end('Not found');
        return;
      }
      sendFile(res, file);
      return;
    }

    const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = path.resolve(uiRoot, rel);
    if (!file.startsWith(path.resolve(uiRoot) + path.sep)) {
      res.writeHead(404).end('Not found');
      return;
    }
    sendFile(res, file);
  });

  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'state', state, info: info() }));
    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (msg.type === 'command') dispatch(msg.command);
      else if (msg.type === 'rescan') rescan();
    });
  });

  return {
    start() {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => resolve(server.address().port));
      });
    },
    stop() {
      for (const client of wss.clients) client.terminate();
      return new Promise((resolve) => server.close(() => resolve()));
    },
    dispatch,
    rescan,
    getState: () => state,
    onChange: (fn) => listeners.add(fn),
    info,
  };
}

module.exports = { createServer };
