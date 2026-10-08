// Shared player state and the commands that change it.
// Kept free of Electron and audio code so it can be tested on its own and
// driven later by MIDI cues and the tablet remote alike.

const DEFAULT_VOLUME = 0.8;

function createState(songs = []) {
  return {
    songs,
    currentSongId: songs[0] ? songs[0].id : null,
    playing: false,
    master: 1,
    fadeSeconds: 2,
    // mix[songId][layerId] = { on, volume }
    mix: {},
  };
}

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return Math.min(1, Math.max(0, v));
}

function findSong(state, songId) {
  return state.songs.find((s) => s.id === songId) || null;
}

function getLayerMix(state, songId, layerId) {
  const m = state.mix[songId] && state.mix[songId][layerId];
  return m || { on: true, volume: DEFAULT_VOLUME };
}

function withLayerMix(state, songId, layerId, patch) {
  const songMix = { ...(state.mix[songId] || {}) };
  songMix[layerId] = { ...getLayerMix(state, songId, layerId), ...patch };
  return { ...state, mix: { ...state.mix, [songId]: songMix } };
}

function hasLayer(state, songId, layerId) {
  const song = findSong(state, songId);
  return !!(song && song.layers.some((l) => l.id === layerId));
}

// Returns the new state, or the same object when the command changes nothing.
function applyCommand(state, cmd) {
  if (!cmd || typeof cmd.type !== 'string') return state;
  const songId = cmd.songId || state.currentSongId;

  switch (cmd.type) {
    case 'selectSong':
      if (!findSong(state, cmd.songId) || cmd.songId === state.currentSongId) return state;
      return { ...state, currentSongId: cmd.songId };

    case 'play':
      if (!state.currentSongId || state.playing) return state;
      return { ...state, playing: true };

    case 'stop':
      if (!state.playing) return state;
      return { ...state, playing: false };

    case 'toggleLayer': {
      if (!hasLayer(state, songId, cmd.layerId)) return state;
      const { on } = getLayerMix(state, songId, cmd.layerId);
      return withLayerMix(state, songId, cmd.layerId, { on: !on });
    }

    case 'setLayer': {
      if (!hasLayer(state, songId, cmd.layerId)) return state;
      const patch = {};
      if (typeof cmd.on === 'boolean') patch.on = cmd.on;
      if (cmd.volume !== undefined) {
        const v = clamp01(cmd.volume);
        if (v !== null) patch.volume = v;
      }
      if (!Object.keys(patch).length) return state;
      return withLayerMix(state, songId, cmd.layerId, patch);
    }

    case 'setMaster': {
      const v = clamp01(cmd.volume);
      if (v === null) return state;
      return { ...state, master: v };
    }

    case 'setFade': {
      const s = Number(cmd.seconds);
      if (!Number.isFinite(s)) return state;
      return { ...state, fadeSeconds: Math.min(10, Math.max(0, s)) };
    }

    default:
      return state;
  }
}

// Swap in a freshly scanned song list, keeping the mix and selection where possible.
function replaceSongs(state, songs) {
  const stillThere = songs.some((s) => s.id === state.currentSongId);
  const currentSongId = stillThere ? state.currentSongId : songs[0] ? songs[0].id : null;
  return {
    ...state,
    songs,
    currentSongId,
    playing: stillThere ? state.playing : false,
  };
}

module.exports = { createState, applyCommand, replaceSongs, getLayerMix, DEFAULT_VOLUME };
