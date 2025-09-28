import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SceneManager, CommandUI, createChocoDrop } from 'chocodrop';

/**
 * React Three.js Scene with ChocoDrop integration
 * This example demonstrates how to integrate ChocoDrop with React
*/
const ChocoDropScene = () => {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const sceneManagerRef = useRef(null);
  const commandUIRef = useRef(null);
  const animationIdRef = useRef(null);
  
  const [isReady, setIsReady] = useState(false);
  const [stats, setStats] = useState({
    objects: 0,
    commands: 0
  });

  useEffect(() => {
    if (!mountRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75, 
      window.innerWidth / window.innerHeight, 
      0.1, 
      1000
    );
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x87ceeb);
    
    mountRef.current.appendChild(renderer.domElement);
    
    // Environment setup
    scene.fog = new THREE.Fog(0x87ceeb, 50, 200);
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(50, 50, 50);
    directionalLight.castShadow = true;
    scene.add(directionalLight);
    
    // Ground
    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x90ee90 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    
    // Camera
    camera.position.set(0, 10, 20);
    
    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    
    // ChocoDrop Integration
    const sceneManager = new SceneManager(scene, {
      camera,
      renderer, // rendererを渡す
      serverUrl: 'http://localhost:3011',
      showLocationIndicator: true,
      indicatorDuration: 2000,
      enableMouseInteraction: true // マウス操作を明示的に有効化（オプション）
    });
    
    const commandUI = new CommandUI({
      sceneManager,
      activationKey: '@',
      position: 'bottom-right',
      onControlsToggle: (disabled) => {
        controls.enabled = !disabled;
      }
    });
    
    // Store refs
    sceneRef.current = scene;
    rendererRef.current = renderer;
    cameraRef.current = camera;
    controlsRef.current = controls;
    sceneManagerRef.current = sceneManager;
    commandUIRef.current = commandUI;
    
    // Animation loop
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      
      controls.update();
      renderer.render(scene, camera);
      
      // Update stats
      const objects = sceneManager.getSpawnedObjects();
      const commands = sceneManager.getCommandHistory();
      setStats({
        objects: objects.length,
        commands: commands.length
      });
    };
    
    animate();
    setIsReady(true);
    
    // Handle window resize
    const handleResize = () => {
      if (!camera || !renderer) return;
      
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    
    window.addEventListener('resize', handleResize);
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      
      if (commandUI) {
        commandUI.dispose();
      }
      
      if (sceneManager) {
        sceneManager.dispose();
      }
      
      if (controls) {
        controls.dispose();
      }
      
      if (renderer) {
        renderer.dispose();
      }
      
      if (mountRef.current && renderer) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  const clearAllObjects = () => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.clearAll();
    }
  };

  const showCommandHistory = () => {
    if (commandUIRef.current) {
      commandUIRef.current.showHistory();
    }
  };

  const showExamples = () => {
    if (commandUIRef.current) {
      commandUIRef.current.showExamples();
    }
  };

  return (
    <div className="live-command-scene">
      {/* Control Panel */}
      <div className="control-panel" style={{
        position: 'fixed',
        top: '10px',
        left: '10px',
        background: 'rgba(0, 0, 0, 0.8)',
        color: 'white',
        padding: '15px',
        borderRadius: '8px',
        fontFamily: 'monospace',
        fontSize: '14px',
        zIndex: 100
      }}>
        <h3 style={{ margin: '0 0 10px 0', color: '#4a90e2' }}>
          🧪 ChocoDrop
        </h3>
        
        <div style={{ marginBottom: '10px' }}>
          <strong>Status:</strong> {isReady ? '🟢 Ready' : '🟡 Loading...'}
        </div>
        
        <div style={{ marginBottom: '10px' }}>
          <strong>Objects:</strong> {stats.objects}<br/>
          <strong>Commands:</strong> {stats.commands}
        </div>
        
        <div style={{ marginBottom: '15px' }}>
          <strong>Activation:</strong> Press <code>@</code>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <button
            onClick={showExamples}
            style={{
              padding: '8px',
              background: '#4a90e2',
              border: 'none',
              borderRadius: '4px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Show Examples
          </button>
          
          <button
            onClick={showCommandHistory}
            style={{
              padding: '8px',
              background: '#95a5a6',
              border: 'none',
              borderRadius: '4px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Show History
          </button>
          
          <button
            onClick={clearAllObjects}
            style={{
              padding: '8px',
              background: '#e74c3c',
              border: 'none',
              borderRadius: '4px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Clear All
          </button>
        </div>
      </div>
      
      {/* Three.js mount point */}
      <div 
        ref={mountRef} 
        style={{ 
          width: '100vw', 
          height: '100vh',
          overflow: 'hidden'
        }} 
      />
    </div>
  );
};

/**
 * Main App Component
 */
const App = () => {
  return (
    <div className="app">
      <ChocoDropScene />
      
      {/* Instructions overlay */}
      <div style={{
        position: 'fixed',
        bottom: '10px',
        left: '10px',
        background: 'rgba(0, 0, 0, 0.7)',
        color: 'white',
        padding: '10px',
        borderRadius: '5px',
        fontFamily: 'Arial, sans-serif',
        fontSize: '12px',
        maxWidth: '300px'
      }}>
        <strong>使用方法:</strong><br/>
        • <code>@</code> キーでコマンド入力画面を表示<br/>
        • 例: 「右上にドラゴンを作って」<br/>
        • <code>Escape</code> でUI非表示<br/>
        • マウスでカメラ操作
      </div>
    </div>
  );
};

export default App;

// Usage instructions for package.json scripts:
/*
{
  "name": "live-command-react-example",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "three": "^0.158.0",
    "chocodrop": "file:../",
    "@vitejs/plugin-react": "^4.0.0",
    "vite": "^4.0.0"
  },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
*/

// Vite configuration (vite.config.js):
/*
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000
  }
});
*/
