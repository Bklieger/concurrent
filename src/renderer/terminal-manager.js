/**
 * Manages xterm.js terminal instances on the renderer side
 * Uses globally loaded Terminal and FitAddon from xterm packages
 */
class TerminalManager {
  constructor() {
    this.terminals = new Map();
    this.activeId = null;
    this.container = document.getElementById('terminal-container');
    this.gridContainer = document.getElementById('grid-container');
    this.emptyState = document.getElementById('empty-state');
    this.gridEmptyState = document.getElementById('grid-empty-state');
    this.activityCallbacks = [];
    this.renameCallbacks = [];
    this.idleTimeout = 3000; // 3 seconds of no output = idle
    this.isGridView = false;

    this.setupResizeObserver();
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
   * Create a new terminal view
   * @param {string} id - Terminal ID from main process
   * @returns {Terminal} The xterm Terminal instance
   */
  create(id) {
    // Create container for this terminal
    const viewEl = document.createElement('div');
    viewEl.className = 'terminal-view';
    viewEl.id = `terminal-${id}`;
    this.container.appendChild(viewEl);

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
    terminal.open(viewEl);

    // Fit after a short delay to ensure DOM is ready
    requestAnimationFrame(() => {
      fitAddon.fit();
      this.sendResize(id, terminal);
      // Fit again after a brief moment to catch any layout shifts
      setTimeout(() => {
        fitAddon.fit();
        this.sendResize(id, terminal);
      }, 50);
    });

    // Track input buffer for /rename command
    let inputBuffer = '';
    let renameHandled = false; // Prevent repeated rename on subsequent Enters

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
          // Clear the line (move to start, clear line) then show message
          terminal.write('\r\x1b[K\x1b[33m[Admin] Renamed window to ' + newName + '.\x1b[0m\r\n');
          // Kill the buffered shell line and abort any pending input
          window.terminalAPI.write(id, '\u0003'); // Ctrl+C
          this.notifyRename(id, newName);
          window.terminalAPI.write(id, '\r');
          return;
        }
      }

      window.terminalAPI.write(id, data);
    });

    // Create grid view element
    const gridEl = this.createGridElement(id);

    this.terminals.set(id, { terminal, fitAddon, viewEl, gridEl, idleTimer: null, isActive: false, suppressActivity: false });
    this.updateEmptyState();

    return terminal;
  }

  /**
   * Create grid view element for a terminal
   * @param {string} id - Terminal ID
   * @returns {HTMLElement} The grid element
   */
  createGridElement(id) {
    const entry = this.terminals.get(id);
    const name = `TTY-${id.split('-')[1]?.padStart(2, '0') || '00'}`;

    const gridEl = document.createElement('div');
    gridEl.className = 'grid-terminal';
    gridEl.dataset.id = id;
    gridEl.innerHTML = `
      <div class="grid-terminal-header">
        <div class="grid-terminal-header-left">
          <span class="grid-terminal-status" data-status="idle"></span>
          <span class="grid-terminal-name">${name}</span>
        </div>
        <button class="grid-terminal-close">[X]</button>
      </div>
      <div class="grid-terminal-body"></div>
    `;

    // Insert before empty state
    if (this.gridEmptyState) {
      this.gridContainer.insertBefore(gridEl, this.gridEmptyState);
    } else {
      this.gridContainer.appendChild(gridEl);
    }

    return gridEl;
  }

  /**
   * Mark terminal as active and reset idle timer
   * @param {string} id - Terminal ID
   */
  markActive(id) {
    const entry = this.terminals.get(id);
    if (!entry) return;

    // Skip if activity is suppressed (e.g., after resize)
    if (entry.suppressActivity) return;

    // Clear existing idle timer
    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer);
    }

    // If wasn't active, notify
    if (!entry.isActive) {
      entry.isActive = true;
      this.notifyActivity(id, true);
    }

    // Set new idle timer
    entry.idleTimer = setTimeout(() => {
      entry.isActive = false;
      this.notifyActivity(id, false);
    }, this.idleTimeout);
  }

  /**
   * Temporarily suppress activity marking for a terminal
   * Used after resize to avoid shell redraw triggering activity
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
   * Set the active terminal
   * @param {string} id - Terminal ID to activate
   */
  setActive(id) {
    // Deactivate current
    if (this.activeId) {
      const current = this.terminals.get(this.activeId);
      if (current) {
        current.viewEl.classList.remove('active');
      }
    }

    // Activate new
    const next = this.terminals.get(id);
    if (next) {
      next.viewEl.classList.add('active');
      this.activeId = id;

      // Mount to appropriate container
      if (!this.isGridView) {
        if (!next.viewEl.contains(next.terminal.element)) {
          next.viewEl.appendChild(next.terminal.element);
        }
      }

      // Suppress activity briefly to avoid resize triggering activity
      this.suppressActivityBriefly(id);

      // Fit and focus after layout settles
      requestAnimationFrame(() => {
        next.fitAddon.fit();
        next.terminal.focus();
        this.sendResize(id, next.terminal);
        // Double-fit to ensure proper sizing
        setTimeout(() => {
          next.fitAddon.fit();
          this.sendResize(id, next.terminal);
        }, 50);
      });
    }
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
      entry.viewEl.remove();
      if (entry.gridEl) {
        entry.gridEl.remove();
      }
      this.terminals.delete(id);
    }

    // If we closed the active terminal, activate another
    if (this.activeId === id) {
      this.activeId = null;
      const remaining = Array.from(this.terminals.keys());
      if (remaining.length > 0) {
        this.setActive(remaining[remaining.length - 1]);
      }
    }

    this.updateEmptyState();
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
   * Setup resize observer to fit terminals when container resizes
   */
  setupResizeObserver() {
    let resizeTimeout;
    const resizeObserver = new ResizeObserver(() => {
      // Debounce resize events
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (this.isGridView) {
          // Fit all terminals in grid view
          for (const [id, entry] of this.terminals) {
            entry.fitAddon.fit();
            this.sendResize(id, entry.terminal);
          }
        } else if (this.activeId) {
          const entry = this.terminals.get(this.activeId);
          if (entry) {
            entry.fitAddon.fit();
            this.sendResize(this.activeId, entry.terminal);
          }
        }
      }, 16);
    });
    resizeObserver.observe(this.container);
    resizeObserver.observe(this.gridContainer);
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
   * Show/hide empty state based on terminal count
   */
  updateEmptyState() {
    const isEmpty = this.terminals.size === 0;
    if (this.emptyState) {
      this.emptyState.style.display = isEmpty ? 'block' : 'none';
    }
    if (this.gridEmptyState) {
      this.gridEmptyState.style.display = isEmpty ? 'flex' : 'none';
    }
  }

  /**
   * Toggle between single and grid view
   * @returns {boolean} Whether grid view is now active
   */
  toggleGridView() {
    this.isGridView = !this.isGridView;

    if (this.isGridView) {
      this.container.classList.add('hidden');
      this.gridContainer.classList.remove('hidden');
      this.mountTerminalsToGrid();
    } else {
      this.gridContainer.classList.add('hidden');
      this.container.classList.remove('hidden');
      this.mountTerminalsToSingle();
    }

    return this.isGridView;
  }

  /**
   * Mount all terminals to grid view
   */
  mountTerminalsToGrid() {
    for (const [id, entry] of this.terminals) {
      const gridBody = entry.gridEl.querySelector('.grid-terminal-body');
      if (gridBody && !gridBody.contains(entry.terminal.element)) {
        gridBody.appendChild(entry.terminal.element);
        requestAnimationFrame(() => {
          entry.fitAddon.fit();
          this.sendResize(id, entry.terminal);
        });
      }
      // Update selected state
      entry.gridEl.classList.toggle('selected', id === this.activeId);
    }
  }

  /**
   * Mount active terminal to single view
   */
  mountTerminalsToSingle() {
    for (const [id, entry] of this.terminals) {
      if (id === this.activeId) {
        if (!entry.viewEl.contains(entry.terminal.element)) {
          entry.viewEl.appendChild(entry.terminal.element);
          requestAnimationFrame(() => {
            entry.fitAddon.fit();
            entry.terminal.focus();
            this.sendResize(id, entry.terminal);
          });
        }
      }
    }
  }

  /**
   * Update activity status in grid view
   * @param {string} id - Terminal ID
   * @param {boolean} isActive - Whether terminal is active
   */
  updateGridActivity(id, isActive) {
    const entry = this.terminals.get(id);
    if (entry && entry.gridEl) {
      const statusEl = entry.gridEl.querySelector('.grid-terminal-status');
      if (statusEl) {
        statusEl.dataset.status = isActive ? 'active' : 'idle';
      }
    }
  }

  /**
   * Update terminal name in grid view
   * @param {string} id - Terminal ID
   * @param {string} newName - New name
   */
  updateGridName(id, newName) {
    const entry = this.terminals.get(id);
    if (entry && entry.gridEl) {
      const nameEl = entry.gridEl.querySelector('.grid-terminal-name');
      if (nameEl) {
        nameEl.textContent = newName;
      }
    }
  }

  /**
   * Select a terminal in grid view
   * @param {string} id - Terminal ID
   */
  selectInGrid(id) {
    for (const [termId, entry] of this.terminals) {
      entry.gridEl.classList.toggle('selected', termId === id);
    }
  }

  /**
   * Get count of terminals
   */
  getCount() {
    return this.terminals.size;
  }
}


