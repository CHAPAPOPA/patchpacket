import fs from 'node:fs';
import path from 'node:path';
import { Command, InvalidArgumentError } from 'commander';
import { runBugCommand } from './commands/bug';
import { BugCommandOptions } from './types';

export function createCli(): Command {
  const program = new Command();

  program
    .name('patchpacket')
    .description('Create focused Markdown context packets for AI coding assistants.')
    .version(readPackageVersion());

  program
    .command('bug')
    .description('Create a bug-debugging context packet from a project and error log.')
    .argument('<projectPath>', 'local project folder to inspect')
    .requiredOption('-e, --error-file <path>', 'plain-text error or stack trace file')
    .option('-o, --out <path>', 'Markdown output file', 'patchpacket-context.md')
    .option('-b, --budget <number>', 'approximate token budget', parseBudget, 25000)
    .option('--stdout', 'print Markdown to stdout instead of writing a file', false)
    .option('--include <patterns...>', 'glob include patterns to scan')
    .option('--exclude <patterns...>', 'additional gitignore-style exclude patterns')
    .action(async (projectPath: string, rawOptions: BugCommandOptions) => {
      await runBugCommand(projectPath, {
        errorFile: rawOptions.errorFile,
        out: rawOptions.out,
        budget: rawOptions.budget,
        stdout: Boolean(rawOptions.stdout),
        include: rawOptions.include ?? [],
        exclude: rawOptions.exclude ?? [],
      });
    });

  return program;
}

function readPackageVersion(): string {
  const packageJsonPath = path.resolve(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
    version?: unknown;
  };

  if (typeof packageJson.version !== 'string') {
    throw new Error(`Missing package version in ${packageJsonPath}`);
  }

  return packageJson.version;
}

function parseBudget(value: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError(`Budget must be a positive integer: ${value}`);
  }

  return parsed;
}
