import { describe, expect, it } from 'vitest';
import {
  extractLocalHtmlScriptSources,
  extractLocalSourceReferences,
} from '../src/core/extractLocalReferences';

describe('extractLocalSourceReferences', () => {
  it('recognizes literal require and dynamic import calls without requiring an assignment', () => {
    const references = extractLocalSourceReferences([
      "require('./required');",
      "import('./dynamic');",
      "await import('./awaited');",
    ].join('\n'));

    expect(references).toEqual([
      { specifier: './required', kind: 'require' },
      { specifier: './dynamic', kind: 'dynamic-import' },
      { specifier: './awaited', kind: 'dynamic-import' },
    ]);
  });

  it('recognizes TypeScript type-only named and star re-exports', () => {
    const references = extractLocalSourceReferences([
      "export type { User } from './types';",
      "export type * from './models';",
      "export type { External } from 'external-package';",
    ].join('\n'));

    expect(references).toEqual([
      { specifier: './types', kind: 're-export' },
      { specifier: './models', kind: 're-export' },
    ]);
  });

  it.each([
    [
      'a simple template',
      "const value = `simple`; import('./after-simple');",
      { specifier: './after-simple', kind: 'dynamic-import' },
    ],
    [
      'escaped backticks',
      "const value = `escaped " + "\\`" + " tick`; import('./after-escaped');",
      { specifier: './after-escaped', kind: 'dynamic-import' },
    ],
    [
      'a nested template',
      "const value = `outer ${`inner`} end`; import('./after-template');",
      { specifier: './after-template', kind: 'dynamic-import' },
    ],
    [
      'nested templates and conditional expressions',
      "const value = `outer ${condition ? `yes ${name}` : `no`} end`; import './after-nested-template';",
      { specifier: './after-nested-template', kind: 'import' },
    ],
    [
      'nested braces, strings, and comments in a template expression',
      "const value = `outer ${(() => { /* } ` */ return { nested: \"}\" }; })()} end`; import './after-braces';",
      { specifier: './after-braces', kind: 'import' },
    ],
  ])('resumes scanning after %s', (_description, source, expectedReference) => {
    expect(extractLocalSourceReferences(source)).toEqual([expectedReference]);
  });

  it('handles an unterminated nested template without throwing or exposing hidden imports', () => {
    const source = "const value = `outer ${`inner ${name}`; import('./hidden');";

    expect(extractLocalSourceReferences(source)).toEqual([]);
  });

  it.each([
    [
      'a JSX closing tag',
      "const view = <div></div>; import('./after-jsx');",
      { specifier: './after-jsx', kind: 'dynamic-import' },
    ],
    [
      'nested JSX closing tags',
      "const view = <section><div></div></section>; require('./after-nested-jsx');",
      { specifier: './after-nested-jsx', kind: 'require' },
    ],
  ])('resumes scanning after %s', (_description, source, expectedReference) => {
    expect(extractLocalSourceReferences(source)).toEqual([expectedReference]);
  });

  it('ignores import-like text in comments, strings, templates, and regular expressions', () => {
    const references = extractLocalSourceReferences([
      "// import './line-comment';",
      "/* require('./block-comment'); */",
      "const prose = \"import './string'\";",
      "const template = `import './template'`;",
      "const expression = `import './templates/${name}.js'`;",
      "const pattern = /import '.\\/regex'/;",
      "const requiredPattern = /require\\('\\.\\/required-regex'\\)/;",
      "if (ready) /import '.\\/conditional-regex'/.test(source);",
      "loader.import('./method');",
      "loader.require('./required-method');",
      "import './real';",
    ].join('\n'));

    expect(references).toEqual([{ specifier: './real', kind: 'import' }]);
  });

  it('continues masking a regular expression after a comparison operator', () => {
    const references = extractLocalSourceReferences(
      "const pattern = value < /import '.\\/fake'/; import('./real');",
    );

    expect(references).toEqual([{ specifier: './real', kind: 'dynamic-import' }]);
  });

  it('ignores malformed literals without hiding valid references on later lines', () => {
    const references = extractLocalSourceReferences([
      "import './unterminated",
      "import './real';",
      "const broken = /import '.\\/regex'",
      "import './after-regex';",
    ].join('\n'));

    expect(references).toEqual([
      { specifier: './real', kind: 'import' },
      { specifier: './after-regex', kind: 'import' },
    ]);
  });

  it('does not treat division as a regular-expression literal', () => {
    const references = extractLocalSourceReferences([
      'const ratio = total / count;',
      "import './real';",
    ].join('\n'));

    expect(references).toEqual([{ specifier: './real', kind: 'import' }]);
  });
});

describe('extractLocalHtmlScriptSources', () => {
  it('supports single and double quotes, attribute ordering, and URL suffix stripping', () => {
    expect(
      extractLocalHtmlScriptSources([
        "<script data-name='app' src='./app.js?v=4#module' type='module'></script>",
        '<script type="module" defer src="../shared/main.ts#entry"></script>',
      ].join('\n')),
    ).toEqual(['./app.js', '../shared/main.ts']);
  });

  it('ignores comments, inline scripts, external sources, and unquoted sources', () => {
    expect(
      extractLocalHtmlScriptSources([
        '<!-- <script src="./commented.js"></script> -->',
        '<script>import "./inline.js";</script>',
        '<script src="https://example.com/app.js"></script>',
        '<script src="//cdn.example.com/app.js"></script>',
        '<script src="data:text/javascript,console.log(1)"></script>',
        '<script data-src="./lazy.js"></script>',
        '<script :src="./bound.js"></script>',
        '<script x-src="./prefixed.js"></script>',
        '<script src=./unquoted.js></script>',
      ].join('\n')),
    ).toEqual([]);
  });

  it('does not treat src-like text inside another attribute as a real src attribute', () => {
    expect(
      extractLocalHtmlScriptSources([
        "<script title=\"src='./fake.js'\"></script>",
        "<script data-info='src=\"./also-fake.js\"'></script>",
      ].join('\n')),
    ).toEqual([]);
  });

  it('selects only the exact quoted src attribute from a script opening tag', () => {
    expect(
      extractLocalHtmlScriptSources(
        "<script title=\"src='./fake.js'\" data-src='./lazy.js' SRC=\"./real.js?v=4#module\"></script>",
      ),
    ).toEqual(['./real.js']);
  });
});
