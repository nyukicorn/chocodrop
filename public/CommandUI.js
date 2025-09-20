/**
 * Command UI - Web interface for ChocoDro System
 * Real-time natural language command interface for 3D scenes
 */
export class CommandUI {
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
    
    // ドラッグ&ドロップ用のバインドされたハンドラを保持
    this.boundHandlers = {
      dragOver: null,
      drop: null,
      dragEnter: null,
      dragLeave: null,
      documentDragOver: null,
      documentDrop: null
    };
    
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
      ...options.config
    };

    // ダークモード状態管理
    this.isDarkMode = localStorage.getItem('live-command-theme') === 'dark' ||
                     localStorage.getItem('live-command-theme') === null; // デフォルトはダーク
    
    // Undo/Redo システム
    this.commandHistory = [];
    this.currentHistoryIndex = -1;
    this.maxHistorySize = 50; // 最大コマンド保存数
    
    this.initUI();
    this.bindEvents();
    
    // DOM読み込み完了後にスタイルを確実に適用
    document.addEventListener('DOMContentLoaded', () => {
      this.refreshStyles();
    });
    
    this.logDebug('🎮 CommandUI initialized');
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
  /**
   * 適切なドロップゾーン制御
   */
  preventGlobalDragEvents() {
    const dragEventHandler = (e) => {
      // 入力エリアへのドロップは許可
      if (e.target === this.input || this.input?.contains(e.target)) {
        return;
      }
      
      // UIコンテナ内でのドロップは許可
      if (this.container?.contains(e.target)) {
        return;
      }
      
      // それ以外は防止
      e.preventDefault();
      e.dataTransfer.effectAllowed = 'none';
      e.dataTransfer.dropEffect = 'none';
    };

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      window.addEventListener(eventName, dragEventHandler, false);
    });
  }

  initUI() {
    // グローバルなドラッグイベントを早期に防止
    this.preventGlobalDragEvents();
    
    // メインコンテナ
    this.container = document.createElement('div');
    this.container.id = 'live-command-ui';
    this.container.style.cssText = this.getContainerStyles();

    // Ultra-Simple ヘッダー
    const header = document.createElement('div');
    header.style.cssText = `
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid rgba(79, 70, 229, 0.2);
      padding-bottom: 12px;
      position: relative;
      min-height: 32px;
    `;
    
    // ヘッダーテキスト
    const headerText = document.createElement('span');
    headerText.style.cssText = `
      background: linear-gradient(135deg, #4f46e5, #7c3aed);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      font-weight: 800;
      font-size: 18px;
    `;
    headerText.textContent = '🌉 ChocoDro';
    header.appendChild(headerText);
    
    // ダークモードトグルアイコンボタン（右側に配置）
    const themeToggle = document.createElement('button');
    themeToggle.style.cssText = `
      background: transparent;
      border: none;
      font-size: 20px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 8px;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    themeToggle.innerHTML = this.isDarkMode ? '☀️' : '🌙';
    themeToggle.title = this.isDarkMode ? 'ライトモードに切り替え' : 'ダークモードに切り替え';
    
    // ホバーエフェクト
    themeToggle.addEventListener('mouseenter', () => {
      themeToggle.style.background = this.isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
    });
    themeToggle.addEventListener('mouseleave', () => {
      themeToggle.style.background = 'transparent';
    });
    
    themeToggle.addEventListener('click', () => this.toggleTheme());
    this.themeToggle = themeToggle; // 参照保持
    
    header.appendChild(themeToggle);

    // 出力エリア（タスクカードコンテナ）
    this.output = document.createElement('div');
    this.outputDiv = this.output; // 両方の参照を保持（互換性のため）
    this.output.id = 'command-output';
    this.output.className = 'command-output';
    this.output.style.cssText = this.getOutputStyles();

    // タスクカード管理用
    this.taskCards = new Map();

    // Ultra-Simple 単一入力フィールド
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.id = 'command-input';
    this.input.placeholder = '自然言語でコマンドを入力... (Enter: 送信)';
    this.input.style.cssText = this.getInputStyles();

    // 旧コマンドタイプインジケーターは削除（ラジオボタンUIに統合）

    // ラジオボタン風モードセレクター
    const modeSelector = this.createRadioModeSelector();

    // ミニマルアクションボタン
    const actionContainer = this.createMinimalActions();

    // 組み立て
    this.container.appendChild(header);
    this.container.appendChild(this.output);
    this.container.appendChild(modeSelector);
    this.container.appendChild(this.input);
    this.container.appendChild(actionContainer);

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
        this.executeCommand();
      }
    });
    
    // 初期メッセージ
    if (this.config.showExamples) {
      // 起動メッセージ削除
      // 起動時は静かに待機
    }
  }

  /**
   * モードセレクター作成
   */
  createMinimalActions() {
    const container = document.createElement('div');
    container.style.cssText = `
      display: flex;
      margin-top: 8px;
      gap: 8px;
      opacity: 0.8;
      justify-content: flex-start;
    `;

    // Undoボタン
    const undoBtn = document.createElement('button');
    undoBtn.innerHTML = '↶ Undo';
    undoBtn.style.cssText = this.getMinimalButtonStyles();
    undoBtn.disabled = true;
    undoBtn.addEventListener('click', () => this.undo());
    this.undoBtn = undoBtn; // 参照保持

    // Redoボタン
    const redoBtn = document.createElement('button');
    redoBtn.innerHTML = '↷ Redo';
    redoBtn.style.cssText = this.getMinimalButtonStyles();
    redoBtn.disabled = true;
    redoBtn.addEventListener('click', () => this.redo());
    this.redoBtn = redoBtn; // 参照保持

    // クリアボタン
    const clearBtn = document.createElement('button');
    clearBtn.innerHTML = 'Clear All';
    clearBtn.style.cssText = this.getMinimalButtonStyles();
    clearBtn.addEventListener('click', () => this.clearAllWithConfirmation());

    // Undo/Redoボタンは一時的に非表示
    // container.appendChild(undoBtn);
    // container.appendChild(redoBtn);
    container.appendChild(clearBtn);

    return container;
  }

  /**
   * ラジオボタン風モードセレクター作成
   */
  createRadioModeSelector() {
    const container = document.createElement('div');
    container.className = 'radio-mode-selector';
    container.style.cssText = `
      display: flex;
      gap: 16px;
      margin-bottom: 12px;
      padding: 8px 12px;
      background: ${this.isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.1)'};
      border: 1px solid ${this.isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.15)'};
      border-radius: 10px;
      backdrop-filter: blur(8px);
      transition: all 0.3s ease;
      position: relative;
    `;

    const modes = [
      { value: 'generate', label: 'Generate', icon: '✨' },
      { value: 'import', label: 'Import', icon: '📁' },
      { value: 'modify', label: 'Modify', icon: '✏️' },
      { value: 'delete', label: 'Delete', icon: '🗑️' }
    ];

    this.radioModeButtons = {};

    modes.forEach(mode => {
      const button = document.createElement('div');
      button.className = `mode-option ${mode.value}`;
      button.style.cssText = `
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s ease;
        font-size: 12px;
        font-weight: 500;
        color: ${this.isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)'};
        background: transparent;
      `;

      const radio = document.createElement('div');
      radio.className = 'radio-circle';
      radio.style.cssText = `
        width: 12px;
        height: 12px;
        border: 2px solid ${this.isDarkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)'};
        border-radius: 50%;
        transition: all 0.2s ease;
      `;

      const label = document.createElement('span');
      label.textContent = `${mode.icon} ${mode.label}`;

      // AUTOバッジを作成
      const autoBadge = document.createElement('div');
      autoBadge.className = 'auto-badge';
      autoBadge.textContent = 'AUTO';
      autoBadge.style.cssText = `
        font-size: 8px;
        font-weight: 700;
        padding: 2px 4px;
        background: linear-gradient(135deg, #10b981, #059669);
        color: white;
        border-radius: 4px;
        margin-left: 4px;
        opacity: 0;
        transform: scale(0.8);
        transition: all 0.2s ease;
        display: none;
      `;

      button.appendChild(radio);
      button.appendChild(label);
      button.appendChild(autoBadge);

      // クリックイベント
      button.addEventListener('click', () => {
        this.selectMode(mode.value, true); // trueは手動選択を示す
      });

      this.radioModeButtons[mode.value] = { button, radio, autoBadge };
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
    this.currentMode = mode;

    // 全ボタンをリセット
    Object.keys(this.radioModeButtons).forEach(key => {
      const { button, radio, autoBadge } = this.radioModeButtons[key];
      button.style.color = this.isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)';
      button.style.background = 'transparent';
      radio.style.borderColor = this.isDarkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)';
      radio.style.background = 'transparent';
      // AUTOバッジを非表示
      autoBadge.style.display = 'none';
      autoBadge.style.opacity = '0';
    });

    // 選択されたボタンをハイライト
    const { button, radio, autoBadge } = this.radioModeButtons[mode];
    button.style.color = '#ec4899'; // ピンク色
    button.style.background = this.isDarkMode ? 'rgba(236, 72, 153, 0.15)' : 'rgba(236, 72, 153, 0.1)';
    radio.style.borderColor = '#ec4899';
    radio.style.background = '#ec4899';

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

    const glowColors = {
      generate: 'rgba(79, 70, 229, 0.4)',   // 紫のグロー
      modify: 'rgba(236, 72, 153, 0.4)',    // ピンクのグロー  
      delete: 'rgba(107, 114, 128, 0.3)'    // グレーのグロー
    };

    // 一時的にグロー効果を適用
    container.style.boxShadow = `0 0 20px ${glowColors[mode]}, 0 0 40px ${glowColors[mode]}`;
    container.style.borderColor = glowColors[mode].replace('0.4', '0.6').replace('0.3', '0.5');
    
    // 1秒後にグロー効果を除去
    setTimeout(() => {
      container.style.boxShadow = '';
      container.style.borderColor = this.isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.15)';
    }, 1000);
  }

  getMinimalButtonStyles() {
    return `
      min-width: 50px;
      height: 32px;
      border: 1px solid ${this.isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.25)'};
      border-radius: 6px;
      background: ${this.isDarkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.2)'};
      color: ${this.isDarkMode ? '#ffffff' : '#1f2937'};
      cursor: pointer;
      transition: all 0.2s ease;
      font-family: inherit;
      outline: none;
      font-size: 11px;
      font-weight: 500;
      padding: 0 8px;
    `;
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
      margin-bottom: 8px;
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
   * リアルタイムコマンドタイプ検出
   */
  detectCommandType() {
    const input = this.input.value.trim();
    if (!input) {
      this.selectMode('generate', false);
      return;
    }

    const commandType = this.analyzeCommandType(input);

    // ラジオボタンUIを自動更新（手動選択ではない）
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
    
    const typeLabels = {
      generate: '🎨 生成モード',
      modify: '✏️ 変更モード',
      delete: '🗑️ 削除モード'
    };
    
    const typeColors = {
      generate: 'linear-gradient(135deg, #4f46e5, #4338ca)',
      modify: 'linear-gradient(135deg, #ec4899, #be185d)',
      delete: 'rgba(107, 114, 128, 0.15)'
    };
    
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
        margin-bottom: 8px;
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
    const typeLabels = {
      generate: '🎨 生成モード',
      modify: '✏️ 変更モード',
      delete: '🗑️ 削除モード'
    };
    
    const typeColors = {
      generate: 'linear-gradient(135deg, #4f46e5, #4338ca)',
      modify: 'linear-gradient(135deg, #ec4899, #be185d)',
      delete: 'rgba(107, 114, 128, 0.15)'
    };

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
      margin-top: 12px;
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

    return `
      position: fixed;
      ${positions[this.config.position] || positions['bottom-right']}
      width: ${this.config.width}px;
      max-height: ${this.config.maxHeight}px;
      background: ${this.isDarkMode
        ? 'linear-gradient(135deg, rgba(20, 20, 30, 0.7), rgba(10, 10, 20, 0.8))'
        : 'linear-gradient(135deg, rgba(255, 255, 255, 0.25), rgba(240, 240, 255, 0.3))'};
      border: 1px solid ${this.isDarkMode
        ? 'rgba(255, 255, 255, 0.2)'
        : 'rgba(255, 255, 255, 0.3)'};
      border-radius: 20px;
      color: ${this.isDarkMode ? '#ffffff' : '#1f2937'};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', sans-serif;
      font-size: 14px;
      z-index: 1000;
      padding: 24px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(20px);
      display: none;
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
    `;

    document.head.appendChild(style);
  }

  getInputStyles() {
    return `
      width: 100%;
      padding: 16px;
      background: ${this.isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.15)'};
      border: 1px solid ${this.isDarkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.35)'};
      border-radius: 16px;
      color: ${this.isDarkMode ? '#ffffff' : '#1f2937'};
      font-size: 14px;
      outline: none;
      margin-bottom: 16px;
      box-sizing: border-box;
      transition: all 0.3s ease;
      font-family: inherit;
      backdrop-filter: blur(10px);
    `;
  }

  getModernButtonStyles(type) {
    const styles = {
      primary: `
        background: linear-gradient(135deg, #4f46e5, #4338ca);
        width: 100%;
        padding: 16px;
        font-size: 14px;
        font-weight: 600;
      `,
      secondary: `
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.2);
        flex: 1;
        padding: 12px;
        font-size: 13px;
        font-weight: 500;
        backdrop-filter: blur(8px);
      `,
      danger: `
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
      generate: 'linear-gradient(135deg, #4f46e5, #4338ca)', // Deep purple - 創造性
      modify: 'linear-gradient(135deg, #ec4899, #be185d)',    // Vibrant pink - 変更・調整
      delete: 'rgba(107, 114, 128, 0.15)'                    // 半透明グレー - セカンダリボタンスタイル
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

  /**
   * UI表示
   */
  show() {
    this.container.style.display = 'block';
    this.isVisible = true;
    this.input.focus();
    
    // コントロールを無効化
    this.onControlsToggle(true);
    // コントロール停止時も静かに
  }

  /**
   * UI非表示
   */
  hide() {
    this.container.style.display = 'none';
    this.isVisible = false;
    
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
      generate: 'linear-gradient(135deg, #4f46e5, #4338ca)',
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
      generate: '例: 右上にドラゴンを作って, 中央に大きなユニコーン, 空に飛ぶドラゴンの動画 (Enter: 送信)',
      import: 'ファイル選択ボタンを押すか、ファイル(.glb, .jpg, .png, .mp4)をドラッグ&ドロップ',
      modify: '例: ドラゴンを青色に変更, ユニコーンを大きくして (Enter: 送信)',
      delete: '例: ドラゴンを削除, 選択したオブジェクトを削除 (Enter: 送信)'
    };
    return placeholders[mode] || placeholders.generate;
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
    const mediaIcon = commandType.mediaType === 'video' ? '🎬' : '🖼️';
    // タスクカード作成
    const taskId = this.addTaskCard(command, { status: 'processing' });

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
        result = await this.handleImportCommand(command);
      } else if (this.sceneManager) {
        // 他のモード: SceneManager経由
        result = await this.sceneManager.executeCommand(fullCommand);
      } else if (this.client) {
        // モードに応じてAPIエンドポイントを選択
        if (this.currentMode === 'generate') {
          // 生成モード: 新しいオブジェクトを作成
          if (commandType.mediaType === 'video') {
            result = await this.client.generateVideo(command);
          } else {
            result = await this.client.generateImage(command);
          }
        } else if (this.currentMode === 'modify') {
          // 変更モード: 既存オブジェクトを変更（選択が必要）
          if (!this.selectedObject) {
            throw new Error('変更するオブジェクトが選択されていません。まず対象オブジェクトを選択してください。');
          }
          result = await this.client.modifySelectedObject(this.selectedObject, command);
        } else if (this.currentMode === 'delete') {
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

      // 成功メッセージ
      const successMessages = {
        generate: ``, // 成功メッセージ削除 - 結果で十分
        modify: '✅ 変更を適用しました',
        delete: '🗑️ 削除しました'
      };
      
      // タスクカード完了
      if (taskId) {
        this.updateTaskCard(taskId, 'completed');
      }
      
      // 詳細情報表示
      if (result.modelName) {
        // デバッグ情報削除 - モーダル表示用に保存
      }
      
      if (result.objectId) {
        // オブジェクトID削除
      }
      
      if (result.position) {
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
      // タスクカードエラー
      if (taskId) {
        this.updateTaskCard(taskId, 'error');
      }

      this.addOutput(`${errorMessages[this.currentMode]}: ${error.message}`, 'error');
      console.error('Command execution error:', error);
    }

    // 出力エリアを最下部にスクロール
    if (this.config.autoScroll) {
      this.scrollToBottom();
    }
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
        background: rgba(0, 0, 0, 0.75);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 2000;
        backdrop-filter: blur(8px);
      `;

      const dialog = document.createElement('div');
      dialog.style.cssText = `
        background: ${this.isDarkMode 
          ? 'linear-gradient(135deg, rgba(30, 30, 40, 0.95), rgba(20, 20, 30, 0.98))'
          : 'linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(240, 240, 255, 0.98))'};
        border: 1px solid ${this.isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)'};
        border-radius: 20px;
        padding: 32px;
        max-width: 420px;
        text-align: center;
        color: ${this.isDarkMode ? '#ffffff' : '#1f2937'};
        font-family: inherit;
        backdrop-filter: blur(16px);
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.3);
        transform: scale(0.9);
        opacity: 0;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      `;

      dialog.innerHTML = `
        <div style="font-size: 56px; margin-bottom: 20px;">${icon}</div>
        <h3 style="margin: 0 0 16px 0; color: ${confirmColor}; font-size: 20px; font-weight: 700;">
          ${title}
        </h3>
        <p style="margin: 0 0 28px 0; color: ${this.isDarkMode ? '#d1d5db' : '#6b7280'}; line-height: 1.6; font-size: 16px;">
          ${message}
        </p>
        <div style="display: flex; gap: 12px; justify-content: center;">
          <button id="cancel-btn" style="
            padding: 14px 24px;
            background: ${this.isDarkMode ? 'rgba(107, 114, 128, 0.3)' : 'rgba(156, 163, 175, 0.2)'};
            border: 1px solid ${this.isDarkMode ? 'rgba(107, 114, 128, 0.4)' : 'rgba(156, 163, 175, 0.3)'};
            border-radius: 12px;
            color: ${this.isDarkMode ? '#ffffff' : '#374151'};
            cursor: pointer;
            font-family: inherit;
            font-size: 14px;
            font-weight: 600;
            transition: all 0.2s ease;
            backdrop-filter: blur(8px);
          ">${cancelText}</button>
          <button id="confirm-btn" style="
            padding: 14px 24px;
            background: linear-gradient(135deg, ${confirmColor}, ${confirmColor}dd);
            border: none;
            border-radius: 12px;
            color: ${confirmColor === '#fbbf24' ? '#1f2937' : 'white'};
            cursor: pointer;
            font-family: inherit;
            font-size: 14px;
            font-weight: 700;
            transition: all 0.2s ease;
            box-shadow: 0 4px 12px ${confirmColor}44;
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
   * タスクカード追加
   */
  addTaskCard(taskInfo, options = {}) {
    if (!this.taskCards) this.taskCards = new Map();

    const taskId = options.taskId || `task_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const status = options.status || 'pending';
    const prompt = taskInfo.prompt || taskInfo.command || taskInfo;

    // プレースホルダー削除
    if (this.placeholder && this.placeholder.parentNode) {
      this.placeholder.remove();
    }

    const card = document.createElement('div');
    card.className = 'task-card';
    card.setAttribute('data-task-id', taskId);

    const cardStyles = this.getTaskCardStyles(status);
    card.style.cssText = cardStyles;

    const iconMap = {
      pending: '⏳',
      processing: '🎨',
      progress: '⚡',
      completed: '✅',
      error: '❌'
    };

    const statusText = {
      pending: '待機中',
      processing: '生成中',
      progress: '進行中',
      completed: '完了',
      error: 'エラー'
    };

    card.innerHTML = `
      <div class="task-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="task-icon" style="font-size: 16px;">${iconMap[status]}</span>
          <span class="task-status" style="font-weight: 600; font-size: 12px; color: ${this.getStatusColor(status)};">
            ${statusText[status]}
          </span>
        </div>
        <span class="task-time" style="font-size: 10px; color: ${this.isDarkMode ? '#9ca3af' : '#6b7280'};">
          ${new Date().toLocaleTimeString()}
        </span>
      </div>
      <div class="task-content" style="font-size: 13px; line-height: 1.4; margin-bottom: 8px;">
        ${prompt}
      </div>
      <div class="task-progress" style="display: ${status === 'progress' || status === 'processing' ? 'block' : 'none'};">
        ${this.createStatusIndicator(status)}
      </div>
    `;

    this.outputDiv.appendChild(card);
    this.taskCards.set(taskId, {
      element: card,
      status: status,
      prompt: prompt,
      startTime: Date.now()
    });

    this.scrollToBottom();
    return taskId;
  }

  /**
   * タスクカード更新
   */
  updateTaskCard(taskId, status, options = {}) {
    if (!this.taskCards || !this.taskCards.has(taskId)) return;

    const taskData = this.taskCards.get(taskId);
    const card = taskData.element;

    // ステータス更新
    taskData.status = status;

    const iconMap = {
      pending: '⏳',
      processing: '🎨',
      progress: '⚡',
      completed: '✅',
      error: '❌'
    };

    const statusText = {
      pending: '待機中',
      processing: '生成中',
      progress: '進行中',
      completed: '完了',
      error: 'エラー'
    };

    // アイコンとステータステキスト更新
    const icon = card.querySelector('.task-icon');
    const statusEl = card.querySelector('.task-status');
    if (icon) icon.textContent = iconMap[status];
    if (statusEl) {
      statusEl.textContent = statusText[status];
      statusEl.style.color = this.getStatusColor(status);
    }

    // ステータスインジケーター更新
    const progressDiv = card.querySelector('.task-progress');
    if (progressDiv) {
      progressDiv.style.display = (status === 'progress' || status === 'processing') ? 'block' : 'none';
      if (status === 'progress' || status === 'processing') {
        progressDiv.innerHTML = this.createStatusIndicator(status);
      }
    }

    // 完了時の演出
    if (status === 'completed') {
      this.animateTaskCompletion(card);

      // プログレスバーを非表示
      const progressDiv = card.querySelector('.task-progress');
      if (progressDiv) progressDiv.style.display = 'none';
    }

    // カードスタイル更新
    card.style.cssText = this.getTaskCardStyles(status);
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
            background: linear-gradient(90deg, transparent, #ec4899, #f472b6, transparent);
            height: 100%;
            width: 30%;
            border-radius: 8px;
            animation: statusPulse 1.8s ease-in-out infinite;
          "></div>
        </div>
        <div style="display: flex; align-items: center; gap: 4px; margin-top: 6px;">
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
      confirmColor: '#ef4444'
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
  }

  /**
   * テーマ切り替え
   */
  toggleTheme() {
    this.isDarkMode = !this.isDarkMode;
    localStorage.setItem('live-command-theme', this.isDarkMode ? 'dark' : 'light');

    // アイコンボタン更新
    if (this.themeToggle) {
      this.themeToggle.innerHTML = this.isDarkMode ? '☀️' : '🌙';
      this.themeToggle.title = this.isDarkMode ? 'ライトモードに切り替え' : 'ダークモードに切り替え';
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
    this.container.style.cssText = this.getContainerStyles();
    this.container.style.display = currentDisplay || 'block';

    // ヘッダー（タイトル）の再適用
    const header = this.container.querySelector('div:first-child');
    if (header) {
      header.style.cssText = this.getHeaderStyles();
    }

    // 入力フィールド
    this.input.style.cssText = this.getInputStyles();

    // スタイル適用
    this.output.style.cssText = this.getOutputStyles();

    // 旧モード表示は削除（ラジオボタンUIに統合済み）
    // this.commandTypeIndicator.style.cssText = this.getCommandTypeIndicatorStyles();

    // ボタン類の再適用
    this.container.querySelectorAll('button').forEach(btn => {
      if (btn.innerHTML.includes('Undo') || btn.innerHTML.includes('Redo') || 
          btn.innerHTML === 'Clear All' || btn.innerHTML === 'Light' || btn.innerHTML === 'Dark') {
        btn.style.cssText = this.getMinimalButtonStyles();
        // Undo/Redoボタンの状態を再適用
        if (btn === this.undoBtn || btn === this.redoBtn) {
          this.updateUndoRedoButtons();
        }
      }
    });

    // ラジオボタンモードセレクターのスタイル再適用
    if (this.radioModeContainer) {
      this.radioModeContainer.style.background = this.isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.1)';
      this.radioModeContainer.style.borderColor = this.isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.15)';

      // 各ラジオボタンのスタイル更新
      Object.keys(this.radioModeButtons).forEach(key => {
        const { button, radio } = this.radioModeButtons[key];
        if (this.currentMode !== key) {
          button.style.color = this.isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)';
          radio.style.borderColor = this.isDarkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)';
        }
      });

      // 現在選択されているモードのスタイルも更新
      this.selectMode(this.currentMode, false);
    }

    // 既存の出力テキストの色を更新
    this.updateExistingTextColors();
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
    // ファイル選択ボタンを作成（既存のものがなければ）
    if (!this.fileSelectButton) {
      this.fileSelectButton = document.createElement('button');
      this.fileSelectButton.innerHTML = '📁 ファイルを選択';
      this.fileSelectButton.style.cssText = `
        margin: 10px 0;
        padding: 10px 20px;
        background: linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%);
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.2s ease;
        width: 100%;
      `;

      // ホバー効果
      this.fileSelectButton.onmouseover = () => {
        this.fileSelectButton.style.transform = 'translateY(-1px)';
        this.fileSelectButton.style.boxShadow = '0 4px 12px rgba(236, 72, 153, 0.3)';
      };
      this.fileSelectButton.onmouseout = () => {
        this.fileSelectButton.style.transform = 'translateY(0)';
        this.fileSelectButton.style.boxShadow = 'none';
      };

      // ファイル選択処理
      this.fileSelectButton.onclick = () => this.openFileSelector();

      // 隠しファイル入力を作成
      if (!this.fileInput) {
        this.fileInput = document.createElement('input');
        this.fileInput.type = 'file';
        this.fileInput.accept = '.jpg,.jpeg,.png,.webp,.mp4,.mov,.webm';
        this.fileInput.style.display = 'none';
        this.fileInput.onchange = (e) => this.handleFileSelection(e);
        document.body.appendChild(this.fileInput);
      }
    }

    // 入力エリアの前にボタンを挿入
    if (this.input && this.input.parentNode && !this.input.parentNode.contains(this.fileSelectButton)) {
      this.input.parentNode.insertBefore(this.fileSelectButton, this.input);
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
   * ファイル選択処理
   */
  async handleFileSelection(event, fromDragDrop = false) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      // ファイルタイプを判定
      const fileType = this.detectFileType(file.name);

      // ファイルをローカルURLとして処理
      const fileUrl = URL.createObjectURL(file);

      // プロンプト入力を促す
      this.input.value = `中央に設置 (${file.name})`;
      this.input.focus();

      // ファイル情報を保存
      this.selectedFile = {
        file: file,
        url: fileUrl,
        type: fileType,
        name: file.name
      };

      this.selectMode('import', true);

      // ドラッグ&ドロップからの場合はメッセージを表示しない
      if (!fromDragDrop) {
        this.addOutput(`📁 ファイル選択: ${file.name} (${fileType})`, 'system');

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

    // 既にバインドされている場合は何もしない
    if (this.boundHandlers.dragOver) return;

    // ハンドラをバインドして保存
    this.boundHandlers.dragOver = this.handleDragOver.bind(this);
    this.boundHandlers.drop = this.handleDrop.bind(this);
    this.boundHandlers.dragEnter = this.handleDragEnter.bind(this);
    this.boundHandlers.dragLeave = this.handleDragLeave.bind(this);
    this.boundHandlers.documentDragOver = (e) => {
      // 入力エリア以外では防止
      if (e.target !== this.input && !this.input?.contains(e.target)) {
        e.preventDefault();
        e.dataTransfer.effectAllowed = 'none';
        e.dataTransfer.dropEffect = 'none';
      }
    };
    this.boundHandlers.documentDrop = (e) => {
      // 入力エリア以外では防止
      if (e.target !== this.input && !this.input?.contains(e.target)) {
        e.preventDefault();
      }
    };

    // イベントリスナーを追加
    this.input.addEventListener('dragover', this.boundHandlers.dragOver);
    this.input.addEventListener('drop', this.boundHandlers.drop);
    this.input.addEventListener('dragenter', this.boundHandlers.dragEnter);
    this.input.addEventListener('dragleave', this.boundHandlers.dragLeave);

    // document全体でのデフォルト動作を防止（キャプチャフェーズで処理）
    document.addEventListener('dragover', this.boundHandlers.documentDragOver, true);
    document.addEventListener('drop', this.boundHandlers.documentDrop, true);
    document.addEventListener('dragenter', this.boundHandlers.documentDragOver, true);
    document.addEventListener('dragleave', this.boundHandlers.documentDragOver, true);
  }

  /**
   * ドラッグ&ドロップ機能を無効化
   */
  disableDragAndDrop() {
    if (!this.input) return;
    if (!this.boundHandlers.dragOver) return;

    // 保存されたハンドラを使用して削除
    this.input.removeEventListener('dragover', this.boundHandlers.dragOver);
    this.input.removeEventListener('drop', this.boundHandlers.drop);
    this.input.removeEventListener('dragenter', this.boundHandlers.dragEnter);
    this.input.removeEventListener('dragleave', this.boundHandlers.dragLeave);
    
    // documentレベルのイベントも削除（キャプチャフェーズ）
    document.removeEventListener('dragover', this.boundHandlers.documentDragOver, true);
    document.removeEventListener('drop', this.boundHandlers.documentDrop, true);
    document.removeEventListener('dragenter', this.boundHandlers.documentDragOver, true);
    document.removeEventListener('dragleave', this.boundHandlers.documentDragOver, true);

    // ハンドラをクリア
    this.boundHandlers.dragOver = null;
    this.boundHandlers.drop = null;
    this.boundHandlers.dragEnter = null;
    this.boundHandlers.dragLeave = null;
    this.boundHandlers.documentDragOver = null;
    this.boundHandlers.documentDrop = null;
  }

  /**
   * ドラッグオーバー処理
   */
  handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    this.input.style.background = this.isDarkMode ? 'rgba(236, 72, 153, 0.1)' : 'rgba(236, 72, 153, 0.05)';
  }

  /**
   * ドラッグエンター処理
   */
  handleDragEnter(e) {
    e.preventDefault();
    e.stopPropagation();
    this.input.style.background = this.isDarkMode ? 'rgba(236, 72, 153, 0.1)' : 'rgba(236, 72, 153, 0.05)';
  }

  /**
   * ドラッグリーブ処理
   */
  handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    this.input.style.background = '';
  }

  /**
   * ドロップ処理
   */
  async handleDrop(e) {
    console.log('🎯 Drop event triggered');
    e.preventDefault();
    e.stopPropagation();
    this.input.style.background = '';

    const files = Array.from(e.dataTransfer.files);
    console.log('📁 Dropped files:', files.length, files.map(f => f.name));
    if (files.length === 0) return;

    const file = files[0]; // 最初のファイルのみ処理

    // ファイルタイプをチェック
    const fileType = this.detectFileType(file.name);
    if (!fileType) {
      this.addOutput('❌ サポートされていないファイル形式です', 'error');
      return;
    }

    // ファイル選択処理と同じ流れ（ドラッグ&ドロップフラグをtrueで渡す）
    this.handleFileSelection({ target: { files: [file] } }, true);
  }

  /**
   * ファイルタイプ判定
   */
  detectFileType(fileName) {
    const ext = fileName.toLowerCase().split('.').pop();

    // 3Dファイルは現在サポート対象外
    // if (['glb', 'gltf'].includes(ext)) return '3d';
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
            });
          } else {
            throw new Error('SceneManager が利用できません');
          }
          break;

        case 'image':
          // 画像をテクスチャプレーンとして配置
          if (this.sceneManager) {
            result = await this.sceneManager.loadImageFile(this.selectedFile.url, {
              position: position
            });
          } else {
            throw new Error('SceneManager が利用できません');
          }
          break;

        case 'video':
          // 動画をビデオテクスチャとして配置
          if (this.sceneManager) {
            result = await this.sceneManager.loadVideoFile(this.selectedFile.url, {
              position: position
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
      URL.revokeObjectURL(this.selectedFile.url);
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
    // SceneManagerから選択されたオブジェクトを取得
    const selectedObject = this.sceneManager?.selectedObject;
    
    if (selectedObject) {
      // 選択されたオブジェクトがある場合：削除コマンドをチャット欄に入力
      const objectName = selectedObject.userData?.originalPrompt || selectedObject.name || '選択したオブジェクト';
      this.input.value = `${objectName}を削除`;
      this.input.focus();
      
      // カーソルを文末に移動（選択状態を解除）
      this.input.setSelectionRange(this.input.value.length, this.input.value.length);
      
      this.addOutput(`🎯 削除対象: ${objectName}`, 'system');
    } else {
      // 選択されたオブジェクトがない場合：選択を促すメッセージをチャット欄に表示
      this.input.value = '';
      this.addOutput('❗ 削除するオブジェクトを選択後、削除ボタンを押してください', 'system');
      
      // generateモードに戻す（選択を促すため）
      this.selectMode('generate', false);
    }
  }

  dispose() {
    // ファイル選択関連のクリーンアップ
    if (this.fileInput && this.fileInput.parentNode) {
      this.fileInput.parentNode.removeChild(this.fileInput);
    }
    if (this.selectedFile && this.selectedFile.url) {
      URL.revokeObjectURL(this.selectedFile.url);
    }

    if (this.container && this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }
}
