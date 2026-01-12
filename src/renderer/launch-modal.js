/**
 * LaunchModal class for creating and managing the git worktree launch UI
 */
class LaunchModal {
  /**
   * @param {Function} onLaunch - Callback function when launch is triggered
   * @param {PresetManager} presetManager - Preset manager instance
   */
  constructor(onLaunch, presetManager) {
    this.onLaunch = onLaunch;
    this.presetManager = presetManager;
    this.isSubmitting = false;

    this.createModal();
    this.setupEventListeners();
    this.populatePresets();
  }

  /**
   * Create the modal DOM structure
   */
  createModal() {
    const modal = document.createElement('div');
    modal.id = 'launch-modal';
    modal.className = 'modal-overlay hidden';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>LAUNCH NEW AGENT</h2>
          <button class="modal-close" id="modal-close-btn">[X]</button>
        </div>

        <div class="modal-body">
          <div class="form-group">
            <label>REPOSITORY</label>
            <input type="text" id="launch-repo" placeholder="owner/repo" />
          </div>

          <div class="form-group">
            <label>BRANCH PREFIX</label>
            <input type="text" id="launch-branch" placeholder="feature-name" />
          </div>

          <div class="form-group">
            <label>PROMPT</label>
            <textarea id="launch-prompt" rows="4"
                      placeholder="What should the agent do?"></textarea>
          </div>

          <div class="form-group">
            <label>PRESET</label>
            <select id="launch-preset">
              <option value="">Select a preset...</option>
            </select>
          </div>

          <div class="modal-error hidden" id="launch-error"></div>
        </div>

        <div class="modal-footer">
          <button class="btn-secondary" id="launch-cancel">CANCEL</button>
          <button class="btn-primary" id="launch-submit">LAUNCH AGENT</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Cache DOM references
    this.modal = modal;
    this.repoInput = document.getElementById('launch-repo');
    this.branchInput = document.getElementById('launch-branch');
    this.promptInput = document.getElementById('launch-prompt');
    this.presetSelect = document.getElementById('launch-preset');
    this.errorDiv = document.getElementById('launch-error');
    this.submitBtn = document.getElementById('launch-submit');
    this.cancelBtn = document.getElementById('launch-cancel');
    this.closeBtn = document.getElementById('modal-close-btn');
  }

  /**
   * Populate the preset dropdown
   */
  populatePresets() {
    const presets = this.presetManager.getPresets();
    presets.forEach((preset) => {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = preset.name;
      this.presetSelect.appendChild(option);
    });
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Close modal on X button
    this.closeBtn.addEventListener('click', () => this.hide());

    // Close modal on cancel button
    this.cancelBtn.addEventListener('click', () => this.hide());

    // Close modal on overlay click
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.hide();
      }
    });

    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.modal.classList.contains('hidden')) {
        this.hide();
      }
    });

    // Submit form
    this.submitBtn.addEventListener('click', () => this.handleSubmit());

    // Submit on Enter in inputs (not textarea)
    [this.repoInput, this.branchInput].forEach((input) => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this.handleSubmit();
        }
      });
    });
  }

  /**
   * Show the modal
   */
  show() {
    this.modal.classList.remove('hidden');
    this.repoInput.focus();
    this.clearError();
    this.isSubmitting = false;
    this.submitBtn.disabled = false;
    this.submitBtn.textContent = 'LAUNCH AGENT';

    // Load last used preset
    const lastPreset = localStorage.getItem('concurrent-last-preset');
    if (lastPreset && this.presetManager.getPreset(lastPreset)) {
      this.presetSelect.value = lastPreset;
    }
  }

  /**
   * Hide the modal and clear form
   */
  hide() {
    this.modal.classList.add('hidden');
    this.clearForm();
    this.clearError();
  }

  /**
   * Clear the form inputs
   */
  clearForm() {
    this.repoInput.value = '';
    this.branchInput.value = '';
    this.promptInput.value = '';
    this.presetSelect.value = '';
  }

  /**
   * Validate form inputs
   * @returns {Object} Validation result {valid: boolean, error: string}
   */
  validate() {
    const repo = this.repoInput.value.trim();
    const branch = this.branchInput.value.trim();
    const prompt = this.promptInput.value.trim();
    const presetId = this.presetSelect.value;

    // Repository validation
    if (!repo) {
      return { valid: false, error: 'Repository is required' };
    }

    const repoRegex = /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/;
    if (!repoRegex.test(repo)) {
      return {
        valid: false,
        error: 'Repository must be in owner/repo format (e.g., anthropics/claude-code)',
      };
    }

    // Branch validation
    if (!branch) {
      return { valid: false, error: 'Branch prefix is required' };
    }

    const branchRegex = /^[a-zA-Z0-9_-]+$/;
    if (!branchRegex.test(branch)) {
      return {
        valid: false,
        error: 'Branch prefix can only contain letters, numbers, hyphens, and underscores',
      };
    }

    // Prompt validation
    if (!prompt) {
      return { valid: false, error: 'Prompt is required' };
    }

    // Preset validation
    if (!presetId) {
      return { valid: false, error: 'Please select a preset' };
    }

    return { valid: true };
  }

  /**
   * Show error message
   * @param {string} message - Error message to display
   */
  showError(message) {
    this.errorDiv.textContent = message;
    this.errorDiv.classList.remove('hidden');
  }

  /**
   * Clear error message
   */
  clearError() {
    this.errorDiv.textContent = '';
    this.errorDiv.classList.add('hidden');
  }

  /**
   * Get form data
   * @returns {Object} Form data object
   */
  getFormData() {
    const repo = this.repoInput.value.trim();
    const [owner, repoName] = repo.split('/');

    return {
      owner,
      repo: repoName,
      branch: this.branchInput.value.trim(),
      prompt: this.promptInput.value.trim(),
      presetId: this.presetSelect.value,
    };
  }

  /**
   * Handle form submission
   */
  async handleSubmit() {
    // Prevent double submission
    if (this.isSubmitting) return;

    // Validate form
    const validation = this.validate();
    if (!validation.valid) {
      this.showError(validation.error);
      return;
    }

    // Clear any previous errors
    this.clearError();

    // Show loading state
    this.isSubmitting = true;
    this.submitBtn.disabled = true;
    this.submitBtn.textContent = 'LAUNCHING...';

    try {
      // Get form data
      const formData = this.getFormData();

      // Save last used preset
      localStorage.setItem('concurrent-last-preset', formData.presetId);

      // Call the onLaunch callback
      await this.onLaunch(formData);

      // Success - modal will be hidden by the callback
    } catch (error) {
      // Show error and reset button state
      this.showError(error.message || 'Failed to launch agent');
      this.isSubmitting = false;
      this.submitBtn.disabled = false;
      this.submitBtn.textContent = 'LAUNCH AGENT';
    }
  }
}
