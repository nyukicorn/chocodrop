/**
 * ChocoDrop Client - サーバーとの通信クライアント
 */
export class ChocoDropClient {
  constructor(serverUrl = null, sceneManager = null, options = {}) {
    this.serverUrl = null;
    this.sceneManager = sceneManager;
    this.initialized = false;
    this.initPromise = null;
    this.enableServerHealthCheck = options.enableServerHealthCheck !== false; // デフォルトtrue

    if (serverUrl) {
      this.serverUrl = serverUrl;
      this.initialized = true;
      console.log('🍫 ChocoDropClient initialized:', serverUrl);
    } else if (this.enableServerHealthCheck) {
      // サーバーヘルスチェックが有効な場合のみ設定取得を試みる
      this.initPromise = this.initializeWithConfig();
    } else {
      // サーバーヘルスチェック無効の場合はnullのまま（静的サイト用）
      this.serverUrl = null;
      this.initialized = true;
      console.log('🍫 ChocoDropClient initialized without server (static site mode)');
    }
  }

  /**
   * サーバーから設定を取得して初期化
   */
  async initializeWithConfig() {
    try {
      // 現在のページのホストとポートを基準に設定API呼び出し
      const baseUrl = `${window.location.protocol}//${window.location.hostname}:${window.location.port}`;

      const response = await fetch(`${baseUrl}/api/config`);
      if (response.ok) {
        const config = await response.json();
        this.serverUrl = config.serverUrl;
        console.log('🍫 ChocoDropClient initialized from config:', this.serverUrl);
      } else {
        // フォールバック：ポート推測
        this.serverUrl = this.detectServerUrl();
        console.log('🍫 ChocoDropClient fallback to detected URL:', this.serverUrl);
      }
    } catch (error) {
      console.warn('⚠️ ChocoDrop config fetch failed, using fallback:', error);
      this.serverUrl = this.detectServerUrl();
    }

    this.initialized = true;
  }

  /**
   * サーバーURL自動検出（フォールバック）
   */
  detectServerUrl() {
    const currentPort = window.location.port;
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;

    // ポートが未指定の場合（ファイルプロトコル等）は既定の 3011 を使用
    if (!currentPort) {
      return `${protocol}//${hostname}:3011`;
    }

    return `${protocol}//${hostname}:${currentPort}`;
  }

  /**
   * 初期化完了を待機
   */
  async ensureInitialized() {
    if (this.initialized) return;

    // initPromiseがあれば待機
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    // フォールバック：初期化されていない場合はエラー
    throw new Error('ChocoDropClient not initialized');
  }

  /**
   * ネットワークエラーを検出して利用者向けメッセージに変換
   */
  createConnectionError(context) {
    const serverInfo = this.serverUrl ? `（接続先: ${this.serverUrl}）` : '';
    const hint = 'ChocoDrop ローカルサーバー（Express）が起動しているか確認してください（例: `npm run dev:server`）。';
    return new Error(`${context}\nサーバーへ接続できません。${hint}${serverInfo}`);
  }

  isNetworkError(error) {
    if (!error) return false;
    const message = typeof error.message === 'string' ? error.message : '';
    return (
      error.name === 'TypeError' ||
      message.includes('Failed to fetch') ||
      message.includes('NetworkError') ||
      message.includes('connect ECONNREFUSED') ||
      message.includes('ERR_CONNECTION')
    );
  }

  handleRequestError(error, context) {
    if (this.isNetworkError(error)) {
      const connectionError = this.createConnectionError(context);
      connectionError.code = 'LOCAL_SERVER_UNREACHABLE';
      connectionError.cause = error;
      return connectionError;
    }
    if (error instanceof Error) {
      return error;
    }
    return new Error(context);
  }

  /**
   * 画像生成リクエスト
   */
  async generateImage(prompt, options = {}) {
    await this.ensureInitialized();
    console.log(`🎨 Requesting image generation: "${prompt}"`);

    try {
      const payload = {
        prompt,
        width: options.width || 512,
        height: options.height || 512
      };

      if (options.service) {
        payload.service = options.service;
      }

      const response = await fetch(`${this.serverUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        let errorPayload = null;
        try {
          errorPayload = await response.json();
        } catch (parseError) {
          // ignore JSON parse errors
        }
        const serverError = new Error(errorPayload?.error || `Server error: ${response.status}`);
        if (errorPayload?.errorCategory) {
          serverError.code = errorPayload.errorCategory;
        }
        throw serverError;
      }

      const result = await response.json();
      console.log('✅ Image generation result:', result);
      
      return result;

    } catch (error) {
      console.error('❌ Image generation request failed:', error);
      throw this.handleRequestError(error, '画像生成リクエストに失敗しました。');
    }
  }

  /**
   * 動画生成リクエスト
   */
  async generateVideo(prompt, options = {}) {
    await this.ensureInitialized();
    console.log(`🎬 Requesting video generation: "${prompt}"`);

    try {
      const safeDefaults = {
        // aspect_ratio: サーバー側で各モデル最適な比率を自動選択
        resolution: '720p',
        enable_safety_checker: true,
        enable_prompt_expansion: true
      };

      const payload = {
        prompt,
        duration: typeof options.duration === 'number' && options.duration > 0 ? options.duration : 3,
        resolution: options.resolution || safeDefaults.resolution,
        enable_safety_checker: options.enable_safety_checker ?? safeDefaults.enable_safety_checker,
        enable_prompt_expansion: options.enable_prompt_expansion ?? safeDefaults.enable_prompt_expansion
      };

      // ユーザーが明示的にアスペクト比を指定した場合のみ追加
      if (options.aspect_ratio) {
        payload.aspect_ratio = options.aspect_ratio;
      }
      // それ以外はサーバー側で各モデルに最適な比率を自動選択

      if (options.model) {
        payload.model = options.model;
      }

      if (typeof options.width === 'number' && options.width > 0) {
        payload.width = options.width;
      }

      if (typeof options.height === 'number' && options.height > 0) {
        payload.height = options.height;
      }

      if (typeof options.seed === 'number') {
        payload.seed = options.seed;
      }

      if (options.negative_prompt) {
        payload.negative_prompt = options.negative_prompt;
      }

      if (typeof options.frames_per_second === 'number' && options.frames_per_second > 0) {
        payload.frames_per_second = options.frames_per_second;
      }

      if (typeof options.guidance_scale === 'number') {
        payload.guidance_scale = options.guidance_scale;
      }

      const response = await fetch(`${this.serverUrl}/api/generate-video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        let errorPayload = null;
        try {
          errorPayload = await response.json();
        } catch (parseError) {
          // ignore
        }
        const serverError = new Error(errorPayload?.error || `Server error: ${response.status}`);
        if (errorPayload?.errorCategory) {
          serverError.code = errorPayload.errorCategory;
        }
        throw serverError;
      }

      const result = await response.json();
      console.log('✅ Video generation result:', result);
      
      return result;

    } catch (error) {
      console.error('❌ Video generation request failed:', error);
      throw this.handleRequestError(error, '動画生成リクエストに失敗しました。');
    }
  }

  /**
   * 自然言語コマンド実行
   */
  async executeCommand(command) {
    await this.ensureInitialized();
    console.log(`🎯 Executing command: "${command}"`);

    try {
      const response = await fetch(`${this.serverUrl}/api/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ command })
      });

      if (!response.ok) {
        let errorPayload = null;
        try {
          errorPayload = await response.json();
        } catch (parseError) {
          // ignore
        }
        const serverError = new Error(errorPayload?.error || `Server error: ${response.status}`);
        if (errorPayload?.errorCategory) {
          serverError.code = errorPayload.errorCategory;
        }
        throw serverError;
      }

      const result = await response.json();
      console.log('✅ Command execution result:', result);
      
      return result;

    } catch (error) {
      console.error('❌ Command execution failed:', error);
      throw this.handleRequestError(error, 'コマンド実行に失敗しました。');
    }
  }

  /**
   * 選択されたオブジェクトを変更
   */
  async modifySelectedObject(selectedObject, command) {
    await this.ensureInitialized();
    console.log(`🔧 Modifying selected object: "${command}"`);

    try {
      // SceneManagerの統合コマンド処理機能を使用
      if (this.sceneManager) {
        console.log('🎨 Using SceneManager integrated command processing');
        
        // SceneManagerのparseCommandでコマンドを解析（変更モードを明示）
        const trimmedCommand = typeof command === 'string' ? command.trim() : '';
        const commandForParsing = trimmedCommand.startsWith('[変更]')
          ? trimmedCommand
          : `[変更] ${trimmedCommand}`;

        const parsed = this.sceneManager.parseCommand(commandForParsing);
        console.log('🔍 Parsed command result:', parsed);
        
        if (parsed && (parsed.color !== null || (parsed.effects && parsed.effects.length > 0) || parsed.movement !== null)) {
          // 選択されたオブジェクトに直接適用
          let modified = false;
          
          // 色変更
          if (parsed.color !== null && selectedObject.material) {
            if (selectedObject.material.map) {
              selectedObject.material.color.setHex(parsed.color);
              selectedObject.material.needsUpdate = true;
              console.log(`🎨 Texture color tint changed to: #${parsed.color.toString(16)}`);
            } else {
              selectedObject.material.color.setHex(parsed.color);
              selectedObject.material.needsUpdate = true;
              console.log(`🎨 Material color changed to: #${parsed.color.toString(16)}`);
            }
            modified = true;
          }

          // エフェクト適用
          if (parsed.effects && parsed.effects.length > 0) {
            const effectsApplied = this.sceneManager.applyEffects(selectedObject, parsed.effects);
            if (effectsApplied) {
              modified = true;
            }
          }
          
          // 位置移動
          if (parsed.movement !== null) {
            const currentPos = selectedObject.position;
            const newPos = {
              x: currentPos.x + parsed.movement.x,
              y: currentPos.y + parsed.movement.y,
              z: currentPos.z + parsed.movement.z
            };
            selectedObject.position.set(newPos.x, newPos.y, newPos.z);
            console.log(`📍 Object moved to: (${newPos.x.toFixed(2)}, ${newPos.y.toFixed(2)}, ${newPos.z.toFixed(2)})`);
            modified = true;
          }
          
          if (modified) {
            console.log('✅ Object modification applied successfully');
            return {
              success: true,
              message: 'オブジェクトを変更しました',
              isClientSideEffect: true
            };
          }
        }
      }

      // SceneManagerで処理できない場合は、サーバー側で処理（画像再生成）
      console.log('🔄 Falling back to server-side processing');
      const modifyCommand = `${command} (対象オブジェクト: ${selectedObject?.userData?.objectId || selectedObject?.id || 'unknown'})`;

      const response = await fetch(`${this.serverUrl}/api/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ command: modifyCommand })
      });

      if (!response.ok) {
        let errorPayload = null;
        try {
          errorPayload = await response.json();
        } catch (parseError) {
          // ignore
        }
        const serverError = new Error(errorPayload?.error || `Server error: ${response.status}`);
        if (errorPayload?.errorCategory) {
          serverError.code = errorPayload.errorCategory;
        }
        throw serverError;
      }

      const result = await response.json();
      console.log('✅ Object modification result:', result);

      return result;

    } catch (error) {
      console.error('❌ Object modification failed:', error);
      throw this.handleRequestError(error, 'オブジェクト変更リクエストに失敗しました。');
    }
  }

  /**
   * 利用可能なサービス一覧取得
   */
  async getAvailableServices() {
    await this.ensureInitialized();
    try {
      const response = await fetch(`${this.serverUrl}/api/services`);

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      return await response.json();

    } catch (error) {
      console.error('❌ Failed to get services:', error);
      return [];
    }
  }
}

// 後方互換のため旧名称もエクスポート
export const LiveCommandClient = ChocoDropClient;
export const ChocoDroClient = ChocoDropClient;
