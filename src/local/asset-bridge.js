import { createServer } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { constants as fsConstants, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MAX_ASSET_BYTES = 32 * 1024 * 1024;
const MAX_TOTAL_ASSET_BYTES = 128 * 1024 * 1024;
const ACK_TIMEOUT_MS = 20_000;
const ASSET_TYPES = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.mp4', 'video/mp4'],
  ['.webm', 'video/webm'],
  ['.glb', 'model/gltf-binary'],
]);
const STATIC_ROOTS = [
  'public',
  'dist',
  'vendor',
  'examples',
  'src/client',
  'src/shared',
  'src/common',
];
const STATIC_FILES = new Set(['index.html', 'getting-started.html']);
const BLOCKED_STATIC_SEGMENTS = new Set(['node_modules', 'generated', 'imported-scenes']);
function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return (
    relative &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== '..' &&
    !path.isAbsolute(relative)
  );
}
function assetMime(file) {
  return ASSET_TYPES.get(path.extname(file).toLowerCase()) || null;
}
function assetKind(file) {
  const extension = path.extname(file).toLowerCase();
  return extension === '.glb'
    ? 'model'
    : extension === '.mp4' || extension === '.webm'
      ? 'video'
      : 'image';
}
function validPosition(value) {
  if (value === undefined) return { x: 0, y: 3, z: 0 };
  if (!value || typeof value !== 'object')
    throw new Error('position must be an object with finite x, y, z values');
  const result = {};
  for (const key of ['x', 'y', 'z']) {
    if (!Number.isFinite(value[key])) throw new Error(`position.${key} must be a finite number`);
    result[key] = value[key];
  }
  return result;
}
function assertSafeGlb(buffer) {
  if (
    buffer.length < 20 ||
    buffer.readUInt32LE(0) !== 0x46546c67 ||
    buffer.readUInt32LE(8) !== buffer.length ||
    buffer.readUInt32LE(16) !== 0x4e4f534a
  )
    throw new Error('GLB is invalid');
  let document;
  try {
    document = JSON.parse(
      buffer
        .subarray(20, 20 + buffer.readUInt32LE(12))
        .toString('utf8')
        .replace(/\0+$/, '')
    );
  } catch {
    throw new Error('GLB JSON chunk is invalid');
  }
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (typeof value.uri === 'string' && !value.uri.startsWith('data:'))
      throw new Error('GLB external URI references are not allowed');
    for (const child of Object.values(value)) visit(child);
  };
  visit(document);
}

/** Local-only, token-protected bridge from one stdio MCP client to one browser scene. */
export class LocalAssetBridge {
  constructor({ assetsDir, port = 0, host = '127.0.0.1', logger = console } = {}) {
    if (!assetsDir) throw new Error('--assets-dir is required');
    if (host !== '127.0.0.1') throw new Error('LocalAssetBridge only listens on 127.0.0.1');
    this.assetsDirInput = path.resolve(assetsDir);
    this.port = port;
    this.host = host;
    this.logger = logger;
    this.token = randomBytes(32).toString('base64url');
    this.assets = new Map();
    this.totalAssetBytes = 0;
    this.clients = new Set();
    this.pending = new Map();
    this.server = null;
    this.wss = null;
    this.assetsDir = null;
    this.stopping = null;
  }
  get browserUrl() {
    return `http://${this.host}:${this.port}/examples/basic/?local=1#token=${this.token}`;
  }
  getStatus() {
    return {
      host: this.host,
      port: this.port,
      browserUrl: this.browserUrl,
      connected: this.clients.size,
      ready: this.clients.size === 1,
      assetsDir: this.assetsDirInput,
      maxAssetBytes: MAX_ASSET_BYTES,
      maxTotalAssetBytes: MAX_TOTAL_ASSET_BYTES,
    };
  }
  async start() {
    const stat = await fs.stat(this.assetsDirInput);
    if (!stat.isDirectory())
      throw new Error(`assets directory does not exist: ${this.assetsDirInput}`);
    this.assetsDir = await fs.realpath(this.assetsDirInput);
    this.server = createServer((req, res) =>
      this.#handleHttp(req, res).catch((error) => {
        this.logger.error?.(error);
        if (!res.headersSent) this.#reply(res, 500, 'Internal server error');
        else res.destroy();
      })
    );
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 });
    this.server.on('upgrade', (req, socket, head) => this.#upgrade(req, socket, head));
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.port, this.host, () => {
        this.server.off('error', reject);
        resolve();
      });
    });
    this.port = this.server.address().port;
    return this;
  }
  async importAsset(filePath, position) {
    const normalizedPosition = validPosition(position);
    const scene = this.#singleClient();
    const asset = await this.#readAsset(filePath);
    if (this.totalAssetBytes + asset.size > MAX_TOTAL_ASSET_BYTES)
      throw new Error(
        'Local bridge asset memory limit (128 MiB) is full; restart the bridge to clear imported assets'
      );
    const id = randomUUID();
    const requestId = randomUUID();
    this.assets.set(id, asset);
    this.totalAssetBytes += asset.size;
    const message = JSON.stringify({
      type: 'import',
      requestId,
      asset: {
        id,
        url: `/local-api/assets/${id}?token=${this.token}`,
        name: asset.name,
        mediaType: asset.mediaType,
      },
      position: normalizedPosition,
    });
    return new Promise((resolve, reject) => {
      const fail = (error) => this.#settle(requestId, error);
      const timeout = setTimeout(() => {
        if (scene.readyState === WebSocket.OPEN)
          scene.send(JSON.stringify({ type: 'import-cancel', requestId }));
        fail(new Error('Browser did not acknowledge the import within 20 seconds'));
      }, ACK_TIMEOUT_MS);
      this.pending.set(requestId, { resolve, reject, timeout, client: scene, assetId: id });
      try {
        scene.send(message);
      } catch (error) {
        fail(error);
      }
    });
  }
  async stop() {
    if (this.stopping) return this.stopping;
    this.stopping = (async () => {
      for (const requestId of [...this.pending.keys()])
        this.#settle(requestId, new Error('Local bridge stopped'));
      await Promise.all([...this.clients].map((client) => this.#closeClient(client)));
      this.clients.clear();
      this.assets.clear();
      this.totalAssetBytes = 0;
      if (this.wss) await new Promise((resolve) => this.wss.close(resolve));
      if (this.server) await new Promise((resolve) => this.server.close(resolve));
      this.wss = null;
      this.server = null;
    })();
    return this.stopping;
  }
  #singleClient() {
    if (this.clients.size === 0)
      throw new Error(`No browser scene is connected. Open ${this.browserUrl}`);
    if (this.clients.size !== 1)
      throw new Error(
        'More than one browser scene is connected; close extra scenes before importing'
      );
    return this.clients.values().next().value;
  }
  async #closeClient(client) {
    if (client.readyState === WebSocket.CLOSED) return;
    await new Promise((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(() => {
        client.terminate();
        finish();
      }, 30_000);
      client.once('close', finish);
      try {
        client.close();
      } catch {
        client.terminate();
        finish();
      }
    });
  }
  async #readAsset(filePath) {
    if (typeof filePath !== 'string' || !filePath)
      throw new Error('path must be a non-empty string');
    let realPath;
    try {
      realPath = await fs.realpath(path.resolve(filePath));
    } catch {
      throw new Error('Asset file does not exist');
    }
    if (!isInside(realPath, this.assetsDir))
      throw new Error('Asset path must stay inside --assets-dir (symlinks are checked)');
    const mimeType = assetMime(realPath);
    if (!mimeType) throw new Error('Only PNG, JPEG, WebP, MP4, WebM, and GLB files are allowed');
    const handle = await fs.open(realPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (!stat.isFile()) throw new Error('Asset path must be a regular file');
      if (stat.size > MAX_ASSET_BYTES) throw new Error('Asset exceeds the 32 MiB size limit');
      const buffer = Buffer.allocUnsafe(stat.size);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      if (bytesRead !== buffer.length) throw new Error('Asset changed while it was being read');
      if (path.extname(realPath).toLowerCase() === '.glb') assertSafeGlb(buffer);
      return Object.freeze({
        buffer,
        size: buffer.length,
        mimeType,
        mediaType: assetKind(realPath),
        name: path.basename(realPath),
      });
    } finally {
      await handle.close();
    }
  }
  #removeAsset(id) {
    const asset = this.assets.get(id);
    if (asset) {
      this.assets.delete(id);
      this.totalAssetBytes -= asset.size;
    }
  }
  #settle(requestId, error, result) {
    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);
    clearTimeout(pending.timeout);
    if (error) {
      this.#removeAsset(pending.assetId);
      pending.reject(error);
    } else pending.resolve(result);
  }
  #authorized(req, queryToken) {
    const token = queryToken || req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const actual = typeof token === 'string' ? Buffer.from(token) : null;
    const expected = Buffer.from(this.token);
    return (
      actual !== null &&
      actual.byteLength === expected.byteLength &&
      timingSafeEqual(actual, expected)
    );
  }
  #hostIsLocal(req) {
    return req.headers.host === `127.0.0.1:${this.port}`;
  }
  async #handleHttp(req, res) {
    if (!this.#hostIsLocal(req)) return this.#reply(res, 403, 'Forbidden');
    if (!['GET', 'HEAD'].includes(req.method))
      return this.#reply(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
    let url;
    try {
      url = new URL(req.url, `http://${this.host}:${this.port}`);
    } catch {
      return this.#reply(res, 400, 'Bad request');
    }
    if (url.pathname === '/local-api/status') {
      if (!this.#authorized(req)) return this.#reply(res, 403, 'Forbidden');
      return this.#json(res, this.getStatus(), req.method === 'HEAD');
    }
    const match = url.pathname.match(/^\/local-api\/assets\/([0-9a-f-]+)$/i);
    if (match) {
      if (!this.#authorized(req, url.searchParams.get('token')))
        return this.#reply(res, 403, 'Forbidden');
      const asset = this.assets.get(match[1]);
      if (!asset) return this.#reply(res, 404, 'Not found');
      res.writeHead(200, {
        'Content-Type': asset.mimeType,
        'Content-Length': asset.size,
        'Cache-Control': 'no-store',
      });
      return req.method === 'HEAD' ? res.end() : res.end(asset.buffer);
    }
    return this.#static(url.pathname, res, req.method === 'HEAD');
  }
  async #static(urlPath, res, headOnly) {
    let decoded;
    try {
      decoded = decodeURIComponent(urlPath);
    } catch {
      return this.#reply(res, 400, 'Bad request');
    }
    const requested = decoded.endsWith('/') ? `${decoded}index.html` : decoded;
    const relative = requested.replace(/^\/+/, '');
    const parts = relative.split('/');
    if (
      !relative ||
      parts.some((part) => !part || part.startsWith('.') || BLOCKED_STATIC_SEGMENTS.has(part))
    )
      return this.#reply(res, 404, 'Not found');
    const isRoot = STATIC_ROOTS.some(
      (root) => relative === root || relative.startsWith(`${root}/`)
    );
    if (!isRoot && !STATIC_FILES.has(relative)) return this.#reply(res, 404, 'Not found');
    const candidate = path.resolve(ROOT, relative);
    const root = STATIC_ROOTS.map((name) => path.resolve(ROOT, name)).find(
      (value) => candidate === value || isInside(candidate, value)
    );
    if (!root && !STATIC_FILES.has(relative)) return this.#reply(res, 404, 'Not found');
    let real;
    try {
      real = await fs.realpath(candidate);
    } catch {
      return this.#reply(res, 404, 'Not found');
    }
    if ((root && !isInside(real, root) && real !== root) || (!root && real !== candidate))
      return this.#reply(res, 404, 'Not found');
    const stat = await fs.stat(real);
    if (!stat.isFile()) return this.#reply(res, 404, 'Not found');
    res.writeHead(200, {
      'Content-Type': this.#mime(real),
      'Content-Length': stat.size,
      'Cache-Control': 'no-store',
    });
    if (headOnly) return res.end();
    res.end(await fs.readFile(real));
  }
  #upgrade(req, socket, head) {
    let url;
    try {
      url = new URL(req.url, `http://${this.host}:${this.port}`);
    } catch {
      return this.#rejectUpgrade(socket);
    }
    const origin = `http://${this.host}:${this.port}`;
    if (
      !this.#hostIsLocal(req) ||
      url.pathname !== '/local-api/live' ||
      !this.#authorized(req, url.searchParams.get('token')) ||
      req.headers.origin !== origin
    )
      return this.#rejectUpgrade(socket);
    this.wss.handleUpgrade(req, socket, head, (client) => {
      this.clients.add(client);
      client.on('error', () => {});
      client.on('close', () => {
        this.clients.delete(client);
        for (const [id, pending] of this.pending)
          if (pending.client === client)
            this.#settle(
              id,
              new Error('Browser scene disconnected before acknowledging the import')
            );
      });
      client.on('message', (data) => this.#message(client, data));
    });
  }
  #rejectUpgrade(socket) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
  }
  #message(client, data) {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (message?.type !== 'import-result' || typeof message.requestId !== 'string') return;
    const pending = this.pending.get(message.requestId);
    if (!pending || pending.client !== client) return;
    if (message.ok === true)
      this.#settle(message.requestId, null, {
        requestId: message.requestId,
        delivered: true,
        ...(typeof message.objectId === 'string' ? { objectId: message.objectId } : {}),
      });
    else
      this.#settle(
        message.requestId,
        new Error(typeof message.error === 'string' ? message.error : 'Browser rejected the import')
      );
  }
  #json(res, value, headOnly) {
    const body = JSON.stringify(value);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'no-store',
    });
    res.end(headOnly ? undefined : body);
  }
  #reply(res, status, body, headers = {}) {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
    res.end(body);
  }
  #mime(file) {
    return (
      assetMime(file) ||
      {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.webmanifest': 'application/manifest+json',
      }[path.extname(file)] ||
      'application/octet-stream'
    );
  }
}
export { ACK_TIMEOUT_MS, MAX_ASSET_BYTES, MAX_TOTAL_ASSET_BYTES };
