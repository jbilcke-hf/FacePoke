import { WebSocketState, type ImageModificationParams, type OnServerResponse } from "@/types";


/**
 * FacePoke class manages the WebSocket connection
 */
export class FacePoke {
  private ws: WebSocket | null = null;
  private isUnloading: boolean = false;
  private onServerResponse: OnServerResponse = async () => {};
  private reconnectAttempts: number = 0;
  private readonly maxReconnectAttempts: number = 5;
  private readonly reconnectDelay: number = 5000;
  private readonly eventListeners: Map<string, Set<Function>> = new Map();

  /**
   * Creates an instance of FacePoke.
   * Initializes the WebSocket connection.
   */
  constructor() {
    console.log(`[FacePoke] Initializing FacePoke instance`);
    this.initializeWebSocket();
    this.setupUnloadHandler();
  }

  /**
   * Sets the callback function for handling modified images.
   * @param handler - The function to be called when a modified image is received.
   */
  public setOnServerResponse(handler: OnServerResponse): void {
    this.onServerResponse = handler;
    console.log(`[FacePoke] onServerResponse handler set`);
  }

  /**
   * Starts or restarts the WebSocket connection.
   */
  public async startWebSocket(): Promise<void> {
    console.log(`[FacePoke] Starting WebSocket connection.`);
    if (!this.ws || this.ws.readyState !== WebSocketState.OPEN) {
      await this.initializeWebSocket();
    }
  }

  /**
   * Initializes the WebSocket connection.
   * Implements exponential backoff for reconnection attempts.
   */
  private async initializeWebSocket(): Promise<void> {
    console.log(`[FacePoke] Initializing WebSocket connection`);

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      this.ws = new WebSocket(`${protocol}//${window.location.host}/ws`);


      this.ws.onopen = this.handleWebSocketOpen.bind(this);
      this.ws.onclose = this.handleWebSocketClose.bind(this);
      this.ws.onerror = this.handleWebSocketError.bind(this);
      this.ws.onmessage = (this.handleWebSocketMessage.bind(this) as any)
    };

    connect(); // Initial connection attempt
  }

  private handleWebSocketMessage(msg: MessageEvent) {
    if (typeof msg.data === "string") {
      this.onServerResponse({ loaded: JSON.parse(msg.data) as any });
    } else if (typeof msg.data !== "undefined" ) {
      this.onServerResponse({ image: msg.data as unknown as Blob });
    }
  }
  /**
   * Handles the WebSocket open event.
   */
  private handleWebSocketOpen(): void {
    console.log(`[FacePoke] WebSocket connection opened`);
    this.reconnectAttempts = 0; // Reset reconnect attempts on successful connection
    this.emitEvent('websocketOpen');
  }

  /**
   * Handles WebSocket close events.
   * Implements reconnection logic with exponential backoff.
   * @param event - The CloseEvent containing close information.
   */
  private handleWebSocketClose(event: CloseEvent): void {
    if (event.wasClean) {
      console.log(`[FacePoke] WebSocket connection closed cleanly, code=${event.code}, reason=${event.reason}`);
    } else {
      console.warn(`[FacePoke] WebSocket connection abruptly closed`);
    }

    this.emitEvent('websocketClose', event);

    // Attempt to reconnect after a delay, unless the page is unloading or max attempts reached
    if (!this.isUnloading && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * (2 ** this.reconnectAttempts), 30000); // Exponential backoff, max 30 seconds
      console.log(`[FacePoke] Attempting to reconnect in ${delay}ms (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      setTimeout(() => this.initializeWebSocket(), delay);
    } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`[FacePoke] Max reconnect attempts reached. Please refresh the page.`);
      this.emitEvent('maxReconnectAttemptsReached');
    }
  }

  /**
   * Handles WebSocket errors.
   * @param error - The error event.
   */
  private handleWebSocketError(error: Event): void {
    console.error(`[FacePoke] WebSocket error:`, error);
    this.emitEvent('websocketError', error);
  }

  /**
   * Cleans up resources and closes connections.
   */
  public cleanup(): void {
    console.log('[FacePoke] Starting cleanup process');
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.eventListeners.clear();
    console.log('[FacePoke] Cleanup completed');
    this.emitEvent('cleanup');
  }

  public async loadImage(image: string): Promise<void> {
     // Extract the base64 part if it's a data URL
    const base64Data = image.split(',')[1] || image;

    const buffer = new Uint8Array(atob(base64Data).split('').map(char => char.charCodeAt(0)));
    const blob = new Blob([buffer], { type: 'application/octet-binary' });
    this.sendBlobMessage(await blob.arrayBuffer());
  }

  public transformImage(uuid: string, params: Partial<ImageModificationParams>): void {
    this.sendJsonMessage({ uuid, params });
  }

  private sendBlobMessage(buffer: ArrayBuffer): void {
    if (!this.ws || this.ws.readyState !== WebSocketState.OPEN) {
      const error = new Error('WebSocket connection is not open');
      console.error('[FacePoke] Error sending JSON message:', error);
      this.emitEvent('sendJsonMessageError', error);
      throw error;
    }
    try {
      this.ws.send(buffer);
    } catch (err) {
      console.error(`failed to send the WebSocket message: ${err}`)
    }
  }

  /**
   * Sends a JSON message through the WebSocket connection with request tracking.
   * @param message - The message to send.
   * @throws Error if the WebSocket is not open.
   */
  private sendJsonMessage<T>(message: T): void {
    if (!this.ws || this.ws.readyState !== WebSocketState.OPEN) {
      const error = new Error('WebSocket connection is not open');
      console.error('[FacePoke] Error sending JSON message:', error);
      this.emitEvent('sendJsonMessageError', error);
      throw error;
    }
    try {
      this.ws.send(JSON.stringify(message));
    } catch (err) {
      console.error(`failed to send the WebSocket message: ${err}`)
    }
  }

/**
 * Sets up the unload handler to clean up resources when the page is unloading.
 */
private setupUnloadHandler(): void {
  window.addEventListener('beforeunload', () => {
    console.log('[FacePoke] Page is unloading, cleaning up resources');
    this.isUnloading = true;
    if (this.ws) {
      this.ws.close(1000, 'Page is unloading');
    }
    this.cleanup();
  });
}

/**
 * Adds an event listener for a specific event type.
 * @param eventType - The type of event to listen for.
 * @param listener - The function to be called when the event is emitted.
 */
public addEventListener(eventType: string, listener: Function): void {
  if (!this.eventListeners.has(eventType)) {
    this.eventListeners.set(eventType, new Set());
  }
  this.eventListeners.get(eventType)!.add(listener);
  console.log(`[FacePoke] Added event listener for '${eventType}'`);
}

/**
 * Removes an event listener for a specific event type.
 * @param eventType - The type of event to remove the listener from.
 * @param listener - The function to be removed from the listeners.
 */
public removeEventListener(eventType: string, listener: Function): void {
  const listeners = this.eventListeners.get(eventType);
  if (listeners) {
    listeners.delete(listener);
    console.log(`[FacePoke] Removed event listener for '${eventType}'`);
  }
}

/**
 * Emits an event to all registered listeners for that event type.
 * @param eventType - The type of event to emit.
 * @param data - Optional data to pass to the event listeners.
 */
private emitEvent(eventType: string, data?: any): void {
  const listeners = this.eventListeners.get(eventType);
  if (listeners) {
    console.log(`[FacePoke] Emitting event '${eventType}' with data:`, data);
    listeners.forEach(listener => listener(data));
  }
}
}

/**
* Singleton instance of the FacePoke class.
*/
export const facePoke = new FacePoke();
