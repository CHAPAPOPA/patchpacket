import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import ignore from 'ignore';
import { ProjectFile } from '../types';
import { isSkippableFile, normalizeRelativePath, toPosixPath } from './fileUtils';

const defaultIgnorePatterns = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  'out',
  'target',
  'vendor',
];

export interface ScanProjectOptions {
  include?: string[];
  exclude?: string[];
}

export async function scanProject(
  projectPath: string,
  options: ScanProjectOptions = {},
): Promise<ProjectFile[]> {
  const ignoreMatcher = ignore();
  ignoreMatcher.add(defaultIgnorePatterns);
  ignoreMatcher.add(readIgnoreFile(projectPath, '.gitignore'));
  ignoreMatcher.add(readIgnoreFile(projectPath, '.patchpacketignore'));
  ignoreMatcher.add(options.exclude ?? []);

  const patterns = options.include && options.include.length > 0 ? options.include : ['**/*'];
  const entries = await fg(patterns, {
    cwd: projectPath,
    dot: true,
    onlyFiles: true,
    unique: true,
    followSymbolicLinks: false,
    absolute: false,
  });

  return entries
    .map(normalizeRelativePath)
    .filter((relativePath) => !ignoreMatcher.ignores(relativePath))
    .filter((relativePath) => !isSkippableFile(relativePath))
    .map((relativePath) => {
      const absolutePath = path.resolve(projectPath, relativePath);
      const stat = fs.statSync(absolutePath);
      return {
        relativePath: toPosixPath(relativePath),
        absolutePath,
        size: stat.size,
      };
    })
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function readIgnoreFile(projectPath: string, fileName: string): string[] {
  const ignorePath = path.join(projectPath, fileName);

  if (!fs.existsSync(ignorePath)) {
    return [];
  }

  return fs
    .readFileSync(ignorePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
}
