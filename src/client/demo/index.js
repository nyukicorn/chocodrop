import { ChocoDropClient, ChocoDroClient, LiveCommandClient } from '../LiveCommandClient.js';
import { SceneManager } from '../SceneManager.js';
import { CommandUIDemo } from './CommandUIDemo.js';
import { createChocoDrop, createChocoDro, createLiveCommand } from '../bootstrap.js';

/**
 * Demo version bootstrap function
 * Creates ChocoDrop instance with CommandUIDemo (restricted functionality)
 */
function createChocoDropDemo(scene, options = {}) {
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
    uiOptions = {},
    ...otherSceneOptions
  } = options;

  const resolvedServerUrl = serverUrl || sceneOptions.serverUrl || null;
  const chocoDropClient = client || new ChocoDropClient(resolvedServerUrl);

  // 旧APIとの互換のため、トップレベルに渡された追加オプションもSceneManagerへ伝搬させる
  const mergedSceneOptions = {
    ...sceneOptions,
    ...otherSceneOptions
  };

  const sceneManager = new SceneManager(scene, {
    camera,
    renderer,
    serverUrl: resolvedServerUrl,
    client: chocoDropClient,
    ...mergedSceneOptions
  });

  // Use CommandUIDemo instead of CommandUI
  const commandUI = new CommandUIDemo({
    sceneManager,
    client: chocoDropClient,
    onControlsToggle,
    ...uiOptions
  });

  sceneManager.ui = commandUI;
  commandUI.setSceneManager(sceneManager);

  return {
    sceneManager,
    ui: commandUI,
    client: chocoDropClient,
    dispose: () => {
      if (commandUI) commandUI.dispose();
      if (sceneManager) sceneManager.dispose();
    }
  };
}

// Export everything for demo UMD
export {
  ChocoDropClient,
  ChocoDroClient,
  LiveCommandClient,
  SceneManager,
  CommandUIDemo,
  createChocoDropDemo,
  createChocoDropDemo as createChocoDrop,  // Alias for compatibility
  createChocoDro,
  createLiveCommand
};

// Default export for convenience
export default {
  ChocoDropClient,
  ChocoDroClient,
  LiveCommandClient,
  SceneManager,
  CommandUI: CommandUIDemo, // Alias for demo
  CommandUIDemo,
  createChocoDrop: createChocoDropDemo, // Use demo version
  createChocoDro,
  createLiveCommand
};
