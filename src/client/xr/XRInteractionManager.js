import * as THREEModule from 'three';

const THREE = globalThis.THREE || THREEModule;

export class XRInteractionManager {
  constructor(options = {}) {
    this.renderer = options.renderer ?? null;
    this.scene = options.scene ?? null;
    this.sceneManager = options.sceneManager ?? null;
    this.log = options.log ?? console;

    this.session = null;
    this.mode = null;
    this.hitTestSource = null;
    this.referenceSpace = null;
    this.viewerSpace = null;
    this.controllerBindings = [];
    this.reticle = null;
    this.frameHandle = null;
    this.lastHitPose = null;

    this.tempMatrix = new THREE.Matrix4();
    this.tempDirection = new THREE.Vector3();
    this.tempOrigin = new THREE.Vector3();
    this.raycaster = new THREE.Raycaster();
  }

  async attachSession(session, { mode } = {}) {
    if (!session) return;
    this.detachSession();
    this.session = session;
    this.mode = mode ?? null;
    this._bindControllers();

    if (this.mode === 'immersive-ar') {
      await this._setupHitTest(session);
      this._ensureReticle();
      this.sceneManager?.setXRAnchorSupport(Boolean(this.hitTestSource));
    } else {
      this.sceneManager?.setXRAnchorSupport(false);
    }

    this._startFrameLoop();
  }

  detachSession() {
    this._stopFrameLoop();
    this._unbindControllers();
    this._releaseHitTest();
    this._removeReticle();
    this.session = null;
    this.mode = null;
    this.lastHitPose = null;
  }

  _bindControllers() {
    if (!this.renderer?.xr) return;
    this._unbindControllers();
    const bindSource = source => {
      if (!source) return;
      const handlers = new Map();
      const map = {
        selectstart: event => this._handleSelectStart(event),
        selectend: event => this._handleSelectEnd(event),
        squeezestart: event => this._handleSqueeze(event),
        squeezeend: event => this._handleSqueezeEnd(event)
      };
      Object.entries(map).forEach(([type, handler]) => {
        const wrapped = handler.bind(this);
        source.addEventListener(type, wrapped);
        handlers.set(type, wrapped);
      });
      this.controllerBindings.push({ source, handlers });
    };

    for (let i = 0; i < 2; i += 1) {
      bindSource(this.renderer.xr.getController?.(i));
      bindSource(this.renderer.xr.getHand?.(i));
    }
  }

  _unbindControllers() {
    this.controllerBindings.forEach(binding => {
      binding.handlers.forEach((handler, type) => {
        binding.source.removeEventListener(type, handler);
      });
    });
    this.controllerBindings = [];
  }

  async _setupHitTest(session) {
    if (!session?.requestHitTestSource || !session?.requestReferenceSpace) {
      this.sceneManager?.setXRAnchorSupport(false);
      return;
    }
    try {
      this.referenceSpace = this.renderer?.xr?.getReferenceSpace?.() ?? await session.requestReferenceSpace('local-floor');
      this.viewerSpace = await session.requestReferenceSpace('viewer');
      this.hitTestSource = await session.requestHitTestSource({ space: this.viewerSpace });
      this.sceneManager?.setXRAnchorSupport(true);
    } catch (error) {
      this.log?.warn?.('XR hit-test setup failed', error);
      this.sceneManager?.setXRAnchorSupport(false);
      this.hitTestSource = null;
    }
  }

  _releaseHitTest() {
    if (this.hitTestSource?.cancel) {
      this.hitTestSource.cancel();
    }
    this.hitTestSource = null;
    this.referenceSpace = null;
    this.viewerSpace = null;
  }

  _startFrameLoop() {
    if (!this.session) return;
    const loop = (time, frame) => {
      this._updateFrame(frame);
      if (this.session) {
        this.frameHandle = this.session.requestAnimationFrame(loop);
      }
    };
    this.frameHandle = this.session.requestAnimationFrame(loop);
  }

  _stopFrameLoop() {
    if (this.session && this.frameHandle != null && typeof this.session.cancelAnimationFrame === 'function') {
      this.session.cancelAnimationFrame(this.frameHandle);
    }
    this.frameHandle = null;
  }

  _updateFrame(frame) {
    if (this.mode !== 'immersive-ar' || !frame || !this.hitTestSource || !this.referenceSpace) {
      return;
    }
    const hits = frame.getHitTestResults(this.hitTestSource);
    if (hits && hits.length > 0) {
      const pose = hits[0].getPose(this.referenceSpace);
      if (pose) {
        this._updateReticleFromPose(pose);
        this.lastHitPose = {
          position: new THREE.Vector3(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z),
          orientation: new THREE.Quaternion(
            pose.transform.orientation.x,
            pose.transform.orientation.y,
            pose.transform.orientation.z,
            pose.transform.orientation.w
          )
        };
      }
    } else if (this.reticle) {
      this.reticle.visible = false;
    }
  }

  _updateReticleFromPose(pose) {
    if (!this.reticle) return;
    this.reticle.visible = true;
    this.reticle.position.set(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
    this.reticle.quaternion.set(
      pose.transform.orientation.x,
      pose.transform.orientation.y,
      pose.transform.orientation.z,
      pose.transform.orientation.w
    );
  }

  _ensureReticle() {
    if (this.reticle || !this.scene) return;
    const ringGeom = new THREE.RingGeometry(0.12, 0.18, 48);
    ringGeom.rotateX(-Math.PI / 2);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeom, ringMaterial);

    const dotGeom = new THREE.CircleGeometry(0.02, 24);
    dotGeom.rotateX(-Math.PI / 2);
    const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    const dot = new THREE.Mesh(dotGeom, dotMaterial);
    dot.position.y = 0.001;

    const group = new THREE.Group();
    group.add(ring);
    group.add(dot);
    group.visible = false;

    this.scene.add(group);
    this.reticle = group;
  }

  _removeReticle() {
    if (this.reticle && this.scene) {
      this.scene.remove(this.reticle);
    }
    this.reticle = null;
  }

  _handleSelectStart(event) {
    if (this.mode === 'immersive-ar') {
      this._handleARSelect(event);
      return;
    }
    const object = this._pickSpawnedObject(event?.target);
    if (object) {
      this.sceneManager?.selectObject(object);
    }
  }

  _handleSelectEnd() {}

  _handleARSelect(event) {
    if (!this.sceneManager) return;
    const frame = event?.frame;
    let pose = null;
    if (frame && this.hitTestSource && this.referenceSpace) {
      const hits = frame.getHitTestResults(this.hitTestSource);
      if (hits?.length) {
        pose = hits[0].getPose(this.referenceSpace);
      }
    }
    if (!pose && this.lastHitPose) {
      pose = {
        transform: {
          position: this.lastHitPose.position,
          orientation: this.lastHitPose.orientation
        }
      };
    }
    if (!pose) {
      return;
    }

    const anchorPosition = new THREE.Vector3(
      pose.transform.position.x,
      pose.transform.position.y,
      pose.transform.position.z
    );
    const anchorOrientation = pose.transform.orientation.isQuaternion
      ? pose.transform.orientation.clone()
      : new THREE.Quaternion(
          pose.transform.orientation.x,
          pose.transform.orientation.y,
          pose.transform.orientation.z,
          pose.transform.orientation.w
        );

    this.sceneManager.setXRPlacementAnchor({
      position: anchorPosition,
      orientation: anchorOrientation
    });
  }

  _handleSqueeze(event) {
    if (!this.sceneManager?.selectedObject) return;
    const object = this.sceneManager.selectedObject;
    const handedness = event?.inputSource?.handedness ?? 'unknown';
    const scaleDelta = handedness === 'left' ? 0.9 : 1.1;
    const nextScale = THREE.MathUtils.clamp(object.scale.x * scaleDelta, 0.2, 5);
    object.scale.setScalar(nextScale);
    if (typeof this.sceneManager.showScaleToast === 'function') {
      this.sceneManager.showScaleToast(nextScale);
    }
    this.sceneManager.markObjectModified(object, {
      trigger: 'xr-squeeze',
      handedness
    });
  }

  _handleSqueezeEnd() {}

  _pickSpawnedObject(source) {
    if (!source || !this.sceneManager) return null;
    this.tempMatrix.identity().extractRotation(source.matrixWorld);
    this.tempDirection.set(0, 0, -1).applyMatrix4(this.tempMatrix).normalize();
    this.tempOrigin.setFromMatrixPosition(source.matrixWorld);
    this.raycaster.set(this.tempOrigin, this.tempDirection);

    const candidates = Array.from(this.sceneManager.spawnedObjects.values());
    const intersects = this.raycaster.intersectObjects(candidates, true);
    if (!intersects.length) return null;

    let target = intersects[0].object;
    while (target) {
      const objectId = target.userData?.id;
      if (objectId && this.sceneManager.spawnedObjects.has(objectId)) {
        return target;
      }
      target = target.parent;
    }
    return null;
  }
}

export default XRInteractionManager;
