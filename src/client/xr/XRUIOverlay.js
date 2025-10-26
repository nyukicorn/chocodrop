import * as THREEModule from 'three';
const THREE = globalThis.THREE || THREEModule;

/**
 * XRUIOverlay - WebXR 没入型UIオーバーレイシステム
 * ヘッドセット内に情報パネル、メニュー、通知を表示
 */
export class XRUIOverlay {
  constructor(scene, camera, options = {}) {
    if (!scene || !camera) {
      throw new Error('THREE.Scene and THREE.Camera are required');
    }

    this.scene = scene;
    this.camera = camera;
    this.options = options;

    // UIパネルグループ
    this.uiGroup = new THREE.Group();
    this.uiGroup.name = 'XRUIOverlay';
    this.scene.add(this.uiGroup);

    // アクティブなパネル
    this.panels = new Map(); // id -> { mesh, element, position, visible }

    // 通知キュー
    this.notifications = [];
    this.maxNotifications = options.maxNotifications || 3;

    // デフォルト設定
    this.defaultDistance = options.defaultDistance || 1.5; // カメラから1.5m
    this.panelScale = options.panelScale || 0.001; // スケール調整
    this.fadeEnabled = options.fadeEnabled !== false;

    console.log('📱 XRUIOverlay initialized');
  }

  /**
   * テキストパネルを作成
   */
  createTextPanel(id, text, options = {}) {
    const width = options.width || 512;
    const height = options.height || 256;
    const backgroundColor = options.backgroundColor || 'rgba(0, 0, 0, 0.7)';
    const textColor = options.textColor || '#ffffff';
    const fontSize = options.fontSize || 32;

    // Canvas作成
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');

    // 背景
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, width, height);

    // テキスト
    context.fillStyle = textColor;
    context.font = `${fontSize}px Arial`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    // 複数行対応
    const lines = text.split('\n');
    const lineHeight = fontSize * 1.2;
    const startY = (height - lines.length * lineHeight) / 2 + lineHeight / 2;

    lines.forEach((line, i) => {
      context.fillText(line, width / 2, startY + i * lineHeight);
    });

    // テクスチャ作成
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    // マテリアル
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: options.opacity || 1,
      side: THREE.DoubleSide
    });

    // メッシュ
    const geometry = new THREE.PlaneGeometry(width * this.panelScale, height * this.panelScale);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `ui-panel-${id}`;

    // 位置設定
    const position = options.position || this.getDefaultPosition();
    mesh.position.copy(position);

    // カメラを向く
    if (options.lookAtCamera !== false) {
      mesh.lookAt(this.camera.position);
    }

    // シーンに追加
    this.uiGroup.add(mesh);

    // パネル情報を保存
    this.panels.set(id, {
      mesh,
      canvas,
      context,
      texture,
      position: position.clone(),
      options,
      visible: true
    });

    console.log(`📱 Text panel created: ${id}`);

    return mesh;
  }

  /**
   * 情報パネルを作成（複数情報表示用）
   */
  createInfoPanel(id, data, options = {}) {
    const width = options.width || 600;
    const height = options.height || 400;
    const padding = 20;
    const lineHeight = 30;

    // Canvas作成
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');

    // 背景
    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(20, 20, 40, 0.9)');
    gradient.addColorStop(1, 'rgba(10, 10, 20, 0.9)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    // ボーダー
    context.strokeStyle = '#00ffff';
    context.lineWidth = 3;
    context.strokeRect(0, 0, width, height);

    // データを描画
    context.fillStyle = '#ffffff';
    context.font = '24px Arial';
    context.textAlign = 'left';

    let y = padding + 30;

    // タイトル
    if (options.title) {
      context.font = 'bold 32px Arial';
      context.fillStyle = '#00ffff';
      context.fillText(options.title, padding, y);
      y += lineHeight * 1.5;
    }

    // データ項目
    context.font = '24px Arial';
    context.fillStyle = '#ffffff';

    Object.entries(data).forEach(([key, value]) => {
      context.fillStyle = '#aaaaaa';
      context.fillText(`${key}:`, padding, y);
      context.fillStyle = '#ffffff';
      context.fillText(String(value), padding + 200, y);
      y += lineHeight;
    });

    // テクスチャ作成
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    // マテリアル
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide
    });

    // メッシュ
    const geometry = new THREE.PlaneGeometry(width * this.panelScale, height * this.panelScale);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `ui-panel-${id}`;

    // 位置設定
    const position = options.position || this.getDefaultPosition();
    mesh.position.copy(position);
    mesh.lookAt(this.camera.position);

    // シーンに追加
    this.uiGroup.add(mesh);

    // パネル情報を保存
    this.panels.set(id, {
      mesh,
      canvas,
      context,
      texture,
      position: position.clone(),
      data,
      options,
      visible: true
    });

    console.log(`📊 Info panel created: ${id}`);

    return mesh;
  }

  /**
   * 通知を表示
   */
  showNotification(message, options = {}) {
    const duration = options.duration || 3000; // 3秒
    const type = options.type || 'info'; // info, success, warning, error

    // 色設定
    const colors = {
      info: { bg: 'rgba(0, 100, 255, 0.8)', icon: 'ℹ️' },
      success: { bg: 'rgba(0, 200, 100, 0.8)', icon: '✅' },
      warning: { bg: 'rgba(255, 180, 0, 0.8)', icon: '⚠️' },
      error: { bg: 'rgba(255, 50, 50, 0.8)', icon: '❌' }
    };

    const color = colors[type];
    const id = `notification-${Date.now()}`;

    // 既存の通知を上に移動
    this.notifications.forEach((notif, index) => {
      const newY = 0.5 + (index + 1) * 0.2;
      notif.mesh.position.y = newY;
    });

    // 通知パネル作成
    const text = `${color.icon} ${message}`;
    const mesh = this.createTextPanel(id, text, {
      width: 512,
      height: 128,
      backgroundColor: color.bg,
      fontSize: 28,
      position: new THREE.Vector3(0, 0.5, -this.defaultDistance),
      opacity: 0
    });

    // フェードイン
    this.fadeIn(id, 500);

    // 通知情報を保存
    const notification = {
      id,
      mesh,
      timestamp: Date.now(),
      duration
    };

    this.notifications.unshift(notification);

    // 最大数を超えたら古いものを削除
    if (this.notifications.length > this.maxNotifications) {
      const oldest = this.notifications.pop();
      this.removePanel(oldest.id);
    }

    // 自動削除タイマー
    setTimeout(() => {
      this.hideNotification(id);
    }, duration);

    return id;
  }

  /**
   * 通知を非表示
   */
  hideNotification(id) {
    const index = this.notifications.findIndex(n => n.id === id);
    if (index === -1) return;

    // フェードアウト
    this.fadeOut(id, 500, () => {
      this.removePanel(id);
      this.notifications.splice(index, 1);

      // 残りの通知を下に移動
      this.notifications.forEach((notif, i) => {
        const newY = 0.5 + i * 0.2;
        notif.mesh.position.y = newY;
      });
    });
  }

  /**
   * パネルを更新
   */
  updatePanel(id, text, options = {}) {
    const panel = this.panels.get(id);
    if (!panel) return;

    const { canvas, context, texture } = panel;

    // Canvasをクリア
    context.clearRect(0, 0, canvas.width, canvas.height);

    // 背景
    const backgroundColor = options.backgroundColor || panel.options.backgroundColor || 'rgba(0, 0, 0, 0.7)';
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);

    // テキスト
    const textColor = options.textColor || panel.options.textColor || '#ffffff';
    const fontSize = options.fontSize || panel.options.fontSize || 32;

    context.fillStyle = textColor;
    context.font = `${fontSize}px Arial`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    // 複数行対応
    const lines = text.split('\n');
    const lineHeight = fontSize * 1.2;
    const startY = (canvas.height - lines.length * lineHeight) / 2 + lineHeight / 2;

    lines.forEach((line, i) => {
      context.fillText(line, canvas.width / 2, startY + i * lineHeight);
    });

    // テクスチャ更新
    texture.needsUpdate = true;
  }

  /**
   * 情報パネルを更新
   */
  updateInfoPanel(id, data, options = {}) {
    const panel = this.panels.get(id);
    if (!panel) return;

    panel.data = data;

    const { canvas, context, texture } = panel;
    const width = canvas.width;
    const height = canvas.height;
    const padding = 20;
    const lineHeight = 30;

    // Canvasをクリア
    context.clearRect(0, 0, width, height);

    // 背景
    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(20, 20, 40, 0.9)');
    gradient.addColorStop(1, 'rgba(10, 10, 20, 0.9)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    // ボーダー
    context.strokeStyle = '#00ffff';
    context.lineWidth = 3;
    context.strokeRect(0, 0, width, height);

    // データを描画
    let y = padding + 30;

    // タイトル
    if (panel.options.title) {
      context.font = 'bold 32px Arial';
      context.fillStyle = '#00ffff';
      context.fillText(panel.options.title, padding, y);
      y += lineHeight * 1.5;
    }

    // データ項目
    context.font = '24px Arial';
    Object.entries(data).forEach(([key, value]) => {
      context.fillStyle = '#aaaaaa';
      context.fillText(`${key}:`, padding, y);
      context.fillStyle = '#ffffff';
      context.fillText(String(value), padding + 200, y);
      y += lineHeight;
    });

    // テクスチャ更新
    texture.needsUpdate = true;
  }

  /**
   * パネルを削除
   */
  removePanel(id) {
    const panel = this.panels.get(id);
    if (!panel) return;

    this.uiGroup.remove(panel.mesh);
    panel.mesh.geometry.dispose();
    panel.mesh.material.dispose();
    panel.texture.dispose();

    this.panels.delete(id);

    console.log(`🗑️ Panel removed: ${id}`);
  }

  /**
   * パネルの表示/非表示
   */
  setPanelVisible(id, visible) {
    const panel = this.panels.get(id);
    if (!panel) return;

    panel.mesh.visible = visible;
    panel.visible = visible;
  }

  /**
   * フェードイン
   */
  fadeIn(id, duration = 500) {
    const panel = this.panels.get(id);
    if (!panel || !this.fadeEnabled) return;

    const startTime = Date.now();
    const startOpacity = panel.mesh.material.opacity;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      panel.mesh.material.opacity = startOpacity + (1 - startOpacity) * progress;

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    animate();
  }

  /**
   * フェードアウト
   */
  fadeOut(id, duration = 500, callback) {
    const panel = this.panels.get(id);
    if (!panel || !this.fadeEnabled) {
      if (callback) callback();
      return;
    }

    const startTime = Date.now();
    const startOpacity = panel.mesh.material.opacity;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      panel.mesh.material.opacity = startOpacity * (1 - progress);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        if (callback) callback();
      }
    };

    animate();
  }

  /**
   * デフォルト位置を取得（カメラの前方）
   */
  getDefaultPosition() {
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);

    const position = new THREE.Vector3();
    position.copy(this.camera.position);
    position.add(direction.multiplyScalar(this.defaultDistance));

    return position;
  }

  /**
   * パネルをカメラに追従させる
   */
  followCamera(id, offset = new THREE.Vector3(0, 0, -this.defaultDistance)) {
    const panel = this.panels.get(id);
    if (!panel) return;

    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);

    const position = new THREE.Vector3();
    position.copy(this.camera.position);
    position.add(direction.multiplyScalar(offset.z));
    position.add(new THREE.Vector3(offset.x, offset.y, 0));

    panel.mesh.position.copy(position);
    panel.mesh.lookAt(this.camera.position);
  }

  /**
   * 毎フレーム更新
   */
  update() {
    // カメラ追従が有効なパネルを更新
    this.panels.forEach((panel, id) => {
      if (panel.options.followCamera) {
        this.followCamera(id, panel.options.followOffset);
      }
    });
  }

  /**
   * クリーンアップ
   */
  dispose() {
    // 全てのパネルを削除
    this.panels.forEach((panel, id) => {
      this.removePanel(id);
    });

    this.panels.clear();
    this.notifications = [];
    this.scene.remove(this.uiGroup);

    console.log('🗑️ XRUIOverlay disposed');
  }
}

export default XRUIOverlay;
