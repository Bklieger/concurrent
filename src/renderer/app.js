/**
 * Main application controller
 * Coordinates between TerminalManager and Sidebar
 * Depends on: TerminalManager, Sidebar (loaded via script tags)
 */
class App {
  constructor() {
    this.terminalManager = new TerminalManager();

    this.sidebar = new Sidebar({
      onSelect: (id) => this.selectTerminal(id),
      onClose: (id) => this.closeTerminal(id),
      onCreate: () => this.createTerminal(),
    });

    this.viewToggleBtn = document.getElementById('view-toggle-btn');
    this.gridCreateBtn = document.getElementById('grid-create-btn');

    this.setupExitHandler();
    this.setupActivityHandler();
    this.setupViewToggle();
    this.setupGridEvents();

    // Create first terminal on startup
    this.createTerminal();
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
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new App();
});

