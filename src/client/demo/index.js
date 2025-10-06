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

  // UI固有のオプションキーリスト（CommandUIDemo.jsのconfigと対応）
  const UI_SPECIFIC_OPTIONS = [
    'enableServerHealthCheck',
    'skipServiceDialog',
    'theme',
    'showExamples',
    'autoScroll',
    'enableDebugLogging'
  ];

  const {
    camera = null,
    renderer = null,
    serverUrl = null,
    client = null,
    onControlsToggle = () => {},
    sceneOptions = {},
    uiOptions = {},
    ...otherOptions  // UI設定とScene設定が混在している可能性
  } = options;

  const resolvedServerUrl = serverUrl || sceneOptions.serverUrl || null;
  const chocoDropClient = client || new ChocoDropClient(resolvedServerUrl);

  // otherOptionsからUI固有の設定を抽出して振り分け
  const extractedUIOptions = {};
  const extractedSceneOptions = {};

  Object.keys(otherOptions).forEach(key => {
    if (UI_SPECIFIC_OPTIONS.includes(key)) {
      extractedUIOptions[key] = otherOptions[key];
    } else {
      extractedSceneOptions[key] = otherOptions[key];
    }
  });

  // 明示的な設定を優先してマージ
  const mergedUIOptions = {
    ...extractedUIOptions,
    ...uiOptions
  };

  const mergedSceneOptions = {
    ...sceneOptions,
    ...extractedSceneOptions
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
  ...mergedUIOptions
});

if (typeof commandUI.showInputFeedback !== 'function') {
  commandUI.showInputFeedback = function(message, type = 'error') {
    if (type === 'error') {
      this.addOutput(`⚠️ ${message}`, 'error');
    } else {
      this.addOutput(`💡 ${message}`, 'system');
    }
  };
}

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

if (typeof CommandUIDemo !== 'undefined' && typeof CommandUIDemo.prototype.showInputFeedback !== 'function') {
  CommandUIDemo.prototype.showInputFeedback = function(message, type = 'error') {
    if (type === 'error') {
      this.addOutput(`⚠️ ${message}`, 'error');
    } else {
      this.addOutput(`💡 ${message}`, 'system');
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
