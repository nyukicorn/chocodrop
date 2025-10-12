/**
 * Video Dimension Utilities
 * Handles aspect ratio calculations, resolution validation, and dimension derivation
 */

/**
 * Base height for each video resolution tier
 */
export const VIDEO_RESOLUTION_BASE_HEIGHT = {
  '720p': 720,
  '580p': 580,
  '480p': 480
};

/**
 * Allowed aspect ratios
 */
export const ALLOWED_ASPECT_RATIOS = new Set(['16:9', '9:16', '1:1']);

/**
 * Allowed video resolutions
 */
export const ALLOWED_VIDEO_RESOLUTIONS = new Set(Object.keys(VIDEO_RESOLUTION_BASE_HEIGHT));

/**
 * Normalize aspect ratio from width and height
 * @param {number} width - Video width
 * @param {number} height - Video height
 * @returns {string} Normalized aspect ratio ('16:9', '9:16', or '1:1')
 */
export function normalizeAspectRatio(width, height) {
  if (!width || !height) {
    return '1:1';
  }

  const ratio = width / height;
  const epsilon = 0.01;

  if (Math.abs(ratio - 1) < epsilon) {
    return '1:1';
  }

  if (ratio > 1) {
    return '16:9';
  }

  return '9:16';
}

/**
 * Validate and sanitize aspect ratio string
 * @param {string} value - Aspect ratio to validate
 * @returns {string|null} Valid aspect ratio or null
 */
export function sanitizeAspectRatio(value) {
  if (typeof value === 'string' && ALLOWED_ASPECT_RATIOS.has(value)) {
    return value;
  }
  return null;
}

/**
 * Validate and sanitize video resolution string
 * @param {string} value - Resolution to validate
 * @returns {string|null} Valid resolution or null
 */
export function sanitizeVideoResolution(value) {
  if (typeof value === 'string' && ALLOWED_VIDEO_RESOLUTIONS.has(value)) {
    return value;
  }
  return null;
}

/**
 * Derive resolution tier from video dimensions
 * @param {number} width - Video width
 * @param {number} height - Video height
 * @returns {string|null} Derived resolution tier ('720p', '580p', '480p') or null
 */
export function deriveResolutionFromDimensions(width, height) {
  if (!width || !height) {
    return null;
  }

  const shorterSide = Math.min(width, height);

  if (shorterSide >= 700) {
    return '720p';
  }

  if (shorterSide >= 560) {
    return '580p';
  }

  return '480p';
}

/**
 * Ensure dimension is even (required for video encoding)
 * @param {number} value - Dimension value
 * @returns {number|null} Even dimension or null if invalid
 */
export function ensureEvenDimension(value) {
  if (!value || value <= 0) {
    return null;
  }
  const rounded = Math.round(value);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

/**
 * Derive video dimensions from aspect ratio and resolution
 * @param {string} aspectRatio - Aspect ratio ('16:9', '9:16', '1:1')
 * @param {string} resolution - Resolution tier ('720p', '580p', '480p')
 * @returns {{width: number, height: number}} Video dimensions
 */
export function deriveDimensionsFromAspect(aspectRatio, resolution) {
  const base = VIDEO_RESOLUTION_BASE_HEIGHT[resolution] || VIDEO_RESOLUTION_BASE_HEIGHT['720p'];

  switch (aspectRatio) {
    case '16:9':
      return {
        width: ensureEvenDimension((base * 16) / 9),
        height: ensureEvenDimension(base)
      };
    case '9:16':
      return {
        width: ensureEvenDimension(base),
        height: ensureEvenDimension((base * 16) / 9)
      };
    case '1:1':
    default:
      return {
        width: ensureEvenDimension(base),
        height: ensureEvenDimension(base)
      };
  }
}
