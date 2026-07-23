# PatchPacket

[![CI](https://github.com/CHAPAPOPA/patchpacket/actions/workflows/ci.yml/badge.svg)](https://github.com/CHAPAPOPA/patchpacket/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/patchpacket.svg)](https://www.npmjs.com/package/patchpacket)

PatchPacket turns a stack trace plus a local project folder into a focused Markdown packet for AI coding assistants.

It is not a "dump the repo into a prompt" tool. PatchPacket starts with the task, finds the files that matter, adds a compact project snapshot, and writes context that ChatGPT, Claude, Cursor, Copilot Chat, Gemini, and similar tools can use quickly.

## Install

```bash
npm install -g patchpacket
```

## Usage

```bash
patchpacket bug . --error-file ./error.txt --out ./patchpacket-context.md --budget 25000
```

Options:

- `--error-file, -e`: plain text terminal error or stack trace file
- `--out, -o`: Markdown output path, default `patchpacket-context.md`
- `--budget, -b`: approximate token budget, default `25000`
- `--stdout`: print the packet instead of writing it
- `--include <patterns...>`: glob include patterns to scan
- `--exclude <patterns...>`: optional gitignore-style exclude patterns

`--budget` performs best-effort budget-aware packing. Files directly referenced by the stack trace are prioritized, followed by the git diff, related local source files, nearby tests, config, and README. Lower-priority content may be omitted, but every selected file remains visible with its reason. The token estimate is approximate.

### Windows PowerShell

On Windows PowerShell, npm may create a `.ps1` shim that is blocked by execution policy. Use the `.cmd` shim if needed:

```powershell
patchpacket.cmd --help
patchpacket.cmd bug . --error-file .\error.txt --out .\patchpacket-context.md
```

## Why This Exists

Bug reports often need just a few files: the error, the stack trace targets, the manifest/config, nearby tests, and current local diff. Full repository prompts waste tokens and make the assistant reason through unrelated code.

PatchPacket focuses on minimal, explainable context for one task at a time.

### Related Local Files

For stack-trace files, PatchPacket statically and best-effort follows local `import`, `require`, literal `import()` (including awaited calls), and re-export references, including resolvable JSON targets. It also follows local HTML `script src` references and identifies HTML entrypoints that reference a stack-trace script.

Discovery is limited to relative paths, a maximum depth of 2, and 12 related files. Package imports, Node.js built-ins, path aliases, URLs, non-literal dynamic imports, and bundler-specific resolution are not supported. This is not a complete dependency graph or module resolver.

## Local Development

```bash
npm install
npm run build
```

Run locally from source:

```bash
npm run dev -- bug . --error-file examples/error.txt --out patchpacket-context.md --budget 25000
```

## Example output

See [examples/patchpacket-context.example.md](https://github.com/CHAPAPOPA/patchpacket/blob/main/examples/patchpacket-context.example.md) for a compact generated packet.

```md
# PatchPacket Context

## Task

Help debug the following error.

## Why these files were selected

| File | Reason |
| --- | --- |
| src/cli.ts | mentioned in stack trace |
| src/index.ts | mentioned in stack trace |
| package.json | project manifest |
```

## How PatchPacket is different

PatchPacket is not trying to replace Repomix, Gitingest, or Code2Prompt.

Those tools are useful for broad repository packing and repo-to-prompt workflows. PatchPacket starts from a specific task: a bug report or stack trace. It tries to create a smaller, explainable context packet with only the files and signals that are useful for debugging.

## Current features

- `bug` mode
- stack trace path extraction for common JavaScript, TypeScript, and Python formats
- `.gitignore` and `.patchpacketignore`
- selected stack trace files, common manifests/configs, nearby tests, and git diff
- bounded local related-file discovery for JavaScript, TypeScript, and HTML entrypoints
- best-effort budget-aware packing with a configurable approximate token estimate
- large selected file protection

## Not yet supported

- AI API calls
- code editing or auto-fixing
- embeddings, RAG, MCP, or cloud sync
- telemetry
- web UI or VS Code extension
- broad whole-repo prompt generation

## Roadmap

- v0.1: bug mode
- v0.2: token-budget-aware packing
- v0.3: dependency-aware bug context
- v0.4: PR mode
- Later: explain, tests, refactor modes, and editor integrations
