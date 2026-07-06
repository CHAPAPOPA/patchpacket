import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { BugCommandOptions } from '../types';
import { readTextFile } from '../core/fileUtils';
import { getGitDiff } from '../core/git';
import { parseError } from '../core/parseError';
import { renderMarkdown } from '../core/renderMarkdown';
import { scanProject } from '../core/scanProject';
import { selectFiles } from '../core/selectFiles';
import { estimateTokens } from '../core/tokenEstimate';

const MAX_SELECTED_FILE_CONTENT_BYTES = 200 * 1024;

export async function runBugCommand(projectPathInput: string, options: BugCommandOptions): Promise<void> {
  const projectPath = path.resolve(projectPathInput);
  const errorFile = path.resolve(options.errorFile);
  const outFile = path.resolve(options.out);

  if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
    throw new Error(`Project path does not exist or is not a directory: ${projectPath}`);
  }

  if (!fs.existsSync(errorFile) || !fs.statSync(errorFile).isFile()) {
    throw new Error(`Error file does not exist: ${errorFile}`);
  }

  const errorText = readTextFile(errorFile);
  const parsedStackFiles = parseError(errorText);
  const scannedFiles = await scanProject(projectPath, {
    include: options.include,
    exclude: options.exclude,
  });
  const selectedFiles = selectFiles(projectPath, scannedFiles, parsedStackFiles).map((file) => {
    const size = fs.statSync(file.absolutePath).size;

    if (size > MAX_SELECTED_FILE_CONTENT_BYTES) {
      return {
        ...file,
        size,
        skippedReason: 'File skipped because it exceeds the 200 KB inline size limit.',
      };
    }

    return {
      ...file,
      size,
      content: readTextFile(file.absolutePath),
    };
  });
  const gitDiff = getGitDiff(projectPath);
  const generatedAt = new Date().toISOString();
  const packetInput = {
    mode: 'bug',
    projectPath,
    errorFile,
    errorText,
    selectedFiles,
    gitDiff,
    budget: options.budget,
    generatedAt,
  } as const;
  const { markdown, estimatedTokens } = renderWithStableEstimate(packetInput);

  if (options.stdout) {
    process.stdout.write(markdown);
  } else {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, markdown, 'utf8');
    process.stdout.write(`${pc.green('Wrote')} ${outFile}\n`);
  }

  process.stderr.write(
    `${pc.cyan('PatchPacket')} selected ${selectedFiles.length} file(s), estimated ${estimatedTokens} token(s) against budget ${options.budget}.\n`,
  );

  if (estimatedTokens > options.budget) {
    process.stderr.write(`${pc.yellow('Warning:')} estimated tokens exceed budget.\n`);
  }
}

function renderWithStableEstimate(
  input: Omit<Parameters<typeof renderMarkdown>[0], 'estimatedTokens' | 'warnings'>,
): { markdown: string; estimatedTokens: number } {
  let estimatedTokens = 0;
  let markdown = '';

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const warnings =
      estimatedTokens > input.budget
        ? [`estimated tokens exceed budget by ${estimatedTokens - input.budget}`]
        : [];

    markdown = renderMarkdown({
      ...input,
      estimatedTokens,
      warnings,
    });

    const nextEstimate = estimateTokens(markdown);

    if (nextEstimate === estimatedTokens) {
      break;
    }

    estimatedTokens = nextEstimate;
  }

  const warnings =
    estimatedTokens > input.budget
      ? [`estimated tokens exceed budget by ${estimatedTokens - input.budget}`]
      : [];

  markdown = renderMarkdown({
    ...input,
    estimatedTokens,
    warnings,
  });

  return { markdown, estimatedTokens };
}
