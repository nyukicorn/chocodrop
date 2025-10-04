import express from 'express';
import { createServer } from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import {
  ensureConfigDir,
  loadConfig,
  rateLimit,
  CSRFProtection,
  corsWithAllowlist,
  logSecurityEvent,
} from './security.js';
import { MCPClient } from './mcp-client.js';
import config from './config/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load version from package.json
const packageJsonPath = join(__dirname, '../package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
const VERSION = packageJson.version;

/**
 * Start ChocoDrop Daemon
 * @param {Object} options - Configuration options
 * @param {string} options.host - Host to bind (default: 127.0.0.1)
 * @param {number} options.port - Port to bind (default: 43110)
 * @returns {Promise<Object>} Server instance
 */
export async function startDaemon({ host = '127.0.0.1', port = 43110 } = {}) {
  const app = express();

  // Ensure config directory exists
  await ensureConfigDir();

  // Load configuration
  const securityConfig = await loadConfig();

  // Initialize CSRF protection
  const csrf = new CSRFProtection();

  // Initialize MCP Client
  const publicDir = join(__dirname, '../../../public');
  const mcpClient = new MCPClient({
    outputDir: join(publicDir, 'generated'),
    serverUrl: `http://${host}:${port}`,
    server: null // Will be set after server starts
  });

  // Security: Local-only by default
  app.use((req, res, next) => {
    const clientIp = req.ip || req.connection.remoteAddress;
    if (!clientIp.includes('127.0.0.1') && !clientIp.includes('::1') && !clientIp.includes('::ffff:127.0.0.1')) {
      logSecurityEvent('remote_access_blocked', { ip: clientIp, path: req.path });
      return res.status(403).json({ error: 'Forbidden: Remote access not allowed' });
    }
    next();
  });

  // Rate limiting
  app.use(rateLimit({
    windowMs: securityConfig.security?.rateLimit?.windowMs || 60000,
    maxRequests: securityConfig.security?.rateLimit?.maxRequests || 100,
  }));

  // CORS with allowlist
  app.use(await corsWithAllowlist());

  app.use(express.json());

  // CSRF protection for POST requests (if enabled)
  if (securityConfig.security?.csrfEnabled !== false) {
    app.use(csrf.middleware());
  }

  // Store csrf instance for cleanup
  app.locals.csrf = csrf;

  // CSRF token endpoint
  app.get('/v1/csrf-token', (req, res) => {
    const token = csrf.generateToken();
    res.json({ csrfToken: token });
  });

  // Health check endpoint
  app.get('/v1/health', (req, res) => {
    res.json({
      ok: true,
      version: VERSION,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      security: {
        csrfEnabled: securityConfig.security?.csrfEnabled !== false,
        safeMode: securityConfig.security?.safeMode !== false,
      },
    });
  });

  // Reload configuration endpoint
  app.post('/v1/reload', async (req, res) => {
    try {
      const newConfig = await loadConfig();
      Object.assign(securityConfig, newConfig);

      logSecurityEvent('config_reloaded', { timestamp: new Date().toISOString() });

      res.json({
        ok: true,
        message: 'Configuration reloaded',
        config: {
          security: securityConfig.security,
        },
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: 'Failed to reload configuration',
        message: error.message,
      });
    }
  });

  // SDK distribution endpoint
  app.get('/sdk.js', async (req, res) => {
    try {
      // Read SDK source from packages/sdk/src/index.js
      const { readFile } = await import('fs/promises');
      const { fileURLToPath } = await import('url');
      const { dirname, join } = await import('path');

      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);

      // Path to SDK source (../../sdk/src/index.js from daemon/src/)
      const sdkPath = join(__dirname, '../../sdk/src/index.js');
      const sdkContent = await readFile(sdkPath, 'utf-8');

      // Phase 2a: Cache-Control for sdk.js (prevent update issues)
      res.type('application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      res.send(sdkContent);
    } catch (error) {
      console.error('Failed to load SDK:', error);
      res.status(500).send('// Failed to load SDK');
    }
  });

  // Serve UI bundles from dist/ (Rollup output)
  const distPath = join(__dirname, '../../../dist');
  app.use('/ui', express.static(distPath, {
    setHeaders: (res, path) => {
      // UI bundles: short cache (5 minutes) as they may update frequently during development
      res.setHeader('Cache-Control', 'public, max-age=300');
    }
  }));

  // Also serve original source files (fallback for dev)
  const srcClientPath = join(__dirname, '../../../src/client');
  app.use('/ui/src', express.static(srcClientPath, {
    setHeaders: (res) => {
      // Dev source files: no cache
      res.setHeader('Cache-Control', 'no-store, max-age=0');
    }
  }));

  // Serve vendor files (THREE.js local fallback)
  const vendorPath = join(__dirname, '../../../vendor');
  app.use('/vendor', express.static(vendorPath, {
    setHeaders: (res, path) => {
      // Cache vendor files for 1 hour (they're versioned)
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    }
  }));

  // Serve generated files (images, videos)
  const generatedPath = join(publicDir, 'generated');
  app.use('/generated', express.static(generatedPath, {
    setHeaders: (res, path) => {
      // Generated media: longer cache (1 day) as filenames are timestamped
      res.setHeader('Cache-Control', 'public, max-age=86400');
      // Content-Type is auto-set by express.static based on file extension
      // Only PNG, JPG, MP4 files are expected (verified safe static assets)
    }
  }));

  // Settings page endpoint (will implement in next phase)
  app.get('/settings', (req, res) => {
    res.type('text/html');
    res.send('<h1>ChocoDrop Settings - Coming Soon</h1>');
  });

  // Generate endpoint (MCP bridge to kamuicode)
  app.post('/v1/generate', async (req, res) => {
    try {
      const { prompt, type = 'image', options = {} } = req.body;

      if (!prompt) {
        return res.status(400).json({
          error: 'Missing prompt',
          message: 'Prompt is required for generation',
        });
      }

      logSecurityEvent('generate_request', { type, promptLength: prompt.length });

      // Safe mode check
      if (securityConfig.security?.safeMode !== false) {
        // In safe mode, only allow if explicitly enabled
        if (!options.allowGeneration) {
          return res.status(403).json({
            error: 'Generation disabled in safe mode',
            message: 'Set safeMode: false in config to enable generation',
          });
        }
      }

      // Call MCP client to generate
      const result = await mcpClient.generateContent({
        prompt,
        type,
        ...options
      });

      res.json({
        ok: true,
        result,
      });
    } catch (error) {
      console.error('Generation error:', error);
      res.status(500).json({
        error: 'Generation failed',
        message: error.message,
      });
    }
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      error: 'Not found',
      path: req.path,
    });
  });

  // Error handler
  app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: err.message,
    });
  });

  // Start server
  const server = createServer(app);

  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      resolve({ server, app });
    });

    server.on('error', reject);
  });
}
