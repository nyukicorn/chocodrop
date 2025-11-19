const JSZIP_CDN = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';

const ZIP_HTML_PRIORITY = ['index.html', 'main.html'];

export function isZipFileName(name = '') {
  return String(name).toLowerCase().endsWith('.zip');
}

export async function loadZipProject(file) {
  if (!file) {
    throw new Error('ZIPファイルが指定されていません');
  }
  const JSZip = await importZipModule();
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter(entry => !entry.dir);
  if (!entries.length) {
    throw new Error('ZIP 内にファイルがありません');
  }

  const normalizedEntries = await Promise.all(
    entries.map(async entry => {
      const arrayBuffer = await entry.async('arraybuffer');
      const path = normalizeZipPath(entry.name);
      const blob = new Blob([arrayBuffer], { type: guessMimeFromName(path) });
      const objectUrl = URL.createObjectURL(blob);
      return {
        path,
        name: entry.name.split('/').pop(),
        blob,
        objectUrl
      };
    })
  );

  const htmlEntry = selectHtmlEntry(normalizedEntries);
  if (!htmlEntry) {
    disposeEntries(normalizedEntries);
    throw new Error('ZIP 内に HTML ファイルが見つかりません');
  }

  const htmlText = await htmlEntry.blob.text();
  const baseDir = deriveBaseDir(htmlEntry.path);

  const virtualFiles = normalizedEntries.map(entry => [entry.path, { url: entry.objectUrl, mimeType: entry.blob.type }]);

  return {
    htmlText,
    entryPath: htmlEntry.path,
    baseDir,
    virtualFiles,
    dispose: () => disposeEntries(normalizedEntries)
  };
}

async function importZipModule() {
  if (window.__CHOCODROP_JSZIP__) {
    return window.__CHOCODROP_JSZIP__;
  }
  const module = await import(JSZIP_CDN);
  const JSZip = module.default || module;
  window.__CHOCODROP_JSZIP__ = JSZip;
  return JSZip;
}

function normalizeZipPath(path = '') {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

function deriveBaseDir(path = '') {
  const normalized = normalizeZipPath(path);
  const index = normalized.lastIndexOf('/');
  if (index === -1) return '';
  return normalized.slice(0, index + 1);
}

function selectHtmlEntry(entries) {
  const htmlEntries = entries.filter(entry => entry.path.toLowerCase().endsWith('.html'));
  if (!htmlEntries.length) return null;
  const prioritized = htmlEntries.find(entry => ZIP_HTML_PRIORITY.includes(entry.path.toLowerCase().split('/').pop()));
  return prioritized || htmlEntries[0];
}

function disposeEntries(entries = []) {
  entries.forEach(entry => {
    if (entry.objectUrl) {
      URL.revokeObjectURL(entry.objectUrl);
    }
  });
}

function guessMimeFromName(name = '') {
  const lower = name.toLowerCase();
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html';
  if (lower.endsWith('.js') || lower.endsWith('.mjs')) return 'text/javascript';
  if (lower.endsWith('.css')) return 'text/css';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.glb')) return 'model/gltf-binary';
  if (lower.endsWith('.gltf')) return 'model/gltf+json';
  return 'application/octet-stream';
}

