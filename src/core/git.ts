import { execFileSync } from 'node:child_process';
import { GitDiffResult } from '../types';

export function getGitDiff(projectPath: string): GitDiffResult {
  try {
    const diff = execFileSync('git', ['diff', '--no-ext-diff'], {
      cwd: projectPath,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 5,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (diff.trim().length === 0) {
      return {
        status: 'empty',
        diff: '',
        note: 'No git diff output was found.',
      };
    }

    return {
      status: 'included',
      diff,
    };
  } catch {
    return {
      status: 'unavailable',
      diff: '',
      note: 'Git diff was unavailable, or this project is not a git repository.',
    };
  }
}
