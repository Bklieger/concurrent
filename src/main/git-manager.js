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
