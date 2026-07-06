import fs from 'node:fs';
import path from 'node:path';

const binaryExtensions = new Set([
  '.7z',
  '.a',
  '.avi',
  '.bmp',
  '.class',
  '.dll',
  '.dmg',
  '.doc',
  '.docx',
  '.eot',
  '.exe',
  '.gif',
  '.gz',
  '.ico',
  '.jar',
  '.jpeg',
  '.jpg',
  '.lockb',
  '.mov',
  '.mp3',
  '.mp4',
  '.o',
  '.ogg',
  '.otf',
  '.pdf',
  '.png',
  '.ppt',
  '.pptx',
  '.rar',
  '.so',
  '.sqlite',
  '.tar',
  '.tgz',
  '.ttf',
  '.wasm',
  '.webm',
  '.woff',
  '.woff2',
  '.xls',
  '.xlsx',
  '.zip',
]);

const lockFileNames = new Set([
  'bun.lockb',
  'composer.lock',
  'package-lock.json',
  'pnpm-lock.yaml',
  'poetry.lock',
  'yarn.lock',
]);

export function toPosixPath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

export function normalizeRelativePath(filePath: string): string {
  return toPosixPath(path.normalize(filePath)).replace(/^\.\//, '');
}

export function isInsidePath(parentPath: string, childPath: string): boolean {
  const relative = path.relative(parentPath, childPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function resolveInsideProject(projectPath: string, candidatePath: string): string | undefined {
  const normalizedCandidate = candidatePath.replace(/^file:\/\//, '');
  const absolutePath = path.isAbsolute(normalizedCandidate)
    ? path.resolve(normalizedCandidate)
    : path.resolve(projectPath, normalizedCandidate);

  if (!isInsidePath(projectPath, absolutePath)) {
    return undefined;
  }

  return absolutePath;
}

export function relativeToProject(projectPath: string, absolutePath: string): string {
  return normalizeRelativePath(path.relative(projectPath, absolutePath));
}

export function isSkippableFile(relativePath: string): boolean {
  const fileName = path.basename(relativePath);
  const extension = path.extname(fileName).toLowerCase();

  return (
    binaryExtensions.has(extension) ||
    lockFileNames.has(fileName) ||
    /\.min\.(js|css|mjs|cjs)$/i.test(fileName)
  );
}

export function readTextFile(filePath: string): string {
  const buffer = fs.readFileSync(filePath);

  if (buffer.includes(0)) {
    throw new Error(`Cannot read binary file as text: ${filePath}`);
  }

  return buffer.toString('utf8');
}
