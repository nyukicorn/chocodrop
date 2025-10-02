#!/usr/bin/env node

/**
 * ChocoDrop Daemon - Local server for SDK distribution and MCP bridging
 *
 * This daemon runs on 127.0.0.1:43110 (local only) and provides:
 * - SDK distribution (/sdk.js)
 * - Health check (/v1/health)
 * - MCP bridging (/v1/generate)
 * - Settings UI (/settings)
 */

import { startDaemon } from '../src/index.js';

const PORT = process.env.CHOCODROP_PORT || 43110;
const HOST = '127.0.0.1'; // Local only - security by default

console.log('🍫 ChocoDrop Daemon starting...');
console.log(`   Host: ${HOST}`);
console.log(`   Port: ${PORT}`);
console.log(`   Mode: ${process.env.NODE_ENV || 'development'}`);

startDaemon({ host: HOST, port: PORT })
  .then(() => {
    console.log('✅ ChocoDrop Daemon is ready!');
    console.log(`   Health: http://${HOST}:${PORT}/v1/health`);
    console.log(`   SDK: http://${HOST}:${PORT}/sdk.js`);
    console.log('');
    console.log('Press Ctrl+C to stop');
  })
  .catch((err) => {
    console.error('❌ Failed to start daemon:', err);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down ChocoDrop Daemon...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down ChocoDrop Daemon...');
  process.exit(0);
});
