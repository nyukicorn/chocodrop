import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
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
  const antigravity = registration(
    'antigravity',
    assets,
    '@chocodrop/mcp@0.1.0-alpha.1',
    'pnpm',
    '/Users/example'
  );

  assert.deepEqual(codex.add, [
    'mcp',
    'add',
    'chocodrop',
    '--',
    'pnpm',
    'dlx',
    '@chocodrop/mcp@0.1.0-alpha.1',
    '--assets-dir',
    assets,
  ]);
  assert.deepEqual(claude.add.slice(0, 7), [
    'mcp',
    'add',
    '--transport',
    'stdio',
    '--scope',
    'user',
    'chocodrop',
  ]);
  assert.equal(antigravity.configPath, '/Users/example/.gemini/config/mcp_config.json');
  assert.deepEqual(antigravity.server, {
    command: 'pnpm',
    args: ['dlx', '@chocodrop/mcp@0.1.0-alpha.1', '--assets-dir', assets],
  });
  assert.match(shellCommand('codex', codex.add), /'\/Users\/example\/ChocoDrop Assets'/);
  assert.deepEqual(
    registration('codex', assets, '@chocodrop/mcp@0.1.0-alpha.1', 'npx').add.slice(4, 7),
    ['npx', '-y', '@chocodrop/mcp@0.1.0-alpha.1']
  );
});

test('keeps an existing client entry without creating a folder or changing config', async () => {
  const item = registration('claude', '/tmp/assets');
  const calls = [];
  let madeDirectory = null;
  const run = (command, args) => {
    calls.push([command, args]);
    return { status: 0, stdout: '', stderr: '' };
  };

  const result = await applySetup(
    { assetsDir: '/tmp/assets', items: [item] },
    {
      run,
      makeDirectory: async (directory) => {
        madeDirectory = directory;
      },
    }
  );

  assert.equal(madeDirectory, null);
  assert.deepEqual(result, { registered: [], skipped: ['claude'] });
  assert.deepEqual(
    calls.map(([, args]) => args),
    [item.get]
  );
});

test('registers only missing clients when another client already has ChocoDrop', async () => {
  const codex = registration('codex', '/tmp/assets');
  const claude = registration('claude', '/tmp/assets');
  const calls = [];
  const run = (command, args) => {
    calls.push([command, args]);
    if (args === codex.get) return { status: 0, stdout: '', stderr: '' };
    if (args === claude.get)
      return { status: 1, stdout: 'No MCP server named "chocodrop".', stderr: '' };
    return { status: 0, stdout: '', stderr: '' };
  };
  const result = await applySetup(
    { assetsDir: '/tmp/assets', items: [codex, claude] },
    { run, makeDirectory: async () => {} }
  );
  assert.deepEqual(result, { registered: ['claude'], skipped: ['codex'] });
  assert.deepEqual(
    calls.map(([, args]) => args),
    [codex.get, claude.get, claude.get, claude.add]
  );
});

test('reports which client was registered before a later registration fails', async () => {
  const codex = registration('codex', '/tmp/assets');
  const claude = registration('claude', '/tmp/assets');
  const run = (command, args) => {
    if (args === codex.get || args === claude.get)
      return { status: 1, stdout: 'No MCP server named "chocodrop".', stderr: '' };
    if (args === codex.add) return { status: 0, stdout: '', stderr: '' };
    return { status: 1, stdout: '', stderr: 'Registration failed' };
  };
  await assert.rejects(
    applySetup(
      { assetsDir: '/tmp/assets', items: [codex, claude] },
      { run, makeDirectory: async () => {} }
    ),
    /Claude Codeへ登録できませんでした: Registration failed\n登録済み: Codex/
  );
});

test('skips a CLI entry created between lookup and registration', async () => {
  const item = registration('codex', '/tmp/assets');
  let lookups = 0;
  let added = false;
  const run = (command, args) => {
    if (args === item.get) {
      lookups += 1;
      return lookups === 1
        ? { status: 1, stdout: "No MCP server named 'chocodrop' found.", stderr: '' }
        : { status: 0, stdout: 'chocodrop', stderr: '' };
    }
    added = true;
    return { status: 0, stdout: '', stderr: '' };
  };
  const result = await applySetup(
    { assetsDir: '/tmp/assets', items: [item] },
    { run, makeDirectory: async () => {} }
  );
  assert.deepEqual(result, { registered: [], skipped: ['codex'] });
  assert.equal(lookups, 2);
  assert.equal(added, false);
});

test('stops before writing when any client lookup fails unexpectedly', async () => {
  const codex = registration('codex', '/tmp/assets');
  const claude = registration('claude', '/tmp/assets');
  const calls = [];
  let madeDirectory = false;
  const run = (command, args) => {
    calls.push(args);
    if (args === codex.get)
      return { status: 1, stdout: '', stderr: "No MCP server named 'chocodrop' found." };
    return { status: 1, stdout: '', stderr: 'Could not read configuration' };
  };
  await assert.rejects(
    applySetup(
      { assetsDir: '/tmp/assets', items: [codex, claude] },
      {
        run,
        makeDirectory: async () => {
          madeDirectory = true;
        },
      }
    ),
    /既存設定を確認できないため、変更を中止/
  );
  assert.equal(madeDirectory, false);
  assert.deepEqual(calls, [codex.get, claude.get]);
});

test('dry-run detects installed clients without creating folders or changing config', async () => {
  const output = new PassThrough();
  let text = '';
  output.on('data', (chunk) => {
    text += chunk;
  });
  let directoryCreated = false;
  const run = (command, args) => ({
    status: ['codex', 'claude'].includes(command) && args[0] === '--version' ? 0 : 1,
    stdout: args[0] === 'mcp' ? 'No MCP server named "chocodrop".' : '',
    stderr: '',
  });

  const result = await runSetup(['--dry-run'], {
    run,
    fileExists: () => false,
    makeDirectory: async () => {
      directoryCreated = true;
    },
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

test('shows that existing ChocoDrop entries will be preserved', async () => {
  const output = new PassThrough();
  let text = '';
  output.on('data', (chunk) => {
    text += chunk;
  });
  const run = (command, args) => {
    if (command === 'codex' && args[0] === '--version')
      return { status: 0, stdout: 'codex 1', stderr: '' };
    if (command === 'codex' && args[0] === 'mcp' && args[1] === 'get')
      return { status: 0, stdout: 'chocodrop', stderr: '' };
    return { status: 1, stdout: '', stderr: '' };
  };

  await runSetup(['--dry-run'], {
    run,
    fileExists: () => false,
    input: new PassThrough(),
    output,
    errorOutput: new PassThrough(),
  });

  assert.match(text, /既存のChocoDrop設定は変更しません: Codex/);
  assert.match(text, /Codex: 既存設定を維持/);
  assert.doesNotMatch(text, /codex mcp add chocodrop/);
});

test('rerun with an existing entry needs no confirmation and makes no changes', async () => {
  const output = new PassThrough();
  let text = '';
  output.on('data', (chunk) => {
    text += chunk;
  });
  let directoryCreated = false;
  const run = (command, args) => ({
    status: command === 'codex' && (args[0] === '--version' || args[0] === 'mcp') ? 0 : 1,
    stdout: '',
    stderr: '',
  });
  const result = await runSetup(['--client', 'codex'], {
    run,
    fileExists: () => false,
    makeDirectory: async () => {
      directoryCreated = true;
    },
    input: new PassThrough(),
    output,
  });
  assert.equal(result.changed, false);
  assert.deepEqual(result.skipped, ['codex']);
  assert.equal(directoryCreated, false);
  assert.match(text, /既存設定を維持したため、変更はありません/);
});

test('preserves Antigravity config while adding ChocoDrop', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'chocodrop-setup-antigravity-'));
  const item = registration(
    'antigravity',
    path.join(root, 'assets'),
    '@chocodrop/mcp@0.1.0-alpha.1',
    'pnpm',
    root
  );
  try {
    await mkdir(path.dirname(item.configPath), { recursive: true });
    await writeFile(
      item.configPath,
      `${JSON.stringify({ mcpServers: { existing: { command: 'existing' } }, theme: 'dark' }, null, 2)}\n`
    );
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
  const item = registration(
    'antigravity',
    path.join(root, 'assets'),
    '@chocodrop/mcp@0.1.0-alpha.1',
    'pnpm',
    root
  );
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

test('preserves an existing Antigravity ChocoDrop entry byte for byte', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'chocodrop-setup-antigravity-existing-'));
  const item = registration(
    'antigravity',
    path.join(root, 'assets'),
    '@chocodrop/mcp@0.1.0-alpha.1',
    'pnpm',
    root
  );
  const original =
    '{ "mcpServers": { "chocodrop": { "command": "custom", "args": ["keep"] } }, "theme": "dark" }\n';
  try {
    await mkdir(path.dirname(item.configPath), { recursive: true });
    await writeFile(item.configPath, original);
    const result = await applySetup({ assetsDir: path.join(root, 'assets'), items: [item] });
    assert.deepEqual(result, { registered: [], skipped: ['antigravity'] });
    assert.equal(await readFile(item.configPath, 'utf8'), original);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('does not overwrite Antigravity config added after the initial lookup', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'chocodrop-setup-antigravity-race-'));
  const item = registration(
    'antigravity',
    path.join(root, 'assets'),
    '@chocodrop/mcp@0.1.0-alpha.1',
    'pnpm',
    root
  );
  const original = '{ "mcpServers": { "chocodrop": { "command": "custom" } } }\n';
  try {
    const result = await applySetup(
      { assetsDir: path.join(root, 'assets'), items: [item] },
      {
        makeDirectory: async () => {
          await mkdir(path.dirname(item.configPath), { recursive: true });
          await writeFile(item.configPath, original);
        },
      }
    );
    assert.deepEqual(result, { registered: [], skipped: ['antigravity'] });
    assert.equal(await readFile(item.configPath, 'utf8'), original);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects malformed Antigravity config before creating assets', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'chocodrop-setup-antigravity-bad-'));
  const item = registration(
    'antigravity',
    path.join(root, 'assets'),
    '@chocodrop/mcp@0.1.0-alpha.1',
    'pnpm',
    root
  );
  try {
    await mkdir(path.dirname(item.configPath), { recursive: true });
    await writeFile(item.configPath, '{ "mcpServers": [] }\n');
    await assert.rejects(
      applySetup({ assetsDir: path.join(root, 'assets'), items: [item] }),
      /mcpServers/
    );
    await assert.rejects(stat(path.join(root, 'assets')), { code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('parses explicit clients and rejects unknown options', () => {
  assert.deepEqual(parseArgs(['--client', 'codex,antigravity', '--yes']).clients, [
    'codex',
    'antigravity',
  ]);
  assert.throws(() => parseArgs(['--wat']), /不明なオプション/);
});
