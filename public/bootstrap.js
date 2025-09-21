import { ChocoDropClient, ChocoDroClient, LiveCommandClient } from './LiveCommandClient.js';
import { SceneManager } from './SceneManager.js';
import { CommandUI } from './CommandUI.js';

export function createChocoDrop(scene, options = {}) {
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
  const chocoDropClient = client || new ChocoDropClient(resolvedServerUrl);

  const sceneManager = new SceneManager(scene, {
    camera,
    renderer,
    serverUrl: resolvedServerUrl,
    client: chocoDropClient,
    ...sceneOptions
  });

  const commandUI = new CommandUI({
    sceneManager,
    client: chocoDropClient,
    onControlsToggle,
    ...uiOptions
  });

  return {
    client: chocoDropClient,
    sceneManager,
    ui: commandUI,
    dispose() {
      commandUI.dispose?.();
      sceneManager.dispose?.();
    }
  };
}

export const createChocoDro = createChocoDrop;
export const createLiveCommand = createChocoDrop;
