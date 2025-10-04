/**
 * Security middleware for ChocoDrop Daemon
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import crypto from 'crypto';

const CONFIG_DIR = join(homedir(), '.config', 'chocodrop');
const ALLOWLIST_PATH = join(CONFIG_DIR, 'allowlist.json');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

// Rate limiting storage
const rateLimitStore = new Map();

/**
 * Ensure config directory exists
 */
export async function ensureConfigDir() {
  try {
    await mkdir(CONFIG_DIR, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Load allowlist from disk
 * @returns {Promise<string[]>} Array of allowed origins
 */
export async function loadAllowlist() {
  try {
    const content = await readFile(ALLOWLIST_PATH, 'utf-8');
    const data = JSON.parse(content);
    return data.origins || [];
  } catch (error) {
    // File doesn't exist or is invalid - return default
    return ['http://localhost:3000', 'http://127.0.0.1:3000'];
  }
}

/**
 * Save allowlist to disk
 * @param {string[]} origins - Array of allowed origins
 */
export async function saveAllowlist(origins) {
  await ensureConfigDir();
  await writeFile(ALLOWLIST_PATH, JSON.stringify({ origins }, null, 2));
}

/**
 * Add origin to allowlist
 * @param {string} origin - Origin to add
 */
export async function addToAllowlist(origin) {
  const allowlist = await loadAllowlist();
  if (!allowlist.includes(origin)) {
    allowlist.push(origin);
    await saveAllowlist(allowlist);
  }
}

/**
 * Load config from disk
 * @returns {Promise<Object>} Configuration object
 */
export async function loadConfig() {
  try {
    const content = await readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    // Return default config
    return {
      security: {
        rateLimit: {
          windowMs: 60000, // 1 minute
          maxRequests: 100, // 100 requests per minute
        },
        csrfEnabled: true,
        safeMode: true, // No external requests by default
      },
    };
  }
}

/**
 * Rate limiting middleware
 * @param {Object} options - Rate limit options
 * @returns {Function} Express middleware
 */
export function rateLimit(options = {}) {
  const windowMs = options.windowMs || 60000; // 1 minute
  const maxRequests = options.maxRequests || 100;

  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress;
    const now = Date.now();

    // Get or create rate limit data for this IP
    let ipData = rateLimitStore.get(key);
    if (!ipData) {
      ipData = { count: 0, resetTime: now + windowMs };
      rateLimitStore.set(key, ipData);
    }

    // Reset if window has passed
    if (now > ipData.resetTime) {
      ipData.count = 0;
      ipData.resetTime = now + windowMs;
    }

    // Increment and check
    ipData.count++;

    if (ipData.count > maxRequests) {
      return res.status(429).json({
        error: 'Too many requests',
        message: `Rate limit exceeded. Try again in ${Math.ceil((ipData.resetTime - now) / 1000)}s`,
        retryAfter: Math.ceil((ipData.resetTime - now) / 1000),
      });
    }

    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', maxRequests - ipData.count);
    res.setHeader('X-RateLimit-Reset', new Date(ipData.resetTime).toISOString());

    next();
  };
}

/**
 * CSRF token generation and validation
 */
export class CSRFProtection {
  constructor() {
    this.tokens = new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(), 600000); // 10 minutes
  }

  /**
   * Generate a new CSRF token
   * @returns {string} CSRF token
   */
  generateToken() {
    const token = crypto.randomBytes(32).toString('hex');
    this.tokens.set(token, Date.now());
    return token;
  }

  /**
   * Validate CSRF token
   * @param {string} token - Token to validate
   * @returns {boolean} True if valid
   */
  validateToken(token) {
    if (!token) return false;
    const timestamp = this.tokens.get(token);
    if (!timestamp) return false;

    // Token expires after 1 hour
    const isExpired = Date.now() - timestamp > 3600000;
    if (isExpired) {
      this.tokens.delete(token);
      return false;
    }

    return true;
  }

  /**
   * Clean up expired tokens
   */
  cleanup() {
    const now = Date.now();
    for (const [token, timestamp] of this.tokens.entries()) {
      if (now - timestamp > 3600000) {
        this.tokens.delete(token);
      }
    }
  }

  /**
   * Express middleware for CSRF protection
   */
  middleware() {
    return (req, res, next) => {
      // Skip CSRF for GET requests
      if (req.method === 'GET') {
        return next();
      }

      const token = req.headers['x-csrf-token'] || req.body?.csrfToken;
      if (!this.validateToken(token)) {
        return res.status(403).json({
          error: 'Invalid CSRF token',
          message: 'CSRF token is missing or invalid',
        });
      }

      next();
    };
  }

  /**
   * Destroy cleanup interval
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Read-only endpoints that allow all origins (Phase 2a)
const READ_ONLY_ENDPOINTS = new Set(['/v1/health', '/sdk.js']);

// Check if path is read-only (includes static files)
function isReadOnlyPath(path) {
  return READ_ONLY_ENDPOINTS.has(path) ||
         path.startsWith('/ui/') ||
         path.startsWith('/generated/');
}

/**
 * CORS middleware with allowlist support
 * Phase 2a: Read-only endpoints allow all origins for Bookmarklet support
 * @returns {Function} Express middleware
 */
export async function corsWithAllowlist() {
  const allowlist = await loadAllowlist();

  return (req, res, next) => {
    const origin = req.headers.origin;
    const isReadOnly = isReadOnlyPath(req.path);

    // Common headers for all CORS requests
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token, x-chocodrop-origin, X-ChocoDrop-Nonce, X-Requested-With');

    // Handle OPTIONS preflight
    if (req.method === 'OPTIONS') {
      // PNA (Private Network Access) support for https→localhost
      if (req.headers['access-control-request-private-network'] === 'true') {
        res.setHeader('Access-Control-Allow-Private-Network', 'true');
      }
      res.setHeader('Access-Control-Max-Age', '600'); // Cache preflight for 10 minutes
      return res.sendStatus(200);
    }

    // Read-only endpoints: Allow all origins (Phase 2a)
    if (isReadOnly) {
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
      res.setHeader('Access-Control-Allow-Credentials', 'false');
      return next();
    }

    // Write endpoints: Check allowlist (existing behavior)
    // No origin = same-origin request (allow)
    if (!origin) {
      return next();
    }

    // Check if origin is in allowlist
    const isAllowed = allowlist.some(allowed => {
      // Exact match
      if (origin === allowed) return true;
      // Wildcard localhost (any port)
      if (allowed === 'http://localhost:*' && origin.startsWith('http://localhost:')) return true;
      if (allowed === 'http://127.0.0.1:*' && origin.startsWith('http://127.0.0.1:')) return true;
      return false;
    });

    if (isAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      return next();
    }

    // Origin not allowed
    res.status(403).json({
      error: 'Origin not allowed',
      message: 'This origin is not in the allowlist. Add it via the settings page.',
      origin,
    });
  };
}

/**
 * Log security events (with PII masking)
 * @param {string} event - Event type
 * @param {Object} data - Event data
 */
export function logSecurityEvent(event, data) {
  const sanitized = {
    ...data,
    // Mask IP addresses
    ip: data.ip ? data.ip.replace(/\d+\.\d+\.\d+\.\d+/, 'xxx.xxx.xxx.xxx') : undefined,
    // Mask user agents
    userAgent: data.userAgent ? 'MASKED' : undefined,
  };

  console.log(`[SECURITY] ${event}:`, sanitized);
}
