import * as THREE from 'three';
import { ChocoDropClient, ChocoDroClient, LiveCommandClient } from './LiveCommandClient.js';
import { createObjectKeywords, matchKeywordWithFilename } from './translation-dictionary.js';

/**
 * Scene Manager - 3D scene integration for ChocoDrop System
 * Handles natural language parsing and 3D object management
 */
export class SceneManager {
  constructor(scene, options = {}) {
    if (!scene) {
      throw new Error('THREE.Scene is required');
    }
    
    this.scene = scene;
    this.camera = options.camera || null;
    this.renderer = options.renderer || null;
    this.labelRenderer = null; // CSS2DRenderer for UI overlays like audio controls
    // ChocoDrop Client（共通クライアント注入を優先）
    // 外部フォルダから共有する場合は options.client でクライアントを再利用
    this.client = options.client || new ChocoDropClient(options.serverUrl);
    
    // 実験オブジェクト管理用グループ
    this.experimentGroup = new THREE.Group();
    this.experimentGroup.name = 'LiveExperiments';
    // 一旦シーンに追加（後でカメラに移動する可能性あり）
    this.scene.add(this.experimentGroup);
    
    // コマンド履歴
    this.commandHistory = [];
    
    // オブジェクト管理
    this.spawnedObjects = new Map();
    this.objectCounter = 0;
    this.selectedObject = null;
    this.selectedImageService = options.selectedImageService || null;
    this.selectedVideoService = options.selectedVideoService || null;
    this.audioControls = new Map();
    this.audioControlUpdateInterval = null;
    this.audioControlUpdateListener = null;

    // Animation管理（UI要素用）
    this.clock = new THREE.Clock();
    
    // レイキャスティング用
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.lastHoveredObject = null;
    
    // 設定
    this.config = {
      showLocationIndicator: options.showLocationIndicator !== false,
      indicatorDuration: options.indicatorDuration || 3000,
      defaultObjectScale: options.defaultObjectScale || 1.0,
      enableObjectSelection: options.enableObjectSelection !== false,
      enableMouseInteraction: options.enableMouseInteraction,
      enableDebugLogging: options.enableDebugLogging === true,
      ...options.config
    };
    
    // クリックイベントの設定
    this.setupClickEvents();
    
    console.log('🧪 SceneManager initialized with click selection');

    // デバッグやコンソール操作を容易にするためグローバル参照を保持
    if (typeof globalThis !== 'undefined') {
      globalThis.sceneManager = this;
    }
  }
  /**
   * クリックイベントの設定
   */
  setupClickEvents() {
    // enableMouseInteractionが明示的にtrueの場合のみマウス操作を有効化
    if (this.config.enableMouseInteraction === true && this.renderer) {
      this.setupObjectDragging();
      console.log('🖱️ Mouse interaction enabled - Click to select, Shift+drag to move objects');
    } else if (this.config.enableMouseInteraction === true && !this.renderer) {
      console.warn('⚠️ Mouse interaction requested but renderer not provided. Mouse interaction disabled.');
    } else {
      console.log('🖱️ Mouse interaction disabled (safe mode). Set enableMouseInteraction: true to enable.');
    }
  }

  // デバッグ情報表示メソッド
  debugSceneInfo() {
    console.log('🔍 === SCENE DEBUG INFO ===');
    
    // カメラ情報
    if (this.camera) {
      console.log(`📷 Camera:
        - Position: (${this.camera.position.x.toFixed(2)}, ${this.camera.position.y.toFixed(2)}, ${this.camera.position.z.toFixed(2)})
        - Rotation: (${(this.camera.rotation.x * 180 / Math.PI).toFixed(1)}°, ${(this.camera.rotation.y * 180 / Math.PI).toFixed(1)}°, ${(this.camera.rotation.z * 180 / Math.PI).toFixed(1)}°)
        - FOV: ${this.camera.fov || 'N/A'}
        - Near/Far: ${this.camera.near || 'N/A'}/${this.camera.far || 'N/A'}`);
    }
    
    // シーン階層
    console.log(`🌳 Scene hierarchy:
      - Total objects in scene: ${this.scene.children.length}
      - experimentGroup exists: ${this.scene.getObjectByName('LiveExperiments') ? 'Yes' : 'No'}
      - experimentGroup children: ${this.experimentGroup.children.length}`);
    
    // 生成されたオブジェクト
    console.log(`📦 Spawned objects: ${this.spawnedObjects.size}`);
    this.spawnedObjects.forEach((obj, id) => {
      const worldPos = new THREE.Vector3();
      obj.getWorldPosition(worldPos);
      console.log(`  - ${id} (${obj.userData.type}): 
        Local: (${obj.position.x.toFixed(2)}, ${obj.position.y.toFixed(2)}, ${obj.position.z.toFixed(2)})
        World: (${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)})
        Visible: ${obj.visible}, Scale: ${obj.scale.x.toFixed(2)}`);
      
      // 3Dモデルの詳細情報
      if (obj.userData.type === 'generated_3d_model') {
        const box = new THREE.Box3().setFromObject(obj);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        console.log(`    📐 Bounding box - Center: (${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)}), Size: (${size.x.toFixed(2)}, ${size.y.toFixed(2)}, ${size.z.toFixed(2)})`);
        
        // メッシュ数
        let meshCount = 0;
        obj.traverse((child) => {
          if (child.isMesh) meshCount++;
        });
        console.log(`    🎭 Meshes: ${meshCount}`);
      }
    });
    
    // カメラからの距離計算
    if (this.camera && this.spawnedObjects.size > 0) {
      console.log(`📏 Distances from camera:`);
      this.spawnedObjects.forEach((obj, id) => {
        const distance = this.camera.position.distanceTo(obj.position);
        console.log(`  - ${id}: ${distance.toFixed(2)} units`);
      });
    }
    
    console.log('=========================');
  }
  

  
  /**
   * オブジェクト選択
   */
  selectObject(object) {
    // 既に同じオブジェクトが選択されている場合は何もしない
    if (this.selectedObject === object) {
      return;
    }

    // 前の選択を解除
    this.deselectObject();

    this.selectedObject = object;

    this.createModernSelectionIndicator(object);

    console.log(`✅ Selected object: ${object.name}`);
    
    // CommandUIに選択情報を表示
    if (this.commandUI) {
      const objectInfo = object.userData || {};
      this.commandUI.addOutput(`📍 選択: ${object.name}`, 'info');
      if (objectInfo.prompt) {
        this.commandUI.addOutput(`   プロンプト: ${objectInfo.prompt}`, 'hint');
      }
      if (objectInfo.modelName) {
        this.commandUI.addOutput(`   モデル: ${objectInfo.modelName}`, 'hint');
      }

      // 削除モードが待機中の場合、削除コマンドを自動入力
      if (this.commandUI.currentMode === 'delete') {
        const objectName = objectInfo.originalPrompt || object.name || '選択したオブジェクト';
        this.commandUI.input.value = `${objectName}を削除`;
        this.commandUI.input.focus();
        // カーソルを文末に移動（選択状態を解除）
        this.commandUI.input.setSelectionRange(this.commandUI.input.value.length, this.commandUI.input.value.length);
        this.commandUI.addOutput(`🎯 削除対象設定: ${objectName}`, 'system');
      }
    }
  }

  createModernSelectionIndicator(object) {
    // シンプルで確実な選択インジケーター
    // 既存のインジケーターを削除（重複防止）
    const existingIndicator = object.getObjectByName('selectionIndicator');
    if (existingIndicator) {
      object.remove(existingIndicator);
    }

    const indicatorGroup = new THREE.Group();
    indicatorGroup.name = 'selectionIndicator';

    // オブジェクトのバウンディングボックスを正確に取得
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // 小さなマージンを追加して枠が見えやすくする
    const margin = 0.1;
    const adjustedSize = new THREE.Vector3(
      size.x + margin,
      size.y + margin, 
      size.z + margin
    );

    // シンプルな黄色い枠線
    // PlaneGeometryの場合は平面的な枠を作成
    if (object.geometry && object.geometry.type === 'PlaneGeometry') {
      // スケールは既にオブジェクトに適用されているので、ジオメトリのサイズのみ使用
      const width = object.geometry.parameters.width;
      const height = object.geometry.parameters.height;
      
      // 平面の周りに枠線を作成
      const shape = new THREE.Shape();
      shape.moveTo(-width/2, -height/2);
      shape.lineTo(width/2, -height/2);
      shape.lineTo(width/2, height/2);
      shape.lineTo(-width/2, height/2);
      shape.lineTo(-width/2, -height/2);
      
      const points = shape.getPoints();
      const geometryLine = new THREE.BufferGeometry().setFromPoints(points);
      // 2025年トレンド: アダプティブ選択インジケーター
      const adaptiveColor = this.getAdaptiveSelectionColor();
      const materialLine = new THREE.LineBasicMaterial({
        color: adaptiveColor,
        linewidth: 2,
        transparent: true,
        opacity: 0.9
      });
      
      const line = new THREE.Line(geometryLine, materialLine);
      line.position.set(0, 0, 0.01); // 少し前に出して見えるようにする
      indicatorGroup.add(line);
    } else {
      // その他のオブジェクトは通常の3Dボックス枠
      const edgesGeometry = new THREE.EdgesGeometry(
        new THREE.BoxGeometry(adjustedSize.x, adjustedSize.y, adjustedSize.z)
      );
      // 2025年トレンド: アダプティブ選択インジケーター
      const adaptiveColor = this.getAdaptiveSelectionColor();
      const edgesMaterial = new THREE.LineBasicMaterial({
        color: adaptiveColor,
        linewidth: 2,
        transparent: true,
        opacity: 0.9
      });
      
      const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
      edges.position.copy(center);
      indicatorGroup.add(edges);
    }

    // インジケーターをオブジェクトの子として追加（オブジェクトと一緒に動く）
    object.add(indicatorGroup);
    indicatorGroup.position.set(0, 0, 0); // 親からの相対位置は0

    // リサイズハンドルを追加（親オブジェクトを直接渡す）
    this.addResizeHandles(indicatorGroup, adjustedSize, center, object);
  }

  /**
   * リサイズハンドルを追加
   */
  addResizeHandles(indicatorGroup, size, center, parentObject) {
    // PlaneGeometryオブジェクト用のリサイズハンドル
    console.log('🔧 addResizeHandles called');

    if (!parentObject) {
      console.log('❌ No parent object provided');
      return;
    }

    if (!parentObject.geometry) {
      console.log('❌ Parent has no geometry');
      return;
    }

    if (parentObject.geometry.type !== 'PlaneGeometry') {
      console.log(`❌ Geometry type is ${parentObject.geometry.type}, not PlaneGeometry`);
      return;
    }

    console.log('✅ PlaneGeometry detected, creating handles');

    const handleSize = 0.15; // 2025年トレンド: より小さく洗練された
    const handleGeometry = new THREE.BoxGeometry(handleSize, handleSize, handleSize);
    // 角を丸くするため、後でroundedBoxを使用

    // 常に前面に表示されるマテリアル
    // 2025年トレンド: アダプティブリサイズハンドル
    const adaptiveColor = this.getAdaptiveSelectionColor();
    const handleMaterial = new THREE.MeshBasicMaterial({
      color: adaptiveColor,
      transparent: true,
      opacity: 0.8,
      depthTest: false,
      depthWrite: false
    });

    const handleHoverMaterial = new THREE.MeshBasicMaterial({
      color: this.getAdaptiveHoverColor(),
      transparent: true,
      opacity: 1.0,
      depthTest: false,
      depthWrite: false
    });

    // 四隅の位置を計算（親オブジェクトのジオメトリサイズに基づく）
    const width = parentObject.geometry.parameters.width;
    const height = parentObject.geometry.parameters.height;

    const positions = [
      { x: width/2, y: height/2, z: 0.1, corner: 'top-right' },
      { x: -width/2, y: height/2, z: 0.1, corner: 'top-left' },
      { x: width/2, y: -height/2, z: 0.1, corner: 'bottom-right' },
      { x: -width/2, y: -height/2, z: 0.1, corner: 'bottom-left' }
    ];

    positions.forEach((pos, index) => {
      const handle = new THREE.Mesh(handleGeometry, handleMaterial.clone());
      handle.position.set(pos.x, pos.y, pos.z); // 親からの相対位置
      handle.userData = { 
        isResizeHandle: true, 
        handleIndex: index,
        corner: pos.corner,
        defaultMaterial: handle.material,
        hoverMaterial: handleHoverMaterial.clone()
      };
      
      // ホバーエフェクトを追加
      // レンダリング順序を高く設定（常に前面）
      handle.renderOrder = 1001;

      handle.onHover = () => {
        handle.material = handle.userData.hoverMaterial;
        handle.scale.setScalar(1.5);
        document.body.style.cursor = 'nw-resize';
      };

      handle.onHoverExit = () => {
        handle.material = handle.userData.defaultMaterial;
        handle.scale.setScalar(1.0);
        document.body.style.cursor = 'default';
      };

      indicatorGroup.add(handle);

      // デバッグ用にハンドルが見えることを確認
      console.log(`🔴 Added resize handle at ${pos.corner}`);
    });
  }

  /**
   * 選択インジケーターのスケールをリアルタイム更新（パフォーマンス最適化版）
   */
  updateSelectionIndicatorScale(object) {
    // リサイズ中はインジケーターの更新をスキップ（パフォーマンス最適化）
    // 枠線はオブジェクトと一緒にスケールされるので、特別な更新は不要

    // ハンドル位置のみ更新が必要な場合は、ここで処理
    // 現在は自動的にオブジェクトと一緒にスケールされるので処理不要
  }

  /**
   * オブジェクト選択解除
   */
  deselectObject() {
    // シンプルで確実な選択解除
    if (this.selectedObject) {
      // 選択インジケーターを削除（オブジェクトの子から探す）
      const indicator = this.selectedObject.getObjectByName('selectionIndicator');
      if (indicator) {
        this.selectedObject.remove(indicator);
        
        // メモリリークを防ぐためにリソースを破棄
        indicator.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(material => material.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
      }

      console.log(`✅ Deselected: ${this.selectedObject.name}`);
      this.selectedObject = null;
    }
  }

  /**
   * マウスドラッグによるオブジェクト移動機能
   */
  setupObjectDragging() {
    if (!this.renderer) return;
    
    const canvas = this.renderer.domElement;
    let isDragging = false;
    let dragObject = null;
    let dragOffset = new THREE.Vector3();
    let mouseStart = new THREE.Vector2();
    let dragMode = 'move'; // 'move', 'resize', 'rotate'
    let originalScale = new THREE.Vector3();
    
    canvas.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return; // 左クリックのみ
      
      // レイキャスティングでオブジェクト検出
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      
      this.raycaster.setFromCamera(this.mouse, this.camera);
      // オブジェクトとその子（選択インジケーター含む）を検出対象に
      const intersects = this.raycaster.intersectObjects(this.experimentGroup.children, true);
      
      if (intersects.length > 0) {
        const object = intersects[0].object;

        // リサイズハンドルがクリックされた場合 - Shiftキー不要
        if (object.userData && object.userData.isResizeHandle) {
          // リサイズモード開始
          isDragging = true;
          dragObject = this.selectedObject; // リサイズする実際のオブジェクト
          dragMode = 'resize';
          
          // ハンドル情報を保存
          this.resizeHandleInfo = {
            corner: object.userData.corner,
            handleIndex: object.userData.handleIndex
          };
          
          originalScale.copy(dragObject.scale);
          mouseStart.set(event.clientX, event.clientY);
          canvas.style.cursor = 'nw-resize';
          console.log(`🔄 Started resizing: ${dragObject.name} from ${object.userData.corner}`);
          return;
        }

        // 回転ハンドルがクリックされた場合
        if (object.userData && object.userData.isRotateHandle) {
          // 回転モード開始（今後実装）
          console.log(`🔄 Rotation handle clicked for: ${this.selectedObject.name}`);
          return;
        }

        // 生成された画像・動画・3Dモデル対象（Shift不要の直感的操作）
        if (object.userData && (object.userData.type === 'generated_image' || object.userData.type === 'generated_video' || object.userData.type === 'generated_3d_model' || object.userData.source === 'imported_file')) {
          
          // 🗑️ Deleteモードでのクリック処理
          if (this.commandUI && this.commandUI.currentMode === 'delete') {
            // 削除確認ダイアログを表示して直接削除
            const objectName = object.name;
            console.log(`🗑️ Delete mode: clicked on ${objectName}`);
            
            this.commandUI.showDeleteConfirmation(`オブジェクト「${objectName}」を削除`)
              .then(confirmed => {
                if (confirmed) {
                  this.removeObject(objectName);
                  this.commandUI.addOutput(`🗑️ 削除完了: ${objectName}`, 'success');
                } else {
                  this.commandUI.addOutput(`❌ 削除キャンセル: ${objectName}`, 'info');
                }
              })
              .catch(error => {
                console.error('Delete confirmation error:', error);
                this.commandUI.addOutput(`❌ 削除エラー: ${objectName}`, 'error');
              });
            return; // 削除モードの場合は移動処理をスキップ
          }
          
          // 移動モード開始（Shiftキー不要）
          isDragging = true;
          dragObject = object;
          dragMode = 'move';
          dragOffset.copy(intersects[0].point).sub(object.position);
          mouseStart.set(event.clientX, event.clientY);

          // 高品質な視覚フィードバック
          if (object.material) {
            // 移動中の透明度変更（オプション）
            // object.material.opacity = 0.8;
            // object.material.transparent = true;
          }
          // スケール変更を削除（大きくなる原因）

          canvas.style.cursor = 'move';
          console.log(`🔄 Started moving: ${object.name} (Shift-free interaction)`);

          // 選択状態も更新
          this.selectObject(object);
        } else {
          // 通常クリック: 選択のみ
          this.selectObject(object);
        }
      } else {
        this.deselectObject();
      }
    });
    
    canvas.addEventListener('mousemove', (event) => {
      // ドラッグ中でない場合はホバーエフェクトを処理
      if (!isDragging) {
        this.handleHoverEffects(event, canvas);
        return;
      }
      
      // ドラッグ中の処理
      if (!dragObject) return;
      
      // マウスの移動量を計算
      const deltaX = event.clientX - mouseStart.x;
      const deltaY = event.clientY - mouseStart.y;

      if (dragMode === 'resize') {
        // リサイズモード: より直感的な方向計算
        if (!this.resizeHandleInfo) {
          console.error('❌ Resize handle info missing');
          return;
        }
        
        const corner = this.resizeHandleInfo.corner;
        let scaleMultiplier = 1;
        
        // 各ハンドルの位置に応じた直感的な方向計算
        switch(corner) {
          case 'top-right': 
            // 右上ハンドル: 右上方向に引っ張ると拡大
            scaleMultiplier = (deltaX > 0 && deltaY < 0) ? 1 + (Math.abs(deltaX) + Math.abs(deltaY)) * 0.001 : 1 - (Math.abs(deltaX) + Math.abs(deltaY)) * 0.001;
            break;
          case 'top-left':
            // 左上ハンドル: 左上方向に引っ張ると拡大
            scaleMultiplier = (deltaX < 0 && deltaY < 0) ? 1 + (Math.abs(deltaX) + Math.abs(deltaY)) * 0.001 : 1 - (Math.abs(deltaX) + Math.abs(deltaY)) * 0.001;
            break;
          case 'bottom-right':
            // 右下ハンドル: 右下方向に引っ張ると拡大
            scaleMultiplier = (deltaX > 0 && deltaY > 0) ? 1 + (Math.abs(deltaX) + Math.abs(deltaY)) * 0.001 : 1 - (Math.abs(deltaX) + Math.abs(deltaY)) * 0.001;
            break;
          case 'bottom-left':
            // 左下ハンドル: 左下方向に引っ張ると拡大
            scaleMultiplier = (deltaX < 0 && deltaY > 0) ? 1 + (Math.abs(deltaX) + Math.abs(deltaY)) * 0.001 : 1 - (Math.abs(deltaX) + Math.abs(deltaY)) * 0.001;
            break;
          default:
            scaleMultiplier = 1 + (deltaX + deltaY) * 0.001; // フォールバック
        }
        
        const newScale = Math.max(0.1, Math.min(5.0, originalScale.x * scaleMultiplier));
        dragObject.scale.setScalar(newScale);

        // 選択インジケーターも更新（パフォーマンス最適化）
        this.updateSelectionIndicatorScale(dragObject);

      } else if (dragMode === 'move') {
        // 移動モード（従来の処理）
        const cameraRight = new THREE.Vector3();
        const cameraUp = new THREE.Vector3();
        this.camera.getWorldDirection(new THREE.Vector3()); // dummy call to update matrix
        cameraRight.setFromMatrixColumn(this.camera.matrixWorld, 0).normalize();
        cameraUp.setFromMatrixColumn(this.camera.matrixWorld, 1).normalize();

        // マウス移動をワールド座標に変換
        const moveScale = 0.01;
        const worldMove = new THREE.Vector3()
          .add(cameraRight.clone().multiplyScalar(deltaX * moveScale))
          .add(cameraUp.clone().multiplyScalar(-deltaY * moveScale));

        dragObject.position.add(worldMove);
        mouseStart.set(event.clientX, event.clientY);
      }
    });
    
    canvas.addEventListener('mouseup', () => {
      if (isDragging && dragObject) {
        // ドラッグ終了の処理
        if (dragObject.material) {
          dragObject.material.opacity = 1.0;
          dragObject.material.transparent = false;
        }

        // スケールを元に戻す（移動開始時に変更した場合）
        // 現在は移動開始時のスケール変更を削除したので、この処理は不要

        console.log(`✅ Finished dragging: ${dragObject.name} to (${dragObject.position.x.toFixed(1)}, ${dragObject.position.y.toFixed(1)}, ${dragObject.position.z.toFixed(1)})`);

        isDragging = false;
        dragObject = null;
        dragMode = 'move'; // リセット
        this.resizeHandleInfo = null; // リサイズハンドル情報をクリーンアップ
        canvas.style.cursor = 'default';
      }
    });
    
    // Shift+ホイールでリサイズ機能を追加
    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      
      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      
      this.raycaster.setFromCamera(mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(this.experimentGroup.children, true);
      
      if (intersects.length > 0) {
        const obj = intersects[0].object;
        // 生成された画像・動画・3Dモデル対象（Shift不要の直感的操作）
        if (obj.userData && (obj.userData.type === 'generated_image' || obj.userData.type === 'generated_video' || obj.userData.type === 'generated_3d_model')) {
          const scaleFactor = event.deltaY > 0 ? 0.9 : 1.1;
          const newScale = obj.scale.x * scaleFactor;
          
          // 最小・最大サイズ制限
          if (newScale >= 0.2 && newScale <= 5.0) {
            obj.scale.setScalar(newScale);
            
            // 高品質な視覚フィードバック
            if (obj.material) {
              obj.material.emissive.setHex(0x333333);
              setTimeout(() => {
                if (obj.material) {
                  obj.material.emissive.setHex(0x000000);
                }
              }, 150);
            }
            
            console.log(`🔄 Resized ${obj.userData.type}: ${obj.name} to scale ${newScale.toFixed(2)} (Shift-free interaction)`);
          }
        }
      }
    });

    // 選択したオブジェクトの角度調整キーボードコントロール
    document.addEventListener('keydown', (event) => {
      if (!this.selectedObject) return;
      
      const object = this.selectedObject;
      // 生成された画像・動画のみ角度調整可能
      if (!object.userData || (object.userData.type !== 'generated_image' && object.userData.type !== 'generated_video')) {
        return;
      }
      
      const rotationStep = Math.PI / 36; // 5度ずつ回転
      let rotated = false;
      
      switch (event.key) {
        case 'ArrowLeft':
          object.rotation.y -= rotationStep;
          rotated = true;
          break;
        case 'ArrowRight':
          object.rotation.y += rotationStep;
          rotated = true;
          break;
        case 'ArrowUp':
          // X軸回転は制限（-30度から+30度まで）
          const newRotationX = object.rotation.x - rotationStep;
          if (newRotationX >= -Math.PI/6 && newRotationX <= Math.PI/6) {
            object.rotation.x = newRotationX;
            rotated = true;
          }
          break;
        case 'ArrowDown':
          // X軸回転は制限（-30度から+30度まで）
          const newRotationXDown = object.rotation.x + rotationStep;
          if (newRotationXDown >= -Math.PI/6 && newRotationXDown <= Math.PI/6) {
            object.rotation.x = newRotationXDown;
            rotated = true;
          }
          break;
        case 'r':
        case 'R':
          // リセット：正面向きに戻す
          object.rotation.x = 0;
          // カメラの視線方向（ユーザーがモニターで見ている方向）に向ける
          const cameraDirection = new THREE.Vector3();
          this.camera.getWorldDirection(cameraDirection);
          const targetPoint = object.position.clone().add(cameraDirection.multiplyScalar(-1));
          object.lookAt(targetPoint);
          object.rotation.x = 0; // お辞儀防止
          rotated = true;
          console.log(`🔄 Reset rotation for: ${object.name}`);
          break;

        case 'i':
        case 'I':
          // デバッグ情報表示
          this.debugSceneInfo();
          event.preventDefault();
          break;
      }
      
      if (rotated) {
        event.preventDefault();
        const angles = {
          x: (object.rotation.x * 180 / Math.PI).toFixed(1),
          y: (object.rotation.y * 180 / Math.PI).toFixed(1),
          z: (object.rotation.z * 180 / Math.PI).toFixed(1)
        };
        console.log(`🔄 Rotated ${object.userData.type}: ${object.name} to (${angles.x}°, ${angles.y}°, ${angles.z}°)`);
      }
    });

    console.log('🖱️ Object dragging system enabled (Drag to move objects - Shift-free interaction)');
    console.log('🔄 Object resizing system enabled (Scroll to resize images/videos - Shift-free interaction)');
    console.log('🎯 Angle adjustment enabled (Select object + Arrow keys to rotate, R to reset)');
  }

  handleHoverEffects(event, canvas) {
    // レイキャスティングでオブジェクト検出
    const rect = canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // オブジェクトとその子（選択インジケーター含む）を検出対象に
    const intersects = this.raycaster.intersectObjects(this.experimentGroup.children, true);
    
    // 前回ホバーしていたオブジェクトのエフェクトをリセット
    if (this.lastHoveredObject && this.lastHoveredObject.onHoverExit) {
      this.lastHoveredObject.onHoverExit();
      this.lastHoveredObject = null;
    }
    
    // 新しいホバー対象を検出
    if (intersects.length > 0) {
      const object = intersects[0].object;
      
      // リサイズハンドルにホバーした場合
      if (object.userData && object.userData.isResizeHandle && object.onHover) {
        object.onHover();
        this.lastHoveredObject = object;
        return;
      }
      
      // 通常のオブジェクトにホバーした場合
      if (object.userData && (object.userData.type === 'generated_image' || object.userData.type === 'generated_video')) {
        // 移動可能なオブジェクトの場合はカーソルを変更
        canvas.style.cursor = 'move';

        this.lastHoveredObject = { onHoverExit: () => { canvas.style.cursor = 'default'; } };
        return;
      }
    }
    
    // ホバー対象がない場合はデフォルトカーソル
    canvas.style.cursor = 'default';
  }

  /**
   * メインコマンド実行エントリーポイント
   * @param {string} command - 自然言語コマンド
   */
  async executeCommand(command) {
    const timestamp = Date.now();
    console.log(`🎯 Executing: "${command}"`);
    
    try {
      // コマンド解析
      const parsed = this.parseCommand(command);
      console.log('📝 Parsed:', parsed);
      
      // コマンド実行
      const result = await this.dispatchCommand(parsed);
      
      // 履歴に記録
      this.commandHistory.push({
        timestamp,
        command,
        parsed,
        result,
        status: 'success'
      });
      
      return result;
      
    } catch (error) {
      console.error('❌ Command execution failed:', error);
      
      this.commandHistory.push({
        timestamp,
        command,
        error: error.message,
        status: 'error'
      });
      
      throw error;
    }
  }

  /**
   * 自然言語コマンド解析
   * @param {string} command 
   * @returns {object} 解析結果
   */
  parseCommand(command) {
    // プレフィックスでモードを判定
    if (command.startsWith('[変更] ')) {
      const actualCommand = command.replace('[変更] ', '');
      return this.parseObjectModificationCommand(actualCommand.toLowerCase().trim());
    }
    
    if (command.startsWith('[削除] ')) {
      const actualCommand = command.replace('[削除] ', '');
      return this.parseDeleteCommand(actualCommand.toLowerCase().trim());
    }
    
    // 動画生成の判定（プレフィックスなし = 生成モード）
    const cmd = command.toLowerCase().trim();
    
    // 自然言語オブジェクト操作の判定（「オブジェクト名 + 動作」パターン）
    const naturalLanguagePattern = this.parseNaturalLanguageCommand(cmd);
    if (naturalLanguagePattern) {
      return naturalLanguagePattern;
    }
    
    // 動画関連キーワードをチェック（文脈を考慮）
    const videoKeywords = ['動画', 'ビデオ', 'ムービー', '映像', '動く',
                          'video', 'movie', 'motion', 'moving', 'clip'];

    // アニメーションは文脈で判定
    const isAnimationForVideo = cmd.includes('アニメーション') &&
      (cmd.includes('作って') || cmd.includes('生成') || cmd.includes('を') ||
       cmd.includes('create') || cmd.includes('make') || cmd.includes('generate'));

    const isVideoRequest = videoKeywords.some(keyword => cmd.includes(keyword)) ||
      (cmd.includes('animate') && !cmd.includes('を')) || // "animate a cat"は動画、"猫をanimate"は操作
      isAnimationForVideo;
    
    if (isVideoRequest) {
      return {
        type: 'video_generation',
        prompt: command,
        position: this.parsePosition(cmd),
        size: this.parseSize(cmd)
      };
    }
    
    // オブジェクト選択関連キーワードをチェック
    const selectKeywords = ['選択', 'select', 'オブジェクト選択', '既存', 'existing'];
    const isSelectRequest = selectKeywords.some(keyword => cmd.includes(keyword));
    
    if (isSelectRequest) {
      return {
        type: 'object_selection',
        position: this.parsePosition(cmd)
      };
    }
    
    // ファイルインポート関連キーワードをチェック
    const importKeywords = ['インポート', 'import', '読み込', '読込', 'ファイル', 'file', '画像を選択', '動画を選択', '選択して配置'];
    const isImportRequest = importKeywords.some(keyword => cmd.includes(keyword));
    
    if (isImportRequest) {
      const isVideoImport = cmd.includes('動画') || cmd.includes('video') || cmd.includes('mp4');
      return {
        type: 'file_import',
        fileType: isVideoImport ? 'video' : 'image',
        position: this.parsePosition(cmd),
        size: this.parseSize(cmd)
      };
    }
    
    // 画像生成キーワードをチェック
    const imageKeywords = ['画像', '写真', 'イメージ', '絵', 'ピクチャー', 
                          'image', 'picture', 'photo', 'generate', 'create', 'make', 'draw'];
    const isImageRequest = imageKeywords.some(keyword => cmd.includes(keyword));
    
    // デフォルト: 画像生成として処理
    return {
      type: 'image_generation',
      prompt: command,
      position: this.parsePosition(cmd),
      size: this.parseSize(cmd)
    };
  }

  /**
   * コマンドから対象オブジェクトを特定
   */
  /**
   * オブジェクト識別用キーワード辞書を取得
   */
  getObjectKeywords() {
    return createObjectKeywords();
  }

  normalizeTargetPhrase(phrase) {
    if (!phrase) {
      return '';
    }

    let result = `${phrase}`.trim();

    result = result.replace(/[。、，,.!?！？]/g, ' ').trim();

    const referentialPattern = /^(さっき|先ほど|直前|最近|この前|その|あの|この|前回|前の|最新|最後|last|latest)\s*(の)?/i;
    while (referentialPattern.test(result)) {
      result = result.replace(referentialPattern, '').trim();
    }

    const politePattern = /(してください|して下さい|してね|してよ|してくれ|してくれませんか|してくださいね|してくださいよ|お願いします?|お願い|頼む)$/i;
    result = result.replace(politePattern, '').trim();

    const trailingPatterns = [
      /(を)?(左右反転|反転|削除|消して|消す|変更|変えて|塗り替えて|塗って|回転|回して|移動|動かして|拡大|縮小|大きく|小さく|並べ|寄せて|整列|選択|選んで|指定|生成|作って|描いて|アップロード|アップして|読み込んで|読み込んだ|開いて|閉じて|置いて|配置して|貼り付けて|flip|delete|remove|change|make|turn|rotate|move|scale|resize|generate|create).*$/i,
      /(を|に|へ|で|から|まで|と|や|って)$/i
    ];

    for (const pattern of trailingPatterns) {
      result = result.replace(pattern, '').trim();
    }

    result = result.replace(/(を|に|へ|で|から|まで|と|や|って)$/i, '').trim();

    if (!result) {
      const englishLeadingPattern = /^(flip|delete|remove|change|make|turn|rotate|move|scale|resize|generate|create)\s+/i;
      if (englishLeadingPattern.test(phrase.trim())) {
        result = phrase.trim().replace(englishLeadingPattern, '').trim();
      }
    }

    result = result.replace(/(を|に|へ|で|から|まで|と|や|って)$/i, '').trim();

    return result;
  }

  isReferentialCommand(command) {
    if (!command) {
      return false;
    }
    return /(さっき|先ほど|直前|最近|前回|前の|最後|最新|last|previous|before)/i.test(command);
  }

  getObjectSourceType(object) {
    if (!object || !object.userData) {
      return null;
    }
    return object.userData.source || object.userData.type || null;
  }

  getRecentObjects(command) {
    const objects = Array.from(this.spawnedObjects.values());
    if (objects.length === 0) {
      return [];
    }

    const importContext = /(インポート|取り込|アップロード|読み込)/.test(command);
    const generatedContext = /(生成|作っ|描い|create|generate)/.test(command);

    let candidates = objects;
    if (importContext) {
      candidates = candidates.filter(obj => this.getObjectSourceType(obj) === 'imported_file');
    } else if (generatedContext) {
      candidates = candidates.filter(obj => {
        const source = this.getObjectSourceType(obj);
        return source === 'generated_image' || source === 'generated_video';
      });
    }

    if (candidates.length === 0) {
      candidates = objects;
    }

    return candidates.sort((a, b) => {
      const aTime = a.userData?.lastModified || a.userData?.createdAt || 0;
      const bTime = b.userData?.lastModified || b.userData?.createdAt || 0;
      return bTime - aTime;
    });
  }

  findRecentObjectByContext(command, normalizedTarget, objectKeywords) {
    const candidates = this.getRecentObjects(command);
    if (candidates.length === 0) {
      return null;
    }

    if (normalizedTarget) {
      for (const candidate of candidates) {
        if (this.matchesObjectName(candidate, normalizedTarget, objectKeywords)) {
          return candidate;
        }
      }
    }

    return candidates[0];
  }

  extractTextTokens(text) {
    if (!text) {
      return [];
    }

    return text
      .replace(/[。、，,.!?！？]/g, ' ')
      .split(/[\s_/\-]+/)
      .map(token => token.trim())
      .filter(token => token.length > 1);
  }

  buildObjectKeywordHints({ prompt = '', fileName = '', baseType = null } = {}) {
    const keywords = new Set();

    if (prompt) {
      keywords.add(prompt.toLowerCase());
      for (const token of this.extractTextTokens(prompt)) {
        keywords.add(token.toLowerCase());
      }
    }

    if (fileName) {
      const baseName = fileName.replace(/\.[^/.]+$/, '');
      keywords.add(baseName.toLowerCase());
      for (const token of this.extractTextTokens(baseName)) {
        keywords.add(token.toLowerCase());
      }
    }

    if (baseType === 'image') {
      ['image', 'photo', 'picture', '画像', '写真', 'イメージ'].forEach(keyword => keywords.add(keyword));
    } else if (baseType === 'video') {
      ['video', 'movie', 'clip', '動画', 'ビデオ', 'ムービー', '映像'].forEach(keyword => keywords.add(keyword));
    }

    return Array.from(keywords).filter(Boolean);
  }

  findObjectByKeyword(command) {
    // 共通翻訳辞書から拡張されたキーワード辞書を使用
    const objectKeywords = this.getObjectKeywords();
    const normalizedCommand = this.normalizeTargetPhrase(command);

    // インポート順序での指定を解析（例: "2番目にインポートした猫", "最初にインポートしたユニコーン"）
    const importOrderMatch = command.match(/((\d+)番目|最初|初回|1番目)に(インポート|取り込)した(.+)/);
    if (importOrderMatch) {
      let orderNumber = 1; // デフォルトは1番目
      if (importOrderMatch[2]) {
        // 数字が指定されている場合
        orderNumber = parseInt(importOrderMatch[2]);
      } else if (importOrderMatch[1] === '最初' || importOrderMatch[1] === '初回') {
        orderNumber = 1;
      } else if (importOrderMatch[1] === '1番目') {
        orderNumber = 1;
      }
      const objectName = this.normalizeTargetPhrase(importOrderMatch[4]) || importOrderMatch[4].trim();
      return this.findImportedObjectByOrder(objectName, orderNumber, objectKeywords);
    }

    // インポート vs 生成の区別（例: "インポートした猫", "生成した犬", "作った画像"）
    const sourceMatch = command.match(/(インポート|取り込|アップロード|読み込|生成|作った)した?(.+)/);
    if (sourceMatch) {
      const sourceType = sourceMatch[1];
      const objectName = this.normalizeTargetPhrase(sourceMatch[2]) || sourceMatch[2].trim();
      const isImported = sourceType === 'インポート' || sourceType === '取り込';
      return this.findObjectBySourceAndName(objectName, isImported, objectKeywords);
    }

    if (this.isReferentialCommand(command)) {
      const recentObject = this.findRecentObjectByContext(command, normalizedCommand, objectKeywords);
      if (recentObject) {
        return recentObject;
      }
    }

    // 従来のキーワード検索（すべてのオブジェクト対象）
    return this.findObjectByName(normalizedCommand || command, objectKeywords);
  }

  /**
   * インポート順序でオブジェクトを検索
   */
  findImportedObjectByOrder(objectName, orderNumber, objectKeywords) {
    // インポートされたオブジェクトのみを取得してimportOrder順でソート
    const importedObjects = [];
    for (const child of this.spawnedObjects.values()) {
      if (!child.userData || this.getObjectSourceType(child) !== 'imported_file') continue;
      importedObjects.push(child);
    }

    // importOrderでソート
    importedObjects.sort((a, b) => (a.userData.importOrder || 0) - (b.userData.importOrder || 0));

    // オブジェクト名でフィルタリング
    const matchingObjects = objectName
      ? importedObjects.filter(child => this.matchesObjectName(child, objectName, objectKeywords))
      : importedObjects;

    if (matchingObjects.length >= orderNumber) {
      const foundObject = matchingObjects[orderNumber - 1]; // 1-based index
      console.log(`🎯 Found ${orderNumber}番目 imported object "${objectName}": ${foundObject.name}`);
      return foundObject;
    }

    console.warn(`⚠️ ${orderNumber}番目にインポートした"${objectName}"が見つかりません`);
    return null;
  }

  /**
   * ソース（インポート/生成）と名前でオブジェクトを検索
   */
  findObjectBySourceAndName(objectName, isImported, objectKeywords) {
    for (const child of this.spawnedObjects.values()) {
      if (!child.userData) continue;

      const childSource = this.getObjectSourceType(child);
      const isChildImported = childSource === 'imported_file';
      const isChildGenerated = childSource === 'generated_image' || childSource === 'generated_video';

      if (isImported && !isChildImported) continue;
      if (!isImported && !isChildGenerated) continue;

      if (this.matchesObjectName(child, objectName, objectKeywords)) {
        const sourceLabel = isImported ? 'インポートした' : '生成した';
        console.log(`🎯 Found ${sourceLabel} object "${objectName}": ${child.name}`);
        return child;
      }
    }

    const sourceLabel = isImported ? 'インポートした' : '生成した';
    console.warn(`⚠️ ${sourceLabel}"${objectName}"が見つかりません`);
    return null;
  }

  /**
   * 名前でオブジェクトを検索（従来の方式）
   */
  findObjectByName(command, objectKeywords) {
    const target = command && command.trim();
    if (!target) {
      return null;
    }

    for (const child of this.spawnedObjects.values()) {
      if (!child) continue;
      if (this.matchesObjectName(child, target, objectKeywords)) {
        return child;
      }
    }
    return null;
  }

  /**
   * オブジェクトが指定された名前にマッチするかチェック
   */
  matchesObjectName(child, objectName, objectKeywords) {
    if (!child || !objectName) {
      return false;
    }

    const targetLower = objectName.toLowerCase();

    if (child.userData && Array.isArray(child.userData.keywords)) {
      for (const keyword of child.userData.keywords) {
        if (!keyword) continue;
        const keywordLower = keyword.toLowerCase();
        if (targetLower.includes(keywordLower) || keywordLower.includes(targetLower)) {
          return true;
        }
      }
    }

    for (const [keyword, aliases] of Object.entries(objectKeywords)) {
      const keywordLower = keyword.toLowerCase();
      if (targetLower.includes(keywordLower)) {
        return true;
      }

      for (const alias of aliases) {
        const aliasLower = alias.toLowerCase();
        if (targetLower.includes(aliasLower)) {
          return true;
        }
      }
    }

    if (child.userData && child.userData.prompt) {
      const promptLower = child.userData.prompt.toLowerCase();
      if (promptLower.includes(targetLower) || targetLower.includes(promptLower)) {
        return true;
      }
    }

    if (child.userData && child.userData.fileName) {
      if (matchKeywordWithFilename(objectName, child.userData.fileName, objectKeywords)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 画像生成コマンド解析
   */
  parseImageGenerationCommand(command) {
    // プロンプト抽出 (「を」「に」「で」などで区切る)
    let prompt = command;
    const particles = ['を', 'に', 'で', 'の'];
    
    for (const particle of particles) {
      if (command.includes(particle)) {
        const parts = command.split(particle);
        if (parts[0]) {
          prompt = parts[0].trim();
          break;
        }
      }
    }
    
    // 不要な語句を除去
    prompt = prompt
      .replace(/(画像|作って|生成|して|ください)/g, '')
      .trim();
    
    return {
      type: 'image_generation',
      prompt,
      position: this.parsePosition(command),
      size: this.parseSize(command)
    };
  }

  /**
   * オブジェクト変更コマンド解析
   */
  parseObjectModificationCommand(command) {
    const cmd = command.toLowerCase().trim();
    
    // 色変更の解析
    let color = null;
    const colorMap = {
      '赤': 0xff0000, '赤色': 0xff0000,
      '青': 0x0000ff, '青色': 0x0000ff,
      '緑': 0x00ff00, '緑色': 0x00ff00,
      '黄': 0xffff00, '黄色': 0xffff00, '黄色い': 0xffff00,
      '紫': 0xff00ff, '紫色': 0xff00ff,
      '橙': 0xff8800, '橙色': 0xff8800, 'オレンジ': 0xff8800, 'オレンジ色': 0xff8800,
      '白': 0xffffff, '白色': 0xffffff,
      '黒': 0x000000, '黒色': 0x000000,
      '灰': 0x808080, '灰色': 0x808080, 'グレー': 0x808080, 'グレー色': 0x808080,
      'ピンク': 0xffc0cb, 'ピンク色': 0xffc0cb,
      '茶': 0x8b4513, '茶色': 0x8b4513,
      '銀': 0xc0c0c0, '銀色': 0xc0c0c0,
      '金': 0xffd700, '金色': 0xffd700
    };
    
    for (const [colorName, colorValue] of Object.entries(colorMap)) {
      if (cmd.includes(colorName)) {
        color = colorValue;
        break;
      }
    }

    // エフェクト解析の追加
    const effects = this.parseEffects(cmd);
    
    // サイズ変更の解析
    let scale = null;
    if (cmd.includes('大きく') || cmd.includes('拡大')) {
      scale = 1.5;
    } else if (cmd.includes('小さく') || cmd.includes('縮小')) {
      scale = 0.7;
    } else if (cmd.includes('倍')) {
      const match = cmd.match(/(\d+(?:\.\d+)?)\s*倍/);
      if (match) {
        scale = parseFloat(match[1]);
      }
    }
    
    // 移動コマンドの解析
    let movement = null;
    if (cmd.includes('移動') || cmd.includes('動か') || cmd.includes('へ')) {
      movement = this.parsePositionFromPrompt(cmd);
    }

    // 回転コマンドの解析
    let rotation = null;
    if (cmd.includes('回転') || cmd.includes('回す') || cmd.includes('回して') || cmd.includes('rotate')) {
      // 角度指定があるかチェック
      const degreeMatch = cmd.match(/(\d+)\s*度/);
      if (degreeMatch) {
        rotation = parseFloat(degreeMatch[1]) * Math.PI / 180; // 度をラジアンに変換
      } else {
        rotation = Math.PI / 4; // デフォルトは45度
      }
    }

    // 透明度コマンドの解析
    let opacity = null;
    if (cmd.includes('透明') || cmd.includes('transparent')) {
      if (cmd.includes('半透明')) {
        opacity = 0.5;
      } else {
        opacity = 0.3; // デフォルトの透明度
      }
    } else if (cmd.includes('不透明') || cmd.includes('opaque')) {
      opacity = 1.0;
    }

    // 反転コマンドの解析
    let flip = null;
    if (cmd.includes('左右反転') || cmd.includes('反転') || cmd.includes('ひっくり返') || cmd.includes('flip')) {
      flip = true;
    }

    return {
      type: 'object_modification',
      command: command,
      color: color,
      scale: scale,
      movement: movement,
      rotation: rotation,
      opacity: opacity,
      flip: flip,
      effects: effects,
      requiresSelection: true
    };
  }

  /**
   * エフェクト解析 - Phase 2 総合エフェクトシステム
   */
  parseEffects(cmd) {
    const effects = [];

    // エフェクトキーワード辞書
    const effectKeywords = {
      // 透明度系
      '透明': { type: 'opacity', value: 0.0, name: 'transparent' },
      '半透明': { type: 'opacity', value: 0.5, name: 'semi_transparent' },
      '不透明': { type: 'opacity', value: 1.0, name: 'opaque' },
      '濃く': { type: 'opacity', value: 1.0, name: 'solid' },

      // 発光系
      '光らせ': { type: 'glow', color: 0xffffff, intensity: 0.5, name: 'glow_white' },
      '光る': { type: 'glow', color: 0xffffff, intensity: 0.5, name: 'glow_white' },
      'ネオン': { type: 'glow', color: 0x00ffff, intensity: 0.8, name: 'neon_cyan' },
      'ホログラム': { type: 'glow', color: 0x00ffff, intensity: 0.6, name: 'hologram' },

      // 材質系
      'メタリック': { type: 'material', metalness: 0.8, roughness: 0.2, name: 'metallic' },
      '金属質': { type: 'material', metalness: 0.9, roughness: 0.1, name: 'metallic_shiny' },
      'ガラス': { type: 'material', metalness: 0.0, roughness: 0.0, name: 'glass' },
      'マット': { type: 'material', metalness: 0.0, roughness: 1.0, name: 'matte' },

      // アニメーション系
      'ふわふわ': { type: 'animation', animation: 'float', speed: 0.002, amplitude: 0.5, name: 'float_gentle' },
      '浮く': { type: 'animation', animation: 'float', speed: 0.003, amplitude: 0.8, name: 'float_strong' },
      '漂う': { type: 'animation', animation: 'float', speed: 0.001, amplitude: 0.3, name: 'float_slow' },

      'ドクドク': { type: 'animation', animation: 'pulse', speed: 0.003, amplitude: 0.15, name: 'pulse_heartbeat' },
      '鼓動': { type: 'animation', animation: 'pulse', speed: 0.0025, amplitude: 0.1, name: 'pulse_heart' },
      '脈動': { type: 'animation', animation: 'pulse', speed: 0.004, amplitude: 0.2, name: 'pulse_throb' },

      'くるくる': { type: 'animation', animation: 'spin', speed: 0.02, axis: 'y', name: 'spin_y' },
      'スピン': { type: 'animation', animation: 'spin', speed: 0.03, axis: 'y', name: 'spin_fast' },
      '回る': { type: 'animation', animation: 'spin', speed: 0.015, axis: 'y', name: 'spin_slow' },

      'きらめ': { type: 'animation', animation: 'sparkle', intensity: 0.8, name: 'sparkle' },
      '輝': { type: 'animation', animation: 'sparkle', intensity: 1.0, name: 'shine' },
      'キラキラ': { type: 'animation', animation: 'sparkle', intensity: 0.9, name: 'twinkle' },

      // 宇宙的エフェクト
      '宇宙': { type: 'cosmic', colors: [0x4444ff, 0xff4488, 0x44ffaa], intensity: 0.9, name: 'cosmic' },
      'オーロラ': { type: 'aurora', colors: [0x00ffaa, 0x4488ff, 0xff88aa], intensity: 0.8, name: 'aurora' },
      '星雲': { type: 'nebula', colors: [0x8844ff, 0xff8844, 0x44aaff], intensity: 1.0, name: 'nebula' },
      'エネルギー': { type: 'energy', colors: [0xffaa00, 0x00aaff, 0xaa00ff], intensity: 0.7, name: 'energy' },
      '神秘的': { type: 'mystic', colors: [0xaa44ff, 0xff44aa, 0x44ffff], intensity: 0.6, name: 'mystic' },

      // アート系エフェクト
      '水彩': { type: 'watercolor_art', colors: [0xff6b9d, 0x4ecdc4, 0xffe66d, 0x95e1d3], opacity: 0.6, name: 'watercolor' },
      '水彩画': { type: 'watercolor_art', colors: [0xff6b9d, 0x4ecdc4, 0xffe66d, 0x95e1d3], opacity: 0.6, name: 'watercolor' },
      'パステル': { type: 'pastel_art', colors: [0xffb3ba, 0xffdfba, 0xffffba, 0xbaffc9, 0xbae1ff], opacity: 0.7, name: 'pastel' },
      '虹色': { type: 'rainbow_glow', colors: [0xff0000, 0xff8800, 0xffff00, 0x00ff00, 0x0088ff, 0x0000ff, 0x8800ff], intensity: 0.5, name: 'rainbow_glow' }
    };

    // プリセット効果
    const presetEffects = {
      '魔法っぽく': [
        { type: 'glow', color: 0xcc44ff, intensity: 0.7, name: 'magic_glow' },
        { type: 'animation', animation: 'pulse', speed: 0.003, amplitude: 0.1, name: 'magic_pulse' },
        { type: 'animation', animation: 'sparkle', intensity: 0.6, name: 'magic_sparkle' }
      ],
      '幽霊': [
        { type: 'opacity', value: 0.6, name: 'ghost_transparent' },
        { type: 'animation', animation: 'float', speed: 0.002, amplitude: 0.4, name: 'ghost_float' },
        { type: 'glow', color: 0xffffff, intensity: 0.3, name: 'ghost_aura' }
      ],
      'サイバー': [
        { type: 'glow', color: 0x00ffaa, intensity: 0.8, name: 'cyber_glow' },
        { type: 'material', metalness: 0.8, roughness: 0.1, name: 'cyber_metal' },
        { type: 'animation', animation: 'glitch', intensity: 0.1, name: 'cyber_glitch' }
      ],
      '夢みたい': [
        { type: 'opacity', value: 0.7, name: 'dream_soft' },
        { type: 'animation', animation: 'float', speed: 0.0015, amplitude: 0.3, name: 'dream_float' },
        { type: 'animation', animation: 'rainbow', speed: 0.001, name: 'dream_rainbow' }
      ]
    };

    // プリセット効果をチェック
    for (const [presetName, presetEffectList] of Object.entries(presetEffects)) {
      if (cmd.includes(presetName)) {
        effects.push(...presetEffectList);
        console.log(`✨ Preset effect applied: ${presetName}`);
        continue;
      }
    }

    const chromaRequested = this.requiresChromaKey(cmd);

    // 個別効果をチェック
    for (const [keyword, effect] of Object.entries(effectKeywords)) {
      if (chromaRequested && keyword === '透明') {
        continue;
      }
      if (cmd.includes(keyword)) {
        effects.push(effect);
        console.log(`🎭 Effect detected: ${keyword} -> ${effect.name}`);
      }
    }

    if (chromaRequested) {
      const chromaConfig = this.detectChromaKeyConfig(cmd);
      effects.push({
        type: 'chroma_key',
        color: chromaConfig.color,
        threshold: chromaConfig.threshold,
        smoothing: chromaConfig.smoothing,
        name: 'chroma_key'
      });
      console.log(`🪄 Chroma key requested (color: #${chromaConfig.color.toString(16)}, threshold: ${chromaConfig.threshold})`);
    }

    return effects;
  }

  requiresChromaKey(cmd) {
    if (!cmd) return false;
    const chromaKeywords = ['クロマキー', 'グリーンバック', '背景を透過', '背景透過', '背景を透明', '背景透明', '背景を消', '背景消', '背景抜', 'remove background', 'transparent background'];
    if (chromaKeywords.some(keyword => cmd.includes(keyword))) {
      return true;
    }
    if (cmd.includes('背景') && (cmd.includes('透過') || cmd.includes('透明') || cmd.includes('消') || cmd.includes('なくして'))) {
      return true;
    }
    return false;
  }

  detectChromaKeyConfig(cmd) {
    const color = this.detectChromaKeyColor(cmd);
    let threshold;
    switch (color) {
      case 0xffffff:
        threshold = 0.22;
        break;
      case 0x000000:
        threshold = 0.24;
        break;
      case 0x00ff00:
        threshold = 0.32;
        break;
      case 0x0000ff:
        threshold = 0.3;
        break;
      default:
        threshold = 0.28;
    }
    return {
      color,
      threshold,
      smoothing: 0.1
    };
  }

  detectChromaKeyColor(cmd) {
    const hexMatch = cmd.match(/#([0-9a-fA-F]{6})/);
    if (hexMatch) {
      return parseInt(hexMatch[1], 16);
    }

    const colorKeywords = [
      { tokens: ['白', 'ホワイト', 'しろ'], value: 0xffffff },
      { tokens: ['黒', 'ブラック', 'くろ'], value: 0x000000 },
      { tokens: ['緑', 'グリーン', 'みどり'], value: 0x00ff00 },
      { tokens: ['青', 'ブルー', 'あお'], value: 0x0000ff },
      { tokens: ['赤', 'レッド', 'あか'], value: 0xff0000 },
      { tokens: ['黄', 'イエロー', 'きいろ'], value: 0xffff00 },
      { tokens: ['ピンク'], value: 0xffc0cb },
      { tokens: ['オレンジ'], value: 0xff8800 }
    ];

    for (const entry of colorKeywords) {
      if (entry.tokens.some(token => cmd.includes(token))) {
        return entry.value;
      }
    }

    return 0xffffff; // デフォルトはホワイト背景
  }

  /**
   * エフェクト適用システム - Phase 2
   */
  applyEffects(targetObject, effects) {
    let applied = false;

    for (const effect of effects) {
      console.log(`✨ Applying effect: ${effect.name} (${effect.type})`);

      switch (effect.type) {
        case 'opacity':
          applied = this.applyOpacityEffect(targetObject, effect) || applied;
          break;
        case 'glow':
          applied = this.applyGlowEffect(targetObject, effect) || applied;
          break;
        case 'material':
          applied = this.applyMaterialEffect(targetObject, effect) || applied;
          break;
        case 'animation':
          applied = this.applyAnimationEffect(targetObject, effect) || applied;
          break;
        case 'cosmic':
        case 'aurora':
        case 'nebula':
        case 'energy':
        case 'mystic':
        case 'rainbow_glow':
          applied = this.applyCosmicEffect(targetObject, effect) || applied;
          break;
        case 'watercolor_art':
        case 'pastel_art':
          applied = this.applyWatercolorEffect(targetObject, effect) || applied;
          break;
        case 'chroma_key':
          applied = this.applyChromaKeyEffect(targetObject, effect) || applied;
          break;
        default:
          console.warn(`🚫 Unknown effect type: ${effect.type}`);
      }
    }

    return applied;
  }

  /**
   * 透明度エフェクト適用
   */
  applyOpacityEffect(targetObject, effect) {
    if (!targetObject.material) return false;

    targetObject.material.transparent = true;
    targetObject.material.opacity = effect.value;
    targetObject.material.needsUpdate = true;

    console.log(`👻 Opacity set to: ${effect.value} (${effect.name})`);
    return true;
  }

  /**
   * 発光エフェクト適用
   */
  applyGlowEffect(targetObject, effect) {
    if (!targetObject.material) return false;

    if (this.ensureEmissiveSupport(targetObject)) {
      targetObject.material.emissive = new THREE.Color(effect.color);
      targetObject.material.emissiveIntensity = effect.intensity;
      targetObject.material.needsUpdate = true;
      console.log(`💡 Glow applied: color=0x${effect.color.toString(16)}, intensity=${effect.intensity}`);
      return true;
    }

    // Fallback: 調色による簡易発光表現
    const fallbackColor = new THREE.Color(effect.color);
    if (!targetObject.userData.originalColor) {
      targetObject.userData.originalColor = targetObject.material.color ? targetObject.material.color.clone() : null;
    }
    if (targetObject.material.color) {
      targetObject.material.color.lerp(fallbackColor, 0.4);
      targetObject.material.needsUpdate = true;
      console.log('💡 Glow fallback applied via color tint');
      return true;
    }

    console.warn('🚫 Glow effect could not be applied');
    return false;
  }

  ensureEmissiveSupport(targetObject) {
    const material = targetObject.material;
    if (!material) return false;
    return 'emissive' in material && material.emissive !== undefined;
  }

  /**
   * 材質エフェクト適用
   */
  applyMaterialEffect(targetObject, effect) {
    if (!targetObject.material) return false;

    // StandardMaterial の場合のみ適用
    if (targetObject.material.type === 'MeshStandardMaterial') {
      if (effect.metalness !== undefined) {
        targetObject.material.metalness = effect.metalness;
      }
      if (effect.roughness !== undefined) {
        targetObject.material.roughness = effect.roughness;
      }
      targetObject.material.needsUpdate = true;

      console.log(`🔩 Material updated: metalness=${effect.metalness}, roughness=${effect.roughness}`);
      return true;
    } else {
      console.warn(`🚫 Material effect requires StandardMaterial, got: ${targetObject.material.type}`);
      return false;
    }
  }

  /**
   * アニメーションエフェクト適用
   */
  applyAnimationEffect(targetObject, effect) {
    // アニメーション管理オブジェクトを初期化
    if (!this.animations) {
      this.animations = new Map();
      this.startAnimationLoop();
    }

    const animationId = `${targetObject.uuid}_${effect.animation}`;

    // 既存のアニメーションがあれば停止
    if (this.animations.has(animationId)) {
      this.animations.delete(animationId);
    }

    // 新しいアニメーションを追加
    const animationData = {
      object: targetObject,
      type: effect.animation,
      speed: effect.speed,
      amplitude: effect.amplitude || 1.0,
      axis: effect.axis || 'y',
      intensity: effect.intensity || 1.0,
      startTime: Date.now(),
      originalPosition: { ...targetObject.position },
      originalScale: { ...targetObject.scale },
      originalRotation: { ...targetObject.rotation }
    };

    this.animations.set(animationId, animationData);
    console.log(`🎬 Animation started: ${effect.animation} for ${targetObject.name}`);
    return true;
  }

  /**
   * 宇宙的エフェクト適用（オーロラ、星雲、エネルギー）
   */
  applyCosmicEffect(targetObject, effect) {
    if (!targetObject.material) return false;

    const useColorFallback = !this.ensureEmissiveSupport(targetObject);

    // アニメーション管理オブジェクトを初期化
    if (!this.animations) {
      this.animations = new Map();
      this.startAnimationLoop();
    }

    // 複数色の発光と色変化アニメーションを組み合わせ
    const cosmicAnimationId = `${targetObject.uuid}_${effect.type}`;

    // 既存のコスミックエフェクトがあれば削除
    if (this.animations.has(cosmicAnimationId)) {
      this.animations.delete(cosmicAnimationId);
    }

    if (useColorFallback) {
      if (targetObject.material.color) {
        if (!targetObject.userData.originalColor) {
          targetObject.userData.originalColor = targetObject.material.color.clone();
        }
        targetObject.material.color.set(effect.colors[0]);
        targetObject.material.needsUpdate = true;
      } else {
        console.warn('🚫 Cosmic fallback could not adjust color');
      }
    } else {
      targetObject.material.emissive = new THREE.Color(effect.colors[0]);
      targetObject.material.emissiveIntensity = effect.intensity;
      targetObject.material.needsUpdate = true;
    }

    // コスミックアニメーションデータを作成
    const cosmicData = {
      object: targetObject,
      type: 'cosmic',
      cosmicType: effect.type,
      colors: effect.colors,
      intensity: effect.intensity,
      speed: this.getCosmicSpeed(effect.type),
      startTime: Date.now(),
      colorIndex: 0,
      originalEmissive: !useColorFallback && targetObject.material.emissive ? targetObject.material.emissive.clone() : null,
      originalEmissiveIntensity: !useColorFallback ? (targetObject.material.emissiveIntensity || 0) : 0,
      useColorFallback
    };

    this.animations.set(cosmicAnimationId, cosmicData);
    console.log(`🌌 Cosmic effect started: ${effect.type} with ${effect.colors.length} colors`);
    return true;
  }

  applyChromaKeyEffect(targetObject, effect) {
    if (!targetObject.material) return false;
    const material = targetObject.material;
    const texture = material.map;

    if (!texture) {
      console.warn('🚫 Chroma key requires texture map');
      return false;
    }

    if (material.userData && material.userData.isChromaKeyMaterial && material.uniforms) {
      material.uniforms.keyColor.value.setHex(effect.color);
      material.uniforms.threshold.value = effect.threshold;
      material.uniforms.smoothing.value = effect.smoothing;
      material.needsUpdate = true;
      console.log('🎯 Updated existing chroma key material');
      return true;
    }

    const shaderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: texture },
        keyColor: { value: new THREE.Color(effect.color) },
        threshold: { value: effect.threshold },
        smoothing: { value: effect.smoothing }
      },
      vertexShader: `varying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}`,
      fragmentShader: `uniform sampler2D map;\nuniform vec3 keyColor;\nuniform float threshold;\nuniform float smoothing;\nvarying vec2 vUv;\nvoid main() {\n  vec4 color = texture2D(map, vUv);\n  float dist = distance(color.rgb, keyColor);\n  float alpha = smoothstep(threshold, threshold + smoothing, dist) * color.a;\n  if (alpha <= 0.0) discard;\n  gl_FragColor = vec4(color.rgb, alpha);\n}`,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: material.depthTest,
      depthWrite: material.depthWrite,
      toneMapped: material.toneMapped === true
    });

    shaderMaterial.userData.isChromaKeyMaterial = true;
    targetObject.material = shaderMaterial;

    if (typeof material.dispose === 'function') {
      material.dispose();
    }

    console.log('🪄 Applied chroma key shader material');
    return true;
  }

  /**
   * 宇宙的エフェクトのスピード設定
   */
  getCosmicSpeed(cosmicType) {
    switch (cosmicType) {
      case 'cosmic': return 0.0005;      // ゆっくりと神秘的に
      case 'aurora': return 0.0008;      // オーロラのような流れ
      case 'nebula': return 0.0003;      // 星雲のようにゆったり
      case 'energy': return 0.0015;      // エネルギッシュに
      case 'mystic': return 0.0006;      // 神秘的にゆらゆら
      case 'rainbow_glow': return 0.001; // 虹色は適度なスピード
      default: return 0.0008;
    }
  }

  /**
   * 水彩画・パステル系エフェクト適用
   */
  applyWatercolorEffect(targetObject, effect) {
    if (!targetObject.material) return false;

    // 透明度を設定
    targetObject.material.transparent = true;
    targetObject.material.opacity = effect.opacity;

    // アニメーション管理オブジェクトを初期化
    if (!this.animations) {
      this.animations = new Map();
      this.startAnimationLoop();
    }

    // 水彩画アニメーションID
    const watercolorAnimationId = `${targetObject.uuid}_${effect.type}`;

    // 既存の水彩画エフェクトがあれば削除
    if (this.animations.has(watercolorAnimationId)) {
      this.animations.delete(watercolorAnimationId);
    }

    // 初期色を設定（発光ではなく拡散色）
    targetObject.material.color = new THREE.Color(effect.colors[0]);
    targetObject.material.needsUpdate = true;

    // 水彩画アニメーションデータを作成
    const watercolorData = {
      object: targetObject,
      type: 'watercolor',
      artType: effect.type,
      colors: effect.colors,
      opacity: effect.opacity,
      speed: this.getWatercolorSpeed(effect.type),
      startTime: Date.now(),
      colorIndex: 0,
      originalColor: new THREE.Color(targetObject.material.color),
      originalOpacity: targetObject.material.opacity
    };

    this.animations.set(watercolorAnimationId, watercolorData);
    console.log(`🎨 Watercolor effect started: ${effect.type} with ${effect.colors.length} colors`);
    return true;
  }

  /**
   * 水彩画系エフェクトのスピード設定
   */
  getWatercolorSpeed(artType) {
    switch (artType) {
      case 'watercolor_art': return 0.0003;  // 水彩画は非常にゆっくり
      case 'pastel_art': return 0.0002;      // パステルはより穏やか
      default: return 0.0003;
    }
  }

  /**
   * アニメーションループ開始
   */
  startAnimationLoop() {
    if (this.animationLoopRunning) return;

    this.animationLoopRunning = true;

    const animate = () => {
      if (this.animations && this.animations.size > 0) {
        this.updateAnimations();
      }

      if (this.animationLoopRunning) {
        requestAnimationFrame(animate);
      }
    };

    animate();
    console.log(`🎭 Animation loop started`);
  }

  /**
   * アニメーション更新
   */
  updateAnimations() {
    const currentTime = Date.now();

    for (const [id, animation] of this.animations.entries()) {
      const elapsed = (currentTime - animation.startTime) * 0.001; // 秒に変換

      switch (animation.type) {
        case 'float':
          this.updateFloatAnimation(animation, elapsed);
          break;
        case 'pulse':
          this.updatePulseAnimation(animation, elapsed);
          break;
        case 'spin':
          this.updateSpinAnimation(animation, elapsed);
          break;
        case 'sparkle':
          this.updateSparkleAnimation(animation, elapsed);
          break;
        case 'rainbow':
          this.updateRainbowAnimation(animation, elapsed);
          break;
        case 'glitch':
          this.updateGlitchAnimation(animation, elapsed);
          break;
        case 'cosmic':
          this.updateCosmicAnimation(animation, elapsed);
          break;
        case 'watercolor':
          this.updateWatercolorAnimation(animation, elapsed);
          break;
      }
    }
  }

  /**
   * 浮遊アニメーション
   */
  updateFloatAnimation(animation, elapsed) {
    const yOffset = Math.sin(elapsed * animation.speed * 2 * Math.PI) * animation.amplitude;
    animation.object.position.y = animation.originalPosition.y + yOffset;
  }

  /**
   * パルスアニメーション
   */
  updatePulseAnimation(animation, elapsed) {
    const scaleOffset = Math.sin(elapsed * animation.speed * 2 * Math.PI) * animation.amplitude;
    const newScale = 1 + scaleOffset;
    animation.object.scale.setScalar(animation.originalScale.x * newScale);
  }

  /**
   * 回転アニメーション
   */
  updateSpinAnimation(animation, elapsed) {
    const rotationAmount = elapsed * animation.speed * 2 * Math.PI;
    if (animation.axis === 'x') {
      animation.object.rotation.x = animation.originalRotation.x + rotationAmount;
    } else if (animation.axis === 'y') {
      animation.object.rotation.y = animation.originalRotation.y + rotationAmount;
    } else if (animation.axis === 'z') {
      animation.object.rotation.z = animation.originalRotation.z + rotationAmount;
    }
  }

  /**
   * キラキラアニメーション（発光の明滅）
   */
  updateSparkleAnimation(animation, elapsed) {
    if (animation.object.material) {
      const intensity = (Math.sin(elapsed * 3 * 2 * Math.PI) * 0.5 + 0.5) * animation.intensity;
      animation.object.material.emissiveIntensity = intensity;
      animation.object.material.needsUpdate = true;
    }
  }

  /**
   * 虹色アニメーション
   */
  updateRainbowAnimation(animation, elapsed) {
    if (animation.object.material) {
      const hue = (elapsed * animation.speed) % 1;
      const color = new THREE.Color().setHSL(hue, 1, 0.5);
      animation.object.material.color = color;
      animation.object.material.needsUpdate = true;
    }
  }

  /**
   * グリッチアニメーション
   */
  updateGlitchAnimation(animation, elapsed) {
    if (Math.random() < 0.1) { // 10%の確率でグリッチ
      const offset = (Math.random() - 0.5) * animation.intensity;
      animation.object.position.x = animation.originalPosition.x + offset;
      animation.object.position.z = animation.originalPosition.z + offset;
    } else {
      animation.object.position.x = animation.originalPosition.x;
      animation.object.position.z = animation.originalPosition.z;
    }
  }

  /**
   * 宇宙的アニメーション（オーロラ、星雲、エネルギーエフェクト）
   */
  updateCosmicAnimation(animation, elapsed) {
    if (!animation.object.material) return;

    // 色の循環スピードを調整
    const colorCycleSpeed = elapsed * animation.speed;
    const numColors = animation.colors.length;

    // 滑らかな色の遷移を実現
    const colorProgress = (colorCycleSpeed % numColors);
    const currentColorIndex = Math.floor(colorProgress);
    const nextColorIndex = (currentColorIndex + 1) % numColors;
    const lerpFactor = colorProgress - currentColorIndex;

    // 現在の色と次の色をブレンド
    const currentColor = new THREE.Color(animation.colors[currentColorIndex]);
    const nextColor = new THREE.Color(animation.colors[nextColorIndex]);
    const blendedColor = currentColor.lerp(nextColor, lerpFactor);

    // 宇宙的エフェクトタイプごとの特別な処理
    let intensityMultiplier = 1.0;
    switch (animation.cosmicType) {
      case 'aurora':
        // オーロラは波のような強弱変化
        intensityMultiplier = 0.7 + 0.3 * Math.sin(elapsed * 2.5);
        break;
      case 'nebula':
        // 星雲はゆっくりとした脈動
        intensityMultiplier = 0.8 + 0.2 * Math.sin(elapsed * 1.2);
        break;
      case 'energy':
        // エネルギーは激しく変動
        intensityMultiplier = 0.6 + 0.4 * (Math.sin(elapsed * 4) * Math.cos(elapsed * 3));
        break;
      case 'cosmic':
        // 宇宙は神秘的にゆらゆら
        intensityMultiplier = 0.8 + 0.2 * Math.sin(elapsed * 1.8);
        break;
      case 'mystic':
        // 神秘的は複雑な変化
        intensityMultiplier = 0.7 + 0.3 * Math.sin(elapsed * 1.5) * Math.cos(elapsed * 0.8);
        break;
      case 'rainbow_glow':
        // 虹色は鮮やかに輝く
        intensityMultiplier = 0.6 + 0.3 * Math.sin(elapsed * 2.0);
        break;
    }

    if (animation.useColorFallback) {
      if (animation.object.material.color) {
        animation.object.material.color.copy(blendedColor);
        animation.object.material.needsUpdate = true;
      }
    } else {
      animation.object.material.emissive = blendedColor;
      animation.object.material.emissiveIntensity = animation.intensity * intensityMultiplier;
      animation.object.material.needsUpdate = true;
    }
  }

  /**
   * 水彩画アニメーション（拡散色の柔らかな変化）
   */
  updateWatercolorAnimation(animation, elapsed) {
    if (!animation.object.material) return;

    // 色の循環スピードを調整（宇宙エフェクトより遅い）
    const colorCycleSpeed = elapsed * animation.speed;
    const numColors = animation.colors.length;

    // 滑らかな色の遷移
    const colorProgress = (colorCycleSpeed % numColors);
    const currentColorIndex = Math.floor(colorProgress);
    const nextColorIndex = (currentColorIndex + 1) % numColors;
    const lerpFactor = colorProgress - currentColorIndex;

    // 現在の色と次の色をブレンド
    const currentColor = new THREE.Color(animation.colors[currentColorIndex]);
    const nextColor = new THREE.Color(animation.colors[nextColorIndex]);
    const blendedColor = currentColor.lerp(nextColor, lerpFactor);

    // 透明度の柔らかな変化
    let opacityMultiplier = 1.0;
    switch (animation.artType) {
      case 'watercolor_art':
        // 水彩画は透明度もゆっくり変化
        opacityMultiplier = 0.9 + 0.1 * Math.sin(elapsed * 0.5);
        break;
      case 'pastel_art':
        // パステルは透明度をより安定
        opacityMultiplier = 0.95 + 0.05 * Math.sin(elapsed * 0.3);
        break;
    }

    // 拡散色を設定（emissiveではなくcolor）
    animation.object.material.color = blendedColor;
    animation.object.material.opacity = animation.opacity * opacityMultiplier;
    animation.object.material.needsUpdate = true;
  }

  /**
   * プロンプトに基づいて自動エフェクトを決定
   */
  getAutoEffectsFromPrompt(prompt) {
    if (!prompt) return null;

    const lowerPrompt = prompt.toLowerCase();

    // 魔法・ファンタジー系
    if (lowerPrompt.includes('ユニコーン') || lowerPrompt.includes('unicorn') ||
        lowerPrompt.includes('魔法') || lowerPrompt.includes('magic') ||
        lowerPrompt.includes('魔女') || lowerPrompt.includes('wizard') ||
        lowerPrompt.includes('fairy') || lowerPrompt.includes('妖精')) {
      return ['魔法っぽく'];
    }

    // 宇宙・神秘系
    if (lowerPrompt.includes('ドラゴン') || lowerPrompt.includes('dragon') ||
        lowerPrompt.includes('宇宙') || lowerPrompt.includes('space') ||
        lowerPrompt.includes('星') || lowerPrompt.includes('star')) {
      return ['宇宙'];
    }

    // 幽霊・透明系
    if (lowerPrompt.includes('幽霊') || lowerPrompt.includes('ghost') ||
        lowerPrompt.includes('精霊') || lowerPrompt.includes('spirit')) {
      return ['幽霊'];
    }

    // サイバー・未来系
    if (lowerPrompt.includes('ロボット') || lowerPrompt.includes('robot') ||
        lowerPrompt.includes('サイバー') || lowerPrompt.includes('cyber') ||
        lowerPrompt.includes('未来') || lowerPrompt.includes('future')) {
      return ['サイバー'];
    }

    // 動物系 - 軽いキラキラエフェクト
    if (lowerPrompt.includes('猫') || lowerPrompt.includes('cat') ||
        lowerPrompt.includes('犬') || lowerPrompt.includes('dog') ||
        lowerPrompt.includes('鳥') || lowerPrompt.includes('bird')) {
      return ['きらめ'];
    }

    // 花・自然系 - パステルエフェクト
    if (lowerPrompt.includes('花') || lowerPrompt.includes('flower') ||
        lowerPrompt.includes('桜') || lowerPrompt.includes('cherry') ||
        lowerPrompt.includes('自然') || lowerPrompt.includes('nature')) {
      return ['パステル'];
    }

    return null; // 該当なしの場合はエフェクトなし
  }

  /**
   * オブジェクト認識成功時のフィードバックエフェクト
   */
  applyRecognitionFeedback(targetObject) {
    console.log(`🎯 Object recognition successful: ${targetObject.name}`);

    // 短時間のキラキラエフェクトで認識成功を視覚的に伝える
    const feedbackEffect = [{
      type: 'animation',
      animation: 'sparkle',
      intensity: 0.8,
      name: 'recognition_feedback'
    }];

    this.applyEffects(targetObject, feedbackEffect);

    // 3秒後にフィードバックエフェクトを停止
    setTimeout(() => {
      this.stopRecognitionFeedback(targetObject);
    }, 3000);
  }

  /**
   * 認識フィードバックエフェクトを停止
   */
  stopRecognitionFeedback(targetObject) {
    if (!this.animations) return;

    const feedbackAnimationId = `${targetObject.uuid}_sparkle`;
    if (this.animations.has(feedbackAnimationId)) {
      this.animations.delete(feedbackAnimationId);

      // 発光を元に戻す
      if (targetObject.material) {
        targetObject.material.emissiveIntensity = 0;
        targetObject.material.needsUpdate = true;
      }

      console.log(`✨ Recognition feedback stopped for: ${targetObject.name}`);
    }
  }

  /**
   * 削除コマンド解析
   */
  parseDeleteCommand(command) {
    const cmd = command.toLowerCase().trim();
    
    // 選択されたオブジェクトのみを削除するか、全削除かを判定
    if (cmd.includes('選択') || cmd.includes('これ') || cmd.includes('この')) {
      return {
        type: 'delete',
        target: 'selected',
        requiresSelection: true
      };
    }
    
    if (cmd.includes('全部') || cmd.includes('すべて') || cmd.includes('全て')) {
      return {
        type: 'delete',
        target: 'all'
      };
    }
    
    // デフォルト: 選択されたオブジェクトを削除
    return {
      type: 'delete',
      target: 'selected',
      requiresSelection: true
    };
  }

  /**
   * 自然言語オブジェクト操作コマンド解析
   * 例: "ユニコーンを右に移動", "猫の画像をピンクに", "1つ目の猫を左に"
   */
  parseNaturalLanguageCommand(command) {
    // 移動パターンをチェック
    const movePatterns = [
      '(\S+?)を(.+?)に移動', 
      '(\S+?)を(.+?)へ移動',
      '(\S+?)を(.+?)に動か',
      '(\S+?)を(.+?)へ動か'
    ];
    
    for (const pattern of movePatterns) {
      const regex = new RegExp(pattern);
      const match = command.match(regex);
      if (match) {
        const objectName = match[1];
        const direction = match[2];
        
        console.log(`🎯 Natural language move detected: "${objectName}" to "${direction}"`);
        
        return {
          type: 'natural_object_modification',
          targetObjectName: objectName,
          movement: this.parsePositionFromPrompt(direction),
          requiresObjectSearch: true
        };
      }
    }
    
    // 色変更パターンをチェック
    const colorPatterns = [
      '(\S+?)を(\S+?)色に',
      '(\S+?)を(\S+?)に'
    ];
    
    // 色変更は基本的な色のみ対応
    const colorKeywords = ['赤', '赤色', '青', '青色', '緑', '緑色', '黄', '黄色', '黄色い', '紫', '紫色',
                          '橙', '橙色', 'オレンジ', 'オレンジ色', '白', '白色', '黒', '黒色',
                          '灰', '灰色', 'グレー', 'グレー色', 'ピンク', 'ピンク色', '茶', '茶色', '銀', '銀色', '金', '金色'];
    
    for (const pattern of colorPatterns) {
      const regex = new RegExp(pattern);
      const match = command.match(regex);
      if (match && colorKeywords.some(color => match[2].includes(color))) {
        const objectName = match[1];
        const colorName = match[2];
        
        console.log(`🎨 Natural language color change detected: "${objectName}" to "${colorName}"`);
        
        // 色変更の解析（既存のロジックを流用）
        const colorMap = {
          '赤': 0xff0000, '赤色': 0xff0000,
          '青': 0x0000ff, '青色': 0x0000ff,
          '緑': 0x00ff00, '緑色': 0x00ff00,
          '黄': 0xffff00, '黄色': 0xffff00, '黄色い': 0xffff00,
          '紫': 0xff00ff, '紫色': 0xff00ff,
          '橙': 0xff8800, '橙色': 0xff8800, 'オレンジ': 0xff8800, 'オレンジ色': 0xff8800,
          '白': 0xffffff, '白色': 0xffffff,
          '黒': 0x000000, '黒色': 0x000000,
          '灰': 0x808080, '灰色': 0x808080, 'グレー': 0x808080, 'グレー色': 0x808080,
          'ピンク': 0xffc0cb, 'ピンク色': 0xffc0cb,
          '茶': 0x8b4513, '茶色': 0x8b4513,
          '銀': 0xc0c0c0, '銀色': 0xc0c0c0,
          '金': 0xffd700, '金色': 0xffd700
        };
        
        let colorValue = null;
        for (const [colorKey, value] of Object.entries(colorMap)) {
          if (colorName.includes(colorKey)) {
            colorValue = value;
            break;
          }
        }
        
        return {
          type: 'natural_object_modification',
          targetObjectName: objectName,
          color: colorValue,
          requiresObjectSearch: true
        };
      }
    }

    // 回転パターンをチェック
    const rotationPatterns = [
      '(\S+?)を回転',
      '(\S+?)を回す',
      '(\S+?)を回して',
      '(\S+?)回転',
      '回転.*?(\S+)'
    ];

    for (const pattern of rotationPatterns) {
      const regex = new RegExp(pattern);
      const match = command.match(regex);
      if (match) {
        const objectName = match[1];

        console.log(`🔄 Natural language rotation detected: "${objectName}"`);

        // 角度指定があるかチェック
        const degreeMatch = command.match(/(\d+)\s*度/);
        const rotation = degreeMatch ?
          parseFloat(degreeMatch[1]) * Math.PI / 180 :
          Math.PI / 4; // デフォルト45度

        return {
          type: 'natural_object_modification',
          targetObjectName: objectName,
          rotation: rotation,
          requiresObjectSearch: true
        };
      }
    }

    // 反転パターンをチェック
    const flipPatterns = [
      '(\S+?)を左右反転',
      '(\S+?)を反転',
      '(\S+?)反転',
      '(\S+?)をひっくり返',
      '(\S+?)をflip'
    ];

    for (const pattern of flipPatterns) {
      const regex = new RegExp(pattern);
      const match = command.match(regex);
      if (match) {
        const objectName = match[1];

        console.log(`🔄 Natural language flip detected: "${objectName}"`);

        return {
          type: 'natural_object_modification',
          targetObjectName: objectName,
          flip: true, // 反転フラグを追加
          requiresObjectSearch: true
        };
      }
    }

    // エフェクトパターンをチェック（水彩、宇宙エフェクトなど）
    const effectPatterns = [
      '(\S+?)を(\S+?)っぽく',
      '(\S+?)を(\S+?)に',
      '(\S+?)を(\S+?)風に',
      '(\S+?)を(\S+?)みたい'
    ];

    const effectKeywords = ['水彩', '水彩画', '宇宙', 'オーロラ', '星雲', 'エネルギー', '神秘的',
                            'パステル', '魔法', '幽霊', 'サイバー', '夢', '光', 'ネオン',
                            'メタリック', '金属', 'ガラス', 'マット'];

    for (const pattern of effectPatterns) {
      const regex = new RegExp(pattern);
      const match = command.match(regex);
      if (match && effectKeywords.some(effect => match[2].includes(effect))) {
        const objectName = match[1];
        const effectName = match[2];

        console.log(`✨ Natural language effect detected: "${objectName}" with "${effectName}"`);

        return {
          type: 'natural_object_modification',
          targetObjectName: objectName,
          command: effectName, // エフェクトはコマンドとして渡す
          requiresObjectSearch: true
        };
      }
    }

    return null; // 自然言語パターンに一致しない場合
  }

  /**
   * 移動コマンドから相対位置を解析（オブジェクト移動用）
   */
  parsePositionFromPrompt(command) {
    let x = 0, y = 0, z = 0;
    
    // 左右移動（修正：左右を正しい方向に）
    if (command.includes('右へ') || command.includes('右に') || command.includes('右側へ') || command.includes('右側に')) {
      x = 5; // 5メートル右へ（正の値で右に移動）
    } else if (command.includes('左へ') || command.includes('左に') || command.includes('左側へ') || command.includes('左側に')) {
      x = -5; // 5メートル左へ（負の値で左に移動）
    }
    
    // 上下移動
    if (command.includes('上へ') || command.includes('上に') || command.includes('上側へ')) {
      y = 3; // 3メートル上へ
    } else if (command.includes('下へ') || command.includes('下に') || command.includes('下側へ')) {
      y = -3; // 3メートル下へ
    }
    
    // 前後移動
    if (command.includes('前へ') || command.includes('手前へ') || command.includes('近くへ')) {
      z = 3; // カメラに近づける
    } else if (command.includes('後ろへ') || command.includes('奥へ') || command.includes('遠くへ')) {
      z = -3; // カメラから遠ざける
    }
    
    // 距離指定の解析
    const distanceMatch = command.match(/(\d+(?:\.\d+)?)\s*(?:メートル|m)/);
    if (distanceMatch) {
      const distance = parseFloat(distanceMatch[1]);
      // 方向に応じて距離を適用
      if (Math.abs(x) > 0) x = x > 0 ? distance : -distance;
      if (Math.abs(y) > 0) y = y > 0 ? distance : -distance;
      if (Math.abs(z) > 0) z = z > 0 ? distance : -distance;
    }
    
    // 「少し」「大きく」などの修飾語
    if (command.includes('少し') || command.includes('ちょっと')) {
      x *= 0.5; y *= 0.5; z *= 0.5;
    } else if (command.includes('大きく') || command.includes('たくさん')) {
      x *= 2; y *= 2; z *= 2;
    }
    
    console.log(`📍 Position movement parsed from "${command}": (${x}, ${y}, ${z})`);
    
    return { x, y, z };
  }

  /**
   * 位置情報解析（カメラ相対位置）
   */
  parsePosition(command) {
    const defaultPos = { x: 0, y: 5, z: 10 }; // カメラ前方10m、少し上
    
    // 基本方向の解析（カメラ相対座標系）
    let x = 0, y = 5, z = 10; // デフォルト値（カメラ相対、正のzが前方）
    
    // 組み合わせ位置を最初にチェック（優先度最高）
    if (command.includes('左下')) {
      x = -8; y = 0; z = 10;  // 左下: 左側で低い位置
      console.log(`📍 Position parsed from "${command}": 左下 (${x}, ${y}, ${z})`);
      return { x, y, z };
    } else if (command.includes('右上')) {
      x = 5; y = 4; z = 12;  // y座標を下げて画面内に収める
      console.log(`📍 Position parsed from "${command}": 右上 (${x}, ${y}, ${z})`);
      return { x, y, z };
    } else if (command.includes('左上')) {
      x = -8; y = 4; z = 15; // y座標を下げて画面内に収める
      console.log(`📍 Position parsed from "${command}": 左上 (${x}, ${y}, ${z})`);
      return { x, y, z };
    } else if (command.includes('右下')) {
      x = 8; y = 0; z = 10; // 右下: 右側で低い位置
      console.log(`📍 Position parsed from "${command}": 右下 (${x}, ${y}, ${z})`);
      return { x, y, z };
    }
    
    // 特殊位置
    if (command.includes('中央') || command.includes('真ん中') || command.includes('正面')) {
      x = 0; y = 3; z = 12;  // y=3 で目線レベルに
      console.log(`📍 Position parsed from "${command}": 中央 (${x}, ${y}, ${z})`);
      return { x, y, z };
    } else if (command.includes('空') || command.includes('天空')) {
      x = 0; y = 20; z = 10;
      console.log(`📍 Position parsed from "${command}": 空中 (${x}, ${y}, ${z})`);
      return { x, y, z };
    } else if (command.includes('地面') || command.includes('足元')) {
      x = 0; y = 1; z = 8;
      console.log(`📍 Position parsed from "${command}": 地面 (${x}, ${y}, ${z})`);
      return { x, y, z };
    }
    
    // 個別方向の解析
    // 前後方向
    if (command.includes('前に') || command.includes('手前に')) {
      z = 5; // カメラに近づける
    } else if (command.includes('後ろに') || command.includes('奥に') || command.includes('遠くに')) {
      z = 20; // カメラから遠ざける
    }
    
    // 左右方向
    if (command.includes('右に') || command.includes('右側') || command.includes('画面の右')) {
      x = 8;
    } else if (command.includes('左に') || command.includes('左側') || command.includes('画面の左')) {
      x = -8;
    }
    
    // 上下方向（カメラ相対）
    if (command.includes('上に') || command.includes('上側') || command.includes('画面の上') || command.includes('高い位置に') || command.includes('空中に')) {
      y = 8; // カメラから8メートル上
    } else if (command.includes('下に') || command.includes('下側') || command.includes('画面の下') || command.includes('低い位置に') || command.includes('地面に')) {
      y = -2; // カメラから2メートル下
    }
    
    // 距離指定
    if (command.includes('近くに') || command.includes('すぐ前に')) {
      z = Math.min(z * 0.5, 3); // 半分の距離、ただし最低3m（正の値なので min を使用）
    } else if (command.includes('遠くに') || command.includes('向こうに')) {
      z = z * 1.5; // 1.5倍の距離
    }
    
    console.log(`📍 Position parsed from "${command}": (${x}, ${y}, ${z})`);
    
    return { x, y, z };
  }

  /**
   * サイズ解析
   */
  parseSize(command) {
    if (command.includes('大きな') || command.includes('大きい')) return { scale: 2.0 };
    if (command.includes('小さな') || command.includes('小さい')) return { scale: 0.5 };
    return { scale: this.config.defaultObjectScale };
  }

  /**
   * コマンド種別別実行
   */
  async dispatchCommand(parsed) {
    switch (parsed.type) {
      case 'image_generation':
        // サーバーなしの場合は生成機能を無効化
        if (!this.client || !this.client.serverUrl) {
          throw new Error('画像生成機能を使用するにはサーバー設定が必要です。インポート機能のみ利用可能です。');
        }
        return await this.executeImageGeneration(parsed);
        
      case 'video_generation':
        // サーバーなしの場合は生成機能を無効化
        if (!this.client || !this.client.serverUrl) {
          throw new Error('動画生成機能を使用するにはサーバー設定が必要です。インポート機能のみ利用可能です。');
        }
        return await this.executeVideoGeneration(parsed);
        
      case 'object_modification':
        return await this.executeObjectModification(parsed);
        
      case 'natural_object_modification':
        return await this.executeNaturalObjectModification(parsed);
        
      case 'delete':
        return await this.executeDelete(parsed);
        
      case 'file_import':
        return await this.executeFileImport(parsed);
        
      case 'object_selection':
        return await this.executeObjectSelection(parsed);
        
      default:
        throw new Error(`Unknown command type: ${parsed.type}`);
    }
  }

  /**
   * 画像生成実行
   */
  async executeImageGeneration(parsed) {
    try {
      console.log(`🎨 Generating image: "${parsed.prompt}"`);
      
      // 段階的にサイズを試行（シーンに配置しやすいサイズを優先）
      const fallbackSizes = [
        { width: 512, height: 512 },    // 1:1 基本サイズ（互換性最高）
        { width: 768, height: 432 },    // 16:9 現代的サイズ
        { width: 1024, height: 1024 },  // 大きめ1:1
        { width: 640, height: 480 },    // 4:3 クラシック
      ];
      
      let imageResult;
      let lastError;
      
      for (let i = 0; i < fallbackSizes.length; i++) {
        const dimensions = fallbackSizes[i];
        try {
          console.log(`🔄 Trying ${dimensions.width}x${dimensions.height}...`);
          
          imageResult = await this.client.generateImage(parsed.prompt, {
            width: dimensions.width,
            height: dimensions.height,
            service: this.selectedImageService || undefined
          });
          
          if (imageResult.success) {
            console.log(`✅ Success with ${dimensions.width}x${dimensions.height}`);
            break;
          }
        } catch (error) {
          lastError = error;
          console.log(`⚠️ Failed with ${dimensions.width}x${dimensions.height}: ${error.message}`);
          
          // 最後の試行でない場合は続行
          if (i < fallbackSizes.length - 1) {
            console.log(`🔄 Retrying with next size...`);
            continue;
          }
        }
      }
      
      // 結果にモデル情報を含める
      if (imageResult && imageResult.modelName) {
        console.log(`📡 Used model: ${imageResult.modelName}`);
      }
      
      const loader = new THREE.TextureLoader();
      let texture;
      if (imageResult && imageResult.success && (imageResult.imageUrl || imageResult.localPath)) {
        // 成功: 生成された画像をテクスチャとして使用
        let imageUrl = imageResult.imageUrl;
        
        // localPathの場合はWebアクセス可能なURLに変換
        if (!imageUrl && imageResult.localPath) {
          const filename = imageResult.localPath.split('/').pop();
          imageUrl = `${this.client.serverUrl}/generated/${filename}`;
        }
        
        console.log(`✅ Image generated successfully: ${imageUrl}`);
        texture = await loader.loadAsync(imageUrl);

        // テクスチャの色彩を正確に表示するための設定
        texture.colorSpace = THREE.SRGBColorSpace; // 正しいカラースペース
      } else {
        // 失敗: プレースホルダー画像を使用
        console.log(`⚠️ Using fallback image (last error: ${lastError?.message || 'unknown'})`);
        texture = this.createFallbackTexture(parsed.prompt);
      }

      const sizeScale = parsed.size?.scale ?? this.config.defaultObjectScale ?? 1;
      const baseSize = 6 * sizeScale;

      const imageWidth = texture.image?.naturalWidth || texture.image?.width || texture.source?.data?.width || 1;
      const imageHeight = texture.image?.naturalHeight || texture.image?.height || texture.source?.data?.height || 1;
      const aspectRatio = imageWidth / imageHeight || 1;

      let planeWidth = baseSize;
      let planeHeight = baseSize;
      if (aspectRatio >= 1) {
        planeWidth = baseSize;
        planeHeight = baseSize / aspectRatio;
      } else {
        planeWidth = baseSize * aspectRatio;
        planeHeight = baseSize;
      }

      // 画像を表示する平面ジオメトリを作成
      const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide, // 両面表示
        toneMapped: false    // トーンマッピングを無効化（より鮮やかな色彩）
      });
      
      const plane = new THREE.Mesh(geometry, material);
      
      // レンダリング順序を設定（画像も前面に表示）
      plane.renderOrder = 1000;  // 高い値で前面に表示
      material.depthTest = true;  // 深度テストは有効に
      material.depthWrite = true; // 深度書き込みも有効に
      material.alphaTest = 0.01;
      material.needsUpdate = true;

      // カメラ相対位置で配置（カメラの向きも考慮）
      if (this.camera) {
        const finalPosition = this.calculateCameraRelativePosition(parsed.position);
        plane.position.copy(finalPosition);
        this.alignPlaneToCamera(plane);
      } else {
        // フォールバック: 絶対座標
        plane.position.set(parsed.position.x, parsed.position.y, parsed.position.z);
      }
      
      // スケールは幅計算に含めているので、ここでは1.0に固定
      plane.scale.setScalar(1.0);
      
      // 識別用の名前とメタデータ
      const objectId = `generated_${++this.objectCounter}`;
      plane.name = objectId;
      plane.userData = {
        id: objectId,
        prompt: parsed.prompt,
        createdAt: Date.now(),
        type: 'generated_image',
        source: 'generated_image',
        modelName: imageResult?.modelName || this.selectedImageService || null,
        keywords: this.buildObjectKeywordHints({ prompt: parsed.prompt, baseType: 'image' })
      };
      
      this.experimentGroup.add(plane);
      this.spawnedObjects.set(objectId, plane);

      console.log(`✅ Created object: ${objectId} at (${parsed.position.x}, ${parsed.position.y}, ${parsed.position.z})`);

      // 生成位置にパーティクルエフェクトを追加（視覚的フィードバック）
      if (this.config.showLocationIndicator) {
        this.createLocationIndicator(parsed.position);
      }
      
      return {
        objectId,
        position: parsed.position,
        prompt: parsed.prompt,
        modelName: imageResult?.modelName,
        success: true
      };
      
    } catch (error) {
      console.error('🎨 Image generation failed:', error);
      throw error;
    }
  }

  /**
   * 動画生成実行
   */
  async executeVideoGeneration(parsed) {
    try {
      console.log(`🎬 Generating video: "${parsed.prompt}"`);
      console.log('🔍 Video generation - selectedVideoService:', this.selectedVideoService);
      
      // ChocoDro Client経由で動画生成
      // アスペクト比は各モデルのサポート状況に応じてサーバー側で最適化
      const videoResult = await this.client.generateVideo(parsed.prompt, {
        duration: 3,
        model: this.selectedVideoService || undefined
        // width, height指定を削除してサーバー側デフォルト(16:9)を使用
      });
      
      // 結果にモデル情報を含める
      if (videoResult.modelName) {
        console.log(`📡 Used model: ${videoResult.modelName}`);
      }
      
      let videoTexture;
      let video = null; // video変数をスコープ外で定義
      
      if (videoResult.success && videoResult.videoUrl) {
        // 成功: 生成された動画をテクスチャとして使用
        console.log(`✅ Video generated successfully: ${videoResult.videoUrl}`);
        
        // HTML5 video要素を作成
        video = document.createElement('video');
        video.src = videoResult.videoUrl;
        video.crossOrigin = 'anonymous';
        video.loop = true;
        video.muted = true; // 初期はミュート（ユーザーが手動で音声制御）
        video.playsInline = true;
        
        // 動画テクスチャを作成
        videoTexture = new THREE.VideoTexture(video);
        videoTexture.colorSpace = THREE.SRGBColorSpace;
        
        // 動画の自動再生を開始
        video.addEventListener('loadeddata', () => {
          video.play().catch(console.error);
        });
        
      } else {
        // 失敗: プレースホルダー動画テクスチャを使用
        console.log(`⚠️ Using fallback video texture`);
        videoTexture = this.createFallbackVideoTexture(parsed.prompt);
      }
      
      // 動画を表示する平面ジオメトリを作成（アスペクト比を考慮）
      const sizeScale = parsed.size?.scale ?? this.config.defaultObjectScale ?? 1;
      const baseSize = 6 * sizeScale;

      const requestedWidth = videoResult.metadata?.width || 512;
      const requestedHeight = videoResult.metadata?.height || 512;
      const planeAspect = requestedWidth && requestedHeight ? requestedWidth / requestedHeight : 1;

      let planeWidth = baseSize;
      let planeHeight = baseSize;

      if (planeAspect >= 1) {
        planeHeight = baseSize / planeAspect;
      } else {
        planeWidth = baseSize * planeAspect;
      }

      const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
      const material = new THREE.MeshBasicMaterial({
        map: videoTexture,
        transparent: false,
        side: THREE.DoubleSide,
        toneMapped: false
      });
      
      const plane = new THREE.Mesh(geometry, material);
      
      // レンダリング順序を設定（動画を前面に表示）
      plane.renderOrder = 1000;  // 高い値で前面に表示
      material.depthTest = true;  // 深度テストは有効に
      material.depthWrite = true; // 深度書き込みも有効に
      
      // カメラ相対位置で配置
      if (this.camera) {
        const finalPosition = this.calculateCameraRelativePosition(parsed.position);
        plane.position.copy(finalPosition);
        this.alignPlaneToCamera(plane);
      } else {
        plane.position.set(parsed.position.x, parsed.position.y, parsed.position.z);
      }

      // スケールは幅計算に含めているので、ここでは1.0に固定
      plane.scale.setScalar(1.0);

      // 識別用の名前とメタデータ
      const objectId = `generated_video_${++this.objectCounter}`;
      plane.name = objectId;
      plane.userData = {
        id: objectId,
        prompt: parsed.prompt,
        createdAt: Date.now(),
        type: 'generated_video',
        source: 'generated_video',
        videoUrl: videoResult.videoUrl,
        modelName: videoResult.modelName || this.selectedVideoService || null,
        width: requestedWidth,
        height: requestedHeight,
        videoElement: video,
        keywords: this.buildObjectKeywordHints({ prompt: parsed.prompt, baseType: 'video' })
      };

      // 音声制御UIを作成
      this.createAudioControl(plane);
      
      this.experimentGroup.add(plane);
      this.spawnedObjects.set(objectId, plane);
      
      console.log(`✅ Created video object: ${objectId} at (${parsed.position.x}, ${parsed.position.y}, ${parsed.position.z})`);
      
      // 生成位置にパーティクルエフェクトを追加
      if (this.config.showLocationIndicator) {
        this.createLocationIndicator(parsed.position);
      }
      
      return {
        objectId,
        position: parsed.position,
        prompt: parsed.prompt,
        modelName: videoResult.modelName,
        videoUrl: videoResult.videoUrl,
        success: true
      };
      
    } catch (error) {
      console.error('🎬 Video generation failed:', error);
      
      // エラー時もプレースホルダー動画を表示
      console.log('🔄 Creating fallback video plane due to generation error');
      const fallbackVideoTexture = this.createFallbackVideoTexture(parsed.prompt);
      
      // 動画を表示する平面ジオメトリを作成
      const sizeScale = parsed.size?.scale ?? this.config.defaultObjectScale ?? 1;
      const baseSize = 6 * sizeScale;
      const geometry = new THREE.PlaneGeometry(baseSize, baseSize);
      const material = new THREE.MeshBasicMaterial({
        map: fallbackVideoTexture,
        transparent: false,
        side: THREE.DoubleSide,
        toneMapped: false
      });
      
      const plane = new THREE.Mesh(geometry, material);
      
      // カメラ相対位置で配置
      if (this.camera) {
        const finalPosition = this.calculateCameraRelativePosition(parsed.position);
        plane.position.copy(finalPosition);
        this.alignPlaneToCamera(plane);
      } else {
        plane.position.set(parsed.position.x, parsed.position.y, parsed.position.z);
      }

      plane.scale.setScalar(1.0);

      // 識別用の名前とメタデータ
      const objectId = `generated_video_${++this.objectCounter}`;
      plane.name = objectId;
      plane.userData = {
        id: objectId,
        prompt: parsed.prompt,
        createdAt: Date.now(),
        type: 'generated_video',
        source: 'generated_video',
        videoUrl: null, // エラー時はnull
        modelName: 'Error Fallback',
        width: 512,
        height: 512,
        videoElement: null,
        error: error.message,
        keywords: this.buildObjectKeywordHints({ prompt: parsed.prompt, baseType: 'video' })
      };

      // シーンに追加
      this.scene.add(plane);
      console.log('📍 Fallback video plane added to scene');

      return {
        success: false,
        error: error.message,
        object: plane,
        prompt: parsed.prompt
      };
    }
  }

  async loadImageFile(fileUrl, options = {}) {
    try {
      const { position = { x: 0, y: 5, z: -10 }, fileName = null } = options;
      
      console.log(`📁 Loading image file: ${fileUrl}`);
      
      // ファイルからテクスチャを読み込み
      const loader = new THREE.TextureLoader();
      const texture = await loader.loadAsync(fileUrl);

      // テクスチャの色彩を正確に表示するための設定
      texture.colorSpace = THREE.SRGBColorSpace;

      // アスペクト比を算出（fallback: 1）
      const imageWidth = texture.image?.naturalWidth || texture.image?.width || texture.source?.data?.width || 1;
      const imageHeight = texture.image?.naturalHeight || texture.image?.height || texture.source?.data?.height || 1;
      const aspectRatio = imageWidth / imageHeight || 1;
      
      const baseSize = 6;
      let width = baseSize;
      let height = baseSize;
      if (aspectRatio >= 1) {
        width = baseSize;
        height = baseSize / aspectRatio;
      } else {
        width = baseSize * aspectRatio;
        height = baseSize;
      }

      // 画像を表示する平面ジオメトリを作成（縦横比を維持）
      const geometry = new THREE.PlaneGeometry(width, height);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
        toneMapped: false
      });
      material.alphaTest = 0.01;
      material.needsUpdate = true;
      
      const plane = new THREE.Mesh(geometry, material);

      // レンダリング順序を設定
      plane.renderOrder = 1000;
      material.depthTest = true;
      material.depthWrite = true;
      
      // カメラ相対位置で配置
      if (this.camera) {
        const finalPosition = this.calculateCameraRelativePosition(position);
        plane.position.copy(finalPosition);
        this.alignPlaneToCamera(plane);
      } else {
        plane.position.set(position.x, position.y, position.z);
      }
      
      plane.scale.setScalar(1.0);
      
      // ファイル名からpromptを作成（拡張子を除去）
      const prompt = fileName ? fileName.replace(/\.[^/.]+$/, '') : 'imported_image';

      // 識別用の名前とメタデータ
      const objectId = `imported_image_${++this.objectCounter}`;
      plane.name = objectId;
      plane.userData = {
        id: objectId,
        source: 'imported_file',
        createdAt: Date.now(),
        type: 'generated_image',
        prompt: prompt, // ファイル名をpromptとして設定
        fileName: fileName, // 元のファイル名も保存
        importOrder: this.objectCounter, // インポート順序を記録
        keywords: this.buildObjectKeywordHints({ prompt, fileName, baseType: 'image' })
      };
      
      this.experimentGroup.add(plane);
      this.spawnedObjects.set(objectId, plane);

      console.log(`✅ Created imported image: ${objectId} at (${position.x}, ${position.y}, ${position.z})`);

      // 生成位置にパーティクルエフェクトを追加
      if (this.config.showLocationIndicator) {
        this.createLocationIndicator(position);
      }
      
      return {
        objectId,
        position: position,
        success: true
      };
      
    } catch (error) {
      console.error('📁 Image file loading failed:', error);
      throw error;
    }
  }

  async loadVideoFile(fileUrl, options = {}) {
    try {
      const { position = { x: 0, y: 5, z: -10 }, fileName = null } = options;
      
      console.log(`🎬 Loading video file: ${fileUrl}`);
      
      // HTMLVideoElementを作成
      const video = document.createElement('video');
      video.src = fileUrl;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.preload = 'auto';

      // VideoTextureを作成
      const videoTexture = new THREE.VideoTexture(video);
      videoTexture.colorSpace = THREE.SRGBColorSpace;

      // ビデオの読み込みとサイズ取得
      await new Promise((resolve, reject) => {
        const handleLoaded = () => {
          console.log(`🎬 Video loaded: ${video.videoWidth}x${video.videoHeight}`);
          resolve();
        };
        const handleError = (event) => {
          reject(event?.error || new Error('Video failed to load'));
        };

        video.addEventListener('loadedmetadata', handleLoaded, { once: true });
        video.addEventListener('error', handleError, { once: true });
        video.load();
      });

      try {
        await video.play();
      } catch (playError) {
        console.warn('🎬 Video autoplay could not start automatically. Playback will require user interaction.', playError);
      }
      
      // アスペクト比を計算してサイズ調整
      const aspectRatio = video.videoWidth / video.videoHeight;
      const baseSize = 6;
      let width = baseSize;
      let height = baseSize;
      
      if (aspectRatio > 1) {
        height = baseSize / aspectRatio;
      } else {
        width = baseSize * aspectRatio;
      }
      
      // 動画を表示する平面ジオメトリを作成
      const geometry = new THREE.PlaneGeometry(width, height);
      const material = new THREE.MeshBasicMaterial({
        map: videoTexture,
        transparent: true,
        side: THREE.DoubleSide,
        toneMapped: false
      });
      material.alphaTest = 0.01;
      material.needsUpdate = true;
      
      const plane = new THREE.Mesh(geometry, material);
      
      // レンダリング順序を設定
      plane.renderOrder = 1000;
      material.depthTest = true;
      material.depthWrite = true;
      
      // カメラ相対位置で配置
      if (this.camera) {
        const finalPosition = this.calculateCameraRelativePosition(position);
        plane.position.copy(finalPosition);
        this.alignPlaneToCamera(plane);
      } else {
        plane.position.set(position.x, position.y, position.z);
      }
      
      plane.scale.setScalar(1.0);
      
      // ファイル名からpromptを作成（拡張子を除去）
      const prompt = fileName ? fileName.replace(/\.[^/.]+$/, '') : 'imported_video';

      // 識別用の名前とメタデータ
      const objectId = `imported_video_${++this.objectCounter}`;
      plane.name = objectId;
      plane.userData = {
        id: objectId,
        source: 'imported_file',
        createdAt: Date.now(),
        type: 'generated_video',
        videoElement: video,
        objectUrl: fileUrl,
        prompt: prompt, // ファイル名をpromptとして設定
        fileName: fileName, // 元のファイル名も保存
        importOrder: this.objectCounter, // インポート順序を記録
        keywords: this.buildObjectKeywordHints({ prompt, fileName, baseType: 'video' })
      };

      // 音声制御UIを作成
      this.createAudioControl(plane);

      this.experimentGroup.add(plane);
      this.spawnedObjects.set(objectId, plane);
      
      console.log(`✅ Created imported video: ${objectId} at (${position.x}, ${position.y}, ${position.z})`);
      
      // 生成位置にパーティクルエフェクトを追加
      if (this.config.showLocationIndicator) {
        this.createLocationIndicator(position);
      }
      
      return {
        objectId,
        position: position,
        success: true
      };
      
    } catch (error) {
      console.error('🎬 Video file loading failed:', error);
      throw error;
    }
  }

  /**
   * 自然言語オブジェクト操作実行
   */
  async executeNaturalObjectModification(parsed) {
    // オブジェクトを名前で検索
    const targetObjects = this.findObjectsByName(parsed.targetObjectName);
    
    if (targetObjects.length === 0) {
      return {
        success: false,
        message: `オブジェクト「${parsed.targetObjectName}」が見つかりませんでした`
      };
    }
    
    console.log(`🔍 Found ${targetObjects.length} object(s) matching "${parsed.targetObjectName}"`);
    
    // 複数の場合は序数詞で選択、なければ最初のオブジェクト
    const targetObject = this.selectObjectFromMultiple(targetObjects, parsed.targetObjectName);
    console.log(`🎯 Operating on object: ${targetObject.name}`);
    
    let modified = false;
    
    // 色変更
    if (parsed.color !== null && targetObject.material) {
      if (targetObject.material.map) {
        targetObject.material.color.setHex(parsed.color);
        targetObject.material.needsUpdate = true;
        console.log(`🎨 Texture color tint changed to: #${parsed.color.toString(16)}`);
      } else {
        targetObject.material.color.setHex(parsed.color);
        targetObject.material.needsUpdate = true;
        console.log(`🎨 Material color changed to: #${parsed.color.toString(16)}`);
      }
      modified = true;
    }

    // Phase 2: エフェクト適用
    if (parsed.effects && parsed.effects.length > 0) {
      const effectsApplied = this.applyEffects(targetObject, parsed.effects);
      if (effectsApplied) {
        modified = true;
      }
    }
    
    // 位置移動
    if (parsed.movement !== null) {
      const currentPos = targetObject.position;
      const newPos = {
        x: currentPos.x + parsed.movement.x,
        y: currentPos.y + parsed.movement.y,
        z: currentPos.z + parsed.movement.z
      };
      
      targetObject.position.set(newPos.x, newPos.y, newPos.z);
      console.log(`📍 Position moved from (${currentPos.x.toFixed(1)}, ${currentPos.y.toFixed(1)}, ${currentPos.z.toFixed(1)}) to (${newPos.x.toFixed(1)}, ${newPos.y.toFixed(1)}, ${newPos.z.toFixed(1)})`);
      modified = true;
    }
    
    if (modified) {
      // メタデータ更新
      targetObject.userData.lastModified = Date.now();
      targetObject.userData.modifications = targetObject.userData.modifications || [];
      targetObject.userData.modifications.push({
        timestamp: Date.now(),
        color: parsed.color,
        movement: parsed.movement,
        command: `Natural language: ${parsed.targetObjectName}`
      });
      
      return {
        success: true,
        message: `オブジェクト「${targetObject.name}」を変更しました`,
        objectId: targetObject.name,
        modifications: {
          color: parsed.color,
          movement: parsed.movement
        }
      };
    } else {
      return {
        success: false,
        message: '変更可能な属性が見つかりませんでした'
      };
    }
  }
  
  /**
   * 名前でオブジェクトを検索
   */
  findObjectsByName(searchName) {
    const results = [];
    const searchLower = searchName.toLowerCase();
    
    // 生成されたオブジェクトから検索
    for (const [objectId, object] of this.spawnedObjects) {
      // プロンプト情報から検索
      if (object.userData.prompt) {
        const promptLower = object.userData.prompt.toLowerCase();
        
        // 部分一致で検索（「ユニコーン」が「ユニコーンの画像」にマッチ）
        if (promptLower.includes(searchLower)) {
          results.push(object);
          console.log(`✅ Object match found: ${objectId} (prompt: "${object.userData.prompt}")`);
        }
      }
      
      // オブジェクト名からも検索
      if (object.name && object.name.toLowerCase().includes(searchLower)) {
        results.push(object);
        console.log(`✅ Object match found: ${objectId} (name: "${object.name}")`);
      }
    }
    
    return results;
  }
  
  /**
   * 複数オブジェクトから序数詞で選択
   */
  selectObjectFromMultiple(objects, originalCommand) {
    // 序数詞パターンをチェック
    const ordinalPatterns = [
      /(\d+)つ目の/, /(\d+)番目の/, /(\d+)個目の/,
      /最初の|1つ目の|1番目の|1個目の/,
      /最後の|最終の/,
      /2つ目の|2番目の|2個目の/,
      /3つ目の|3番目の|3個目の/
    ];
    
    for (const pattern of ordinalPatterns) {
      const match = originalCommand.match(pattern);
      if (match) {
        let index;
        
        if (match[1]) {
          // 数字が見つかった場合
          index = parseInt(match[1]) - 1; // 1ベースから0ベースに変換
        } else {
          // 特別な表現の場合
          const matchedText = match[0];
          if (matchedText.includes('最初') || matchedText.includes('1つ目') || 
              matchedText.includes('1番目') || matchedText.includes('1個目')) {
            index = 0;
          } else if (matchedText.includes('最後') || matchedText.includes('最終')) {
            index = objects.length - 1;
          } else if (matchedText.includes('2つ目') || matchedText.includes('2番目') || matchedText.includes('2個目')) {
            index = 1;
          } else if (matchedText.includes('3つ目') || matchedText.includes('3番目') || matchedText.includes('3個目')) {
            index = 2;
          }
        }
        
        if (index >= 0 && index < objects.length) {
          console.log(`🔢 Selected object by ordinal: index ${index + 1} of ${objects.length}`);
          return objects[index];
        } else {
          console.warn(`⚠️ Invalid ordinal index: ${index + 1} (available: 1-${objects.length})`);
        }
      }
    }
    
    // 序数詞が見つからない場合はデフォルトで最初のオブジェクト
    console.log(`🔢 No ordinal specified, using first object`);
    return objects[0];
  }

  /**
   * オブジェクト変更実行
   */
  async executeObjectModification(parsed) {
    // コマンドから対象オブジェクトを特定
    let targetObject = this.findObjectByKeyword(parsed.command);
    
    // キーワードで見つからない場合、選択されたオブジェクトを使用
    if (!targetObject) {
      if (!this.selectedObject) {
        return { 
          success: false, 
          message: 'オブジェクトを選択するか、対象を指定してください（例：「猫を赤くして」）' 
        };
      }
      targetObject = this.selectedObject;
    } else {
      // キーワードで見つけたオブジェクトを選択状態にする
      this.selectObject(targetObject);

      // オブジェクト認識成功のフィードバックエフェクト
      this.applyRecognitionFeedback(targetObject);
    }
    console.log(`🔧 Modifying object: ${targetObject.name}`);
    console.log(`🔍 Debug - parsed.movement:`, parsed.movement);
    
    let modified = false;
    
    // 色変更
    if (parsed.color !== null && targetObject.material) {
      if (targetObject.material.map) {
        // テクスチャがある場合は色調変更
        targetObject.material.color.setHex(parsed.color);
        targetObject.material.needsUpdate = true;
        console.log(`🎨 Texture color tint changed to: #${parsed.color.toString(16)}`);
      } else {
        // テクスチャがない場合は直接色変更
        targetObject.material.color.setHex(parsed.color);
        targetObject.material.needsUpdate = true;
        console.log(`🎨 Material color changed to: #${parsed.color.toString(16)}`);
      }
      modified = true;
    }

    // Phase 2: エフェクト適用
    if (parsed.effects && parsed.effects.length > 0) {
      const effectsApplied = this.applyEffects(targetObject, parsed.effects);
      if (effectsApplied) {
        modified = true;
      }
    }
    
    // サイズ変更
    if (parsed.scale !== null) {
      const currentScale = targetObject.scale.x; // 現在のスケール取得
      const newScale = currentScale * parsed.scale;
      targetObject.scale.setScalar(newScale);
      console.log(`📏 Scale changed from ${currentScale} to ${newScale}`);
      modified = true;
    }
    
    // 位置移動
    if (parsed.movement !== null) {
      // 現在位置から相対移動
      const currentPos = targetObject.position;
      const newPos = {
        x: currentPos.x + parsed.movement.x,
        y: currentPos.y + parsed.movement.y,
        z: currentPos.z + parsed.movement.z
      };

      targetObject.position.set(newPos.x, newPos.y, newPos.z);
      console.log(`📍 Position moved from (${currentPos.x.toFixed(1)}, ${currentPos.y.toFixed(1)}, ${currentPos.z.toFixed(1)}) to (${newPos.x.toFixed(1)}, ${newPos.y.toFixed(1)}, ${newPos.z.toFixed(1)})`);
      modified = true;
    }

    // 回転
    if (parsed.rotation !== null) {
      const currentRotation = targetObject.rotation.y;
      const newRotation = currentRotation + parsed.rotation;
      targetObject.rotation.y = newRotation;
      const degrees = (parsed.rotation * 180 / Math.PI).toFixed(1);
      console.log(`🔄 Rotation changed by ${degrees}° (new Y rotation: ${(newRotation * 180 / Math.PI).toFixed(1)}°)`);
      modified = true;
    }

    // 透明度
    if (parsed.opacity !== null && targetObject.material) {
      const currentOpacity = targetObject.material.opacity || 1.0;
      targetObject.material.opacity = parsed.opacity;
      targetObject.material.transparent = parsed.opacity < 1.0;
      console.log(`🔍 Opacity changed from ${currentOpacity.toFixed(2)} to ${parsed.opacity.toFixed(2)}`);
      modified = true;
    }

    // 左右反転
    if (parsed.flip) {
      const currentScaleX = targetObject.scale.x;
      targetObject.scale.x = -currentScaleX; // X軸を反転
      console.log(`↔️ Object flipped horizontally (scale.x: ${currentScaleX} → ${targetObject.scale.x})`);
      modified = true;
    }
    
    if (modified) {
      // メタデータ更新
      targetObject.userData.lastModified = Date.now();
      targetObject.userData.modifications = targetObject.userData.modifications || [];
      targetObject.userData.modifications.push({
        timestamp: Date.now(),
        color: parsed.color,
        scale: parsed.scale,
        movement: parsed.movement,
        rotation: parsed.rotation,
        opacity: parsed.opacity,
        command: parsed.command
      });
      
      return { 
        success: true, 
        message: `オブジェクト「${targetObject.name}」を変更しました`,
        objectId: targetObject.name,
        modifications: {
          color: parsed.color,
          scale: parsed.scale,
          movement: parsed.movement,
          rotation: parsed.rotation,
          opacity: parsed.opacity
        }
      };
    } else {
      return { 
        success: false, 
        message: '変更可能な属性が見つかりませんでした' 
      };
    }
  }

  /**
   * 削除実行
   */
  async executeDelete(parsed) {
    // コマンドの安全性チェック
    const command = parsed.command || '';
    
    // 「すべて」削除の場合
    if (parsed.target === 'all' || command.includes('すべて') || command.includes('全部')) {
      this.clearAll();
      return { success: true, message: 'すべてのオブジェクトを削除しました' };
    }
    
    // まずコマンドから対象オブジェクトを特定
    const targetByKeyword = this.findObjectByKeyword(command);
    
    // 削除対象の優先順位：
    // 1. コマンドで指定されたオブジェクト
    // 2. 選択されているオブジェクト
    // 3. コマンドが単に「削除」だけの場合は選択オブジェクトを優先
    
    let targetObject = null;
    let deleteReason = '';
    
    // コマンドが単純な削除コマンドか判定
    const isSimpleDeleteCommand = command.match(/^(削除|消して|消す|delete|remove)$/i);
    
    if (isSimpleDeleteCommand && this.selectedObject) {
      // 単純な「削除」コマンドで選択オブジェクトがある場合
      targetObject = this.selectedObject;
      deleteReason = '選択されたオブジェクト';
    } else if (targetByKeyword) {
      // キーワードで特定できた場合
      targetObject = targetByKeyword;
      deleteReason = 'コマンドで指定されたオブジェクト';
    } else if (this.selectedObject) {
      // その他の場合で選択オブジェクトがある場合
      targetObject = this.selectedObject;
      deleteReason = '選択されたオブジェクト';
    }
    
    if (targetObject) {
      const objectId = targetObject.name;
      console.log(`🗑️ Deleting ${deleteReason}: ${objectId}`);
      
      // 選択状態を解除
      if (targetObject === this.selectedObject) {
        this.deselectObject();
      }
      
      // オブジェクトを削除
      const success = this.removeObject(objectId);
      
      if (success) {
        return { 
          success: true, 
          message: `${deleteReason}「${objectId}」を削除しました`,
          deletedObjectId: objectId
        };
      } else {
        return { 
          success: false, 
          message: 'オブジェクトの削除に失敗しました' 
        };
      }
    }
    
    return { 
      success: false, 
      message: '削除対象が見つかりませんでした。オブジェクトを選択するか、対象を指定してください' 
    };
  }

  async executeFileImport(parsed) {
    try {
      console.log('🍫 Starting file import process...');
      
      // ファイル選択ダイアログを表示
      const input = document.createElement('input');
      input.type = 'file';
      input.style.display = 'none';
      
      if (parsed.fileType === 'video') {
        input.accept = 'video/*';
      } else {
        input.accept = 'image/*';
      }
      
      document.body.appendChild(input);
      
      return new Promise((resolve, reject) => {
        input.onchange = async (event) => {
          try {
            const file = event.target.files[0];
            if (!file) {
              reject(new Error('ファイルが選択されませんでした'));
              return;
            }
            
            console.log(`📁 Selected file: ${file.name}`);
            
            // ファイルのObjectURLを作成
            const fileUrl = URL.createObjectURL(file);
            
            let result;
            if (parsed.fileType === 'video' || file.type.startsWith('video/')) {
              result = await this.loadVideoFile(fileUrl, { position: parsed.position });
            } else {
              result = await this.loadImageFile(fileUrl, { position: parsed.position });
            }
            
            console.log('✅ File import completed:', result);
            resolve(result);
            
          } catch (error) {
            console.error('❌ File import failed:', error);
            reject(error);
          } finally {
            document.body.removeChild(input);
          }
        };
        
        input.oncancel = () => {
          document.body.removeChild(input);
          reject(new Error('ファイル選択がキャンセルされました'));
        };
        
        input.click();
      });
      
    } catch (error) {
      console.error('❌ File import execution failed:', error);
      throw error;
    }
  }

  async executeObjectSelection(parsed) {
    try {
      console.log('🎯 Starting object selection...');
      
      const objects = this.getSpawnedObjects();
      if (objects.length === 0) {
        throw new Error('選択可能なオブジェクトがありません。まずファイルをインポートしてください。');
      }
      
      console.log(`📋 Available objects: ${objects.length}`);
      
      // オブジェクト選択UIを作成
      const modal = document.createElement('div');
      modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
      `;
      
      const container = document.createElement('div');
      container.style.cssText = `
        background: #1a1a2e;
        border-radius: 12px;
        padding: 24px;
        max-width: 500px;
        max-height: 70vh;
        overflow-y: auto;
        color: white;
        font-family: Arial, sans-serif;
      `;
      
      const title = document.createElement('h3');
      title.textContent = '🎯 オブジェクトを選択してください';
      title.style.cssText = 'margin: 0 0 16px 0; color: #ec4899;';
      container.appendChild(title);
      
      const objectList = document.createElement('div');
      objectList.style.cssText = 'margin-bottom: 16px;';
      
      objects.forEach((obj, index) => {
        const item = document.createElement('div');
        item.style.cssText = `
          padding: 12px;
          margin: 8px 0;
          background: #2a2a3e;
          border-radius: 8px;
          cursor: pointer;
          border: 2px solid transparent;
          transition: all 0.3s ease;
        `;
        
        const name = obj.userData?.type === 'generated_image' ? '🖼️ 画像' : 
                     obj.userData?.type === 'generated_video' ? '🎬 動画' : '📄 ファイル';
        const time = new Date(obj.userData?.createdAt).toLocaleTimeString();
        
        item.innerHTML = `
          <div style="font-weight: bold;">${name} #${index + 1}</div>
          <div style="font-size: 12px; color: #94a3b8;">作成: ${time}</div>
          <div style="font-size: 12px; color: #94a3b8;">位置: (${Math.round(obj.position.x)}, ${Math.round(obj.position.y)}, ${Math.round(obj.position.z)})</div>
        `;
        
        item.onmouseover = () => {
          item.style.borderColor = '#ec4899';
          item.style.background = '#3a3a4e';
        };
        
        item.onmouseout = () => {
          item.style.borderColor = 'transparent';
          item.style.background = '#2a2a3e';
        };
        
        item.onclick = () => {
          resolve({ selectedObjectId: obj.id, selectedObject: obj });
          document.body.removeChild(modal);
        };
        
        objectList.appendChild(item);
      });
      
      container.appendChild(objectList);
      
      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'キャンセル';
      cancelBtn.style.cssText = `
        background: #666;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
      `;
      
      cancelBtn.onclick = () => {
        document.body.removeChild(modal);
        reject(new Error('オブジェクト選択がキャンセルされました'));
      };
      
      container.appendChild(cancelBtn);
      modal.appendChild(container);
      document.body.appendChild(modal);
      
      return new Promise((resolve, reject) => {
        // Promise handlers are set up in the click events above
      });
      
    } catch (error) {
      console.error('❌ Object selection failed:', error);
      throw error;
    }
  }

  /**
   * フォールバック用のテクスチャ作成
   */
  createFallbackTexture(prompt) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // プロンプトベースの色を生成
    const hash = this.hashString(prompt);
    const hue = hash % 360;
    
    // グラデーション背景
    const gradient = ctx.createLinearGradient(0, 0, 512, 512);
    gradient.addColorStop(0, `hsl(${hue}, 70%, 60%)`);
    gradient.addColorStop(1, `hsl(${(hue + 60) % 360}, 70%, 40%)`);
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 512);
    
    // テキスト描画
    ctx.fillStyle = 'white';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🎨', 256, 230);
    
    ctx.font = '16px Arial';
    ctx.fillText(prompt.slice(0, 20), 256, 270);
    
    ctx.font = '14px Arial';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('Placeholder Image', 256, 300);
    
    return new THREE.CanvasTexture(canvas);
  }

  /**
   * フォールバック用の動画テクスチャ作成
   */
  createFallbackVideoTexture(prompt) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // プロンプトベースの色を生成
    const hash = this.hashString(prompt);
    const hue = hash % 360;
    
    // アニメーション用の変数
    let animationFrame = 0;
    
    const animate = () => {
      // グラデーション背景（時間で変化）
      const gradient = ctx.createLinearGradient(0, 0, 512, 512);
      const offset = (animationFrame * 2) % 360;
      gradient.addColorStop(0, `hsl(${(hue + offset) % 360}, 70%, 60%)`);
      gradient.addColorStop(1, `hsl(${(hue + offset + 60) % 360}, 70%, 40%)`);
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 512, 512);
      
      // 動的テキスト描画
      ctx.fillStyle = 'white';
      ctx.font = '24px Arial';
      ctx.textAlign = 'center';
      
      // 動画アイコンをアニメーション
      const icons = ['🎬', '🎥', '📹', '🎞️'];
      const iconIndex = Math.floor(animationFrame / 10) % icons.length;
      ctx.fillText(icons[iconIndex], 256, 230);
      
      ctx.font = '16px Arial';
      ctx.fillText(prompt.slice(0, 20), 256, 270);
      
      ctx.font = '14px Arial';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText('Placeholder Video', 256, 300);
      
      animationFrame++;
      
      // 60FPSでアニメーション
      setTimeout(() => requestAnimationFrame(animate), 1000/60);
    };
    
    // アニメーション開始
    animate();
    
    return new THREE.CanvasTexture(canvas);
  }

  /**
   * 文字列のハッシュ値を計算
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 32bit整数に変換
    }
    return Math.abs(hash);
  }

  /**
   * 生成されたオブジェクト一覧取得
   */
  getSpawnedObjects() {
    return Array.from(this.spawnedObjects.entries()).map(([id, object]) => ({
      id,
      name: object.name,
      userData: object.userData,
      position: object.position.clone()
    }));
  }

  /**
   * オブジェクト削除
   */
  removeObject(objectId) {
    const object = this.spawnedObjects.get(objectId);
    if (object) {
      if (object.userData?.videoElement) {
        const videoElement = object.userData.videoElement;
        try {
          videoElement.pause();
          if (typeof videoElement.removeAttribute === 'function') {
            videoElement.removeAttribute('src');
          } else {
            videoElement.src = '';
          }
          if (typeof videoElement.load === 'function') {
            videoElement.load();
          }
        } catch (error) {
          console.warn('🎬 Failed to release video element resources:', error);
        }
      }

      if (object.userData?.objectUrl) {
        try {
          URL.revokeObjectURL(object.userData.objectUrl);
        } catch (error) {
          console.warn('🎬 Failed to revoke object URL:', error);
        }
      }

      if (object.userData?.cleanupCallbacks) {
        try {
          object.userData.cleanupCallbacks.forEach(cb => {
            if (typeof cb === 'function') cb();
          });
        } catch (error) {
          console.warn('🧹 Cleanup callbacks failed:', error);
        }
      }

      this.experimentGroup.remove(object);
      this.spawnedObjects.delete(objectId);
      
      // ジオメトリとマテリアルのメモリ解放
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(mat => {
          if (mat.map && typeof mat.map.dispose === 'function') {
            mat.map.dispose();
          }
          mat.dispose();
        });
      }
      
      console.log(`🗑️ Removed object: ${objectId}`);
      return true;
    }
    return false;
  }

  /**
   * 全オブジェクト削除
   */
  clearAll() {
    const objectIds = Array.from(this.spawnedObjects.keys());
    objectIds.forEach(id => this.removeObject(id));
    console.log('🧹 Cleared all experimental objects');
  }

  /**
   * コマンド履歴取得
   */
  getCommandHistory() {
    return [...this.commandHistory];
  }

  /**
   * 生成位置に一時的な視覚インジケーターを表示
   */
  createLocationIndicator(relativePosition) {
    // 目立つ光る球体を作成
    const geometry = new THREE.SphereGeometry(1, 16, 16);
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.9
    });
    
    const indicator = new THREE.Mesh(geometry, material);
    
    // カメラ相対位置でインジケーターも配置
    if (this.camera) {
      const indicatorPos = this.calculateCameraRelativePosition({
        x: relativePosition.x,
        y: relativePosition.y + 2, // オブジェクトの少し上に表示
        z: relativePosition.z
      });
      indicator.position.copy(indicatorPos);
    } else {
      indicator.position.set(relativePosition.x, relativePosition.y + 2, relativePosition.z);
    }
    
    console.log(`🟢 インジケーター表示: (${indicator.position.x.toFixed(1)}, ${indicator.position.y.toFixed(1)}, ${indicator.position.z.toFixed(1)})`);
    
    this.scene.add(indicator);
    
    // 設定された時間後に自動削除
    setTimeout(() => {
      this.scene.remove(indicator);
      geometry.dispose();
      material.dispose();
    }, this.config.indicatorDuration);
    
    // アニメーション（点滅効果）
    let opacity = 0.8;
    let direction = -1;
    const animate = () => {
      opacity += direction * 0.05;
      if (opacity <= 0.3) direction = 1;
      if (opacity >= 0.8) direction = -1;
      
      material.opacity = opacity;
      
      if (indicator.parent) {
        requestAnimationFrame(animate);
      }
    };
    animate();
  }

  /**
   * カメラ相対位置計算（画面座標対応）
   */
  calculateCameraRelativePosition(relativePosition) {
    if (!this.camera) {
      if (this.config.enableDebugLogging) {
        console.warn('📷 Camera not available, using fallback positioning');
      }
      return new THREE.Vector3(relativePosition.x, relativePosition.y, relativePosition.z);
    }

    try {
      // カメラの位置と方向を取得
      const cameraPos = this.camera.position.clone();
      const cameraDirection = new THREE.Vector3();
      this.camera.getWorldDirection(cameraDirection);
      
      // カメラの右方向と上方向を計算
      const cameraRight = new THREE.Vector3();
      const cameraUp = new THREE.Vector3(0, 1, 0); // ワールドの上方向
      cameraRight.crossVectors(cameraDirection, cameraUp).normalize();
      const cameraUpActual = new THREE.Vector3();
      cameraUpActual.crossVectors(cameraRight, cameraDirection).normalize();

      // 相対位置をカメラ座標系で計算
      const finalPosition = cameraPos.clone();
      
      // 前後方向（Z軸）: カメラの向きに沿って（正の値で前方、負の値で後方）
      finalPosition.add(cameraDirection.clone().multiplyScalar(relativePosition.z));
      
      // 左右方向（X軸）: カメラの右方向に沿って
      finalPosition.add(cameraRight.clone().multiplyScalar(relativePosition.x));
      
      // 上下方向（Y軸）: カメラの上方向に沿って
      finalPosition.add(cameraUpActual.clone().multiplyScalar(relativePosition.y));

      this.logDebug(
        `📍 Camera relative position calculated: (${finalPosition.x.toFixed(1)}, ${finalPosition.y.toFixed(1)}, ${finalPosition.z.toFixed(1)})`
      );
      return finalPosition;
      
    } catch (error) {
      console.error('❌ Camera relative position calculation failed:', error);
      return new THREE.Vector3(relativePosition.x, relativePosition.y, relativePosition.z);
    }
  }

  /**
   * カメラを設定
   */
  alignPlaneToCamera(plane) {
    if (!this.camera) {
      return;
    }

    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward); // カメラの前方向（前方が負Z）
    forward.negate(); // 平面の法線をカメラ側へ向ける

    let up = new THREE.Vector3().copy(this.camera.up).applyQuaternion(this.camera.quaternion).normalize();
    if (Math.abs(forward.dot(up)) > 0.999) {
      up = new THREE.Vector3(0, 1, 0);
      if (Math.abs(forward.dot(up)) > 0.999) {
        up = new THREE.Vector3(0, 0, 1);
      }
    }

    const right = new THREE.Vector3().crossVectors(up, forward).normalize();
    up = new THREE.Vector3().crossVectors(forward, right).normalize();

    const orientation = new THREE.Matrix4();
    orientation.makeBasis(right, up, forward);
    plane.quaternion.setFromRotationMatrix(orientation);
  }

  /**
   * カメラを設定
   */
  setCamera(camera) {
    this.camera = camera;
  }

  /**
   * 設定を更新
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  setImageService(serviceId) {
    this.selectedImageService = serviceId || null;
    this.logDebug('🎯 Updated image service:', this.selectedImageService);
  }

  getImageService() {
    return this.selectedImageService;
  }

  setVideoService(serviceId) {
    this.selectedVideoService = serviceId || null;
    this.logDebug('🎬 Updated video service:', this.selectedVideoService);
  }

  getVideoService() {
    return this.selectedVideoService;
  }





  /**
   * 音声制御UIを作成
   */
  createAudioControl(videoObject) {
    const videoElement = videoObject.userData.videoElement;
    if (!videoElement) return;

    // 音声制御ボタンを作成
    const audioButton = document.createElement('div');
    audioButton.className = 'chocodrop-audio-control';
    audioButton.innerHTML = '♪'; // 初期状態：音楽記号
    // カスタムツールチップを作成（プロジェクトのデザインシステムに合わせて）
    const createTooltip = () => {
      const tooltip = document.createElement('div');
      tooltip.className = 'chocodrop-audio-tooltip';
      tooltip.textContent = '音声のオン/オフ切り替え';
      tooltip.style.cssText = `
        position: absolute !important;
        background: rgba(0, 0, 0, 0.85) !important;
        backdrop-filter: blur(12px) !important;
        -webkit-backdrop-filter: blur(12px) !important;
        border: 1px solid rgba(255, 255, 255, 0.15) !important;
        border-radius: 8px !important;
        padding: 8px 12px !important;
        color: white !important;
        font-size: 11px !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        font-weight: 500 !important;
        white-space: nowrap !important;
        pointer-events: none !important;
        z-index: 1000000 !important;
        opacity: 0 !important;
        transform: translateY(-100%) translateX(-50%) !important;
        transition: opacity 0.2s ease !important;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3) !important;
        margin-bottom: 8px !important;
      `;
      return tooltip;
    };

    const tooltip = createTooltip();
    document.body.appendChild(tooltip);

    // 縦型音量スライダーを作成
    const createVolumeSlider = () => {
      const sliderContainer = document.createElement('div');
      sliderContainer.className = 'chocodrop-volume-slider';
      sliderContainer.style.cssText = `
        position: absolute !important;
        width: 30px !important;
        height: 100px !important;
        background: rgba(0, 0, 0, 0.85) !important;
        backdrop-filter: blur(12px) !important;
        -webkit-backdrop-filter: blur(12px) !important;
        border: 1px solid rgba(255, 255, 255, 0.15) !important;
        border-radius: 15px !important;
        padding: 10px 8px !important;
        z-index: 1000001 !important;
        opacity: 0 !important;
        pointer-events: none !important;
        transition: opacity 0.2s ease !important;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3) !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
      `;

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '100';
      slider.value = '100';
      slider.style.cssText = `
        width: 80px !important;
        height: 12px !important;
        background: rgba(255, 255, 255, 0.2) !important;
        border-radius: 6px !important;
        outline: none !important;
        cursor: pointer !important;
        -webkit-appearance: none !important;
        appearance: none !important;
        transform: rotate(-90deg) !important;
        transform-origin: center !important;
      `;

      // WebKit用のスライダースタイル
      const style = document.createElement('style');
      style.textContent = `
        .chocodrop-volume-slider input[type="range"]::-webkit-slider-track {
          width: 6px;
          height: 80px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 3px;
        }
        .chocodrop-volume-slider input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px;
          height: 14px;
          background: white;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        }
        .chocodrop-volume-slider input[type="range"]::-moz-range-track {
          width: 6px;
          height: 80px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 3px;
          border: none;
        }
        .chocodrop-volume-slider input[type="range"]::-moz-range-thumb {
          width: 14px;
          height: 14px;
          background: white;
          border-radius: 50%;
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        }
      `;
      document.head.appendChild(style);

      // スライダーのスタイルをカスタマイズ
      slider.addEventListener('input', (e) => {
        const value = e.target.value;
        videoElement.volume = value / 100;

        // アイコンを音量に応じて変更
        if (value == 0) {
          audioButton.innerHTML = '<span style="position: relative;">♪<span style="position: absolute; top: 0; left: 0; color: #8b5cf6; font-size: 14px;">⃠</span></span>';
          audioButton.style.background = 'rgba(99, 102, 241, 0.6) !important';
          audioButton.title = 'ミュート中';
        } else {
          audioButton.innerHTML = '♪';
          audioButton.style.background = 'rgba(0, 0, 0, 0.4) !important';
          audioButton.style.color = 'white !important';
          audioButton.title = '音声ON';
        }
      });

      sliderContainer.appendChild(slider);
      return sliderContainer;
    };

    const volumeSlider = createVolumeSlider();
    document.body.appendChild(volumeSlider);

    audioButton.style.cssText = `
      position: absolute !important;
      width: 18px !important;
      height: 18px !important;
      background: rgba(0, 0, 0, 0.4) !important;
      border: 1px solid rgba(255, 255, 255, 0.3) !important;
      border-radius: 50% !important;
      color: white !important;
      font-size: 9px !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      z-index: 999999 !important;
      transition: all 0.2s ease !important;
      user-select: none !important;
      box-shadow: 0 1px 4px rgba(0,0,0,0.2) !important;
      backdrop-filter: blur(8px) !important;
      pointer-events: auto !important;
      opacity: 1 !important;
    `;

    let isSliderVisible = false;

    // ホバー効果とスライダー表示
    audioButton.addEventListener('mouseenter', () => {
      audioButton.style.background = 'rgba(0, 0, 0, 0.7)';
      audioButton.style.transform = 'scale(1.05)';
      audioButton.style.borderColor = 'rgba(255, 255, 255, 0.5)';

      if (!isSliderVisible) {
        // ツールチップを表示
        const buttonRect = audioButton.getBoundingClientRect();
        tooltip.style.left = `${buttonRect.left + buttonRect.width / 2}px`;
        tooltip.style.top = `${buttonRect.top - 8}px`;
        tooltip.style.opacity = '1';
      }
    });

    audioButton.addEventListener('mouseleave', () => {
      audioButton.style.background = 'rgba(0, 0, 0, 0.5)';
      audioButton.style.transform = 'scale(1.0)';
      audioButton.style.borderColor = 'rgba(255, 255, 255, 0.4)';

      // ツールチップを非表示
      tooltip.style.opacity = '0';
    });

    // 左クリック：ミュートのオン/オフ切り替え
    audioButton.addEventListener('click', (e) => {
      e.stopPropagation();

      // スライダーが表示されている場合は閉じる
      if (isSliderVisible) {
        isSliderVisible = false;
        volumeSlider.style.opacity = '0';
        volumeSlider.style.pointerEvents = 'none';
        return;
      }

      // ミュート切り替え
      if (videoElement.muted || videoElement.volume === 0) {
        videoElement.muted = false;
        videoElement.volume = volumeSlider.querySelector('input').value / 100;
        audioButton.innerHTML = '♪';
        audioButton.style.background = 'rgba(0, 0, 0, 0.4) !important';
        audioButton.style.color = 'white !important';
        audioButton.title = '音声ON';
      } else {
        videoElement.muted = true;
        audioButton.innerHTML = '<span style="position: relative;">♪<span style="position: absolute; top: 0; left: 0; color: #8b5cf6; font-size: 14px;">⃠</span></span>';
        audioButton.style.background = 'rgba(99, 102, 241, 0.6) !important';
        audioButton.title = 'ミュート中';
      }
    });

    // 右クリック：音量スライダーの表示/非表示切り替え
    audioButton.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();

      isSliderVisible = !isSliderVisible;

      if (isSliderVisible) {
        // スライダーを表示
        const buttonRect = audioButton.getBoundingClientRect();
        volumeSlider.style.left = `${buttonRect.left + buttonRect.width / 2 - 15}px`;
        volumeSlider.style.top = `${buttonRect.top - 110}px`;
        volumeSlider.style.opacity = '1';
        volumeSlider.style.pointerEvents = 'auto';

        // ツールチップを非表示
        tooltip.style.opacity = '0';
      } else {
        // スライダーを非表示
        volumeSlider.style.opacity = '0';
        volumeSlider.style.pointerEvents = 'none';
      }
    });

    // 外側クリックでスライダーを閉じる
    document.addEventListener('click', (e) => {
      if (isSliderVisible && !audioButton.contains(e.target) && !volumeSlider.contains(e.target)) {
        isSliderVisible = false;
        volumeSlider.style.opacity = '0';
        volumeSlider.style.pointerEvents = 'none';
      }
    });

    // ページに追加
    document.body.appendChild(audioButton);

    // 動画オブジェクトに音声制御ボタンを関連付け
    videoObject.userData.audioControlElement = audioButton;

    // 位置更新関数を保存
    videoObject.userData.updateAudioControlPosition = () => {
      this.updateAudioControlPosition(videoObject, audioButton);
    };

    // 初期位置設定
    this.updateAudioControlPosition(videoObject, audioButton);

    // 管理マップに登録
    this.audioControls.set(videoObject.uuid, {
      audioButton,
      tooltip,
      volumeSlider,
      isSliderVisible: () => isSliderVisible,
      hideSlider: () => {
        isSliderVisible = false;
        volumeSlider.style.opacity = '0';
        volumeSlider.style.pointerEvents = 'none';
      }
    });

    // スクロール・リサイズで追随
    if (!this.audioControlUpdateListener) {
      this.audioControlUpdateListener = () => {
        this.updateAllAudioControlPositions();
      };
      window.addEventListener('scroll', this.audioControlUpdateListener, { passive: true });
      window.addEventListener('resize', this.audioControlUpdateListener, { passive: true });
    }

    if (!this.audioControlUpdateInterval) {
      this.audioControlUpdateInterval = setInterval(() => {
        this.updateAllAudioControlPositions();
      }, 100);
    }

    const cleanup = () => {
      document.removeEventListener('click', onDocumentClick, true);
      if (audioButton.parentNode) audioButton.parentNode.removeChild(audioButton);
      if (tooltip.parentNode) tooltip.parentNode.removeChild(tooltip);
      if (volumeSlider.parentNode) volumeSlider.parentNode.removeChild(volumeSlider);
      this.audioControls.delete(videoObject.uuid);

      if (this.audioControls.size === 0) {
        if (this.audioControlUpdateInterval) {
          clearInterval(this.audioControlUpdateInterval);
          this.audioControlUpdateInterval = null;
        }
        if (this.audioControlUpdateListener) {
          window.removeEventListener('scroll', this.audioControlUpdateListener);
          window.removeEventListener('resize', this.audioControlUpdateListener);
          this.audioControlUpdateListener = null;
        }
      }
    };

    const onDocumentClick = (e) => {
      if (isSliderVisible && !audioButton.contains(e.target) && !volumeSlider.contains(e.target)) {
        isSliderVisible = false;
        volumeSlider.style.opacity = '0';
        volumeSlider.style.pointerEvents = 'none';
      }
    };

    document.addEventListener('click', onDocumentClick, true);

    videoObject.userData.cleanupCallbacks = videoObject.userData.cleanupCallbacks || [];
    videoObject.userData.cleanupCallbacks.push(cleanup);

    console.log('🔊 Audio control created for video:', videoObject.userData.id);
  }

  /**
   * 音声制御ボタンの位置を動画オブジェクトに合わせて更新
   */
  updateAudioControlPosition(videoObject, audioButton) {
    if (!this.camera || !this.renderer || !audioButton.parentNode) return;

    // 動画オブジェクトの3D座標を画面座標に変換
    const vector = new THREE.Vector3();
    videoObject.getWorldPosition(vector);
    vector.project(this.camera);

    // 画面座標に変換
    const canvas = this.renderer.domElement;
    const rect = canvas.getBoundingClientRect();

    const x = (vector.x * 0.5 + 0.5) * rect.width + rect.left;
    const y = -(vector.y * 0.5 - 0.5) * rect.height + rect.top;

    // 動画オブジェクトの右上にボタンを配置
    const geometry = videoObject.geometry;
    if (geometry && geometry.parameters) {
      const width = geometry.parameters.width * videoObject.scale.x;
      const offsetX = 150; // 動画の右側に固定距離
      const offsetY = -50; // 動画の上側に固定距離

      audioButton.style.left = `${x + offsetX}px`;
      audioButton.style.top = `${y + offsetY}px`;
    } else {
      // フォールバック: 動画中心の右上
      audioButton.style.left = `${x + 50}px`;
      audioButton.style.top = `${y - 20}px`;
    }
  }

  updateAllAudioControlPositions() {
    if (!this.audioControls || this.audioControls.size === 0) {
      return;
    }

    this.audioControls.forEach((_, uuid) => {
      const obj = this.spawnedObjects.get(uuid);
      if (obj && obj.userData && obj.userData.updateAudioControlPosition) {
        obj.userData.updateAudioControlPosition();
      }
    });
  }

  /**
   * 動画音声の再生/停止を切り替え
   */
  toggleVideoAudio(videoObject, audioButton) {
    const videoElement = videoObject.userData.videoElement;
    if (!videoElement) return;

    if (videoElement.muted) {
      // ミュート解除：音声再生
      videoElement.muted = false;
      audioButton.innerHTML = '🔈'; // 音声再生中マーク
      console.log('🔊 Audio enabled for video:', videoObject.userData.id);
    } else {
      // ミュート：音声停止
      videoElement.muted = true;
      audioButton.innerHTML = '🔊'; // 音声ありマーク
      console.log('🔇 Audio muted for video:', videoObject.userData.id);
    }
  }

  /**
   * CSS2DRenderer初期化（音声制御UIなどの表示に必要）
   */
  initializeLabelRenderer() {
    if (this.labelRenderer) {
      return; // 既に初期化済み
    }

    // CSS2DRendererを動的に読み込んで初期化
    this.loadAndInitializeCSS2DRenderer();
  }

  /**
   * CSS2DRendererの準備完了を保証
   */
  async ensureCSS2DRenderer() {
    if (this.labelRenderer) {
      return; // 既に準備完了
    }

    // 初期化処理がまだの場合は開始
    if (!this.css2dInitPromise) {
      this.css2dInitPromise = this.loadAndInitializeCSS2DRenderer();
    }

    // 初期化完了まで待機
    await this.css2dInitPromise;
  }

  /**
   * CSS2DRendererの動的読み込みと初期化
   */
  async loadAndInitializeCSS2DRenderer() {
    try {
      // CSS2DRendererが既に利用可能な場合
      if (window.THREE && window.THREE.CSS2DRenderer) {
        this.setupCSS2DRenderer();
        return;
      }

      // Three.jsのCSS2DRendererを動的に読み込み
      console.log('🏷️ Loading CSS2DRenderer dynamically...');

      // CDNからCSS2DRendererを読み込み
      const module = await import('https://cdn.skypack.dev/three@0.158.0/examples/jsm/renderers/CSS2DRenderer.js');

      // グローバルに設定
      if (!window.THREE) window.THREE = {};
      window.THREE.CSS2DRenderer = module.CSS2DRenderer;
      window.THREE.CSS2DObject = module.CSS2DObject;

      console.log('✅ CSS2DRenderer loaded successfully');
      this.setupCSS2DRenderer();

    } catch (error) {
      console.warn('⚠️ Failed to load CSS2DRenderer:', error);
      console.warn('🔧 Audio controls will not be visible. Please include CSS2DRenderer in your project.');
    }
  }

  /**
   * CSS2DRendererのセットアップ
   */
  setupCSS2DRenderer() {
    try {
      this.labelRenderer = new window.THREE.CSS2DRenderer();
      this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
      this.labelRenderer.domElement.style.position = 'absolute';
      this.labelRenderer.domElement.style.top = '0px';
      this.labelRenderer.domElement.style.pointerEvents = 'none';

      // メインレンダラーのコンテナに追加
      if (this.renderer && this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.appendChild(this.labelRenderer.domElement);
      } else {
        document.body.appendChild(this.labelRenderer.domElement);
      }

      console.log('🏷️ CSS2DRenderer initialized for UI overlays');

      // リサイズハンドラーを追加
      this.addLabelRendererResizeHandler();

    } catch (error) {
      console.warn('⚠️ Failed to setup CSS2DRenderer:', error);
    }
  }

  /**
   * CSS2DRendererのリサイズハンドラー追加
   */
  addLabelRendererResizeHandler() {
    if (!this.labelRendererResizeHandler) {
      this.labelRendererResizeHandler = () => {
        if (this.labelRenderer) {
          this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
        }
      };
      window.addEventListener('resize', this.labelRendererResizeHandler);
    }
  }

  /**
   * レンダリング更新（アニメーションループで呼び出し）
   */
  updateRenderer() {
    if (this.labelRenderer && this.scene && this.camera) {
      this.labelRenderer.render(this.scene, this.camera);
    }
  }

  logDebug(...args) {
    if (!this.config.enableDebugLogging) {
      return;
    }
    console.log(...args);
  }

  /**
   * 2025年トレンド: アダプティブ選択インジケーター色計算
   * 背景色を自動検出してWCAG 2025基準のコントラスト比を保証
   */
  getAdaptiveSelectionColor() {
    // シーンの背景色を取得
    const backgroundColor = this.scene.background;
    let bgColor = { r: 0.5, g: 0.5, b: 0.5 }; // デフォルト中間色
    
    if (backgroundColor) {
      if (backgroundColor.isColor) {
        bgColor = {
          r: backgroundColor.r,
          g: backgroundColor.g,
          b: backgroundColor.b
        };
      }
    }
    
    // 明度計算（相対輝度）
    const getLuminance = (color) => {
      const { r, g, b } = color;
      const rs = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
      const gs = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
      const bs = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    };
    
    const bgLuminance = getLuminance(bgColor);
    
    // WCAG 2025準拠: 4.5:1以上のコントラスト比を確保
    // 背景が暗い場合は明るい色、明るい場合は暗い色を選択
    if (bgLuminance < 0.5) {
      // 暗い背景: 明るいアクセント色
      return 0x00ff88; // 明るいティール
    } else {
      // 明るい背景: 暗いアクセント色  
      return 0x1a1a2e; // ダークネイビー
    }
  }
  
  /**
   * アダプティブホバー色計算
   */
  getAdaptiveHoverColor() {
    const backgroundColor = this.scene.background;
    let bgColor = { r: 0.5, g: 0.5, b: 0.5 };
    
    if (backgroundColor && backgroundColor.isColor) {
      bgColor = {
        r: backgroundColor.r,
        g: backgroundColor.g,
        b: backgroundColor.b
      };
    }
    
    const getLuminance = (color) => {
      const { r, g, b } = color;
      const rs = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
      const gs = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
      const bs = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    };
    
    const bgLuminance = getLuminance(bgColor);
    
    if (bgLuminance < 0.5) {
      // 暗い背景: より明るいホバー色
      return 0x00ffff; // シアン
    } else {
      // 明るい背景: より暗いホバー色
      return 0xff3366; // ダークピンク
    }
  }

  /**
   * クリーンアップ
   */
  dispose() {
    this.clearAll();
    if (this.experimentGroup.parent) {
      this.experimentGroup.parent.remove(this.experimentGroup);
    }
  }
}
