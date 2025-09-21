# ChocoDrop

**あらゆる3D空間に、コンテンツをちょこんとドロップ**

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
