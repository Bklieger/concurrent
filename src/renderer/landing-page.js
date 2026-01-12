/**
 * Landing Page - Shows all worktrees in a table with git status info
 */
class LandingPage {
  constructor({ onSelectWorktree, onLaunchNew, getActiveWorktrees }) {
    this.onSelectWorktree = onSelectWorktree;
    this.onLaunchNew = onLaunchNew;
    this.getActiveWorktrees = getActiveWorktrees || (() => new Set());
    this.worktrees = [];
    this.pollInterval = null;

    this.container = document.getElementById('landing-container');
    this.tableBody = document.getElementById('worktree-table-body');
    this.launchBtn = document.getElementById('landing-launch-btn');
    this.refreshBtn = document.getElementById('landing-refresh-btn');
    this.emptyState = document.getElementById('landing-empty-state');
    this.tableWrapper = document.getElementById('worktree-table-wrapper');

    this.setupEventListeners();
  }

  setupEventListeners() {
    // Launch new agent button
    this.launchBtn.addEventListener('click', () => {
      this.onLaunchNew();
    });

    // Refresh button
    this.refreshBtn.addEventListener('click', () => {
      this.refresh();
    });

    // Table row clicks
    this.tableBody.addEventListener('click', (e) => {
      const row = e.target.closest('.worktree-row');
      if (!row) return;

      // Handle delete button click
      if (e.target.closest('.worktree-delete-btn')) {
        e.stopPropagation();
        const path = row.dataset.path;
        this.confirmDelete(path);
        return;
      }

      // Navigate to worktree
      const worktreePath = row.dataset.path;
      const worktree = this.worktrees.find(w => w.path === worktreePath);
      if (worktree) {
        this.onSelectWorktree(worktree);
      }
    });
  }

  /**
   * Show the landing page
   */
  show() {
    this.container.classList.remove('hidden');
    this.refresh();
    this.startPolling();
  }

  /**
   * Hide the landing page
   */
  hide() {
    this.container.classList.add('hidden');
    this.stopPolling();
  }

  /**
   * Check if landing page is visible
   */
  isVisible() {
    return !this.container.classList.contains('hidden');
  }

  /**
   * Start polling for worktree updates
   */
  startPolling() {
    this.stopPolling();
    this.pollInterval = setInterval(() => this.refresh(), 5000);
  }

  /**
   * Stop polling
   */
  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Refresh the worktree list
   */
  async refresh() {
    try {
      const result = await window.gitAPI.listAllWorktrees();
      if (result.success) {
        this.worktrees = result.worktrees;
        this.render();
      } else {
        console.error('Failed to list worktrees:', result.error);
      }
    } catch (error) {
      console.error('Error refreshing worktrees:', error);
    }
  }

  /**
   * Update the table rendering (re-render with current data)
   * Called when active worktrees change
   */
  updateStatus() {
    if (this.isVisible()) {
      this.render();
    }
  }

  /**
   * Render the worktree table
   */
  render() {
    // Filter out main repos, only show worktrees
    const worktreesToShow = this.worktrees.filter(w => !w.isMain);

    if (worktreesToShow.length === 0) {
      this.emptyState.classList.remove('hidden');
      this.tableWrapper.classList.add('hidden');
      return;
    }

    this.emptyState.classList.add('hidden');
    this.tableWrapper.classList.remove('hidden');

    this.tableBody.innerHTML = worktreesToShow.map(wt => this.renderRow(wt)).join('');
  }

  /**
   * Render a single worktree row
   */
  renderRow(worktree) {
    const { path, owner, repo, branch, changes, lastCommit } = worktree;

    // Format changes display
    const changesHtml = this.formatChanges(changes);

    // Determine status based on whether there's an active tab for this worktree
    const activeWorktrees = this.getActiveWorktrees();
    const isActive = activeWorktrees.has(path);
    const statusClass = isActive ? 'status-active' : 'status-inactive';
    const statusText = isActive ? 'ACTIVE' : 'INACTIVE';

    return `
      <tr class="worktree-row" data-path="${this.escapeHtml(path)}">
        <td class="worktree-name">
          <div class="worktree-name-main">${this.escapeHtml(branch)}</div>
          <div class="worktree-name-sub">${this.escapeHtml(owner)}/${this.escapeHtml(repo)}</div>
        </td>
        <td class="worktree-branch">${this.escapeHtml(branch)}</td>
        <td class="worktree-changes">${changesHtml}</td>
        <td class="worktree-status">
          <span class="status-badge ${statusClass}">${statusText}</span>
        </td>
        <td class="worktree-commit">
          <div class="commit-info">
            <span class="commit-time">${this.escapeHtml(lastCommit?.relativeTime || '-')}</span>
          </div>
        </td>
        <td class="worktree-actions">
          <button class="worktree-delete-btn" title="Delete worktree">[DEL]</button>
        </td>
      </tr>
    `;
  }

  /**
   * Format git changes for display
   */
  formatChanges(changes) {
    if (!changes) return '<span class="changes-none">-</span>';

    const parts = [];
    if (changes.additions > 0) {
      parts.push(`<span class="status-add">+${changes.additions}</span>`);
    }
    if (changes.deletions > 0) {
      parts.push(`<span class="status-del">-${changes.deletions}</span>`);
    }

    return parts.length > 0 ? parts.join(' ') : '<span class="changes-none">+0 -0</span>';
  }

  /**
   * Confirm and delete a worktree
   */
  async confirmDelete(worktreePath) {
    const worktree = this.worktrees.find(w => w.path === worktreePath);
    if (!worktree) return;

    const confirmed = confirm(
      `Are you sure you want to delete this worktree?\n\n` +
      `Branch: ${worktree.branch}\n` +
      `Repo: ${worktree.owner}/${worktree.repo}\n` +
      `Path: ${worktreePath}\n\n` +
      `This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      const result = await window.gitAPI.safeRemoveWorktree(worktreePath);
      if (result.success) {
        this.refresh();
      } else {
        alert(`Failed to delete worktree: ${result.error}`);
      }
    } catch (error) {
      alert(`Error deleting worktree: ${error.message}`);
    }
  }

  /**
   * Escape HTML special characters
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Export for use in app.js
if (typeof window !== 'undefined') {
  window.LandingPage = LandingPage;
}

