# PatchPacket Context

## Task

Help debug the following error.

## Summary

- Mode: bug
- Project path: /path/to/patchpacket
- Error file: /path/to/patchpacket/examples/error.txt
- Token budget: 25000
- Estimated tokens: 1234
- Generated at: 2026-07-06T00:00:00.000Z

## Error

```text
TypeError: Cannot read properties of undefined (reading 'id')
    at createCli (src/cli.ts:14:12)
    at Object.<anonymous> (src/index.ts:4:1)
```

## Why these files were selected

| File | Reason |
| --- | --- |
| src/cli.ts | mentioned in stack trace |
| src/index.ts | mentioned in stack trace |
| src/commands/bug.ts | imported by src/cli.ts |
| src/core/applyTokenBudget.ts | imported by src/commands/bug.ts |
| src/core/fileUtils.ts | imported by src/commands/bug.ts |
| src/core/git.ts | imported by src/commands/bug.ts |
| src/core/parseError.ts | imported by src/commands/bug.ts |
| src/core/scanProject.ts | imported by src/commands/bug.ts |
| src/core/selectFiles.ts | imported by src/commands/bug.ts |
| src/types.ts | imported by src/cli.ts; imported by src/commands/bug.ts |
| tests/cli.test.ts | nearby test file |
| package.json | project manifest |
| tsconfig.json | TypeScript config |
| README.md | project README |

## Project Snapshot

- Selected files: 5
- Git diff: empty
- Included manifest/config files: package.json, tsconfig.json

## Git Diff

Git diff is empty.

## Related Files

### src/cli.ts

```ts
import { Command } from 'commander';
import { runBugCommand } from './commands/bug';

export function createCli(): Command {
  const program = new Command();
  // ...
  return program;
}
```

### src/index.ts

```ts
#!/usr/bin/env node
import { createCli } from './cli';

createCli().parseAsync(process.argv).catch((error: unknown) => {
  // ...
});
```

### package.json

```json
{
  "name": "patchpacket",
  "version": "0.2.0",
  "bin": {
    "patchpacket": "dist/index.js"
  }
}
```

## Instructions for the AI

- Focus on the provided error and selected files.
- Do not rewrite unrelated parts of the project.
- Prefer a minimal fix.
- If the root cause is uncertain, explain the likely causes first.
- Mention if more files are needed.
