import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'packages/mcp/runtime');
const marker = path.join(output, '.chocodrop-mcp-runtime');

try {
  await stat(output);
  if (await readFile(marker, 'utf8') !== 'ChocoDrop MCP runtime\n')
    throw new Error('Refusing to replace an unrecognized MCP runtime directory');
  await rm(output, { recursive: true });
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await mkdir(output, { recursive: true });
await writeFile(marker, 'ChocoDrop MCP runtime\n');
await cp(path.join(root, 'src/local/asset-bridge.js'), path.join(output, 'asset-bridge.js'));
await cp(path.join(root, 'src/local/mcp-server.js'), path.join(output, 'mcp-server.js'));

const site = path.join(output, 'site');
const excluded = new Set(['generated', 'imported-scenes', 'node_modules']);
async function copyTree(source, target) {
  const info = await stat(source);
  if (info.isDirectory()) {
    await mkdir(target, { recursive: true });
    for (const entry of await readdir(source, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || excluded.has(entry.name) || entry.isSymbolicLink()) continue;
      await copyTree(path.join(source, entry.name), path.join(target, entry.name));
    }
    return;
  }
  if (info.isFile()) {
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target);
  }
}

for (const relative of ['examples', 'public'])
  await copyTree(path.join(root, relative), path.join(site, relative));
for (const relative of ['index.html', 'getting-started.html', 'src/client/local-bridge.js'])
  await copyTree(path.join(root, relative), path.join(site, relative));

for (const required of [
  'examples/basic/index.html',
  'public/load-chocodrop.js',
  'public/load-three.js',
  'public/chocodrop-demo.umd.min.js',
  'src/client/local-bridge.js',
])
  await stat(path.join(site, required));

console.log('Built @chocodrop/mcp runtime');
