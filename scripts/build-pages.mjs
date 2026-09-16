import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist/pages');
const marker = path.join(output, '.chocodrop-pages');
const roots = ['index.html', 'getting-started.html', 'examples', 'public', 'vendor', 'src/client', 'src/common', 'src/shared'];
const excluded = new Set(['node_modules', 'generated', 'imported-scenes', 'output', 'dist']);
const extensions = new Set(['.html', '.js', '.css', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.ico', '.glb', '.gltf', '.bin', '.mp4', '.webm', '.mp3', '.ogg', '.wav', '.webmanifest']);

// Never clean a directory that was not created by this script.
try {
  await stat(output);
  if (await readFile(marker, 'utf8') !== 'ChocoDrop Pages\n') throw new Error('Unrecognized Pages output directory');
  await rm(output, { recursive: true });
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  // An existing directory without our marker must not be overwritten.
  try { await stat(output); throw new Error('Pages output exists without a build marker'); }
  catch (missing) { if (missing.code !== 'ENOENT') throw missing; }
}
await mkdir(output, { recursive: true });
await writeFile(marker, 'ChocoDrop Pages\n');

let copied = 0;
async function copyEntry(relative) {
  const source = path.join(root, relative);
  const info = await stat(source);
  if (info.isDirectory()) {
    for (const entry of await readdir(source, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || excluded.has(entry.name) || entry.isSymbolicLink()) continue;
      await copyEntry(path.join(relative, entry.name));
    }
  } else if (info.isFile() && extensions.has(path.extname(relative).toLowerCase())) {
    await mkdir(path.dirname(path.join(output, relative)), { recursive: true });
    await cp(source, path.join(output, relative));
    copied += 1;
  }
}
for (const entry of roots) {
  try { await copyEntry(entry); }
  catch (error) { if (error.code !== 'ENOENT' || entry !== 'src/shared') throw error; }
}
await writeFile(path.join(output, '.nojekyll'), '');
for (const required of ['index.html', 'getting-started.html', 'examples/basic/index.html', 'public/load-chocodrop.js', 'public/chocodrop-demo.umd.min.js', 'src/client/local-bridge.js']) {
  await stat(path.join(output, required));
}
console.log(`Pages: ${copied} static files → dist/pages (no server, configuration, or generated media)`);
