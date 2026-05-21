/**
 * StockMate — Electron main process.
 * Desktop wrapper around the Vite/React app.
 *  - dev:  loads the Vite dev server (http://localhost:5173)
 *  - prod: loads the built dist/index.html (file://)
 */
const { app, BrowserWindow, shell, Menu, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

const isDev = !app.isPackaged;

let mainWindow = null;

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

/* ── Update status → renderer ──────────────────────────────────────────── */
function sendStatus(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:status', payload);
  }
}

autoUpdater.on('checking-for-update', () => sendStatus({ state: 'checking' }));
autoUpdater.on('update-available',     (i) => sendStatus({ state: 'available', version: i.version }));
autoUpdater.on('update-not-available', () => sendStatus({ state: 'none' }));
autoUpdater.on('download-progress',    (p) => sendStatus({ state: 'downloading', percent: Math.round(p.percent) }));
autoUpdater.on('update-downloaded',    (i) => sendStatus({ state: 'downloaded', version: i.version }));
autoUpdater.on('error',                (e) => sendStatus({ state: 'error', message: String(e && e.message || e) }));

function checkForUpdates() {
  if (isDev) { sendStatus({ state: 'dev' }); return; }
  autoUpdater.checkForUpdates().catch((err) => {
    sendStatus({ state: 'error', message: String(err && err.message || err) });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#f4f4f0',
    show: false,
    title: 'StockMate',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // External links (target=_blank, window.open) open in the default browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Block in-app navigation away from the bundled app.
  mainWindow.webContents.on('will-navigate', (e, url) => {
    const devOrigin = 'http://localhost:5173';
    if (isDev && url.startsWith(devOrigin)) return;
    if (!isDev && url.startsWith('file://')) return;
    e.preventDefault();
    if (url.startsWith('http')) shell.openExternal(url);
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
      { role: 'fileMenu' },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
      {
        label: 'Help',
        submenu: [
          { label: 'Check for Updates…', click: () => checkForUpdates() },
        ],
      },
    ])
  );

  createWindow();

  // Check GitHub Releases for updates on launch (packaged builds only).
  if (!isDev) checkForUpdates();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/* ── IPC: renderer-triggered update actions ────────────────────────────── */
ipcMain.handle('update:check', () => { checkForUpdates(); return true; });
ipcMain.handle('update:install', () => { autoUpdater.quitAndInstall(); });
