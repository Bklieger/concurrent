/**
 * Main application controller
 * Coordinates between TerminalManager and Sidebar
 * Depends on: TerminalManager, Sidebar, PresetManager, LaunchModal (loaded via script tags)
 */
class App {
  constructor() {
    this.terminalManager = new TerminalManager();

    this.sidebar = new Sidebar({
      onSelect: (id) => this.selectTerminal(id),
      onClose: (id) => this.closeTerminal(id),
      onCreate: () => this.createTerminal(),
      onRename: (id, newName) => this.renameTerminal(id, newName),
    });

    this.presetManager = new PresetManager();
    this.launchModal = new LaunchModal(
      (formData) => this.handleLaunch(formData),
      this.presetManager
    );

    this.viewToggleBtn = document.getElementById('view-toggle-btn');
    this.gridCreateBtn = document.getElementById('grid-create-btn');
    this.launchAgentBtn = document.getElementById('launch-agent-btn');

    this.setupExitHandler();
    this.setupActivityHandler();
    this.setupRenameHandler();
    this.setupViewToggle();
    this.setupGridEvents();
    this.setupLaunchButton();
    this.setupEmptyStateLaunch();

    // Don't create terminal on startup - let user launch agents instead
  }

  /**
   * Create a new terminal
   */
  async createTerminal() {
    try {
      // Request new PTY from main process
      const id = await window.terminalAPI.create();

      // Create xterm instance
      this.terminalManager.create(id);

      // Add to sidebar
      this.sidebar.add(id);

      // Activate it
      this.selectTerminal(id);
    } catch (err) {
      console.error('Failed to create terminal:', err);
    }
  }

  /**
   * Select/activate a terminal
   * @param {string} id - Terminal ID
   */
  selectTerminal(id) {
    this.terminalManager.setActive(id);
    this.sidebar.setActive(id);
    this.terminalManager.selectInGrid(id);
  }

  /**
   * Close a terminal
   * @param {string} id - Terminal ID
   */
  async closeTerminal(id) {
    try {
      // Find next terminal to select before closing
      const nextId = this.sidebar.getNextId(id);

      // Close PTY in main process
      await window.terminalAPI.close(id);

      // Clean up UI
      this.sidebar.remove(id);
      this.terminalManager.close(id);

      // Select next terminal if available
      if (nextId) {
        this.selectTerminal(nextId);
      }
    } catch (err) {
      console.error('Failed to close terminal:', err);
    }
  }

  /**
   * Handle terminal exit events from main process
   */
  setupExitHandler() {
    window.terminalAPI.onExit((id, exitCode) => {
      console.log(`Terminal ${id} exited with code ${exitCode}`);
      // Optionally auto-close or show message
      // For now, just leave it so user can see final output
    });
  }

  /**
   * Handle terminal activity changes
   */
  setupActivityHandler() {
    this.terminalManager.onActivity((id, isActive) => {
      this.sidebar.setActivity(id, isActive);
      this.terminalManager.updateGridActivity(id, isActive);
    });
  }

  /**
   * Handle /rename command from terminal
   */
  setupRenameHandler() {
    this.terminalManager.onRename((id, newName) => {
      this.renameTerminal(id, newName);
    });
  }

  /**
   * Rename a terminal
   * @param {string} id - Terminal ID
   * @param {string} newName - New name
   */
  renameTerminal(id, newName) {
    this.sidebar.rename(id, newName, { emit: false });
    this.terminalManager.updateGridName(id, newName);
  }

  /**
   * Setup view toggle button
   */
  setupViewToggle() {
    this.viewToggleBtn.addEventListener('click', () => {
      const isGrid = this.terminalManager.toggleGridView();
      this.viewToggleBtn.classList.toggle('active', isGrid);
      this.viewToggleBtn.textContent = isGrid ? '[=]' : '[#]';
    });

    // Keyboard shortcut: Ctrl/Cmd + G for grid view
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
        e.preventDefault();
        this.viewToggleBtn.click();
      }
    });
  }

  /**
   * Setup grid view event handlers
   */
  setupGridEvents() {
    const gridContainer = document.getElementById('grid-container');

    // Create terminal from grid empty state
    this.gridCreateBtn.addEventListener('click', () => {
      this.createTerminal();
    });

    // Handle clicks on grid terminals
    gridContainer.addEventListener('click', (e) => {
      const gridTerminal = e.target.closest('.grid-terminal');
      if (!gridTerminal) return;

      const id = gridTerminal.dataset.id;

      // Close button
      if (e.target.closest('.grid-terminal-close')) {
        this.closeTerminal(id);
        return;
      }

      // Click on terminal body - select it
      if (e.target.closest('.grid-terminal-body') || e.target.closest('.grid-terminal-header')) {
        this.selectTerminal(id);
      }
    });
  }

  /**
   * Setup launch agent button
   */
  setupLaunchButton() {
    this.launchAgentBtn.addEventListener('click', () => {
      this.launchModal.show();
    });

    // Keyboard shortcut: Ctrl/Cmd + L for launch modal
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        this.launchModal.show();
      }
    });
  }

  /**
   * Setup empty state launch handlers
   */
  setupEmptyStateLaunch() {
    const emptyLaunchBtn = document.getElementById('empty-state-launch-btn');
    if (emptyLaunchBtn) {
      emptyLaunchBtn.addEventListener('click', () => {
        this.launchModal.show();
      });
    }

    const gridEmptyBtn = document.getElementById('grid-create-btn');
    if (gridEmptyBtn) {
      gridEmptyBtn.addEventListener('click', () => {
        this.launchModal.show();
      });
    }

    // Also update the "create first" button if it exists
    const createFirstBtn = document.getElementById('create-first-btn');
    if (createFirstBtn) {
      createFirstBtn.addEventListener('click', () => {
        this.launchModal.show();
      });
    }
  }

  /**
   * Handle launch agent form submission
   * @param {Object} formData - Form data from launch modal
   */
  async handleLaunch({ owner, repo, branch, prompt, presetId }) {
    try {
      // 1. Ensure base repo exists
      const baseResult = await window.gitAPI.ensureBaseRepo(owner, repo);
      if (!baseResult.success) {
        this.launchModal.showError(baseResult.error);
        return;
      }

      // 2. Create worktree
      const worktreeResult = await window.gitAPI.createWorktree(
        baseResult.path,
        branch
      );
      if (!worktreeResult.success) {
        this.launchModal.showError(worktreeResult.error);
        return;
      }

      // 3. Get command from preset
      const command = this.presetManager.getCommandForPreset(presetId, prompt);

      // 4. Create terminal with custom cwd and command
      const terminalId = await window.terminalAPI.create({
        cwd: worktreeResult.path,
        command: command,
      });

      // 5. Store worktree metadata
      const worktreeInfo = {
        owner,
        repo,
        branch,
        path: worktreeResult.path
      };

      // 6. Add to UI with custom name and worktree info
      const terminalName = `${owner}/${repo}:${branch}`;
      this.terminalManager.create(terminalId);
      this.sidebar.add(terminalId, terminalName, worktreeInfo);
      this.selectTerminal(terminalId);

      // 7. Start status polling for this worktree
      this.startWorktreeStatusPolling(terminalId, worktreeResult.path);

      // 8. Hide modal
      this.launchModal.hide();
    } catch (error) {
      console.error('Failed to launch agent:', error);
      this.launchModal.showError(
        error.message || 'An unexpected error occurred'
      );
    }
  }

  /**
   * Start polling git status for a worktree
   * @param {string} terminalId - Terminal ID
   * @param {string} worktreePath - Path to worktree
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
          this.terminalManager.updateGridStatus(terminalId, status.changes);
        }
      } catch (error) {
        console.error('Failed to poll git status:', error);
      }
    };

    // Poll every 5 seconds
    const intervalId = setInterval(poll, 5000);
    poll(); // Initial poll

    // Store interval ID to clear on terminal close
    this.statusPollers.set(terminalId, intervalId);
  }

  /**
   * Close a terminal
   * @param {string} id - Terminal ID
   */
  async closeTerminal(id) {
    try {
      // Clear status poller if exists
      if (this.statusPollers && this.statusPollers.has(id)) {
        clearInterval(this.statusPollers.get(id));
        this.statusPollers.delete(id);
      }

      // Find next terminal to select before closing
      const nextId = this.sidebar.getNextId(id);

      // Close PTY in main process
      await window.terminalAPI.close(id);

      // Clean up UI
      this.sidebar.remove(id);
      this.terminalManager.close(id);

      // Select next terminal if available
      if (nextId) {
        this.selectTerminal(nextId);
      }
    } catch (err) {
      console.error('Failed to close terminal:', err);
    }
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new App();
});

