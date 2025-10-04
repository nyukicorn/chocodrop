# Changelog

All notable changes to ChocoDrop will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2-alpha.0] - 2025-10-04

### Added
- 🍫 **Bookmarklet v2**: One-click integration for external sites (threejs.org, CodePen, Glitch, etc.)
- 🔧 **DevTools Console Snippet**: Alternative activation method for developer workflows
- 🎨 **Toast UI**: Connection status notification with startup guide and auto-retry
- 🌐 **External Site Support**: Full UI display on external sites (not just placeholder)
- 📦 **CDN Pinning with SRI**: THREE.js v0.158.0 pinned with Subresource Integrity verification
- 🏢 **Enterprise Policy Support**: `allowCdn: false` configuration for networks blocking CDN access
- 📚 **Local Vendor Fallback**: Automatic fallback to `/vendor/three-0.158.0.min.js` when CDN fails
- ⚙️ **Custom THREE.js Source**: Support for `window.chocodropConfig.threeSrc` custom URL
- 📊 **Cache-Control Strategy**: Optimized caching for UI bundles (5min), vendor files (1hr), generated media (1day)

### Fixed
- 🔐 **CORS Phase 2a**: Read-only endpoints (`/v1/health`, `/sdk.js`, `/ui/*`, `/vendor/*`, `/generated/*`) now allow all origins
- 🌍 **Private Network Access (PNA)**: Added `Access-Control-Allow-Private-Network: true` header for Chrome compatibility
- 🎯 **UI Bundle Auto-Switch**: Automatic detection between ESM and IIFE bundles based on `window.THREE` availability

### Security
- ✅ **SRI Integrity Check**: CDN resources verified with sha384 hash
- ✅ **Version Pinning**: THREE.js locked to v0.158.0 to prevent breaking changes
- ✅ **Safe Static Assets**: `/generated/` directory restricted to PNG/JPG/MP4 files only
- ⚠️ **Write Endpoints Blocked**: `/v1/generate` and other write APIs remain blocked (Phase 2b required for activation)

### Testing
- ✅ **Smoke Tests PASS**: threejs.org with CDN mode
- ✅ **Smoke Tests PASS**: allowCdn: false with local vendor fallback
- 📋 **Test Documentation**: Comprehensive smoke test results in `docs/smoke-test.md`

### Known Limitations (α版)
- ⚠️ Write APIs blocked: `/v1/generate` などの書き込み系APIは現状ブロック中
- 📋 Next Phase: Phase 2b でペアリング承認UI + CSRF nonce + クリックジャック防止を実装予定

## [1.0.1-alpha.1] - 2025-10-03

### Changed
- Daemon version bump to 1.0.1-alpha.1
- Startup message cleanup following 2025 CLI UX best practices

## [1.0.0-alpha.0] - 2025-10-03

### Added
- 🚀 **New Architecture**: daemon + SDK + MCP bridge implementation
- 🎯 **MCP Integration**: Full Model Context Protocol support for AI image generation
- 🔒 **Security Framework**: CSRF protection, rate limiting, origin allowlist
- 📦 **Package Structure**: Monorepo with `@chocodrop/daemon` and `@chocodrop/sdk`
- 🎨 **UI Components**: React-based UI with full THREE.js scene integration
- 📚 **Documentation**: Complete setup guides and architecture documentation

[1.0.2-alpha.0]: https://github.com/nyukicorn/chocodrop/releases/tag/v1.0.2-alpha.0
[1.0.1-alpha.1]: https://github.com/nyukicorn/chocodrop/releases/tag/v1.0.1-alpha.1
[1.0.0-alpha.0]: https://github.com/nyukicorn/chocodrop/releases/tag/v1.0.0-alpha.0
