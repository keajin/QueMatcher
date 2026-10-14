const path = require('node:path');

function createDisplayBoard({ BrowserWindow, screen, ipcMain, getOrganizer, root }) {
  let board = null, snapshot = null, revision = 0, screenId = null;
  const organizerOnly = event => {
    const organizer = getOrganizer();
    if (!organizer || organizer.isDestroyed() || event.sender !== organizer.webContents) throw new Error('Only the organizer can control the display board.');
  };
  const hasBoard = () => board && !board.isDestroyed();
  const screens = () => {
    const organizer = getOrganizer();
    const organizerScreen = screen.getDisplayMatching(organizer.getBounds());
    return screen.getAllDisplays().map((display, index) => ({
      id: display.id, label: display.label || `Display ${index + 1}`,
      width: display.size.width, height: display.size.height,
      organizerScreen: display.id === organizerScreen.id
    }));
  };
  const boundsFor = (display, fill) => {
    const bounds = display.workArea;
    if (fill) return { ...bounds };
    const width = Math.min(1200, bounds.width), height = Math.min(850, bounds.height);
    return { x: bounds.x + Math.round((bounds.width - width) / 2), y: bounds.y + Math.round((bounds.height - height) / 2), width, height };
  };

  ipcMain.handle('display:screens', event => { organizerOnly(event); return screens(); });
  ipcMain.on('display:publish', (event, value) => {
    const organizer = getOrganizer();
    if (!organizer || organizer.isDestroyed() || event.sender !== organizer.webContents) return;
    snapshot = { ...value, revision: ++revision };
    if (hasBoard()) board.webContents.send('display:update', snapshot);
  });
  ipcMain.handle('display:open', (event, options = {}) => {
    organizerOnly(event);
    const displays = screen.getAllDisplays();
    const selected = displays.find(display => display.id === options.screenId);
    if (!selected) throw new Error('That screen is no longer connected. Reopen display settings and select a screen.');
    screenId = selected.id;
    const bounds = boundsFor(selected, options.fill === true);
    if (hasBoard()) {
      if (board.isMinimized()) board.restore();
      board.setBounds(bounds);
      board.showInactive();
      return;
    }
    const created = new BrowserWindow({
      ...bounds, show: false, title: 'PairFect - Display board', backgroundColor: '#151e1a',
      webPreferences: { preload: path.join(root, 'desktop', 'display-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
    });
    board = created;
    created.removeMenu();
    created.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    created.webContents.on('will-navigate', event => event.preventDefault());
    created.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'Escape') { event.preventDefault(); created.close(); }
    });
    created.once('ready-to-show', () => { if (!created.isDestroyed()) created.showInactive(); });
    created.once('closed', () => { if (board === created) board = null; });
    created.loadFile(path.join(root, 'display.html'));
  });
  ipcMain.handle('display:state', event => {
    if (!hasBoard() || event.sender !== board.webContents) throw new Error('Only the display window can read its state.');
    return snapshot;
  });
  ipcMain.handle('display:close', event => { organizerOnly(event); if (hasBoard()) board.close(); });

  screen.on('display-removed', () => {
    if (!hasBoard() || screen.getAllDisplays().some(display => display.id === screenId)) return;
    const display = screen.getPrimaryDisplay();
    screenId = display.id;
    board.setBounds(boundsFor(display, false));
  });
  return { reset() { if (hasBoard()) board.destroy(); board = null; snapshot = null; revision = 0; } };
}

module.exports = { createDisplayBoard };
