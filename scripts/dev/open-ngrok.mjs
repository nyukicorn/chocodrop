import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');
const reportPath = path.join(projectRoot, 'output', 'build-report.json');

async function main() {
  const report = await loadReport();
  if (!report?.localUrl) {
    console.error('build-report.json に localUrl がありません。まず npm run dev を起動してください。');
    process.exit(1);
  }

  const port = Number(new URL(report.localUrl).port);
  if (!port) {
    console.error('有効なポートが検出できませんでした。');
    process.exit(1);
  }

  console.log(`🔌 ngrok トンネルを開始します (port=${port})`);
  const child = spawn(
    'npx',
    ['ngrok', 'http', String(port), '--log=stdout', '--log-format=json'],
    { stdio: ['ignore', 'pipe', 'inherit'] }
  );

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', async chunk => {
    const lines = chunk.split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const payload = JSON.parse(line);
        if (payload.msg === 'started tunnel') {
          const url = payload.url;
          await updateReport(report, url);
          console.log(`🌐 ngrok URL: ${url}`);
        }
      } catch (error) {
        // ignore non JSON lines
      }
    }
  });

  child.on('exit', code => {
    console.log(`ngrok プロセスが終了しました (code=${code})`);
  });
}

async function loadReport() {
  try {
    const json = await readFile(reportPath, 'utf8');
    return JSON.parse(json);
  } catch (error) {
    return {};
  }
}

async function updateReport(report, ngrokUrl) {
  const next = {
    ...report,
    ngrokUrl,
    ngrokUpdatedAt: new Date().toISOString()
  };
  await writeFile(reportPath, JSON.stringify(next, null, 2), 'utf8');
}

main().catch(error => {
  console.error('ngrok トンネルの起動に失敗しました', error);
  process.exit(1);
});
