#!/usr/bin/env node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runMcpServer } from '../src/local/mcp-server.js';

export const run = runMcpServer;

if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  runMcpServer().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
