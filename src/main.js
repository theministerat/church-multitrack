// Electron entry point: starts the local server and opens the control window, which also
// runs the audio engine. Tablets open the same screen in a browser but never play audio.

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { createServer } = require('./server');

const PORT = 8420;
const libraryRoot = path.join(app.getPath('documents'), 'Church Multitrack', 'Songs');

let server;
let win;

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

async function startServer() {
  fs.mkdirSync(libraryRoot, { recursive: true });
  server = createServer({ libraryRoot, uiRoot: path.join(__dirname, '..', 'ui'), port: PORT });
  try {
    return await server.start();
  } catch (err) {
    dialog.showErrorBox(
      'Church Multitrack',
      `Could not start on port ${PORT}. Is another copy of the app already running?\n\n${err.message}`
    );
    app.quit();
    return null;
  }
}

function createWindow(port) {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#111317',
    title: 'Church Multitrack',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false,
    },
  });
  win.loadURL(`http://127.0.0.1:${port}/`);
  win.on('closed', () => {
    win = null;
  });
}

ipcMain.handle('open-library-folder', () => shell.openPath(libraryRoot));

app.whenReady().then(async () => {
  const port = await startServer();
  if (port) createWindow(port);
});

app.on('window-all-closed', async () => {
  if (server) await server.stop();
  app.quit();
});
