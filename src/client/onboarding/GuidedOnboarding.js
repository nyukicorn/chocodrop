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

    this.initDom();
    window.addEventListener('resize', this.updateFocusRingPosition);
    window.addEventListener('scroll', this.updateFocusRingPosition, true);
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
    this.backdrop = document.createElement('div');
    this.backdrop.id = 'chocodrop-onboarding';
    this.backdrop.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 1600;
      display: none;
      pointer-events: none;
      background: rgba(15, 23, 42, 0.35);
      transition: opacity 0.3s ease;
      opacity: 0;
    `;

    this.focusRing = document.createElement('div');
    this.focusRing.style.cssText = `
      position: fixed;
      pointer-events: none;
      border: 2px solid rgba(99, 102, 241, 0.95);
      box-shadow: 0 18px 40px rgba(99, 102, 241, 0.35), 0 0 0 12px rgba(99, 102, 241, 0.15);
      border-radius: 20px;
      opacity: 0;
      transition: all 0.25s ease;
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
      background: linear-gradient(135deg, rgba(30, 27, 75, 0.92), rgba(99, 102, 241, 0.9));
      color: #f9fafb;
      border-radius: 20px;
      padding: 20px 22px;
      box-shadow: 0 30px 60px rgba(17, 24, 39, 0.45);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', sans-serif;
      display: flex;
      flex-direction: column;
      gap: 16px;
    `;

    const header = document.createElement('div');
    header.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

    this.titleEl = document.createElement('h3');
    this.titleEl.style.cssText = `
      margin: 0;
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 0.02em;
    `;

    this.progressBar = document.createElement('div');
    this.progressBar.style.cssText = `
      position: relative;
      width: 100%;
      height: 4px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.15);
      overflow: hidden;
    `;

    this.progressValue = document.createElement('div');
    this.progressValue.style.cssText = `
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #facc15, #22d3ee);
      transition: width 0.3s ease;
    `;
    this.progressBar.appendChild(this.progressValue);

    header.appendChild(this.titleEl);
    header.appendChild(this.progressBar);

    const bodyWrapper = document.createElement('div');
    bodyWrapper.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';
    this.bodyEl = document.createElement('div');
    this.bodyEl.style.cssText = 'display: flex; flex-direction: column; gap: 12px; font-size: 14px; line-height: 1.5;';
    bodyWrapper.appendChild(this.bodyEl);

    const buttonRow = document.createElement('div');
    buttonRow.style.cssText = 'display: flex; gap: 12px; align-items: center; justify-content: flex-end; flex-wrap: wrap;';

    this.primaryButton = document.createElement('button');
    this.primaryButton.type = 'button';
    this.primaryButton.style.cssText = `
      padding: 10px 18px;
      border-radius: 12px;
      border: none;
      font-weight: 600;
      cursor: pointer;
      font-size: 14px;
      background: linear-gradient(135deg, #facc15, #22d3ee);
      color: #0f172a;
      box-shadow: 0 12px 30px rgba(14, 116, 144, 0.35);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    `;
    this.primaryButton.addEventListener('mouseenter', () => {
      this.primaryButton.style.transform = 'translateY(-1px)';
      this.primaryButton.style.boxShadow = '0 16px 36px rgba(14, 116, 144, 0.45)';
    });
    this.primaryButton.addEventListener('mouseleave', () => {
      this.primaryButton.style.transform = 'translateY(0)';
      this.primaryButton.style.boxShadow = '0 12px 30px rgba(14, 116, 144, 0.35)';
    });

    this.secondaryButton = document.createElement('button');
    this.secondaryButton.type = 'button';
    this.secondaryButton.style.cssText = `
      padding: 8px 14px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.35);
      background: transparent;
      color: rgba(255, 255, 255, 0.85);
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: none;
    `;
    this.secondaryButton.addEventListener('mouseenter', () => {
      this.secondaryButton.style.background = 'rgba(255, 255, 255, 0.12)';
    });
    this.secondaryButton.addEventListener('mouseleave', () => {
      this.secondaryButton.style.background = 'transparent';
    });

    buttonRow.appendChild(this.secondaryButton);
    buttonRow.appendChild(this.primaryButton);

    this.skipButton = document.createElement('button');
    this.skipButton.type = 'button';
    this.skipButton.textContent = 'スキップ';
    this.skipButton.style.cssText = `
      position: absolute;
      top: 12px;
      right: 16px;
      border: none;
      background: transparent;
      color: rgba(255, 255, 255, 0.6);
      font-size: 12px;
      cursor: pointer;
      text-decoration: underline;
    `;
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

    if (typeof this.options.onRequestShow === 'function') {
      this.options.onRequestShow();
    }

    this.backdrop.style.display = 'block';

    requestAnimationFrame(() => {
      this.backdrop.style.opacity = '1';
      this.renderCurrentStep();
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
    const intro = document.createElement('p');
    intro.textContent = '目的に合わせたおすすめフローを選ぶと、初回のセットアップが最短ルートになります。';
    this.bodyEl.appendChild(intro);

    const grid = document.createElement('div');
    grid.style.cssText = 'display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));';

    this.personaOptions.forEach(option => {
      const card = document.createElement('button');
      card.type = 'button';
      card.dataset.persona = option.id;
      card.style.cssText = `
        text-align: left;
        border-radius: 14px;
        border: 1px solid rgba(255, 255, 255, 0.25);
        background: rgba(15, 23, 42, 0.3);
        color: inherit;
        padding: 12px;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        flex-direction: column;
        gap: 8px;
      `;

      if (this.state.persona === option.id) {
        card.style.border = '1px solid rgba(250, 204, 21, 0.8)';
        card.style.background = 'rgba(250, 204, 21, 0.15)';
        card.style.boxShadow = '0 12px 24px rgba(250, 204, 21, 0.25)';
      }

      card.addEventListener('mouseenter', () => {
        card.style.transform = 'translateY(-2px)';
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = 'translateY(0)';
      });

      card.addEventListener('click', () => {
        this.state.persona = option.id;
        this.state.samplePrompt = option.prompt;
        this.state.hasInsertedPrompt = false;
        if (typeof this.options.onSelectMode === 'function') {
          this.options.onSelectMode(option.mode);
        }
        Array.from(grid.children).forEach(child => {
          child.style.border = '1px solid rgba(255, 255, 255, 0.25)';
          child.style.background = 'rgba(15, 23, 42, 0.3)';
          child.style.boxShadow = 'none';
        });
        card.style.border = '1px solid rgba(250, 204, 21, 0.8)';
        card.style.background = 'rgba(250, 204, 21, 0.15)';
        card.style.boxShadow = '0 12px 24px rgba(250, 204, 21, 0.25)';
        this.primaryButton.disabled = false;
        this.primaryButton.style.opacity = '1';
        this.primaryButton.textContent = '次へ';
      });

      const title = document.createElement('div');
      title.style.cssText = 'font-weight: 700; font-size: 14px; display: flex; align-items: center; gap: 8px;';
      title.innerHTML = `${option.emoji} ${option.label}`;

      const desc = document.createElement('div');
      desc.style.cssText = 'font-size: 12px; line-height: 1.5; opacity: 0.8;';
      desc.textContent = option.description;

      card.appendChild(title);
      card.appendChild(desc);
      grid.appendChild(card);
    });

    this.bodyEl.appendChild(grid);

    this.primaryButton.textContent = this.state.persona ? '次へ' : '選択してください';
    this.primaryButton.disabled = !this.state.persona;
    this.primaryButton.style.opacity = this.state.persona ? '1' : '0.55';
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
    const description = document.createElement('div');
    description.innerHTML = `
      <p style="margin:0">画像・動画サービスが未設定の場合は、⚙️の設定ボタンから接続を完了してください。</p>
      <ul style="margin:8px 0 0 18px; padding:0; font-size:12px; line-height:1.6; opacity:0.85;">
        <li>候補の中から空きリソースのサービスを選択</li>
        <li>保存後、入力欄の下にステータスが表示されます</li>
      </ul>
    `;
    this.bodyEl.appendChild(description);

    this.primaryButton.textContent = '接続を確認しました';
    this.primaryButton.disabled = false;
    this.primaryButton.style.opacity = '1';
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
    const lead = document.createElement('p');
    lead.style.margin = '0';
    lead.textContent = '自然言語で意図を伝え、フェイルセーフ付きでシーンを生成します。';
    this.bodyEl.appendChild(lead);

    const promptPreview = document.createElement('div');
    promptPreview.style.cssText = `
      font-family: 'Inter', 'SFMono-Regular', ui-monospace, monospace;
      font-size: 12px;
      white-space: pre-line;
      background: rgba(15, 23, 42, 0.45);
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 12px;
      padding: 12px;
      line-height: 1.5;
    `;
    const promptText = this.state.samplePrompt || this.personaOptions[0].prompt;
    promptPreview.textContent = promptText;
    this.bodyEl.appendChild(promptPreview);

    const note = document.createElement('p');
    note.style.cssText = 'font-size: 12px; margin: 0; opacity: 0.75;';
    note.textContent = '必要であれば細かな指示（サイズ・位置・マテリアル）を追加してください。';
    this.bodyEl.appendChild(note);

    this.primaryButton.textContent = 'プロンプトを挿入';
    this.primaryButton.disabled = false;
    this.primaryButton.style.opacity = '1';
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
    const description = document.createElement('div');
    description.innerHTML = `
      <p style="margin:0">準備が整ったら実行ボタンでタスクを開始し、ステータスカードで進捗を確認します。</p>
      <p style="margin:8px 0 0 0; font-size:12px; opacity:0.75;">最初の生成は数十秒かかる場合があります。カードに結果が届いたら、Undo/Redoで微調整しましょう。</p>
    `;
    this.bodyEl.appendChild(description);

    this.primaryButton.textContent = '実行しました';
    this.primaryButton.disabled = false;
    this.primaryButton.style.opacity = '1';
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
    const summary = document.createElement('div');
    summary.innerHTML = `
      <p style="margin:0">お疲れさまでした。次は以下を試してみましょう。</p>
      <ul style="margin:8px 0 0 18px; padding:0; font-size:12px; line-height:1.6; opacity:0.85;">
        <li>モード切替で既存オブジェクトをリライト</li>
        <li>⚙️からサービスを追加登録し、シーンごとに切り替え</li>
        <li>🍫アイコン右クリックでショートカットを確認</li>
      </ul>
    `;
    this.bodyEl.appendChild(summary);

    this.primaryButton.textContent = 'ガイドを終了';
    this.primaryButton.disabled = false;
    this.primaryButton.style.opacity = '1';
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

    this.backdrop.style.opacity = '0';
    setTimeout(() => {
      this.backdrop.style.display = 'none';
      this.currentHighlightTarget = null;
      this.focusRing.style.opacity = '0';
    }, 220);

    if (typeof this.options.onComplete === 'function') {
      this.options.onComplete({ status, persona: this.state.persona });
    }
  }
}
