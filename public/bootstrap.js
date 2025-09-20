import { ChocoDroClient, LiveCommandClient } from './LiveCommandClient.js';
import { SceneManager } from './SceneManager.js';
import { CommandUI } from './CommandUI.js';

export function createChocoDro(scene, options = {}) {
  if (!scene) {
    throw new Error('THREE.Scene インスタンスが必要です');
  }

  const {
    camera = null,
    renderer = null,
    serverUrl = null,
    client = null,
    onControlsToggle = () => {},
    sceneOptions = {},
    uiOptions = {}
  } = options;

  const resolvedServerUrl = serverUrl || sceneOptions.serverUrl || null;
  const chocoDroClient = client || new ChocoDroClient(resolvedServerUrl);

  const sceneManager = new SceneManager(scene, {
    camera,
    renderer,
    serverUrl: resolvedServerUrl,
    client: chocoDroClient,
    ...sceneOptions
  });

  const commandUI = new CommandUI({
    sceneManager,
    client: chocoDroClient,
    onControlsToggle,
    ...uiOptions
  });

  return {
    client: chocoDroClient,
    sceneManager,
    ui: commandUI,
    dispose() {
      commandUI.dispose?.();
      sceneManager.dispose?.();
    }
  };
}

export const createLiveCommand = createChocoDro;
