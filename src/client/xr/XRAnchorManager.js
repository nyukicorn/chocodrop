// XRAnchorManager: lightweight helper for binding WebXR anchors to Three.js objects
// This class is intentionally framework-agnostic so we can consume it from SceneManager or
// other entrypoints without forcing WebXR availability during bundle evaluation.
import * as THREEModule from 'three';

const THREE = globalThis.THREE || THREEModule;

function generateAnchorId(prefix = 'xr-anchor') {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  const random = Math.floor(Math.random() * 1e6).toString(16);
  return `${prefix}-${Date.now().toString(16)}-${random}`;
}

function extractPoseTransform(pose) {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);

  if (pose?.transform?.matrix) {
    matrix.fromArray(pose.transform.matrix);
  } else if (pose?.transform) {
    const { position: pos, orientation } = pose.transform;
    if (pos && orientation) {
      matrix.compose(
        new THREE.Vector3(pos.x, pos.y, pos.z),
        new THREE.Quaternion(orientation.x, orientation.y, orientation.z, orientation.w),
        scale
      );
    }
  }

  matrix.decompose(position, quaternion, scale);

  return { matrix, position, quaternion };
}

export class XRAnchorManager {
  constructor(options = {}) {
    this.referenceSpace = options.referenceSpace || null;
    this.deviceProfile = options.deviceProfile || null;
    this.logger = options.logger || console;
    this.anchors = new Map();
  }

  setReferenceSpace(referenceSpace) {
    this.referenceSpace = referenceSpace;
  }

  setDeviceProfile(profile) {
    this.deviceProfile = profile;
  }

  async createAnchorFromHit(hitResult, options = {}) {
    if (!hitResult) {
      throw new Error('XRAnchorManager: hitResult is required');
    }
    const referenceSpace = options.referenceSpace || this.referenceSpace;
    if (!referenceSpace) {
      throw new Error('XRAnchorManager: referenceSpace is not set');
    }

    const pose = hitResult.getPose?.(referenceSpace);
    if (!pose) {
      throw new Error('XRAnchorManager: XRHitTestResult did not provide a pose for the current reference space');
    }

    let xrAnchor = null;
    if (typeof hitResult.createAnchor === 'function') {
      try {
        xrAnchor = await hitResult.createAnchor();
      } catch (error) {
        this.logger.warn('XRAnchorManager: createAnchor failed; falling back to pose-only anchor', error);
      }
    }

    return this._storeAnchor({ pose, xrAnchor, metadata: options.metadata || {} });
  }

  createAnchorFromPose(pose, options = {}) {
    if (!pose) {
      throw new Error('XRAnchorManager: pose is required');
    }
    return this._storeAnchor({ pose, metadata: options.metadata || {} });
  }

  attachObjectToAnchor(object3D, anchorId, attachOptions = {}) {
    const anchor = this.anchors.get(anchorId);
    if (!anchor) {
      throw new Error(`XRAnchorManager: anchor ${anchorId} not found`);
    }
    if (!object3D) {
      throw new Error('XRAnchorManager: object3D is required');
    }

    const options = {
      lockOrientation: false,
      followScale: false,
      ...attachOptions
    };

    anchor.attachedObjects.set(object3D, options);
    object3D.userData = {
      ...(object3D.userData || {}),
      anchorId,
      anchorMetadata: anchor.metadata || null
    };

    this._applyAnchorPoseToObject(anchor, object3D, options);
    return anchor;
  }

  detachObject(object3D) {
    if (!object3D?.userData?.anchorId) return;
    const anchor = this.anchors.get(object3D.userData.anchorId);
    if (anchor) {
      anchor.attachedObjects.delete(object3D);
    }
    delete object3D.userData.anchorId;
    delete object3D.userData.anchorMetadata;
  }

  updateAnchorsFromFrame(xrFrame, referenceSpace = this.referenceSpace) {
    if (!xrFrame || !referenceSpace) return;

    for (const anchorRecord of this.anchors.values()) {
      let pose = null;
      if (anchorRecord.xrAnchor?.anchorSpace) {
        pose = xrFrame.getPose(anchorRecord.xrAnchor.anchorSpace, referenceSpace);
      } else if (anchorRecord.space) {
        pose = xrFrame.getPose(anchorRecord.space, referenceSpace);
      }

      if (pose) {
        this._updateAnchorPose(anchorRecord, pose);
      }
    }
  }

  removeAnchor(anchorId) {
    const anchor = this.anchors.get(anchorId);
    if (!anchor) return false;

    anchor.attachedObjects.forEach((_, object) => {
      this.detachObject(object);
    });

    if (anchor.xrAnchor && typeof anchor.xrAnchor.delete === 'function') {
      try {
        anchor.xrAnchor.delete();
      } catch (error) {
        this.logger.warn('XRAnchorManager: failed to delete native XRAnchor', error);
      }
    }

    return this.anchors.delete(anchorId);
  }

  listAnchors() {
    return Array.from(this.anchors.values()).map((anchor) => ({
      id: anchor.id,
      label: anchor.metadata?.label || anchor.id,
      lastUpdated: anchor.lastUpdated,
      attachedObjectCount: anchor.attachedObjects.size,
      position: anchor.position.clone()
    }));
  }

  clear() {
    for (const anchorId of this.anchors.keys()) {
      this.removeAnchor(anchorId);
    }
  }

  _storeAnchor({ pose, xrAnchor = null, metadata = {} }) {
    const { matrix, position, quaternion } = extractPoseTransform(pose);
    const id = metadata.id || generateAnchorId();

    const anchorRecord = {
      id,
      matrix,
      position,
      quaternion,
      metadata,
      xrAnchor,
      space: xrAnchor?.anchorSpace || null,
      lastUpdated: performance?.now?.() || Date.now(),
      attachedObjects: new Map()
    };

    this.anchors.set(id, anchorRecord);
    return anchorRecord;
  }

  _updateAnchorPose(anchorRecord, pose) {
    const { matrix, position, quaternion } = extractPoseTransform(pose);
    anchorRecord.matrix.copy(matrix);
    anchorRecord.position.copy(position);
    anchorRecord.quaternion.copy(quaternion);
    anchorRecord.lastUpdated = performance?.now?.() || Date.now();

    anchorRecord.attachedObjects.forEach((options, object3D) => {
      this._applyAnchorPoseToObject(anchorRecord, object3D, options);
    });
  }

  _applyAnchorPoseToObject(anchorRecord, object3D, options = {}) {
    object3D.position.copy(anchorRecord.position);
    if (!options.lockOrientation) {
      object3D.quaternion.copy(anchorRecord.quaternion);
    }
    if (options.followScale && anchorRecord.matrix) {
      const scale = new THREE.Vector3();
      anchorRecord.matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
      object3D.scale.copy(scale);
    }
    object3D.updateMatrixWorld(true);
  }
}

export default XRAnchorManager;
