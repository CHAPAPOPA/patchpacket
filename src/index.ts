#!/usr/bin/env node
import { createCli } from './cli';

createCli().parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`patchpacket: ${message}\n`);
  process.exitCode = 1;
});
