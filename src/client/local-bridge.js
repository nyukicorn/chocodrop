/** Connect a local Basic scene to the authenticated, same-origin MCP bridge. */
export function connectLocalBridge(sceneManager, { statusElement } = {}) {
  const setStatus = (message) => {
    if (statusElement) statusElement.textContent = message;
  };
  if (location.hostname !== '127.0.0.1' || location.protocol !== 'http:') {
    setStatus('ツール連携はローカル起動時のURLから利用してください');
    return;
  }
  const tokenKey = 'chocodrop:local-token';
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || sessionStorage.getItem(tokenKey);
  if (!token) {
    setStatus('接続情報がありません。起動時に表示されたURLを開いてください');
    return;
  }
  sessionStorage.setItem(tokenKey, token);
  history.replaceState(null, '', location.pathname + location.search);
  const socket = new WebSocket(`ws://${location.host}/local-api/live?token=${encodeURIComponent(token)}`);
  const requests = new Map();
  socket.addEventListener('open', () =>
    setStatus('ツール連携中 · Codex・Claude Code・Gemini CLIなどから素材を配置できます')
  );
  socket.addEventListener('close', () => {
    for (const request of requests.values()) request.cancelled = true;
    setStatus('ツール連携が切れました · サーバーを確認して再読み込みしてください');
  });
  socket.addEventListener('error', () => setStatus('ツールへ接続できません。起動時のURLを開き直してください'));
  socket.addEventListener('message', async ({ data }) => {
    let message;
    try { message = JSON.parse(data); } catch { return; }
    if (message.type === 'import-cancel') {
      const request = requests.get(message.requestId);
      if (request) request.cancelled = true;
      return;
    }
    if (message.type !== 'import' || typeof message.requestId !== 'string') return;
    const reply = (value) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'import-result', requestId: message.requestId, ...value }));
      }
    };
    if (requests.size) {
      reply({ ok: false, error: 'Another asset is still loading; retry after it completes' });
      return;
    }
    const request = { cancelled: false };
    requests.set(message.requestId, request);
    setStatus(`読み込み中 · ${message.asset?.name || '素材'}`);
    try {
      const result = await importBridgeAsset(sceneManager, message, location.origin);
      if (request.cancelled || socket.readyState !== WebSocket.OPEN) {
        sceneManager.removeObject(result.objectId);
        setStatus('読み込みを中断しました。接続を確認して再実行してください');
        return;
      }
      setStatus(`配置完了 · ${message.asset.name} · シーン内 ${sceneManager.spawnedObjects.size} 個`);
      reply({ ok: true, objectId: result.objectId });
    } catch (error) {
      setStatus(`配置できませんでした: ${error.message}`);
      reply({ ok: false, error: error.message });
    } finally {
      requests.delete(message.requestId);
    }
  });
  window.addEventListener('pagehide', () => socket.close(), { once: true });
  return socket;
}

/** Import only URLs served by this local bridge; success means an object exists. */
export async function importBridgeAsset(sceneManager, { asset, position }, origin) {
  if (!asset || typeof asset.url !== 'string') throw new Error('Missing asset URL');
  const url = new URL(asset.url, origin);
  if (url.origin !== origin || !/^\/local-api\/assets\/[0-9a-f-]+$/i.test(url.pathname)) {
    throw new Error('Asset URL must belong to the local bridge');
  }
  const method = { image: 'loadImageFile', video: 'loadVideoFile', model: 'load3DModel' }[asset.mediaType];
  if (!method) throw new Error('Unsupported media type');
  const result = await sceneManager[method](url.href, { fileName: asset.name, position });
  if (!result?.success || !sceneManager.spawnedObjects.has(result.objectId)) {
    throw new Error('The asset was not added to the scene');
  }
  return result;
}
