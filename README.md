# ChocoDro

Real-time AI image generation and 3D scene integration via Model Context Protocol (MCP).

**自然言語で3D世界を即座に変更** - 「ドラゴンを右上に作って」で瞬時にAI画像生成→3D配置

## 🎮 System Architecture

### Core Components

**Backend Engine**
- **LiveCommandSystem** (`src/experimental/LiveCommandSystem.js`) - Command execution engine
- **MCPBridge** (`src/experimental/MCPBridge.js`) - AI generation API interface

**Frontend Interface**  
- **CommandUI** (`src/client/CommandUI.js`) - Browser UI (@ key to activate)
- **SceneManager** (`src/client/SceneManager.js`) - 3D scene integration
- **ChocoDroClient** (`src/client/LiveCommandClient.js`) - HTTP client (旧 LiveCommandClient)

### AI Generation Models

- **Seedream V4** - High-quality images (default, ~10-15s)
- **Flux Schnell** - Highest quality (~15-20s) 
- **Qwen Image** - Fast generation (~1-2s)
- **Imagen4 Fast** - Balanced quality/speed (~8-12s)
- **Gemini 2.5 Flash** - Google latest model (~8-12s)

### Command Examples
```
右上に大きなドラゴンを作って    → AI generates dragon image → Places in 3D space
中央に小さな桜を生成          → Cherry blossom generation
空に鳳凰を作って             → Phoenix in sky position  
地面に神社を作って           → Shrine on ground
```

## Features

- 🎨 Natural language to AI image generation
- 🌐 Real-time 3D scene integration
- 🔗 MCP protocol support
- 📦 Framework agnostic (Three.js, React, Vue, etc.)
- 🎮 Interactive UI with keyboard shortcuts
- 🎯 Japanese natural language parsing
- 📍 Camera-relative positioning system

### Distribution Models

- **Shared Module:** ChocoDro を独立フォルダや npm パッケージとして保守し、`createChocoDro` で複数プロジェクトから共通利用。
- **Project Bundled:** 単体プロジェクトにコピーしてカスタマイズ。特殊案件ではローカルフォークとして併用可能。

## Quick Start

### Server Setup
```bash
cd packages/chocodro
npm install
npm run dev
```

- `.claude/mcp-kamui-code.json` の場所は `config.local.json` か環境変数 `MCP_CONFIG_PATH` で設定できます（未設定時はホームディレクトリ配下を自動使用）。

### Client Integration (Shared Folder Friendly)
```javascript
import { createChocoDro } from '@chocodro/core';

const controls = new OrbitControls(camera, renderer.domElement);

const chocoDro = createChocoDro(scene, {
  camera,
  renderer,
  serverUrl: 'http://localhost:3011',
  onControlsToggle: (disabled) => {
    controls.enabled = !disabled;
  }
});

// 必要に応じてアクセス
chocoDro.ui.show();
chocoDro.client.generateImage('桜の森');
```

`createChocoDro` は共有ディレクトリや npm パッケージとして配布した ChocoDro を、任意の Three.js プロジェクトから数行で初期化するためのヘルパーです。サーバー URL を指定しなければ、クライアントが自動検出ロジックで解決します。

## API Documentation

### ChocoDroClient
- `generateImage(prompt, options)` - Generate AI images
- `executeCommand(naturalLanguage)` - Process natural language commands

### CommandUI  
- `show()` - Display command interface
- `hide()` - Hide command interface
- `toggle()` - Toggle visibility

## Examples

See `examples/` directory for complete integration examples.

## License

MIT
