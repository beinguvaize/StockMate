/**
 * StockMate — Electron main process.
 * Desktop wrapper around the Vite/React app.
 *  - dev:  loads the Vite dev server (http://localhost:5173)
 *  - prod: loads the built dist/index.html (file://)
 */
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

const isDev = !app.isPackaged;

let mainWindow = null;

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
    ])
  );

  createWindow();

  // Check GitHub Releases for updates (packaged builds only).
  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error('[auto-update] check failed:', err);
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
