const { contextBridge, ipcRenderer } = require('electron');

/**
 * Expose a safe API to the renderer process
 * This follows Electron security best practices by using contextBridge
 */
contextBridge.exposeInMainWorld('terminalAPI', {
  // Create a new terminal session
  create: (options) => ipcRenderer.invoke('terminal:create', options),

  // Write data to a terminal
  write: (id, data) => ipcRenderer.send('terminal:write', { id, data }),

  // Resize a terminal
  resize: (id, cols, rows) => ipcRenderer.send('terminal:resize', { id, cols, rows }),

  // Close a terminal
  close: (id) => ipcRenderer.invoke('terminal:close', id),

  // Listen for terminal data
  onData: (callback) => {
    const handler = (event, { id, data }) => callback(id, data);
    ipcRenderer.on('terminal:data', handler);
    return () => ipcRenderer.removeListener('terminal:data', handler);
  },

  // Listen for terminal exit
  onExit: (callback) => {
    const handler = (event, { id, exitCode }) => callback(id, exitCode);
    ipcRenderer.on('terminal:exit', handler);
    return () => ipcRenderer.removeListener('terminal:exit', handler);
  },
});

/**
 * Expose Git worktree management API
 */
contextBridge.exposeInMainWorld('gitAPI', {
  // Ensure base repository exists
  ensureBaseRepo: (owner, repo) =>
    ipcRenderer.invoke('git:ensure-base-repo', { owner, repo }),

  // Create a new worktree
  createWorktree: (baseRepoPath, branchName) =>
    ipcRenderer.invoke('git:create-worktree', { baseRepoPath, branchName }),

  // List all worktrees
  listWorktrees: (baseRepoPath) =>
    ipcRenderer.invoke('git:list-worktrees', { baseRepoPath }),

  // Remove a worktree
  removeWorktree: (worktreePath) =>
    ipcRenderer.invoke('git:remove-worktree', { worktreePath }),

  // Get worktree git status
  getWorktreeStatus: (worktreePath) =>
    ipcRenderer.invoke('git:get-worktree-status', { worktreePath }),

  // List all worktrees across all repos in ~/.concurrent
  listAllWorktrees: () =>
    ipcRenderer.invoke('git:list-all-worktrees'),

  // Safely remove a worktree (only inside ~/.concurrent)
  safeRemoveWorktree: (worktreePath) =>
    ipcRenderer.invoke('git:safe-remove-worktree', { worktreePath }),
});

