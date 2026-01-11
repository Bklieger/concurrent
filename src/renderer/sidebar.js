/**
 * Manages the sidebar UI for terminal tabs
 */
class Sidebar {
  constructor({ onSelect, onClose, onCreate, onRename }) {
    this.terminals = new Map();
    this.activeId = null;
    this.terminalCounter = 0;

    // Callbacks
    this.onSelect = onSelect;
    this.onClose = onClose;
    this.onCreate = onCreate;
    this.onRename = onRename;

    // DOM elements
    this.listEl = document.getElementById('terminal-list');
    this.newBtn = document.getElementById('new-terminal-btn');
    this.createFirstBtn = document.getElementById('create-first-btn');

    this.setupEventListeners();
  }

  /**
   * Add a terminal to the sidebar
   * @param {string} id - Terminal ID
   * @returns {string} Display name for the terminal
   */
  add(id) {
    this.terminalCounter++;
    const name = `TTY-${String(this.terminalCounter).padStart(2, '0')}`;

    const li = document.createElement('li');
    li.className = 'terminal-item';
    li.dataset.id = id;
    li.innerHTML = `
      <span class="terminal-item-status" data-status="idle"></span>
      <span class="terminal-item-name">${name}</span>
      <button class="terminal-item-close" title="Close">[X]</button>
    `;

    const nameEl = li.querySelector('.terminal-item-name');
    let clickTimeout = null;

    // Click to select (with delay to allow double-click)
    li.addEventListener('click', (e) => {
      if (e.target.classList.contains('terminal-item-close') || e.target.classList.contains('terminal-item-name-input')) {
        return;
      }

      // If clicking on name, use delayed select to allow double-click
      if (e.target === nameEl) {
        if (clickTimeout) {
          clearTimeout(clickTimeout);
          clickTimeout = null;
        }
        clickTimeout = setTimeout(() => {
          this.onSelect(id);
          clickTimeout = null;
        }, 200);
      } else {
        this.onSelect(id);
      }
    });

    // Double-click name to edit
    nameEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (clickTimeout) {
        clearTimeout(clickTimeout);
        clickTimeout = null;
      }
      this.startEditing(id);
    });

    // Click close button
    li.querySelector('.terminal-item-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this.onClose(id);
    });

    this.listEl.appendChild(li);
    this.terminals.set(id, { element: li, name });

    return name;
  }

  /**
   * Set the active terminal in sidebar
   * @param {string} id - Terminal ID to mark as active
   */
  setActive(id) {
    // Remove active from all
    this.listEl.querySelectorAll('.terminal-item').forEach(el => {
      el.classList.remove('active');
    });

    // Add active to selected
    const entry = this.terminals.get(id);
    if (entry) {
      entry.element.classList.add('active');
      this.activeId = id;
    }
  }

  /**
   * Remove a terminal from the sidebar
   * @param {string} id - Terminal ID to remove
   */
  remove(id) {
    const entry = this.terminals.get(id);
    if (entry) {
      entry.element.remove();
      this.terminals.delete(id);
    }
  }

  /**
   * Update the activity status of a terminal
   * @param {string} id - Terminal ID
   * @param {boolean} isActive - Whether the terminal has active output
   */
  setActivity(id, isActive) {
    const entry = this.terminals.get(id);
    if (entry) {
      const statusEl = entry.element.querySelector('.terminal-item-status');
      if (statusEl) {
        statusEl.dataset.status = isActive ? 'active' : 'idle';
      }
    }
  }

  /**
   * Start editing a terminal name
   * @param {string} id - Terminal ID
   */
  startEditing(id) {
    const entry = this.terminals.get(id);
    if (!entry) return;

    const nameEl = entry.element.querySelector('.terminal-item-name');
    const currentName = entry.name;

    // Create input element
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'terminal-item-name-input';
    input.value = currentName;

    // Replace name with input
    nameEl.textContent = '';
    nameEl.appendChild(input);
    input.focus();
    input.select();

    const finishEditing = (save) => {
      const newName = input.value.trim() || currentName;
      if (save && newName !== currentName) {
        this.rename(id, newName);
      } else {
        nameEl.textContent = currentName;
      }
    };

    input.addEventListener('blur', () => finishEditing(true));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      } else if (e.key === 'Escape') {
        finishEditing(false);
        nameEl.textContent = currentName;
      }
    });
  }

  /**
   * Rename a terminal
   * @param {string} id - Terminal ID
   * @param {string} newName - New name for the terminal
   */
  rename(id, newName, { emit = true } = {}) {
    const entry = this.terminals.get(id);
    if (!entry) return;

    entry.name = newName;
    const nameEl = entry.element.querySelector('.terminal-item-name');
    nameEl.textContent = newName;

    // Notify callback if set
    if (emit && this.onRename) {
      this.onRename(id, newName);
    }
  }

  /**
   * Setup event listeners for buttons
   */
  setupEventListeners() {
    this.newBtn.addEventListener('click', () => {
      this.onCreate();
    });

    this.createFirstBtn.addEventListener('click', () => {
      this.onCreate();
    });

    // Keyboard shortcut: Ctrl/Cmd + T for new terminal
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault();
        this.onCreate();
      }

      // Ctrl/Cmd + W to close current terminal
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault();
        if (this.activeId) {
          this.onClose(this.activeId);
        }
      }
    });
  }

  /**
   * Get the next terminal ID to select after closing one
   * @param {string} closingId - The ID being closed
   * @returns {string|null} Next terminal ID or null
   */
  getNextId(closingId) {
    const ids = Array.from(this.terminals.keys());
    const index = ids.indexOf(closingId);

    if (ids.length <= 1) return null;

    // Prefer the next terminal, or previous if closing last
    if (index < ids.length - 1) {
      return ids[index + 1];
    }
    return ids[index - 1];
  }
}


// Export for tests and attach to window when available
if (typeof module !== 'undefined') {
  module.exports = Sidebar;
}

if (typeof window !== 'undefined') {
  window.Sidebar = Sidebar;
}
