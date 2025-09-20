/**
 * ChocoDro Client - サーバーとの通信クライアント
 */
export class ChocoDroClient {
  constructor(serverUrl = null) {
    this.serverUrl = null;
    this.initialized = false;
    this.initPromise = null;

    if (serverUrl) {
      this.serverUrl = serverUrl;
      this.initialized = true;
      console.log('🍫 ChocoDroClient initialized:', serverUrl);
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
        console.log('🍫 ChocoDroClient initialized from config:', this.serverUrl);
      } else {
        // フォールバック：ポート推測
        this.serverUrl = this.detectServerUrl();
        console.log('🍫 ChocoDroClient fallback to detected URL:', this.serverUrl);
      }
    } catch (error) {
      console.warn('⚠️ ChocoDro config fetch failed, using fallback:', error);
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

    if (currentPort === '3000') {
      return `${protocol}//${hostname}:3012`;
    }

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
    throw new Error('ChocoDroClient not initialized');
  }

  /**
   * 画像生成リクエスト
   */
  async generateImage(prompt, options = {}) {
    await this.ensureInitialized();
    console.log(`🎨 Requesting image generation: "${prompt}"`);

    try {
      const response = await fetch(`${this.serverUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt,
          width: options.width || 512,
          height: options.height || 512,
          // service: サーバー側のDEFAULT_MODELを使用（Seedream V4）
        })
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
      const response = await fetch(`${this.serverUrl}/api/generate-video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt,
          width: options.width || 512,
          height: options.height || 512,
          duration: options.duration || 3
          // model: サーバー側の設定を使用（image generationと同じパターン）
        })
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

export const LiveCommandClient = ChocoDroClient;
