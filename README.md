# ChocoDrop 🍫

> **AI-powered content drops for 3D scenes via natural language**
> あらゆる3D空間に、AIコンテンツをちょこんとドロップ

**✨ 30秒で始める** | **🎮 Examples** | **📚 API Reference**

---

## What is ChocoDrop?

Transform any Three.js scene into an AI-powered content studio:

```javascript
// Just say what you want in natural language
"猫の置物を右上に作って" → AI generates cat + places top-right
"桜を中央に配置" → Cherry blossoms appear instantly
"青いボールを大きくして" → Scales up blue ball
```

**Works with:** Three.js, React Three Fiber, A-Frame, Next.js, Vanilla HTML

---

## 🚀 Quick Start Guide

### Step 1: What's your project type?

<details>
<summary><strong>📄 HTML + Script Tags</strong> (Most Three.js tutorials)</summary>

```html
<!DOCTYPE html>
<html>
<head>
    <script src="https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/@chocodrop/core@latest/dist/chocodrop.umd.min.js"></script>
</head>
<body>
    <script>
        // Your existing Three.js scene
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer();

        // Add ChocoDrop (1 line!)
        const chocoDrop = ChocoDrop.createChocoDrop(scene, { camera, renderer });

        // Press Space key to start!
    </script>
</body>
</html>
```
</details>

<details>
<summary><strong>📦 npm / Modern JavaScript</strong> (React, Vite, Webpack)</summary>

```bash
npm install @chocodrop/core
```

```javascript
import { createChocoDrop } from '@chocodrop/core';

// Your existing Three.js scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(/* ... */);
const renderer = new THREE.WebGLRenderer();

// Add ChocoDrop (1 line!)
const chocoDrop = createChocoDrop(scene, { camera, renderer });

// Press Space key to start!
```
</details>

### Step 2: Try it out

1. **Press `Space` key** → Command UI appears
2. **Type:** `"猫の置物を置いて"` or `"Add a blue cube"`
3. **Watch** → AI generates and places content instantly

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🎯 **Natural Language 3D** | "top-right", "center", "behind camera" positioning |
| 🎨 **Multiple AI Models** | Flux, DALL-E, Stable Diffusion, Video generation |
| 🔄 **Real-time Editing** | Modify size, position, effects after placement |
| 📦 **Framework Agnostic** | Works with any Three.js setup |
| 🌐 **MCP Integration** | Extensible AI model support |
| 🎮 **Intuitive UI** | Space key activation, no learning curve |

---

## 📖 Complete Examples

### Basic HTML Example
```html
<!DOCTYPE html>
<html>
<head>
    <style>
        body { margin: 0; background: #000; overflow: hidden; }
        #container { width: 100vw; height: 100vh; }
    </style>
</head>
<body>
    <div id="container"></div>

    <!-- Three.js -->
    <script src="https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.170.0/examples/js/controls/OrbitControls.js"></script>

    <!-- ChocoDrop -->
    <script src="https://cdn.jsdelivr.net/npm/@chocodrop/core@latest/dist/chocodrop.umd.min.js"></script>

    <script>
        // Scene setup
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a2e);

        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 2, 5);

        const renderer = new THREE.WebGLRenderer();
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.getElementById('container').appendChild(renderer.domElement);

        // Controls
        const controls = new THREE.OrbitControls(camera, renderer.domElement);

        // ChocoDrop initialization
        const chocoDrop = ChocoDrop.createChocoDrop(scene, {
            camera: camera,
            renderer: renderer,
            onControlsToggle: (disabled) => {
                controls.enabled = !disabled;
            }
        });

        // Render loop
        function animate() {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        }
        animate();

        console.log('✅ ChocoDrop ready! Press Space key to start.');
    </script>
</body>
</html>
```

### React Three Fiber Example
```jsx
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { createChocoDrop } from '@chocodrop/core';
import { useEffect, useRef } from 'react';

function Scene() {
  const sceneRef = useRef();

  useEffect(() => {
    if (sceneRef.current) {
      const chocoDrop = createChocoDrop(sceneRef.current, {
        camera: /* camera ref */,
        renderer: /* renderer ref */
      });
    }
  }, []);

  return (
    <Canvas ref={sceneRef}>
      <OrbitControls />
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} />
    </Canvas>
  );
}
```

---

## 🎯 Natural Language Commands

### English Commands
```javascript
"Add a dragon in the top-right"     // → AI generates dragon + places top-right
"Place cherry blossoms in center"   // → Cherry blossoms appear in center
"Create a magical forest"           // → Forest background generation
"Make it bigger"                    // → Scale up selected object
"Delete everything"                 // → Clear all generated content
```

### Japanese Commands
```javascript
"ドラゴンを右上に作って"              // → AI generates dragon + places top-right
"桜を中央に配置"                    // → Cherry blossoms appear in center
"背景に森を生成"                    // → Forest background generation
"大きくして"                       // → Scale up selected object
"全て削除"                         // → Clear all generated content
```

---

## 🔧 API Reference

### createChocoDrop(scene, options)

**Parameters:**
```typescript
scene: THREE.Scene              // Your Three.js scene
options: {
  camera?: THREE.Camera         // Camera for positioning calculations
  renderer?: THREE.Renderer     // Renderer for mouse interactions
  serverUrl?: string           // ChocoDrop server URL (default: auto-detect)
  onControlsToggle?: Function  // Camera controls toggle callback
  sceneOptions?: Object        // Additional SceneManager options
  uiOptions?: Object          // Additional CommandUI options
}
```

**Returns:**
```typescript
{
  client: ChocoDropClient       // HTTP client for AI generation
  sceneManager: SceneManager    // 3D scene management
  ui: CommandUI                // Command interface
}
```

### ChocoDropClient Methods

```javascript
// Generate AI images
await chocoDrop.client.generateImage('magical forest', {
  width: 1024,
  height: 1024,
  service: 't2i-kamui-seedream-v4'
});

// Execute natural language commands
await chocoDrop.client.executeCommand('Create a blue cat on the left');

// Generate videos
await chocoDrop.client.generateVideo('flowing river', {
  duration: 5,
  aspect_ratio: '16:9'
});
```

### SceneManager Methods

```javascript
// Scene management
chocoDrop.sceneManager.clearAll();                    // Clear all objects
const objects = chocoDrop.sceneManager.getObjects();  // Get object list
chocoDrop.sceneManager.removeObject(objectId);        // Remove specific object
```

### CommandUI Methods

```javascript
// UI control
chocoDrop.ui.show();                    // Show command interface
chocoDrop.ui.hide();                    // Hide command interface
chocoDrop.ui.toggle();                  // Toggle visibility
```

---

## 🛠️ Server Setup (Optional)

If you want to run your own ChocoDrop server:

```bash
git clone https://github.com/nyukicorn/chocodrop.git
cd chocodrop
npm install
npm start
```

The server will start at `http://localhost:3011`

**Requirements:**
- Node.js 16+
- MCP configuration for AI models

---

## 🎮 AI Models Available

| Model | Speed | Quality | Use Case |
|-------|-------|---------|----------|
| **Qwen Image** | ~1-2s | Good | Rapid prototyping |
| **Imagen4 Fast** | ~8-12s | High | Balanced quality/speed |
| **Seedream V4** | ~10-15s | Very High | Production content |
| **Flux Schnell** | ~15-20s | Highest | Premium quality |

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🔗 Links

- **GitHub:** https://github.com/nyukicorn/chocodrop
- **npm:** https://www.npmjs.com/package/@chocodrop/core
- **Examples:** [examples/](examples/)
- **Issues:** [GitHub Issues](https://github.com/nyukicorn/chocodrop/issues)

---

**Made with ❤️ for the Three.js community**