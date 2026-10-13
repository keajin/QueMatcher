const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

let window;
let confirmedClose = false;
let saveQueue = Promise.resolve();
const configPath = () => path.join(app.getPath('userData'), 'setup.json');

app.whenReady().then(() => {
  ipcMain.handle('setup:load', async () => {
    try {
      return JSON.parse(await fs.readFile(configPath(), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return { players: [], courts: [] };
      throw new Error('Saved setup could not be read. Your existing file has not been changed.');
    }
  });
  ipcMain.handle('setup:save', async (_event, value) => {
    const { normalizeSetup } = await import('../src/model.js');
    const data = normalizeSetup(value);
    if (JSON.stringify(data) !== JSON.stringify(value)) throw new Error('Invalid setup data.');
    const operation = saveQueue.catch(() => {}).then(async () => {
      await fs.mkdir(app.getPath('userData'), { recursive: true });
      const temporaryPath = `${configPath()}.tmp`;
      await fs.writeFile(temporaryPath, JSON.stringify(data, null, 2), 'utf8');
      await fs.rename(temporaryPath, configPath());
    });
    saveQueue = operation;
    await operation;
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
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
  window.on('close', event => {
    if (confirmedClose) return;
    event.preventDefault();
    const answer = dialog.showMessageBoxSync(window, {
      type: 'warning', title: 'Close QueMatcher?',
      message: 'Closing will clear the current queue.',
      detail: 'Attendance, active matches, and timers will also be cleared. Your saved player roster and court settings will be kept.',
      buttons: ['Keep organizing', 'Close app'], defaultId: 0, cancelId: 0, noLink: true
    });
    if (answer === 1) {
      saveQueue.then(() => { confirmedClose = true; window.close(); }).catch(() => {
        dialog.showMessageBoxSync(window, { type: 'error', message: 'Your latest setup changes could not be saved.', detail: 'Keep the app open and try saving again.' });
      });
    }
  });
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
