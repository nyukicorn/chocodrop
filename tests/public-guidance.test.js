import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const files = [
  'README.md',
  'getting-started.html',
  'docs/API.md',
  'docs/BOOKMARKLET.md',
  'docs/INTEGRATION.md',
  'docs/LOCAL_TOOLS.md',
  'docs/SETUP.md',
  'docs/TROUBLESHOOTING.md',
  'packages/daemon/README.md',
  'packages/mcp/README.md',
  'packages/setup/README.md',
  'prototypes/bloom/README.md',
];

async function contents() {
  return Promise.all(files.map(async (file) => [file, await readFile(file, 'utf8')]));
}

test('public guidance uses the current local-file workflow', async () => {
  for (const [file, source] of await contents()) {
    assert.doesNotMatch(source, /KAMUI|Kamui|カムイ/, `${file} still presents the legacy integration`);
    assert.doesNotMatch(source, /@chocodrop\/(?:mcp|setup)@0\.1\.0-alpha\.0/, `${file} uses an obsolete package tag`);
    assert.doesNotMatch(source, /@chocodrop\/daemon@1\.0\.3-alpha\.0/, `${file} uses an obsolete daemon tag`);
  }
});

test('getting started links to deployable resources and exact package versions', async () => {
  const source = await readFile('getting-started.html', 'utf8');
  const mcp = JSON.parse(await readFile('packages/mcp/package.json', 'utf8'));
  const setup = JSON.parse(await readFile('packages/setup/package.json', 'utf8'));
  const daemon = JSON.parse(await readFile('packages/daemon/package.json', 'utf8'));

  assert.match(source, new RegExp(`@chocodrop/setup@${setup.version.replaceAll('.', '\\.')}`));
  assert.match(source, new RegExp(`@chocodrop/daemon@${daemon.version.replaceAll('.', '\\.')}`));
  assert.doesNotMatch(source, /href=["']docs\//, 'Pages must not link to source-only docs as local files');
  assert.equal(mcp.version, setup.version, 'setup and MCP releases must stay in lockstep');
});
