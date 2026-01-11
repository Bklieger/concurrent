const { contextBridge, ipcRenderer } = require('electron');

/**
 * Expose a safe API to the renderer process
 * This follows Electron security best practices by using contextBridge
 */
contextBridge.exposeInMainWorld('terminalAPI', {
  // Create a new terminal session
  create: () => ipcRenderer.invoke('terminal:create'),

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

