import { toPosixPath } from './fileUtils';

export type ReferenceKind = 'import' | 'require' | 'dynamic-import' | 're-export';

export interface LocalReference {
  specifier: string;
  kind: ReferenceKind;
}

const stringTokenPrefix = '__PATCHPACKET_STRING_';
const maxTemplateNesting = 64;
const regexPrefixKeywords = new Set([
  'await',
  'case',
  'delete',
  'do',
  'else',
  'in',
  'instanceof',
  'of',
  'return',
  'throw',
  'typeof',
  'void',
  'yield',
]);

export function extractLocalSourceReferences(source: string): LocalReference[] {
  const { code, stringLiterals } = maskCommentsStringsTemplatesAndRegexes(source);
  const references: LocalReference[] = [];

  addMatches(
    references,
    code,
    /(?<![.\w$])import\s+__PATCHPACKET_STRING_(\d+)__/g,
    stringLiterals,
    'import',
  );
  addMatches(
    references,
    code,
    /(?<![.\w$])import\s+(?:[\w*$\s{},]+)\s+from\s+__PATCHPACKET_STRING_(\d+)__/g,
    stringLiterals,
    'import',
  );
  addMatches(
    references,
    code,
    /\bexport\s+(?:type\s+)?(?:\*|\{[^}]*\})\s+from\s+__PATCHPACKET_STRING_(\d+)__/g,
    stringLiterals,
    're-export',
  );
  addMatches(
    references,
    code,
    /(?<![.\w$])require\s*\(\s*__PATCHPACKET_STRING_(\d+)__\s*\)/g,
    stringLiterals,
    'require',
  );
  addMatches(
    references,
    code,
    /(?<![.\w$])import\s*\(\s*__PATCHPACKET_STRING_(\d+)__\s*\)/g,
    stringLiterals,
    'dynamic-import',
  );

  return references.filter((reference) => isLocalSpecifier(reference.specifier));
}

export function extractLocalHtmlScriptSources(html: string): string[] {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, ' ');
  const lowerHtml = withoutComments.toLowerCase();
  const sources: string[] = [];
  let searchIndex = 0;

  while (searchIndex < withoutComments.length) {
    const tagStart = lowerHtml.indexOf('<script', searchIndex);

    if (tagStart === -1) {
      break;
    }

    const nameEnd = tagStart + '<script'.length;
    const boundary = withoutComments[nameEnd] ?? '';

    if (boundary !== '>' && boundary !== '/' && !/\s/.test(boundary)) {
      searchIndex = nameEnd;
      continue;
    }

    const tagEnd = findHtmlTagEnd(withoutComments, nameEnd);

    if (tagEnd === undefined) {
      break;
    }

    const attributes = withoutComments.slice(nameEnd, tagEnd);
    const sourceValue = findQuotedHtmlAttribute(attributes, 'src');

    if (sourceValue !== undefined) {
      const source = stripUrlSuffix(sourceValue);

      if (isLocalSpecifier(source)) {
        sources.push(source);
      }
    }

    if (/\/\s*$/.test(attributes)) {
      searchIndex = tagEnd + 1;
      continue;
    }

    const closingTagStart = lowerHtml.indexOf('</script', tagEnd + 1);

    if (closingTagStart === -1) {
      break;
    }

    const closingTagEnd = findHtmlTagEnd(
      withoutComments,
      closingTagStart + '</script'.length,
    );
    searchIndex = closingTagEnd === undefined ? withoutComments.length : closingTagEnd + 1;
  }

  return sources;
}

function addMatches(
  references: LocalReference[],
  code: string,
  pattern: RegExp,
  stringLiterals: string[],
  kind: ReferenceKind,
): void {
  for (const match of code.matchAll(pattern)) {
    const specifier = stringLiterals[Number(match[1])];

    if (specifier !== undefined) {
      references.push({ specifier, kind });
    }
  }
}

function maskCommentsStringsTemplatesAndRegexes(
  source: string,
): { code: string; stringLiterals: string[] } {
  const stringLiterals: string[] = [];
  let code = '';

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (character === '/' && next === '/') {
      const end = source.indexOf('\n', index + 2);
      code += end === -1 ? '' : '\n';
      index = end === -1 ? source.length : end;
      continue;
    }

    if (character === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      const comment = source.slice(index, end === -1 ? source.length : end + 2);
      code += comment.replace(/[^\n]/g, ' ');
      index = end === -1 ? source.length : end + 1;
      continue;
    }

    if (character === '"' || character === "'") {
      const literal = readQuotedString(source, index, character);

      if (literal.closed) {
        stringLiterals.push(literal.value);
        code += `${stringTokenPrefix}${stringLiterals.length - 1}__`;
      } else {
        code += '__PATCHPACKET_INVALID_STRING__';
      }

      index = literal.end;
      continue;
    }

    if (character === '`') {
      index = readTemplateLiteral(source, index);
      code += '__PATCHPACKET_TEMPLATE__';
      continue;
    }

    if (character === '/' && isJsxClosingTagSlash(source, index)) {
      code += character;
      continue;
    }

    if (character === '/' && isRegexLiteralStart(code)) {
      index = readRegexLiteral(source, index);
      code += '__PATCHPACKET_REGEX__';
      continue;
    }

    code += character;
  }

  return { code, stringLiterals };
}

function readQuotedString(
  source: string,
  start: number,
  quote: '"' | "'",
): { value: string; end: number; closed: boolean } {
  let value = '';

  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];

    if (character === '\\' && index + 1 < source.length) {
      value += source[index + 1];
      index += 1;
      continue;
    }

    if (character === quote) {
      return { value, end: index, closed: true };
    }

    if (character === '\n' || character === '\r') {
      return { value, end: index - 1, closed: false };
    }

    value += character;
  }

  return { value, end: source.length - 1, closed: false };
}

function readTemplateLiteral(source: string, start: number, nesting = 0): number {
  if (nesting >= maxTemplateNesting) {
    return source.length - 1;
  }

  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];

    if (character === '\\') {
      index += 1;
      continue;
    }

    if (character === '`') {
      return index;
    }

    if (character === '$' && source[index + 1] === '{') {
      index = readTemplateExpression(source, index + 2, nesting);
    }
  }

  return source.length - 1;
}

function readTemplateExpression(source: string, start: number, nesting: number): number {
  let braceDepth = 1;

  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (character === '/' && next === '/') {
      const end = source.indexOf('\n', index + 2);
      index = end === -1 ? source.length : end;
      continue;
    }

    if (character === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      index = end === -1 ? source.length : end + 1;
      continue;
    }

    if (character === '"' || character === "'") {
      index = readQuotedString(source, index, character).end;
      continue;
    }

    if (character === '`') {
      index = readTemplateLiteral(source, index, nesting + 1);
      continue;
    }

    if (character === '{') {
      braceDepth += 1;
      continue;
    }

    if (character === '}') {
      braceDepth -= 1;

      if (braceDepth === 0) {
        return index;
      }
    }
  }

  return source.length - 1;
}

function isJsxClosingTagSlash(source: string, index: number): boolean {
  const next = source[index + 1] ?? '';

  return source[index - 1] === '<' && (next === '>' || /[A-Za-z_$]/.test(next));
}

function isRegexLiteralStart(code: string): boolean {
  const beforeSlash = code.trimEnd();

  if (beforeSlash.length === 0) {
    return true;
  }

  const previousCharacter = beforeSlash[beforeSlash.length - 1];

  if (/[[({=,:;!?&|+\-*%^~<>]/.test(previousCharacter)) {
    return true;
  }

  const previousWord = beforeSlash.match(/([A-Za-z_$][\w$]*)$/)?.[1];

  if (previousWord !== undefined && regexPrefixKeywords.has(previousWord)) {
    return true;
  }

  return previousCharacter === ')' && closesControlCondition(beforeSlash);
}

function closesControlCondition(code: string): boolean {
  let depth = 0;

  for (let index = code.length - 1; index >= 0; index -= 1) {
    if (code[index] === ')') {
      depth += 1;
      continue;
    }

    if (code[index] !== '(') {
      continue;
    }

    depth -= 1;

    if (depth === 0) {
      const beforeParenthesis = code.slice(0, index).trimEnd();
      const keyword = beforeParenthesis.match(/([A-Za-z_$][\w$]*)$/)?.[1];
      return keyword !== undefined && ['catch', 'for', 'if', 'switch', 'while', 'with'].includes(keyword);
    }
  }

  return false;
}

function readRegexLiteral(source: string, start: number): number {
  let inCharacterClass = false;

  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];

    if (character === '\\') {
      index += 1;
      continue;
    }

    if (character === '[') {
      inCharacterClass = true;
      continue;
    }

    if (character === ']') {
      inCharacterClass = false;
      continue;
    }

    if (character === '/' && !inCharacterClass) {
      while (/[A-Za-z]/.test(source[index + 1] ?? '')) {
        index += 1;
      }
      return index;
    }

    if (character === '\n' || character === '\r') {
      return index - 1;
    }
  }

  return source.length - 1;
}

function findHtmlTagEnd(html: string, start: number): number | undefined {
  let quote: '"' | "'" | undefined;

  for (let index = start; index < html.length; index += 1) {
    const character = html[index];

    if (quote !== undefined) {
      if (character === quote) {
        quote = undefined;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (character === '>') {
      return index;
    }
  }

  return undefined;
}

function findQuotedHtmlAttribute(attributes: string, targetName: string): string | undefined {
  let index = 0;

  while (index < attributes.length) {
    while (/\s/.test(attributes[index] ?? '')) {
      index += 1;
    }

    if (index >= attributes.length || attributes[index] === '/') {
      break;
    }

    const nameStart = index;

    while (index < attributes.length && !/[\s=/]/.test(attributes[index])) {
      index += 1;
    }

    const name = attributes.slice(nameStart, index).toLowerCase();

    while (/\s/.test(attributes[index] ?? '')) {
      index += 1;
    }

    if (attributes[index] !== '=') {
      continue;
    }

    index += 1;

    while (/\s/.test(attributes[index] ?? '')) {
      index += 1;
    }

    const quote = attributes[index];

    if (quote !== '"' && quote !== "'") {
      while (index < attributes.length && !/\s/.test(attributes[index])) {
        index += 1;
      }
      continue;
    }

    const valueStart = index + 1;
    const valueEnd = attributes.indexOf(quote, valueStart);

    if (valueEnd === -1) {
      return undefined;
    }

    if (name === targetName) {
      return attributes.slice(valueStart, valueEnd);
    }

    index = valueEnd + 1;
  }

  return undefined;
}

function isLocalSpecifier(specifier: string): boolean {
  const normalizedSpecifier = toPosixPath(specifier);

  return normalizedSpecifier.startsWith('./') || normalizedSpecifier.startsWith('../');
}

function stripUrlSuffix(value: string): string {
  return value.split(/[?#]/, 1)[0];
}
