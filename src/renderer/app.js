/**
 * Main application controller
 * Coordinates between TerminalManager and Sidebar
 * Depends on: TerminalManager, Sidebar, PresetManager, LaunchModal, LandingPage (loaded via script tags)
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

    // Landing page for viewing all worktrees
    this.landingPage = new LandingPage({
      onSelectWorktree: (worktree) => this.handleWorktreeSelect(worktree),
      onLaunchNew: () => this.launchModal.show(),
      getActiveWorktrees: () => this.getActiveWorktreePaths(),
    });

    // Track worktree paths to terminal IDs
    this.worktreeToTerminal = new Map();

    this.viewToggleBtn = document.getElementById('view-toggle-btn');
    this.gridCreateBtn = document.getElementById('grid-create-btn');
    this.launchAgentBtn = document.getElementById('launch-agent-btn');
    this.landingToggleBtn = document.getElementById('landing-toggle-btn');

    this.setupExitHandler();
    this.setupActivityHandler();
    this.setupRenameHandler();
    this.setupViewToggle();
    this.setupGridEvents();
    this.setupLaunchButton();
    this.setupEmptyStateLaunch();
    this.setupLandingToggle();
    this.setupLandingEmptyLaunch();

    // Show landing page by default
    this.showLandingPage();
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
      // Update landing page when activity changes
      this.landingPage.updateStatus();
    });
  }

  /**
   * Get worktree paths that have active (green dot) terminals
   * @returns {Set<string>} Set of worktree paths with active terminals
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
   * Setup landing page toggle button
   */
  setupLandingToggle() {
    this.landingToggleBtn.addEventListener('click', () => {
      if (this.landingPage.isVisible()) {
        this.hideLandingPage();
      } else {
        this.showLandingPage();
      }
    });

    // Keyboard shortcut: Ctrl/Cmd + H for landing page
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault();
        this.landingToggleBtn.click();
      }
    });
  }

  /**
   * Setup landing empty state launch button
   */
  setupLandingEmptyLaunch() {
    const landingEmptyBtn = document.getElementById('landing-empty-launch-btn');
    if (landingEmptyBtn) {
      landingEmptyBtn.addEventListener('click', () => {
        this.launchModal.show();
      });
    }
  }

  /**
   * Show the landing page
   */
  showLandingPage() {
    this.landingPage.show();
    this.landingToggleBtn.classList.add('active');

    // Hide terminal/grid views
    document.getElementById('terminal-container').classList.add('hidden');
    document.getElementById('grid-container').classList.add('hidden');
  }

  /**
   * Hide the landing page
   */
  hideLandingPage() {
    this.landingPage.hide();
    this.landingToggleBtn.classList.remove('active');

    // Show appropriate terminal view
    const terminalContainer = document.getElementById('terminal-container');
    const gridContainer = document.getElementById('grid-container');

    if (this.viewToggleBtn.classList.contains('active')) {
      terminalContainer.classList.add('hidden');
      gridContainer.classList.remove('hidden');
    } else {
      terminalContainer.classList.remove('hidden');
      gridContainer.classList.add('hidden');
    }
  }

  /**
   * Handle worktree selection from landing page
   * @param {Object} worktree - Worktree object with metadata
   */
  async handleWorktreeSelect(worktree) {
    // Check if we already have a terminal for this worktree
    const existingTerminalId = this.worktreeToTerminal.get(worktree.path);

    if (existingTerminalId && this.sidebar.terminals.has(existingTerminalId)) {
      // Terminal exists, select it
      this.hideLandingPage();
      this.selectTerminal(existingTerminalId);
      return;
    }

    // Create new terminal for this worktree
    await this.launchWorktreeTerminal(worktree);
  }

  /**
   * Launch a terminal for an existing worktree
   * @param {Object} worktree - Worktree object
   */
  async launchWorktreeTerminal(worktree) {
    try {
      // Show launch modal pre-filled for this worktree
      // For now, just create a terminal in the worktree directory
      const terminalId = await window.terminalAPI.create({
        cwd: worktree.path,
      });

      // Store mapping
      this.worktreeToTerminal.set(worktree.path, terminalId);

      // Update landing page status
      this.landingPage.updateStatus();

      // Add to UI
      const terminalName = `${worktree.owner}/${worktree.repo}:${worktree.branch}`;
      const worktreeInfo = {
        owner: worktree.owner,
        repo: worktree.repo,
        branch: worktree.branch,
        path: worktree.path
      };

      this.terminalManager.create(terminalId);
      this.sidebar.add(terminalId, terminalName, worktreeInfo);

      // Start status polling
      this.startWorktreeStatusPolling(terminalId, worktree.path);

      // Hide landing page and select new terminal
      this.hideLandingPage();
      this.selectTerminal(terminalId);
    } catch (error) {
      console.error('Failed to launch worktree terminal:', error);
      alert(`Failed to open worktree: ${error.message}`);
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

      // 6. Store worktree -> terminal mapping
      this.worktreeToTerminal.set(worktreeResult.path, terminalId);

      // Update landing page status
      this.landingPage.updateStatus();

      // 7. Add to UI with custom name and worktree info
      const terminalName = `${owner}/${repo}:${branch}`;
      this.terminalManager.create(terminalId);
      this.sidebar.add(terminalId, terminalName, worktreeInfo);

      // 8. Hide landing page if visible and select terminal
      this.hideLandingPage();
      this.selectTerminal(terminalId);

      // 9. Start status polling for this worktree
      this.startWorktreeStatusPolling(terminalId, worktreeResult.path);

      // 10. Hide modal
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

      // Remove from worktree mapping
      for (const [path, terminalId] of this.worktreeToTerminal.entries()) {
        if (terminalId === id) {
          this.worktreeToTerminal.delete(path);
          break;
        }
      }

      // Update landing page status
      this.landingPage.updateStatus();

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

