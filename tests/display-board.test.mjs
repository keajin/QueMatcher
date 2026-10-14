import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
const { createDisplayBoard } = createRequire(import.meta.url)('../desktop/display-board.cjs');

function fixture() {
  const windows = [];
  class FakeWindow extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.actions = []; this.destroyed = false;
      this.webContents = new EventEmitter(); this.webContents.sent = [];
      this.webContents.send = (...args) => this.webContents.sent.push(args);
      this.webContents.setWindowOpenHandler = () => {};
      windows.push(this);
    }
    removeMenu() {}
    loadFile(file) { this.file = file; }
    isDestroyed() { return this.destroyed; }
    isMinimized() { return false; }
    setBounds(bounds) { this.actions.push(['bounds', bounds]); }
    showInactive() { this.actions.push(['showInactive']); }
    close() { this.destroy(); }
    destroy() { this.destroyed = true; this.emit('closed'); }
  }
  const organizer = { webContents: {}, isDestroyed: () => false, getBounds: () => ({ x: 0, y: 0, width: 1200, height: 800 }) };
  const ipcMain = new EventEmitter(); ipcMain.handlers = new Map(); ipcMain.handle = (name, handler) => ipcMain.handlers.set(name, handler);
  const screen = new EventEmitter();
  screen.displays = [
    { id: 1, label: 'Laptop', size: { width: 1440, height: 900 }, workArea: { x: 0, y: 25, width: 1440, height: 875 } },
    { id: 2, label: 'External', size: { width: 1920, height: 1080 }, workArea: { x: 1440, y: 0, width: 1920, height: 1080 } }
  ];
  screen.getAllDisplays = () => screen.displays;
  screen.getDisplayMatching = () => screen.displays[0];
  screen.getPrimaryDisplay = () => screen.displays[0];
  const controller = createDisplayBoard({ BrowserWindow: FakeWindow, screen, ipcMain, getOrganizer: () => organizer, root: '/app' });
  const invoke = (name, sender, ...args) => ipcMain.handlers.get(name)({ sender }, ...args);
  return { controller, organizer, windows, screen, ipcMain, invoke };
}

test('board opens on the selected external screen without focusing the organizer', () => {
  const { organizer, windows, invoke } = fixture();
  assert.equal(invoke('display:screens', organizer.webContents)[1].organizerScreen, false);
  invoke('display:open', organizer.webContents, { screenId: 2, fill: true });
  const board = windows[0];
  assert.equal(board.options.x, 1440);
  assert.equal(board.options.width, 1920);
  assert.equal(board.options.show, false);
  assert.match(board.options.webPreferences.preload, /display-preload/);
  board.emit('ready-to-show');
  assert.deepEqual(board.actions, [['showInactive']]);
  invoke('display:open', organizer.webContents, { screenId: 2, fill: true });
  assert.equal(windows.length, 1);
});

test('updates have revisions and only the organizer can publish or control the board', () => {
  const { organizer, windows, ipcMain, invoke } = fixture();
  ipcMain.emit('display:publish', { sender: organizer.webContents }, { configurationName: 'Club' });
  invoke('display:open', organizer.webContents, { screenId: 2 });
  const board = windows[0];
  assert.equal(invoke('display:state', board.webContents).revision, 1);
  ipcMain.emit('display:publish', { sender: board.webContents }, { configurationName: 'Unauthorized' });
  assert.equal(invoke('display:state', board.webContents).configurationName, 'Club');
  assert.throws(() => invoke('display:close', board.webContents), /Only the organizer/);
  ipcMain.emit('display:publish', { sender: organizer.webContents }, { configurationName: 'Updated' });
  assert.equal(board.webContents.sent.at(-1)[1].revision, 2);
  assert.deepEqual(board.actions, []);
});

test('disconnecting the selected monitor returns the board to a connected screen', () => {
  const { organizer, windows, screen, invoke } = fixture();
  invoke('display:open', organizer.webContents, { screenId: 2, fill: true });
  screen.displays = [screen.displays[0]];
  screen.emit('display-removed');
  assert.equal(windows[0].actions[0][1].x, 120);
  assert.throws(() => invoke('display:open', organizer.webContents, { screenId: 2 }), /no longer connected/);
});

test('closing the board retains the session snapshot; resetting closes it and clears it', () => {
  const { controller, organizer, windows, ipcMain, invoke } = fixture();
  ipcMain.emit('display:publish', { sender: organizer.webContents }, { configurationName: 'Club' });
  invoke('display:open', organizer.webContents, { screenId: 2 });
  invoke('display:close', organizer.webContents);
  assert.equal(windows[0].destroyed, true);
  invoke('display:open', organizer.webContents, { screenId: 2 });
  assert.equal(invoke('display:state', windows[1].webContents).configurationName, 'Club');
  controller.reset();
  assert.equal(windows[1].destroyed, true);
  invoke('display:open', organizer.webContents, { screenId: 2 });
  assert.equal(invoke('display:state', windows[2].webContents), null);
});
