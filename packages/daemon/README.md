# @chocodrop/daemon

ChocoDrop daemon - Local SDK distribution server for UI and interaction features.

> ⚠️ **Note**: This package provides **UI and interaction features only**.
> AI generation requires cloning the repository and setting up KAMUI Code.

## What you can do with daemon

✅ **Supported features:**
- Bookmarklet integration (threejs.org, etc.)
- SDK distribution for npm projects
- UI display and interaction
- Scene object manipulation

❌ **NOT supported (requires repository clone):**
- AI-powered image/video generation
- Natural language commands with AI
- KAMUI Code integration

## Installation

```bash
# Instant start (recommended)
npx --yes @chocodrop/daemon@alpha

# Or with pnpm
pnpm dlx @chocodrop/daemon@alpha
```

The daemon starts at `http://127.0.0.1:43110` and serves:
- `/sdk.js` - ChocoDrop SDK for browser integration
- `/v1/health` - Health check endpoint
- `/ui/` - UI assets
- `/vendor/` - Vendor libraries (THREE.js fallback)

## Usage

### With Bookmarklet

1. Start daemon: `npx --yes @chocodrop/daemon@alpha`
2. Open [Bookmarklet page](https://nyukicorn.github.io/chocodrop/examples/bookmarklet-v2.html)
3. Drag the button to your bookmarks bar
4. Click it on any THREE.js page

### With Your Project

```html
<!-- In your HTML -->
<script src="http://127.0.0.1:43110/sdk.js"></script>

<script type="module">
  import * as THREE from 'three';

  // Your THREE.js setup
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer();

  // ChocoDrop integration
  await window.chocodrop.ready();
  await window.chocodrop.attach(scene, { camera, renderer });
</script>
```

See [Integration Guide](../../docs/INTEGRATION.md) for more details.

## Testing

```bash
npm test
```

### Test Coverage (Alpha - Minimal Critical Path)

✅ **API Contract Tests:**
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
- CORS middleware with allowlist support (`~/.config/chocodrop/allowlist.json`)
- PNA (Private Network Access) headers for external site integration
- Static file serving for SDK, UI, and vendor libraries

## Development

```bash
# Start daemon
node bin/chocodropd.js

# Run tests in watch mode
npm run test:watch
```

## Security

- **Local-only**: Binds to 127.0.0.1 (no remote access)
- **CORS allowlist**: Only permitted origins can access the daemon
- **Read-only**: No write/generation APIs in alpha (UI display only)
- **No external communication**: All processing stays local

## For AI Generation (Advanced Users)

If you need AI-powered generation features, you must:

1. Clone the full repository
2. Set up KAMUI Code (`npm run setup:mcp`)
3. Run the development server (`npm run dev`)

See [SETUP.md](../../docs/SETUP.md) for detailed instructions.

## Links

- [Main README](../../README.md) - Project overview
- [Integration Guide](../../docs/INTEGRATION.md) - How to use in your project
- [Troubleshooting](../../docs/TROUBLESHOOTING.md) - Common issues
- [GitHub](https://github.com/nyukicorn/chocodrop) - Source code
