// Scans the songs folder. Each subfolder is a song and each audio file in it is a layer:
//
//   Songs/
//     Ambient Pad in C/
//       Pad.wav
//       Keys.wav

const fs = require('fs');
const path = require('path');

const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.ogg', '.flac', '.m4a']);

function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function scanLibrary(root) {
  if (!fs.existsSync(root)) return [];
  const songs = [];
  const songDirs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => d.name)
    .sort(naturalCompare);

  for (const dir of songDirs) {
    const files = fs
      .readdirSync(path.join(root, dir), { withFileTypes: true })
      .filter((f) => f.isFile() && AUDIO_EXTENSIONS.has(path.extname(f.name).toLowerCase()))
      .map((f) => f.name)
      .sort(naturalCompare);
    if (!files.length) continue;
    songs.push({
      id: dir,
      name: dir,
      layers: files.map((file) => ({
        id: file,
        name: path.basename(file, path.extname(file)),
        file: `${dir}/${file}`,
      })),
    });
  }
  return songs;
}

// Resolve a relative audio path from a URL, refusing anything outside the library root.
function resolveAudioPath(root, relPath) {
  const full = path.resolve(root, relPath);
  const base = path.resolve(root) + path.sep;
  if (!full.startsWith(base)) return null;
  if (!AUDIO_EXTENSIONS.has(path.extname(full).toLowerCase())) return null;
  return full;
}

module.exports = { scanLibrary, resolveAudioPath, AUDIO_EXTENSIONS };
