import { ParsedStackFile } from '../types';

const quotedPythonFilePattern = /File\s+"([^"]+)",\s+line\s+(\d+)/g;
const parenStackPattern = /\(([^()\r\n]+):(\d+)(?::(\d+))?\)/g;
const fileWithLinePattern =
  /((?:[A-Za-z]:)?(?:[./\\]|[A-Za-z0-9_$@-]+[\\/])(?:[^<>:"|?*\s()[\]{}]+[\\/])*[^<>:"|?*\s()[\]{}]+\.[A-Za-z][A-Za-z0-9]+):(\d+)(?::(\d+))?/g;

const ignoredSchemes = /^(node|internal|webpack|vite|http|https):/i;

export function parseError(errorText: string): ParsedStackFile[] {
  const results = new Map<string, ParsedStackFile>();

  collectMatches(errorText, quotedPythonFilePattern, results);
  collectMatches(errorText, parenStackPattern, results);
  collectMatches(errorText, fileWithLinePattern, results);

  return Array.from(results.values());
}

function collectMatches(
  errorText: string,
  pattern: RegExp,
  results: Map<string, ParsedStackFile>,
): void {
  for (const match of errorText.matchAll(pattern)) {
    const rawPath = cleanRawPath(match[1]);

    if (!rawPath || ignoredSchemes.test(rawPath)) {
      continue;
    }

    const line = toNumber(match[2]);
    const column = toNumber(match[3]);
    const key = `${normalizeForKey(rawPath)}:${line ?? ''}:${column ?? ''}`;

    if (!results.has(key)) {
      results.set(key, { rawPath, line, column });
    }
  }
}

function cleanRawPath(rawPath: string): string {
  return rawPath
    .trim()
    .replace(/^file:\/\//, '')
    .replace(/^webpack:\/\//, '');
}

function normalizeForKey(filePath: string): string {
  return filePath.replace(/\\/g, '/').toLowerCase();
}

function toNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
