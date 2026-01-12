const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const PtyManager = require('./pty-manager');
const GitManager = require('./git-manager');

class Application {
  constructor() {
    this.mainWindow = null;
    this.ptyManager = new PtyManager();
    this.gitManager = new GitManager();
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

    // Open dev tools in development
    this.mainWindow.webContents.openDevTools();

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
      this.ptyManager.disposeAll();
    });
  }

  setupIpcHandlers() {
    // Create a new terminal session
    ipcMain.handle('terminal:create', (event, options) => {
      const id = this.ptyManager.create(options);
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

    // Git worktree management
    ipcMain.handle('git:ensure-base-repo', async (event, { owner, repo }) => {
      try {
        const path = await this.gitManager.ensureBaseRepo(owner, repo);
        return { success: true, path };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('git:create-worktree', async (event, { baseRepoPath, branchName }) => {
      try {
        const path = await this.gitManager.createWorktree(baseRepoPath, branchName);
        return { success: true, path };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('git:list-worktrees', async (event, { baseRepoPath }) => {
      try {
        const worktrees = await this.gitManager.listWorktrees(baseRepoPath);
        return { success: true, worktrees };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('git:remove-worktree', async (event, { worktreePath }) => {
      try {
        await this.gitManager.removeWorktree(worktreePath);
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('git:get-worktree-status', async (event, { worktreePath }) => {
      try {
        const changes = await this.gitManager.getWorktreeStatus(worktreePath);
        return { success: true, changes };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // List all worktrees across all repos in ~/.concurrent
    ipcMain.handle('git:list-all-worktrees', async () => {
      try {
        const worktrees = await this.gitManager.listAllWorktrees();
        return { success: true, worktrees };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // Safely remove a worktree (only inside ~/.concurrent)
    ipcMain.handle('git:safe-remove-worktree', async (event, { worktreePath }) => {
      try {
        await this.gitManager.safeRemoveWorktree(worktreePath);
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
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

