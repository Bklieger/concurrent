const os = require('os');
const pty = require('node-pty');
const EventEmitter = require('events');

/**
 * Manages multiple PTY (pseudo-terminal) instances
 * Handles creation, data flow, resizing, and cleanup
 */
class PtyManager extends EventEmitter {
  constructor() {
    super();
    this.terminals = new Map();
    this.idCounter = 0;
  }

  /**
   * Get the default shell for the current platform
   */
  getDefaultShell() {
    if (process.platform === 'win32') {
      return process.env.COMSPEC || 'cmd.exe';
    }
    return process.env.SHELL || '/bin/bash';
  }

  /**
   * Create a new terminal instance
   * @returns {string} The terminal ID
   */
  create() {
    const id = `term-${++this.idCounter}`;
    const shell = this.getDefaultShell();

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: os.homedir(),
      env: process.env,
    });

    // Forward data from PTY to the event system
    ptyProcess.onData((data) => {
      this.emit('data', id, data);
    });

    // Handle PTY exit
    ptyProcess.onExit(({ exitCode }) => {
      this.emit('exit', id, exitCode);
      this.terminals.delete(id);
    });

    this.terminals.set(id, ptyProcess);
    return id;
  }

  /**
   * Write data to a terminal
   * @param {string} id - Terminal ID
   * @param {string} data - Data to write
   */
  write(id, data) {
    const terminal = this.terminals.get(id);
    if (terminal) {
      terminal.write(data);
    }
  }

  /**
   * Resize a terminal
   * @param {string} id - Terminal ID
   * @param {number} cols - Number of columns
   * @param {number} rows - Number of rows
   */
  resize(id, cols, rows) {
    const terminal = this.terminals.get(id);
    if (terminal) {
      try {
        terminal.resize(cols, rows);
      } catch (err) {
        console.error(`Failed to resize terminal ${id}:`, err);
      }
    }
  }

  /**
   * Dispose of a specific terminal
   * @param {string} id - Terminal ID
   */
  dispose(id) {
    const terminal = this.terminals.get(id);
    if (terminal) {
      terminal.kill();
      this.terminals.delete(id);
    }
  }

  /**
   * Dispose of all terminals
   */
  disposeAll() {
    for (const [id, terminal] of this.terminals) {
      terminal.kill();
    }
    this.terminals.clear();
  }

  /**
   * Get the count of active terminals
   * @returns {number}
   */
  getCount() {
    return this.terminals.size;
  }
}

module.exports = PtyManager;

