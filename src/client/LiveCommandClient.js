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
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ Image generation result:', result);
      
      return result;

    } catch (error) {
      console.error('❌ Image generation request failed:', error);
      throw error;
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
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ Video generation result:', result);
      
      return result;

    } catch (error) {
      console.error('❌ Video generation request failed:', error);
      throw error;
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
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ Command execution result:', result);
      
      return result;

    } catch (error) {
      console.error('❌ Command execution failed:', error);
      throw error;
    }
  }

  /**
   * 選択されたオブジェクトを変更
   */
  async modifySelectedObject(selectedObject, command) {
    await this.ensureInitialized();
    console.log(`🔧 Modifying selected object: "${command}"`);

    try {
      // 既存の /api/command エンドポイントを使用
      // オブジェクト情報をコマンドのコンテキストとして含める
      const modifyCommand = `${command} (対象オブジェクト: ${selectedObject?.userData?.objectId || selectedObject?.id || 'unknown'})`;

      const response = await fetch(`${this.serverUrl}/api/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ command: modifyCommand })
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ Object modification result:', result);

      return result;

    } catch (error) {
      console.error('❌ Object modification failed:', error);
      throw error;
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
