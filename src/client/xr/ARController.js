// UMDビルド対応: グローバルのTHREEを優先し、なければES moduleのimportを使用
import * as THREEModule from 'three';
const THREE = globalThis.THREE || THREEModule;

/**
 * ARController - AR機能管理
 * ヒットテスト、平面検出、レティクルなどのAR機能を提供
 */
export class ARController {
  constructor(renderer, scene, options = {}) {
    if (!renderer || !scene) {
      throw new Error('THREE.WebGLRenderer and THREE.Scene are required');
    }

    this.renderer = renderer;
    this.scene = scene;
    this.camera = options.camera || null;

    // ヒットテスト
    this.hitTestSource = null;
    this.hitTestSourceRequested = false;

    // レティクル（配置ガイド）
    this.reticle = null;
    this.reticleVisible = false;

    // 平面検出
    this.detectedPlanes = new Map(); // XRPlane -> THREE.Mesh
    this.showPlanes = options.showPlanes !== false;

    // イベントリスナー
    this.hitTestListeners = [];
    this.planeDetectedListeners = [];

    // 設定
    this.config = {
      reticleColor: options.reticleColor || 0xffffff,
      reticleSize: options.reticleSize || 0.15,
      planeOpacity: options.planeOpacity || 0.2,
      planeColor: options.planeColor || 0x00ff00,
      ...options.config
    };

    // レティクルを作成
    this.createReticle();

    console.log('📱 ARController initialized');
  }

  /**
   * レティクルを作成
   */
  createReticle() {
    const geometry = new THREE.RingGeometry(
      this.config.reticleSize,
      this.config.reticleSize + 0.05,
      32
    ).rotateX(-Math.PI / 2);

    const material = new THREE.MeshBasicMaterial({
      color: this.config.reticleColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    });

    this.reticle = new THREE.Mesh(geometry, material);
    this.reticle.matrixAutoUpdate = false;
    this.reticle.visible = false;
    this.scene.add(this.reticle);

    console.log('🎯 AR reticle created');
  }

  /**
   * ARセッション開始時の初期化
   * @param {XRSession} session
   */
  async onSessionStart(session) {
    console.log('📱 ARController session started');

    // 有効な機能をログ出力
    if (session.enabledFeatures) {
      console.log('✨ AR Features:', session.enabledFeatures);

      if (session.enabledFeatures.includes('plane-detection')) {
        console.log('✅ Plane detection enabled');
      }

      if (session.enabledFeatures.includes('depth-sensing')) {
        console.log('✅ Depth sensing enabled');
      }
    }

    // セッション終了時のクリーンアップ
    session.addEventListener('end', () => {
      this.onSessionEnd();
    });
  }

  /**
   * ARセッション終了時のクリーンアップ
   */
  onSessionEnd() {
    console.log('👋 ARController session ended');

    this.hitTestSourceRequested = false;
    this.hitTestSource = null;
    this.reticle.visible = false;

    // 検出された平面をクリア
    this.detectedPlanes.forEach((mesh) => {
      this.scene.remove(mesh);
    });
    this.detectedPlanes.clear();
  }

  /**
   * フレームごとの更新
   * @param {XRFrame} frame
   */
  update(frame) {
    if (!frame) return;

    const session = this.renderer.xr.getSession();
    const referenceSpace = this.renderer.xr.getReferenceSpace();

    if (!session || !referenceSpace) return;

    // ヒットテストソースの初期化
    if (!this.hitTestSourceRequested) {
      this.requestHitTestSource(session);
      this.hitTestSourceRequested = true;
    }

    // ヒットテストの実行
    if (this.hitTestSource) {
      this.performHitTest(frame, referenceSpace);
    }

    // 平面検出の処理
    if (frame.detectedPlanes && this.showPlanes) {
      this.updateDetectedPlanes(frame, referenceSpace);
    }
  }

  /**
   * ヒットテストソースをリクエスト
   * @param {XRSession} session
   */
  async requestHitTestSource(session) {
    try {
      const viewerSpace = await session.requestReferenceSpace('viewer');
      this.hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
      console.log('✅ Hit test source ready');
    } catch (error) {
      console.error('❌ Failed to create hit test source:', error);
    }
  }

  /**
   * ヒットテストを実行
   * @param {XRFrame} frame
   * @param {XRReferenceSpace} referenceSpace
   */
  performHitTest(frame, referenceSpace) {
    const hitTestResults = frame.getHitTestResults(this.hitTestSource);

    if (hitTestResults.length > 0) {
      const hit = hitTestResults[0];
      const pose = hit.getPose(referenceSpace);

      if (pose) {
        // レティクルを表示して位置を更新
        this.reticle.visible = true;
        this.reticle.matrix.fromArray(pose.transform.matrix);
        this.reticleVisible = true;

        // イベント通知
        this.notifyHitTest(pose, hit);
      }
    } else {
      this.reticle.visible = false;
      this.reticleVisible = false;
    }
  }

  /**
   * 検出された平面を更新
   * @param {XRFrame} frame
   * @param {XRReferenceSpace} referenceSpace
   */
  updateDetectedPlanes(frame, referenceSpace) {
    // 削除された平面を処理
    this.detectedPlanes.forEach((mesh, plane) => {
      if (!frame.detectedPlanes.has(plane)) {
        this.scene.remove(mesh);
        this.detectedPlanes.delete(plane);
      }
    });

    // 新しい平面を処理
    frame.detectedPlanes.forEach((plane) => {
      if (!this.detectedPlanes.has(plane)) {
        const mesh = this.createPlaneMesh(plane);
        this.scene.add(mesh);
        this.detectedPlanes.set(plane, mesh);

        // イベント通知
        this.notifyPlaneDetected(plane, mesh);

        console.log(`🔲 New plane detected (${plane.orientation})`);
      }

      // 平面の位置と向きを更新
      this.updatePlaneMesh(plane, frame, referenceSpace);
    });
  }

  /**
   * 平面メッシュを作成
   * @param {XRPlane} plane
   * @returns {THREE.Mesh}
   */
  createPlaneMesh(plane) {
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial({
      color: this.config.planeColor,
      transparent: true,
      opacity: this.config.planeOpacity,
      side: THREE.DoubleSide
    });

    return new THREE.Mesh(geometry, material);
  }

  /**
   * 平面メッシュの位置と向きを更新
   * @param {XRPlane} plane
   * @param {XRFrame} frame
   * @param {XRReferenceSpace} referenceSpace
   */
  updatePlaneMesh(plane, frame, referenceSpace) {
    const mesh = this.detectedPlanes.get(plane);
    if (!mesh) return;

    const pose = frame.getPose(plane.planeSpace, referenceSpace);

    if (pose) {
      mesh.matrix.fromArray(pose.transform.matrix);
      mesh.matrixAutoUpdate = false;

      // 平面のサイズを更新（簡易版）
      const polygon = plane.polygon;
      if (polygon.length >= 3) {
        // ポリゴンから大まかなサイズを計算
        let minX = Infinity, maxX = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;

        polygon.forEach(point => {
          if (point.x < minX) minX = point.x;
          if (point.x > maxX) maxX = point.x;
          if (point.z < minZ) minZ = point.z;
          if (point.z > maxZ) maxZ = point.z;
        });

        const width = maxX - minX;
        const height = maxZ - minZ;

        mesh.scale.set(width, height, 1);
      }
    }
  }

  /**
   * レティクルの位置を取得
   * @returns {THREE.Vector3|null}
   */
  getReticlePosition() {
    if (!this.reticleVisible) return null;

    const position = new THREE.Vector3();
    position.setFromMatrixPosition(this.reticle.matrix);
    return position;
  }

  /**
   * レティクルの姿勢を取得
   * @returns {THREE.Quaternion|null}
   */
  getReticleQuaternion() {
    if (!this.reticleVisible) return null;

    const quaternion = new THREE.Quaternion();
    quaternion.setFromRotationMatrix(this.reticle.matrix);
    return quaternion;
  }

  /**
   * 平面表示の切り替え
   * @param {boolean} show
   */
  setShowPlanes(show) {
    this.showPlanes = show;

    if (!show) {
      // 全ての平面を非表示
      this.detectedPlanes.forEach((mesh) => {
        mesh.visible = false;
      });
    } else {
      // 全ての平面を表示
      this.detectedPlanes.forEach((mesh) => {
        mesh.visible = true;
      });
    }
  }

  /**
   * 検出された平面を取得
   * @returns {Map<XRPlane, THREE.Mesh>}
   */
  getDetectedPlanes() {
    return this.detectedPlanes;
  }

  /**
   * クリーンアップ
   */
  dispose() {
    if (this.reticle) {
      this.scene.remove(this.reticle);
      this.reticle.geometry.dispose();
      this.reticle.material.dispose();
      this.reticle = null;
    }

    this.detectedPlanes.forEach((mesh) => {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
    this.detectedPlanes.clear();

    this.hitTestSource = null;
    this.hitTestSourceRequested = false;

    this.hitTestListeners = [];
    this.planeDetectedListeners = [];

    console.log('🗑️ ARController disposed');
  }

  // イベントリスナー管理
  onHitTest(listener) {
    this.hitTestListeners.push(listener);
  }

  onPlaneDetected(listener) {
    this.planeDetectedListeners.push(listener);
  }

  notifyHitTest(pose, hit) {
    this.hitTestListeners.forEach(listener => {
      try {
        listener(pose, hit);
      } catch (error) {
        console.error('❌ Error in hit test listener:', error);
      }
    });
  }

  notifyPlaneDetected(plane, mesh) {
    this.planeDetectedListeners.forEach(listener => {
      try {
        listener(plane, mesh);
      } catch (error) {
        console.error('❌ Error in plane detected listener:', error);
      }
    });
  }
}
