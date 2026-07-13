import { describe, expect, it } from 'vitest';
import { applyTokenBudget } from '../src/core/applyTokenBudget';
import { estimateTokens } from '../src/core/tokenEstimate';
import { ContextPacketInput, RenderedSelectedFile, SelectedFilePriority } from '../src/types';

type PacketCandidates = Omit<ContextPacketInput, 'estimatedTokens' | 'warnings'>;

describe('applyTokenBudget', () => {
  it('keeps all selected file contents and the git diff with a generous budget', () => {
    const packet = applyTokenBudget(
      createInput({
        budget: 10000,
        gitDiff: { status: 'included', diff: 'diff --git a/a.ts b/a.ts\n+added line\n' },
      }),
    );

    expect(packet.selectedFiles.every((file) => file.content !== undefined)).toBe(true);
    expect(packet.gitDiff.status).toBe('included');
    expect(packet.estimatedTokens).toBeLessThanOrEqual(10000);
    expect(estimateTokens(packet.markdown)).toBe(packet.estimatedTokens);
  });

  it('omits lower-priority config and README content before a stack-trace file', () => {
    const packet = applyTokenBudget(
      createInput({
        budget: 700,
        selectedFiles: [
          selectedFile('src/cli.ts', 1, 'stack file\n'.repeat(40)),
          selectedFile('package.json', 4, 'config\n'.repeat(700)),
          selectedFile('README.md', 5, 'readme\n'.repeat(700)),
        ],
      }),
    );

    expect(fileByPath(packet, 'src/cli.ts').content).toContain('stack file');
    expect(fileByPath(packet, 'package.json').omittedReason).toBe(
      'Omitted to fit the token budget.',
    );
    expect(fileByPath(packet, 'README.md').omittedReason).toBe(
      'Omitted to fit the token budget.',
    );
    expect(packet.markdown).toContain('| package.json | project manifest |');
    expect(packet.markdown).toContain('### package.json\n\nOmitted to fit the token budget.');
  });

  it('includes a git diff when it fits', () => {
    const packet = applyTokenBudget(
      createInput({
        budget: 10000,
        gitDiff: { status: 'included', diff: 'diff --git a/src/cli.ts b/src/cli.ts\n+line\n' },
      }),
    );

    expect(packet.gitDiff.status).toBe('included');
    expect(packet.markdown).toContain('```diff');
  });

  it('omits a git diff when it does not fit', () => {
    const packet = applyTokenBudget(
      createInput({
        budget: 700,
        selectedFiles: [selectedFile('src/cli.ts', 1, 'stack file\n'.repeat(20))],
        gitDiff: { status: 'included', diff: 'diff line\n'.repeat(1000) },
      }),
    );

    expect(packet.gitDiff.status).toBe('omitted');
    expect(packet.markdown).toContain('Git diff was omitted to fit the token budget.');
    expect(packet.warnings).toContain('git diff was omitted to fit the token budget.');
  });

  it('reports when mandatory packet sections already exceed the budget', () => {
    const packet = applyTokenBudget(createInput({ budget: 1, selectedFiles: [] }));

    expect(packet.estimatedTokens).toBeGreaterThan(1);
    expect(packet.markdown).toContain(
      'Warning: mandatory packet sections already exceed the requested token budget.',
    );
  });

  it('uses alphabetical paths to break priority ties', () => {
    const packet = applyTokenBudget(
      createInput({
        budget: 850,
        selectedFiles: [
          selectedFile('src/z.ts', 1, 'z'.repeat(1800)),
          selectedFile('src/a.ts', 1, 'a'.repeat(1800)),
        ],
      }),
    );

    expect(fileByPath(packet, 'src/a.ts').content).toBe('a'.repeat(1800));
    expect(fileByPath(packet, 'src/z.ts').omittedReason).toBe(
      'Omitted to fit the token budget.',
    );
  });
});

function createInput(overrides: Partial<PacketCandidates> = {}): PacketCandidates {
  return {
    mode: 'bug',
    projectPath: '/repo',
    errorFile: '/repo/error.txt',
    errorText: 'TypeError: cannot read id',
    selectedFiles: [
      selectedFile('src/cli.ts', 1, 'export function createCli() {}'),
      selectedFile('package.json', 4, '{"name":"example"}'),
      selectedFile('README.md', 5, '# Example'),
    ],
    gitDiff: { status: 'empty', diff: '' },
    budget: 25000,
    generatedAt: '2026-07-13T00:00:00.000Z',
    ...overrides,
  };
}

function selectedFile(
  relativePath: string,
  priority: SelectedFilePriority,
  content: string,
): RenderedSelectedFile {
  return {
    relativePath,
    absolutePath: `/repo/${relativePath}`,
    reason:
      priority === 1 ? 'mentioned in stack trace' : priority === 5 ? 'project README' : 'project manifest',
    priority,
    size: Buffer.byteLength(content),
    content,
  };
}

function fileByPath(packet: ReturnType<typeof applyTokenBudget>, relativePath: string): RenderedSelectedFile {
  const file = packet.selectedFiles.find((candidate) => candidate.relativePath === relativePath);

  if (!file) {
    throw new Error(`Missing selected file: ${relativePath}`);
  }

  return file;
}
