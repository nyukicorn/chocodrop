const DEFAULT_STORAGE_KEY = 'chocodrop:onboarding:v2025';
const ONBOARDING_VERSION = '2025.10';

export class GuidedOnboarding {
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
        id: 'image-lab',
        label: 'ビジュアル実験',
        emoji: '🎨',
        description: 'まずは生成タブで印象的なメインオブジェクトを置き、雰囲気を掴みましょう。',
        prompt: '右上にネオンライトが光るドラゴンを大きく浮かべ、中央に透明なガラス床を追加してください。',
        mode: 'generate'
      },
      {
        id: 'atmos-sculpt',
        label: '雰囲気演出',
        emoji: '🌌',
        description: '動画・アニメーション系の演出で空気感を整え、没入感を高めます。',
        prompt: '空一面にゆっくりと揺れるオーロラを追加し、地面に柔らかな朝靄を漂わせてください。',
        mode: 'generate'
      },
      {
        id: 'remix-pro',
        label: '既存シーン磨き',
        emoji: '🛠️',
        description: '既に配置済みのオブジェクトを自然言語で微調整し、質感を整えます。',
        prompt: '中央のメインオブジェクトに暖色系のライトを強め、背景には細かな雪のパーティクルを追加してください。',
        mode: 'modify'
      }
    ];

    this.steps = [
      { id: 'persona', title: 'ChocoDropへようこそ', type: 'choice' },
      { id: 'service', title: 'サービス接続を整える', type: 'service' },
      { id: 'prompt', title: '最初のコマンドを仕上げる', type: 'prompt' },
      { id: 'execute', title: '実験を走らせる', type: 'execute' },
      { id: 'next', title: '次のステップ', type: 'next' }
    ];

    this.backdrop = null;
    this.focusRing = null;
    this.panel = null;
    this.titleEl = null;
    this.bodyEl = null;
    this.primaryButton = null;
    this.secondaryButton = null;
    this.skipButton = null;
    this.progressBar = null;

    this.currentHighlightTarget = null;
    this.updateFocusRingPosition = this.updateFocusRingPosition.bind(this);

    // Detect background brightness before initializing DOM for correct initial colors
    this.detectBackgroundBrightness();
    this.initDom();

    window.addEventListener('resize', this.updateFocusRingPosition);
    window.addEventListener('scroll', this.updateFocusRingPosition, true);
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
      window.localStorage?.setItem(this.storageKey, JSON.stringify({
        completed: true,
        version: ONBOARDING_VERSION,
        completedAt: new Date().toISOString(),
        persona: this.state.persona,
        ...meta
      }));
    } catch (_) {
      // ストレージが使えない環境では黙って継続
    }
  }

  registerLauncher(element) {
    if (!element) return;
    element.addEventListener('click', () => this.start({ force: true }));
  }

  initDom() {
    const colors = this.getAdaptiveColors();

    this.backdrop = document.createElement('div');
    this.backdrop.id = 'chocodrop-onboarding';
    this.backdrop.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 1600;
      display: none;
      pointer-events: none;
      background: ${this.theme.isDark ? 'rgba(0, 0, 0, 0.45)' : 'rgba(255, 255, 255, 0.45)'};
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      opacity: 0;
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
    `;

    const panelWrapper = document.createElement('div');
    panelWrapper.style.cssText = `
      position: fixed;
      bottom: 28px;
      left: 50%;
      transform: translateX(-50%);
      max-width: min(420px, 92vw);
      pointer-events: auto;
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
      overflow: hidden;
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
    header.style.cssText = 'display: flex; flex-direction: column; gap: 10px; position: relative; z-index: 2;';

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
    `;

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

    header.appendChild(this.titleEl);
    header.appendChild(this.progressBar);

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

    buttonRow.appendChild(this.secondaryButton);
    buttonRow.appendChild(this.primaryButton);

    this.skipButton = document.createElement('button');
    this.skipButton.type = 'button';
    this.skipButton.textContent = 'スキップ';
    this.skipButton.style.cssText = `
      position: absolute;
      top: 16px;
      right: 20px;
      border: none;
      background: transparent;
      color: ${colors.textSecondary};
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      text-decoration: none;
      padding: 6px 10px;
      border-radius: 8px;
      transition: all 0.2s ease;
      z-index: 3;
      opacity: 0.7;
    `;
    this.skipButton.addEventListener('mouseenter', () => {
      this.skipButton.style.background = this.theme.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)';
      this.skipButton.style.opacity = '1';
    });
    this.skipButton.addEventListener('mouseleave', () => {
      this.skipButton.style.background = 'transparent';
      this.skipButton.style.opacity = '0.7';
    });
    this.skipButton.addEventListener('click', () => this.complete('skipped'));

    this.panel.appendChild(this.skipButton);
    this.panel.appendChild(header);
    this.panel.appendChild(bodyWrapper);
    this.panel.appendChild(buttonRow);

    panelWrapper.appendChild(this.panel);
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

    // Re-detect background brightness when starting
    this.detectBackgroundBrightness();

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

    this.titleEl.textContent = step.title;
    const progress = ((this.state.stepIndex + 1) / this.steps.length) * 100;
    this.progressValue.style.width = `${progress}%`;

    this.bodyEl.innerHTML = '';
    this.secondaryButton.style.display = 'none';
    this.secondaryButton.textContent = '';
    this.secondaryButton.onclick = null;

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
    intro.textContent = '目的に合わせたおすすめフローを選ぶと、初回のセットアップが最短ルートになります。';
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
        if (typeof this.options.onSelectMode === 'function') {
          this.options.onSelectMode(option.mode);
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
      });

      const title = document.createElement('div');
      title.style.cssText = `
        font-weight: 700;
        font-size: 15px;
        display: flex;
        align-items: center;
        gap: 8px;
        color: ${colors.textPrimary};
        position: relative;
        z-index: 1;
      `;
      title.innerHTML = `<span style="font-size: 20px;">${option.emoji}</span> ${option.label}`;

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

    const description = document.createElement('div');
    description.innerHTML = `
      <p style="margin:0; color:${colors.textSecondary}; line-height:1.6;">画像・動画サービスが未設定の場合は、⚙️の設定ボタンから接続を完了してください。</p>
      <ul style="margin:12px 0 0 20px; padding:0; font-size:14px; line-height:1.7; opacity:0.85; color:${colors.textSecondary};">
        <li style="margin-bottom:6px;">候補の中から空きリソースのサービスを選択</li>
        <li>保存後、入力欄の下にステータスが表示されます</li>
      </ul>
    `;
    this.bodyEl.appendChild(description);

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

    const lead = document.createElement('p');
    lead.style.cssText = `margin: 0; color: ${colors.textSecondary}; line-height: 1.6;`;
    lead.textContent = '自然言語で意図を伝え、フェイルセーフ付きでシーンを生成します。';
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
    `;
    const promptText = this.state.samplePrompt || this.personaOptions[0].prompt;
    promptPreview.textContent = promptText;
    this.bodyEl.appendChild(promptPreview);

    const note = document.createElement('p');
    note.style.cssText = `font-size: 13px; margin: 0; opacity: 0.8; color: ${colors.textSecondary};`;
    note.textContent = '必要であれば細かな指示（サイズ・位置・マテリアル）を追加してください。';
    this.bodyEl.appendChild(note);

    const buttonTextSpan = this.primaryButton.querySelector('span');
    if (buttonTextSpan) {
      buttonTextSpan.textContent = 'プロンプトを挿入';
    }
    this.primaryButton.disabled = false;
    this.primaryButton.style.opacity = '1';
    this.primaryButton.style.cursor = 'pointer';
    this.primaryButton.onclick = () => {
      if (typeof this.options.onInsertPrompt === 'function') {
        this.options.onInsertPrompt(promptText, this.state.persona);
      }
      this.state.hasInsertedPrompt = true;
      this.nextStep();
    };

    this.secondaryButton.style.display = 'inline-flex';
    this.secondaryButton.textContent = '自分で入力する';
    this.secondaryButton.onclick = () => this.nextStep();

    this.currentHighlightTarget = typeof this.options.inputElement === 'function'
      ? this.options.inputElement()
      : this.options.inputElement || null;
  }

  renderExecuteStep() {
    const colors = this.getAdaptiveColors();

    const description = document.createElement('div');
    description.innerHTML = `
      <p style="margin:0; color:${colors.textSecondary}; line-height:1.6;">準備が整ったら実行ボタンでタスクを開始し、ステータスカードで進捗を確認します。</p>
      <p style="margin:12px 0 0 0; font-size:13px; opacity:0.8; color:${colors.textSecondary};">最初の生成は数十秒かかる場合があります。カードに結果が届いたら、Undo/Redoで微調整しましょう。</p>
    `;
    this.bodyEl.appendChild(description);

    const buttonTextSpan = this.primaryButton.querySelector('span');
    if (buttonTextSpan) {
      buttonTextSpan.textContent = '実行しました';
    }
    this.primaryButton.disabled = false;
    this.primaryButton.style.opacity = '1';
    this.primaryButton.style.cursor = 'pointer';
    this.primaryButton.onclick = () => this.nextStep();

    this.secondaryButton.style.display = 'inline-flex';
    this.secondaryButton.textContent = '実行ボタンをハイライト';
    this.secondaryButton.onclick = () => {
      this.updateFocusRing(typeof this.options.executeButton === 'function'
        ? this.options.executeButton()
        : this.options.executeButton || null);
    };

    this.currentHighlightTarget = typeof this.options.executeButton === 'function'
      ? this.options.executeButton()
      : this.options.executeButton || null;
  }

  renderNextStep() {
    const colors = this.getAdaptiveColors();

    const summary = document.createElement('div');
    summary.innerHTML = `
      <p style="margin:0; color:${colors.textSecondary}; line-height:1.6;">お疲れさまでした。次は以下を試してみましょう。</p>
      <ul style="margin:12px 0 0 20px; padding:0; font-size:14px; line-height:1.7; opacity:0.85; color:${colors.textSecondary};">
        <li style="margin-bottom:6px;">モード切替で既存オブジェクトをリライト</li>
        <li style="margin-bottom:6px;">⚙️からサービスを追加登録し、シーンごとに切り替え</li>
        <li>🍫アイコン右クリックでショートカットを確認</li>
      </ul>
    `;
    this.bodyEl.appendChild(summary);

    const buttonTextSpan = this.primaryButton.querySelector('span');
    if (buttonTextSpan) {
      buttonTextSpan.textContent = 'ガイドを終了';
    }
    this.primaryButton.disabled = false;
    this.primaryButton.style.opacity = '1';
    this.primaryButton.style.cursor = 'pointer';
    this.primaryButton.onclick = () => this.complete('finished');

    this.secondaryButton.style.display = 'none';

    this.currentHighlightTarget = null;
  }

  nextStep() {
    this.state.stepIndex += 1;
    if (this.state.stepIndex >= this.steps.length) {
      this.complete('finished');
    } else {
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
    if (!this.active) {
      this.focusRing.style.opacity = '0';
      return;
    }

    const target = this.currentHighlightTarget;
    if (!target) {
      this.focusRing.style.opacity = '0';
      return;
    }

    const rect = target.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      this.focusRing.style.opacity = '0';
      return;
    }

    this.focusRing.style.opacity = '1';
    this.focusRing.style.transform = `translate(${rect.left - 12}px, ${rect.top - 12}px)`;
    this.focusRing.style.width = `${rect.width + 24}px`;
    this.focusRing.style.height = `${rect.height + 24}px`;
  }

  complete(status = 'finished') {
    if (!this.active) {
      return;
    }

    this.active = false;
    this.hasCompleted = true;
    this.storeCompletion({ status, insertedPrompt: this.state.hasInsertedPrompt });

    // Add exit animation
    const panelWrapper = this.panel.parentElement;
    if (panelWrapper) {
      panelWrapper.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 1, 1)';
      panelWrapper.style.transform = 'translateX(-50%) translateY(60px)';
      panelWrapper.style.opacity = '0';
    }

    this.backdrop.style.opacity = '0';
    this.focusRing.style.opacity = '0';

    setTimeout(() => {
      this.backdrop.style.display = 'none';
      this.currentHighlightTarget = null;
    }, 400);

    if (typeof this.options.onComplete === 'function') {
      this.options.onComplete({ status, persona: this.state.persona });
    }
  }
}
