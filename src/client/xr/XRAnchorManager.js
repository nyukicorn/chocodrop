import * as THREEModule from 'three';
const THREE = globalThis.THREE || THREEModule;

/**
 * XRAnchorManager - WebXR 空間アンカー管理
 * AR空間に固定されたアンカーポイントを作成・管理
 * セッションを跨いでオブジェクトの位置を保持
 */
export class XRAnchorManager {
  constructor(renderer, scene, options = {}) {
    if (!renderer || !scene) {
      throw new Error('THREE.WebGLRenderer and THREE.Scene are required');
    }

    this.renderer = renderer;
    this.scene = scene;
    this.options = options;

    // アンカー
    this.anchors = new Map(); // XRAnchor -> { mesh, object, userData }
    this.anchorGroup = new THREE.Group();
    this.anchorGroup.name = 'XRAnchors';
    this.scene.add(this.anchorGroup);

    // アンカーの視覚化設定
    this.showAnchors = options.showAnchors !== false; // デフォルトtrue
    this.anchorMarkerSize = options.anchorMarkerSize || 0.05;

    // セッション
    this.session = null;

    // イベントリスナー
    this.listeners = {
      anchoradded: [],
      anchorremoved: [],
      anchorupdated: []
    };

    console.log('⚓ XRAnchorManager initialized');
  }

  /**
   * XRセッション開始時に呼び出す
   */
  onSessionStart(session) {
    this.session = session;
    console.log('⚓ Anchor manager ready for session');
  }

  /**
   * 特定の位置にアンカーを作成
   */
  async createAnchor(pose, options = {}) {
    if (!this.session) {
      throw new Error('No active XR session');
    }

    if (!this.session.requestAnimationFrame) {
      throw new Error('Anchors not supported in this session');
    }

    try {
      // アンカーを作成
      const anchor = await this.session.createAnchor(pose, options.referenceSpace);

      if (anchor) {
        // アンカーマーカーを作成
        const marker = this.createAnchorMarker();

        // アンカーデータを保存
        this.anchors.set(anchor, {
          mesh: marker,
          object: options.attachedObject || null,
          userData: options.userData || {}
        });

        this.anchorGroup.add(marker);

        console.log(`⚓ Anchor created: ${anchor.anchorSpace ? 'success' : 'pending'}`);

        // イベント発火
        this.emit('anchoradded', {
          anchor,
          mesh: marker,
          userData: options.userData
        });

        return anchor;
      }
    } catch (error) {
      console.error('Failed to create anchor:', error);
      throw error;
    }

    return null;
  }

  /**
   * ヒットテスト結果からアンカーを作成
   */
  async createAnchorFromHit(hitTestResult, options = {}) {
    if (!hitTestResult) {
      throw new Error('Hit test result required');
    }

    try {
      const anchor = await hitTestResult.createAnchor();

      if (anchor) {
        // アンカーマーカーを作成
        const marker = this.createAnchorMarker();

        // アンカーデータを保存
        this.anchors.set(anchor, {
          mesh: marker,
          object: options.attachedObject || null,
          userData: options.userData || {}
        });

        this.anchorGroup.add(marker);

        console.log('⚓ Anchor created from hit test');

        // イベント発火
        this.emit('anchoradded', {
          anchor,
          mesh: marker,
          userData: options.userData
        });

        return anchor;
      }
    } catch (error) {
      console.error('Failed to create anchor from hit:', error);
      throw error;
    }

    return null;
  }

  /**
   * アンカーマーカーを作成
   */
  createAnchorMarker() {
    const geometry = new THREE.SphereGeometry(this.anchorMarkerSize, 16, 16);
    const material = new THREE.MeshBasicMaterial({
      color: 0xff00ff,
      opacity: 0.8,
      transparent: true,
      visible: this.showAnchors
    });

    const marker = new THREE.Mesh(geometry, material);
    marker.name = `anchor-marker-${this.anchors.size}`;

    // リングを追加して視認性を向上
    const ringGeometry = new THREE.RingGeometry(
      this.anchorMarkerSize * 1.5,
      this.anchorMarkerSize * 2,
      32
    );
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xff00ff,
      side: THREE.DoubleSide,
      opacity: 0.5,
      transparent: true,
      visible: this.showAnchors
    });

    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    marker.add(ring);

    return marker;
  }

  /**
   * 毎フレーム更新（XRフレームごとに呼び出す）
   */
  update(frame, referenceSpace) {
    if (!frame || !referenceSpace) return;

    // 各アンカーの位置を更新
    this.anchors.forEach((anchorData, anchor) => {
      try {
        const pose = frame.getPose(anchor.anchorSpace, referenceSpace);

        if (pose) {
          // マーカーの位置を更新
          anchorData.mesh.position.setFromMatrixPosition(pose.transform.matrix);
          anchorData.mesh.quaternion.setFromRotationMatrix(pose.transform.matrix);

          // アタッチされたオブジェクトも更新
          if (anchorData.object) {
            anchorData.object.position.copy(anchorData.mesh.position);
            anchorData.object.quaternion.copy(anchorData.mesh.quaternion);
          }

          // イベント発火
          this.emit('anchorupdated', {
            anchor,
            mesh: anchorData.mesh,
            pose
          });
        }
      } catch (error) {
        // アンカーが無効になった場合
        console.warn('Anchor update failed:', error);
        this.removeAnchor(anchor);
      }
    });
  }

  /**
   * アンカーを削除
   */
  async removeAnchor(anchor) {
    const anchorData = this.anchors.get(anchor);

    if (anchorData) {
      // マーカーを削除
      this.anchorGroup.remove(anchorData.mesh);
      anchorData.mesh.geometry.dispose();
      anchorData.mesh.material.dispose();

      // リングも削除
      anchorData.mesh.children.forEach(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });

      console.log(`⚓ Anchor removed: ${anchorData.mesh.name}`);

      // イベント発火
      this.emit('anchorremoved', {
        anchor,
        mesh: anchorData.mesh
      });

      // マップから削除
      this.anchors.delete(anchor);

      // XRAnchorを削除
      if (anchor.delete) {
        try {
          await anchor.delete();
        } catch (error) {
          console.warn('Failed to delete XRAnchor:', error);
        }
      }
    }
  }

  /**
   * オブジェクトをアンカーにアタッチ
   */
  attachObjectToAnchor(anchor, object) {
    const anchorData = this.anchors.get(anchor);

    if (anchorData) {
      anchorData.object = object;

      // オブジェクトをアンカーの位置に移動
      object.position.copy(anchorData.mesh.position);
      object.quaternion.copy(anchorData.mesh.quaternion);

      console.log(`🔗 Object attached to anchor: ${object.name}`);
    }
  }

  /**
   * オブジェクトをアンカーからデタッチ
   */
  detachObjectFromAnchor(anchor) {
    const anchorData = this.anchors.get(anchor);

    if (anchorData && anchorData.object) {
      const object = anchorData.object;
      anchorData.object = null;

      console.log(`🔓 Object detached from anchor: ${object.name}`);

      return object;
    }

    return null;
  }

  /**
   * 全てのアンカーを取得
   */
  getAllAnchors() {
    const anchors = [];

    this.anchors.forEach((anchorData, anchor) => {
      anchors.push({
        anchor,
        mesh: anchorData.mesh,
        object: anchorData.object,
        userData: anchorData.userData
      });
    });

    return anchors;
  }

  /**
   * アンカーの数を取得
   */
  getAnchorCount() {
    return this.anchors.size;
  }

  /**
   * 最も近いアンカーを検索
   */
  findNearestAnchor(position, maxDistance = Infinity) {
    let nearest = null;
    let minDistance = maxDistance;

    this.anchors.forEach((anchorData, anchor) => {
      const distance = position.distanceTo(anchorData.mesh.position);

      if (distance < minDistance) {
        minDistance = distance;
        nearest = { anchor, distance, anchorData };
      }
    });

    return nearest;
  }

  /**
   * アンカーの視覚化を切り替え
   */
  setShowAnchors(show) {
    this.showAnchors = show;

    this.anchors.forEach((anchorData) => {
      anchorData.mesh.material.visible = show;

      // リングも更新
      anchorData.mesh.children.forEach(child => {
        if (child.material) {
          child.material.visible = show;
        }
      });
    });
  }

  /**
   * 全てのアンカーをクリア
   */
  async clearAllAnchors() {
    const anchorsToRemove = Array.from(this.anchors.keys());

    for (const anchor of anchorsToRemove) {
      await this.removeAnchor(anchor);
    }

    console.log('🗑️ All anchors cleared');
  }

  /**
   * イベントリスナーを登録
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  /**
   * イベントを発火
   */
  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }

  /**
   * クリーンアップ
   */
  async dispose() {
    // 全てのアンカーを削除
    await this.clearAllAnchors();

    this.scene.remove(this.anchorGroup);
    this.session = null;

    console.log('🗑️ XRAnchorManager disposed');
  }
}

export default XRAnchorManager;
