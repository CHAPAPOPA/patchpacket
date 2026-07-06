import { describe, expect, it } from 'vitest';
import { parseError } from '../src/core/parseError';

describe('parseError', () => {
  it('extracts common JavaScript and Python stack trace paths', () => {
    const parsed = parseError(`
TypeError: nope
    at src/auth/login.ts:42:15
    at Object.<anonymous> (/project/src/index.ts:10:5)
  File "src/app.py", line 10
`);

    expect(parsed).toEqual(
      expect.arrayContaining([
        { rawPath: 'src/auth/login.ts', line: 42, column: 15 },
        { rawPath: '/project/src/index.ts', line: 10, column: 5 },
        { rawPath: 'src/app.py', line: 10, column: undefined },
      ]),
    );
  });

  it('extracts Windows-style stack trace paths', () => {
    const parsed = parseError('src\\auth\\login.ts:42:15');

    expect(parsed).toEqual([{ rawPath: 'src\\auth\\login.ts', line: 42, column: 15 }]);
  });

  it('ignores runtime scheme frames', () => {
    const parsed = parseError('at node:internal/modules/cjs/loader:1000:10');

    expect(parsed).toEqual([]);
  });
});
