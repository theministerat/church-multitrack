// Control screen. The same page runs in the PC window (which also plays the audio) and in
// a tablet's browser (remote only). Every screen sends commands and redraws from the state
// the server broadcasts, so they always agree.

import { createEngine } from './engine.js';

const isHost = !!(window.host && window.host.isHost);
document.body.classList.toggle('is-host', isHost);

const $ = (id) => document.getElementById(id);
const el = {
  play: $('play'),
  stop: $('stop'),
  master: $('master'),
  conn: $('conn'),
  songList: $('song-list'),
  empty: $('empty-library'),
  rescan: $('rescan'),
  openFolder: $('open-folder'),
  title: $('song-title'),
  status: $('status'),
  layers: $('layers'),
  remoteInfo: $('remote-info'),
  fade: $('fade'),
  startAudio: $('start-audio'),
};

let state = null;
let ws = null;
let engineStatus = {};

const engine = isHost
  ? createEngine({
      onStatus: (s) => {
        engineStatus = s;
        renderStatus();
      },
    })
  : null;

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}
const command = (c) => send({ type: 'command', command: c });

function connect() {
  ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onopen = () => el.conn.classList.remove('down');
  ws.onclose = () => {
    el.conn.classList.add('down');
    setTimeout(connect, 1000);
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type !== 'state') return;
    state = msg.state;
    if (engine) {
      engine.apply(state);
      engine.preload(currentSong());
    }
    render(msg.info);
  };
}

function currentSong() {
  return state && state.songs.find((s) => s.id === state.currentSongId);
}

function layerMix(songId, layerId) {
  const m = (state.mix[songId] || {})[layerId];
  return m || { on: true, volume: 0.8 };
}

// Don't move a slider out from under someone's finger.
function setSlider(input, value) {
  if (document.activeElement !== input) input.value = value;
}

function render(info) {
  const song = currentSong();

  el.play.classList.toggle('active', state.playing);
  setSlider(el.master, state.master);
  el.fade.value = String(state.fadeSeconds);

  if (info) {
    el.remoteInfo.textContent = info.remoteUrls.length
      ? `Tablet remote: ${info.remoteUrls.join('  or  ')}`
      : 'Tablet remote: connect this PC to Wi-Fi or a network to use a tablet.';
  }

  // Song list
  el.empty.hidden = state.songs.length > 0;
  el.songList.replaceChildren(
    ...state.songs.map((s) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.className = s.id === state.currentSongId ? 'current' : '';
      b.textContent = s.name;
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = `${s.layers.length}`;
      b.append(count);
      b.onclick = () => command({ type: 'selectSong', songId: s.id });
      li.append(b);
      return li;
    })
  );

  el.title.textContent = song ? song.name : '—';
  renderLayers(song);
  renderStatus();
}

function renderLayers(song) {
  if (!song) {
    el.layers.replaceChildren();
    return;
  }
  // Reuse tiles while the song is unchanged so sliders keep focus during drags.
  if (el.layers.dataset.songId !== song.id) {
    el.layers.dataset.songId = song.id;
    el.layers.replaceChildren(...song.layers.map((l) => buildLayer(song, l)));
  }
  for (const tile of el.layers.children) {
    const m = layerMix(song.id, tile.dataset.layerId);
    tile.classList.toggle('on', m.on);
    const input = tile.querySelector('input');
    setSlider(input, m.volume);
    tile.querySelector('.vol span').textContent = Math.round(m.volume * 100);
  }
}

function buildLayer(song, layer) {
  const tile = document.createElement('div');
  tile.className = 'layer';
  tile.dataset.layerId = layer.id;

  const toggle = document.createElement('button');
  toggle.className = 'toggle';
  toggle.textContent = layer.name;
  toggle.onclick = () => command({ type: 'toggleLayer', songId: song.id, layerId: layer.id });

  const vol = document.createElement('label');
  vol.className = 'vol';
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = '1';
  input.step = '0.01';
  input.oninput = () =>
    command({ type: 'setLayer', songId: song.id, layerId: layer.id, volume: Number(input.value) });
  input.onchange = () => input.blur();
  const readout = document.createElement('span');
  vol.append('Vol', input, readout);

  tile.append(toggle, vol);
  return tile;
}

function renderStatus() {
  if (!state) return;
  el.status.classList.toggle('error', !!engineStatus.error);
  if (engineStatus.error) el.status.textContent = engineStatus.error;
  else if (engineStatus.loading) el.status.textContent = 'Loading…';
  else el.status.textContent = state.playing ? 'Playing' : 'Stopped';
}

el.play.onclick = () => {
  if (engine) engine.resume();
  command({ type: 'play' });
};
el.stop.onclick = () => command({ type: 'stop' });
el.master.oninput = () => command({ type: 'setMaster', volume: Number(el.master.value) });
el.master.onchange = () => el.master.blur();
el.fade.onchange = () => command({ type: 'setFade', seconds: Number(el.fade.value) });
el.rescan.onclick = () => send({ type: 'rescan' });
el.openFolder.onclick = () => window.host && window.host.openLibraryFolder();

// Electron allows audio without a click, but show a button just in case it is blocked.
if (engine) {
  setTimeout(async () => {
    await engine.resume().catch(() => {});
    if (engine.isSuspended()) {
      el.startAudio.hidden = false;
      el.startAudio.onclick = async () => {
        await engine.resume();
        el.startAudio.hidden = true;
      };
    }
  }, 500);
}

connect();
