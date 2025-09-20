/**
 * ChocoDro - Client entry point
 * Browser-compatible components only
 */

// Client-side components (browser-compatible)
import { ChocoDroClient, LiveCommandClient } from './client/LiveCommandClient.js';
import { SceneManager } from './client/SceneManager.js';
import { CommandUI } from './client/CommandUI.js';
import { createChocoDro, createLiveCommand } from './client/bootstrap.js';

export { ChocoDroClient, SceneManager, CommandUI, createChocoDro };
export { LiveCommandClient, createLiveCommand };

// ブラウザコンソールから直接アクセスできるようにグローバルへ公開（デバッグ用途）
if (typeof globalThis !== 'undefined') {
  globalThis.SceneManager = SceneManager;
  globalThis.CommandUI = CommandUI;
  globalThis.ChocoDroClient = ChocoDroClient;
  globalThis.createChocoDro = createChocoDro;
  // backwards compatibility
  globalThis.LiveCommandClient = LiveCommandClient;
  globalThis.createLiveCommand = createLiveCommand;
}

// Type definitions for better IDE support
/**
 * @typedef {Object} CommandResult
 * @property {boolean} success - Whether the command was successful
 * @property {string} [objectId] - Generated object ID
 * @property {Object} [position] - Object position {x, y, z}
 * @property {string} [prompt] - Original prompt
 * @property {string} [imageUrl] - Generated image URL
 * @property {string} [error] - Error message if failed
 */

/**
 * @typedef {Object} SceneManagerOptions
 * @property {THREE.Camera} [camera] - Three.js camera for relative positioning
 * @property {THREE.WebGLRenderer} [renderer] - Renderer reference for mouse interaction
 * @property {string} [serverUrl] - ChocoDro Server URL
 * @property {ChocoDroClient} [client] - Shared client instance
 * @property {boolean} [showLocationIndicator] - Show visual indicators
 * @property {number} [indicatorDuration] - Indicator display duration (ms)
 * @property {number} [defaultObjectScale] - Default object scale
 */

/**
 * @typedef {Object} CommandUIOptions
 * @property {SceneManager} [sceneManager] - Scene manager instance
 * @property {ChocoDroClient} [client] - HTTP client instance
 * @property {Function} [onControlsToggle] - Controls toggle callback
 * @property {string} [activationKey] - UI activation key
 * @property {string} [position] - UI position (bottom-right, bottom-left, etc.)
 * @property {number} [width] - UI width in pixels
 * @property {number} [maxHeight] - UI max height in pixels
 */

/**
 * @typedef {Object} CreateChocoDroOptions
 * @property {THREE.Camera} [camera] - シーンに使用するカメラ
 * @property {THREE.WebGLRenderer} [renderer] - マウス操作を有効化するレンダラー
 * @property {string} [serverUrl] - ChocoDro サーバーの URL
 * @property {ChocoDroClient} [client] - 共有クライアントを再利用する場合
 * @property {Function} [onControlsToggle] - UI 表示時にカメラ操作を切り替えるコールバック
 * @property {Object} [sceneOptions] - SceneManager へ渡す追加オプション
 * @property {Object} [uiOptions] - CommandUI へ渡す追加オプション
 */

/**
 * @typedef {Object} ServerOptions
 * @property {number} [port] - Server port
 * @property {string} [host] - Server host
 * @property {string} [publicDir] - Public directory path
 * @property {string} [mcpConfigPath] - MCP config file path
 * @property {string} [kamuiCommand] - Kamui command name
 */
