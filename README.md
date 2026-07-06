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

### Windows PowerShell

On Windows PowerShell, npm may create a `.ps1` shim that is blocked by execution policy. Use the `.cmd` shim if needed:

```powershell
patchpacket.cmd --help
patchpacket.cmd bug . --error-file .\error.txt --out .\patchpacket-context.md
```

## Why This Exists

Bug reports often need just a few files: the error, the stack trace targets, the manifest/config, nearby tests, and current local diff. Full repository prompts waste tokens and make the assistant reason through unrelated code.

PatchPacket focuses on minimal, explainable context for one task at a time.

## Local Development

```bash
npm install
npm run build
```

Run locally from source:

```bash
npm run dev -- bug . --error-file examples/error.txt --out patchpacket-context.md --budget 25000
```

## Example Output

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

## v0.1 Supports

- `bug` mode
- stack trace path extraction for common JavaScript, TypeScript, and Python formats
- `.gitignore` and `.patchpacketignore`
- selected stack trace files, common manifests/configs, nearby tests, and git diff
- approximate token estimate with a configurable budget
- large selected file protection

## v0.1 Does Not Support

- AI API calls
- code editing or auto-fixing
- embeddings, RAG, MCP, or cloud sync
- telemetry
- web UI or VS Code extension
- broad whole-repo prompt generation

## Positioning

PatchPacket is not a replacement for Repomix, Gitingest, or Code2Prompt. Those tools are useful for broader repository packaging. PatchPacket focuses on task-based minimal context, starting with bug reports and stack traces.

## Roadmap

- v0.1: bug mode
- v0.2: pr mode
- v0.3: explain, tests, and refactor modes
- Later: VS Code extension
