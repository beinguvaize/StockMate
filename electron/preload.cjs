/**
 * StockMate — Electron preload.
 * Exposes a minimal, safe flag so the renderer can detect it runs
 * inside Electron (used to pick HashRouter over BrowserRouter).
 */
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  isElectron: true,
  platform: process.platform,
});
