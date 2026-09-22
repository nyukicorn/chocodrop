import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const installDir = process.argv[2];
const entry = path.join(installDir, 'node_modules/@chocodrop/daemon/src/index.js');
const { startDaemon } = await import(pathToFileURL(entry));
const { server, app } = await startDaemon({ port: 0 });

try {
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const route of [
    '/v1/health',
    '/sdk.js',
    '/ui/ui.esm.js',
    '/ui/ui.global.js',
    '/ui/src/CommandUI.js',
    '/vendor/three-0.170.0.min.js',
  ]) {
    const response = await fetch(`${base}${route}`);
    assert.equal(response.status, 200, `${route} returned ${response.status}`);
    assert.ok((await response.arrayBuffer()).byteLength > 0, `${route} was empty`);
  }
  console.log('✅ Installed daemon serves health, SDK, UI, and Three.js');
} finally {
  app.locals.csrf.destroy();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
