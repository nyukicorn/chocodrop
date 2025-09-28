import React, { useRef, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Box, Sphere } from '@react-three/drei';
import { createChocoDrop } from 'chocodrop';

/**
 * ChocoDrop統合コンポーネント
 * React Three Fiberのシーンに ChocoDrop を統合
 */
function ChocoDropIntegration() {
  const { scene, camera, gl } = useThree();
  const chocoDropRef = useRef(null);
  const controlsRef = useRef(null);

  useEffect(() => {
    // ChocoDrop初期化
    const chocoDrop = createChocoDrop(scene, {
      camera,
      renderer: gl,
      serverUrl: 'http://localhost:3011', // 省略可能（自動検出）
      onControlsToggle: (disabled) => {
        // UI開閉時にOrbitControlsを制御
        if (controlsRef.current) {
          controlsRef.current.enabled = !disabled;
        }
      }
    });

    chocoDropRef.current = chocoDrop;

    // クリーンアップ
    return () => {
      chocoDrop.dispose();
    };
  }, [scene, camera, gl]);

  return (
    <>
      {/* React Three Fiberのコントロール */}
      <OrbitControls
        ref={controlsRef}
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
      />

      {/* 既存の3Dオブジェクト */}
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} />

      <Box position={[-2, 0, 0]} onClick={() => console.log('Box clicked')}>
        <meshStandardMaterial color="orange" />
      </Box>

      <Sphere position={[2, 0, 0]}>
        <meshStandardMaterial color="hotpink" />
      </Sphere>
    </>
  );
}

/**
 * メインアプリケーション
 */
function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas camera={{ position: [0, 0, 5] }}>
        <ChocoDropIntegration />
      </Canvas>

      {/* 使用方法ガイド */}
      <div style={{
        position: 'fixed',
        top: 10,
        left: 10,
        color: 'white',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        padding: '10px',
        borderRadius: '5px',
        fontSize: '14px',
        zIndex: 100
      }}>
        <h3>ChocoDrop + React Three Fiber</h3>
        <p><strong>@キー</strong> - コマンドUI起動</p>
        <p><strong>使用例:</strong></p>
        <ul>
          <li>"ドラゴンを右上に作って"</li>
          <li>"桜を中央に配置"</li>
          <li>"青い猫を左下に"</li>
        </ul>
      </div>
    </div>
  );
}

export default App;