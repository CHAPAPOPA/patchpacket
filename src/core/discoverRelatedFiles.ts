import fs from 'node:fs';
import path from 'node:path';
import { ProjectFile, SelectedFile } from '../types';
import {
  compareNormalizedPaths,
  isInsidePath,
  normalizeRelativePath,
  relativeToProject,
  toPosixPath,
} from './fileUtils';
import {
  extractLocalHtmlScriptSources,
  extractLocalSourceReferences,
  ReferenceKind,
} from './extractLocalReferences';

export const MAX_RELATED_DEPTH = 2;
export const MAX_RELATED_FILES = 12;

const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const htmlExtensions = new Set(['.html', '.htm']);

interface RelatedCandidate {
  file: ProjectFile;
  reasons: string[];
  follow: boolean;
}

export function discoverRelatedFiles(
  projectPath: string,
  scannedFiles: ProjectFile[],
  stackTraceFiles: SelectedFile[],
): SelectedFile[] {
  const filesByRelativePath = new Map(
    scannedFiles.map((file) => [normalizeRelativePath(file.relativePath), file]),
  );
  const stackTraceNodes = stackTraceFiles
    .map((file) => filesByRelativePath.get(normalizeRelativePath(file.relativePath)))
    .filter((file): file is ProjectFile => Boolean(file))
    .sort(compareProjectFiles);
  const stackTracePaths = new Set(
    stackTraceNodes.map((file) => normalizeRelativePath(file.relativePath)),
  );
  const visited = new Set(stackTracePaths);
  const relatedFiles = new Map<string, SelectedFile>();
  let currentNodes = stackTraceNodes;

  for (let depth = 0; depth < MAX_RELATED_DEPTH && currentNodes.length > 0; depth += 1) {
    const candidates = new Map<string, RelatedCandidate>();

    for (const file of currentNodes) {
      discoverReferencesFromFile(
        projectPath,
        file,
        filesByRelativePath,
        candidates,
        visited,
        relatedFiles,
        depth === 0,
      );
    }

    if (depth === 0) {
      discoverHtmlEntrypoints(
        projectPath,
        scannedFiles,
        stackTracePaths,
        filesByRelativePath,
        candidates,
        visited,
        relatedFiles,
      );
    }

    const nextNodes: ProjectFile[] = [];

    for (const candidate of Array.from(candidates.values()).sort((a, b) => compareProjectFiles(a.file, b.file))) {
      if (relatedFiles.size >= MAX_RELATED_FILES) {
        return sortRelatedFiles(relatedFiles);
      }

      const relativePath = normalizeRelativePath(candidate.file.relativePath);
      visited.add(relativePath);
      relatedFiles.set(relativePath, {
        relativePath,
        absolutePath: candidate.file.absolutePath,
        reason: candidate.reasons.join('; '),
        priority: 2,
      });

      if (candidate.follow) {
        nextNodes.push(candidate.file);
      }
    }

    currentNodes = nextNodes.sort(compareProjectFiles);
  }

  return sortRelatedFiles(relatedFiles);
}

function discoverReferencesFromFile(
  projectPath: string,
  file: ProjectFile,
  filesByRelativePath: Map<string, ProjectFile>,
  candidates: Map<string, RelatedCandidate>,
  visited: Set<string>,
  relatedFiles: Map<string, SelectedFile>,
  isStackTraceFile: boolean,
): void {
  const filePath = normalizeRelativePath(file.relativePath);

  if (isSourceFile(filePath)) {
    for (const reference of extractLocalSourceReferences(readFile(file.absolutePath))) {
      const target = resolveReference(projectPath, file, reference.specifier, filesByRelativePath);

      if (target) {
        addCandidate(
          candidates,
          target,
          reasonForReference(reference.kind, filePath),
          true,
          visited,
          relatedFiles,
        );
      }
    }
  }

  if (isHtmlFile(filePath)) {
    for (const source of extractLocalHtmlScriptSources(readFile(file.absolutePath))) {
      const target = resolveReference(projectPath, file, source, filesByRelativePath);

      if (target) {
        addCandidate(
          candidates,
          target,
          isStackTraceFile ? 'referenced by stack-trace HTML file' : `referenced by ${filePath}`,
          true,
          visited,
          relatedFiles,
        );
      }
    }
  }
}

function discoverHtmlEntrypoints(
  projectPath: string,
  scannedFiles: ProjectFile[],
  stackTracePaths: Set<string>,
  filesByRelativePath: Map<string, ProjectFile>,
  candidates: Map<string, RelatedCandidate>,
  visited: Set<string>,
  relatedFiles: Map<string, SelectedFile>,
): void {
  for (const htmlFile of scannedFiles.filter((file) => isHtmlFile(file.relativePath)).sort(compareProjectFiles)) {
    for (const source of extractLocalHtmlScriptSources(readFile(htmlFile.absolutePath))) {
      const target = resolveReference(projectPath, htmlFile, source, filesByRelativePath);

      if (target && stackTracePaths.has(normalizeRelativePath(target.relativePath))) {
        addCandidate(
          candidates,
          htmlFile,
          'HTML entrypoint referencing stack-trace file',
          false,
          visited,
          relatedFiles,
        );
      }
    }
  }
}

function resolveReference(
  projectPath: string,
  fromFile: ProjectFile,
  specifier: string,
  filesByRelativePath: Map<string, ProjectFile>,
): ProjectFile | undefined {
  const normalizedSpecifier = toPosixPath(specifier);
  const absoluteBasePath = path.resolve(path.dirname(fromFile.absolutePath), normalizedSpecifier);

  if (!isInsidePath(projectPath, absoluteBasePath)) {
    return undefined;
  }

  const baseRelativePath = normalizeRelativePath(relativeToProject(projectPath, absoluteBasePath));
  const candidatePaths = [baseRelativePath];

  if (path.posix.extname(baseRelativePath).length === 0) {
    candidatePaths.push(
      ...sourceExtensions.map((extension) => `${baseRelativePath}${extension}`),
      `${baseRelativePath}.json`,
      ...sourceExtensions.map((extension) => path.posix.join(baseRelativePath, `index${extension}`)),
    );
  }

  for (const candidatePath of candidatePaths) {
    const file = filesByRelativePath.get(normalizeRelativePath(candidatePath));

    if (file) {
      return file;
    }
  }

  return undefined;
}

function addCandidate(
  candidates: Map<string, RelatedCandidate>,
  file: ProjectFile,
  reason: string,
  follow: boolean,
  visited: Set<string>,
  relatedFiles: Map<string, SelectedFile>,
): void {
  const relativePath = normalizeRelativePath(file.relativePath);

  if (visited.has(relativePath)) {
    const existingRelatedFile = relatedFiles.get(relativePath);

    if (existingRelatedFile) {
      addReason(existingRelatedFile, reason);
    }
    return;
  }

  const existing = candidates.get(relativePath);

  if (existing) {
    if (!existing.reasons.includes(reason)) {
      existing.reasons.push(reason);
    }
    existing.follow = existing.follow || follow;
    return;
  }

  candidates.set(relativePath, {
    file,
    reasons: [reason],
    follow,
  });
}

function addReason(file: SelectedFile, reason: string): void {
  const reasons = new Set(file.reason.split('; '));

  if (!reasons.has(reason)) {
    reasons.add(reason);
    file.reason = Array.from(reasons).join('; ');
  }
}

function reasonForReference(kind: ReferenceKind, fromPath: string): string {
  if (kind === 'require') {
    return `required by ${fromPath}`;
  }

  if (kind === 'dynamic-import') {
    return `dynamically imported by ${fromPath}`;
  }

  if (kind === 're-export') {
    return `re-exported by ${fromPath}`;
  }

  return `imported by ${fromPath}`;
}

function isSourceFile(filePath: string): boolean {
  return sourceExtensions.includes(path.posix.extname(normalizeRelativePath(filePath)).toLowerCase());
}

function isHtmlFile(filePath: string): boolean {
  return htmlExtensions.has(path.posix.extname(normalizeRelativePath(filePath)).toLowerCase());
}

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

function compareProjectFiles(a: ProjectFile, b: ProjectFile): number {
  return compareNormalizedPaths(a.relativePath, b.relativePath);
}

function sortRelatedFiles(relatedFiles: Map<string, SelectedFile>): SelectedFile[] {
  return Array.from(relatedFiles.values()).sort((a, b) =>
    compareNormalizedPaths(a.relativePath, b.relativePath),
  );
}
