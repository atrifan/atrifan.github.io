type BridgeState = 'disconnected' | 'connected';

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type BridgeListener = (state: BridgeState) => void;

const DISCOVER_INTERVAL = 3000;
const HEARTBEAT_INTERVAL = 10000;
const HEARTBEAT_TIMEOUT = 6000;
const COMMAND_TIMEOUT = 30000;

class ExtensionBridge {
  state: BridgeState = 'disconnected';
  capabilities: string[] = [];
  version: string | null = null;
  deviceName: string | null = null;
  activated: boolean = false;

  private pending = new Map<string, PendingRequest>();
  private listeners = new Set<BridgeListener>();
  private discoverTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatAckTimer: ReturnType<typeof setTimeout> | null = null;
  private awaitingHeartbeatAck = false;
  private started = false;

  start() {
    if (this.started) return;
    this.started = true;
    window.addEventListener('message', this.handleMessage);
    this.enterDisconnected();
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    window.removeEventListener('message', this.handleMessage);
    this.clearTimers();
    this.rejectAll('Bridge stopped');
    this.activated = false;
    this.setState('disconnected');
  }

  onStateChange(fn: BridgeListener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  send<T = unknown>(command: string, params: Record<string, unknown> = {}): Promise<T> {
    if (this.state !== 'connected') {
      return Promise.reject(new Error('Extension not connected'));
    }

    const id = crypto.randomUUID();

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Command ${command} timed out`));
      }, COMMAND_TIMEOUT);

      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });

      window.postMessage({
        source: 'tulzo',
        action: 'command',
        id,
        command,
        params,
      }, '*');
    });
  }

  private handleMessage = (e: MessageEvent) => {
    if (e.source !== window) return;
    const data = e.data;
    if (!data || data.source !== 'tex-extension') return;

    switch (data.action) {
      case 'discover_ack':
        this.onDiscoverAck(data);
        break;
      case 'heartbeat_ack':
        this.onHeartbeatAck();
        break;
      case 'command_response':
        this.onCommandResponse(data);
        break;
    }
  };

  private onDiscoverAck(data: { version?: string; capabilities?: string[]; deviceName?: string; activated?: boolean }) {
    this.version = data.version || null;
    this.capabilities = data.capabilities || [];
    this.deviceName = data.deviceName || null;
    this.activated = data.activated ?? false;
    this.enterConnected();
  }

  private onHeartbeatAck() {
    this.awaitingHeartbeatAck = false;
    if (this.heartbeatAckTimer) {
      clearTimeout(this.heartbeatAckTimer);
      this.heartbeatAckTimer = null;
    }
  }

  private onCommandResponse(data: { id?: string; ok?: boolean; result?: unknown; error?: string }) {
    if (!data.id) return;
    const pending = this.pending.get(data.id);
    if (!pending) return;

    this.pending.delete(data.id);
    clearTimeout(pending.timer);

    if (data.ok) {
      pending.resolve(data.result);
    } else {
      pending.reject(new Error(data.error || 'Command failed'));
    }
  }

  private enterDisconnected() {
    this.clearTimers();
    this.setState('disconnected');

    // Send discover immediately, then poll
    this.postDiscover();
    this.discoverTimer = setInterval(() => this.postDiscover(), DISCOVER_INTERVAL);
  }

  private enterConnected() {
    this.clearTimers();
    this.setState('connected');

    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), HEARTBEAT_INTERVAL);
  }

  private sendHeartbeat() {
    if (this.awaitingHeartbeatAck) return;
    this.awaitingHeartbeatAck = true;

    window.postMessage({ source: 'tulzo', action: 'heartbeat' }, '*');

    this.heartbeatAckTimer = setTimeout(() => {
      this.awaitingHeartbeatAck = false;
      this.rejectAll('Extension disconnected');
      this.enterDisconnected();
    }, HEARTBEAT_TIMEOUT);
  }

  private postDiscover() {
    window.postMessage({ source: 'tulzo', action: 'discover' }, '*');
  }

  private setState(s: BridgeState) {
    if (this.state === s) return;
    this.state = s;
    this.listeners.forEach(fn => fn(s));
  }

  private rejectAll(reason: string) {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this.pending.clear();
  }

  private clearTimers() {
    if (this.discoverTimer) { clearInterval(this.discoverTimer); this.discoverTimer = null; }
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.heartbeatAckTimer) { clearTimeout(this.heartbeatAckTimer); this.heartbeatAckTimer = null; }
  }
}

export const extensionBridge = new ExtensionBridge();
