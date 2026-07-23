export type Mode = 'bug';

export interface BugCommandOptions {
  errorFile: string;
  out: string;
  budget: number;
  stdout: boolean;
  include: string[];
  exclude: string[];
}

export interface ProjectFile {
  relativePath: string;
  absolutePath: string;
  size: number;
}

export interface ParsedStackFile {
  rawPath: string;
  line?: number;
  column?: number;
}

export type SelectedFilePriority = 1 | 2 | 3 | 4 | 5;

export interface SelectedFile {
  relativePath: string;
  absolutePath: string;
  reason: string;
  priority: SelectedFilePriority;
}

export interface RenderedSelectedFile extends SelectedFile {
  content?: string;
  skippedReason?: string;
  omittedReason?: string;
  size: number;
}

export type GitDiffStatus = 'included' | 'empty' | 'unavailable' | 'omitted';

export interface GitDiffResult {
  status: GitDiffStatus;
  diff: string;
  note?: string;
}

export interface ContextPacketInput {
  mode: Mode;
  projectPath: string;
  errorFile: string;
  errorText: string;
  selectedFiles: RenderedSelectedFile[];
  gitDiff: GitDiffResult;
  budget: number;
  estimatedTokens: number;
  generatedAt: string;
  warnings: string[];
}
