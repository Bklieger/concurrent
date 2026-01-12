/**
 * Test: Closing a terminal window should also remove it from sidebar
 * TDD: This test should FAIL first, then we implement the feature
 */

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe('App - Window Close Integration', () => {
  let mockTerminalAPI;
  let mockGitAPI;
  let app;

  beforeEach(() => {
    // Setup DOM
    document.body.innerHTML = `
      <div id="app">
        <aside id="sidebar">
          <div class="sidebar-header">
            <h1>CONCURRENT</h1>
            <div class="sidebar-header-btns">
              <button id="overview-toggle-btn">[≡]</button>
              <button id="new-terminal-btn">[+]</button>
            </div>
          </div>
          <ul id="terminal-list"></ul>
          <button id="launch-agent-btn">LAUNCH NEW AGENT</button>
        </aside>
        <main id="window-grid-container">
          <div id="grid-overlay"></div>
          <div id="empty-state">
            <p>NO ACTIVE WINDOWS</p>
            <button id="empty-state-launch-btn">[+] LAUNCH AGENT</button>
            <button id="empty-state-overview-btn">[≡] OPEN OVERVIEW</button>
          </div>
        </main>
        <div id="overview-content-template" class="hidden">
          <div class="landing-header">
            <h2>WORKTREE COMMAND CENTER</h2>
            <div class="landing-header-btns">
              <button id="landing-refresh-btn">[↻] REFRESH</button>
              <button id="landing-launch-btn">[+] LAUNCH</button>
            </div>
          </div>
          <div id="landing-empty-state" class="hidden"></div>
          <div id="worktree-table-wrapper">
            <table class="worktree-table">
              <thead><tr><th>NAME</th></tr></thead>
              <tbody id="worktree-table-body"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // Mock terminal API
    mockTerminalAPI = {
      create: jest.fn().mockResolvedValue('terminal-1'),
      write: jest.fn(),
      resize: jest.fn(),
      close: jest.fn().mockResolvedValue(true),
      onData: jest.fn(),
      onExit: jest.fn(),
    };

    // Mock git API
    mockGitAPI = {
      listAllWorktrees: jest.fn().mockResolvedValue({ success: true, worktrees: [] }),
      getWorktreeStatus: jest.fn().mockResolvedValue({ success: true, changes: {} }),
    };

    // Set globals
    window.terminalAPI = mockTerminalAPI;
    window.gitAPI = mockGitAPI;

    // Mock Terminal class (xterm)
    global.Terminal = class {
      constructor() {
        this.element = document.createElement('div');
      }
      loadAddon() {}
      open() {}
      onData() {}
      write() {}
      focus() {}
      dispose() {}
    };

    // Mock FitAddon
    global.FitAddon = {
      FitAddon: class {
        fit() {}
      }
    };

    // Load the classes
    const Sidebar = require('../src/renderer/sidebar');
    const TerminalManager = require('../src/renderer/terminal-manager');
    const WindowManager = require('../src/renderer/window-manager');
    const LandingPage = require('../src/renderer/landing-page');
    const PresetManager = require('../src/renderer/presets');
    
    window.Sidebar = Sidebar;
    window.TerminalManager = TerminalManager;
    window.WindowManager = WindowManager;
    window.LandingPage = LandingPage;
    window.PresetManager = PresetManager;
    
    // Mock LaunchModal
    window.LaunchModal = class {
      constructor() {}
      show() {}
      hide() {}
    };
  });

  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('closing terminal window via [X] button should remove terminal from sidebar', async () => {
    // Load App
    const App = require('../src/renderer/app');
    
    // Create app instance - need to instantiate it manually since DOMContentLoaded won't fire
    app = new App();

    // Simulate creating a terminal with a window
    const terminalId = 'terminal-1';
    
    // Add terminal to sidebar
    app.sidebar.add(terminalId, 'Test Terminal');
    
    // Create terminal in terminal manager
    app.terminalManager.create(terminalId);
    
    // Open a window for it
    const windowId = app.openTerminalWindow(terminalId);
    
    // Verify terminal is in sidebar
    expect(app.sidebar.terminals.has(terminalId)).toBe(true);
    expect(document.querySelectorAll('.terminal-item').length).toBe(1);
    
    // Verify window exists
    expect(app.windowManager.windows.has(windowId)).toBe(true);
    
    // Find and click the close button on the window
    const windowEl = document.getElementById(windowId);
    const closeBtn = windowEl.querySelector('.window-close');
    closeBtn.click();
    
    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // ASSERTION: Terminal should be removed from sidebar
    expect(app.sidebar.terminals.has(terminalId)).toBe(false);
    expect(document.querySelectorAll('.terminal-item').length).toBe(0);
    
    // ASSERTION: Window should be closed
    expect(app.windowManager.windows.has(windowId)).toBe(false);
    
    // ASSERTION: terminalAPI.close should have been called
    expect(mockTerminalAPI.close).toHaveBeenCalledWith(terminalId);
  });

  test('closing overview window should NOT affect terminals in sidebar', async () => {
    // Load App
    const App = require('../src/renderer/app');
    app = new App();

    // Add a terminal to sidebar
    const terminalId = 'terminal-1';
    app.sidebar.add(terminalId, 'Test Terminal');
    app.terminalManager.create(terminalId);
    
    // Verify terminal is in sidebar
    expect(app.sidebar.terminals.has(terminalId)).toBe(true);
    
    // Open overview window
    app.openOverviewWindow();
    const overviewWindow = app.windowManager.getOverviewWindow();
    expect(overviewWindow).not.toBeNull();
    
    // Close overview window
    const overviewEl = document.getElementById(overviewWindow.windowId);
    const closeBtn = overviewEl.querySelector('.window-close');
    closeBtn.click();
    
    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Terminal should still be in sidebar (overview close doesn't affect terminals)
    expect(app.sidebar.terminals.has(terminalId)).toBe(true);
    expect(document.querySelectorAll('.terminal-item').length).toBe(1);
  });
});

