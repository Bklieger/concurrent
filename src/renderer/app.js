/**
 * Main application controller
 * Coordinates between WindowManager, TerminalManager, and Sidebar
 * Depends on: WindowManager, TerminalManager, Sidebar, PresetManager, LaunchModal, LandingPage
 */
class App {
  constructor() {
    // Initialize window manager first
    this.windowManager = new WindowManager();
    this.windowManager.setOnWindowClose((windowId, windowData) => {
      this.handleWindowClose(windowId, windowData);
    });

    // Terminal manager for xterm instances
    this.terminalManager = new TerminalManager();

    // Sidebar for terminal tabs
    this.sidebar = new Sidebar({
      onSelect: (id) => this.selectTerminal(id),
      onClose: (id) => this.closeTerminal(id),
      onCreate: () => this.launchModal.show(),
      onRename: (id, newName) => this.renameTerminal(id, newName),
    });

    // Preset manager for agent commands
    this.presetManager = new PresetManager();

    // Launch modal
    this.launchModal = new LaunchModal(
      (formData) => this.handleLaunch(formData),
      this.presetManager
    );

    // Landing page (overview) component
    this.landingPage = new LandingPage({
      onSelectWorktree: (worktree) => this.handleWorktreeSelect(worktree),
      onLaunchNew: () => this.launchModal.show(),
      getActiveWorktrees: () => this.getActiveWorktreePaths(),
    });

    // Track terminal ID -> window ID mapping
    this.terminalToWindow = new Map();
    // Track worktree path -> terminal ID
    this.worktreeToTerminal = new Map();
    // Overview window ID
    this.overviewWindowId = null;

    // Get DOM elements
    this.overviewToggleBtn = document.getElementById('overview-toggle-btn');
    this.launchAgentBtn = document.getElementById('launch-agent-btn');

    this.setupEventListeners();
    this.setupExitHandler();
    this.setupActivityHandler();
    this.setupRenameHandler();
    this.setupWindowResizeHandler();

    // Open overview window by default
    this.openOverviewWindow();
  }

  /**
   * Setup all event listeners
   */
  setupEventListeners() {
    // Overview toggle button
    this.overviewToggleBtn.addEventListener('click', () => {
      this.toggleOverviewWindow();
    });

    // Launch agent button
    this.launchAgentBtn.addEventListener('click', () => {
      this.launchModal.show();
    });

    // Empty state buttons
    const emptyLaunchBtn = document.getElementById('empty-state-launch-btn');
    if (emptyLaunchBtn) {
      emptyLaunchBtn.addEventListener('click', () => {
        this.launchModal.show();
      });
    }

    const emptyOverviewBtn = document.getElementById('empty-state-overview-btn');
    if (emptyOverviewBtn) {
      emptyOverviewBtn.addEventListener('click', () => {
        this.openOverviewWindow();
      });
    }

    // Landing page buttons
    const landingEmptyBtn = document.getElementById('landing-empty-launch-btn');
    if (landingEmptyBtn) {
      landingEmptyBtn.addEventListener('click', () => {
        this.launchModal.show();
      });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        this.launchModal.show();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        this.toggleOverviewWindow();
      }
    });

    // Container resize
    const container = document.getElementById('window-grid-container');
    const resizeObserver = new ResizeObserver(() => {
      this.windowManager.repositionAll();
    });
    resizeObserver.observe(container);
  }

  /**
   * Setup terminal exit handler
   */
  setupExitHandler() {
    window.terminalAPI.onExit((id, exitCode) => {
      console.log(`Terminal ${id} exited with code ${exitCode}`);
    });
  }

  /**
   * Setup activity change handler
   */
  setupActivityHandler() {
    this.terminalManager.onActivity((id, isActive) => {
      this.sidebar.setActivity(id, isActive);
      this.landingPage.updateStatus();
    });
  }

  /**
   * Setup rename handler
   */
  setupRenameHandler() {
    this.terminalManager.onRename((id, newName) => {
      this.renameTerminal(id, newName);
    });
  }

  /**
   * Setup window resize handler for terminal fitting
   */
  setupWindowResizeHandler() {
    window.addEventListener('window-resize', (e) => {
      const { windowId, windowData } = e.detail;
      if (windowData.type === 'terminal' && windowData.terminalId) {
        const entry = this.terminalManager.terminals.get(windowData.terminalId);
        if (entry) {
          requestAnimationFrame(() => {
            entry.fitAddon.fit();
            this.terminalManager.sendResize(windowData.terminalId, entry.terminal);
          });
        }
      }
    });
  }

  /**
   * Open or focus the overview window
   */
  openOverviewWindow() {
    // Check if overview window already exists
    const existing = this.windowManager.getOverviewWindow();
    if (existing) {
      this.windowManager.restoreWindow(existing.windowId);
      this.windowManager.bringToFront(existing.windowId);
      return;
    }

    // Create overview window
    const windowId = this.windowManager.createWindow('overview', {
      title: 'WORKTREE OVERVIEW',
      gridX: 0,
      gridY: 0,
      gridW: 8,
      gridH: 4,
    });

    this.overviewWindowId = windowId;

    // Get the overview content template and mount it
    const template = document.getElementById('overview-content-template');
    const content = template.cloneNode(true);
    content.id = '';
    content.classList.remove('hidden');

    this.windowManager.mountContent(windowId, content);

    // Re-initialize landing page with new elements
    this.landingPage.tableBody = content.querySelector('#worktree-table-body');
    this.landingPage.emptyState = content.querySelector('#landing-empty-state');
    this.landingPage.tableWrapper = content.querySelector('#worktree-table-wrapper');
    this.landingPage.launchBtn = content.querySelector('#landing-launch-btn');
    this.landingPage.refreshBtn = content.querySelector('#landing-refresh-btn');

    // Setup table click handler
    this.landingPage.setupTableClickHandler();

    // Re-setup event listeners for the new elements
    if (this.landingPage.launchBtn) {
      this.landingPage.launchBtn.addEventListener('click', () => this.launchModal.show());
    }
    if (this.landingPage.refreshBtn) {
      this.landingPage.refreshBtn.addEventListener('click', () => this.landingPage.refresh());
    }

    const emptyLaunchBtn = content.querySelector('#landing-empty-launch-btn');
    if (emptyLaunchBtn) {
      emptyLaunchBtn.addEventListener('click', () => this.launchModal.show());
    }

    // Start the landing page
    this.landingPage.refresh();
    this.landingPage.startPolling();

    this.overviewToggleBtn.classList.add('active');
  }

  /**
   * Toggle overview window
   */
  toggleOverviewWindow() {
    const existing = this.windowManager.getOverviewWindow();
    if (existing) {
      if (existing.windowData.minimized) {
        this.windowManager.restoreWindow(existing.windowId);
      } else {
        this.windowManager.minimizeWindow(existing.windowId);
      }
    } else {
      this.openOverviewWindow();
    }
  }

  /**
   * Select/activate a terminal
   */
  selectTerminal(id) {
    this.sidebar.setActive(id);

    // Focus the terminal's window
    const windowId = this.terminalToWindow.get(id);
    if (windowId) {
      this.windowManager.restoreWindow(windowId);
      this.windowManager.bringToFront(windowId);
    } else {
      // Terminal exists but no window - create one
      this.openTerminalWindow(id);
    }
  }

  /**
   * Open a window for a terminal
   */
  openTerminalWindow(terminalId) {
    // Check if window already exists
    const existingWindowId = this.terminalToWindow.get(terminalId);
    if (existingWindowId && this.windowManager.windows.has(existingWindowId)) {
      this.windowManager.restoreWindow(existingWindowId);
      this.windowManager.bringToFront(existingWindowId);
      return existingWindowId;
    }

    // Get terminal entry
    const entry = this.terminalManager.terminals.get(terminalId);
    if (!entry) return null;

    // Get terminal name from sidebar
    const sidebarEntry = this.sidebar.terminals.get(terminalId);
    const title = sidebarEntry ? sidebarEntry.name : `Terminal ${terminalId}`;

    // Create window - let window manager find a free spot
    const windowId = this.windowManager.createWindow('terminal', {
      title: title,
      terminalId: terminalId,
      gridW: 4,
      gridH: 4,
    });

    // Get the window's content container
    const windowData = this.windowManager.windows.get(windowId);
    const contentContainer = windowData.element.querySelector('.window-content');

    // Create a wrapper for the terminal
    const contentEl = document.createElement('div');
    contentEl.className = 'terminal-window-content';
    contentContainer.appendChild(contentEl);

    // Check if terminal was already opened (re-opening a closed window)
    if (entry.isOpened) {
      // Move existing terminal element to new container
      contentEl.appendChild(entry.terminal.element);
    } else {
      // First time - open terminal into the wrapper
      entry.terminal.open(contentEl);
      entry.isOpened = true;
    }

    this.terminalToWindow.set(terminalId, windowId);

    // Fit terminal after mount
    requestAnimationFrame(() => {
      entry.fitAddon.fit();
      this.terminalManager.sendResize(terminalId, entry.terminal);
      entry.terminal.focus();
    });

    return windowId;
  }

  /**
   * Close a terminal
   */
  async closeTerminal(id) {
    try {
      // Clear status poller
      if (this.statusPollers && this.statusPollers.has(id)) {
        clearInterval(this.statusPollers.get(id));
        this.statusPollers.delete(id);
      }

      // Remove from worktree mapping
      for (const [path, terminalId] of this.worktreeToTerminal.entries()) {
        if (terminalId === id) {
          this.worktreeToTerminal.delete(path);
          break;
        }
      }

      // Close window if exists
      const windowId = this.terminalToWindow.get(id);
      if (windowId) {
        const windowData = this.windowManager.windows.get(windowId);
        if (windowData) {
          windowData.element.remove();
          this.windowManager.windows.delete(windowId);
        }
        this.terminalToWindow.delete(id);
      }

      // Update landing page
      this.landingPage.updateStatus();

      // Find next terminal
      const nextId = this.sidebar.getNextId(id);

      // Close PTY
      await window.terminalAPI.close(id);

      // Clean up UI
      this.sidebar.remove(id);
      this.terminalManager.close(id);

      // Select next terminal
      if (nextId) {
        this.selectTerminal(nextId);
      }
    } catch (err) {
      console.error('Failed to close terminal:', err);
    }
  }

  /**
   * Rename a terminal
   */
  renameTerminal(id, newName) {
    this.sidebar.rename(id, newName, { emit: false });

    // Update window title
    const windowId = this.terminalToWindow.get(id);
    if (windowId) {
      this.windowManager.updateWindowTitle(windowId, newName);
    }
  }

  /**
   * Handle window close from window manager
   */
  handleWindowClose(windowId, windowData) {
    if (windowData.type === 'overview') {
      this.overviewWindowId = null;
      this.overviewToggleBtn.classList.remove('active');
      this.landingPage.stopPolling();
    } else if (windowData.type === 'terminal' && windowData.terminalId) {
      // Just remove the window mapping, don't close the terminal
      this.terminalToWindow.delete(windowData.terminalId);
    }
  }

  /**
   * Get active worktree paths (terminals with green dot)
   */
  getActiveWorktreePaths() {
    const activePaths = new Set();
    for (const [path, terminalId] of this.worktreeToTerminal.entries()) {
      const terminalEntry = this.terminalManager.terminals.get(terminalId);
      if (terminalEntry && terminalEntry.isActive) {
        activePaths.add(path);
      }
    }
    return activePaths;
  }

  /**
   * Handle worktree selection from overview
   */
  async handleWorktreeSelect(worktree) {
    const existingTerminalId = this.worktreeToTerminal.get(worktree.path);

    if (existingTerminalId && this.sidebar.terminals.has(existingTerminalId)) {
      this.selectTerminal(existingTerminalId);
      return;
    }

    await this.launchWorktreeTerminal(worktree);
  }

  /**
   * Launch a terminal for an existing worktree
   */
  async launchWorktreeTerminal(worktree) {
    try {
      const terminalId = await window.terminalAPI.create({
        cwd: worktree.path,
      });

      this.worktreeToTerminal.set(worktree.path, terminalId);
      this.landingPage.updateStatus();

      const terminalName = `${worktree.owner}/${worktree.repo}:${worktree.branch}`;
      const worktreeInfo = {
        owner: worktree.owner,
        repo: worktree.repo,
        branch: worktree.branch,
        path: worktree.path
      };

      this.terminalManager.create(terminalId);
      this.sidebar.add(terminalId, terminalName, worktreeInfo);
      this.startWorktreeStatusPolling(terminalId, worktree.path);

      // Open terminal window
      this.openTerminalWindow(terminalId);
    } catch (error) {
      console.error('Failed to launch worktree terminal:', error);
      alert(`Failed to open worktree: ${error.message}`);
    }
  }

  /**
   * Handle launch agent form submission
   */
  async handleLaunch({ owner, repo, branch, prompt, presetId }) {
    try {
      const baseResult = await window.gitAPI.ensureBaseRepo(owner, repo);
      if (!baseResult.success) {
        this.launchModal.showError(baseResult.error);
        return;
      }

      const worktreeResult = await window.gitAPI.createWorktree(
        baseResult.path,
        branch
      );
      if (!worktreeResult.success) {
        this.launchModal.showError(worktreeResult.error);
        return;
      }

      const command = this.presetManager.getCommandForPreset(presetId, prompt);

      const terminalId = await window.terminalAPI.create({
        cwd: worktreeResult.path,
        command: command,
      });

      const worktreeInfo = {
        owner,
        repo,
        branch,
        path: worktreeResult.path
      };

      this.worktreeToTerminal.set(worktreeResult.path, terminalId);
      this.landingPage.updateStatus();

      const terminalName = `${owner}/${repo}:${branch}`;
      this.terminalManager.create(terminalId);
      this.sidebar.add(terminalId, terminalName, worktreeInfo);

      this.startWorktreeStatusPolling(terminalId, worktreeResult.path);

      // Open terminal window
      this.openTerminalWindow(terminalId);

      this.launchModal.hide();
    } catch (error) {
      console.error('Failed to launch agent:', error);
      this.launchModal.showError(
        error.message || 'An unexpected error occurred'
      );
    }
  }

  /**
   * Start git status polling
   */
  async startWorktreeStatusPolling(terminalId, worktreePath) {
    if (!this.statusPollers) {
      this.statusPollers = new Map();
    }

    const poll = async () => {
      try {
        const status = await window.gitAPI.getWorktreeStatus(worktreePath);
        if (status.success) {
          this.sidebar.updateGitStatus(terminalId, status.changes);
        }
      } catch (error) {
        console.error('Failed to poll git status:', error);
      }
    };

    const intervalId = setInterval(poll, 5000);
    poll();

    this.statusPollers.set(terminalId, intervalId);
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new App();
});
