import * as THREEModule from 'three';
const THREE = globalThis.THREE || THREEModule;

/**
 * XRPlaneDetector - WebXR 平面検出
 * AR環境の床や壁などの平面を検出し、オブジェクト配置をサポート
 */
export class XRPlaneDetector {
  constructor(renderer, scene, options = {}) {
    if (!renderer || !scene) {
      throw new Error('THREE.WebGLRenderer and THREE.Scene are required');
    }

    this.renderer = renderer;
    this.scene = scene;
    this.options = options;

    // 検出された平面
    this.detectedPlanes = new Map(); // XRPlane -> { mesh, lastChanged }
    this.planeGroup = new THREE.Group();
    this.planeGroup.name = 'XRPlanes';
    this.scene.add(this.planeGroup);

    // 平面の視覚化設定
    this.showPlanes = options.showPlanes !== false; // デフォルトtrue
    this.planeOpacity = options.planeOpacity || 0.3;
    this.planeColor = options.planeColor || 0x00ff00;

    // ヒットテスト用
    this.hitTestSource = null;
    this.hitTestSourceRequested = false;

    // イベントリスナー
    this.listeners = {
      planeadded: [],
      planeremoved: [],
      planechanged: [],
      hittest: []
    };

    console.log('🔍 XRPlaneDetector initialized');
  }

  /**
   * XRセッション開始時に呼び出す
   */
  async onSessionStart(session) {
    // ヒットテストソースをリクエスト
    if (session.requestHitTestSource) {
      try {
        const hitTestSource = await session.requestHitTestSource({ space: 'viewer' });
        this.hitTestSource = hitTestSource;
        console.log('✅ Hit test source created');
      } catch (error) {
        console.warn('Hit test not supported:', error);
      }
    }
  }

  /**
   * 毎フレーム更新（XRフレームごとに呼び出す）
   */
  update(frame, referenceSpace) {
    if (!frame) return;

    // 平面検出
    this.updatePlanes(frame, referenceSpace);

    // ヒットテスト
    if (this.hitTestSource) {
      this.performHitTest(frame, referenceSpace);
    }
  }

  /**
   * 平面を更新
   */
  updatePlanes(frame, referenceSpace) {
    const detectedPlanes = frame.detectedPlanes;

    if (!detectedPlanes) {
      return;
    }

    // 既存の平面をチェック（削除された平面を処理）
    this.detectedPlanes.forEach((planeData, xrPlane) => {
      if (!detectedPlanes.has(xrPlane)) {
        // 平面が削除された
        this.removePlane(xrPlane);
      }
    });

    // 新規または更新された平面を処理
    detectedPlanes.forEach((xrPlane) => {
      const pose = frame.getPose(xrPlane.planeSpace, referenceSpace);

      if (pose) {
        if (!this.detectedPlanes.has(xrPlane)) {
          // 新しい平面を追加
          this.addPlane(xrPlane, pose);
        } else if (xrPlane.lastChangedTime > this.detectedPlanes.get(xrPlane).lastChanged) {
          // 平面が変更された
          this.updatePlane(xrPlane, pose);
        }
      }
    });
  }

  /**
   * 新しい平面を追加
   */
  addPlane(xrPlane, pose) {
    // 平面のポリゴンを取得
    const polygon = xrPlane.polygon;

    // ポリゴンから形状を作成
    const geometry = this.createPlaneGeometry(polygon);

    // マテリアル
    const material = new THREE.MeshBasicMaterial({
      color: this.planeColor,
      opacity: this.planeOpacity,
      transparent: true,
      side: THREE.DoubleSide,
      visible: this.showPlanes
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `plane-${this.detectedPlanes.size}`;

    // 位置を設定
    this.updatePlanePose(mesh, pose);

    // シーンに追加
    this.planeGroup.add(mesh);

    // 記録
    this.detectedPlanes.set(xrPlane, {
      mesh,
      lastChanged: xrPlane.lastChangedTime,
      orientation: xrPlane.orientation // 'horizontal' | 'vertical'
    });

    console.log(`✨ Plane added: ${mesh.name} (${xrPlane.orientation})`);

    // イベント発火
    this.emit('planeadded', {
      xrPlane,
      mesh,
      orientation: xrPlane.orientation
    });
  }

  /**
   * 平面を更新
   */
  updatePlane(xrPlane, pose) {
    const planeData = this.detectedPlanes.get(xrPlane);

    if (planeData) {
      // ポリゴンを更新
      const polygon = xrPlane.polygon;
      const newGeometry = this.createPlaneGeometry(polygon);

      planeData.mesh.geometry.dispose();
      planeData.mesh.geometry = newGeometry;

      // 位置を更新
      this.updatePlanePose(planeData.mesh, pose);

      // 最終変更時刻を更新
      planeData.lastChanged = xrPlane.lastChangedTime;

      // イベント発火
      this.emit('planechanged', {
        xrPlane,
        mesh: planeData.mesh
      });
    }
  }

  /**
   * 平面を削除
   */
  removePlane(xrPlane) {
    const planeData = this.detectedPlanes.get(xrPlane);

    if (planeData) {
      // シーンから削除
      this.planeGroup.remove(planeData.mesh);
      planeData.mesh.geometry.dispose();
      planeData.mesh.material.dispose();

      console.log(`🗑️ Plane removed: ${planeData.mesh.name}`);

      // イベント発火
      this.emit('planeremoved', {
        xrPlane,
        mesh: planeData.mesh
      });

      // マップから削除
      this.detectedPlanes.delete(xrPlane);
    }
  }

  /**
   * ポリゴンからジオメトリを作成
   */
  createPlaneGeometry(polygon) {
    const vertices = [];
    const indices = [];

    // ポリゴンの頂点を取得
    polygon.forEach((point) => {
      vertices.push(point.x, point.y, point.z);
    });

    // 三角形分割（簡易版：扇形）
    for (let i = 1; i < polygon.length - 1; i++) {
      indices.push(0, i, i + 1);
    }

    // ジオメトリを作成
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
  }

  /**
   * 平面メッシュの位置を更新
   */
  updatePlanePose(mesh, pose) {
    mesh.position.setFromMatrixPosition(pose.transform.matrix);
    mesh.quaternion.setFromRotationMatrix(pose.transform.matrix);
  }

  /**
   * ヒットテストを実行
   */
  performHitTest(frame, referenceSpace) {
    if (!this.hitTestSource) return;

    const hitTestResults = frame.getHitTestResults(this.hitTestSource);

    if (hitTestResults.length > 0) {
      const hit = hitTestResults[0];
      const pose = hit.getPose(referenceSpace);

      if (pose) {
        // イベント発火
        this.emit('hittest', {
          hit,
          pose,
          position: new THREE.Vector3().setFromMatrixPosition(pose.transform.matrix),
          orientation: new THREE.Quaternion().setFromRotationMatrix(pose.transform.matrix)
        });
      }
    }
  }

  /**
   * 特定の向きの平面を取得
   */
  getPlanesByOrientation(orientation) {
    const planes = [];

    this.detectedPlanes.forEach((planeData, xrPlane) => {
      if (xrPlane.orientation === orientation) {
        planes.push({
          xrPlane,
          mesh: planeData.mesh
        });
      }
    });

    return planes;
  }

  /**
   * 水平面（床）を取得
   */
  getHorizontalPlanes() {
    return this.getPlanesByOrientation('horizontal');
  }

  /**
   * 垂直面（壁）を取得
   */
  getVerticalPlanes() {
    return this.getPlanesByOrientation('vertical');
  }

  /**
   * 平面の視覚化を切り替え
   */
  setShowPlanes(show) {
    this.showPlanes = show;

    this.detectedPlanes.forEach((planeData) => {
      planeData.mesh.material.visible = show;
    });
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
  dispose() {
    // 全ての平面を削除
    this.detectedPlanes.forEach((planeData, xrPlane) => {
      this.removePlane(xrPlane);
    });

    this.detectedPlanes.clear();
    this.scene.remove(this.planeGroup);

    // ヒットテストソースを解放
    if (this.hitTestSource) {
      this.hitTestSource.cancel();
      this.hitTestSource = null;
    }

    console.log('🗑️ XRPlaneDetector disposed');
  }
}

export default XRPlaneDetector;
