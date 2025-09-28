# React Three Fiber + ChocoDrop

React Three Fiberプロジェクトに ChocoDrop を統合する例です。

## 🚀 セットアップ

### 1. 依存関係インストール

```bash
npm install react react-dom
npm install @react-three/fiber @react-three/drei three
npm install chocodrop
```

### 2. 開発環境

```bash
npm install -D vite @vitejs/plugin-react
```

### 3. Vite設定 (vite.config.js)

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['chocodrop']
  }
});
```

## 🎮 使用方法

### 基本統合

```jsx
import { useThree } from '@react-three/fiber';
import { createChocoDrop } from 'chocodrop';

function ChocoDropIntegration() {
  const { scene, camera, gl } = useThree();

  useEffect(() => {
    const chocoDrop = createChocoDrop(scene, {
      camera,
      renderer: gl,
      onControlsToggle: (disabled) => {
        // OrbitControls制御
        controlsRef.current.enabled = !disabled;
      }
    });

    return () => chocoDrop.dispose();
  }, [scene, camera, gl]);

  return <OrbitControls ref={controlsRef} />;
}
```

### フック化

```jsx
import { useChocoDrop } from './hooks/useChocoDrop';

function Scene() {
  const chocoDropRef = useChocoDrop({
    serverUrl: 'http://localhost:3011'
  });

  const handleGenerateImage = async () => {
    if (chocoDropRef.current) {
      await chocoDropRef.current.client.generateImage('beautiful landscape');
    }
  };

  return (
    <>
      <OrbitControls />
      <button onClick={handleGenerateImage}>Generate Landscape</button>
    </>
  );
}
```

## 🔧 カスタムフック例

### useChocoDrop.js

```javascript
import { useRef, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { createChocoDrop } from 'chocodrop';

export function useChocoDrop(options = {}) {
  const { scene, camera, gl } = useThree();
  const chocoDropRef = useRef(null);
  const controlsRef = useRef(null);

  useEffect(() => {
    const chocoDrop = createChocoDrop(scene, {
      camera,
      renderer: gl,
      onControlsToggle: (disabled) => {
        if (controlsRef.current) {
          controlsRef.current.enabled = !disabled;
        }
      },
      ...options
    });

    chocoDropRef.current = chocoDrop;

    return () => {
      chocoDrop.dispose();
    };
  }, [scene, camera, gl]);

  return { chocoDropRef, controlsRef };
}
```

## 🎨 統合パターン

### 1. 基本統合

```jsx
function App() {
  return (
    <Canvas>
      <ChocoDropIntegration />
      <Box position={[0, 0, 0]} />
    </Canvas>
  );
}
```

### 2. State管理統合

```jsx
import { atom, useAtom } from 'jotai';

const chocoDropAtom = atom(null);

function Scene() {
  const [chocoDrop, setChocoDrop] = useAtom(chocoDropAtom);
  const { scene, camera, gl } = useThree();

  useEffect(() => {
    const instance = createChocoDrop(scene, { camera, renderer: gl });
    setChocoDrop(instance);
    return () => instance.dispose();
  }, []);

  return <OrbitControls />;
}
```

### 3. コンテキスト統合

```jsx
const ChocoDropContext = createContext(null);

export function ChocoDropProvider({ children }) {
  const [chocoDrop, setChocoDrop] = useState(null);

  return (
    <ChocoDropContext.Provider value={chocoDrop}>
      <Canvas>
        <ChocoDropSetup onReady={setChocoDrop} />
        {children}
      </Canvas>
    </ChocoDropContext.Provider>
  );
}

export function useChocoDropContext() {
  return useContext(ChocoDropContext);
}
```

## 🎭 イベント処理

### UI状態管理

```jsx
function ChocoDropUI() {
  const [isUIOpen, setIsUIOpen] = useState(false);
  const chocoDrop = useChocoDrop({
    onControlsToggle: (disabled) => {
      setIsUIOpen(disabled);
    }
  });

  return (
    <>
      {isUIOpen && (
        <div className="ui-overlay">
          ChocoDrop UI is active
        </div>
      )}
    </>
  );
}
```

### カスタムコマンド

```jsx
function CustomCommands() {
  const { chocoDropRef } = useChocoDrop();

  const handleCustomCommand = async (command) => {
    if (chocoDropRef.current) {
      await chocoDropRef.current.client.executeCommand(command);
    }
  };

  return (
    <div>
      <button onClick={() => handleCustomCommand('ドラゴンを作って')}>
        ドラゴン生成
      </button>
      <button onClick={() => handleCustomCommand('全て削除')}>
        全削除
      </button>
    </div>
  );
}
```

## 🏗️ TypeScript 対応

### 型定義

```typescript
import { RefObject } from 'react';
import { Object3D } from 'three';

interface ChocoDropInstance {
  client: ChocoDropClient;
  sceneManager: SceneManager;
  ui: CommandUI;
  dispose: () => void;
}

interface UseChocoDropReturn {
  chocoDropRef: RefObject<ChocoDropInstance | null>;
  controlsRef: RefObject<any>;
}

export function useChocoDrop(options?: ChocoDropOptions): UseChocoDropReturn;
```

## 🔧 トラブルシューティング

### よくある問題

1. **レンダラーの取得に失敗**
```jsx
// ✅ 正しい
const { gl } = useThree();

// ❌ 間違い
const renderer = new THREE.WebGLRenderer();
```

2. **コントロールの競合**
```jsx
// ✅ 正しい
onControlsToggle: (disabled) => {
  controlsRef.current.enabled = !disabled;
}

// ❌ 間違い - コントロール無効化なし
onControlsToggle: () => {}
```

3. **依存関係の問題**
```bash
# Three.jsバージョン確認
npm ls three

# React Three Fiber互換性確認
npm ls @react-three/fiber
```

## 📚 関連リンク

- [React Three Fiber 公式](https://docs.pmnd.rs/react-three-fiber)
- [Three.js Drei 公式](https://github.com/pmndrs/drei)
- [ChocoDrop API](../docs/API.md)