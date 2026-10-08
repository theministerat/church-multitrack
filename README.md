# Church Multitrack

Background music player for church services, driven by MIDI cues from Proclaim.
It plays layered loops on the church PC, and anyone on the same Wi-Fi can control it
from a tablet's browser.

## Installing

Every change builds a Windows installer automatically. Open the repository's **Actions**
tab, pick the latest green **Build** run, and download **Church-Multitrack-Setup** from the
bottom of the page. Unzip it and run the installer. Windows may warn that the app is from
an unknown publisher, because it isn't code-signed yet; choose **More info → Run anyway**.

The first time it starts, Windows Firewall asks whether to allow it on the network. Allow
it on **private networks** so the tablet can connect.

## Adding songs

The app creates `Documents\Church Multitrack\Songs`. Make one folder per song and put
that song's loops inside it. Each audio file becomes a layer, named after the file:

```
Songs\
  Ambient Pad in C\
    Pad.wav
    Keys.wav
    Strings.wav
```

WAV, MP3, OGG, FLAC and M4A all work. Press **Refresh** in the app after adding songs.

## Using it

- Pick a song on the left, then press **Play**. All layers loop together.
- Tap a layer to fade it in or out. The fade length is set at the bottom right.
- Choosing another song while playing crossfades to it.
- **Stop** fades everything out.

## Tablet remote

The bottom of the PC window shows an address like `http://192.168.1.20:8420/`. Open it
in Chrome on any tablet or phone on the same network. The tablet shows the same screen and
stays in sync with the PC; audio always plays from the PC.

## Developing

```
npm install
npm start      # run the app
npm test       # run the tests
npm run dist   # build the Windows installer (on Windows)
```

- `src/state.js` holds the player state and every command that changes it.
- `src/server.js` serves the screen, streams audio and keeps screens in sync.
- `src/main.js` is the Electron entry point.
- `ui/` is the control screen; `ui/engine.js` is the audio engine, which runs only in the PC window.
