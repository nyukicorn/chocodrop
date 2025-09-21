const IMAGE_SERVICE_STORAGE_KEY = 'chocodrop-service-image';
const VIDEO_SERVICE_STORAGE_KEY = 'chocodrop-service-video';

/**
 * Command UI - Web interface for ChocoDrop System
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
    this.pendingImageService = null;
    this.pendingVideoService = null;

    try {
      const storedImage = localStorage.getItem(IMAGE_SERVICE_STORAGE_KEY);
      const storedVideo = localStorage.getItem(VIDEO_SERVICE_STORAGE_KEY);
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

    this.applyServiceSelectionToSceneManager();

    // ダークモード状態管理
    this.isDarkMode = localStorage.getItem('live-command-theme') === 'dark' ||
                     localStorage.getItem('live-command-theme') === null; // デフォルトはダーク
    
    // Undo/Redo システム
    this.commandHistory = [];
    this.currentHistoryIndex = -1;
    this.maxHistorySize = 50; // 最大コマンド保存数
    
    this.initUI();
    this.bindEvents();

    if (!this.client && this.sceneManager && this.sceneManager.client) {
      this.client = this.sceneManager.client;
    }

    this.createServiceModal();

    // DOM読み込み完了後にスタイルを確実に適用
    document.addEventListener('DOMContentLoaded', () => {
      this.refreshStyles();
    });

    this.logDebug('🎮 CommandUI initialized');

    if (!this.selectedImageService || !this.selectedVideoService) {
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
   * UI要素の作成と配置
   */
  initUI() {
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
    headerText.textContent = '🌉 ChocoDrop';
    header.appendChild(headerText);
    
    const controlButtonStyles = `
      background: transparent;
      border: none;
      font-size: 18px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 8px;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-left: 4px;
    `;

    const settingsButton = document.createElement('button');
    settingsButton.style.cssText = controlButtonStyles;
    settingsButton.innerHTML = '⚙️';
    settingsButton.title = 'サービス設定を開く';
    settingsButton.addEventListener('mouseenter', () => {
      settingsButton.style.background = this.isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(99, 102, 241, 0.15)';
    });
    settingsButton.addEventListener('mouseleave', () => {
      settingsButton.style.background = 'transparent';
    });
    settingsButton.addEventListener('click', () => this.openServiceModal());
    this.settingsButton = settingsButton;

    const themeToggle = document.createElement('button');
    themeToggle.style.cssText = controlButtonStyles;
    themeToggle.innerHTML = this.isDarkMode ? '☀️' : '🌙';
    themeToggle.title = this.isDarkMode ? 'ライトモードに切り替え' : 'ダークモードに切り替え';
    
    themeToggle.addEventListener('mouseenter', () => {
      themeToggle.style.background = this.isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(99, 102, 241, 0.15)';
    });
    themeToggle.addEventListener('mouseleave', () => {
      themeToggle.style.background = 'transparent';
    });
    
    themeToggle.addEventListener('click', () => this.toggleTheme());
    this.themeToggle = themeToggle;

    const headerControls = document.createElement('div');
    headerControls.style.cssText = 'display: flex; align-items: center; gap: 4px;';
    headerControls.appendChild(settingsButton);
    headerControls.appendChild(themeToggle);

    header.appendChild(headerControls);

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
      top: 20px;
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
    // this.container.appendChild(this.output); // 大きなタスク表示エリアをDOMに追加しない
    this.container.appendChild(modeSelector);
    this.container.appendChild(this.input);
    this.container.appendChild(actionContainer);

    // フローティングカードコンテナをbodyに直接追加
    document.body.appendChild(this.floatingContainer);

    // DOM に追加
    document.body.appendChild(this.container);

    // 初回テーマ適用
    console.log('🚀 CommandUI initialization - applying initial theme');
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
      this.updateServiceSelectorTheme();
      return;
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
        ? 'linear-gradient(135deg, rgba(17, 24, 39, 0.92), rgba(30, 41, 59, 0.85))'
        : 'linear-gradient(135deg, rgba(255, 255, 255, 0.92), rgba(229, 231, 255, 0.85))';
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
      generate: 'linear-gradient(135deg, #6b21f0, #5b11d0)',
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
    const typeLabels = {
      generate: '🎨 生成モード',
      modify: '✏️ 変更モード',
      delete: '🗑️ 削除モード'
    };
    
    const typeColors = {
      generate: 'linear-gradient(135deg, #6b21f0, #5b11d0)',
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

    return `
      position: fixed;
      ${positions[this.config.position] || positions['bottom-right']}
      width: 320px;
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
      padding: 16px !important;
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
        background: linear-gradient(135deg, #6b21f0, #5b11d0);
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
      generate: 'linear-gradient(135deg, #6b21f0, #5b11d0)', // Deep purple - 創造性
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
      generate: 'linear-gradient(135deg, #6b21f0, #5b11d0)',
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
        <div style="display: flex; gap: 8px; justify-content: center;">
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

    const statusText = {
      pending: '待機中',
      processing: '生成中',
      progress: '進行中',
      completed: '完了',
      error: 'エラー'
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
      contentType: 'image', // 'image', 'video', etc.
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
    const baseColor = this.isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.12)';
    const borderColor = this.isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.15)';
    const textColor = this.isDarkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.85)';

    return `
      height: 32px;
      padding: 0 16px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: ${baseColor};
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid ${borderColor};
      border-radius: 16px;
      color: ${textColor};
      pointer-events: auto;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-weight: 500;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
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
      const visibleCards = allCards.slice(-maxVisibleCards); // 最新3個
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
   * 温かみのあるメッセージを生成（マーケ提案ベース）
   */
  getFriendlyMessage(status, prompt) {
    const shortPrompt = prompt.length > 15 ? prompt.substring(0, 15) + '...' : prompt;

    switch (status) {
      case 'pending':
        return '魔法をかけようとしています...';
      case 'processing':
      case 'in-progress':
      case 'progress':
        return 'あなただけの世界を創作中...';
      case 'completed':
        return '素敵な世界が完成しました！';
      case 'error':
        return `${shortPrompt} - もう一度試してみませんか？`;
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
            background: linear-gradient(90deg, transparent, #ec4899, #f472b6, transparent);
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
    this.applyServiceSelectionToSceneManager();
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
    console.log('🎨 CommandUI toggleTheme called - before:', this.isDarkMode);
    this.isDarkMode = !this.isDarkMode;
    console.log('🎨 CommandUI toggleTheme - after:', this.isDarkMode);
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
    console.log('🔧 CommandUI applyTheme called - isDarkMode:', this.isDarkMode);
    console.log('🔧 Before: document.body.className =', document.body.className);
    
    // ボディにテーマクラスを設定しない（メインページのスタイルを壊さないため）
    // document.body.className = this.isDarkMode ? 'dark-mode' : 'light-mode';
    
    console.log('🔧 After: document.body.className =', document.body.className, '(unchanged)');

    // メインコンテナ（display状態を保持）
    const currentDisplay = this.container.style.display;
    this.container.style.cssText = this.getContainerStyles();
    this.container.style.display = currentDisplay || 'flex';

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

    this.updateServiceSelectorTheme();

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
          const baseColor = this.isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.12)';
          const borderColor = this.isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.15)';
          const textColor = this.isDarkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.85)';

          card.style.setProperty('background', baseColor, 'important');
          card.style.setProperty('border-color', borderColor, 'important');
          card.style.setProperty('color', textColor, 'important');
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
        this.fileInput.accept = '.glb,.gltf,.jpg,.jpeg,.png,.mp4,.mov';
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
  async handleFileSelection(event) {
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
