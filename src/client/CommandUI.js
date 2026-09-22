import { GuidedOnboarding } from './onboarding/GuidedOnboarding.js';

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
      this.setServiceSelectorStatus('外部の生成サービスを利用できません。生成済みの画像・動画・GLBはImportから配置できます。', 'info');
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

    if (!this.input || this.isComposing) {
      return;
    }

    const text = this.input.value;
    if (!text.trim()) {
      this.clearKeywordHighlighting();
      return;
    }

    // Get all keyword patterns
    const allKeywords = this.getAllCommandKeywords();
    
    // Find matches in the text
    const matches = [];
    for (const { pattern, keyword, type } of allKeywords) {
      const match = text.match(pattern);
      if (match) {
        const startIndex = match.index;
        const endIndex = startIndex + match[0].length;
        matches.push({
          start: startIndex,
          end: endIndex,
          keyword: match[0], // Use actual matched text
          type: type
        });
      }
    }

    // Sort matches by position to avoid overlaps
    matches.sort((a, b) => a.start - b.start);

    // Apply highlighting if we have matches
    if (matches.length > 0) {
      this.createHighlightOverlay(text, matches);
    } else {
      this.clearKeywordHighlighting();
    }
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

    const statusText = {
      pending: '待機中',
      processing: '生成中',
      progress: '進行中',
      completed: '完了',
      error: 'エラー'
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
        this.showInputFeedback('サーバーに接続できません。`npm run dev:server` でローカルサーバーを起動してください。', 'error');
        this.addOutput('📡 サーバーに接続できません。`npm run dev:server` でローカルサーバーを起動してください。', 'error');
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
    message.textContent = 'ローカルで起動している ChocoDrop サーバー（Express）に接続できません。ターミナルで `npm run dev:server` を実行し、サーバーが起動していることを確認してください。';

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

    const message = error?.message || 'この生成操作に必要な外部サービスが設定されていません。';
    const guidance = '現在の公開手順ではChocoDrop内から素材を生成しません。画像・動画・GLBを用意し、Importから配置してください。';
    this.showInputFeedback('生成済みのファイルをImportから選んでください。', 'info');
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
      const visibleCards = allCards.slice(0, maxVisibleCards); // 最初の3個（最新）
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
