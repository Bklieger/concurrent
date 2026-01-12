const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

const execAsync = promisify(exec);

class GitManager {
  constructor() {
    this.concurrentDir = path.join(os.homedir(), '.concurrent');
  }

  /**
   * Check if a path is safely inside ~/.concurrent
   * @param {string} targetPath - Path to check
   * @returns {boolean} True if path is inside ~/.concurrent
   */
  isInsideConcurrentDir(targetPath) {
    const resolved = path.resolve(targetPath);
    const concurrentResolved = path.resolve(this.concurrentDir);
    return resolved.startsWith(concurrentResolved + path.sep) || resolved === concurrentResolved;
  }

  /**
   * List all worktrees across all repos in ~/.concurrent
   * @returns {Promise<Array>} Array of worktree objects with metadata
   */
  async listAllWorktrees() {
    await this.ensureConcurrentDir();
    const worktrees = [];

    try {
      // Read all owner directories
      const owners = await fs.readdir(this.concurrentDir).catch(() => []);

      for (const owner of owners) {
        const ownerPath = path.join(this.concurrentDir, owner);
        const ownerStat = await fs.stat(ownerPath).catch(() => null);

        if (!ownerStat || !ownerStat.isDirectory()) continue;

        // Read all repo directories within owner
        const repos = await fs.readdir(ownerPath).catch(() => []);

        for (const repo of repos) {
          const repoPath = path.join(ownerPath, repo);
          const repoStat = await fs.stat(repoPath).catch(() => null);

          if (!repoStat || !repoStat.isDirectory()) continue;

          // Check if this is a git repo
          const gitPath = path.join(repoPath, '.git');
          const isGitRepo = await fs.stat(gitPath).catch(() => null);

          if (!isGitRepo) continue;

          // Get worktrees for this repo
          try {
            const repoWorktrees = await this.listWorktrees(repoPath);

            for (const wt of repoWorktrees) {
              // Get additional metadata for each worktree
              const status = await this.getWorktreeStatus(wt.path);
              const lastCommit = await this.getLastCommit(wt.path);
              const branchName = wt.branch ? wt.branch.replace('refs/heads/', '') : path.basename(wt.path);

              worktrees.push({
                path: wt.path,
                owner,
                repo,
                branch: branchName,
                isMain: wt.path === repoPath,
                changes: status,
                lastCommit,
              });
            }
          } catch (error) {
            console.error(`Failed to list worktrees for ${repoPath}:`, error.message);
          }
        }
      }

      return worktrees;
    } catch (error) {
      console.error('Failed to list all worktrees:', error);
      return [];
    }
  }

  /**
   * Get the last commit info for a worktree
   * @param {string} worktreePath - Path to worktree
   * @returns {Promise<Object>} Last commit info
   */
  async getLastCommit(worktreePath) {
    try {
      const { stdout } = await execAsync(
        'git log -1 --format="%H|%s|%cr|%an"',
        { cwd: worktreePath }
      );

      const [hash, message, relativeTime, author] = stdout.trim().split('|');

      return {
        hash: hash ? hash.substring(0, 7) : '',
        message: message || '',
        relativeTime: relativeTime || '',
        author: author || '',
      };
    } catch (error) {
      return { hash: '', message: '', relativeTime: '', author: '' };
    }
  }

  /**
   * Safely remove a worktree (only if inside ~/.concurrent)
   * @param {string} worktreePath - Path to worktree
   * @returns {Promise<boolean>} Success
   */
  async safeRemoveWorktree(worktreePath) {
    // Security check: Only allow deletion inside ~/.concurrent
    if (!this.isInsideConcurrentDir(worktreePath)) {
      throw new Error('Cannot delete worktree: Path is outside ~/.concurrent directory');
    }

    await this.checkGitInstalled();

    // Find the parent git repo for this worktree
    const parentRepoPath = await this.findParentRepo(worktreePath);

    if (!parentRepoPath) {
      // If no parent repo, just remove the directory
      await fs.rm(worktreePath, { recursive: true, force: true });
      return true;
    }

    try {
      // Use git worktree remove from the parent repo
      await execAsync(
        `git worktree remove "${worktreePath}" --force`,
        { cwd: parentRepoPath }
      );
      return true;
    } catch (error) {
      // If git command fails, try to prune and remove manually
      try {
        await execAsync('git worktree prune', { cwd: parentRepoPath });
        await fs.rm(worktreePath, { recursive: true, force: true });
        return true;
      } catch (rmError) {
        throw new Error(`Failed to remove worktree: ${rmError.message}`);
      }
    }
  }

  /**
   * Find the parent repo for a worktree path
   * @param {string} worktreePath - Path to worktree
   * @returns {Promise<string|null>} Parent repo path or null
   */
  async findParentRepo(worktreePath) {
    try {
      const { stdout } = await execAsync(
        'git rev-parse --git-common-dir',
        { cwd: worktreePath }
      );

      const gitCommonDir = stdout.trim();
      if (gitCommonDir && gitCommonDir !== '.git') {
        // The common dir points to the main repo's .git folder
        return path.dirname(gitCommonDir);
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async ensureConcurrentDir() {
    try {
      await fs.mkdir(this.concurrentDir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create .concurrent directory: ${error.message}`);
    }
  }

  async checkGitInstalled() {
    try {
      await execAsync('git --version');
      return true;
    } catch (error) {
      throw new Error('Git is not installed. Please install git to use this feature.');
    }
  }

  async ensureBaseRepo(owner, repo) {
    await this.checkGitInstalled();
    await this.ensureConcurrentDir();

    const ownerDir = path.join(this.concurrentDir, owner);
    const repoPath = path.join(ownerDir, repo);

    try {
      await fs.access(repoPath);
      console.log(`Base repo already exists at ${repoPath}`);
      return repoPath;
    } catch (error) {
      console.log(`Cloning ${owner}/${repo}...`);

      await fs.mkdir(ownerDir, { recursive: true });

      const gitUrl = `https://github.com/${owner}/${repo}.git`;

      try {
        const { stdout, stderr } = await execAsync(
          `git clone "${gitUrl}" "${repoPath}"`,
          { maxBuffer: 10 * 1024 * 1024 }
        );

        if (stderr && !stderr.includes('Cloning into')) {
          console.error('Git clone stderr:', stderr);
        }

        console.log('Clone successful');
        return repoPath;
      } catch (cloneError) {
        if (cloneError.message.includes('Repository not found')) {
          throw new Error(`Repository ${owner}/${repo} not found on GitHub`);
        } else if (cloneError.message.includes('Could not resolve host')) {
          throw new Error('Network error: Could not connect to GitHub');
        } else {
          throw new Error(`Failed to clone repository: ${cloneError.message}`);
        }
      }
    }
  }

  async createWorktree(baseRepoPath, branchName) {
    await this.checkGitInstalled();

    const worktreePath = path.join(baseRepoPath, branchName);

    try {
      await fs.access(worktreePath);
      throw new Error(`Worktree already exists at ${worktreePath}`);
    } catch (error) {
      if (error.message.includes('already exists')) {
        throw error;
      }
    }

    try {
      const { stdout, stderr } = await execAsync(
        `git worktree add "${worktreePath}" -b "${branchName}"`,
        { cwd: baseRepoPath, maxBuffer: 10 * 1024 * 1024 }
      );

      if (stderr && !stderr.includes('Preparing worktree')) {
        console.error('Git worktree stderr:', stderr);
      }

      console.log(`Worktree created at ${worktreePath}`);
      return worktreePath;
    } catch (worktreeError) {
      if (worktreeError.message.includes('already exists')) {
        throw new Error(`Branch ${branchName} already exists. Please choose a different name.`);
      } else {
        throw new Error(`Failed to create worktree: ${worktreeError.message}`);
      }
    }
  }

  async listWorktrees(baseRepoPath) {
    await this.checkGitInstalled();

    try {
      const { stdout } = await execAsync(
        'git worktree list --porcelain',
        { cwd: baseRepoPath }
      );

      const worktrees = [];
      const lines = stdout.trim().split('\n');
      let currentWorktree = {};

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          if (currentWorktree.path) {
            worktrees.push(currentWorktree);
          }
          currentWorktree = { path: line.substring(9) };
        } else if (line.startsWith('branch ')) {
          currentWorktree.branch = line.substring(7);
        } else if (line === '') {
          if (currentWorktree.path) {
            worktrees.push(currentWorktree);
            currentWorktree = {};
          }
        }
      }

      if (currentWorktree.path) {
        worktrees.push(currentWorktree);
      }

      return worktrees;
    } catch (error) {
      throw new Error(`Failed to list worktrees: ${error.message}`);
    }
  }

  async getWorktreeStatus(worktreePath) {
    await this.checkGitInstalled();

    try {
      const { stdout } = await execAsync(
        'git status --porcelain',
        { cwd: worktreePath }
      );

      const lines = stdout.trim().split('\n').filter(l => l);

      let additions = 0;
      let modifications = 0;
      let deletions = 0;

      for (const line of lines) {
        const status = line.substring(0, 2);

        // Check for new files (untracked or staged additions)
        if (status.includes('??') || status.includes('A')) {
          additions++;
        }
        // Check for modifications
        else if (status.includes('M')) {
          modifications++;
        }
        // Check for deletions
        else if (status.includes('D')) {
          deletions++;
        }
      }

      return {
        additions,
        modifications,
        deletions,
        total: lines.length
      };
    } catch (error) {
      console.error('Failed to get worktree status:', error);
      return { additions: 0, modifications: 0, deletions: 0, total: 0 };
    }
  }

  async removeWorktree(worktreePath) {
    await this.checkGitInstalled();

    try {
      const { stdout, stderr } = await execAsync(
        `git worktree remove "${worktreePath}" --force`
      );

      if (stderr) {
        console.error('Git worktree remove stderr:', stderr);
      }

      console.log(`Worktree removed: ${worktreePath}`);
      return true;
    } catch (error) {
      throw new Error(`Failed to remove worktree: ${error.message}`);
    }
  }
}

module.exports = GitManager;
