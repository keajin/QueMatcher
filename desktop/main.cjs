const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const { createDisplayBoard } = require('./display-board.cjs');
const path = require('node:path');

let window;
let confirmedClose = false;
let saveQueue = Promise.resolve();
let displayBoard;
const configPath = () => path.join(app.getPath('userData'), 'setup.json');

app.whenReady().then(async () => {
  const { createSetupStorage } = await import('./setup-storage.js');
  const storage = createSetupStorage(configPath());
  ipcMain.handle('setup:capabilities', () => ({ configurationVersion: 1 }));
  ipcMain.handle('setup:load', () => storage.load());
  ipcMain.handle('setup:save', async (_event, value) => {
    const operation = storage.save(value);
    saveQueue = operation;
    await operation;
  });
  displayBoard = createDisplayBoard({ BrowserWindow, screen, ipcMain, getOrganizer: () => window, root: path.join(__dirname, '..') });
  createWindow();
  app.on('activate', () => { if (!window || window.isDestroyed()) createWindow(); });
});

function createWindow() {
  confirmedClose = false;
  window = new BrowserWindow({
    width: 1440, height: 950, minWidth: 900, minHeight: 650,
    backgroundColor: '#f5f5ee', title: 'QueMatcher',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  window.removeMenu();
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.loadFile(path.join(__dirname, '..', 'index.html'));
  window.on('closed', () => { displayBoard.reset(); window = null; });
  window.on('close', event => {
    if (confirmedClose) return;
    event.preventDefault();
    const answer = dialog.showMessageBoxSync(window, {
      type: 'warning', title: 'Close QueMatcher?',
      message: 'Closing will clear the current queue.',
      detail: 'Attendance, active matches, timers, and match history will also be cleared. Your saved player roster and court settings will be kept.',
      buttons: ['Keep organizing', 'Close app'], defaultId: 0, cancelId: 0, noLink: true
    });
    if (answer === 1) {
      saveQueue.then(() => { confirmedClose = true; window.close(); }).catch(() => {
        const discard = dialog.showMessageBoxSync(window, {
          type: 'warning', title: 'Close without saving?',
          message: 'Your latest setup changes could not be saved.',
          detail: 'Closing will discard the failed changes and clear this session. Previously saved players, courts, and configurations will be kept.',
          buttons: ['Keep organizing', 'Close without saving'], defaultId: 0, cancelId: 0, noLink: true
        });
        if (discard === 1) { confirmedClose = true; window.close(); }
      });
    }
  });
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
