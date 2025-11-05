const OPFS_DIR_NAME = 'chocodrop-models';

async function getRootDirectory() {
  if (!('storage' in navigator) || typeof navigator.storage.getDirectory !== 'function') {
    return null;
  }
  const root = await navigator.storage.getDirectory();
  return await root.getDirectoryHandle(OPFS_DIR_NAME, { create: true });
}

export async function saveModelToOPFS(file) {
  const dir = await getRootDirectory();
  if (!dir) {
    throw new Error('OPFS はサポートされていません');
  }
  const handle = await dir.getFileHandle(file.name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(await file.arrayBuffer());
  await writable.close();
  return { name: file.name, size: file.size };
}

export async function listStoredModels() {
  try {
    const dir = await getRootDirectory();
    if (!dir) return [];
    const models = [];
    for await (const entry of dir.values()) {
      if (entry.kind === 'file') {
        const file = await entry.getFile();
        models.push({ name: file.name, size: file.size, lastModified: file.lastModified });
      }
    }
    return models.sort((a, b) => b.lastModified - a.lastModified);
  } catch (error) {
    console.warn('OPFS lookup failed', error);
    return [];
  }
}

export async function readModelFromOPFS(name) {
  const dir = await getRootDirectory();
  if (!dir) {
    throw new Error('OPFS はサポートされていません');
  }
  const handle = await dir.getFileHandle(name);
  return await handle.getFile();
}

export function isOPFSSupported() {
  return 'storage' in navigator && typeof navigator.storage.getDirectory === 'function';
}
