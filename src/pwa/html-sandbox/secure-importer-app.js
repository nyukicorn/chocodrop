import { createApp, ref, reactive, computed, onBeforeUnmount, watch } from 'vue';
import { HtmlSandboxRunner, HtmlSandboxError } from './HtmlSandboxRunner.js';
import { THREE_VERSION } from '../utils/three-deps.js';

const runner = new HtmlSandboxRunner();

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 Bytes';
  const units = ['Bytes', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = bytes / Math.pow(1024, exponent);
  return `${size.toFixed(exponent === 0 ? 0 : 2)} ${units[exponent]}`;
}

function normalizeStatus(tone = 'muted') {
  return ['ok', 'warn', 'error', 'info'].includes(tone) ? tone : 'muted';
}

function isHtmlFileName(name = '') {
  return /\.(html|htm)$/i.test(name.trim());
}

createApp({
  setup() {
    const htmlText = ref('');
    const logs = ref([]);
    const summary = ref(null);
    const glbUrl = ref(null);
    const glbSize = ref(0);
    const thumbnailUrl = ref(null);
    const thumbnailSize = ref(null);
    const threeVersionOptions = [
      { label: 'r160', value: '0.160.0' },
      { label: 'r158 (既定)', value: THREE_VERSION },
      { label: 'r150', value: '0.150.1' },
      { label: 'r140', value: '0.140.0' },
      { label: 'latest', value: 'latest' }
    ];
    const selectedThreeVersion = ref(THREE_VERSION);
    const dropActive = ref(false);
    const status = reactive({ phase: 'idle', title: '待機中', detail: 'HTML を選択してください。', tone: 'muted' });

    const busy = computed(() => status.phase === 'running');
    const glbSizeLabel = computed(() => (glbSize.value ? `サイズ: ${formatBytes(glbSize.value)}` : 'GLB 未取得'));

    const updateStatus = (phase, title, detail, tone = 'muted') => {
      status.phase = phase;
      status.title = title;
      status.detail = detail;
      status.tone = normalizeStatus(tone);
    };

    const resetArtifacts = () => {
      if (glbUrl.value) {
        URL.revokeObjectURL(glbUrl.value);
        glbUrl.value = null;
      }
      glbSize.value = 0;
      thumbnailUrl.value = null;
      thumbnailSize.value = null;
    };

    const postArtifactsToParent = (glbFile, thumbnailDataUrl) => {
      const targetWindow = window.parent || window;
      if (!targetWindow || typeof targetWindow.postMessage !== 'function') {
        return;
      }
      if (glbFile?.arrayBuffer) {
        glbFile
          .arrayBuffer()
          .then(buffer => {
            try {
              targetWindow.postMessage(
                {
                  type: 'SECURE_SANDBOX_IMPORTER:glb',
                  name: glbFile.name,
                  byteLength: glbFile.size,
                  buffer
                },
                '*',
                [buffer]
              );
            } catch (_) {
              /* noop */
            }
          })
          .catch(() => {
            /* noop */
          });
      }

      if (thumbnailDataUrl) {
        try {
          targetWindow.postMessage(
            {
              type: 'SECURE_SANDBOX_IMPORTER:thumbnail',
              dataUrl: thumbnailDataUrl
            },
            '*'
          );
        } catch (_) {
          /* noop */
        }
      }
    };

    const handleConversion = async file => {
      if (!file) {
        updateStatus('error', 'ファイル未指定', 'HTML ファイルを選択してください。', 'warn');
        return;
      }
      if (!isHtmlFileName(file.name)) {
        updateStatus('error', '非対応拡張子', 'Single File HTML (.html/.htm) のみサポートします。', 'warn');
        return;
      }
      resetArtifacts();
      logs.value = [];
      summary.value = null;
      updateStatus('running', 'サンドボックス実行中', `${file.name} を分離環境で評価しています…`, 'info');
      try {
        runner.setThreeVersion(selectedThreeVersion.value);
        const result = await runner.convertFile(file);
        logs.value = result.logs || [];
        summary.value = result.summary || null;
        const glbFile = result.artifacts?.glbFile;
        const thumbnailDataUrl = result.artifacts?.thumbnailDataUrl;
        if (glbFile) {
          glbSize.value = glbFile.size;
          glbUrl.value = URL.createObjectURL(glbFile);
        }
        if (thumbnailDataUrl) {
          thumbnailUrl.value = thumbnailDataUrl;
          thumbnailSize.value = result.artifacts.thumbnailSize || null;
        }
        if (glbFile || thumbnailDataUrl) {
          postArtifactsToParent(glbFile, thumbnailDataUrl);
        }
        updateStatus('completed', 'エクスポート成功', `${file.name} から GLB を抽出しました。`, 'ok');
      } catch (error) {
        const detailLogs = error instanceof HtmlSandboxError ? error.detail?.logs : null;
        logs.value = detailLogs || [{ level: 'error', message: error?.message || 'サンドボックスエラー' }];
        summary.value = null;
        updateStatus('error', '解析失敗', error?.message || 'サンドボックスでエラーが発生しました', 'error');
        console.error('Secure sandbox import failed:', error);
      }
    };

    const onFileChange = event => {
      const file = event.target.files?.[0];
      if (event.target) {
        event.target.value = '';
      }
      if (file) {
        handleConversion(file);
      }
    };

    const onDragOver = () => {
      dropActive.value = true;
    };

    const onDragLeave = () => {
      dropActive.value = false;
    };

    const onDrop = event => {
      dropActive.value = false;
      const file = event.dataTransfer?.files?.[0];
      if (file) {
        handleConversion(file);
      }
    };

    const runInline = () => {
      const text = htmlText.value.trim();
      if (!text) {
        updateStatus('error', '入力が空です', 'HTML テキストを入力してください。', 'warn');
        return;
      }
      const file = new File([text], `inline-${Date.now()}.html`, { type: 'text/html' });
      handleConversion(file);
    };

    const handleBeforeUnload = () => resetArtifacts();
    window.addEventListener('beforeunload', handleBeforeUnload);

    onBeforeUnmount(() => {
      resetArtifacts();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    });

    watch(
      () => selectedThreeVersion.value,
      value => {
        runner.setThreeVersion(value);
      }
    );

    return {
      htmlText,
      logs,
      summary,
      glbUrl,
      glbSizeLabel,
      threeVersionOptions,
      selectedThreeVersion,
      thumbnailUrl,
      thumbnailSize,
      dropActive,
      status,
      busy,
      onFileChange,
      onDragOver,
      onDragLeave,
      onDrop,
      runInline
    };
  }
}).mount('#secure-importer');
