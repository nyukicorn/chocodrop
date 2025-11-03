import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    mode: 'pwa-dev',
    timestamp: new Date().toISOString()
  });
});

app.post('/api/commands', (req, res) => {
  const payload = req.body;
  broadcast({ type: 'server:command', payload });
  res.json({ ok: true });
});

app.use(express.static(projectRoot));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/live' });
const sockets = new Set();

wss.on('connection', socket => {
  sockets.add(socket);
  socket.send(JSON.stringify({ type: 'welcome', at: Date.now() }));

  socket.on('message', data => {
    sockets.forEach(client => {
      if (client.readyState === 1) {
        client.send(data.toString());
      }
    });
  });

  socket.on('close', () => sockets.delete(socket));
});

function broadcast(message) {
  const payload = typeof message === 'string' ? message : JSON.stringify(message);
  sockets.forEach(socket => {
    if (socket.readyState === 1) {
      socket.send(payload);
    }
  });
}

const host = process.env.HOST || '0.0.0.0';
server.listen(0, host, async () => {
  const { port } = server.address();
  const localUrl = `http://localhost:${port}`;
  console.log(`🚀 ChocoDrop PWA dev server running at ${localUrl}`);
  await updateBuildReport({
    localUrl,
    ngrokUrl: null,
    timestamp: new Date().toISOString(),
    manualTest: defaultManualTestSteps(localUrl)
  });
  if (process.env.CHOCODROP_DEV_ONCE === '1') {
    console.log('CHOCODROP_DEV_ONCE=1: サーバーを自動停止します');
    setTimeout(() => {
      server.close(() => process.exit(0));
    }, 500);
  }
});

async function updateBuildReport(report) {
  const reportPath = path.join(projectRoot, 'output', 'build-report.json');
  const json = JSON.stringify(report, null, 2);
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, json, 'utf8');
}

function defaultManualTestSteps(localUrl) {
  return [
    `ブラウザで ${localUrl}/immersive.html を開き、初回ロードが2秒以内であることを確認`,
    'XR対応デバイスで「XRセッション開始」をタップし、没入モードに入れることを確認',
    '別タブで importer.html を開き、GLB/GLTF/JSON 以外が拒否されることをテスト',
    '任意の GLB を読み込み、シーンに配置されることを確認してから OPFS に保存されるかを確認',
    'service_worker.js が登録され、オンライン状態で一度読み込んだ後にオフラインでも利用できることを確認'
  ];
}
