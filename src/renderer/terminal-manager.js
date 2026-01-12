/**
 * Manages xterm.js terminal instances on the renderer side
 * Uses globally loaded Terminal and FitAddon from xterm packages
 */
class TerminalManager {
  constructor() {
    this.terminals = new Map();
    this.activeId = null;
    this.activityCallbacks = [];
    this.renameCallbacks = [];
    this.idleTimeout = 3000; // 3 seconds of no output = idle

    this.setupDataListener();
  }

  /**
   * Register a callback for activity changes
   * @param {function} callback - Called with (id, isActive)
   */
  onActivity(callback) {
    this.activityCallbacks.push(callback);
  }

  /**
   * Notify all activity callbacks
   */
  notifyActivity(id, isActive) {
    this.activityCallbacks.forEach(cb => cb(id, isActive));
  }

  /**
   * Register a callback for rename events
   * @param {function} callback - Called with (id, newName)
   */
  onRename(callback) {
    this.renameCallbacks.push(callback);
  }

  /**
   * Notify all rename callbacks
   */
  notifyRename(id, newName) {
    this.renameCallbacks.forEach(cb => cb(id, newName));
  }

  /**
   * Create a new terminal instance
   * @param {string} id - Terminal ID from main process
   * @returns {Terminal} The xterm Terminal instance
   */
  create(id) {
    // Create xterm instance - Amber CRT theme
    const terminal = new Terminal({
      fontSize: 14,
      fontFamily: "'Share Tech Mono', 'VT323', 'Courier New', monospace",
      theme: {
        background: '#0a0a08',
        foreground: '#ff9500',
        cursor: '#ff9500',
        cursorAccent: '#0a0a08',
        selection: 'rgba(255, 149, 0, 0.3)',
        black: '#0a0a08',
        red: '#ff4400',
        green: '#ff9500',
        yellow: '#ffb340',
        blue: '#cc7700',
        magenta: '#ff6600',
        cyan: '#ffcc00',
        white: '#ff9500',
        brightBlack: '#5c3800',
        brightRed: '#ff6633',
        brightGreen: '#ffb340',
        brightYellow: '#ffcc66',
        brightBlue: '#ff9500',
        brightMagenta: '#ff8833',
        brightCyan: '#ffdd55',
        brightWhite: '#ffcc99',
      },
      cursorBlink: true,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon.FitAddon();
    terminal.loadAddon(fitAddon);

    // Track input buffer for /rename command
    let inputBuffer = '';
    let renameHandled = false;

    // Handle user input
    terminal.onData((data) => {
      const renameUtils = window.RenameUtils;
      if (renameUtils && typeof renameUtils.getRenameAction === 'function') {
        const { shouldRename, newName, nextBuffer, nextHandled } = renameUtils.getRenameAction(
          inputBuffer,
          data,
          renameHandled
        );

        inputBuffer = nextBuffer;
        renameHandled = nextHandled;

        if (shouldRename && newName) {
          terminal.write('\r\x1b[K\x1b[33m[Admin] Renamed window to ' + newName + '.\x1b[0m\r\n');
          window.terminalAPI.write(id, '\u0003'); // Ctrl+C
          this.notifyRename(id, newName);
          window.terminalAPI.write(id, '\r');
          return;
        }
      }

      window.terminalAPI.write(id, data);
    });

    this.terminals.set(id, {
      terminal,
      fitAddon,
      idleTimer: null,
      isActive: false,
      suppressActivity: false,
      isOpened: false  // Track if terminal.open() has been called
    });

    return terminal;
  }

  /**
   * Mark terminal as active and reset idle timer
   * @param {string} id - Terminal ID
   */
  markActive(id) {
    const entry = this.terminals.get(id);
    if (!entry) return;

    if (entry.suppressActivity) return;

    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer);
    }

    if (!entry.isActive) {
      entry.isActive = true;
      this.notifyActivity(id, true);
    }

    entry.idleTimer = setTimeout(() => {
      entry.isActive = false;
      this.notifyActivity(id, false);
    }, this.idleTimeout);
  }

  /**
   * Temporarily suppress activity marking for a terminal
   * @param {string} id - Terminal ID
   */
  suppressActivityBriefly(id) {
    const entry = this.terminals.get(id);
    if (!entry) return;

    entry.suppressActivity = true;
    setTimeout(() => {
      entry.suppressActivity = false;
    }, 200);
  }

  /**
   * Close and dispose of a terminal
   * @param {string} id - Terminal ID to close
   */
  close(id) {
    const entry = this.terminals.get(id);
    if (entry) {
      if (entry.idleTimer) {
        clearTimeout(entry.idleTimer);
      }
      entry.terminal.dispose();
      this.terminals.delete(id);
    }

    if (this.activeId === id) {
      this.activeId = null;
    }
  }

  /**
   * Write data to a terminal
   * @param {string} id - Terminal ID
   * @param {string} data - Data to write
   */
  write(id, data) {
    const entry = this.terminals.get(id);
    if (entry) {
      entry.terminal.write(data);
      this.markActive(id);
    }
  }

  /**
   * Send resize dimensions to main process
   */
  sendResize(id, terminal) {
    window.terminalAPI.resize(id, terminal.cols, terminal.rows);
  }

  /**
   * Setup listener for data from main process
   */
  setupDataListener() {
    window.terminalAPI.onData((id, data) => {
      this.write(id, data);
    });
  }

  /**
   * Get count of terminals
   */
  getCount() {
    return this.terminals.size;
  }
}
