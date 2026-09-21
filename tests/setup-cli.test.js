import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import {
  applySetup,
  parseArgs,
  registration,
  runSetup,
  shellCommand,
} from '../packages/setup/src/index.js';

test('builds client-specific registration commands around the published MCP package', () => {
  const assets = '/Users/example/ChocoDrop Assets';
  const codex = registration('codex', assets);
  const claude = registration('claude', assets);
  const antigravity = registration('antigravity', assets, '@chocodrop/mcp@0.1.0-alpha.0', 'pnpm', '/Users/example');

  assert.deepEqual(codex.add, [
    'mcp', 'add', 'chocodrop', '--', 'pnpm', 'dlx', '@chocodrop/mcp@0.1.0-alpha.0', '--assets-dir', assets,
  ]);
  assert.deepEqual(claude.add.slice(0, 7), [
    'mcp', 'add', '--transport', 'stdio', '--scope', 'user', 'chocodrop',
  ]);
  assert.equal(antigravity.configPath, '/Users/example/.gemini/config/mcp_config.json');
  assert.deepEqual(antigravity.server, {
    command: 'pnpm',
    args: ['dlx', '@chocodrop/mcp@0.1.0-alpha.0', '--assets-dir', assets],
  });
  assert.match(shellCommand('codex', codex.add), /'\/Users\/example\/ChocoDrop Assets'/);
  assert.deepEqual(registration('codex', assets, '@chocodrop/mcp@0.1.0-alpha.0', 'npx').add.slice(4, 7), [
    'npx', '-y', '@chocodrop/mcp@0.1.0-alpha.0',
  ]);
});

test('replaces an existing client entry before registering the packaged MCP', async () => {
  const item = registration('claude', '/tmp/assets');
  const calls = [];
  let madeDirectory = null;
  const run = (command, args) => {
    calls.push([command, args]);
    return { status: 0, stdout: '', stderr: '' };
  };

  const completed = await applySetup(
    { assetsDir: '/tmp/assets', items: [item] },
    {
      run,
      makeDirectory: async (directory) => { madeDirectory = directory; },
    }
  );

  assert.equal(madeDirectory, '/tmp/assets');
  assert.deepEqual(completed, ['claude']);
  assert.deepEqual(calls.map(([, args]) => args), [item.get, item.remove, item.add]);
});

test('dry-run detects installed clients without creating folders or changing config', async () => {
  const output = new PassThrough();
  let text = '';
  output.on('data', (chunk) => { text += chunk; });
  let directoryCreated = false;
  const run = (command, args) => ({
    status: ['codex', 'claude'].includes(command) && args[0] === '--version' ? 0 : 1,
    stdout: '',
    stderr: '',
  });

  const result = await runSetup(['--dry-run'], {
    run,
    fileExists: () => false,
    makeDirectory: async () => { directoryCreated = true; },
    input: new PassThrough(),
    output,
    errorOutput: new PassThrough(),
  });

  assert.equal(result.changed, false);
  assert.deepEqual(result.clients, ['codex', 'claude']);
  assert.equal(directoryCreated, false);
  assert.match(text, /Codex・Claude Code/);
  assert.match(text, /ドライランのため変更していません/);
});

test('shows existing ChocoDrop entries before asking to replace them', async () => {
  const output = new PassThrough();
  let text = '';
  output.on('data', (chunk) => { text += chunk; });
  const run = (command, args) => {
    if (command === 'codex' && args[0] === '--version') return { status: 0, stdout: 'codex 1', stderr: '' };
    if (command === 'codex' && args[0] === 'mcp' && args[1] === 'get') return { status: 0, stdout: 'chocodrop', stderr: '' };
    return { status: 1, stdout: '', stderr: '' };
  };

  await runSetup(['--dry-run'], {
    run,
    fileExists: () => false,
    input: new PassThrough(),
    output,
    errorOutput: new PassThrough(),
  });

  assert.match(text, /既存のChocoDrop設定を置き換えます: Codex/);
});

test('preserves Antigravity config while adding ChocoDrop', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'chocodrop-setup-antigravity-'));
  const item = registration('antigravity', path.join(root, 'assets'), '@chocodrop/mcp@0.1.0-alpha.0', 'pnpm', root);
  try {
    await mkdir(path.dirname(item.configPath), { recursive: true });
    await writeFile(item.configPath, `${JSON.stringify({ mcpServers: { existing: { command: 'existing' } }, theme: 'dark' }, null, 2)}\n`);
    await applySetup({ assetsDir: path.join(root, 'assets'), items: [item] });
    const config = JSON.parse(await readFile(item.configPath, 'utf8'));
    assert.equal(config.theme, 'dark');
    assert.equal(config.mcpServers.existing.command, 'existing');
    assert.deepEqual(config.mcpServers.chocodrop, item.server);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('accepts an empty Antigravity config file', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'chocodrop-setup-antigravity-empty-'));
  const item = registration('antigravity', path.join(root, 'assets'), '@chocodrop/mcp@0.1.0-alpha.0', 'pnpm', root);
  try {
    await mkdir(path.dirname(item.configPath), { recursive: true });
    await writeFile(item.configPath, '');
    await applySetup({ assetsDir: path.join(root, 'assets'), items: [item] });
    const config = JSON.parse(await readFile(item.configPath, 'utf8'));
    assert.deepEqual(config.mcpServers.chocodrop, item.server);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('parses explicit clients and rejects unknown options', () => {
  assert.deepEqual(parseArgs(['--client', 'codex,antigravity', '--yes']).clients, ['codex', 'antigravity']);
  assert.throws(() => parseArgs(['--wat']), /不明なオプション/);
});
