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
    const extraHighlights = [];

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
      default:
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
