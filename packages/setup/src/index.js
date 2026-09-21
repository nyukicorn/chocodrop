import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';

const DEFAULT_MCP_PACKAGE = '@chocodrop/mcp@alpha';
const CLIENT_ORDER = ['codex', 'claude', 'gemini'];
const CLIENTS = {
  codex: { command: 'codex', label: 'Codex' },
  claude: { command: 'claude', label: 'Claude Code' },
  gemini: { command: 'gemini', label: 'Gemini CLI' },
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

export function detectClients(run = execute) {
  return CLIENT_ORDER.filter((name) => run(CLIENTS[name].command, ['--version']).status === 0);
}

export function registration(name, assetsDir, packageSpec = DEFAULT_MCP_PACKAGE) {
  const mcpCommand = ['npx', '-y', packageSpec, '--assets-dir', assetsDir];
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
      add: ['mcp', 'add', '--transport', 'stdio', '--scope', 'user', 'chocodrop', '--', ...mcpCommand],
      get: ['mcp', 'get', 'chocodrop'],
      remove: ['mcp', 'remove', '--scope', 'user', 'chocodrop'],
    };
  }
  if (name === 'gemini') {
    return {
      name,
      ...CLIENTS[name],
      add: ['mcp', 'add', '--scope', 'user', 'chocodrop', 'npx', '--', '-y', packageSpec, '--assets-dir', assetsDir],
      get: ['mcp', 'list'],
      remove: ['mcp', 'remove', '--scope', 'user', 'chocodrop'],
    };
  }
  throw new Error(`対応していないツールです: ${name}`);
}

export function shellCommand(command, args) {
  const quote = (value) => (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`);
  return [command, ...args].map(quote).join(' ');
}

function configured(item, run) {
  const result = run(item.command, item.get);
  if (item.name !== 'gemini') return result.status === 0;
  return result.status === 0 && new RegExp('(^|\\n)\\s*chocodrop(?:\\s|:)', 'i').test(result.stdout);
}

export async function applySetup(plan, { run = execute, makeDirectory = mkdir } = {}) {
  await makeDirectory(plan.assetsDir, { recursive: true });
  const completed = [];
  for (const item of plan.items) {
    if (configured(item, run)) {
      const removed = run(item.command, item.remove);
      if (removed.status !== 0)
        throw new Error(`${item.label}の既存ChocoDrop設定を置き換えられませんでした`);
    }
    const added = run(item.command, item.add);
    if (added.status !== 0) {
      const details = (added.stderr || added.stdout).trim();
      throw new Error(`${item.label}へ登録できませんでした${details ? `: ${details}` : ''}`);
    }
    completed.push(item.name);
  }
  return completed;
}

function usage() {
  return `🍫 ChocoDrop setup\n\n使い方:\n  npx -y @chocodrop/setup@alpha\n  npx -y @chocodrop/setup@alpha --client codex,claude --yes\n\nオプション:\n  --client <name>      codex / claude / gemini / all（カンマ区切り可）\n  --assets-dir <path>  素材フォルダ（既定: ~/ChocoDropAssets）\n  --yes, -y            確認を省略\n  --dry-run            変更せず、実行内容だけ表示\n`;
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
    input = process.stdin,
    output = process.stdout,
    errorOutput = process.stderr,
  } = {}
) {
  const args = parseArgs(argv);
  if (args.help) {
    output.write(usage());
    return { changed: false, clients: [] };
  }

  const detected = detectClients(run);
  let selected = args.clients.length ? args.clients : detected;
  if (selected.includes('all')) selected = detected;
  const invalid = selected.filter((name) => !CLIENTS[name]);
  if (invalid.length) throw new Error(`対応していないツールです: ${invalid.join(', ')}`);
  const missing = selected.filter((name) => !detected.includes(name));
  if (missing.length)
    throw new Error(`CLIが見つかりません: ${missing.map((name) => CLIENTS[name].label).join(', ')}`);
  if (!selected.length)
    throw new Error('Codex、Claude Code、Gemini CLIが見つかりません。先に利用するCLIをインストールしてください');

  const assetsDir = path.resolve(expandHome(args.assetsDir || path.join(homedir(), 'ChocoDropAssets')));
  const plan = { assetsDir, items: selected.map((name) => registration(name, assetsDir)) };
  output.write('\n🍫 ChocoDropを設定します\n');
  output.write(`素材フォルダ: ${assetsDir}\n`);
  output.write(`接続先: ${plan.items.map((item) => item.label).join('・')}\n\n`);
  for (const item of plan.items) output.write(`  ${shellCommand(item.command, item.add)}\n`);
  const replacements = plan.items.filter((item) => configured(item, run));
  if (replacements.length)
    output.write(`\n既存のChocoDrop設定を置き換えます: ${replacements.map((item) => item.label).join('・')}\n`);

  if (args.dryRun) {
    output.write('\nドライランのため変更していません。\n');
    return { changed: false, clients: selected, assetsDir };
  }
  if (!args.yes) {
    if (!input.isTTY)
      throw new Error('非対話環境では--yesを付けて実行してください');
    if (!(await confirm('\n素材フォルダを作成し、上記の設定を登録しますか？', input, output))) {
      output.write('変更しませんでした。\n');
      return { changed: false, clients: selected, assetsDir };
    }
  }

  const completed = await applySetup(plan, { run, makeDirectory });
  output.write('\n✅ ChocoDrop MCPを登録しました。\n');
  output.write('CLIを再起動し、「ChocoDropのget_statusでURLを教えて」と依頼してください。\n');
  output.write('生成した素材は上記フォルダへ保存し、import_assetで配置できます。\n');
  if (completed.length !== selected.length)
    errorOutput.write('一部のCLIを登録できませんでした。\n');
  return { changed: true, clients: completed, assetsDir };
}

export { CLIENTS, DEFAULT_MCP_PACKAGE, usage };
