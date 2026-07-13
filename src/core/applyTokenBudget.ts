import { ContextPacketInput, GitDiffResult, RenderedSelectedFile } from '../types';
import { renderMarkdown } from './renderMarkdown';
import { estimateTokens } from './tokenEstimate';

const FILE_OMITTED_REASON = 'Omitted to fit the token budget.';

type PacketCandidates = Omit<ContextPacketInput, 'estimatedTokens' | 'warnings'>;

export interface BudgetedPacket {
  markdown: string;
  estimatedTokens: number;
  selectedFiles: RenderedSelectedFile[];
  gitDiff: GitDiffResult;
  warnings: string[];
}

export function applyTokenBudget(input: PacketCandidates): BudgetedPacket {
  const originalFiles = input.selectedFiles.map((file) => ({ ...file }));
  let selectedFiles = omitAllFileContents(originalFiles);
  let gitDiff = omitGitDiff(input.gitDiff);

  const basePacket = renderPacket(input, selectedFiles, gitDiff, false);
  const mandatorySectionsExceedBudget = basePacket.estimatedTokens > input.budget;
  let packet = renderPacket(input, selectedFiles, gitDiff, mandatorySectionsExceedBudget);

  if (mandatorySectionsExceedBudget) {
    return packet;
  }

  const fileCandidates = originalFiles
    .filter((file) => !file.skippedReason && file.content !== undefined)
    .sort((a, b) => a.priority - b.priority || a.relativePath.localeCompare(b.relativePath));
  const stackTraceFiles = fileCandidates.filter((file) => file.priority === 1);
  const lowerPriorityFiles = fileCandidates.filter((file) => file.priority !== 1);

  for (const file of stackTraceFiles) {
    const candidateFiles = includeFile(selectedFiles, file);
    const candidatePacket = renderPacket(input, candidateFiles, gitDiff, false);

    if (candidatePacket.estimatedTokens <= input.budget) {
      selectedFiles = candidateFiles;
      packet = candidatePacket;
    }
  }

  if (input.gitDiff.status === 'included' && input.gitDiff.diff.length > 0) {
    const candidatePacket = renderPacket(input, selectedFiles, input.gitDiff, false);

    if (candidatePacket.estimatedTokens <= input.budget) {
      gitDiff = input.gitDiff;
      packet = candidatePacket;
    }
  }

  for (const file of lowerPriorityFiles) {
    const candidateFiles = includeFile(selectedFiles, file);
    const candidatePacket = renderPacket(input, candidateFiles, gitDiff, false);

    if (candidatePacket.estimatedTokens <= input.budget) {
      selectedFiles = candidateFiles;
      packet = candidatePacket;
    }
  }

  return packet;
}

function omitAllFileContents(files: RenderedSelectedFile[]): RenderedSelectedFile[] {
  return files.map((file) => {
    if (file.skippedReason || file.content === undefined) {
      return { ...file };
    }

    return {
      ...file,
      content: undefined,
      omittedReason: FILE_OMITTED_REASON,
    };
  });
}

function omitGitDiff(gitDiff: GitDiffResult): GitDiffResult {
  if (gitDiff.status !== 'included') {
    return { ...gitDiff };
  }

  return {
    ...gitDiff,
    status: 'omitted',
    diff: '',
  };
}

function includeFile(
  files: RenderedSelectedFile[],
  fileToInclude: RenderedSelectedFile,
): RenderedSelectedFile[] {
  return files.map((file) => {
    if (file.relativePath !== fileToInclude.relativePath) {
      return file;
    }

    return {
      ...file,
      content: fileToInclude.content,
      omittedReason: undefined,
    };
  });
}

function renderPacket(
  input: PacketCandidates,
  selectedFiles: RenderedSelectedFile[],
  gitDiff: GitDiffResult,
  mandatorySectionsExceedBudget: boolean,
): BudgetedPacket {
  const warnings = buildWarnings(selectedFiles, gitDiff, mandatorySectionsExceedBudget);
  const maxEstimateDigits = String(Number.MAX_SAFE_INTEGER).length;

  for (let digitCount = 1; digitCount <= maxEstimateDigits; digitCount += 1) {
    const placeholderEstimate = 10 ** (digitCount - 1);
    const placeholderMarkdown = renderMarkdown({
      ...input,
      selectedFiles,
      gitDiff,
      estimatedTokens: placeholderEstimate,
      warnings,
    });
    const estimatedTokens = estimateTokens(placeholderMarkdown);

    if (String(estimatedTokens).length !== digitCount) {
      continue;
    }

    const markdown = renderMarkdown({
      ...input,
      selectedFiles,
      gitDiff,
      estimatedTokens,
      warnings,
    });

    return { markdown, estimatedTokens, selectedFiles, gitDiff, warnings };
  }

  throw new Error('Unable to calculate a stable token estimate.');
}

function buildWarnings(
  selectedFiles: RenderedSelectedFile[],
  gitDiff: GitDiffResult,
  mandatorySectionsExceedBudget: boolean,
): string[] {
  const omittedFileCount = selectedFiles.filter(
    (file) => file.omittedReason === FILE_OMITTED_REASON,
  ).length;
  const warnings: string[] = [];

  if (omittedFileCount > 0) {
    const verb = omittedFileCount === 1 ? 'was' : 'were';
    warnings.push(
      `${omittedFileCount} file content${omittedFileCount === 1 ? '' : 's'} ${verb} omitted to fit the token budget.`,
    );
  }

  if (gitDiff.status === 'omitted') {
    warnings.push('git diff was omitted to fit the token budget.');
  }

  if (mandatorySectionsExceedBudget) {
    warnings.push('mandatory packet sections already exceed the requested token budget.');
  }

  return warnings;
}
