/**
 * ChocoDrop Client - サーバーとの通信クライアント
 */
export class ChocoDropClient {
  constructor(serverUrl = null) {
    this.serverUrl = null;
    this.initialized = false;
    this.initPromise = null;

    if (serverUrl) {
      this.serverUrl = serverUrl;
      this.initialized = true;
      console.log('🍫 ChocoDropClient initialized:', serverUrl);
    } else {
      // 設定取得を遅延実行（Promiseを保存）
      this.initPromise = this.initializeWithConfig();
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
    const hint = 'ChocoDrop ローカルサーバー（Express）が起動しているか確認してください（例: `npm run dev`）。';
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
          // ignore
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
      const payload = {
        prompt,
        width: options.width || 512,
        height: options.height || 512,
        duration: options.duration || 3
      };

      if (options.model) {
        payload.model = options.model;
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
