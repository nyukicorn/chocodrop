import { ChocoDropClient, ChocoDroClient, LiveCommandClient } from './LiveCommandClient.js';
import { SceneManager } from './SceneManager.js';
import { CommandUI } from './CommandUI.js';

/**
 * ChocoDrop ワンステップ初期化ヘルパー
 * 共有フォルダから複数の Three.js プロジェクトへ使い回すことを想定
 *
 * @param {THREE.Scene} scene - 既存 Three.js シーン
 * @param {Object} options - 初期化オプション
 * @param {THREE.Camera} [options.camera] - 相対配置計算に使用するカメラ
 * @param {THREE.WebGLRenderer} [options.renderer] - マウス操作を有効化する場合に使用
 * @param {string} [options.serverUrl] - ChocoDrop サーバーの明示的 URL
 * @param {ChocoDropClient} [options.client] - 既存のクライアントを注入する場合（旧 LiveCommandClient）
 * @param {Function} [options.onControlsToggle] - UI 開閉時に呼ばれるコールバック
 * @param {Object} [options.sceneOptions] - SceneManager へ渡す追加オプション
 * @param {Object} [options.uiOptions] - CommandUI へ渡す追加オプション
 * @returns {Object} - 初期化済みのコンポーネント群と dispose ヘルパー
 */
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

// 旧API名の互換エクスポート
export const createChocoDro = createChocoDrop;
export const createLiveCommand = createChocoDrop;
