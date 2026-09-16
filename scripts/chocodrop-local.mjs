#!/usr/bin/env node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LocalAssetBridge } from '../src/local/asset-bridge.js';
function options(argv) {
  const result = { port: 0 };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--assets-dir') result.assetsDir = argv[++index];
    else if (value === '--port') result.port = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!result.assetsDir)
    throw new Error('Usage: chocodrop-local --assets-dir <directory> [--port <port>]');
  if (!Number.isInteger(result.port) || result.port < 0 || result.port > 65535)
    throw new Error('--port must be a valid port number');
  return result;
}
export async function run(argv = process.argv.slice(2)) {
  const bridge = await new LocalAssetBridge(options(argv)).start();
  process.stderr.write(`ChocoDrop local bridge: ${bridge.browserUrl}\n`);
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await bridge.stop();
  };
  process.once('SIGINT', () => stop().catch((error) => process.stderr.write(`${error.message}\n`)));
  process.once('SIGTERM', () =>
    stop().catch((error) => process.stderr.write(`${error.message}\n`))
  );
  return { bridge, stop };
}
if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  run().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
