import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';

const DEFAULT_MCP_PACKAGE = '@chocodrop/mcp@0.1.0-alpha.1';
const CLIENT_ORDER = ['codex', 'claude', 'antigravity'];
const CLIENTS = {
  codex: { command: 'codex', label: 'Codex' },
  claude: { command: 'claude', label: 'Claude Code' },
  antigravity: { command: 'agy', label: 'Antigravity' },
};

function execute(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
    env: options.env || process.env,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error,
  };
}

function expandHome(value) {
  if (value === '~') return homedir();
  if (value.startsWith(`~${path.sep}`)) return path.join(homedir(), value.slice(2));
  return value;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const result = { clients: [], yes: false, dryRun: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--client') result.clients.push(...String(argv[++index] || '').split(','));
    else if (value === '--assets-dir') result.assetsDir = argv[++index];
    else if (value === '--yes' || value === '-y') result.yes = true;
    else if (value === '--dry-run') result.dryRun = true;
    else if (value === '--help' || value === '-h') result.help = true;
    else throw new Error(`不明なオプションです: ${value}`);
  }
  result.clients = [...new Set(result.clients.map((value) => value.trim()).filter(Boolean))];
  return result;
}

function antigravityLocations(home = homedir(), platform = process.platform) {
  if (platform === 'darwin')
    return ['/Applications/Antigravity.app', path.join(home, 'Applications/Antigravity.app')];
  if (platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA;
    return localAppData
      ? [path.join(localAppData, 'Programs', 'Antigravity', 'Antigravity.exe')]
      : [];
  }
  return ['/usr/bin/antigravity', '/usr/local/bin/antigravity'];
}

export function detectClients(run = execute, fileExists = existsSync) {
  return CLIENT_ORDER.filter((name) => {
    if (run(CLIENTS[name].command, ['--version']).status === 0) return true;
    return (
      name === 'antigravity' && antigravityLocations().some((candidate) => fileExists(candidate))
    );
  });
}

function packageCommand(packageSpec, assetsDir, runner = 'pnpm') {
  if (runner === 'pnpm') return ['pnpm', 'dlx', packageSpec, '--assets-dir', assetsDir];
  return ['npx', '-y', packageSpec, '--assets-dir', assetsDir];
}

export function registration(
  name,
  assetsDir,
  packageSpec = DEFAULT_MCP_PACKAGE,
  runner = 'pnpm',
  home = homedir()
) {
  const mcpCommand = packageCommand(packageSpec, assetsDir, runner);
  if (name === 'codex') {
    return {
      name,
      ...CLIENTS[name],
      add: ['mcp', 'add', 'chocodrop', '--', ...mcpCommand],
      get: ['mcp', 'get', 'chocodrop'],
      remove: ['mcp', 'remove', 'chocodrop'],
    };
  }
  if (name === 'claude') {
    return {
      name,
      ...CLIENTS[name],
      add: [
        'mcp',
        'add',
        '--transport',
        'stdio',
        '--scope',
        'user',
        'chocodrop',
        '--',
        ...mcpCommand,
      ],
      get: ['mcp', 'get', 'chocodrop'],
      remove: ['mcp', 'remove', '--scope', 'user', 'chocodrop'],
    };
  }
  if (name === 'antigravity') {
    return {
      name,
      ...CLIENTS[name],
      kind: 'json',
      configPath: path.join(home, '.gemini', 'config', 'mcp_config.json'),
      server: { command: mcpCommand[0], args: mcpCommand.slice(1) },
    };
  }
  throw new Error(`対応していないツールです: ${name}`);
}

export function shellCommand(command, args) {
  const quote = (value) =>
    /^[A-Za-z0-9_./:@%+=,-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
  return [command, ...args].map(quote).join(' ');
}

function readJsonConfig(configPath) {
  try {
    const source = readFileSync(configPath, 'utf8').trim();
    if (!source) return {};
    const value = JSON.parse(source);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('設定のルートがJSONオブジェクトではありません');
    return value;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw new Error(`Antigravity設定を読み込めません: ${error.message}`);
  }
}

function configured(item, run, loadConfig = readJsonConfig) {
  if (item.kind === 'json') {
    const config = loadConfig(item.configPath);
    const servers = config.mcpServers;
    if (
      servers !== undefined &&
      (!servers || typeof servers !== 'object' || Array.isArray(servers))
    )
      throw new Error('Antigravity設定のmcpServersがJSONオブジェクトではありません');
    return Object.hasOwn(servers || {}, 'chocodrop');
  }
  const result = run(item.command, item.get);
  if (result.status === 0) return true;
  const details = `${result.stderr || ''}\n${result.stdout || ''}`;
  if (/No MCP server named ['"]chocodrop['"](?: found)?\./.test(details)) return false;
  throw new Error(`${item.label}の既存設定を確認できないため、変更を中止しました`);
}

async function updateAntigravityConfig(item) {
  await mkdir(path.dirname(item.configPath), { recursive: true });
  let config = {};
  let mode = 0o600;
  try {
    const source = (await readFile(item.configPath, 'utf8')).trim();
    config = source ? JSON.parse(source) : {};
    mode = (await stat(item.configPath)).mode & 0o777;
  } catch (error) {
    if (error.code !== 'ENOENT')
      throw new Error(`Antigravity設定を更新できません: ${error.message}`);
  }
  if (!config || typeof config !== 'object' || Array.isArray(config))
    throw new Error('Antigravity設定のルートがJSONオブジェクトではありません');
  if (config.mcpServers === undefined) config.mcpServers = {};
  else if (
    !config.mcpServers ||
    typeof config.mcpServers !== 'object' ||
    Array.isArray(config.mcpServers)
  )
    throw new Error('Antigravity設定のmcpServersがJSONオブジェクトではありません');
  if (Object.hasOwn(config.mcpServers, 'chocodrop')) return false;
  config.mcpServers.chocodrop = item.server;
  const temporary = `${item.configPath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, { mode });
  await rename(temporary, item.configPath);
  return true;
}

export async function applySetup(
  plan,
  {
    run = execute,
    makeDirectory = mkdir,
    updateConfig = updateAntigravityConfig,
    loadConfig = readJsonConfig,
  } = {}
) {
  // Inspect every client before writing anything. A failed lookup must not erase an existing entry.
  const existing = new Map(
    plan.items.map((item) => [item.name, configured(item, run, loadConfig)])
  );
  const registered = [];
  const skipped = [];
  if (plan.items.every((item) => existing.get(item.name)))
    return { registered, skipped: plan.items.map((item) => item.name) };
  await makeDirectory(plan.assetsDir, { recursive: true });
  for (const item of plan.items) {
    if (existing.get(item.name)) {
      skipped.push(item.name);
      continue;
    }
    try {
      if (item.kind === 'json') {
        if (await updateConfig(item)) registered.push(item.name);
        else skipped.push(item.name);
        continue;
      }
      if (configured(item, run, loadConfig)) {
        skipped.push(item.name);
        continue;
      }
      const added = run(item.command, item.add);
      if (added.status !== 0) {
        const details = (added.stderr || added.stdout).trim();
        throw new Error(`${item.label}へ登録できませんでした${details ? `: ${details}` : ''}`);
      }
      registered.push(item.name);
    } catch (error) {
      if (!registered.length) throw error;
      throw new Error(
        `${error.message}\n登録済み: ${registered.map((name) => CLIENTS[name].label).join('・')}。再実行時は既存設定を維持します。`,
        { cause: error }
      );
    }
  }
  return { registered, skipped };
}

function usage() {
  return `🍫 ChocoDrop setup\n\n使い方:\n  pnpm dlx @chocodrop/setup@0.1.0-alpha.2\n  pnpm dlx @chocodrop/setup@0.1.0-alpha.2 --client codex,antigravity --yes\n\nオプション:\n  --client <name>      codex / claude / antigravity / all（カンマ区切り可）\n  --assets-dir <path>  素材フォルダ（既定: ~/ChocoDropAssets）\n  --yes, -y            確認を省略\n  --dry-run            変更せず、実行内容だけ表示\n\n既存のChocoDrop設定は変更しません。更新する場合は各ツールの設定を確認してください。\n`;
}

async function confirm(message, input, output) {
  const prompt = createInterface({ input, output });
  try {
    const answer = (await prompt.question(`${message} [Y/n] `)).trim().toLowerCase();
    return answer === '' || answer === 'y' || answer === 'yes';
  } finally {
    prompt.close();
  }
}

export async function runSetup(
  argv = process.argv.slice(2),
  {
    run = execute,
    makeDirectory = mkdir,
    fileExists = existsSync,
    loadConfig = readJsonConfig,
    updateConfig = updateAntigravityConfig,
    input = process.stdin,
    output = process.stdout,
  } = {}
) {
  const args = parseArgs(argv);
  if (args.help) {
    output.write(usage());
    return { changed: false, clients: [] };
  }

  const detected = detectClients(run, fileExists);
  let selected = args.clients.length ? args.clients : detected;
  if (selected.includes('all')) selected = detected;
  const invalid = selected.filter((name) => !CLIENTS[name]);
  if (invalid.length) throw new Error(`対応していないツールです: ${invalid.join(', ')}`);
  const missing = selected.filter((name) => !detected.includes(name));
  if (missing.length)
    throw new Error(
      `ツールが見つかりません: ${missing.map((name) => CLIENTS[name].label).join(', ')}`
    );
  if (!selected.length)
    throw new Error(
      'Codex、Claude Code、Antigravityが見つかりません。先に利用するツールをインストールしてください'
    );

  const assetsDir = path.resolve(
    expandHome(args.assetsDir || path.join(homedir(), 'ChocoDropAssets'))
  );
  const runner = run('pnpm', ['--version']).status === 0 ? 'pnpm' : 'npx';
  const plan = {
    assetsDir,
    items: selected.map((name) => registration(name, assetsDir, DEFAULT_MCP_PACKAGE, runner)),
  };
  const existing = plan.items.filter((item) => configured(item, run, loadConfig));
  const existingNames = new Set(existing.map((item) => item.name));
  output.write('\n🍫 ChocoDropを設定します\n');
  output.write(`素材フォルダ: ${assetsDir}\n`);
  output.write(`接続先: ${plan.items.map((item) => item.label).join('・')}\n\n`);
  for (const item of plan.items) {
    if (existingNames.has(item.name)) {
      output.write(`  ${item.label}: 既存設定を維持\n`);
      continue;
    }
    if (item.kind === 'json') output.write(`  ${item.configPath} の mcpServers.chocodrop を設定\n`);
    else output.write(`  ${shellCommand(item.command, item.add)}\n`);
  }
  if (existing.length)
    output.write(
      `\n既存のChocoDrop設定は変更しません: ${existing.map((item) => item.label).join('・')}\n`
    );

  if (args.dryRun) {
    output.write('\nドライランのため変更していません。\n');
    return { changed: false, clients: selected, assetsDir };
  }
  if (existing.length === plan.items.length) {
    output.write('\n既存設定を維持したため、変更はありません。\n');
    return { changed: false, clients: selected, registered: [], skipped: selected, assetsDir };
  }
  if (!args.yes) {
    if (!input.isTTY) throw new Error('非対話環境では--yesを付けて実行してください');
    if (!(await confirm('\n素材フォルダを作成し、上記の設定を登録しますか？', input, output))) {
      output.write('変更しませんでした。\n');
      return { changed: false, clients: selected, assetsDir };
    }
  }

  const { registered, skipped } = await applySetup(plan, {
    run,
    makeDirectory,
    updateConfig,
    loadConfig,
  });
  if (registered.length) {
    output.write(
      `\n✅ ChocoDrop MCPを登録しました: ${registered.map((name) => CLIENTS[name].label).join('・')}\n`
    );
    output.write('ツールを再起動し、「ChocoDropのget_statusでURLを教えて」と依頼してください。\n');
    output.write('生成した素材は上記フォルダへ保存し、import_assetで配置できます。\n');
  }
  if (skipped.length)
    output.write(
      `既存設定を維持しました: ${skipped.map((name) => CLIENTS[name].label).join('・')}。更新する場合は各ツールの設定を確認してください。\n`
    );
  return { changed: registered.length > 0, clients: selected, registered, skipped, assetsDir };
}

export { CLIENTS, DEFAULT_MCP_PACKAGE, usage };
