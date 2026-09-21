#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMcpServer } from '../runtime/mcp-server.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

runMcpServer(process.argv.slice(2), { staticRoot: path.join(packageRoot, 'runtime', 'site') }).catch(
  (error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
);
