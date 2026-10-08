// Audio engine. Runs only in the PC window and follows the shared state: it never
// decides anything itself, so MIDI cues and the tablet reach the audio the same way.

export function createEngine({ onStatus = () => {} } = {}) {
  const ctx = new AudioContext({ latencyHint: 'playback' });
  const masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);

  const buffers = new Map(); // file -> Promise<AudioBuffer>
  let session = null; // { songId, out, layers: Map<layerId, { gain, source, on }> }
  let lastMaster = null;

  function loadBuffer(file) {
    if (!buffers.has(file)) {
      const url = '/audio/' + file.split('/').map(encodeURIComponent).join('/');
      const p = fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`${r.status} loading ${file}`);
          return r.arrayBuffer();
        })
        .then((data) => ctx.decodeAudioData(data));
      p.catch(() => buffers.delete(file));
      buffers.set(file, p);
    }
    return buffers.get(file);
  }

  function ramp(param, target, seconds) {
    const now = ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(target, now + Math.max(0.02, seconds));
  }

  function layerTarget(state, songId, layerId) {
    const m = (state.mix[songId] || {})[layerId];
    const on = m ? m.on : true;
    const volume = m ? m.volume : 0.8;
    return { on, gain: on ? volume : 0 };
  }

  function fadeOutSession(s, seconds) {
    if (!s) return;
    ramp(s.out.gain, 0, seconds);
    const stopAt = ctx.currentTime + Math.max(0.02, seconds) + 0.05;
    for (const layer of s.layers.values()) {
      if (layer.source) layer.source.stop(stopAt);
    }
    setTimeout(() => s.out.disconnect(), (seconds + 0.5) * 1000);
  }

  async function startSession(state, song) {
    const s = { songId: song.id, out: ctx.createGain(), layers: new Map(), ready: false };
    s.out.connect(masterGain);
    session = s;
    onStatus({ loading: true, songId: song.id });

    let loaded;
    try {
      loaded = await Promise.all(song.layers.map((l) => loadBuffer(l.file).then((b) => [l, b])));
    } catch (err) {
      onStatus({ loading: false, error: `Could not load "${song.name}": ${err.message}` });
      if (session === s) session = null;
      s.out.disconnect();
      return;
    }
    if (session !== s) {
      // Superseded by a stop or another song while loading.
      s.out.disconnect();
      return;
    }

    await ctx.resume();
    const startAt = ctx.currentTime + 0.1;
    for (const [layer, buffer] of loaded) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(s.out);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gain);
      source.start(startAt);
      s.layers.set(layer.id, { gain, source, on: false });
    }
    s.ready = true;
    onStatus({ loading: false, songId: song.id });
    applyLayers(latest, true);
  }

  function applyLayers(state, fadeIn) {
    if (!session || !session.ready) return;
    for (const [layerId, layer] of session.layers) {
      const t = layerTarget(state, session.songId, layerId);
      // Switching a layer on or off fades; moving a volume slider follows quickly.
      const seconds = fadeIn || t.on !== layer.on ? state.fadeSeconds : 0.08;
      ramp(layer.gain.gain, t.gain, seconds);
      layer.on = t.on;
    }
  }

  let latest = null;

  function apply(state) {
    latest = state;
    if (state.master !== lastMaster) {
      ramp(masterGain.gain, state.master, 0.08);
      lastMaster = state.master;
    }

    const song = state.songs.find((s) => s.id === state.currentSongId);
    if (state.playing && song) {
      if (!session || session.songId !== song.id) {
        fadeOutSession(session, state.fadeSeconds);
        session = null;
        startSession(state, song);
      } else {
        applyLayers(state, false);
      }
    } else if (session) {
      fadeOutSession(session, state.fadeSeconds);
      session = null;
      onStatus({ loading: false });
    }
  }

  // Start decoding a song before it is played so the cue starts on time.
  function preload(song) {
    if (song) song.layers.forEach((l) => loadBuffer(l.file).catch(() => {}));
  }

  return { apply, preload, resume: () => ctx.resume(), isSuspended: () => ctx.state !== 'running' };
}
