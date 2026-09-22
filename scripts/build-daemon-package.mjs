import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'packages/daemon/runtime');
const marker = path.join(output, '.chocodrop-daemon-runtime');
const markerContent = 'ChocoDrop daemon runtime\n';
const bundles = ['chocodrop-sdk.esm.js', 'ui.esm.js', 'ui.global.js'];

for (const bundle of bundles) await stat(path.join(root, 'dist', bundle));
await stat(path.join(root, 'src/client'));
await stat(path.join(root, 'vendor'));

try {
  await stat(output);
  if (await readFile(marker, 'utf8') !== markerContent)
    throw new Error('Refusing to replace an unrecognized daemon runtime directory');
  await rm(output, { recursive: true });
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

await mkdir(path.join(output, 'dist'), { recursive: true });
await writeFile(marker, markerContent);
for (const bundle of bundles)
  await cp(path.join(root, 'dist', bundle), path.join(output, 'dist', bundle));
await cp(path.join(root, 'src/client'), path.join(output, 'src/client'), { recursive: true });
await cp(path.join(root, 'vendor'), path.join(output, 'vendor'), { recursive: true });
