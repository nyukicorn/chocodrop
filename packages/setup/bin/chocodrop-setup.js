#!/usr/bin/env node
import { runSetup } from '../src/index.js';

runSetup().catch((error) => {
  process.stderr.write(`\n設定できませんでした: ${error.message}\n`);
  process.exitCode = 1;
});
