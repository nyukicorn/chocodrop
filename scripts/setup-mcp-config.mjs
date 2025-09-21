#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const configPath = path.join(projectRoot, 'config.json');

const CANDIDATE_NAMES = [
  'KAMUI CODE.json',
  'KAMUI CODE.JSON',
  'mcp-kamui-code.json',
  'kamui-code.json'
];

function resolveHome(target) {
  if (!target || typeof target !== 'string') {
    return target;
  }
  if (target === '~') {
    return os.homedir();
  }
  if (target.startsWith('~/') || target.startsWith('~\\')) {
    return path.join(os.homedir(), target.slice(2));
  }
  return target;
}

function normalizePath(inputPath) {
  if (!inputPath) return inputPath;
  const expanded = resolveHome(inputPath.trim());
  return path.isAbsolute(expanded) ? expanded : path.resolve(expanded);
}

function findConfigFile(targetPath) {
  if (!targetPath) return null;
  if (!fs.existsSync(targetPath)) return null;

  const stats = fs.statSync(targetPath);
  if (stats.isFile()) {
    return targetPath;
  }

  if (stats.isDirectory()) {
    for (const candidate of CANDIDATE_NAMES) {
      const candidatePath = path.join(targetPath, candidate);
      if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
        return candidatePath;
      }
    }
  }

  return null;
}

async function promptUser(currentValue) {
  const rl = readline.createInterface({ input, output });
  try {
    const messageLines = [
      'MCP設定ファイル（例: KAMUI CODE.json）のパスを入力してください。',
      currentValue ? `現在の設定: ${currentValue}` : 'まだ設定されていません。',
      'そのままEnterを押すと現在の設定を維持します。'
    ];
    const answer = await rl.question(`${messageLines.join('\n')}\n> `);
    return answer.trim();
  } finally {
    await rl.close();
  }
}

function loadConfig() {
  if (!fs.existsSync(configPath)) {
    throw new Error(`config.json が見つかりません: ${configPath}`);
  }
  const json = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(json);
}

function saveConfig(config) {
  const json = JSON.stringify(config, null, 2);
  fs.writeFileSync(configPath, `${json}\n`, 'utf8');
}

async function main() {
  const config = loadConfig();
  if (!config.mcp) {
    config.mcp = {};
  }

  const currentValue = config.mcp.configPath || '';
  const cliArg = process.argv.slice(2).find(arg => !arg.startsWith('--')) || '';

  let inputPath = cliArg;
  let resolvedFile = null;

  while (!resolvedFile) {
    if (!inputPath) {
      const answer = await promptUser(currentValue);
      if (!answer) {
        if (currentValue) {
          console.log('既存の設定を保持します。');
          return;
        }
        console.log('パスが指定されていません。再度入力してください。');
        continue;
      }
      inputPath = answer;
    }

    const normalized = normalizePath(inputPath);
    resolvedFile = findConfigFile(normalized);

    if (!resolvedFile) {
      console.log(`指定されたパスが見つかりません: ${normalized}`);
      console.log('ファイルパスか、ファイルを含むディレクトリを指定してください。');
      inputPath = '';
      continue;
    }
  }

  config.mcp.configPath = resolvedFile;
  saveConfig(config);

  console.log('✅ MCP設定ファイルを更新しました。');
  console.log(`保存先: ${configPath}`);
  console.log(`設定値: ${config.mcp.configPath}`);
}

main().catch(error => {
  console.error('❌ セットアップに失敗しました:', error.message);
  process.exit(1);
});
