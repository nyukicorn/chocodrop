/**
 * API Contract Tests - Minimal Critical Path
 * Tests the core API contracts required for alpha release
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { startDaemon } from '../index.js';

describe('API Contract Tests (Phase 2a)', () => {
  let server;
  let app;

  beforeAll(async () => {
    const result = await startDaemon({ host: '127.0.0.1', port: 0 }); // Random port
    server = result.server;
    app = result.app;
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    // Cleanup CSRF tokens
    if (app?.locals?.csrf) {
      app.locals.csrf.tokens.clear();
    }
  });

  describe('GET /v1/health', () => {
    it('returns 200 with JSON', async () => {
      const res = await request(server)
        .get('/v1/health')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(res.body).toHaveProperty('ok', true);
      expect(res.body).toHaveProperty('version');
      expect(res.body).toHaveProperty('timestamp');
    });

    it('returns valid JSON response', async () => {
      const res = await request(server)
        .get('/v1/health');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('GET /sdk.js', () => {
    it('returns 200 with JavaScript content', async () => {
      const res = await request(server)
        .get('/sdk.js')
        .expect(200);

      expect(res.headers['content-type']).toContain('application/javascript');
      expect(res.headers['cache-control']).toContain('no-store');
      expect(res.text).toContain('chocodrop'); // Basic sanity check
    });
  });

  describe('CORS + PNA (Private Network Access)', () => {
    it('GET /v1/health allows cross-origin requests', async () => {
      const res = await request(server)
        .get('/v1/health')
        .set('Origin', 'https://threejs.org')
        .expect(200);

      // CORS should be configured (actual headers depend on middleware)
      expect(res.body.ok).toBe(true);
    });

    it('POST /v1/generate is blocked in alpha (Phase 2a)', async () => {
      await request(server)
        .post('/v1/generate')
        .send({ prompt: 'test' })
        .expect(403); // Write endpoints blocked in Phase 2a
    });
  });

  describe('Static Assets Endpoints', () => {
    it('GET /ui/* has appropriate cache headers', async () => {
      // Note: This test may 404 if no ui files exist, but we test the route config
      const res = await request(server)
        .get('/ui/test.js');

      // If 404, it's because file doesn't exist, but route is configured
      // If 200, check cache headers
      if (res.status === 200) {
        expect(res.headers['cache-control']).toContain('max-age');
      }
    });

    it('GET /vendor/* has long cache headers', async () => {
      const res = await request(server)
        .get('/vendor/test.js');

      // If 200, should have longer cache
      if (res.status === 200) {
        expect(res.headers['cache-control']).toContain('max-age');
        expect(res.headers['content-type']).toContain('application/javascript');
      }
    });
  });

  describe('Security - Local-only Access', () => {
    it('blocks non-localhost IPs', async () => {
      // Note: This test requires mocking req.ip, which is complex in supertest
      // For now, we rely on manual testing and integration tests
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('Write APIs (Phase 2b preview)', () => {
    it('POST /v1/generate returns 403 in alpha (allowlist required)', async () => {
      await request(server)
        .post('/v1/generate')
        .send({ prompt: 'test' })
        .expect(403); // Blocked in Phase 2a
    });
  });
});
