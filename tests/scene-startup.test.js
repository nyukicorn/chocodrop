import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { SceneManager } from '../src/client/SceneManager.js';

test('a renderer-backed scene starts before any XR session is requested', () => {
  const previous = globalThis.sceneManager;
  const scene = new THREE.Scene();
  const renderer = {};
  try {
    const manager = new SceneManager(scene, {
      renderer, client: {}, enableXRBridge: false, enableMouseInteraction: false
    });
    assert.equal(manager.xr.status, 'idle');
    assert.equal(manager.xr.interaction.sceneManager, manager);
    assert.equal(manager.xr.interaction.renderer, renderer);
    assert.equal(manager.spawnedObjects.size, 0);
    assert.ok(scene.children.includes(manager.experimentGroup));
  } finally {
    if (previous === undefined) delete globalThis.sceneManager;
    else globalThis.sceneManager = previous;
  }
});
