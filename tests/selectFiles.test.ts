import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { selectFiles } from '../src/core/selectFiles';
import { ProjectFile } from '../src/types';

describe('selectFiles', () => {
  it('assigns priorities and sorts files alphabetically within the same priority', () => {
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'patchpacket-select-'));
    const relativePaths = [
      'src/z.ts',
      'src/a.ts',
      'src/a.test.ts',
      'package.json',
      'README.md',
    ];

    try {
      const scannedFiles = relativePaths.map((relativePath) =>
        createProjectFile(projectPath, relativePath),
      );
      const selectedFiles = selectFiles(projectPath, scannedFiles.reverse(), [
        { rawPath: 'src/z.ts' },
        { rawPath: 'src/a.ts' },
      ]);

      expect(
        selectedFiles.map((file) => ({
          relativePath: file.relativePath,
          priority: file.priority,
        })),
      ).toEqual([
        { relativePath: 'src/a.ts', priority: 1 },
        { relativePath: 'src/z.ts', priority: 1 },
        { relativePath: 'src/a.test.ts', priority: 3 },
        { relativePath: 'package.json', priority: 4 },
        { relativePath: 'README.md', priority: 5 },
      ]);
    } finally {
      fs.rmSync(projectPath, { recursive: true, force: true });
    }
  });

  it('places related files before nearby tests, config, and README', () => {
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'patchpacket-select-'));

    try {
      const scannedFiles = [
        createProjectFile(projectPath, 'README.md'),
        createProjectFile(projectPath, 'package.json'),
        createProjectFile(projectPath, 'src/main.test.ts'),
        createProjectFile(projectPath, 'src/related.ts'),
        createProjectFile(projectPath, 'src/main.ts', "import './related';"),
      ];
      const selectedFiles = selectFiles(projectPath, scannedFiles.reverse(), [
        { rawPath: 'src/main.ts' },
      ]);

      expect(
        selectedFiles.map((file) => ({
          relativePath: file.relativePath,
          priority: file.priority,
          reason: file.reason,
        })),
      ).toEqual([
        { relativePath: 'src/main.ts', priority: 1, reason: 'mentioned in stack trace' },
        { relativePath: 'src/related.ts', priority: 2, reason: 'imported by src/main.ts' },
        { relativePath: 'src/main.test.ts', priority: 3, reason: 'nearby test file' },
        { relativePath: 'package.json', priority: 4, reason: 'project manifest' },
        { relativePath: 'README.md', priority: 5, reason: 'project README' },
      ]);
    } finally {
      fs.rmSync(projectPath, { recursive: true, force: true });
    }
  });
});

function createProjectFile(projectPath: string, relativePath: string, content = ''): ProjectFile {
  const absolutePath = path.join(projectPath, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, 'utf8');

  return {
    relativePath,
    absolutePath,
    size: 0,
  };
}
