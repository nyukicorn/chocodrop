// UMDビルド対応: グローバルのTHREEを優先し、なければES moduleのimportを使用
import * as THREEModule from 'three';
const THREE = globalThis.THREE || THREEModule;

/**
 * XRUIAdapter - VR/AR用UI適応
 * ChocoDrop UIをXR空間で表示・操作可能にする
 */
export class XRUIAdapter {
  constructor(scene, camera, options = {}) {
    if (!scene || !camera) {
      throw new Error('THREE.Scene and THREE.Camera are required');
    }

    this.scene = scene;
    this.camera = camera;

    // UI要素
    this.uiPanels = new Map(); // name -> panel
    this.uiGroup = new THREE.Group();
    this.uiGroup.name = 'XR_UI_Group';

    // 設定
    this.config = {
      panelDistance: options.panelDistance || 2.0,
      panelScale: options.panelScale || 1.0,
      followCamera: options.followCamera !== false,
      ...options.config
    };

    console.log('🎨 XRUIAdapter initialized');
  }

  /**
   * VRモード開始時の処理
   */
  onVRStart() {
    console.log('🥽 XRUIAdapter: VR mode started');

    // UIグループをカメラの前に配置
    this.uiGroup.position.set(0, 0, -this.config.panelDistance);
    this.camera.add(this.uiGroup);

    // デスクトップUIを非表示
    this.hideDesktopUI();
  }

  /**
   * ARモード開始時の処理
   */
  onARStart() {
    console.log('📱 XRUIAdapter: AR mode started');

    // ARではUIを控えめに表示
    this.uiGroup.position.set(0, -0.5, -this.config.panelDistance);
    this.camera.add(this.uiGroup);

    // デスクトップUIを非表示
    this.hideDesktopUI();
  }

  /**
   * XRモード終了時の処理
   */
  onXREnd() {
    console.log('👋 XRUIAdapter: XR mode ended');

    // UIグループをカメラから外す
    this.camera.remove(this.uiGroup);

    // デスクトップUIを表示
    this.showDesktopUI();
  }

  /**
   * デスクトップUIを非表示
   */
  hideDesktopUI() {
    const commandUI = document.getElementById('command-ui');
    if (commandUI) {
      commandUI.style.display = 'none';
    }

    const controls = document.querySelectorAll('.command-controls, .ui-overlay');
    controls.forEach(el => {
      el.style.display = 'none';
    });
  }

  /**
   * デスクトップUIを表示
   */
  showDesktopUI() {
    const commandUI = document.getElementById('command-ui');
    if (commandUI) {
      commandUI.style.display = '';
    }

    const controls = document.querySelectorAll('.command-controls, .ui-overlay');
    controls.forEach(el => {
      el.style.display = '';
    });
  }

  /**
   * 3DテキストパネルをXR空間に作成
   * @param {string} name - パネル名
   * @param {string} text - 表示テキスト
   * @param {Object} options - オプション
   */
  createTextPanel(name, text, options = {}) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = options.width || 512;
    canvas.height = options.height || 256;

    // 背景
    context.fillStyle = options.backgroundColor || 'rgba(0, 0, 0, 0.8)';
    context.fillRect(0, 0, canvas.width, canvas.height);

    // テキスト
    context.fillStyle = options.textColor || '#ffffff';
    context.font = options.font || 'bold 40px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, canvas.height / 2);

    // テクスチャとスプライトを作成
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);

    sprite.scale.set(
      (options.width || 512) / 256 * this.config.panelScale,
      (options.height || 256) / 256 * this.config.panelScale,
      1
    );

    sprite.position.copy(options.position || new THREE.Vector3(0, 0, 0));
    sprite.name = name;

    this.uiGroup.add(sprite);
    this.uiPanels.set(name, sprite);

    return sprite;
  }

  /**
   * パネルのテキストを更新
   * @param {string} name - パネル名
   * @param {string} text - 新しいテキスト
   */
  updateTextPanel(name, text) {
    const panel = this.uiPanels.get(name);
    if (!panel) return;

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 256;

    context.fillStyle = 'rgba(0, 0, 0, 0.8)';
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = '#ffffff';
    context.font = 'bold 40px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, canvas.height / 2);

    panel.material.map.image = canvas;
    panel.material.map.needsUpdate = true;
  }

  /**
   * パネルを削除
   * @param {string} name - パネル名
   */
  removePanel(name) {
    const panel = this.uiPanels.get(name);
    if (panel) {
      this.uiGroup.remove(panel);
      panel.material.map.dispose();
      panel.material.dispose();
      this.uiPanels.delete(name);
    }
  }

  /**
   * 全てのパネルをクリア
   */
  clearAllPanels() {
    this.uiPanels.forEach((panel, name) => {
      this.removePanel(name);
    });
  }

  /**
   * UIをカメラの前に配置し直す
   */
  repositionUI() {
    if (this.config.followCamera && this.uiGroup.parent === this.camera) {
      // カメラに親子付けされているので自動的に追従
      return;
    }

    // 手動でカメラの前に配置
    const cameraDirection = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDirection);

    const targetPosition = this.camera.position.clone()
      .add(cameraDirection.multiplyScalar(this.config.panelDistance));

    this.uiGroup.position.copy(targetPosition);
    this.uiGroup.lookAt(this.camera.position);
  }

  /**
   * クリーンアップ
   */
  dispose() {
    this.clearAllPanels();

    if (this.uiGroup.parent) {
      this.uiGroup.parent.remove(this.uiGroup);
    }

    console.log('🗑️ XRUIAdapter disposed');
  }
}
