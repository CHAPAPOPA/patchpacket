import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createCli } from '../src/cli';

describe('createCli', () => {
  it('uses the package.json version', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as { version: string };

    expect(createCli().version()).toBe(packageJson.version);
  });
});
