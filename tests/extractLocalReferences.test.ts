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
        '<script src=./unquoted.js></script>',
      ].join('\n')),
    ).toEqual([]);
  });
});
