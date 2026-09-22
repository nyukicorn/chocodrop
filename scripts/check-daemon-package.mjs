import { readFile } from 'node:fs/promises';

const metadata = JSON.parse(await readFile(process.argv[2], 'utf8'))[0];
const included = new Set(metadata.files.map((file) => file.path));
for (const required of [
  'LICENSE',
  'THIRD_PARTY_NOTICES.txt',
  'runtime/dist/chocodrop-sdk.esm.js',
  'runtime/dist/ui.esm.js',
  'runtime/dist/ui.global.js',
  'runtime/src/client/CommandUI.js',
  'runtime/vendor/three-0.170.0.min.js',
]) {
  if (!included.has(required)) throw new Error(`Daemon package is missing ${required}`);
}
console.log('Daemon package includes its browser runtime');
