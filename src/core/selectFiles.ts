import fs from 'node:fs';
import path from 'node:path';
import { ParsedStackFile, ProjectFile, SelectedFile } from '../types';
import {
  normalizeRelativePath,
  relativeToProject,
  resolveInsideProject,
  toPosixPath,
} from './fileUtils';

const metadataCandidates: Array<{ path: string; reason: string }> = [
  { path: 'package.json', reason: 'project manifest' },
  { path: 'README.md', reason: 'project README' },
  { path: '.env.example', reason: 'environment example' },
  { path: 'tsconfig.json', reason: 'TypeScript config' },
];

const configPatterns = [
  /^vite\.config\.(ts|js|mjs|cjs|mts|cts)$/i,
  /^next\.config\.(ts|js|mjs|cjs|mts|cts)$/i,
  /^webpack\.config\.(ts|js|mjs|cjs|mts|cts)$/i,
];

const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py'];
const testSuffixes = ['.test', '.spec'];

export function selectFiles(
  projectPath: string,
  scannedFiles: ProjectFile[],
  parsedStackFiles: ParsedStackFile[],
): SelectedFile[] {
  const filesByRelativePath = new Map(scannedFiles.map((file) => [file.relativePath, file]));
  const selected = new Map<string, SelectedFile>();

  for (const stackFile of parsedStackFiles) {
    const absolutePath = resolveStackFile(projectPath, stackFile.rawPath, filesByRelativePath);

    if (absolutePath && fs.existsSync(absolutePath)) {
      addSelected(selected, projectPath, absolutePath, 'mentioned in stack trace');
    }
  }

  for (const candidate of metadataCandidates) {
    const file = filesByRelativePath.get(candidate.path);

    if (file) {
      addSelected(selected, projectPath, file.absolutePath, candidate.reason);
    }
  }

  for (const file of scannedFiles) {
    const fileName = path.basename(file.relativePath);

    if (configPatterns.some((pattern) => pattern.test(fileName))) {
      addSelected(selected, projectPath, file.absolutePath, 'build/runtime config');
    }
  }

  const stackSelectedFiles = Array.from(selected.values()).filter(
    (file) => file.reason.includes('mentioned in stack trace'),
  );

  for (const file of stackSelectedFiles) {
    for (const testPath of findNearbyTests(file.relativePath, filesByRelativePath)) {
      addSelected(selected, projectPath, testPath, 'nearby test file');
    }
  }

  return Array.from(selected.values()).sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function resolveStackFile(
  projectPath: string,
  rawPath: string,
  filesByRelativePath: Map<string, ProjectFile>,
): string | undefined {
  const directAbsolute = resolveInsideProject(projectPath, rawPath);

  if (directAbsolute && fs.existsSync(directAbsolute)) {
    return directAbsolute;
  }

  const normalizedRawPath = normalizeRelativePath(rawPath.replace(/\\/g, '/'));
  const withoutDot = normalizedRawPath.replace(/^\.\//, '');
  const directFile = filesByRelativePath.get(withoutDot);

  if (directFile) {
    return directFile.absolutePath;
  }

  return findUniqueSuffixMatch(withoutDot, filesByRelativePath)?.absolutePath;
}

function findUniqueSuffixMatch(
  rawPath: string,
  filesByRelativePath: Map<string, ProjectFile>,
): ProjectFile | undefined {
  const segments = rawPath.replace(/^\/+/, '').split('/').filter(Boolean);

  for (let index = 0; index < segments.length; index += 1) {
    const suffix = segments.slice(index).join('/');
    const matches = Array.from(filesByRelativePath.values()).filter(
      (file) => file.relativePath === suffix || file.relativePath.endsWith(`/${suffix}`),
    );

    if (matches.length === 1) {
      return matches[0];
    }

    if (matches.length > 1) {
      return undefined;
    }
  }

  return undefined;
}

function findNearbyTests(
  sourceRelativePath: string,
  filesByRelativePath: Map<string, ProjectFile>,
): string[] {
  const parsed = path.posix.parse(toPosixPath(sourceRelativePath));

  if (!sourceExtensions.includes(parsed.ext)) {
    return [];
  }

  const candidates = new Set<string>();

  for (const suffix of testSuffixes) {
    candidates.add(path.posix.join(parsed.dir, `${parsed.name}${suffix}${parsed.ext}`));
  }

  const withoutSrc = parsed.dir.startsWith('src/') ? parsed.dir.slice('src/'.length) : parsed.dir;

  for (const suffix of testSuffixes) {
    candidates.add(path.posix.join('tests', withoutSrc, `${parsed.name}${suffix}${parsed.ext}`));
    candidates.add(path.posix.join('__tests__', `${parsed.name}${suffix}${parsed.ext}`));
  }

  return Array.from(candidates)
    .map((candidate) => filesByRelativePath.get(candidate)?.absolutePath)
    .filter((candidate): candidate is string => Boolean(candidate));
}

function addSelected(
  selected: Map<string, SelectedFile>,
  projectPath: string,
  absolutePath: string,
  reason: string,
): void {
  const relativePath = relativeToProject(projectPath, absolutePath);
  const existing = selected.get(relativePath);

  if (existing) {
    if (!existing.reason.includes(reason)) {
      existing.reason = `${existing.reason}; ${reason}`;
    }
    return;
  }

  selected.set(relativePath, {
    relativePath,
    absolutePath,
    reason,
  });
}
