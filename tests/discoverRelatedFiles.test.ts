import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  discoverRelatedFiles,
  MAX_RELATED_DEPTH,
  MAX_RELATED_FILES,
} from '../src/core/discoverRelatedFiles';
import { normalizeRelativePath } from '../src/core/fileUtils';
import { ProjectFile, SelectedFile } from '../src/types';

describe('discoverRelatedFiles', () => {
  it.each([
    ['an explicit extension', "import value from './explicit.ts';", 'src/explicit.ts', 'imported by src/main.ts'],
    ['an extensionless TypeScript import', "import value from './extensionless';", 'src/extensionless.ts', 'imported by src/main.ts'],
    ['a CommonJS require', "const value = require('./required');", 'src/required.js', 'required by src/main.js'],
    ['a literal dynamic import', "import('./dynamic');", 'src/dynamic.ts', 'dynamically imported by src/main.ts'],
    ['an awaited literal dynamic import', "const value = await import('./awaited');", 'src/awaited.ts', 'dynamically imported by src/main.ts'],
    ['a named re-export', "export { value } from './named';", 'src/named.ts', 're-exported by src/main.ts'],
    ['an export star', "export * from './star';", 'src/star.ts', 're-exported by src/main.ts'],
  ])('%s', (_description, mainSource, relatedPath, reason) => {
    const mainPath = reason.includes('src/main.js') ? 'src/main.js' : 'src/main.ts';

    withProject(
      {
        [mainPath]: mainSource,
        [relatedPath]: '',
      },
      ({ projectPath, scannedFiles }) => {
        expect(discover(projectPath, scannedFiles, mainPath)).toEqual([
          expect.objectContaining({ relativePath: relatedPath, priority: 2, reason }),
        ]);
      },
    );
  });

  it('resolves directory index files and JSON dependencies', () => {
    withProject(
      {
        'src/main.ts': "import directory from './directory';\nimport config from './config';",
        'src/directory/index.ts': '',
        'src/config.json': '{}',
      },
      ({ projectPath, scannedFiles }) => {
        expect(paths(discover(projectPath, scannedFiles, 'src/main.ts'))).toEqual([
          'src/config.json',
          'src/directory/index.ts',
        ]);
      },
    );
  });

  it('uses deterministic resolution precedence and preserves case-sensitive matches', () => {
    withProject(
      {
        'src/main.ts': "import './module';\nimport './CaseSensitive';",
        'src/module.ts': '',
        'src/module.js': '',
        'src/module/index.ts': '',
        'src/casesensitive.ts': '',
      },
      ({ projectPath, scannedFiles }) => {
        expect(paths(discover(projectPath, scannedFiles, 'src/main.ts'))).toEqual([
          'src/module.ts',
        ]);
      },
    );
  });

  it('does not resolve a reference that escapes the project directory', () => {
    withProject(
      {
        'src/main.ts': "import '../../outside';",
        'outside.ts': '',
      },
      ({ projectPath, scannedFiles }) => {
        expect(discover(projectPath, scannedFiles, 'src/main.ts')).toEqual([]);
      },
    );
  });

  it.each(['.tsx', '.js', '.jsx', '.mjs', '.cjs'])(
    'resolves an extensionless %s dependency',
    (extension) => {
      withProject(
        {
          'src/main.ts': "import value from './module';",
          [`src/module${extension}`]: '',
        },
        ({ projectPath, scannedFiles }) => {
          expect(paths(discover(projectPath, scannedFiles, 'src/main.ts'))).toEqual([
            `src/module${extension}`,
          ]);
        },
      );
    },
  );

  it('ignores package, Node.js, alias, URL, non-literal, and template imports', () => {
    withProject(
      {
        'src/main.ts': [
          "import React from 'react';",
          "import fs from 'node:fs';",
          "import alias from '@/module';",
          "import url from 'https://example.com/module.js';",
          'const missing = import(variable);',
          'const template = import(`./modules/${name}.js`);',
          "const prose = \"import './prose'\";",
          "// import './comment';",
          "/* const value = require('./block'); */",
        ].join('\n'),
        'src/module.ts': '',
        'src/modules/ignored.js': '',
        'src/prose.ts': '',
        'src/comment.ts': '',
        'src/block.ts': '',
      },
      ({ projectPath, scannedFiles }) => {
        expect(discover(projectPath, scannedFiles, 'src/main.ts')).toEqual([]);
      },
    );
  });

  it('ignores missing and unscanned local files', () => {
    withProject(
      {
        'src/main.ts': "import missing from './missing';\nimport ignored from './ignored';",
        'src/ignored.ts': '',
      },
      ({ projectPath, scannedFiles }) => {
        expect(discover(projectPath, scannedFiles.filter((file) => file.relativePath !== 'src/ignored.ts'), 'src/main.ts')).toEqual([]);
      },
    );
  });

  it('deduplicates references and terminates circular imports', () => {
    withProject(
      {
        'src/main.ts': "import './a';\nimport './a';",
        'src/a.ts': "import './main';\nimport './b';",
        'src/b.ts': "import './a';\nimport './b';",
      },
      ({ projectPath, scannedFiles }) => {
        const related = discover(projectPath, scannedFiles, 'src/main.ts');

        expect(paths(related)).toEqual(['src/a.ts', 'src/b.ts']);
        expect(related[0].reason).toBe('imported by src/main.ts');
      },
    );
  });

  it('combines distinct reasons when a previously discovered file is found again', () => {
    withProject(
      {
        'src/main.ts': "import './a';\nimport './shared';",
        'src/a.ts': "import './shared';",
        'src/shared.ts': '',
      },
      ({ projectPath, scannedFiles }) => {
        const shared = discover(projectPath, scannedFiles, 'src/main.ts').find(
          (file) => file.relativePath === 'src/shared.ts',
        );

        expect(shared?.reason).toBe('imported by src/main.ts; imported by src/a.ts');
      },
    );
  });

  it('processes multiple stack-trace seeds alphabetically and combines their reasons', () => {
    withProject(
      {
        'src/z-seed.ts': "import './shared';\nimport './z-only';",
        'src/a-seed.ts': "import './shared';\nimport './a-only';",
        'src/shared.ts': '',
        'src/a-only.ts': '',
        'src/z-only.ts': '',
      },
      ({ projectPath, scannedFiles }) => {
        const related = discover(projectPath, scannedFiles, ['src/z-seed.ts', 'src/a-seed.ts']);

        expect(paths(related)).toEqual([
          'src/a-only.ts',
          'src/shared.ts',
          'src/z-only.ts',
        ]);
        expect(related.find((file) => file.relativePath === 'src/shared.ts')?.reason).toBe(
          'imported by src/a-seed.ts; imported by src/z-seed.ts',
        );
      },
    );
  });

  it('enforces the traversal depth limit', () => {
    withProject(
      {
        'src/main.ts': "import './one';",
        'src/one.ts': "import './two';",
        'src/two.ts': "import './three';",
        'src/three.ts': '',
      },
      ({ projectPath, scannedFiles }) => {
        expect(MAX_RELATED_DEPTH).toBe(2);
        expect(paths(discover(projectPath, scannedFiles, 'src/main.ts'))).toEqual([
          'src/one.ts',
          'src/two.ts',
        ]);
      },
    );
  });

  it('enforces the related file limit in alphabetical order', () => {
    const files: Record<string, string> = {
      'src/main.ts': Array.from({ length: 14 }, (_, index) => {
        const suffix = String(index + 1).padStart(2, '0');
        return `import './dep-${suffix}';`;
      }).join('\n'),
    };

    for (let index = 1; index <= 14; index += 1) {
      const suffix = String(index).padStart(2, '0');
      files[`src/dep-${suffix}.ts`] = '';
    }

    withProject(files, ({ projectPath, scannedFiles }) => {
      expect(MAX_RELATED_FILES).toBe(12);
      expect(paths(discover(projectPath, scannedFiles, 'src/main.ts'))).toEqual(
        Array.from({ length: 12 }, (_, index) => `src/dep-${String(index + 1).padStart(2, '0')}.ts`),
      );
    });
  });

  it('uses normalized relative paths for deterministic equal-depth order', () => {
    withProject(
      {
        'src/main.ts': "import './z';\nimport './a';",
        'src/a.ts': '',
        'src/z.ts': '',
      },
      ({ projectPath, scannedFiles }) => {
        expect(paths(discover(projectPath, scannedFiles, 'src\\nested\\..\\main.ts'))).toEqual([
          'src/a.ts',
          'src/z.ts',
        ]);
      },
    );
  });

  it('finds scripts referenced by a stack-trace HTML file and strips URL suffixes', () => {
    withProject(
      {
        'index.html': [
          '<script src="./assets/app.js?v=4#module"></script>',
          "<script data-name='legacy' src='./assets/legacy.js' type='module'></script>",
          '<script src="https://example.com/external.js"></script>',
        ].join('\n'),
        'assets/app.js': '',
        'assets/legacy.js': '',
      },
      ({ projectPath, scannedFiles }) => {
        expect(discover(projectPath, scannedFiles, 'index.html')).toEqual(
          ['assets/app.js', 'assets/legacy.js'].map((relativePath) =>
            expect.objectContaining({
              relativePath,
              priority: 2,
              reason: 'referenced by stack-trace HTML file',
            }),
          ),
        );
      },
    );
  });

  it('finds an HTML entrypoint referencing a stack-trace source file', () => {
    withProject(
      {
        'index.htm': '<script type="module" src="./src/main.js"></script>',
        'src/main.js': '',
      },
      ({ projectPath, scannedFiles }) => {
        expect(discover(projectPath, scannedFiles, 'src/main.js')).toEqual([
          expect.objectContaining({
            relativePath: 'index.htm',
            priority: 2,
            reason: 'HTML entrypoint referencing stack-trace file',
          }),
        ]);
      },
    );
  });

  it('does not resolve external HTML script sources', () => {
    withProject(
      {
        'index.html': [
          '<script src="http://example.com/app.js"></script>',
          '<script src="//cdn.example.com/app.js"></script>',
          '<script src="data:text/javascript,console.log(1)"></script>',
        ].join('\n'),
      },
      ({ projectPath, scannedFiles }) => {
        expect(discover(projectPath, scannedFiles, 'index.html')).toEqual([]);
      },
    );
  });
});

function discover(
  projectPath: string,
  scannedFiles: ProjectFile[],
  stackTracePaths: string | string[],
): SelectedFile[] {
  const pathsToResolve = Array.isArray(stackTracePaths) ? stackTracePaths : [stackTracePaths];
  const stackTraceFiles = pathsToResolve.map((stackTracePath) => {
    const normalizedPath = normalizeRelativePath(stackTracePath);
    const stackTraceFile = scannedFiles.find((file) => file.relativePath === normalizedPath);

    if (!stackTraceFile) {
      throw new Error(`Missing stack-trace file: ${stackTracePath}`);
    }

    return {
      relativePath: stackTracePath,
      absolutePath: stackTraceFile.absolutePath,
      reason: 'mentioned in stack trace',
      priority: 1 as const,
    };
  });

  return discoverRelatedFiles(projectPath, scannedFiles, stackTraceFiles);
}

function paths(files: SelectedFile[]): string[] {
  return files.map((file) => file.relativePath);
}

function withProject(
  files: Record<string, string>,
  callback: (fixture: { projectPath: string; scannedFiles: ProjectFile[] }) => void,
): void {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'patchpacket-related-'));

  try {
    for (const [relativePath, content] of Object.entries(files)) {
      const absolutePath = path.join(projectPath, relativePath);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, content, 'utf8');
    }

    const scannedFiles = Object.keys(files).map((relativePath) => {
      const absolutePath = path.join(projectPath, relativePath);

      return {
        relativePath,
        absolutePath,
        size: fs.statSync(absolutePath).size,
      };
    });

    callback({ projectPath, scannedFiles });
  } finally {
    fs.rmSync(projectPath, { recursive: true, force: true });
  }
}
