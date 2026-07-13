import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../src/core/renderMarkdown';
import { ContextPacketInput } from '../src/types';

describe('renderMarkdown', () => {
  it('renders the main packet sections and selected file context', () => {
    const markdown = renderMarkdown(createInput());

    expect(markdown).toContain('Why these files were selected');
    expect(markdown).toContain('Instructions for the AI');
    expect(markdown).toContain('src/auth/login.ts');
    expect(markdown).toContain('TypeError: cannot read id');
  });

  it('renders an accurate empty git diff message', () => {
    const markdown = renderMarkdown(createInput());

    expect(markdown).toContain('Git diff is empty.');
  });

  it('renders an accurate unavailable git diff message', () => {
    const markdown = renderMarkdown(
      createInput({
        status: 'unavailable',
        diff: '',
        note: 'Git diff was unavailable.',
      }),
    );

    expect(markdown).toContain('Git diff is unavailable');
  });

  it('renders budget omission messages for files and git diff', () => {
    const input = createInput({
      status: 'omitted',
      diff: '',
    });
    input.selectedFiles[0].content = undefined;
    input.selectedFiles[0].omittedReason = 'Omitted to fit the token budget.';

    const markdown = renderMarkdown(input);

    expect(markdown).toContain('Omitted to fit the token budget.');
    expect(markdown).toContain('Git diff was omitted to fit the token budget.');
  });
});

function createInput(gitDiff: ContextPacketInput['gitDiff'] = {
  status: 'empty',
  diff: '',
  note: 'No git diff output was found.',
}): ContextPacketInput {
  return {
    mode: 'bug',
    projectPath: '/repo',
    errorFile: '/repo/error.txt',
    errorText: 'TypeError: cannot read id',
    selectedFiles: [
      {
        relativePath: 'src/auth/login.ts',
        absolutePath: '/repo/src/auth/login.ts',
        reason: 'mentioned in stack trace',
        priority: 1,
        size: 42,
        content: 'export function login() {}',
      },
    ],
    gitDiff,
    budget: 25000,
    estimatedTokens: 100,
    generatedAt: '2026-07-06T00:00:00.000Z',
    warnings: [],
  };
}
