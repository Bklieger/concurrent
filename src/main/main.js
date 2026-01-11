const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const PtyManager = require('./pty-manager');

class Application {
  constructor() {
    this.mainWindow = null;
    this.ptyManager = new PtyManager();
  }

  createWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 600,
      minHeight: 400,
      backgroundColor: '#1a1b26',
      webPreferences: {
        preload: path.join(__dirname, '../preload/preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
      this.ptyManager.disposeAll();
    });
  }

  setupIpcHandlers() {
    // Create a new terminal session
    ipcMain.handle('terminal:create', () => {
      const id = this.ptyManager.create();
      return id;
    });

    // Write data to a terminal
    ipcMain.on('terminal:write', (event, { id, data }) => {
      this.ptyManager.write(id, data);
    });

    // Resize a terminal
    ipcMain.on('terminal:resize', (event, { id, cols, rows }) => {
      this.ptyManager.resize(id, cols, rows);
    });

    // Close a terminal
    ipcMain.handle('terminal:close', (event, id) => {
      this.ptyManager.dispose(id);
      return true;
    });

    // Forward PTY output to renderer
    this.ptyManager.on('data', (id, data) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('terminal:data', { id, data });
      }
    });

    // Notify renderer when PTY exits
    this.ptyManager.on('exit', (id, exitCode) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('terminal:exit', { id, exitCode });
      }
    });
  }

  init() {
    app.whenReady().then(() => {
      this.setupIpcHandlers();
      this.createWindow();

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          this.createWindow();
        }
      });
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });
  }
}

const application = new Application();
application.init();

