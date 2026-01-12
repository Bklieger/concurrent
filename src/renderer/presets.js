/**
 * Preset configurations for AI agents
 * Each preset maps to a specific command-line agent tool
 */
const PRESETS = [
  { id: 'claude', name: 'Claude (Anthropic)', command: 'claude' },
  { id: 'codex', name: 'Codex (OpenAI)', command: 'codex' },
  { id: 'opencode', name: 'OpenCode', command: 'opencode' },
  { id: 'droid', name: 'Droid (Factory)', command: 'droid' },
  { id: 'custom', name: 'Custom', command: '' },
];

/**
 * PresetManager class for managing agent presets
 */
class PresetManager {
  constructor() {
    this.presets = PRESETS;
  }

  /**
   * Get all available presets
   * @returns {Array} Array of preset objects
   */
  getPresets() {
    return this.presets;
  }

  /**
   * Get a specific preset by ID
   * @param {string} id - Preset ID
   * @returns {Object|undefined} Preset object or undefined if not found
   */
  getPreset(id) {
    return this.presets.find((p) => p.id === id);
  }

  /**
   * Generate the full command string for a preset
   * @param {string} presetId - Preset ID
   * @param {string} prompt - User prompt
   * @returns {string|null} Command string or null if preset not found
   */
  getCommandForPreset(presetId, prompt) {
    const preset = this.getPreset(presetId);
    if (!preset) return null;

    // Custom preset returns the prompt as-is (user enters full command)
    if (preset.id === 'custom') {
      return prompt;
    }

    // Regular presets: format as "{command} {prompt}"
    // Escape double quotes in prompt to prevent command injection
    const escapedPrompt = prompt.replace(/"/g, '\\"');
    return `${preset.command} "${escapedPrompt}"`;
  }

  /**
   * Get the total number of presets
   * @returns {number} Number of presets
   */
  getPresetCount() {
    return this.presets.length;
  }
}

// Export for tests
if (typeof module !== 'undefined') {
  module.exports = PresetManager;
}
