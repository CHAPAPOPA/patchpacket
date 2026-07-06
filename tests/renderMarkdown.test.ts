import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../src/core/renderMarkdown';
import { ContextPacketInput } from '../src/types';

describe('renderMarkdown', () => {
  it('renders the main packet sections and selected file context', () => {
    const input: ContextPacketInput = {
      mode: 'bug',
      projectPath: '/repo',
      errorFile: '/repo/error.txt',
      errorText: 'TypeError: cannot read id',
      selectedFiles: [
        {
          relativePath: 'src/auth/login.ts',
          absolutePath: '/repo/src/auth/login.ts',
          reason: 'mentioned in stack trace',
          size: 42,
          content: 'export function login() {}',
        },
      ],
      gitDiff: {
        status: 'empty',
        diff: '',
        note: 'No git diff output was found.',
      },
      budget: 25000,
      estimatedTokens: 100,
      generatedAt: '2026-07-06T00:00:00.000Z',
      warnings: [],
    };

    const markdown = renderMarkdown(input);

    expect(markdown).toContain('Why these files were selected');
    expect(markdown).toContain('Instructions for the AI');
    expect(markdown).toContain('src/auth/login.ts');
    expect(markdown).toContain('TypeError: cannot read id');
  });
});
