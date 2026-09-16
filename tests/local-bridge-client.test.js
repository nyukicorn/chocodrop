import assert from 'node:assert/strict';
import test from 'node:test';
import { importBridgeAsset } from '../src/client/local-bridge.js';

test('bridge confirms scene registration for each supported media type', async () => {
  for (const [mediaType, method] of Object.entries({ image: 'loadImageFile', video: 'loadVideoFile', model: 'load3DModel' })) {
    const manager = {
      spawnedObjects: new Map(),
      async [method](url, options) {
        assert.equal(url, 'http://127.0.0.1:43111/local-api/assets/abc?token=test');
        assert.equal(options.fileName, 'sample');
        assert.deepEqual(options.position, { x: 1, y: 2, z: 3 });
        this.spawnedObjects.set('asset-1', {});
        return { success: true, objectId: 'asset-1' };
      }
    };
    const result = await importBridgeAsset(manager, {
      asset: { url: '/local-api/assets/abc?token=test', mediaType, name: 'sample' },
      position: { x: 1, y: 2, z: 3 }
    }, 'http://127.0.0.1:43111');
    assert.equal(result.objectId, 'asset-1');
  }
});

test('bridge rejects foreign URLs, unsupported types, and false placement success', async () => {
  const origin = 'http://127.0.0.1:43111';
  for (const url of ['https://example.com/local-api/assets/abc', '/config.json', 'file:///tmp/image.png']) {
    await assert.rejects(importBridgeAsset({}, { asset: { url } }, origin), /local bridge/);
  }
  await assert.rejects(importBridgeAsset({}, { asset: { url: '/local-api/assets/abc', mediaType: 'html' } }, origin), /Unsupported/);
  const manager = { spawnedObjects: new Map(), loadImageFile: async () => ({ success: true, objectId: 'missing' }) };
  await assert.rejects(importBridgeAsset(manager, { asset: { url: '/local-api/assets/abc', mediaType: 'image' } }, origin), /not added/);
  manager.loadImageFile = async () => { throw new Error('Invalid image'); };
  await assert.rejects(importBridgeAsset(manager, { asset: { url: '/local-api/assets/abc', mediaType: 'image' } }, origin), /Invalid image/);
});
