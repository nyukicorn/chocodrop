(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('three')) :
  typeof define === 'function' && define.amd ? define(['exports', 'three'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.ChocoDrop = {}, global.THREE));
})(this, (function (exports, THREEModule) { 'use strict';

  function _interopNamespaceDefault(e) {
    var n = Object.create(null);
    if (e) {
      Object.keys(e).forEach(function (k) {
        if (k !== 'default') {
          var d = Object.getOwnPropertyDescriptor(e, k);
          Object.defineProperty(n, k, d.get ? d : {
            enumerable: true,
            get: function () { return e[k]; }
          });
        }
      });
    }
    n.default = e;
    return Object.freeze(n);
  }

  var THREEModule__namespace = /*#__PURE__*/_interopNamespaceDefault(THREEModule);

  /**
   * ChocoDrop Client - サーバーとの通信クライアント
   */
  class ChocoDropClient {
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
  const LiveCommandClient = ChocoDropClient;
  const ChocoDroClient = ChocoDropClient;

  /**
   * ChocoDrop 共通翻訳辞書
   * サーバー・クライアント共通で使用する日本語→英語翻訳辞書
   */

  const TRANSLATION_DICTIONARY = {
    // ファンタジー・魔法系
    'ユニコーン': 'unicorn',
    'ドラゴン': 'dragon',
    '龍': 'dragon',
    '怪獣': 'monster',
    'モンスター': 'monster',
    '魔法使い': 'wizard',
    '魔術師': 'sorcerer',
    '魔女': 'witch',
    '妖精': 'fairy',
    '🧚': 'fairy',
    '🧙': 'wizard',
    '魔法杖': 'magic wand',
    '杖': 'wand',
    'スタッフ': 'staff',
    '魔法': 'magic',
    '呪文': 'spell',
    '魔法陣': 'magic circle',
    '水晶玉': 'crystal ball',
    '薬瓶': 'potion bottle',
    '魔導書': 'grimoire',
    'フェニックス': 'phoenix',
    'グリフィン': 'griffin',
    'ペガサス': 'pegasus',
    'ケルベロス': 'cerberus',

    // 動物
    '画像': 'image',
    '写真': 'photo',
    'イメージ': 'image',
    '絵': 'picture',
    'ファイル': 'file',
    'メディア': 'media',
    '素材': 'asset',
    '動画': 'video',
    'ビデオ': 'video',
    'ムービー': 'movie',
    '映像': 'video',
    'クリップ': 'clip',
    '猫': 'cat',
    'ネコ': 'cat',
    'ねこ': 'cat',
    '犬': 'dog',
    'イヌ': 'dog',
    'いぬ': 'dog',
    '狼': 'wolf',
    '熊': 'bear',
    'ライオン': 'lion',
    'トラ': 'tiger',
    '象': 'elephant',
    'キリン': 'giraffe',
    'シマウマ': 'zebra',
    'パンダ': 'panda',
    'ウサギ': 'rabbit',
    'リス': 'squirrel',
    'ハムスター': 'hamster',
    'フクロウ': 'owl',
    'ワシ': 'eagle',
    'カラス': 'crow',
    'ハト': 'dove',
    'ペンギン': 'penguin',
    'イルカ': 'dolphin',
    'クジラ': 'whale',
    'サメ': 'shark',
    'タコ': 'octopus',
    'カニ': 'crab',
    'エビ': 'shrimp',

    // 自然・風景
    '花': 'flower',
    'はな': 'flower',
    'ハナ': 'flower',
    '桜': 'cherry blossom',
    'バラ': 'rose',
    'ひまわり': 'sunflower',
    'チューリップ': 'tulip',
    '雲': 'cloud',
    '空': 'sky',
    '海': 'ocean',
    '湖': 'lake',
    '川': 'river',
    '山': 'mountain',
    'やま': 'mountain',
    'ヤマ': 'mountain',
    '森': 'forest',
    '木': 'tree',
    'き': 'tree',
    'キ': 'tree',
    '草原': 'meadow',
    '砂漠': 'desert',
    '滝': 'waterfall',
    '洞窟': 'cave',
    '島': 'island',
    '星座': 'constellation',
    '銀河': 'galaxy',
    '惑星': 'planet',

    // 建物・場所
    '城': 'castle',
    'しろ': 'castle',
    'シロ': 'castle',
    '宮殿': 'palace',
    '家': 'house',
    '塔': 'tower',
    '教会': 'church',
    '神殿': 'temple',
    '図書館': 'library',
    '学校': 'school',
    '病院': 'hospital',
    '駅': 'station',
    '空港': 'airport',
    '港': 'port',
    '橋': 'bridge',
    '灯台': 'lighthouse',
    '風車': 'windmill',
    '庭': 'garden',
    '公園': 'park',
    '遊園地': 'amusement park',

    // 乗り物
    '車': 'car',
    '電車': 'train',
    'バス': 'bus',
    '飛行機': 'airplane',
    'ヘリコプター': 'helicopter',
    '船': 'ship',
    'ヨット': 'yacht',
    '自転車': 'bicycle',
    'バイク': 'motorcycle',
    'ロケット': 'rocket',

    // 天体・時間
    '月': 'moon',
    '太陽': 'sun',
    '星': 'star',
    '彗星': 'comet',
    '流れ星': 'shooting star',
    '虹': 'rainbow',
    '雷': 'lightning',
    '雪': 'snow',
    '雨': 'rain',
    '嵐': 'storm',
    '霧': 'fog',
    '氷': 'ice',
    '火': 'fire',
    '水': 'water',
    '風': 'wind',
    '光': 'light',
    '影': 'shadow',
    '夜': 'night',
    '朝': 'morning',
    '夕方': 'evening',

    // 色・素材
    '赤': 'red',
    '青': 'blue',
    '緑': 'green',
    '黄色': 'yellow',
    '白': 'white',
    '黒': 'black',
    '紫': 'purple',
    'ピンク': 'pink',
    'オレンジ': 'orange',
    '茶色': 'brown',
    'グレー': 'gray',
    '金': 'gold',
    '銀': 'silver',
    'プラチナ': 'platinum',
    '銅': 'copper',
    '鉄': 'iron',
    '石': 'stone',
    '木材': 'wood',
    'ガラス': 'glass',
    '水晶': 'crystal',
    'ダイヤモンド': 'diamond',

    // 鳥類
    '鳥': 'bird',
    'とり': 'bird',
    'トリ': 'bird'
  };

  /**
   * オブジェクト識別用のエイリアス辞書（拡張版）
   * 翻訳辞書から逆マッピングを生成し、エイリアスも含める
   */
  function createObjectKeywords() {
    const keywords = {};

    // 翻訳辞書から逆マッピングを作成
    for (const [japanese, english] of Object.entries(TRANSLATION_DICTIONARY)) {
      // 英語をキーとして日本語とエイリアスを格納
      if (!keywords[japanese]) {
        keywords[japanese] = [];
      }

      // 英語の翻訳を追加
      if (!keywords[japanese].includes(english)) {
        keywords[japanese].push(english);
      }
    }

    return keywords;
  }

  /**
   * 日本語キーワードを英語に翻訳
   */
  function translateKeyword(japanese) {
    return TRANSLATION_DICTIONARY[japanese] || japanese;
  }

  /**
   * ファイル名と日本語キーワードをマッチング
   */
  function matchKeywordWithFilename(keyword, filename, keywords) {
    const lowerFilename = filename.toLowerCase();

    // 直接マッチ
    if (lowerFilename.includes(keyword.toLowerCase())) {
      return true;
    }

    // キーワード辞書での相互マッチ
    for (const [jp, aliases] of Object.entries(keywords)) {
      // キーワードが日本語の場合、対応する英語エイリアスをファイル名で探す
      if (keyword.includes(jp)) {
        for (const alias of aliases) {
          if (lowerFilename.includes(alias.toLowerCase())) {
            return true;
          }
        }
      }
    }

    // 翻訳辞書での直接マッチ
    const englishKeyword = translateKeyword(keyword);
    if (englishKeyword !== keyword && lowerFilename.includes(englishKeyword.toLowerCase())) {
      return true;
    }

    return false;
  }

  // CommonJS (サーバー用)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TRANSLATION_DICTIONARY, createObjectKeywords, translateKeyword, matchKeywordWithFilename };
  }

  const LEVELS = ['debug', 'info', 'warn', 'error'];
  const PREFIX = '[ChocoDrop]';

  function createPrinter(level, context) {
    const fn = console[level] || console.log;
    return (...args) => fn(`${PREFIX}${context ? `:${context}` : ''}`, ...args);
  }

  function createLogger(context = '') {
    const ctxLabel = context ? `:${context}` : '';
    const logger = {};
    LEVELS.forEach(level => {
      logger[level] = createPrinter(level, ctxLabel);
    });
    logger.child = childContext => createLogger(context ? `${context}/${childContext}` : childContext);
    return logger;
  }

  const logger = createLogger('core');

  const log = logger.child('xrbridge');

  const XR_MODES = {
    vr: 'immersive-vr',
    ar: 'immersive-ar'
  };

  const DEFAULT_FEATURES = {
    vr: {
      required: ['local-floor'],
      optional: ['bounded-floor', 'hand-tracking', 'layers']
    },
    ar: {
      required: ['local-floor', 'hit-test'],
      optional: ['dom-overlay', 'hand-tracking', 'layers']
    }
  };

  const getXRSystem = () => (typeof globalThis !== 'undefined' && globalThis.navigator ? globalThis.navigator.xr : null);

  const createBridgeEvent = (type, detail) => {
    if (typeof CustomEvent === 'function') {
      return new CustomEvent(type, { detail });
    }
    if (typeof Event === 'function') {
      const event = new Event(type);
      event.detail = detail;
      return event;
    }
    return { type, detail };
  };

  /**
   * WebXR セッションの開始/終了とレンダーループの橋渡しを担当するローダー。
   * ユーザーコードの requestAnimationFrame を捕捉し、XR セッション時のみ setAnimationLoop に切り替える。
   */
  class XRBridgeLoader extends EventTarget {
    constructor(options = {}) {
      super();
      this.renderer = options.renderer ?? null;
      this.sceneManager = options.sceneManager ?? null;
      this.autoResume = options.autoResume !== false;
      this.domOverlayRoot = options.domOverlayRoot ?? null;
      this.captureRAF = options.captureRAF !== false;
      this._restoreRAF = null;
      this._capturedLoop = null;
      this._originalSetLoop = null;
      this._currentSession = null;
      this._xrActive = false;
      this._lastRequestedMode = null;
      this._autoResumeAllowed = false;
      this._sessionGrantedHandler = null;
      this._rafHandles = new Map();
      this._rafId = 1;
      this._originalRAF = null;
      this._originalCancelRAF = null;
      this._rendererSetLoopRestore = null;
      this._rawSetAnimationLoop = null;
      this._installed = false;
    }

    install() {
      if (this._installed) {
        return;
      }
      if (!this.renderer) {
        throw new Error('XRBridgeLoader: renderer が指定されていません');
      }
      if (!('xr' in this.renderer)) {
        throw new Error('XRBridgeLoader: 指定された renderer は WebXR に対応していません');
      }
      this.renderer.xr.enabled = true;
      this._rawSetAnimationLoop = this.renderer.setAnimationLoop;
      this._originalSetLoop = this.renderer.setAnimationLoop?.bind(this.renderer) ?? null;
      this._captureRendererLoop();
      this._patchRendererSetAnimationLoop();
      if (this.captureRAF) {
        this._installRAFInterceptor();
      }
      this._installSessionGrantedListener();
      this._installed = true;
      this.dispatchEvent(createBridgeEvent('installed'));
    }

    async isSessionSupported(mode = 'vr') {
      const xr = getXRSystem();
      if (!xr?.isSessionSupported) return false;
      const sessionMode = XR_MODES[mode] ?? XR_MODES.vr;
      try {
        return await xr.isSessionSupported(sessionMode);
      } catch (error) {
        this.dispatchEvent(createBridgeEvent('supportcheck:error', { error, mode: sessionMode }));
        return false;
      }
    }

    async enter(mode = 'vr', options = {}) {
      if (!this._installed) {
        this.install();
      }
      const xr = getXRSystem();
      if (!xr) {
        throw new Error('WebXR がサポートされていません');
      }
      const sessionMode = XR_MODES[mode] ?? XR_MODES.vr;
      const supported = await this.isSessionSupported(mode);
      if (!supported) {
        throw new Error(`${sessionMode} セッションはサポートされていません`);
      }

      let sessionInit = this._buildSessionInit(mode, options);
      this._lastRequestedMode = mode;
      this.dispatchEvent(createBridgeEvent('session:request', { mode: sessionMode, init: sessionInit }));

      const attemptSession = async init => xr.requestSession(sessionMode, init);

      try {
        let session;
        try {
          session = await attemptSession(sessionInit);
        } catch (error) {
          if (this._shouldRetryWithoutDomOverlay(error, sessionInit)) {
            const fallbackInit = this._stripDomOverlayFeature(sessionInit);
            sessionInit = fallbackInit;
            session = await attemptSession(fallbackInit);
          } else {
            throw error;
          }
        }
        await this._activateSession(session, mode, options);
        this._autoResumeAllowed = true;
        return session;
      } catch (error) {
        this.dispatchEvent(createBridgeEvent('session:error', { error, mode: sessionMode }));
        throw error;
      }
    }

    async exit() {
      if (!this._currentSession) return;
      try {
        await this._currentSession.end();
      } finally {
        this._teardownSession();
      }
    }

    dispose() {
      this.exit().catch(() => undefined);
      if (this._restoreRAF) {
        this._restoreRAF();
        this._restoreRAF = null;
      }
      this._installed = false;
      const xr = getXRSystem();
      if (this._sessionGrantedHandler && xr?.removeEventListener) {
        xr.removeEventListener('sessiongranted', this._sessionGrantedHandler);
        this._sessionGrantedHandler = null;
      }
      if (this._rendererSetLoopRestore) {
        this._rendererSetLoopRestore();
        this._rendererSetLoopRestore = null;
      }
    }

    setAutoResume(value) {
      this.autoResume = Boolean(value);
    }

    _shouldRetryWithoutDomOverlay(error, init) {
      if (!error || error.name !== 'NotSupportedError') {
        return false;
      }
      if (!init?.requiredFeatures) {
        return false;
      }
      return init.requiredFeatures.includes('dom-overlay');
    }

    _stripDomOverlayFeature(init = {}) {
      const clone = {
        requiredFeatures: Array.isArray(init.requiredFeatures)
          ? init.requiredFeatures.filter(feature => feature !== 'dom-overlay')
          : [],
        optionalFeatures: Array.isArray(init.optionalFeatures)
          ? init.optionalFeatures.filter(feature => feature !== 'dom-overlay')
          : []
      };
      const stripped = { ...init, ...clone };
      if (stripped.domOverlay) {
        delete stripped.domOverlay;
      }
      return stripped;
    }

    _buildSessionInit(mode, options) {
      const presets = DEFAULT_FEATURES[mode] ?? DEFAULT_FEATURES.vr;
      const required = new Set(presets.required);
      const optional = new Set(presets.optional);

      const domOverlayRoot = options.domOverlayRoot || this.domOverlayRoot || (typeof document !== 'undefined' ? document.body : null);
      if (domOverlayRoot) {
        required.add('dom-overlay');
      }

      if (Array.isArray(options.requiredFeatures)) {
        options.requiredFeatures.forEach(feature => required.add(feature));
      }
      if (Array.isArray(options.optionalFeatures)) {
        options.optionalFeatures.forEach(feature => optional.add(feature));
      }

      const init = {
        requiredFeatures: Array.from(required),
        optionalFeatures: Array.from(optional)
      };

      if (domOverlayRoot) {
        init.domOverlay = { root: domOverlayRoot };
      }

      if (mode === 'ar' && options.hitTestSource) {
        init.hitTestSource = options.hitTestSource;
      }

      return init;
    }

    _captureRendererLoop() {
      if (this._capturedLoop || !this.renderer?.getAnimationLoop) {
        return;
      }
      const existingLoop = this.renderer.getAnimationLoop();
      if (typeof existingLoop === 'function') {
        this._setCapturedLoop(existingLoop);
      }
    }

    _patchRendererSetAnimationLoop() {
      if (!this.renderer || typeof this._rawSetAnimationLoop !== 'function' || this._rendererSetLoopRestore) {
        return;
      }
      const original = this._rawSetAnimationLoop;
      const bridge = this;
      this.renderer.setAnimationLoop = function patchedSetAnimationLoop(loop) {
        if (!bridge._xrActive && typeof loop === 'function') {
          bridge._setCapturedLoop(loop);
        }
        return original.call(this, loop);
      };
      this._rendererSetLoopRestore = () => {
        this.renderer.setAnimationLoop = original;
      };
    }

    _setCapturedLoop(loop) {
      if (typeof loop !== 'function') return;
      this._capturedLoop = loop;
      log.debug('Captured main render loop');
      this.dispatchEvent(createBridgeEvent('loop:captured', { callback: loop }));
    }

    async _activateSession(session, mode, options) {
      this._currentSession = session;
      this._xrActive = true;
      this.dispatchEvent(createBridgeEvent('session:start', { session, mode }));

      session.addEventListener('end', () => this._teardownSession(), { once: true });

      if (this.renderer.xr.setSession) {
        await this.renderer.xr.setSession(session);
      }

      const renderLoop = this._capturedLoop ?? options.fallbackLoop;
      if (renderLoop) {
        this._installRenderLoop(renderLoop);
      }
    }

    _teardownSession() {
      if (!this._xrActive) return;
      this._xrActive = false;
      this._currentSession = null;
      if (this._originalSetLoop) {
        this.renderer.setAnimationLoop(null);
      }
      this.dispatchEvent(createBridgeEvent('session:end'));
    }

    _installRenderLoop(loop) {
      if (!this._originalSetLoop) return;
      this._originalSetLoop((time, frame) => {
        try {
          if (loop.length >= 2) {
            loop(time, frame ?? null);
          } else {
            loop(time);
          }
        } catch (error) {
          log.error('XR render loop error', error);
          this.dispatchEvent(createBridgeEvent('loop:error', { error }));
        }
      });
    }

    _installRAFInterceptor() {
      if (this._restoreRAF || typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
        return;
      }
      const originalRAF = window.requestAnimationFrame.bind(window);
      const originalCancel = typeof window.cancelAnimationFrame === 'function'
        ? window.cancelAnimationFrame.bind(window)
        : null;
      const rafHandles = this._rafHandles;
      const getHandle = () => this._rafId++;
      const bridge = this;

      window.requestAnimationFrame = function xrBridgeWrapped(callback) {
        if (typeof callback !== 'function') {
          return originalRAF(callback);
        }

        if (!bridge._capturedLoop) {
          bridge._setCapturedLoop(callback);
        }

        if (bridge._xrActive && callback === bridge._capturedLoop) {
          const handle = getHandle();
          rafHandles.set(handle, callback);
          return handle;
        }

        return originalRAF(time => {
          callback(time);
        });
      };

      window.cancelAnimationFrame = function xrBridgeCancel(handle) {
        if (rafHandles.delete(handle)) {
          return;
        }
        return originalCancel?.(handle);
      };

      this._restoreRAF = () => {
        window.requestAnimationFrame = originalRAF;
        if (originalCancel) {
          window.cancelAnimationFrame = originalCancel;
        }
        rafHandles.clear();
      };
    }

    _installSessionGrantedListener() {
      const xr = getXRSystem();
      if (!xr?.addEventListener) return;
      this._sessionGrantedHandler = async () => {
        if (!this.autoResume || !this._autoResumeAllowed || this._xrActive || !this._lastRequestedMode) {
          return;
        }
        try {
          await this.enter(this._lastRequestedMode);
        } catch (error) {
          this.dispatchEvent(createBridgeEvent('session:error', { error, mode: this._lastRequestedMode }));
        }
      };
      xr.addEventListener('sessiongranted', this._sessionGrantedHandler);
    }
  }

  const THREE$1 = globalThis.THREE || THREEModule__namespace;

  class XRInteractionManager {
    constructor(options = {}) {
      this.renderer = options.renderer ?? null;
      this.scene = options.scene ?? null;
      this.sceneManager = options.sceneManager ?? null;
      this.log = options.log ?? console;

      this.session = null;
      this.mode = null;
      this.hitTestSource = null;
      this.referenceSpace = null;
      this.viewerSpace = null;
      this.controllerBindings = [];
      this.reticle = null;
      this.frameHandle = null;
      this.lastHitPose = null;

      this.tempMatrix = new THREE$1.Matrix4();
      this.tempDirection = new THREE$1.Vector3();
      this.tempOrigin = new THREE$1.Vector3();
      this.raycaster = new THREE$1.Raycaster();
    }

    async attachSession(session, { mode } = {}) {
      if (!session) return;
      this.detachSession();
      this.session = session;
      this.mode = mode ?? null;
      this._bindControllers();

      if (this.mode === 'immersive-ar') {
        await this._setupHitTest(session);
        this._ensureReticle();
        this.sceneManager?.setXRAnchorSupport(Boolean(this.hitTestSource));
      } else {
        this.sceneManager?.setXRAnchorSupport(false);
      }

      this._startFrameLoop();
    }

    detachSession() {
      this._stopFrameLoop();
      this._unbindControllers();
      this._releaseHitTest();
      this._removeReticle();
      this.session = null;
      this.mode = null;
      this.lastHitPose = null;
    }

    _bindControllers() {
      if (!this.renderer?.xr) return;
      this._unbindControllers();
      const bindSource = source => {
        if (!source) return;
        const handlers = new Map();
        const map = {
          selectstart: event => this._handleSelectStart(event),
          selectend: event => this._handleSelectEnd(event),
          squeezestart: event => this._handleSqueeze(event),
          squeezeend: event => this._handleSqueezeEnd(event)
        };
        Object.entries(map).forEach(([type, handler]) => {
          const wrapped = handler.bind(this);
          source.addEventListener(type, wrapped);
          handlers.set(type, wrapped);
        });
        this.controllerBindings.push({ source, handlers });
      };

      for (let i = 0; i < 2; i += 1) {
        bindSource(this.renderer.xr.getController?.(i));
        bindSource(this.renderer.xr.getHand?.(i));
      }
    }

    _unbindControllers() {
      this.controllerBindings.forEach(binding => {
        binding.handlers.forEach((handler, type) => {
          binding.source.removeEventListener(type, handler);
        });
      });
      this.controllerBindings = [];
    }

    async _setupHitTest(session) {
      if (!session?.requestHitTestSource || !session?.requestReferenceSpace) {
        this.sceneManager?.setXRAnchorSupport(false);
        return;
      }
      try {
        this.referenceSpace = this.renderer?.xr?.getReferenceSpace?.() ?? await session.requestReferenceSpace('local-floor');
        this.viewerSpace = await session.requestReferenceSpace('viewer');
        this.hitTestSource = await session.requestHitTestSource({ space: this.viewerSpace });
        this.sceneManager?.setXRAnchorSupport(true);
      } catch (error) {
        this.log?.warn?.('XR hit-test setup failed', error);
        this.sceneManager?.setXRAnchorSupport(false);
        this.hitTestSource = null;
      }
    }

    _releaseHitTest() {
      if (this.hitTestSource?.cancel) {
        this.hitTestSource.cancel();
      }
      this.hitTestSource = null;
      this.referenceSpace = null;
      this.viewerSpace = null;
    }

    _startFrameLoop() {
      if (!this.session) return;
      const loop = (time, frame) => {
        this._updateFrame(frame);
        if (this.session) {
          this.frameHandle = this.session.requestAnimationFrame(loop);
        }
      };
      this.frameHandle = this.session.requestAnimationFrame(loop);
    }

    _stopFrameLoop() {
      if (this.session && this.frameHandle != null && typeof this.session.cancelAnimationFrame === 'function') {
        this.session.cancelAnimationFrame(this.frameHandle);
      }
      this.frameHandle = null;
    }

    _updateFrame(frame) {
      if (this.mode !== 'immersive-ar' || !frame || !this.hitTestSource || !this.referenceSpace) {
        return;
      }
      const hits = frame.getHitTestResults(this.hitTestSource);
      if (hits && hits.length > 0) {
        const pose = hits[0].getPose(this.referenceSpace);
        if (pose) {
          this._updateReticleFromPose(pose);
          this.lastHitPose = {
            position: new THREE$1.Vector3(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z),
            orientation: new THREE$1.Quaternion(
              pose.transform.orientation.x,
              pose.transform.orientation.y,
              pose.transform.orientation.z,
              pose.transform.orientation.w
            )
          };
        }
      } else if (this.reticle) {
        this.reticle.visible = false;
      }
    }

    _updateReticleFromPose(pose) {
      if (!this.reticle) return;
      this.reticle.visible = true;
      this.reticle.position.set(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
      this.reticle.quaternion.set(
        pose.transform.orientation.x,
        pose.transform.orientation.y,
        pose.transform.orientation.z,
        pose.transform.orientation.w
      );
    }

    _ensureReticle() {
      if (this.reticle || !this.scene) return;
      const ringGeom = new THREE$1.RingGeometry(0.12, 0.18, 48);
      ringGeom.rotateX(-Math.PI / 2);
      const ringMaterial = new THREE$1.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.8,
        side: THREE$1.DoubleSide
      });
      const ring = new THREE$1.Mesh(ringGeom, ringMaterial);

      const dotGeom = new THREE$1.CircleGeometry(0.02, 24);
      dotGeom.rotateX(-Math.PI / 2);
      const dotMaterial = new THREE$1.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
      const dot = new THREE$1.Mesh(dotGeom, dotMaterial);
      dot.position.y = 0.001;

      const group = new THREE$1.Group();
      group.add(ring);
      group.add(dot);
      group.visible = false;

      this.scene.add(group);
      this.reticle = group;
    }

    _removeReticle() {
      if (this.reticle && this.scene) {
        this.scene.remove(this.reticle);
      }
      this.reticle = null;
    }

    _handleSelectStart(event) {
      if (this.mode === 'immersive-ar') {
        this._handleARSelect(event);
        return;
      }
      const object = this._pickSpawnedObject(event?.target);
      if (object) {
        this.sceneManager?.selectObject(object);
      }
    }

    _handleSelectEnd() {}

    _handleARSelect(event) {
      if (!this.sceneManager) return;
      const frame = event?.frame;
      let pose = null;
      if (frame && this.hitTestSource && this.referenceSpace) {
        const hits = frame.getHitTestResults(this.hitTestSource);
        if (hits?.length) {
          pose = hits[0].getPose(this.referenceSpace);
        }
      }
      if (!pose && this.lastHitPose) {
        pose = {
          transform: {
            position: this.lastHitPose.position,
            orientation: this.lastHitPose.orientation
          }
        };
      }
      if (!pose) {
        return;
      }

      const anchorPosition = new THREE$1.Vector3(
        pose.transform.position.x,
        pose.transform.position.y,
        pose.transform.position.z
      );
      const anchorOrientation = pose.transform.orientation.isQuaternion
        ? pose.transform.orientation.clone()
        : new THREE$1.Quaternion(
            pose.transform.orientation.x,
            pose.transform.orientation.y,
            pose.transform.orientation.z,
            pose.transform.orientation.w
          );

      this.sceneManager.setXRPlacementAnchor({
        position: anchorPosition,
        orientation: anchorOrientation
      });
    }

    _handleSqueeze(event) {
      if (!this.sceneManager?.selectedObject) return;
      const object = this.sceneManager.selectedObject;
      const handedness = event?.inputSource?.handedness ?? 'unknown';
      const scaleDelta = handedness === 'left' ? 0.9 : 1.1;
      const nextScale = THREE$1.MathUtils.clamp(object.scale.x * scaleDelta, 0.2, 5);
      object.scale.setScalar(nextScale);
      if (typeof this.sceneManager.showScaleToast === 'function') {
        this.sceneManager.showScaleToast(nextScale);
      }
      this.sceneManager.markObjectModified(object, {
        trigger: 'xr-squeeze',
        handedness
      });
    }

    _handleSqueezeEnd() {}

    _pickSpawnedObject(source) {
      if (!source || !this.sceneManager) return null;
      this.tempMatrix.identity().extractRotation(source.matrixWorld);
      this.tempDirection.set(0, 0, -1).applyMatrix4(this.tempMatrix).normalize();
      this.tempOrigin.setFromMatrixPosition(source.matrixWorld);
      this.raycaster.set(this.tempOrigin, this.tempDirection);

      const candidates = Array.from(this.sceneManager.spawnedObjects.values());
      const intersects = this.raycaster.intersectObjects(candidates, true);
      if (!intersects.length) return null;

      let target = intersects[0].object;
      while (target) {
        const objectId = target.userData?.id;
        if (objectId && this.sceneManager.spawnedObjects.has(objectId)) {
          return target;
        }
        target = target.parent;
      }
      return null;
    }
  }

  // UMDビルド対応: グローバルのTHREEを優先し、なければES moduleのimportを使用
  const THREE = globalThis.THREE || THREEModule__namespace;

  /**
   * Scene Manager - 3D scene integration for ChocoDrop System
   * Handles natural language parsing and 3D object management
   */
  class SceneManager {
    constructor(scene, options = {}) {
      if (!scene) {
        throw new Error('THREE.Scene is required');
      }
      
      this.scene = scene;
      this.camera = options.camera || null;
      this.renderer = options.renderer || null;
      this.labelRenderer = null; // CSS2DRenderer for UI overlays like audio controls

      // Tone Mapping + Exposure設定（2025年標準：暗いシーンでも3Dモデルが見える）
      if (this.renderer) {
        this.setupToneMapping();
      }
      // ChocoDrop Client（共通クライアント注入を優先）
      // 外部フォルダから共有する場合は options.client でクライアントを再利用
      this.client = options.client || new ChocoDropClient(options.serverUrl, this);
      
      // 実験オブジェクト管理用グループ
      this.experimentGroup = new THREE.Group();
      this.experimentGroup.name = 'LiveExperiments';
      // 一旦シーンに追加（後でカメラに移動する可能性あり）
      this.scene.add(this.experimentGroup);
      
      // コマンド履歴
      this.commandHistory = [];
      
      // オブジェクト管理
      this.spawnedObjects = new Map();
      this.objectCounter = 0;
      this.selectedObject = null;
      this.selectedImageService = options.selectedImageService || null;
      this.selectedVideoService = options.selectedVideoService || null;
      this.audioControls = new Map();
      this.audioControlUpdateInterval = null;
      this.audioControlUpdateListener = null;
      this.scaleButtonUpdateInterval = null; // スケールボタン位置更新用インターバル
      this.animationMixers = new Set();
      this.sceneJournal = [];
      this.maxSceneJournalEntries = options.maxSceneJournalEntries || 200;
      this.sceneChangeListeners = new Set();
      this.sceneStateVersion = 0;
      this.objectSnapshotCache = new Map();
      this.isRestoring = false;
      this.gltfLoader = null;

      this.xr = {
        bridge: null,
        status: 'idle',
        mode: null,
        supported: { vr: null, ar: null },
        autoResume: options.xrAutoResume !== false,
        events: new EventTarget(),
        error: null,
        anchor: null,
        anchorSupported: false,
        interaction: null
      };

      // Animation管理（UI要素用）
      this.clock = new THREE.Clock();
      
      // レイキャスティング用
      this.raycaster = new THREE.Raycaster();
      this.mouse = new THREE.Vector2();
      this.lastHoveredObject = null;
      
      // 設定
      this.config = {
        showLocationIndicator: options.showLocationIndicator !== false,
        indicatorDuration: options.indicatorDuration || 3000,
        defaultObjectScale: options.defaultObjectScale || 1.0,
        enableObjectSelection: options.enableObjectSelection !== false,
        enableMouseInteraction: options.enableMouseInteraction,
        enableDebugLogging: options.enableDebugLogging === true,
        defaultModelSize: options.defaultModelSize || 6,
        dracoDecoderPath: options.dracoDecoderPath || null,
        ...options.config
      };

      // XR interaction depends on the state and configuration initialized above.
      if (this.renderer) this._ensureXRInteractionManager();
      
      // クリックイベントの設定
      this.setupClickEvents();
      
      console.log('🧪 SceneManager initialized with click selection');

      // デバッグやコンソール操作を容易にするためグローバル参照を保持
      if (typeof globalThis !== 'undefined') {
        globalThis.sceneManager = this;
      }

      if (this.renderer && options.enableXRBridge !== false) {
        const initialize = () => {
          try {
            this.initializeXRBridge(options.xrBridgeOptions || {});
          } catch (error) {
            console.warn('⚠️ XRBridge initialization failed', error);
            this._updateXRState('error', { error });
          }
        };
        if (typeof queueMicrotask === 'function') {
          queueMicrotask(initialize);
        } else {
          Promise.resolve().then(initialize);
        }
      }
    }
    /**
     * クリックイベントの設定
     */
    setupClickEvents() {
      // enableMouseInteractionが明示的にtrueの場合のみマウス操作を有効化
      if (this.config.enableMouseInteraction === true && this.renderer) {
        this.setupObjectDragging();
        this.setupObjectHover(); // ホバーで+/-ボタン再表示（2025年トレンド）
        console.log('🖱️ Mouse interaction enabled - Click to select, Shift+drag to move objects');
      } else if (this.config.enableMouseInteraction === true && !this.renderer) {
        console.warn('⚠️ Mouse interaction requested but renderer not provided. Mouse interaction disabled.');
      } else {
        console.log('🖱️ Mouse interaction disabled (safe mode). Set enableMouseInteraction: true to enable.');
      }
    }

    /**
     * 選択済みオブジェクトへのホバーで+/-ボタンを再表示（2025年トレンド：Zero-UI）
     */
    setupObjectHover() {
      if (!this.renderer) return;

      this.renderer.domElement.addEventListener('mousemove', (event) => {
        // 選択されているオブジェクトがない場合は何もしない
        if (!this.selectedObject) return;

        // マウス座標を正規化
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        // レイキャスト
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(Array.from(this.spawnedObjects.values()), true);

        if (intersects.length > 0) {
          let hoveredObject = intersects[0].object;
          while (hoveredObject.parent && !this.spawnedObjects.has(hoveredObject.userData.id)) {
            hoveredObject = hoveredObject.parent;
          }

          // 選択済みオブジェクトにホバーしている場合、+/-ボタンを再表示
          if (hoveredObject === this.selectedObject && hoveredObject.userData.showScaleButtons) {
            hoveredObject.userData.showScaleButtons();
          }
        }
      }, { passive: true });
    }

    /**
     * Tone Mapping + Exposure設定（Three.js 2024標準）
     * シーンの照明を変えずに、カメラの露出調整で3Dモデルを見やすくする
     */
    setupToneMapping() {
      if (!this.renderer) return;

      // ACESFilmicToneMapping：映画のような自然な色調（Three.js推奨）
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

      // 露出調整：1.5で暗いシーンでも見える、明るいシーンでも光りすぎない
      this.renderer.toneMappingExposure = 1.5;

      console.log('📸 Tone Mapping enabled: ACESFilmic, Exposure: 1.5 (2025 standard)');
    }

    // デバッグ情報表示メソッド
    debugSceneInfo() {
      console.log('🔍 === SCENE DEBUG INFO ===');
      
      // カメラ情報
      if (this.camera) {
        console.log(`📷 Camera:
        - Position: (${this.camera.position.x.toFixed(2)}, ${this.camera.position.y.toFixed(2)}, ${this.camera.position.z.toFixed(2)})
        - Rotation: (${(this.camera.rotation.x * 180 / Math.PI).toFixed(1)}°, ${(this.camera.rotation.y * 180 / Math.PI).toFixed(1)}°, ${(this.camera.rotation.z * 180 / Math.PI).toFixed(1)}°)
        - FOV: ${this.camera.fov || 'N/A'}
        - Near/Far: ${this.camera.near || 'N/A'}/${this.camera.far || 'N/A'}`);
      }
      
      // シーン階層
      console.log(`🌳 Scene hierarchy:
      - Total objects in scene: ${this.scene.children.length}
      - experimentGroup exists: ${this.scene.getObjectByName('LiveExperiments') ? 'Yes' : 'No'}
      - experimentGroup children: ${this.experimentGroup.children.length}`);
      
      // 生成されたオブジェクト
      console.log(`📦 Spawned objects: ${this.spawnedObjects.size}`);
      this.spawnedObjects.forEach((obj, id) => {
        const worldPos = new THREE.Vector3();
        obj.getWorldPosition(worldPos);
        console.log(`  - ${id} (${obj.userData.type}): 
        Local: (${obj.position.x.toFixed(2)}, ${obj.position.y.toFixed(2)}, ${obj.position.z.toFixed(2)})
        World: (${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)})
        Visible: ${obj.visible}, Scale: ${obj.scale.x.toFixed(2)}`);
        
        // 3Dモデルの詳細情報
        if (obj.userData.type === 'generated_3d_model') {
          const box = new THREE.Box3().setFromObject(obj);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          console.log(`    📐 Bounding box - Center: (${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)}), Size: (${size.x.toFixed(2)}, ${size.y.toFixed(2)}, ${size.z.toFixed(2)})`);
          
          // メッシュ数
          let meshCount = 0;
          obj.traverse((child) => {
            if (child.isMesh) meshCount++;
          });
          console.log(`    🎭 Meshes: ${meshCount}`);
        }
      });
      
      // カメラからの距離計算
      if (this.camera && this.spawnedObjects.size > 0) {
        console.log(`📏 Distances from camera:`);
        this.spawnedObjects.forEach((obj, id) => {
          const distance = this.camera.position.distanceTo(obj.position);
          console.log(`  - ${id}: ${distance.toFixed(2)} units`);
        });
      }
      
      console.log('=========================');
    }
    

    
    /**
     * オブジェクト選択
     */
    selectObject(object) {
      // 既に同じオブジェクトが選択されている場合は何もしない
      if (this.selectedObject === object) {
        return;
      }

      // 前の選択を解除
      this.deselectObject();

      this.selectedObject = object;

      // 選択インジケーター：小さな白い丸（2025年トレンド：ミニマル）
      this.createSelectionIndicator(object);

      // スケール調整ボタンを表示（2025年トレンド：コンテキストUI）
      if (object.userData && (object.userData.type === 'generated_image' ||
          object.userData.type === 'generated_video' ||
          object.userData.type === 'generated_3d_model')) {
        this.createScaleButtons(object);
      }

      console.log(`✅ Selected object: ${object.name}`);
      
      // CommandUIに選択情報を表示
      if (this.commandUI) {
        const objectInfo = object.userData || {};
        this.commandUI.addOutput(`📍 選択: ${object.name}`, 'info');
        if (objectInfo.prompt) {
          this.commandUI.addOutput(`   プロンプト: ${objectInfo.prompt}`, 'hint');
        }
        if (objectInfo.modelName) {
          this.commandUI.addOutput(`   モデル: ${objectInfo.modelName}`, 'hint');
        }

        // 削除モードが待機中の場合、削除コマンドを自動入力
        if (this.commandUI.currentMode === 'delete') {
          const objectName = objectInfo.originalPrompt || object.name || '選択したオブジェクト';
          this.commandUI.input.value = `${objectName}を削除`;
          this.commandUI.input.focus();
          // カーソルを文末に移動（選択状態を解除）
          this.commandUI.input.setSelectionRange(this.commandUI.input.value.length, this.commandUI.input.value.length);
          this.commandUI.addOutput(`🎯 削除対象設定: ${objectName}`, 'system');
        }
      }
    }

    /**
     * 選択インジケーター：小さな白い丸（2025年トレンド：ミニマル）
     */
    createSelectionIndicator(object) {
      // 既存のインジケーターを削除
      if (object.userData.selectionIndicator) {
        if (object.userData.selectionIndicator.parentNode) {
          object.userData.selectionIndicator.parentNode.removeChild(object.userData.selectionIndicator);
        }
      }

      // 小さな白い丸を作成
      const dot = document.createElement('div');
      dot.style.cssText = `
      width: 8px !important;
      height: 8px !important;
      background: white !important;
      border: 1px solid rgba(255, 255, 255, 0.8) !important;
      border-radius: 50% !important;
      box-shadow: 0 0 8px rgba(255, 255, 255, 0.6) !important;
      pointer-events: none !important;
      z-index: 999998 !important;
      position: absolute !important;
    `;

      document.body.appendChild(dot);
      object.userData.selectionIndicator = dot;

      // 位置更新関数
      object.userData.updateSelectionIndicator = () => {
        this.updateSelectionIndicator(object, dot);
      };

      // 初期位置設定
      this.updateSelectionIndicator(object, dot);
    }

    /**
     * 選択インジケーターの位置を更新
     */
    updateSelectionIndicator(object, dot) {
      if (!this.camera || !this.renderer || !dot.parentNode) return;

      const vector = new THREE.Vector3();
      object.getWorldPosition(vector);

      // オブジェクトの上部に配置
      const box = new THREE.Box3().setFromObject(object);
      const size = box.getSize(new THREE.Vector3());
      vector.y += size.y / 2 + 0.5; // オブジェクトの上0.5単位

      vector.project(this.camera);

      const x = (vector.x * 0.5 + 0.5) * this.renderer.domElement.clientWidth;
      const y = (vector.y * -0.5 + 0.5) * this.renderer.domElement.clientHeight;

      dot.style.left = `${x}px`;
      dot.style.top = `${y}px`;
    }

    createModernSelectionIndicator(object) {
      // シンプルで確実な選択インジケーター
      // 既存のインジケーターを削除（重複防止）
      const existingIndicator = object.getObjectByName('selectionIndicator');
      if (existingIndicator) {
        object.remove(existingIndicator);
      }

      const indicatorGroup = new THREE.Group();
      indicatorGroup.name = 'selectionIndicator';

      // オブジェクトのバウンディングボックスを正確に取得
      const box = new THREE.Box3().setFromObject(object);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      // 小さなマージンを追加して枠が見えやすくする
      const margin = 0.1;
      const adjustedSize = new THREE.Vector3(
        size.x + margin,
        size.y + margin, 
        size.z + margin
      );

      // シンプルな黄色い枠線
      // PlaneGeometryの場合は平面的な枠を作成
      if (object.geometry && object.geometry.type === 'PlaneGeometry') {
        // スケールは既にオブジェクトに適用されているので、ジオメトリのサイズのみ使用
        const width = object.geometry.parameters.width;
        const height = object.geometry.parameters.height;
        
        // 平面の周りに枠線を作成
        const shape = new THREE.Shape();
        shape.moveTo(-width/2, -height/2);
        shape.lineTo(width/2, -height/2);
        shape.lineTo(width/2, height/2);
        shape.lineTo(-width/2, height/2);
        shape.lineTo(-width/2, -height/2);
        
        const points = shape.getPoints();
        const geometryLine = new THREE.BufferGeometry().setFromPoints(points);
        // 2025年トレンド: アダプティブ選択インジケーター
        const adaptiveColor = this.getAdaptiveSelectionColor();
        const materialLine = new THREE.LineBasicMaterial({
          color: adaptiveColor,
          linewidth: 2,
          transparent: true,
          opacity: 0.9
        });
        
        const line = new THREE.Line(geometryLine, materialLine);
        line.position.set(0, 0, 0.01); // 少し前に出して見えるようにする
        indicatorGroup.add(line);
      } else {
        // その他のオブジェクトは通常の3Dボックス枠
        const edgesGeometry = new THREE.EdgesGeometry(
          new THREE.BoxGeometry(adjustedSize.x, adjustedSize.y, adjustedSize.z)
        );
        // 2025年トレンド: アダプティブ選択インジケーター
        const adaptiveColor = this.getAdaptiveSelectionColor();
        const edgesMaterial = new THREE.LineBasicMaterial({
          color: adaptiveColor,
          linewidth: 2,
          transparent: true,
          opacity: 0.9
        });
        
        const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
        edges.position.copy(center);
        indicatorGroup.add(edges);
      }

      // インジケーターをオブジェクトの子として追加（オブジェクトと一緒に動く）
      object.add(indicatorGroup);
      indicatorGroup.position.set(0, 0, 0); // 親からの相対位置は0

      // 2025年トレンド：四隅ハンドルを廃止し、浮遊コントロールバーに統一
    }
    // 2025年トレンド：四隅ハンドル廃止（浮遊コントロールバー + キーボードに統一）

    /**
     * オブジェクト選択解除
     */
    deselectObject() {
      // シンプルで確実な選択解除
      if (this.selectedObject) {
        // 選択インジケーターは使わない（コメントアウト）
        // const indicator = this.selectedObject.getObjectByName('selectionIndicator');
        // if (indicator) {
        //   this.selectedObject.remove(indicator);
        //   indicator.traverse((child) => {
        //     if (child.geometry) child.geometry.dispose();
        //     if (child.material) {
        //       if (Array.isArray(child.material)) {
        //         child.material.forEach(material => material.dispose());
        //       } else {
        //         child.material.dispose();
        //       }
        //     }
        //   });
        // }

        // 透明度を元に戻す（ユーザーが意図的に透明にしていない場合のみ）
        if (this.selectedObject.material &&
            this.selectedObject.userData &&
            !this.selectedObject.userData.hasOpacityEffect &&
            this.selectedObject.userData.originalOpacity !== undefined) {
          this.selectedObject.material.opacity = this.selectedObject.userData.originalOpacity;
          this.selectedObject.material.needsUpdate = true;
          console.log(`🔄 Restored opacity to ${this.selectedObject.userData.originalOpacity}`);
        }

        // 選択インジケーター（白い丸）を削除
        if (this.selectedObject.userData.selectionIndicator) {
          if (this.selectedObject.userData.selectionIndicator.parentNode) {
            this.selectedObject.userData.selectionIndicator.parentNode.removeChild(this.selectedObject.userData.selectionIndicator);
          }
          delete this.selectedObject.userData.selectionIndicator;
          delete this.selectedObject.userData.updateSelectionIndicator;
        }

        // スケールボタンを削除
        this.removeScaleButtons(this.selectedObject);

        console.log(`✅ Deselected: ${this.selectedObject.name}`);
        this.selectedObject = null;
      }
    }

    /**
     * マウスドラッグによるオブジェクト移動機能
     */
    setupObjectDragging() {
      if (!this.renderer) return;

      const canvas = this.renderer.domElement;
      let isDragging = false;
      let dragObject = null;
      let dragOffset = new THREE.Vector3();
      new THREE.Vector2();
      let dragMode = 'move'; // 'move', 'resize', 'rotate'
      new THREE.Vector3();
      let dragPlane = new THREE.Plane();
      let intersection = new THREE.Vector3();
      
      canvas.addEventListener('mousedown', (event) => {
        if (event.button !== 0) return; // 左クリックのみ
        
        // レイキャスティングでオブジェクト検出
        const rect = canvas.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        // オブジェクトとその子（選択インジケーター含む）を検出対象に
        const intersects = this.raycaster.intersectObjects(this.experimentGroup.children, true);

        if (intersects.length > 0) {
          let object = intersects[0].object;

          // 3Dモデルの子メッシュがヒットした場合、親を辿ってuserDataを持つオブジェクトを探す
          let targetObject = object;
          while (targetObject && !targetObject.userData?.type && !targetObject.userData?.source && targetObject.parent) {
            targetObject = targetObject.parent;
            if (targetObject === this.scene || targetObject === this.experimentGroup) break;
          }

          // userDataを持つ親が見つかった場合はそれを使用
          if (targetObject && (targetObject.userData?.type || targetObject.userData?.source)) {
            object = targetObject;
          }

          // 回転ハンドルがクリックされた場合（将来実装）
          if (object.userData && object.userData.isRotateHandle) {
            // 回転モード開始（今後実装）
            console.log(`🔄 Rotation handle clicked for: ${this.selectedObject.name}`);
            return;
          }

          // 生成された画像・動画・3Dモデル対象（Shift不要の直感的操作）
          if (object.userData && (object.userData.type === 'generated_image' || object.userData.type === 'generated_video' || object.userData.type === 'generated_3d_model' || object.userData.source === 'imported_file')) {
            
            // 🗑️ Deleteモードでのクリック処理
            if (this.commandUI && this.commandUI.currentMode === 'delete') {
              // 削除確認ダイアログを表示して直接削除
              const objectName = object.name;
              console.log(`🗑️ Delete mode: clicked on ${objectName}`);
              
              this.commandUI.showDeleteConfirmation(`オブジェクト「${objectName}」を削除`)
                .then(confirmed => {
                  if (confirmed) {
                    this.removeObject(objectName);
                    this.commandUI.addOutput(`🗑️ 削除完了: ${objectName}`, 'success');
                  } else {
                    this.commandUI.addOutput(`❌ 削除キャンセル: ${objectName}`, 'info');
                  }
                })
                .catch(error => {
                  console.error('Delete confirmation error:', error);
                  this.commandUI.addOutput(`❌ 削除エラー: ${objectName}`, 'error');
                });
              return; // 削除モードの場合は移動処理をスキップ
            }
            
            // 移動モード開始（Shiftキー不要）
            isDragging = true;
            dragObject = object;
            dragMode = 'move';

            // カメラに平行な平面を設定（スムーズな移動のため）
            const normal = new THREE.Vector3(0, 0, 1);
            normal.applyQuaternion(this.camera.quaternion);
            dragPlane.setFromNormalAndCoplanarPoint(normal, object.position);

            // マウス位置での交点を計算
            this.raycaster.setFromCamera(this.mouse, this.camera);
            this.raycaster.ray.intersectPlane(dragPlane, intersection);
            dragOffset.copy(intersection).sub(object.position);

            canvas.style.cursor = 'grabbing';
            console.log(`🔄 Started moving: ${object.name} (Shift-free interaction)`);

            // 選択状態も更新
            this.selectObject(object);
          } else {
            // 通常クリック: 選択のみ
            this.selectObject(object);
          }
        } else {
          this.deselectObject();
        }
      });
      
      canvas.addEventListener('mousemove', (event) => {
        // ドラッグ中でない場合はホバーエフェクトを処理
        if (!isDragging) {
          this.handleHoverEffects(event, canvas);
          return;
        }
        
        // ドラッグ中の処理
        if (!dragObject) return;
        
        if (dragMode === 'move') {
          // 移動モード（平面との交点を使ったスムーズな移動）
          const rect = canvas.getBoundingClientRect();
          this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

          this.raycaster.setFromCamera(this.mouse, this.camera);

          // 平面との交点を計算
          if (this.raycaster.ray.intersectPlane(dragPlane, intersection)) {
            // オフセットを考慮して位置を更新（intersection を変更しないように注意）
            dragObject.position.copy(intersection).sub(dragOffset);
          }
        }
      });
      
      // ドラッグ終了処理を共通化
      const endDragging = () => {
        if (isDragging && dragObject) {
          console.log(`✅ Finished dragging: ${dragObject.name} to (${dragObject.position.x.toFixed(1)}, ${dragObject.position.y.toFixed(1)}, ${dragObject.position.z.toFixed(1)})`);
          this.markObjectModified(dragObject, { trigger: 'drag' });

          isDragging = false;
          dragObject = null;
          dragMode = 'move'; // リセット
          canvas.style.cursor = 'default';
        }
      };

      // キャンバス上でマウスを離した時
      canvas.addEventListener('mouseup', endDragging);

      // キャンバス外でマウスを離した時も検出（重要！）
      document.addEventListener('mouseup', endDragging);

      // キャンバスからマウスが出た時もドラッグ終了
      canvas.addEventListener('mouseleave', () => {
        if (isDragging) {
          console.log(`⚠️ Mouse left canvas while dragging`);
          endDragging();
        }
      });

      // ホイール/ピンチは常にカメラズーム（OrbitControlsが処理）
      // オブジェクトスケールはキーボード or ボタン or 数字入力で操作

      // 選択したオブジェクトの角度調整キーボードコントロール
      document.addEventListener('keydown', (event) => {
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
          return;
        }
        if (!this.selectedObject) return;
        
        const object = this.selectedObject;
        // 生成された画像・動画・3Dモデルのみ角度調整可能
        if (!object.userData || (object.userData.type !== 'generated_image' && object.userData.type !== 'generated_video' && object.userData.type !== 'generated_3d_model')) {
          return;
        }

        const rotationStep = Math.PI / 36; // 5度ずつ回転
        const moveStep = event.shiftKey ? 0.1 : 0.5; // Shift: 0.1単位, 通常: 0.5単位
        let rotated = false;
        let moved = false;
        let scaled = false;

        switch (event.key) {
          case 'ArrowLeft':
            object.rotation.y -= rotationStep;
            rotated = true;
            break;
          case 'ArrowRight':
            object.rotation.y += rotationStep;
            rotated = true;
            break;
          case 'ArrowUp':
            // X軸回転は制限（-30度から+30度まで）
            const newRotationX = object.rotation.x - rotationStep;
            if (newRotationX >= -Math.PI/6 && newRotationX <= Math.PI/6) {
              object.rotation.x = newRotationX;
              rotated = true;
            }
            break;
          case 'ArrowDown':
            // X軸回転は制限（-30度から+30度まで）
            const newRotationXDown = object.rotation.x + rotationStep;
            if (newRotationXDown >= -Math.PI/6 && newRotationXDown <= Math.PI/6) {
              object.rotation.x = newRotationXDown;
              rotated = true;
            }
            break;
          case 'r':
          case 'R':
            // リセット：正面向きに戻す
            object.rotation.x = 0;
            // カメラの視線方向（ユーザーがモニターで見ている方向）に向ける
            const cameraDirection = new THREE.Vector3();
            this.camera.getWorldDirection(cameraDirection);
            const targetPoint = object.position.clone().add(cameraDirection.multiplyScalar(-1));
            object.lookAt(targetPoint);
            object.rotation.x = 0; // お辞儀防止
            rotated = true;
            console.log(`🔄 Reset rotation for: ${object.name}`);
            break;

          case '+':
          case '=': // Shiftなしの=キーも+として扱う
            // リサイズ：拡大（2025年トレンド：キーボード操作 + Shift微調整）
            {
              const currentScale = object.scale.x;
              const factor = event.shiftKey ? 1.01 : 1.1; // Shift: 1%, 通常: 10%
              const newScale = Math.min(5.0, currentScale * factor);
              object.scale.setScalar(newScale);
              event.shiftKey ? '1%' : '10%';
              // console.log(`📐 Resized ${object.userData.type || 'object'}: ${object.name} to ${(newScale * 100).toFixed(0)}% (+${increment})`);
              this.showScaleToast(newScale);
              event.preventDefault();
              scaled = true;
            }
            break;
          case '-':
          case '_':
            // リサイズ：縮小（2025年トレンド：キーボード操作 + Shift微調整）
            {
              const currentScale = object.scale.x;
              const factor = event.shiftKey ? 0.99 : 0.9; // Shift: 1%, 通常: 10%
              const newScale = Math.max(0.2, currentScale * factor);
              object.scale.setScalar(newScale);
              event.shiftKey ? '1%' : '10%';
              // console.log(`📐 Resized ${object.userData.type || 'object'}: ${object.name} to ${(newScale * 100).toFixed(0)}% (-${increment})`);
              this.showScaleToast(newScale);
              event.preventDefault();
              scaled = true;
            }
            break;
          case 'i':
          case 'I':
            // デバッグ情報表示
            this.debugSceneInfo();
            event.preventDefault();
            break;

          // WASD移動コントロール（ゲームスタイル）
          case 'w':
          case 'W':
            // 前方（奥）へ移動
            object.position.z -= moveStep;
            moved = true;
            break;
          case 's':
          case 'S':
            // 後方（手前）へ移動
            object.position.z += moveStep;
            moved = true;
            break;
          case 'a':
          case 'A':
            // 左へ移動
            object.position.x -= moveStep;
            moved = true;
            break;
          case 'd':
          case 'D':
            // 右へ移動
            object.position.x += moveStep;
            moved = true;
            break;

          default:
            // 数字キー(0-9)が押されたら、スケール入力モードに入る
            if (/^[0-9]$/.test(event.key)) {
              this.showScaleInput(object, event.key);
              event.preventDefault();
            }
            break;
        }

        if (rotated) {
          event.preventDefault();
          const angles = {
            x: (object.rotation.x * 180 / Math.PI).toFixed(1),
            y: (object.rotation.y * 180 / Math.PI).toFixed(1),
            z: (object.rotation.z * 180 / Math.PI).toFixed(1)
          };
          console.log(`🔄 Rotated ${object.userData.type}: ${object.name} to (${angles.x}°, ${angles.y}°, ${angles.z}°)`);
        }

        if (moved) {
          event.preventDefault();
          const position = {
            x: object.position.x.toFixed(2),
            y: object.position.y.toFixed(2),
            z: object.position.z.toFixed(2)
          };
          const moveAmount = event.shiftKey ? '0.1' : '0.5';
          console.log(`🎮 Moved ${object.userData.type}: ${object.name} to (${position.x}, ${position.y}, ${position.z}) [step: ${moveAmount}]`);
        }

        if (rotated || moved || scaled) {
          this.markObjectModified(object, {
            trigger: 'keyboard-transform',
            rotated,
            moved,
            scaled
          });
        }
      });

      console.log('🖱️ Object dragging system enabled (Drag to move objects - Shift-free interaction)');
      console.log('🔄 Object resizing system enabled (Scroll to resize - Shift-free interaction)');
      console.log('🎯 Angle adjustment enabled (Select object + Arrow keys to rotate, R to reset)');
      console.log('📐 Keyboard resize enabled (Select object + +/- keys to resize)');
      console.log('🎮 WASD movement enabled (Select object + W/A/S/D keys to move, Shift for fine control)');
    }

    handleHoverEffects(event, canvas) {
      // レイキャスティングでオブジェクト検出
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      
      this.raycaster.setFromCamera(this.mouse, this.camera);

      // オブジェクトとその子（選択インジケーター含む）を検出対象に
      const intersects = this.raycaster.intersectObjects(this.experimentGroup.children, true);

      // 前回ホバーしていたオブジェクトのエフェクトをリセット
      if (this.lastHoveredObject && this.lastHoveredObject.onHoverExit) {
        this.lastHoveredObject.onHoverExit();
        this.lastHoveredObject = null;
      }

      // 新しいホバー対象を検出
      if (intersects.length > 0) {
        let object = intersects[0].object;

        // 3Dモデルの子メッシュがヒットした場合、親を辿る
        let targetObject = object;
        while (targetObject && !targetObject.userData?.type && !targetObject.userData?.source && targetObject.parent) {
          targetObject = targetObject.parent;
          if (targetObject === this.scene || targetObject === this.experimentGroup) break;
        }
        if (targetObject && (targetObject.userData?.type || targetObject.userData?.source)) {
          object = targetObject;
        }

        // オブジェクトにホバーした場合
        if (object.userData && (object.userData.type === 'generated_image' || object.userData.type === 'generated_video' || object.userData.source === 'imported_file')) {
          // 移動可能なオブジェクトの場合はカーソルを変更
          canvas.style.cursor = 'grab';

          this.lastHoveredObject = { onHoverExit: () => { canvas.style.cursor = 'default'; } };
          return;
        }
      }
      
      // ホバー対象がない場合はデフォルトカーソル
      canvas.style.cursor = 'default';
    }

    /**
     * メインコマンド実行エントリーポイント
     * @param {string} command - 自然言語コマンド
     */
    async executeCommand(command) {
      const timestamp = Date.now();
      console.log(`🎯 Executing: "${command}"`);
      
      try {
        // コマンド解析
        const parsed = this.parseCommand(command);
        console.log('📝 Parsed:', parsed);
        
        // コマンド実行
        const result = await this.dispatchCommand(parsed);
        
        // 履歴に記録
        this.commandHistory.push({
          timestamp,
          command,
          parsed,
          result,
          status: 'success'
        });
        
        return result;
        
      } catch (error) {
        console.error('❌ Command execution failed:', error);
        
        this.commandHistory.push({
          timestamp,
          command,
          error: error.message,
          status: 'error'
        });
        
        throw error;
      }
    }

    /**
     * 自然言語コマンド解析
     * @param {string} command 
     * @returns {object} 解析結果
     */
    parseCommand(command) {
      // ⏎記号（Enterキーのヒント）を削除してからコマンド解析
      command = command.replace(/\s*⏎\s*/g, '').trim();

      // プレフィックスでモードを判定
      if (command.startsWith('[変更] ')) {
        const actualCommand = command.replace('[変更] ', '');
        return this.parseObjectModificationCommand(actualCommand.toLowerCase().trim());
      }
      
      if (command.startsWith('[削除] ')) {
        const actualCommand = command.replace('[削除] ', '');
        return this.parseDeleteCommand(actualCommand.toLowerCase().trim());
      }
      
      // 動画生成の判定（プレフィックスなし = 生成モード）
      const cmd = command.toLowerCase().trim();
      
      // 自然言語オブジェクト操作の判定（「オブジェクト名 + 動作」パターン）
      const naturalLanguagePattern = this.parseNaturalLanguageCommand(cmd);
      if (naturalLanguagePattern) {
        return naturalLanguagePattern;
      }
      
      // 動画関連キーワードをチェック（文脈を考慮）
      const videoKeywords = ['動画', 'ビデオ', 'ムービー', '映像', '動く',
                            'video', 'movie', 'motion', 'moving', 'clip'];

      // アニメーションは文脈で判定
      const isAnimationForVideo = cmd.includes('アニメーション') &&
        (cmd.includes('作って') || cmd.includes('生成') || cmd.includes('を') ||
         cmd.includes('create') || cmd.includes('make') || cmd.includes('generate'));

      const isVideoRequest = videoKeywords.some(keyword => cmd.includes(keyword)) ||
        (cmd.includes('animate') && !cmd.includes('を')) || // "animate a cat"は動画、"猫をanimate"は操作
        isAnimationForVideo;
      
      if (isVideoRequest) {
        return {
          type: 'video_generation',
          prompt: command,
          position: this.parsePosition(cmd),
          size: this.parseSize(cmd)
        };
      }
      
      // オブジェクト選択関連キーワードをチェック
      const selectKeywords = ['選択', 'select', 'オブジェクト選択', '既存', 'existing'];
      const isSelectRequest = selectKeywords.some(keyword => cmd.includes(keyword));
      
      if (isSelectRequest) {
        return {
          type: 'object_selection',
          position: this.parsePosition(cmd)
        };
      }
      
      // ファイルインポート関連キーワードをチェック
      const importKeywords = ['インポート', 'import', '読み込', '読込', 'ファイル', 'file', '画像を選択', '動画を選択', '選択して配置'];
      const isImportRequest = importKeywords.some(keyword => cmd.includes(keyword));
      
      if (isImportRequest) {
        const isVideoImport = cmd.includes('動画') || cmd.includes('video') || cmd.includes('mp4');
        return {
          type: 'file_import',
          fileType: isVideoImport ? 'video' : 'image',
          position: this.parsePosition(cmd),
          size: this.parseSize(cmd)
        };
      }
      
      // 画像生成キーワードをチェック
      const imageKeywords = ['画像', '写真', 'イメージ', '絵', 'ピクチャー', 
                            'image', 'picture', 'photo', 'generate', 'create', 'make', 'draw'];
      imageKeywords.some(keyword => cmd.includes(keyword));
      
      // デフォルト: 画像生成として処理
      return {
        type: 'image_generation',
        prompt: command,
        position: this.parsePosition(cmd),
        size: this.parseSize(cmd)
      };
    }

    /**
     * コマンドから対象オブジェクトを特定
     */
    /**
     * オブジェクト識別用キーワード辞書を取得
     */
    getObjectKeywords() {
      return createObjectKeywords();
    }

    normalizeTargetPhrase(phrase) {
      if (!phrase) {
        return '';
      }

      let result = `${phrase}`.trim();

      result = result.replace(/[。、，,.!?！？]/g, ' ').trim();

      const referentialPattern = /^(さっき|先ほど|直前|最近|この前|その|あの|この|前回|前の|最新|最後|last|latest)\s*(の)?/i;
      while (referentialPattern.test(result)) {
        result = result.replace(referentialPattern, '').trim();
      }

      const politePattern = /(してください|して下さい|してね|してよ|してくれ|してくれませんか|してくださいね|してくださいよ|お願いします?|お願い|頼む)$/i;
      result = result.replace(politePattern, '').trim();

      const trailingPatterns = [
        /(を)?(左右反転|反転|削除|消して|消す|変更|変えて|塗り替えて|塗って|回転|回して|移動|動かして|拡大|縮小|大きく|小さく|並べ|寄せて|整列|選択|選んで|指定|生成|作って|描いて|アップロード|アップして|読み込んで|読み込んだ|開いて|閉じて|置いて|配置して|貼り付けて|flip|delete|remove|change|make|turn|rotate|move|scale|resize|generate|create).*$/i,
        /(を|に|へ|で|から|まで|と|や|って)$/i
      ];

      for (const pattern of trailingPatterns) {
        result = result.replace(pattern, '').trim();
      }

      result = result.replace(/(を|に|へ|で|から|まで|と|や|って)$/i, '').trim();

      if (!result) {
        const englishLeadingPattern = /^(flip|delete|remove|change|make|turn|rotate|move|scale|resize|generate|create)\s+/i;
        if (englishLeadingPattern.test(phrase.trim())) {
          result = phrase.trim().replace(englishLeadingPattern, '').trim();
        }
      }

      result = result.replace(/(を|に|へ|で|から|まで|と|や|って)$/i, '').trim();

      return result;
    }

    isReferentialCommand(command) {
      if (!command) {
        return false;
      }
      return /(さっき|先ほど|直前|最近|前回|前の|最後|最新|last|previous|before)/i.test(command);
    }

    getObjectSourceType(object) {
      if (!object || !object.userData) {
        return null;
      }
      return object.userData.source || object.userData.type || null;
    }

    getRecentObjects(command) {
      const objects = Array.from(this.spawnedObjects.values());
      if (objects.length === 0) {
        return [];
      }

      const importContext = /(インポート|取り込|アップロード|読み込)/.test(command);
      const generatedContext = /(生成|作っ|描い|create|generate)/.test(command);

      let candidates = objects;
      if (importContext) {
        candidates = candidates.filter(obj => this.getObjectSourceType(obj) === 'imported_file');
      } else if (generatedContext) {
        candidates = candidates.filter(obj => {
          const source = this.getObjectSourceType(obj);
          return source === 'generated_image' || source === 'generated_video';
        });
      }

      if (candidates.length === 0) {
        candidates = objects;
      }

      return candidates.sort((a, b) => {
        const aTime = a.userData?.lastModified || a.userData?.createdAt || 0;
        const bTime = b.userData?.lastModified || b.userData?.createdAt || 0;
        return bTime - aTime;
      });
    }

    findRecentObjectByContext(command, normalizedTarget, objectKeywords) {
      const candidates = this.getRecentObjects(command);
      if (candidates.length === 0) {
        return null;
      }

      if (normalizedTarget) {
        for (const candidate of candidates) {
          if (this.matchesObjectName(candidate, normalizedTarget, objectKeywords)) {
            return candidate;
          }
        }
      }

      return candidates[0];
    }

    extractTextTokens(text) {
      if (!text) {
        return [];
      }

      return text
        .replace(/[。、，,.!?！？]/g, ' ')
        .split(/[\s_/\-]+/)
        .map(token => token.trim())
        .filter(token => token.length > 1);
    }

    buildObjectKeywordHints({ prompt = '', fileName = '', baseType = null } = {}) {
      const keywords = new Set();

      if (prompt) {
        keywords.add(prompt.toLowerCase());
        for (const token of this.extractTextTokens(prompt)) {
          keywords.add(token.toLowerCase());
        }
      }

      if (fileName) {
        const baseName = fileName.replace(/\.[^/.]+$/, '');
        keywords.add(baseName.toLowerCase());
        for (const token of this.extractTextTokens(baseName)) {
          keywords.add(token.toLowerCase());
        }
      }

      if (baseType === 'image') {
        ['image', 'photo', 'picture', '画像', '写真', 'イメージ'].forEach(keyword => keywords.add(keyword));
      } else if (baseType === 'video') {
        ['video', 'movie', 'clip', '動画', 'ビデオ', 'ムービー', '映像'].forEach(keyword => keywords.add(keyword));
      }

      return Array.from(keywords).filter(Boolean);
    }

    findObjectByKeyword(command) {
      // 共通翻訳辞書から拡張されたキーワード辞書を使用
      const objectKeywords = this.getObjectKeywords();
      const normalizedCommand = this.normalizeTargetPhrase(command);

      // インポート順序での指定を解析（例: "2番目にインポートした猫", "最初にインポートしたユニコーン"）
      const importOrderMatch = command.match(/((\d+)番目|最初|初回|1番目)に(インポート|取り込)した(.+)/);
      if (importOrderMatch) {
        let orderNumber = 1; // デフォルトは1番目
        if (importOrderMatch[2]) {
          // 数字が指定されている場合
          orderNumber = parseInt(importOrderMatch[2]);
        } else if (importOrderMatch[1] === '最初' || importOrderMatch[1] === '初回') {
          orderNumber = 1;
        } else if (importOrderMatch[1] === '1番目') {
          orderNumber = 1;
        }
        const objectName = this.normalizeTargetPhrase(importOrderMatch[4]) || importOrderMatch[4].trim();
        return this.findImportedObjectByOrder(objectName, orderNumber, objectKeywords);
      }

      // インポート vs 生成の区別（例: "インポートした猫", "生成した犬", "作った画像"）
      const sourceMatch = command.match(/(インポート|取り込|アップロード|読み込|生成|作った)した?(.+)/);
      if (sourceMatch) {
        const sourceType = sourceMatch[1];
        const objectName = this.normalizeTargetPhrase(sourceMatch[2]) || sourceMatch[2].trim();
        const isImported = sourceType === 'インポート' || sourceType === '取り込';
        return this.findObjectBySourceAndName(objectName, isImported, objectKeywords);
      }

      if (this.isReferentialCommand(command)) {
        const recentObject = this.findRecentObjectByContext(command, normalizedCommand, objectKeywords);
        if (recentObject) {
          return recentObject;
        }
      }

      // 従来のキーワード検索（すべてのオブジェクト対象）
      return this.findObjectByName(normalizedCommand || command, objectKeywords);
    }

    /**
     * インポート順序でオブジェクトを検索
     */
    findImportedObjectByOrder(objectName, orderNumber, objectKeywords) {
      // インポートされたオブジェクトのみを取得してimportOrder順でソート
      const importedObjects = [];
      for (const child of this.spawnedObjects.values()) {
        if (!child.userData || this.getObjectSourceType(child) !== 'imported_file') continue;
        importedObjects.push(child);
      }

      // importOrderでソート
      importedObjects.sort((a, b) => (a.userData.importOrder || 0) - (b.userData.importOrder || 0));

      // オブジェクト名でフィルタリング
      const matchingObjects = objectName
        ? importedObjects.filter(child => this.matchesObjectName(child, objectName, objectKeywords))
        : importedObjects;

      if (matchingObjects.length >= orderNumber) {
        const foundObject = matchingObjects[orderNumber - 1]; // 1-based index
        console.log(`🎯 Found ${orderNumber}番目 imported object "${objectName}": ${foundObject.name}`);
        return foundObject;
      }

      console.warn(`⚠️ ${orderNumber}番目にインポートした"${objectName}"が見つかりません`);
      return null;
    }

    /**
     * ソース（インポート/生成）と名前でオブジェクトを検索
     */
    findObjectBySourceAndName(objectName, isImported, objectKeywords) {
      for (const child of this.spawnedObjects.values()) {
        if (!child.userData) continue;

        const childSource = this.getObjectSourceType(child);
        const isChildImported = childSource === 'imported_file';
        const isChildGenerated = childSource === 'generated_image' || childSource === 'generated_video';

        if (isImported && !isChildImported) continue;
        if (!isImported && !isChildGenerated) continue;

        if (this.matchesObjectName(child, objectName, objectKeywords)) {
          const sourceLabel = isImported ? 'インポートした' : '生成した';
          console.log(`🎯 Found ${sourceLabel} object "${objectName}": ${child.name}`);
          return child;
        }
      }

      const sourceLabel = isImported ? 'インポートした' : '生成した';
      console.warn(`⚠️ ${sourceLabel}"${objectName}"が見つかりません`);
      return null;
    }

    /**
     * 名前でオブジェクトを検索（従来の方式）
     */
    findObjectByName(command, objectKeywords) {
      const target = command && command.trim();
      if (!target) {
        return null;
      }

      for (const child of this.spawnedObjects.values()) {
        if (!child) continue;
        if (this.matchesObjectName(child, target, objectKeywords)) {
          return child;
        }
      }
      return null;
    }

    /**
     * オブジェクトが指定された名前にマッチするかチェック
     */
    matchesObjectName(child, objectName, objectKeywords) {
      if (!child || !objectName) {
        return false;
      }

      const targetLower = objectName.toLowerCase();

      // 1. オブジェクト名の直接マッチング（最優先）
      if (child.name) {
        const childNameLower = child.name.toLowerCase();
        // 完全一致またはオブジェクト名がターゲットに含まれる
        if (childNameLower === targetLower || targetLower.includes(childNameLower)) {
          return true;
        }
      }

      // 2. キーワードマッチング
      if (child.userData && Array.isArray(child.userData.keywords)) {
        for (const keyword of child.userData.keywords) {
          if (!keyword) continue;
          const keywordLower = keyword.toLowerCase();
          if (targetLower.includes(keywordLower) || keywordLower.includes(targetLower)) {
            return true;
          }
        }
      }

      for (const [keyword, aliases] of Object.entries(objectKeywords)) {
        const keywordLower = keyword.toLowerCase();
        if (targetLower.includes(keywordLower)) {
          return true;
        }

        for (const alias of aliases) {
          const aliasLower = alias.toLowerCase();
          if (targetLower.includes(aliasLower)) {
            return true;
          }
        }
      }

      if (child.userData && child.userData.prompt) {
        const promptLower = child.userData.prompt.toLowerCase();
        if (promptLower.includes(targetLower) || targetLower.includes(promptLower)) {
          return true;
        }
      }

      if (child.userData && child.userData.fileName) {
        if (matchKeywordWithFilename(objectName, child.userData.fileName, objectKeywords)) {
          return true;
        }
      }

      return false;
    }

    /**
     * 画像生成コマンド解析
     */
    parseImageGenerationCommand(command) {
      // プロンプト抽出 (「を」「に」「で」などで区切る)
      let prompt = command;
      const particles = ['を', 'に', 'で', 'の'];
      
      for (const particle of particles) {
        if (command.includes(particle)) {
          const parts = command.split(particle);
          if (parts[0]) {
            prompt = parts[0].trim();
            break;
          }
        }
      }
      
      // 不要な語句を除去
      prompt = prompt
        .replace(/(画像|作って|生成|して|ください)/g, '')
        .trim();
      
      return {
        type: 'image_generation',
        prompt,
        position: this.parsePosition(command),
        size: this.parseSize(command)
      };
    }

    /**
     * オブジェクト変更コマンド解析
     */
    parseObjectModificationCommand(command) {
      const cmd = command.toLowerCase().trim();
      
      // 色変更の解析
      let color = null;
      const colorMap = {
        '赤': 0xff0000, '赤色': 0xff0000,
        '青': 0x0000ff, '青色': 0x0000ff,
        'ブルー': 0x0000ff,
        '緑': 0x00ff00, '緑色': 0x00ff00,
        '黄': 0xffff00, '黄色': 0xffff00, '黄色い': 0xffff00,
        '紫': 0xff00ff, '紫色': 0xff00ff,
        '橙': 0xff8800, '橙色': 0xff8800, 'オレンジ': 0xff8800, 'オレンジ色': 0xff8800,
        '白': 0xffffff, '白色': 0xffffff,
        '黒': 0x000000, '黒色': 0x000000,
        '灰': 0x808080, '灰色': 0x808080, 'グレー': 0x808080, 'グレー色': 0x808080,
        'ピンク': 0xffc0cb, 'ピンク色': 0xffc0cb,
        '茶': 0x8b4513, '茶色': 0x8b4513,
        '銀': 0xc0c0c0, '銀色': 0xc0c0c0,
        '金': 0xffd700, '金色': 0xffd700
      };
      
      for (const [colorName, colorValue] of Object.entries(colorMap)) {
        if (cmd.includes(colorName)) {
          color = colorValue;
          break;
        }
      }

      // エフェクト解析の追加
      const effects = this.parseEffects(cmd);
      console.log(`🔍 parseObjectModificationCommand - Effects found:`, effects);
      
      // サイズ変更の解析
      let scale = null;
      if (cmd.includes('大きく') || cmd.includes('拡大')) {
        scale = 1.5;
      } else if (cmd.includes('小さく') || cmd.includes('縮小')) {
        scale = 0.7;
      } else if (cmd.includes('倍')) {
        const match = cmd.match(/(\d+(?:\.\d+)?)\s*倍/);
        if (match) {
          scale = parseFloat(match[1]);
        }
      }
      
      // 移動コマンドの解析
      let movement = null;
      if (cmd.includes('移動') || cmd.includes('動か') || cmd.includes('へ')) {
        movement = this.parsePositionFromPrompt(cmd);
      }

      // 回転コマンドの解析
      let rotation = null;
      if (cmd.includes('回転') || cmd.includes('回す') || cmd.includes('回して') || cmd.includes('rotate')) {
        // 角度指定があるかチェック
        const degreeMatch = cmd.match(/(\d+)\s*度/);
        if (degreeMatch) {
          rotation = parseFloat(degreeMatch[1]) * Math.PI / 180; // 度をラジアンに変換
        } else {
          rotation = Math.PI / 4; // デフォルトは45度
        }
      }

      // 透明度コマンドの解析
      let opacity = null;
      if (cmd.includes('透明') || cmd.includes('transparent')) {
        if (cmd.includes('半透明')) {
          opacity = 0.5;
        } else {
          opacity = 0.3; // デフォルトの透明度
        }
      } else if (cmd.includes('不透明') || cmd.includes('opaque')) {
        opacity = 1.0;
      }

      // 反転コマンドの解析
      let flip = null;
      if (cmd.includes('左右反転') || cmd.includes('反転') || cmd.includes('ひっくり返') || cmd.includes('flip')) {
        flip = true;
      }

      return {
        type: 'object_modification',
        command: command,
        color: color,
        scale: scale,
        movement: movement,
        rotation: rotation,
        opacity: opacity,
        flip: flip,
        effects: effects,
        requiresSelection: true
      };
    }

    /**
     * エフェクト解析 - Phase 2 総合エフェクトシステム
     */
    parseEffects(cmd) {
      const effects = [];

      // エフェクトキーワード辞書
      const effectKeywords = {
        // 透明度系
        '透明': { type: 'opacity', value: 0.0, name: 'transparent' },
        '半透明': { type: 'opacity', value: 0.5, name: 'semi_transparent' },
        '不透明': { type: 'opacity', value: 1.0, name: 'opaque' },
        '濃く': { type: 'opacity', value: 1.0, name: 'solid' },

        // 発光系
        '光らせ': { type: 'glow', color: 0xffffff, intensity: 0.5, name: 'glow_white' },
        '光る': { type: 'glow', color: 0xffffff, intensity: 0.5, name: 'glow_white' },
        'ネオン': { type: 'glow', color: 0x00ffff, intensity: 0.8, name: 'neon_cyan' },
        'ホログラム': { type: 'glow', color: 0x00ffff, intensity: 0.6, name: 'hologram' },

        // 材質系
        'メタリック': { type: 'material', metalness: 0.8, roughness: 0.2, name: 'metallic' },
        '金属質': { type: 'material', metalness: 0.9, roughness: 0.1, name: 'metallic_shiny' },
        'ガラス': { type: 'material', metalness: 0.0, roughness: 0.0, name: 'glass' },
        'マット': { type: 'material', metalness: 0.0, roughness: 1.0, name: 'matte' },

        // アニメーション系
        'ふわふわ': { type: 'animation', animation: 'float', speed: 0.002, amplitude: 0.5, name: 'float_gentle' },
        '浮く': { type: 'animation', animation: 'float', speed: 0.003, amplitude: 0.8, name: 'float_strong' },
        '漂う': { type: 'animation', animation: 'float', speed: 0.001, amplitude: 0.3, name: 'float_slow' },

        'ドクドク': { type: 'animation', animation: 'pulse', speed: 0.003, amplitude: 0.15, name: 'pulse_heartbeat' },
        '鼓動': { type: 'animation', animation: 'pulse', speed: 0.0025, amplitude: 0.1, name: 'pulse_heart' },
        '脈動': { type: 'animation', animation: 'pulse', speed: 0.004, amplitude: 0.2, name: 'pulse_throb' },

        'くるくる': { type: 'animation', animation: 'spin', speed: 0.02, axis: 'y', name: 'spin_y' },
        'スピン': { type: 'animation', animation: 'spin', speed: 0.03, axis: 'y', name: 'spin_fast' },
        '回る': { type: 'animation', animation: 'spin', speed: 0.015, axis: 'y', name: 'spin_slow' },

        'きらめ': { type: 'animation', animation: 'sparkle', intensity: 0.8, name: 'sparkle' },
        '輝': { type: 'animation', animation: 'sparkle', intensity: 1.0, name: 'shine' },
        'キラキラ': { type: 'animation', animation: 'sparkle', intensity: 0.9, name: 'twinkle' },

        // 宇宙的エフェクト
        '宇宙': { type: 'cosmic', colors: [0x4444ff, 0xff4488, 0x44ffaa], intensity: 0.9, name: 'cosmic' },
        'オーロラ': { type: 'aurora', colors: [0x00ffaa, 0x4488ff, 0xff88aa], intensity: 0.8, name: 'aurora' },
        '星雲': { type: 'nebula', colors: [0x8844ff, 0xff8844, 0x44aaff], intensity: 1.0, name: 'nebula' },
        'エネルギー': { type: 'energy', colors: [0xffaa00, 0x00aaff, 0xaa00ff], intensity: 0.7, name: 'energy' },
        '神秘的': { type: 'mystic', colors: [0xaa44ff, 0xff44aa, 0x44ffff], intensity: 0.6, name: 'mystic' },

        // アート系エフェクト
        '水彩': { type: 'watercolor_art', colors: [0xff6b9d, 0x4ecdc4, 0xffe66d, 0x95e1d3], opacity: 0.6, name: 'watercolor' },
        '水彩画': { type: 'watercolor_art', colors: [0xff6b9d, 0x4ecdc4, 0xffe66d, 0x95e1d3], opacity: 0.6, name: 'watercolor' },
        'パステル': { type: 'pastel_art', colors: [0xffb3ba, 0xffdfba, 0xffffba, 0xbaffc9, 0xbae1ff], opacity: 0.7, name: 'pastel' },
        '虹色': { type: 'rainbow_glow', colors: [0xff0000, 0xff8800, 0xffff00, 0x00ff00, 0x0088ff, 0x0000ff, 0x8800ff], intensity: 0.5, name: 'rainbow_glow' },
        
        // モノクロ・グレースケール系
        'モノクロ': { type: 'monochrome', name: 'monochrome' },
        'グレースケール': { type: 'monochrome', name: 'grayscale' },
        'モノクロに': { type: 'monochrome', name: 'monochrome' },
        '白黒': { type: 'monochrome', name: 'black_white' }
      };

      // プリセット効果
      const presetEffects = {
        '魔法っぽく': [
          { type: 'glow', color: 0xcc44ff, intensity: 0.7, name: 'magic_glow' },
          { type: 'animation', animation: 'pulse', speed: 0.003, amplitude: 0.1, name: 'magic_pulse' },
          { type: 'animation', animation: 'sparkle', intensity: 0.6, name: 'magic_sparkle' }
        ],
        '幽霊': [
          { type: 'opacity', value: 0.6, name: 'ghost_transparent' },
          { type: 'animation', animation: 'float', speed: 0.002, amplitude: 0.4, name: 'ghost_float' },
          { type: 'glow', color: 0xffffff, intensity: 0.3, name: 'ghost_aura' }
        ],
        'サイバー': [
          { type: 'glow', color: 0x00ffaa, intensity: 0.8, name: 'cyber_glow' },
          { type: 'material', metalness: 0.8, roughness: 0.1, name: 'cyber_metal' },
          { type: 'animation', animation: 'glitch', intensity: 0.1, name: 'cyber_glitch' }
        ],
        '夢みたい': [
          { type: 'opacity', value: 0.7, name: 'dream_soft' },
          { type: 'animation', animation: 'float', speed: 0.0015, amplitude: 0.3, name: 'dream_float' },
          { type: 'animation', animation: 'rainbow', speed: 0.001, name: 'dream_rainbow' }
        ]
      };

      // プリセット効果をチェック
      for (const [presetName, presetEffectList] of Object.entries(presetEffects)) {
        if (cmd.includes(presetName)) {
          effects.push(...presetEffectList);
          console.log(`✨ Preset effect applied: ${presetName}`);
          continue;
        }
      }

      const chromaRequested = this.requiresChromaKey(cmd);
      const chromaConfig = chromaRequested ? this.detectChromaKeyConfig(cmd) : null;
      const canApplyChroma = chromaConfig !== null;

      // 個別効果をチェック
      console.log(`🔍 Checking effects for cmd: "${cmd}"`);
      for (const [keyword, effect] of Object.entries(effectKeywords)) {
        if (canApplyChroma && keyword === '透明') {
          continue;
        }
        console.log(`🔍 Checking keyword: "${keyword}" in cmd: "${cmd}"`);
        if (cmd.includes(keyword)) {
          effects.push(effect);
          console.log(`🎭 Effect detected: ${keyword} -> ${effect.name}`);
          if (keyword === 'キラキラ') {
            console.log(`✨ SPARKLE EFFECT FOUND! cmd="${cmd}"`);
          }
        }
      }

      if (chromaRequested) {
        if (canApplyChroma) {
          effects.push({
            type: 'chroma_key',
            color: chromaConfig.color,
            threshold: chromaConfig.threshold,
            smoothing: chromaConfig.smoothing,
            name: 'chroma_key'
          });
          console.log(`🪄 Chroma key requested (color: #${chromaConfig.color.toString(16)}, threshold: ${chromaConfig.threshold})`);
        } else if (this.commandUI) {
          this.commandUI.showInputFeedback('背景を透過するには背景色を指定してください（例：「背景の白を透過して」）', 'info');
        }
      }

      return effects;
    }

    requiresChromaKey(cmd) {
      if (!cmd) return false;
      const chromaKeywords = ['クロマキー', 'グリーンバック', 'remove background', 'transparent background'];
      if (chromaKeywords.some(keyword => cmd.includes(keyword))) {
        return true;
      }
      const backgroundTerms = ['背景を', '背景の', '背景'];
      const actionTerms = ['透過', '透明', '消', '抜', 'なくして'];
      if (backgroundTerms.some(term => cmd.includes(term)) && actionTerms.some(term => cmd.includes(term))) {
        return true;
      }
      return false;
    }

    detectChromaKeyConfig(cmd) {
      const color = this.detectChromaKeyColor(cmd);
      if (color === null) {
        return null;
      }
      let threshold;
      switch (color) {
        case 0xffffff:
          threshold = 0.12;
          break;
        case 0x000000:
          threshold = 0.14;
          break;
        case 0x00ff00:
          threshold = 0.32;
          break;
        case 0x0000ff:
          threshold = 0.3;
          break;
        default:
          threshold = 0.2;
      }
      return {
        color,
        threshold,
        smoothing: 0.1
      };
    }

    detectChromaKeyColor(cmd) {
      const hexMatch = cmd.match(/#([0-9a-fA-F]{6})/);
      if (hexMatch) {
        return parseInt(hexMatch[1], 16);
      }

      const colorKeywords = [
        { tokens: ['白', 'ホワイト', 'しろ'], value: 0xffffff },
        { tokens: ['黒', 'ブラック', 'くろ'], value: 0x000000 },
        { tokens: ['緑', 'グリーン', 'みどり'], value: 0x00ff00 },
        { tokens: ['青', 'ブルー', 'あお'], value: 0x0000ff },
        { tokens: ['赤', 'レッド', 'あか'], value: 0xff0000 },
        { tokens: ['黄', 'イエロー', 'きいろ'], value: 0xffff00 },
        { tokens: ['ピンク'], value: 0xffc0cb },
        { tokens: ['オレンジ'], value: 0xff8800 }
      ];

      for (const entry of colorKeywords) {
        if (entry.tokens.some(token => cmd.includes(token))) {
          return entry.value;
        }
      }

      if (cmd.includes('グリーンバック')) {
        return 0x00ff00;
      }

      return null;
    }

    /**
     * エフェクト適用システム - Phase 2
     */
    applyEffects(targetObject, effects) {
      let applied = false;

      for (const effect of effects) {
        console.log(`✨ Applying effect: ${effect.name} (${effect.type})`);

        switch (effect.type) {
          case 'opacity':
            applied = this.applyOpacityEffect(targetObject, effect) || applied;
            break;
          case 'glow':
            applied = this.applyGlowEffect(targetObject, effect) || applied;
            break;
          case 'material':
            applied = this.applyMaterialEffect(targetObject, effect) || applied;
            break;
          case 'animation':
            applied = this.applyAnimationEffect(targetObject, effect) || applied;
            break;
          case 'cosmic':
          case 'aurora':
          case 'nebula':
          case 'energy':
          case 'mystic':
          case 'rainbow_glow':
            applied = this.applyCosmicEffect(targetObject, effect) || applied;
            break;
          case 'watercolor_art':
          case 'pastel_art':
            applied = this.applyWatercolorEffect(targetObject, effect) || applied;
            break;
          case 'chroma_key':
            applied = this.applyChromaKeyEffect(targetObject, effect) || applied;
            break;
          case 'monochrome':
            applied = this.applyMonochromeEffect(targetObject, effect) || applied;
            break;
          default:
            console.warn(`🚫 Unknown effect type: ${effect.type}`);
        }
      }

      return applied;
    }

    /**
     * 透明度エフェクト適用
     */
    applyOpacityEffect(targetObject, effect) {
      if (!targetObject.material) return false;

      targetObject.material.transparent = true;
      targetObject.material.opacity = effect.value;
      targetObject.material.needsUpdate = true;

      // エフェクトが適用されたことをマーク
      if (!targetObject.userData) targetObject.userData = {};
      targetObject.userData.hasOpacityEffect = true;
      targetObject.userData.originalOpacity = effect.value;

      console.log(`👻 Opacity set to: ${effect.value} (${effect.name})`);
      return true;
    }

    /**
     * 発光エフェクト適用
     */
    applyGlowEffect(targetObject, effect) {
      if (!targetObject.material) return false;

      if (this.ensureEmissiveSupport(targetObject)) {
        targetObject.material.emissive = new THREE.Color(effect.color);
        targetObject.material.emissiveIntensity = effect.intensity;
        targetObject.material.needsUpdate = true;
        console.log(`💡 Glow applied: color=0x${effect.color.toString(16)}, intensity=${effect.intensity}`);
        return true;
      }

      // Fallback: 調色による簡易発光表現
      const fallbackColor = new THREE.Color(effect.color);
      if (!targetObject.userData.originalColor) {
        targetObject.userData.originalColor = targetObject.material.color ? targetObject.material.color.clone() : null;
      }
      if (targetObject.material.color) {
        targetObject.material.color.lerp(fallbackColor, 0.4);
        targetObject.material.needsUpdate = true;
        console.log('💡 Glow fallback applied via color tint');
        return true;
      }

      console.warn('🚫 Glow effect could not be applied');
      return false;
    }

    ensureEmissiveSupport(targetObject) {
      const material = targetObject.material;
      if (!material) return false;
      return 'emissive' in material && material.emissive !== undefined;
    }

    /**
     * 材質エフェクト適用
     */
    applyMaterialEffect(targetObject, effect) {
      if (!targetObject.material) return false;

      // StandardMaterial の場合のみ適用
      if (targetObject.material.type === 'MeshStandardMaterial') {
        if (effect.metalness !== undefined) {
          targetObject.material.metalness = effect.metalness;
        }
        if (effect.roughness !== undefined) {
          targetObject.material.roughness = effect.roughness;
        }
        targetObject.material.needsUpdate = true;

        console.log(`🔩 Material updated: metalness=${effect.metalness}, roughness=${effect.roughness}`);
        return true;
      } else {
        console.warn(`🚫 Material effect requires StandardMaterial, got: ${targetObject.material.type}`);
        return false;
      }
    }

    /**
     * アニメーションエフェクト適用
     */
    applyAnimationEffect(targetObject, effect) {
      // アニメーション管理オブジェクトを初期化
      if (!this.animations) {
        this.animations = new Map();
        this.startAnimationLoop();
      }

      const animationId = `${targetObject.uuid}_${effect.animation}`;

      // 既存のアニメーションがあれば停止
      if (this.animations.has(animationId)) {
        this.animations.delete(animationId);
      }

      // 新しいアニメーションを追加
      const animationData = {
        object: targetObject,
        type: effect.animation,
        speed: effect.speed,
        amplitude: effect.amplitude || 1.0,
        axis: effect.axis || 'y',
        intensity: effect.intensity || 1.0,
        startTime: Date.now(),
        originalPosition: { ...targetObject.position },
        originalScale: { ...targetObject.scale },
        originalRotation: { ...targetObject.rotation }
      };

      this.animations.set(animationId, animationData);
      console.log(`🎬 Animation started: ${effect.animation} for ${targetObject.name}`);
      return true;
    }

    /**
     * 宇宙的エフェクト適用（オーロラ、星雲、エネルギー）
     */
    applyCosmicEffect(targetObject, effect) {
      if (!targetObject.material) return false;

      const useColorFallback = !this.ensureEmissiveSupport(targetObject);

      // アニメーション管理オブジェクトを初期化
      if (!this.animations) {
        this.animations = new Map();
        this.startAnimationLoop();
      }

      // 複数色の発光と色変化アニメーションを組み合わせ
      const cosmicAnimationId = `${targetObject.uuid}_${effect.type}`;

      // 既存のコスミックエフェクトがあれば削除
      if (this.animations.has(cosmicAnimationId)) {
        this.animations.delete(cosmicAnimationId);
      }

      if (useColorFallback) {
        if (targetObject.material.color) {
          if (!targetObject.userData.originalColor) {
            targetObject.userData.originalColor = targetObject.material.color.clone();
          }
          targetObject.material.color.set(effect.colors[0]);
          targetObject.material.needsUpdate = true;
        } else {
          console.warn('🚫 Cosmic fallback could not adjust color');
        }
      } else {
        targetObject.material.emissive = new THREE.Color(effect.colors[0]);
        targetObject.material.emissiveIntensity = effect.intensity;
        targetObject.material.needsUpdate = true;
      }

      // コスミックアニメーションデータを作成
      const cosmicData = {
        object: targetObject,
        type: 'cosmic',
        cosmicType: effect.type,
        colors: effect.colors,
        intensity: effect.intensity,
        speed: this.getCosmicSpeed(effect.type),
        startTime: Date.now(),
        colorIndex: 0,
        originalEmissive: !useColorFallback && targetObject.material.emissive ? targetObject.material.emissive.clone() : null,
        originalEmissiveIntensity: !useColorFallback ? (targetObject.material.emissiveIntensity || 0) : 0,
        useColorFallback
      };

      this.animations.set(cosmicAnimationId, cosmicData);
      console.log(`🌌 Cosmic effect started: ${effect.type} with ${effect.colors.length} colors`);
      return true;
    }

    applyChromaKeyEffect(targetObject, effect) {
      if (!targetObject.material) return false;
      const material = targetObject.material;
      const texture = material.map;

      if (!texture) {
        console.warn('🚫 Chroma key requires texture map');
        return false;
      }

      if (material.userData && material.userData.isChromaKeyMaterial && material.uniforms) {
        material.uniforms.keyColor.value.setHex(effect.color);
        material.uniforms.threshold.value = effect.threshold;
        material.uniforms.smoothing.value = effect.smoothing;
        material.needsUpdate = true;
        console.log('🎯 Updated existing chroma key material');
        return true;
      }

      const shaderMaterial = new THREE.ShaderMaterial({
        uniforms: {
          map: { value: texture },
          keyColor: { value: new THREE.Color(effect.color) },
          threshold: { value: effect.threshold },
          smoothing: { value: effect.smoothing }
        },
        vertexShader: `varying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}`,
        fragmentShader: `uniform sampler2D map;\nuniform vec3 keyColor;\nuniform float threshold;\nuniform float smoothing;\nvarying vec2 vUv;\nvoid main() {\n  vec4 color = texture2D(map, vUv);\n  float dist = distance(color.rgb, keyColor);\n  float alpha = smoothstep(threshold, threshold + smoothing, dist) * color.a;\n  if (alpha <= 0.0) discard;\n  gl_FragColor = vec4(color.rgb, alpha);\n}`,
        transparent: true,
        side: THREE.DoubleSide,
        depthTest: material.depthTest,
        depthWrite: material.depthWrite,
        toneMapped: material.toneMapped === true
      });

      shaderMaterial.userData.isChromaKeyMaterial = true;
      targetObject.material = shaderMaterial;

      if (typeof material.dispose === 'function') {
        material.dispose();
      }

      console.log('🪄 Applied chroma key shader material');
      return true;
    }

    /**
     * モノクロ（グレースケール）エフェクト適用
     */
    applyMonochromeEffect(targetObject, effect) {
      if (!targetObject.material) return false;
      const material = targetObject.material;
      const texture = material.map;

      if (!texture) {
        console.warn('🚫 Monochrome effect requires texture map');
        return false;
      }

      // 既存のモノクロマテリアルをチェック
      if (material.userData && material.userData.isMonochromeMaterial && material.uniforms) {
        console.log('🎯 Monochrome material already applied');
        return true;
      }

      // グレースケール用のシェーダーマテリアルを作成
      const shaderMaterial = new THREE.ShaderMaterial({
        uniforms: {
          map: { value: texture }
        },
        vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
        fragmentShader: `
        uniform sampler2D map;
        varying vec2 vUv;
        void main() {
          vec4 color = texture2D(map, vUv);
          // ルミナンス（輝度）計算でグレースケール化
          float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
          gl_FragColor = vec4(vec3(gray), color.a);
        }
      `,
        transparent: material.transparent,
        side: THREE.DoubleSide,
        depthTest: material.depthTest,
        depthWrite: material.depthWrite,
        toneMapped: material.toneMapped === true
      });

      shaderMaterial.userData.isMonochromeMaterial = true;
      targetObject.material = shaderMaterial;

      // 古いマテリアルを削除
      if (typeof material.dispose === 'function') {
        material.dispose();
      }

      console.log('⚫ Applied monochrome effect');
      return true;
    }

    /**
     * 宇宙的エフェクトのスピード設定
     */
    getCosmicSpeed(cosmicType) {
      switch (cosmicType) {
        case 'cosmic': return 0.0005;      // ゆっくりと神秘的に
        case 'aurora': return 0.0008;      // オーロラのような流れ
        case 'nebula': return 0.0003;      // 星雲のようにゆったり
        case 'energy': return 0.0015;      // エネルギッシュに
        case 'mystic': return 0.0006;      // 神秘的にゆらゆら
        case 'rainbow_glow': return 0.001; // 虹色は適度なスピード
        default: return 0.0008;
      }
    }

    /**
     * 水彩画・パステル系エフェクト適用
     */
    applyWatercolorEffect(targetObject, effect) {
      if (!targetObject.material) return false;

      // 透明度を設定
      targetObject.material.transparent = true;
      targetObject.material.opacity = effect.opacity;

      // アニメーション管理オブジェクトを初期化
      if (!this.animations) {
        this.animations = new Map();
        this.startAnimationLoop();
      }

      // 水彩画アニメーションID
      const watercolorAnimationId = `${targetObject.uuid}_${effect.type}`;

      // 既存の水彩画エフェクトがあれば削除
      if (this.animations.has(watercolorAnimationId)) {
        this.animations.delete(watercolorAnimationId);
      }

      // 初期色を設定（発光ではなく拡散色）
      targetObject.material.color = new THREE.Color(effect.colors[0]);
      targetObject.material.needsUpdate = true;

      // 水彩画アニメーションデータを作成
      const watercolorData = {
        object: targetObject,
        type: 'watercolor',
        artType: effect.type,
        colors: effect.colors,
        opacity: effect.opacity,
        speed: this.getWatercolorSpeed(effect.type),
        startTime: Date.now(),
        colorIndex: 0,
        originalColor: new THREE.Color(targetObject.material.color),
        originalOpacity: targetObject.material.opacity
      };

      this.animations.set(watercolorAnimationId, watercolorData);
      console.log(`🎨 Watercolor effect started: ${effect.type} with ${effect.colors.length} colors`);
      return true;
    }

    /**
     * 水彩画系エフェクトのスピード設定
     */
    getWatercolorSpeed(artType) {
      switch (artType) {
        case 'watercolor_art': return 0.0003;  // 水彩画は非常にゆっくり
        case 'pastel_art': return 0.0002;      // パステルはより穏やか
        default: return 0.0003;
      }
    }

    /**
     * アニメーションループ開始
     */
    startAnimationLoop() {
      if (this.animationLoopRunning) return;

      this.animationLoopRunning = true;

      const animate = () => {
        const hasCustomAnimations = this.animations && this.animations.size > 0;
        const hasMixers = this.animationMixers && this.animationMixers.size > 0;

        if (hasCustomAnimations || hasMixers) {
          this.updateAnimations();
        } else {
          this.animationLoopRunning = false;
          return;
        }

        if (this.animationLoopRunning) {
          requestAnimationFrame(animate);
        }
      };

      animate();
      console.log(`🎭 Animation loop started`);
    }

    /**
     * アニメーション更新
     */
    updateAnimations() {
      const delta = this.clock.getDelta();
      if (this.animationMixers && this.animationMixers.size > 0) {
        for (const mixer of this.animationMixers) {
          mixer.update(delta);
        }
      }

      if (!this.animations || this.animations.size === 0) {
        return;
      }

      const currentTime = Date.now();

      for (const [id, animation] of this.animations.entries()) {
        const elapsed = (currentTime - animation.startTime) * 0.001; // 秒に変換

        switch (animation.type) {
          case 'float':
            this.updateFloatAnimation(animation, elapsed);
            break;
          case 'pulse':
            this.updatePulseAnimation(animation, elapsed);
            break;
          case 'spin':
            this.updateSpinAnimation(animation, elapsed);
            break;
          case 'sparkle':
            this.updateSparkleAnimation(animation, elapsed);
            break;
          case 'rainbow':
            this.updateRainbowAnimation(animation, elapsed);
            break;
          case 'glitch':
            this.updateGlitchAnimation(animation, elapsed);
            break;
          case 'cosmic':
            this.updateCosmicAnimation(animation, elapsed);
            break;
          case 'watercolor':
            this.updateWatercolorAnimation(animation, elapsed);
            break;
        }
      }
    }

    async ensureGLTFLoader() {
      if (this.gltfLoader) {
        return this.gltfLoader;
      }

      let LoaderClass = null;

      // ブラウザのグローバル THREE.GLTFLoader を優先（UMD形式で読み込まれた場合）
      if (typeof window !== 'undefined' && window.THREE && window.THREE.GLTFLoader) {
        LoaderClass = window.THREE.GLTFLoader;
      } else if (typeof globalThis !== 'undefined' && globalThis.GLTFLoader) {
        LoaderClass = globalThis.GLTFLoader;
      }

      if (!LoaderClass) {
        try {
          const module = await import('three/examples/jsm/loaders/GLTFLoader.js');
          LoaderClass = module.GLTFLoader || module.default || null;
        } catch (localError) {
          try {
            if (typeof window !== 'undefined') {
              const specifier = 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js';
              const dynamicImport = new Function('specifier', 'return import(specifier);');
              const module = await dynamicImport(specifier);
              LoaderClass = module.GLTFLoader || module.default || null;
            }
          } catch (remoteError) {
            console.error('⚠️ Failed to load GLTFLoader dynamically:', remoteError);
            LoaderClass = null;
          }
        }
      }

      if (!LoaderClass) {
        throw new Error('GLTFLoader が利用できない構成です。three/examples/jsm/loaders/GLTFLoader.js を読み込んでください。');
      }

      this.gltfLoader = new LoaderClass();
      if (typeof this.gltfLoader.setCrossOrigin === 'function') {
        this.gltfLoader.setCrossOrigin('anonymous');
      }
      return this.gltfLoader;
    }

    async load3DModel(modelUrl, options = {}) {
      if (!modelUrl) {
        throw new Error('3DモデルのURLが指定されていません');
      }

      const { position = { x: 0, y: 3, z: 12 }, rotation = null, scale = null, fileName = null, onProgress = null } = options;

      try {
        const loader = await this.ensureGLTFLoader();
        const gltf = await loader.loadAsync(modelUrl, onProgress || undefined);

        const modelRoot = gltf.scene || (gltf.scenes && gltf.scenes[0]);
        if (!modelRoot) {
          throw new Error('GLBファイルにシーンデータが含まれていません');
        }

        // 名前とメタデータ設定
        const objectId = `imported_model_${++this.objectCounter}`;
        modelRoot.name = objectId;

        // マテリアル調整・影設定
        modelRoot.traverse(node => {
          if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
            if (node.material) {
              // metalness = 0にして照明なしでも見えるようにする
              if (node.material.metalness !== undefined) {
                node.material.metalness = 0;
              }

              // Tone Mapping + Exposureで暗いシーンでも見える（2025年標準）
              node.material.needsUpdate = true;
            }
          }
        });

        // スケール調整
        modelRoot.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(modelRoot);
        const size = box.getSize(new THREE.Vector3(1, 1, 1));
        const maxDimension = Math.max(size.x, size.y, size.z);
        const targetSize = this.config.defaultModelSize || 6;
        if (!scale && isFinite(maxDimension) && maxDimension > 0) {
          const scaleFactor = targetSize / maxDimension;
          modelRoot.scale.multiplyScalar(scaleFactor);
        } else if (scale) {
          if (typeof scale === 'number') {
            modelRoot.scale.setScalar(scale);
          } else if (Array.isArray(scale) && scale.length === 3) {
            modelRoot.scale.set(scale[0], scale[1], scale[2]);
          }
        }

        // 位置決め
        const finalPosition = this.resolveSpawnPosition(position);
        modelRoot.position.copy(finalPosition);

        if (position?.orientation) {
          if (position.orientation.isQuaternion) {
            modelRoot.quaternion.copy(position.orientation);
          } else {
            modelRoot.quaternion.set(
              position.orientation.x ?? 0,
              position.orientation.y ?? 0,
              position.orientation.z ?? 0,
              position.orientation.w ?? 1
            );
          }
        }

        if (rotation) {
          modelRoot.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
        }

        // アニメーション再生
        if (gltf.animations && gltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(modelRoot);
          gltf.animations.forEach(clip => {
            const action = mixer.clipAction(clip);
            action.play();
          });
          this.animationMixers.add(mixer);
          modelRoot.userData.animationMixer = mixer;
          modelRoot.userData.animationClips = gltf.animations;
          this.startAnimationLoop();
        }

        const promptBase = fileName ? fileName.replace(/\.[^/.]+$/, '') : 'imported_model';

        modelRoot.userData = {
          ...(modelRoot.userData || {}),
          id: objectId,
          source: 'imported_file',
          type: 'generated_3d_model',
          createdAt: Date.now(),
          fileName: fileName || null,
          fileUrl: modelUrl,
          keywords: this.buildObjectKeywordHints({ prompt: promptBase, fileName, baseType: '3d' }),
          originalScale: modelRoot.scale.clone()
        };

        this.experimentGroup.add(modelRoot);
        this.registerSpawnedObject(objectId, modelRoot, {
          reason: 'imported_3d_model',
          fileName: fileName || null
        });

        if (this.config.showLocationIndicator) {
          this.createLocationIndicator(position);
        }

        console.log(`✅ Imported 3D model: ${objectId}`);

        return {
          objectId,
          position: finalPosition,
          success: true,
          hasAnimations: !!(gltf.animations && gltf.animations.length > 0)
        };
      } catch (error) {
        console.error('📦 3D model loading failed:', error);
        throw error;
      }
    }

    /**
     * 浮遊アニメーション
     */
    updateFloatAnimation(animation, elapsed) {
      const yOffset = Math.sin(elapsed * animation.speed * 2 * Math.PI) * animation.amplitude;
      animation.object.position.y = animation.originalPosition.y + yOffset;
    }

    /**
     * パルスアニメーション
     */
    updatePulseAnimation(animation, elapsed) {
      const scaleOffset = Math.sin(elapsed * animation.speed * 2 * Math.PI) * animation.amplitude;
      const newScale = 1 + scaleOffset;
      animation.object.scale.setScalar(animation.originalScale.x * newScale);
    }

    /**
     * 回転アニメーション
     */
    updateSpinAnimation(animation, elapsed) {
      const rotationAmount = elapsed * animation.speed * 2 * Math.PI;
      if (animation.axis === 'x') {
        animation.object.rotation.x = animation.originalRotation.x + rotationAmount;
      } else if (animation.axis === 'y') {
        animation.object.rotation.y = animation.originalRotation.y + rotationAmount;
      } else if (animation.axis === 'z') {
        animation.object.rotation.z = animation.originalRotation.z + rotationAmount;
      }
    }

    /**
     * キラキラアニメーション（発光の明滅）
     */
    updateSparkleAnimation(animation, elapsed) {
      if (animation.object.material) {
        const intensity = (Math.sin(elapsed * 3 * 2 * Math.PI) * 0.5 + 0.5) * animation.intensity;
        animation.object.material.emissiveIntensity = intensity;
        animation.object.material.needsUpdate = true;
      }
    }

    /**
     * 虹色アニメーション
     */
    updateRainbowAnimation(animation, elapsed) {
      if (animation.object.material) {
        const hue = (elapsed * animation.speed) % 1;
        const color = new THREE.Color().setHSL(hue, 1, 0.5);
        animation.object.material.color = color;
        animation.object.material.needsUpdate = true;
      }
    }

    /**
     * グリッチアニメーション
     */
    updateGlitchAnimation(animation, elapsed) {
      if (Math.random() < 0.1) { // 10%の確率でグリッチ
        const offset = (Math.random() - 0.5) * animation.intensity;
        animation.object.position.x = animation.originalPosition.x + offset;
        animation.object.position.z = animation.originalPosition.z + offset;
      } else {
        animation.object.position.x = animation.originalPosition.x;
        animation.object.position.z = animation.originalPosition.z;
      }
    }

    /**
     * 宇宙的アニメーション（オーロラ、星雲、エネルギーエフェクト）
     */
    updateCosmicAnimation(animation, elapsed) {
      if (!animation.object.material) return;

      // 色の循環スピードを調整
      const colorCycleSpeed = elapsed * animation.speed;
      const numColors = animation.colors.length;

      // 滑らかな色の遷移を実現
      const colorProgress = (colorCycleSpeed % numColors);
      const currentColorIndex = Math.floor(colorProgress);
      const nextColorIndex = (currentColorIndex + 1) % numColors;
      const lerpFactor = colorProgress - currentColorIndex;

      // 現在の色と次の色をブレンド
      const currentColor = new THREE.Color(animation.colors[currentColorIndex]);
      const nextColor = new THREE.Color(animation.colors[nextColorIndex]);
      const blendedColor = currentColor.lerp(nextColor, lerpFactor);

      // 宇宙的エフェクトタイプごとの特別な処理
      let intensityMultiplier = 1.0;
      switch (animation.cosmicType) {
        case 'aurora':
          // オーロラは波のような強弱変化
          intensityMultiplier = 0.7 + 0.3 * Math.sin(elapsed * 2.5);
          break;
        case 'nebula':
          // 星雲はゆっくりとした脈動
          intensityMultiplier = 0.8 + 0.2 * Math.sin(elapsed * 1.2);
          break;
        case 'energy':
          // エネルギーは激しく変動
          intensityMultiplier = 0.6 + 0.4 * (Math.sin(elapsed * 4) * Math.cos(elapsed * 3));
          break;
        case 'cosmic':
          // 宇宙は神秘的にゆらゆら
          intensityMultiplier = 0.8 + 0.2 * Math.sin(elapsed * 1.8);
          break;
        case 'mystic':
          // 神秘的は複雑な変化
          intensityMultiplier = 0.7 + 0.3 * Math.sin(elapsed * 1.5) * Math.cos(elapsed * 0.8);
          break;
        case 'rainbow_glow':
          // 虹色は鮮やかに輝く
          intensityMultiplier = 0.6 + 0.3 * Math.sin(elapsed * 2.0);
          break;
      }

      if (animation.useColorFallback) {
        if (animation.object.material.color) {
          animation.object.material.color.copy(blendedColor);
          animation.object.material.needsUpdate = true;
        }
      } else {
        animation.object.material.emissive = blendedColor;
        animation.object.material.emissiveIntensity = animation.intensity * intensityMultiplier;
        animation.object.material.needsUpdate = true;
      }
    }

    /**
     * 水彩画アニメーション（拡散色の柔らかな変化）
     */
    updateWatercolorAnimation(animation, elapsed) {
      if (!animation.object.material) return;

      // 色の循環スピードを調整（宇宙エフェクトより遅い）
      const colorCycleSpeed = elapsed * animation.speed;
      const numColors = animation.colors.length;

      // 滑らかな色の遷移
      const colorProgress = (colorCycleSpeed % numColors);
      const currentColorIndex = Math.floor(colorProgress);
      const nextColorIndex = (currentColorIndex + 1) % numColors;
      const lerpFactor = colorProgress - currentColorIndex;

      // 現在の色と次の色をブレンド
      const currentColor = new THREE.Color(animation.colors[currentColorIndex]);
      const nextColor = new THREE.Color(animation.colors[nextColorIndex]);
      const blendedColor = currentColor.lerp(nextColor, lerpFactor);

      // 透明度の柔らかな変化
      let opacityMultiplier = 1.0;
      switch (animation.artType) {
        case 'watercolor_art':
          // 水彩画は透明度もゆっくり変化
          opacityMultiplier = 0.9 + 0.1 * Math.sin(elapsed * 0.5);
          break;
        case 'pastel_art':
          // パステルは透明度をより安定
          opacityMultiplier = 0.95 + 0.05 * Math.sin(elapsed * 0.3);
          break;
      }

      // 拡散色を設定（emissiveではなくcolor）
      animation.object.material.color = blendedColor;
      animation.object.material.opacity = animation.opacity * opacityMultiplier;
      animation.object.material.needsUpdate = true;
    }

    /**
     * プロンプトに基づいて自動エフェクトを決定
     */
    getAutoEffectsFromPrompt(prompt) {
      if (!prompt) return null;

      const lowerPrompt = prompt.toLowerCase();

      // 魔法・ファンタジー系
      if (lowerPrompt.includes('ユニコーン') || lowerPrompt.includes('unicorn') ||
          lowerPrompt.includes('魔法') || lowerPrompt.includes('magic') ||
          lowerPrompt.includes('魔女') || lowerPrompt.includes('wizard') ||
          lowerPrompt.includes('fairy') || lowerPrompt.includes('妖精')) {
        return ['魔法っぽく'];
      }

      // 宇宙・神秘系
      if (lowerPrompt.includes('ドラゴン') || lowerPrompt.includes('dragon') ||
          lowerPrompt.includes('宇宙') || lowerPrompt.includes('space') ||
          lowerPrompt.includes('星') || lowerPrompt.includes('star')) {
        return ['宇宙'];
      }

      // 幽霊・透明系
      if (lowerPrompt.includes('幽霊') || lowerPrompt.includes('ghost') ||
          lowerPrompt.includes('精霊') || lowerPrompt.includes('spirit')) {
        return ['幽霊'];
      }

      // サイバー・未来系
      if (lowerPrompt.includes('ロボット') || lowerPrompt.includes('robot') ||
          lowerPrompt.includes('サイバー') || lowerPrompt.includes('cyber') ||
          lowerPrompt.includes('未来') || lowerPrompt.includes('future')) {
        return ['サイバー'];
      }

      // 動物系 - 軽いキラキラエフェクト
      if (lowerPrompt.includes('猫') || lowerPrompt.includes('cat') ||
          lowerPrompt.includes('犬') || lowerPrompt.includes('dog') ||
          lowerPrompt.includes('鳥') || lowerPrompt.includes('bird')) {
        return ['きらめ'];
      }

      // 花・自然系 - パステルエフェクト
      if (lowerPrompt.includes('花') || lowerPrompt.includes('flower') ||
          lowerPrompt.includes('桜') || lowerPrompt.includes('cherry') ||
          lowerPrompt.includes('自然') || lowerPrompt.includes('nature')) {
        return ['パステル'];
      }

      return null; // 該当なしの場合はエフェクトなし
    }

    /**
     * オブジェクト認識成功時のフィードバックエフェクト
     */
    applyRecognitionFeedback(targetObject) {
      console.log(`🎯 Object recognition successful: ${targetObject.name}`);

      // 短時間のキラキラエフェクトで認識成功を視覚的に伝える
      const feedbackEffect = [{
        type: 'animation',
        animation: 'sparkle',
        intensity: 0.8,
        name: 'recognition_feedback'
      }];

      this.applyEffects(targetObject, feedbackEffect);

      // 3秒後にフィードバックエフェクトを停止
      setTimeout(() => {
        this.stopRecognitionFeedback(targetObject);
      }, 3000);
    }

    /**
     * 認識フィードバックエフェクトを停止
     */
    stopRecognitionFeedback(targetObject) {
      if (!this.animations) return;

      const feedbackAnimationId = `${targetObject.uuid}_sparkle`;
      if (this.animations.has(feedbackAnimationId)) {
        this.animations.delete(feedbackAnimationId);

        // 発光を元に戻す
        if (targetObject.material) {
          targetObject.material.emissiveIntensity = 0;
          targetObject.material.needsUpdate = true;
        }

        console.log(`✨ Recognition feedback stopped for: ${targetObject.name}`);
      }
    }

    /**
     * 削除コマンド解析
     */
    parseDeleteCommand(command) {
      const cmd = command.toLowerCase().trim();

      // 選択されたオブジェクトのみを削除するか、全削除かを判定
      if (cmd.includes('選択') || cmd.includes('これ') || cmd.includes('この')) {
        return {
          type: 'delete',
          target: 'selected',
          requiresSelection: true,
          command: command  // 元のコマンドを保持
        };
      }

      if (cmd.includes('全部') || cmd.includes('すべて') || cmd.includes('全て')) {
        return {
          type: 'delete',
          target: 'all',
          command: command  // 元のコマンドを保持
        };
      }

      // デフォルト: 選択されたオブジェクトを削除
      return {
        type: 'delete',
        target: 'selected',
        requiresSelection: true,
        command: command  // 元のコマンドを保持
      };
    }

    /**
     * 自然言語オブジェクト操作コマンド解析
     * 例: "ユニコーンを右に移動", "猫の画像をピンクに", "1つ目の猫を左に"
     */
    parseNaturalLanguageCommand(command) {
      // 移動パターンをチェック
      const movePatterns = [
        '(\S+?)を(.+?)に移動', 
        '(\S+?)を(.+?)へ移動',
        '(\S+?)を(.+?)に動か',
        '(\S+?)を(.+?)へ動か'
      ];
      
      for (const pattern of movePatterns) {
        const regex = new RegExp(pattern);
        const match = command.match(regex);
        if (match) {
          const objectName = match[1];
          const direction = match[2];
          
          console.log(`🎯 Natural language move detected: "${objectName}" to "${direction}"`);
          
          return {
            type: 'natural_object_modification',
            targetObjectName: objectName,
            movement: this.parsePositionFromPrompt(direction),
            requiresObjectSearch: true
          };
        }
      }
      
      // 色変更パターンをチェック
      const colorPatterns = [
        '(\S+?)を(\S+?)色に',
        '(\S+?)を(\S+?)に'
      ];
      
      // 色変更は基本的な色のみ対応
      const colorKeywords = ['赤', '赤色', '青', '青色', '緑', '緑色', '黄', '黄色', '黄色い', '紫', '紫色',
                            '橙', '橙色', 'オレンジ', 'オレンジ色', '白', '白色', '黒', '黒色',
                            '灰', '灰色', 'グレー', 'グレー色', 'ピンク', 'ピンク色', '茶', '茶色', '銀', '銀色', '金', '金色'];
      
      for (const pattern of colorPatterns) {
        const regex = new RegExp(pattern);
        const match = command.match(regex);
        if (match && colorKeywords.some(color => match[2].includes(color))) {
          const objectName = match[1];
          const colorName = match[2];
          
          console.log(`🎨 Natural language color change detected: "${objectName}" to "${colorName}"`);
          
          // 色変更の解析（既存のロジックを流用）
          const colorMap = {
            '赤': 0xff0000, '赤色': 0xff0000,
            '青': 0x0000ff, '青色': 0x0000ff,
            '緑': 0x00ff00, '緑色': 0x00ff00,
            '黄': 0xffff00, '黄色': 0xffff00, '黄色い': 0xffff00,
            '紫': 0xff00ff, '紫色': 0xff00ff,
            '橙': 0xff8800, '橙色': 0xff8800, 'オレンジ': 0xff8800, 'オレンジ色': 0xff8800,
            '白': 0xffffff, '白色': 0xffffff,
            '黒': 0x000000, '黒色': 0x000000,
            '灰': 0x808080, '灰色': 0x808080, 'グレー': 0x808080, 'グレー色': 0x808080,
            'ピンク': 0xffc0cb, 'ピンク色': 0xffc0cb,
            '茶': 0x8b4513, '茶色': 0x8b4513,
            '銀': 0xc0c0c0, '銀色': 0xc0c0c0,
            '金': 0xffd700, '金色': 0xffd700
          };
          
          let colorValue = null;
          for (const [colorKey, value] of Object.entries(colorMap)) {
            if (colorName.includes(colorKey)) {
              colorValue = value;
              break;
            }
          }
          
          return {
            type: 'natural_object_modification',
            targetObjectName: objectName,
            color: colorValue,
            requiresObjectSearch: true
          };
        }
      }

      // 回転パターンをチェック
      const rotationPatterns = [
        '(\S+?)を回転',
        '(\S+?)を回す',
        '(\S+?)を回して',
        '(\S+?)回転',
        '回転.*?(\S+)'
      ];

      for (const pattern of rotationPatterns) {
        const regex = new RegExp(pattern);
        const match = command.match(regex);
        if (match) {
          const objectName = match[1];

          console.log(`🔄 Natural language rotation detected: "${objectName}"`);

          // 角度指定があるかチェック
          const degreeMatch = command.match(/(\d+)\s*度/);
          const rotation = degreeMatch ?
            parseFloat(degreeMatch[1]) * Math.PI / 180 :
            Math.PI / 4; // デフォルト45度

          return {
            type: 'natural_object_modification',
            targetObjectName: objectName,
            rotation: rotation,
            requiresObjectSearch: true
          };
        }
      }

      // 反転パターンをチェック
      const flipPatterns = [
        '(\S+?)を左右反転',
        '(\S+?)を反転',
        '(\S+?)反転',
        '(\S+?)をひっくり返',
        '(\S+?)をflip'
      ];

      for (const pattern of flipPatterns) {
        const regex = new RegExp(pattern);
        const match = command.match(regex);
        if (match) {
          const objectName = match[1];

          console.log(`🔄 Natural language flip detected: "${objectName}"`);

          return {
            type: 'natural_object_modification',
            targetObjectName: objectName,
            flip: true, // 反転フラグを追加
            requiresObjectSearch: true
          };
        }
      }

      // エフェクトパターンをチェック（水彩、宇宙エフェクトなど）
      const effectPatterns = [
        '(\S+?)を(\S+?)っぽく',
        '(\S+?)を(\S+?)に',
        '(\S+?)を(\S+?)風に',
        '(\S+?)を(\S+?)みたい'
      ];

      const effectKeywords = ['水彩', '水彩画', '宇宙', 'オーロラ', '星雲', 'エネルギー', '神秘的',
                              'パステル', '魔法', '幽霊', 'サイバー', '夢', '光', 'ネオン',
                              'メタリック', '金属', 'ガラス', 'マット'];

      for (const pattern of effectPatterns) {
        const regex = new RegExp(pattern);
        const match = command.match(regex);
        if (match && effectKeywords.some(effect => match[2].includes(effect))) {
          const objectName = match[1];
          const effectName = match[2];

          console.log(`✨ Natural language effect detected: "${objectName}" with "${effectName}"`);

          return {
            type: 'natural_object_modification',
            targetObjectName: objectName,
            command: effectName, // エフェクトはコマンドとして渡す
            requiresObjectSearch: true
          };
        }
      }

      return null; // 自然言語パターンに一致しない場合
    }

    /**
     * 移動コマンドから相対位置を解析（オブジェクト移動用）
     */
    parsePositionFromPrompt(command) {
      let x = 0, y = 0, z = 0;
      
      // 左右移動（修正：左右を正しい方向に）
      if (command.includes('右へ') || command.includes('右に') || command.includes('右側へ') || command.includes('右側に')) {
        x = 5; // 5メートル右へ（正の値で右に移動）
      } else if (command.includes('左へ') || command.includes('左に') || command.includes('左側へ') || command.includes('左側に')) {
        x = -5; // 5メートル左へ（負の値で左に移動）
      }
      
      // 上下移動
      if (command.includes('上へ') || command.includes('上に') || command.includes('上側へ')) {
        y = 3; // 3メートル上へ
      } else if (command.includes('下へ') || command.includes('下に') || command.includes('下側へ')) {
        y = -3; // 3メートル下へ
      }
      
      // 前後移動
      if (command.includes('前へ') || command.includes('手前へ') || command.includes('近くへ')) {
        z = 3; // カメラに近づける
      } else if (command.includes('後ろへ') || command.includes('奥へ') || command.includes('遠くへ')) {
        z = -3; // カメラから遠ざける
      }
      
      // 距離指定の解析
      const distanceMatch = command.match(/(\d+(?:\.\d+)?)\s*(?:メートル|m)/);
      if (distanceMatch) {
        const distance = parseFloat(distanceMatch[1]);
        // 方向に応じて距離を適用
        if (Math.abs(x) > 0) x = x > 0 ? distance : -distance;
        if (Math.abs(y) > 0) y = y > 0 ? distance : -distance;
        if (Math.abs(z) > 0) z = z > 0 ? distance : -distance;
      }
      
      // 「少し」「大きく」などの修飾語
      if (command.includes('少し') || command.includes('ちょっと')) {
        x *= 0.5; y *= 0.5; z *= 0.5;
      } else if (command.includes('大きく') || command.includes('たくさん')) {
        x *= 2; y *= 2; z *= 2;
      }
      
      console.log(`📍 Position movement parsed from "${command}": (${x}, ${y}, ${z})`);
      
      return { x, y, z };
    }

    /**
     * 位置情報解析（カメラ相対位置）
     */
    parsePosition(command) {
      if (this.xr.mode === 'immersive-ar' && this.xr.anchor?.position) {
        const orientation = this.xr.anchor.orientation
          ? (typeof this.xr.anchor.orientation.clone === 'function'
              ? this.xr.anchor.orientation.clone()
              : new THREE.Quaternion(
                  this.xr.anchor.orientation.x ?? 0,
                  this.xr.anchor.orientation.y ?? 0,
                  this.xr.anchor.orientation.z ?? 0,
                  this.xr.anchor.orientation.w ?? 1
                ))
          : null;
        const anchorPosition = this.xr.anchor.position;
        console.log(`📍 Using XR anchor position: (${anchorPosition.x.toFixed(2)}, ${anchorPosition.y.toFixed(2)}, ${anchorPosition.z.toFixed(2)})`);
        return {
          x: anchorPosition.x,
          y: anchorPosition.y,
          z: anchorPosition.z,
          absolute: true,
          orientation
        };
      }
      
      // 基本方向の解析（カメラ相対座標系）
      let x = 0, y = 5, z = -10; // デフォルト値（カメラから前方へ負方向）
      
      // 組み合わせ位置を最初にチェック（優先度最高）
      if (command.includes('左下')) {
        x = -8; y = 0; z = 10;  // 左下: 左側で低い位置
        console.log(`📍 Position parsed from "${command}": 左下 (${x}, ${y}, ${z})`);
        return { x, y, z };
      } else if (command.includes('右上')) {
        x = 5; y = 4; z = 12;  // y座標を下げて画面内に収める
        console.log(`📍 Position parsed from "${command}": 右上 (${x}, ${y}, ${z})`);
        return { x, y, z };
      } else if (command.includes('左上')) {
        x = -8; y = 4; z = 15; // y座標を下げて画面内に収める
        console.log(`📍 Position parsed from "${command}": 左上 (${x}, ${y}, ${z})`);
        return { x, y, z };
      } else if (command.includes('右下')) {
        x = 8; y = 0; z = 10; // 右下: 右側で低い位置
        console.log(`📍 Position parsed from "${command}": 右下 (${x}, ${y}, ${z})`);
        return { x, y, z };
      }
      
      // 特殊位置
      if (command.includes('中央') || command.includes('真ん中') || command.includes('正面')) {
        x = 0; y = 3; z = 12;  // y=3 で目線レベルに
        console.log(`📍 Position parsed from "${command}": 中央 (${x}, ${y}, ${z})`);
        return { x, y, z };
      } else if (command.includes('空') || command.includes('天空')) {
        x = 0; y = 20; z = 10;
        console.log(`📍 Position parsed from "${command}": 空中 (${x}, ${y}, ${z})`);
        return { x, y, z };
      } else if (command.includes('地面') || command.includes('足元')) {
        x = 0; y = 1; z = 8;
        console.log(`📍 Position parsed from "${command}": 地面 (${x}, ${y}, ${z})`);
        return { x, y, z };
      }
      
      // 個別方向の解析
      // 前後方向
      if (command.includes('前に') || command.includes('手前に')) {
        z = Math.min(z, -6);
      } else if (command.includes('後ろに') || command.includes('奥に') || command.includes('遠くに')) {
        z = -25; // カメラから遠ざける（奥）
      }
      
      // 左右方向
      if (command.includes('右に') || command.includes('右側') || command.includes('画面の右')) {
        x = 8;
      } else if (command.includes('左に') || command.includes('左側') || command.includes('画面の左')) {
        x = -8;
      }
      
      // 上下方向（カメラ相対）
      if (command.includes('上に') || command.includes('上側') || command.includes('画面の上') || command.includes('高い位置に') || command.includes('空中に')) {
        y = 8; // カメラから8メートル上
      } else if (command.includes('下に') || command.includes('下側') || command.includes('画面の下') || command.includes('低い位置に') || command.includes('地面に')) {
        y = -2; // カメラから2メートル下
      }
      
      // 距離指定
      if (command.includes('近くに') || command.includes('すぐ前に')) {
        z = Math.max(z * 0.5, -4); // よりカメラ寄り（前方）
      } else if (command.includes('遠くに') || command.includes('向こうに')) {
        z = Math.min(z * 1.5, -30); // さらに遠く
      }
      
      console.log(`📍 Position parsed from "${command}": (${x}, ${y}, ${z})`);
      
      return { x, y, z };
    }

    /**
     * サイズ解析
     */
    parseSize(command) {
      if (command.includes('大きな') || command.includes('大きい')) return { scale: 2.0 };
      if (command.includes('小さな') || command.includes('小さい')) return { scale: 0.5 };
      return { scale: this.config.defaultObjectScale };
    }

    /**
     * コマンド種別別実行
     */
    async dispatchCommand(parsed) {
      switch (parsed.type) {
        case 'image_generation':
          // サーバーなしの場合は生成機能を無効化
          if (!this.client || !this.client.serverUrl) {
            throw new Error('画像生成機能を使用するにはサーバー設定が必要です。インポート機能のみ利用可能です。');
          }
          return await this.executeImageGeneration(parsed);
          
        case 'video_generation':
          // サーバーなしの場合は生成機能を無効化
          if (!this.client || !this.client.serverUrl) {
            throw new Error('動画生成機能を使用するにはサーバー設定が必要です。インポート機能のみ利用可能です。');
          }
          return await this.executeVideoGeneration(parsed);
          
        case 'object_modification':
          return await this.executeObjectModification(parsed);
          
        case 'natural_object_modification':
          return await this.executeNaturalObjectModification(parsed);
          
        case 'delete':
          return await this.executeDelete(parsed);
          
        case 'file_import':
          return await this.executeFileImport(parsed);
          
        case 'object_selection':
          return await this.executeObjectSelection(parsed);
          
        default:
          throw new Error(`Unknown command type: ${parsed.type}`);
      }
    }

    /**
     * 画像生成実行
     */
    async executeImageGeneration(parsed) {
      try {
        console.log(`🎨 Generating image: "${parsed.prompt}"`);
        
        // 段階的にサイズを試行（シーンに配置しやすいサイズを優先）
        const fallbackSizes = [
          { width: 512, height: 512 },    // 1:1 基本サイズ（互換性最高）
          { width: 768, height: 432 },    // 16:9 現代的サイズ
          { width: 1024, height: 1024 },  // 大きめ1:1
          { width: 640, height: 480 },    // 4:3 クラシック
        ];
        
        let imageResult;
        let lastError;
        
        for (let i = 0; i < fallbackSizes.length; i++) {
          const dimensions = fallbackSizes[i];
          try {
            console.log(`🔄 Trying ${dimensions.width}x${dimensions.height}...`);
            
            imageResult = await this.client.generateImage(parsed.prompt, {
              width: dimensions.width,
              height: dimensions.height,
              service: this.selectedImageService || undefined
            });
            
            if (imageResult.success) {
              console.log(`✅ Success with ${dimensions.width}x${dimensions.height}`);
              break;
            }
          } catch (error) {
            lastError = error;
            console.log(`⚠️ Failed with ${dimensions.width}x${dimensions.height}: ${error.message}`);
            
            // 最後の試行でない場合は続行
            if (i < fallbackSizes.length - 1) {
              console.log(`🔄 Retrying with next size...`);
              continue;
            }
          }
        }
        
        // 結果にモデル情報を含める
        if (imageResult && imageResult.modelName) {
          console.log(`📡 Used model: ${imageResult.modelName}`);
        }
        
        const loader = new THREE.TextureLoader();
        let texture;
        let assetUrl = null;
        if (imageResult && imageResult.success && (imageResult.imageUrl || imageResult.localPath)) {
          // 成功: 生成された画像をテクスチャとして使用
          let imageUrl = imageResult.imageUrl;
          
          // localPathの場合はWebアクセス可能なURLに変換
          if (!imageUrl && imageResult.localPath) {
            const filename = imageResult.localPath.split('/').pop();
            imageUrl = `${this.client.serverUrl}/generated/${filename}`;
          }
          assetUrl = imageUrl || null;

          console.log(`✅ Image generated successfully: ${imageUrl}`);
          texture = await loader.loadAsync(imageUrl);

          // テクスチャの色彩を正確に表示するための設定
          texture.colorSpace = THREE.SRGBColorSpace; // 正しいカラースペース
        } else {
          // 失敗: プレースホルダー画像を使用
          console.log(`⚠️ Using fallback image (last error: ${lastError?.message || 'unknown'})`);
          texture = this.createFallbackTexture(parsed.prompt);
        }

        const sizeScale = parsed.size?.scale ?? this.config.defaultObjectScale ?? 1;
        const baseSize = 6 * sizeScale;

        const imageWidth = texture.image?.naturalWidth || texture.image?.width || texture.source?.data?.width || 1;
        const imageHeight = texture.image?.naturalHeight || texture.image?.height || texture.source?.data?.height || 1;
        const aspectRatio = imageWidth / imageHeight || 1;

        let planeWidth = baseSize;
        let planeHeight = baseSize;
        if (aspectRatio >= 1) {
          planeWidth = baseSize;
          planeHeight = baseSize / aspectRatio;
        } else {
          planeWidth = baseSize * aspectRatio;
          planeHeight = baseSize;
        }

        // 画像を表示する平面ジオメトリを作成
        const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          opacity: 1.0,  // 明示的に不透明を設定
          side: THREE.DoubleSide, // 両面表示
          toneMapped: false    // トーンマッピングを無効化（より鮮やかな色彩）
        });

        const plane = new THREE.Mesh(geometry, material);

        // レンダリング順序を設定（画像も前面に表示）
        plane.renderOrder = 1000;  // 高い値で前面に表示
        material.depthTest = true;  // 深度テストは有効に
        material.depthWrite = true; // 深度書き込みも有効に
        material.alphaTest = 0.01;
        material.needsUpdate = true;

        // カメラ相対位置で配置（カメラの向きも考慮）
        const finalPosition = this.resolveSpawnPosition(parsed.position);
        plane.position.copy(finalPosition);

        const oriented = this.applyOrientationFromPosition(plane, parsed.position);
        if (!oriented && this.camera) {
          this.alignPlaneToCamera(plane);
        }
        
        // スケールは幅計算に含めているので、ここでは1.0に固定
        plane.scale.setScalar(1.0);
        
        // 識別用の名前とメタデータ
        const objectId = `generated_${++this.objectCounter}`;
        plane.name = objectId;
        const assetFileName = assetUrl ? assetUrl.split('/').pop() : null;

        plane.userData = {
          id: objectId,
          prompt: parsed.prompt,
          createdAt: Date.now(),
          type: 'generated_image',
          source: 'generated_image',
          modelName: imageResult?.modelName || this.selectedImageService || null,
          imageUrl: assetUrl,
          fileUrl: assetUrl,
          fileName: assetFileName,
          pixelWidth: imageWidth,
          pixelHeight: imageHeight,
          keywords: this.buildObjectKeywordHints({ prompt: parsed.prompt, baseType: 'image' }),
          originalOpacity: 1.0  // 元の透明度を保存
        };
        
        this.experimentGroup.add(plane);
        this.registerSpawnedObject(objectId, plane, {
          reason: 'generated_image',
          prompt: parsed.prompt,
          assetUrl
        });

        console.log(`✅ Created object: ${objectId} at (${parsed.position.x}, ${parsed.position.y}, ${parsed.position.z})`);

        // 生成位置にパーティクルエフェクトを追加（視覚的フィードバック）
        if (this.config.showLocationIndicator) {
          this.createLocationIndicator(parsed.position);
        }
        
        return {
          objectId,
          position: parsed.position,
          prompt: parsed.prompt,
          modelName: imageResult?.modelName,
          success: true,
          fallbackUsed: !imageResult?.success,
          error: !imageResult?.success ? (lastError?.message || imageResult?.error || '画像生成に失敗しました') : null
        };
        
      } catch (error) {
        console.error('🎨 Image generation failed:', error);
        error.fallbackUsed = true;
        throw error;
      }
    }

    /**
     * 動画生成実行
     */
    async executeVideoGeneration(parsed) {
      try {
        console.log(`🎬 Generating video: "${parsed.prompt}"`);
        console.log('🔍 Video generation - selectedVideoService:', this.selectedVideoService);
        
        // ChocoDro Client経由で動画生成
        // アスペクト比は各モデルのサポート状況に応じてサーバー側で最適化
        const videoResult = await this.client.generateVideo(parsed.prompt, {
          duration: 3,
          model: this.selectedVideoService || undefined
          // width, height指定を削除してサーバー側デフォルト(16:9)を使用
        });
        
        // 結果にモデル情報を含める
        if (videoResult.modelName) {
          console.log(`📡 Used model: ${videoResult.modelName}`);
        }
        
        let videoTexture;
        let video = null; // video変数をスコープ外で定義
        let assetUrl = null;
        let assetFileName = null;
        const videoSuccess = videoResult.success && videoResult.videoUrl;
        
        if (videoSuccess) {
          // 成功: 生成された動画をテクスチャとして使用
          console.log(`✅ Video generated successfully: ${videoResult.videoUrl}`);
          
          // HTML5 video要素を作成
          video = document.createElement('video');
          video.src = videoResult.videoUrl;
          video.crossOrigin = 'anonymous';
          video.loop = true;
          video.muted = true; // 初期はミュート（ユーザーが手動で音声制御）
          video.playsInline = true;
          
          // 動画テクスチャを作成
          videoTexture = new THREE.VideoTexture(video);
          videoTexture.colorSpace = THREE.SRGBColorSpace;
          assetUrl = videoResult.videoUrl;
          assetFileName = assetUrl ? assetUrl.split('/').pop() : null;
          
          // 動画の自動再生を開始
          video.addEventListener('loadeddata', () => {
            video.play().catch(console.error);
          });
          
        } else {
          // 失敗: プレースホルダー動画テクスチャを使用
          console.log(`⚠️ Using fallback video texture`);
          videoTexture = this.createFallbackVideoTexture(parsed.prompt);
        }
        
        // 動画を表示する平面ジオメトリを作成（アスペクト比を考慮）
        const sizeScale = parsed.size?.scale ?? this.config.defaultObjectScale ?? 1;
        const baseSize = 6 * sizeScale;

        const requestedWidth = videoResult.metadata?.width || 512;
        const requestedHeight = videoResult.metadata?.height || 512;
        const planeAspect = requestedWidth && requestedHeight ? requestedWidth / requestedHeight : 1;

        let planeWidth = baseSize;
        let planeHeight = baseSize;

        if (planeAspect >= 1) {
          planeHeight = baseSize / planeAspect;
        } else {
          planeWidth = baseSize * planeAspect;
        }

        const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
        const material = new THREE.MeshBasicMaterial({
          map: videoTexture,
          transparent: false,
          opacity: 1.0,  // 明示的に不透明を設定
          side: THREE.DoubleSide,
          toneMapped: false
        });
        
        const plane = new THREE.Mesh(geometry, material);
        
        // レンダリング順序を設定（動画を前面に表示）
        plane.renderOrder = 1000;  // 高い値で前面に表示
        material.depthTest = true;  // 深度テストは有効に
        material.depthWrite = true; // 深度書き込みも有効に
        
        // カメラ相対位置で配置
        const finalPosition = this.resolveSpawnPosition(parsed.position);
        plane.position.copy(finalPosition);

        const oriented = this.applyOrientationFromPosition(plane, parsed.position);
        if (!oriented && this.camera) {
          this.alignPlaneToCamera(plane);
        }

        // スケールは幅計算に含めているので、ここでは1.0に固定
        plane.scale.setScalar(1.0);

        // 識別用の名前とメタデータ
        const objectId = `generated_video_${++this.objectCounter}`;
        plane.name = objectId;
        plane.userData = {
          id: objectId,
          prompt: parsed.prompt,
          createdAt: Date.now(),
          type: 'generated_video',
          source: 'generated_video',
          videoUrl: videoResult.videoUrl,
          fileUrl: assetUrl,
          fileName: assetFileName,
          modelName: videoResult.modelName || this.selectedVideoService || null,
          width: requestedWidth,
          height: requestedHeight,
          videoElement: video,
          keywords: this.buildObjectKeywordHints({ prompt: parsed.prompt, baseType: 'video' }),
          originalOpacity: 1.0  // 元の透明度を保存
        };

        // 音声制御UIを作成
        this.createAudioControl(plane);
        
        this.experimentGroup.add(plane);
        this.registerSpawnedObject(objectId, plane, {
          reason: 'generated_video',
          prompt: parsed.prompt,
          assetUrl
        });
        
        console.log(`✅ Created video object: ${objectId} at (${parsed.position.x}, ${parsed.position.y}, ${parsed.position.z})`);
        
        // 生成位置にパーティクルエフェクトを追加
        if (this.config.showLocationIndicator) {
          this.createLocationIndicator(parsed.position);
        }
        
        return {
          objectId,
          position: parsed.position,
          prompt: parsed.prompt,
          modelName: videoResult.modelName,
          videoUrl: videoResult.videoUrl,
          success: true,
          fallbackUsed: !videoSuccess,
          error: !videoSuccess ? (videoResult?.error || '動画生成に失敗しました') : null
        };
        
      } catch (error) {
        console.error('🎬 Video generation failed:', error);
        
        // エラー時もプレースホルダー動画を表示
        console.log('🔄 Creating fallback video plane due to generation error');
        const fallbackVideoTexture = this.createFallbackVideoTexture(parsed.prompt);
        
        // 動画を表示する平面ジオメトリを作成
        const sizeScale = parsed.size?.scale ?? this.config.defaultObjectScale ?? 1;
        const baseSize = 6 * sizeScale;
        const geometry = new THREE.PlaneGeometry(baseSize, baseSize);
        const material = new THREE.MeshBasicMaterial({
          map: fallbackVideoTexture,
          transparent: false,
          side: THREE.DoubleSide,
          toneMapped: false
        });
        
        const plane = new THREE.Mesh(geometry, material);
        
        // カメラ相対位置で配置
        const fallbackPosition = this.resolveSpawnPosition(parsed.position);
        plane.position.copy(fallbackPosition);

        const fallbackOriented = this.applyOrientationFromPosition(plane, parsed.position);
        if (!fallbackOriented && this.camera) {
          this.alignPlaneToCamera(plane);
        }

        plane.scale.setScalar(1.0);

        // 識別用の名前とメタデータ
        const objectId = `generated_video_${++this.objectCounter}`;
        plane.name = objectId;
        plane.userData = {
          id: objectId,
          prompt: parsed.prompt,
          createdAt: Date.now(),
          type: 'generated_video',
          source: 'generated_video',
          videoUrl: null, // エラー時はnull
          modelName: 'Error Fallback',
          width: 512,
          height: 512,
          videoElement: null,
          error: error.message,
          keywords: this.buildObjectKeywordHints({ prompt: parsed.prompt, baseType: 'video' }),
          originalOpacity: 1.0  // 元の透明度を保存
        };

        // シーンに追加
        this.experimentGroup.add(plane);
        this.registerSpawnedObject(objectId, plane, {
          reason: 'generated_video_fallback',
          prompt: parsed.prompt,
          error: error.message
        });
        console.log('📍 Fallback video plane added to scene');

        return {
          success: false,
          error: error.message,
          object: plane,
          objectId,
          prompt: parsed.prompt
        };
      }
    }

    async loadImageFile(fileUrl, options = {}) {
      try {
        const { position = { x: 0, y: 5, z: -10 }, fileName = null } = options;
        
        console.log(`📁 Loading image file: ${fileUrl}`);
        
        // ファイルからテクスチャを読み込み
        const loader = new THREE.TextureLoader();
        const texture = await loader.loadAsync(fileUrl);

        // テクスチャの色彩を正確に表示するための設定
        texture.colorSpace = THREE.SRGBColorSpace;

        // アスペクト比を算出（fallback: 1）
        const imageWidth = texture.image?.naturalWidth || texture.image?.width || texture.source?.data?.width || 1;
        const imageHeight = texture.image?.naturalHeight || texture.image?.height || texture.source?.data?.height || 1;
        const aspectRatio = imageWidth / imageHeight || 1;
        
        const baseSize = 6;
        let width = baseSize;
        let height = baseSize;
        if (aspectRatio >= 1) {
          width = baseSize;
          height = baseSize / aspectRatio;
        } else {
          width = baseSize * aspectRatio;
          height = baseSize;
        }

        // 画像を表示する平面ジオメトリを作成（縦横比を維持）
        const geometry = new THREE.PlaneGeometry(width, height);
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          opacity: 1.0,  // 明示的に不透明を設定
          side: THREE.DoubleSide,
          toneMapped: false
        });
        material.alphaTest = 0.01;
        material.needsUpdate = true;
        
        const plane = new THREE.Mesh(geometry, material);

        // レンダリング順序を設定
        plane.renderOrder = 1000;
        material.depthTest = true;
        material.depthWrite = true;
        
        // カメラ相対位置で配置
        const finalPosition = this.resolveSpawnPosition(position);
        plane.position.copy(finalPosition);

        const oriented = this.applyOrientationFromPosition(plane, position);
        if (!oriented && this.camera) {
          this.alignPlaneToCamera(plane);
        }
        
        plane.scale.setScalar(1.0);
        
        // ファイル名からpromptを作成（拡張子を除去）
        const prompt = fileName ? fileName.replace(/\.[^/.]+$/, '') : 'imported_image';

        // 識別用の名前とメタデータ
        const objectId = `imported_image_${++this.objectCounter}`;
        plane.name = objectId;
        plane.userData = {
          id: objectId,
          source: 'imported_file',
          createdAt: Date.now(),
          type: 'generated_image',
          prompt: prompt, // ファイル名をpromptとして設定
          fileName: fileName,
          fileUrl,
          pixelWidth: imageWidth,
          pixelHeight: imageHeight,
          importOrder: this.objectCounter, // インポート順序を記録
          keywords: this.buildObjectKeywordHints({ prompt, fileName, baseType: 'image' }),
          originalOpacity: 1.0  // 元の透明度を保存
        };
        
        this.experimentGroup.add(plane);
        this.registerSpawnedObject(objectId, plane, {
          reason: 'imported_image',
          fileName,
          assetUrl: fileUrl
        });

        console.log(`✅ Created imported image: ${objectId} at (${position.x}, ${position.y}, ${position.z})`);

        // 生成位置にパーティクルエフェクトを追加
        if (this.config.showLocationIndicator) {
          this.createLocationIndicator(position);
        }
        
        return {
          objectId,
          position: position,
          success: true
        };
        
      } catch (error) {
        console.error('📁 Image file loading failed:', error);
        throw error;
      }
    }

    async loadVideoFile(fileUrl, options = {}) {
      try {
        const { position = { x: 0, y: 5, z: -10 }, fileName = null } = options;
        
        console.log(`🎬 Loading video file: ${fileUrl}`);
        
        // HTMLVideoElementを作成
        const video = document.createElement('video');
        video.src = fileUrl;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
        video.preload = 'auto';

        // VideoTextureを作成
        const videoTexture = new THREE.VideoTexture(video);
        videoTexture.colorSpace = THREE.SRGBColorSpace;
        videoTexture.flipY = true;
        videoTexture.minFilter = THREE.LinearFilter;
        videoTexture.magFilter = THREE.LinearFilter;
        videoTexture.generateMipmaps = false;
        videoTexture.needsUpdate = true;

        // ビデオの読み込みとサイズ取得
        await new Promise((resolve, reject) => {
          const handleLoaded = () => {
            console.log(`🎬 Video loaded: ${video.videoWidth}x${video.videoHeight}`);
            resolve();
          };
          const handleError = (event) => {
            reject(event?.error || new Error('Video failed to load'));
          };

          video.addEventListener('loadedmetadata', handleLoaded, { once: true });
          video.addEventListener('error', handleError, { once: true });
          video.load();
        });

        try {
          await video.play();
        } catch (playError) {
          console.warn('🎬 Video autoplay could not start automatically. Playback will require user interaction.', playError);
        }
        
        // アスペクト比を計算してサイズ調整
        const aspectRatio = video.videoWidth / video.videoHeight;
        const baseSize = 6;
        let width = baseSize;
        let height = baseSize;
        
        if (aspectRatio > 1) {
          height = baseSize / aspectRatio;
        } else {
          width = baseSize * aspectRatio;
        }
        
        // 動画を表示する平面ジオメトリを作成
        const geometry = new THREE.PlaneGeometry(width, height);
        const material = new THREE.MeshBasicMaterial({
          map: videoTexture,
          transparent: true,
          opacity: 1.0,  // 明示的に不透明を設定
          side: THREE.DoubleSide,
          toneMapped: false
        });
        material.alphaTest = 0.01;
        material.depthTest = true;
        material.depthWrite = true;  // 透明度の問題を防ぐため true に変更
        material.needsUpdate = true;
        
        const plane = new THREE.Mesh(geometry, material);
        
        // レンダリング順序を設定
        plane.renderOrder = 1001;
        
        // カメラ相対位置で配置
        const finalPosition = this.resolveSpawnPosition(position);
        plane.position.copy(finalPosition);

        const oriented = this.applyOrientationFromPosition(plane, position);
        if (!oriented && this.camera) {
          this.alignPlaneToCamera(plane);
        }
        
        plane.scale.setScalar(1.0);
        // ファイル名からpromptを作成（拡張子を除去）
        const prompt = fileName ? fileName.replace(/\.[^/.]+$/, '') : 'imported_video';

        // 識別用の名前とメタデータ
        const objectId = `imported_video_${++this.objectCounter}`;
        plane.name = objectId;
        plane.userData = {
          id: objectId,
          source: 'imported_file',
          createdAt: Date.now(),
          type: 'generated_video',
          videoElement: video,
          videoUrl: fileUrl,
          fileUrl,
          prompt: prompt, // ファイル名をpromptとして設定
          fileName: fileName,
          pixelWidth: video.videoWidth,
          pixelHeight: video.videoHeight,
          importOrder: this.objectCounter, // インポート順序を記録
          keywords: this.buildObjectKeywordHints({ prompt, fileName, baseType: 'video' }),
          originalOpacity: 1.0  // 元の透明度を保存
        };
        plane.userData.videoTexture = videoTexture;

        // 音声制御UIを作成
        this.createAudioControl(plane);

        this.experimentGroup.add(plane);
        this.registerSpawnedObject(objectId, plane, {
          reason: 'imported_video',
          fileName,
          assetUrl: fileUrl
        });
        
        console.log(`✅ Created imported video: ${objectId} at (${position.x}, ${position.y}, ${position.z})`);
        
        // 生成位置にパーティクルエフェクトを追加
        if (this.config.showLocationIndicator) {
          this.createLocationIndicator(position);
        }
        
        return {
          objectId,
          position: position,
          success: true
        };
        
      } catch (error) {
        console.error('🎬 Video file loading failed:', error);
        throw error;
      }
    }

    /**
     * 自然言語オブジェクト操作実行
     */
    async executeNaturalObjectModification(parsed) {
      // オブジェクトを名前で検索
      const targetObjects = this.findObjectsByName(parsed.targetObjectName);
      
      if (targetObjects.length === 0) {
        return {
          success: false,
          message: `オブジェクト「${parsed.targetObjectName}」が見つかりませんでした`
        };
      }
      
      console.log(`🔍 Found ${targetObjects.length} object(s) matching "${parsed.targetObjectName}"`);
      
      // 複数の場合は序数詞で選択、なければ最初のオブジェクト
      const targetObject = this.selectObjectFromMultiple(targetObjects, parsed.targetObjectName);
      console.log(`🎯 Operating on object: ${targetObject.name}`);
      
      let modified = false;
      
      // 色変更
      if (parsed.color !== null && targetObject.material) {
        if (targetObject.material.map) {
          targetObject.material.color.setHex(parsed.color);
          targetObject.material.needsUpdate = true;
          console.log(`🎨 Texture color tint changed to: #${parsed.color.toString(16)}`);
        } else {
          targetObject.material.color.setHex(parsed.color);
          targetObject.material.needsUpdate = true;
          console.log(`🎨 Material color changed to: #${parsed.color.toString(16)}`);
        }
        modified = true;
      }

      // Phase 2: エフェクト適用
      if (parsed.effects && parsed.effects.length > 0) {
        const effectsApplied = this.applyEffects(targetObject, parsed.effects);
        if (effectsApplied) {
          modified = true;
        }
      }
      
      // 位置移動
      if (parsed.movement !== null) {
        const currentPos = targetObject.position;
        const newPos = {
          x: currentPos.x + parsed.movement.x,
          y: currentPos.y + parsed.movement.y,
          z: currentPos.z + parsed.movement.z
        };
        
        targetObject.position.set(newPos.x, newPos.y, newPos.z);
        console.log(`📍 Position moved from (${currentPos.x.toFixed(1)}, ${currentPos.y.toFixed(1)}, ${currentPos.z.toFixed(1)}) to (${newPos.x.toFixed(1)}, ${newPos.y.toFixed(1)}, ${newPos.z.toFixed(1)})`);
        modified = true;
      }
      
      if (modified) {
        // メタデータ更新
        targetObject.userData.lastModified = Date.now();
        targetObject.userData.modifications = targetObject.userData.modifications || [];
        targetObject.userData.modifications.push({
          timestamp: Date.now(),
          color: parsed.color,
          movement: parsed.movement,
          command: `Natural language: ${parsed.targetObjectName}`
        });
        
        return {
          success: true,
          message: `オブジェクト「${targetObject.name}」を変更しました`,
          objectId: targetObject.name,
          modifications: {
            color: parsed.color,
            movement: parsed.movement
          }
        };
      } else {
        return {
          success: false,
          message: '変更可能な属性が見つかりませんでした'
        };
      }
    }
    
    /**
     * 名前でオブジェクトを検索
     */
    findObjectsByName(searchName) {
      const results = [];
      const searchLower = searchName.toLowerCase();
      
      // 生成されたオブジェクトから検索
      for (const [objectId, object] of this.spawnedObjects) {
        // プロンプト情報から検索
        if (object.userData.prompt) {
          const promptLower = object.userData.prompt.toLowerCase();
          
          // 部分一致で検索（「ユニコーン」が「ユニコーンの画像」にマッチ）
          if (promptLower.includes(searchLower)) {
            results.push(object);
            console.log(`✅ Object match found: ${objectId} (prompt: "${object.userData.prompt}")`);
          }
        }
        
        // オブジェクト名からも検索
        if (object.name && object.name.toLowerCase().includes(searchLower)) {
          results.push(object);
          console.log(`✅ Object match found: ${objectId} (name: "${object.name}")`);
        }
      }
      
      return results;
    }
    
    /**
     * 複数オブジェクトから序数詞で選択
     */
    selectObjectFromMultiple(objects, originalCommand) {
      // 序数詞パターンをチェック
      const ordinalPatterns = [
        /(\d+)つ目の/, /(\d+)番目の/, /(\d+)個目の/,
        /最初の|1つ目の|1番目の|1個目の/,
        /最後の|最終の/,
        /2つ目の|2番目の|2個目の/,
        /3つ目の|3番目の|3個目の/
      ];
      
      for (const pattern of ordinalPatterns) {
        const match = originalCommand.match(pattern);
        if (match) {
          let index;
          
          if (match[1]) {
            // 数字が見つかった場合
            index = parseInt(match[1]) - 1; // 1ベースから0ベースに変換
          } else {
            // 特別な表現の場合
            const matchedText = match[0];
            if (matchedText.includes('最初') || matchedText.includes('1つ目') || 
                matchedText.includes('1番目') || matchedText.includes('1個目')) {
              index = 0;
            } else if (matchedText.includes('最後') || matchedText.includes('最終')) {
              index = objects.length - 1;
            } else if (matchedText.includes('2つ目') || matchedText.includes('2番目') || matchedText.includes('2個目')) {
              index = 1;
            } else if (matchedText.includes('3つ目') || matchedText.includes('3番目') || matchedText.includes('3個目')) {
              index = 2;
            }
          }
          
          if (index >= 0 && index < objects.length) {
            console.log(`🔢 Selected object by ordinal: index ${index + 1} of ${objects.length}`);
            return objects[index];
          } else {
            console.warn(`⚠️ Invalid ordinal index: ${index + 1} (available: 1-${objects.length})`);
          }
        }
      }
      
      // 序数詞が見つからない場合はデフォルトで最初のオブジェクト
      console.log(`🔢 No ordinal specified, using first object`);
      return objects[0];
    }

    /**
     * オブジェクト変更実行
     */
    async executeObjectModification(parsed) {
      // コマンドから対象オブジェクトを特定
      let targetObject = this.findObjectByKeyword(parsed.command);
      
      // キーワードで見つからない場合、選択されたオブジェクトを使用
      if (!targetObject) {
        if (!this.selectedObject) {
          return { 
            success: false, 
            message: 'オブジェクトを選択するか、対象を指定してください（例：「猫を赤くして」）' 
          };
        }
        targetObject = this.selectedObject;
      } else {
        // キーワードで見つけたオブジェクトを選択状態にする
        this.selectObject(targetObject);

        // オブジェクト認識成功のフィードバックエフェクト
        this.applyRecognitionFeedback(targetObject);
      }
      console.log(`🔧 Modifying object: ${targetObject.name}`);
      console.log(`🔍 Debug - parsed.movement:`, parsed.movement);
      
      let modified = false;
      
      // 色変更
      if (parsed.color !== null && targetObject.material) {
        if (targetObject.material.map) {
          // テクスチャがある場合は色調変更
          targetObject.material.color.setHex(parsed.color);
          targetObject.material.needsUpdate = true;
          console.log(`🎨 Texture color tint changed to: #${parsed.color.toString(16)}`);
        } else {
          // テクスチャがない場合は直接色変更
          targetObject.material.color.setHex(parsed.color);
          targetObject.material.needsUpdate = true;
          console.log(`🎨 Material color changed to: #${parsed.color.toString(16)}`);
        }
        modified = true;
      }

      // Phase 2: エフェクト適用
      if (parsed.effects && parsed.effects.length > 0) {
        const effectsApplied = this.applyEffects(targetObject, parsed.effects);
        if (effectsApplied) {
          modified = true;
        }
      }
      
      // サイズ変更
      if (parsed.scale !== null) {
        const currentScale = targetObject.scale.x; // 現在のスケール取得
        const newScale = currentScale * parsed.scale;
        targetObject.scale.setScalar(newScale);
        // console.log(`📏 Scale changed from ${currentScale} to ${newScale}`);
        modified = true;
      }
      
      // 位置移動
      if (parsed.movement !== null) {
        // 現在位置から相対移動
        const currentPos = targetObject.position;
        const newPos = {
          x: currentPos.x + parsed.movement.x,
          y: currentPos.y + parsed.movement.y,
          z: currentPos.z + parsed.movement.z
        };

        targetObject.position.set(newPos.x, newPos.y, newPos.z);
        console.log(`📍 Position moved from (${currentPos.x.toFixed(1)}, ${currentPos.y.toFixed(1)}, ${currentPos.z.toFixed(1)}) to (${newPos.x.toFixed(1)}, ${newPos.y.toFixed(1)}, ${newPos.z.toFixed(1)})`);
        modified = true;
      }

      // 回転
      if (parsed.rotation !== null) {
        const currentRotation = targetObject.rotation.y;
        const newRotation = currentRotation + parsed.rotation;
        targetObject.rotation.y = newRotation;
        const degrees = (parsed.rotation * 180 / Math.PI).toFixed(1);
        console.log(`🔄 Rotation changed by ${degrees}° (new Y rotation: ${(newRotation * 180 / Math.PI).toFixed(1)}°)`);
        modified = true;
      }

      // 透明度
      if (parsed.opacity !== null && targetObject.material) {
        const currentOpacity = targetObject.material.opacity || 1.0;
        targetObject.material.opacity = parsed.opacity;
        targetObject.material.transparent = parsed.opacity < 1.0;
        console.log(`🔍 Opacity changed from ${currentOpacity.toFixed(2)} to ${parsed.opacity.toFixed(2)}`);
        modified = true;
      }

      // 左右反転
      if (parsed.flip) {
        const currentScaleX = targetObject.scale.x;
        targetObject.scale.x = -currentScaleX; // X軸を反転
        // console.log(`↔️ Object flipped horizontally (scale.x: ${currentScaleX} → ${targetObject.scale.x})`);
        modified = true;
      }
      
      if (modified) {
        // メタデータ更新
        targetObject.userData.lastModified = Date.now();
        targetObject.userData.modifications = targetObject.userData.modifications || [];
        targetObject.userData.modifications.push({
          timestamp: Date.now(),
          color: parsed.color,
          scale: parsed.scale,
          movement: parsed.movement,
          rotation: parsed.rotation,
          opacity: parsed.opacity,
          command: parsed.command
        });

        this.updateAllAudioControlPositions();

        return {
          success: true,
          message: `オブジェクト「${targetObject.name}」を変更しました`,
          objectId: targetObject.name,
          modifications: {
            color: parsed.color,
            scale: parsed.scale,
            movement: parsed.movement,
            rotation: parsed.rotation,
            opacity: parsed.opacity
          }
        };
      } else {
        return { 
          success: false, 
          message: '変更可能な属性が見つかりませんでした' 
        };
      }
    }

    /**
     * 削除実行
     */
    async executeDelete(parsed) {
      // コマンドの安全性チェック
      const command = parsed.command || '';
      
      // 「すべて」削除の場合
      if (parsed.target === 'all' || command.includes('すべて') || command.includes('全部')) {
        this.clearAll();
        return { success: true, message: 'すべてのオブジェクトを削除しました' };
      }
      
      // まずコマンドから対象オブジェクトを特定
      const targetByKeyword = this.findObjectByKeyword(command);
      
      // 削除対象の優先順位：
      // 1. コマンドで指定されたオブジェクト
      // 2. 選択されているオブジェクト
      // 3. コマンドが単に「削除」だけの場合は選択オブジェクトを優先
      
      let targetObject = null;
      let deleteReason = '';
      
      // コマンドが単純な削除コマンドか判定
      const isSimpleDeleteCommand = command.match(/^(削除|消して|消す|delete|remove)$/i);
      
      if (isSimpleDeleteCommand && this.selectedObject) {
        // 単純な「削除」コマンドで選択オブジェクトがある場合
        targetObject = this.selectedObject;
        deleteReason = '選択されたオブジェクト';
      } else if (targetByKeyword) {
        // キーワードで特定できた場合
        targetObject = targetByKeyword;
        deleteReason = 'コマンドで指定されたオブジェクト';
      } else if (this.selectedObject) {
        // その他の場合で選択オブジェクトがある場合
        targetObject = this.selectedObject;
        deleteReason = '選択されたオブジェクト';
      }
      
      if (targetObject) {
        const objectId = targetObject.name;
        console.log(`🗑️ Deleting ${deleteReason}: ${objectId}`);
        
        // 選択状態を解除
        if (targetObject === this.selectedObject) {
          this.deselectObject();
        }
        
        // オブジェクトを削除
        const success = this.removeObject(objectId);
        
        if (success) {
          return { 
            success: true, 
            message: `${deleteReason}「${objectId}」を削除しました`,
            deletedObjectId: objectId
          };
        } else {
          return { 
            success: false, 
            message: 'オブジェクトの削除に失敗しました' 
          };
        }
      }
      
      return { 
        success: false, 
        message: '削除対象が見つかりませんでした。オブジェクトを選択するか、対象を指定してください' 
      };
    }

    async executeFileImport(parsed) {
      try {
        console.log('🍫 Starting file import process...');
        
        // ファイル選択ダイアログを表示
        const input = document.createElement('input');
        input.type = 'file';
        input.style.display = 'none';
        
        if (parsed.fileType === 'video') {
          input.accept = 'video/*';
        } else {
          input.accept = 'image/*';
        }
        
        document.body.appendChild(input);
        
        return new Promise((resolve, reject) => {
          input.onchange = async (event) => {
            try {
              const file = event.target.files[0];
              if (!file) {
                reject(new Error('ファイルが選択されませんでした'));
                return;
              }
              
              console.log(`📁 Selected file: ${file.name}`);
              
              // ファイルのObjectURLを作成
              const fileUrl = URL.createObjectURL(file);
              
              let result;
              if (parsed.fileType === 'video' || file.type.startsWith('video/')) {
                result = await this.loadVideoFile(fileUrl, { position: parsed.position });
              } else {
                result = await this.loadImageFile(fileUrl, { position: parsed.position });
              }
              
              console.log('✅ File import completed:', result);
              resolve(result);
              
            } catch (error) {
              console.error('❌ File import failed:', error);
              reject(error);
            } finally {
              document.body.removeChild(input);
            }
          };
          
          input.oncancel = () => {
            document.body.removeChild(input);
            reject(new Error('ファイル選択がキャンセルされました'));
          };
          
          input.click();
        });
        
      } catch (error) {
        console.error('❌ File import execution failed:', error);
        throw error;
      }
    }

    async executeObjectSelection(parsed) {
      try {
        console.log('🎯 Starting object selection...');
        
        const objects = this.getSpawnedObjects();
        if (objects.length === 0) {
          throw new Error('選択可能なオブジェクトがありません。まずファイルをインポートしてください。');
        }
        
        console.log(`📋 Available objects: ${objects.length}`);
        
        // オブジェクト選択UIを作成
        const modal = document.createElement('div');
        modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
      `;
        
        const container = document.createElement('div');
        container.style.cssText = `
        background: #1a1a2e;
        border-radius: 12px;
        padding: 24px;
        max-width: 500px;
        max-height: 70vh;
        overflow-y: auto;
        color: white;
        font-family: Arial, sans-serif;
      `;
        
        const title = document.createElement('h3');
        title.textContent = '🎯 オブジェクトを選択してください';
        title.style.cssText = 'margin: 0 0 16px 0; color: #ec4899;';
        container.appendChild(title);
        
        const objectList = document.createElement('div');
        objectList.style.cssText = 'margin-bottom: 16px;';
        
        objects.forEach((obj, index) => {
          const item = document.createElement('div');
          item.style.cssText = `
          padding: 12px;
          margin: 8px 0;
          background: #2a2a3e;
          border-radius: 8px;
          cursor: pointer;
          border: 2px solid transparent;
          transition: all 0.3s ease;
        `;
          
          const name = obj.userData?.type === 'generated_image' ? '🖼️ 画像' : 
                       obj.userData?.type === 'generated_video' ? '🎬 動画' : '📄 ファイル';
          const time = new Date(obj.userData?.createdAt).toLocaleTimeString();
          
          item.innerHTML = `
          <div style="font-weight: bold;">${name} #${index + 1}</div>
          <div style="font-size: 12px; color: #94a3b8;">作成: ${time}</div>
          <div style="font-size: 12px; color: #94a3b8;">位置: (${Math.round(obj.position.x)}, ${Math.round(obj.position.y)}, ${Math.round(obj.position.z)})</div>
        `;
          
          item.onmouseover = () => {
            item.style.borderColor = '#ec4899';
            item.style.background = '#3a3a4e';
          };
          
          item.onmouseout = () => {
            item.style.borderColor = 'transparent';
            item.style.background = '#2a2a3e';
          };
          
          item.onclick = () => {
            resolve({ selectedObjectId: obj.id, selectedObject: obj });
            document.body.removeChild(modal);
          };
          
          objectList.appendChild(item);
        });
        
        container.appendChild(objectList);
        
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'キャンセル';
        cancelBtn.style.cssText = `
        background: #666;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
      `;
        
        cancelBtn.onclick = () => {
          document.body.removeChild(modal);
          reject(new Error('オブジェクト選択がキャンセルされました'));
        };
        
        container.appendChild(cancelBtn);
        modal.appendChild(container);
        document.body.appendChild(modal);
        
        return new Promise((resolve, reject) => {
          // Promise handlers are set up in the click events above
        });
        
      } catch (error) {
        console.error('❌ Object selection failed:', error);
        throw error;
      }
    }

    /**
     * フォールバック用のテクスチャ作成
     */
    createFallbackTexture(prompt) {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      
      // プロンプトベースの色を生成
      const hash = this.hashString(prompt);
      const hue = hash % 360;
      
      // グラデーション背景
      const gradient = ctx.createLinearGradient(0, 0, 512, 512);
      gradient.addColorStop(0, `hsl(${hue}, 70%, 60%)`);
      gradient.addColorStop(1, `hsl(${(hue + 60) % 360}, 70%, 40%)`);
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 512, 512);
      
      // テキスト描画
      ctx.fillStyle = 'white';
      ctx.font = '24px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('🎨', 256, 230);
      
      ctx.font = '16px Arial';
      ctx.fillText(prompt.slice(0, 20), 256, 270);
      
      ctx.font = '14px Arial';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText('Placeholder Image', 256, 300);
      
      return new THREE.CanvasTexture(canvas);
    }

    /**
     * フォールバック用の動画テクスチャ作成
     */
    createFallbackVideoTexture(prompt) {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      
      // プロンプトベースの色を生成
      const hash = this.hashString(prompt);
      const hue = hash % 360;
      
      // アニメーション用の変数
      let animationFrame = 0;
      
      const animate = () => {
        // グラデーション背景（時間で変化）
        const gradient = ctx.createLinearGradient(0, 0, 512, 512);
        const offset = (animationFrame * 2) % 360;
        gradient.addColorStop(0, `hsl(${(hue + offset) % 360}, 70%, 60%)`);
        gradient.addColorStop(1, `hsl(${(hue + offset + 60) % 360}, 70%, 40%)`);
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 512, 512);
        
        // 動的テキスト描画
        ctx.fillStyle = 'white';
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        
        // 動画アイコンをアニメーション
        const icons = ['🎬', '🎥', '📹', '🎞️'];
        const iconIndex = Math.floor(animationFrame / 10) % icons.length;
        ctx.fillText(icons[iconIndex], 256, 230);
        
        ctx.font = '16px Arial';
        ctx.fillText(prompt.slice(0, 20), 256, 270);
        
        ctx.font = '14px Arial';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText('Placeholder Video', 256, 300);
        
        animationFrame++;
        
        // 60FPSでアニメーション
        setTimeout(() => requestAnimationFrame(animate), 1000/60);
      };
      
      // アニメーション開始
      animate();
      
      return new THREE.CanvasTexture(canvas);
    }

    /**
     * 文字列のハッシュ値を計算
     */
    hashString(str) {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // 32bit整数に変換
      }
      return Math.abs(hash);
    }

    /**
     * シーン変更リスナーを登録
     * @param {(event: object) => void} listener
     * @returns {() => void}
     */
    onSceneChange(listener) {
      if (typeof listener !== 'function') {
        return () => {};
      }
      this.sceneChangeListeners.add(listener);
      return () => {
        this.sceneChangeListeners.delete(listener);
      };
    }

    /**
     * シーン変更イベント通知
     * @param {string} type
     * @param {object} detail
     * @returns {{type: string, version: number, timestamp: number, detail: object}}
     */
    emitSceneChange(type, detail = {}) {
      this.sceneStateVersion += 1;
      const event = {
        type,
        version: this.sceneStateVersion,
        timestamp: Date.now(),
        detail
      };

      this.sceneChangeListeners.forEach((listener) => {
        try {
          listener(event);
        } catch (error) {
          console.warn('⚠️ Scene change listener failed:', error);
        }
      });

      return event;
    }

    /**
     * 永続化向けに値をサニタイズ
     * @param {*} value
     * @param {number} depth
     * @returns {*|undefined}
     */
    sanitizePersistableValue(value, depth = 0) {
      if (depth > 4) {
        return undefined;
      }

      if (value === null || value === undefined) {
        return value;
      }

      const type = typeof value;
      if (type === 'string' || type === 'number' || type === 'boolean') {
        return Number.isNaN(value) ? undefined : value;
      }

      if (value instanceof Date) {
        return value.toISOString();
      }

      if (Array.isArray(value)) {
        const sanitizedArray = value
          .map((item) => this.sanitizePersistableValue(item, depth + 1))
          .filter((item) => item !== undefined);
        return sanitizedArray.length > 0 ? sanitizedArray : undefined;
      }

      if (value && (value.isVector3 || value instanceof THREE.Vector3)) {
        return { x: value.x, y: value.y, z: value.z };
      }

      if (value && (value.isEuler || value instanceof THREE.Euler)) {
        return { x: value.x, y: value.y, z: value.z, order: value.order };
      }

      if (value && (value.isQuaternion || value instanceof THREE.Quaternion)) {
        return { x: value.x, y: value.y, z: value.z, w: value.w };
      }

      if (value && (value.isColor || value instanceof THREE.Color)) {
        return typeof value.getHexString === 'function' ? `#${value.getHexString()}` : undefined;
      }

      if (typeof Element !== 'undefined' && value instanceof Element) {
        return undefined;
      }

      if (type === 'function') {
        return undefined;
      }

      const proto = Object.getPrototypeOf(value);
      if (!proto || proto === Object.prototype) {
        const result = {};
        Object.entries(value).forEach(([key, val]) => {
          const sanitized = this.sanitizePersistableValue(val, depth + 1);
          if (sanitized !== undefined) {
            result[key] = sanitized;
          }
        });
        return Object.keys(result).length > 0 ? result : undefined;
      }

      return undefined;
    }

    /**
     * Object3Dのスナップショット生成
     * @param {THREE.Object3D} object
     * @returns {object|null}
     */
    captureObjectSnapshot(object) {
      if (!object) {
        return null;
      }

      const userData = object.userData || {};
      const objectId = userData.id || object.name || object.uuid || null;

      const position = object.position
        ? { x: object.position.x, y: object.position.y, z: object.position.z }
        : null;
      const rotation = object.rotation
        ? { x: object.rotation.x, y: object.rotation.y, z: object.rotation.z }
        : null;
      const scale = object.scale
        ? { x: object.scale.x, y: object.scale.y, z: object.scale.z }
        : null;

      const worldPosition = new THREE.Vector3();
      object.getWorldPosition(worldPosition);
      const worldQuaternion = new THREE.Quaternion();
      object.getWorldQuaternion(worldQuaternion);

      const boundingBox = new THREE.Box3();
      let bounds = null;
      try {
        boundingBox.setFromObject(object);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        boundingBox.getSize(size);
        boundingBox.getCenter(center);
        bounds = {
          size: { x: size.x, y: size.y, z: size.z },
          center: { x: center.x, y: center.y, z: center.z }
        };
      } catch (error) {
        bounds = null;
      }

      const metadata = this.sanitizePersistableValue(userData);

      const snapshot = {
        id: objectId,
        name: object.name || null,
        type: userData.type || object.type || 'object3d',
        source: userData.source || null,
        createdAt: userData.createdAt || null,
        prompt: userData.prompt || null,
        model: userData.modelName || null,
        keywords: Array.isArray(userData.keywords) ? [...userData.keywords] : undefined,
        transform: {
          position,
          rotation,
          scale,
          worldPosition: { x: worldPosition.x, y: worldPosition.y, z: worldPosition.z },
          worldQuaternion: { x: worldQuaternion.x, y: worldQuaternion.y, z: worldQuaternion.z, w: worldQuaternion.w }
        },
        bounds: bounds || undefined,
        metadata: metadata || undefined
      };

      if (userData.fileUrl || userData.videoUrl || userData.imageUrl) {
        snapshot.asset = {
          url: userData.fileUrl || userData.videoUrl || userData.imageUrl || null,
          fileName: userData.fileName || null,
          mimeType: userData.mimeType || null
        };
      }

      if (!snapshot.keywords) {
        delete snapshot.keywords;
      }
      if (!snapshot.prompt) {
        delete snapshot.prompt;
      }
      if (!snapshot.model) {
        delete snapshot.model;
      }
      if (!snapshot.bounds) {
        delete snapshot.bounds;
      }
      if (!snapshot.metadata) {
        delete snapshot.metadata;
      }
      if (!snapshot.asset) {
        delete snapshot.asset;
      }

      return snapshot;
    }

    /**
     * スナップショットをキャッシュし変化判定
     * @param {THREE.Object3D} object
     * @returns {{snapshot: object|null, changed: boolean, previous: object|null}}
     */
    storeSnapshot(object) {
      const snapshot = this.captureObjectSnapshot(object);
      if (!snapshot || !snapshot.id) {
        return { snapshot, changed: true, previous: null };
      }

      const cached = this.objectSnapshotCache.get(snapshot.id);
      const previous = cached ? cached.snapshot : null;

      const position = snapshot.transform?.position || { x: 0, y: 0, z: 0 };
      const rotation = snapshot.transform?.rotation || { x: 0, y: 0, z: 0 };
      const scale = snapshot.transform?.scale || { x: 1, y: 1, z: 1 };

      const key = [
        position.x?.toFixed?.(3) ?? position.x,
        position.y?.toFixed?.(3) ?? position.y,
        position.z?.toFixed?.(3) ?? position.z,
        rotation.x?.toFixed?.(3) ?? rotation.x,
        rotation.y?.toFixed?.(3) ?? rotation.y,
        rotation.z?.toFixed?.(3) ?? rotation.z,
        scale.x?.toFixed?.(3) ?? scale.x,
        scale.y?.toFixed?.(3) ?? scale.y,
        scale.z?.toFixed?.(3) ?? scale.z
      ].join('|');

      const changed = !cached || cached.key !== key;
      this.objectSnapshotCache.set(snapshot.id, {
        key,
        snapshot,
        timestamp: Date.now()
      });

      return { snapshot, changed, previous };
    }

    /**
     * シーンイベントを記録
     * @param {'created'|'modified'|'removed'|'cleared'} eventType
     * @param {THREE.Object3D|null} object
     * @param {object} extra
     * @returns {object}
     */
    recordSceneEvent(eventType, object, extra = {}) {
      if (this.isRestoring) {
        return {
          id: `${eventType}_restoring_${Date.now()}`,
          eventType,
          timestamp: Date.now(),
          objectId: object?.userData?.id || extra?.objectId || null,
          snapshot: null,
          restoring: true
        };
      }

      const { snapshotOverride = null, objectId: explicitObjectId = null, context = undefined, changes = undefined, notes = undefined } = extra;

      const timestamp = Date.now();
      const snapshot = snapshotOverride || (object ? this.captureObjectSnapshot(object) : null);
      const objectId = explicitObjectId || snapshot?.id || object?.userData?.id || object?.name || null;

      const entry = {
        id: `${eventType}_${timestamp}_${Math.floor(Math.random() * 1000)}`,
        eventType,
        timestamp,
        objectId,
        snapshot: snapshot || null
      };

      if (context !== undefined) {
        entry.context = context;
      }

      if (changes !== undefined) {
        entry.changes = changes;
      }

      if (notes !== undefined) {
        entry.notes = notes;
      }

      this.sceneJournal.push(entry);
      if (this.sceneJournal.length > this.maxSceneJournalEntries) {
        this.sceneJournal.splice(0, this.sceneJournal.length - this.maxSceneJournalEntries);
      }

      if (eventType === 'removed' && objectId) {
        this.objectSnapshotCache.delete(objectId);
      }

      const event = this.emitSceneChange('object-event', {
        eventType,
        entry
      });

      entry.version = event.version;
      return entry;
    }

    /**
     * 現在のシーン状態を取得
     * @param {{includeJournal?: boolean}} options
     * @returns {object}
     */
    getSceneState(options = {}) {
      const { includeJournal = true } = options;
      const objects = Array.from(this.spawnedObjects.values())
        .map((object) => this.captureObjectSnapshot(object))
        .filter((snapshot) => snapshot && snapshot.id);

      const cameraSnapshot = this.camera ? {
        position: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
        rotation: {
          x: this.camera.rotation.x,
          y: this.camera.rotation.y,
          z: this.camera.rotation.z
        },
        quaternion: this.camera.quaternion ? {
          x: this.camera.quaternion.x,
          y: this.camera.quaternion.y,
          z: this.camera.quaternion.z,
          w: this.camera.quaternion.w
        } : undefined,
        fov: this.camera.fov,
        near: this.camera.near,
        far: this.camera.far
      } : null;

      const state = {
        version: this.sceneStateVersion,
        exportedAt: new Date().toISOString(),
        objectCount: objects.length,
        objects,
        camera: cameraSnapshot || undefined,
        journal: includeJournal ? [...this.sceneJournal] : undefined
      };

      if (!state.camera) {
        delete state.camera;
      }
      if (!includeJournal) {
        delete state.journal;
      }

      return state;
    }

    /**
     * シーン状態をJSONとしてエクスポート
     * @param {{includeJournal?: boolean, download?: boolean, fileName?: string}} options
     * @returns {object}
     */
    exportSceneState(options = {}) {
      const { includeJournal = true, download = true, fileName } = options;
      const state = this.getSceneState({ includeJournal });

      if (download !== false && typeof document !== 'undefined') {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const defaultName = `chocodrop-scene-${timestamp}.json`;
        this.downloadJson(state, fileName || defaultName);
      }

      return state;
    }

    /**
     * JSONダウンロードを実行
     * @param {object} data
     * @param {string} fileName
     */
    downloadJson(data, fileName) {
      try {
        if (typeof document === 'undefined' || typeof window === 'undefined' || typeof Blob === 'undefined') {
          console.warn('⚠️ JSON download is not supported in this environment');
          return;
        }
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (error) {
        console.warn('⚠️ Failed to download JSON:', error);
      }
    }

    /**
     * オブジェクト変更をジャーナルへ記録
     * @param {string|THREE.Object3D} target
     * @param {object} context
     */
    markObjectModified(target, context = {}) {
      if (this.isRestoring) {
        return;
      }

      const object = typeof target === 'string' ? this.spawnedObjects.get(target) : target;
      if (!object) {
        return;
      }

      const snapshotResult = this.storeSnapshot(object);
      if (!snapshotResult.changed) {
        return;
      }

      this.recordSceneEvent('modified', object, {
        context,
        snapshotOverride: snapshotResult.snapshot,
        changes: {
          transform: snapshotResult.snapshot.transform
        }
      });
    }

    /**
     * 生成オブジェクトを登録
     * @param {string} objectId
     * @param {THREE.Object3D} object
     * @param {object} context
     */
    registerSpawnedObject(objectId, object, context = {}) {
      if (!object) {
        return;
      }

      const resolvedId = objectId || object.userData?.id || object.name;
      if (!resolvedId) {
        throw new Error('Object ID is required to register a spawned object');
      }

      if (!object.userData) {
        object.userData = {};
      }
      if (!object.userData.id) {
        object.userData.id = resolvedId;
      }

      if (!object.name) {
        object.name = resolvedId;
      }

      this.spawnedObjects.set(resolvedId, object);
      const snapshotResult = this.storeSnapshot(object);
      this.recordSceneEvent('created', object, {
        objectId: resolvedId,
        context,
        snapshotOverride: snapshotResult.snapshot
      });
    }

    /**
     * シーンジャーナルをクリア
     */
    clearSceneJournal() {
      this.sceneJournal = [];
      this.objectSnapshotCache.clear();
      this.emitSceneChange('journal-cleared', {});
    }

    /**
     * スナップショットデータからシーンを復元
     * @param {object} state - 保存されたシーンデータ
     * @param {object} options
     * @param {boolean} [options.clearExisting=true] - 既存オブジェクトを消すか
     * @param {boolean} [options.applyCamera=true] - カメラを復元するか
     * @returns {Promise<{loaded: number, failed: number}>}
     */
    async loadSceneState(state, options = {}) {
      if (!state || typeof state !== 'object') {
        throw new Error('無効なシーンデータです。JSONを確認してください。');
      }

      const { clearExisting = true, applyCamera = true } = options;
      const objects = Array.isArray(state.objects) ? state.objects : [];

      let loadedCount = 0;
      let failedCount = 0;
      let maxIdSeed = this.objectCounter;

      this.isRestoring = true;

      try {
        if (clearExisting) {
          this.clearAll();
          this.clearSceneJournal();
        }

        for (const snapshot of objects) {
          try {
            const object = await this.restoreObjectFromSnapshot(snapshot);
            if (object) {
              loadedCount += 1;
              const numericId = this.extractNumericId(snapshot?.id);
              if (numericId !== null) {
                maxIdSeed = Math.max(maxIdSeed, numericId);
              }
            }
          } catch (error) {
            failedCount += 1;
            console.warn(`⚠️ Failed to restore object ${snapshot?.id || '(unknown)'}`, error);
          }
        }

        if (applyCamera && this.camera && state.camera) {
          this.applyCameraSnapshot(state.camera);
        }

        if (Array.isArray(state.journal)) {
          this.sceneJournal = [...state.journal];
        }

        if (typeof state.version === 'number') {
          this.sceneStateVersion = state.version;
        } else {
          this.sceneStateVersion += 1;
        }

        this.objectCounter = Math.max(this.objectCounter, maxIdSeed);

        // キャッシュを最新化
        this.objectSnapshotCache.clear();
        this.spawnedObjects.forEach((object) => {
          this.storeSnapshot(object);
        });
      } finally {
        this.isRestoring = false;
      }

      this.emitSceneChange('scene-restored', {
        loaded: loadedCount,
        failed: failedCount,
        version: this.sceneStateVersion
      });

      return { loaded: loadedCount, failed: failedCount };
    }

    extractNumericId(id) {
      if (typeof id !== 'string') {
        return null;
      }
      const match = id.match(/_(\d+)$/);
      return match ? parseInt(match[1], 10) : null;
    }

    applyCameraSnapshot(snapshot) {
      if (!snapshot || !this.camera) return;

      if (snapshot.position && typeof snapshot.position === 'object') {
        this.camera.position.set(
          snapshot.position.x ?? this.camera.position.x,
          snapshot.position.y ?? this.camera.position.y,
          snapshot.position.z ?? this.camera.position.z
        );
      }

      if (snapshot.quaternion && typeof snapshot.quaternion === 'object' && this.camera.quaternion) {
        this.camera.quaternion.set(
          snapshot.quaternion.x ?? this.camera.quaternion.x,
          snapshot.quaternion.y ?? this.camera.quaternion.y,
          snapshot.quaternion.z ?? this.camera.quaternion.z,
          snapshot.quaternion.w ?? this.camera.quaternion.w
        );
      } else if (snapshot.rotation && typeof snapshot.rotation === 'object') {
        this.camera.rotation.set(
          snapshot.rotation.x ?? this.camera.rotation.x,
          snapshot.rotation.y ?? this.camera.rotation.y,
          snapshot.rotation.z ?? this.camera.rotation.z
        );
      }

      if (typeof snapshot.fov === 'number' && this.camera.fov !== undefined) {
        this.camera.fov = snapshot.fov;
      }
      if (typeof snapshot.near === 'number' && this.camera.near !== undefined) {
        this.camera.near = snapshot.near;
      }
      if (typeof snapshot.far === 'number' && this.camera.far !== undefined) {
        this.camera.far = snapshot.far;
      }

      if (typeof this.camera.updateProjectionMatrix === 'function') {
        this.camera.updateProjectionMatrix();
      }
    }

    async restoreObjectFromSnapshot(snapshot) {
      if (!snapshot || typeof snapshot !== 'object') {
        throw new Error('不正なオブジェクトスナップショットです');
      }

      const type = snapshot.type || snapshot.metadata?.type || 'object3d';
      let object = null;

      if (type === 'generated_image' || snapshot.source === 'generated_image' || snapshot.source === 'imported_file_image') {
        object = await this.restoreImageObject(snapshot);
      } else if (type === 'generated_video' || snapshot.source === 'generated_video' || snapshot.source === 'imported_file_video') {
        object = await this.restoreVideoObject(snapshot);
      } else if (type === 'generated_3d_model' || snapshot.source === 'imported_file') {
        object = await this.restoreModelObject(snapshot);
      } else {
        console.warn(`⚠️ Unsupported object type for restoration: ${type}`);
        return null;
      }

      if (!object) {
        throw new Error(`オブジェクト ${snapshot.id || '(unknown)'} の復元に失敗しました`);
      }

      this.applyTransformFromSnapshot(object, snapshot.transform);
      this.finalizeRestoredObject(snapshot, object);
      return object;
    }

    async restoreImageObject(snapshot) {
      const assetUrl = snapshot.asset?.url || snapshot.metadata?.fileUrl || snapshot.metadata?.imageUrl;
      if (!assetUrl) {
        throw new Error('画像のURL情報が不足しています');
      }

      const loader = new THREE.TextureLoader();
      const texture = await loader.loadAsync(assetUrl);
      texture.colorSpace = THREE.SRGBColorSpace;

      const width = snapshot.bounds?.size?.x || 6;
      const height = snapshot.bounds?.size?.y || 6;

      const geometry = new THREE.PlaneGeometry(width, height);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: snapshot.metadata?.originalOpacity ?? 1.0,
        side: THREE.DoubleSide,
        toneMapped: false
      });

      const plane = new THREE.Mesh(geometry, material);
      plane.renderOrder = 1000;
      return plane;
    }

    async restoreVideoObject(snapshot) {
      const assetUrl = snapshot.asset?.url || snapshot.metadata?.videoUrl || snapshot.metadata?.fileUrl;
      if (!assetUrl) {
        throw new Error('動画のURL情報が不足しています');
      }

      const video = document.createElement('video');
      video.src = assetUrl;
      video.crossOrigin = 'anonymous';
      video.loop = true;
      video.muted = true;
      video.playsInline = true;

      try {
        await video.play();
        video.pause();
      } catch (error) {
        console.warn('⚠️ Video autoplay failed during restoration (will require user interaction):', error);
      }

      const texture = new THREE.VideoTexture(video);
      texture.colorSpace = THREE.SRGBColorSpace;

      const width = snapshot.bounds?.size?.x || 6;
      const height = snapshot.bounds?.size?.y || 6;

      const geometry = new THREE.PlaneGeometry(width, height);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: false,
        side: THREE.DoubleSide,
        toneMapped: false
      });

      const plane = new THREE.Mesh(geometry, material);
      plane.userData.videoElement = video;
      return plane;
    }

    async restoreModelObject(snapshot) {
      const assetUrl = snapshot.asset?.url || snapshot.metadata?.fileUrl;
      if (!assetUrl) {
        throw new Error('3DモデルのURL情報が不足しています');
      }

      const loader = await this.ensureGLTFLoader();
      const gltf = await loader.loadAsync(assetUrl);
      const modelRoot = gltf.scene || (gltf.scenes && gltf.scenes[0]);
      if (!modelRoot) {
        throw new Error('GLBファイルにシーンデータが含まれていません');
      }

      modelRoot.traverse(node => {
        if (node.isMesh) {
          node.castShadow = true;
          node.receiveShadow = true;
          if (node.material && node.material.metalness !== undefined) {
            node.material.metalness = 0;
            node.material.needsUpdate = true;
          }
        }
      });

      if (gltf.animations && gltf.animations.length > 0) {
        const mixer = new THREE.AnimationMixer(modelRoot);
        gltf.animations.forEach(clip => {
          const action = mixer.clipAction(clip);
          action.play();
        });
        this.animationMixers.add(mixer);
        modelRoot.userData = {
          ...(modelRoot.userData || {}),
          animationMixer: mixer,
          animationClips: gltf.animations
        };
        this.startAnimationLoop();
      }

      return modelRoot;
    }

    applyTransformFromSnapshot(object, transform) {
      if (!transform || !object) return;

      if (transform.position) {
        object.position.set(
          transform.position.x ?? object.position.x,
          transform.position.y ?? object.position.y,
          transform.position.z ?? object.position.z
        );
      }

      if (transform.rotation) {
        object.rotation.set(
          transform.rotation.x ?? object.rotation.x,
          transform.rotation.y ?? object.rotation.y,
          transform.rotation.z ?? object.rotation.z
        );
      }

      if (transform.scale) {
        object.scale.set(
          transform.scale.x ?? object.scale.x,
          transform.scale.y ?? object.scale.y,
          transform.scale.z ?? object.scale.z
        );
      }
    }

    finalizeRestoredObject(snapshot, object) {
      const metadata = snapshot.metadata && typeof snapshot.metadata === 'object' ? { ...snapshot.metadata } : {};
      const asset = snapshot.asset && typeof snapshot.asset === 'object' ? { ...snapshot.asset } : null;

      object.name = snapshot.name || snapshot.id || object.name;
      object.userData = {
        ...metadata,
        id: snapshot.id || metadata.id || object.name,
        type: snapshot.type || metadata.type,
        source: snapshot.source || metadata.source,
        createdAt: snapshot.createdAt || metadata.createdAt || Date.now(),
        restored: true
      };

      if (asset?.url) {
        if (!object.userData.fileUrl) object.userData.fileUrl = asset.url;
        if (!object.userData.videoUrl && snapshot.type === 'generated_video') {
          object.userData.videoUrl = asset.url;
        }
        if (!object.userData.imageUrl && snapshot.type === 'generated_image') {
          object.userData.imageUrl = asset.url;
        }
        if (asset.fileName && !object.userData.fileName) {
          object.userData.fileName = asset.fileName;
        }
        if (asset.mimeType && !object.userData.mimeType) {
          object.userData.mimeType = asset.mimeType;
        }
      }

      if (!object.userData.originalScale) {
        object.userData.originalScale = object.scale.clone ? object.scale.clone() : object.userData.originalScale;
      }

      this.experimentGroup.add(object);
      const objectId = object.userData.id;
      if (objectId) {
        this.spawnedObjects.set(objectId, object);
      }

      this.storeSnapshot(object);
    }

    /**
     * 生成されたオブジェクト一覧取得
     */
    getSpawnedObjects() {
      return Array.from(this.spawnedObjects.entries()).map(([id, object]) => ({
        id,
        name: object.name,
        userData: object.userData,
        position: object.position.clone()
      }));
    }

    /**
     * オブジェクト削除
     */
    removeObject(objectId) {
      const object = this.spawnedObjects.get(objectId);
      if (object) {
        const removalSnapshot = this.captureObjectSnapshot(object);
        if (object.userData?.videoElement) {
          const videoElement = object.userData.videoElement;
          try {
            videoElement.pause();
            if (typeof videoElement.removeAttribute === 'function') {
              videoElement.removeAttribute('src');
            } else {
              videoElement.src = '';
            }
            if (typeof videoElement.load === 'function') {
              videoElement.load();
            }
          } catch (error) {
            console.warn('🎬 Failed to release video element resources:', error);
          }
        }

        if (object.userData?.objectUrl) {
          try {
            URL.revokeObjectURL(object.userData.objectUrl);
          } catch (error) {
            console.warn('🎬 Failed to revoke object URL:', error);
          }
        }

        if (object.userData?.cleanupCallbacks) {
          try {
            object.userData.cleanupCallbacks.forEach(cb => {
              if (typeof cb === 'function') cb();
            });
          } catch (error) {
            console.warn('🧹 Cleanup callbacks failed:', error);
          }
        }

        if (object.userData?.animationMixer) {
          this.animationMixers.delete(object.userData.animationMixer);
        }

        this.recordSceneEvent('removed', object, {
          objectId,
          snapshotOverride: removalSnapshot,
          context: { trigger: 'removeObject' }
        });

        this.experimentGroup.remove(object);
        this.spawnedObjects.delete(objectId);

        // ジオメトリとマテリアルのメモリ解放
        const disposeMeshResources = mesh => {
          if (mesh.geometry && typeof mesh.geometry.dispose === 'function') {
            mesh.geometry.dispose();
          }
          if (mesh.material) {
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach(mat => {
              if (mat.map && typeof mat.map.dispose === 'function') {
                mat.map.dispose();
              }
              if (typeof mat.dispose === 'function') {
                mat.dispose();
              }
            });
          }
        };

        if (object.traverse) {
          object.traverse(child => {
            if (child.isMesh) {
              disposeMeshResources(child);
            }
          });
        } else {
          disposeMeshResources(object);
        }
        
        console.log(`🗑️ Removed object: ${objectId}`);
        return true;
      }
      return false;
    }

    /**
     * 全オブジェクト削除
     */
    clearAll() {
      const objectIds = Array.from(this.spawnedObjects.keys());
      objectIds.forEach(id => this.removeObject(id));
      if (objectIds.length > 0) {
        this.recordSceneEvent('cleared', null, {
          context: { removedIds: objectIds }
        });
      }
      console.log('🧹 Cleared all experimental objects');
    }

    /**
     * コマンド履歴取得
     */
    getCommandHistory() {
      return [...this.commandHistory];
    }

    /**
     * 生成位置に一時的な視覚インジケーターを表示
     */
    createLocationIndicator(relativePosition) {
      // 目立つ光る球体を作成
      const geometry = new THREE.SphereGeometry(1, 16, 16);
      const material = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.9
      });
      
      const indicator = new THREE.Mesh(geometry, material);
      
      const indicatorPos = this.resolveSpawnPosition(
        {
          x: relativePosition.x,
          y: relativePosition.y,
          z: relativePosition.z,
          absolute: relativePosition?.absolute
        },
        { offsetY: 2 }
      );
      indicator.position.copy(indicatorPos);
      
      console.log(`🟢 インジケーター表示: (${indicator.position.x.toFixed(1)}, ${indicator.position.y.toFixed(1)}, ${indicator.position.z.toFixed(1)})`);
      
      this.scene.add(indicator);
      
      // 設定された時間後に自動削除
      setTimeout(() => {
        this.scene.remove(indicator);
        geometry.dispose();
        material.dispose();
      }, this.config.indicatorDuration);
      
      // アニメーション（点滅効果）
      let opacity = 0.8;
      let direction = -1;
      const animate = () => {
        opacity += direction * 0.05;
        if (opacity <= 0.3) direction = 1;
        if (opacity >= 0.8) direction = -1;
        
        material.opacity = opacity;
        
        if (indicator.parent) {
          requestAnimationFrame(animate);
        }
      };
      animate();
    }

    /**
     * エラー時にローディング状態をクリアする
     */
    clearLoadingStates() {
      // ローディングインジケーターを削除
      const loadingIndicators = [];
      this.scene.traverse((object) => {
        if (object.userData && object.userData.isLoadingIndicator) {
          loadingIndicators.push(object);
        }
      });

      loadingIndicators.forEach(indicator => {
        this.scene.remove(indicator);
        if (indicator.geometry) indicator.geometry.dispose();
        if (indicator.material) {
          if (Array.isArray(indicator.material)) {
            indicator.material.forEach(mat => mat.dispose());
          } else {
            indicator.material.dispose();
          }
        }
      });

      // 進行中のアニメーションを停止
      if (this.animations) {
        for (const [id, animation] of this.animations.entries()) {
          if (animation.type === 'loading' || animation.isLoadingAnimation) {
            this.animations.delete(id);
          }
        }
      }

      // 現在選択中のオブジェクトの選択状態を維持
      // エラー時にオブジェクトが選択解除されないようにする

      console.log('🧹 Loading states cleared from scene');
    }

    /**
     * カメラ相対位置計算（画面座標対応）
     */
    calculateCameraRelativePosition(relativePosition) {
      if (!this.camera) {
        if (this.config.enableDebugLogging) {
          console.warn('📷 Camera not available, using fallback positioning');
        }
        return new THREE.Vector3(relativePosition.x, relativePosition.y, relativePosition.z);
      }

      try {
        const cameraPos = new THREE.Vector3();
        this.camera.getWorldPosition(cameraPos);

        const cameraDirection = new THREE.Vector3();
        this.camera.getWorldDirection(cameraDirection).normalize();

        let cameraUpActual = new THREE.Vector3();
        cameraUpActual.copy(this.camera.up).applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion())).normalize();
        if (cameraUpActual.lengthSq() === 0) {
          cameraUpActual.set(0, 1, 0);
        }

        const cameraRight = new THREE.Vector3().crossVectors(cameraDirection, cameraUpActual).normalize();
        if (cameraRight.lengthSq() === 0) {
          cameraRight.set(1, 0, 0);
        }

        cameraUpActual = new THREE.Vector3().crossVectors(cameraRight, cameraDirection).normalize();

        const finalPosition = cameraPos.clone();
        finalPosition.add(cameraDirection.clone().multiplyScalar(relativePosition.z));
        finalPosition.add(cameraRight.clone().multiplyScalar(relativePosition.x));
        finalPosition.add(cameraUpActual.clone().multiplyScalar(relativePosition.y));

        const towardCamera = finalPosition.clone().sub(cameraPos);
        if (cameraDirection.dot(towardCamera.normalize()) < 0.05) {
          const safeDistance = Math.max(4, Math.abs(relativePosition.z)) || 6;
          finalPosition.copy(cameraPos).add(cameraDirection.clone().multiplyScalar(safeDistance));
          this.logDebug('⚠️ Adjusted object position to keep it in front of the camera');
        }

        this.logDebug(`📍 Camera relative position calculated: (${finalPosition.x.toFixed(1)}, ${finalPosition.y.toFixed(1)}, ${finalPosition.z.toFixed(1)})`);
        return finalPosition;

      } catch (error) {
        console.error('❌ Camera relative position calculation failed:', error);
        return new THREE.Vector3(relativePosition.x, relativePosition.y, relativePosition.z);
      }
    }

    resolveSpawnPosition(position = { x: 0, y: 0, z: -10 }, options = {}) {
      const offsetY = options.offsetY ?? 0;
      const base = {
        x: position?.x ?? 0,
        y: position?.y ?? 0,
        z: position?.z ?? -10,
        absolute: position?.absolute === true
      };

      if (!this.camera) {
        return new THREE.Vector3(base.x, base.y + offsetY, base.z);
      }

      if (base.absolute) {
        return new THREE.Vector3(base.x, base.y + offsetY, base.z);
      }

      return this.calculateCameraRelativePosition({
        x: base.x,
        y: base.y + offsetY,
        z: base.z
      });
    }

    setXRPlacementAnchor(anchor) {
      if (!anchor || !anchor.position) {
        this.clearXRPlacementAnchor();
        return;
      }

      const toVector = input => {
        if (!input) return new THREE.Vector3();
        if (input.isVector3) {
          return input.clone();
        }
        return new THREE.Vector3(input.x ?? 0, input.y ?? 0, input.z ?? 0);
      };

      const toQuaternion = input => {
        if (!input) return null;
        if (input.isQuaternion) {
          return input.clone();
        }
        return new THREE.Quaternion(input.x ?? 0, input.y ?? 0, input.z ?? 0, input.w ?? 1);
      };

      const normalized = {
        position: toVector(anchor.position),
        orientation: toQuaternion(anchor.orientation),
        timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now()
      };

      this.xr.anchor = normalized;
      this._dispatchXREvent('anchor', {
        active: true,
        supported: this.xr.anchorSupported,
        position: {
          x: normalized.position.x,
          y: normalized.position.y,
          z: normalized.position.z
        }
      });
    }

    clearXRPlacementAnchor() {
      if (!this.xr.anchor) {
        return;
      }
      this.xr.anchor = null;
      this._dispatchXREvent('anchor', {
        active: false,
        supported: this.xr.anchorSupported
      });
    }

    setXRAnchorSupport(supported) {
      if (this.xr.anchorSupported === supported) {
        return;
      }
      this.xr.anchorSupported = supported;
      this._dispatchXREvent('anchor', {
        supported,
        active: Boolean(this.xr.anchor)
      });
    }

    applyOrientationFromPosition(object, position) {
      if (!object || !position?.orientation) {
        return false;
      }
      const orientation = position.orientation;
      if (orientation.isQuaternion) {
        object.quaternion.copy(orientation);
      } else {
        object.quaternion.set(
          orientation.x ?? 0,
          orientation.y ?? 0,
          orientation.z ?? 0,
          orientation.w ?? 1
        );
      }
      return true;
    }

    /**
     * カメラを設定
     */
    alignPlaneToCamera(plane) {
      if (!this.camera) {
        return;
      }

      const forward = new THREE.Vector3();
      this.camera.getWorldDirection(forward);
      forward.normalize().negate();

      let up = new THREE.Vector3();
      up.copy(this.camera.up).applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion())).normalize();
      if (Math.abs(forward.dot(up)) > 0.999) {
        up = new THREE.Vector3(0, 1, 0);
        if (Math.abs(forward.dot(up)) > 0.999) {
          up = new THREE.Vector3(0, 0, 1);
        }
      }

      const right = new THREE.Vector3().crossVectors(forward, up).normalize();
      up = new THREE.Vector3().crossVectors(right, forward).normalize();

      const orientation = new THREE.Matrix4();
      orientation.makeBasis(right, up, forward);
      plane.quaternion.setFromRotationMatrix(orientation);
    }

    /**
     * カメラを設定
     */
    setCamera(camera) {
      this.camera = camera;
    }

    /**
     * 設定を更新
     */
    updateConfig(newConfig) {
      this.config = { ...this.config, ...newConfig };
    }

    setImageService(serviceId) {
      this.selectedImageService = serviceId || null;
      this.logDebug('🎯 Updated image service:', this.selectedImageService);
    }

    getImageService() {
      return this.selectedImageService;
    }

    setVideoService(serviceId) {
      this.selectedVideoService = serviceId || null;
      this.logDebug('🎬 Updated video service:', this.selectedVideoService);
    }

    getVideoService() {
      return this.selectedVideoService;
    }





    /**
     * 音声制御UIを作成
     */
    createAudioControl(videoObject) {
      const videoElement = videoObject.userData.videoElement;
      if (!videoElement) return;

      // 音声制御ボタンを作成
      const audioButton = document.createElement('div');
      audioButton.className = 'chocodrop-audio-control';
      audioButton.innerHTML = '♪'; // 初期状態：音楽記号
      // カスタムツールチップを作成（プロジェクトのデザインシステムに合わせて）
      const createTooltip = () => {
        const tooltip = document.createElement('div');
        tooltip.className = 'chocodrop-audio-tooltip';
        tooltip.textContent = '音声のオン/オフ切り替え';
        tooltip.style.cssText = `
        position: absolute !important;
        background: rgba(0, 0, 0, 0.85) !important;
        backdrop-filter: blur(12px) !important;
        -webkit-backdrop-filter: blur(12px) !important;
        border: 1px solid rgba(255, 255, 255, 0.15) !important;
        border-radius: 8px !important;
        padding: 8px 12px !important;
        color: white !important;
        font-size: 11px !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        font-weight: 500 !important;
        white-space: nowrap !important;
        pointer-events: none !important;
        z-index: 1000000 !important;
        opacity: 0 !important;
        transform: translateY(-100%) translateX(-50%) !important;
        transition: opacity 0.2s ease !important;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3) !important;
        margin-bottom: 8px !important;
      `;
        return tooltip;
      };

      const tooltip = createTooltip();
      document.body.appendChild(tooltip);

      // 縦型音量スライダーを作成
      const createVolumeSlider = () => {
        const sliderContainer = document.createElement('div');
        sliderContainer.className = 'chocodrop-volume-slider';
        sliderContainer.style.cssText = `
        position: absolute !important;
        width: 30px !important;
        height: 100px !important;
        background: rgba(0, 0, 0, 0.85) !important;
        backdrop-filter: blur(12px) !important;
        -webkit-backdrop-filter: blur(12px) !important;
        border: 1px solid rgba(255, 255, 255, 0.15) !important;
        border-radius: 15px !important;
        padding: 10px 8px !important;
        z-index: 1000001 !important;
        opacity: 0 !important;
        pointer-events: none !important;
        transition: opacity 0.2s ease !important;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3) !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
      `;

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '100';
        slider.value = '100';
        slider.style.cssText = `
        width: 80px !important;
        height: 12px !important;
        background: rgba(255, 255, 255, 0.2) !important;
        border-radius: 6px !important;
        outline: none !important;
        cursor: pointer !important;
        -webkit-appearance: none !important;
        appearance: none !important;
        transform: rotate(-90deg) !important;
        transform-origin: center !important;
      `;

        // WebKit用のスライダースタイル
        const style = document.createElement('style');
        style.textContent = `
        .chocodrop-volume-slider input[type="range"]::-webkit-slider-track {
          width: 6px;
          height: 80px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 3px;
        }
        .chocodrop-volume-slider input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px;
          height: 14px;
          background: white;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        }
        .chocodrop-volume-slider input[type="range"]::-moz-range-track {
          width: 6px;
          height: 80px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 3px;
          border: none;
        }
        .chocodrop-volume-slider input[type="range"]::-moz-range-thumb {
          width: 14px;
          height: 14px;
          background: white;
          border-radius: 50%;
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        }
      `;
        document.head.appendChild(style);

        // スライダーのスタイルをカスタマイズ
        slider.addEventListener('input', (e) => {
          const value = e.target.value;
          videoElement.volume = value / 100;

          // アイコンを音量に応じて変更
          if (value == 0) {
            audioButton.innerHTML = '<span style="position: relative;">♪<span style="position: absolute; top: 0; left: 0; color: #8b5cf6; font-size: 14px;">⃠</span></span>';
            audioButton.style.background = 'rgba(99, 102, 241, 0.6) !important';
            audioButton.title = 'ミュート中';
          } else {
            audioButton.innerHTML = '♪';
            audioButton.style.background = 'rgba(0, 0, 0, 0.4) !important';
            audioButton.style.color = 'white !important';
            audioButton.title = '音声ON';
          }
        });

        sliderContainer.appendChild(slider);
        return sliderContainer;
      };

      const volumeSlider = createVolumeSlider();
      document.body.appendChild(volumeSlider);

      audioButton.style.cssText = `
      position: absolute !important;
      width: 18px !important;
      height: 18px !important;
      background: rgba(0, 0, 0, 0.4) !important;
      border: 1px solid rgba(255, 255, 255, 0.3) !important;
      border-radius: 50% !important;
      color: white !important;
      font-size: 9px !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      z-index: 999999 !important;
      transition: all 0.2s ease !important;
      user-select: none !important;
      box-shadow: 0 1px 4px rgba(0,0,0,0.2) !important;
      backdrop-filter: blur(8px) !important;
      pointer-events: auto !important;
      opacity: 1 !important;
    `;

      let isSliderVisible = false;

      // ホバー効果とスライダー表示
      audioButton.addEventListener('mouseenter', () => {
        audioButton.style.background = 'rgba(0, 0, 0, 0.7)';
        audioButton.style.transform = 'scale(1.05)';
        audioButton.style.borderColor = 'rgba(255, 255, 255, 0.5)';

        if (!isSliderVisible) {
          // ツールチップを表示
          const buttonRect = audioButton.getBoundingClientRect();
          tooltip.style.left = `${buttonRect.left + buttonRect.width / 2}px`;
          tooltip.style.top = `${buttonRect.top - 8}px`;
          tooltip.style.opacity = '1';
        }
      });

      audioButton.addEventListener('mouseleave', () => {
        audioButton.style.background = 'rgba(0, 0, 0, 0.5)';
        audioButton.style.transform = 'scale(1.0)';
        audioButton.style.borderColor = 'rgba(255, 255, 255, 0.4)';

        // ツールチップを非表示
        tooltip.style.opacity = '0';
      });

      // 左クリック：ミュートのオン/オフ切り替え
      audioButton.addEventListener('click', (e) => {
        e.stopPropagation();

        // スライダーが表示されている場合は閉じる
        if (isSliderVisible) {
          isSliderVisible = false;
          volumeSlider.style.opacity = '0';
          volumeSlider.style.pointerEvents = 'none';
          return;
        }

        // ミュート切り替え
        if (videoElement.muted || videoElement.volume === 0) {
          videoElement.muted = false;
          videoElement.volume = volumeSlider.querySelector('input').value / 100;
          audioButton.innerHTML = '♪';
          audioButton.style.background = 'rgba(0, 0, 0, 0.4) !important';
          audioButton.style.color = 'white !important';
          audioButton.title = '音声ON';
        } else {
          videoElement.muted = true;
          audioButton.innerHTML = '<span style="position: relative;">♪<span style="position: absolute; top: 0; left: 0; color: #8b5cf6; font-size: 14px;">⃠</span></span>';
          audioButton.style.background = 'rgba(99, 102, 241, 0.6) !important';
          audioButton.title = 'ミュート中';
        }
      });

      // 右クリック：音量スライダーの表示/非表示切り替え
      audioButton.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();

        isSliderVisible = !isSliderVisible;

        if (isSliderVisible) {
          // スライダーを表示
          const buttonRect = audioButton.getBoundingClientRect();
          volumeSlider.style.left = `${buttonRect.left + buttonRect.width / 2 - 15}px`;
          volumeSlider.style.top = `${buttonRect.top - 110}px`;
          volumeSlider.style.opacity = '1';
          volumeSlider.style.pointerEvents = 'auto';

          // ツールチップを非表示
          tooltip.style.opacity = '0';
        } else {
          // スライダーを非表示
          volumeSlider.style.opacity = '0';
          volumeSlider.style.pointerEvents = 'none';
        }
      });

      // 外側クリックでスライダーを閉じる
      document.addEventListener('click', (e) => {
        if (isSliderVisible && !audioButton.contains(e.target) && !volumeSlider.contains(e.target)) {
          isSliderVisible = false;
          volumeSlider.style.opacity = '0';
          volumeSlider.style.pointerEvents = 'none';
        }
      });

      // ページに追加
      document.body.appendChild(audioButton);

      // 動画オブジェクトに音声制御ボタンを関連付け
      videoObject.userData.audioControlElement = audioButton;

      // 位置更新関数を保存
      videoObject.userData.updateAudioControlPosition = () => {
        this.updateAudioControlPosition(videoObject, audioButton);
      };

      // 初期位置設定
      this.updateAudioControlPosition(videoObject, audioButton);

      this.audioControls.set(videoObject.userData.id || videoObject.uuid, {
        object: videoObject,
        audioButton,
        tooltip,
        volumeSlider,
        hideSlider: () => {
          isSliderVisible = false;
          volumeSlider.style.opacity = '0';
          volumeSlider.style.pointerEvents = 'none';
        }
      });

      // スクロール・リサイズで追随
      if (!this.audioControlUpdateListener) {
        this.audioControlUpdateListener = () => {
          this.updateAllAudioControlPositions();
        };
        window.addEventListener('scroll', this.audioControlUpdateListener, { passive: true });
        window.addEventListener('resize', this.audioControlUpdateListener, { passive: true });
      }

      if (!this.audioControlUpdateInterval) {
        this.audioControlUpdateInterval = setInterval(() => {
          this.updateAllAudioControlPositions();
        }, 100);
      }

      const cleanup = () => {
        document.removeEventListener('click', onDocumentClick, true);
        if (audioButton.parentNode) audioButton.parentNode.removeChild(audioButton);
        if (tooltip.parentNode) tooltip.parentNode.removeChild(tooltip);
        if (volumeSlider.parentNode) volumeSlider.parentNode.removeChild(volumeSlider);
        this.audioControls.delete(videoObject.userData.id || videoObject.uuid);

        if (this.audioControls.size === 0) {
          if (this.audioControlUpdateInterval) {
            clearInterval(this.audioControlUpdateInterval);
            this.audioControlUpdateInterval = null;
          }
          if (this.audioControlUpdateListener) {
            window.removeEventListener('scroll', this.audioControlUpdateListener);
            window.removeEventListener('resize', this.audioControlUpdateListener);
            this.audioControlUpdateListener = null;
          }
        }
      };

      const onDocumentClick = (e) => {
        if (isSliderVisible && !audioButton.contains(e.target) && !volumeSlider.contains(e.target)) {
          isSliderVisible = false;
          volumeSlider.style.opacity = '0';
          volumeSlider.style.pointerEvents = 'none';
        }
      };

      document.addEventListener('click', onDocumentClick, true);

      videoObject.userData.cleanupCallbacks = videoObject.userData.cleanupCallbacks || [];
      videoObject.userData.cleanupCallbacks.push(cleanup);

      console.log('🔊 Audio control created for video:', videoObject.userData.id);
    }

    /**
     * 音声制御ボタンの位置を動画オブジェクトに合わせて更新
     */
    updateAudioControlPosition(videoObject, audioButton) {
      if (!this.camera || !this.renderer || !audioButton.parentNode) return;

      // 動画オブジェクトの3D座標を画面座標に変換
      const vector = new THREE.Vector3();
      videoObject.getWorldPosition(vector);
      vector.project(this.camera);

      // 画面座標に変換
      const canvas = this.renderer.domElement;
      const rect = canvas.getBoundingClientRect();

      const x = (vector.x * 0.5 + 0.5) * rect.width + rect.left;
      const y = -(vector.y * 0.5 - 0.5) * rect.height + rect.top;

      // 動画オブジェクトの右上にボタンを配置（スケール連動）
      const geometry = videoObject.geometry;
      if (geometry && geometry.parameters) {
        // スケールを考慮したオフセット計算（2025年トレンド：レスポンシブUI）
        const widthInPixels = (geometry.parameters.width * videoObject.scale.x / 2) *
                              (this.renderer.domElement.clientHeight / 20); // 3D→2D変換の概算
        const offsetX = widthInPixels + 20; // オブジェクトの端から20px
        const offsetY = -widthInPixels - 10; // オブジェクトの上から10px

        audioButton.style.left = `${x + offsetX}px`;
        audioButton.style.top = `${y + offsetY}px`;
      } else {
        // フォールバック: 動画中心の右上
        audioButton.style.left = `${x + 50}px`;
        audioButton.style.top = `${y - 20}px`;
      }
    }

    updateAllAudioControlPositions() {
      if (!this.audioControls || this.audioControls.size === 0) {
        return;
      }

      this.audioControls.forEach((entry) => {
        const obj = entry.object;
        if (obj && obj.userData && obj.userData.updateAudioControlPosition) {
          obj.userData.updateAudioControlPosition();
        }
      });
    }

    /**
     * すべてのスケールボタンの位置を更新（マルチオブジェクト対応）
     */
    updateAllScaleButtonsPositions() {
      if (!this.spawnedObjects || this.spawnedObjects.size === 0) {
        return;
      }

      this.spawnedObjects.forEach((obj) => {
        if (obj && obj.userData && obj.userData.updateScaleButtonsPosition) {
          obj.userData.updateScaleButtonsPosition();
        }
        // 選択インジケーター（白い丸）の位置も更新
        if (obj && obj.userData && obj.userData.updateSelectionIndicator) {
          obj.userData.updateSelectionIndicator();
        }
      });
    }

    /**
     * 動画音声の再生/停止を切り替え
     */
    toggleVideoAudio(videoObject, audioButton) {
      const videoElement = videoObject.userData.videoElement;
      if (!videoElement) return;

      if (videoElement.muted) {
        // ミュート解除：音声再生
        videoElement.muted = false;
        audioButton.innerHTML = '🔈'; // 音声再生中マーク
        console.log('🔊 Audio enabled for video:', videoObject.userData.id);
      } else {
        // ミュート：音声停止
        videoElement.muted = true;
        audioButton.innerHTML = '🔊'; // 音声ありマーク
        console.log('🔇 Audio muted for video:', videoObject.userData.id);
      }
    }

    /**
     * CSS2DRenderer初期化（音声制御UIなどの表示に必要）
     */
    initializeLabelRenderer() {
      if (this.labelRenderer) {
        return; // 既に初期化済み
      }

      // CSS2DRendererを動的に読み込んで初期化
      this.loadAndInitializeCSS2DRenderer();
    }

    /**
     * CSS2DRendererの準備完了を保証
     */
    async ensureCSS2DRenderer() {
      if (this.labelRenderer) {
        return; // 既に準備完了
      }

      // 初期化処理がまだの場合は開始
      if (!this.css2dInitPromise) {
        this.css2dInitPromise = this.loadAndInitializeCSS2DRenderer();
      }

      // 初期化完了まで待機
      await this.css2dInitPromise;
    }

    /**
     * CSS2DRendererの動的読み込みと初期化
     */
    async loadAndInitializeCSS2DRenderer() {
      try {
        // CSS2DRendererが既に利用可能な場合
        if (window.THREE && window.THREE.CSS2DRenderer) {
          this.setupCSS2DRenderer();
          return;
        }

        // Three.jsのCSS2DRendererを動的に読み込み
        console.log('🏷️ Loading CSS2DRenderer dynamically...');

        let module;
        try {
          module = await import('three/examples/jsm/renderers/CSS2DRenderer.js');
        } catch (localError) {
          const specifier = 'https://cdn.skypack.dev/three@0.158.0/examples/jsm/renderers/CSS2DRenderer.js';
          const dynamicImport = new Function('specifier', 'return import(specifier);');
          module = await dynamicImport(specifier);
        }

        // グローバルに設定
        if (!window.THREE) window.THREE = {};
        window.THREE.CSS2DRenderer = module.CSS2DRenderer;
        window.THREE.CSS2DObject = module.CSS2DObject;

        console.log('✅ CSS2DRenderer loaded successfully');
        this.setupCSS2DRenderer();

      } catch (error) {
        console.warn('⚠️ Failed to load CSS2DRenderer:', error);
        console.warn('🔧 Audio controls will not be visible. Please include CSS2DRenderer in your project.');
      }
    }

    /**
     * CSS2DRendererのセットアップ
     */
    setupCSS2DRenderer() {
      try {
        this.labelRenderer = new window.THREE.CSS2DRenderer();
        this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
        this.labelRenderer.domElement.style.position = 'absolute';
        this.labelRenderer.domElement.style.top = '0px';
        this.labelRenderer.domElement.style.pointerEvents = 'none';

        // メインレンダラーのコンテナに追加
        if (this.renderer && this.renderer.domElement.parentNode) {
          this.renderer.domElement.parentNode.appendChild(this.labelRenderer.domElement);
        } else {
          document.body.appendChild(this.labelRenderer.domElement);
        }

        console.log('🏷️ CSS2DRenderer initialized for UI overlays');

        // リサイズハンドラーを追加
        this.addLabelRendererResizeHandler();

      } catch (error) {
        console.warn('⚠️ Failed to setup CSS2DRenderer:', error);
      }
    }

    /**
     * CSS2DRendererのリサイズハンドラー追加
     */
    addLabelRendererResizeHandler() {
      if (!this.labelRendererResizeHandler) {
        this.labelRendererResizeHandler = () => {
          if (this.labelRenderer) {
            this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
          }
        };
        window.addEventListener('resize', this.labelRendererResizeHandler);
      }
    }

    /**
     * レンダリング更新（アニメーションループで呼び出し）
     */
    updateRenderer() {
      if (this.labelRenderer && this.scene && this.camera) {
        this.labelRenderer.render(this.scene, this.camera);
      }
    }

    /**
     * スケール変更のトースト通知を表示（2025年トレンド：Zero UI）
     * @param {number} scale - スケール値（0.2 = 20%, 1.0 = 100%, 5.0 = 500%）
     */
    showScaleToast(scale) {
      // 既存のトーストや入力UIを削除
      const existingToast = document.getElementById('chocodrop-scale-toast');
      if (existingToast) {
        existingToast.remove();
      }
      const existingInput = document.getElementById('chocodrop-scale-input-container');
      if (existingInput) {
        existingInput.remove();
      }

      // トースト要素を作成
      const toast = document.createElement('div');
      toast.id = 'chocodrop-scale-toast';
      const percentage = Math.round(scale * 100);
      toast.textContent = `${percentage}%`;

      // 2025年ゲームUIトレンド：画面中央下部、シンプル、読みやすい
      toast.style.cssText = `
      position: fixed !important;
      bottom: 80px !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      background: rgba(0, 0, 0, 0.85) !important;
      backdrop-filter: blur(12px) !important;
      -webkit-backdrop-filter: blur(12px) !important;
      border: 1px solid rgba(255, 255, 255, 0.15) !important;
      border-radius: 12px !important;
      padding: 12px 24px !important;
      color: white !important;
      font-size: 18px !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'SF Pro', sans-serif !important;
      font-weight: 600 !important;
      font-variant-numeric: tabular-nums !important;
      z-index: 999999 !important;
      pointer-events: auto !important;
      cursor: pointer !important;
      opacity: 0 !important;
      transition: opacity 0.2s ease, transform 0.15s ease !important;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4) !important;
      letter-spacing: 0.5px !important;
    `;

      // クリックで入力モードに切り替え
      toast.addEventListener('click', () => {
        if (this.selectedObject) {
          // 現在の値から%を削除して数字だけ渡す
          const currentValue = percentage.toString();
          this.showScaleInput(this.selectedObject, currentValue);
        }
      });

      // ホバーエフェクト
      toast.addEventListener('mouseenter', () => {
        toast.style.transform = 'translateX(-50%) scale(1.05)';
        toast.style.background = 'rgba(20, 20, 20, 0.9)';
      });
      toast.addEventListener('mouseleave', () => {
        toast.style.transform = 'translateX(-50%) scale(1)';
        toast.style.background = 'rgba(0, 0, 0, 0.85)';
      });

      document.body.appendChild(toast);

      // フェードイン
      requestAnimationFrame(() => {
        toast.style.opacity = '1';
      });

      // 3秒後にフェードアウトして削除
      setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
          if (toast.parentNode) {
            toast.remove();
          }
        }, 200); // フェードアウト完了後に削除
      }, 3000);
    }

    /**
     * スケール入力UI を表示（数字直接入力）
     * @param {THREE.Object3D} object - 対象オブジェクト
     * @param {string} initialValue - 初期値（1文字または複数桁の数字）
     */
    showScaleInput(object, initialValue) {
      // 既存のトーストや入力UIを削除
      const existingToast = document.getElementById('chocodrop-scale-toast');
      if (existingToast) {
        existingToast.remove();
      }
      const existingInput = document.getElementById('chocodrop-scale-input-container');
      if (existingInput) {
        existingInput.remove();
      }

      // 現在のスケール値を保存（Escでキャンセル時に戻す）
      const originalScale = object.scale.x;

      // コンテナ作成（2025年トレンド：超ミニマル、Blender/Raycast風）
      const container = document.createElement('div');
      container.id = 'chocodrop-scale-input-container';
      container.style.cssText = `
      position: fixed !important;
      bottom: 80px !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      background: rgba(0, 0, 0, 0.85) !important;
      backdrop-filter: blur(16px) !important;
      -webkit-backdrop-filter: blur(16px) !important;
      border: 1px solid rgba(255, 255, 255, 0.15) !important;
      border-radius: 8px !important;
      padding: 8px 12px !important;
      z-index: 999999 !important;
      opacity: 0 !important;
      transition: opacity 0.15s ease !important;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4) !important;
      display: flex !important;
      align-items: center !important;
      gap: 4px !important;
    `;

      // 入力フィールド（ラベルなし、数字のみ）
      const input = document.createElement('input');
      input.type = 'text';
      input.value = initialValue;
      input.style.cssText = `
      background: transparent !important;
      border: none !important;
      color: white !important;
      font-size: 20px !important;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Mono', 'Roboto Mono', monospace !important;
      font-weight: 500 !important;
      font-variant-numeric: tabular-nums !important;
      width: 50px !important;
      text-align: right !important;
      outline: none !important;
      padding: 0 !important;
    `;

      // %記号
      const percent = document.createElement('span');
      percent.textContent = '%';
      percent.style.cssText = `
      color: rgba(255, 255, 255, 0.6) !important;
      font-size: 20px !important;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Mono', 'Roboto Mono', monospace !important;
      font-weight: 400 !important;
    `;

      container.appendChild(input);
      container.appendChild(percent);
      document.body.appendChild(container);

      // フェードイン
      requestAnimationFrame(() => {
        container.style.opacity = '1';
        input.focus();
        // カーソルを末尾に移動（全選択しない）
        input.setSelectionRange(input.value.length, input.value.length);
      });

      // Enter/Escハンドリング
      const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
          // 確定
          const value = parseInt(input.value, 10);
          if (!isNaN(value) && value >= 20 && value <= 500) {
            const newScale = value / 100;
            object.scale.setScalar(newScale);
            // console.log(`📐 Scale set to ${value}% via direct input`);
            this.showScaleToast(newScale);
            this.markObjectModified(object, {
              trigger: 'scale-input',
              value: newScale
            });
          } else {
            console.warn(`⚠️ Invalid scale value: ${input.value}% (range: 20-500%)`);
            // 無効な値の場合は元に戻す
            object.scale.setScalar(originalScale);
          }
          cleanup();
        } else if (e.key === 'Escape') {
          // キャンセル：元の値に戻す
          object.scale.setScalar(originalScale);
          // console.log(`📐 Scale input cancelled, restored to ${Math.round(originalScale * 100)}%`);
          cleanup();
        }
      };

      // 数字以外の入力を防ぐ
      const handleInput = (e) => {
        input.value = input.value.replace(/[^0-9]/g, '');
      };

      // クリーンアップ関数
      const cleanup = () => {
        input.removeEventListener('keydown', handleKeyDown);
        input.removeEventListener('input', handleInput);
        if (container.parentNode) {
          container.style.opacity = '0';
          setTimeout(() => {
            if (container.parentNode) {
              container.remove();
            }
          }, 200);
        }
      };

      input.addEventListener('keydown', handleKeyDown);
      input.addEventListener('input', handleInput);
    }

    logDebug(...args) {
      if (!this.config.enableDebugLogging) {
        return;
      }
      console.log(...args);
    }

    /**
     * 2025年トレンド: アダプティブ選択インジケーター色計算
     * 背景色を自動検出してWCAG 2025基準のコントラスト比を保証
     */
    getAdaptiveSelectionColor() {
      // シーンの背景色を取得
      const backgroundColor = this.scene.background;
      let bgColor = { r: 0.5, g: 0.5, b: 0.5 }; // デフォルト中間色
      
      if (backgroundColor) {
        if (backgroundColor.isColor) {
          bgColor = {
            r: backgroundColor.r,
            g: backgroundColor.g,
            b: backgroundColor.b
          };
        }
      }
      
      // 明度計算（相対輝度）
      const getLuminance = (color) => {
        const { r, g, b } = color;
        const rs = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
        const gs = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
        const bs = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
      };
      
      const bgLuminance = getLuminance(bgColor);
      
      // WCAG 2025準拠: 4.5:1以上のコントラスト比を確保
      // 背景が暗い場合は明るい色、明るい場合は暗い色を選択
      if (bgLuminance < 0.5) {
        // 暗い背景: 明るいアクセント色
        return 0x00ff88; // 明るいティール
      } else {
        // 明るい背景: 暗いアクセント色  
        return 0x1a1a2e; // ダークネイビー
      }
    }
    
    /**
     * アダプティブホバー色計算
     */
    getAdaptiveHoverColor() {
      const backgroundColor = this.scene.background;
      let bgColor = { r: 0.5, g: 0.5, b: 0.5 };
      
      if (backgroundColor && backgroundColor.isColor) {
        bgColor = {
          r: backgroundColor.r,
          g: backgroundColor.g,
          b: backgroundColor.b
        };
      }
      
      const getLuminance = (color) => {
        const { r, g, b } = color;
        const rs = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
        const gs = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
        const bs = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
      };
      
      const bgLuminance = getLuminance(bgColor);
      
      if (bgLuminance < 0.5) {
        // 暗い背景: より明るいホバー色
        return 0x00ffff; // シアン
      } else {
        // 明るい背景: より暗いホバー色
        return 0xff3366; // ダークピンク
      }
    }

    /**
     * スケール調整ボタンを作成（Glassmorphism、2025年トレンド）
     */
    createScaleButtons(object) {
      // 既存のボタンがあれば削除
      if (object.userData.scaleButtons) {
        object.userData.scaleButtons.forEach(btn => {
          if (btn.parentNode) btn.parentNode.removeChild(btn);
        });
      }

      const createButton = (text, action) => {
        const button = document.createElement('div');
        button.textContent = text;
        button.style.cssText = `
        position: absolute !important;
        width: 24px !important;
        height: 24px !important;
        background: rgba(0, 0, 0, 0.65) !important;
        border: 1px solid rgba(255, 255, 255, 0.25) !important;
        border-radius: 6px !important;
        color: white !important;
        font-size: 16px !important;
        font-weight: 600 !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        z-index: 999999 !important;
        transition: all 0.2s ease !important;
        user-select: none !important;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3) !important;
        backdrop-filter: blur(12px) !important;
        -webkit-backdrop-filter: blur(12px) !important;
        pointer-events: auto !important;
        opacity: 0.9 !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      `;

        button.addEventListener('mouseenter', () => {
          button.style.background = 'rgba(0, 0, 0, 0.85)';
          button.style.transform = 'scale(1.08)';
          button.style.borderColor = 'rgba(255, 255, 255, 0.4)';
          button.style.opacity = '1';
        });

        button.addEventListener('mouseleave', () => {
          button.style.background = 'rgba(0, 0, 0, 0.65)';
          button.style.transform = 'scale(1.0)';
          button.style.borderColor = 'rgba(255, 255, 255, 0.25)';
          button.style.opacity = '0.9';
        });

        button.addEventListener('click', (e) => {
          e.stopPropagation();
          action();
        });

        document.body.appendChild(button);
        return button;
      };

      const decreaseBtn = createButton('−', () => {
        const currentScale = object.scale.x;
        const newScale = Math.max(0.2, currentScale * 0.9);
        object.scale.setScalar(newScale);
        this.showScaleToast(newScale);
        this.markObjectModified(object, {
          trigger: 'scale-button',
          direction: 'decrease'
        });

        // 拡大縮小中フラグを立てる（位置固定）
        object.userData.isScaling = true;
        if (object.userData.scalingResetTimer) {
          clearTimeout(object.userData.scalingResetTimer);
        }
        object.userData.scalingResetTimer = setTimeout(() => {
          object.userData.isScaling = false;
        }, 1000);

        // ボタンクリック時にタイマーをリセット（連続操作しやすくする）
        if (object.userData.showScaleButtons) {
          object.userData.showScaleButtons();
        }
      });

      const increaseBtn = createButton('+', () => {
        const currentScale = object.scale.x;
        const newScale = Math.min(5.0, currentScale * 1.1);
        object.scale.setScalar(newScale);
        this.showScaleToast(newScale);
        this.markObjectModified(object, {
          trigger: 'scale-button',
          direction: 'increase'
        });

        // 拡大縮小中フラグを立てる（位置固定）
        object.userData.isScaling = true;
        if (object.userData.scalingResetTimer) {
          clearTimeout(object.userData.scalingResetTimer);
        }
        object.userData.scalingResetTimer = setTimeout(() => {
          object.userData.isScaling = false;
        }, 1000);

        // ボタンクリック時にタイマーをリセット（連続操作しやすくする）
        if (object.userData.showScaleButtons) {
          object.userData.showScaleButtons();
        }
      });

      object.userData.scaleButtons = [decreaseBtn, increaseBtn];
      object.userData.updateScaleButtonsPosition = () => {
        this.updateScaleButtonsPosition(object, decreaseBtn, increaseBtn);
      };

      // フェードアウトタイマー管理
      object.userData.showScaleButtons = () => {
        decreaseBtn.style.opacity = '0.9';
        increaseBtn.style.opacity = '0.9';
        decreaseBtn.style.pointerEvents = 'auto';
        increaseBtn.style.pointerEvents = 'auto';

        // 既存のタイマーをクリア
        if (object.userData.scaleButtonFadeTimer) {
          clearTimeout(object.userData.scaleButtonFadeTimer);
        }

        // 3秒後にフェードアウト（2025年トレンド：Zero-UI）
        object.userData.scaleButtonFadeTimer = setTimeout(() => {
          decreaseBtn.style.opacity = '0';
          increaseBtn.style.opacity = '0';
          decreaseBtn.style.pointerEvents = 'none';
          increaseBtn.style.pointerEvents = 'none';
        }, 3000);
      };

      // 初回表示
      object.userData.showScaleButtons();

      this.updateScaleButtonsPosition(object, decreaseBtn, increaseBtn);

      // スケールボタン用の位置更新インターバルを開始（なければ作成）
      if (!this.scaleButtonUpdateInterval) {
        this.scaleButtonUpdateInterval = setInterval(() => {
          this.updateAllScaleButtonsPositions();
        }, 100);
      }
    }

    /**
     * スケールボタンの位置を更新
     */
    updateScaleButtonsPosition(object, decreaseBtn, increaseBtn) {
      if (!this.camera || !this.renderer || !decreaseBtn.parentNode) return;

      // 拡大縮小中は位置を固定（連続クリックしやすくする）
      if (object.userData.isScaling) return;

      const vector = new THREE.Vector3();
      object.getWorldPosition(vector);
      vector.project(this.camera);

      const x = (vector.x * 0.5 + 0.5) * this.renderer.domElement.clientWidth;
      const y = (vector.y * -0.5 + 0.5) * this.renderer.domElement.clientHeight;

      // オブジェクトの右上に配置（音アイコンの下、スケール連動）
      const geometry = object.geometry;
      if (geometry && geometry.parameters) {
        // スケールを考慮したオフセット計算（2025年トレンド：レスポンシブUI）
        const widthInPixels = (geometry.parameters.width * object.scale.x / 2) *
                              (this.renderer.domElement.clientHeight / 20); // 3D→2D変換の概算
        const offsetX = widthInPixels + 20; // オブジェクトの端から20px
        const offsetY = -widthInPixels - 10; // オブジェクトの上から10px

        decreaseBtn.style.left = `${x + offsetX}px`;
        decreaseBtn.style.top = `${y + offsetY + 25}px`; // 音アイコンの下

        increaseBtn.style.left = `${x + offsetX + 30}px`; // decreaseBtnの隣
        increaseBtn.style.top = `${y + offsetY + 25}px`;
      } else {
        // 3Dモデル用：バウンディングボックスからサイズを計算
        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const sizeInPixels = (size.x / 2) * (this.renderer.domElement.clientHeight / 20);
        const offsetX = sizeInPixels + 20;

        decreaseBtn.style.left = `${x + offsetX}px`;
        decreaseBtn.style.top = `${y - sizeInPixels}px`;

        increaseBtn.style.left = `${x + offsetX + 30}px`;
        increaseBtn.style.top = `${y - sizeInPixels}px`;
      }
    }

    /**
     * スケールボタンを削除
     */
    removeScaleButtons(object) {
      if (object.userData.scaleButtons) {
        object.userData.scaleButtons.forEach(btn => {
          if (btn.parentNode) btn.parentNode.removeChild(btn);
        });
        delete object.userData.scaleButtons;
        delete object.userData.updateScaleButtonsPosition;

        // 他にスケールボタンを持つオブジェクトがなければインターバルをクリア
        const hasOtherButtons = Array.from(this.spawnedObjects.values()).some(
          obj => obj !== object && obj.userData.scaleButtons
        );
        if (!hasOtherButtons && this.scaleButtonUpdateInterval) {
          clearInterval(this.scaleButtonUpdateInterval);
          this.scaleButtonUpdateInterval = null;
        }
      }
    }

    /**
     * クリーンアップ
     */
    initializeXRBridge(options = {}) {
      if (this.xr.bridge) {
        return this.xr.bridge;
      }
      if (!this.renderer) {
        console.warn('XRBridge を初期化するには renderer が必要です');
        return null;
      }
      const hasNavigatorXR = typeof navigator !== 'undefined' && navigator.xr;
      if (!hasNavigatorXR) {
        this.xr.supported = { vr: false, ar: false };
        this._updateXRState('unsupported');
        return null;
      }

      this._ensureXRInteractionManager();

      const domOverlayRoot = options.domOverlayRoot || options.domOverlay || null;
      const bridge = new XRBridgeLoader({
        renderer: this.renderer,
        sceneManager: this,
        domOverlayRoot,
        autoResume: this.xr.autoResume
      });

      const handleSupport = async mode => {
        try {
          const supported = await bridge.isSessionSupported(mode);
          this.xr.supported[mode] = supported;
          this._dispatchXREvent('support', { mode, supported });
        } catch (error) {
          this._dispatchXREvent('support:error', { mode, error });
        }
      };

      bridge.addEventListener('installed', () => {
        this._updateXRState('ready');
      });
      bridge.addEventListener('session:start', event => {
        this.xr.mode = event.detail?.mode || null;
        this._updateXRState('active', { mode: this.xr.mode });
        this.clearXRPlacementAnchor();
        const interaction = this._ensureXRInteractionManager();
        if (interaction && event.detail?.session) {
          Promise.resolve(interaction.attachSession(event.detail.session, { mode: this.xr.mode })).catch(error => {
            console.warn('XRInteraction attach failed', error);
          });
        }
      });
      bridge.addEventListener('session:end', () => {
        this.xr.mode = null;
        if (this.xr.interaction) {
          this.xr.interaction.detachSession();
        }
        this.clearXRPlacementAnchor();
        this._updateXRState('idle');
      });
      bridge.addEventListener('session:error', event => {
        if (this.xr.interaction) {
          this.xr.interaction.detachSession();
        }
        this.xr.error = event.detail?.error || null;
        this._updateXRState('error', { mode: event.detail?.mode, error: this.xr.error });
      });
      bridge.addEventListener('loop:error', event => {
        this.xr.error = event.detail?.error || null;
        this._updateXRState('error', { error: this.xr.error });
      });

      try {
        bridge.install();
        this.xr.bridge = bridge;
        handleSupport('vr');
        handleSupport('ar');
      } catch (error) {
        this.xr.error = error;
        this._updateXRState('error', { error });
        console.warn('XRBridge install failed', error);
        return null;
      }

      return bridge;
    }

    onXR(type, handler) {
      if (!handler) return () => {};
      const eventType = this._normalizeXREventType(type);
      this.xr.events.addEventListener(eventType, handler);
      return () => this.xr.events.removeEventListener(eventType, handler);
    }

    setXRAutoResume(enabled) {
      this.xr.autoResume = Boolean(enabled);
      if (this.xr.bridge) {
        this.xr.bridge.setAutoResume(this.xr.autoResume);
      }
      this._dispatchXREvent('autoResume', { enabled: this.xr.autoResume });
    }

    async enterXR(mode = 'vr', options = {}) {
      const bridge = this.xr.bridge || this.initializeXRBridge(options);
      if (!bridge) {
        throw new Error('XRBridge が利用できません');
      }
      this._updateXRState('requesting', { mode });
      try {
        const session = await bridge.enter(mode, options);
        return session;
      } catch (error) {
        this.xr.error = error;
        this._updateXRState('error', { mode, error });
        throw error;
      }
    }

    async exitXR() {
      if (!this.xr.bridge) return;
      await this.xr.bridge.exit();
      this._updateXRState('idle');
    }

    async isSessionSupported(mode = 'vr') {
      if (!this.xr.bridge) {
        if (typeof navigator === 'undefined' || !navigator.xr?.isSessionSupported) {
          return false;
        }
        return navigator.xr.isSessionSupported(mode === 'ar' ? 'immersive-ar' : 'immersive-vr').catch(() => false);
      }
      return this.xr.bridge.isSessionSupported(mode);
    }

    _updateXRState(state, detail = {}) {
      this.xr.status = state;
      if (state !== 'error') {
        this.xr.error = null;
      }
      this._dispatchXREvent('state', { state, ...detail });
    }

    _ensureXRInteractionManager() {
      if (this.xr.interaction || !this.renderer) {
        return this.xr.interaction;
      }
      this.xr.interaction = new XRInteractionManager({
        renderer: this.renderer,
        scene: this.scene,
        sceneManager: this
      });
      return this.xr.interaction;
    }

    _dispatchXREvent(type, detail) {
      this.xr.events.dispatchEvent(new CustomEvent(this._normalizeXREventType(type), { detail }));
    }

    _normalizeXREventType(type) {
      if (type.startsWith('xr:')) {
        return type;
      }
      return `xr:${type}`;
    }

    dispose() {
      this.clearAll();
      if (this.experimentGroup.parent) {
        this.experimentGroup.parent.remove(this.experimentGroup);
      }
      if (this.xr.interaction) {
        this.xr.interaction.detachSession();
      }
    }
  }

  const DEFAULT_STORAGE_KEY = 'chocodrop:onboarding:v2025';
  const ONBOARDING_VERSION = '2025.10';

  class GuidedOnboarding {
    constructor(options = {}) {
      this.options = options;
      this.storageKey = options.storageKey || DEFAULT_STORAGE_KEY;
      this.state = {
        stepIndex: 0,
        persona: null,
        samplePrompt: '',
        hasInsertedPrompt: false
      };
      this.active = false;
      this.hasCompleted = this.getStoredCompletionFlag();

      // Theme system for adaptive glassmorphism
      this.theme = {
        isDark: true,
        brightness: 0
      };

      this.personaOptions = [
        {
          id: 'media-import',
          label: 'メディアインポート',
          icon: { start: '#a855f7', end: '#ec4899', rotation: 28, type: 'import' },
          description: '手元の画像・動画・3D素材をそのまま配置。ショーケースのレイアウト作りにぴったりなモードです。',
          prompt: '中央に飾って',
          mode: 'import'
        },
        {
          id: 'remix-pro',
          label: '雰囲気演出',
          icon: { start: '#38bdf8', end: '#a855f7', rotation: -12, type: 'modify' },
          description: '選択したオブジェクトに自然言語で光と色をまとわせます。ライブ演出の微調整に最適。',
          prompt: '背景の白い光を透明なブルーにして',
          mode: 'modify'
        },
        {
          id: 'atmos-sculpt',
          label: 'ビジュアル生成',
          icon: { start: '#f472b6', end: '#facc15', rotation: 40, type: 'generate' },
          description: '接続した生成サービスで新しいビジュアルやアニメーションを生み出します。壮大なシーンの起点に。',
          prompt: '虹色のガラスで編んだユニコーンのドローンショットの動画を作って',
          mode: 'generate',
          mediaType: 'video'
        },
        {
          id: 'scene-capture',
          label: 'シーン撮影',
          icon: { start: '#60a5fa', end: '#4ade80', rotation: -5, type: 'capture' },
          description: 'WASD操作で少しずつアングルを整え、UIを隠してシネマティックなスクリーンショットを収めます。',
          prompt: '',
          mode: 'capture'
        }
      ];

      this.steps = [
        { id: 'persona', title: 'ChocoDropへようこそ', type: 'choice', icon: '💡', tagline: '作りたいムードを選ぶと、あなたの世界づくりが最短距離になります。' },
        { id: 'service', title: 'サービス接続を整える', type: 'service', icon: '🔗', tagline: '生成サービスの接続状態をチェックして、滞りなく創作を進めましょう。' },
        { id: 'prompt', title: '言葉で世界をデザイン', type: 'prompt', icon: '🖋️', tagline: 'フォームに光を当てながら、シーンを導く言葉を仕上げます。' },
        { id: 'execute', title: 'シーンを動かす', type: 'execute', icon: '🎬', tagline: '準備が整ったら再生。サウンドと光がシーンに息を吹き込みます。' },
        { id: 'next', title: '次のステップ', type: 'next', icon: '🌈', tagline: 'これからもっと遊ぶためのヒントとショートカットをご案内。' }
      ];

      this.backdrop = null;
      this.focusRing = null;
      this.panel = null;
      this.titleEl = null;
      this.bodyEl = null;
      this.primaryButton = null;
      this.secondaryButton = null;
      this.skipButton = null;
      this.closeButton = null;
      this.progressBar = null;
      this.spotlightLayer = null;
      this.focusAuraClass = 'chocodrop-onboarding-focus';
      this.focusAuraStyleId = 'chocodrop-onboarding-style';
      this.focusAuraTargets = new Set();
      this.additionalHighlights = [];
      this.badgeIndicators = {};
      this.stepCompletionStates = {};
      this.completedSteps = new Set();

      this.currentHighlightTarget = null;
      this.updateFocusRingPosition = this.updateFocusRingPosition.bind(this);

      // Detect background brightness before initializing DOM for correct initial colors
      this.detectBackgroundBrightness();
      this.initDom();

      window.addEventListener('resize', this.updateFocusRingPosition);
      window.addEventListener('scroll', this.updateFocusRingPosition, true);
    }

    createPersonaIcon(spec = {}) {
      const {
        start = '#6366f1',
        end = '#a855f7',
        rotation = 0,
        type = 'default'
      } = spec;

      const icon = document.createElement('div');
      icon.style.cssText = `
      width: 36px;
      height: 36px;
      border-radius: 14px;
      background: linear-gradient(${rotation}deg, ${start}, ${end});
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-shadow:
        0 4px 12px rgba(99, 102, 241, 0.35),
        inset 0 1px 0 rgba(255, 255, 255, 0.35);
    `;

      const svg = this.createPersonaGlyph(type);
      if (svg) {
        icon.appendChild(svg);
      }

      return icon;
    }

    createPersonaGlyph(type) {
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('width', '20');
      svg.setAttribute('height', '20');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'white');
      svg.setAttribute('stroke-width', '1.6');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.style.filter = 'drop-shadow(0 3px 6px rgba(255,255,255,0.2))';

      const addPath = (d, attrs = {}) => {
        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', d);
        Object.entries(attrs).forEach(([key, value]) => path.setAttribute(key, value));
        svg.appendChild(path);
      };

      switch (type) {
        case 'import':
          addPath('M12 3v10');
          addPath('M8 9l4 4 4-4');
          addPath('M5 17h14');
          addPath('M7 21h10', { 'stroke-width': '1.2' });
          break;
        case 'modify':
          addPath('M7 17v3');
          addPath('M7 15l9-9c.83-.83 2.17-.83 3 0v0c.83.83.83 2.17 0 3l-9 9H7z');
          addPath('M12 6l6 6', { 'stroke-width': '1.1' });
          break;
        case 'generate':
          addPath('M12 4l1.76 4.27L18.5 9l-3.25 3.08L16 16.5 12 14.5 8 16.5l.75-4.42L5.5 9l4.74-.73L12 4z');
          break;
        case 'capture':
          addPath('M4 8h2l1.2-2.4A2 2 0 0 1 9 4h6a2 2 0 0 1 1.8 1.04L18 8h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z', { 'stroke-width': '1.2' });
          addPath('M12 10.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z');
          break;
        default:
          addPath('M6 6h12v12H6z', { 'stroke-width': '1.2' });
          addPath('M9 9h6v6H9z');
          break;
      }

      return svg;
    }

    /**
     * Detect background brightness from 3JS canvas or body background
     * Returns brightness value 0-255 and updates theme
     */
    detectBackgroundBrightness() {
      try {
        // Try to get brightness from 3JS canvas
        const canvas = document.querySelector('canvas');
        if (canvas) {
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            // Sample a few pixels from the center
            const centerX = Math.floor(canvas.width / 2);
            const centerY = Math.floor(canvas.height / 2);
            const imageData = ctx.getImageData(centerX - 10, centerY - 10, 20, 20);
            const data = imageData.data;

            let totalBrightness = 0;
            let pixelCount = 0;

            for (let i = 0; i < data.length; i += 4) {
              const r = data[i];
              const g = data[i + 1];
              const b = data[i + 2];
              // Calculate relative luminance
              const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
              totalBrightness += brightness;
              pixelCount++;
            }

            const avgBrightness = totalBrightness / pixelCount;
            this.theme.brightness = avgBrightness;
            this.theme.isDark = avgBrightness < 128;
            return;
          }
        }

        // Fallback: use body background color
        const bodyBg = window.getComputedStyle(document.body).backgroundColor;
        const rgb = bodyBg.match(/\d+/g);
        if (rgb && rgb.length >= 3) {
          const brightness = 0.299 * parseInt(rgb[0]) + 0.587 * parseInt(rgb[1]) + 0.114 * parseInt(rgb[2]);
          this.theme.brightness = brightness;
          this.theme.isDark = brightness < 128;
        }
      } catch (e) {
        // Default to dark theme if detection fails
        this.theme.brightness = 50;
        this.theme.isDark = true;
      }
    }

    /**
     * Get adaptive colors based on background brightness
     */
    getAdaptiveColors() {
      const isDark = this.theme.isDark;
      return {
        // Panel background
        panelBg: isDark
          ? 'rgba(15, 23, 42, 0.75)'
          : 'rgba(255, 255, 255, 0.75)',
        panelBgGradient: isDark
          ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.85) 0%, rgba(30, 41, 59, 0.85) 50%, rgba(51, 65, 85, 0.8) 100%)'
          : 'linear-gradient(135deg, rgba(255, 255, 255, 0.85) 0%, rgba(248, 250, 252, 0.85) 50%, rgba(241, 245, 249, 0.8) 100%)',

        // Text colors
        textPrimary: isDark ? 'rgba(248, 250, 252, 0.95)' : 'rgba(15, 23, 42, 0.95)',
        textSecondary: isDark ? 'rgba(226, 232, 240, 0.8)' : 'rgba(51, 65, 85, 0.8)',

        // Border and glow
        border: isDark
          ? 'rgba(255, 255, 255, 0.18)'
          : 'rgba(148, 163, 184, 0.3)',
        borderAccent: isDark
          ? 'rgba(168, 85, 247, 0.4)'
          : 'rgba(139, 92, 246, 0.4)',
        glow: isDark
          ? 'rgba(168, 85, 247, 0.25)'
          : 'rgba(139, 92, 246, 0.2)',

        // Button colors
        buttonBg: 'linear-gradient(135deg, #a78bfa 0%, #c084fc 50%, #e879f9 100%)',
        buttonHoverGlow: isDark
          ? 'rgba(168, 85, 247, 0.5)'
          : 'rgba(139, 92, 246, 0.4)',

        // Card colors
        cardBg: isDark
          ? 'rgba(30, 41, 59, 0.4)'
          : 'rgba(255, 255, 255, 0.5)',
        cardBorder: isDark
          ? 'rgba(255, 255, 255, 0.15)'
          : 'rgba(148, 163, 184, 0.25)',
        cardSelectedBg: isDark
          ? 'rgba(168, 85, 247, 0.2)'
          : 'rgba(139, 92, 246, 0.15)',
        cardSelectedBorder: isDark
          ? 'rgba(168, 85, 247, 0.6)'
          : 'rgba(139, 92, 246, 0.5)',

        // Focus ring
        focusRing: isDark
          ? 'rgba(168, 85, 247, 0.8)'
          : 'rgba(139, 92, 246, 0.7)',
        focusGlow: isDark
          ? 'rgba(168, 85, 247, 0.3)'
          : 'rgba(139, 92, 246, 0.25)'
      };
    }

    getStoredCompletionFlag() {
      try {
        const raw = window.localStorage?.getItem(this.storageKey);
        if (!raw) {
          return false;
        }
        const parsed = JSON.parse(raw);
        return parsed?.completed === true && parsed?.version === ONBOARDING_VERSION;
      } catch (_) {
        return false;
      }
    }

    storeCompletion(meta = {}) {
      try {
        const payload = {
          completed: true,
          version: ONBOARDING_VERSION,
          completedAt: new Date().toISOString(),
          persona: this.state.persona,
          stepCompletionStates: this.stepCompletionStates,
          ...meta
        };
        window.localStorage?.setItem(this.storageKey, JSON.stringify(payload));
      } catch (_) {
        // ストレージが使えない環境では黙って継続
      }
    }

    loadProgressFromStorage() {
      try {
        const raw = window.localStorage?.getItem(this.storageKey);
        if (!raw) {
          return;
        }
        const parsed = JSON.parse(raw);
        if (parsed?.version !== ONBOARDING_VERSION) {
          return;
        }
        if (parsed?.stepCompletionStates && typeof parsed.stepCompletionStates === 'object') {
          this.stepCompletionStates = parsed.stepCompletionStates;
          Object.entries(this.stepCompletionStates).forEach(([stepId, state]) => {
            this.updateBadgeState(stepId, state);
          });
        }
      } catch (error) {
        console.warn('Failed to restore onboarding progress:', error);
      }
    }

    registerLauncher(element) {
      if (!element) return;
      element.addEventListener('click', () => this.start({ force: true }));
    }

    initDom() {
      const colors = this.getAdaptiveColors();

      if (!document.getElementById('chocodrop-onboarding-gamify-style')) {
        const style = document.createElement('style');
        style.id = 'chocodrop-onboarding-gamify-style';
        style.textContent = `
        .chocodrop-badge-row {
          display: flex;
          gap: 10px;
          align-items: center;
          margin-top: 6px;
          flex-wrap: wrap;
        }
        .chocodrop-badge {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 600;
          color: rgba(255,255,255,0.65);
          background: rgba(148, 163, 184, 0.2);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.25);
          transition: transform 0.35s ease, box-shadow 0.35s ease, color 0.35s ease;
          position: relative;
        }
        .chocodrop-badge.completed {
          color: rgba(255,255,255,0.95);
          transform: scale(1.08);
          box-shadow: 0 0 0 1px rgba(236, 72, 153, 0.35), 0 12px 26px rgba(236, 72, 153, 0.28);
        }
        .chocodrop-badge.completed::after {
          content: '✔';
          font-size: 10px;
          position: absolute;
          bottom: -6px;
          right: -4px;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: linear-gradient(135deg, #f472b6, #c084fc);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 10px rgba(236, 72, 153, 0.35);
        }
        .chocodrop-badge.skipped {
          opacity: 0.5;
          box-shadow: inset 0 1px 0 rgba(148, 163, 184, 0.2);
        }
        .chocodrop-confetti {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: visible;
          z-index: 6;
        }
        .chocodrop-confetti span {
          position: absolute;
          width: 6px;
          height: 14px;
          border-radius: 2px;
          opacity: 0;
          animation: chocodropConfetti 0.9s ease-out forwards;
        }
        @keyframes chocodropConfetti {
          0% { transform: translate3d(0,0,0) rotate(0deg); opacity: 0; }
          15% { opacity: 1; }
          100% { transform: translate3d(var(--x), var(--y), 0) rotate(var(--r)); opacity: 0; }
        }
      `;
        document.head.appendChild(style);
      }

      if (!document.getElementById(this.focusAuraStyleId)) {
        const focusStyle = document.createElement('style');
        focusStyle.id = this.focusAuraStyleId;
        focusStyle.textContent = `
        .${this.focusAuraClass} {
          position: relative;
          border-radius: 18px !important;
          box-shadow:
            0 0 0 2px rgba(236, 72, 153, 0.32),
            0 18px 36px rgba(192, 132, 252, 0.22),
            0 0 38px rgba(236, 72, 153, 0.2);
          transition: box-shadow 0.35s ease, transform 0.35s ease, filter 0.35s ease;
          filter: saturate(1.1) brightness(1.02);
        }

        .${this.focusAuraClass}::after {
          content: '';
          position: absolute;
          inset: -8px;
          border-radius: inherit;
          pointer-events: none;
          background: radial-gradient(circle at 50% 0%, rgba(236, 72, 153, 0.25), transparent 65%);
          opacity: 0.75;
          transition: opacity 0.35s ease;
        }

        .${this.focusAuraClass}:focus-visible {
          outline: none;
        }
      `;
        document.head.appendChild(focusStyle);
      }

      this.backdrop = document.createElement('div');
      this.backdrop.id = 'chocodrop-onboarding';
      this.backdrop.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 1600;
      display: none;
      pointer-events: none;
      background: transparent;
      transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      opacity: 0;
    `;

      this.spotlightLayer = document.createElement('div');
      this.spotlightLayer.style.cssText = `
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 0;
      transition: background 0.35s cubic-bezier(0.4, 0, 0.2, 1);
      background: ${this.computeSpotlightGradient(null)};
    `;

      this.focusRing = document.createElement('div');
      this.focusRing.style.cssText = `
      position: fixed;
      pointer-events: none;
      border: 3px solid ${colors.focusRing};
      box-shadow:
        0 0 0 1px ${colors.border},
        0 0 32px ${colors.focusGlow},
        0 20px 50px ${colors.focusGlow},
        inset 0 0 0 1px rgba(255, 255, 255, 0.1);
      border-radius: 24px;
      opacity: 0;
      transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
      z-index: 1;
    `;

      const panelWrapper = document.createElement('div');
      panelWrapper.style.cssText = `
      position: fixed;
      bottom: 28px;
      left: 50%;
      transform: translateX(-50%);
      max-width: min(420px, 92vw);
      pointer-events: auto;
      z-index: 2;
    `;

      this.panel = document.createElement('div');
      this.panel.style.cssText = `
      position: relative;
      background: ${colors.panelBgGradient};
      color: ${colors.textPrimary};
      border-radius: 28px;
      padding: 28px 26px;
      box-shadow:
        0 0 0 1px ${colors.border},
        0 4px 16px ${colors.glow},
        0 24px 48px rgba(0, 0, 0, 0.2),
        0 48px 80px rgba(0, 0, 0, 0.15),
        inset 0 1px 0 rgba(255, 255, 255, 0.1),
        inset 0 -1px 0 rgba(0, 0, 0, 0.1);
      backdrop-filter: blur(32px) saturate(180%);
      -webkit-backdrop-filter: blur(32px) saturate(180%);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', sans-serif;
      display: flex;
      flex-direction: column;
      gap: 20px;
      box-sizing: border-box;
      max-height: calc(100dvh - 56px);
      overflow-y: auto;
      overscroll-behavior: contain;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    `;

      // Add subtle animated gradient overlay for depth
      const glassOverlay = document.createElement('div');
      glassOverlay.style.cssText = `
      position: absolute;
      inset: 0;
      border-radius: 28px;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, transparent 50%, rgba(0, 0, 0, 0.02) 100%);
      pointer-events: none;
      z-index: 1;
    `;
      this.panel.appendChild(glassOverlay);

      const header = document.createElement('div');
      header.style.cssText = 'display: flex; flex-direction: column; gap: 10px; position: relative; z-index: 2; padding-right: 140px;';

      const titleRow = document.createElement('div');
      titleRow.style.cssText = 'display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding-right: 8px;';

      this.titleEl = document.createElement('h3');
      this.titleEl.style.cssText = `
      margin: 0;
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.01em;
      background: linear-gradient(135deg, ${colors.textPrimary} 0%, ${colors.textSecondary} 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      flex: 1;
    `;

      this.progressIndicator = document.createElement('div');
      this.progressIndicator.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 600;
      color: ${colors.textSecondary};
      opacity: 0.85;
      white-space: nowrap;
    `;
      this.progressIcon = document.createElement('span');
      this.progressIcon.style.cssText = `font-size: 14px; line-height: 1;`;

      this.progressLabel = document.createElement('span');
      this.progressLabel.style.cssText = `letter-spacing: 0.02em;`;

      this.progressCount = document.createElement('span');
      this.progressCount.style.cssText = `opacity: 0.7; font-variant-numeric: tabular-nums;`;

      this.progressIndicator.appendChild(this.progressIcon);
      this.progressIndicator.appendChild(this.progressLabel);
      this.progressIndicator.appendChild(this.progressCount);

      titleRow.appendChild(this.titleEl);
      titleRow.appendChild(this.progressIndicator);

      this.subtitleEl = document.createElement('p');
      this.subtitleEl.style.cssText = `
      margin: 0;
      font-size: 13px;
      font-weight: 500;
      color: ${colors.textSecondary};
      opacity: 0.85;
      letter-spacing: 0.01em;
    `;

      this.badgeRow = document.createElement('div');
      this.badgeRow.className = 'chocodrop-badge-row';

      this.progressBar = document.createElement('div');
      this.progressBar.style.cssText = `
      position: relative;
      width: 100%;
      height: 6px;
      border-radius: 999px;
      background: ${this.theme.isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'};
      overflow: hidden;
      box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.2);
    `;

      this.progressValue = document.createElement('div');
      this.progressValue.style.cssText = `
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #a78bfa 0%, #c084fc 50%, #e879f9 100%);
      border-radius: 999px;
      transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 0 12px rgba(168, 85, 247, 0.5);
      position: relative;
      overflow: hidden;
    `;

      // Add shimmer effect to progress bar
      const shimmer = document.createElement('div');
      shimmer.style.cssText = `
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.3) 50%, transparent 100%);
      animation: shimmer 2s infinite;
    `;
      this.progressValue.appendChild(shimmer);

      // Add shimmer animation
      const style = document.createElement('style');
      style.textContent = `
      @keyframes shimmer {
        0% { left: -100%; }
        100% { left: 200%; }
      }
    `;
      if (!document.getElementById('chocodrop-shimmer-style')) {
        style.id = 'chocodrop-shimmer-style';
        document.head.appendChild(style);
      }

      this.progressBar.appendChild(this.progressValue);

      header.appendChild(titleRow);
      header.appendChild(this.subtitleEl);
      header.appendChild(this.badgeRow);
      header.appendChild(this.progressBar);
      this.subtitleEl.textContent = this.steps[0]?.tagline || '';
      this.progressIcon.textContent = this.steps[0]?.icon || '💡';
      this.progressLabel.textContent = 'ムード選択';
      this.progressCount.textContent = '1/4';

      this.initializeBadges();

      const bodyWrapper = document.createElement('div');
      bodyWrapper.style.cssText = 'display: flex; flex-direction: column; gap: 14px; position: relative; z-index: 2;';
      this.bodyEl = document.createElement('div');
      this.bodyEl.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 14px;
      font-size: 15px;
      line-height: 1.6;
      color: ${colors.textSecondary};
    `;
      bodyWrapper.appendChild(this.bodyEl);

      const buttonRow = document.createElement('div');
      buttonRow.style.cssText = 'display: flex; gap: 12px; align-items: center; justify-content: flex-end; flex-wrap: wrap; position: relative; z-index: 2;';

      this.primaryButton = document.createElement('button');
      this.primaryButton.type = 'button';
      this.primaryButton.style.cssText = `
      position: relative;
      padding: 12px 24px;
      border-radius: 16px;
      border: none;
      font-weight: 700;
      cursor: pointer;
      font-size: 15px;
      background: ${colors.buttonBg};
      color: #ffffff;
      box-shadow:
        0 0 0 1px rgba(255, 255, 255, 0.2),
        0 4px 12px rgba(168, 85, 247, 0.3),
        0 12px 32px rgba(168, 85, 247, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.3);
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      overflow: hidden;
    `;

      // Add button hover glow effect
      const buttonGlow = document.createElement('div');
      buttonGlow.style.cssText = `
      position: absolute;
      inset: -2px;
      border-radius: 16px;
      background: radial-gradient(circle at center, ${colors.buttonHoverGlow} 0%, transparent 70%);
      opacity: 0;
      transition: opacity 0.25s ease;
      pointer-events: none;
    `;
      this.primaryButton.appendChild(buttonGlow);

      const buttonText = document.createElement('span');
      buttonText.style.cssText = 'position: relative; z-index: 1;';
      this.primaryButton.appendChild(buttonText);

      this.primaryButton.addEventListener('mouseenter', () => {
        this.primaryButton.style.transform = 'translateY(-2px) scale(1.02)';
        this.primaryButton.style.boxShadow = `
        0 0 0 1px rgba(255, 255, 255, 0.3),
        0 8px 20px rgba(168, 85, 247, 0.4),
        0 20px 48px rgba(168, 85, 247, 0.3),
        inset 0 1px 0 rgba(255, 255, 255, 0.4)
      `;
        buttonGlow.style.opacity = '1';
      });
      this.primaryButton.addEventListener('mouseleave', () => {
        this.primaryButton.style.transform = 'translateY(0) scale(1)';
        this.primaryButton.style.boxShadow = `
        0 0 0 1px rgba(255, 255, 255, 0.2),
        0 4px 12px rgba(168, 85, 247, 0.3),
        0 12px 32px rgba(168, 85, 247, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.3)
      `;
        buttonGlow.style.opacity = '0';
      });
      this.primaryButton.addEventListener('mousedown', () => {
        this.primaryButton.style.transform = 'translateY(0) scale(0.98)';
      });
      this.primaryButton.addEventListener('mouseup', () => {
        this.primaryButton.style.transform = 'translateY(-2px) scale(1.02)';
      });

      this.secondaryButton = document.createElement('button');
      this.secondaryButton.type = 'button';
      this.secondaryButton.style.cssText = `
      padding: 10px 18px;
      border-radius: 14px;
      border: 1.5px solid ${colors.border};
      background: ${this.theme.isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'};
      color: ${colors.textSecondary};
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      display: none;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    `;
      this.secondaryButton.addEventListener('mouseenter', () => {
        this.secondaryButton.style.background = this.theme.isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)';
        this.secondaryButton.style.borderColor = colors.borderAccent;
        this.secondaryButton.style.transform = 'translateY(-1px)';
        this.secondaryButton.style.boxShadow = `0 4px 12px ${colors.glow}`;
      });
      this.secondaryButton.addEventListener('mouseleave', () => {
        this.secondaryButton.style.background = this.theme.isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)';
        this.secondaryButton.style.borderColor = colors.border;
        this.secondaryButton.style.transform = 'translateY(0)';
        this.secondaryButton.style.boxShadow = 'none';
      });

      // 戻るボタンを追加
      this.backButton = document.createElement('button');
      this.backButton.type = 'button';
      this.backButton.textContent = '← 戻る';
      this.backButton.style.cssText = `
      padding: 10px 18px;
      border-radius: 14px;
      border: 1.5px solid ${colors.border};
      background: ${this.theme.isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'};
      color: ${colors.textSecondary};
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      display: none;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      margin-right: auto;
    `;
      this.backButton.addEventListener('mouseenter', () => {
        this.backButton.style.background = this.theme.isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)';
        this.backButton.style.borderColor = colors.borderAccent;
        this.backButton.style.transform = 'translateY(-1px)';
        this.backButton.style.boxShadow = `0 4px 12px ${colors.glow}`;
      });
      this.backButton.addEventListener('mouseleave', () => {
        this.backButton.style.background = this.theme.isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)';
        this.backButton.style.borderColor = colors.border;
        this.backButton.style.transform = 'translateY(0)';
        this.backButton.style.boxShadow = 'none';
      });
      this.backButton.onclick = () => this.previousStep();

      buttonRow.appendChild(this.backButton);
      buttonRow.appendChild(this.secondaryButton);
      buttonRow.appendChild(this.primaryButton);
      const controlsContainer = document.createElement('div');
      controlsContainer.style.cssText = `
      position: absolute;
      top: 16px;
      right: 20px;
      display: flex;
      gap: 8px;
      align-items: center;
      z-index: 4;
    `;

      this.closeButton = document.createElement('button');
      this.closeButton.type = 'button';
      this.closeButton.setAttribute('aria-label', 'ガイドを閉じる');
      this.closeButton.innerHTML = '&times;';
      this.closeButton.style.cssText = `
      width: 32px;
      height: 32px;
      border-radius: 10px;
      border: 1.5px solid ${colors.border};
      background: ${this.theme.isDark ? 'rgba(15, 23, 42, 0.45)' : 'rgba(241, 245, 249, 0.45)'};
      color: ${colors.textSecondary};
      font-size: 18px;
      font-weight: 600;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s ease;
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      box-shadow: none;
    `;
      this.closeButton.addEventListener('mouseenter', () => {
        this.closeButton.style.borderColor = colors.borderAccent;
        this.closeButton.style.color = colors.textPrimary;
        this.closeButton.style.boxShadow = `0 6px 16px ${colors.glow}`;
      });
      this.closeButton.addEventListener('mouseleave', () => {
        this.closeButton.style.borderColor = colors.border;
        this.closeButton.style.color = colors.textSecondary;
        this.closeButton.style.boxShadow = 'none';
      });
      this.closeButton.addEventListener('click', () => this.complete('dismissed'));

      this.skipButton = document.createElement('button');
      this.skipButton.type = 'button';
      this.skipButton.textContent = 'スキップ';
      this.skipButton.setAttribute('aria-label', 'このページをスキップ');
      this.skipButton.title = 'このページをスキップして次へ進みます';
      this.skipButton.style.cssText = `
      border: none;
      padding: 8px 14px;
      border-radius: 12px;
      background: ${this.theme.isDark ? 'rgba(148, 163, 184, 0.14)' : 'rgba(148, 163, 184, 0.12)'};
      color: ${colors.textSecondary};
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      opacity: 0.85;
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
    `;
      this.skipButton.addEventListener('mouseenter', () => {
        this.skipButton.style.opacity = '1';
        this.skipButton.style.background = this.theme.isDark
          ? 'rgba(168, 85, 247, 0.16)'
          : 'rgba(139, 92, 246, 0.16)';
        this.skipButton.style.color = colors.textPrimary;
      });
      this.skipButton.addEventListener('mouseleave', () => {
        this.skipButton.style.opacity = '0.85';
        this.skipButton.style.background = this.theme.isDark
          ? 'rgba(148, 163, 184, 0.14)'
          : 'rgba(148, 163, 184, 0.12)';
        this.skipButton.style.color = colors.textSecondary;
      });
      this.skipButton.addEventListener('click', () => this.skipStep());

      controlsContainer.appendChild(this.skipButton);
      controlsContainer.appendChild(this.closeButton);

      this.panel.appendChild(controlsContainer);
      this.panel.appendChild(header);
      this.panel.appendChild(bodyWrapper);
      this.panel.appendChild(buttonRow);

      panelWrapper.appendChild(this.panel);
      this.backdrop.appendChild(this.spotlightLayer);
      this.backdrop.appendChild(this.focusRing);
      this.backdrop.appendChild(panelWrapper);

      document.body.appendChild(this.backdrop);
    }

    shouldStartAutomatically() {
      return !this.hasCompleted;
    }

    start(options = {}) {
      const force = options.force === true;
      if (!force && !this.shouldStartAutomatically()) {
        return;
      }

      if (this.active) {
        return;
      }

      this.active = true;
      this.state.stepIndex = 0;
      this.state.persona = null;
      this.state.samplePrompt = '';
      this.state.hasInsertedPrompt = false;
      this.resetBadgeStates();
      this.loadProgressFromStorage();

      // Re-detect background brightness when starting
      this.detectBackgroundBrightness();

      if (this.spotlightLayer) {
        this.spotlightLayer.style.background = this.computeSpotlightGradient(null);
      }

      if (typeof this.options.onRequestShow === 'function') {
        this.options.onRequestShow();
      }

      this.backdrop.style.display = 'block';

      // Add entrance animation for panel
      const panelWrapper = this.panel.parentElement;
      if (panelWrapper) {
        panelWrapper.style.transform = 'translateX(-50%) translateY(60px)';
        panelWrapper.style.opacity = '0';
      }

      requestAnimationFrame(() => {
        this.backdrop.style.opacity = '1';

        setTimeout(() => {
          if (panelWrapper) {
            panelWrapper.style.transition = 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
            panelWrapper.style.transform = 'translateX(-50%) translateY(0)';
            panelWrapper.style.opacity = '1';
          }
          this.renderCurrentStep();
        }, 100);
      });
    }

    renderCurrentStep() {
      if (!this.active) {
        return;
      }

      const step = this.steps[this.state.stepIndex];
      if (!step) {
        this.complete();
        return;
      }

      // サービス接続ステップをスキップする条件：
      // - importモード（ファイルインポートのみ）
      // - modifyモード（選択オブジェクト変更のみ）
      // - deleteモード（削除のみ）
      const selectedPersona = this.personaOptions.find(p => p.id === this.state.persona);
      const needsServiceConnection = selectedPersona?.mode === 'generate';

      if (step.type === 'service' && !needsServiceConnection) {
        // サービス接続が不要な場合はステップをスキップ
        this.handleStepCompletion(step.id, { skipped: true });
        this.state.stepIndex += 1;
        this.renderCurrentStep();
        return;
      }

      this.updateTopControls();

      const colors = this.getAdaptiveColors();
      const headerMeta = this.getStepMeta(step, selectedPersona);
      const progressState = this.calculateProgress(step.id, needsServiceConnection);

      this.titleEl.textContent = headerMeta.title;

      if (this.subtitleEl) {
        this.subtitleEl.style.color = colors.textSecondary;
        if (headerMeta.tagline) {
          this.subtitleEl.textContent = headerMeta.tagline;
          this.subtitleEl.style.display = 'block';
        } else {
          this.subtitleEl.textContent = '';
          this.subtitleEl.style.display = 'none';
        }
      }

      const progressPercentage = Math.min(100, (progressState.currentStep / progressState.totalSteps) * 100);
      this.progressValue.style.width = `${progressPercentage}%`;

      this.updateProgressIndicator({
        currentStep: progressState.currentStep,
        totalSteps: progressState.totalSteps,
        icon: headerMeta.icon,
        label: headerMeta.progressLabel
      });

      this.bodyEl.innerHTML = '';
      this.currentHighlightTarget = null;
      this.setAdditionalHighlights([]);
      this.updateFocusRingPosition();
      this.secondaryButton.style.display = 'none';
      this.secondaryButton.textContent = '';
      this.secondaryButton.onclick = null;

      // 戻るボタンの表示制御（最初のステップでは非表示）
      if (this.state.stepIndex > 0) {
        this.backButton.style.display = 'inline-flex';
      } else {
        this.backButton.style.display = 'none';
      }

      switch (step.type) {
        case 'choice':
          this.renderPersonaStep();
          break;
        case 'service':
          this.renderServiceStep();
          break;
        case 'prompt':
          this.renderPromptStep();
          break;
        case 'execute':
          this.renderExecuteStep();
          break;
        case 'next':
        default:
          this.renderNextStep();
          break;
      }

      this.updateFocusRing();
    }

    renderPersonaStep() {
      const colors = this.getAdaptiveColors();

      const intro = document.createElement('p');
      intro.style.cssText = `margin: 0; color: ${colors.textSecondary}; line-height: 1.6;`;
      intro.textContent = '最初に灯したいムードを選びましょう。カードをクリックすると、おすすめのフローが展開されます。';
      this.bodyEl.appendChild(intro);

      const grid = document.createElement('div');
      grid.style.cssText = 'display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));';

      this.personaOptions.forEach(option => {
        const card = document.createElement('button');
        card.type = 'button';
        card.dataset.persona = option.id;

        const isSelected = this.state.persona === option.id;
        card.style.cssText = `
        position: relative;
        text-align: left;
        border-radius: 18px;
        border: 2px solid ${isSelected ? colors.cardSelectedBorder : colors.cardBorder};
        background: ${isSelected ? colors.cardSelectedBg : colors.cardBg};
        color: inherit;
        padding: 16px 14px;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        display: flex;
        flex-direction: column;
        gap: 10px;
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        box-shadow: ${isSelected
          ? `0 0 0 1px ${colors.cardSelectedBorder}, 0 8px 24px ${colors.glow}, 0 16px 48px ${colors.glow}`
          : `0 2px 8px rgba(0, 0, 0, 0.1)`
        };
        overflow: hidden;
      `;

        // Add card glow overlay
        const cardGlow = document.createElement('div');
        cardGlow.style.cssText = `
        position: absolute;
        inset: 0;
        border-radius: 18px;
        background: linear-gradient(135deg, rgba(168, 85, 247, 0.1) 0%, transparent 100%);
        opacity: ${isSelected ? '1' : '0'};
        transition: opacity 0.3s ease;
        pointer-events: none;
      `;
        card.appendChild(cardGlow);

        card.addEventListener('mouseenter', () => {
          card.style.transform = 'translateY(-4px) scale(1.02)';
          if (!isSelected) {
            card.style.borderColor = colors.borderAccent;
            card.style.boxShadow = `0 0 0 1px ${colors.borderAccent}, 0 8px 20px ${colors.glow}`;
            cardGlow.style.opacity = '0.5';
          }
        });
        card.addEventListener('mouseleave', () => {
          card.style.transform = 'translateY(0) scale(1)';
          if (!isSelected) {
            card.style.borderColor = colors.cardBorder;
            card.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
            cardGlow.style.opacity = '0';
          }
        });

        card.addEventListener('click', () => {
          this.state.persona = option.id;
          this.state.samplePrompt = option.prompt;
          this.state.hasInsertedPrompt = false;
          const supportedModes = ['generate', 'import', 'modify', 'delete'];
          if (typeof this.options.onSelectMode === 'function' && supportedModes.includes(option.mode)) {
            try {
              this.options.onSelectMode(option.mode);
            } catch (error) {
              console.warn('Select mode handler failed:', error);
            }
          }

          // Update all cards
          Array.from(grid.children).forEach(child => {
            const childGlow = child.querySelector('div');
            child.style.border = `2px solid ${colors.cardBorder}`;
            child.style.background = colors.cardBg;
            child.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
            if (childGlow) {
              childGlow.style.opacity = '0';
            }
          });

          // Update selected card
          card.style.border = `2px solid ${colors.cardSelectedBorder}`;
          card.style.background = colors.cardSelectedBg;
          card.style.boxShadow = `0 0 0 1px ${colors.cardSelectedBorder}, 0 8px 24px ${colors.glow}, 0 16px 48px ${colors.glow}`;
          cardGlow.style.opacity = '1';

          // Update button
          this.primaryButton.disabled = false;
          this.primaryButton.style.opacity = '1';
          const buttonTextSpan = this.primaryButton.querySelector('span');
          if (buttonTextSpan) {
            buttonTextSpan.textContent = '次へ';
          }

          // ペルソナに対応するモードボタンをハイライト（ボタン有効化後に実行）
          // TEMPORARILY DISABLED: This was causing persona selection to fail
          // setTimeout(() => {
          //   this.highlightModeButton(option.mode);
          // }, 0);
        });

        const title = document.createElement('div');
        title.style.cssText = `
        font-weight: 700;
        font-size: 15px;
        display: flex;
        align-items: center;
        gap: 10px;
        color: ${colors.textPrimary};
        position: relative;
        z-index: 1;
      `;

        const iconEl = this.createPersonaIcon(option.icon);
        iconEl.style.flexShrink = '0';

        const labelSpan = document.createElement('span');
        labelSpan.textContent = option.label;

        title.appendChild(iconEl);
        title.appendChild(labelSpan);

        const desc = document.createElement('div');
        desc.style.cssText = `
        font-size: 13px;
        line-height: 1.5;
        opacity: 0.85;
        color: ${colors.textSecondary};
        position: relative;
        z-index: 1;
      `;
        desc.textContent = option.description;

        card.appendChild(title);
        card.appendChild(desc);
        grid.appendChild(card);
      });

      this.bodyEl.appendChild(grid);

      const buttonTextSpan = this.primaryButton.querySelector('span');
      if (buttonTextSpan) {
        buttonTextSpan.textContent = this.state.persona ? '次へ' : '選択してください';
      }
      this.primaryButton.disabled = !this.state.persona;
      this.primaryButton.style.opacity = this.state.persona ? '1' : '0.6';
      this.primaryButton.style.cursor = this.state.persona ? 'pointer' : 'not-allowed';
      this.primaryButton.onclick = () => this.nextStep();

      this.secondaryButton.style.display = 'inline-flex';
      this.secondaryButton.textContent = '後で決める';
      this.secondaryButton.onclick = () => {
        this.state.persona = null;
        this.state.samplePrompt = '';
        this.nextStep();
      };

      this.currentHighlightTarget = typeof this.options.modeContainer === 'function'
        ? this.options.modeContainer()
        : this.options.modeContainer || null;
    }

    renderServiceStep() {
      const colors = this.getAdaptiveColors();
      const selectedPersona = this.personaOptions.find(p => p.id === this.state.persona);
      const isVideoMode = selectedPersona?.mediaType === 'video';
      const isImageMode = selectedPersona?.mediaType === 'image';

      const description = document.createElement('div');

      if (isVideoMode) {
        description.innerHTML = `
        <p style="margin:0; color:${colors.textSecondary}; line-height:1.6;">動画生成には動画サービスの接続が必須です。⚙️ボタンから設定してください。</p>
        <ul style="margin:12px 0 0 20px; padding:0; font-size:14px; line-height:1.7; opacity:0.85; color:${colors.textSecondary};">
          <li style="margin-bottom:6px;">⚙️ボタンをクリック → 動画サービスタブを選択</li>
          <li style="margin-bottom:6px;">空きリソースのサービスを選択して保存</li>
          <li>入力欄の下に接続ステータスが表示されます</li>
        </ul>
      `;
      } else if (isImageMode) {
        description.innerHTML = `
        <p style="margin:0; color:${colors.textSecondary}; line-height:1.6;">画像生成には画像サービスの接続が必須です。⚙️ボタンから設定してください。</p>
        <ul style="margin:12px 0 0 20px; padding:0; font-size:14px; line-height:1.7; opacity:0.85; color:${colors.textSecondary};">
          <li style="margin-bottom:6px;">⚙️ボタンをクリック → 画像サービスタブを選択</li>
          <li style="margin-bottom:6px;">空きリソースのサービスを選択して保存</li>
          <li>入力欄の下に接続ステータスが表示されます</li>
        </ul>
      `;
      } else {
        description.innerHTML = `
        <p style="margin:0; color:${colors.textSecondary}; line-height:1.6;">画像・動画サービスが未設定の場合は、⚙️の設定ボタンから接続を完了してください。</p>
        <ul style="margin:12px 0 0 20px; padding:0; font-size:14px; line-height:1.7; opacity:0.85; color:${colors.textSecondary};">
          <li style="margin-bottom:6px;">候補の中から空きリソースのサービスを選択</li>
          <li>保存後、入力欄の下にステータスが表示されます</li>
        </ul>
      `;
      }
      this.bodyEl.appendChild(description);

      // デモ画面またはブックマークレット環境での制限に関する注意書き
      // 環境判定：examples/を含むパス、またはサーバーヘルスチェック無効
      const isLimitedEnvironment =
        window.location.pathname.includes('/examples/') ||
        window.location.pathname.includes('/basic/') ||
        (this.options.client && this.options.client.enableServerHealthCheck === false);

      if (isLimitedEnvironment) {
        const demoNotice = document.createElement('div');
        demoNotice.style.cssText = `
        margin-top: 16px;
        padding: 12px 16px;
        border-radius: 10px;
        background: ${this.theme.isDark ? 'rgba(255, 193, 7, 0.1)' : 'rgba(255, 193, 7, 0.08)'};
        border: 1px solid ${this.theme.isDark ? 'rgba(255, 193, 7, 0.25)' : 'rgba(255, 193, 7, 0.2)'};
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
      `;
        demoNotice.innerHTML = `
        <p style="margin:0; font-size:13px; color:${this.theme.isDark ? '#ffc107' : '#f57c00'}; font-weight:600; display:flex; align-items:center; gap:6px;">
          <span style="font-size:16px;">⚠️</span> 制限された環境での注意
        </p>
        <p style="margin:6px 0 0 0; font-size:12px; line-height:1.5; color:${colors.textSecondary}; opacity:0.9;">
          デモ画面やブックマークレット環境では、サービス接続機能を使用できません。完全なインストール環境（npm install）が必要です。
        </p>
      `;
        this.bodyEl.appendChild(demoNotice);
      }

      const buttonTextSpan = this.primaryButton.querySelector('span');
      if (buttonTextSpan) {
        buttonTextSpan.textContent = '接続を確認しました';
      }
      this.primaryButton.disabled = false;
      this.primaryButton.style.opacity = '1';
      this.primaryButton.style.cursor = 'pointer';
      this.primaryButton.onclick = () => this.nextStep();

      this.secondaryButton.style.display = 'inline-flex';
      this.secondaryButton.textContent = '設定を開く';
      this.secondaryButton.onclick = () => {
        if (typeof this.options.onOpenServiceModal === 'function') {
          this.options.onOpenServiceModal();
        }
      };

      this.currentHighlightTarget = typeof this.options.settingsButton === 'function'
        ? this.options.settingsButton()
        : this.options.settingsButton || null;
    }

    renderPromptStep() {
      const colors = this.getAdaptiveColors();
      const selectedPersona = this.personaOptions.find(p => p.id === this.state.persona);
      const mode = selectedPersona?.mode;

      const calloutConfig = {
        import: {
          icon: '📁',
          title: 'ドロップのコツ',
          message: 'ファイルを取り込むと自動で配置キーワードが入力されます。Enter ⏎ で瞬時にシーンへ落とし込みましょう。'
        },
        modify: {
          icon: '🪄',
          title: '演出のヒント',
          message: '変更したいオブジェクトをクリックしたら、色・質感・光のニュアンスを短い文章で伝えましょう。'
        },
        capture: {
          icon: '🎥',
          title: 'シネマティックな撮影',
          message: 'UIを隠した状態でも WASD とドラッグで微調整できます。息を整えて最高の瞬間をキャプチャ。'
        },
        generate: {
          icon: '✨',
          title: '想像を言葉に',
          message: 'モチーフだけでなく、光や素材感、カメラワークまで描写すると生成AIの感性が引き出されます。※現在は画像・動画のみ対応（3D生成は未対応）'
        }
      };

      const callout = document.createElement('div');
      callout.style.cssText = `
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px 18px;
      border-radius: 18px;
      border: 1px solid ${this.theme.isDark ? 'rgba(168, 85, 247, 0.4)' : 'rgba(129, 140, 248, 0.35)'};
      background: ${this.theme.isDark ? 'rgba(61, 35, 88, 0.35)' : 'rgba(236, 233, 255, 0.7)'};
      box-shadow: 0 12px 28px ${this.theme.isDark ? 'rgba(76, 29, 149, 0.25)' : 'rgba(148, 163, 184, 0.32)'};
    `;

      const calloutIcon = document.createElement('span');
      calloutIcon.style.cssText = 'font-size: 20px; line-height: 1; filter: drop-shadow(0 6px 12px rgba(168, 85, 247, 0.45));';
      callout.appendChild(calloutIcon);

      const calloutContent = document.createElement('div');
      calloutContent.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
      const calloutTitle = document.createElement('strong');
      calloutTitle.style.cssText = 'font-size: 13px; letter-spacing: 0.02em; color: inherit;';
      const calloutMessage = document.createElement('span');
      calloutMessage.style.cssText = `font-size: 13px; line-height: 1.6; color: ${colors.textSecondary};`;

      const appliedConfig = calloutConfig[mode] || calloutConfig.generate;
      calloutIcon.textContent = appliedConfig.icon;
      calloutTitle.textContent = appliedConfig.title;
      calloutMessage.textContent = appliedConfig.message;

      calloutContent.appendChild(calloutTitle);
      calloutContent.appendChild(calloutMessage);
      callout.appendChild(calloutContent);
      this.bodyEl.appendChild(callout);

      const extraHighlights = [];

      const lead = document.createElement('p');
      lead.style.cssText = `margin: 0; color: ${colors.textSecondary}; line-height: 1.6;`;

      if (mode === 'import') {
        lead.textContent = '📁ボタンからファイルを選択すると、自動的に配置プロンプトが入力されます。';
        this.bodyEl.appendChild(lead);

        const steps = document.createElement('ul');
        steps.style.cssText = `margin:12px 0 0 20px; padding:0; font-size:14px; line-height:1.7; opacity:0.85; color:${colors.textSecondary};`;
        steps.innerHTML = `
        <li style="margin-bottom:6px;">📁ボタンをクリックしてファイルを選択</li>
        <li style="margin-bottom:6px;">自動的に「中央に設置 (ファイル名)」が入力される</li>
        <li>500ms後に自動実行され、シーンに配置されます</li>
      `;
        this.bodyEl.appendChild(steps);

        const fileButton = typeof this.options.fileButton === 'function'
          ? this.options.fileButton()
          : this.options.fileButton || null;
        if (fileButton) {
          extraHighlights.push(fileButton);
        }
      } else if (mode === 'modify') {
        lead.textContent = 'まず3Dシーン内のオブジェクトをクリックして選択してから、変更・削除の指示を入力します。';
        this.bodyEl.appendChild(lead);

        const promptPreview = document.createElement('div');
        promptPreview.style.cssText = `
        font-family: 'Inter', 'SFMono-Regular', ui-monospace, monospace;
        font-size: 13px;
        white-space: pre-line;
        background: ${this.theme.isDark ? 'rgba(15, 23, 42, 0.5)' : 'rgba(255, 255, 255, 0.6)'};
        border: 1.5px solid ${colors.border};
        border-radius: 16px;
        padding: 16px;
        line-height: 1.6;
        color: ${colors.textPrimary};
        box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.1);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        margin: 12px 0;
      `;
        promptPreview.textContent = this.state.samplePrompt || '背景の白色を透明にして';
        this.bodyEl.appendChild(promptPreview);

        const note = document.createElement('div');
        note.style.cssText = `
        font-size: 13px;
        margin: 0;
        opacity: 0.85;
        color: ${colors.textSecondary};
        display: grid;
        gap: 4px;
      `;
        note.innerHTML = `
        <span>・ 選択されていない状態で実行するとエラーになります。まず対象をクリックしてハイライトさせてください。</span>
        <span>・ そのまま「大きく」「小さく」「音を鳴らして」などと入力すると、即座に反映されます。</span>
        <span>・ 削除は「削除して」、透明感は「透明なブルーに」など自然文で指定できます。</span>
      `;
        this.bodyEl.appendChild(note);
      } else if (mode === 'capture') {
        lead.textContent = 'WASDキーでシーンを移動し、完璧なアングルを見つけます。';
        this.bodyEl.appendChild(lead);

        const interactionTip = document.createElement('p');
        interactionTip.style.cssText = `margin: 8px 0 0 0; color: ${colors.textSecondary}; font-size: 13px; line-height: 1.6; opacity: 0.9;`;
        interactionTip.innerHTML = `
        <span style="display:block;">・ ChocoDropを開いたままでも、選択したオブジェクトをドラッグやコマンドで調整できます。</span>
        <span style="display:block;">・ ChocoDropを閉じると、シーン全体をマウスドラッグで滑らかに動かせます。</span>
      `;
        this.bodyEl.appendChild(interactionTip);

        const keyGuide = document.createElement('div');
        keyGuide.style.cssText = `
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
        max-width: 200px;
        margin: 16px auto;
      `;

        const keys = [
          { key: 'W', label: '前進', pos: '1 / 2 / 2 / 3' },
          { key: 'A', label: '左', pos: '2 / 1 / 3 / 2' },
          { key: 'S', label: '後退', pos: '2 / 2 / 3 / 3' },
          { key: 'D', label: '右', pos: '2 / 3 / 3 / 4' }
        ];

        keys.forEach(({key, label, pos}) => {
          const keyBox = document.createElement('div');
          keyBox.style.cssText = `
          grid-area: ${pos};
          background: ${this.theme.isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'};
          border: 1.5px solid ${this.theme.isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)'};
          border-radius: 8px;
          padding: 12px;
          text-align: center;
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
        `;
          keyBox.innerHTML = `
          <div style="font-size: 18px; font-weight: 700; color: ${colors.textPrimary}; margin-bottom: 4px;">${key}</div>
          <div style="font-size: 10px; color: ${colors.textSecondary}; opacity: 0.8;">${label}</div>
        `;
          keyGuide.appendChild(keyBox);
        });
        this.bodyEl.appendChild(keyGuide);

        const note = document.createElement('p');
        note.style.cssText = `font-size: 13px; margin: 12px 0 0 0; opacity: 0.8; color: ${colors.textSecondary}; text-align: center;`;
        note.textContent = 'UIを隠した状態でシャッター。スクリーンショットで仕上げましょう。';
        this.bodyEl.appendChild(note);
      } else if (mode === 'generate') {
        lead.textContent = '自然言語でオブジェクトの生成指示を入力します。';
        this.bodyEl.appendChild(lead);

        const promptPreview = document.createElement('div');
        promptPreview.style.cssText = `
        font-family: 'Inter', 'SFMono-Regular', ui-monospace, monospace;
        font-size: 13px;
        white-space: pre-line;
        background: ${this.theme.isDark ? 'rgba(15, 23, 42, 0.5)' : 'rgba(255, 255, 255, 0.6)'};
        border: 1.5px solid ${colors.border};
        border-radius: 16px;
        padding: 16px;
        line-height: 1.6;
        color: ${colors.textPrimary};
        box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.1);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        margin: 12px 0;
      `;
        promptPreview.textContent = this.state.samplePrompt || this.personaOptions[0].prompt;
        this.bodyEl.appendChild(promptPreview);

        const note = document.createElement('p');
        note.style.cssText = `font-size: 13px; margin: 0; opacity: 0.8; color: ${colors.textSecondary};`;
        note.textContent = '必要であれば細かな指示（サイズ・位置・マテリアル）を追加してください。';
        this.bodyEl.appendChild(note);
      }

      const buttonTextSpan = this.primaryButton.querySelector('span');
      if (buttonTextSpan) {
        buttonTextSpan.textContent = (mode === 'import') ? '次へ' : 'プロンプトを挿入';
      }
      this.primaryButton.disabled = false;
      this.primaryButton.style.opacity = '1';
      this.primaryButton.style.cursor = 'pointer';
      this.primaryButton.onclick = () => {
        if (mode !== 'import' && typeof this.options.onInsertPrompt === 'function') {
          const promptText = this.state.samplePrompt || this.personaOptions[0].prompt;
          this.options.onInsertPrompt(promptText, this.state.persona);
          this.state.hasInsertedPrompt = true;
        }
        this.nextStep();
      };

      this.secondaryButton.style.display = (mode === 'import') ? 'none' : 'inline-flex';
      this.secondaryButton.textContent = '自分で入力する';
      this.secondaryButton.onclick = () => this.nextStep();

      // プロンプト入力欄を自動ハイライト
      this.currentHighlightTarget = typeof this.options.textareaElement === 'function'
        ? this.options.textareaElement()
        : this.options.textareaElement || null;

      this.setAdditionalHighlights(extraHighlights);

      // ハイライトを即座に適用
      if (this.currentHighlightTarget) {
        this.updateFocusRing(this.currentHighlightTarget);
      }
    }

    renderExecuteStep() {
      const colors = this.getAdaptiveColors();
      const selectedPersona = this.personaOptions.find(p => p.id === this.state.persona);
      const mode = selectedPersona?.mode;
      const mediaType = selectedPersona?.mediaType;

      const description = document.createElement('div');
      const extraHighlights = [];

      if (mode === 'import') {
        description.innerHTML = `
        <p style="margin:0; color:${colors.textSecondary}; line-height:1.6;">📁ボタンから素材を選ぶと、ハイライトされたフォームにキーワードが挿入されます。</p>
        <p style="margin:12px 0 0 0; font-size:13px; opacity:0.85; color:${colors.textSecondary};">Enter ⏎ を押すと約0.5秒後にシーンへふわりと配置されます。位置はあとからコマンドで微調整できます。</p>
      `;
        const textareaEl = typeof this.options.textareaElement === 'function'
          ? this.options.textareaElement()
          : this.options.textareaElement || null;
        if (textareaEl) {
          extraHighlights.push(textareaEl);
        }
      } else if (mode === 'modify') {
        description.innerHTML = `
        <p style="margin:0; color:${colors.textSecondary}; line-height:1.6;">演出したいオブジェクトをクリックし、質感や光のニュアンスを文章で伝えてみてください。</p>
        <p style="margin:12px 0 0 0; font-size:13px; opacity:0.85; color:${colors.textSecondary};">「透明なバニラの光に」「輪郭を少し柔らかく」など、ライブでイメージが切り替わります。</p>
      `;
      } else if (mode === 'capture') {
        description.innerHTML = `
        <p style="margin:0; color:${colors.textSecondary}; line-height:1.6;">WASD キーとマウスドラッグで空間を滑り、UIを隠してからスクリーンショットを撮影しましょう。</p>
        <p style="margin:12px 0 0 0; font-size:13px; opacity:0.85; color:${colors.textSecondary};">ChocoDropを開いたままならオブジェクト単位で移動や回転ができ、閉じるとシーン全体をドラッグ操作できます。</p>
        <p style="margin:12px 0 0 0; font-size:13px; opacity:0.85; color:${colors.textSecondary};">光が巡る瞬間を逃さないよう、撮影前に一呼吸おくと映像がやさしくまとまります。</p>
      `;
      } else if (mode === 'generate' && mediaType === 'video') {
        description.innerHTML = `
        <p style="margin:0; color:${colors.textSecondary}; line-height:1.6;">プロンプトを送信すると生成が始まります。カメラワークやテンポも一緒にイメージしておくと滑らかです。</p>
        <p style="margin:12px 0 0 0; font-size:13px; opacity:0.85; color:${colors.textSecondary};">ステータスカードで進捗を確認。生成は30秒〜数分、音も加わるとさらに没入感が増します。</p>
        <p style="margin:12px 0 0 0; font-size:12px; opacity:0.85; color:${colors.textSecondary};">Enter ⏎ でプロンプトを送信すると生成がスタートします。現在は画像・動画のみ対応（3Dモデル生成は未対応）です。</p>
      `;
      } else {
        // Fallback for any other modes
        description.innerHTML = `
        <p style="margin:0; color:${colors.textSecondary}; line-height:1.6;">準備が整ったら実行ボタンをクリック。シーンが呼吸をはじめる瞬間を見届けましょう。</p>
        <p style="margin:12px 0 0 0; font-size:13px; opacity:0.85; color:${colors.textSecondary};">進捗はステータスカードに表示されます。完了通知まで創作ノートをメモするのもおすすめです。</p>
      `;
      }
      this.bodyEl.appendChild(description);

      const buttonTextSpan = this.primaryButton.querySelector('span');
      if (buttonTextSpan) {
        buttonTextSpan.textContent = (mode === 'generate') ? 'Enterで送信しました' : '実行しました';
      }
      this.primaryButton.disabled = false;
      this.primaryButton.style.opacity = '1';
      this.primaryButton.style.cursor = 'pointer';
      this.primaryButton.onclick = () => this.nextStep();

      // セカンダリボタンを非表示
      this.secondaryButton.style.display = 'none';

      this.setAdditionalHighlights(extraHighlights);

      // モードに応じて自動でハイライト
      if (mode === 'import') {
        // Importモードではファイルボタンを自動ハイライト
        this.currentHighlightTarget = typeof this.options.fileButton === 'function'
          ? this.options.fileButton()
          : this.options.fileButton || null;
        const textareaEl = typeof this.options.textareaElement === 'function'
          ? this.options.textareaElement()
          : this.options.textareaElement || null;
        if (textareaEl) {
          extraHighlights.push(textareaEl);
          this.setAdditionalHighlights(extraHighlights);
        }
      } else if (mode === 'capture') {
        // Captureモードでは×ボタン（UI非表示ボタン）を自動ハイライト
        this.currentHighlightTarget = typeof this.options.closeButton === 'function'
          ? this.options.closeButton()
          : this.options.closeButton || null;
      } else if (mode === 'modify' || mode === 'generate') {
        // Modify/Generateモードではプロンプト入力欄を自動ハイライト
        this.currentHighlightTarget = typeof this.options.textareaElement === 'function'
          ? this.options.textareaElement()
          : this.options.textareaElement || null;
      } else {
        this.currentHighlightTarget = null;
      }

      this.setAdditionalHighlights(extraHighlights);

      // ハイライトを即座に適用
      if (this.currentHighlightTarget) {
        this.updateFocusRing(this.currentHighlightTarget);
      }
    }

    renderNextStep() {
      const colors = this.getAdaptiveColors();

      const summary = document.createElement('div');
      summary.innerHTML = `
      <p style="margin:0; color:${colors.textSecondary}; line-height:1.6; font-weight:600;">すべてのモードをひとめで振り返りましょう。</p>
      <div style="display:grid; gap:10px; margin-top:12px;">
        <div style="display:flex; gap:10px; align-items:flex-start;">
          <span style="font-size:18px;">📥</span>
          <span style="font-size:13px; line-height:1.6; color:${colors.textSecondary};"><strong>インポート</strong> — ドロップして配置。Enter ⏎ で即座にシーンへ。</span>
        </div>
        <div style="display:flex; gap:10px; align-items:flex-start;">
          <span style="font-size:18px;">✏️</span>
          <span style="font-size:13px; line-height:1.6; color:${colors.textSecondary};"><strong>雰囲気演出 / 削除</strong> — 選択→言葉で光や質感を調整。"削除して" で除去。</span>
        </div>
        <div style="display:flex; gap:10px; align-items:flex-start;">
          <span style="font-size:18px;">🎨</span>
          <span style="font-size:13px; line-height:1.6; color:${colors.textSecondary};"><strong>ビジュアル生成</strong> — 画像/動画生成に対応（3Dは未対応）。Enter ⏎ で送信。</span>
        </div>
        <div style="display:flex; gap:10px; align-items:flex-start;">
          <span style="font-size:18px;">🎬</span>
          <span style="font-size:13px; line-height:1.6; color:${colors.textSecondary};"><strong>シーン撮影</strong> — UIを隠し、WASDで理想のアングルに。</span>
        </div>
      </div>
      <p style="margin:14px 0 0 0; font-size:12px; color:${colors.textSecondary}; opacity:0.85;">ショートカットは 🍫 メニューからいつでも呼び出せます。</p>
    `;
      this.bodyEl.appendChild(summary);

      const buttonTextSpan = this.primaryButton.querySelector('span');
      if (buttonTextSpan) {
        buttonTextSpan.textContent = 'ガイドを終了';
      }
      this.primaryButton.disabled = false;
      this.primaryButton.style.opacity = '1';
      this.primaryButton.style.cursor = 'pointer';
      this.primaryButton.onclick = () => {
        this.handleStepCompletion('next', { skipped: false });
        this.complete('finished');
      };

      this.secondaryButton.style.display = 'none';

      this.currentHighlightTarget = null;
    }

    updateTopControls() {
      if (!this.skipButton || !this.closeButton) {
        return;
      }

      const isLastStep = this.state.stepIndex >= this.steps.length - 1;
      if (isLastStep) {
        this.skipButton.textContent = 'ガイドを終了';
        this.skipButton.title = 'すべて確認したのでガイドを閉じます';
        this.skipButton.setAttribute('aria-label', 'ガイドを終了');
      } else {
        this.skipButton.textContent = 'スキップ';
        this.skipButton.title = 'このページをスキップして次へ進みます';
        this.skipButton.setAttribute('aria-label', 'このページをスキップ');
      }
    }

    skipStep() {
      if (!this.active) {
        return;
      }

      const current = this.steps[this.state.stepIndex];
      if (current) {
        this.handleStepCompletion(current.id, { skipped: true });
      }

      const nextIndex = this.state.stepIndex + 1;
      if (nextIndex >= this.steps.length) {
        this.complete('skipped');
        return;
      }

      this.state.stepIndex = nextIndex;
      this.renderCurrentStep();
    }

    nextStep() {
      const current = this.steps[this.state.stepIndex];
      if (current) {
        this.handleStepCompletion(current.id, { skipped: false });
      }

      this.state.stepIndex += 1;
      if (this.state.stepIndex >= this.steps.length) {
        this.complete('finished');
      } else {
        this.renderCurrentStep();
      }
    }

    previousStep() {
      if (this.state.stepIndex > 0) {
        this.state.stepIndex -= 1;

        // サービスステップをスキップして戻る処理
        const selectedPersona = this.personaOptions.find(p => p.id === this.state.persona);
        const needsServiceConnection = selectedPersona?.mode === 'generate';
        const currentStep = this.steps[this.state.stepIndex];

        if (currentStep?.type === 'service' && !needsServiceConnection) {
          // サービスステップの場合はさらに1つ戻る
          if (this.state.stepIndex > 0) {
            this.state.stepIndex -= 1;
          }
        }

        this.renderCurrentStep();
      }
    }

    updateFocusRing(target) {
      if (target) {
        this.currentHighlightTarget = target;
      }

      this.updateFocusRingPosition();
    }

    updateFocusRingPosition() {
      const fallbackRect = this.panel ? this.panel.getBoundingClientRect() : null;

      if (!this.active) {
        this.focusRing.style.opacity = '0';
        this.updateSpotlight(null);
        this.syncFocusAura(null);
        return;
      }

      const target = this.currentHighlightTarget;
      if (!target) {
        this.focusRing.style.opacity = '0';
        this.updateSpotlight(fallbackRect);
        this.syncFocusAura(null);
        return;
      }

      const rect = target.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        this.focusRing.style.opacity = '0';
        this.updateSpotlight(fallbackRect);
        this.syncFocusAura(null);
        return;
      }

      this.focusRing.style.opacity = '1';
      this.focusRing.style.transform = `translate(${rect.left - 12}px, ${rect.top - 12}px)`;
      this.focusRing.style.width = `${rect.width + 24}px`;
      this.focusRing.style.height = `${rect.height + 24}px`;

      this.updateSpotlight(rect);
      this.syncFocusAura(target);
    }

    getBaseOverlayLayer() {
      return this.theme.isDark
        ? 'linear-gradient(180deg, rgba(5, 10, 24, 0.58) 0%, rgba(15, 23, 42, 0.62) 100%)'
        : 'linear-gradient(180deg, rgba(248, 250, 255, 0.7) 0%, rgba(226, 232, 240, 0.65) 100%)';
    }

    computeSpotlightGradient(rect) {
      const baseLayer = this.getBaseOverlayLayer();
      if (!rect) {
        return baseLayer;
      }

      const centerX = Math.round(rect.left + rect.width / 2);
      const centerY = Math.round(rect.top + rect.height / 2);
      const radius = Math.max(rect.width, rect.height) * 0.6 + 160;
      const innerStop = Math.max(0, radius - 200);
      const haloRadius = Math.min(radius, innerStop + 80);
      const tintColor = this.theme.isDark ? 'rgba(8, 13, 24, 0.65)' : 'rgba(241, 245, 249, 0.75)';
      const haloColor = this.theme.isDark ? 'rgba(148, 163, 184, 0.22)' : 'rgba(139, 92, 246, 0.18)';

      return `radial-gradient(circle at ${centerX}px ${centerY}px, rgba(0, 0, 0, 0) ${innerStop}px, ${haloColor} ${haloRadius}px, ${tintColor} ${radius}px), ${baseLayer}`;
    }

    updateSpotlight(rect) {
      if (!this.spotlightLayer) {
        return;
      }

      this.spotlightLayer.style.background = this.computeSpotlightGradient(rect);
    }

    clearFocusAura() {
      this.focusAuraTargets.forEach(target => target.classList.remove(this.focusAuraClass));
      this.focusAuraTargets.clear();
      this.additionalHighlights = [];
    }

    setAdditionalHighlights(targets = []) {
      const uniqueTargets = [];
      const seen = new Set();
      targets.forEach(target => {
        if (target && !seen.has(target)) {
          seen.add(target);
          uniqueTargets.push(target);
        }
      });
      this.additionalHighlights = uniqueTargets;
      this.syncFocusAura(this.currentHighlightTarget);
    }

    syncFocusAura(primaryTarget) {
      const desiredTargets = new Set();
      if (primaryTarget) {
        desiredTargets.add(primaryTarget);
      }
      this.additionalHighlights.forEach(target => desiredTargets.add(target));

      this.focusAuraTargets.forEach(target => {
        if (!desiredTargets.has(target)) {
          target.classList.remove(this.focusAuraClass);
          this.focusAuraTargets.delete(target);
        }
      });

      desiredTargets.forEach(target => {
        if (!this.focusAuraTargets.has(target)) {
          target.classList.add(this.focusAuraClass);
          this.focusAuraTargets.add(target);
        }
      });
    }

    initializeBadges() {
      if (!this.badgeRow) return;
      this.badgeRow.innerHTML = '';
      this.badgeIndicators = {};

      const badgeSteps = this.steps.filter(step => step.id !== 'next');
      badgeSteps.forEach(step => {
        const badge = document.createElement('div');
        badge.className = 'chocodrop-badge';
        badge.dataset.stepId = step.id;
        badge.textContent = step.icon || '•';
        this.badgeRow.appendChild(badge);
        this.badgeIndicators[step.id] = badge;
      });

      this.resetBadgeStates();
    }

    resetBadgeStates() {
      Object.values(this.badgeIndicators).forEach(badge => {
        badge.classList.remove('completed', 'skipped');
      });
      this.stepCompletionStates = {};
      this.completedSteps = new Set();
    }

    updateBadgeState(stepId, state) {
      const badge = this.badgeIndicators?.[stepId];
      if (!badge) return;
      badge.classList.remove('completed', 'skipped');
      if (state === 'completed') {
        badge.classList.add('completed');
      } else if (state === 'skipped') {
        badge.classList.add('skipped');
      }
    }

    handleStepCompletion(stepId, { skipped = false } = {}) {
      if (!stepId || this.stepCompletionStates[stepId]) {
        if (skipped) {
          this.updateBadgeState(stepId, 'skipped');
        }
        return;
      }

      this.stepCompletionStates[stepId] = skipped ? 'skipped' : 'completed';
      if (skipped) {
        this.updateBadgeState(stepId, 'skipped');
        this.storeCompletion();
        return;
      }

      this.updateBadgeState(stepId, 'completed');
      this.launchConfetti();
      this.storeCompletion();
    }

    launchConfetti() {
      if (!this.panel) return;

      const container = document.createElement('div');
      container.className = 'chocodrop-confetti';
      this.panel.appendChild(container);

      const palette = ['#f472b6', '#c084fc', '#60a5fa', '#facc15', '#4ade80'];
      const pieces = 14;
      for (let i = 0; i < pieces; i++) {
        const piece = document.createElement('span');
        const color = palette[i % palette.length];
        piece.style.background = color;
        const angle = (Math.random() * 120) - 60; // spread
        const distance = 120 + Math.random() * 60;
        const x = Math.cos(angle * Math.PI / 180) * distance;
        const y = Math.sin((angle + 90) * Math.PI / 180) * distance;
        const rotate = (Math.random() * 260 - 130) + 'deg';
        const left = 40 + Math.random() * 20;
        piece.style.left = `${left}%`;
        piece.style.top = '10%';
        piece.style.setProperty('--x', `${x}px`);
        piece.style.setProperty('--y', `${y}px`);
        piece.style.setProperty('--r', rotate);
        container.appendChild(piece);
      }

      setTimeout(() => {
        container.remove();
      }, 900);
    }

    getStepMeta(step, persona) {
      const personaId = persona?.id;
      const meta = {
        icon: step?.icon || '✨',
        title: step?.title || 'ChocoDrop ガイド',
        tagline: step?.tagline || '',
        progressLabel: step?.progressLabel || step?.title || 'ガイド'
      };

      switch (step?.id) {
        case 'persona':
          meta.title = 'ムードを選ぶ';
          meta.tagline = '最初に描きたい世界観を選ぶと、ガイドが最適な順番を提案します。';
          meta.progressLabel = 'ムード選択';
          break;
        case 'service':
          meta.title = 'サービス接続を整える';
          meta.progressLabel = '接続チェック';
          if (personaId === 'atmos-sculpt') {
            meta.tagline = '動画生成サービスがオンラインか確認しましょう。接続が完了するとステータスが緑になります。';
          }
          break;
        case 'prompt':
          meta.progressLabel = '言葉を整える';
          if (personaId === 'media-import') {
            meta.title = '素材にひと言添える';
            meta.tagline = '配置する位置やサイズなど、素材に合わせたワンフレーズを追加しましょう。';
          } else if (personaId === 'remix-pro') {
            meta.title = '演出のニュアンスを言葉に';
            meta.tagline = '光や質感のイメージを自然な文章で伝えると、即座にシーンへ反映されます。';
          } else if (personaId === 'scene-capture') {
            meta.title = '撮影メモを残す';
            meta.tagline = '欲しい画角や時間帯、色味を簡単に控えておくとルートが決まります。';
          }
          break;
        case 'execute':
          meta.progressLabel = 'シーン再生';
          if (personaId === 'scene-capture') {
            meta.tagline = 'UIを隠したら、呼吸を整えてからシャッター。光の揺らぎも録り込みましょう。';
          }
          break;
        case 'next':
          meta.progressLabel = 'まとめ';
          meta.tagline = 'ショートカットやおすすめの遊び方をチェックして、次の世界へ踏み出しましょう。';
          break;
      }

      return meta;
    }

    calculateProgress(stepId, needsService) {
      const flow = needsService
        ? ['persona', 'service', 'prompt', 'execute', 'next']
        : ['persona', 'prompt', 'execute', 'next'];

      const index = flow.indexOf(stepId);
      const currentStep = index >= 0 ? index + 1 : Math.min(this.state.stepIndex + 1, flow.length);

      return {
        currentStep,
        totalSteps: flow.length
      };
    }

    updateProgressIndicator({ currentStep, totalSteps, icon, label }) {
      if (!this.progressIndicator) return;

      if (this.progressIcon) {
        this.progressIcon.textContent = icon || '✨';
      }

      if (this.progressLabel) {
        this.progressLabel.textContent = label || '';
      }

      if (this.progressCount) {
        this.progressCount.textContent = `${currentStep}/${totalSteps}`;
      }
    }

    highlightModeButton(mode) {
      try {
        // CommandUI.js の radioModeButtons から該当するモードボタンを取得
        const modeContainer = typeof this.options.modeContainer === 'function'
          ? this.options.modeContainer()
          : this.options.modeContainer;

        if (!modeContainer) {
          return;
        }

        // すべてのモードボタンから既存のハイライトを削除
        const allButtons = modeContainer.querySelectorAll('[data-mode]');
        allButtons.forEach(btn => {
          btn.style.boxShadow = '';
          btn.style.outline = '';
        });

        // 該当するモードボタンを見つけてハイライト
        if (mode) {
          const targetButton = Array.from(allButtons).find(btn => {
            return btn.getAttribute('data-mode') === mode;
          });

          if (targetButton) {
            const colors = this.getAdaptiveColors();
            targetButton.style.outline = `3px solid ${colors.primary}`;
            targetButton.style.outlineOffset = '2px';
            targetButton.style.boxShadow = `0 0 0 1px ${colors.primary}, 0 4px 12px ${colors.glow}`;
          }
        }
      } catch (error) {
        // エラーが発生してもペルソナ選択処理は継続
        console.warn('Mode button highlight failed:', error);
      }
    }

    clearModeButtonHighlight() {
      try {
        const modeContainer = typeof this.options.modeContainer === 'function'
          ? this.options.modeContainer()
          : this.options.modeContainer;

        if (!modeContainer) {
          return;
        }

        const allButtons = modeContainer.querySelectorAll('[data-mode]');
        allButtons.forEach(btn => {
          btn.style.boxShadow = '';
          btn.style.outline = '';
        });
      } catch (error) {
        console.warn('Clear mode button highlight failed:', error);
      }
    }

    complete(status = 'finished') {
      if (!this.active) {
        return;
      }

      this.active = false;
      this.hasCompleted = true;
      this.storeCompletion({ status, insertedPrompt: this.state.hasInsertedPrompt });

      // モードボタンのハイライトをクリア
      this.clearModeButtonHighlight();

      // Add exit animation
      const panelWrapper = this.panel.parentElement;
      if (panelWrapper) {
        panelWrapper.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 1, 1)';
        panelWrapper.style.transform = 'translateX(-50%) translateY(60px)';
        panelWrapper.style.opacity = '0';
      }

      this.backdrop.style.opacity = '0';
      this.focusRing.style.opacity = '0';
      this.updateSpotlight(null);
      this.clearFocusAura();

      setTimeout(() => {
        this.backdrop.style.display = 'none';
        this.currentHighlightTarget = null;
      }, 400);

      if (typeof this.options.onComplete === 'function') {
        this.options.onComplete({ status, persona: this.state.persona });
      }
    }
  }

  const IMAGE_SERVICE_STORAGE_KEY$1 = 'chocodrop-service-image';
  const VIDEO_SERVICE_STORAGE_KEY$1 = 'chocodrop-service-video';

  /**
   * Command UI Demo - Demo version with restricted functionality
   * For GitHub Pages demo - import functionality only
   */
  class CommandUIDemo {
    constructor(options = {}) {
      this.sceneManager = options.sceneManager || null;
      this.client = options.client || null;
      this.onControlsToggle = options.onControlsToggle || (() => {});

      // showInputFeedback メソッドを無条件に定義（3Dファイル読み込みエラー対策）
      this.showInputFeedback = (message, type = 'error') => {
        if (type === 'error') {
          this.addOutput(`⚠️ ${message}`, 'error');
        } else {
          this.addOutput(`💡 ${message}`, 'system');
        }
      };

      this.isVisible = false;
      this.container = null;
      this.input = null;
      this.output = null;
      this.currentMode = 'generate';

      // リアルタイム進捗管理
      this.activeConnections = new Map();
      this.currentTaskId = null;
      
      // 設定
      this.config = {
        activationKey: options.activationKey || '@',
        position: options.position || 'bottom-right',
        width: options.width || 450,
        maxHeight: options.maxHeight || 600,
        theme: options.theme || 'dark',
        skipServiceDialog: options.skipServiceDialog !== false,  // GitHub Pages用：デフォルトで無効化
        showExamples: options.showExamples !== false,
        autoScroll: options.autoScroll !== false,
        enableDebugLogging: options.enableDebugLogging === true,
        enableServerHealthCheck: options.enableServerHealthCheck !== false,
        showGuidedOnboarding: options.showGuidedOnboarding !== false,
        ...options.config
      };

      this.availableImageServices = [];
      this.availableVideoServices = [];
      this.selectedImageService = null;
      this.selectedVideoService = null;
      this.imageServiceSelect = null;
      this.videoServiceSelect = null;
      this.serviceSelectorContainer = null;
      this.serviceSelectorStatus = null;
      this.serviceSelectorContent = null;
      this.serviceSelectorRetryButton = null;
      this.serviceSelectorSaveButton = null;
      this.serviceSelectorCancelButton = null;
      this.serviceModalOverlay = null;
      this.serviceModal = null;
      this.servicesLoading = false;
      this.isExpanded = false;
      this.overlayTextarea = null;
      this.pendingImageService = null;
      this.pendingVideoService = null;

      try {
        const storedImage = localStorage.getItem(IMAGE_SERVICE_STORAGE_KEY$1);
        const storedVideo = localStorage.getItem(VIDEO_SERVICE_STORAGE_KEY$1);
        if (storedImage) {
          this.selectedImageService = storedImage;
        }
        if (storedVideo) {
          this.selectedVideoService = storedVideo;
        }
      } catch (error) {
        console.warn('⚠️ Failed to load stored service selections:', error);
      }

      this.pendingImageService = this.selectedImageService;
      this.pendingVideoService = this.selectedVideoService;

      this.serverHealthState = {
        available: true,
        checking: false,
        lastError: null
      };
      this.serverHealthBackdrop = null;
      this.serverHealthModal = null;
      this.serverHealthMessage = null;
      this.serverHealthDetail = null;
      this.serverHealthRetryButton = null;
      this.mcpNoticeShown = false;

      this.applyServiceSelectionToSceneManager();

      // テーマモード状態管理 (light, dark, wabisabi)
      this.currentTheme = localStorage.getItem('live-command-theme') || 'light';
      this.isDarkMode = this.currentTheme === 'dark';
      this.isWabiSabiMode = this.currentTheme === 'wabisabi';

      this.onboardingCoach = null;
      this.onboardingLauncherButton = null;
      this.handleExternalOnboardingRequest = null;
      this.handleExternalShortcutsRequest = null;
      this.hasBoundExternalEvents = false;
      
      // Undo/Redo システム
      this.commandHistory = [];
      this.currentHistoryIndex = -1;
      this.maxHistorySize = 50; // 最大コマンド保存数

      this.sceneChangeUnsubscribe = null;
      this.sceneSaveState = {
        lastVersion: 0,
        lastSavedVersion: 0,
        lastSavedAt: null,
        dirty: false,
        isSaving: false
      };
      this.sceneLoadInput = null;
      
      this.initUI();
      this.bindEvents();

      if (!this.client && this.sceneManager && this.sceneManager.client) {
        this.client = this.sceneManager.client;
      }

      this.initializeServerHealthCheck();

      this.createServiceModal();
      this.createFloatingChocolateIcon();
      this.initializeGuidedOnboarding();
      this.initializeScenePersistence();
      this.initializeSceneLoadInput();

      // DOM読み込み完了後にスタイルを確実に適用
      document.addEventListener('DOMContentLoaded', () => {
        this.refreshStyles();
      });

      this.logDebug('🎮 CommandUI initialized');

      // GitHub Pages等でサービス設定を不要にする場合はスキップ
      if (!this.config.skipServiceDialog && (!this.selectedImageService || !this.selectedVideoService)) {
        this.openServiceModal(true);
      }
    }

    logDebug(...args) {
      if (!this.config.enableDebugLogging) {
        return;
      }
      console.log(...args);
    }

    /**
     * デモページ用のコンパクトトースト表示
     */
    showDemoMessage() {
      this.showCompactToast('デモページでは利用できません');
    }

    /**
     * コンパクトトースト通知を表示
     */
    showCompactToast(message) {
      // 既存のトーストがあれば削除
      const existingToast = document.getElementById('demo-toast');
      if (existingToast) {
        existingToast.remove();
      }

      // ボタンコンテナの位置を取得
      const buttonContainer = this.radioModeContainer;
      if (!buttonContainer) return;

      const toast = document.createElement('div');
      toast.id = 'demo-toast';
      toast.textContent = message;
      toast.style.cssText = `
      position: absolute;
      top: -35px;
      left: 50%;
      transform: translateX(-50%);
      background: ${this.isDarkMode ? 'rgba(139, 92, 246, 0.9)' : 'rgba(139, 92, 246, 0.85)'};
      color: white;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      white-space: nowrap;
      z-index: 1000;
      opacity: 0;
      transition: opacity 0.3s ease;
      box-shadow: 0 2px 8px rgba(139, 92, 246, 0.3);
    `;

      // ボタンコンテナに相対配置
      buttonContainer.style.position = 'relative';
      buttonContainer.appendChild(toast);

      // フェードイン
      setTimeout(() => {
        toast.style.opacity = '1';
      }, 10);

      // 3秒後に自動削除
      setTimeout(() => {
        if (toast.parentNode) {
          toast.style.opacity = '0';
          setTimeout(() => {
            if (toast.parentNode) {
              toast.remove();
            }
          }, 300);
        }
      }, 3000);
    }

    /**
     * UI要素の作成と配置
     */
    initUI() {
      // メインコンテナ
      this.container = document.createElement('div');
      this.container.id = 'live-command-ui';
      this.container.style.cssText = this.getContainerStyles();

      // 2025年トレンド：Progressive Disclosure（ホバー時のみブランド表示）
      const brandIndicator = document.createElement('div');
      brandIndicator.className = 'progressive-brand-indicator';
      brandIndicator.style.cssText = `
      position: absolute;
      top: -8px;
      right: 8px;
      width: 8px;
      height: 8px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      border-radius: 50%;
      opacity: 0.7;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      z-index: 10;
      cursor: pointer;
    `;
      
      // Progressive Disclosure: ホバー/クリックでブランド名表示
      const brandText = document.createElement('div');
      brandText.className = 'progressive-brand-text';
      brandText.style.cssText = `
      position: absolute;
      top: -35px;
      right: -5px;
      padding: 6px 12px;
      background: rgba(255, 255, 255, 0.15);
      border: 1px solid ${this.isDarkMode ? 'rgba(129, 140, 248, 0.3)' : 'rgba(99, 102, 241, 0.25)'};
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(99, 102, 241, 0.2), 0 4px 12px rgba(0, 0, 0, 0.1);
      color: ${this.isWabiSabiMode ? '#F5F5F5' : (this.isDarkMode ? '#ffffff' : '#1f2937')};
      font-size: 11px;
      font-weight: 700;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
      letter-spacing: 0.02em;
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      opacity: 0;
      transform: translateY(5px) scale(0.9);
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      pointer-events: none;
      z-index: 11;
      white-space: nowrap;
    `;
      brandText.innerHTML = '<span style="filter: hue-rotate(240deg) saturate(0.8) brightness(1.1);">🍫</span> <span style="color: #6366f1;">ChocoDrop</span>';
      
      // Progressive Disclosure イベント
      brandIndicator.addEventListener('mouseenter', () => {
        brandText.style.opacity = '1';
        brandText.style.transform = 'translateY(0) scale(1)';
        brandIndicator.style.transform = 'scale(1.2)';
        brandIndicator.style.opacity = '1';
      });
      
      brandIndicator.addEventListener('mouseleave', () => {
        brandText.style.opacity = '0';
        brandText.style.transform = 'translateY(5px) scale(0.9)';
        brandIndicator.style.transform = 'scale(1)';
        brandIndicator.style.opacity = '0.7';
      });
      
      brandIndicator.appendChild(brandText);
      this.container.appendChild(brandIndicator);

      // 出力エリア（タスクカードコンテナ）- 非表示に変更
      this.output = document.createElement('div');
      this.outputDiv = this.output; // 両方の参照を保持（互換性のため）
      this.output.id = 'command-output';
      this.output.className = 'command-output';
      this.output.style.cssText = this.getOutputStyles();
      // フローティングカード用コンテナ
      this.floatingContainer = document.createElement('div');
      this.floatingContainer.id = 'floating-cards-container';
      this.floatingContainer.style.cssText = `
      position: fixed;
      top: var(--floating-top, 20px);
      left: 50%;
      transform: translateX(-50%);
      z-index: 99999;
      pointer-events: none;
      display: none;
      flex-direction: column-reverse;
      gap: 8px;
      width: 400px;
      max-width: 90vw;
      align-items: center;
      justify-content: flex-end;
    `;

      // タスクカード管理用
      this.taskCards = new Map();

      // 入力フィールドラッパー（展開ボタン用）
      this.inputWrapper = document.createElement('div');
      this.inputWrapper.style.cssText = `
      position: relative;
      width: 100%;
      margin-bottom: 0;
    `;

      // Ultra-Simple 単一入力フィールド（自動リサイズ対応）
      this.input = document.createElement('textarea');
      this.input.rows = 1;
      this.input.id = 'command-input';
      this.input.placeholder = '「右上にドラゴンを」「美しい桜の森を中央に」など... ✨';
      this.input.style.cssText = this.getInputStyles();

      // 展開ボタン（初期状態は非表示）
      this.expandButton = document.createElement('div');
      this.expandButton.innerHTML = '⤢';
      this.expandButton.title = 'テキスト全体を表示';
      this.expandButton.style.cssText = `
      position: absolute;
      bottom: 8px;
      right: 8px;
      width: 24px;
      height: 24px;
      display: none;
      align-items: center;
      justify-content: center;
      background: ${this.isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'};
      border: 1px solid ${this.isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'};
      border-radius: 6px;
      color: ${this.isWabiSabiMode ? '#F5F5F5' : (this.isDarkMode ? '#ffffff' : '#1f2937')};
      font-size: 16px;
      cursor: pointer;
      transition: all 0.2s ease;
      z-index: 1;
    `;

      // 展開ボタンのホバー効果
      this.expandButton.addEventListener('mouseenter', () => {
        this.expandButton.style.background = this.isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)';
        this.expandButton.style.transform = 'scale(1.1)';
      });

      this.expandButton.addEventListener('mouseleave', () => {
        this.expandButton.style.background = this.isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
        this.expandButton.style.transform = 'scale(1)';
      });

      // 展開ボタンのクリック処理
      this.expandButton.addEventListener('click', () => {
        if (this.isExpanded) {
          this.hideOverlayTextarea();
        } else {
          this.showOverlayTextarea();
        }
      });

      // ラッパーに要素を追加
      this.inputWrapper.appendChild(this.input);
      this.inputWrapper.appendChild(this.expandButton);

      // 旧コマンドタイプインジケーターは削除（ラジオボタンUIに統合）

      // ラジオボタン風モードセレクター
      const modeSelector = this.createRadioModeSelector();

      // ミニマルアクションボタン
      const actionContainer = this.createMinimalActions();

      // ×クローズボタンをフォーム右上に追加
      const closeButton = document.createElement('div');
      closeButton.innerHTML = '×';
      closeButton.style.cssText = `
      position: absolute;
      top: 12px;
      right: 12px;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: ${this.isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'};
      color: ${this.isWabiSabiMode ? '#F5F5F5' : (this.isDarkMode ? '#ffffff' : '#1f2937')};
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 14px;
      font-weight: normal;
      transition: all 0.2s ease;
      backdrop-filter: blur(8px);
      z-index: 10;
    `;

      closeButton.addEventListener('mouseover', () => {
        closeButton.style.background = this.isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)';
        closeButton.style.transform = 'scale(1.1)';
      });

      closeButton.addEventListener('mouseout', () => {
        closeButton.style.background = this.isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
        closeButton.style.color = this.isDarkMode ? '#ffffff' : '#1f2937';
        closeButton.style.transform = 'scale(1)';
      });

      closeButton.addEventListener('click', () => {
        this.hide();
      });

      // 組み立て（ヘッダー削除、ブランドバッジは既に追加済み）
      // this.container.appendChild(this.output); // 大きなタスク表示エリアをDOMに追加しない
      this.container.appendChild(closeButton);

      this.onboardingLauncherButton = document.createElement('button');
      this.onboardingLauncherButton.id = 'chocodrop-onboarding-launcher-demo';
      this.onboardingLauncherButton.textContent = '初めての方ガイド';
      this.onboardingLauncherButton.style.cssText = `
      align-self: flex-start;
      margin-top: 4px;
      margin-bottom: 6px;
      padding: 6px 12px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.28);
      background: rgba(255, 255, 255, ${this.isDarkMode ? '0.12' : '0.16'});
      color: ${this.isWabiSabiMode || this.isDarkMode ? '#ffffff' : '#1f2937'};
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    `;
      this.onboardingLauncherButton.addEventListener('mouseenter', () => {
        this.onboardingLauncherButton.style.boxShadow = '0 8px 18px rgba(99, 102, 241, 0.25)';
        this.onboardingLauncherButton.style.transform = 'translateY(-1px)';
      });
      this.onboardingLauncherButton.addEventListener('mouseleave', () => {
        this.onboardingLauncherButton.style.boxShadow = 'none';
        this.onboardingLauncherButton.style.transform = 'translateY(0)';
      });
      this.onboardingLauncherButton.addEventListener('click', () => this.launchOnboarding(true));

      this.container.appendChild(this.onboardingLauncherButton);
      this.container.appendChild(modeSelector);
      this.container.appendChild(this.inputWrapper);
      this.container.appendChild(actionContainer);

      // フローティングカードコンテナをbodyに直接追加
      document.body.appendChild(this.floatingContainer);

      // DOM に追加
      document.body.appendChild(this.container);

      // 初回テーマ適用
      this.applyTheme();

      // 日本語IME対応のcomposition state管理
      this.isComposing = false;
      this.hasCompositionJustEnded = false;

      // リアルタイム入力監視とコマンド検出（IME対応）
      this.input.addEventListener('input', () => {
        // IME入力中はコマンド検出を停止
        if (this.isComposing) {
          return;
        }
        
        // 自動リサイズ処理
        this.autoResizeTextarea();
        
        this.detectCommandType();
      });
      
      // 日本語IME composition events
      this.input.addEventListener('compositionstart', () => {
        this.isComposing = true;
      });
      
      this.input.addEventListener('compositionend', () => {
        this.isComposing = false;
        
        // Safariのみフラグ設定（他のブラウザは不要）
        const isSafari = /Safari/.test(navigator.userAgent) && /Version/.test(navigator.userAgent);
        if (isSafari) {
          this.hasCompositionJustEnded = true;
        }
        
        // 確定後のコマンド検出を実行
        setTimeout(() => {
          this.autoResizeTextarea();
          this.detectCommandType();
        }, 10);
      });
      
      // Safari判定
      const isSafari = /Safari/.test(navigator.userAgent) && /Version/.test(navigator.userAgent);
      
      // 日本語IME対応Enterキー処理（Safari対応版）
      this.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          // Safari: compositionend直後のEnterをスキップ
          if (isSafari && this.hasCompositionJustEnded) {
            this.hasCompositionJustEnded = false;
            return;
          }

          // その他のブラウザ: isComposingチェック
          if (!isSafari && (e.isComposing || this.isComposing)) {
            return;
          }

          // Generate モードのみデモ制限を適用
          if (this.currentMode === 'generate') {
            e.preventDefault();
            this.showDemoMessage();
            return;
          }

          e.preventDefault();
          this.executeCommand();
        }
      });
      
      // 初期メッセージ
      if (this.config.showExamples) ;
    }

    /**
     * モードセレクター作成
     */
    createMinimalActions() {
      const container = document.createElement('div');
      container.style.cssText = `
      display: flex;
      margin-top: 8px;
      margin-bottom: 0 !important;
      gap: 8px;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
    `;

      // 左側: アクションアイコン列
      const leftSection = document.createElement('div');
      leftSection.style.cssText = 'display: flex; gap: 10px; align-items: center;';

      const createIconButton = (symbol, title, onClick, emphasis = false, options = {}) => {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        flex: 0 0 40px;
      `;

        const btn = document.createElement('button');
        btn.innerHTML = `<span style="filter: hue-rotate(${emphasis ? 240 : 210}deg) saturate(0.8) brightness(1.0);">${symbol}</span>`;
        btn.style.cssText = this.getActionButtonStyles('icon');
        btn.title = title;
        btn.setAttribute('aria-label', title);
        if (typeof onClick === 'function') {
          btn.addEventListener('click', onClick);
        }
        if (options.disabled) {
          btn.disabled = true;
          btn.style.opacity = '0.5';
        }

        const tooltip = document.createElement('div');
        tooltip.textContent = title;
        tooltip.style.cssText = `
        position: absolute;
        bottom: -34px;
        left: 50%;
        transform: translateX(-50%);
        padding: 6px 10px;
        border-radius: 8px;
        background: rgba(30, 41, 59, 0.9);
        color: #f8fafc;
        font-size: 11px;
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.15s ease, transform 0.15s ease;
        box-shadow: 0 4px 12px rgba(15, 23, 42, 0.25);
        z-index: 10;
      `;

        const showTooltip = () => {
          tooltip.style.opacity = '1';
          tooltip.style.transform = 'translateX(-50%) translateY(-2px)';
        };

        const hideTooltip = () => {
          tooltip.style.opacity = '0';
          tooltip.style.transform = 'translateX(-50%) translateY(0)';
        };

        btn.addEventListener('mouseenter', showTooltip);
        btn.addEventListener('focus', showTooltip);
        btn.addEventListener('mouseleave', hideTooltip);
        btn.addEventListener('blur', hideTooltip);

        wrapper.appendChild(btn);
        wrapper.appendChild(tooltip);

        return { wrapper, button: btn };
      };

      const { wrapper: saveWrap, button: saveBtn } = createIconButton('💾', 'シーンを保存する', () => this.handleSaveButtonClick(), true);
      const { wrapper: loadWrap, button: loadBtn } = createIconButton('📂', 'シーンを読み込む', () => this.handleLoadButtonClick());
      const { wrapper: clearWrap, button: clearBtn } = createIconButton('🧹', 'シーンをクリアする', () => this.clearAllWithConfirmation());

      const { wrapper: historyWrap, button: historyBtn } = createIconButton('📚', '履歴機能（開発中）', () => {}, false, { disabled: true });

      leftSection.appendChild(saveWrap);
      leftSection.appendChild(loadWrap);
      leftSection.appendChild(clearWrap);
      leftSection.appendChild(historyWrap);

      // 右側: テーマトグルと設定（ヘッダーから移動）
      const rightSection = document.createElement('div');
      rightSection.style.cssText = 'display: flex; gap: 6px; align-items: center;';

      const themeToggle = document.createElement('button');
      const getThemeIcon = () => {
        const themeConfig = {
          light: '🌙',
          dark: '🍵',
          wabisabi: '☀️'
        };
        return themeConfig[this.currentTheme] || '🌙';
      };

      const getThemeTitle = () => {
        const titleConfig = {
          light: 'ダークモードに切り替え',
          dark: '侘び寂びモードに切り替え',
          wabisabi: 'ライトモードに切り替え'
        };
        return titleConfig[this.currentTheme] || 'ダークモードに切り替え';
      };

      const getThemeIconWithFilter = () => {
        const icon = getThemeIcon();
        // 太陽は黄色く、お茶は緑系、月は紫系フィルター
        if (icon === '☀️') {
          return `<span style="filter: saturate(1.2) brightness(1.1);">${icon}</span>`;
        } else if (icon === '🍵') {
          return `<span style="filter: hue-rotate(80deg) saturate(1.1) brightness(1.0);">${icon}</span>`;
        } else {
          return `<span style="filter: hue-rotate(240deg) saturate(0.8) brightness(1.1);">${icon}</span>`;
        }
      };

      themeToggle.innerHTML = getThemeIconWithFilter();
      themeToggle.style.cssText = this.getActionButtonStyles('icon');
      themeToggle.title = getThemeTitle();
      themeToggle.addEventListener('click', () => this.toggleTheme());

      const settingsButton = document.createElement('button');
      settingsButton.innerHTML = '<span style="filter: hue-rotate(240deg) saturate(0.8) brightness(1.1);">⚙️</span>';
      settingsButton.style.cssText = this.getActionButtonStyles('icon');
      settingsButton.title = 'サービス設定を開く';
      settingsButton.addEventListener('click', () => this.openServiceModal());

      rightSection.appendChild(themeToggle);
      rightSection.appendChild(settingsButton);

      container.appendChild(leftSection);
      container.appendChild(rightSection);

      // 参照を保持
      this.saveButton = saveBtn;
      this.loadButton = loadBtn;
      this.clearBtn = clearBtn;
      this.historyBtn = historyBtn;
      this.themeToggle = themeToggle;
      this.settingsButton = settingsButton;

      this.updateSaveButtonState();

      return container;
    }

    initializeScenePersistence() {
      if (this.sceneChangeUnsubscribe) {
        try {
          this.sceneChangeUnsubscribe();
        } catch (error) {
          console.warn('⚠️ Demo UI: failed to unsubscribe scene listener:', error);
        }
        this.sceneChangeUnsubscribe = null;
      }

      if (!this.sceneManager || typeof this.sceneManager.onSceneChange !== 'function') {
        this.sceneSaveState.dirty = false;
        this.updateSaveButtonState();
        return;
      }

      this.sceneChangeUnsubscribe = this.sceneManager.onSceneChange((event) => {
        this.handleSceneChange(event);
      });

      if (typeof this.sceneManager.getSceneState === 'function') {
        try {
          const snapshot = this.sceneManager.getSceneState({ includeJournal: false });
          if (snapshot && typeof snapshot.version === 'number') {
            this.sceneSaveState.lastVersion = snapshot.version;
            if (snapshot.version > this.sceneSaveState.lastSavedVersion) {
              this.sceneSaveState.dirty = true;
            }
          }
        } catch (error) {
          console.warn('⚠️ Demo UI: failed to fetch initial scene snapshot:', error);
        }
      }

      this.updateSaveButtonState();
    }

    initializeSceneLoadInput() {
      if (this.sceneLoadInput || typeof document === 'undefined') {
        return;
      }

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';
      input.style.display = 'none';
      input.addEventListener('change', async (event) => {
        const file = event.target?.files?.[0];
        try {
          await this.handleSceneFileSelected(file);
        } finally {
          if (event.target) {
            event.target.value = '';
          }
        }
      });

      document.body.appendChild(input);
      this.sceneLoadInput = input;
    }

    handleSceneChange(event) {
      if (!event || typeof event.version !== 'number') {
        return;
      }
      this.sceneSaveState.lastVersion = event.version;
      if (event.version > this.sceneSaveState.lastSavedVersion) {
        this.sceneSaveState.dirty = true;
      }
      this.updateSaveButtonState();
    }

    updateSaveButtonState() {
      if (!this.saveButton) {
        return;
      }

      const { dirty, isSaving, lastSavedAt, lastVersion, lastSavedVersion } = this.sceneSaveState;
      const sceneReady = this.sceneManager && typeof this.sceneManager.exportSceneState === 'function';
      const hasChanges = dirty || (lastVersion > lastSavedVersion);
      const disabled = !sceneReady || isSaving || !hasChanges;

      this.saveButton.disabled = disabled;
      this.saveButton.style.opacity = disabled ? '0.6' : '1';

      if (isSaving) {
        this.saveButton.innerHTML = '<span style="filter: hue-rotate(220deg) saturate(0.6) brightness(1.0);">⏳</span>';
        this.saveButton.title = '保存中…';
      } else if (!hasChanges && lastSavedAt) {
        this.saveButton.innerHTML = '<span style="filter: hue-rotate(120deg) saturate(0.9) brightness(1.1);">✅</span>';
        try {
          const formatted = new Date(lastSavedAt).toLocaleString();
          this.saveButton.title = `最終保存: ${formatted}`;
        } catch {
          this.saveButton.title = 'シーン状態をJSONとして保存';
        }
      } else {
        this.saveButton.innerHTML = '<span style="filter: hue-rotate(240deg) saturate(0.8) brightness(1.0);">💾</span>';
        this.saveButton.title = 'シーンを保存する';
      }
    }

    async saveSceneState() {
      if (!this.sceneManager || typeof this.sceneManager.exportSceneState !== 'function') {
        this.addOutput('⚠️ シーンマネージャーが接続されていません。', 'warning');
        return;
      }

      if (this.sceneSaveState.isSaving) {
        return;
      }

      this.sceneSaveState.isSaving = true;
      this.updateSaveButtonState();

      try {
        const state = this.sceneManager.exportSceneState({ includeJournal: true });
        if (state && typeof state.version === 'number') {
          this.sceneSaveState.lastSavedVersion = state.version;
          this.sceneSaveState.lastVersion = state.version;
        }
        this.sceneSaveState.lastSavedAt = state?.exportedAt || new Date().toISOString();
        this.sceneSaveState.dirty = false;

        const objectCount = state?.objectCount ?? 0;
        this.addOutput(`💾 シーンを保存しました（オブジェクト数: ${objectCount}）`, 'success');
      } catch (error) {
        console.error('Demo scene save failed:', error);
        this.addOutput(`❌ シーン保存に失敗しました: ${error.message}`, 'error');
        this.sceneSaveState.dirty = true;
      } finally {
        this.sceneSaveState.isSaving = false;
        this.updateSaveButtonState();
      }
    }

    handleSaveButtonClick() {
      this.saveSceneState();
    }

    handleLoadButtonClick() {
      if (!this.sceneManager) {
        this.addOutput('⚠️ シーンが初期化されていません。', 'warning');
        return;
      }

      this.initializeSceneLoadInput();
      if (this.sceneLoadInput) {
        this.sceneLoadInput.click();
      }
    }

    async handleSceneFileSelected(file) {
      if (!file) {
        return;
      }

      if (!this.sceneManager || typeof this.sceneManager.loadSceneState !== 'function') {
        this.addOutput('⚠️ シーン読み込み機能が有効になっていません。', 'warning');
        return;
      }

      try {
        const text = await file.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (error) {
          throw new Error('シーンファイルを解析できませんでした。JSON 形式か確認してください。');
        }

        const result = await this.sceneManager.loadSceneState(data, { clearExisting: true, applyCamera: true });
        const objectCount = data?.objectCount ?? data?.objects?.length ?? result?.loaded ?? 0;

        if (typeof data?.version === 'number') {
          this.sceneSaveState.lastVersion = data.version;
          this.sceneSaveState.lastSavedVersion = data.version;
        } else {
          this.sceneSaveState.lastVersion += 1;
          this.sceneSaveState.lastSavedVersion = this.sceneSaveState.lastVersion;
        }
        this.sceneSaveState.lastSavedAt = data?.exportedAt || new Date().toISOString();
        this.sceneSaveState.dirty = false;
        this.updateSaveButtonState();

        this.addOutput(`📥 シーンを読み込みました（オブジェクト数: ${objectCount}）`, 'success');
        if (result?.failed) {
          this.addOutput(`⚠️ 復元に失敗したオブジェクト: ${result.failed}`, result.failed > 0 ? 'warning' : 'info');
        }

        this.scrollToBottom();
      } catch (error) {
        console.error('Demo scene load failed:', error);
        this.addOutput(`❌ シーン読み込みエラー: ${error.message}`, 'error');
        this.showCompactToast('シーン読み込みに失敗しました');
      }
    }

    createServiceSelectorSection() {
      this.serviceSelectorContainer = document.createElement('div');
      this.serviceSelectorContainer.id = 'service-selector';
      this.serviceSelectorContainer.style.cssText = `
      margin-bottom: 16px;
      padding: 12px;
      border-radius: 12px;
      border: 1px solid transparent;
      transition: background 0.3s ease, border 0.3s ease;
    `;

      this.serviceSelectorStatus = document.createElement('div');
      this.serviceSelectorStatus.textContent = 'サービス情報を読み込んでいます...';
      this.serviceSelectorStatus.style.fontSize = '12px';
      this.serviceSelectorStatus.style.opacity = '0.8';
      this.serviceSelectorStatus.style.marginBottom = '8px';
      this.serviceSelectorContainer.appendChild(this.serviceSelectorStatus);

      this.serviceSelectorContent = document.createElement('div');
      this.serviceSelectorContainer.appendChild(this.serviceSelectorContent);

      this.updateServiceSelectorTheme();
      return this.serviceSelectorContainer;
    }

    createServiceModal() {
      if (this.serviceModalOverlay) {
        this.serviceModalOverlay.remove();
        this.serviceModalOverlay = null;
        this.serviceModal = null;
      }

      this.serviceModalOverlay = document.createElement('div');
      this.serviceModalOverlay.id = 'chocodrop-service-modal-overlay';
      this.serviceModalOverlay.style.cssText = `
      position: fixed;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      z-index: 2000;
      padding: 16px !important;
      opacity: 0;
      transition: opacity 0.2s ease;
    `;

      this.serviceModalOverlay.addEventListener('click', (event) => {
        if (event.target === this.serviceModalOverlay) {
          this.closeServiceModal();
        }
      });

      this.serviceModal = document.createElement('div');
      this.serviceModal.className = 'chocodrop-service-modal';
      this.serviceModal.style.cssText = `
      width: min(420px, 90vw);
      border-radius: 24px;
      padding: 26px 28px;
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 20px 40px rgba(15, 23, 42, 0.35);
      display: flex;
      flex-direction: column;
      gap: 18px;
      max-height: 90vh;
      overflow-y: auto;
      position: relative;
    `;

      const title = document.createElement('h2');
      title.textContent = 'サービス設定';
      title.style.cssText = `
      margin: 0;
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 0.03em;
    `;

      const subtitle = document.createElement('p');
      subtitle.textContent = '利用するサービスを選択してください。';
      subtitle.style.cssText = `
      margin: 0;
      font-size: 12px;
      opacity: 0.75;
    `;

      const selector = this.createServiceSelectorSection();

      const actionRow = document.createElement('div');
      actionRow.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    `;

      this.serviceSelectorRetryButton = document.createElement('button');
      this.serviceSelectorRetryButton.textContent = '再読み込み';
      this.serviceSelectorRetryButton.style.cssText = `
      font-size: 11px;
      padding: 6px 14px;
      border-radius: 10px;
      border: 1px solid transparent;
      cursor: pointer;
      display: none;
      transition: all 0.2s ease;
    `;
      this.serviceSelectorRetryButton.addEventListener('click', () => this.initializeServiceSelector(true));

      const actionButtons = document.createElement('div');
      actionButtons.style.cssText = 'display: flex; gap: 8px;';

      this.serviceSelectorCancelButton = document.createElement('button');
      this.serviceSelectorCancelButton.textContent = 'Cancel';
      this.serviceSelectorCancelButton.style.cssText = `
      font-size: 12px;
      padding: 8px 16px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.35);
      background: transparent;
      cursor: pointer;
      transition: all 0.2s ease;
    `;
      this.serviceSelectorCancelButton.addEventListener('click', () => this.closeServiceModal());

      this.serviceSelectorSaveButton = document.createElement('button');
      this.serviceSelectorSaveButton.textContent = 'Save';
      this.serviceSelectorSaveButton.style.cssText = `
      font-size: 12px;
      padding: 8px 18px;
      border-radius: 10px;
      border: none;
      cursor: pointer;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: white;
      font-weight: 600;
      transition: all 0.2s ease;
      box-shadow: 0 12px 24px rgba(99, 102, 241, 0.35);
    `;
      this.serviceSelectorSaveButton.addEventListener('click', () => this.handleServiceSave());

      actionButtons.appendChild(this.serviceSelectorCancelButton);
      actionButtons.appendChild(this.serviceSelectorSaveButton);

      actionRow.appendChild(this.serviceSelectorRetryButton);
      actionRow.appendChild(actionButtons);

      this.serviceModal.appendChild(title);
      this.serviceModal.appendChild(subtitle);
      this.serviceModal.appendChild(selector);
      this.serviceModal.appendChild(actionRow);

      this.serviceModalOverlay.appendChild(this.serviceModal);
      document.body.appendChild(this.serviceModalOverlay);

      this.updateServiceSelectorTheme();
      this.toggleServiceRetryButton(false);
    }

    initializeGuidedOnboarding() {
      this.onboardingCoach = new GuidedOnboarding({
        modeContainer: () => this.radioModeContainer,
        settingsButton: () => this.settingsButton,
        inputElement: () => this.input,
        textareaElement: () => this.input,
        executeButton: () => this.container?.querySelector('#execute-btn'),
        fileButton: () => this.radioModeButtons?.['import']?.button,
        closeButton: () => this.closeButton,
        onSelectMode: (mode) => this.selectMode(mode, true),
        onInsertPrompt: (prompt) => this.insertOnboardingPrompt(prompt),
        onOpenServiceModal: () => this.openServiceModal(),
        onRequestShow: () => {
          if (!this.isVisible) {
            this.show();
          }
        },
        onComplete: ({ status }) => {
          if (status === 'finished') {
            this.addOutput('🎉 初回ガイドを完了しました。メニューからいつでも再開できます。', 'system');
          }
        }
      });

      if (!this.hasBoundExternalEvents) {
        this.handleExternalOnboardingRequest = () => this.launchOnboarding(true);
        this.handleExternalShortcutsRequest = () => this.showShortcutGuide();
        window.addEventListener('chocodrop:request-onboarding', this.handleExternalOnboardingRequest);
        window.addEventListener('chocodrop:show-shortcuts-request', this.handleExternalShortcutsRequest);
        this.hasBoundExternalEvents = true;
      }

      if (this.config.showGuidedOnboarding !== false) {
        setTimeout(() => this.onboardingCoach?.start({ force: false }), 600);
      }
    }

    openServiceModal(forceFetch = false) {
      if (!this.serviceModalOverlay) {
        this.createServiceModal();
      }

      this.serviceModalOverlay.style.display = 'flex';
      requestAnimationFrame(() => {
        if (this.serviceModalOverlay) {
          this.serviceModalOverlay.style.opacity = '1';
        }
      });

      this.resetPendingSelections();
      this.initializeServiceSelector(forceFetch);
    }

    closeServiceModal() {
      if (!this.serviceModalOverlay) {
        return;
      }

      this.serviceModalOverlay.style.opacity = '0';
      setTimeout(() => {
        if (this.serviceModalOverlay) {
          this.serviceModalOverlay.style.display = 'none';
        }
        this.resetPendingSelections();
      }, 150);
    }

    async initializeServiceSelector(force = false) {
      if (this.servicesLoading && !force) {
        return;
      }

      if (!this.client || typeof this.client.getAvailableServices !== 'function') {
        this.setServiceSelectorStatus('サービス情報を取得できませんでした（クライアント初期化待ちです）。右下の「再読み込み」で再取得できます。', 'error');
        this.toggleServiceRetryButton(true);
        this.setServiceButtonsEnabled(false);
        return;
      }

      this.servicesLoading = true;
      this.setServiceSelectorStatus('サービス情報を読み込んでいます...', 'info');
      this.toggleServiceRetryButton(false);
      this.setServiceButtonsEnabled(false);

      try {
        if (typeof this.client.ensureInitialized === 'function') {
          await this.client.ensureInitialized();
        }

        const response = await this.client.getAvailableServices();
        if (!response || response.success === false || !response.metadata) {
          throw new Error(response?.error || 'サービス情報が取得できませんでした');
        }

        this.availableImageServices = Array.isArray(response.metadata?.image) ? response.metadata.image : [];
        this.availableVideoServices = Array.isArray(response.metadata?.video) ? response.metadata.video : [];

        this.selectedImageService = this.resolveServiceSelection(
          'image',
          this.availableImageServices,
          response.default?.image
        );

        this.selectedVideoService = this.resolveServiceSelection(
          'video',
          this.availableVideoServices,
          response.default?.video
        );

        this.pendingImageService = this.selectedImageService;
        this.pendingVideoService = this.selectedVideoService;

        this.populateServiceSelector();
        this.applyServiceSelectionToSceneManager();
        this.setServiceButtonsEnabled(true);
      } catch (error) {
        console.error('❌ Failed to initialize service selector:', error);
        this.setServiceSelectorStatus('サービス情報を取得できませんでした。サーバーが起動しているか確認のうえ、再読み込みしてください。', 'error');
        this.toggleServiceRetryButton(true);
        this.setServiceButtonsEnabled(false);
      } finally {
        this.servicesLoading = false;
      }
    }

    setServiceSelectorStatus(message, type = 'info') {
      if (!this.serviceSelectorStatus) {
        return;
      }
      this.serviceSelectorStatus.textContent = message;
      this.serviceSelectorStatus.dataset.statusType = type;
      this.serviceSelectorStatus.classList.toggle('service-selector-helper', type !== 'error');
      this.updateServiceSelectorTheme();
    }

    toggleServiceRetryButton(visible) {
      if (!this.serviceSelectorRetryButton) {
        return;
      }
      this.serviceSelectorRetryButton.style.display = visible ? 'inline-flex' : 'none';
      this.updateServiceSelectorTheme();
    }

    resolveServiceSelection(type, services, defaultId) {
      if (!services || services.length === 0) {
        return null;
      }

      const storageKey = type === 'image' ? IMAGE_SERVICE_STORAGE_KEY$1 : VIDEO_SERVICE_STORAGE_KEY$1;
      let storedId = null;
      try {
        storedId = localStorage.getItem(storageKey);
      } catch (error) {
        console.warn('⚠️ Failed to access localStorage:', error);
      }

      const isStoredValid = storedId && services.some(service => service.id === storedId);
      let resolvedId = isStoredValid ? storedId : null;

      if (!resolvedId && defaultId && services.some(service => service.id === defaultId)) {
        resolvedId = defaultId;
      }

      if (!resolvedId) {
        resolvedId = services[0]?.id || null;
      }

      try {
        if (resolvedId) {
          localStorage.setItem(storageKey, resolvedId);
        } else {
          localStorage.removeItem(storageKey);
        }
      } catch (error) {
        console.warn('⚠️ Failed to persist service selection:', error);
      }

      return resolvedId;
    }

    populateServiceSelector() {
      if (!this.serviceSelectorContent) {
        return;
      }

      this.serviceSelectorContent.innerHTML = '';

      const hasImage = this.availableImageServices.length > 0;
      const hasVideo = this.availableVideoServices.length > 0;

      if (!hasImage && !hasVideo) {
        this.setServiceSelectorStatus('利用可能なサービスが見つかりませんでした。', 'error');
        return;
      }

      this.setServiceSelectorStatus('利用するサービスを選択してください。', 'info');

      if (hasImage) {
        const imageRow = this.buildServiceRow('image', '画像 (T2I)', this.availableImageServices, this.pendingImageService || this.selectedImageService);
        this.serviceSelectorContent.appendChild(imageRow);
      }

      if (hasVideo) {
        const videoRow = this.buildServiceRow('video', '動画 (T2V)', this.availableVideoServices, this.pendingVideoService || this.selectedVideoService);
        this.serviceSelectorContent.appendChild(videoRow);
      }

      this.updateServiceSelectorTheme();
    }

    buildServiceRow(type, labelText, services, selectedId) {
      const row = document.createElement('div');
      row.className = `service-row service-row-${type}`;
      row.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 12px;
    `;

      const label = document.createElement('label');
      label.textContent = labelText;
      label.style.fontSize = '13px';
      label.style.fontWeight = '600';
      row.appendChild(label);

      const select = document.createElement('select');
      select.dataset.serviceType = type;
      select.style.fontFamily = 'inherit';
      select.style.width = '100%';

      services.forEach(service => {
        const option = document.createElement('option');
        option.value = service.id;
        option.textContent = service.name || service.id;
        if (service.description) {
          option.title = service.description;
        }
        select.appendChild(option);
      });

      if (selectedId && services.some(service => service.id === selectedId)) {
        select.value = selectedId;
      }

      select.addEventListener('change', (event) => {
        this.onServiceSelectionChange(type, event.target.value);
      });

      row.appendChild(select);

      const description = document.createElement('div');
      description.className = 'service-description';
      description.textContent = this.findServiceInfo(type, select.value)?.description || '';
      description.style.fontSize = '11px';
      description.style.opacity = '0.75';
      description.style.lineHeight = '1.4';
      description.style.minHeight = '14px';
      row.appendChild(description);

      select.addEventListener('change', () => {
        description.textContent = this.findServiceInfo(type, select.value)?.description || '';
      });

      if (type === 'image') {
        this.imageServiceSelect = select;
      } else {
        this.videoServiceSelect = select;
      }

      return row;
    }

    onServiceSelectionChange(type, serviceId) {
      if (type === 'image') {
        this.pendingImageService = serviceId;
      } else {
        this.pendingVideoService = serviceId;
      }

      const info = this.findServiceInfo(type, serviceId);
      const description = type === 'image'
        ? this.imageServiceSelect?.parentElement?.querySelector('.service-description')
        : this.videoServiceSelect?.parentElement?.querySelector('.service-description');

      if (description) {
        description.textContent = info?.description || '';
      }
    }

    handleServiceSave() {
      const newImageId = this.pendingImageService || this.selectedImageService;
      const newVideoId = this.pendingVideoService || this.selectedVideoService;

      if (newImageId) {
        try {
          localStorage.setItem(IMAGE_SERVICE_STORAGE_KEY$1, newImageId);
        } catch (error) {
          console.warn('⚠️ Failed to persist image service selection:', error);
        }
        this.selectedImageService = newImageId;
        this.sceneManager?.setImageService(newImageId);
      }

      if (newVideoId) {
        try {
          localStorage.setItem(VIDEO_SERVICE_STORAGE_KEY$1, newVideoId);
        } catch (error) {
          console.warn('⚠️ Failed to persist video service selection:', error);
        }
        this.selectedVideoService = newVideoId;
        this.sceneManager?.setVideoService(newVideoId);
      }

      const imageInfo = this.findServiceInfo('image', newImageId);
      const videoInfo = this.findServiceInfo('video', newVideoId);

      if (imageInfo) {
        this.addOutput(`🖼️ 画像サービスを「${imageInfo.name}」に設定しました`, 'system');
      }
      if (videoInfo) {
        this.addOutput(`🎬 動画サービスを「${videoInfo.name}」に設定しました`, 'system');
      }

      this.closeServiceModal();
    }

    setServiceButtonsEnabled(enabled) {
      if (this.serviceSelectorSaveButton) {
        this.serviceSelectorSaveButton.disabled = !enabled;
        this.serviceSelectorSaveButton.style.opacity = enabled ? '1' : '0.6';
        this.serviceSelectorSaveButton.style.cursor = enabled ? 'pointer' : 'not-allowed';
      }
    }

    resetPendingSelections() {
      this.pendingImageService = this.selectedImageService;
      this.pendingVideoService = this.selectedVideoService;

      if (this.imageServiceSelect && this.selectedImageService) {
        this.imageServiceSelect.value = this.selectedImageService;
      }
      if (this.videoServiceSelect && this.selectedVideoService) {
        this.videoServiceSelect.value = this.selectedVideoService;
      }

      if (this.serviceSelectorContent && this.serviceSelectorContent.childElementCount > 0) {
        this.populateServiceSelector();
      }
    }

    findServiceInfo(type, serviceId) {
      const list = type === 'image' ? this.availableImageServices : this.availableVideoServices;
      return list.find(service => service.id === serviceId) || null;
    }

    applyServiceSelectionToSceneManager() {
      if (!this.sceneManager) {
        return;
      }
      this.sceneManager.setImageService(this.selectedImageService);
      this.sceneManager.setVideoService(this.selectedVideoService);
    }

    updateServiceSelectorTheme() {
      if (this.serviceModalOverlay) {
        this.serviceModalOverlay.style.background = this.isDarkMode
          ? 'rgba(8, 11, 26, 0.55)'
          : 'rgba(229, 231, 255, 0.45)';
      }

      if (this.serviceModal) {
        this.serviceModal.style.background = this.isDarkMode
          ? 'rgba(17, 24, 39, 0.15)'
          : 'rgba(255, 255, 255, 0.15)';
        this.serviceModal.style.border = this.isDarkMode
          ? '1px solid rgba(129, 140, 248, 0.4)'
          : '1px solid rgba(99, 102, 241, 0.25)';
        this.serviceModal.style.color = this.isDarkMode ? '#e5e7ff' : '#1f2937';
      }

      if (this.serviceSelectorStatus) {
        const type = this.serviceSelectorStatus.dataset?.statusType;
        const statusColor = type === 'error'
          ? (this.isDarkMode ? '#fca5a5' : '#b91c1c')
          : (this.isDarkMode ? 'rgba(209, 213, 219, 0.8)' : 'rgba(55, 65, 81, 0.75)');
        this.serviceSelectorStatus.style.color = statusColor;
      }

      if (this.serviceSelectorContainer) {
        const labels = this.serviceSelectorContainer.querySelectorAll('label');
        labels.forEach(label => {
          label.style.color = this.isDarkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(31, 41, 55, 0.9)';
        });

        const selects = this.serviceSelectorContainer.querySelectorAll('select');
        selects.forEach(select => {
          select.style.background = this.isDarkMode ? 'rgba(99, 102, 241, 0.18)' : 'rgba(99, 102, 241, 0.12)';
          select.style.border = this.isDarkMode ? '1px solid rgba(129, 140, 248, 0.45)' : '1px solid rgba(99, 102, 241, 0.45)';
          select.style.color = this.isDarkMode ? '#ffffff' : '#1f2937';
          select.style.padding = '10px 12px';
          select.style.borderRadius = '10px';
          select.style.fontSize = '13px';
          select.style.outline = 'none';
          select.style.boxShadow = this.isDarkMode
            ? '0 12px 28px rgba(15, 23, 42, 0.5)'
            : '0 12px 24px rgba(99, 102, 241, 0.2)';
        });

        const descriptions = this.serviceSelectorContainer.querySelectorAll('.service-description');
        descriptions.forEach(desc => {
          desc.style.color = this.isDarkMode ? 'rgba(209, 213, 219, 0.8)' : 'rgba(55, 65, 81, 0.7)';
        });
      }

      if (this.serviceSelectorRetryButton) {
        this.serviceSelectorRetryButton.style.background = this.isDarkMode
          ? 'rgba(129, 140, 248, 0.35)'
          : 'rgba(99, 102, 241, 0.15)';
        this.serviceSelectorRetryButton.style.border = this.isDarkMode
          ? '1px solid rgba(129, 140, 248, 0.5)'
          : '1px solid rgba(99, 102, 241, 0.45)';
        this.serviceSelectorRetryButton.style.color = this.isDarkMode ? '#f9fafb' : '#1e1b4b';
        this.serviceSelectorRetryButton.style.boxShadow = this.isDarkMode
          ? '0 0 8px rgba(129, 140, 248, 0.45)'
          : '0 0 8px rgba(99, 102, 241, 0.35)';
      }

      if (this.serviceSelectorCancelButton) {
        this.serviceSelectorCancelButton.style.border = this.isDarkMode
          ? '1px solid rgba(209, 213, 219, 0.3)'
          : '1px solid rgba(148, 163, 184, 0.5)';
        this.serviceSelectorCancelButton.style.color = this.isDarkMode ? 'rgba(226, 232, 240, 0.85)' : 'rgba(30, 41, 59, 0.85)';
      }

      if (this.serviceSelectorSaveButton) {
        this.serviceSelectorSaveButton.style.background = this.isDarkMode
          ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
          : 'linear-gradient(135deg, #818cf8, #a855f7)';
        this.serviceSelectorSaveButton.style.boxShadow = this.isDarkMode
          ? '0 16px 28px rgba(99, 102, 241, 0.4)'
          : '0 16px 28px rgba(129, 140, 248, 0.35)';
      }
    }

    /**
     * ラジオボタン風モードセレクター作成
     */
    createRadioModeSelector() {
      const container = document.createElement('div');
      container.className = 'radio-mode-selector';
      container.style.cssText = `
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 12px;
      padding: 12px;
      background: ${this.isWabiSabiMode
        ? 'linear-gradient(135deg, rgba(158, 158, 158, 0.25), rgba(189, 189, 189, 0.2))'
        : (this.isDarkMode
          ? 'linear-gradient(135deg, rgba(30, 27, 75, 0.3), rgba(15, 23, 42, 0.4))'
          : 'linear-gradient(135deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.1))')};
      border: 1px solid ${this.isWabiSabiMode
        ? 'rgba(141, 110, 99, 0.4)'
        : (this.isDarkMode ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.25)')};
      border-radius: 16px;
      backdrop-filter: blur(12px);
      transition: all 0.3s ease;
      position: relative;
    `;

      const modes = [
        { value: 'generate', label: 'Generate', icon: '🚫', disabled: true },
        { value: 'import', label: 'Import', icon: '📥' },
        { value: 'modify', label: 'Modify', icon: '🔧' },
        { value: 'delete', label: 'Delete', icon: '🗑️' }
      ];

      this.radioModeButtons = {};

      modes.forEach(mode => {
        const button = document.createElement('div');
        button.className = `mode-option ${mode.value}`;
        button.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 10px 8px;
        border-radius: 12px;
        cursor: ${mode.disabled ? 'not-allowed' : 'pointer'};
        transition: all 0.2s ease;
        font-size: 11px;
        font-weight: 600;
        text-align: center;
        color: ${mode.disabled ? 'rgba(139, 92, 246, 0.6)' : this.isWabiSabiMode
          ? '#F5F5F5'
          : (this.isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(55, 65, 81, 0.8)')};
        background: transparent;
        border: 1px solid transparent;
        position: relative;
        opacity: ${mode.disabled ? '0.6' : '1'};
      `;

        const icon = document.createElement('div');
        icon.textContent = mode.icon;
        icon.style.cssText = `
        font-size: 16px;
        margin-bottom: 2px;
        filter: ${mode.disabled ? 'hue-rotate(240deg) saturate(0.8) brightness(1.1)' : this.isDarkMode 
          ? 'hue-rotate(220deg) saturate(0.8) brightness(1.2)' 
          : 'hue-rotate(240deg) saturate(0.7) brightness(0.9)'};
        transition: filter 0.2s ease;
      `;

        const label = document.createElement('span');
        label.textContent = mode.label;
        label.style.cssText = `
        opacity: 0;
        max-height: 0;
        overflow: hidden;
        transition: all 0.2s ease;
      `;

        // AUTOバッジを作成
        const autoBadge = document.createElement('div');
        autoBadge.className = 'auto-badge';
        autoBadge.textContent = 'AUTO';
        autoBadge.style.cssText = `
        position: absolute;
        top: -4px;
        right: -4px;
        font-size: 7px;
        font-weight: 700;
        padding: 2px 4px;
        background: linear-gradient(135deg, #10b981, #059669);
        color: white;
        border-radius: 6px;
        opacity: 0;
        transform: scale(0.8);
        transition: all 0.2s ease;
        display: none;
      `;

        button.appendChild(icon);
        button.appendChild(label);
        button.appendChild(autoBadge);

        // ホバーイベント（ラベル表示/非表示）
        button.addEventListener('mouseenter', () => {
          label.style.opacity = '1';
          label.style.maxHeight = '20px';
        });
        button.addEventListener('mouseleave', () => {
          label.style.opacity = '0';
          label.style.maxHeight = '0';
        });

        // イベント処理
        if (mode.disabled) {
          // クリック時のみコンパクトトースト表示
          button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showDemoMessage();
          });
        } else {
          // 通常のクリックイベント
          button.addEventListener('click', () => {
            if (mode.value === 'import') {
              this.triggerFileSelection();
            } else {
              this.selectMode(mode.value, true); // trueは手動選択を示す
            }
          });
        }

        this.radioModeButtons[mode.value] = { button, autoBadge };
        container.appendChild(button);
      });


      this.radioModeContainer = container;
      // デモページではImportを初期選択
      this.selectMode('import', false);

      return container;
    }

    /**
     * モード選択（ラジオボタンUI更新）
     */
    selectMode(mode, isManual = false, detectedKeyword = null) {
      this.currentMode = mode;

      // 全ボタンをリセット
      Object.keys(this.radioModeButtons).forEach(key => {
        const { button, autoBadge } = this.radioModeButtons[key];
        button.style.color = this.isWabiSabiMode
          ? '#F5F5F5'
          : (this.isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(55, 65, 81, 0.8)');
        button.style.background = 'transparent';
        button.style.border = '1px solid transparent';
        button.style.transform = 'scale(1)';
        button.style.boxShadow = 'none';
        // AUTOバッジを非表示
        autoBadge.style.display = 'none';
        autoBadge.style.opacity = '0';
      });

      // 選択されたボタンをハイライト（2025年仕様）
      const { button, autoBadge } = this.radioModeButtons[mode];
      
      // 2025 Glassmorphism選択状態
      const selectedGlass = this.isWabiSabiMode
        ? {
            background: 'linear-gradient(135deg, rgba(109, 76, 65, 0.2), rgba(141, 110, 99, 0.15))',
            border: '1px solid rgba(109, 76, 65, 0.4)',
            boxShadow: '0 4px 16px rgba(109, 76, 65, 0.25), inset 0 1px 0 rgba(245, 245, 220, 0.15)',
            color: '#F5F5F5'
          }
        : (this.isDarkMode
          ? {
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.15))',
              border: '1px solid rgba(99, 102, 241, 0.4)',
              boxShadow: '0 4px 16px rgba(99, 102, 241, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
              color: '#a5b4fc'
            }
          : {
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.08))',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              boxShadow: '0 4px 16px rgba(99, 102, 241, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
              color: '#6366f1'
            });

      button.style.color = selectedGlass.color;
      button.style.background = selectedGlass.background;
      button.style.border = selectedGlass.border;
      button.style.boxShadow = selectedGlass.boxShadow;
      button.style.transform = 'scale(1.02)';

      // AUTOバッジの表示制御
      if (!isManual && detectedKeyword) {
        // 自動切り替えの場合はAUTOバッジを表示
        autoBadge.style.display = 'inline-block';
        setTimeout(() => {
          autoBadge.style.opacity = '1';
          autoBadge.style.transform = 'scale(1)';
        }, 100);
        
        // 3秒後にフェードアウト
        setTimeout(() => {
          autoBadge.style.opacity = '0';
          autoBadge.style.transform = 'scale(0.8)';
          setTimeout(() => {
            autoBadge.style.display = 'none';
          }, 200);
        }, 3000);
      }

      // パルス効果を追加
      if (!isManual) {
        this.addPulseEffect(button);
        this.addContainerGlow(mode);
      }

      // プレースホルダー更新
      this.input.placeholder = this.getPlaceholderForMode(mode);

      // モード切り替え時の入力欄メッセージ上書き機能
      if (isManual) {
        this.clearInputOnModeSwitch(mode);
      }

      // Importモード専用処理
      if (mode === 'import' || this.selectedFile) {
        this.showImportInterface();
      } else {
        this.hideImportInterface();
      }

      // Deleteモード専用処理
      if (mode === 'delete' && isManual) {
        this.handleDeleteModeSelection();
      }

      // Modifyモード専用処理
      if (mode === 'modify' && isManual) {
        this.handleModifyModeSelection();
      }

      // モード切り替えメッセージは表示しない（UIで分かるため）
    }

    /**
     * パルス効果を追加
     */
    addPulseEffect(element) {
      // 既存のアニメーションをリセット
      element.style.animation = 'none';
      
      // 少し遅らせてからアニメーションを適用（リフロー強制）
      setTimeout(() => {
        element.style.animation = 'smartModePulse 0.6s ease-out';
      }, 10);
      
      // アニメーション終了後にクリーンアップ
      setTimeout(() => {
        element.style.animation = '';
      }, 610);
      
      // CSSアニメーションを動的に追加（まだ存在しない場合）
      this.ensurePulseAnimation();
    }

    /**
     * パルスアニメーション用CSSを確保
     */
    ensurePulseAnimation() {
      if (document.getElementById('smart-mode-pulse-animation')) return;
      
      const style = document.createElement('style');
      style.id = 'smart-mode-pulse-animation';
      style.textContent = `
      @keyframes smartModePulse {
        0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(236, 72, 153, 0.7); }
        70% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(236, 72, 153, 0); }
        100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(236, 72, 153, 0); }
      }
    `;
      document.head.appendChild(style);
    }

    /**
     * コンテナグロー効果
     */
    addContainerGlow(mode) {
      const container = this.radioModeContainer;
      if (!container) return;

      // モードに応じてグロー色を設定
      const glowColors = this.isWabiSabiMode ? {
        generate: 'rgba(139, 195, 74, 0.4)',  // 侘び寂びモード：チャット欄と同じ緑
        import: 'rgba(139, 195, 74, 0.4)',    // 侘び寂びモード：チャット欄と同じ緑
        modify: 'rgba(139, 195, 74, 0.4)',    // 侘び寂びモード：チャット欄と同じ緑
        delete: 'rgba(139, 195, 74, 0.4)'     // 侘び寂びモード：チャット欄と同じ緑
      } : {
        generate: 'rgba(79, 70, 229, 0.4)',   // ライト/ダークモード：元の紫
        import: 'rgba(34, 197, 94, 0.4)',     // ライト/ダークモード：元の緑
        modify: 'rgba(236, 72, 153, 0.4)',    // ライト/ダークモード：元のピンク
        delete: 'rgba(107, 114, 128, 0.3)'    // ライト/ダークモード：元のグレー
      };

      // 一時的にグロー効果を適用
      const glowColor = glowColors[mode];
      if (glowColor) {
        container.style.boxShadow = `0 0 20px ${glowColor}, 0 0 40px ${glowColor}`;
        container.style.borderColor = glowColor.replace('0.4', '0.6').replace('0.3', '0.5');
      }
      
      // 1秒後にグロー効果を除去
      setTimeout(() => {
        container.style.boxShadow = '';
        container.style.borderColor = this.isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.15)';
      }, 1000);
    }

    getActionButtonStyles(variant = 'secondary') {
      const baseStyles = `
      border: none;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s ease;
      font-family: inherit;
      outline: none;
      font-weight: 500;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    `;

      if (variant === 'primary') {
        const background = this.isWabiSabiMode
          ? 'linear-gradient(135deg, rgba(139, 195, 74, 0.95), rgba(104, 159, 56, 0.9))'
          : (this.isDarkMode
            ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.9), rgba(236, 72, 153, 0.9))'
            : 'linear-gradient(135deg, rgba(79, 70, 229, 0.92), rgba(196, 181, 253, 0.9))');
        const border = this.isWabiSabiMode
          ? 'rgba(85, 139, 47, 0.7)'
          : (this.isDarkMode ? 'rgba(129, 140, 248, 0.55)' : 'rgba(99, 102, 241, 0.45)');
        return baseStyles + `
        width: 96px;
        height: 36px;
        padding: 8px 14px;
        font-size: 12px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        background: ${background};
        border: 1px solid ${border};
        color: #ffffff;
        box-shadow: 0 8px 18px rgba(37, 99, 235, 0.25);
        text-align: center;
        white-space: nowrap;
      `;
      }

      if (variant === 'secondary') {
        // Clear All, History ボタン用 - 美しい配置と統一感
        return baseStyles + `
        width: 90px;
        height: 36px;
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        background: ${this.isWabiSabiMode
          ? 'linear-gradient(135deg, rgba(141, 110, 99, 0.3), rgba(109, 76, 65, 0.2))'
          : (this.isDarkMode
            ? 'linear-gradient(135deg, rgba(55, 65, 81, 0.3), rgba(75, 85, 99, 0.2))'
            : 'linear-gradient(135deg, rgba(255, 255, 255, 0.25), rgba(255, 255, 255, 0.15))')};
        border: 1px solid ${this.isWabiSabiMode
          ? 'rgba(93, 64, 55, 0.6)'
          : (this.isDarkMode ? 'rgba(156, 163, 175, 0.2)' : 'rgba(255, 255, 255, 0.3)')};
        color: ${this.isWabiSabiMode
          ? '#F5F5F5'
          : (this.isDarkMode ? '#d1d5db' : '#374151')};
        text-align: center;
        white-space: nowrap;
      `;
      } else if (variant === 'icon') {
        // テーマトグル、設定ボタン用
        return baseStyles + `
        width: 32px;
        height: 32px;
        padding: 0;
        font-size: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: ${this.isDarkMode 
          ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.1))'
          : 'linear-gradient(135deg, rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.2))'};
        border: 1px solid ${this.isDarkMode ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.4)'};
        color: ${this.isDarkMode ? '#a5b4fc' : '#6366f1'};
      `;
      }
    }

    /**
     * 破壊的アクション用ボタンスタイル（赤系ガラス効果）
     */
    getDestructiveButtonStyles() {
      return `
      min-width: 50px;
      height: 32px;
      border: 1px solid ${this.isDarkMode ? 'rgba(220, 38, 127, 0.4)' : 'rgba(190, 24, 93, 0.35)'};
      border-radius: 6px;
      background: ${this.isDarkMode ? 'rgba(220, 38, 127, 0.3)' : 'rgba(190, 24, 93, 0.25)'};
      color: ${this.isDarkMode ? '#fca5a5' : '#dc2626'};
      cursor: pointer;
      transition: all 0.2s ease;
      font-family: inherit;
      outline: none;
      font-size: 11px;
      font-weight: 500;
      padding: 0 8px;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    `;
    }

    getCommandTypeIndicatorStyles() {
      return `
      padding: 4px 0;
      margin-bottom: 0;
      font-size: 11px;
      font-weight: 400;
      text-align: left;
      color: ${this.isDarkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)'};
      transition: all 0.3s ease;
      border: none;
      background: none;
    `;
    }

    /**
     * テキストエリアの自動リサイズ処理（最大2行）
     */
    autoResizeTextarea() {
      // 高さをリセットして正確な scrollHeight を取得
      this.input.style.height = 'auto';
      
      // 現在のコンテンツに基づいて高さを計算
      const lineHeight = 22; // CSS で設定した line-height
      const padding = 28; // 上下のパディング合計 (14px * 2)
      const maxLines = 2;
      const maxHeight = (lineHeight * maxLines) + padding;
      
      // スクロール高さに基づいて新しい高さを決定
      const newHeight = Math.min(this.input.scrollHeight, maxHeight);
      
      // 高さを適用
      this.input.style.height = newHeight + 'px';
      
      // 2行を超える場合はスクロールを有効化と展開ボタン表示
      if (this.input.scrollHeight > maxHeight) {
        this.input.style.overflowY = 'auto';
        // 展開ボタンを表示
        if (this.expandButton) {
          this.expandButton.style.display = 'flex';
        }
      } else {
        this.input.style.overflowY = 'hidden';
        // 展開ボタンを非表示
        if (this.expandButton) {
          this.expandButton.style.display = 'none';
        }
      }
    }

    /**
     * リアルタイムコマンドタイプ検出
     */
    detectCommandType() {
      const input = this.input.value.trim();
      if (!input) {
        this.selectMode('generate', false);
        return;
      }

      const commandType = this.analyzeCommandType(input);

      // Delete/Modifyは手動選択を優先、自動切り替えしない
      if (this.currentMode === 'delete' || this.currentMode === 'modify') {
        return; // 現在のモードを維持
      }
      // Generate/Importのみ自動切り替え
      this.selectMode(commandType.type, false, commandType.detectedKeyword);
    }

    /**
     * ルールベースコマンド分析
     */
    analyzeCommandType(text) {
      this.logDebug(`🔍 Analyzing command: "${text}"`);

      // メディアタイプの検出
      const mediaInfo = this.detectMediaType(text);
      
      // 削除コマンドの検出
      const deletePatterns = [
        { pattern: /削除/, keyword: '削除' },
        { pattern: /消去/, keyword: '消去' },
        { pattern: /消して/, keyword: '消して' },
        { pattern: /消す/, keyword: '消す' },
        { pattern: /取り除/, keyword: '取り除' },
        { pattern: /除去/, keyword: '除去' },
        { pattern: /削除して/, keyword: '削除して' },
        { pattern: /delete/i, keyword: 'delete' },
        { pattern: /remove/i, keyword: 'remove' },
        { pattern: /clear/i, keyword: 'clear' },
        { pattern: /erase/i, keyword: 'erase' }
      ];
      
      // 変更・移動コマンドの検出
      const modifyPatterns = [
        { pattern: /移動/, keyword: '移動' },
        { pattern: /動かして/, keyword: '動かして' },
        { pattern: /変更/, keyword: '変更' },
        { pattern: /変えて/, keyword: '変えて' },
        { pattern: /修正/, keyword: '修正' },
        { pattern: /調整/, keyword: '調整' },
        { pattern: /回転/, keyword: '回転' },
        { pattern: /反転/, keyword: '反転' },
        { pattern: /ミラー/, keyword: 'ミラー' },
        { pattern: /傾け/, keyword: '傾け' },
        { pattern: /向きを変え/, keyword: '向きを変え' },
        { pattern: /向きを変更/, keyword: '向きを変更' },
        { pattern: /左右(逆|反転)/, keyword: '左右反転' },
        { pattern: /上下(逆|反転)/, keyword: '上下反転' },
        { pattern: /逆さ/, keyword: '逆さ' },
        { pattern: /ひっくり返/, keyword: 'ひっくり返す' },
        { pattern: /.*を.*色/, keyword: '色変更' },
        { pattern: /.*を.*サイズ/, keyword: 'サイズ変更' },
        { pattern: /を.*に.*して/, keyword: '変更' },
        { pattern: /move/i, keyword: 'move' },
        { pattern: /change/i, keyword: 'change' },
        { pattern: /modify/i, keyword: 'modify' },
        { pattern: /edit/i, keyword: 'edit' }
      ];
      
      // 生成コマンドの検出（デフォルト）
      const generatePatterns = [
        { pattern: /作って/, keyword: '作って' },
        { pattern: /生成/, keyword: '生成' },
        { pattern: /作成/, keyword: '作成' },
        { pattern: /描いて/, keyword: '描いて' },
        { pattern: /書いて/, keyword: '書いて' },
        { pattern: /create/i, keyword: 'create' },
        { pattern: /generate/i, keyword: 'generate' },
        { pattern: /make/i, keyword: 'make' },
        { pattern: /draw/i, keyword: 'draw' }
      ];

      // 削除パターンチェック
      for (const { pattern, keyword } of deletePatterns) {
        if (pattern.test(text)) {
          this.logDebug(`✅ Delete pattern matched: ${keyword}`);
          return {
            type: 'delete',
            confidence: 0.9,
            reason: '削除キーワードを検出',
            mediaType: mediaInfo.type,
            requiresConfirmation: true,
            detectedKeyword: keyword
          };
        }
      }
      
      // 変更パターンチェック
      for (const { pattern, keyword } of modifyPatterns) {
        if (pattern.test(text)) {
          this.logDebug(`✅ Modify pattern matched: ${keyword}`);
          return {
            type: 'modify',
            confidence: 0.8,
            reason: '変更キーワードを検出',
            mediaType: mediaInfo.type,
            requiresConfirmation: false,
            detectedKeyword: keyword
          };
        }
      }
      
      // 生成パターンチェック
      for (const { pattern, keyword } of generatePatterns) {
        if (pattern.test(text)) {
          return {
            type: 'generate',
            confidence: mediaInfo.confidence,
            reason: mediaInfo.reason,
            mediaType: mediaInfo.type,
            requiresConfirmation: false,
            detectedKeyword: keyword
          };
        }
      }
      
      // デフォルト（生成モード）
      this.logDebug(`ℹ️ No specific pattern matched, defaulting to generate mode`);
      return {
        type: 'generate',
        confidence: mediaInfo.confidence,
        reason: mediaInfo.reason,
        mediaType: mediaInfo.type,
        requiresConfirmation: false,
        detectedKeyword: null
      };
    }

    /**
     * メディアタイプ検出（画像/動画）
     */
    detectMediaType(text) {
      const videoPatterns = [
        /動画|ビデオ|映像|ムービー/,
        /video|movie|clip/i
      ];
      
      const imagePatterns = [
        /画像|写真|絵|イラスト|イメージ/,
        /image|picture|photo|illustration/i
      ];
      
      if (videoPatterns.some(pattern => pattern.test(text))) {
        return {
          type: 'video',
          confidence: 0.8,
          reason: '動画生成コマンド'
        };
      }
      
      if (imagePatterns.some(pattern => pattern.test(text))) {
        return {
          type: 'image',
          confidence: 0.8,
          reason: '画像生成コマンド'
        };
      }
      
      // デフォルトは画像
      return {
        type: 'image',
        confidence: 0.6,
        reason: '生成コマンド（画像デフォルト）'
      };
    }

    /**
     * コマンドタイプインジケーター表示
     */
    showCommandTypeIndicator(commandInfo) {
      const { type, confidence, reason } = commandInfo;
      
      // Proactive UX: 低信頼度時に提案表示
      if (confidence < 0.7) {
        this.showProactiveSuggestion(type, confidence);
      } else {
        this.hideProactiveSuggestion();
      }
      
      // 旧コマンドタイプインジケーターは削除（ラジオボタンUIに統合済み）
      // this.commandTypeIndicator.textContent = `◯ ${typeLabels[type].replace('🎨 ', '').replace('✏️ ', '').replace('🗑️ ', '')}`;
      // this.commandTypeIndicator.style.display = 'block';
      // this.commandTypeIndicator.style.cursor = 'default';
      
      // スワイプジェスチャー対応
      this.enableGestureControl();
    }

    /**
     * Proactive UX: 低信頼度時の提案表示
     */
    showProactiveSuggestion(detectedType, confidence) {
      if (!this.proactiveSuggestion) {
        this.proactiveSuggestion = document.createElement('div');
        this.proactiveSuggestion.id = 'proactive-suggestion';
        this.proactiveSuggestion.style.cssText = `
        margin-bottom: 0;
        padding: 10px;
        background: rgba(255, 193, 7, 0.15);
        border: 1px solid rgba(255, 193, 7, 0.3);
        border-radius: 8px;
        font-size: 12px;
        color: #ffc107;
        text-align: center;
        cursor: pointer;
        transition: all 0.2s ease;
      `;
        // 旧コマンドタイプインジケーターは削除（ラジオボタンUIに統合済み）
        // 代わりに入力フィールドの前に挿入
        this.container.insertBefore(this.proactiveSuggestion, this.input);
      }

      const alternativeTypes = ['generate', 'modify', 'delete'].filter(t => t !== detectedType);
      const suggestion = alternativeTypes[0]; // 最初の代替案

      const suggestionLabels = {
        generate: '🎨 生成',
        modify: '✏️ 変更', 
        delete: '🗑️ 削除'
      };

      this.proactiveSuggestion.innerHTML = `
      💡 もしかして「${suggestionLabels[suggestion]}モード」ですか？
      <div style="margin-top: 4px; font-size: 10px; opacity: 0.8;">
        クリックで変更 | スワイプで選択
      </div>
    `;
      
      this.proactiveSuggestion.style.display = 'block';
      
      // クリックで提案モードに変更
      this.proactiveSuggestion.onclick = () => {
        this.currentMode = suggestion;
        this.hideProactiveSuggestion();
        this.updateIndicatorForMode(suggestion, 0.9);
      };
    }

    /**
     * Proactive UX提案を非表示
     */
    hideProactiveSuggestion() {
      if (this.proactiveSuggestion) {
        this.proactiveSuggestion.style.display = 'none';
      }
    }

    /**
     * 指定モードでインジケーター更新
     */
    updateIndicatorForMode(mode, confidence) {

      // 旧コマンドタイプインジケーターは削除（ラジオボタンUIに統合済み）
      // this.commandTypeIndicator.textContent = `◯ ${typeLabels[mode].replace('🎨 ', '').replace('✏️ ', '').replace('🗑️ ', '')}`;
    }

    /**
     * ジェスチャーコントロール有効化
     */
    enableGestureControl() {
      // 旧スワイプジェスチャー機能は削除（ラジオボタンUIに統合済み）
      // ラジオボタンで直接モード選択可能になったため、スワイプ操作は不要
      this.gestureEnabled = true;
    }

    /**
     * アクションボタン作成
     */
    createActionButtons() {
      const container = document.createElement('div');
      container.style.cssText = `
      display: flex;
      margin-top: 8px;
      gap: 8px;
    `;

      // 履歴ボタン削除 - タスク進行状況に置き換え済み

      // クリアオールボタン
      const clearBtn = document.createElement('button');
      clearBtn.innerHTML = '🧹 全削除';
      clearBtn.style.cssText = this.getModernButtonStyles('danger');
      clearBtn.addEventListener('click', () => this.clearAll());

      // historyBtn削除済み
      container.appendChild(clearBtn);

      return container;
    }

    /**
     * スタイル定義
     */
    getContainerStyles() {
      const positions = {
        'bottom-right': 'bottom: 20px; right: 20px;',
        'bottom-left': 'bottom: 20px; left: 20px;',
        'top-right': 'top: 20px; right: 20px;',
        'top-left': 'top: 20px; left: 20px;',
        'center': 'top: 50%; left: 50%; transform: translate(-50%, -50%);'
      };

      // 2025 Glassmorphism仕様：ダーク・ライト両対応
      const glassmorphismDark = {
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.7), rgba(30, 27, 75, 0.65))',
        backdropFilter: 'blur(24px) saturate(180%)',
        border: '1px solid rgba(99, 102, 241, 0.2)',
        boxShadow: '0 8px 32px rgba(15, 23, 42, 0.4), 0 0 0 1px rgba(99, 102, 241, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
      };

      const glassmorphismLight = {
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.25), rgba(255, 255, 255, 0.15))',
        backdropFilter: 'blur(24px) saturate(180%)',
        border: '1px solid rgba(255, 255, 255, 0.4)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(255, 255, 255, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)'
      };

      // 侘び寂びモード - 枯山水の静寂：独自のアイデンティティ
      const glassmorphismWabiSabi = {
        background: 'linear-gradient(135deg, rgba(97, 97, 97, 0.7), rgba(66, 66, 66, 0.6))',
        backdropFilter: 'blur(20px) saturate(120%)',
        border: '1px solid rgba(93, 64, 55, 0.5)',
        boxShadow: '0 8px 32px rgba(33, 33, 33, 0.4), 0 0 0 1px rgba(93, 64, 55, 0.4), inset 0 1px 0 rgba(189, 189, 189, 0.15)'
      };

      const theme = this.isWabiSabiMode ? glassmorphismWabiSabi : (this.isDarkMode ? glassmorphismDark : glassmorphismLight);

      return `
      position: fixed;
      ${positions[this.config.position] || positions['bottom-right']}
      width: 320px;
      max-height: ${this.config.maxHeight}px;
      background: ${theme.background};
      border: ${theme.border};
      border-radius: 20px;
      color: ${this.isWabiSabiMode ? '#F5F5F5' : (this.isDarkMode ? '#ffffff' : '#1f2937')};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', sans-serif;
      font-size: 14px;
      z-index: 1000;
      padding: 16px !important;
      box-shadow: ${theme.boxShadow};
      backdrop-filter: ${theme.backdropFilter};
      -webkit-backdrop-filter: ${theme.backdropFilter};
      display: none;
      flex-direction: column;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    `;
    }

    getHeaderStyles() {
      // ダークモードと同じ紫グラデーションで統一
      const gradientColors = 'linear-gradient(135deg, #4f46e5, #7c3aed)';

      return `
      margin-bottom: 20px;
      text-align: center;
      background: ${gradientColors};
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      font-weight: 800;
      font-size: 18px;
      border-bottom: 1px solid rgba(79, 70, 229, 0.2);
      padding-bottom: 12px;
    `;
    }

    getOutputStyles() {
      // カスタムスクロールバーのCSSを注入
      this.addScrollbarStyles();

      return `
      height: 200px;
      overflow-y: auto;
      background: ${this.isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.1)'};
      border: 1px solid ${this.isDarkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.2)'};
      border-radius: 12px;
      padding: 12px;
      margin-bottom: 16px;
      font-size: 12px;
      line-height: 1.4;
      backdrop-filter: blur(8px);

      /* カスタムスクロールバーのスタイル */
      scrollbar-width: thin;
      scrollbar-color: ${this.isDarkMode ? 'rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.3) rgba(0, 0, 0, 0.1)'};
    `;
    }

    /**
     * スクロールバーのカスタムスタイルをページに注入
     */
    addScrollbarStyles() {
      if (document.getElementById('custom-scrollbar-styles')) return;

      const style = document.createElement('style');
      style.id = 'custom-scrollbar-styles';
      style.textContent = `
      .command-output::-webkit-scrollbar {
        width: 8px;
      }

      .command-output::-webkit-scrollbar-track {
        background: ${this.isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'};
        border-radius: 4px;
      }

      .command-output::-webkit-scrollbar-thumb {
        background: ${this.isDarkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)'};
        border-radius: 4px;
        transition: background 0.2s ease;
      }

      .command-output::-webkit-scrollbar-thumb:hover {
        background: ${this.isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)'};
      }

      /* ダークモード用 */
      .dark-mode .command-output::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.1);
      }

      .dark-mode .command-output::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.3);
      }

      .dark-mode .command-output::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.5);
      }

      /* ライトモード用 */
      .light-mode .command-output::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.1);
      }

      .light-mode .command-output::-webkit-scrollbar-thumb {
        background: rgba(0, 0, 0, 0.3);
      }

      .light-mode .command-output::-webkit-scrollbar-thumb:hover {
        background: rgba(0, 0, 0, 0.5);
      }

      @keyframes shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }

      /* タスクステータスコンテナのホバー効果 */
      .task-status-container:hover .progress-bar {
        box-shadow: 0 0 20px rgba(255,123,71,0.6) !important;
        transform: scaleY(1.1);
      }

      /* プログレスバーの微細なアニメーション */
      .progress-bar {
        position: relative;
      }

      .progress-bar::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(90deg, 
          transparent, 
          rgba(255,255,255,0.4), 
          transparent);
        animation: progress-shine 2s ease-in-out infinite;
      }

      @keyframes progress-shine {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
      }

      /* wabi-sabiモード用の入力フィールドフォーカススタイル */
      .wabisabi-mode textarea:focus,
      .wabisabi-mode input:focus {
        background: linear-gradient(135deg, rgba(97, 97, 97, 0.4), rgba(66, 66, 66, 0.3)) !important;
        border: 1px solid rgba(141, 110, 99, 0.6) !important;
        box-shadow: 0 4px 16px rgba(66, 66, 66, 0.3), inset 0 1px 0 rgba(189, 189, 189, 0.2), 0 0 0 2px rgba(141, 110, 99, 0.2) !important;
        color: #F5F5F5 !important;
        outline: none !important;
      }
    `;

      document.head.appendChild(style);
    }

    getInputStyles() {
      // 2025 Glassmorphism仕様：入力フィールド
      const glassmorphismDark = {
        background: 'linear-gradient(135deg, rgba(30, 27, 75, 0.4), rgba(15, 23, 42, 0.5))',
        border: '1px solid rgba(99, 102, 241, 0.25)',
        boxShadow: '0 4px 16px rgba(15, 23, 42, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.08)'
      };

      const glassmorphismLight = {
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.2))',
        border: '1px solid rgba(255, 255, 255, 0.5)',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.4)'
      };

      const glassmorphismWabiSabi = {
        background: 'linear-gradient(135deg, rgba(97, 97, 97, 0.4), rgba(66, 66, 66, 0.3))',
        border: '1px solid rgba(97, 97, 97, 0.5)',
        boxShadow: '0 4px 16px rgba(66, 66, 66, 0.3), inset 0 1px 0 rgba(189, 189, 189, 0.2)'
      };

      const theme = this.isWabiSabiMode ? glassmorphismWabiSabi : (this.isDarkMode ? glassmorphismDark : glassmorphismLight);

      return `
      width: 100%;
      padding: 14px 16px;
      background: ${theme.background};
      border: ${theme.border};
      border-radius: 14px;
      color: ${this.isWabiSabiMode ? '#F5F5F5' : (this.isDarkMode ? '#ffffff' : '#1f2937')};
      font-size: 14px;
      outline: none;
      box-sizing: border-box;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      font-family: inherit;
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      box-shadow: ${theme.boxShadow};
      placeholder-color: ${this.isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(55, 65, 81, 0.6)'};
      resize: none;
      overflow-y: hidden;
      min-height: 22px;
      max-height: 66px;
      line-height: 22px;
    `;
    }

    getModernButtonStyles(type) {
      const styles = {
        primary: this.isWabiSabiMode ? `
        background: linear-gradient(135deg, #8D6E63, #6D4C41);
        box-shadow: 0 4px 12px rgba(85, 139, 47, 0.4), inset 0 1px 0 rgba(184, 158, 135, 0.15);
        width: 100%;
        padding: 16px;
        font-size: 14px;
        font-weight: 600;
      ` : `
        background: linear-gradient(135deg, #4f46e5, #4338ca);
        width: 100%;
        padding: 16px;
        font-size: 14px;
        font-weight: 600;
      `,
        secondary: this.isWabiSabiMode ? `
        background: rgba(158, 158, 158, 0.2);
        border: 1px solid rgba(141, 110, 99, 0.4);
        flex: 1;
        padding: 12px;
        font-size: 13px;
        font-weight: 500;
        backdrop-filter: blur(8px);
        color: #F5F5F5;
      ` : `
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.2);
        flex: 1;
        padding: 12px;
        font-size: 13px;
        font-weight: 500;
        backdrop-filter: blur(8px);
      `,
        danger: this.isWabiSabiMode ? `
        background: rgba(141, 110, 99, 0.3);
        border: 1px solid rgba(93, 64, 55, 0.5);
        flex: 1;
        padding: 12px;
        font-size: 13px;
        font-weight: 500;
        backdrop-filter: blur(8px);
        color: #F5F5F5;
      ` : `
        background: rgba(255, 59, 48, 0.15);
        border: 1px solid rgba(255, 59, 48, 0.3);
        flex: 1;
        padding: 12px;
        font-size: 13px;
        font-weight: 500;
        backdrop-filter: blur(8px);
        color: #ff453a;
      `
      };

      return `
      border: none;
      border-radius: 12px;
      color: white;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      font-family: inherit;
      outline: none;
      ${styles[type]}
    `;
    }

    getModeButtonStyles(isActive, mode) {
      // モードカラー設定
      const modeColors = {
        generate: 'linear-gradient(135deg, #22c55e, #16a34a)', // Green - チャット欄と同じ緑色
        import: 'linear-gradient(135deg, #22c55e, #16a34a)',   // Green - チャット欄と同じ緑色
        modify: 'linear-gradient(135deg, #22c55e, #16a34a)',    // Green - チャット欄と同じ緑色
        delete: 'linear-gradient(135deg, #22c55e, #16a34a)'     // Green - チャット欄と同じ緑色
      };
      
      return `
      flex: 1;
      padding: 12px 16px;
      border: none;
      border-radius: 8px;
      color: ${isActive ? 'white' : (this.isWabiSabiMode ? '#F5F5F5' : 'rgba(255, 255, 255, 0.7)')};
      background: ${isActive ? modeColors[mode] : 'transparent'};
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      font-family: inherit;
      outline: none;
    `;
    }

    /**
     * イベントバインディング
     */
    bindEvents() {
      // キーボードショートカット
      document.addEventListener('keydown', (e) => {
        // 設定されたキーでUI表示切替
        if (e.key === this.config.activationKey) {
          e.preventDefault();
          this.toggle();
          return;
        }
        
        // Enterキー処理はinitUI()内で行うため、ここでは処理しない
        // （IME対応のため）
        
        // Escapeで非表示
        if (this.isVisible && e.key === 'Escape') {
          this.hide();
        }
        
        // Ctrl+Z/Ctrl+Y でUndo/Redo
        if (this.isVisible && e.ctrlKey) {
          if (e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            this.undo();
          } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
            e.preventDefault();
            this.redo();
          }
        }
      });

      // 入力フィールドのスタイル調整
      this.input.addEventListener('focus', () => {
        this.input.style.borderColor = '#74b9ff';
        this.input.style.boxShadow = '0 0 5px rgba(116, 185, 255, 0.5)';
      });

      this.input.addEventListener('blur', () => {
        this.input.style.borderColor = '#4a90e2';
        this.input.style.boxShadow = 'none';
      });
    }

    /**
     * UI表示/非表示切替
     */
    toggle() {
      if (this.isVisible) {
        this.hide();
      } else {
        this.show();
      }
    }

    launchOnboarding(force = false) {
      if (!this.onboardingCoach) {
        setTimeout(() => this.launchOnboarding(force), 120);
        return;
      }
      this.onboardingCoach.start({ force });
    }

    showShortcutGuide() {
      const shortcuts = [
        { key: this.config.activationKey || '@', description: 'ChocoDropの表示/非表示を切り替え' },
        { key: 'Ctrl / ⌘ + Enter', description: '現在のコマンドを実行' },
        { key: 'WASD + マウス', description: '撮影モードで視点を移動' },
        { key: 'Shift', description: '撮影モードで移動を加速' }
      ];

      if (!this.isVisible) {
        this.show();
      }

      const messageLines = shortcuts.map(item => ` • ${item.key} … ${item.description}`).join('\n');
      this.addOutput(`⌨️ ショートカットヒント\n${messageLines}`, 'system');
    }

    insertOnboardingPrompt(prompt) {
      if (!this.input) {
        return;
      }
      this.input.value = prompt;
      this.input.dispatchEvent(new Event('input', { bubbles: true }));
      this.addOutput('🪄 推奨プロンプトを挿入しました。必要に応じて調整してください。', 'system');
    }

    /**
     * UI表示
     */
    show() {
      this.container.style.display = 'flex';
      this.container.style.flexDirection = 'column';
      this.floatingContainer.style.display = 'flex';

      // UIフォームの位置に合わせて配置（少し遅延して正確な位置を取得）
      setTimeout(() => {
        const containerRect = this.container.getBoundingClientRect();
        this.floatingContainer.style.left = containerRect.left + 'px';
        this.floatingContainer.style.top = (containerRect.top - 80) + 'px';
        this.floatingContainer.style.width = containerRect.width + 'px';
        this.floatingContainer.style.transform = 'none';
      }, 50);

      this.isVisible = true;
      this.input.focus();

      // フォーム表示中はチョコアイコンを隠す
      if (this.floatingChocolateIcon) {
        this.floatingChocolateIcon.style.opacity = '0';
        this.floatingChocolateIcon.style.pointerEvents = 'none';
      }

      // コントロールを無効化
      this.onControlsToggle(true);
      // コントロール停止時も静かに
    }

    /**
     * UI非表示
     */
    hide() {
      this.container.style.display = 'none';
      this.floatingContainer.style.display = 'none';
      this.isVisible = false;

      // フォーム非表示時はチョコアイコンを再表示
      if (this.floatingChocolateIcon) {
        this.floatingChocolateIcon.style.opacity = '0.8';
        this.floatingChocolateIcon.style.pointerEvents = 'auto';
      }

      // コントロールを再有効化
      this.onControlsToggle(false);
      this.logDebug('🎮 コントロールを再開');
    }

    /**
     * モード切り替え
     */
    switchMode(mode) {
      if (this.currentMode === mode) return;
      
      this.currentMode = mode;
      
      // モードボタンのスタイル更新
      this.container.querySelectorAll('[data-mode]').forEach(btn => {
        const isActive = btn.dataset.mode === mode;
        btn.style.cssText = this.getModeButtonStyles(isActive, btn.dataset.mode);
      });
      
      // 入力フィールドのプレースホルダー更新
      this.input.placeholder = this.getPlaceholderForMode(mode);
      
      // 実行ボタンのラベルと色更新
      const executeBtn = this.container.querySelector('#execute-btn');
      const labels = {
        generate: '🎨 Generate Object',
        modify: '✏️ Apply Changes', 
        delete: '🗑️ Delete Objects'
      };
      
      const buttonColors = {
        generate: 'linear-gradient(135deg, #5b21b6, #4c1d95)',
        modify: 'linear-gradient(135deg, #ec4899, #be185d)', 
        delete: 'rgba(107, 114, 128, 0.15)'
      };
      
      executeBtn.innerHTML = `<span>${labels[mode]}</span>`;
      executeBtn.style.background = buttonColors[mode];
      
      // モード切り替え通知は不要（ボタンで分かるため）
    }
    
    /**
     * モード別プレースホルダー
     */
    getPlaceholderForMode(mode) {
      const placeholders = {
        generate: '「猫の画像を作って」と話しかけて ⏎ ✨',
        import: 'ファイルを選択して ⏎ 📁',
        modify: '選択後「透明に変更」と伝えて ⏎ ✏️',
        delete: '選択後、コマンドをそのまま送って ⏎ 🗑️'
      };
      return placeholders[mode] || placeholders.generate;
    }

    /**
     * デモ版専用: 向き・反転コマンドをローカルで処理
     */
    handleDemoOrientationCommand(command) {
      if (!this.sceneManager) {
        return null;
      }

      const normalized = command.toLowerCase();
      const wantsVerticalFlip = /上下|逆さ|さかさ|ひっくり返/.test(normalized);
      const wantsHorizontalFlip = /左右|向きを変え|向きを変更|横向き|ミラー|反転/.test(normalized);
      const wantsRotateRight = /右向き|右を向|右に向け/.test(normalized);
      const wantsRotateLeft = /左向き|左を向|左に向け/.test(normalized);
      const wantsRotateBack = /後ろ向き|反対向き|背中|180度|半回転/.test(normalized);

      const hasOrientationKeyword = wantsVerticalFlip || wantsHorizontalFlip || wantsRotateRight || wantsRotateLeft || wantsRotateBack;
      if (!hasOrientationKeyword) {
        return null;
      }

      let targetObject = this.sceneManager.selectedObject;
      if (!targetObject && typeof this.sceneManager.findObjectByKeyword === 'function') {
        targetObject = this.sceneManager.findObjectByKeyword(normalized);
        if (targetObject) {
          this.sceneManager.selectObject(targetObject);
        }
      }

      if (!targetObject) {
        this.addOutput('⚠️ 変更したいオブジェクトを先に選択してください。', 'warning');
        return { handled: true, result: { success: false, message: '対象オブジェクトが見つかりませんでした' } };
      }

      const operations = [];

      if (wantsHorizontalFlip) {
        const currentX = targetObject.scale.x === 0 ? 1 : targetObject.scale.x;
        targetObject.scale.x = -currentX;
        operations.push('左右反転');
      }

      if (wantsVerticalFlip) {
        const currentY = targetObject.scale.y === 0 ? 1 : targetObject.scale.y;
        targetObject.scale.y = -currentY;
        operations.push('上下反転');
      }

      if (wantsRotateRight) {
        targetObject.rotation.y = Math.PI / 2;
        operations.push('右向き');
      }

      if (wantsRotateLeft) {
        targetObject.rotation.y = -Math.PI / 2;
        operations.push('左向き');
      }

      if (wantsRotateBack) {
        targetObject.rotation.y = Math.PI;
        operations.push('背面向き');
      }

      if (operations.length === 0) {
        // ここまで来て操作が無ければ SceneManager に委譲
        return { handled: false };
      }

      // 変更履歴を追加
      targetObject.userData = targetObject.userData || {};
      targetObject.userData.modifications = targetObject.userData.modifications || [];
      targetObject.userData.modifications.push({
        timestamp: Date.now(),
        type: 'orientation',
        operations,
        command
      });

      // 選択表示を更新（削除：+/-ボタンが選択の証拠）
      // if (typeof this.sceneManager.createModernSelectionIndicator === 'function') {
      //   this.sceneManager.createModernSelectionIndicator(targetObject);
      // }

      const message = `✏️ ${operations.join('・')} を適用しました`;
      this.addOutput(message, 'success');

      return {
        handled: true,
        result: {
          success: true,
          message,
          objectId: targetObject.name,
          operations
        }
      };
    }

    /**
     * コマンド実行
     */
    async executeCommand() {
      const command = this.input.value.trim();
      if (!command) return;

      // 最終的なコマンドタイプ判定
      const commandType = this.analyzeCommandType(command);

      if (this.selectedFile) {
        if (this.currentMode !== 'import') {
          this.selectMode('import', false);
        }
        this.currentMode = 'import';
      } else {
        this.currentMode = commandType.type;
      }

      // 削除の場合は確認ダイアログ
      if (commandType.requiresConfirmation) {
        const confirmed = await this.showDeleteConfirmation(command);
        if (!confirmed) {
          this.addOutput('❌ 削除をキャンセルしました', 'system');
          return;
        }
      }

      // 入力をクリア
      this.input.value = '';
      // 旧コマンドタイプインジケーターは削除（ラジオボタンUIに統合済み）
      // this.commandTypeIndicator.style.display = 'none';
      this.hideProactiveSuggestion();

      // コマンド表示（メディアタイプ付き）
      commandType.mediaType === 'video' ? '🎬' : '🖼️';
      // タスクカード作成
      const selectedFileType = this.selectedFile?.type;
      const taskId = this.addTaskCard(command, {
        status: 'processing',
        contentType: this.getContentTypeLabel(selectedFileType || commandType.mediaType)
      });

      // コマンド実行前の状態を履歴に保存
      this.saveCommandToHistory({
        command: command,
        mode: this.currentMode,
        mediaType: commandType.mediaType,
        timestamp: Date.now()
      });

      try {
        // 処理メッセージ表示
        // タスクカードは既に1183行目で作成済み（taskId変数）
        // 重複を避けるため、ここでは作成しない

        let result;
        
        // モードに応じたコマンド処理
        const modePrefix = this.getModePrefix(this.currentMode);
        const fullCommand = `${modePrefix}${command}`;

        // モード別の実行処理
        this.logDebug('🔍 Current mode check:', this.currentMode);
        if (this.currentMode === 'import') {
          this.logDebug('📁 Import mode detected - bypassing SceneManager');
          // Importモード: 直接処理（SceneManagerを迂回）
          if (!this.selectedFile) {
            throw new Error('ファイルが選択されていません。まずファイルを選択してください。');
          }
          result = await this.handleImportCommand(command, { selectedFileType });
        } else if (this.sceneManager) {
          if (this.currentMode === 'modify') {
            const orientationResult = this.handleDemoOrientationCommand(command);
            if (orientationResult && orientationResult.handled) {
              result = orientationResult.result;
            } else {
              result = await this.sceneManager.executeCommand(fullCommand);
            }
          } else {
            // modifyモードの場合は選択されたオブジェクトに直接適用
            if (this.currentMode === 'modify') {
              const selectedObject = this.sceneManager?.selectedObject;
              if (!selectedObject) {
                this.addOutput('⚠️ 変更するオブジェクトが選択されていません。まず3Dシーン内のオブジェクトをクリックで選択してから、再度コマンドを実行してください。', 'system');
                return;
              }
              // LiveCommandClientのmodifySelectedObjectを呼び出し
              console.log('🔧 Demo: Calling modifySelectedObject with:', selectedObject, command);
              if (this.client && this.client.modifySelectedObject) {
                result = await this.client.modifySelectedObject(selectedObject, command);
              } else {
                result = await this.sceneManager.executeCommand(fullCommand);
              }
            } else {
              result = await this.sceneManager.executeCommand(fullCommand);
            }
          }
        } else if (this.client) {
          // モードに応じてAPIエンドポイントを選択
          if (this.currentMode === 'generate') {
            // 生成モード: 新しいオブジェクトを作成
            if (commandType.mediaType === 'video') {
              result = await this.client.generateVideo(command, {
                model: this.selectedVideoService || undefined
              });
            } else {
              result = await this.client.generateImage(command, {
                service: this.selectedImageService || undefined
              });
            }
          } else if (this.currentMode === 'modify') {
            // 変更モード: 既存オブジェクトを変更（選択が必要）
            if (!this.selectedObject) {
              throw new Error('変更するオブジェクトが選択されていません。まず対象オブジェクトを選択してください。');
            }
            result = await this.client.modifySelectedObject(this.selectedObject, command);
          } else if (this.currentMode === 'delete') {
            // 削除モード: オブジェクト選択チェック
            if (!this.selectedObject && !this.sceneManager?.getSelectedObjects()?.length) {
              this.addOutput('⚠️ 削除するオブジェクトが選択されていません。まず3Dシーン内のオブジェクトをクリックで選択してから、再度Deleteボタンを押してください。', 'system');
              return;
            }
            // 削除モード: 確認ダイアログを表示してから削除
            const confirmMessage = `本当に「${command}」を実行しますか？

この操作は取り消せません。`;
            if (!confirm(confirmMessage)) {
              this.addOutput('❌ 削除がキャンセルされました', 'system');
              return;
            }
            result = await this.client.deleteObjects(command);
          } else {
            // その他のモード
            result = await this.client.executeCommand(fullCommand);
          }
        } else {
          throw new Error('SceneManager または Client が設定されていません');
        }

        // taskId取得とSSE接続開始
        if (result && result.taskId) {
          this.connectToProgress(result.taskId, taskId);
          this.currentTaskId = result.taskId;
        }

        if (result && result.success === false) {
          const errorToThrow = new Error(result.error || '操作に失敗しました');
          if (result.errorCategory) {
            errorToThrow.code = result.errorCategory;
          }
          throw errorToThrow;
        }

        // 成功メッセージ
        const successMessages = {
          generate: ``, // 成功メッセージ削除 - 結果で十分
          modify: '✅ 変更を適用しました',
          delete: '🗑️ 削除しました'
        };
        
        // タスクカード完了
        if (taskId) {
          this.updateTaskCard(taskId, 'completed', {
            contentType: this.getContentTypeLabel(result?.contentType || selectedFileType || commandType.mediaType)
          });
        }
        
        if (result?.fallbackUsed) {
          const warningMessage = result?.error
            ? `⚠️ 生成に失敗したためプレースホルダーを表示しています: ${result.error}`
            : '⚠️ 生成に失敗したためプレースホルダーを表示しています。';
          this.showInputFeedback('生成に失敗したためプレースホルダーを表示しています。設定を確認してください。', 'error');
          this.addOutput(warningMessage, 'error');
        }
        
        // 詳細情報表示
        if (result?.modelName) {
          // デバッグ情報削除 - モーダル表示用に保存
        }
        
        if (result?.objectId) {
          // オブジェクトID削除
        }
        
        if (result?.position) {
          // 位置情報削除
        }

        if (commandType.mediaType) {
          // メディアタイプ削除
        }

      } catch (error) {
        const errorMessages = {
          generate: `❌ ${commandType.mediaType === 'video' ? '動画' : '画像'}生成エラー`,
          modify: '❌ 変更エラー', 
          delete: '❌ 削除エラー'
        };

        if (error?.code === 'LOCAL_SERVER_UNREACHABLE') {
          this.serverHealthState.available = false;
          this.serverHealthState.lastError = error;
          this.showServerHealthModal(error);
          this.showInputFeedback('サーバーに接続できません。`npm run dev` でローカルサーバーを起動してください。', 'error');
          this.addOutput('📡 サーバーに接続できません。`npm run dev` でローカルサーバーを起動してください。', 'error');
        } else if (error?.code === 'MCP_CONFIG_MISSING') {
          this.showMcpConfigNotice(error);
        } else {
          this.showInputFeedback(error.message, 'error');
        }
        // タスクカードエラー
        if (taskId) {
          this.updateTaskCard(taskId, 'error', {
            contentType: this.getContentTypeLabel(selectedFileType || commandType.mediaType)
          });
        }

        this.addOutput(`${errorMessages[this.currentMode]}: ${error.message}`, 'error');
        console.error('Command execution error:', error);
      }

      // 2025年UXトレンド: コマンド実行後の自動選択解除
      if (this.sceneManager && this.sceneManager.selectedObject) {
        // Modify/Deleteコマンド後は選択を自動解除してストレス軽減
        if (this.currentMode === 'modify' || this.currentMode === 'delete') {
          setTimeout(() => {
            this.sceneManager.deselectObject();
          }, 500); // 少し遅延させて操作完了を視覚的に確認
        }
      }

      // 出力エリアを最下部にスクロール
      if (this.config.autoScroll) {
        this.scrollToBottom();
      }
    }

    initializeServerHealthCheck() {
      if (this.config.enableServerHealthCheck === false) {
        this.logDebug('🚫 Server health check disabled via config');
        return;
      }

      if (!this.client) {
        this.logDebug('⚠️ Server health check skipped - client not available');
        return;
      }

      setTimeout(() => {
        this.performServerHealthCheck({ reason: 'initial', showModalOnFail: true }).catch(error => {
          this.logDebug('⚠️ Initial health check failed:', error);
        });
      }, 100);
    }

    async performServerHealthCheck(options = {}) {
      if (this.config.enableServerHealthCheck === false) {
        return true;
      }

      if (!this.client) {
        return true;
      }

      if (this.serverHealthState.checking) {
        return this.serverHealthState.available;
      }

      this.serverHealthState.checking = true;

      const { showModalOnFail = true } = options;

      if (this.serverHealthRetryButton) {
        this.serverHealthRetryButton.disabled = true;
        this.serverHealthRetryButton.textContent = '再接続中…';
      }

      try {
        if (typeof this.client.ensureInitialized === 'function') {
          await this.client.ensureInitialized();
        }

        const healthUrl = this.getHealthEndpoint();
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeoutId = controller ? setTimeout(() => controller.abort(), 5000) : null;

        const response = await fetch(healthUrl, {
          method: 'GET',
          cache: 'no-store',
          signal: controller ? controller.signal : undefined
        });

        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        if (!response.ok) {
          throw new Error(`Health check failed: HTTP ${response.status}`);
        }

        await response.json();

        this.serverHealthState.available = true;
        this.serverHealthState.lastError = null;
        this.hideServerHealthModal();
        return true;
      } catch (error) {
        this.serverHealthState.available = false;
        this.serverHealthState.lastError = error;

        if (showModalOnFail) {
          this.showServerHealthModal(error);
        }

        return false;
      } finally {
        this.serverHealthState.checking = false;
        if (this.serverHealthRetryButton) {
          this.serverHealthRetryButton.disabled = false;
          this.serverHealthRetryButton.textContent = '再接続を試す';
        }
      }
    }

    getHealthEndpoint() {
      const serverUrl = this.client?.serverUrl || this.sceneManager?.client?.serverUrl;
      if (serverUrl) {
        return `${serverUrl.replace(/\/$/, '')}/health`;
      }
      return '/health';
    }

    ensureServerHealthModal() {
      if (this.serverHealthModal) {
        return;
      }

      const backdrop = document.createElement('div');
      backdrop.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.65);
      backdrop-filter: blur(6px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    `;

      const modal = document.createElement('div');
      modal.style.cssText = `
      max-width: 420px;
      width: calc(100% - 64px);
      background: ${this.isDarkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.98)'};
      color: ${this.isDarkMode ? '#f1f5f9' : '#1f2937'};
      border-radius: 16px;
      padding: 28px;
      box-shadow: 0 25px 60px rgba(15, 23, 42, 0.35);
      border: 1px solid ${this.isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.2)'};
      display: flex;
      flex-direction: column;
      gap: 18px;
    `;

      const title = document.createElement('div');
      title.textContent = 'ChocoDrop サーバーに接続できません';
      title.style.cssText = `
      font-size: 18px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
    `;

      const titleIcon = document.createElement('span');
      titleIcon.textContent = '🔌';
      title.prepend(titleIcon);

      const message = document.createElement('p');
      message.style.cssText = `
      margin: 0;
      line-height: 1.6;
      font-size: 14px;
    `;
      message.textContent = 'ローカルで起動している ChocoDrop サーバー（Express）に接続できません。ターミナルで `npm run dev` を実行し、サーバーが起動していることを確認してください。';

      const detail = document.createElement('pre');
      detail.style.cssText = `
      margin: 0;
      padding: 12px;
      background: ${this.isDarkMode ? 'rgba(30, 41, 59, 0.6)' : 'rgba(15, 23, 42, 0.05)'};
      border-radius: 10px;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
      color: ${this.isDarkMode ? '#94a3b8' : '#475569'};
      border: 1px dashed ${this.isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.35)'};
    `;
      detail.textContent = '';

      const buttonRow = document.createElement('div');
      buttonRow.style.cssText = `
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    `;

      const dismissButton = document.createElement('button');
      dismissButton.textContent = '閉じる';
      dismissButton.style.cssText = this.getSecondaryButtonStyles();
      dismissButton.addEventListener('click', () => {
        this.hideServerHealthModal();
      });

      const retryButton = document.createElement('button');
      retryButton.textContent = '再接続を試す';
      retryButton.style.cssText = this.getPrimaryButtonStyles();
      retryButton.addEventListener('click', () => {
        this.performServerHealthCheck({ reason: 'manual', showModalOnFail: true });
      });

      buttonRow.appendChild(dismissButton);
      buttonRow.appendChild(retryButton);

      modal.appendChild(title);
      modal.appendChild(message);
      modal.appendChild(detail);
      modal.appendChild(buttonRow);

      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);

      this.serverHealthBackdrop = backdrop;
      this.serverHealthModal = modal;
      this.serverHealthMessage = message;
      this.serverHealthDetail = detail;
      this.serverHealthRetryButton = retryButton;
    }

    getPrimaryButtonStyles() {
      return `
      padding: 10px 16px;
      border-radius: 10px;
      border: none;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: #ffffff;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      box-shadow: 0 10px 25px rgba(99, 102, 241, 0.35);
    `;
    }

    getSecondaryButtonStyles() {
      return `
      padding: 10px 16px;
      border-radius: 10px;
      border: 1px solid ${this.isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(71, 85, 105, 0.3)'};
      background: transparent;
      color: ${this.isDarkMode ? '#cbd5f5' : '#1f2937'};
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s ease, background 0.2s ease;
    `;
    }

    showServerHealthModal(error) {
      if (this.config.enableServerHealthCheck === false) {
        return;
      }

      this.ensureServerHealthModal();

      if (this.serverHealthBackdrop) {
        this.serverHealthBackdrop.style.display = 'flex';
      }

      if (this.serverHealthDetail) {
        const message = error?.message || 'サーバーに接続できません。';
        this.serverHealthDetail.textContent = message;
      }
    }

    hideServerHealthModal() {
      if (this.serverHealthBackdrop) {
        this.serverHealthBackdrop.style.display = 'none';
      }
    }

    showMcpConfigNotice(error) {
      if (this.mcpNoticeShown) {
        return;
      }
      this.mcpNoticeShown = true;

      const message = error?.message || 'MCP 設定が見つかりません。config.json の設定を確認してください。';
      const guidance = '⚙️ MCP 設定が必要です: docs/SETUP.md を参照し、config.json の mcp セクションまたは MCP_CONFIG_PATH 環境変数を設定してください。';
      this.showInputFeedback('AI生成サーバー (MCP) が未設定です。設定が完了するまで生成を実行できません。', 'error');
      this.addOutput(`${guidance}\nサーバーからのメッセージ: ${message}`, 'error');
    }

    /**
     * 削除確認ダイアログ
     */
    async showConfirmationDialog(options) {
      const {
        icon = '🗑️',
        title = '確認',
        message = 'この操作を実行しますか？',
        confirmText = '実行',
        cancelText = 'キャンセル',
        confirmColor = '#ef4444'
      } = options;

      return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(15, 23, 42, 0.6);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 2000;
        backdrop-filter: blur(24px) saturate(180%);
        -webkit-backdrop-filter: blur(24px) saturate(180%);
      `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
        background: ${this.isDarkMode 
          ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.85), rgba(30, 27, 75, 0.8))'
          : 'linear-gradient(135deg, rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0.3))'};
        border: 1px solid ${this.isDarkMode ? 'rgba(99, 102, 241, 0.3)' : 'rgba(255, 255, 255, 0.5)'};
        border-radius: 20px;
        padding: 32px;
        max-width: 420px;
        text-align: center;
        color: ${this.isWabiSabiMode ? '#F5F5F5' : (this.isDarkMode ? '#ffffff' : '#1f2937')};
        font-family: inherit;
        backdrop-filter: blur(24px) saturate(180%);
        -webkit-backdrop-filter: blur(24px) saturate(180%);
        box-shadow: ${this.isDarkMode 
          ? '0 8px 32px rgba(15, 23, 42, 0.4), 0 0 0 1px rgba(99, 102, 241, 0.1)'
          : '0 8px 32px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(255, 255, 255, 0.2)'};
        transform: scale(0.9);
        opacity: 0;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      `;

        dialog.innerHTML = `
        <div style="font-size: 56px; margin-bottom: 20px;">${icon}</div>
        <h3 style="margin: 0 0 16px 0; color: ${this.isDarkMode ? '#a5b4fc' : '#6366f1'}; font-size: 20px; font-weight: 700; letter-spacing: 0.02em;">
          ${title}
        </h3>
        <p style="margin: 0 0 28px 0; color: ${this.isDarkMode ? '#d1d5db' : '#6b7280'}; line-height: 1.6; font-size: 16px;">
          ${message}
        </p>
        <div style="display: flex; gap: 8px; justify-content: center;">
          <button id="cancel-btn" style="
            padding: 14px 24px;
            background: ${this.isDarkMode 
              ? 'linear-gradient(135deg, rgba(55, 65, 81, 0.3), rgba(75, 85, 99, 0.2))'
              : 'linear-gradient(135deg, rgba(255, 255, 255, 0.25), rgba(255, 255, 255, 0.15))'};
            border: 1px solid ${this.isDarkMode ? 'rgba(156, 163, 175, 0.2)' : 'rgba(255, 255, 255, 0.3)'};
            border-radius: 12px;
            color: ${this.isDarkMode ? '#d1d5db' : '#374151'};
            cursor: pointer;
            font-family: inherit;
            font-size: 14px;
            font-weight: 600;
            transition: all 0.2s ease;
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
          ">${cancelText}</button>
          <button id="confirm-btn" style="
            padding: 14px 24px;
            background: ${confirmColor === '#6366f1' 
              ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' 
              : confirmColor === '#ef4444'
              ? 'linear-gradient(135deg, #ef4444, #dc2626)'
              : 'linear-gradient(135deg, #ff7b47, #f97316)'};
            border: none;
            border-radius: 12px;
            color: white;
            cursor: pointer;
            font-family: inherit;
            font-size: 14px;
            font-weight: 700;
            transition: all 0.2s ease;
            box-shadow: 0 4px 16px ${confirmColor === '#6366f1' 
              ? 'rgba(99, 102, 241, 0.3)' 
              : confirmColor === '#ef4444' 
              ? 'rgba(239, 68, 68, 0.3)' 
              : 'rgba(255, 123, 71, 0.3)'};
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
          ">${confirmText}</button>
        </div>
      `;

        modal.appendChild(dialog);
        document.body.appendChild(modal);

        // アニメーション開始
        requestAnimationFrame(() => {
          modal.style.opacity = '1';
          dialog.style.transform = 'scale(1)';
          dialog.style.opacity = '1';
        });

        // イベントリスナー
        dialog.querySelector('#cancel-btn').onclick = () => {
          this.closeModalWithAnimation(modal);
          resolve(false);
        };

        dialog.querySelector('#confirm-btn').onclick = () => {
          this.closeModalWithAnimation(modal);
          resolve(true);
        };

        // ESCキーでキャンセル
        const escHandler = (e) => {
          if (e.key === 'Escape') {
            this.closeModalWithAnimation(modal);
            document.removeEventListener('keydown', escHandler);
            resolve(false);
          }
        };
        document.addEventListener('keydown', escHandler);

        // モーダル背景クリックでキャンセル
        modal.onclick = (e) => {
          if (e.target === modal) {
            this.closeModalWithAnimation(modal);
            resolve(false);
          }
        };
      });
    }

    async showDeleteConfirmation(command) {
      return this.showConfirmationDialog({
        icon: '🗑️',
        title: '削除の確認',
        message: `「${command}」を実行しますか？<br>この操作は取り消すことができません。`,
        confirmText: '削除実行',
        cancelText: 'キャンセル',
        confirmColor: '#ff7b47'
      });
    }

    /**
     * 出力エリアにメッセージ追加
     */
    /**
     * タスクカード追加（従来のaddOutputを置き換え）
     */
    addOutput(message, type = 'default', options = {}) {
      // タスクカード形式で処理
      if (type === 'task' || type === 'progress') {
        return this.addTaskCard(message, options);
      }

      // エラーとシステムメッセージのみ表示
      if (type === 'error' || type === 'system') {
        this.addSystemMessage(message, type);
      }
    }

    /**
     * フローティングタスクカード追加
     */
    addTaskCard(taskInfo, options = {}) {
      if (!this.taskCards) this.taskCards = new Map();

      const taskId = options.taskId || `task_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const status = options.status || 'pending';
      const prompt = taskInfo.prompt || taskInfo.command || taskInfo;

      // フローティングカード作成
      const card = document.createElement('div');
      card.className = 'floating-task-card';
      card.setAttribute('data-task-id', taskId);

      // iOS 26 Liquid Glass + 2026年トレンドスタイル
      card.style.cssText = this.getFloatingCardStyles(status);
      // アニメーション用初期状態（非表示）- 強制設定
      card.style.setProperty('opacity', '0', 'important');
      card.style.setProperty('transform', 'translateY(20px) scale(0.95)', 'important');
      card.style.setProperty('filter', 'blur(4px)', 'important');

      const iconMap = {
        pending: '⏳',
        processing: '🎨',
        progress: '⚡',
        completed: '✅',
        error: '❌'
      };

      // 温かみのあるメッセージ表示
      const friendlyMessage = this.getFriendlyMessage(status, prompt);
      card.innerHTML = `
      <span style="font-size: 14px;">${iconMap[status]}</span>
      <span style="font-size: 13px; margin-left: 6px;">${friendlyMessage}</span>
    `;

      // フローティングコンテナに追加（最新が下に来るように）
      this.floatingContainer.appendChild(card);
      
      // カード表示制限を適用（最大3個まで表示）
      this.updateCardDisplayLimit();

      this.taskCards.set(taskId, {
        element: card,
        status: status,
        prompt: prompt,
        originalPrompt: prompt, // 元のプロンプト
        startTime: Date.now(),
        endTime: null,
        error: null,
        contentType: this.getContentTypeLabel(options.contentType),
        model: null,
        settings: null
      });

      // カード詳細モーダル用のイベントリスナー
      this.addCardDetailEvents(card, taskId);
      
      // 入場アニメーション
      this.animateCardEntrance(card);
      return taskId;
    }

    /**
     * フローティングタスクカード更新
     */
    updateTaskCard(taskId, status, options = {}) {
      if (!this.taskCards || !this.taskCards.has(taskId)) return;

      const taskData = this.taskCards.get(taskId);
      const card = taskData.element;

      // ステータス更新
      taskData.status = status;
      if (options.contentType) {
        taskData.contentType = this.getContentTypeLabel(options.contentType);
      }

      const iconMap = {
        pending: '⏳',
        processing: '🎨',
        progress: '⚡',
        completed: '✅',
        error: '❌'
      };

      // 温かみのあるメッセージ更新
      const friendlyMessage = this.getFriendlyMessage(status, taskData.prompt);
      card.innerHTML = `
      <span style="font-size: 14px;">${iconMap[status]}</span>
      <span style="font-size: 13px; margin-left: 6px;">${friendlyMessage}</span>
    `;

      // 完了時の自動消去アニメーション
      if (status === 'completed') {
        this.animateCardSuccess(card, taskId);
      } else if (status === 'error') {
        this.animateCardError(card, taskId);
      }
    }

    getContentTypeLabel(rawType) {
      if (!rawType) return '画像';
      const type = String(rawType).toLowerCase();
      if (type === '3d' || type === '3dモデル' || type === 'model') {
        return '3Dモデル';
      }
      if (type === 'video' || type === '動画') {
        return '動画';
      }
      if (type === 'image' || type === '画像' || type === 'img') {
        return '画像';
      }
      return rawType;
    }

    /**
     * システムメッセージ表示
     */
    addSystemMessage(message, type) {
      const entry = document.createElement('div');
      entry.className = `system-message ${type}`;
      entry.style.cssText = `
      padding: 8px 12px;
      margin: 4px 0;
      border-radius: 8px;
      font-size: 12px;
      line-height: 1.4;
      animation: slideIn 0.3s ease-out;
      background: ${type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(107, 114, 128, 0.1)'};
      border: 1px solid ${type === 'error' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(107, 114, 128, 0.3)'};
      color: ${type === 'error' ? '#fca5a5' : (this.isDarkMode ? '#d1d5db' : '#6b7280')};
    `;
      entry.textContent = message;
      this.outputDiv.appendChild(entry);
      this.scrollToBottom();
    }

    /**
     * タスクカードスタイル取得
     */
    getTaskCardStyles(status) {
      const baseStyles = `
      background: ${this.isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.15)'};
      border: 1px solid ${this.isDarkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.25)'};
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 12px;
      backdrop-filter: blur(12px);
      transition: all 0.3s ease;
      animation: slideInUp 0.3s ease-out;
    `;

      const statusBorders = {
        pending: 'rgba(167, 139, 250, 0.3)',     // 薄紫
        processing: 'rgba(192, 132, 252, 0.5)',  // 紫（強調）
        progress: 'rgba(236, 72, 153, 0.4)',     // ピンク
        completed: 'rgba(167, 139, 250, 0.4)',   // 紫
        error: 'rgba(239, 68, 68, 0.4)'          // 赤
      };

      return baseStyles + `border-left: 3px solid ${statusBorders[status] || statusBorders.pending};`;
    }

    /**
     * フローティングカードスタイル（iOS 26 Liquid Glass + 2026年トレンド）
     */
    getFloatingCardStyles(status) {
      // 2025年Glassmorphism仕様：フローティングタスクカード
      const glassmorphismDark = {
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.75), rgba(30, 27, 75, 0.7))',
        border: '1px solid rgba(99, 102, 241, 0.25)',
        boxShadow: '0 8px 32px rgba(15, 23, 42, 0.3), 0 0 0 1px rgba(99, 102, 241, 0.1)',
        color: '#ffffff'
      };

      const glassmorphismLight = {
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.35), rgba(255, 255, 255, 0.25))',
        border: '1px solid rgba(255, 255, 255, 0.4)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(255, 255, 255, 0.2)',
        color: '#1f2937'
      };

      const theme = this.isDarkMode ? glassmorphismDark : glassmorphismLight;

      return `
      height: 36px;
      padding: 0 18px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: ${theme.background};
      backdrop-filter: blur(24px) saturate(180%);
      -webkit-backdrop-filter: blur(24px) saturate(180%);
      border: ${theme.border};
      border-radius: 18px;
      color: ${theme.color};
      pointer-events: auto;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', sans-serif;
      font-weight: 600;
      font-size: 13px;
      letter-spacing: 0.01em;
      box-shadow: ${theme.boxShadow};
      transform: translateY(10px);
      opacity: 0;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    `;
    }

    /**
     * カード表示制限を適用（最大3個まで表示、それ以上は「+ N」で表示）
     */
    updateCardDisplayLimit() {
      const maxVisibleCards = 3;
      const allCards = Array.from(this.floatingContainer.children).filter(child => 
        !child.classList.contains('overflow-counter')
      );
      
      // 既存のカウンターを削除
      const existingCounter = this.floatingContainer.querySelector('.overflow-counter');
      if (existingCounter) {
        existingCounter.remove();
      }
      
      if (allCards.length <= maxVisibleCards) {
        // カードが3個以下の場合、すべて表示
        allCards.forEach(card => {
          card.style.display = 'flex';
        });
      } else {
        // カードが4個以上の場合、最新3個のみ表示し、残りはカウンター表示
        allCards.slice(-maxVisibleCards); // 最新3個
        const hiddenCount = allCards.length - maxVisibleCards;
        
        // 古いカードを非表示
        allCards.forEach((card, index) => {
          if (index < allCards.length - maxVisibleCards) {
            card.style.display = 'none';
          } else {
            card.style.display = 'flex';
          }
        });
        
        // 「+ N」カウンターを作成
        const counter = document.createElement('div');
        counter.className = 'overflow-counter';
        // テーマに応じたカウンタースタイル
        const counterBaseColor = this.isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.12)';
        const counterBorderColor = this.isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.15)';
        const counterTextColor = this.isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)';
        
        counter.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 8px 12px;
        margin: 4px 0;
        background: ${counterBaseColor};
        backdrop-filter: blur(20px);
        border-radius: 12px;
        border: 1px solid ${counterBorderColor};
        font-size: 12px;
        color: ${counterTextColor};
        font-weight: 500;
        min-height: 32px;
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        cursor: pointer;
      `;
        counter.innerHTML = `+ ${hiddenCount}`;
        
        // カウンターを最初に挿入（最上部に配置）
        this.floatingContainer.insertBefore(counter, this.floatingContainer.firstChild);
        
        // カウンターのホバー効果（テーマ対応）
        const counterHoverColor = this.isDarkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.18)';
        
        counter.addEventListener('mouseenter', () => {
          counter.style.background = counterHoverColor;
          counter.style.transform = 'scale(1.05)';
        });
        
        counter.addEventListener('mouseleave', () => {
          counter.style.background = counterBaseColor;
          counter.style.transform = 'scale(1)';
        });
      }
    }

    /**
     * カードに詳細モーダル用のイベントリスナーを追加
     */
    addCardDetailEvents(card, taskId) {
      // タッチデバイス検出
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      
      if (isTouchDevice) {
        // モバイル/タブレット: タップで詳細表示
        card.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.showTaskDetailModal(taskId);
        });
      } else {
        // デスクトップ: ホバーで詳細表示
        let hoverTimeout;
        
        card.addEventListener('mouseenter', () => {
          hoverTimeout = setTimeout(() => {
            this.showTaskDetailModal(taskId);
          }, 800); // 0.8秒ホバーで表示
        });
        
        card.addEventListener('mouseleave', () => {
          if (hoverTimeout) {
            clearTimeout(hoverTimeout);
          }
        });
        
        // クリックでも表示（デスクトップでも使いやすく）
        card.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.showTaskDetailModal(taskId);
        });
      }
    }

    /**
     * タスク詳細モーダルを表示
     */
    showTaskDetailModal(taskId) {
      const taskData = this.taskCards.get(taskId);
      if (!taskData) return;
      
      // 既存のモーダルを削除
      const existingModal = document.querySelector('.task-detail-modal');
      if (existingModal) {
        existingModal.remove();
      }
      
      // モーダル作成
      const modal = this.createTaskDetailModal(taskData);
      document.body.appendChild(modal);
      
      // 入場アニメーション
      requestAnimationFrame(() => {
        modal.style.opacity = '1';
        modal.querySelector('.modal-content').style.transform = 'translateY(0) scale(1)';
      });
    }

    /**
     * タスク詳細モーダルのHTML要素を作成
     */
    createTaskDetailModal(taskData) {
      const modal = document.createElement('div');
      modal.className = 'task-detail-modal';
      
      // テーマに応じたスタイル
      const overlayColor = this.isDarkMode ? 'rgba(0, 0, 0, 0.6)' : 'rgba(0, 0, 0, 0.4)';
      const modalBg = this.isDarkMode ? 'rgba(20, 20, 20, 0.95)' : 'rgba(255, 255, 255, 0.95)';
      const modalBorder = this.isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
      const textColor = this.isDarkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.9)';
      const labelColor = this.isDarkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)';
      
      modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: ${overlayColor};
      backdrop-filter: blur(10px);
      z-index: 100000;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      cursor: pointer;
    `;
      
      // 実行時間計算
      const duration = taskData.endTime 
        ? ((taskData.endTime - taskData.startTime) / 1000).toFixed(1)
        : ((Date.now() - taskData.startTime) / 1000).toFixed(1);
      
      // ステータス表示
      const statusText = taskData.status === 'pending' ? '待機中' 
                      : taskData.status === 'in-progress' ? '実行中' 
                      : taskData.status === 'completed' ? '完了' 
                      : 'エラー';
      
      const modalContent = document.createElement('div');
      modalContent.className = 'modal-content';
      modalContent.style.cssText = `
      background: ${modalBg};
      backdrop-filter: blur(30px);
      border: 1px solid ${modalBorder};
      border-radius: 16px;
      padding: 16px !important;
      max-width: 400px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      transform: translateY(20px) scale(0.95);
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      cursor: default;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    `;
      
      modalContent.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
        <h3 style="margin: 0; color: ${textColor}; font-size: 18px; font-weight: 600;">タスク詳細</h3>
        <button class="close-btn" style="
          background: none;
          border: none;
          font-size: 24px;
          color: ${labelColor};
          cursor: pointer;
          padding: 0;
          line-height: 1;
          transition: color 0.2s;
        ">×</button>
      </div>
      
      <div style="space-y: 16px;">
        <div>
          <div style="color: ${labelColor}; font-size: 12px; font-weight: 500; margin-bottom: 0;">📝 元のプロンプト</div>
          <div style="color: ${textColor}; font-size: 14px; line-height: 1.4;">${taskData.originalPrompt}</div>
        </div>
        
        <div>
          <div style="color: ${labelColor}; font-size: 12px; font-weight: 500; margin-bottom: 0;">📊 ステータス</div>
          <div style="color: ${textColor}; font-size: 14px;">${statusText}</div>
        </div>
        
        <div>
          <div style="color: ${labelColor}; font-size: 12px; font-weight: 500; margin-bottom: 0;">⏱️ 実行時間</div>
          <div style="color: ${textColor}; font-size: 14px;">${duration}秒</div>
        </div>
        
        ${taskData.error ? `
        <div>
          <div style="color: ${labelColor}; font-size: 12px; font-weight: 500; margin-bottom: 0;">❌ エラー詳細</div>
          <div style="color: #ef4444; font-size: 14px; line-height: 1.4;">${taskData.error}</div>
        </div>
        ` : ''}
        
        <div>
          <div style="color: ${labelColor}; font-size: 12px; font-weight: 500; margin-bottom: 0;">🎨 コンテンツタイプ</div>
          <div style="color: ${textColor}; font-size: 14px;">${taskData.contentType || '画像'}</div>
        </div>
      </div>
    `;
      
      // イベントリスナー
      modalContent.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      
      const closeBtn = modalContent.querySelector('.close-btn');
      closeBtn.addEventListener('click', () => {
        this.closeTaskDetailModal(modal);
      });
      
      closeBtn.addEventListener('mouseenter', () => {
        closeBtn.style.color = textColor;
      });
      
      closeBtn.addEventListener('mouseleave', () => {
        closeBtn.style.color = labelColor;
      });
      
      modal.addEventListener('click', () => {
        this.closeTaskDetailModal(modal);
      });
      
      modal.appendChild(modalContent);
      return modal;
    }

    /**
     * タスク詳細モーダルを閉じる
     */
    closeTaskDetailModal(modal) {
      modal.style.opacity = '0';
      modal.querySelector('.modal-content').style.transform = 'translateY(20px) scale(0.95)';
      
      setTimeout(() => {
        if (modal.parentNode) {
          modal.parentNode.removeChild(modal);
        }
      }, 300);
    }

    /**
     * カード入場アニメーション（2026年トレンド + iOS 26 Liquid Glass）
     */
    animateCardEntrance(card) {
      // iOS 26 Liquid Glass 入場エフェクト
      card.style.transform = 'translateY(20px) scale(0.95)';
      card.style.opacity = '0';
      card.style.filter = 'blur(4px)';

      requestAnimationFrame(() => {
        card.style.transition = 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)';
        card.style.transform = 'translateY(0) scale(1)';
        card.style.opacity = '1';
        card.style.filter = 'blur(0px)';

        // 2026年トレンド: 微細な光る効果
        card.style.boxShadow = '0 4px 20px rgba(255, 255, 255, 0.1), 0 0 40px rgba(255, 255, 255, 0.05)';
      });
    }

    /**
     * 成功時アニメーション + 自動消去（iOS 26 Liquid Glass）
     */
    animateCardSuccess(card, taskId) {
      // iOS 26 Liquid Glass 成功エフェクト
      card.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
      card.style.borderColor = 'rgba(76, 175, 80, 0.6)';
      card.style.transform = 'scale(1.08)';
      card.style.boxShadow = '0 8px 32px rgba(76, 175, 80, 0.4), 0 0 60px rgba(76, 175, 80, 0.2)';
      card.style.filter = 'brightness(1.1) saturate(1.2)';

      // 2026年トレンド: 流体的な戻りアニメーション
      setTimeout(() => {
        card.style.transform = 'scale(1.02)';
        card.style.filter = 'brightness(1.05) saturate(1.1)';
      }, 150);

      // Liquid Glass風のスムーズなフェードアウト（2秒後に自動削除）
      setTimeout(() => {
        this.animateCardExit(card, taskId);
      }, 2000);
    }

    /**
     * エラー時アニメーション（2026年トレンド UX）
     */
    animateCardError(card, taskId) {
      // iOS 26 Liquid Glass エラーエフェクト
      card.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
      card.style.borderColor = 'rgba(244, 67, 54, 0.7)';
      card.style.boxShadow = '0 8px 32px rgba(244, 67, 54, 0.3), 0 0 60px rgba(244, 67, 54, 0.15)';
      card.style.filter = 'saturate(1.3) brightness(1.1)';

      // 2026年トレンド: より自然なpulseアニメーション（shakeより洗練）
      card.style.animation = 'errorPulse 0.6s cubic-bezier(0.16, 1, 0.3, 1) 2';

      // UX改善: エラー内容を表示するツールチップ風UI
      this.addErrorTooltip(card, taskId);

      // エラーは手動で消すまで表示継続（クリックで消去）
      card.style.cursor = 'pointer';
      card.onclick = () => this.animateCardExit(card, taskId);

      // 5秒後に自動フェードアウト（UX改善）
      setTimeout(() => {
        if (this.taskCards.has(taskId)) {
          this.animateCardExit(card, taskId);
        }
      }, 5000);
    }

    /**
     * エラー時のツールチップ表示（UX改善）
     */
    addErrorTooltip(card, taskId) {
      const taskData = this.taskCards.get(taskId);
      if (!taskData || !taskData.error) return;

      // ツールチップ要素作成
      const tooltip = document.createElement('div');
      tooltip.style.cssText = `
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(244, 67, 54, 0.95);
      color: white;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 11px;
      white-space: nowrap;
      pointer-events: none;
      z-index: 1001;
      backdrop-filter: blur(10px);
      margin-bottom: 0;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;
      tooltip.textContent = taskData.error;

      card.style.position = 'relative';
      card.appendChild(tooltip);

      // フェードイン
      requestAnimationFrame(() => {
        tooltip.style.opacity = '1';
      });

      // 3秒後にフェードアウト
      setTimeout(() => {
        if (tooltip.parentNode) {
          tooltip.style.opacity = '0';
          setTimeout(() => {
            if (tooltip.parentNode) {
              tooltip.parentNode.removeChild(tooltip);
            }
          }, 300);
        }
      }, 3000);
    }

    /**
     * カード退場アニメーション（2026年トレンド + iOS 26 Liquid Glass）
     */
    animateCardExit(card, taskId) {
      // iOS 26 Liquid Glass 退場エフェクト - 2026年トレンドの「スッと消える」
      card.style.transition = 'all 0.28s cubic-bezier(0.4, 0, 0.2, 1)';
      card.style.transform = 'translateY(-12px) scale(0.92)';
      card.style.opacity = '0';
      card.style.filter = 'blur(6px) brightness(1.2)';

      // 2026年トレンド: 消去時の微細な光の拡散効果
      card.style.boxShadow = '0 0 40px rgba(255, 255, 255, 0.3), 0 0 80px rgba(255, 255, 255, 0.1)';

      setTimeout(() => {
        if (card.parentNode) {
          card.parentNode.removeChild(card);
        }
        this.taskCards.delete(taskId);
        // カード削除後に表示制限を再適用
        this.updateCardDisplayLimit();
      }, 280);
    }

    /**
     * ユーザーの表現スタイルを自然に感知
     */
    getResponseType(prompt) {
      // ユーザーの表現スタイルを自然に感知
      if (/ちょこっと|ちょこん|少し|軽く/.test(prompt) || prompt.length < 15) {
        return 'casual';
      }
      if (/美しい|幻想|素敵|魔法|世界|綺麗/.test(prompt)) {
        return 'magical';
      }
      return 'balanced'; // 80%がここに該当
    }

    /**
     * 温かみのあるメッセージを生成（マーケ提案ベース）
     */
    getFriendlyMessage(status, prompt, errorMessage = null) {
      const shortPrompt = prompt.length > 15 ? prompt.substring(0, 15) + '...' : prompt;

      // 自然な応答システム適用
      const responseType = this.getResponseType(prompt);

      switch (status) {
        case 'pending':
          return responseType === 'casual' ? 'ちょこっと準備中です...' :
                 responseType === 'magical' ? '魔法をかけようとしています...' :
                 'ちょこっと魔法の準備中...';
        case 'processing':
        case 'in-progress':
        case 'progress':
          // Modify mode specific messages for processing
          if (this.currentMode === 'modify') {
            return responseType === 'casual' ? 'ちょこっと調整中です...' :
                   responseType === 'magical' ? 'イメージを変化させています...' :
                   'ちょこんと編集中です...';
          }
          return responseType === 'casual' ? 'ちょこんと配置中です...' :
                 responseType === 'magical' ? 'あなたの想いを形にしています...' :
                 'ちょこっと魔法をかけています...';
        case 'completed':
          // Delete mode specific messages
          if (this.currentMode === 'delete') {
            return responseType === 'casual' ? 'ちょこっと削除しました！' :
                   responseType === 'magical' ? 'すっきりと片付きました！' :
                   'ちょこんと削除完了！すっきりですね！';
          }
          // Modify mode specific messages
          if (this.currentMode === 'modify') {
            return responseType === 'casual' ? 'ちょこっと調整しました！' :
                   responseType === 'magical' ? '素敵に変身しました！' :
                   'ちょこんと編集完了！いい感じですね！';
          }
          // Default completion messages for other modes
          return responseType === 'casual' ? 'ちょこっとドロップしました！' :
                 responseType === 'magical' ? '素敵な世界が完成しました！' :
                 'ちょこんと配置完了！素敵ですね！';
        case 'error':
          // エラー理由があれば含める
          if (errorMessage) {
            const shortError = errorMessage.length > 30 ? errorMessage.substring(0, 30) + '...' : errorMessage;
            return `❌ ${shortError}`;
          }
          return responseType === 'casual' ? 'おっと、エラーが発生しました' :
                 responseType === 'magical' ? '申し訳ございません、処理に失敗しました' :
                 'エラーが発生しました。もう一度お試しください';
        default:
          return shortPrompt;
      }
    }

    /**
     * ステータス色取得
     */
    getStatusColor(status) {
      // ネオンパープル/ピンク系で統一（2025トレンド）
      const colors = {
        pending: this.isDarkMode ? '#a78bfa' : '#7c3aed',        // 薄紫
        processing: this.isDarkMode ? '#c084fc' : '#9333ea',     // 紫（生成中）
        progress: this.isDarkMode ? '#ec4899' : '#be185d',       // ピンク
        completed: this.isDarkMode ? '#a78bfa' : '#7c3aed',      // 紫（完了も統一）
        error: this.isDarkMode ? '#f87171' : '#dc2626'           // 赤（エラーのみ）
      };
      return colors[status] || colors.pending;
    }

    /**
     * ステータスインジケーター作成（パーセント表示なし）
     */
    createStatusIndicator(status) {
      if (status === 'processing' || status === 'progress') {
        return `
        <div class="status-indicator" style="
          background: ${this.isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'};
          border-radius: 8px;
          height: 4px;
          overflow: hidden;
          margin-top: 8px;
          position: relative;
        ">
          <div class="status-pulse" style="
            background: linear-gradient(90deg, transparent, #6366f1, #8b5cf6, transparent);
            height: 100%;
            width: 30%;
            border-radius: 8px;
            animation: statusPulse 1.8s ease-in-out infinite;
          "></div>
        </div>
        <div style="display: flex; align-items: center; gap: 4px; margin-top: 8px;">
          <div class="status-dots" style="font-size: 10px; color: ${this.isDarkMode ? '#c084fc' : '#9333ea'};">
            処理中<span style="animation: dots 1.5s infinite;">...</span>
          </div>
        </div>
      `;
      }
      return '';
    }

    /**
     * タスク完了アニメーション
     */
    animateTaskCompletion(card) {
      // 控えめなサクセスアニメーション
      card.style.animation = 'taskComplete 0.8s ease-out';

      // 微妙なパーティクル効果を追加（控えめ）
      this.addSubtleParticleEffect(card);

      setTimeout(() => {
        card.style.animation = '';
      }, 800);

      this.ensureTaskAnimations();
    }

    /**
     * 控えめなパーティクル効果
     */
    addSubtleParticleEffect(card) {
      const particles = 3; // 少ない数のパーティクル
      const rect = card.getBoundingClientRect();

      for (let i = 0; i < particles; i++) {
        const particle = document.createElement('div');
        particle.style.cssText = `
        position: fixed;
        width: 4px;
        height: 4px;
        background: linear-gradient(45deg, #a78bfa, #c084fc);
        border-radius: 50%;
        pointer-events: none;
        z-index: 9999;
        left: ${rect.right - 20}px;
        top: ${rect.top + 10}px;
        opacity: 0.8;
        transform: scale(0);
        animation: subtleParticle 1.2s ease-out forwards;
      `;

        // ランダムな方向に少し移動
        const angle = (i / particles) * Math.PI * 2;
        const distance = 15; // 控えめな距離
        particle.style.setProperty('--move-x', `${Math.cos(angle) * distance}px`);
        particle.style.setProperty('--move-y', `${Math.sin(angle) * distance}px`);

        document.body.appendChild(particle);

        // 自動削除
        setTimeout(() => particle.remove(), 1200);
      }
    }

    /**
     * タスクアニメーション用CSS確保
     */
    ensureTaskAnimations() {
      if (document.getElementById('task-animations')) return;

      const style = document.createElement('style');
      style.id = 'task-animations';
      style.textContent = `
      @keyframes slideInUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @keyframes taskComplete {
        0% {
          transform: scale(1);
          border-left-color: rgba(192, 132, 252, 0.5);
        }
        30% {
          transform: scale(1.01);
          background: rgba(167, 139, 250, 0.08);
          border-left-color: rgba(167, 139, 250, 0.6);
        }
        60% {
          background: rgba(167, 139, 250, 0.05);
        }
        100% {
          transform: scale(1);
          background: rgba(167, 139, 250, 0.02);
          border-left-color: rgba(167, 139, 250, 0.4);
        }
      }

      @keyframes subtleParticle {
        0% {
          transform: scale(0) translate(0, 0);
          opacity: 0.8;
        }
        20% {
          transform: scale(1) translate(0, 0);
          opacity: 1;
        }
        100% {
          transform: scale(0.3) translate(var(--move-x, 0), var(--move-y, 0));
          opacity: 0;
        }
      }

      @keyframes shimmer {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
      }

      @keyframes slideIn {
        from { opacity: 0; transform: translateX(-20px); }
        to { opacity: 1; transform: translateX(0); }
      }

      @keyframes statusPulse {
        0% { transform: translateX(-100%); }
        50% { transform: translateX(300%); }
        100% { transform: translateX(-100%); }
      }

      @keyframes dots {
        0%, 20% { opacity: 0; }
        50% { opacity: 1; }
        100% { opacity: 0; }
      }

      @keyframes errorPulse {
        0% {
          transform: scale(1);
          filter: saturate(1.3) brightness(1.1);
        }
        50% {
          transform: scale(1.03);
          filter: saturate(1.5) brightness(1.2);
          box-shadow: 0 12px 40px rgba(244, 67, 54, 0.4), 0 0 80px rgba(244, 67, 54, 0.2);
        }
        100% {
          transform: scale(1);
          filter: saturate(1.3) brightness(1.1);
        }
      }
    `;
      document.head.appendChild(style);
    }

    /**
     * プログレス付きタスクステータス表示（互換性のため）
     */
    addTaskStatus(message, percent = 0, taskId = null) {
      const id = taskId || `task_${Date.now()}`;
      return this.addTaskCard(message, {
        percent: Math.min(Math.max(percent, 0), 100),
        taskId: id,
        status: percent > 0 ? 'progress' : 'pending'
      });
    }

    /**
     * プログレス更新
     */
    updateTaskProgress(taskId, percent, newMessage = null) {
      const existingTask = this.output.querySelector(`[data-task-id="${taskId}"]`);
      if (existingTask && newMessage) {
        // 既存タスクを更新
        this.addOutput(newMessage, 'progress', { 
          percent: Math.min(Math.max(percent, 0), 100),
          taskId
        });
      }
    }

    /**
     * タスク完了（プログレスバー削除）
     */
    completeTask(taskId) {
      const existingTask = this.output.querySelector(`[data-task-id="${taskId}"]`);
      if (existingTask) {
        // 完了アニメーション
        existingTask.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        existingTask.style.opacity = '0';
        existingTask.style.transform = 'translateX(20px)';
        
        setTimeout(() => {
          if (existingTask.parentNode) {
            existingTask.remove();
          }
        }, 500);
      }
    }

    /**
     * SSE接続開始（リアルタイム進捗受信）
     */
    connectToProgress(serverTaskId, uiTaskId = null) {
      if (this.activeConnections.has(serverTaskId)) {
        return;
      }

      const eventSource = new EventSource(`/api/progress/${serverTaskId}`);
      this.activeConnections.set(serverTaskId, eventSource);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          data.uiTaskId = uiTaskId; // UI用タスクIDを追加
          this.handleProgressUpdate(data);
        } catch (error) {
          console.error('SSE data parse error:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE connection error:', error);
        this.disconnectProgress(serverTaskId);
      };
    }

    /**
     * 進捗更新処理
     */
    handleProgressUpdate(data) {
      switch (data.type) {
        case 'connected':
          this.logDebug(`🔗 Connected to progress stream: ${data.taskId}`);
          break;

        case 'progress':
          if (data.percent !== undefined && data.uiTaskId) {
            this.updateTaskCard(data.uiTaskId, 'progress', { percent: data.percent });
          }
          break;

        case 'completed':
          if (data.uiTaskId) {
            this.updateTaskCard(data.uiTaskId, 'completed');
          }
          this.disconnectProgress(data.taskId);
          break;

        case 'error':
          if (data.uiTaskId) {
            this.updateTaskCard(data.uiTaskId, 'error');
          }
          this.addOutput(`❌ ${data.message}`, 'error');
          this.disconnectProgress(data.taskId);
          break;
      }
    }

    /**
     * SSE接続終了
     */
    disconnectProgress(taskId) {
      const connection = this.activeConnections.get(taskId);
      if (connection) {
        connection.close();
        this.activeConnections.delete(taskId);
      }
    }

    /**
     * 出力エリアを最下部にスクロール
     */
    scrollToBottom() {
      if (this.outputDiv) {
        this.outputDiv.scrollTop = this.outputDiv.scrollHeight;
      }
    }

    /**
     * モード別コマンドプレフィックス
     */
    getModePrefix(mode) {
      // サーバー側でモードを区別するためのプレフィックス
      const prefixes = {
        generate: '', // デフォルトは生成モード
        modify: '[変更] ',
        delete: '[削除] '
      };
      return prefixes[mode] || '';
    }

    /**
     * コマンド保存 (Undo/Redoシステム)
     */
    saveCommandToHistory(commandData) {
      // 現在のインデックス以降の履歴を削除（新しいコマンドが実行されたため）
      this.commandHistory = this.commandHistory.slice(0, this.currentHistoryIndex + 1);
      
      // 新しいコマンドを履歴に追加
      this.commandHistory.push(commandData);
      this.currentHistoryIndex = this.commandHistory.length - 1;
      
      // 最大コマンド保存数を超えた場合、古いコマンドを削除
      if (this.commandHistory.length > this.maxHistorySize) {
        this.commandHistory.shift();
        this.currentHistoryIndex--;
      }
      
      // ボタン状態を更新
      this.updateUndoRedoButtons();
    }

    /**
     * Undo実行
     */
    undo() {
      if (!this.canUndo()) {
        this.addOutput('↶ Undoできる操作がありません', 'hint');
        return;
      }
      
      const command = this.commandHistory[this.currentHistoryIndex];
      this.currentHistoryIndex--;
      
      // Undoの逆操作を実行（簡易実装）
      if (command.mode === 'generate') {
        this.addOutput(`↶ Undo: "${command.command}" の生成を取り消しました`, 'system');
        // 実際のシーン管理では最後に作成されたオブジェクトを削除
        if (this.sceneManager && this.sceneManager.undoLastGenerate) {
          this.sceneManager.undoLastGenerate();
        }
      } else if (command.mode === 'modify') {
        this.addOutput(`↶ Undo: "${command.command}" の変更を取り消しました`, 'system');
        // 実際のシーン管理では前の状態に戻す
        if (this.sceneManager && this.sceneManager.undoLastModify) {
          this.sceneManager.undoLastModify();
        }
      } else if (command.mode === 'delete') {
        this.addOutput(`↶ Undo: "${command.command}" の削除を取り消しました`, 'system');
        // 実際のシーン管理では削除されたオブジェクトを復元
        if (this.sceneManager && this.sceneManager.undoLastDelete) {
          this.sceneManager.undoLastDelete();
        }
      }
      
      this.updateUndoRedoButtons();
    }

    /**
     * Redo実行
     */
    redo() {
      if (!this.canRedo()) {
        this.addOutput('↷ Redoできる操作がありません', 'hint');
        return;
      }
      
      this.currentHistoryIndex++;
      const command = this.commandHistory[this.currentHistoryIndex];
      
      // Redoでコマンドを再実行
      this.addOutput(`↷ Redo: "${command.command}" を再実行しました`, 'system');
      
      // 実際のシーン管理でのRedo処理
      if (this.sceneManager && this.sceneManager.redoCommand) {
        this.sceneManager.redoCommand(command);
      }
      
      this.updateUndoRedoButtons();
    }

    /**
     * Undoが可能かチェック
     */
    canUndo() {
      return this.currentHistoryIndex >= 0;
    }

    /**
     * Redoが可能かチェック
     */
    canRedo() {
      return this.currentHistoryIndex < this.commandHistory.length - 1;
    }

    /**
     * Undo/Redoボタンの状態更新
     */
    updateUndoRedoButtons() {
      if (this.undoBtn) {
        this.undoBtn.disabled = !this.canUndo();
        this.undoBtn.style.opacity = this.canUndo() ? '1' : '0.4';
        this.undoBtn.style.cursor = this.canUndo() ? 'pointer' : 'not-allowed';
      }
      
      if (this.redoBtn) {
        this.redoBtn.disabled = !this.canRedo();
        this.redoBtn.style.opacity = this.canRedo() ? '1' : '0.4';
        this.redoBtn.style.cursor = this.canRedo() ? 'pointer' : 'not-allowed';
      }
    }

    /**
     * 確認付き全オブジェクト削除
     */
    async clearAllWithConfirmation() {
      const confirmed = await this.showClearAllConfirmation();
      if (confirmed) {
        this.clearAll();
      }
    }

    /**
     * Clear All確認ダイアログ
     */
    async showClearAllConfirmation() {
      return this.showConfirmationDialog({
        icon: '🧹',
        title: 'Clear All の確認',
        message: 'すべてのオブジェクトが削除されます。<br>この操作は取り消すことができません。',
        confirmText: 'Clear All 実行',
        cancelText: 'キャンセル',
        confirmColor: '#6366f1'
      });
    }

    /**
     * モーダルクローズアニメーション
     */
    closeModalWithAnimation(modal) {
      const dialog = modal.querySelector('div:last-child');
      dialog.style.transform = 'scale(0.9)';
      dialog.style.opacity = '0';
      modal.style.opacity = '0';
      
      setTimeout(() => {
        if (modal.parentElement) {
          document.body.removeChild(modal);
        }
      }, 200);
    }

    /**
     * 全オブジェクト削除
     */
    clearAll() {
      if (this.sceneManager) {
        this.sceneManager.clearAll();
        this.addOutput('🧹 全ての実験オブジェクトを削除しました', 'system');
      } else if (this.client) {
        // サーバー側での削除は未実装
        this.addOutput('⚠️ サーバー側削除は未実装', 'error');
      }
    }

    // showHistory() メソッド完全削除済み

    /**
     * 利用可能なコマンド例を表示
     */
    showExamples() {
      const examples = [
        '右上にドラゴンを作って',
        '中央に大きなユニコーンを生成',
        '左下に小さな桜を作って',
        '空に鳳凰を作って',
        '地面に神社を作って'
      ];

      this.addOutput('💡 コマンド例:', 'system');
      examples.forEach(example => {
        this.addOutput(`   "${example}"`, 'hint');
      });
    }

    /**
     * SceneManager設定
     */
    setSceneManager(sceneManager) {
      this.sceneManager = sceneManager;
      this.applyServiceSelectionToSceneManager();
      this.initializeScenePersistence();
    }

    /**
     * Client設定
     */
    setClient(client) {
      this.client = client;
    }

    /**
     * 設定更新
     */
    updateConfig(newConfig) {
      this.config = { ...this.config, ...newConfig };
      // 必要に応じてUIを更新
      if (newConfig.activationKey) {
        // 新しいキーバインドを反映するため、イベントリスナーを再設定
        this.bindEvents();
      }
    }

    /**
     * クリーンアップ
     */
    /**
     * スタイル再適用
     */
    refreshStyles() {
      // ボディにテーマクラスを設定
      document.body.className = this.isWabiSabiMode ? 'wabisabi-mode' : (this.isDarkMode ? 'dark-mode' : 'light-mode');

      // Generateモードボタンのスタイルを再適用
      const generateBtn = this.container?.querySelector('[data-mode="generate"]');
      if (generateBtn) {
        generateBtn.style.cssText = this.getModeButtonStyles(true, 'generate');
      }
      
      // Executeボタンのスタイルを再適用
      const executeBtn = this.container?.querySelector('#execute-btn');
      if (executeBtn) {
        executeBtn.style.cssText = this.getModernButtonStyles('primary');
      }

      if (this.onboardingLauncherButton) {
        this.onboardingLauncherButton.style.background = this.isDarkMode
          ? 'rgba(255, 255, 255, 0.12)'
          : 'rgba(0, 0, 0, 0.06)';
        this.onboardingLauncherButton.style.color = this.isDarkMode ? '#f8fafc' : '#1f2937';
        this.onboardingLauncherButton.style.border = this.isDarkMode
          ? '1px solid rgba(255, 255, 255, 0.28)'
          : '1px solid rgba(15, 23, 42, 0.18)';
      }

      if (this.saveButton) {
        this.saveButton.style.cssText = this.getActionButtonStyles('icon');
        this.updateSaveButtonState();
      }
      if (this.loadButton) {
        this.loadButton.style.cssText = this.getActionButtonStyles('icon');
      }
      if (this.clearBtn) {
        this.clearBtn.style.cssText = this.getActionButtonStyles('icon');
      }
      if (this.historyBtn) {
        this.historyBtn.style.cssText = this.getActionButtonStyles('icon');
        this.historyBtn.style.opacity = '0.5';
      }
      if (this.themeToggle) {
        this.themeToggle.style.cssText = this.getActionButtonStyles('icon');
      }
      if (this.settingsButton) {
        this.settingsButton.style.cssText = this.getActionButtonStyles('icon');
      }
    }

    /**
     * テーマ切り替え (light -> dark -> wabisabi -> light)
     */
    toggleTheme() {
      const themeOrder = ['light', 'dark', 'wabisabi'];
      const currentIndex = themeOrder.indexOf(this.currentTheme);
      const nextIndex = (currentIndex + 1) % themeOrder.length;

      this.currentTheme = themeOrder[nextIndex];
      this.isDarkMode = this.currentTheme === 'dark';
      this.isWabiSabiMode = this.currentTheme === 'wabisabi';

      localStorage.setItem('live-command-theme', this.currentTheme);

      // アイコンボタン更新
      if (this.themeToggle) {
        const getThemeIcon = () => {
          const themeConfig = {
            light: '🌙',
            dark: '🍵',
            wabisabi: '☀️'
          };
          return themeConfig[this.currentTheme] || '🌙';
        };

        const getThemeTitle = () => {
          const titleConfig = {
            light: 'ダークモードに切り替え',
            dark: '侘び寂びモードに切り替え',
            wabisabi: 'ライトモードに切り替え'
          };
          return titleConfig[this.currentTheme] || 'ダークモードに切り替え';
        };

        const getThemeIconWithFilter = () => {
          const icon = getThemeIcon();
          if (icon === '☀️') {
            return `<span style="filter: saturate(1.2) brightness(1.1);">${icon}</span>`;
          } else if (icon === '🍵') {
            return `<span style="filter: hue-rotate(80deg) saturate(1.1) brightness(1.0);">${icon}</span>`;
          } else {
            return `<span style="filter: hue-rotate(240deg) saturate(0.8) brightness(1.1);">${icon}</span>`;
          }
        };

        this.themeToggle.innerHTML = getThemeIconWithFilter();
        this.themeToggle.title = getThemeTitle();
      }

      // 全スタイル再適用
      this.applyTheme();

      // テーマ切り替え完了（履歴には出力しない）
    }

    /**
     * テーマ適用
     */
    applyTheme() {
      // ボディにテーマクラスを設定
      document.body.className = this.isDarkMode ? 'dark-mode' : 'light-mode';

      // メインコンテナ（display状態を保持）
      const currentDisplay = this.container.style.display;
      const currentFlexDirection = this.container.style.flexDirection;
      this.container.style.cssText = this.getContainerStyles();
      this.container.style.display = currentDisplay || 'flex';
      this.container.style.flexDirection = currentFlexDirection || 'column';

      // フローティングブランドバッジのテーマ再適用
      const brandBadge = this.container.querySelector('.floating-brand-badge');
      if (brandBadge) {
        brandBadge.style.background = this.isDarkMode 
          ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.8), rgba(139, 92, 246, 0.7))'
          : 'linear-gradient(135deg, rgba(99, 102, 241, 0.9), rgba(139, 92, 246, 0.8))';
        brandBadge.style.border = `1px solid ${this.isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.4)'}`;
      }

      // 入力フィールド
      this.input.style.cssText = this.getInputStyles();

      // スタイル適用
      this.output.style.cssText = this.getOutputStyles();

      // ラジオボタンモードセレクターの2025年仕様テーマ再適用
      if (this.radioModeContainer) {
        this.radioModeContainer.style.background = this.isWabiSabiMode
          ? 'linear-gradient(135deg, rgba(97, 97, 97, 0.7), rgba(66, 66, 66, 0.6))'
          : (this.isDarkMode
            ? 'linear-gradient(135deg, rgba(30, 27, 75, 0.3), rgba(15, 23, 42, 0.4))'
            : 'linear-gradient(135deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.1))');
        this.radioModeContainer.style.borderColor = this.isWabiSabiMode
          ? 'rgba(93, 64, 55, 0.4)'
          : (this.isDarkMode
            ? 'rgba(99, 102, 241, 0.15)'
            : 'rgba(255, 255, 255, 0.25)');

        // 各ラジオボタンのスタイル更新
        Object.keys(this.radioModeButtons).forEach(key => {
          const { button } = this.radioModeButtons[key];
          if (this.currentMode !== key) {
            button.style.color = this.isWabiSabiMode
              ? 'rgba(245, 245, 245, 0.8)'
              : (this.isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(55, 65, 81, 0.8)');
            button.style.background = 'transparent';
            button.style.border = '1px solid transparent';
            button.style.boxShadow = 'none';
          }
        });

        // 現在選択されているモードのスタイルも更新
        this.selectMode(this.currentMode, false);
      }

      // アクションボタンのテーマ再適用
      if (this.saveButton) {
        this.saveButton.style.cssText = this.getActionButtonStyles('primary');
        this.updateSaveButtonState();
      }
      if (this.clearBtn) {
        this.clearBtn.style.cssText = this.getActionButtonStyles('secondary');
      }
      if (this.historyBtn) {
        this.historyBtn.style.cssText = this.getActionButtonStyles('secondary');
        this.historyBtn.style.opacity = '0.5';
      }
      if (this.themeToggle) {
        const getThemeIcon = () => {
          const themeConfig = {
            light: '🌙', // ライトモード時は月を表示（次がダーク）
            dark: '🍵',  // ダークモード時は茶を表示（次がwabi-sabi）
            wabisabi: '☀️' // wabi-sabiモード時は太陽を表示（次がライト）
          };
          return themeConfig[this.currentTheme] || '🌙';
        };
        const getThemeTitle = () => {
          const titleConfig = {
            light: 'ダークモードに切り替え',
            dark: '侘び寂びモードに切り替え',
            wabisabi: 'ライトモードに切り替え'
          };
          return titleConfig[this.currentTheme] || 'ダークモードに切り替え';
        };
        const getThemeIconWithFilter = () => {
          const icon = getThemeIcon();
          // 太陽は黄色く、お茶は緑系、月は紫系フィルター
          if (icon === '☀️') {
            return `<span style="filter: saturate(1.2) brightness(1.1);">${icon}</span>`;
          } else if (icon === '🍵') {
            return `<span style="filter: hue-rotate(80deg) saturate(1.1) brightness(1.0);">${icon}</span>`;
          } else {
            return `<span style="filter: hue-rotate(240deg) saturate(0.8) brightness(1.1);">${icon}</span>`;
          }
        };
        this.themeToggle.innerHTML = getThemeIconWithFilter();
        this.themeToggle.title = getThemeTitle();
        this.themeToggle.style.cssText = this.getActionButtonStyles('icon');
      }
      if (this.settingsButton) {
        this.settingsButton.style.cssText = this.getActionButtonStyles('icon');
      }

      this.updateServiceSelectorTheme();

      // 閉じるボタンのテーマ更新
      const closeButton = this.container.querySelector('.close-button');
      if (closeButton) {
        closeButton.style.color = this.isWabiSabiMode ? '#F5F5F5' : (this.isDarkMode ? '#ffffff' : '#1f2937');
        closeButton.style.background = this.isWabiSabiMode
          ? 'rgba(245, 245, 245, 0.1)'
          : (this.isDarkMode
            ? 'rgba(255, 255, 255, 0.1)'
            : 'rgba(0, 0, 0, 0.1)');
      }

      // フローティングコンテナとタスクカードのテーマ更新
      this.updateFloatingContainerTheme();

      // 既存の出力テキストの色を更新
      this.updateExistingTextColors();
    }

    /**
     * フローティングコンテナとタスクカードのテーマ更新
     */
    updateFloatingContainerTheme() {
      if (!this.floatingContainer) return;

      // フローティングコンテナの表示状態を保持
      const currentDisplay = this.floatingContainer.style.display;

      // 既存のタスクカードの色だけをテーマに合わせて更新（レイアウトは保持）
      if (this.taskCards && this.taskCards.size > 0) {
        this.taskCards.forEach((taskData, taskId) => {
          const card = taskData.element;
          if (card) {
            // テーマ関連の色のみ更新（位置やアニメーション状態は保持）
            // 2025年Glassmorphism仕様適用
            const glassmorphismDark = {
              background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.75), rgba(30, 27, 75, 0.7))',
              border: '1px solid rgba(99, 102, 241, 0.25)',
              color: '#ffffff'
            };

            const glassmorphismLight = {
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.35), rgba(255, 255, 255, 0.25))',
              border: '1px solid rgba(255, 255, 255, 0.4)',
              color: '#1f2937'
            };

            const theme = this.isDarkMode ? glassmorphismDark : glassmorphismLight;


            card.style.setProperty('background', theme.background, 'important');
            card.style.setProperty('border', theme.border, 'important');
            card.style.setProperty('color', theme.color, 'important');
          }
        });
      }

      // テーマ切り替え時は位置は変更せず、表示状態のみ復元
      this.floatingContainer.style.display = currentDisplay;
    }

    /**
     * 既存のテキスト色を現在のテーマに合わせて更新
     */
    updateExistingTextColors() {
      const colors = this.isDarkMode ? {
        system: '#60a5fa',
        command: '#93c5fd',
        success: '#f472b6',
        error: '#f87171',
        processing: '#fbbf24',
        info: '#d1d5db',
        hint: '#d1d5db'
      } : {
        system: '#1e40af',
        command: '#1d4ed8',
        success: '#be185d',
        error: '#dc2626',
        processing: '#d97706',
        info: '#7c3aed',
        hint: '#374151'
      };

      const defaultTextColor = this.isDarkMode ? '#d1d5db' : '#374151';

      // output内の全てのdivの色を更新
      this.output.querySelectorAll('div').forEach(line => {
        const text = line.textContent;
        let type = 'default';
        
        // テキストの内容からタイプを判定
        if (text.includes('📋') || text.includes('🎨') || text.includes('🎮') || text.includes('UI起動')) {
          type = 'system';
        } else if (text.startsWith('> ')) {
          type = 'command';
        } else if (text.includes('✅') || text.includes('⭐') || text.includes('生成しました')) {
          type = 'success';
        } else if (text.includes('❌') || text.includes('エラー')) {
          type = 'error';
        } else if (text.includes('中...')) {
          type = 'processing';
        } else if (text.includes('📍') || text.includes('使用モデル:') || text.includes('位置:')) {
          type = 'info';
        } else if (text.includes('   ')) {
          type = 'hint';
        }

        line.style.color = colors[type] || defaultTextColor;
      });
    }

    /**
     * Importインターフェース表示
     */
    showImportInterface() {
      // 隠しファイル入力を作成（Importボタンから直接選択できるので、ボタンは不要）
      if (!this.fileInput) {
        this.fileInput = document.createElement('input');
        this.fileInput.type = 'file';
        this.fileInput.accept = '.glb,.gltf,.jpg,.jpeg,.png,.mp4,.mov';
        this.fileInput.style.display = 'none';
        this.fileInput.onchange = (e) => this.handleFileSelection(e);
        document.body.appendChild(this.fileInput);
      }

      // ドラッグ&ドロップ機能を有効化
      this.enableDragAndDrop();
    }

    /**
     * Importインターフェース非表示
     */
    hideImportInterface() {
      if (this.fileSelectButton && this.fileSelectButton.parentNode) {
        this.fileSelectButton.parentNode.removeChild(this.fileSelectButton);
      }
      this.disableDragAndDrop();
    }

    /**
     * ファイル選択ダイアログを開く
     */
    openFileSelector() {
      if (this.fileInput) {
        this.fileInput.click();
      }
    }

    /**
     * Importボタンから直接ファイル選択を実行
     */
    triggerFileSelection() {
      // ファイル入力要素が存在しない場合は作成
      if (!this.fileInput) {
        this.showImportInterface(); // 既存のファイル入力作成処理を呼び出し
      }

      // 直接ファイル選択ダイアログを開く
      this.openFileSelector();

      // Import モードに切り替え（UI反映）
      this.selectMode('import', true);
    }

    /**
     * ファイル選択処理
     */
    async handleFileSelection(event) {
      const file = event.target.files[0];
      if (!file) return;

      try {
        // ファイルタイプを判定
        const fileType = this.detectFileType(file.name);

        // ファイルをローカルURLとして処理
        const fileUrl = URL.createObjectURL(file);

        // ファイル情報を保存
        this.selectedFile = {
          file: file,
          url: fileUrl,
          type: fileType,
          name: file.name
        };

        if (event?.target) {
          event.target.value = '';
        }

        this.selectMode('import', true);

        // 自動的にデフォルトプロンプトで実行
        const defaultPrompt = `中央に設置 (${file.name})`;
        this.input.value = defaultPrompt;

        this.addOutput(`📁 ファイル選択: ${file.name} (${fileType})`, 'system');
        this.addOutput(`🚀 自動アップロード開始: ${defaultPrompt}`, 'system');

        // 自動実行（少し遅延を入れてUX向上）
        setTimeout(() => {
          this.executeCommand();
        }, 500);

      } catch (error) {
        console.error('File selection error:', error);
        this.addOutput(`❌ ファイル選択エラー: ${error.message}`, 'error');
      }
    }

    /**
     * ドラッグ&ドロップ機能を有効化
     */
    enableDragAndDrop() {
      if (!this.input) return;

      this.input.addEventListener('dragover', this.handleDragOver.bind(this));
      this.input.addEventListener('drop', this.handleDrop.bind(this));
      this.input.addEventListener('dragenter', this.handleDragEnter.bind(this));
      this.input.addEventListener('dragleave', this.handleDragLeave.bind(this));
    }

    /**
     * ドラッグ&ドロップ機能を無効化
     */
    disableDragAndDrop() {
      if (!this.input) return;

      this.input.removeEventListener('dragover', this.handleDragOver.bind(this));
      this.input.removeEventListener('drop', this.handleDrop.bind(this));
      this.input.removeEventListener('dragenter', this.handleDragEnter.bind(this));
      this.input.removeEventListener('dragleave', this.handleDragLeave.bind(this));
    }

    /**
     * ドラッグオーバー処理
     */
    handleDragOver(e) {
      e.preventDefault();
      this.input.style.background = this.isDarkMode ? 'rgba(236, 72, 153, 0.1)' : 'rgba(236, 72, 153, 0.05)';
    }

    /**
     * ドラッグエンター処理
     */
    handleDragEnter(e) {
      e.preventDefault();
      this.input.style.background = this.isDarkMode ? 'rgba(236, 72, 153, 0.1)' : 'rgba(236, 72, 153, 0.05)';
    }

    /**
     * ドラッグリーブ処理
     */
    handleDragLeave(e) {
      e.preventDefault();
      this.input.style.background = '';
    }

    /**
     * ドロップ処理
     */
    async handleDrop(e) {
      e.preventDefault();
      this.input.style.background = '';

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      const file = files[0]; // 最初のファイルのみ処理

      // ファイルタイプをチェック
      const fileType = this.detectFileType(file.name);
      if (!fileType) {
        this.addOutput('❌ サポートされていないファイル形式です', 'error');
        return;
      }

      // ファイル選択処理と同じ流れ
      this.handleFileSelection({ target: { files: [file] } });
    }

    /**
     * ファイルタイプ判定
     */
    detectFileType(fileName) {
      const ext = fileName.toLowerCase().split('.').pop();

      if (['glb', 'gltf'].includes(ext)) return '3d';
      if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return 'image';
      if (['mp4', 'mov', 'webm'].includes(ext)) return 'video';

      return null;
    }

    /**
     * Importコマンド処理
     */
    async handleImportCommand(command, options = {}) {
      const importType = options.selectedFileType || this.selectedFile?.type;
      if (!this.selectedFile) {
        throw new Error('ファイルが選択されていません');
      }

      try {
        // プロンプトから位置情報を解析
        const position = this.sceneManager ? this.sceneManager.parsePosition(command) : { x: 0, y: 5, z: -10 };

        let result;

        switch (this.selectedFile.type) {
          case '3d':
            // 3Dモデルを読み込み
            if (this.sceneManager) {
              result = await this.sceneManager.load3DModel(this.selectedFile.url, {
                position: position,
                // scale: 自動調整に任せる
                fileName: this.selectedFile.name
              });
            } else {
              throw new Error('SceneManager が利用できません');
            }
            break;

          case 'image':
            // 画像をテクスチャプレーンとして配置
            if (this.sceneManager) {
              result = await this.sceneManager.loadImageFile(this.selectedFile.url, {
                position: position,
                fileName: this.selectedFile.name
              });
            } else {
              throw new Error('SceneManager が利用できません');
            }
            break;

          case 'video':
            // 動画をビデオテクスチャとして配置
            if (this.sceneManager) {
              result = await this.sceneManager.loadVideoFile(this.selectedFile.url, {
                position: position,
                fileName: this.selectedFile.name
              });
            } else {
              throw new Error('SceneManager が利用できません');
            }
            break;

          default:
            throw new Error(`サポートされていないファイルタイプ: ${this.selectedFile.type}`);
        }

        // ファイル情報をクリーンアップ
        const processedFileName = this.selectedFile?.name;
        const importedType = this.selectedFile?.type;
        const importedUrl = this.selectedFile?.url;

        if (importedType !== 'video' && importedUrl) {
          URL.revokeObjectURL(importedUrl);
        }

        if (this.fileInput) {
          this.fileInput.value = '';
        }

        this.selectedFile = null;
        this.selectMode('generate', false);

        return {
          success: true,
          message: `${processedFileName || 'ファイル'} を ${position.x}, ${position.y}, ${position.z} に配置しました`,
          objectId: result.objectId,
          contentType: importType
        };

      } catch (error) {
        // エラー時もファイル情報をクリーンアップ
        if (this.selectedFile?.url) {
          URL.revokeObjectURL(this.selectedFile.url);
        }
        if (this.fileInput) {
          this.fileInput.value = '';
        }
        this.selectedFile = null;
        this.selectMode('generate', false);
        throw error;
      }
    }

    /**
     * 削除モードが選択された時の処理
     */
    handleDeleteModeSelection() {
      // SceneManagerから選択されたオブジェクトを取得
      const selectedObject = this.sceneManager?.selectedObject;
      
      if (selectedObject) {
        // 選択されたオブジェクトがある場合：削除コマンドをチャット欄に入力
        const objectName = selectedObject.userData?.originalPrompt || selectedObject.name || '選択したオブジェクト';
        this.input.value = `${objectName}を削除 ⏎`;
        this.input.focus();
        
        // カーソルを文末に移動（選択状態を解除）
        this.input.setSelectionRange(this.input.value.length, this.input.value.length);
        
        this.addOutput(`🎯 削除対象: ${objectName}`, 'system');
      } else {
        // 選択されたオブジェクトがない場合：2025年トレンドアニメーションで注意喚起
        this.input.value = '';
        this.addOutput('❗ 削除するオブジェクトを選択後、削除ボタンを押してください', 'system');
        
        // 2025年トレンド：Context-Aware Attention Animation
        this.triggerAttentionAnimation('delete');
        
        // DELETEモードを維持（generateモードに戻さない）
      }
    }

    /**
     * 修正モードが選択された時の処理
     */
    handleModifyModeSelection() {
      // SceneManagerから選択されたオブジェクトを取得
      const selectedObject = this.sceneManager?.selectedObject;
      
      if (selectedObject) {
        // 選択されたオブジェクトがある場合：修正コマンドをチャット欄に入力
        const objectName = selectedObject.userData?.originalPrompt || selectedObject.name || '選択したオブジェクト';
        this.input.value = `${objectName}を`;
        this.input.focus();
        
        // カーソルを文末に移動（選択状態を解除）
        this.input.setSelectionRange(this.input.value.length, this.input.value.length);
        
        this.addOutput(`🎯 修正対象: ${objectName}`, 'system');
      } else {
        // 選択されたオブジェクトがない場合：2025年トレンドアニメーションで注意喚起
        this.input.value = '';
        this.addOutput('❗ 修正するオブジェクトを選択後、修正ボタンを押してください', 'system');
        
        // 2025年トレンド：Context-Aware Attention Animation
        this.triggerAttentionAnimation('modify');
        
        // Modifyモードを維持（generateモードに戻さない）
      }
    }

    /**
     * 2025年トレンド：Context-Aware Attention Animation
     * オブジェクト未選択時の注意喚起アニメーション
     */
    triggerAttentionAnimation(mode) {
      const chatOutput = this.chatOutput;
      const inputField = this.input;
      
      // 2025年トレンド1: Micro-Shake Effect（微細な震え）
      this.addMicroShakeEffect(chatOutput);
      
      // 2025年トレンド2: Context-Aware Glow（状況認識グロー）
      this.addContextGlow(inputField, mode);
      
      // 2025年トレンド3: Emotional Pulse（感情的パルス）
      this.addEmotionalPulse(chatOutput, mode);
      
      // 2025年トレンド4: 3D Depth Shadow（立体的影効果）
      this.add3DDepthEffect(chatOutput);
    }

    /**
     * 2025年トレンド：Micro-Shake Effect
     */
    addMicroShakeEffect(element) {
      element.style.animation = 'microShake2025 0.5s ease-in-out';
      
      // CSSアニメーションを動的追加
      this.ensureMicroShakeAnimation();
      
      // アニメーション後クリーンアップ
      setTimeout(() => {
        element.style.animation = '';
      }, 500);
    }

    /**
     * 2025年トレンド：Context-Aware Glow
     */
    addContextGlow(element, mode) {
      const glowColor = mode === 'delete' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(99, 102, 241, 0.4)';
      
      element.style.transition = 'all 0.3s ease';
      element.style.boxShadow = `0 0 20px ${glowColor}, 0 0 40px ${glowColor}`;
      
      // 3秒後にフェードアウト
      setTimeout(() => {
        element.style.boxShadow = '';
      }, 3000);
    }

    /**
     * 2025年トレンド：Emotional Pulse
     */
    addEmotionalPulse(element, mode) {
      const pulseColor = mode === 'delete' ? '#ef4444' : '#6366f1';
      
      element.style.borderLeft = `4px solid ${pulseColor}`;
      element.style.animation = 'emotionalPulse2025 2s ease-in-out infinite';
      
      // CSSアニメーションを動的追加
      this.ensureEmotionalPulseAnimation();
      
      // 6秒後にアニメーション停止
      setTimeout(() => {
        element.style.animation = '';
        element.style.borderLeft = '';
      }, 6000);
    }

    /**
     * 2025年トレンド：3D Depth Effect
     */
    add3DDepthEffect(element) {
      element.style.transform = 'translateZ(8px) rotateX(1deg)';
      element.style.transition = 'transform 0.3s ease';
      
      // 2秒後に元に戻す
      setTimeout(() => {
        element.style.transform = '';
      }, 2000);
    }

    /**
     * Micro-Shake CSSアニメーション確保
     */
    ensureMicroShakeAnimation() {
      if (document.getElementById('micro-shake-2025')) return;
      
      const style = document.createElement('style');
      style.id = 'micro-shake-2025';
      style.textContent = `
      @keyframes microShake2025 {
        0%, 100% { transform: translateX(0); }
        10% { transform: translateX(-2px) rotateZ(-0.5deg); }
        20% { transform: translateX(2px) rotateZ(0.5deg); }
        30% { transform: translateX(-1px) rotateZ(-0.3deg); }
        40% { transform: translateX(1px) rotateZ(0.3deg); }
        50% { transform: translateX(-0.5px) rotateZ(-0.1deg); }
        60% { transform: translateX(0.5px) rotateZ(0.1deg); }
        70% { transform: translateX(0); }
      }
    `;
      document.head.appendChild(style);
    }

    /**
     * Emotional Pulse CSSアニメーション確保
     */
    ensureEmotionalPulseAnimation() {
      if (document.getElementById('emotional-pulse-2025')) return;
      
      const style = document.createElement('style');
      style.id = 'emotional-pulse-2025';
      style.textContent = `
      @keyframes emotionalPulse2025 {
        0% { 
          border-left-width: 4px;
          filter: brightness(1);
        }
        50% { 
          border-left-width: 8px;
          filter: brightness(1.2) saturate(1.1);
        }
        100% { 
          border-left-width: 4px;
          filter: brightness(1);
        }
      }
    `;
      document.head.appendChild(style);
    }

    /**
     * モード切り替え時の入力欄メッセージ上書き機能
     * ユーザビリティ向上：他モードのメッセージを新モードの初期状態にクリア
     */
    clearInputOnModeSwitch(newMode) {
      // 現在の入力欄に内容がある場合のみ処理
      if (this.input.value.trim()) {
        // 以前のモードのメッセージかどうかを判定
        const isPreviousModeMessage = this.isPreviousModeMessage(this.input.value, newMode);
        
        if (isPreviousModeMessage) {
          // 以前のモードのメッセージの場合、新モードの初期メッセージに置き換え
          this.input.value = '';
          this.addOutput(`💫 ${this.getModeDisplayName(newMode)}モードに切り替えました`, 'system');
        }
      }
    }

    /**
     * 入力内容が以前のモードのメッセージかどうかを判定
     */
    isPreviousModeMessage(inputValue, currentMode) {
      // Delete/Modifyモードの特徴的なメッセージパターンを検出
      const deletePatterns = [
        /.*を削除$/,
        /削除$/
      ];
      
      const modifyPatterns = [
        /.*を$/,
        /.*を変更/,
        /.*をピンク/,
        /.*を大きく/,
        /.*を小さく/,
        /.*を移動/,
        /回転/,
        /反転/,
        /ミラー/,
        /傾け/,
        /向きを変え/,
        /.*を.*色/,
        /.*を.*サイズ/
      ];
      
      const importPatterns = [
        /ファイル/,
        /画像/,
        /インポート/
      ];

      // 現在のモードと異なるパターンにマッチする場合は上書き対象
      switch (currentMode) {
        case 'delete':
          return modifyPatterns.some(pattern => pattern.test(inputValue)) ||
                 importPatterns.some(pattern => pattern.test(inputValue));
                 
        case 'modify':
          return deletePatterns.some(pattern => pattern.test(inputValue)) ||
                 modifyPatterns.some(pattern => pattern.test(inputValue)) ||
                 importPatterns.some(pattern => pattern.test(inputValue));
                 
        case 'import':
          return deletePatterns.some(pattern => pattern.test(inputValue)) ||
                 modifyPatterns.some(pattern => pattern.test(inputValue));
                 
        case 'generate':
          return deletePatterns.some(pattern => pattern.test(inputValue)) ||
                 modifyPatterns.some(pattern => pattern.test(inputValue)) ||
                 importPatterns.some(pattern => pattern.test(inputValue));
                 
        default:
          return false;
      }
    }

    /**
     * モード表示名を取得
     */
    getModeDisplayName(mode) {
      const modeNames = {
        'generate': '生成',
        'import': 'インポート',
        'modify': '修正',
        'delete': '削除'
      };
      return modeNames[mode] || mode;
    }

    /**
     * 常時表示フローティングチョコアイコンを作成
     */
    createFloatingChocolateIcon() {
      // 既存のアイコンがあれば削除
      if (this.floatingChocolateIcon) {
        this.floatingChocolateIcon.remove();
      }

      this.floatingChocolateIcon = document.createElement('div');
      this.floatingChocolateIcon.innerHTML = '🍫';
      this.floatingChocolateIcon.title = 'ChocoDrop を開く (@キーでも開けます)';
      this.floatingChocolateIcon.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: rgba(99, 102, 241, 0.15);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2), 0 2px 6px rgba(0, 0, 0, 0.05);
      opacity: 0.8;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      cursor: pointer;
      z-index: 999;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      transform: scale(1);
      filter: none;
    `;

      // ホバー効果
      this.floatingChocolateIcon.addEventListener('mouseover', () => {
        this.floatingChocolateIcon.style.transform = 'scale(1.1) translateY(-2px)';
        this.floatingChocolateIcon.style.boxShadow = '0 6px 16px rgba(99, 102, 241, 0.3), 0 3px 8px rgba(0, 0, 0, 0.1)';
        this.floatingChocolateIcon.style.opacity = '1';
        this.floatingChocolateIcon.style.filter = 'none';
      });

      this.floatingChocolateIcon.addEventListener('mouseout', () => {
        this.floatingChocolateIcon.style.transform = 'scale(1) translateY(0)';
        this.floatingChocolateIcon.style.boxShadow = '0 4px 12px rgba(99, 102, 241, 0.2), 0 2px 6px rgba(0, 0, 0, 0.05)';
        this.floatingChocolateIcon.style.opacity = '0.8';
        this.floatingChocolateIcon.style.filter = 'none';
      });

      // クリックで ChocoDrop を開く
      this.floatingChocolateIcon.addEventListener('click', () => {
        if (this.isVisible) {
          this.hide();
        } else {
          this.show();
        }
      });

      // 右クリックメニュー
      this.floatingChocolateIcon.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showFloatingIconContextMenu(e);
      });

      // DOM に追加
      document.body.appendChild(this.floatingChocolateIcon);
    }

    /**
     * フローティングアイコンの右クリックメニューを表示
     */
    showFloatingIconContextMenu(event) {
      // 既存のメニューがあれば削除
      const existingMenu = document.querySelector('.floating-icon-context-menu');
      if (existingMenu) {
        existingMenu.remove();
      }

      // コンテキストメニュー作成
      const menu = document.createElement('div');
      menu.className = 'floating-icon-context-menu';
      menu.style.cssText = `
      position: fixed;
      top: ${event.clientY}px;
      left: ${event.clientX}px;
      background: ${this.isDarkMode ? 'rgba(17, 24, 39, 0.85)' : 'rgba(255, 255, 255, 0.85)'};
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid ${this.isDarkMode ? 'rgba(129, 140, 248, 0.3)' : 'rgba(99, 102, 241, 0.2)'};
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(99, 102, 241, 0.2), 0 4px 12px rgba(0, 0, 0, 0.1);
      padding: 8px 0;
      min-width: 160px;
      z-index: 2000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      color: ${this.isWabiSabiMode ? '#F5F5F5' : (this.isDarkMode ? '#ffffff' : '#1f2937')};
    `;

      // メニューアイテム1: フォームを開く
      const openFormItem = document.createElement('div');
      openFormItem.innerHTML = '📄 フォームを開く';
      openFormItem.style.cssText = `
      padding: 8px 16px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 8px;
      color: #6366f1;
      text-shadow: 0 2px 4px rgba(99, 102, 241, 0.3);
    `;

      openFormItem.addEventListener('mouseover', () => {
        openFormItem.style.background = this.isDarkMode ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.1)';
        openFormItem.style.textShadow = '0 2px 6px rgba(99, 102, 241, 0.5)';
      });

      openFormItem.addEventListener('mouseout', () => {
        openFormItem.style.background = 'transparent';
        openFormItem.style.textShadow = '0 2px 4px rgba(99, 102, 241, 0.3)';
      });

      openFormItem.addEventListener('click', () => {
        menu.remove();
        if (this.isVisible) {
          this.hide();
        } else {
          this.show();
        }
      });

      // メニューアイテム2: アイコンを非表示
      const hideIconItem = document.createElement('div');
      hideIconItem.innerHTML = '✕ アイコンを非表示';
      hideIconItem.style.cssText = `
      padding: 8px 16px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 8px;
      color: #6366f1;
      text-shadow: 0 2px 4px rgba(99, 102, 241, 0.3);
    `;

      hideIconItem.addEventListener('mouseover', () => {
        hideIconItem.style.background = this.isDarkMode ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.1)';
        hideIconItem.style.textShadow = '0 2px 6px rgba(99, 102, 241, 0.5)';
      });

      hideIconItem.addEventListener('mouseout', () => {
        hideIconItem.style.background = 'transparent';
        hideIconItem.style.textShadow = '0 2px 4px rgba(99, 102, 241, 0.3)';
      });

      hideIconItem.addEventListener('click', () => {
        menu.remove();
        this.hideFloatingIcon();
      });

      // メニューに追加
      menu.appendChild(openFormItem);

      if (this.onboardingCoach) {
        const guideItem = document.createElement('div');
        guideItem.innerHTML = '🎯 初回ガイドを再生';
        guideItem.style.cssText = `
        padding: 8px 16px;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        gap: 8px;
        color: #6366f1;
        text-shadow: 0 2px 4px rgba(99, 102, 241, 0.3);
      `;

        guideItem.addEventListener('mouseover', () => {
          guideItem.style.background = this.isDarkMode ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.1)';
          guideItem.style.textShadow = '0 2px 6px rgba(99, 102, 241, 0.5)';
        });

        guideItem.addEventListener('mouseout', () => {
          guideItem.style.background = 'transparent';
          guideItem.style.textShadow = '0 2px 4px rgba(99, 102, 241, 0.3)';
        });

        guideItem.addEventListener('click', () => {
          menu.remove();
          this.launchOnboarding(true);
        });

        menu.appendChild(guideItem);
      }

      menu.appendChild(hideIconItem);

      // DOM に追加
      document.body.appendChild(menu);

      // 画面外に出ないように調整
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        menu.style.left = `${event.clientX - rect.width}px`;
      }
      if (rect.bottom > window.innerHeight) {
        menu.style.top = `${event.clientY - rect.height}px`;
      }

      // 外部クリックで閉じる
      const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
          menu.remove();
          document.removeEventListener('click', closeMenu);
        }
      };

      setTimeout(() => {
        document.addEventListener('click', closeMenu);
      }, 10);
    }

    /**
     * フローティングアイコンを非表示にする
     */
    hideFloatingIcon() {
      if (this.floatingChocolateIcon) {
        this.floatingChocolateIcon.style.display = 'none';
      }
    }

    /**
     * フローティングアイコンを表示する
     */
    showFloatingIcon() {
      if (this.floatingChocolateIcon) {
        this.floatingChocolateIcon.style.display = 'flex';
      }
    }

    dispose() {
      if (this.sceneChangeUnsubscribe) {
        try {
          this.sceneChangeUnsubscribe();
        } catch (error) {
          console.warn('⚠️ Demo UI: failed to dispose scene listener:', error);
        }
        this.sceneChangeUnsubscribe = null;
      }

      // ファイル選択関連のクリーンアップ
      if (this.fileInput && this.fileInput.parentNode) {
        this.fileInput.parentNode.removeChild(this.fileInput);
      }
      if (this.selectedFile && this.selectedFile.url) {
        URL.revokeObjectURL(this.selectedFile.url);
      }

      if (this.sceneLoadInput && this.sceneLoadInput.parentNode) {
        this.sceneLoadInput.parentNode.removeChild(this.sceneLoadInput);
      }
      this.sceneLoadInput = null;

      // フローティングチョコアイコンのクリーンアップ
      if (this.floatingChocolateIcon && this.floatingChocolateIcon.parentNode) {
        this.floatingChocolateIcon.parentNode.removeChild(this.floatingChocolateIcon);
      }

      if (this.container && this.container.parentElement) {
        this.container.parentElement.removeChild(this.container);
      }
    }

    showOverlayTextarea() {
      if (this.overlayTextarea) return;

      this.isExpanded = true;
      
      // オーバーレイテキストエリアを作成
      this.overlayTextarea = document.createElement('textarea');
      this.overlayTextarea.value = this.input.value;
      this.overlayTextarea.placeholder = this.input.placeholder;
      
      // フォームの位置とサイズを取得
      const containerRect = this.container.getBoundingClientRect();
      
      // 画面境界を考慮した位置調整
      const overlayHeight = 300;
      const padding = 20;
      
      let top = containerRect.top + 60;
      let left = containerRect.left;
      let width = containerRect.width;
      
      // 右端がはみ出る場合
      if (left + width > window.innerWidth - padding) {
        left = window.innerWidth - width - padding;
      }
      
      // 左端がはみ出る場合
      if (left < padding) {
        left = padding;
        width = Math.min(width, window.innerWidth - 2 * padding);
      }
      
      // 下端がはみ出る場合
      if (top + overlayHeight > window.innerHeight - padding) {
        top = Math.max(padding, window.innerHeight - overlayHeight - padding);
      }

      const overlayBackground = this.isWabiSabiMode
        ? 'linear-gradient(135deg, rgba(97, 97, 97, 0.7), rgba(66, 66, 66, 0.6))'
        : (this.isDarkMode
          ? 'linear-gradient(135deg, rgba(30, 27, 75, 0.4), rgba(15, 23, 42, 0.5))'
          : 'linear-gradient(135deg, rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.2))');

      const overlayBorder = this.isWabiSabiMode
        ? '1px solid rgba(93, 64, 55, 0.5)'
        : (this.isDarkMode
          ? '1px solid rgba(99, 102, 241, 0.25)'
          : '1px solid rgba(255, 255, 255, 0.5)');

      const overlayInnerShadow = this.isWabiSabiMode
        ? '0 4px 16px rgba(66, 66, 66, 0.3), inset 0 1px 0 rgba(189, 189, 189, 0.2)'
        : (this.isDarkMode
          ? '0 4px 16px rgba(15, 23, 42, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.08)'
          : '0 4px 16px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.4)');

      const overlayTextColor = this.isWabiSabiMode ? '#F5F5F5' : (this.isDarkMode ? '#ffffff' : '#1f2937');

      // オーバーレイのスタイル設定
      this.overlayTextarea.style.cssText = `
      position: fixed;
      top: ${top}px;
      left: ${left}px;
      width: ${width}px;
      height: ${overlayHeight}px;
      box-sizing: border-box;
      background: ${overlayBackground};
      backdrop-filter: blur(24px) saturate(180%);
      border: ${overlayBorder};
      box-shadow: ${overlayInnerShadow};
      border-radius: 16px;
      color: ${overlayTextColor};
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      padding: 20px;
      resize: none;
      outline: none;
      z-index: 10000;
      box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
      opacity: 0;
      transition: opacity 0.2s ease-out;
    `;
      
      // ドキュメントに追加
      document.body.appendChild(this.overlayTextarea);
      
      // アニメーション開始
      requestAnimationFrame(() => {
        this.overlayTextarea.style.opacity = '1';
      });
      
      // フォーカス設定
      this.overlayTextarea.focus();
      
      // 入力同期
      this.overlayTextarea.addEventListener('input', (e) => {
        this.input.value = e.target.value;
      });
      
      // Escapeキーで閉じる
      this.overlayTextarea.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.hideOverlayTextarea();
        }
      });
      
      // 外側クリックで閉じる
      this.overlayTextarea.addEventListener('blur', () => {
        setTimeout(() => this.hideOverlayTextarea(), 100);
      });
    }
    
    hideOverlayTextarea() {
      if (!this.overlayTextarea) return;
      
      this.isExpanded = false;
      
      // フェードアウトアニメーション
      this.overlayTextarea.style.opacity = '0';
      
      setTimeout(() => {
        if (this.overlayTextarea) {
          document.body.removeChild(this.overlayTextarea);
          this.overlayTextarea = null;
        }
      }, 200);
    }
    
    hideOverlayTextarea() {
      if (!this.overlayTextarea) return;
      
      this.isExpanded = false;
      
      // フェードアウトアニメーション
      this.overlayTextarea.style.opacity = '0';
      
      setTimeout(() => {
        if (this.overlayTextarea) {
          document.body.removeChild(this.overlayTextarea);
          this.overlayTextarea = null;
        }
      }, 200);
    }
  }

  const IMAGE_SERVICE_STORAGE_KEY = 'chocodrop-service-image';
  const VIDEO_SERVICE_STORAGE_KEY = 'chocodrop-service-video';
  const KEYWORD_HIGHLIGHT_COLOR = '#ff6ad5';
  const XR_KEYFRAME_STYLE_ID = 'chocodrop-xr-keyframes';

  function injectXRKeyframes() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(XR_KEYFRAME_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = XR_KEYFRAME_STYLE_ID;
    style.textContent = `
    @keyframes xrPulse {
      0% { transform: scale(0.6); opacity: 0.45; }
      60% { transform: scale(1); opacity: 0; }
      100% { transform: scale(1); opacity: 0; }
    }
  `;
    document.head.appendChild(style);
  }

  /**
   * Command UI - Web interface for ChocoDrop System
   * Real-time natural language command interface for 3D scenes
   */
  class CommandUI {
    constructor(options = {}) {
      this.sceneManager = options.sceneManager || null;
      this.client = options.client || null;
      this.onControlsToggle = options.onControlsToggle || (() => {});
      
      this.isVisible = false;
      this.container = null;
      this.input = null;
      this.output = null;
      this.currentMode = 'generate';

      // リアルタイム進捗管理
      this.activeConnections = new Map();
      this.currentTaskId = null;
      
      // 設定
      this.config = {
        activationKey: options.activationKey || '@',
        position: options.position || 'bottom-right',
        width: options.width || 450,
        maxHeight: options.maxHeight || 600,
        theme: options.theme || 'dark',
        showExamples: options.showExamples !== false,
        autoScroll: options.autoScroll !== false,
        enableDebugLogging: options.enableDebugLogging === true,
        skipServiceDialog: options.skipServiceDialog !== false,  // デフォルトで非表示（明示的にfalseの場合のみ表示）
        enableServerHealthCheck: options.enableServerHealthCheck !== false,
        showGuidedOnboarding: options.showGuidedOnboarding !== false,
        ...options.config
      };

      this.availableImageServices = [];
      this.availableVideoServices = [];
      this.selectedImageService = null;
      this.selectedVideoService = null;
      this.highlightOverlay = null;
      this.inputDefaultStyles = null;
      this.imageServiceSelect = null;
      this.videoServiceSelect = null;
      this.serviceSelectorContainer = null;
      this.serviceSelectorStatus = null;
      this.serviceSelectorContent = null;
      this.serviceSelectorRetryButton = null;
      this.serviceSelectorSaveButton = null;
      this.serviceSelectorCancelButton = null;
      this.serviceModalOverlay = null;
      this.serviceModal = null;
      this.servicesLoading = false;
      this.isExpanded = false;
      this.overlayTextarea = null;
      this.pendingImageService = null;
      this.pendingVideoService = null;
      this.feedbackAutoClearTimer = null;
      this.currentFeedback = null;

      this.xrState = 'idle';
      this.xrSupport = { vr: null, ar: null };
      this.xrAutoResume = this.sceneManager?.xr?.autoResume ?? true;
      this.xrMode = null;
      this.xrEventUnsubscribe = [];
      this.xrUI = null;
      this.xrAnchor = { active: false, supported: null, position: null };
      this.xrAnchorStatusEl = null;
      this.xrAnchorActionButton = null;

      this.onboardingCoach = null;
      this.onboardingLauncherButton = null;
      this.handleExternalOnboardingRequest = null;
      this.handleExternalShortcutsRequest = null;
      this.hasBoundExternalEvents = false;

      this.serverHealthState = {
        available: true,
        checking: false,
        lastError: null
      };
      this.serverHealthBackdrop = null;
      this.serverHealthModal = null;
      this.serverHealthMessage = null;
      this.serverHealthDetail = null;
      this.serverHealthRetryButton = null;
      this.mcpNoticeShown = false;

      try {
        const storedImage = localStorage.getItem(IMAGE_SERVICE_STORAGE_KEY);
        const storedVideo = localStorage.getItem(VIDEO_SERVICE_STORAGE_KEY);
        console.log('🔍 Debug localStorage read:', { storedImage, storedVideo, IMAGE_SERVICE_STORAGE_KEY, VIDEO_SERVICE_STORAGE_KEY });
        if (storedImage) {
          this.selectedImageService = storedImage;
          console.log('✅ Set selectedImageService:', this.selectedImageService);
        }
        if (storedVideo) {
          this.selectedVideoService = storedVideo;
          console.log('✅ Set selectedVideoService:', this.selectedVideoService);
        }
        console.log('🔍 Final values:', { selectedImageService: this.selectedImageService, selectedVideoService: this.selectedVideoService });
      } catch (error) {
        console.warn('⚠️ Failed to load stored service selections:', error);
      }

      this.pendingImageService = this.selectedImageService;
      this.pendingVideoService = this.selectedVideoService;

      this.applyServiceSelectionToSceneManager();
      console.log('🔍 After applyServiceSelectionToSceneManager - UI:', { selectedImageService: this.selectedImageService, selectedVideoService: this.selectedVideoService });
      console.log('🔍 After applyServiceSelectionToSceneManager - SceneManager:', { selectedImageService: this.sceneManager?.selectedImageService, selectedVideoService: this.sceneManager?.selectedVideoService });

      // テーマモード状態管理 (light, dark, wabisabi)
      this.currentTheme = localStorage.getItem('live-command-theme') || 'light';
      this.isDarkMode = this.currentTheme === 'dark';
      this.isWabiSabiMode = this.currentTheme === 'wabisabi';
      
      // Undo/Redo システム
      this.commandHistory = [];
      this.currentHistoryIndex = -1;
      this.maxHistorySize = 50; // 最大コマンド保存数

      this.sceneChangeUnsubscribe = null;
      this.sceneSaveState = {
        lastVersion: 0,
        lastSavedVersion: 0,
        lastSavedAt: null,
        dirty: false,
        isSaving: false
      };
      this.sceneLoadInput = null;
      
      this.initUI();
      this.bindEvents();
      this.bindXREvents();

      if (!this.client && this.sceneManager && this.sceneManager.client) {
        this.client = this.sceneManager.client;
      }

      this.initializeServerHealthCheck();

      this.createServiceModal();
      this.createFloatingChocolateIcon();
      this.initializeGuidedOnboarding();
      this.initializeScenePersistence();
      this.initializeSceneLoadInput();

      // DOM読み込み完了後にスタイルを確実に適用
      document.addEventListener('DOMContentLoaded', () => {
        this.refreshStyles();
      });

      this.logDebug('🎮 CommandUI initialized');

      // GitHub Pages等でサービス設定を不要にする場合はスキップ
      if (!this.config.skipServiceDialog && (!this.selectedImageService || !this.selectedVideoService)) {
        this.openServiceModal(true);
      }
    }

    createXRControlPanel() {
      if (!this.sceneManager?.enterXR) {
        return null;
      }

      const panel = document.createElement('div');
      panel.className = 'xr-control-panel';
      panel.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
      margin: 12px 0;
      border-radius: 18px;
      background: ${this.isDarkMode ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.85), rgba(15, 23, 42, 0.65))' : 'linear-gradient(135deg, rgba(248, 250, 252, 0.92), rgba(221, 242, 255, 0.88))'};
      border: 1px solid ${this.isDarkMode ? 'rgba(148, 163, 184, 0.35)' : 'rgba(96, 165, 250, 0.25)'};
      box-shadow: 0 20px 50px rgba(15, 23, 42, 0.25);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      transition: transform 0.4s cubic-bezier(0.16, 0.84, 0.44, 1), box-shadow 0.4s ease;
      position: relative;
      overflow: hidden;
    `;

      const ambientGlow = document.createElement('div');
      ambientGlow.style.cssText = `
      position: absolute;
      inset: -40%;
      background: radial-gradient(circle at 20% 20%, rgba(99, 102, 241, 0.18), transparent 55%),
                  radial-gradient(circle at 80% 0, rgba(14, 165, 233, 0.15), transparent 60%);
      pointer-events: none;
      opacity: ${this.isDarkMode ? 1 : 0.7};
      filter: blur(40px);
      z-index: 0;
    `;
      panel.appendChild(ambientGlow);

      const header = document.createElement('div');
      header.style.cssText = `
      display: flex;
      align-items: center;
      gap: 12px;
      z-index: 1;
    `;

      const statusDot = document.createElement('span');
      statusDot.style.cssText = `
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #64748b;
      box-shadow: 0 0 12px rgba(94, 234, 212, 0.35);
      position: relative;
    `;

      const pulse = document.createElement('span');
      pulse.style.cssText = `
      content: '';
      position: absolute;
      inset: -8px;
      border-radius: 50%;
      background: currentColor;
      opacity: 0.25;
      animation: xrPulse 2.4s infinite;
    `;
      statusDot.appendChild(pulse);

      const statusText = document.createElement('span');
      statusText.style.cssText = `
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.01em;
      color: ${this.isDarkMode ? '#e2e8f0' : '#1e293b'};
    `;
      statusText.textContent = 'XR待機中';

      header.appendChild(statusDot);
      header.appendChild(statusText);

      const buttonRow = document.createElement('div');
      buttonRow.style.cssText = `
      display: flex;
      gap: 8px;
      z-index: 1;
      flex-wrap: wrap;
    `;

      const createXRButton = (label, mode, accent) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.dataset.mode = mode;
        button.style.cssText = `
        flex: 1;
        min-width: 96px;
        padding: 10px 14px;
        border-radius: 999px;
        border: none;
        font-weight: 600;
        letter-spacing: 0.02em;
        cursor: pointer;
        color: white;
        background: linear-gradient(135deg, ${accent[0]}, ${accent[1]});
        box-shadow: 0 12px 30px rgba(59, 130, 246, 0.25);
        transition: transform 0.2s ease, box-shadow 0.3s ease, filter 0.2s ease;
      `;
        button.addEventListener('mouseenter', () => {
          button.style.transform = 'translateY(-2px)';
          button.style.boxShadow = '0 18px 45px rgba(59, 130, 246, 0.3)';
        });
        button.addEventListener('mouseleave', () => {
          button.style.transform = 'translateY(0)';
          button.style.boxShadow = '0 12px 30px rgba(59, 130, 246, 0.25)';
        });
        button.addEventListener('click', () => this.handleEnterXR(mode));
        return button;
      };

      const vrButton = createXRButton('VRモード', 'vr', ['#38bdf8', '#6366f1']);
      const arButton = createXRButton('ARモード', 'ar', ['#f59e0b', '#ef4444']);

      const exitButton = document.createElement('button');
      exitButton.type = 'button';
      exitButton.textContent = 'XR終了';
      exitButton.style.cssText = `
      padding: 9px 14px;
      border-radius: 999px;
      background: transparent;
      border: 1px solid ${this.isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(15, 118, 110, 0.35)'};
      color: ${this.isDarkMode ? '#bae6fd' : '#0f172a'};
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s ease, color 0.2s ease;
      display: none;
    `;
      exitButton.addEventListener('mouseenter', () => {
        exitButton.style.background = this.isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(14, 165, 233, 0.12)';
      });
      exitButton.addEventListener('mouseleave', () => {
        exitButton.style.background = 'transparent';
      });
      exitButton.addEventListener('click', async () => {
        if (!this.sceneManager?.exitXR) return;
        exitButton.disabled = true;
        try {
          await this.sceneManager.exitXR();
        } finally {
          exitButton.disabled = false;
        }
      });

      buttonRow.appendChild(vrButton);
      buttonRow.appendChild(arButton);
      buttonRow.appendChild(exitButton);

      const toggleRow = document.createElement('label');
      toggleRow.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      font-size: 12px;
      color: ${this.isDarkMode ? 'rgba(226, 232, 240, 0.85)' : 'rgba(15, 23, 42, 0.75)'};
      z-index: 1;
    `;
      toggleRow.textContent = 'sessiongranted 自動復帰';

      const toggleWrapper = document.createElement('div');
      toggleWrapper.style.cssText = `
      position: relative;
      width: 42px;
      height: 24px;
      border-radius: 999px;
      background: ${this.isDarkMode ? 'rgba(148, 163, 184, 0.35)' : 'rgba(148, 163, 184, 0.32)'};
      transition: background 0.2s ease;
      cursor: pointer;
    `;

      const toggleThumb = document.createElement('div');
      toggleThumb.style.cssText = `
      position: absolute;
      top: 3px;
      left: 3px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: ${this.isDarkMode ? '#0ea5e9' : '#2563eb'};
      transform: ${this.xrAutoResume ? 'translateX(18px)' : 'translateX(0)'};
      transition: transform 0.2s ease, box-shadow 0.3s ease;
      box-shadow: 0 6px 14px rgba(14, 165, 233, 0.35);
    `;

      const toggleInput = document.createElement('input');
      toggleInput.type = 'checkbox';
      toggleInput.checked = this.xrAutoResume;
      toggleInput.style.cssText = `
      opacity: 0;
      width: 0;
      height: 0;
      position: absolute;
    `;

      const updateToggleVisual = enabled => {
        toggleWrapper.style.background = enabled
          ? (this.isDarkMode ? 'rgba(59, 130, 246, 0.45)' : 'rgba(37, 99, 235, 0.35)')
          : (this.isDarkMode ? 'rgba(148, 163, 184, 0.35)' : 'rgba(148, 163, 184, 0.32)');
        toggleThumb.style.transform = enabled ? 'translateX(18px)' : 'translateX(0)';
      };
      updateToggleVisual(this.xrAutoResume);

      toggleWrapper.addEventListener('click', () => {
        toggleInput.checked = !toggleInput.checked;
        this.updateXRAutoResume(toggleInput.checked);
        updateToggleVisual(toggleInput.checked);
        if (this.sceneManager?.setXRAutoResume) {
          this.sceneManager.setXRAutoResume(toggleInput.checked);
        }
      });

      toggleWrapper.appendChild(toggleThumb);
      toggleWrapper.appendChild(toggleInput);
      toggleRow.appendChild(toggleWrapper);

      panel.appendChild(header);
      panel.appendChild(buttonRow);
      panel.appendChild(toggleRow);

      const anchorRow = document.createElement('div');
      anchorRow.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      border-radius: 16px;
      background: ${this.isDarkMode
        ? 'linear-gradient(135deg, rgba(14,23,42,0.85), rgba(30,41,59,0.65))'
        : 'linear-gradient(135deg, rgba(248,250,252,0.92), rgba(226,244,255,0.88))'};
      border: 1px solid ${this.isDarkMode ? 'rgba(56,189,248,0.25)' : 'rgba(14,165,233,0.3)'};
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.1);
      gap: 12px;
      z-index: 1;
    `;

      const anchorInfo = document.createElement('div');
      anchorInfo.style.cssText = `
      display: flex;
      align-items: center;
      gap: 10px;
    `;

      const anchorDot = document.createElement('span');
      anchorDot.style.cssText = `
      width: 14px;
      height: 14px;
      border-radius: 999px;
      background: radial-gradient(circle at 30% 30%, #38bdf8, #0ea5e9);
      box-shadow: 0 0 12px rgba(56, 189, 248, 0.7);
      opacity: 0.8;
    `;

      const anchorStatus = document.createElement('div');
      anchorStatus.style.cssText = `
      display: flex;
      flex-direction: column;
      font-size: 12px;
      color: ${this.isDarkMode ? '#e2e8f0' : '#0f172a'};
      line-height: 1.4;
    `;
      const anchorStatusPrimary = document.createElement('strong');
      anchorStatusPrimary.style.cssText = 'font-size: 13px; font-weight: 600;';
      anchorStatusPrimary.textContent = 'サーフェス未固定';
      const anchorStatusMeta = document.createElement('span');
      anchorStatusMeta.style.cssText = 'opacity: 0.75;';
      anchorStatusMeta.textContent = 'トリガーでアンカーをセット';
      anchorStatus.appendChild(anchorStatusPrimary);
      anchorStatus.appendChild(anchorStatusMeta);

      anchorInfo.appendChild(anchorDot);
      anchorInfo.appendChild(anchorStatus);

      const anchorButton = document.createElement('button');
      anchorButton.type = 'button';
      anchorButton.textContent = 'リセット';
      anchorButton.disabled = true;
      anchorButton.style.cssText = `
      padding: 6px 12px;
      border-radius: 999px;
      border: 1px solid ${this.isDarkMode ? 'rgba(56,189,248,0.4)' : 'rgba(14,116,144,0.4)'};
      background: transparent;
      color: ${this.isDarkMode ? '#bae6fd' : '#0e7490'};
      font-size: 12px;
      font-weight: 600;
      cursor: not-allowed;
      transition: all 0.2s ease;
    `;
      anchorButton.addEventListener('click', () => {
        if (!anchorButton.disabled) {
          this.sceneManager?.clearXRPlacementAnchor?.();
        }
      });

      anchorRow.appendChild(anchorInfo);
      anchorRow.appendChild(anchorButton);

      panel.appendChild(anchorRow);

      this.xrAnchorStatusEl = { primary: anchorStatusPrimary, meta: anchorStatusMeta, dot: anchorDot };
      this.xrAnchorActionButton = anchorButton;

      this.xrUI = {
        panel,
        statusText,
        statusDot,
        vrButton,
        arButton,
        exitButton,
        toggleInput,
        toggleThumb,
        toggleWrapper
      };

      this.updateXRSupport({ mode: 'vr', supported: this.xrSupport.vr });
      this.updateXRSupport({ mode: 'ar', supported: this.xrSupport.ar });
      this.updateXRState({ state: this.xrState, mode: this.xrMode });
      if (this.sceneManager?.xr) {
        this.updateXRAnchorState({
          supported: this.sceneManager.xr.anchorSupported,
          active: Boolean(this.sceneManager.xr.anchor),
          position: this.sceneManager.xr.anchor?.position || null
        });
      } else {
        this.updateXRAnchorState({});
      }

      injectXRKeyframes();

      panel.addEventListener('mouseenter', () => {
        panel.style.transform = 'translateY(-1px)';
        panel.style.boxShadow = '0 26px 55px rgba(15, 23, 42, 0.32)';
      });
      panel.addEventListener('mouseleave', () => {
        panel.style.transform = 'translateY(0)';
        panel.style.boxShadow = '0 20px 50px rgba(15, 23, 42, 0.25)';
      });

      return panel;
    }

    updateXRState(detail = {}) {
      const state = detail.state || this.xrState || 'idle';
      this.xrState = state;
      if (detail.mode) {
        this.xrMode = detail.mode;
      }
      if (!this.xrUI) return;

      const { statusText, statusDot, panel, exitButton } = this.xrUI;
      const mode = this.xrMode;
      const labelMap = {
        idle: 'XR待機中',
        ready: 'XR準備完了',
        requesting: 'XR初期化中…',
        active: mode === 'immersive-ar' || mode === 'ar' ? 'ARセッション中' : 'VRセッション中',
        error: 'XRエラー',
        unsupported: 'WebXR未対応'
      };
      statusText.textContent = labelMap[state] || 'XR待機中';

      const colorMap = {
        idle: '#64748b',
        ready: '#34d399',
        requesting: '#fbbf24',
        active: '#22d3ee',
        error: '#f87171',
        unsupported: '#94a3b8'
      };
      const dotColor = colorMap[state] || '#64748b';
      statusDot.style.background = dotColor;
      statusDot.style.boxShadow = `0 0 14px ${dotColor}40`;
      panel.dataset.xrState = state;

      exitButton.style.display = state === 'active' ? 'inline-flex' : 'none';
      exitButton.disabled = state !== 'active';

      this.updateXRButtons();
    }

    updateXRSupport(detail = {}) {
      const mode = detail.mode === 'immersive-ar' ? 'ar' : detail.mode;
      if (!mode) return;
      if (typeof detail.supported === 'boolean') {
        this.xrSupport[mode] = detail.supported;
      }
      if (!this.xrUI) return;

      const button = mode === 'ar' ? this.xrUI.arButton : this.xrUI.vrButton;
      if (!button) return;

      if (this.xrSupport[mode] === false) {
        button.disabled = true;
        button.style.opacity = '0.35';
        button.title = mode === 'ar' ? 'このデバイスは AR セッションをサポートしていません' : 'このデバイスは VR セッションをサポートしていません';
      } else {
        button.style.opacity = '1';
        button.title = mode === 'ar' ? 'ARセッションを開始' : 'VRセッションを開始';
      }

      this.updateXRButtons();
    }

    updateXRAutoResume(enabled) {
      this.xrAutoResume = Boolean(enabled);
      if (!this.xrUI) return;
      const { toggleInput, toggleThumb, toggleWrapper } = this.xrUI;
      if (toggleInput) {
        toggleInput.checked = this.xrAutoResume;
      }
      if (toggleWrapper) {
        toggleWrapper.style.background = this.xrAutoResume
          ? (this.isDarkMode ? 'rgba(59, 130, 246, 0.45)' : 'rgba(37, 99, 235, 0.35)')
          : (this.isDarkMode ? 'rgba(148, 163, 184, 0.35)' : 'rgba(148, 163, 184, 0.32)');
      }
      if (toggleThumb) {
        toggleThumb.style.transform = this.xrAutoResume ? 'translateX(18px)' : 'translateX(0)';
      }
    }

    updateXRAnchorState(detail = {}) {
      this.xrAnchor = {
        active: detail.active ?? this.xrAnchor.active,
        supported: detail.supported ?? this.xrAnchor.supported,
        position: detail.position ?? this.xrAnchor.position
      };
      if (!this.xrAnchorStatusEl || !this.xrAnchorActionButton) {
        return;
      }

      const { primary, meta, dot } = this.xrAnchorStatusEl;
      const supported = this.xrAnchor.supported;
      const active = this.xrAnchor.active;

      if (supported === false) {
        primary.textContent = 'ヒットテスト未対応';
        meta.textContent = '対応ブラウザでのみ利用可能';
        dot.style.background = 'radial-gradient(circle at 30% 30%, #f87171, #ef4444)';
        dot.style.boxShadow = '0 0 10px rgba(248, 113, 113, 0.7)';
        this.xrAnchorActionButton.disabled = true;
        this.xrAnchorActionButton.textContent = '非対応';
        this.xrAnchorActionButton.style.cursor = 'not-allowed';
        return;
      }

      if (active) {
        primary.textContent = 'アンカー固定済み';
        if (this.xrAnchor.position) {
          const { x, y, z } = this.xrAnchor.position;
          meta.textContent = `(${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`;
        } else {
          meta.textContent = '最新のヒットテスト座標';
        }
        dot.style.background = 'radial-gradient(circle at 30% 30%, #22d3ee, #0ea5e9)';
        dot.style.boxShadow = '0 0 14px rgba(14, 165, 233, 0.75)';
        this.xrAnchorActionButton.disabled = false;
        this.xrAnchorActionButton.textContent = 'アンカー解除';
        this.xrAnchorActionButton.style.cursor = 'pointer';
      } else {
        primary.textContent = 'サーフェス未固定';
        meta.textContent = 'トリガーでアンカーをセット';
        dot.style.background = 'radial-gradient(circle at 30% 30%, #fcd34d, #f59e0b)';
        dot.style.boxShadow = '0 0 12px rgba(245, 158, 11, 0.6)';
        this.xrAnchorActionButton.disabled = true;
        this.xrAnchorActionButton.textContent = '待機中';
        this.xrAnchorActionButton.style.cursor = 'not-allowed';
      }
    }

    updateXRButtons() {
      if (!this.xrUI) return;
      const { vrButton, arButton } = this.xrUI;
      const busy = this.xrState === 'requesting';
      const active = this.xrState === 'active';

      if (vrButton) {
        const unsupported = this.xrSupport.vr === false;
        vrButton.disabled = busy || active || unsupported;
        vrButton.style.filter = unsupported ? 'grayscale(0.6)' : 'none';
      }

      if (arButton) {
        const unsupported = this.xrSupport.ar === false;
        arButton.disabled = busy || active || unsupported;
        arButton.style.filter = unsupported ? 'grayscale(0.7)' : 'none';
      }
    }

    async handleEnterXR(mode = 'vr') {
      if (!this.sceneManager?.enterXR || !this.xrUI) return;

      if (mode === 'ar' && this.xrSupport.ar === false) {
        this.showInputFeedback('このデバイスでは AR がサポートされていません。', 'error');
        return;
      }
      if (mode === 'vr' && this.xrSupport.vr === false) {
        this.showInputFeedback('このデバイスでは VR がサポートされていません。', 'error');
        return;
      }

      const button = mode === 'ar' ? this.xrUI.arButton : this.xrUI.vrButton;
      if (button) {
        button.disabled = true;
        button.style.filter = 'brightness(0.85)';
      }
      this.updateXRState({ state: 'requesting', mode: mode === 'ar' ? 'immersive-ar' : 'immersive-vr' });

      try {
        await this.sceneManager.enterXR(mode);
      } catch (error) {
        const message = error?.message || 'XRセッションの初期化に失敗しました';
        this.showInputFeedback(message, 'error');
        this.updateXRState({ state: 'idle' });
      } finally {
        if (button) {
          button.disabled = this.xrState === 'requesting' || this.xrState === 'active';
          button.style.filter = this.xrSupport[mode] === false ? 'grayscale(0.7)' : 'none';
        }
        this.updateXRButtons();
      }
    }


    logDebug(...args) {
      if (!this.config.enableDebugLogging) {
        return;
      }
      console.log(...args);
    }

    /**
     * UI要素の作成と配置
     */
    initUI() {
      // メインコンテナ
      this.container = document.createElement('div');
      this.container.id = 'live-command-ui';
      this.container.style.cssText = this.getContainerStyles();

      // 2025年トレンド：Progressive Disclosure（ホバー時のみブランド表示）
      const brandIndicator = document.createElement('div');
      brandIndicator.className = 'progressive-brand-indicator';
      brandIndicator.style.cssText = `
      position: absolute;
      top: -8px;
      right: 8px;
      width: 8px;
      height: 8px;
      background: linear-gradient(135deg, ${this.isWabiSabiMode ? '#8BC34A, #689F38' : '#6366f1, #8b5cf6'});
      border-radius: 50%;
      opacity: 0.7;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      z-index: 10;
      cursor: pointer;
    `;
      
      // Progressive Disclosure: ホバー/クリックでブランド名表示
      const brandText = document.createElement('div');
      brandText.className = 'progressive-brand-text';
      brandText.style.cssText = `
      position: absolute;
      top: -35px;
      right: -5px;
      padding: 6px 12px;
      background: rgba(255, 255, 255, 0.15);
      border: 1px solid ${this.isDarkMode ? 'rgba(129, 140, 248, 0.3)' : 'rgba(99, 102, 241, 0.25)'};
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(99, 102, 241, 0.2), 0 4px 12px rgba(0, 0, 0, 0.1);
      color: ${this.isDarkMode ? '#ffffff' : '#1f2937'};
      font-size: 11px;
      font-weight: 700;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
      letter-spacing: 0.02em;
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      opacity: 0;
      transform: translateY(5px) scale(0.9);
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      pointer-events: none;
      z-index: 11;
      white-space: nowrap;
    `;
      brandText.innerHTML = '<span style="filter: hue-rotate(240deg) saturate(0.8) brightness(1.1);">🍫</span> <span style="color: #6366f1;">ChocoDrop</span>';
      
      // Progressive Disclosure イベント
      brandIndicator.addEventListener('mouseenter', () => {
        brandText.style.opacity = '1';
        brandText.style.transform = 'translateY(0) scale(1)';
        brandIndicator.style.transform = 'scale(1.2)';
        brandIndicator.style.opacity = '1';
      });
      
      brandIndicator.addEventListener('mouseleave', () => {
        brandText.style.opacity = '0';
        brandText.style.transform = 'translateY(5px) scale(0.9)';
        brandIndicator.style.transform = 'scale(1)';
        brandIndicator.style.opacity = '0.7';
      });
      
      brandIndicator.appendChild(brandText);
      this.container.appendChild(brandIndicator);

      // 出力エリア（タスクカードコンテナ）- 非表示に変更
      this.output = document.createElement('div');
      this.outputDiv = this.output; // 両方の参照を保持（互換性のため）
      this.output.id = 'command-output';
      this.output.className = 'command-output';
      this.output.style.cssText = this.getOutputStyles();
      // フローティングカード用コンテナ
      this.floatingContainer = document.createElement('div');
      this.floatingContainer.id = 'floating-cards-container';
      this.floatingContainer.style.cssText = `
      position: fixed;
      bottom: var(--floating-bottom, 120px);
      left: 50%;
      transform: translateX(-50%);
      z-index: 99999;
      pointer-events: none;
      display: none;
      flex-direction: column;
      gap: 8px;
      width: 400px;
      max-width: 90vw;
      align-items: center;
      justify-content: flex-start;
    `;

      // タスクカード管理用
      this.taskCards = new Map();

      // 入力フィールドラッパー（展開ボタン用）
      this.inputWrapper = document.createElement('div');
      this.inputWrapper.style.cssText = `
      position: relative;
      width: 100%;
      margin-bottom: 0;
    `;

      // Ultra-Simple 単一入力フィールド（自動リサイズ対応）
      this.input = document.createElement('textarea');
      this.input.rows = 1;
      this.input.id = 'command-input';
      this.input.placeholder = 'どんな世界を描きますか？ 例: 「夕暮れのスタジオに光を落として」 ⏎ ✨';
      this.input.style.cssText = this.getInputStyles();

      // 展開ボタン（初期状態は非表示）
      this.expandButton = document.createElement('div');
      this.expandButton.innerHTML = '⤢';
      this.expandButton.title = 'テキスト全体を表示';
      this.expandButton.style.cssText = `
      position: absolute;
      bottom: 8px;
      right: 8px;
      width: 24px;
      height: 24px;
      display: none;
      align-items: center;
      justify-content: center;
      background: ${this.isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'};
      border: 1px solid ${this.isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'};
      border-radius: 6px;
      color: ${this.isDarkMode ? '#ffffff' : '#1f2937'};
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s ease;
      z-index: 1;
    `;

      // 展開ボタンのホバー効果
      this.expandButton.addEventListener('mouseenter', () => {
        this.expandButton.style.background = this.isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)';
        this.expandButton.style.transform = 'scale(1.1)';
      });

      this.expandButton.addEventListener('mouseleave', () => {
        this.expandButton.style.background = this.isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
        this.expandButton.style.transform = 'scale(1)';
      });

      // 展開ボタンのクリック処理
      this.expandButton.addEventListener('click', () => {
        if (this.isExpanded) {
          this.hideOverlayTextarea();
        } else {
          this.showOverlayTextarea();
        }
      });

      // ラッパーに要素を追加
      this.inputWrapper.appendChild(this.input);
      this.inputWrapper.appendChild(this.expandButton);

      // 旧コマンドタイプインジケーターは削除（ラジオボタンUIに統合）

      // ラジオボタン風モードセレクター
      const modeSelector = this.createRadioModeSelector();

      // ミニマルアクションボタン
      const actionContainer = this.createMinimalActions();

      const xrControls = this.createXRControlPanel();

      // ×クローズボタンをフォーム右上に追加
      const closeButton = document.createElement('div');
      closeButton.innerHTML = '×';
      closeButton.style.cssText = `
      position: absolute;
      top: 12px;
      right: 12px;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: ${this.isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'};
      color: ${this.isDarkMode ? '#ffffff' : '#1f2937'};
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 14px;
      font-weight: normal;
      transition: all 0.2s ease;
      backdrop-filter: blur(8px);
      z-index: 10;
    `;

      closeButton.addEventListener('mouseover', () => {
        closeButton.style.background = this.isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)';
        closeButton.style.transform = 'scale(1.1)';
      });

      closeButton.addEventListener('mouseout', () => {
        closeButton.style.background = this.isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
        closeButton.style.color = this.isDarkMode ? '#ffffff' : '#1f2937';
        closeButton.style.transform = 'scale(1)';
      });

      closeButton.addEventListener('click', () => {
        this.hide();
      });

      // 組み立て（ヘッダー削除、ブランドバッジは既に追加済み）
      // this.container.appendChild(this.output); // 大きなタスク表示エリアをDOMに追加しない
      this.container.appendChild(closeButton);

      this.onboardingLauncherButton = document.createElement('button');
      this.onboardingLauncherButton.id = 'chocodrop-onboarding-launcher';
      this.onboardingLauncherButton.textContent = '初めての方ガイド';
      this.onboardingLauncherButton.style.cssText = `
      align-self: flex-start;
      margin-top: 4px;
      margin-bottom: 6px;
      padding: 6px 12px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.28);
      background: rgba(255, 255, 255, ${this.isDarkMode ? '0.12' : '0.16'});
      color: ${this.isWabiSabiMode || this.isDarkMode ? '#ffffff' : '#1f2937'};
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      display: inline-flex;
      gap: 6px;
      align-items: center;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    `;
      this.onboardingLauncherButton.addEventListener('mouseenter', () => {
        this.onboardingLauncherButton.style.boxShadow = '0 8px 18px rgba(99, 102, 241, 0.25)';
        this.onboardingLauncherButton.style.transform = 'translateY(-1px)';
      });
      this.onboardingLauncherButton.addEventListener('mouseleave', () => {
        this.onboardingLauncherButton.style.boxShadow = 'none';
        this.onboardingLauncherButton.style.transform = 'translateY(0)';
      });
      this.onboardingLauncherButton.addEventListener('click', () => this.launchOnboarding(true));

      this.container.appendChild(this.onboardingLauncherButton);
      this.container.appendChild(modeSelector);
      if (xrControls) {
        this.container.appendChild(xrControls);
      }
      this.container.appendChild(this.inputWrapper);
      this.container.appendChild(actionContainer);

      // フローティングカードコンテナをbodyに直接追加
      document.body.appendChild(this.floatingContainer);

      // DOM に追加
      document.body.appendChild(this.container);

      // 初回テーマ適用
      this.applyTheme();

      // 日本語IME対応のcomposition state管理
      this.isComposing = false;
      this.hasCompositionJustEnded = false;

      // リアルタイム入力監視とコマンド検出（IME対応）
      this.input.addEventListener('input', () => {
        // IME入力中はコマンド検出を停止
        if (this.isComposing) {
          return;
        }
        
        // フィードバック自動クリア（ユーザーが入力を修正している）
        if (this.currentFeedback) {
          this.clearInputFeedback();
        }
        
        // 自動リサイズ処理
        this.autoResizeTextarea();
        
        // キーワードハイライト適用
        this.applyKeywordHighlighting();
        
        this.detectCommandType();
      });
      
      // 日本語IME composition events
      this.input.addEventListener('compositionstart', () => {
        this.isComposing = true;
      });
      
      this.input.addEventListener('compositionend', () => {
        this.isComposing = false;
        
        // Safariのみフラグ設定（他のブラウザは不要）
        const isSafari = /Safari/.test(navigator.userAgent) && /Version/.test(navigator.userAgent);
        if (isSafari) {
          this.hasCompositionJustEnded = true;
        }
        
        // 確定後のコマンド検出を実行
        setTimeout(() => {
          this.autoResizeTextarea();
          this.detectCommandType();
        }, 10);
      });
      
      // Safari判定
      const isSafari = /Safari/.test(navigator.userAgent) && /Version/.test(navigator.userAgent);
      
      // 日本語IME対応Enterキー処理（Safari対応版）
      this.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          // Safari: compositionend直後のEnterをスキップ
          if (isSafari && this.hasCompositionJustEnded) {
            this.hasCompositionJustEnded = false;
            return;
          }
          
          // その他のブラウザ: isComposingチェック
          if (!isSafari && (e.isComposing || this.isComposing)) {
            return;
          }
          


          e.preventDefault();
          
          // deleteモードの場合は削除確認ダイアログを表示
          if (this.currentMode === 'delete' && this.input.value.trim()) {
            const originalCommand = this.input.value.trim();
            this.showDeleteConfirmation(originalCommand)
              .then(confirmed => {
                if (confirmed) {
                  // [削除]プレフィックスを追加してコマンド実行
                  const deleteCommand = `[削除] ${originalCommand}`;
                  // input.valueを変更せず、直接executeCommandに渡す（inputイベント発火を防ぐ）
                  this.executeCommand(deleteCommand);
                } else {
                  this.addOutput('❌ 削除をキャンセルしました', 'info');
                }
              });
          } else {
            this.executeCommand();
          }
        }
      });
      
      // 初期メッセージ
      if (this.config.showExamples) ;
    }

    /**
     * モードセレクター作成
     */
    createMinimalActions() {
      const container = document.createElement('div');
      container.style.cssText = `
      display: flex;
      margin-top: 8px;
      margin-bottom: 0 !important;
      gap: 8px;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
    `;

      // 左側: アクションアイコン列
      const leftSection = document.createElement('div');
      leftSection.style.cssText = 'display: flex; gap: 10px; align-items: center;';

      const createIconButton = (symbol, title, onClick, emphasis = false, options = {}) => {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        flex: 0 0 40px;
      `;

        const btn = document.createElement('button');
        btn.innerHTML = `<span style="filter: hue-rotate(${emphasis ? 240 : 210}deg) saturate(0.8) brightness(1.0);">${symbol}</span>`;
        btn.style.cssText = this.getActionButtonStyles('icon');
        btn.title = title;
        btn.setAttribute('aria-label', title);
        if (typeof onClick === 'function') {
          btn.addEventListener('click', onClick);
        }
        if (options.disabled) {
          btn.disabled = true;
          btn.style.opacity = '0.5';
        }

        const tooltip = document.createElement('div');
        tooltip.textContent = title;
        tooltip.style.cssText = `
        position: absolute;
        bottom: -34px;
        left: 50%;
        transform: translateX(-50%);
        padding: 6px 10px;
        border-radius: 8px;
        background: rgba(30, 41, 59, 0.9);
        color: #f8fafc;
        font-size: 11px;
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.15s ease, transform 0.15s ease;
        box-shadow: 0 4px 12px rgba(15, 23, 42, 0.25);
        z-index: 10;
      `;

        const showTooltip = () => {
          tooltip.style.opacity = '1';
          tooltip.style.transform = 'translateX(-50%) translateY(-2px)';
        };

        const hideTooltip = () => {
          tooltip.style.opacity = '0';
          tooltip.style.transform = 'translateX(-50%) translateY(0)';
        };

        btn.addEventListener('mouseenter', showTooltip);
        btn.addEventListener('focus', showTooltip);
        btn.addEventListener('mouseleave', hideTooltip);
        btn.addEventListener('blur', hideTooltip);

        wrapper.appendChild(btn);
        wrapper.appendChild(tooltip);

        return { wrapper, button: btn };
      };

      const { wrapper: saveWrap, button: saveBtn } = createIconButton('💾', 'シーンを保存する', () => this.handleSaveButtonClick(), true);
      const { wrapper: loadWrap, button: loadBtn } = createIconButton('📂', 'シーンを読み込む', () => this.handleLoadButtonClick());
      const { wrapper: clearWrap, button: clearBtn } = createIconButton('🧹', 'シーンをクリアする', () => this.clearAllWithConfirmation());

      const { wrapper: historyWrap, button: historyBtn } = createIconButton('📚', '履歴機能（開発中）', () => {}, false, { disabled: true });

      leftSection.appendChild(saveWrap);
      leftSection.appendChild(loadWrap);
      leftSection.appendChild(clearWrap);
      leftSection.appendChild(historyWrap);

      // 右側: テーマトグルと設定（ヘッダーから移動）
      const rightSection = document.createElement('div');
      rightSection.style.cssText = 'display: flex; gap: 6px; align-items: center;';

      const themeToggle = document.createElement('button');
      const getThemeIcon = () => {
        const themeConfig = {
          light: '🌙',
          dark: '🍵',
          wabisabi: '☀️'
        };
        return themeConfig[this.currentTheme] || '🌙';
      };

      const getThemeTitle = () => {
        const titleConfig = {
          light: 'ダークモードに切り替え',
          dark: '侘び寂びモードに切り替え',
          wabisabi: 'ライトモードに切り替え'
        };
        return titleConfig[this.currentTheme] || 'ダークモードに切り替え';
      };

      const getThemeIconWithFilter = () => {
        const icon = getThemeIcon();
        // 太陽は黄色く、お茶は緑系、月は紫系フィルター
        if (icon === '☀️') {
          return `<span style="filter: saturate(1.2) brightness(1.1);">${icon}</span>`;
        } else if (icon === '🍵') {
          return `<span style="filter: hue-rotate(80deg) saturate(1.1) brightness(1.0);">${icon}</span>`;
        } else {
          return `<span style="filter: hue-rotate(240deg) saturate(0.8) brightness(1.1);">${icon}</span>`;
        }
      };

      themeToggle.innerHTML = getThemeIconWithFilter();
      themeToggle.style.cssText = this.getActionButtonStyles('icon');
      themeToggle.title = getThemeTitle();
      themeToggle.addEventListener('click', () => this.toggleTheme());

      const settingsButton = document.createElement('button');
      settingsButton.innerHTML = '<span style="filter: hue-rotate(240deg) saturate(0.8) brightness(1.1);">⚙️</span>';
      settingsButton.style.cssText = this.getActionButtonStyles('icon');
      settingsButton.title = 'サービス設定を開く';
      settingsButton.addEventListener('click', () => this.openServiceModal());

      rightSection.appendChild(themeToggle);
      rightSection.appendChild(settingsButton);

      container.appendChild(leftSection);
      container.appendChild(rightSection);

      // 参照を保持
      this.saveButton = saveBtn;
      this.loadButton = loadBtn;
      this.clearBtn = clearBtn;
      this.historyBtn = historyBtn;
      this.themeToggle = themeToggle;
      this.settingsButton = settingsButton;

      this.updateSaveButtonState();

      return container;
    }

    initializeScenePersistence() {
      if (this.sceneChangeUnsubscribe) {
        try {
          this.sceneChangeUnsubscribe();
        } catch (error) {
          console.warn('⚠️ Failed to unsubscribe scene change listener:', error);
        }
        this.sceneChangeUnsubscribe = null;
      }

      if (!this.sceneManager || typeof this.sceneManager.onSceneChange !== 'function') {
        this.sceneSaveState.dirty = false;
        this.updateSaveButtonState();
        return;
      }

      this.sceneChangeUnsubscribe = this.sceneManager.onSceneChange((event) => {
        this.handleSceneChange(event);
      });

      if (typeof this.sceneManager.getSceneState === 'function') {
        try {
          const snapshot = this.sceneManager.getSceneState({ includeJournal: false });
          if (snapshot && typeof snapshot.version === 'number') {
            this.sceneSaveState.lastVersion = snapshot.version;
            if (snapshot.version > this.sceneSaveState.lastSavedVersion) {
              this.sceneSaveState.dirty = true;
            }
          }
        } catch (error) {
          console.warn('⚠️ Failed to obtain initial scene snapshot:', error);
        }
      }

      this.updateSaveButtonState();
    }

    initializeSceneLoadInput() {
      if (this.sceneLoadInput || typeof document === 'undefined') {
        return;
      }

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';
      input.style.display = 'none';
      input.addEventListener('change', async (event) => {
        const file = event.target?.files?.[0];
        try {
          await this.handleSceneFileSelected(file);
        } finally {
          if (event.target) {
            event.target.value = '';
          }
        }
      });

      document.body.appendChild(input);
      this.sceneLoadInput = input;
    }

    handleSceneChange(event) {
      if (!event || typeof event.version !== 'number') {
        return;
      }
      this.sceneSaveState.lastVersion = event.version;
      if (event.version > this.sceneSaveState.lastSavedVersion) {
        this.sceneSaveState.dirty = true;
      }
      this.updateSaveButtonState();
    }

    updateSaveButtonState() {
      if (!this.saveButton) {
        return;
      }

      const { dirty, isSaving, lastSavedAt, lastVersion, lastSavedVersion } = this.sceneSaveState;
      const sceneReady = this.sceneManager && typeof this.sceneManager.exportSceneState === 'function';
      const hasChanges = dirty || (lastVersion > lastSavedVersion);
      const disabled = !sceneReady || isSaving || !hasChanges;

      this.saveButton.disabled = disabled;
      this.saveButton.style.opacity = disabled ? '0.6' : '1';

      if (isSaving) {
        this.saveButton.innerHTML = '<span style="filter: hue-rotate(220deg) saturate(0.6) brightness(1.0);">⏳</span>';
        this.saveButton.title = '保存中…';
      } else if (!hasChanges && lastSavedAt) {
        this.saveButton.innerHTML = '<span style="filter: hue-rotate(120deg) saturate(0.9) brightness(1.1);">✅</span>';
        try {
          const formatted = new Date(lastSavedAt).toLocaleString();
          this.saveButton.title = `最終保存: ${formatted}`;
        } catch {
          this.saveButton.title = 'シーン状態をJSONとして保存';
        }
      } else {
        this.saveButton.innerHTML = '<span style="filter: hue-rotate(240deg) saturate(0.8) brightness(1.0);">💾</span>';
        this.saveButton.title = 'シーンを保存する';
      }
    }

    async saveSceneState() {
      if (!this.sceneManager || typeof this.sceneManager.exportSceneState !== 'function') {
        this.addOutput('⚠️ シーンマネージャーが接続されていません。', 'warning');
        return;
      }

      if (this.sceneSaveState.isSaving) {
        return;
      }

      this.sceneSaveState.isSaving = true;
      this.updateSaveButtonState();

      try {
        const state = this.sceneManager.exportSceneState({ includeJournal: true });
        if (state && typeof state.version === 'number') {
          this.sceneSaveState.lastSavedVersion = state.version;
          this.sceneSaveState.lastVersion = state.version;
        }
        this.sceneSaveState.lastSavedAt = state?.exportedAt || new Date().toISOString();
        this.sceneSaveState.dirty = false;

        const objectCount = state?.objectCount ?? 0;
        this.addOutput(`💾 シーンを保存しました（オブジェクト数: ${objectCount}）`, 'success');
      } catch (error) {
        console.error('Scene save failed:', error);
        this.addOutput(`❌ シーン保存に失敗しました: ${error.message}`, 'error');
        this.sceneSaveState.dirty = true;
      } finally {
        this.sceneSaveState.isSaving = false;
        this.updateSaveButtonState();
      }
    }

    handleSaveButtonClick() {
      this.saveSceneState();
    }

    handleLoadButtonClick() {
      if (!this.sceneManager) {
        this.addOutput('⚠️ シーンが初期化されていません。', 'warning');
        return;
      }

      this.initializeSceneLoadInput();
      if (this.sceneLoadInput) {
        this.sceneLoadInput.click();
      }
    }

    async handleSceneFileSelected(file) {
      if (!file) {
        return;
      }

      if (!this.sceneManager || typeof this.sceneManager.loadSceneState !== 'function') {
        this.addOutput('⚠️ この環境ではシーン読み込みに対応していません。', 'warning');
        return;
      }

      try {
        const text = await file.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (error) {
          throw new Error('シーンファイルの解析に失敗しました。JSON形式を確認してください。');
        }

        const result = await this.sceneManager.loadSceneState(data, { clearExisting: true, applyCamera: true });
        const objectCount = data?.objectCount ?? data?.objects?.length ?? result?.loaded ?? 0;

        if (typeof data?.version === 'number') {
          this.sceneSaveState.lastVersion = data.version;
          this.sceneSaveState.lastSavedVersion = data.version;
        } else {
          this.sceneSaveState.lastVersion += 1;
          this.sceneSaveState.lastSavedVersion = this.sceneSaveState.lastVersion;
        }
        this.sceneSaveState.lastSavedAt = data?.exportedAt || new Date().toISOString();
        this.sceneSaveState.dirty = false;
        this.updateSaveButtonState();

        this.addOutput(`📥 シーンを読み込みました（オブジェクト数: ${objectCount}）`, 'success');
        if (result?.failed) {
          this.addOutput(`⚠️ 復元に失敗したオブジェクト: ${result.failed}`, result.failed > 0 ? 'warning' : 'info');
        }

        this.scrollToBottom();
      } catch (error) {
        console.error('Scene load failed:', error);
        this.showInputFeedback(error.message, 'error');
        this.addOutput(`❌ シーン読み込みエラー: ${error.message}`, 'error');
      }
    }

    createServiceSelectorSection() {
      this.serviceSelectorContainer = document.createElement('div');
      this.serviceSelectorContainer.id = 'service-selector';
      this.serviceSelectorContainer.style.cssText = `
      margin-bottom: 16px;
      padding: 12px;
      border-radius: 12px;
      border: 1px solid transparent;
      transition: background 0.3s ease, border 0.3s ease;
    `;

      this.serviceSelectorStatus = document.createElement('div');
      this.serviceSelectorStatus.textContent = 'サービス情報を読み込んでいます...';
      this.serviceSelectorStatus.style.fontSize = '12px';
      this.serviceSelectorStatus.style.opacity = '0.8';
      this.serviceSelectorStatus.style.marginBottom = '8px';
      this.serviceSelectorContainer.appendChild(this.serviceSelectorStatus);

      this.serviceSelectorContent = document.createElement('div');
      this.serviceSelectorContainer.appendChild(this.serviceSelectorContent);

      this.updateServiceSelectorTheme();
      return this.serviceSelectorContainer;
    }

    createServiceModal() {
      if (this.serviceModalOverlay) {
        this.serviceModalOverlay.remove();
        this.serviceModalOverlay = null;
        this.serviceModal = null;
      }

      this.serviceModalOverlay = document.createElement('div');
      this.serviceModalOverlay.id = 'chocodrop-service-modal-overlay';
      this.serviceModalOverlay.style.cssText = `
      position: fixed;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      z-index: 2000;
      padding: 16px !important;
      opacity: 0;
      transition: opacity 0.2s ease;
    `;

      this.serviceModalOverlay.addEventListener('click', (event) => {
        if (event.target === this.serviceModalOverlay) {
          this.closeServiceModal();
        }
      });

      this.serviceModal = document.createElement('div');
      this.serviceModal.className = 'chocodrop-service-modal';
      this.serviceModal.style.cssText = `
      width: min(420px, 90vw);
      border-radius: 24px;
      padding: 26px 28px;
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 20px 40px rgba(15, 23, 42, 0.35);
      display: flex;
      flex-direction: column;
      gap: 18px;
      max-height: 90vh;
      overflow-y: auto;
      position: relative;
    `;

      const title = document.createElement('h2');
      title.textContent = 'サービス設定';
      title.style.cssText = `
      margin: 0;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.03em;
    `;

      const subtitle = document.createElement('p');
      subtitle.textContent = '利用するサービスを選択してください。';
      subtitle.style.cssText = `
      margin: 0;
      font-size: 12px;
      opacity: 0.75;
    `;

      const selector = this.createServiceSelectorSection();

      const actionRow = document.createElement('div');
      actionRow.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    `;

      this.serviceSelectorRetryButton = document.createElement('button');
      this.serviceSelectorRetryButton.textContent = '再読み込み';
      this.serviceSelectorRetryButton.style.cssText = `
      font-size: 11px;
      padding: 6px 14px;
      border-radius: 10px;
      border: 1px solid transparent;
      cursor: pointer;
      display: none;
      transition: all 0.2s ease;
    `;
      this.serviceSelectorRetryButton.addEventListener('click', () => this.initializeServiceSelector(true));

      const actionButtons = document.createElement('div');
      actionButtons.style.cssText = 'display: flex; gap: 8px;';

      this.serviceSelectorCancelButton = document.createElement('button');
      this.serviceSelectorCancelButton.textContent = 'Cancel';
      this.serviceSelectorCancelButton.style.cssText = `
      font-size: 12px;
      padding: 8px 16px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.35);
      background: transparent;
      cursor: pointer;
      transition: all 0.2s ease;
    `;
      this.serviceSelectorCancelButton.addEventListener('click', () => this.closeServiceModal());

      this.serviceSelectorSaveButton = document.createElement('button');
      this.serviceSelectorSaveButton.textContent = 'Save';
      this.serviceSelectorSaveButton.style.cssText = `
      font-size: 12px;
      padding: 8px 18px;
      border-radius: 10px;
      border: none;
      cursor: pointer;
      background: linear-gradient(135deg, ${this.isWabiSabiMode ? '#8BC34A, #689F38' : '#6366f1, #8b5cf6'});
      color: white;
      font-weight: 600;
      transition: all 0.2s ease;
      box-shadow: 0 12px 24px rgba(99, 102, 241, 0.35);
    `;
      this.serviceSelectorSaveButton.addEventListener('click', () => this.handleServiceSave());

      actionButtons.appendChild(this.serviceSelectorCancelButton);
      actionButtons.appendChild(this.serviceSelectorSaveButton);

      actionRow.appendChild(this.serviceSelectorRetryButton);
      actionRow.appendChild(actionButtons);

      this.serviceModal.appendChild(title);
      this.serviceModal.appendChild(subtitle);
      this.serviceModal.appendChild(selector);
      this.serviceModal.appendChild(actionRow);

      this.serviceModalOverlay.appendChild(this.serviceModal);
      document.body.appendChild(this.serviceModalOverlay);

      this.updateServiceSelectorTheme();
      this.toggleServiceRetryButton(false);
    }

    initializeGuidedOnboarding() {
      this.onboardingCoach = new GuidedOnboarding({
        modeContainer: () => this.radioModeContainer,
        settingsButton: () => this.settingsButton,
        inputElement: () => this.input,
        textareaElement: () => this.input,
        executeButton: () => this.container?.querySelector('#execute-btn'),
        fileButton: () => this.radioModeButtons?.['import']?.button,
        closeButton: () => this.closeButton,
        onSelectMode: (mode) => this.selectMode(mode, true),
        onInsertPrompt: (prompt) => this.insertOnboardingPrompt(prompt),
        onOpenServiceModal: () => this.openServiceModal(),
        onRequestShow: () => {
          if (!this.isVisible) {
            this.show();
          }
        },
        onComplete: ({ status, persona }) => {
          if (status === 'finished') {
            this.addOutput('🎉 初回ガイドを完了しました。いつでも🍫アイコンメニューから再開できます。', 'system');
          }
          if (persona) {
            this.logDebug('🧭 Onboarding persona selected:', persona);
          }
        }
      });

      if (!this.hasBoundExternalEvents) {
        this.handleExternalOnboardingRequest = () => this.launchOnboarding(true);
        this.handleExternalShortcutsRequest = () => this.showShortcutGuide();
        window.addEventListener('chocodrop:request-onboarding', this.handleExternalOnboardingRequest);
        window.addEventListener('chocodrop:show-shortcuts-request', this.handleExternalShortcutsRequest);
        this.hasBoundExternalEvents = true;
      }

      if (this.config.showGuidedOnboarding !== false) {
        setTimeout(() => this.onboardingCoach?.start({ force: false }), 600);
      }
    }

    openServiceModal(forceFetch = false) {
      if (!this.serviceModalOverlay) {
        this.createServiceModal();
      }

      this.serviceModalOverlay.style.display = 'flex';
      requestAnimationFrame(() => {
        if (this.serviceModalOverlay) {
          this.serviceModalOverlay.style.opacity = '1';
        }
      });

      this.resetPendingSelections();
      this.initializeServiceSelector(forceFetch);
    }

    closeServiceModal() {
      if (!this.serviceModalOverlay) {
        return;
      }

      this.serviceModalOverlay.style.opacity = '0';
      setTimeout(() => {
        if (this.serviceModalOverlay) {
          this.serviceModalOverlay.style.display = 'none';
        }
        this.resetPendingSelections();
      }, 150);
    }

    async initializeServiceSelector(force = false) {
      if (this.servicesLoading && !force) {
        return;
      }

      if (!this.client || typeof this.client.getAvailableServices !== 'function') {
        this.setServiceSelectorStatus('サービス情報を取得できませんでした（クライアント初期化待ちです）。右下の「再読み込み」で再取得できます。', 'error');
        this.toggleServiceRetryButton(true);
        this.setServiceButtonsEnabled(false);
        return;
      }

      this.servicesLoading = true;
      this.setServiceSelectorStatus('サービス情報を読み込んでいます...', 'info');
      this.toggleServiceRetryButton(false);
      this.setServiceButtonsEnabled(false);

      try {
        if (typeof this.client.ensureInitialized === 'function') {
          await this.client.ensureInitialized();
        }

        const response = await this.client.getAvailableServices();
        if (!response || response.success === false || !response.metadata) {
          throw new Error(response?.error || 'サービス情報が取得できませんでした');
        }

        this.availableImageServices = Array.isArray(response.metadata?.image) ? response.metadata.image : [];
        this.availableVideoServices = Array.isArray(response.metadata?.video) ? response.metadata.video : [];

        this.selectedImageService = this.resolveServiceSelection(
          'image',
          this.availableImageServices,
          response.default?.image
        );

        this.selectedVideoService = this.resolveServiceSelection(
          'video',
          this.availableVideoServices,
          response.default?.video
        );

        this.pendingImageService = this.selectedImageService;
        this.pendingVideoService = this.selectedVideoService;

        this.populateServiceSelector();
        this.applyServiceSelectionToSceneManager();
        this.setServiceButtonsEnabled(true);
      } catch (error) {
        console.error('❌ Failed to initialize service selector:', error);
        this.setServiceSelectorStatus('MCP設定が必要です。config.jsonでMCPサービスを設定してください。3000番以外のポートを使用している場合は、サーバーのCORS設定も確認してください。詳細はREADMEをご確認ください。', 'error');
        this.toggleServiceRetryButton(true);
        this.setServiceButtonsEnabled(false);
      } finally {
        this.servicesLoading = false;
      }
    }

    setServiceSelectorStatus(message, type = 'info') {
      if (!this.serviceSelectorStatus) {
        return;
      }
      this.serviceSelectorStatus.textContent = message;
      this.serviceSelectorStatus.dataset.statusType = type;
      this.serviceSelectorStatus.classList.toggle('service-selector-helper', type !== 'error');
      this.updateServiceSelectorTheme();
    }

    toggleServiceRetryButton(visible) {
      if (!this.serviceSelectorRetryButton) {
        return;
      }
      this.serviceSelectorRetryButton.style.display = visible ? 'inline-flex' : 'none';
      this.updateServiceSelectorTheme();
    }

    resolveServiceSelection(type, services, defaultId) {
      if (!services || services.length === 0) {
        return null;
      }

      const storageKey = type === 'image' ? IMAGE_SERVICE_STORAGE_KEY : VIDEO_SERVICE_STORAGE_KEY;
      let storedId = null;
      try {
        storedId = localStorage.getItem(storageKey);
      } catch (error) {
        console.warn('⚠️ Failed to access localStorage:', error);
      }

      const isStoredValid = storedId && services.some(service => service.id === storedId);
      let resolvedId = isStoredValid ? storedId : null;

      if (!resolvedId && defaultId && services.some(service => service.id === defaultId)) {
        resolvedId = defaultId;
      }

      if (!resolvedId) {
        resolvedId = services[0]?.id || null;
      }

      try {
        if (resolvedId) {
          localStorage.setItem(storageKey, resolvedId);
        } else {
          localStorage.removeItem(storageKey);
        }
      } catch (error) {
        console.warn('⚠️ Failed to persist service selection:', error);
      }

      return resolvedId;
    }

    populateServiceSelector() {
      if (!this.serviceSelectorContent) {
        return;
      }

      this.serviceSelectorContent.innerHTML = '';

      const hasImage = this.availableImageServices.length > 0;
      const hasVideo = this.availableVideoServices.length > 0;

      if (!hasImage && !hasVideo) {
        this.setServiceSelectorStatus('利用可能なサービスが見つかりませんでした。', 'error');
        return;
      }

      this.setServiceSelectorStatus('利用するサービスを選択してください。', 'info');

      if (hasImage) {
        const imageRow = this.buildServiceRow('image', '画像 (T2I)', this.availableImageServices, this.pendingImageService || this.selectedImageService);
        this.serviceSelectorContent.appendChild(imageRow);
      }

      if (hasVideo) {
        const videoRow = this.buildServiceRow('video', '動画 (T2V)', this.availableVideoServices, this.pendingVideoService || this.selectedVideoService);
        this.serviceSelectorContent.appendChild(videoRow);
      }

      this.updateServiceSelectorTheme();
    }

    buildServiceRow(type, labelText, services, selectedId) {
      const row = document.createElement('div');
      row.className = `service-row service-row-${type}`;
      row.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 12px;
    `;

      const label = document.createElement('label');
      label.textContent = labelText;
      label.style.fontSize = '13px';
      label.style.fontWeight = '600';
      row.appendChild(label);

      const select = document.createElement('select');
      select.dataset.serviceType = type;
      select.style.fontFamily = 'inherit';
      select.style.width = '100%';

      services.forEach(service => {
        const option = document.createElement('option');
        option.value = service.id;
        option.textContent = service.name || service.id;
        if (service.description) {
          option.title = service.description;
        }
        select.appendChild(option);
      });

      if (selectedId && services.some(service => service.id === selectedId)) {
        select.value = selectedId;
      }

      select.addEventListener('change', (event) => {
        this.onServiceSelectionChange(type, event.target.value);
      });

      row.appendChild(select);

      const description = document.createElement('div');
      description.className = 'service-description';
      description.textContent = this.findServiceInfo(type, select.value)?.description || '';
      description.style.fontSize = '11px';
      description.style.opacity = '0.75';
      description.style.lineHeight = '1.4';
      description.style.minHeight = '14px';
      row.appendChild(description);

      select.addEventListener('change', () => {
        description.textContent = this.findServiceInfo(type, select.value)?.description || '';
      });

      if (type === 'image') {
        this.imageServiceSelect = select;
      } else {
        this.videoServiceSelect = select;
      }

      return row;
    }

    onServiceSelectionChange(type, serviceId) {
      if (type === 'image') {
        this.pendingImageService = serviceId;
      } else {
        this.pendingVideoService = serviceId;
      }

      const info = this.findServiceInfo(type, serviceId);
      const description = type === 'image'
        ? this.imageServiceSelect?.parentElement?.querySelector('.service-description')
        : this.videoServiceSelect?.parentElement?.querySelector('.service-description');

      if (description) {
        description.textContent = info?.description || '';
      }
    }

    handleServiceSave() {
      const newImageId = this.pendingImageService || this.selectedImageService;
      const newVideoId = this.pendingVideoService || this.selectedVideoService;

      if (newImageId) {
        try {
          localStorage.setItem(IMAGE_SERVICE_STORAGE_KEY, newImageId);
        } catch (error) {
          console.warn('⚠️ Failed to persist image service selection:', error);
        }
        this.selectedImageService = newImageId;
        this.sceneManager?.setImageService(newImageId);
      }

      if (newVideoId) {
        try {
          localStorage.setItem(VIDEO_SERVICE_STORAGE_KEY, newVideoId);
        } catch (error) {
          console.warn('⚠️ Failed to persist video service selection:', error);
        }
        this.selectedVideoService = newVideoId;
        this.sceneManager?.setVideoService(newVideoId);
      }

      const imageInfo = this.findServiceInfo('image', newImageId);
      const videoInfo = this.findServiceInfo('video', newVideoId);

      if (imageInfo) {
        this.addOutput(`🖼️ 画像サービスを「${imageInfo.name}」に設定しました`, 'system');
      }
      if (videoInfo) {
        this.addOutput(`🎬 動画サービスを「${videoInfo.name}」に設定しました`, 'system');
      }

      this.closeServiceModal();
    }

    setServiceButtonsEnabled(enabled) {
      if (this.serviceSelectorSaveButton) {
        this.serviceSelectorSaveButton.disabled = !enabled;
        this.serviceSelectorSaveButton.style.opacity = enabled ? '1' : '0.6';
        this.serviceSelectorSaveButton.style.cursor = enabled ? 'pointer' : 'not-allowed';
      }
    }

    resetPendingSelections() {
      this.pendingImageService = this.selectedImageService;
      this.pendingVideoService = this.selectedVideoService;

      if (this.imageServiceSelect && this.selectedImageService) {
        this.imageServiceSelect.value = this.selectedImageService;
      }
      if (this.videoServiceSelect && this.selectedVideoService) {
        this.videoServiceSelect.value = this.selectedVideoService;
      }

      if (this.serviceSelectorContent && this.serviceSelectorContent.childElementCount > 0) {
        this.populateServiceSelector();
      }
    }

    findServiceInfo(type, serviceId) {
      const list = type === 'image' ? this.availableImageServices : this.availableVideoServices;
      return list.find(service => service.id === serviceId) || null;
    }

    applyServiceSelectionToSceneManager() {
      if (!this.sceneManager) {
        return;
      }
      this.sceneManager.setImageService(this.selectedImageService);
      this.sceneManager.setVideoService(this.selectedVideoService);
    }

    updateServiceSelectorTheme() {
      if (this.serviceModalOverlay) {
        this.serviceModalOverlay.style.background = this.isDarkMode
          ? 'rgba(8, 11, 26, 0.55)'
          : 'rgba(229, 231, 255, 0.45)';
      }

      if (this.serviceModal) {
        this.serviceModal.style.background = this.isDarkMode
          ? 'rgba(17, 24, 39, 0.15)'
          : 'rgba(255, 255, 255, 0.15)';
        this.serviceModal.style.border = this.isDarkMode
          ? '1px solid rgba(129, 140, 248, 0.4)'
          : '1px solid rgba(99, 102, 241, 0.25)';
        this.serviceModal.style.color = this.isDarkMode ? '#e5e7ff' : '#1f2937';
      }

      if (this.serviceSelectorStatus) {
        const type = this.serviceSelectorStatus.dataset?.statusType;
        const statusColor = type === 'error'
          ? (this.isDarkMode ? '#fca5a5' : '#b91c1c')
          : (this.isDarkMode ? 'rgba(209, 213, 219, 0.8)' : 'rgba(55, 65, 81, 0.75)');
        this.serviceSelectorStatus.style.color = statusColor;
      }

      if (this.serviceSelectorContainer) {
        const labels = this.serviceSelectorContainer.querySelectorAll('label');
        labels.forEach(label => {
          label.style.color = this.isWabiSabiMode
            ? '#5D4037'
            : (this.isDarkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(31, 41, 55, 0.9)');
        });

        const selects = this.serviceSelectorContainer.querySelectorAll('select');
        selects.forEach(select => {
          select.style.background = this.isWabiSabiMode
            ? 'rgba(161, 136, 127, 0.15)'
            : (this.isDarkMode ? 'rgba(99, 102, 241, 0.18)' : 'rgba(99, 102, 241, 0.12)');
          select.style.border = this.isWabiSabiMode
            ? '1px solid rgba(161, 136, 127, 0.4)'
            : (this.isDarkMode ? '1px solid rgba(129, 140, 248, 0.45)' : '1px solid rgba(99, 102, 241, 0.45)');
          select.style.color = this.isWabiSabiMode
            ? '#5D4037'
            : (this.isDarkMode ? '#ffffff' : '#1f2937');
          select.style.padding = '10px 12px';
          select.style.borderRadius = '10px';
          select.style.fontSize = '13px';
          select.style.outline = 'none';
          select.style.boxShadow = this.isWabiSabiMode
            ? '0 12px 24px rgba(93, 64, 55, 0.25)'
            : (this.isDarkMode
              ? '0 12px 28px rgba(15, 23, 42, 0.5)'
              : '0 12px 24px rgba(99, 102, 241, 0.2)');
        });

        const descriptions = this.serviceSelectorContainer.querySelectorAll('.service-description');
        descriptions.forEach(desc => {
          desc.style.color = this.isWabiSabiMode
            ? 'rgba(93, 64, 55, 0.7)'
            : (this.isDarkMode ? 'rgba(209, 213, 219, 0.8)' : 'rgba(55, 65, 81, 0.7)');
        });
      }

      if (this.serviceSelectorRetryButton) {
        this.serviceSelectorRetryButton.style.background = this.isWabiSabiMode
          ? 'rgba(161, 136, 127, 0.25)'
          : (this.isDarkMode
            ? 'rgba(129, 140, 248, 0.35)'
            : 'rgba(99, 102, 241, 0.15)');
        this.serviceSelectorRetryButton.style.border = this.isWabiSabiMode
          ? '1px solid rgba(161, 136, 127, 0.5)'
          : (this.isDarkMode
            ? '1px solid rgba(129, 140, 248, 0.5)'
            : '1px solid rgba(99, 102, 241, 0.45)');
        this.serviceSelectorRetryButton.style.color = this.isWabiSabiMode
          ? '#5D4037'
          : (this.isDarkMode ? '#f9fafb' : '#1e1b4b');
        this.serviceSelectorRetryButton.style.boxShadow = this.isWabiSabiMode
          ? '0 0 8px rgba(161, 136, 127, 0.4)'
          : (this.isDarkMode
            ? '0 0 8px rgba(129, 140, 248, 0.45)'
            : '0 0 8px rgba(99, 102, 241, 0.35)');
      }

      if (this.serviceSelectorCancelButton) {
        this.serviceSelectorCancelButton.style.border = this.isWabiSabiMode
          ? '1px solid rgba(161, 136, 127, 0.4)'
          : (this.isDarkMode
            ? '1px solid rgba(209, 213, 219, 0.3)'
            : '1px solid rgba(148, 163, 184, 0.5)');
        this.serviceSelectorCancelButton.style.color = this.isWabiSabiMode
          ? 'rgba(93, 64, 55, 0.85)'
          : (this.isDarkMode ? 'rgba(226, 232, 240, 0.85)' : 'rgba(30, 41, 59, 0.85)');
      }

      if (this.serviceSelectorSaveButton) {
        this.serviceSelectorSaveButton.style.background = this.isWabiSabiMode
          ? 'linear-gradient(135deg, #6D4C41, #5D4037)'
          : (this.isDarkMode
            ? 'linear-gradient(135deg, ' + (this.isWabiSabiMode ? '#8BC34A, #689F38' : '#6366f1, #8b5cf6') + ')'
            : 'linear-gradient(135deg, #818cf8, #a855f7)');
        this.serviceSelectorSaveButton.style.boxShadow = this.isWabiSabiMode
          ? '0 16px 28px rgba(93, 64, 55, 0.35)'
          : (this.isDarkMode
            ? '0 16px 28px rgba(99, 102, 241, 0.4)'
            : '0 16px 28px rgba(129, 140, 248, 0.35)');
      }
    }

    /**
     * ラジオボタン風モードセレクター作成
     */
    createRadioModeSelector() {
      const container = document.createElement('div');
      container.className = 'radio-mode-selector';
      container.style.cssText = `
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 12px;
      padding: 12px;
      background: ${this.isWabiSabiMode
        ? 'linear-gradient(135deg, rgba(158, 158, 158, 0.25), rgba(189, 189, 189, 0.2))'
        : (this.isDarkMode
          ? 'linear-gradient(135deg, rgba(30, 27, 75, 0.3), rgba(15, 23, 42, 0.4))'
          : 'linear-gradient(135deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.1))')};
      border: 1px solid ${this.isWabiSabiMode
        ? 'rgba(141, 110, 99, 0.4)'
        : (this.isDarkMode ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.25)')};
      border-radius: 16px;
      backdrop-filter: blur(12px);
      transition: all 0.3s ease;
      position: relative;
    `;

      const modes = [
        { value: 'generate', label: 'Generate', icon: '✨' },
        { value: 'import', label: 'Import', icon: '📥' },
        { value: 'modify', label: 'Modify', icon: '🔧' },
        { value: 'delete', label: 'Delete', icon: '🗑️' }
      ];

      this.radioModeButtons = {};

      modes.forEach(mode => {
        const button = document.createElement('div');
        button.className = `mode-option ${mode.value}`;
        button.setAttribute('data-mode', mode.value);
        button.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 10px 8px;
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.2s ease;
        font-size: 11px;
        font-weight: 600;
        text-align: center;
        color: ${this.isWabiSabiMode
          ? '#F5F5F5'
          : (this.isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(55, 65, 81, 0.8)')};
        background: transparent;
        border: 1px solid transparent;
        position: relative;
      `;

        const icon = document.createElement('div');
        icon.textContent = mode.icon;
        icon.style.cssText = `
        font-size: 12px;
        margin-bottom: 2px;
        filter: ${this.isDarkMode 
          ? 'hue-rotate(220deg) saturate(0.8) brightness(1.2)' 
          : 'hue-rotate(240deg) saturate(0.7) brightness(0.9)'};
        transition: filter 0.2s ease;
      `;

        const label = document.createElement('span');
        label.textContent = mode.label;
        label.style.cssText = `
        opacity: 0;
        max-height: 0;
        overflow: hidden;
        transition: all 0.2s ease;
      `;

        // AUTOバッジを作成
        const autoBadge = document.createElement('div');
        autoBadge.className = 'auto-badge';
        autoBadge.textContent = 'AUTO';
        autoBadge.style.cssText = `
        position: absolute;
        top: -4px;
        right: -4px;
        font-size: 7px;
        font-weight: 700;
        padding: 2px 4px;
        background: linear-gradient(135deg, #10b981, #059669);
        color: white;
        border-radius: 6px;
        opacity: 0;
        transform: scale(0.8);
        transition: all 0.2s ease;
        display: none;
      `;

        button.appendChild(icon);
        button.appendChild(label);
        button.appendChild(autoBadge);

        // ホバーイベント（ラベル表示/非表示）
        button.addEventListener('mouseenter', () => {
          label.style.opacity = '1';
          label.style.maxHeight = '20px';
        });
        button.addEventListener('mouseleave', () => {
          label.style.opacity = '0';
          label.style.maxHeight = '0';
        });

        // クリックイベント
        button.addEventListener('click', () => {
          if (mode.value === 'import') {
            this.triggerFileSelection();
          } else {
            this.selectMode(mode.value, true); // trueは手動選択を示す
          }
        });

        this.radioModeButtons[mode.value] = { button, autoBadge };
        container.appendChild(button);
      });


      this.radioModeContainer = container;
      // デフォルトでGenerateを選択
      this.selectMode('generate', false);

      return container;
    }

    /**
     * モード選択（ラジオボタンUI更新）
     */
    selectMode(mode, isManual = false, detectedKeyword = null) {
      const modeEntry = this.radioModeButtons?.[mode];
      if (!modeEntry) {
        if (typeof this.logDebug === 'function') {
          this.logDebug('⚠️ Unknown mode requested for selectMode:', mode);
        } else {
          console.warn('Unknown mode requested for selectMode:', mode);
        }
        return;
      }

      this.currentMode = mode;

      // 全ボタンをリセット
      Object.keys(this.radioModeButtons).forEach(key => {
        const { button, autoBadge } = this.radioModeButtons[key];
        button.style.color = this.isWabiSabiMode
          ? '#F5F5F5'
          : (this.isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(55, 65, 81, 0.8)');
        button.style.background = 'transparent';
        button.style.border = '1px solid transparent';
        button.style.transform = 'scale(1)';
        button.style.boxShadow = 'none';
        // AUTOバッジを非表示
        autoBadge.style.display = 'none';
        autoBadge.style.opacity = '0';
      });

      // 選択されたボタンをハイライト（2025年仕様）
      const { button, autoBadge } = modeEntry;
      
      // 2025 Glassmorphism選択状態
      const selectedGlass = this.isWabiSabiMode
        ? {
            background: 'linear-gradient(135deg, rgba(109, 76, 65, 0.2), rgba(141, 110, 99, 0.15))',
            border: '1px solid rgba(109, 76, 65, 0.4)',
            boxShadow: '0 4px 16px rgba(109, 76, 65, 0.25), inset 0 1px 0 rgba(245, 245, 220, 0.15)',
            color: '#F5F5F5'
          }
        : (this.isDarkMode
          ? {
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.15))',
              border: '1px solid rgba(99, 102, 241, 0.4)',
              boxShadow: '0 4px 16px rgba(99, 102, 241, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
              color: '#a5b4fc'
            }
          : {
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.08))',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              boxShadow: '0 4px 16px rgba(99, 102, 241, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
              color: this.isWabiSabiMode ? '#8BC34A' : '#6366f1'
            });

      button.style.color = selectedGlass.color;
      button.style.background = selectedGlass.background;
      button.style.border = selectedGlass.border;
      button.style.boxShadow = selectedGlass.boxShadow;
      button.style.transform = 'scale(1.02)';

      // AUTOバッジの表示制御
      if (!isManual && detectedKeyword) {
        // 自動切り替えの場合はAUTOバッジを表示
        autoBadge.style.display = 'inline-block';
        setTimeout(() => {
          autoBadge.style.opacity = '1';
          autoBadge.style.transform = 'scale(1)';
        }, 100);
        
        // 3秒後にフェードアウト
        setTimeout(() => {
          autoBadge.style.opacity = '0';
          autoBadge.style.transform = 'scale(0.8)';
          setTimeout(() => {
            autoBadge.style.display = 'none';
          }, 200);
        }, 3000);
      }

      // パルス効果を追加
      if (!isManual && mode !== 'import') {
        this.addPulseEffect(button);
        this.addContainerGlow(mode);
      } else if (mode === 'import') {
        this.addContainerGlow(mode);
      }

      // プレースホルダー更新
      this.input.placeholder = this.getPlaceholderForMode(mode);

      // モード切り替え時の入力欄メッセージ上書き機能
      if (isManual) {
        this.clearInputOnModeSwitch(mode);
      }

      // Importモード専用処理
      if (mode === 'import' || this.selectedFile) {
        this.showImportInterface();
      } else {
        this.hideImportInterface();
      }

      // Deleteモード専用処理
      if (mode === 'delete' && isManual) {
        this.handleDeleteModeSelection();
      }

      // Modifyモード専用処理
      if (mode === 'modify' && isManual) {
        this.handleModifyModeSelection();
      }

      // モード切り替えメッセージは表示しない（UIで分かるため）
    }

    /**
     * パルス効果を追加
     */
    addPulseEffect(element) {
      // 既存のアニメーションをリセット
      element.style.animation = 'none';
      
      // 少し遅らせてからアニメーションを適用（リフロー強制）
      setTimeout(() => {
        element.style.animation = 'smartModePulse 0.6s ease-out';
      }, 10);
      
      // アニメーション終了後にクリーンアップ
      setTimeout(() => {
        element.style.animation = '';
      }, 610);
      
      // CSSアニメーションを動的に追加（まだ存在しない場合）
      this.ensurePulseAnimation();
    }

    /**
     * パルスアニメーション用CSSを確保
     */
    ensurePulseAnimation() {
      if (document.getElementById('smart-mode-pulse-animation')) return;
      
      const style = document.createElement('style');
      style.id = 'smart-mode-pulse-animation';
      style.textContent = `
      @keyframes smartModePulse {
        0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(236, 72, 153, 0.7); }
        70% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(236, 72, 153, 0); }
        100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(236, 72, 153, 0); }
      }
    `;
      document.head.appendChild(style);
    }

    /**
     * コンテナグロー効果
     */
    addContainerGlow(mode) {
      const container = this.radioModeContainer;
      if (!container) return;

      // モードに応じてグロー色を設定
      const glowColors = this.isWabiSabiMode ? {
        generate: 'rgba(139, 195, 74, 0.4)',
        modify: 'rgba(139, 195, 74, 0.4)',
        delete: 'rgba(139, 195, 74, 0.4)',
        import: 'rgba(139, 195, 74, 0.4)'
      } : {
        generate: 'rgba(79, 70, 229, 0.4)',
        modify: 'rgba(236, 72, 153, 0.4)',
        delete: 'rgba(107, 114, 128, 0.3)',
        import: 'rgba(59, 130, 246, 0.35)'
      };

      const glowColor = glowColors[mode] || glowColors.generate;

      // 一時的にグロー効果を適用
      container.style.boxShadow = `0 0 20px ${glowColor}, 0 0 40px ${glowColor}`;

      const intensified = glowColor.replace('0.4', '0.6').replace('0.3', '0.5');
      container.style.borderColor = intensified !== glowColor ? intensified : glowColor;
      
      // 1秒後にグロー効果を除去
      setTimeout(() => {
        container.style.boxShadow = '';
        container.style.borderColor = this.isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.15)';
      }, 1000);
    }

    getActionButtonStyles(variant = 'secondary') {
      const baseStyles = `
      border: none;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s ease;
      font-family: inherit;
      outline: none;
      font-weight: 500;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    `;

      if (variant === 'primary') {
        const background = this.isWabiSabiMode
          ? 'linear-gradient(135deg, rgba(139, 195, 74, 0.95), rgba(104, 159, 56, 0.9))'
          : (this.isDarkMode
            ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.9), rgba(236, 72, 153, 0.9))'
            : 'linear-gradient(135deg, rgba(79, 70, 229, 0.92), rgba(196, 181, 253, 0.9))');
        const border = this.isWabiSabiMode
          ? 'rgba(85, 139, 47, 0.7)'
          : (this.isDarkMode ? 'rgba(129, 140, 248, 0.55)' : 'rgba(99, 102, 241, 0.45)');
        return baseStyles + `
        width: 96px;
        height: 36px;
        padding: 8px 14px;
        font-size: 12px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        background: ${background};
        border: 1px solid ${border};
        color: #ffffff;
        box-shadow: 0 8px 18px rgba(37, 99, 235, 0.25);
        text-align: center;
        white-space: nowrap;
      `;
      } else if (variant === 'secondary') {
        // Clear All, History ボタン用 - 美しい配置と統一感
        return baseStyles + `
        width: 90px;
        height: 36px;
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        background: ${this.isWabiSabiMode
          ? 'linear-gradient(135deg, rgba(141, 110, 99, 0.3), rgba(109, 76, 65, 0.2))'
          : (this.isDarkMode
            ? 'linear-gradient(135deg, rgba(55, 65, 81, 0.3), rgba(75, 85, 99, 0.2))'
            : 'linear-gradient(135deg, rgba(255, 255, 255, 0.25), rgba(255, 255, 255, 0.15))')};
        border: 1px solid ${this.isWabiSabiMode
          ? 'rgba(93, 64, 55, 0.6)'
          : (this.isDarkMode ? 'rgba(156, 163, 175, 0.2)' : 'rgba(255, 255, 255, 0.3)')};
        color: ${this.isWabiSabiMode
          ? '#F5F5F5'
          : (this.isDarkMode ? '#d1d5db' : '#374151')};
        text-align: center;
        white-space: nowrap;
      `;
      } else if (variant === 'icon') {
        // テーマトグル、設定ボタン用
        return baseStyles + `
        width: 32px;
        height: 32px;
        padding: 0;
        font-size: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: ${this.isDarkMode 
          ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.1))'
          : 'linear-gradient(135deg, rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.2))'};
        border: 1px solid ${this.isDarkMode ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.4)'};
        color: ${this.isDarkMode ? '#a5b4fc' : '#6366f1'};
      `;
      }
    }

    /**
     * 破壊的アクション用ボタンスタイル（赤系ガラス効果）
     */
    getDestructiveButtonStyles() {
      return `
      min-width: 50px;
      height: 32px;
      border: 1px solid ${this.isDarkMode ? 'rgba(220, 38, 127, 0.4)' : 'rgba(190, 24, 93, 0.35)'};
      border-radius: 6px;
      background: ${this.isDarkMode ? 'rgba(220, 38, 127, 0.3)' : 'rgba(190, 24, 93, 0.25)'};
      color: ${this.isDarkMode ? '#fca5a5' : '#dc2626'};
      cursor: pointer;
      transition: all 0.2s ease;
      font-family: inherit;
      outline: none;
      font-size: 11px;
      font-weight: 500;
      padding: 0 8px;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    `;
    }

    getCommandTypeIndicatorStyles() {
      return `
      padding: 4px 0;
      margin-bottom: 0;
      font-size: 11px;
      font-weight: 400;
      text-align: left;
      color: ${this.isDarkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)'};
      transition: all 0.3s ease;
      border: none;
      background: none;
    `;
    }

    /**
     * テキストエリアの自動リサイズ処理（最大2行）
     */
    autoResizeTextarea() {
      // 高さをリセットして正確な scrollHeight を取得
      this.input.style.height = 'auto';
      
      // 現在のコンテンツに基づいて高さを計算
      const lineHeight = 22; // CSS で設定した line-height
      const padding = 28; // 上下のパディング合計 (14px * 2)
      const maxLines = 2;
      const maxHeight = (lineHeight * maxLines) + padding;
      
      // スクロール高さに基づいて新しい高さを決定
      const newHeight = Math.min(this.input.scrollHeight, maxHeight);
      
      // 高さを適用
      this.input.style.height = newHeight + 'px';
      
      // 2行を超える場合はスクロールを有効化と展開ボタン表示
      if (this.input.scrollHeight > maxHeight) {
        this.input.style.overflowY = 'auto';
        // 展開ボタンを表示
        if (this.expandButton) {
          this.expandButton.style.display = 'flex';
        }
      } else {
        this.input.style.overflowY = 'hidden';
        // 展開ボタンを非表示
        if (this.expandButton) {
          this.expandButton.style.display = 'none';
        }
      }
    }

    /**
     * リアルタイムコマンドタイプ検出
     */
    detectCommandType() {
      const input = this.input.value.trim();
      if (!input) {
        this.selectMode('generate', false);
        return;
      }

      const commandType = this.analyzeCommandType(input);

      // Delete/Modifyは手動選択を優先、自動切り替えしない
      if (this.currentMode === 'delete' || this.currentMode === 'modify') {
        return; // 現在のモードを維持
      }
      // Generate/Importのみ自動切り替え
      this.selectMode(commandType.type, false, commandType.detectedKeyword);
    }

    /**
     * ルールベースコマンド分析
     */
    analyzeCommandType(text, hasSelectedObject) {
      const trimmedText = text.trim();
      
      this.logDebug(`🔍 Analyzing command: "${text}"`);
      this.logDebug(`📋 Selected object: ${hasSelectedObject ? 'Yes' : 'No'}`);
      
      // 空コマンド
      if (!trimmedText) {
        return { type: 'empty', reason: '空のコマンド' };
      }

      // メディアタイプの検出
      const mediaInfo = this.detectMediaType(text);
      
      // 1. 削除コマンドの検出（最優先）
      const deletePatterns = [
        { pattern: /削除/, keyword: '削除' },
        { pattern: /消去/, keyword: '消去' },
        { pattern: /消して/, keyword: '消して' },
        { pattern: /消す/, keyword: '消す' },
        { pattern: /取り除/, keyword: '取り除' },
        { pattern: /除去/, keyword: '除去' },
        { pattern: /削除して/, keyword: '削除して' },
        { pattern: /delete/i, keyword: 'delete' },
        { pattern: /remove/i, keyword: 'remove' },
        { pattern: /clear/i, keyword: 'clear' },
        { pattern: /erase/i, keyword: 'erase' }
      ];
      
      for (const { pattern, keyword } of deletePatterns) {
        if (pattern.test(text)) {
          this.logDebug(`✅ Delete pattern matched: ${keyword}`);
          return {
            type: 'delete',
            confidence: 0.9,
            reason: '削除キーワードを検出',
            mediaType: mediaInfo.type,
            requiresConfirmation: true,
            detectedKeyword: keyword,
            needsTarget: true
          };
        }
      }
      
      // 2. 明確な生成コマンドの検出（選択状態に関係なく）
      const generatePatterns = [
        { pattern: /作って/, keyword: '作って' },
        { pattern: /つくって/, keyword: 'つくって' },
        { pattern: /生成/, keyword: '生成' },
        { pattern: /作成/, keyword: '作成' },
        { pattern: /描いて/, keyword: '描いて' },
        { pattern: /書いて/, keyword: '書いて' },
        { pattern: /create/i, keyword: 'create' },
        { pattern: /generate/i, keyword: 'generate' },
        { pattern: /make/i, keyword: 'make' },
        { pattern: /draw/i, keyword: 'draw' }
      ];
      
      for (const { pattern, keyword } of generatePatterns) {
        if (pattern.test(text)) {
          this.logDebug(`✅ Generate pattern matched: ${keyword}`);
          return {
            type: 'generate',
            confidence: mediaInfo.confidence,
            reason: '生成キーワードを検出',
            mediaType: mediaInfo.type,
            requiresConfirmation: false,
            detectedKeyword: keyword,
            needsTarget: false
          };
        }
      }
      
      // 3. 自然言語での対象指定（確実にmodify）
      const targetPatterns = [
        /インポートした.*を/,
        /選択した.*を/,
        /この.*を/,
        /その.*を/,
        /あの.*を/,
        /[0-9]+番目.*を/,
        /最初.*を/,
        /初回.*を/,
        /生成した.*を/,
        /作った.*を/,
        /.+の(画像|写真|イメージ|絵|イラスト|ピクチャー)(を|に)/,
        /.+の(動画|ビデオ|ムービー|映像|クリップ)(を|に)/,
        /(.+?)(画像|写真|イメージ|絵|イラスト|ピクチャー)を.*(変えて|変更|にして|加工|編集|調整|塗り|並べ|移動|回転|反転|整列)/,
        /(.+?)(動画|ビデオ|ムービー|映像|クリップ)を.*(変えて|変更|にして|加工|編集|調整|塗り|並べ|移動|回転|反転|整列)/
      ];

      const explicitTargetMatched = targetPatterns.some(pattern => pattern.test(text));
      if (explicitTargetMatched) {
        this.logDebug('✅ Target reference pattern matched');
        return {
          type: 'modify',
          confidence: 0.9,
          reason: '対象を明示的に指定',
          mediaType: mediaInfo.type,
          requiresConfirmation: false,
          needsTarget: true,
          hasExplicitTarget: true
        };
      }

      // 4. 選択オブジェクトがある場合の処理
      if (hasSelectedObject && trimmedText) {
        // 新規作成意図でなければmodify
        if (!/の画像|の動画|画像を|動画を|画像$|動画$/.test(text)) {
          this.logDebug(`✅ Selected object + command = modify`);
          return {
            type: 'modify',
            confidence: 0.8,
            reason: '選択オブジェクトに対する変更',
            mediaType: mediaInfo.type,
            requiresConfirmation: false,
            needsTarget: false  // 既に選択済み
          };
        }
      }

      // 5. 変更系のキーワードが含まれる場合（対象未選択でもmodify判定）
      const modificationIndicators = /(にして|に変えて|へ変えて|へ変更|変えて|変更|調整|加工|編集|塗(って|り)|染め|彩色|彩度|明るく|暗く|薄く|濃く|ぼかし|シャープ|左右反転|上下反転|反転|回転|移動|並べ|整列|揃え|寄せて|拡大|縮小|大きく|小さく|伸ばして|縮めて|高く|低く|近づけ|遠ざけ|透明|半透明|不透明|透過|背景を透過|背景透過|背景を消|背景消|背景抜|輝かせて|光らせて|暗くして|焼き込み|焼き付け|flip|rotate|move|align|scale|resize|tint|color|brighten|darken|adjust|edit|modify)/i;
      const mediaReferenceIndicators = /(画像|写真|イメージ|絵|イラスト|ピクチャー|メディア|素材|動画|ビデオ|ムービー|映像|クリップ|オブジェクト|モデル)/i;

      if (modificationIndicators.test(text)) {
        this.logDebug('✅ Modification indicators detected');
        return {
          type: 'modify',
          confidence: 0.7,
          reason: '変更キーワードを検出',
          mediaType: mediaInfo.type,
          requiresConfirmation: false,
          needsTarget: !hasSelectedObject,
          hasExplicitTarget: explicitTargetMatched || mediaReferenceIndicators.test(text)
        };
      }

      // 6. デフォルト（安全な生成）
      this.logDebug(`ℹ️ Defaulting to generate mode`);
      return {
        type: 'generate',
        confidence: mediaInfo.confidence,
        reason: 'デフォルト動作（新規生成）',
        mediaType: mediaInfo.type,
        requiresConfirmation: false,
        needsTarget: false
      };
    }

    /**
     * Extract all command keywords from the analyzeCommandType patterns
     * Returns an array of {pattern, keyword, type} objects
     */
    getAllCommandKeywords() {
      const deletePatterns = [
        { pattern: /削除/, keyword: '削除', type: 'delete' },
        { pattern: /消去/, keyword: '消去', type: 'delete' },
        { pattern: /消して/, keyword: '消して', type: 'delete' },
        { pattern: /消す/, keyword: '消す', type: 'delete' },
        { pattern: /取り除/, keyword: '取り除', type: 'delete' },
        { pattern: /除去/, keyword: '除去', type: 'delete' },
        { pattern: /削除して/, keyword: '削除して', type: 'delete' },
        { pattern: /delete/i, keyword: 'delete', type: 'delete' },
        { pattern: /remove/i, keyword: 'remove', type: 'delete' },
        { pattern: /clear/i, keyword: 'clear', type: 'delete' },
        { pattern: /erase/i, keyword: 'erase', type: 'delete' }
      ];
      
      const modifyPatterns = [
        { pattern: /移動/, keyword: '移動', type: 'modify' },
        { pattern: /動かして/, keyword: '動かして', type: 'modify' },
        { pattern: /変更/, keyword: '変更', type: 'modify' },
        { pattern: /変えて/, keyword: '変えて', type: 'modify' },
        { pattern: /修正/, keyword: '修正', type: 'modify' },
        { pattern: /調整/, keyword: '調整', type: 'modify' },
        { pattern: /move/i, keyword: 'move', type: 'modify' },
        { pattern: /change/i, keyword: 'change', type: 'modify' },
        { pattern: /modify/i, keyword: 'modify', type: 'modify' },
        { pattern: /edit/i, keyword: 'edit', type: 'modify' }
      ];
      
      const generatePatterns = [
        { pattern: /作って/, keyword: '作って', type: 'generate' },
        { pattern: /生成/, keyword: '生成', type: 'generate' },
        { pattern: /作成/, keyword: '作成', type: 'generate' },
        { pattern: /描いて/, keyword: '描いて', type: 'generate' },
        { pattern: /書いて/, keyword: '書いて', type: 'generate' },
        { pattern: /create/i, keyword: 'create', type: 'generate' },
        { pattern: /generate/i, keyword: 'generate', type: 'generate' },
        { pattern: /make/i, keyword: 'make', type: 'generate' },
        { pattern: /draw/i, keyword: 'draw', type: 'generate' }
      ];

      return [...deletePatterns, ...modifyPatterns, ...generatePatterns];
    }

    /**
     * Apply keyword highlighting to the input text
     */
    applyKeywordHighlighting() {
      // TODO: 一時的にキーワードハイライト機能を無効化（リリース後に再検討）
      return;
    }

    /**
     * Create a highlighting overlay div that sits behind the textarea
     */
    createHighlightOverlay(text, matches) {
      // Remove existing overlay
      this.clearKeywordHighlighting();

      // Create highlight overlay div
      this.highlightOverlay = document.createElement('div');
      this.highlightOverlay.className = 'keyword-highlight-overlay';
      
      // Copy textarea styles to overlay
      const computedStyle = window.getComputedStyle(this.input);

      if (!this.inputDefaultStyles) {
        this.captureInputDefaultStyles();
      }
      this.highlightOverlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      white-space: pre-wrap;
      word-wrap: break-word;
      overflow: hidden;
      font-family: ${computedStyle.fontFamily};
      font-size: ${computedStyle.fontSize};
      font-weight: ${computedStyle.fontWeight};
      line-height: ${computedStyle.lineHeight};
      letter-spacing: ${computedStyle.letterSpacing};
      padding: ${computedStyle.padding};
      border: ${computedStyle.borderWidth} solid transparent;
      margin: 0;
      z-index: 1;
      color: transparent;
      background: transparent;
    `;

      // Build highlighted HTML
      let highlightedHTML = '';
      let lastIndex = 0;

      for (const match of matches) {
        // Add text before this match
        highlightedHTML += this.escapeHtml(text.substring(lastIndex, match.start));
        
        // Add highlighted keyword
        const color = this.getKeywordColor(match.type);
        highlightedHTML += `<span style="color: ${color}; font-weight: 600; background: linear-gradient(135deg, ${color}22 0%, ${color}11 100%); border-radius: 3px; padding: 1px 2px;">${this.escapeHtml(match.keyword)}</span>`;
        
        lastIndex = match.end;
      }

      // Add remaining text
      highlightedHTML += this.escapeHtml(text.substring(lastIndex));

      this.highlightOverlay.innerHTML = highlightedHTML;

      // Make textarea background transparent so overlay shows through
      this.input.style.background = 'transparent';
      this.input.style.backgroundColor = 'transparent';
      this.input.style.backgroundImage = 'none';
      this.input.style.color = this.getInputTextColor();

      // Insert overlay before textarea
      this.inputWrapper.insertBefore(this.highlightOverlay, this.input);
    }

    /**
     * Get the appropriate color for each keyword type
     */
    getKeywordColor(type) {
      return KEYWORD_HIGHLIGHT_COLOR;
    }

    getInputTextColor() {
      if (this.isWabiSabiMode) {
        return '#F5F5F5';
      }
      return this.isDarkMode ? '#ffffff' : '#1f2937';
    }

    captureInputDefaultStyles() {
      if (!this.input) {
        return;
      }
      const computedStyle = window.getComputedStyle(this.input);
      this.inputDefaultStyles = {
        background: computedStyle.background,
        backgroundImage: computedStyle.backgroundImage,
        backgroundColor: computedStyle.backgroundColor,
        color: computedStyle.color
      };
    }

    /**
     * Clear keyword highlighting
     */
    clearKeywordHighlighting() {
      if (this.highlightOverlay) {
        this.highlightOverlay.remove();
        this.highlightOverlay = null;
      }
      
      // Restore textarea background
      if (this.input) {
        if (this.inputDefaultStyles) {
          this.input.style.background = this.inputDefaultStyles.background;
          this.input.style.backgroundImage = this.inputDefaultStyles.backgroundImage;
          this.input.style.backgroundColor = this.inputDefaultStyles.backgroundColor;
          this.input.style.color = this.inputDefaultStyles.color;
        } else {
          this.input.style.background = '';
          this.input.style.backgroundImage = '';
          this.input.style.backgroundColor = '';
          this.input.style.color = '';
        }
      }
    }

    /**
     * Escape HTML characters
     */
    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    /**
     * メディアタイプ検出（画像/動画）
     */
    detectMediaType(text) {
      const videoPatterns = [
        /動画|ビデオ|映像|ムービー/,
        /video|movie|clip/i
      ];
      
      const imagePatterns = [
        /画像|写真|絵|イラスト|イメージ/,
        /image|picture|photo|illustration/i
      ];
      
      if (videoPatterns.some(pattern => pattern.test(text))) {
        return {
          type: 'video',
          confidence: 0.8,
          reason: '動画生成コマンド'
        };
      }
      
      if (imagePatterns.some(pattern => pattern.test(text))) {
        return {
          type: 'image',
          confidence: 0.8,
          reason: '画像生成コマンド'
        };
      }
      
      // デフォルトは画像
      return {
        type: 'image',
        confidence: 0.6,
        reason: '生成コマンド（画像デフォルト）'
      };
    }

    /**
     * コマンドタイプインジケーター表示
     */
    showCommandTypeIndicator(commandInfo) {
      const { type, confidence, reason } = commandInfo;
      
      // Proactive UX: 低信頼度時に提案表示
      if (confidence < 0.7) {
        this.showProactiveSuggestion(type, confidence);
      } else {
        this.hideProactiveSuggestion();
      }
      
      // 旧コマンドタイプインジケーターは削除（ラジオボタンUIに統合済み）
      // this.commandTypeIndicator.textContent = `◯ ${typeLabels[type].replace('🎨 ', '').replace('✏️ ', '').replace('🗑️ ', '')}`;
      // this.commandTypeIndicator.style.display = 'block';
      // this.commandTypeIndicator.style.cursor = 'default';
      
      // スワイプジェスチャー対応
      this.enableGestureControl();
    }

    /**
     * Proactive UX: 低信頼度時の提案表示
     */
    showProactiveSuggestion(detectedType, confidence) {
      if (!this.proactiveSuggestion) {
        this.proactiveSuggestion = document.createElement('div');
        this.proactiveSuggestion.id = 'proactive-suggestion';
        this.proactiveSuggestion.style.cssText = `
        margin-bottom: 0;
        padding: 10px;
        background: rgba(255, 193, 7, 0.15);
        border: 1px solid rgba(255, 193, 7, 0.3);
        border-radius: 8px;
        font-size: 12px;
        color: #ffc107;
        text-align: center;
        cursor: pointer;
        transition: all 0.2s ease;
      `;
        // 旧コマンドタイプインジケーターは削除（ラジオボタンUIに統合済み）
        // 代わりに入力フィールドの前に挿入
        this.container.insertBefore(this.proactiveSuggestion, this.input);
      }

      const alternativeTypes = ['generate', 'modify', 'delete'].filter(t => t !== detectedType);
      const suggestion = alternativeTypes[0]; // 最初の代替案

      const suggestionLabels = {
        generate: '🎨 生成',
        modify: '✏️ 変更', 
        delete: '🗑️ 削除'
      };

      this.proactiveSuggestion.innerHTML = `
      💡 もしかして「${suggestionLabels[suggestion]}モード」ですか？
      <div style="margin-top: 4px; font-size: 10px; opacity: 0.8;">
        クリックで変更 | スワイプで選択
      </div>
    `;
      
      this.proactiveSuggestion.style.display = 'block';
      
      // クリックで提案モードに変更
      this.proactiveSuggestion.onclick = () => {
        this.currentMode = suggestion;
        this.hideProactiveSuggestion();
        this.updateIndicatorForMode(suggestion, 0.9);
      };
    }

    /**
     * Proactive UX提案を非表示
     */
    hideProactiveSuggestion() {
      if (this.proactiveSuggestion) {
        this.proactiveSuggestion.style.display = 'none';
      }
    }

    /**
     * 指定モードでインジケーター更新
     */
    updateIndicatorForMode(mode, confidence) {

      // 旧コマンドタイプインジケーターは削除（ラジオボタンUIに統合済み）
      // this.commandTypeIndicator.textContent = `◯ ${typeLabels[mode].replace('🎨 ', '').replace('✏️ ', '').replace('🗑️ ', '')}`;
    }

    /**
     * ジェスチャーコントロール有効化
     */
    enableGestureControl() {
      // 旧スワイプジェスチャー機能は削除（ラジオボタンUIに統合済み）
      // ラジオボタンで直接モード選択可能になったため、スワイプ操作は不要
      this.gestureEnabled = true;
    }

    /**
     * アクションボタン作成
     */
    createActionButtons() {
      const container = document.createElement('div');
      container.style.cssText = `
      display: flex;
      margin-top: 8px;
      gap: 8px;
    `;

      // 履歴ボタン削除 - タスク進行状況に置き換え済み

      // クリアオールボタン
      const clearBtn = document.createElement('button');
      clearBtn.innerHTML = '🧹 全削除';
      clearBtn.style.cssText = this.getModernButtonStyles('danger');
      clearBtn.addEventListener('click', () => this.clearAll());

      // historyBtn削除済み
      container.appendChild(clearBtn);

      return container;
    }

    /**
     * スタイル定義
     */
    getContainerStyles() {
      const positions = {
        'bottom-right': 'bottom: 20px; right: 20px;',
        'bottom-left': 'bottom: 20px; left: 20px;',
        'top-right': 'top: 20px; right: 20px;',
        'top-left': 'top: 20px; left: 20px;',
        'center': 'top: 50%; left: 50%; transform: translate(-50%, -50%);'
      };

      // 2025 Glassmorphism仕様：ダーク・ライト両対応
      const glassmorphismDark = {
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.7), rgba(30, 27, 75, 0.65))',
        backdropFilter: 'blur(24px) saturate(180%)',
        border: '1px solid rgba(99, 102, 241, 0.2)',
        boxShadow: '0 8px 32px rgba(15, 23, 42, 0.4), 0 0 0 1px rgba(99, 102, 241, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
      };

      const glassmorphismLight = {
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.25), rgba(255, 255, 255, 0.15))',
        backdropFilter: 'blur(24px) saturate(180%)',
        border: '1px solid rgba(255, 255, 255, 0.4)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(255, 255, 255, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)'
      };

      // 侘び寂びモード - 枯山水の静寂：独自のアイデンティティ
      const glassmorphismWabiSabi = {
        background: 'linear-gradient(135deg, rgba(97, 97, 97, 0.7), rgba(66, 66, 66, 0.6))',
        backdropFilter: 'blur(20px) saturate(120%)',
        border: '1px solid rgba(93, 64, 55, 0.5)',
        boxShadow: '0 8px 32px rgba(33, 33, 33, 0.4), 0 0 0 1px rgba(93, 64, 55, 0.4), inset 0 1px 0 rgba(189, 189, 189, 0.15)'
      };

      const theme = this.isWabiSabiMode ? glassmorphismWabiSabi : (this.isDarkMode ? glassmorphismDark : glassmorphismLight);

      return `
      position: fixed;
      ${positions[this.config.position] || positions['bottom-right']}
      width: 320px;
      max-height: ${this.config.maxHeight}px;
      background: ${theme.background};
      border: ${theme.border};
      border-radius: 20px;
      color: ${this.isDarkMode ? '#ffffff' : '#1f2937'};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', sans-serif;
      font-size: 14px;
      z-index: 1000;
      padding: 16px !important;
      box-shadow: ${theme.boxShadow};
      backdrop-filter: ${theme.backdropFilter};
      -webkit-backdrop-filter: ${theme.backdropFilter};
      display: none;
      flex-direction: column;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    `;
    }

    getHeaderStyles() {
      // ダークモードと同じ紫グラデーションで統一
      const gradientColors = 'linear-gradient(135deg, #4f46e5, #7c3aed)';

      return `
      margin-bottom: 20px;
      text-align: center;
      background: ${gradientColors};
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      font-weight: 800;
      font-size: 14px;
      border-bottom: 1px solid rgba(79, 70, 229, 0.2);
      padding-bottom: 12px;
    `;
    }

    getOutputStyles() {
      // カスタムスクロールバーのCSSを注入
      this.addScrollbarStyles();

      return `
      height: 200px;
      overflow-y: auto;
      background: ${this.isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.1)'};
      border: 1px solid ${this.isDarkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.2)'};
      border-radius: 12px;
      padding: 12px;
      margin-bottom: 16px;
      font-size: 12px;
      line-height: 1.4;
      backdrop-filter: blur(8px);

      /* カスタムスクロールバーのスタイル */
      scrollbar-width: thin;
      scrollbar-color: ${this.isDarkMode ? 'rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.3) rgba(0, 0, 0, 0.1)'};
    `;
    }

    /**
     * スクロールバーのカスタムスタイルをページに注入
     */
    addScrollbarStyles() {
      if (document.getElementById('custom-scrollbar-styles')) return;

      const style = document.createElement('style');
      style.id = 'custom-scrollbar-styles';
      style.textContent = `
      .command-output::-webkit-scrollbar {
        width: 8px;
      }

      .command-output::-webkit-scrollbar-track {
        background: ${this.isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'};
        border-radius: 4px;
      }

      .command-output::-webkit-scrollbar-thumb {
        background: ${this.isDarkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)'};
        border-radius: 4px;
        transition: background 0.2s ease;
      }

      .command-output::-webkit-scrollbar-thumb:hover {
        background: ${this.isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)'};
      }

      /* ダークモード用 */
      .dark-mode .command-output::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.1);
      }

      .dark-mode .command-output::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.3);
      }

      .dark-mode .command-output::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.5);
      }

      /* ライトモード用 */
      .light-mode .command-output::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.1);
      }

      .light-mode .command-output::-webkit-scrollbar-thumb {
        background: rgba(0, 0, 0, 0.3);
      }

      .light-mode .command-output::-webkit-scrollbar-thumb:hover {
        background: rgba(0, 0, 0, 0.5);
      }

      @keyframes shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }

      /* 2025年トレンド: 微細な浮遊感アニメーション */
      @keyframes gentleFloat {
        0%, 100% { 
          transform: translateY(0px) scale(1);
        }
        25% { 
          transform: translateY(-2px) scale(1.005);
        }
        50% { 
          transform: translateY(-1px) scale(1.002);
        }
        75% { 
          transform: translateY(-3px) scale(1.008);
        }
      }

      /* タスクステータスコンテナのホバー効果 */
      .task-status-container:hover .progress-bar {
        box-shadow: 0 0 20px rgba(255,123,71,0.6) !important;
        transform: scaleY(1.1);
      }

      /* プログレスバーの微細なアニメーション */
      .progress-bar {
        position: relative;
      }

      .progress-bar::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(90deg, 
          transparent, 
          rgba(255,255,255,0.4), 
          transparent);
        animation: progress-shine 2s ease-in-out infinite;
      }

      @keyframes progress-shine {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
      }
    `;

      document.head.appendChild(style);
    }

    getInputStyles() {
      // 2025 Glassmorphism仕様：入力フィールド
      const glassmorphismDark = {
        background: 'linear-gradient(135deg, rgba(53, 41, 72, 0.48), rgba(24, 35, 55, 0.58))',
        border: '1px solid rgba(192, 132, 252, 0.45)',
        boxShadow: '0 14px 34px rgba(17, 24, 39, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.12)'
      };

      const glassmorphismLight = {
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.6), rgba(243, 232, 255, 0.5))',
        border: '1px solid rgba(216, 180, 254, 0.6)',
        boxShadow: '0 16px 30px rgba(148, 163, 184, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.6)'
      };

      const glassmorphismWabiSabi = {
        background: 'linear-gradient(135deg, rgba(117, 101, 92, 0.48), rgba(66, 54, 47, 0.38))',
        border: '1px solid rgba(205, 174, 142, 0.55)',
        boxShadow: '0 12px 28px rgba(85, 69, 60, 0.42), inset 0 1px 0 rgba(230, 214, 195, 0.18)'
      };

      const theme = this.isWabiSabiMode ? glassmorphismWabiSabi : (this.isDarkMode ? glassmorphismDark : glassmorphismLight);

      return `
      width: 100%;
      padding: 16px 20px;
      background: ${theme.background};
      border: ${theme.border};
      border-radius: 18px;
      color: ${this.isWabiSabiMode ? '#F9F5F0' : (this.isDarkMode ? '#f8fafc' : '#1f2937')};
      font-size: 15px;
      outline: none;
      box-sizing: border-box;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      font-family: inherit;
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      box-shadow: ${theme.boxShadow};
      placeholder-color: ${this.isDarkMode ? 'rgba(248, 250, 252, 0.55)' : 'rgba(55, 65, 81, 0.56)'};
      resize: none;
      overflow-y: hidden;
      min-height: 26px;
      max-height: 88px;
      line-height: 24px;
      letter-spacing: 0.01em;
      caret-color: ${this.isWabiSabiMode ? '#f9c784' : '#f472b6'};
    `;
    }

    getModernButtonStyles(type) {
      const styles = {
        primary: this.isWabiSabiMode ? `
        background: linear-gradient(135deg, #8D6E63, #6D4C41);
        box-shadow: 0 4px 12px rgba(85, 139, 47, 0.4), inset 0 1px 0 rgba(184, 158, 135, 0.15);
        width: 100%;
        padding: 16px;
        font-size: 14px;
        font-weight: 600;
      ` : `
        background: linear-gradient(135deg, #4f46e5, #4338ca);
        width: 100%;
        padding: 16px;
        font-size: 14px;
        font-weight: 600;
      `,
        secondary: this.isWabiSabiMode ? `
        background: rgba(158, 158, 158, 0.2);
        border: 1px solid rgba(141, 110, 99, 0.4);
        flex: 1;
        padding: 12px;
        font-size: 13px;
        font-weight: 500;
        backdrop-filter: blur(8px);
        color: #F5F5F5;
      ` : `
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.2);
        flex: 1;
        padding: 12px;
        font-size: 13px;
        font-weight: 500;
        backdrop-filter: blur(8px);
      `,
        danger: this.isWabiSabiMode ? `
        background: rgba(141, 110, 99, 0.3);
        border: 1px solid rgba(93, 64, 55, 0.5);
        flex: 1;
        padding: 12px;
        font-size: 13px;
        font-weight: 500;
        backdrop-filter: blur(8px);
        color: #F5F5F5;
      ` : `
        background: rgba(255, 59, 48, 0.15);
        border: 1px solid rgba(255, 59, 48, 0.3);
        flex: 1;
        padding: 12px;
        font-size: 13px;
        font-weight: 500;
        backdrop-filter: blur(8px);
        color: #ff453a;
      `
      };

      return `
      border: none;
      border-radius: 12px;
      color: white;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      font-family: inherit;
      outline: none;
      ${styles[type]}
    `;
    }

    getModeButtonStyles(isActive, mode) {
      // モードカラー設定
      const modeColors = {
        generate: 'linear-gradient(135deg, #22c55e, #16a34a)',  // Green - チャット欄と同じ緑色
        modify: 'linear-gradient(135deg, #22c55e, #16a34a)',    // Green - チャット欄と同じ緑色
        delete: 'linear-gradient(135deg, #22c55e, #16a34a)'     // Green - チャット欄と同じ緑色
      };
      
      return `
      flex: 1;
      padding: 12px 16px;
      border: none;
      border-radius: 8px;
      color: ${isActive ? 'white' : 'rgba(255, 255, 255, 0.7)'};
      background: ${isActive ? modeColors[mode] : 'transparent'};
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      font-family: inherit;
      outline: none;
    `;
    }

    /**
     * イベントバインディング
     */
    bindXREvents() {
      if (!this.sceneManager?.onXR) {
        return;
      }
      if (this.xrEventUnsubscribe.length > 0) {
        this.xrEventUnsubscribe.forEach(unsub => {
          try {
            unsub?.();
          } catch (error) {
            console.warn('⚠️ Failed to unsubscribe XR listener:', error);
          }
        });
        this.xrEventUnsubscribe = [];
      }

      this.xrEventUnsubscribe.push(
        this.sceneManager.onXR('state', event => {
          this.updateXRState(event?.detail || {});
        })
      );
      this.xrEventUnsubscribe.push(
        this.sceneManager.onXR('support', event => {
          this.updateXRSupport(event?.detail || {});
        })
      );
      this.xrEventUnsubscribe.push(
        this.sceneManager.onXR('autoResume', event => {
          this.updateXRAutoResume(event?.detail?.enabled ?? this.xrAutoResume);
        })
      );
      this.xrEventUnsubscribe.push(
        this.sceneManager.onXR('anchor', event => {
          this.updateXRAnchorState(event?.detail || {});
        })
      );
    }

    bindEvents() {
      // キーボードショートカット
      document.addEventListener('keydown', (e) => {
        // 設定されたキーでUI表示切替
        if (e.key === this.config.activationKey) {
          e.preventDefault();
          this.toggle();
          return;
        }
        
        // Enterキー処理はinitUI()内で行うため、ここでは処理しない
        // （IME対応のため）
        
        // Escapeで非表示
        if (this.isVisible && e.key === 'Escape') {
          this.hide();
        }
        
        // Ctrl+Z/Ctrl+Y でUndo/Redo
        if (this.isVisible && e.ctrlKey) {
          if (e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            this.undo();
          } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
            e.preventDefault();
            this.redo();
          }
        }
      });

      // 入力フィールドのスタイル調整
      this.input.addEventListener('focus', () => {
        if (this.isWabiSabiMode) {
          this.input.style.borderColor = 'rgba(249, 199, 132, 0.65)';
          this.input.style.boxShadow = '0 0 0 2px rgba(249, 199, 132, 0.3), 0 18px 32px rgba(189, 140, 94, 0.35)';
        } else {
          this.input.style.borderColor = 'rgba(244, 114, 182, 0.65)';
          this.input.style.boxShadow = '0 0 0 2px rgba(244, 114, 182, 0.35), 0 20px 36px rgba(192, 132, 252, 0.25)';
        }
        this.input.style.filter = 'brightness(1.05)';
      });

      this.input.addEventListener('blur', () => {
        this.input.style.cssText = this.getInputStyles();
        this.input.placeholder = this.getPlaceholderForMode(this.currentMode);
      });
    }

    /**
     * UI表示/非表示切替
     */
    toggle() {
      if (this.isVisible) {
        this.hide();
      } else {
        this.show();
      }
    }

    launchOnboarding(force = false) {
      if (!this.onboardingCoach) {
        setTimeout(() => this.launchOnboarding(force), 120);
        return;
      }
      this.onboardingCoach.start({ force });
    }

    showShortcutGuide() {
      const shortcuts = [
        { key: this.config.activationKey || '@', description: 'ChocoDropの表示/非表示を切り替え' },
        { key: 'Ctrl / ⌘ + Enter', description: '現在のコマンドを実行' },
        { key: 'WASD + マウス', description: '撮影モードで視点を移動' },
        { key: 'Shift', description: '撮影モードで移動を加速' }
      ];

      if (!this.isVisible) {
        this.show();
      }

      const messageLines = shortcuts.map(item => ` • ${item.key} … ${item.description}`).join('\n');
      this.addOutput(`⌨️ ショートカットヒント\n${messageLines}`, 'system');
    }

    insertOnboardingPrompt(prompt) {
      if (!this.input) {
        return;
      }
      this.input.value = prompt;
      this.input.dispatchEvent(new Event('input', { bubbles: true }));
      this.addOutput('🪄 推奨プロンプトを挿入しました。必要に応じて調整してください。', 'system');
    }

    /**
     * UI表示
     */
    show() {
      this.container.style.display = 'flex';
      this.container.style.flexDirection = 'column';
      this.floatingContainer.style.display = 'flex';

      // UIフォームの位置に合わせて配置（少し遅延して正確な位置を取得）
      setTimeout(() => {
        const containerRect = this.container.getBoundingClientRect();
        this.floatingContainer.style.left = containerRect.left + 'px';
        this.floatingContainer.style.top = (containerRect.top - 80) + 'px';
        this.floatingContainer.style.width = containerRect.width + 'px';
        this.floatingContainer.style.transform = 'none';
      }, 50);

      this.isVisible = true;
      this.input.focus();

      // フォーム表示中はチョコアイコンを隠す
      if (this.floatingChocolateIcon) {
        this.floatingChocolateIcon.style.opacity = '0';
        this.floatingChocolateIcon.style.pointerEvents = 'none';
      }

      // コントロールを無効化
      this.onControlsToggle(true);
      // コントロール停止時も静かに
    }

    /**
     * UI非表示
     */
    hide() {
      this.container.style.display = 'none';
      this.floatingContainer.style.display = 'none';
      this.isVisible = false;

      // フォーム非表示時はチョコアイコンを再表示
      if (this.floatingChocolateIcon) {
        this.floatingChocolateIcon.style.opacity = '0.8';
        this.floatingChocolateIcon.style.pointerEvents = 'auto';
      }

      // コントロールを再有効化
      this.onControlsToggle(false);
      this.logDebug('🎮 コントロールを再開');
    }

    /**
     * モード切り替え
     */
    switchMode(mode) {
      if (this.currentMode === mode) return;
      
      this.currentMode = mode;
      
      // モードボタンのスタイル更新
      this.container.querySelectorAll('[data-mode]').forEach(btn => {
        const isActive = btn.dataset.mode === mode;
        btn.style.cssText = this.getModeButtonStyles(isActive, btn.dataset.mode);
      });
      
      // 入力フィールドのプレースホルダー更新
      this.input.placeholder = this.getPlaceholderForMode(mode);
      
      // 実行ボタンのラベルと色更新
      const executeBtn = this.container.querySelector('#execute-btn');
      const labels = {
        generate: '🎨 Generate Object',
        modify: '✏️ Apply Changes', 
        delete: '🗑️ Delete Objects'
      };
      
      const buttonColors = {
        generate: 'linear-gradient(135deg, #5b21b6, #4c1d95)',
        modify: 'linear-gradient(135deg, #ec4899, #be185d)', 
        delete: 'rgba(107, 114, 128, 0.15)'
      };
      
      executeBtn.innerHTML = `<span>${labels[mode]}</span>`;
      executeBtn.style.background = buttonColors[mode];
      
      // モード切り替え通知は不要（ボタンで分かるため）
    }
    
    /**
     * モード別プレースホルダー
     */
    getPlaceholderForMode(mode) {
      const placeholders = {
        generate: '例: 「夕暮れのスタジオで揺れるリボンライトを描いて」⏎ ✨',
        import: '例: 「📁 で取り込んだ彫刻を中央にそっと置いて」⏎',
        modify: '例: 「この照明をミルキーゴールドに柔らかくして」⏎',
        delete: '例: 「足元のスモークをそっと消して」⏎'
      };
      return placeholders[mode] || placeholders.generate;
    }

    /**
     * コマンド実行
     */
    async executeCommand(commandOverride = null) {
      // ⏎記号（Enterキーのヒント）を削除してからコマンド処理
      const command = commandOverride || this.input.value.replace(/\s*⏎\s*/g, '').trim();
      if (!command) return;

      // 事前バリデーション（2025年UX改善）
      const preValidation = await this.preValidateCommand(command);
      if (!preValidation.canExecute) {
        // バリデーション失敗時はフィードバック表示して終了
        return;
      }

      await this.proceedWithExecution(command, preValidation.commandType);
    }

    /**
     * 削除確認ダイアログ
     */
    async showConfirmationDialog(options) {
      const {
        icon = '🗑️',
        title = '確認',
        message = 'この操作を実行しますか？',
        confirmText = '実行',
        cancelText = 'キャンセル',
        confirmColor = '#ef4444'
      } = options;

      return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(15, 23, 42, 0.6);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 2000;
        backdrop-filter: blur(24px) saturate(180%);
        -webkit-backdrop-filter: blur(24px) saturate(180%);
      `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
        background: ${this.isWabiSabiMode
          ? 'linear-gradient(135deg, rgba(239, 235, 233, 0.4), rgba(215, 204, 200, 0.3))'
          : (this.isDarkMode
            ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.85), rgba(30, 27, 75, 0.8))'
            : 'linear-gradient(135deg, rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0.3))')};
        border: 1px solid ${this.isWabiSabiMode
          ? 'rgba(161, 136, 127, 0.4)'
          : (this.isDarkMode ? 'rgba(99, 102, 241, 0.3)' : 'rgba(255, 255, 255, 0.5)')};
        border-radius: 20px;
        padding: 32px;
        max-width: 420px;
        text-align: center;
        color: ${this.isWabiSabiMode
          ? '#5D4037'
          : (this.isDarkMode ? '#ffffff' : '#1f2937')};
        font-family: inherit;
        backdrop-filter: blur(24px) saturate(180%);
        -webkit-backdrop-filter: blur(24px) saturate(180%);
        box-shadow: ${this.isWabiSabiMode
          ? '0 8px 32px rgba(93, 64, 55, 0.2), 0 0 0 1px rgba(161, 136, 127, 0.2)'
          : (this.isDarkMode
            ? '0 8px 32px rgba(15, 23, 42, 0.4), 0 0 0 1px rgba(99, 102, 241, 0.1)'
            : '0 8px 32px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(255, 255, 255, 0.2)')};
        transform: scale(0.9);
        opacity: 0;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      `;

        dialog.innerHTML = `
        <div style="font-size: 56px; margin-bottom: 20px;">${icon}</div>
        <h3 style="margin: 0 0 16px 0; color: ${this.isDarkMode ? '#a5b4fc' : '#6366f1'}; font-size: 20px; font-weight: 700; letter-spacing: 0.02em;">
          ${title}
        </h3>
        <p style="margin: 0 0 28px 0; color: ${this.isDarkMode ? '#d1d5db' : '#6b7280'}; line-height: 1.6; font-size: 12px;">
          ${message}
        </p>
        <div style="display: flex; gap: 8px; justify-content: center;">
          <button id="cancel-btn" style="
            padding: 14px 24px;
            background: ${this.isDarkMode 
              ? 'linear-gradient(135deg, rgba(55, 65, 81, 0.3), rgba(75, 85, 99, 0.2))'
              : 'linear-gradient(135deg, rgba(255, 255, 255, 0.25), rgba(255, 255, 255, 0.15))'};
            border: 1px solid ${this.isDarkMode ? 'rgba(156, 163, 175, 0.2)' : 'rgba(255, 255, 255, 0.3)'};
            border-radius: 12px;
            color: ${this.isDarkMode ? '#d1d5db' : '#374151'};
            cursor: pointer;
            font-family: inherit;
            font-size: 14px;
            font-weight: 600;
            transition: all 0.2s ease;
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
          ">${cancelText}</button>
          <button id="confirm-btn" style="
            padding: 14px 24px;
            background: ${confirmColor === (this.isWabiSabiMode ? '#8BC34A' : '#6366f1') 
              ? 'linear-gradient(135deg, ' + (this.isWabiSabiMode ? '#8BC34A, #689F38' : '#6366f1, #8b5cf6') + ')' 
              : confirmColor === '#ef4444'
              ? 'linear-gradient(135deg, #ef4444, #dc2626)'
              : 'linear-gradient(135deg, #ff7b47, #f97316)'};
            border: none;
            border-radius: 12px;
            color: white;
            cursor: pointer;
            font-family: inherit;
            font-size: 14px;
            font-weight: 700;
            transition: all 0.2s ease;
            box-shadow: 0 4px 16px ${confirmColor === (this.isWabiSabiMode ? '#8BC34A' : '#6366f1') 
              ? 'rgba(99, 102, 241, 0.3)' 
              : confirmColor === '#ef4444' 
              ? 'rgba(239, 68, 68, 0.3)' 
              : 'rgba(255, 123, 71, 0.3)'};
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
          ">${confirmText}</button>
        </div>
      `;

        modal.appendChild(dialog);
        document.body.appendChild(modal);

        // アニメーション開始
        requestAnimationFrame(() => {
          modal.style.opacity = '1';
          dialog.style.transform = 'scale(1)';
          dialog.style.opacity = '1';
        });

        // イベントリスナー
        dialog.querySelector('#cancel-btn').onclick = (e) => {
          e.stopPropagation();
          e.preventDefault();
          this.closeModalWithAnimation(modal);
          resolve(false);
        };

        dialog.querySelector('#confirm-btn').onclick = (e) => {
          e.stopPropagation();
          e.preventDefault();
          this.closeModalWithAnimation(modal);
          resolve(true);
        };

        // ESCキーでキャンセル
        const escHandler = (e) => {
          if (e.key === 'Escape') {
            this.closeModalWithAnimation(modal);
            document.removeEventListener('keydown', escHandler);
            resolve(false);
          }
        };
        document.addEventListener('keydown', escHandler);

        // モーダル全体でクリックイベントの伝播を防止
        modal.onclick = (e) => {
          e.stopPropagation();
          if (e.target === modal) {
            this.closeModalWithAnimation(modal);
            resolve(false);
          }
        };
        
        // ダイアログ自体のクリックでも伝播を防止
        dialog.onclick = (e) => {
          e.stopPropagation();
        };
      });
    }

    async showDeleteConfirmation(command) {
      return this.showConfirmationDialog({
        icon: '🗑️',
        title: '削除の確認',
        message: `「${command}」を実行しますか？<br>この操作は取り消すことができません。`,
        confirmText: '削除実行',
        cancelText: 'キャンセル',
        confirmColor: '#ff7b47'
      });
    }

    /**
     * 出力エリアにメッセージ追加
     */
    /**
     * タスクカード追加（従来のaddOutputを置き換え）
     */
    addOutput(message, type = 'default', options = {}) {
      // タスクカード形式で処理
      if (type === 'task' || type === 'progress') {
        return this.addTaskCard(message, options);
      }

      // エラーとシステムメッセージのみ表示
      if (type === 'error' || type === 'system') {
        this.addSystemMessage(message, type);
      }
    }

    /**
     * フローティングタスクカード追加
     */
    addTaskCard(taskInfo, options = {}) {
      if (!this.taskCards) this.taskCards = new Map();

      const taskId = options.taskId || `task_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const status = options.status || 'pending';
      const prompt = taskInfo.prompt || taskInfo.command || taskInfo;

      // フローティングカード作成
      const card = document.createElement('div');
      card.className = 'floating-task-card';
      card.setAttribute('data-task-id', taskId);

      // 2025年トレンド: 待機中のアニメーション効果
      if (status === 'pending' || status === 'processing' || status === 'progress') {
        card.classList.add('chocodrop-shimmer', 'chocodrop-float');
      }

      // iOS 26 Liquid Glass + 2026年トレンドスタイル
      card.style.cssText = this.getFloatingCardStyles(status);
      // アニメーション用初期状態（非表示）- 強制設定
      card.style.setProperty('opacity', '0', 'important');
      card.style.setProperty('transform', 'translateY(20px) scale(0.95)', 'important');
      card.style.setProperty('filter', 'blur(4px)', 'important');

      const iconMap = {
        pending: '⏳',
        processing: '🎨',
        progress: '⚡',
        completed: '✅',
        error: '❌'
      };

      // 温かみのあるメッセージ表示
      const friendlyMessage = this.getFriendlyMessage(status, prompt, options.errorMessage);
      card.innerHTML = `
      <span style="font-size: 14px;">${iconMap[status]}</span>
      <span style="font-size: 13px; margin-left: 6px;">${friendlyMessage}</span>
    `;

      // フローティングコンテナに追加（最新が上に来るように）
      this.floatingContainer.insertBefore(card, this.floatingContainer.firstChild);
      
      // カード表示制限を適用（最新3個まで表示）
      this.updateCardDisplayLimit();

      this.taskCards.set(taskId, {
        element: card,
        status: status,
        prompt: prompt,
        originalPrompt: prompt, // 元のプロンプト
        startTime: Date.now(),
        endTime: null,
        error: null,
        contentType: 'image', // 'image', 'video', etc.
        model: null,
        settings: null
      });

      // カード詳細モーダル用のイベントリスナー
      this.addCardDetailEvents(card, taskId);
      
      // 入場アニメーション
      this.animateCardEntrance(card);
      
      // 2025年トレンド: シマーエフェクトCSS確保
      this.ensureShimmerStyles();
      
      return taskId;
    }

    /**
     * 2025年トレンド: シマーエフェクトスタイルを確保
     */
    ensureShimmerStyles() {
      if (document.querySelector('#chocodrop-shimmer-styles')) return;
      
      const styleSheet = document.createElement('style');
      styleSheet.id = 'chocodrop-shimmer-styles';
      styleSheet.textContent = `
      /* 2025年トレンド: シマーエフェクト（強化版） */
      .chocodrop-shimmer {
        position: relative;
        overflow: hidden;
      }
      
      .chocodrop-shimmer::before {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(
          90deg,
          transparent,
          ${this.isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.7)'},
          transparent
        );
        animation: shimmer 1.5s infinite;
        pointer-events: none;
        z-index: 1;
      }
      
      .chocodrop-shimmer > * {
        position: relative;
        z-index: 2;
      }
      
      /* 2025年トレンド: 微細な浮遊感 */
      .chocodrop-float {
        animation: gentleFloat 4s ease-in-out infinite;
      }
      
      /* 待機中の特別なパルス効果（強化版） */
      .chocodrop-shimmer.floating-task-card {
        animation: gentleFloat 4s ease-in-out infinite, subtlePulse 3s ease-in-out infinite;
      }
      
      @keyframes subtlePulse {
        0%, 100% { 
          box-shadow: 0 8px 32px rgba(15, 23, 42, 0.3), 0 0 0 1px rgba(99, 102, 241, 0.1);
        }
        50% { 
          box-shadow: 0 12px 40px rgba(15, 23, 42, 0.5), 0 0 0 1px rgba(99, 102, 241, 0.3);
        }
      }
    `;
      
      document.head.appendChild(styleSheet);
    }

    /**
     * フローティングタスクカード更新
     */
    updateTaskCard(taskId, status, options = {}) {
      if (!this.taskCards || !this.taskCards.has(taskId)) return;

      const taskData = this.taskCards.get(taskId);
      const card = taskData.element;

      // ステータス更新
      taskData.status = status;

      // エラー情報を保存
      if (status === 'error' && options.errorMessage) {
        taskData.error = options.errorMessage;
      }

      // 2025年トレンド: アニメーション状態管理
      if (status === 'pending' || status === 'processing' || status === 'progress') {
        // 待機中・処理中: シマーエフェクト追加
        card.classList.add('chocodrop-shimmer', 'chocodrop-float');
      } else {
        // 完了・エラー: シマーエフェクト削除
        card.classList.remove('chocodrop-shimmer', 'chocodrop-float');
      }

      const iconMap = {
        pending: '⏳',
        processing: '🎨',
        progress: '⚡',
        completed: '✅',
        error: '❌'
      };

      // 温かみのあるメッセージ更新（エラー時は理由も含める）
      const friendlyMessage = this.getFriendlyMessage(status, taskData.prompt, taskData.error);
      card.innerHTML = `
      <span style="font-size: 14px;">${iconMap[status]}</span>
      <span style="font-size: 13px; margin-left: 6px;">${friendlyMessage}</span>
    `;

      // スタイル更新（完了状態に応じて）
      card.style.cssText = this.getFloatingCardStyles(status);

      // 完了時の自動消去アニメーション
      if (status === 'completed') {
        this.animateCardSuccess(card, taskId);
      } else if (status === 'error') {
        this.animateCardError(card, taskId);
      }
    }

    /**
     * エラー時のクリーンアップ処理
     */
    performErrorCleanup(taskId, error) {
      // タスクカードのエラー状態を更新
      if (taskId) {
        this.updateTaskCard(taskId, 'error', { errorMessage: error.message });
        
        // 一定時間後にタスクカードを自動削除（ユーザーが手動で消せるようになるまでの時間）
        setTimeout(() => {
          this.removeTaskCard(taskId);
        }, 10000); // 10秒後に自動削除
      }

      // 現在のタスクIDをクリア
      if (this.currentTaskId) {
        this.currentTaskId = null;
      }

      // SceneManagerに残っているローディング状態をクリア
      if (this.sceneManager) {
        this.sceneManager.clearLoadingStates?.();
      }

      // アクティブなプログレス接続をクリア
      if (this.progressConnections) {
        for (const [connectionId, connection] of this.progressConnections.entries()) {
          if (connection.taskId === taskId) {
            this.progressConnections.delete(connectionId);
          }
        }
      }

      console.log('🧹 Error cleanup completed');
    }

    /**
     * タスクカードを削除する
     */
    removeTaskCard(taskId) {
      const taskCard = document.querySelector(`[data-task-id="${taskId}"]`);
      if (taskCard) {
        taskCard.style.opacity = '0';
        taskCard.style.transform = 'translateX(-20px)';
        setTimeout(() => {
          taskCard.remove();
        }, 300); // フェードアウト後に削除
        console.log(`🗑️ Task card removed: ${taskId}`);
      }
    }

    /**
     * システムメッセージ表示
     */
    addSystemMessage(message, type) {
      const entry = document.createElement('div');
      entry.className = `system-message ${type}`;
      entry.style.cssText = `
      padding: 8px 12px;
      margin: 4px 0;
      border-radius: 8px;
      font-size: 12px;
      line-height: 1.4;
      animation: slideIn 0.3s ease-out;
      background: ${type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(107, 114, 128, 0.1)'};
      border: 1px solid ${type === 'error' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(107, 114, 128, 0.3)'};
      color: ${type === 'error' ? '#fca5a5' : (this.isDarkMode ? '#d1d5db' : '#6b7280')};
    `;
      entry.textContent = message;
      this.outputDiv.appendChild(entry);
      this.scrollToBottom();
    }

    /**
     * 入力フィールド直下のフィードバック表示（2025年トレンド準拠）
     */
    showInputFeedback(message, type = 'error', options = {}) {
      if (type === 'success') {
        return;
      }

      if (type === 'error') {
        this.addOutput(`⚠️ ${message}`, 'error');
      } else {
        this.addOutput(`💡 ${message}`, 'system');
      }

      if (!this.feedbackOverlay) {
        const overlay = document.createElement('div');
        overlay.className = 'input-feedback-overlay';
        overlay.style.cssText = `
        position: absolute;
        left: 16px;
        right: 16px;
        bottom: 12px;
        z-index: 1200;
        pointer-events: auto;
        display: flex;
        gap: 8px;
        align-items: center;
        padding: 12px 16px;
        border-radius: 12px;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        transition: opacity 180ms ease, transform 180ms ease;
        opacity: 0;
        transform: translateY(8px);
      `;
        this.container.appendChild(overlay);
        this.feedbackOverlay = overlay;
      }

      const overlay = this.feedbackOverlay;
      overlay.innerHTML = '';

      const isError = type === 'error';
      const background = isError
        ? (this.isDarkMode ? 'rgba(239, 68, 68, 0.28)' : 'rgba(239, 68, 68, 0.18)')
        : (this.isDarkMode ? 'rgba(59, 130, 246, 0.25)' : 'rgba(59, 130, 246, 0.18)');
      const border = isError
        ? '1px solid rgba(239, 68, 68, 0.45)'
        : '1px solid rgba(59, 130, 246, 0.35)';
      const color = isError
        ? (this.isDarkMode ? '#fca5a5' : '#b91c1c')
        : (this.isDarkMode ? '#bfdbfe' : '#1d4ed8');

      overlay.style.background = background;
      overlay.style.border = border;
      overlay.style.color = color;

      const messageSpan = document.createElement('span');
      messageSpan.textContent = message;
      messageSpan.style.flex = '1';
      overlay.appendChild(messageSpan);

      if (options.actions && Array.isArray(options.actions) && options.actions.length > 0) {
        const actionsContainer = document.createElement('div');
        actionsContainer.style.cssText = `
        display: flex;
        gap: 8px;
      `;

        options.actions.forEach(action => {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = action.label;
          button.style.cssText = `
          padding: 6px 12px;
          border-radius: 999px;
          border: none;
          cursor: pointer;
          background: ${isError ? 'rgba(239, 68, 68, 0.28)' : 'rgba(59, 130, 246, 0.25)'};
          color: inherit;
          font-size: 11px;
          transition: background 0.2s ease;
        `;
          button.addEventListener('mouseenter', () => {
            button.style.background = isError ? 'rgba(239, 68, 68, 0.38)' : 'rgba(59, 130, 246, 0.35)';
          });
          button.addEventListener('mouseleave', () => {
            button.style.background = isError ? 'rgba(239, 68, 68, 0.28)' : 'rgba(59, 130, 246, 0.25)';
          });
          button.addEventListener('click', () => {
            if (typeof action.onClick === 'function') {
              action.onClick();
            }
          });
          actionsContainer.appendChild(button);
        });

        overlay.appendChild(actionsContainer);
      }

      if (this.feedbackAutoClearTimer) {
        clearTimeout(this.feedbackAutoClearTimer);
        this.feedbackAutoClearTimer = null;
      }

      overlay.style.pointerEvents = 'auto';
      overlay.style.opacity = '1';
      overlay.style.transform = 'translateY(0)';

      this.currentFeedback = overlay;

      if (type === 'info') {
        this.feedbackAutoClearTimer = setTimeout(() => this.clearInputFeedback(), options.duration || 3000);
      }
    }

    /**
     * 入力フィードバックをクリア
     */
    clearInputFeedback() {
      if (this.feedbackAutoClearTimer) {
        clearTimeout(this.feedbackAutoClearTimer);
        this.feedbackAutoClearTimer = null;
      }

      if (this.currentFeedback) {
        const element = this.currentFeedback;
        element.style.pointerEvents = 'none';
        element.style.opacity = '0';
        element.style.transform = 'translateY(8px)';
        this.currentFeedback = null;
        setTimeout(() => {
          element.innerHTML = '';
        }, 180);
      }
    }

    /**
     * フィードバック用CSSスタイルを確保
     */
    ensureFeedbackStyles() {
      if (document.getElementById('feedback-styles')) return;
      
      const style = document.createElement('style');
      style.id = 'feedback-styles';
      style.textContent = `
      @keyframes feedbackSlideIn {
        from {
          opacity: 0;
          transform: translateY(-10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      @keyframes feedbackSlideOut {
        from {
          opacity: 1;
          transform: translateY(0);
        }
        to {
          opacity: 0;
          transform: translateY(-10px);
        }
      }
    `;
      document.head.appendChild(style);
    }

    /**
     * コマンド事前バリデーション（送信前チェック）
     */
    async preValidateCommand(command) {
      // 1. コマンドタイプ判定
      const hasSelectedObject = this.sceneManager?.selectedObject || this.selectedFile;
      const commandType = this.analyzeCommandType(command, hasSelectedObject);

      if (this.selectedFile) {
        commandType.type = 'import';
        commandType.mediaType = this.selectedFile.type === 'video' ? 'video' : 'image';
        commandType.needsTarget = false;
        commandType.requiresConfirmation = false;
        commandType.hasExplicitTarget = true;
        commandType.detectedKeyword = commandType.detectedKeyword || 'import';
      }

      // 最新の解析結果をUIモードへ反映（ユーザー入力優先）
      if (commandType.type && this.selectMode && commandType.type !== this.currentMode) {
        this.selectMode(commandType.type, false, commandType.detectedKeyword || null);
      }

      // 2. 空コマンドの場合
      if (commandType.type === 'empty') {
        this.showInputFeedback('💡 何をしましょうか？コマンドを入力してください', 'info');
        return { canExecute: false, reason: 'empty_command' };
      }
      
      // 3. 対象が必要なコマンドの事前チェック
      if (commandType.needsTarget && !hasSelectedObject) {
        const canAttemptSearch = !!this.sceneManager && (commandType.hasExplicitTarget || commandType.type === 'modify');
        
        // まず自然言語で対象を探してみる
        if (canAttemptSearch) {
          this.logDebug('🔍 Searching for explicitly mentioned target...');
          try {
            const foundTarget = await this.sceneManager?.findObjectByKeyword(command);
            if (foundTarget) {
              // 対象を発見！選択してアニメーション表示
              this.sceneManager.selectObject(foundTarget);
              this.showInputFeedback(`✨ 「${foundTarget.name || foundTarget.userData?.originalPrompt || 'オブジェクト'}」を見つけました！`, 'success');
              // 1秒待ってから実行継続
              setTimeout(() => this.executeCommandAfterValidation(command, commandType), 1000);
              return { canExecute: false, reason: 'target_found_waiting' };
            } else {
              // 対象が見つからない場合
              this.showInputFeedback(
                '🔍 指定されたオブジェクトが見つかりません',
                'error',
                {
                  actions: [
                    {
                      label: '選択する',
                      onClick: () => {
                        this.clearInputFeedback();
                        this.showInputFeedback('👆 3Dシーン内のオブジェクトをクリックで選択してください', 'info');
                      }
                    },
                    {
                      label: '新規作成に変更',
                      onClick: () => {
                        // コマンドを生成モード向けに変換
                        const newCommand = this.convertToGenerateCommand(command);
                        this.input.value = newCommand;
                        this.clearInputFeedback();
                        this.showInputFeedback('✏️ コマンドを新規作成用に変更しました', 'success');
                      }
                    }
                  ]
                }
              );
              return { canExecute: false, reason: 'target_not_found' };
            }
          } catch (error) {
            this.logDebug('❌ Error searching for target:', error);
            this.showInputFeedback('⚠️ 対象の検索中にエラーが発生しました', 'error');
            return { canExecute: false, reason: 'search_error' };
          }
        } else {
          // 一般的な「対象が必要」エラー
          this.showInputFeedback(
            '🎯 操作対象が選択されていません',
            'error',
            {
              actions: [
                {
                  label: '選択する',
                  onClick: () => {
                    this.clearInputFeedback();
                    this.showInputFeedback('👆 3Dシーン内のオブジェクトをクリックで選択してください', 'info');
                  }
                },
                {
                  label: 'ヒント',
                  onClick: () => {
                    this.clearInputFeedback();
                    this.showInputFeedback('💡 「インポートした猫を」「選択した画像を」のように対象を明示してみてください', 'info');
                  }
                }
              ]
            }
          );
          return { canExecute: false, reason: 'no_target_selected' };
        }
      }
      
      // 4. バリデーション成功
      return { canExecute: true, commandType };
    }

    /**
     * バリデーション後のコマンド実行
     */
    async executeCommandAfterValidation(command, commandType) {
      // 既存のexecuteCommandロジックを継続
      // フィードバックをクリアしてから実行
      this.clearInputFeedback();
      
      // 元のexecuteCommandの続きを実行
      await this.proceedWithExecution(command, commandType);
    }

    async proceedWithExecution(command, commandType) {
      const hasSelectedObject = this.sceneManager?.selectedObject || this.selectedFile;
      if (!commandType) {
        commandType = this.analyzeCommandType(command, hasSelectedObject);
      }

      if (this.selectedFile) {
        if (this.currentMode !== 'import') {
          this.selectMode('import', false);
        }
        this.currentMode = 'import';
      } else {
        this.currentMode = commandType.type;
      }

      if (commandType.requiresConfirmation) {
        const confirmed = await this.showDeleteConfirmation(command);
        if (!confirmed) {
          this.addOutput('❌ 削除をキャンセルしました', 'system');
          return;
        }
      }

      this.input.value = '';
      this.clearInputFeedback();
      this.hideProactiveSuggestion();

      const taskId = this.addTaskCard(command, { status: 'processing' });

      this.saveCommandToHistory({
        command: command,
        mode: this.currentMode,
        mediaType: commandType.mediaType,
        timestamp: Date.now()
      });

      let result;

      try {
        const modePrefix = this.getModePrefix(this.currentMode);
        const fullCommand = `${modePrefix}${command}`;

        this.logDebug('🔍 Current mode check:', this.currentMode);
        if (this.currentMode === 'import') {
          this.logDebug('📁 Import mode detected - bypassing SceneManager');
          if (!this.selectedFile) {
            throw new Error('ファイルが選択されていません。まずファイルを選択してください。');
          }
          result = await this.handleImportCommand(command);
        } else if (this.sceneManager) {
          // modifyモードの場合は選択されたオブジェクトに直接適用
          if (this.currentMode === 'modify') {
            const selectedObject = this.sceneManager?.selectedObject;
            if (!selectedObject) {
              this.addOutput('⚠️ 変更するオブジェクトが選択されていません。まず3Dシーン内のオブジェクトをクリックで選択してから、再度コマンドを実行してください。', 'system');
              return;
            }
            // LiveCommandClientのmodifySelectedObjectを呼び出し
            if (this.client && this.client.modifySelectedObject) {
              result = await this.client.modifySelectedObject(selectedObject, command);
            } else {
              result = await this.sceneManager.executeCommand(fullCommand);
            }
          } else {
            result = await this.sceneManager.executeCommand(fullCommand);
          }
        } else if (this.client) {
          if (this.currentMode === 'generate') {
            if (commandType.mediaType === 'video') {
              result = await this.client.generateVideo(command, {
                model: this.selectedVideoService || undefined
              });
            } else {
              result = await this.client.generateImage(command, {
                service: this.selectedImageService || undefined
              });
            }
          } else if (this.currentMode === 'delete') {
            const selectedObject = this.sceneManager?.selectedObject;
            if (!selectedObject && !this.sceneManager?.getSelectedObjects()?.length) {
              this.addOutput('⚠️ 削除するオブジェクトが選択されていません。まず3Dシーン内のオブジェクトをクリックで選択してから、再度Deleteボタンを押してください。', 'system');
              return;
            }
            const confirmMessage = `本当に「${command}」を実行しますか？

この操作は取り消せません。`;
            if (!confirm(confirmMessage)) {
              this.addOutput('❌ 削除がキャンセルされました', 'system');
              return;
            }
            result = await this.client.deleteObjects(command);
          } else {
            result = await this.client.executeCommand(fullCommand);
          }
        } else {
          throw new Error('SceneManager または Client が設定されていません');
        }

        // サーバーからのエラーレスポンスをチェック
        if (result && result.success === false) {
          const errorToThrow = new Error(result.error || '操作に失敗しました');
          if (result.errorCategory) {
            errorToThrow.code = result.errorCategory;
          }
          throw errorToThrow;
        }

        if (result && result.taskId) {
          this.connectToProgress(result.taskId, taskId);
          this.currentTaskId = result.taskId;
        }

        if (taskId) {
          this.updateTaskCard(taskId, 'completed');
        }

        if (result?.fallbackUsed) {
          const warningMessage = result?.error
            ? `⚠️ 生成に失敗したためプレースホルダーを表示しています: ${result.error}`
            : '⚠️ 生成に失敗したためプレースホルダーを表示しています。';
          this.showInputFeedback('生成に失敗したためプレースホルダーを表示しています。設定を確認してください。', 'error');
          this.addOutput(warningMessage, 'error');
        }

        if (result?.modelName) {
          // モデル情報がある場合はモーダル表示用に保持（必要に応じて拡張）
        }

        if (result?.objectId) {
          // オブジェクト ID の提示は将来のUI更新で対応
        }

        if (result?.position) {
          // 位置情報はデバッグ表示のみ（現状は未使用）
        }

        if (commandType.mediaType) {
          // メディアタイプ別の追加処理が必要になった場合に備えたフック
        }
      } catch (error) {
        const errorMessages = {
          generate: `❌ ${commandType.mediaType === 'video' ? '動画' : '画像'}生成エラー`,
          modify: '❌ 変更エラー',
          delete: '❌ 削除エラー'
        };

        if (error?.code === 'LOCAL_SERVER_UNREACHABLE') {
          this.serverHealthState.available = false;
          this.serverHealthState.lastError = error;
          this.showServerHealthModal(error);
          this.showInputFeedback('サーバーに接続できません。`npm run dev` でローカルサーバーを起動してください。', 'error');
          this.addOutput('📡 サーバーに接続できません。`npm run dev` でローカルサーバーを起動してください。', 'error');
        } else if (error?.code === 'MCP_CONFIG_MISSING') {
          this.showMcpConfigNotice(error);
        } else {
          this.showInputFeedback(error.message, 'error');
        }

        // エラー時のクリーンアップ処理
        this.performErrorCleanup(taskId, error);

        this.addOutput(`${errorMessages[this.currentMode]}: ${error.message}`, 'error');
        console.error('Command execution error:', error);
      }

      if (this.sceneManager && this.sceneManager.selectedObject) {
        if (this.currentMode === 'modify' || this.currentMode === 'delete') {
          setTimeout(() => {
            this.sceneManager.deselectObject();
          }, 500);
        }
      }

      if (this.config.autoScroll) {
        this.scrollToBottom();
      }
    }

    /**
     * コマンドを生成モード向けに変換
     */
    convertToGenerateCommand(command) {
      // 「猫を大きく」→「大きな猫の画像を作って」のような変換
      const patterns = [
        { from: /(.+)を大きく/, to: '大きな$1の画像を作って' },
        { from: /(.+)を小さく/, to: '小さな$1の画像を作って' },
        { from: /(.+)を(.+)に/, to: '$2の$1の画像を作って' },
        { from: /(.+)を(.+)く/, to: '$2い$1の画像を作って' }
      ];
      
      for (const { from, to } of patterns) {
        if (from.test(command)) {
          return command.replace(from, to);
        }
      }
      
      // パターンマッチしない場合はデフォルト
      return `${command}の画像を作って`;
    }

    initializeServerHealthCheck() {
      if (this.config.enableServerHealthCheck === false) {
        this.logDebug('🚫 Server health check disabled via config');
        return;
      }

      if (!this.client) {
        this.logDebug('⚠️ Server health check skipped - client not available');
        return;
      }

      // 初回チェックは少し遅らせてUI描画を優先
      setTimeout(() => {
        this.performServerHealthCheck({ reason: 'initial', showModalOnFail: true }).catch(error => {
          this.logDebug('⚠️ Initial health check failed:', error);
        });
      }, 100);
    }

    async performServerHealthCheck(options = {}) {
      if (this.config.enableServerHealthCheck === false) {
        return true;
      }

      if (!this.client) {
        return true;
      }

      if (this.serverHealthState.checking) {
        return this.serverHealthState.available;
      }

      this.serverHealthState.checking = true;

      const { showModalOnFail = true } = options;

      if (this.serverHealthRetryButton) {
        this.serverHealthRetryButton.disabled = true;
        this.serverHealthRetryButton.textContent = '再接続中…';
      }

      try {
        if (typeof this.client.ensureInitialized === 'function') {
          await this.client.ensureInitialized();
        }

        const healthUrl = this.getHealthEndpoint();
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeoutId = controller ? setTimeout(() => controller.abort(), 5000) : null;

        const response = await fetch(healthUrl, {
          method: 'GET',
          cache: 'no-store',
          signal: controller ? controller.signal : undefined
        });

        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        if (!response.ok) {
          throw new Error(`Health check failed: HTTP ${response.status}`);
        }

        await response.json();

        this.serverHealthState.available = true;
        this.serverHealthState.lastError = null;
        this.hideServerHealthModal();
        return true;
      } catch (error) {
        this.serverHealthState.available = false;
        this.serverHealthState.lastError = error;

        if (showModalOnFail) {
          this.showServerHealthModal(error);
        }

        return false;
      } finally {
        this.serverHealthState.checking = false;
        if (this.serverHealthRetryButton) {
          this.serverHealthRetryButton.disabled = false;
          this.serverHealthRetryButton.textContent = '再接続を試す';
        }
      }
    }

    getHealthEndpoint() {
      const serverUrl = this.client?.serverUrl || this.sceneManager?.client?.serverUrl;
      if (serverUrl) {
        return `${serverUrl.replace(/\/$/, '')}/v1/health`;
      }
      return '/v1/health';
    }

    ensureServerHealthModal() {
      if (this.serverHealthModal) {
        return;
      }

      const backdrop = document.createElement('div');
      backdrop.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.65);
      backdrop-filter: blur(6px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    `;

      const modal = document.createElement('div');
      modal.style.cssText = `
      max-width: 420px;
      width: calc(100% - 64px);
      background: ${this.isDarkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.98)'};
      color: ${this.isDarkMode ? '#f1f5f9' : '#1f2937'};
      border-radius: 16px;
      padding: 28px;
      box-shadow: 0 25px 60px rgba(15, 23, 42, 0.35);
      border: 1px solid ${this.isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.2)'};
      display: flex;
      flex-direction: column;
      gap: 18px;
    `;

      const title = document.createElement('div');
      title.textContent = 'ChocoDrop サーバーに接続できません';
      title.style.cssText = `
      font-size: 18px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
    `;

      const titleIcon = document.createElement('span');
      titleIcon.textContent = '🔌';
      title.prepend(titleIcon);

      const message = document.createElement('p');
      message.style.cssText = `
      margin: 0;
      line-height: 1.6;
      font-size: 14px;
    `;
      message.textContent = 'ローカルで起動している ChocoDrop サーバー（Express）に接続できません。ターミナルで `npm run dev` を実行し、サーバーが起動していることを確認してください。';

      const detail = document.createElement('pre');
      detail.style.cssText = `
      margin: 0;
      padding: 12px;
      background: ${this.isDarkMode ? 'rgba(30, 41, 59, 0.6)' : 'rgba(15, 23, 42, 0.05)'};
      border-radius: 10px;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
      color: ${this.isDarkMode ? '#94a3b8' : '#475569'};
      border: 1px dashed ${this.isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.35)'};
    `;
      detail.textContent = '';

      const buttonRow = document.createElement('div');
      buttonRow.style.cssText = `
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    `;

      const dismissButton = document.createElement('button');
      dismissButton.textContent = '閉じる';
      dismissButton.style.cssText = this.getSecondaryButtonStyles();
      dismissButton.addEventListener('click', () => {
        this.hideServerHealthModal();
      });

      const retryButton = document.createElement('button');
      retryButton.textContent = '再接続を試す';
      retryButton.style.cssText = this.getPrimaryButtonStyles();
      retryButton.addEventListener('click', () => {
        this.performServerHealthCheck({ reason: 'manual', showModalOnFail: true });
      });

      buttonRow.appendChild(dismissButton);
      buttonRow.appendChild(retryButton);

      modal.appendChild(title);
      modal.appendChild(message);
      modal.appendChild(detail);
      modal.appendChild(buttonRow);

      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);

      this.serverHealthBackdrop = backdrop;
      this.serverHealthModal = modal;
      this.serverHealthMessage = message;
      this.serverHealthDetail = detail;
      this.serverHealthRetryButton = retryButton;
    }

    getPrimaryButtonStyles() {
      return `
      padding: 10px 16px;
      border-radius: 10px;
      border: none;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: #ffffff;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      box-shadow: 0 10px 25px rgba(99, 102, 241, 0.35);
    `;
    }

    getSecondaryButtonStyles() {
      return `
      padding: 10px 16px;
      border-radius: 10px;
      border: 1px solid ${this.isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(71, 85, 105, 0.3)'};
      background: transparent;
      color: ${this.isDarkMode ? '#cbd5f5' : '#1f2937'};
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s ease, background 0.2s ease;
    `;
    }

    showServerHealthModal(error) {
      if (this.config.enableServerHealthCheck === false) {
        return;
      }

      this.ensureServerHealthModal();

      if (this.serverHealthBackdrop) {
        this.serverHealthBackdrop.style.display = 'flex';
      }

      if (this.serverHealthDetail) {
        const message = error?.message || 'サーバーに接続できません。';
        this.serverHealthDetail.textContent = message;
      }
    }

    hideServerHealthModal() {
      if (this.serverHealthBackdrop) {
        this.serverHealthBackdrop.style.display = 'none';
      }
    }

    showMcpConfigNotice(error) {
      if (this.mcpNoticeShown) {
        return;
      }
      this.mcpNoticeShown = true;

      const message = error?.message || 'MCP 設定が見つかりません。config.json の設定を確認してください。';
      const guidance = '⚙️ MCP 設定が必要です: docs/SETUP.md を参照し、config.json の mcp セクションまたは MCP_CONFIG_PATH 環境変数を設定してください。';
      this.showInputFeedback('AI生成サーバー (MCP) が未設定です。設定が完了するまで生成を実行できません。', 'error');
      this.addOutput(`${guidance}\nサーバーからのメッセージ: ${message}`, 'error');
    }

    /**
     * タスクカードスタイル取得
     */
    getTaskCardStyles(status) {
      const baseStyles = `
      background: ${this.isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.15)'};
      border: 1px solid ${this.isDarkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.25)'};
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 12px;
      backdrop-filter: blur(12px);
      transition: all 0.3s ease;
      animation: slideInUp 0.3s ease-out;
    `;

      const statusBorders = {
        pending: 'rgba(167, 139, 250, 0.3)',     // 薄紫
        processing: 'rgba(192, 132, 252, 0.5)',  // 紫（強調）
        progress: 'rgba(236, 72, 153, 0.4)',     // ピンク
        completed: 'rgba(167, 139, 250, 0.4)',   // 紫
        error: 'rgba(239, 68, 68, 0.4)'          // 赤
      };

      return baseStyles + `border-left: 3px solid ${statusBorders[status] || statusBorders.pending};`;
    }

    /**
     * フローティングカードスタイル（iOS 26 Liquid Glass + 2026年トレンド）
     */
    getFloatingCardStyles(status) {
      // 2025年Glassmorphism仕様：フローティングタスクカード
      const glassmorphismDark = {
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.75), rgba(30, 27, 75, 0.7))',
        border: '1px solid rgba(99, 102, 241, 0.25)',
        boxShadow: '0 8px 32px rgba(15, 23, 42, 0.3), 0 0 0 1px rgba(99, 102, 241, 0.1)',
        color: '#ffffff'
      };

      const glassmorphismLight = {
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.35), rgba(255, 255, 255, 0.25))',
        border: '1px solid rgba(255, 255, 255, 0.4)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(255, 255, 255, 0.2)',
        color: '#1f2937'
      };

      const theme = this.isDarkMode ? glassmorphismDark : glassmorphismLight;
      
      // 2025年トレンド: 待機中のシマーエフェクト
      const shimmerEffect = (status === 'pending' || status === 'processing' || status === 'progress') ? `
      position: relative;
      overflow: hidden;
      &::before {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(
          90deg,
          transparent,
          ${this.isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.4)'},
          transparent
        );
        animation: shimmer 2s infinite;
      }
    ` : '';

      // 2025年トレンド: 微細な浮遊感
      const floatingAnimation = (status === 'pending' || status === 'processing' || status === 'progress') ? `
      animation: gentleFloat 4s ease-in-out infinite, shimmer 2s infinite;
    ` : '';

      return `
      height: 36px;
      padding: 0 18px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: ${theme.background};
      backdrop-filter: blur(24px) saturate(180%);
      -webkit-backdrop-filter: blur(24px) saturate(180%);
      border: ${theme.border};
      border-radius: 18px;
      color: ${theme.color};
      pointer-events: auto;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', sans-serif;
      font-weight: 600;
      font-size: 13px;
      letter-spacing: 0.01em;
      box-shadow: ${theme.boxShadow};
      transform: translateY(10px);
      opacity: 0;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      ${shimmerEffect}
      ${floatingAnimation}
      position: relative;
      overflow: hidden;
    `;
    }

    /**
     * カード表示制限を適用（最大3個まで表示、それ以上は「+ N」で表示）
     */
    updateCardDisplayLimit() {
      const maxVisibleCards = 3;
      const allCards = Array.from(this.floatingContainer.children).filter(child => 
        !child.classList.contains('overflow-counter')
      );
      
      // 既存のカウンターを削除
      const existingCounter = this.floatingContainer.querySelector('.overflow-counter');
      if (existingCounter) {
        existingCounter.remove();
      }
      
      if (allCards.length <= maxVisibleCards) {
        // カードが3個以下の場合、すべて表示
        allCards.forEach(card => {
          card.style.display = 'flex';
        });
      } else {
        // カードが4個以上の場合、最新3個のみ表示し、残りはカウンター表示
        allCards.slice(0, maxVisibleCards); // 最初の3個（最新）
        const hiddenCount = allCards.length - maxVisibleCards;
        
        // 古いカードを非表示
        allCards.forEach((card, index) => {
          if (index < maxVisibleCards) {
            card.style.display = 'flex';
          } else {
            card.style.display = 'none';
          }
        });
        
        // 「+ N」カウンターを作成
        const counter = document.createElement('div');
        counter.className = 'overflow-counter';
        // テーマに応じたカウンタースタイル
        const counterBaseColor = this.isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.12)';
        const counterBorderColor = this.isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.15)';
        const counterTextColor = this.isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)';
        
        counter.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 8px 12px;
        margin: 4px 0;
        background: ${counterBaseColor};
        backdrop-filter: blur(20px);
        border-radius: 12px;
        border: 1px solid ${counterBorderColor};
        font-size: 12px;
        color: ${counterTextColor};
        font-weight: 500;
        min-height: 32px;
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        cursor: pointer;
      `;
        counter.innerHTML = `+ ${hiddenCount}`;
        
        // カウンターを最後に挿入（最下部に配置）
        this.floatingContainer.appendChild(counter);
        
        // カウンターのホバー効果（テーマ対応）
        const counterHoverColor = this.isDarkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.18)';
        
        counter.addEventListener('mouseenter', () => {
          counter.style.background = counterHoverColor;
          counter.style.transform = 'scale(1.05)';
        });
        
        counter.addEventListener('mouseleave', () => {
          counter.style.background = counterBaseColor;
          counter.style.transform = 'scale(1)';
        });
      }
    }

    /**
     * カードに詳細モーダル用のイベントリスナーを追加
     */
    addCardDetailEvents(card, taskId) {
      // タッチデバイス検出
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      
      if (isTouchDevice) {
        // モバイル/タブレット: タップで詳細表示
        card.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.showTaskDetailModal(taskId);
        });
      } else {
        // デスクトップ: ホバーで詳細表示
        let hoverTimeout;
        
        card.addEventListener('mouseenter', () => {
          hoverTimeout = setTimeout(() => {
            this.showTaskDetailModal(taskId);
          }, 800); // 0.8秒ホバーで表示
        });
        
        card.addEventListener('mouseleave', () => {
          if (hoverTimeout) {
            clearTimeout(hoverTimeout);
          }
        });
        
        // クリックでも表示（デスクトップでも使いやすく）
        card.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.showTaskDetailModal(taskId);
        });
      }
    }

    /**
     * タスク詳細モーダルを表示
     */
    showTaskDetailModal(taskId) {
      const taskData = this.taskCards.get(taskId);
      if (!taskData) return;
      
      // 既存のモーダルを削除
      const existingModal = document.querySelector('.task-detail-modal');
      if (existingModal) {
        existingModal.remove();
      }
      
      // モーダル作成
      const modal = this.createTaskDetailModal(taskData);
      document.body.appendChild(modal);
      
      // 入場アニメーション
      requestAnimationFrame(() => {
        modal.style.opacity = '1';
        modal.querySelector('.modal-content').style.transform = 'translateY(0) scale(1)';
      });
    }

    /**
     * タスク詳細モーダルのHTML要素を作成
     */
    createTaskDetailModal(taskData) {
      const modal = document.createElement('div');
      modal.className = 'task-detail-modal';
      
      // テーマに応じたスタイル
      const overlayColor = this.isDarkMode ? 'rgba(0, 0, 0, 0.6)' : 'rgba(0, 0, 0, 0.4)';
      const modalBg = this.isDarkMode ? 'rgba(20, 20, 20, 0.95)' : 'rgba(255, 255, 255, 0.95)';
      const modalBorder = this.isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
      const textColor = this.isDarkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.9)';
      const labelColor = this.isDarkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)';
      
      modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: ${overlayColor};
      backdrop-filter: blur(10px);
      z-index: 100000;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      cursor: pointer;
    `;
      
      // 実行時間計算
      const duration = taskData.endTime 
        ? ((taskData.endTime - taskData.startTime) / 1000).toFixed(1)
        : ((Date.now() - taskData.startTime) / 1000).toFixed(1);
      
      // ステータス表示
      const statusText = taskData.status === 'pending' ? '待機中' 
                      : taskData.status === 'in-progress' ? '実行中' 
                      : taskData.status === 'completed' ? '完了' 
                      : 'エラー';
      
      const modalContent = document.createElement('div');
      modalContent.className = 'modal-content';
      modalContent.style.cssText = `
      background: ${modalBg};
      backdrop-filter: blur(30px);
      border: 1px solid ${modalBorder};
      border-radius: 16px;
      padding: 16px !important;
      max-width: 400px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      transform: translateY(20px) scale(0.95);
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      cursor: default;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    `;
      
      modalContent.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
        <h3 style="margin: 0; color: ${textColor}; font-size: 14px; font-weight: 600;">タスク詳細</h3>
        <button class="close-btn" style="
          background: none;
          border: none;
          font-size: 24px;
          color: ${labelColor};
          cursor: pointer;
          padding: 0;
          line-height: 1;
          transition: color 0.2s;
        ">×</button>
      </div>
      
      <div style="space-y: 16px;">
        <div>
          <div style="color: ${labelColor}; font-size: 12px; font-weight: 500; margin-bottom: 0;">📝 元のプロンプト</div>
          <div style="color: ${textColor}; font-size: 14px; line-height: 1.4;">${taskData.originalPrompt}</div>
        </div>
        
        <div>
          <div style="color: ${labelColor}; font-size: 12px; font-weight: 500; margin-bottom: 0;">📊 ステータス</div>
          <div style="color: ${textColor}; font-size: 14px;">${statusText}</div>
        </div>
        
        <div>
          <div style="color: ${labelColor}; font-size: 12px; font-weight: 500; margin-bottom: 0;">⏱️ 実行時間</div>
          <div style="color: ${textColor}; font-size: 14px;">${duration}秒</div>
        </div>
        
        ${taskData.error ? `
        <div>
          <div style="color: ${labelColor}; font-size: 12px; font-weight: 500; margin-bottom: 0;">❌ エラー詳細</div>
          <div style="color: #ef4444; font-size: 14px; line-height: 1.4;">${taskData.error}</div>
        </div>
        ` : ''}
        
        <div>
          <div style="color: ${labelColor}; font-size: 12px; font-weight: 500; margin-bottom: 0;">🎨 コンテンツタイプ</div>
          <div style="color: ${textColor}; font-size: 14px;">${taskData.contentType || '画像'}</div>
        </div>
      </div>
    `;
      
      // イベントリスナー
      modalContent.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      
      const closeBtn = modalContent.querySelector('.close-btn');
      closeBtn.addEventListener('click', () => {
        this.closeTaskDetailModal(modal);
      });
      
      closeBtn.addEventListener('mouseenter', () => {
        closeBtn.style.color = textColor;
      });
      
      closeBtn.addEventListener('mouseleave', () => {
        closeBtn.style.color = labelColor;
      });
      
      modal.addEventListener('click', () => {
        this.closeTaskDetailModal(modal);
      });
      
      modal.appendChild(modalContent);
      return modal;
    }

    /**
     * タスク詳細モーダルを閉じる
     */
    closeTaskDetailModal(modal) {
      modal.style.opacity = '0';
      modal.querySelector('.modal-content').style.transform = 'translateY(20px) scale(0.95)';
      
      setTimeout(() => {
        if (modal.parentNode) {
          modal.parentNode.removeChild(modal);
        }
      }, 300);
    }

    /**
     * カード入場アニメーション（2026年トレンド + iOS 26 Liquid Glass）
     */
    animateCardEntrance(card) {
      // iOS 26 Liquid Glass 入場エフェクト
      card.style.transform = 'translateY(20px) scale(0.95)';
      card.style.opacity = '0';
      card.style.filter = 'blur(4px)';

      requestAnimationFrame(() => {
        card.style.transition = 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)';
        card.style.transform = 'translateY(0) scale(1)';
        card.style.opacity = '1';
        card.style.filter = 'blur(0px)';

        // 2026年トレンド: 微細な光る効果
        card.style.boxShadow = '0 4px 20px rgba(255, 255, 255, 0.1), 0 0 40px rgba(255, 255, 255, 0.05)';
      });
    }

    /**
     * 成功時アニメーション + 自動消去（iOS 26 Liquid Glass）
     */
    animateCardSuccess(card, taskId) {
      // iOS 26 Liquid Glass 成功エフェクト
      card.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
      card.style.borderColor = 'rgba(76, 175, 80, 0.6)';
      card.style.transform = 'scale(1.08)';
      card.style.boxShadow = '0 8px 32px rgba(76, 175, 80, 0.4), 0 0 60px rgba(76, 175, 80, 0.2)';
      card.style.filter = 'brightness(1.1) saturate(1.2)';

      // 2026年トレンド: 流体的な戻りアニメーション
      setTimeout(() => {
        card.style.transform = 'scale(1.02)';
        card.style.filter = 'brightness(1.05) saturate(1.1)';
      }, 150);

      // Liquid Glass風のスムーズなフェードアウト（2秒後に自動削除）
      setTimeout(() => {
        this.animateCardExit(card, taskId);
      }, 2000);
    }

    /**
     * エラー時アニメーション（2026年トレンド UX）
     */
    animateCardError(card, taskId) {
      // iOS 26 Liquid Glass エラーエフェクト
      card.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
      card.style.borderColor = 'rgba(244, 67, 54, 0.7)';
      card.style.boxShadow = '0 8px 32px rgba(244, 67, 54, 0.3), 0 0 60px rgba(244, 67, 54, 0.15)';
      card.style.filter = 'saturate(1.3) brightness(1.1)';

      // 2026年トレンド: より自然なpulseアニメーション（shakeより洗練）
      card.style.animation = 'errorPulse 0.6s cubic-bezier(0.16, 1, 0.3, 1) 2';

      // UX改善: エラー内容を表示するツールチップ風UI
      this.addErrorTooltip(card, taskId);

      // エラーは手動で消すまで表示継続（クリックで消去）
      card.style.cursor = 'pointer';
      card.onclick = () => this.animateCardExit(card, taskId);

      // 5秒後に自動フェードアウト（UX改善）
      setTimeout(() => {
        if (this.taskCards.has(taskId)) {
          this.animateCardExit(card, taskId);
        }
      }, 5000);
    }

    /**
     * エラー時のツールチップ表示（UX改善）
     */
    addErrorTooltip(card, taskId) {
      const taskData = this.taskCards.get(taskId);
      if (!taskData || !taskData.error) return;

      // ツールチップ要素作成
      const tooltip = document.createElement('div');
      tooltip.style.cssText = `
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(244, 67, 54, 0.95);
      color: white;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 11px;
      white-space: nowrap;
      pointer-events: none;
      z-index: 1001;
      backdrop-filter: blur(10px);
      margin-bottom: 0;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;
      tooltip.textContent = taskData.error;

      card.style.position = 'relative';
      card.appendChild(tooltip);

      // フェードイン
      requestAnimationFrame(() => {
        tooltip.style.opacity = '1';
      });

      // 3秒後にフェードアウト
      setTimeout(() => {
        if (tooltip.parentNode) {
          tooltip.style.opacity = '0';
          setTimeout(() => {
            if (tooltip.parentNode) {
              tooltip.parentNode.removeChild(tooltip);
            }
          }, 300);
        }
      }, 3000);
    }

    /**
     * カード退場アニメーション（2026年トレンド + iOS 26 Liquid Glass）
     */
    animateCardExit(card, taskId) {
      // iOS 26 Liquid Glass 退場エフェクト - 2026年トレンドの「スッと消える」
      card.style.transition = 'all 0.28s cubic-bezier(0.4, 0, 0.2, 1)';
      card.style.transform = 'translateY(-12px) scale(0.92)';
      card.style.opacity = '0';
      card.style.filter = 'blur(6px) brightness(1.2)';

      // 2026年トレンド: 消去時の微細な光の拡散効果
      card.style.boxShadow = '0 0 40px rgba(255, 255, 255, 0.3), 0 0 80px rgba(255, 255, 255, 0.1)';

      setTimeout(() => {
        if (card.parentNode) {
          card.parentNode.removeChild(card);
        }
        this.taskCards.delete(taskId);
        // カード削除後に表示制限を再適用
        this.updateCardDisplayLimit();
      }, 280);
    }

    /**
     * ユーザーの表現スタイルを自然に感知
     */
    getResponseType(prompt) {
      // ユーザーの表現スタイルを自然に感知
      if (/ちょこっと|ちょこん|少し|軽く/.test(prompt) || prompt.length < 15) {
        return 'casual';
      }
      if (/美しい|幻想|素敵|魔法|世界|綺麗/.test(prompt)) {
        return 'magical';
      }
      return 'balanced'; // 80%がここに該当
    }

    /**
     * 温かみのあるメッセージを生成（マーケ提案ベース）
     */
    getFriendlyMessage(status, prompt, errorMessage = null) {
      const shortPrompt = prompt.length > 15 ? prompt.substring(0, 15) + '...' : prompt;

      // 自然な応答システム適用
      const responseType = this.getResponseType(prompt);

      switch (status) {
        case 'pending':
          return responseType === 'casual' ? 'ちょこっと準備中です...' :
                 responseType === 'magical' ? '魔法をかけようとしています...' :
                 'ちょこっと魔法の準備中...';
        case 'processing':
        case 'in-progress':
        case 'progress':
          // Modify mode specific messages for processing
          if (this.currentMode === 'modify') {
            return responseType === 'casual' ? 'ちょこっと調整中です...' :
                   responseType === 'magical' ? 'イメージを変化させています...' :
                   'ちょこんと編集中です...';
          }
          return responseType === 'casual' ? 'ちょこんと配置中です...' :
                 responseType === 'magical' ? 'あなたの想いを形にしています...' :
                 'ちょこっと魔法をかけています...';
        case 'completed':
          // Delete mode specific messages
          if (this.currentMode === 'delete') {
            return responseType === 'casual' ? 'ちょこっと削除しました！' :
                   responseType === 'magical' ? 'すっきりと片付きました！' :
                   'ちょこんと削除完了！すっきりですね！';
          }
          // Modify mode specific messages
          if (this.currentMode === 'modify') {
            return responseType === 'casual' ? 'ちょこっと調整しました！' :
                   responseType === 'magical' ? '素敵に変身しました！' :
                   'ちょこんと編集完了！いい感じですね！';
          }
          // Default completion messages for other modes
          return responseType === 'casual' ? 'ちょこっとドロップしました！' :
                 responseType === 'magical' ? '素敵な世界が完成しました！' :
                 'ちょこんと配置完了！素敵ですね！';
        case 'error':
          // エラー理由があれば含める
          if (errorMessage) {
            const shortError = errorMessage.length > 30 ? errorMessage.substring(0, 30) + '...' : errorMessage;
            return `❌ ${shortError}`;
          }
          return responseType === 'casual' ? 'おっと、エラーが発生しました' :
                 responseType === 'magical' ? '申し訳ございません、処理に失敗しました' :
                 'エラーが発生しました。もう一度お試しください';
        default:
          return shortPrompt;
      }
    }

    /**
     * ステータス色取得
     */
    getStatusColor(status) {
      // ネオンパープル/ピンク系で統一（2025トレンド）
      const colors = {
        pending: this.isDarkMode ? '#a78bfa' : '#7c3aed',        // 薄紫
        processing: this.isDarkMode ? '#c084fc' : '#9333ea',     // 紫（生成中）
        progress: this.isDarkMode ? '#ec4899' : '#be185d',       // ピンク
        completed: this.isDarkMode ? '#a78bfa' : '#7c3aed',      // 紫（完了も統一）
        error: this.isDarkMode ? '#f87171' : '#dc2626'           // 赤（エラーのみ）
      };
      return colors[status] || colors.pending;
    }

    /**
     * ステータスインジケーター作成（パーセント表示なし）
     */
    createStatusIndicator(status) {
      if (status === 'processing' || status === 'progress') {
        return `
        <div class="status-indicator" style="
          background: ${this.isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'};
          border-radius: 8px;
          height: 4px;
          overflow: hidden;
          margin-top: 8px;
          position: relative;
        ">
          <div class="status-pulse" style="
            background: linear-gradient(90deg, transparent, ${this.isWabiSabiMode ? '#8BC34A, #689F38' : '#6366f1, #8b5cf6'}, transparent);
            height: 100%;
            width: 30%;
            border-radius: 8px;
            animation: statusPulse 1.8s ease-in-out infinite;
          "></div>
        </div>
        <div style="display: flex; align-items: center; gap: 4px; margin-top: 8px;">
          <div class="status-dots" style="font-size: 10px; color: ${this.isDarkMode ? '#c084fc' : '#9333ea'};">
            処理中<span style="animation: dots 1.5s infinite;">...</span>
          </div>
        </div>
      `;
      }
      return '';
    }

    /**
     * タスク完了アニメーション
     */
    animateTaskCompletion(card) {
      // 控えめなサクセスアニメーション
      card.style.animation = 'taskComplete 0.8s ease-out';

      // 微妙なパーティクル効果を追加（控えめ）
      this.addSubtleParticleEffect(card);

      setTimeout(() => {
        card.style.animation = '';
      }, 800);

      this.ensureTaskAnimations();
    }

    /**
     * 控えめなパーティクル効果
     */
    addSubtleParticleEffect(card) {
      const particles = 3; // 少ない数のパーティクル
      const rect = card.getBoundingClientRect();

      for (let i = 0; i < particles; i++) {
        const particle = document.createElement('div');
        particle.style.cssText = `
        position: fixed;
        width: 4px;
        height: 4px;
        background: linear-gradient(45deg, #a78bfa, #c084fc);
        border-radius: 50%;
        pointer-events: none;
        z-index: 9999;
        left: ${rect.right - 20}px;
        top: ${rect.top + 10}px;
        opacity: 0.8;
        transform: scale(0);
        animation: subtleParticle 1.2s ease-out forwards;
      `;

        // ランダムな方向に少し移動
        const angle = (i / particles) * Math.PI * 2;
        const distance = 15; // 控えめな距離
        particle.style.setProperty('--move-x', `${Math.cos(angle) * distance}px`);
        particle.style.setProperty('--move-y', `${Math.sin(angle) * distance}px`);

        document.body.appendChild(particle);

        // 自動削除
        setTimeout(() => particle.remove(), 1200);
      }
    }

    /**
     * タスクアニメーション用CSS確保
     */
    ensureTaskAnimations() {
      if (document.getElementById('task-animations')) return;

      const style = document.createElement('style');
      style.id = 'task-animations';
      style.textContent = `
      @keyframes slideInUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @keyframes taskComplete {
        0% {
          transform: scale(1);
          border-left-color: rgba(192, 132, 252, 0.5);
        }
        30% {
          transform: scale(1.01);
          background: rgba(167, 139, 250, 0.08);
          border-left-color: rgba(167, 139, 250, 0.6);
        }
        60% {
          background: rgba(167, 139, 250, 0.05);
        }
        100% {
          transform: scale(1);
          background: rgba(167, 139, 250, 0.02);
          border-left-color: rgba(167, 139, 250, 0.4);
        }
      }

      @keyframes subtleParticle {
        0% {
          transform: scale(0) translate(0, 0);
          opacity: 0.8;
        }
        20% {
          transform: scale(1) translate(0, 0);
          opacity: 1;
        }
        100% {
          transform: scale(0.3) translate(var(--move-x, 0), var(--move-y, 0));
          opacity: 0;
        }
      }

      @keyframes shimmer {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
      }

      @keyframes slideIn {
        from { opacity: 0; transform: translateX(-20px); }
        to { opacity: 1; transform: translateX(0); }
      }

      @keyframes statusPulse {
        0% { transform: translateX(-100%); }
        50% { transform: translateX(300%); }
        100% { transform: translateX(-100%); }
      }

      @keyframes dots {
        0%, 20% { opacity: 0; }
        50% { opacity: 1; }
        100% { opacity: 0; }
      }

      @keyframes errorPulse {
        0% {
          transform: scale(1);
          filter: saturate(1.3) brightness(1.1);
        }
        50% {
          transform: scale(1.03);
          filter: saturate(1.5) brightness(1.2);
          box-shadow: 0 12px 40px rgba(244, 67, 54, 0.4), 0 0 80px rgba(244, 67, 54, 0.2);
        }
        100% {
          transform: scale(1);
          filter: saturate(1.3) brightness(1.1);
        }
      }
    `;
      document.head.appendChild(style);
    }

    /**
     * プログレス付きタスクステータス表示（互換性のため）
     */
    addTaskStatus(message, percent = 0, taskId = null) {
      const id = taskId || `task_${Date.now()}`;
      return this.addTaskCard(message, {
        percent: Math.min(Math.max(percent, 0), 100),
        taskId: id,
        status: percent > 0 ? 'progress' : 'pending'
      });
    }

    /**
     * プログレス更新
     */
    updateTaskProgress(taskId, percent, newMessage = null) {
      const existingTask = this.output.querySelector(`[data-task-id="${taskId}"]`);
      if (existingTask && newMessage) {
        // 既存タスクを更新
        this.addOutput(newMessage, 'progress', { 
          percent: Math.min(Math.max(percent, 0), 100),
          taskId
        });
      }
    }

    /**
     * タスク完了（プログレスバー削除）
     */
    completeTask(taskId) {
      const existingTask = this.output.querySelector(`[data-task-id="${taskId}"]`);
      if (existingTask) {
        // 完了アニメーション
        existingTask.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        existingTask.style.opacity = '0';
        existingTask.style.transform = 'translateX(20px)';
        
        setTimeout(() => {
          if (existingTask.parentNode) {
            existingTask.remove();
          }
        }, 500);
      }
    }

    /**
     * SSE接続開始（リアルタイム進捗受信）
     */
    connectToProgress(serverTaskId, uiTaskId = null) {
      if (this.activeConnections.has(serverTaskId)) {
        return;
      }

      const eventSource = new EventSource(`/api/progress/${serverTaskId}`);
      this.activeConnections.set(serverTaskId, eventSource);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          data.uiTaskId = uiTaskId; // UI用タスクIDを追加
          this.handleProgressUpdate(data);
        } catch (error) {
          console.error('SSE data parse error:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE connection error:', error);
        this.disconnectProgress(serverTaskId);
      };
    }

    /**
     * 進捗更新処理
     */
    handleProgressUpdate(data) {
      switch (data.type) {
        case 'connected':
          this.logDebug(`🔗 Connected to progress stream: ${data.taskId}`);
          break;

        case 'progress':
          if (data.percent !== undefined && data.uiTaskId) {
            this.updateTaskCard(data.uiTaskId, 'progress', { percent: data.percent });
          }
          break;

        case 'completed':
          if (data.uiTaskId) {
            this.updateTaskCard(data.uiTaskId, 'completed');
          }
          this.disconnectProgress(data.taskId);
          break;

        case 'error':
          if (data.uiTaskId) {
            this.updateTaskCard(data.uiTaskId, 'error', { errorMessage: data.message });
          }
          this.addOutput(`❌ ${data.message}`, 'error');
          this.disconnectProgress(data.taskId);
          break;
      }
    }

    /**
     * SSE接続終了
     */
    disconnectProgress(taskId) {
      const connection = this.activeConnections.get(taskId);
      if (connection) {
        connection.close();
        this.activeConnections.delete(taskId);
      }
    }

    /**
     * 出力エリアを最下部にスクロール
     */
    scrollToBottom() {
      if (this.outputDiv) {
        this.outputDiv.scrollTop = this.outputDiv.scrollHeight;
      }
    }

    /**
     * モード別コマンドプレフィックス
     */
    getModePrefix(mode) {
      // サーバー側でモードを区別するためのプレフィックス
      const prefixes = {
        generate: '', // デフォルトは生成モード
        modify: '[変更] ',
        delete: '[削除] '
      };
      return prefixes[mode] || '';
    }

    /**
     * コマンド保存 (Undo/Redoシステム)
     */
    saveCommandToHistory(commandData) {
      // 現在のインデックス以降の履歴を削除（新しいコマンドが実行されたため）
      this.commandHistory = this.commandHistory.slice(0, this.currentHistoryIndex + 1);
      
      // 新しいコマンドを履歴に追加
      this.commandHistory.push(commandData);
      this.currentHistoryIndex = this.commandHistory.length - 1;
      
      // 最大コマンド保存数を超えた場合、古いコマンドを削除
      if (this.commandHistory.length > this.maxHistorySize) {
        this.commandHistory.shift();
        this.currentHistoryIndex--;
      }
      
      // ボタン状態を更新
      this.updateUndoRedoButtons();
    }

    /**
     * Undo実行
     */
    undo() {
      if (!this.canUndo()) {
        this.addOutput('↶ Undoできる操作がありません', 'hint');
        return;
      }
      
      const command = this.commandHistory[this.currentHistoryIndex];
      this.currentHistoryIndex--;
      
      // Undoの逆操作を実行（簡易実装）
      if (command.mode === 'generate') {
        this.addOutput(`↶ Undo: "${command.command}" の生成を取り消しました`, 'system');
        // 実際のシーン管理では最後に作成されたオブジェクトを削除
        if (this.sceneManager && this.sceneManager.undoLastGenerate) {
          this.sceneManager.undoLastGenerate();
        }
      } else if (command.mode === 'modify') {
        this.addOutput(`↶ Undo: "${command.command}" の変更を取り消しました`, 'system');
        // 実際のシーン管理では前の状態に戻す
        if (this.sceneManager && this.sceneManager.undoLastModify) {
          this.sceneManager.undoLastModify();
        }
      } else if (command.mode === 'delete') {
        this.addOutput(`↶ Undo: "${command.command}" の削除を取り消しました`, 'system');
        // 実際のシーン管理では削除されたオブジェクトを復元
        if (this.sceneManager && this.sceneManager.undoLastDelete) {
          this.sceneManager.undoLastDelete();
        }
      }
      
      this.updateUndoRedoButtons();
    }

    /**
     * Redo実行
     */
    redo() {
      if (!this.canRedo()) {
        this.addOutput('↷ Redoできる操作がありません', 'hint');
        return;
      }
      
      this.currentHistoryIndex++;
      const command = this.commandHistory[this.currentHistoryIndex];
      
      // Redoでコマンドを再実行
      this.addOutput(`↷ Redo: "${command.command}" を再実行しました`, 'system');
      
      // 実際のシーン管理でのRedo処理
      if (this.sceneManager && this.sceneManager.redoCommand) {
        this.sceneManager.redoCommand(command);
      }
      
      this.updateUndoRedoButtons();
    }

    /**
     * Undoが可能かチェック
     */
    canUndo() {
      return this.currentHistoryIndex >= 0;
    }

    /**
     * Redoが可能かチェック
     */
    canRedo() {
      return this.currentHistoryIndex < this.commandHistory.length - 1;
    }

    /**
     * Undo/Redoボタンの状態更新
     */
    updateUndoRedoButtons() {
      if (this.undoBtn) {
        this.undoBtn.disabled = !this.canUndo();
        this.undoBtn.style.opacity = this.canUndo() ? '1' : '0.4';
        this.undoBtn.style.cursor = this.canUndo() ? 'pointer' : 'not-allowed';
      }
      
      if (this.redoBtn) {
        this.redoBtn.disabled = !this.canRedo();
        this.redoBtn.style.opacity = this.canRedo() ? '1' : '0.4';
        this.redoBtn.style.cursor = this.canRedo() ? 'pointer' : 'not-allowed';
      }
    }

    /**
     * 確認付き全オブジェクト削除
     */
    async clearAllWithConfirmation() {
      const confirmed = await this.showClearAllConfirmation();
      if (confirmed) {
        this.clearAll();
      }
    }

    /**
     * Clear All確認ダイアログ
     */
    async showClearAllConfirmation() {
      return this.showConfirmationDialog({
        icon: '🧹',
        title: 'Clear All の確認',
        message: 'すべてのオブジェクトが削除されます。<br>この操作は取り消すことができません。',
        confirmText: 'Clear All 実行',
        cancelText: 'キャンセル',
        confirmColor: this.isWabiSabiMode ? '#8BC34A' : '#6366f1'
      });
    }

    /**
     * モーダルクローズアニメーション
     */
    closeModalWithAnimation(modal) {
      const dialog = modal.querySelector('div:last-child');
      dialog.style.transform = 'scale(0.9)';
      dialog.style.opacity = '0';
      modal.style.opacity = '0';
      
      setTimeout(() => {
        if (modal.parentElement) {
          document.body.removeChild(modal);
        }
      }, 200);
    }

    /**
     * 全オブジェクト削除
     */
    clearAll() {
      if (this.sceneManager) {
        this.sceneManager.clearAll();
        this.addOutput('🧹 全ての実験オブジェクトを削除しました', 'system');
      } else if (this.client) {
        // サーバー側での削除は未実装
        this.addOutput('⚠️ サーバー側削除は未実装', 'error');
      }
    }

    // showHistory() メソッド完全削除済み

    /**
     * 利用可能なコマンド例を表示
     */
    showExamples() {
      const examples = [
        '右上にドラゴンを作って',
        '中央に大きなユニコーンを生成',
        '左下に小さな桜を作って',
        '空に鳳凰を作って',
        '地面に神社を作って'
      ];

      this.addOutput('💡 コマンド例:', 'system');
      examples.forEach(example => {
        this.addOutput(`   "${example}"`, 'hint');
      });
    }

    /**
     * SceneManager設定
     */
    setSceneManager(sceneManager) {
      this.sceneManager = sceneManager;
      this.applyServiceSelectionToSceneManager();
      this.initializeScenePersistence();
    }

    /**
     * Client設定
     */
    setClient(client) {
      this.client = client;
    }

    /**
     * 設定更新
     */
    updateConfig(newConfig) {
      this.config = { ...this.config, ...newConfig };
      // 必要に応じてUIを更新
      if (newConfig.activationKey) {
        // 新しいキーバインドを反映するため、イベントリスナーを再設定
        this.bindEvents();
      }
    }

    /**
     * クリーンアップ
     */
    /**
     * スタイル再適用
     */
    refreshStyles() {
      // Generateモードボタンのスタイルを再適用
      const generateBtn = this.container?.querySelector('[data-mode="generate"]');
      if (generateBtn) {
        generateBtn.style.cssText = this.getModeButtonStyles(true, 'generate');
      }

      // Executeボタンのスタイルを再適用
      const executeBtn = this.container?.querySelector('#execute-btn');
      if (executeBtn) {
        executeBtn.style.cssText = this.getModernButtonStyles('primary');
      }

      if (this.onboardingLauncherButton) {
        this.onboardingLauncherButton.style.background = this.isDarkMode
          ? 'rgba(255, 255, 255, 0.12)'
          : 'rgba(0, 0, 0, 0.06)';
        this.onboardingLauncherButton.style.color = this.isDarkMode ? '#f8fafc' : '#1f2937';
        this.onboardingLauncherButton.style.border = this.isDarkMode
          ? '1px solid rgba(255, 255, 255, 0.28)'
          : '1px solid rgba(15, 23, 42, 0.18)';
      }

      // サービスモーダルの背景とスタイルを更新
      if (this.serviceModal) {
        this.updateServiceModalStyles();
      }

      if (this.saveButton) {
        this.saveButton.style.cssText = this.getActionButtonStyles('icon');
        this.updateSaveButtonState();
      }
      if (this.loadButton) {
        this.loadButton.style.cssText = this.getActionButtonStyles('icon');
      }
      if (this.clearBtn) {
        this.clearBtn.style.cssText = this.getActionButtonStyles('icon');
      }
      if (this.historyBtn) {
        this.historyBtn.style.cssText = this.getActionButtonStyles('icon');
        this.historyBtn.style.opacity = '0.5';
      }
      if (this.themeToggle) {
        this.themeToggle.style.cssText = this.getActionButtonStyles('icon');
      }
      if (this.settingsButton) {
        this.settingsButton.style.cssText = this.getActionButtonStyles('icon');
      }

      // サービスセレクターテーマ更新
      this.updateServiceSelectorTheme();
    }

    updateServiceModalStyles() {
      if (!this.serviceModal) return;

      // モーダルの背景とボーダーを更新（枯山水の静寂）
      this.serviceModal.style.background = this.isWabiSabiMode
        ? 'linear-gradient(135deg, rgba(158, 158, 158, 0.4), rgba(189, 189, 189, 0.35))'
        : (this.isDarkMode
          ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.85), rgba(30, 27, 75, 0.8))'
          : 'linear-gradient(135deg, rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0.3))');

      this.serviceModal.style.border = this.isWabiSabiMode
        ? '1px solid rgba(141, 110, 99, 0.4)'
        : (this.isDarkMode
          ? '1px solid rgba(99, 102, 241, 0.3)'
          : '1px solid rgba(255, 255, 255, 0.5)');

      this.serviceModal.style.color = this.isWabiSabiMode
        ? '#424242'
        : (this.isDarkMode ? '#ffffff' : '#1f2937');

      this.serviceModal.style.boxShadow = this.isWabiSabiMode
        ? '0 20px 40px rgba(93, 64, 55, 0.35)'
        : '0 20px 40px rgba(15, 23, 42, 0.35)';
    }

    /**
     * テーマ切り替え
     */
    toggleTheme() {
      // 3段階サイクル: light → dark → wabisabi → light
      switch (this.currentTheme) {
        case 'light':
          this.currentTheme = 'dark';
          break;
        case 'dark':
          this.currentTheme = 'wabisabi';
          break;
        case 'wabisabi':
          this.currentTheme = 'light';
          break;
        default:
          this.currentTheme = 'light';
      }

      // 状態更新
      this.isDarkMode = this.currentTheme === 'dark';
      this.isWabiSabiMode = this.currentTheme === 'wabisabi';
      localStorage.setItem('live-command-theme', this.currentTheme);

      // アイコンボタン更新
      if (this.themeToggle) {
        const themeConfig = {
          light: { icon: '🌙', title: 'ダークモードに切り替え' },
          dark: { icon: '🍵', title: '侘び寂びモードに切り替え' },
          wabisabi: { icon: '☀️', title: 'ライトモードに切り替え' }
        };

        const config = themeConfig[this.currentTheme];
        // 太陽は黄色く、お茶は緑系、月は紫系フィルター
        if (config.icon === '☀️') {
          this.themeToggle.innerHTML = `<span style="filter: saturate(1.2) brightness(1.1);">${config.icon}</span>`;
        } else if (config.icon === '🍵') {
          this.themeToggle.innerHTML = `<span style="filter: hue-rotate(80deg) saturate(1.1) brightness(1.0);">${config.icon}</span>`;
        } else {
          this.themeToggle.innerHTML = `<span style="filter: hue-rotate(240deg) saturate(0.8) brightness(1.1);">${config.icon}</span>`;
        }
        this.themeToggle.title = config.title;
      }

      // 全スタイル再適用
      this.applyTheme();

      // テーマ切り替え完了（履歴には出力しない）
    }

    /**
     * テーマ適用
     */
    applyTheme() {
      // ボディにテーマクラスを設定
      document.body.className = this.isWabiSabiMode ? 'wabisabi-mode' : (this.isDarkMode ? 'dark-mode' : 'light-mode');

      // メインコンテナ（display状態を保持）
      const currentDisplay = this.container.style.display;
      const currentFlexDirection = this.container.style.flexDirection;
      this.container.style.cssText = this.getContainerStyles();
      this.container.style.display = currentDisplay || 'flex';
      this.container.style.flexDirection = currentFlexDirection || 'column';

      // フローティングブランドバッジのテーマ再適用
      const brandBadge = this.container.querySelector('.floating-brand-badge');
      if (brandBadge) {
        brandBadge.style.background = this.isDarkMode 
          ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.8), rgba(139, 92, 246, 0.7))'
          : 'linear-gradient(135deg, rgba(99, 102, 241, 0.9), rgba(139, 92, 246, 0.8))';
        brandBadge.style.border = `1px solid ${this.isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.4)'}`;
      }

      // 入力フィールド
      const hadHighlight = !!this.highlightOverlay;
      this.inputDefaultStyles = null;
      this.clearKeywordHighlighting();
      this.input.style.cssText = this.getInputStyles();
      this.captureInputDefaultStyles();
      if (hadHighlight || (this.input && this.input.value.trim())) {
        this.applyKeywordHighlighting();
      }

      // スタイル適用
      this.output.style.cssText = this.getOutputStyles();

      // ラジオボタンモードセレクターの2025年仕様テーマ再適用
      if (this.radioModeContainer) {
        this.radioModeContainer.style.background = this.isWabiSabiMode
          ? 'linear-gradient(135deg, rgba(97, 97, 97, 0.7), rgba(66, 66, 66, 0.6))'
          : (this.isDarkMode
            ? 'linear-gradient(135deg, rgba(30, 27, 75, 0.3), rgba(15, 23, 42, 0.4))'
            : 'linear-gradient(135deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.1))');
        this.radioModeContainer.style.borderColor = this.isWabiSabiMode
          ? 'rgba(93, 64, 55, 0.4)'
          : (this.isDarkMode
            ? 'rgba(99, 102, 241, 0.15)'
            : 'rgba(255, 255, 255, 0.25)');

        // 各ラジオボタンのスタイル更新
        Object.keys(this.radioModeButtons).forEach(key => {
          const { button } = this.radioModeButtons[key];
          if (this.currentMode !== key) {
            button.style.color = this.isWabiSabiMode
              ? 'rgba(245, 245, 245, 0.8)'
              : (this.isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(55, 65, 81, 0.8)');
            button.style.background = 'transparent';
            button.style.border = '1px solid transparent';
            button.style.boxShadow = 'none';
          }
        });

        // 現在選択されているモードのスタイルも更新
        this.selectMode(this.currentMode, false);
      }

      // アクションボタンのテーマ再適用
      if (this.saveButton) {
        this.saveButton.style.cssText = this.getActionButtonStyles('primary');
        this.updateSaveButtonState();
      }
      if (this.clearBtn) {
        this.clearBtn.style.cssText = this.getActionButtonStyles('secondary');
      }
      if (this.historyBtn) {
        this.historyBtn.style.cssText = this.getActionButtonStyles('secondary');
        this.historyBtn.style.opacity = '0.5';
      }
      if (this.themeToggle) {
        const themeConfig = {
          light: { icon: '🌙', title: 'ダークモードに切り替え' },
          dark: { icon: '🍵', title: '侘び寂びモードに切り替え' },
          wabisabi: { icon: '☀️', title: 'ライトモードに切り替え' }
        };
        const config = themeConfig[this.currentTheme] || themeConfig.light;
        // 太陽は黄色く、お茶は緑系、月は紫系フィルター
        if (config.icon === '☀️') {
          this.themeToggle.innerHTML = `<span style="filter: saturate(1.2) brightness(1.1);">${config.icon}</span>`;
        } else if (config.icon === '🍵') {
          this.themeToggle.innerHTML = `<span style="filter: hue-rotate(80deg) saturate(1.1) brightness(1.0);">${config.icon}</span>`;
        } else {
          this.themeToggle.innerHTML = `<span style="filter: hue-rotate(240deg) saturate(0.8) brightness(1.1);">${config.icon}</span>`;
        }
        this.themeToggle.title = config.title;
        this.themeToggle.style.cssText = this.getActionButtonStyles('icon');
      }
      if (this.settingsButton) {
        this.settingsButton.style.cssText = this.getActionButtonStyles('icon');
      }

      this.updateServiceSelectorTheme();

      // 閉じるボタンのテーマ更新
      const closeButton = this.container.querySelector('.close-button');
      if (closeButton) {
        closeButton.style.color = this.isDarkMode ? '#ffffff' : '#1f2937';
        closeButton.style.background = this.isDarkMode 
          ? 'rgba(255, 255, 255, 0.1)' 
          : 'rgba(0, 0, 0, 0.1)';
      }

      // フローティングコンテナとタスクカードのテーマ更新
      this.updateFloatingContainerTheme();

      // 既存の出力テキストの色を更新
      this.updateExistingTextColors();
    }

    /**
     * フローティングコンテナとタスクカードのテーマ更新
     */
    updateFloatingContainerTheme() {
      if (!this.floatingContainer) return;

      // フローティングコンテナの表示状態を保持
      const currentDisplay = this.floatingContainer.style.display;

      // 既存のタスクカードの色だけをテーマに合わせて更新（レイアウトは保持）
      if (this.taskCards && this.taskCards.size > 0) {
        this.taskCards.forEach((taskData, taskId) => {
          const card = taskData.element;
          if (card) {
            // テーマ関連の色のみ更新（位置やアニメーション状態は保持）
            // 2025年Glassmorphism仕様適用
            const glassmorphismDark = {
              background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.75), rgba(30, 27, 75, 0.7))',
              border: '1px solid rgba(99, 102, 241, 0.25)',
              color: '#ffffff'
            };

            const glassmorphismLight = {
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.35), rgba(255, 255, 255, 0.25))',
              border: '1px solid rgba(255, 255, 255, 0.4)',
              color: '#1f2937'
            };

            const theme = this.isDarkMode ? glassmorphismDark : glassmorphismLight;


            card.style.setProperty('background', theme.background, 'important');
            card.style.setProperty('border', theme.border, 'important');
            card.style.setProperty('color', theme.color, 'important');
          }
        });
      }

      // テーマ切り替え時は位置は変更せず、表示状態のみ復元
      this.floatingContainer.style.display = currentDisplay;
    }

    /**
     * 既存のテキスト色を現在のテーマに合わせて更新
     */
    updateExistingTextColors() {
      const colors = this.isDarkMode ? {
        system: '#60a5fa',
        command: '#93c5fd',
        success: '#f472b6',
        error: '#f87171',
        processing: '#fbbf24',
        info: '#d1d5db',
        hint: '#d1d5db'
      } : {
        system: '#1e40af',
        command: '#1d4ed8',
        success: '#be185d',
        error: '#dc2626',
        processing: '#d97706',
        info: '#7c3aed',
        hint: '#374151'
      };

      const defaultTextColor = this.isDarkMode ? '#d1d5db' : '#374151';

      // output内の全てのdivの色を更新
      this.output.querySelectorAll('div').forEach(line => {
        const text = line.textContent;
        let type = 'default';
        
        // テキストの内容からタイプを判定
        if (text.includes('📋') || text.includes('🎨') || text.includes('🎮') || text.includes('UI起動')) {
          type = 'system';
        } else if (text.startsWith('> ')) {
          type = 'command';
        } else if (text.includes('✅') || text.includes('⭐') || text.includes('生成しました')) {
          type = 'success';
        } else if (text.includes('❌') || text.includes('エラー')) {
          type = 'error';
        } else if (text.includes('中...')) {
          type = 'processing';
        } else if (text.includes('📍') || text.includes('使用モデル:') || text.includes('位置:')) {
          type = 'info';
        } else if (text.includes('   ')) {
          type = 'hint';
        }

        line.style.color = colors[type] || defaultTextColor;
      });
    }

    /**
     * Importインターフェース表示
     */
    showImportInterface() {
      // 隠しファイル入力を作成（Importボタンから直接選択できるので、ボタンは不要）
      if (!this.fileInput) {
        this.fileInput = document.createElement('input');
        this.fileInput.type = 'file';
        this.fileInput.accept = '.glb,.gltf,.jpg,.jpeg,.png,.mp4,.mov';
        this.fileInput.style.display = 'none';
        this.fileInput.onchange = (e) => this.handleFileSelection(e);
        document.body.appendChild(this.fileInput);
      }

      // ドラッグ&ドロップ機能を有効化
      this.enableDragAndDrop();
    }

    /**
     * Importインターフェース非表示
     */
    hideImportInterface() {
      if (this.fileSelectButton && this.fileSelectButton.parentNode) {
        this.fileSelectButton.parentNode.removeChild(this.fileSelectButton);
      }
      this.disableDragAndDrop();
    }

    /**
     * ファイル選択ダイアログを開く
     */
    openFileSelector() {
      if (this.fileInput) {
        this.fileInput.click();
      }
    }

    /**
     * Importボタンから直接ファイル選択を実行
     */
    triggerFileSelection() {
      // ファイル入力要素が存在しない場合は作成
      if (!this.fileInput) {
        this.showImportInterface(); // 既存のファイル入力作成処理を呼び出し
      }

      // 直接ファイル選択ダイアログを開く
      this.openFileSelector();

      // Import モードに切り替え（UI反映）
      this.selectMode('import', true);
    }

    /**
     * ファイル選択処理
     */
    async handleFileSelection(event) {
      const file = event.target.files[0];
      if (!file) return;

      try {
        // 前回のObjectURLをクリーンアップ（メモリリーク防止）
        if (this.selectedFile && this.selectedFile.url) {
          URL.revokeObjectURL(this.selectedFile.url);
        }

        // ファイルタイプを判定
        const fileType = this.detectFileType(file.name);

        // ファイルをローカルURLとして処理
        const fileUrl = URL.createObjectURL(file);

        // ファイル情報を保存
        this.selectedFile = {
          file: file,
          url: fileUrl,
          type: fileType,
          name: file.name
        };

        this.selectMode('import', true);

        // 自動的にデフォルトプロンプトで実行
        const defaultPrompt = `中央に設置 (${file.name})`;
        this.input.value = defaultPrompt;

        this.addOutput(`📁 ファイル選択: ${file.name} (${fileType})`, 'system');
        this.addOutput(`🚀 自動アップロード開始: ${defaultPrompt}`, 'system');

        // 自動実行（少し遅延を入れてUX向上）
        setTimeout(() => {
          this.executeCommand();
        }, 500);

      } catch (error) {
        console.error('File selection error:', error);
        this.addOutput(`❌ ファイル選択エラー: ${error.message}`, 'error');
      } finally {
        // IMPORTANT: ファイル入力をリセットして同じファイルの再選択を可能にする
        if (event.target) {
          event.target.value = '';
        }
      }
    }

    /**
     * ドラッグ&ドロップ機能を有効化
     */
    enableDragAndDrop() {
      if (!this.input) return;

      this.input.addEventListener('dragover', this.handleDragOver.bind(this));
      this.input.addEventListener('drop', this.handleDrop.bind(this));
      this.input.addEventListener('dragenter', this.handleDragEnter.bind(this));
      this.input.addEventListener('dragleave', this.handleDragLeave.bind(this));
    }

    /**
     * ドラッグ&ドロップ機能を無効化
     */
    disableDragAndDrop() {
      if (!this.input) return;

      this.input.removeEventListener('dragover', this.handleDragOver.bind(this));
      this.input.removeEventListener('drop', this.handleDrop.bind(this));
      this.input.removeEventListener('dragenter', this.handleDragEnter.bind(this));
      this.input.removeEventListener('dragleave', this.handleDragLeave.bind(this));
    }

    /**
     * ドラッグオーバー処理
     */
    handleDragOver(e) {
      e.preventDefault();
      this.input.style.background = this.isDarkMode ? 'rgba(236, 72, 153, 0.1)' : 'rgba(236, 72, 153, 0.05)';
    }

    /**
     * ドラッグエンター処理
     */
    handleDragEnter(e) {
      e.preventDefault();
      this.input.style.background = this.isDarkMode ? 'rgba(236, 72, 153, 0.1)' : 'rgba(236, 72, 153, 0.05)';
    }

    /**
     * ドラッグリーブ処理
     */
    handleDragLeave(e) {
      e.preventDefault();
      this.input.style.background = '';
    }

    /**
     * ドロップ処理
     */
    async handleDrop(e) {
      e.preventDefault();
      this.input.style.background = '';

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      const file = files[0]; // 最初のファイルのみ処理

      // ファイルタイプをチェック
      const fileType = this.detectFileType(file.name);
      if (!fileType) {
        this.addOutput('❌ サポートされていないファイル形式です', 'error');
        return;
      }

      // ファイル選択処理と同じ流れ
      this.handleFileSelection({ target: { files: [file] } });
    }

    /**
     * ファイルタイプ判定
     */
    detectFileType(fileName) {
      const ext = fileName.toLowerCase().split('.').pop();

      if (['glb', 'gltf'].includes(ext)) return '3d';
      if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return 'image';
      if (['mp4', 'mov', 'webm'].includes(ext)) return 'video';

      return null;
    }

    /**
     * Importコマンド処理
     */
    async handleImportCommand(command) {
      if (!this.selectedFile) {
        throw new Error('ファイルが選択されていません');
      }

      try {
        // プロンプトから位置情報を解析
        const position = this.sceneManager ? this.sceneManager.parsePosition(command) : { x: 0, y: 5, z: -10 };

        let result;

        switch (this.selectedFile.type) {
          case '3d':
            // 3Dモデルを読み込み
            if (this.sceneManager) {
              result = await this.sceneManager.load3DModel(this.selectedFile.url, {
                position: position,
                // scale: 自動調整に任せる
                fileName: this.selectedFile.name
              });
            } else {
              throw new Error('SceneManager が利用できません');
            }
            break;

          case 'image':
            // 画像をテクスチャプレーンとして配置
            if (this.sceneManager) {
              result = await this.sceneManager.loadImageFile(this.selectedFile.url, {
                position: position,
                fileName: this.selectedFile.name
              });
            } else {
              throw new Error('SceneManager が利用できません');
            }
            break;

          case 'video':
            // 動画をビデオテクスチャとして配置
            if (this.sceneManager) {
              result = await this.sceneManager.loadVideoFile(this.selectedFile.url, {
                position: position,
                fileName: this.selectedFile.name
              });
            } else {
              throw new Error('SceneManager が利用できません');
            }
            break;

          default:
            throw new Error(`サポートされていないファイルタイプ: ${this.selectedFile.type}`);
        }

        // ファイル情報をクリーンアップ
        const processedFileName = this.selectedFile?.name;
        const importedType = this.selectedFile?.type;
        const importedUrl = this.selectedFile?.url;

        if (importedType !== 'video' && importedUrl) {
          URL.revokeObjectURL(importedUrl);
        }

        this.selectedFile = null;
        this.selectMode('generate', false);

        return {
          success: true,
          message: `${processedFileName || 'ファイル'} を ${position.x}, ${position.y}, ${position.z} に配置しました`,
          objectId: result.objectId
        };

      } catch (error) {
        // エラー時もファイル情報をクリーンアップ
        if (this.selectedFile?.url) {
          URL.revokeObjectURL(this.selectedFile.url);
        }
        this.selectedFile = null;
        this.selectMode('generate', false);
        throw error;
      }
    }

    /**
     * 削除モードが選択された時の処理
     */
    handleDeleteModeSelection() {
      // selectedFileをクリア（削除モードではファイル選択状態を解除）
      if (this.selectedFile?.url) {
        URL.revokeObjectURL(this.selectedFile.url);
      }
      this.selectedFile = null;

      // SceneManagerから選択されたオブジェクトを取得
      const selectedObject = this.sceneManager?.selectedObject;
      
      if (selectedObject) {
        // 選択されたオブジェクトがある場合：削除コマンドをチャット欄に入力
        const objectName = selectedObject.userData?.originalPrompt || selectedObject.name || '選択したオブジェクト';
        this.input.value = `${objectName}を削除 ⏎`;
        this.input.focus();
        
        // カーソルを文末に移動（選択状態を解除）
        this.input.setSelectionRange(this.input.value.length, this.input.value.length);
        
        this.addOutput(`🎯 削除対象: ${objectName}`, 'system');
      } else {
        // 選択されたオブジェクトがない場合：2025年トレンドアニメーションで注意喚起
        this.input.value = '';
        this.addOutput('❗ 削除するオブジェクトを選択後、削除ボタンを押してください', 'system');
        
        // 2025年トレンド：Context-Aware Attention Animation
        this.triggerAttentionAnimation('delete');
        
        // DELETEモードを維持（generateモードに戻さない）
      }
    }

    /**
     * 修正モードが選択された時の処理
     */
    handleModifyModeSelection() {
      // selectedFileをクリア（修正モードではファイル選択状態を解除）
      if (this.selectedFile?.url) {
        URL.revokeObjectURL(this.selectedFile.url);
      }
      this.selectedFile = null;

      // SceneManagerから選択されたオブジェクトを取得
      const selectedObject = this.sceneManager?.selectedObject;
      
      if (selectedObject) {
        // 選択されたオブジェクトがある場合：修正コマンドをチャット欄に入力
        const objectName = selectedObject.userData?.originalPrompt || selectedObject.name || '選択したオブジェクト';
        this.input.value = `${objectName}を`;
        this.input.focus();
        
        // カーソルを文末に移動（選択状態を解除）
        this.input.setSelectionRange(this.input.value.length, this.input.value.length);
        
        this.addOutput(`🎯 修正対象: ${objectName}`, 'system');
      } else {
        // 選択されたオブジェクトがない場合：2025年トレンドアニメーションで注意喚起
        this.input.value = '';
        this.addOutput('❗ 修正するオブジェクトを選択後、修正ボタンを押してください', 'system');
        
        // 2025年トレンド：Context-Aware Attention Animation
        this.triggerAttentionAnimation('modify');
        
        // Modifyモードを維持（generateモードに戻さない）
      }
    }

    /**
     * 2025年トレンド：Context-Aware Attention Animation
     * オブジェクト未選択時の注意喚起アニメーション
     */
    triggerAttentionAnimation(mode) {
      const chatOutput = this.chatOutput;
      const inputField = this.input;
      
      // 2025年トレンド1: Micro-Shake Effect（微細な震え）
      this.addMicroShakeEffect(chatOutput);
      
      // 2025年トレンド2: Context-Aware Glow（状況認識グロー）
      this.addContextGlow(inputField, mode);
      
      // 2025年トレンド3: Emotional Pulse（感情的パルス）
      this.addEmotionalPulse(chatOutput, mode);
      
      // 2025年トレンド4: 3D Depth Shadow（立体的影効果）
      this.add3DDepthEffect(chatOutput);
    }

    /**
     * 2025年トレンド：Micro-Shake Effect
     */
    addMicroShakeEffect(element) {
      element.style.animation = 'microShake2025 0.5s ease-in-out';
      
      // CSSアニメーションを動的追加
      this.ensureMicroShakeAnimation();
      
      // アニメーション後クリーンアップ
      setTimeout(() => {
        element.style.animation = '';
      }, 500);
    }

    /**
     * 2025年トレンド：Context-Aware Glow
     */
    addContextGlow(element, mode) {
      const glowColor = mode === 'delete' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(99, 102, 241, 0.4)';
      
      element.style.transition = 'all 0.3s ease';
      element.style.boxShadow = `0 0 20px ${glowColor}, 0 0 40px ${glowColor}`;
      
      // 3秒後にフェードアウト
      setTimeout(() => {
        element.style.boxShadow = '';
      }, 3000);
    }

    /**
     * 2025年トレンド：Emotional Pulse
     */
    addEmotionalPulse(element, mode) {
      const pulseColor = mode === 'delete' ? '#ef4444' : (this.isWabiSabiMode ? '#8BC34A' : '#6366f1');
      
      element.style.borderLeft = `4px solid ${pulseColor}`;
      element.style.animation = 'emotionalPulse2025 2s ease-in-out infinite';
      
      // CSSアニメーションを動的追加
      this.ensureEmotionalPulseAnimation();
      
      // 6秒後にアニメーション停止
      setTimeout(() => {
        element.style.animation = '';
        element.style.borderLeft = '';
      }, 6000);
    }

    /**
     * 2025年トレンド：3D Depth Effect
     */
    add3DDepthEffect(element) {
      element.style.transform = 'translateZ(8px) rotateX(1deg)';
      element.style.transition = 'transform 0.3s ease';
      
      // 2秒後に元に戻す
      setTimeout(() => {
        element.style.transform = '';
      }, 2000);
    }

    /**
     * Micro-Shake CSSアニメーション確保
     */
    ensureMicroShakeAnimation() {
      if (document.getElementById('micro-shake-2025')) return;
      
      const style = document.createElement('style');
      style.id = 'micro-shake-2025';
      style.textContent = `
      @keyframes microShake2025 {
        0%, 100% { transform: translateX(0); }
        10% { transform: translateX(-2px) rotateZ(-0.5deg); }
        20% { transform: translateX(2px) rotateZ(0.5deg); }
        30% { transform: translateX(-1px) rotateZ(-0.3deg); }
        40% { transform: translateX(1px) rotateZ(0.3deg); }
        50% { transform: translateX(-0.5px) rotateZ(-0.1deg); }
        60% { transform: translateX(0.5px) rotateZ(0.1deg); }
        70% { transform: translateX(0); }
      }
    `;
      document.head.appendChild(style);
    }

    /**
     * Emotional Pulse CSSアニメーション確保
     */
    ensureEmotionalPulseAnimation() {
      if (document.getElementById('emotional-pulse-2025')) return;
      
      const style = document.createElement('style');
      style.id = 'emotional-pulse-2025';
      style.textContent = `
      @keyframes emotionalPulse2025 {
        0% { 
          border-left-width: 4px;
          filter: brightness(1);
        }
        50% { 
          border-left-width: 8px;
          filter: brightness(1.2) saturate(1.1);
        }
        100% { 
          border-left-width: 4px;
          filter: brightness(1);
        }
      }
    `;
      document.head.appendChild(style);
    }

    /**
     * モード切り替え時の入力欄メッセージ上書き機能
     * ユーザビリティ向上：他モードのメッセージを新モードの初期状態にクリア
     */
    clearInputOnModeSwitch(newMode) {
      // 現在の入力欄に内容がある場合のみ処理
      if (this.input.value.trim()) {
        // 以前のモードのメッセージかどうかを判定
        const isPreviousModeMessage = this.isPreviousModeMessage(this.input.value, newMode);
        
        if (isPreviousModeMessage) {
          // 以前のモードのメッセージの場合、新モードの初期メッセージに置き換え
          this.input.value = '';
          this.addOutput(`💫 ${this.getModeDisplayName(newMode)}モードに切り替えました`, 'system');
        }
      }
    }

    /**
     * 入力内容が以前のモードのメッセージかどうかを判定
     */
    isPreviousModeMessage(inputValue, currentMode) {
      // Delete/Modifyモードの特徴的なメッセージパターンを検出
      const deletePatterns = [
        /.*を削除$/,
        /削除$/
      ];
      
      const modifyPatterns = [
        /.*を$/,
        /.*を変更/,
        /.*をピンク/,
        /.*を大きく/,
        /.*を小さく/,
        /.*を移動/,
        /回転/,
        /反転/,
        /ミラー/,
        /傾け/,
        /向きを変え/,
        /.*を.*色/,
        /.*を.*サイズ/
      ];
      
      const importPatterns = [
        /ファイル/,
        /画像/,
        /インポート/
      ];

      // 現在のモードと異なるパターンにマッチする場合は上書き対象
      switch (currentMode) {
        case 'delete':
          return modifyPatterns.some(pattern => pattern.test(inputValue)) ||
                 importPatterns.some(pattern => pattern.test(inputValue));
                 
        case 'modify':
          return deletePatterns.some(pattern => pattern.test(inputValue)) ||
                 modifyPatterns.some(pattern => pattern.test(inputValue)) ||
                 importPatterns.some(pattern => pattern.test(inputValue));
                 
        case 'import':
          return deletePatterns.some(pattern => pattern.test(inputValue)) ||
                 modifyPatterns.some(pattern => pattern.test(inputValue));
                 
        case 'generate':
          return deletePatterns.some(pattern => pattern.test(inputValue)) ||
                 modifyPatterns.some(pattern => pattern.test(inputValue)) ||
                 importPatterns.some(pattern => pattern.test(inputValue));
                 
        default:
          return false;
      }
    }

    /**
     * モード表示名を取得
     */
    getModeDisplayName(mode) {
      const modeNames = {
        'generate': '生成',
        'import': 'インポート',
        'modify': '修正',
        'delete': '削除'
      };
      return modeNames[mode] || mode;
    }

    /**
     * 常時表示フローティングチョコアイコンを作成
     */
    createFloatingChocolateIcon() {
      // 既存のアイコンがあれば削除
      if (this.floatingChocolateIcon) {
        this.floatingChocolateIcon.remove();
      }

      this.floatingChocolateIcon = document.createElement('div');
      this.floatingChocolateIcon.innerHTML = '🍫';
      this.floatingChocolateIcon.title = 'ChocoDrop を開く (@キーでも開けます)';
      this.floatingChocolateIcon.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: rgba(99, 102, 241, 0.15);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2), 0 2px 6px rgba(0, 0, 0, 0.05);
      opacity: 0.8;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      cursor: pointer;
      z-index: 999;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      transform: scale(1);
      filter: none;
    `;

      // ホバー効果
      this.floatingChocolateIcon.addEventListener('mouseover', () => {
        this.floatingChocolateIcon.style.transform = 'scale(1.1) translateY(-2px)';
        this.floatingChocolateIcon.style.boxShadow = '0 6px 16px rgba(99, 102, 241, 0.3), 0 3px 8px rgba(0, 0, 0, 0.1)';
        this.floatingChocolateIcon.style.opacity = '1';
        this.floatingChocolateIcon.style.filter = 'none';
      });

      this.floatingChocolateIcon.addEventListener('mouseout', () => {
        this.floatingChocolateIcon.style.transform = 'scale(1) translateY(0)';
        this.floatingChocolateIcon.style.boxShadow = '0 4px 12px rgba(99, 102, 241, 0.2), 0 2px 6px rgba(0, 0, 0, 0.05)';
        this.floatingChocolateIcon.style.opacity = '0.8';
        this.floatingChocolateIcon.style.filter = 'none';
      });

      // クリックで ChocoDrop を開く
      this.floatingChocolateIcon.addEventListener('click', () => {
        if (this.isVisible) {
          this.hide();
        } else {
          this.show();
        }
      });

      // 右クリックメニュー
      this.floatingChocolateIcon.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showFloatingIconContextMenu(e);
      });

      // DOM に追加
      document.body.appendChild(this.floatingChocolateIcon);
    }

    /**
     * フローティングアイコンの右クリックメニューを表示
     */
    showFloatingIconContextMenu(event) {
      // 既存のメニューがあれば削除
      const existingMenu = document.querySelector('.floating-icon-context-menu');
      if (existingMenu) {
        existingMenu.remove();
      }

      // コンテキストメニュー作成
      const menu = document.createElement('div');
      menu.className = 'floating-icon-context-menu';
      menu.style.cssText = `
      position: fixed;
      top: ${event.clientY}px;
      left: ${event.clientX}px;
      background: ${this.isWabiSabiMode
        ? 'rgba(239, 235, 233, 0.9)'
        : (this.isDarkMode ? 'rgba(17, 24, 39, 0.85)' : 'rgba(255, 255, 255, 0.85)')};
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid ${this.isWabiSabiMode
        ? 'rgba(161, 136, 127, 0.4)'
        : (this.isDarkMode ? 'rgba(129, 140, 248, 0.3)' : 'rgba(99, 102, 241, 0.2)')};
      border-radius: 12px;
      box-shadow: ${this.isWabiSabiMode
        ? '0 8px 24px rgba(93, 64, 55, 0.2), 0 4px 12px rgba(0, 0, 0, 0.1)'
        : '0 8px 24px rgba(99, 102, 241, 0.2), 0 4px 12px rgba(0, 0, 0, 0.1)'};
      padding: 8px 0;
      min-width: 160px;
      z-index: 2000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      color: ${this.isWabiSabiMode
        ? '#5D4037'
        : (this.isDarkMode ? '#ffffff' : '#1f2937')};
    `;

      // メニューアイテム1: フォームを開く
      const openFormItem = document.createElement('div');
      openFormItem.innerHTML = '📄 フォームを開く';
      openFormItem.style.cssText = `
      padding: 8px 16px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 8px;
      color: ${this.isWabiSabiMode ? '#8D6E63' : '#6366f1'};
      text-shadow: ${this.isWabiSabiMode
        ? '0 2px 4px rgba(141, 110, 99, 0.3)'
        : '0 2px 4px rgba(99, 102, 241, 0.3)'};
    `;

      openFormItem.addEventListener('mouseover', () => {
        openFormItem.style.background = this.isWabiSabiMode
          ? 'rgba(161, 136, 127, 0.15)'
          : (this.isDarkMode ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.1)');
        openFormItem.style.textShadow = this.isWabiSabiMode
          ? '0 2px 6px rgba(141, 110, 99, 0.5)'
          : '0 2px 6px rgba(99, 102, 241, 0.5)';
      });

      openFormItem.addEventListener('mouseout', () => {
        openFormItem.style.background = 'transparent';
        openFormItem.style.textShadow = this.isWabiSabiMode
          ? '0 2px 4px rgba(141, 110, 99, 0.3)'
          : '0 2px 4px rgba(99, 102, 241, 0.3)';
      });

      openFormItem.addEventListener('click', () => {
        menu.remove();
        if (this.isVisible) {
          this.hide();
        } else {
          this.show();
        }
      });

      // メニューアイテム2: アイコンを非表示
      const hideIconItem = document.createElement('div');
      hideIconItem.innerHTML = '✕ アイコンを非表示';
      hideIconItem.style.cssText = `
      padding: 8px 16px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 8px;
      color: ${this.isWabiSabiMode ? '#8D6E63' : '#6366f1'};
      text-shadow: ${this.isWabiSabiMode
        ? '0 2px 4px rgba(141, 110, 99, 0.3)'
        : '0 2px 4px rgba(99, 102, 241, 0.3)'};
    `;

      hideIconItem.addEventListener('mouseover', () => {
        hideIconItem.style.background = this.isWabiSabiMode
          ? 'rgba(161, 136, 127, 0.15)'
          : (this.isDarkMode ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.1)');
        hideIconItem.style.textShadow = this.isWabiSabiMode
          ? '0 2px 6px rgba(141, 110, 99, 0.5)'
          : '0 2px 6px rgba(99, 102, 241, 0.5)';
      });

      hideIconItem.addEventListener('mouseout', () => {
        hideIconItem.style.background = 'transparent';
        hideIconItem.style.textShadow = this.isWabiSabiMode
          ? '0 2px 4px rgba(141, 110, 99, 0.3)'
          : '0 2px 4px rgba(99, 102, 241, 0.3)';
      });

      hideIconItem.addEventListener('click', () => {
        menu.remove();
        this.hideFloatingIcon();
      });

      // メニューに追加
      menu.appendChild(openFormItem);

      if (this.onboardingCoach) {
        const guideItem = document.createElement('div');
        guideItem.innerHTML = '🎯 初回ガイドを再生';
        guideItem.style.cssText = `
        padding: 8px 16px;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        gap: 8px;
        color: ${this.isWabiSabiMode ? '#8D6E63' : '#6366f1'};
        text-shadow: ${this.isWabiSabiMode
          ? '0 2px 4px rgba(141, 110, 99, 0.3)'
          : '0 2px 4px rgba(99, 102, 241, 0.3)'};
      `;

        guideItem.addEventListener('mouseover', () => {
          guideItem.style.background = this.isWabiSabiMode
            ? 'rgba(161, 136, 127, 0.15)'
            : (this.isDarkMode ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.1)');
          guideItem.style.textShadow = this.isWabiSabiMode
            ? '0 2px 6px rgba(141, 110, 99, 0.5)'
            : '0 2px 6px rgba(99, 102, 241, 0.5)';
        });

        guideItem.addEventListener('mouseout', () => {
          guideItem.style.background = 'transparent';
          guideItem.style.textShadow = this.isWabiSabiMode
            ? '0 2px 4px rgba(141, 110, 99, 0.3)'
            : '0 2px 4px rgba(99, 102, 241, 0.3)';
        });

        guideItem.addEventListener('click', () => {
          menu.remove();
          this.launchOnboarding(true);
        });

        menu.appendChild(guideItem);
      }

      menu.appendChild(hideIconItem);

      // DOM に追加
      document.body.appendChild(menu);

      // 画面外に出ないように調整
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        menu.style.left = `${event.clientX - rect.width}px`;
      }
      if (rect.bottom > window.innerHeight) {
        menu.style.top = `${event.clientY - rect.height}px`;
      }

      // 外部クリックで閉じる
      const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
          menu.remove();
          document.removeEventListener('click', closeMenu);
        }
      };

      setTimeout(() => {
        document.addEventListener('click', closeMenu);
      }, 10);
    }

    /**
     * フローティングアイコンを非表示にする
     */
    hideFloatingIcon() {
      if (this.floatingChocolateIcon) {
        this.floatingChocolateIcon.style.display = 'none';
      }
    }

    /**
     * フローティングアイコンを表示する
     */
    showFloatingIcon() {
      if (this.floatingChocolateIcon) {
        this.floatingChocolateIcon.style.display = 'flex';
      }
    }

    dispose() {
      if (this.sceneChangeUnsubscribe) {
        try {
          this.sceneChangeUnsubscribe();
        } catch (error) {
          console.warn('⚠️ Failed to dispose scene change listener:', error);
        }
        this.sceneChangeUnsubscribe = null;
      }

      // キーワードハイライトのクリーンアップ
      this.clearKeywordHighlighting();

      // ファイル選択関連のクリーンアップ
      if (this.fileInput && this.fileInput.parentNode) {
        this.fileInput.parentNode.removeChild(this.fileInput);
      }
      if (this.selectedFile && this.selectedFile.url) {
        URL.revokeObjectURL(this.selectedFile.url);
      }

      if (this.sceneLoadInput && this.sceneLoadInput.parentNode) {
        this.sceneLoadInput.parentNode.removeChild(this.sceneLoadInput);
      }
      this.sceneLoadInput = null;

      // フローティングチョコアイコンのクリーンアップ
      if (this.floatingChocolateIcon && this.floatingChocolateIcon.parentNode) {
        this.floatingChocolateIcon.parentNode.removeChild(this.floatingChocolateIcon);
      }

      if (this.xrEventUnsubscribe.length > 0) {
        this.xrEventUnsubscribe.forEach(unsub => {
          try {
            unsub?.();
          } catch (error) {
            console.warn('⚠️ Failed to dispose XR listener:', error);
          }
        });
        this.xrEventUnsubscribe = [];
      }

      if (this.container && this.container.parentElement) {
        this.container.parentElement.removeChild(this.container);
      }
    }

    showOverlayTextarea() {
      if (this.overlayTextarea) return;

      this.isExpanded = true;
      
      // オーバーレイテキストエリアを作成
      this.overlayTextarea = document.createElement('textarea');
      this.overlayTextarea.value = this.input.value;
      this.overlayTextarea.placeholder = this.input.placeholder;
      
      // フォームの位置とサイズを取得
      const containerRect = this.container.getBoundingClientRect();
      
      // 画面境界を考慮した位置調整
      const overlayHeight = 300;
      const padding = 20;
      
      let top = containerRect.top + 60;
      let left = containerRect.left;
      let width = containerRect.width;
      
      // 右端がはみ出る場合
      if (left + width > window.innerWidth - padding) {
        left = window.innerWidth - width - padding;
      }
      
      // 左端がはみ出る場合
      if (left < padding) {
        left = padding;
        width = Math.min(width, window.innerWidth - 2 * padding);
      }
      
      // 下端がはみ出る場合
      if (top + overlayHeight > window.innerHeight - padding) {
        top = Math.max(padding, window.innerHeight - overlayHeight - padding);
      }

      const overlayBackground = this.isWabiSabiMode
        ? 'linear-gradient(135deg, rgba(97, 97, 97, 0.7), rgba(66, 66, 66, 0.6))'
        : (this.isDarkMode
          ? 'linear-gradient(135deg, rgba(30, 27, 75, 0.4), rgba(15, 23, 42, 0.5))'
          : 'linear-gradient(135deg, rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.2))');

      const overlayBorder = this.isWabiSabiMode
        ? '1px solid rgba(93, 64, 55, 0.5)'
        : (this.isDarkMode
          ? '1px solid rgba(99, 102, 241, 0.25)'
          : '1px solid rgba(255, 255, 255, 0.5)');

      const overlayInnerShadow = this.isWabiSabiMode
        ? '0 4px 16px rgba(66, 66, 66, 0.3), inset 0 1px 0 rgba(189, 189, 189, 0.2)'
        : (this.isDarkMode
          ? '0 4px 16px rgba(15, 23, 42, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.08)'
          : '0 4px 16px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.4)');

      const overlayTextColor = this.getInputTextColor();

      // オーバーレイのスタイル設定
      this.overlayTextarea.style.cssText = `
      position: fixed;
      top: ${top}px;
      left: ${left}px;
      width: ${width}px;
      height: ${overlayHeight}px;
      box-sizing: border-box;
      background: ${overlayBackground};
      backdrop-filter: blur(24px) saturate(180%);
      border: ${overlayBorder};
      box-shadow: ${overlayInnerShadow};
      border-radius: 16px;
      color: ${overlayTextColor};
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      padding: 20px;
      resize: none;
      outline: none;
      z-index: 10000;
      box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
      opacity: 0;
      transition: opacity 0.2s ease-out;
    `;
      
      // ドキュメントに追加
      document.body.appendChild(this.overlayTextarea);
      
      // アニメーション開始
      requestAnimationFrame(() => {
        this.overlayTextarea.style.opacity = '1';
      });
      
      // フォーカス設定
      this.overlayTextarea.focus();
      
      // 入力同期
      this.overlayTextarea.addEventListener('input', (e) => {
        this.input.value = e.target.value;
      });
      
      // Escapeキーで閉じる
      this.overlayTextarea.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.hideOverlayTextarea();
        }
      });
      
      // 外側クリックで閉じる
      this.overlayTextarea.addEventListener('blur', () => {
        setTimeout(() => this.hideOverlayTextarea(), 100);
      });
    }
    
    hideOverlayTextarea() {
      if (!this.overlayTextarea) return;
      
      this.isExpanded = false;
      
      // フェードアウトアニメーション
      this.overlayTextarea.style.opacity = '0';
      
      setTimeout(() => {
        if (this.overlayTextarea) {
          document.body.removeChild(this.overlayTextarea);
          this.overlayTextarea = null;
        }
      }, 200);
    }
    
    hideOverlayTextarea() {
      if (!this.overlayTextarea) return;
      
      this.isExpanded = false;
      
      // フェードアウトアニメーション
      this.overlayTextarea.style.opacity = '0';
      
      setTimeout(() => {
        if (this.overlayTextarea) {
          document.body.removeChild(this.overlayTextarea);
          this.overlayTextarea = null;
        }
      }, 200);
    }
  }

  /**
   * ChocoDrop ワンステップ初期化ヘルパー
   * 共有フォルダから複数の Three.js プロジェクトへ使い回すことを想定
   *
   * @param {THREE.Scene} scene - 既存 Three.js シーン
   * @param {Object} options - 初期化オプション
   * @param {THREE.Camera} [options.camera] - 相対配置計算に使用するカメラ
   * @param {THREE.WebGLRenderer} [options.renderer] - マウス操作を有効化する場合に使用
   * @param {string} [options.serverUrl] - ChocoDrop サーバーの明示的 URL
   * @param {ChocoDropClient} [options.client] - 既存のクライアントを注入する場合（旧 LiveCommandClient）
   * @param {Function} [options.onControlsToggle] - UI 開閉時に呼ばれるコールバック
   * @param {Object} [options.sceneOptions] - SceneManager へ渡す追加オプション
   * @param {Object} [options.uiOptions] - CommandUI へ渡す追加オプション
   * @returns {Object} - 初期化済みのコンポーネント群と dispose ヘルパー
   */
  function createChocoDrop(scene, options = {}) {
    const {
      camera = null,
      renderer = null,
      serverUrl = null,
      client = null,
      onControlsToggle = () => {},
      sceneOptions = {},
      uiOptions = {},
      // トップレベルオプションを抽出
      ...otherSceneOptions
    } = options;

    const resolvedServerUrl = serverUrl || sceneOptions.serverUrl || null;
    const chocoDropClient = client || new ChocoDropClient(resolvedServerUrl);

    // SceneManager is optional - can be created later when scene is available
    const sceneManager = scene ? new SceneManager(scene, {
      camera,
      renderer,
      serverUrl: resolvedServerUrl,
      client: chocoDropClient,
      ...sceneOptions,
      ...otherSceneOptions
    }) : null;

    const commandUI = new CommandUI({
      sceneManager,
      client: chocoDropClient,
      onControlsToggle,
      ...uiOptions,
      // GitHub Pages等でサービス設定ダイアログを無効化するオプション
      skipServiceDialog: options.skipServiceDialog
    });

    return {
      client: chocoDropClient,
      sceneManager,
      ui: commandUI,
      dispose() {
        commandUI.dispose?.();
        sceneManager?.dispose?.();
      }
    };
  }

  // 旧API名の互換エクスポート
  const createChocoDro = createChocoDrop;
  const createLiveCommand = createChocoDrop;

  /**
   * Demo version bootstrap function
   * Creates ChocoDrop instance with CommandUIDemo (restricted functionality)
   */
  function createChocoDropDemo(scene, options = {}) {
    if (!scene) {
      throw new Error('THREE.Scene インスタンスが必要です');
    }

    // UI固有のオプションキーリスト（CommandUIDemo.jsのconfigと対応）
    const UI_SPECIFIC_OPTIONS = [
      'enableServerHealthCheck',
      'skipServiceDialog',
      'theme',
      'showExamples',
      'autoScroll',
      'enableDebugLogging'
    ];

    const {
      camera = null,
      renderer = null,
      serverUrl = null,
      client = null,
      onControlsToggle = () => {},
      sceneOptions = {},
      uiOptions = {},
      ...otherOptions  // UI設定とScene設定が混在している可能性
    } = options;

    const resolvedServerUrl = serverUrl || sceneOptions.serverUrl || null;

    // enableServerHealthCheckを早期に解決（otherOptions, uiOptions, デフォルトの優先順位）
    const enableServerHealthCheck = uiOptions.enableServerHealthCheck ?? otherOptions.enableServerHealthCheck ?? true;

    const chocoDropClient = client || new ChocoDropClient(resolvedServerUrl, null, {
      enableServerHealthCheck
    });

    // otherOptionsからUI固有の設定を抽出して振り分け
    const extractedUIOptions = {};
    const extractedSceneOptions = {};

    Object.keys(otherOptions).forEach(key => {
      if (UI_SPECIFIC_OPTIONS.includes(key)) {
        extractedUIOptions[key] = otherOptions[key];
      } else {
        extractedSceneOptions[key] = otherOptions[key];
      }
    });

    // 明示的な設定を優先してマージ
    const mergedUIOptions = {
      ...extractedUIOptions,
      ...uiOptions
    };

    const mergedSceneOptions = {
      ...sceneOptions,
      ...extractedSceneOptions
    };

    const sceneManager = new SceneManager(scene, {
      camera,
      renderer,
      serverUrl: resolvedServerUrl,
      client: chocoDropClient,
      ...mergedSceneOptions
    });

    // Use CommandUIDemo instead of CommandUI
  const commandUI = new CommandUIDemo({
    sceneManager,
    client: chocoDropClient,
    onControlsToggle,
    ...mergedUIOptions
  });

  sceneManager.ui = commandUI;
  commandUI.setSceneManager(sceneManager);

  return {
    sceneManager,
    ui: commandUI,
    client: chocoDropClient,
    dispose: () => {
      if (commandUI) commandUI.dispose();
      if (sceneManager) sceneManager.dispose();
    }
  };
  }

  // Default export for convenience
  var index = {
    ChocoDropClient,
    ChocoDroClient,
    LiveCommandClient,
    SceneManager,
    CommandUI: CommandUIDemo, // Alias for demo
    CommandUIDemo,
    createChocoDrop: createChocoDropDemo, // Use demo version
    createChocoDro,
    createLiveCommand
  };

  exports.ChocoDroClient = ChocoDroClient;
  exports.ChocoDropClient = ChocoDropClient;
  exports.CommandUIDemo = CommandUIDemo;
  exports.LiveCommandClient = LiveCommandClient;
  exports.SceneManager = SceneManager;
  exports.createChocoDro = createChocoDro;
  exports.createChocoDrop = createChocoDropDemo;
  exports.createChocoDropDemo = createChocoDropDemo;
  exports.createLiveCommand = createLiveCommand;
  exports.default = index;

  Object.defineProperty(exports, '__esModule', { value: true });

}));
//# sourceMappingURL=chocodrop-demo.umd.js.map
