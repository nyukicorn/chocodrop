/**
 * サーバーからのライブコマンドを受け取り SceneManager に橋渡しするクライアント。
 * WebSocket を使用し、切断時には指数バックオフで再接続を試みる。
 */
const createClientId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `client_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
};

const base64ToUint8Array = base64 => {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

export class LiveCommandClient {
  constructor(options = {}) {
    this.url = options.url || `${location.origin.replace(/^http/, 'ws')}/ws/live`;
    this.reconnectInterval = options.reconnectInterval ?? 2000;
    this.maxReconnectInterval = options.maxReconnectInterval ?? 15000;
    this.heartbeatInterval = options.heartbeatInterval ?? 15000;
    this.sceneManager = null;
    this.socket = null;
    this.events = new EventTarget();
    this._heartbeatTimer = null;
    this._reconnectTimer = null;
    this._lastCommandAt = 0;
    this.clientId = options.clientId || createClientId();
    this._assetTransfers = new Map();
  }

  on(type, handler) {
    this.events.addEventListener(type, handler);
    return () => this.events.removeEventListener(type, handler);
  }

  emit(type, detail) {
    this.events.dispatchEvent(new CustomEvent(type, { detail }));
  }

  bindSceneManager(sceneManager) {
    this.sceneManager = sceneManager;
  }

  isConnected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  connect() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.emit('connecting', { url: this.url });
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener('open', this._handleOpen);
    this.socket.addEventListener('message', this._handleMessage);
    this.socket.addEventListener('close', this._handleClose);
    this.socket.addEventListener('error', this._handleError);
  }

  disconnect() {
    if (!this.socket) return;
    this.socket.removeEventListener('open', this._handleOpen);
    this.socket.removeEventListener('message', this._handleMessage);
    this.socket.removeEventListener('close', this._handleClose);
    this.socket.removeEventListener('error', this._handleError);
    this.socket.close();
    this.socket = null;
    this._stopHeartbeat();
    this._assetTransfers.clear();
    this.emit('disconnected');
  }

  send(command) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket が接続されていません');
    }
    let payload;
    if (typeof command === 'string') {
      payload = command;
    } else {
      const enriched = { ...command };
      if (!enriched.origin) {
        enriched.origin = this.clientId;
      }
      payload = JSON.stringify(enriched);
    }
    this.socket.send(payload);
  }

  _handleOpen = () => {
    this.emit('connected', { url: this.url });
    this._startHeartbeat();
  };

  _handleMessage = event => {
    this._lastCommandAt = performance.now();
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      this.emit('command', { data });
      this._routeCommand(data);
    } catch (error) {
      this.emit('command:error', { error, raw: event.data });
    }
  };

  _routeCommand(data) {
    if (!this.sceneManager) return;
    const { type, payload } = data;
    switch (type) {
      case 'scene:clear':
        this.sceneManager.clear(payload || {});
        break;
      case 'scene:json':
        if (payload?.json) {
          this.sceneManager.importJSON(payload.json);
        }
        break;
      case 'camera:set':
        this._applyCamera(payload);
        break;
      case 'asset:spawn':
        if (this.sceneManager?.spawnAssetFromPayload) {
          Promise.resolve(this.sceneManager.spawnAssetFromPayload(payload)).catch(error =>
            this.emit('command:error', { error, data })
          );
        }
        break;
      case 'asset:clear':
        this.sceneManager?.clearAssets?.();
        break;
      case 'asset:begin':
        this._handleAssetBegin(payload);
        break;
      case 'asset:chunk':
        this._handleAssetChunk(payload);
        break;
      case 'asset:end':
        this._handleAssetEnd(payload);
        break;
      case 'asset:abort':
        this._assetTransfers.delete(payload?.id);
        break;
      default:
        this.emit('command:unhandled', data);
    }
  }

  _applyCamera(payload = {}) {
    if (!this.sceneManager?.camera) return;
    const { position, target } = payload;
    if (position) {
      this.sceneManager.camera.position.set(position.x ?? 0, position.y ?? 0, position.z ?? 0);
    }
    if (target && this.sceneManager.controls) {
      this.sceneManager.controls.target.set(target.x ?? 0, target.y ?? 0, target.z ?? 0);
    }
  }

  _handleClose = event => {
    this.emit('disconnected', { code: event.code, reason: event.reason });
    this._stopHeartbeat();
    this._assetTransfers.clear();
    this._scheduleReconnect();
  };

  _handleError = error => {
    this.emit('error', { error });
  };

  _scheduleReconnect() {
    if (this._reconnectTimer) return;
    const interval = Math.min(this.reconnectInterval * 1.5, this.maxReconnectInterval);
    this.reconnectInterval = interval;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this.connect();
    }, interval);
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this._heartbeatTimer = setInterval(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
      this.socket.send(JSON.stringify({ type: 'heartbeat', at: Date.now() }));
      const latency = performance.now() - this._lastCommandAt;
      this.emit('latency', { latency });
      if (latency > 150) {
        this.emit('latency:warning', { latency });
      }
    }, this.heartbeatInterval);
  }

  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  _handleAssetBegin(payload = {}) {
    if (!payload.id) return;
    this._assetTransfers.set(payload.id, {
      meta: payload,
      buffers: [],
      received: 0
    });
  }

  _handleAssetChunk(payload = {}) {
    const store = payload.id ? this._assetTransfers.get(payload.id) : null;
    if (!store || !payload.data) return;
    try {
      const bytes = base64ToUint8Array(payload.data);
      store.buffers.push(bytes);
      store.received += bytes.byteLength;
    } catch (error) {
      this.emit('command:error', { error, data: payload });
    }
  }

  _handleAssetEnd(payload = {}) {
    const store = payload.id ? this._assetTransfers.get(payload.id) : null;
    if (!store) return;
    this._assetTransfers.delete(payload.id);
    if (!this.sceneManager) return;
    try {
      const blob = new Blob(store.buffers, { type: store.meta.mimeType || 'application/octet-stream' });
      const objectUrl = URL.createObjectURL(blob);
      const shouldPersistUrl = store.meta.kind === 'video';
      const finalPayload = {
        ...store.meta,
        objectUrl,
        preserveObjectUrl: shouldPersistUrl,
        size: blob.size,
        source: store.meta.source || 'chunk-stream'
      };
      Promise.resolve(this.sceneManager.spawnAssetFromPayload(finalPayload))
        .catch(error => {
          this.emit('command:error', { error, data: finalPayload });
        })
        .finally(() => {
          if (!shouldPersistUrl) {
            URL.revokeObjectURL(objectUrl);
          }
        });
    } catch (error) {
      this.emit('command:error', { error, data: payload });
    }
  }
}

export default LiveCommandClient;
