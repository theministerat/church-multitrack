// Marks the PC window as the audio host. Tablets load the same page without this bridge.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('host', {
  isHost: true,
  openLibraryFolder: () => ipcRenderer.invoke('open-library-folder'),
});
