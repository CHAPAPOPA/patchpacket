import { ContextPacketInput } from '../types';

const manifestAndConfigFileNames = new Set([
  'package.json',
  'tsconfig.json',
  '.env.example',
  'vite.config.ts',
  'vite.config.js',
  'vite.config.mjs',
  'vite.config.cjs',
  'next.config.ts',
  'next.config.js',
  'next.config.mjs',
  'next.config.cjs',
  'webpack.config.ts',
  'webpack.config.js',
  'webpack.config.mjs',
  'webpack.config.cjs',
]);

export function renderMarkdown(input: ContextPacketInput): string {
  const sections = [
    '# PatchPacket Context',
    '## Task',
    'Help debug the following error.',
    '## Summary',
    renderSummary(input),
    '## Error',
    fencedCode('text', input.errorText),
    '## Why these files were selected',
    renderSelectionTable(input),
    '## Project Snapshot',
    renderProjectSnapshot(input),
    '## Git Diff',
    renderGitDiff(input),
    '## Related Files',
    renderRelatedFiles(input),
    '## Instructions for the AI',
    renderInstructions(),
  ];

  return `${sections.join('\n\n')}\n`;
}

function renderSummary(input: ContextPacketInput): string {
  const warningLines = input.warnings.map((warning) => `- Warning: ${warning}`);

  return [
    `- Mode: ${input.mode}`,
    `- Project path: ${input.projectPath}`,
    `- Error file: ${input.errorFile}`,
    `- Token budget: ${input.budget}`,
    `- Estimated tokens: ${input.estimatedTokens}`,
    `- Generated at: ${input.generatedAt}`,
    ...warningLines,
  ].join('\n');
}

function renderSelectionTable(input: ContextPacketInput): string {
  if (input.selectedFiles.length === 0) {
    return 'No files were selected from the error context.';
  }

  return [
    '| File | Reason |',
    '| --- | --- |',
    ...input.selectedFiles.map(
      (file) => `| ${escapeTableCell(file.relativePath)} | ${escapeTableCell(file.reason)} |`,
    ),
  ].join('\n');
}

function renderProjectSnapshot(input: ContextPacketInput): string {
  const manifestAndConfigFiles = input.selectedFiles
    .map((file) => file.relativePath)
    .filter(isManifestOrConfigFile);

  return [
    `- Selected files: ${input.selectedFiles.length}`,
    `- Git diff: ${input.gitDiff.status}`,
    `- Included manifest/config files: ${manifestAndConfigFiles.join(', ') || 'none'}`,
  ].join('\n');
}

function renderGitDiff(input: ContextPacketInput): string {
  if (input.gitDiff.status === 'included') {
    return fencedCode('diff', input.gitDiff.diff);
  }

  return 'No git diff found or project is not a git repository.';
}

function renderRelatedFiles(input: ContextPacketInput): string {
  if (input.selectedFiles.length === 0) {
    return 'No related files were selected.';
  }

  return input.selectedFiles
    .map((file) => {
      if (file.skippedReason) {
        return [`### ${file.relativePath}`, '', file.skippedReason].join('\n');
      }

      return [
        `### ${file.relativePath}`,
        '',
        fencedCode(languageForPath(file.relativePath), file.content ?? ''),
      ].join('\n');
    })
    .join('\n\n');
}

function renderInstructions(): string {
  return [
    '- Focus on the provided error and selected files.',
    '- Do not rewrite unrelated parts of the project.',
    '- Prefer a minimal fix.',
    '- If the root cause is uncertain, explain the likely causes first.',
    '- Mention if more files are needed.',
  ].join('\n');
}

function fencedCode(language: string, content: string): string {
  return `\`\`\`${language}\n${escapeCodeFence(content)}\n\`\`\``;
}

function escapeCodeFence(content: string): string {
  return content.replace(/```/g, '``\\`');
}

function languageForPath(filePath: string): string {
  if (filePath.endsWith('.tsx')) {
    return 'tsx';
  }
  if (filePath.endsWith('.ts')) {
    return 'ts';
  }
  if (filePath.endsWith('.jsx')) {
    return 'jsx';
  }
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
    return 'js';
  }
  if (filePath.endsWith('.json')) {
    return 'json';
  }
  if (filePath.endsWith('.md')) {
    return 'md';
  }
  if (filePath.endsWith('.py')) {
    return 'py';
  }
  return 'text';
}

function isManifestOrConfigFile(filePath: string): boolean {
  const fileName = filePath.split('/').at(-1) ?? filePath;

  return (
    manifestAndConfigFileNames.has(fileName) ||
    /^(vite|next|webpack)\.config\.(ts|js|mjs|cjs|mts|cts)$/i.test(fileName)
  );
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}
