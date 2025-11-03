/**
 * サーバーからのライブコマンドを受け取り SceneManager に橋渡しするクライアント。
 * WebSocket を使用し、切断時には指数バックオフで再接続を試みる。
 */
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
    this.emit('disconnected');
  }

  send(command) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket が接続されていません');
    }
    const payload = typeof command === 'string' ? command : JSON.stringify(command);
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
        this.sceneManager.clear();
        break;
      case 'scene:json':
        if (payload?.json) {
          this.sceneManager.importJSON(payload.json);
        }
        break;
      case 'camera:set':
        this._applyCamera(payload);
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
}

export default LiveCommandClient;
