const XR_DEVICE_PROFILES = [
  {
    id: 'apple-vision-pro',
    vendor: 'Apple',
    label: 'Apple Vision Pro (visionOS 2)',
    type: 'mixed-reality',
    inputs: ['gaze', 'pinch', 'gestures'],
    supportsAnchors: true,
    anchorPrecisionMm: 5,
    recommendedScale: 1.0,
    notes: '視線 + ピンチ入力を標準化。空間オブジェクトはリビングスケールで扱う。'
  },
  {
    id: 'meta-quest-3',
    vendor: 'Meta',
    label: 'Meta Quest 3 / Quest Pro',
    type: 'vr-mr-hybrid',
    inputs: ['controllers', 'hand-tracking'],
    supportsAnchors: true,
    anchorPrecisionMm: 15,
    recommendedScale: 1.2,
    notes: 'コントローラ操作と手追跡を併用。ルームスケールのベイク済みアンカーが前提。'
  },
  {
    id: 'snap-spectacles-2025',
    vendor: 'Snap',
    label: 'Snap Spectacles 2025',
    type: 'ar-wearable',
    inputs: ['hand-tracking', 'voice'],
    supportsAnchors: true,
    anchorPrecisionMm: 25,
    recommendedScale: 0.6,
    notes: '屋外向け。GPS/WPS併用で空間配置、手の骨格入力で微調整。'
  },
  {
    id: 'niantic-skyline',
    vendor: 'Niantic',
    label: 'Niantic Lightship Skylineリファレンス端末',
    type: 'ar-mobile',
    inputs: ['touch', 'hand-tracking'],
    supportsAnchors: true,
    anchorPrecisionMm: 30,
    recommendedScale: 0.8,
    notes: 'スマホ + ARDK 3.13。Shared ARやWPSを前提に複数人がオブジェクトを共有。'
  }
];

export function getXRDeviceProfiles() {
  return XR_DEVICE_PROFILES;
}

export function findXRDeviceProfile(id) {
  return XR_DEVICE_PROFILES.find((profile) => profile.id === id) || null;
}

export function inferXRProfileFromUserAgent(userAgent = '') {
  const ua = userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  if (!ua) return null;

  if (/visionos|applevision|xrOS/i.test(ua)) {
    return findXRDeviceProfile('apple-vision-pro');
  }
  if (/quest|oculus/i.test(ua)) {
    return findXRDeviceProfile('meta-quest-3');
  }
  if (/spectacles/i.test(ua)) {
    return findXRDeviceProfile('snap-spectacles-2025');
  }
  return null;
}

export function getXRInputHints(profile) {
  if (!profile) return [];
  return profile.inputs || [];
}

export default {
  getXRDeviceProfiles,
  findXRDeviceProfile,
  inferXRProfileFromUserAgent,
  getXRInputHints
};
