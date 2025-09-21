# ChocoDrop

> Real-time AI content drops for 3D scenes via natural language
> **あらゆる3D空間に、コンテンツをちょこんとドロップ**

[🇯🇵 日本語](#japanese) | [📚 Documentation](docs/) | [🎮 Examples](examples/) | [🤝 Contributing](CONTRIBUTING.md)

## What is ChocoDrop?

> 🚧 **Under Active Development** - Not ready for production use yet!

Drop AI-generated content into any 3D scene with natural language commands:

- **"Add a dragon in the top-right"** → Instant AI generation & 3D placement
- **"Place cherry blossoms in center"** → Real-time scene integration
- **Works with** Three.js, React Three Fiber, A-Frame, and more

```javascript
import { createChocoDrop } from '@chocodrop/core';

const chocoDrop = createChocoDrop(scene, {
  camera, renderer,
  serverUrl: 'http://localhost:3011'
});

// Just speak naturally to your 3D scene
chocoDrop.executeCommand('Create a magical forest in the background');
```

## ✨ Features

- 🎯 **Natural language 3D positioning** - "top-right", "center", "behind camera"
- 🎨 **Multiple AI generation models** - Flux, DALL-E, Stable Diffusion
- 🔄 **Real-time editing & effects** - Modify after placement
- 📦 **Framework agnostic** - Works with any Three.js setup
- 🌐 **MCP protocol integration** - Extensible AI model support
- 🎮 **Intuitive UI** - Press `@` key to activate command interface

## Quick Start

### Try it instantly
```bash
git clone https://github.com/nyukicorn/chocodrop.git
cd chocodrop
npm run example:basic
```

Open http://localhost:8000 and click `basic/index.html` - Press `@` key to start!

### Add to your project
```bash
npm install github:nyukicorn/chocodrop
```

```javascript
import { createChocoDrop } from 'chocodrop';

const chocoDrop = createChocoDrop(scene, { camera, renderer });
```

## 📚 Documentation

- **[📖 Setup Guide](docs/SETUP.md)** - Complete installation and configuration
- **[🔧 API Reference](docs/API.md)** - Detailed API documentation
- **[🎮 Examples](examples/)** - Integration examples for different frameworks
- **[🚨 Troubleshooting](docs/TROUBLESHOOTING.md)** - Common issues and solutions

## 🎯 Features in Detail

### AI Models
- **Image Generation**: Seedream V4, Flux Schnell, Qwen Image, Imagen4 Fast
- **Video Generation**: KAMUI Wan v2.2.5B Fast and more
- **Quality Options**: From ultra-fast (1-2s) to highest quality (15-20s)

### Natural Language Commands
```
"ドラゴンを右上に作って"     → AI generates dragon + places top-right
"桜を中央に配置"           → Cherry blossoms appear in center
"背景に森を生成"           → Forest background generation
"大きくして"               → Scale up selected object
"全て削除"                → Clear all generated content
```

### Integration Examples
- **Vanilla Three.js**: Basic integration with minimal setup
- **React Three Fiber**: Modern React workflow with hooks
- **A-Frame**: WebXR/VR scene compatibility
- **Next.js**: SSR-compatible integration

## 🚀 Advanced Usage

### Programmatic Control
```javascript
// Generate high-quality image
const result = await chocoDrop.client.generateImage('magical forest', {
  width: 1024,
  height: 1024,
  service: 't2i-kamui-seedream-v4'
});

// Generate video with custom settings
const video = await chocoDrop.client.generateVideo('flowing river', {
  duration: 5,
  aspect_ratio: '16:9',
  resolution: '720p'
});

// Execute natural language commands
await chocoDrop.client.executeCommand('Create a blue cat on the left side');

// Scene management
chocoDrop.sceneManager.clearAll(); // Clear all objects
const objects = chocoDrop.sceneManager.getObjects(); // Get object list
```

### Custom Materials & Shaders
```javascript
const chocoDrop = createChocoDrop(scene, {
  sceneOptions: {
    customRenderer: (imageUrl, position) => {
      // Custom 3D object creation logic
      const geometry = new THREE.PlaneGeometry(2, 2);
      const texture = new THREE.TextureLoader().load(imageUrl);
      const material = new THREE.ShaderMaterial({
        // Custom shader implementation
      });
      return new THREE.Mesh(geometry, material);
    }
  }
});
```

---

<a id="japanese"></a>

「ドラゴンを右上に」「桜を中央に」と言うだけで、必要なコンテンツを瞬時に3D空間に配置。配信演出、プロトタイピング、作品展示など、あなたの目的を実現するために「ちょこっと置く」「ちょこんとドロップ」できる手軽なサービスです。

## 🎮 System Architecture

### Core Components

**Backend Engine**
- **LiveCommandSystem** (`src/experimental/LiveCommandSystem.js`) - Command execution engine
- **MCPBridge** (`src/experimental/MCPBridge.js`) - AI generation API interface

**Frontend Interface**  
- **CommandUI** (`src/client/CommandUI.js`) - Browser UI (@ key to activate)
- **SceneManager** (`src/client/SceneManager.js`) - 3D scene integration
- **ChocoDropClient** (`src/client/LiveCommandClient.js`) - HTTP client (旧 LiveCommandClient)

### AI Generation Models

- **Seedream V4** - High-quality images (default, ~10-15s)
- **Flux Schnell** - Highest quality (~15-20s) 
- **Qwen Image** - Fast generation (~1-2s)
- **Imagen4 Fast** - Balanced quality/speed (~8-12s)
- **Gemini 2.5 Flash** - Google latest model (~8-12s)

### ✨ The Magic of "Choco Drop"
```
右上に大きなドラゴンを作って    → AI生成 → ちょこんとドロップ
中央に小さな桜を生成          → 桜が瞬間出現 → ちょこっと配置
既存の画像を読み込んで         → インポート → ちょこんと置く
空に鳳凰を作って             → 鳳凰をポンと空中にドロップ
地面に神社をちょこっと置いて    → 神社を地面にちょこんと設置
```

## Features

- 🎯 **ちょこんと配置** - 「右上に」「中央に」など自然言語で瞬時に3D空間配置
- 🎨 **AI生成 & インポート** - 新規作成も既存コンテンツも、どちらもちょこっとドロップ
- 🔄 **編集・調整** - 配置後のサイズ・位置・エフェクトをリアルタイム調整
- 🌐 **リアルタイム3D統合** - Three.js ベースの滑らかな3D体験
- 🎵 **音楽・エフェクト** - 動画コンテンツの音声制御と空間演出
- 📦 **フレームワーク非依存** - Three.js、React、Vue など既存プロジェクトに簡単統合
- 🎮 **直感的UI** - @ キーで起動する使いやすいコマンドインターフェース
- 🔗 **外部MCPサービス連携** - KAMUI Code等のMCPサービスからAI生成機能を利用
- 🎯 **日本語自然言語解析** - 日本語での直感的な空間指示に対応
- 📍 **カメラ相対位置システム** - 視点に応じた柔軟な配置システム

### Distribution Models

- **Shared Module:** ChocoDrop を独立フォルダや npm パッケージとして保守し、`createChocoDrop` で複数プロジェクトから共通利用。
- **Project Bundled:** 単体プロジェクトにコピーしてカスタマイズ。特殊案件ではローカルフォークとして併用可能。

## Quick Start

### Server Setup
```bash
cd packages/chocodrop
npm install
npm run dev
```

- `.claude/mcp-kamui-code.json` の場所は `config.local.json` か環境変数 `MCP_CONFIG_PATH` で設定できます（未設定時はホームディレクトリ配下を自動使用）。

### Client Integration (Shared Folder Friendly)
```javascript
import { createChocoDrop } from '@chocodrop/core';

const controls = new OrbitControls(camera, renderer.domElement);

const chocoDrop = createChocoDrop(scene, {
  camera,
  renderer,
  serverUrl: 'http://localhost:3011',
  onControlsToggle: (disabled) => {
    controls.enabled = !disabled;
  }
});

// 必要に応じてアクセス
chocoDrop.ui.show();
chocoDrop.client.generateImage('桜の森');
```

`createChocoDrop` は共有ディレクトリや npm パッケージとして配布した ChocoDrop を、任意の Three.js プロジェクトから数行で初期化するためのヘルパーです。サーバー URL を指定しなければ、クライアントが自動検出ロジックで解決します。

## API Documentation

### ChocoDropClient
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
