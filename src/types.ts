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

export interface SelectedFile {
  relativePath: string;
  absolutePath: string;
  reason: string;
}

export interface RenderedSelectedFile extends SelectedFile {
  content?: string;
  skippedReason?: string;
  size: number;
}

export interface GitDiffResult {
  status: 'included' | 'empty' | 'unavailable';
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
