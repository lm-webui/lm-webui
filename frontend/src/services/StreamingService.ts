import { authFetch } from '../utils/api';

export interface StreamingConfig {
  provider: string;
  model: string;
  api_key?: string;
  deep_thinking_mode: boolean;
  raw?: boolean; // Enable raw response mode (show unfiltered AI output)
}

export interface StreamingEvent {
  type: string;
  session_id?: string;
  event?: any;
  data?: any;
  message?: string;
  timestamp?: number;
  code?: number;
  reason?: string;
  error?: any;
}

export interface StreamingSession {
  session_id: string;
  websocket_url: string;
  status: 'ready' | 'active' | 'completed' | 'cancelled' | 'error';
  config: StreamingConfig;
}

export class StreamingService {
  private websocket: WebSocket | null = null;
  private sessionId: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isConnecting = false;

  // Event listeners
  private eventListeners: Map<string, ((event: StreamingEvent) => void)[]> = new Map();

  constructor() {
    this.eventListeners.set('connected', []);
    this.eventListeners.set('disconnected', []);
    this.eventListeners.set('error', []);
    this.eventListeners.set('message', []);
    this.eventListeners.set('reasoning_step', []);
    this.eventListeners.set('final_answer', []);
    this.eventListeners.set('cancelled', []);
  }

  /**
   * Start a new streaming session
   */
  async startSession(config: StreamingConfig, message: string): Promise<StreamingSession> {
    if (this.isConnecting || this.websocket) {
      throw new Error('Connection already exists');
    }

    try {
      // Start streaming session via REST API
      const session = await authFetch('/api/chat/stream/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          provider: config.provider,
          model: config.model,
          api_key: config.api_key,
          deep_thinking_mode: config.deep_thinking_mode,
        }),
      });

      this.sessionId = session.session_id;

      // Connect to WebSocket
      await this.connectWebSocket(session.websocket_url);

      return session;
    } catch (error) {
      console.error('Failed to start streaming session:', error);
      throw error;
    }
  }

  async sendMessage(payload: any): Promise<void> {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    this.websocket.send(JSON.stringify(payload));
  }

  async stopSession(): Promise<void> {
    if (this.sessionId) {
      try {
        // Send stop command via REST API as fallback
        await authFetch('/api/chat/stream/stop', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ session_id: this.sessionId }),
        });
      } catch (error) {
        console.warn('REST API stop failed:', error);
      }
    }

    this.disconnect();
  }

  async cancelSession(): Promise<void> {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({
        action: 'cancel_session',
        data: { session_id: this.sessionId }
      }));
    }

    this.disconnect();
  }

  private async connectWebSocket(url: string): Promise<void> {
    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      try {
        const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${url}`;
        this.websocket = new WebSocket(wsUrl);

        this.websocket.onopen = () => {
          console.log('WebSocket connected');
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.startHeartbeat();

          // Send initial setup if we have a session
          if (this.sessionId) {
            this.websocket!.send(JSON.stringify({
              action: 'start_stream',
              data: { session_id: this.sessionId }
            }));
          }

          this.emitEvent('connected', { type: 'connected', ...(this.sessionId ? { session_id: this.sessionId } : {}) });
          resolve();
        };

        this.websocket.onmessage = (event) => {
          try {
            const data: StreamingEvent = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (error) {
            console.error('Failed to parse WebSocket message:', event.data);
          }
        };

        this.websocket.onclose = (event) => {
          console.log('WebSocket disconnected:', event.code, event.reason);
          this.isConnecting = false;
          this.stopHeartbeat();

          if (event.code !== 1000) { // Not a normal closure
            this.handleReconnect();
          }

          this.emitEvent('disconnected', { type: 'disconnected', code: event.code, reason: event.reason });
        };

        this.websocket.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.isConnecting = false;
          this.emitEvent('error', { type: 'error', error });
          reject(error);
        };

        // Connection timeout
        setTimeout(() => {
          if (this.isConnecting) {
            this.websocket?.close();
            reject(new Error('WebSocket connection timeout'));
          }
        }, 10000);

      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  private handleMessage(data: StreamingEvent): void {
    // Emit general message event
    this.emitEvent('message', data);

    // Emit specific events based on type
    switch (data.type) {
      case 'reasoning_step':
        this.emitEvent('reasoning_step', data);
        break;
      case 'final_answer':
        this.emitEvent('final_answer', data);
        break;
      case 'cancelled':
        this.emitEvent('cancelled', data);
        break;
      case 'error':
        this.emitEvent('error', data);
        break;
      default:
        // Handle other event types
        break;
    }
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;

      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

      setTimeout(async () => {
        console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        try {
          // Reconnect to existing session if available
          if (this.sessionId) {
            await this.connectWebSocket('/ws/chat');
          }
        } catch (error) {
          console.error('Reconnection failed:', error);
        }
      }, delay);
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.websocket?.readyState === WebSocket.OPEN) {
        this.websocket.send(JSON.stringify({ action: 'heartbeat' }));
      }
    }, 60000); // Every 60 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private disconnect(): void {
    this.stopHeartbeat();

    if (this.websocket) {
      this.websocket.close(1000, 'Client disconnect');
      this.websocket = null;
    }

    this.sessionId = null;
  }

  on(event: string, callback: (event: StreamingEvent) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  off(event: string, callback?: (event: StreamingEvent) => void): void {
    if (!this.eventListeners.has(event)) return;

    if (callback) {
      const listeners = this.eventListeners.get(event)!;
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    } else {
      this.eventListeners.set(event, []);
    }
  }

  private emitEvent(event: string, data: StreamingEvent): void {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event)!.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Event callback error:', error);
        }
      });
    }
  }

  get isConnected(): boolean {
    return this.websocket?.readyState === WebSocket.OPEN;
  }

  get currentSessionId(): string | null {
    return this.sessionId;
  }

  static async getCapabilities(): Promise<any> {
    return await authFetch('/api/chat/stream/info');
  }
}

// Singleton instance
export const streamingService = new StreamingService();
