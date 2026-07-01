/**
 * StockMate — Electron preload.
 * Exposes a minimal, safe API to the renderer:
 *  - isElectron flag (used to pick HashRouter over BrowserRouter)
 *  - updates: manual check, install, and status subscription
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  isElectron: true,
  platform: process.platform,
  updates: {
    check:   () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    onStatus: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on('update:status', handler);
      return () => ipcRenderer.removeListener('update:status', handler);
    },
  },
  window: {
    setKiosk: (enabled) => ipcRenderer.invoke('window:setKiosk', enabled),
    onKioskChange: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on('window:kioskChange', handler);
      return () => ipcRenderer.removeListener('window:kioskChange', handler);
    },
  },
});
