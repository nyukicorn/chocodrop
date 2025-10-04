# @chocodrop/daemon

ChocoDrop daemon - local server for SDK distribution and MCP bridging.

## Installation

```bash
npx --yes @chocodrop/daemon@alpha
```

## Testing

```bash
npm test
```

### Test Coverage (Alpha - Minimal Critical Path)

✅ API Contract Tests:
- GET /v1/health - Health check endpoint
- GET /sdk.js - SDK distribution
- CORS + PNA (Private Network Access) support
- Static assets serving (/ui/, /vendor/, /generated/)
- Write API protection (Phase 2a: blocked)

### Running Tests Locally

```bash
cd packages/daemon
npm install
npm test
```

## CI/CD

GitHub Actions CI runs on every push and PR:
- Node 18, 20 matrix
- API contract tests
- Build verification

See `.github/workflows/ci.yml` for details.

## Architecture

- Express server binding to 127.0.0.1 (localhost-only)
- CORS middleware for Phase 2a (read-only endpoints allow all origins)
- CSRF protection (enabled but write endpoints blocked in alpha)
- MCP client for AI generation bridge (Phase 2b)

## Development

```bash
# Start daemon
node bin/chocodropd.js

# Run tests in watch mode
npm run test:watch
```

## Security

- **Local-only**: Binds to 127.0.0.1 (no remote access)
- **CORS Phase 2a**: Read-only endpoints allow cross-origin (PNA headers included)
- **Write Protection**: Generate APIs blocked in alpha (Phase 2b required)
- **CSRF**: Active but write endpoints disabled

## Phase Roadmap

- ✅ Phase 2a: External site support (read-only)
- ⬜ Phase 2b: Pairing approval + CSRF nonce + clickjacking protection
- ⬜ Phase 3: Full write API activation
