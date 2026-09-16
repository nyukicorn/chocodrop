import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { WebSocket } from 'ws';
import { LocalAssetBridge } from '../src/local/asset-bridge.js';

async function fixture() {
  const root = await mkdtemp(path.join(process.cwd(), '.chocodrop-local-test-'));
  const assets = path.join(root, 'assets');
  await mkdir(assets);
  await writeFile(path.join(assets, 'image.png'), 'png');
  await writeFile(path.join(root, 'secret.txt'), 'secret');
  await symlink(path.join(root, 'secret.txt'), path.join(assets, 'escape.png'));
  return { root, assets };
}

async function withBridge(fn) {
  const files = await fixture();
  const bridge = await new LocalAssetBridge({
    assetsDir: files.assets,
    logger: { error() {} },
  }).start();
  try {
    await fn(bridge, files);
  } finally {
    await bridge.stop();
    await rm(files.root, { recursive: true, force: true });
  }
}

function openScene(bridge) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(
      `ws://127.0.0.1:${bridge.port}/local-api/live?token=${bridge.token}`,
      { origin: `http://127.0.0.1:${bridge.port}` }
    );
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function request(url, options) {
  return fetch(url, options);
}
function rawRequest(port, host) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: '/examples/basic/', headers: { Host: host } },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

test('imports an allowed local asset only after the browser acknowledges it', async () => {
  await withBridge(async (bridge, files) => {
    const scene = await openScene(bridge);
    scene.on('message', (raw) => {
      const message = JSON.parse(raw);
      assert.equal(message.asset.mediaType, 'image');
      scene.send(
        JSON.stringify({
          type: 'import-result',
          requestId: message.requestId,
          ok: true,
          objectId: 'cube-1',
        })
      );
    });
    const result = await bridge.importAsset(path.join(files.assets, 'image.png'));
    assert.equal(result.delivered, true);
    assert.equal(result.objectId, 'cube-1');
    scene.close();
  });
});

test('rejects imports without exactly one scene and rejects invalid asset paths', async () => {
  await withBridge(async (bridge, files) => {
    await assert.rejects(
      bridge.importAsset(path.join(files.assets, 'image.png')),
      /No browser scene/
    );
    const first = await openScene(bridge);
    await assert.rejects(bridge.importAsset(path.join(files.assets, 'escape.png')), /stay inside/);
    await assert.rejects(bridge.importAsset(path.join(files.root, 'secret.txt')), /stay inside/);
    await assert.rejects(
      bridge.importAsset(path.join(files.assets, 'image.png'), { x: 0, y: NaN, z: 0 }),
      /finite/
    );
    const second = await openScene(bridge);
    await assert.rejects(bridge.importAsset(path.join(files.assets, 'image.png')), /More than one/);
    first.close();
    second.close();
  });
});

test('protects status, assets, websocket origin, and repository secrets', async () => {
  await withBridge(async (bridge, files) => {
    const base = `http://127.0.0.1:${bridge.port}`;
    assert.equal((await request(`${base}/local-api/status`)).status, 403);
    assert.equal(
      (
        await request(`${base}/local-api/status`, {
          headers: { Authorization: `Bearer ${bridge.token}` },
        })
      ).status,
      200
    );
    assert.equal((await request(`${base}/.env`)).status, 404);
    assert.equal((await request(`${base}/package.json`)).status, 404);
    assert.equal((await request(`${base}/src/server/server.js`)).status, 404);
    assert.equal((await request(`${base}/public/generated/anything.png`)).status, 404);
    assert.equal((await request(`${base}/examples/basic/node_modules/anything.js`)).status, 404);
    assert.equal((await request(`${base}/%`)).status, 400);
    assert.equal((await request(`${base}/examples/basic/`, { method: 'POST' })).status, 405);
    assert.equal(await rawRequest(bridge.port, 'localhost'), 403);
    assert.equal((await request(`${base}/examples/basic/`)).status, 200);
    await assert.rejects(
      new Promise((resolve, reject) => {
        const socket = new WebSocket(
          `ws://127.0.0.1:${bridge.port}/local-api/live?token=${bridge.token}`,
          { origin: 'http://evil.example' }
        );
        socket.once('open', resolve);
        socket.once('error', reject);
      })
    );
    const scene = await openScene(bridge);
    scene.on('message', async (raw) => {
      const message = JSON.parse(raw);
      const assetUrl = `${base}${message.asset.url}`;
      assert.equal((await request(assetUrl)).status, 200);
      scene.send(JSON.stringify({ type: 'import-result', requestId: message.requestId, ok: true }));
    });
    await bridge.importAsset(path.join(files.assets, 'image.png'));
    scene.close();
  });
});

test('keeps an immutable asset copy and rejects a disconnected scene acknowledgement', async () => {
  await withBridge(async (bridge, files) => {
    const scene = await openScene(bridge);
    const pending = new Promise((resolve, reject) => {
      scene.once('message', async (raw) => {
        const message = JSON.parse(raw);
        await writeFile(path.join(files.assets, 'image.png'), 'changed');
        const response = await request(`http://127.0.0.1:${bridge.port}${message.asset.url}`);
        assert.equal(await response.text(), 'png');
        scene.close();
      });
      bridge.importAsset(path.join(files.assets, 'image.png')).then(resolve, reject);
    });
    await assert.rejects(pending, /disconnected/);
  });
});

test('stdio MCP exposes tools/list and reports invalid import calls', async () => {
  const files = await fixture();
  const child = spawn(
    process.execPath,
    ['scripts/chocodrop-mcp.mjs', '--assets-dir', files.assets],
    { cwd: process.cwd(), stdio: ['pipe', 'pipe', 'pipe'] }
  );
  let output = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  try {
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } })}\n`
    );
    await waitFor(() => output.includes('"id":1'));
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`
    );
    await waitFor(() => output.includes('"id":2'));
    assert.match(output, /get_status/);
    assert.match(output, /import_asset/);
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'import_asset', arguments: { path: 1 } } })}\n`
    );
    await waitFor(() => output.includes('"id":3'));
    assert.match(output, /path must be a non-empty string/);
  } finally {
    child.stdin.end();
    await new Promise((resolve) => child.once('exit', resolve));
    await rm(files.root, { recursive: true, force: true });
  }
});

async function waitFor(predicate, timeout = 5000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) throw new Error('timed out waiting for stdio MCP response');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
