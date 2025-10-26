/**
 * VRButton - VRセッション開始ボタン
 * Three.js WebXR VRButton の独自実装（UMDビルド対応）
 */

export class VRButton {
  /**
   * VRボタンを作成
   * @param {THREE.WebGLRenderer} renderer - レンダラー
   * @param {Object} options - オプション
   * @returns {HTMLButtonElement}
   */
  static createButton(renderer, options = {}) {
    const button = document.createElement('button');

    // デフォルトスタイル
    button.style.cssText = `
      position: absolute;
      bottom: 20px;
      padding: 12px 24px;
      border: 1px solid white;
      border-radius: 4px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      font: normal 13px sans-serif;
      text-align: center;
      opacity: 0.9;
      outline: none;
      cursor: pointer;
      z-index: 999;
    `;

    // 位置の設定（オプション）
    if (options.bottom !== undefined) {
      button.style.bottom = options.bottom;
    }
    if (options.left !== undefined) {
      button.style.left = options.left;
    }
    if (options.right !== undefined) {
      button.style.right = options.right;
    } else if (!options.left) {
      button.style.left = '50%';
      button.style.transform = 'translateX(-50%)';
    }

    // ホバー効果
    button.onmouseenter = function() {
      button.style.opacity = '1.0';
    };
    button.onmouseleave = function() {
      button.style.opacity = '0.9';
    };

    // VRサポート状態の確認
    function checkVRSupport() {
      if ('xr' in navigator) {
        navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
          if (supported) {
            showEnterVR();
          } else {
            showVRNotSupported();
          }
        }).catch((error) => {
          console.error('VR support check failed:', error);
          showVRNotSupported();
        });
      } else {
        showWebXRNotFound();
      }
    }

    // VR入室可能状態の表示
    function showEnterVR() {
      button.textContent = 'ENTER VR';
      button.style.display = '';
      button.disabled = false;

      button.onclick = async function() {
        try {
          // VRセッション開始オプション
          const sessionInit = {
            optionalFeatures: [
              'local-floor',
              'bounded-floor',
              'hand-tracking',
              'layers',
              ...(options.optionalFeatures || [])
            ]
          };

          const session = await navigator.xr.requestSession('immersive-vr', sessionInit);

          // セッション終了イベント
          session.addEventListener('end', onSessionEnded);

          // レンダラーにセッションを設定
          await renderer.xr.setSession(session);

          // ボタン表示を変更
          button.textContent = 'EXIT VR';

          // ボタンクリックでセッション終了
          button.onclick = function() {
            session.end();
          };

        } catch (error) {
          console.error('Failed to start VR session:', error);
          if (options.onError) {
            options.onError(error);
          }
        }
      };
    }

    // VR終了時の処理
    function onSessionEnded() {
      button.textContent = 'ENTER VR';
      button.onclick = showEnterVR().onclick;

      if (options.onSessionEnd) {
        options.onSessionEnd();
      }
    }

    // VR非対応デバイス
    function showVRNotSupported() {
      button.textContent = 'VR NOT SUPPORTED';
      button.disabled = true;
      button.style.cursor = 'not-allowed';
      button.style.opacity = '0.5';
    }

    // WebXR未対応ブラウザ
    function showWebXRNotFound() {
      button.textContent = 'WEBXR NOT AVAILABLE';
      button.disabled = true;
      button.style.cursor = 'not-allowed';
      button.style.opacity = '0.5';

      if (window.isSecureContext === false) {
        button.textContent = 'WEBXR NEEDS HTTPS';
      }
    }

    // 初期化
    checkVRSupport();

    return button;
  }

  /**
   * レガシー互換性のための静的メソッド
   * @deprecated createButton を使用してください
   */
  static create(renderer, options) {
    return VRButton.createButton(renderer, options);
  }
}
