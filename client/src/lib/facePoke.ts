import { v4 as uuidv4 } from 'uuid';
import { CircularBuffer } from './circularBuffer';
import { useMainStore } from '@/hooks/useMainStore';

/**
 * Represents a tracked request with its UUID and timestamp.
 */
export interface TrackedRequest {
  uuid: string;
  timestamp: number;
}

/**
 * Represents the parameters for image modification.
 */
export interface ImageModificationParams {
  eyes: number;
  eyebrow: number;
  wink: number;
  pupil_x: number;
  pupil_y: number;
  aaa: number;
  eee: number;
  woo: number;
  smile: number;
  rotate_pitch: number;
  rotate_yaw: number;
  rotate_roll: number;
}

/**
 * Represents a message to modify an image.
 */
export interface ModifyImageMessage {
  type: 'modify_image';
  image?: string;
  image_hash?: string;
  params: Partial<ImageModificationParams>;
}


/**
 * Callback type for handling modified images.
 */
type OnModifiedImage = (image: string, image_hash: string) => void;

/**
 * Enum representing the different states of a WebSocket connection.
 */
enum WebSocketState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3
}

/**
 * FacePoke class manages the WebSocket connection
 */
export class FacePoke {
  private ws: WebSocket | null = null;
  private readonly connectionId: string = uuidv4();
  private isUnloading: boolean = false;
  private onModifiedImage: OnModifiedImage = () => {};
  private reconnectAttempts: number = 0;
  private readonly maxReconnectAttempts: number = 5;
  private readonly reconnectDelay: number = 5000;
  private readonly eventListeners: Map<string, Set<Function>> = new Map();

  private requestTracker: Map<string, TrackedRequest> = new Map();
  private responseTimeBuffer: CircularBuffer<number>;
  private readonly MAX_TRACKED_TIMES = 5; // Number of recent response times to track

  /**
   * Creates an instance of FacePoke.
   * Initializes the WebSocket connection.
   */
  constructor() {
    console.log(`[FacePoke] Initializing FacePoke instance with connection ID: ${this.connectionId}`);
    this.initializeWebSocket();
    this.setupUnloadHandler();

    this.responseTimeBuffer = new CircularBuffer<number>(this.MAX_TRACKED_TIMES);
    console.log(`[FacePoke] Initialized response time tracker with capacity: ${this.MAX_TRACKED_TIMES}`);
  }


  /**
   * Generates a unique UUID for a request and starts tracking it.
   * @returns The generated UUID for the request.
   */
  private trackRequest(): string {
    const uuid = uuidv4();
    this.requestTracker.set(uuid, { uuid, timestamp: Date.now() });
    // console.log(`[FacePoke] Started tracking request with UUID: ${uuid}`);
    return uuid;
  }

   /**
   * Completes tracking for a request and updates response time statistics.
   * @param uuid - The UUID of the completed request.
   */
   private completeRequest(uuid: string): void {
    const request = this.requestTracker.get(uuid);
    if (request) {
      const responseTime = Date.now() - request.timestamp;
      this.responseTimeBuffer.push(responseTime);
      this.requestTracker.delete(uuid);
      this.updateThrottleTime();
      console.log(`[FacePoke] Completed request ${uuid}. Response time: ${responseTime}ms`);
    } else {
      console.warn(`[FacePoke] Attempted to complete unknown request: ${uuid}`);
    }
  }

    /**
   * Calculates the average response time from recent requests.
   * @returns The average response time in milliseconds.
   */
    private calculateAverageResponseTime(): number {
      const times = this.responseTimeBuffer.getAll();

      const averageLatency = useMainStore.getState().averageLatency;

      if (times.length === 0) return averageLatency;
      const sum = times.reduce((acc, time) => acc + time, 0);
      return sum / times.length;
    }

  /**
   * Updates the throttle time based on recent response times.
   */
  private updateThrottleTime(): void {
    const { minLatency, maxLatency, averageLatency, setAverageLatency } = useMainStore.getState();
    const avgResponseTime = this.calculateAverageResponseTime();
    const newLatency = Math.min(minLatency, Math.max(minLatency, avgResponseTime));

    if (newLatency !== averageLatency) {
      setAverageLatency(newLatency)
      console.log(`[FacePoke] Updated throttle time (latency is ${newLatency}ms)`);
    }
  }

  /**
   * Sets the callback function for handling modified images.
   * @param handler - The function to be called when a modified image is received.
   */
  public setOnModifiedImage(handler: OnModifiedImage): void {
    this.onModifiedImage = handler;
    console.log(`[FacePoke] onModifiedImage handler set`);
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
    console.log(`[FacePoke][${this.connectionId}] Initializing WebSocket connection`);

    const connect = () => {
      this.ws = new WebSocket(`wss://${window.location.host}/ws`);

      this.ws.onopen = this.handleWebSocketOpen.bind(this);
      this.ws.onmessage = this.handleWebSocketMessage.bind(this);
      this.ws.onclose = this.handleWebSocketClose.bind(this);
      this.ws.onerror = this.handleWebSocketError.bind(this);
    };

    // const debouncedConnect = debounce(connect, this.reconnectDelay, { leading: true, trailing: false });

    connect(); // Initial connection attempt
  }

  /**
   * Handles the WebSocket open event.
   */
  private handleWebSocketOpen(): void {
    console.log(`[FacePoke][${this.connectionId}] WebSocket connection opened`);
    this.reconnectAttempts = 0; // Reset reconnect attempts on successful connection
    this.emitEvent('websocketOpen');
  }

  // Update handleWebSocketMessage to complete request tracking
  private handleWebSocketMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);
      // console.log(`[FacePoke][${this.connectionId}] Received JSON data:`, data);

      if (data.uuid) {
        this.completeRequest(data.uuid);
      }

      if (data.type === 'modified_image') {
        if (data?.image) {
          this.onModifiedImage(data.image, data.image_hash);
        }
      }

      this.emitEvent('message', data);
    } catch (error) {
      console.error(`[FacePoke][${this.connectionId}] Error parsing WebSocket message:`, error);
    }
  }

  /**
   * Handles WebSocket close events.
   * Implements reconnection logic with exponential backoff.
   * @param event - The CloseEvent containing close information.
   */
  private handleWebSocketClose(event: CloseEvent): void {
    if (event.wasClean) {
      console.log(`[FacePoke][${this.connectionId}] WebSocket connection closed cleanly, code=${event.code}, reason=${event.reason}`);
    } else {
      console.warn(`[FacePoke][${this.connectionId}] WebSocket connection abruptly closed`);
    }

    this.emitEvent('websocketClose', event);

    // Attempt to reconnect after a delay, unless the page is unloading or max attempts reached
    if (!this.isUnloading && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * (2 ** this.reconnectAttempts), 30000); // Exponential backoff, max 30 seconds
      console.log(`[FacePoke][${this.connectionId}] Attempting to reconnect in ${delay}ms (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      setTimeout(() => this.initializeWebSocket(), delay);
    } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`[FacePoke][${this.connectionId}] Max reconnect attempts reached. Please refresh the page.`);
      this.emitEvent('maxReconnectAttemptsReached');
    }
  }

  /**
   * Handles WebSocket errors.
   * @param error - The error event.
   */
  private handleWebSocketError(error: Event): void {
    console.error(`[FacePoke][${this.connectionId}] WebSocket error:`, error);
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

  /**
   * Modifies an image based on the provided parameters
   * @param image - The data-uri base64 image to modify.
   * @param imageHash - The hash of the image to modify.
   * @param params - The parameters for image modification.
   */
    public modifyImage(image: string | null, imageHash: string | null, params: Partial<ImageModificationParams>): void {
      try {
        const message: ModifyImageMessage = {
          type: 'modify_image',
          params: params
        };

        if (image) {
          message.image = image;
        } else if (imageHash) {
          message.image_hash = imageHash;
        } else {
          throw new Error('Either image or imageHash must be provided');
        }

        this.sendJsonMessage(message);
        // console.log(`[FacePoke] Sent modify image request with UUID: ${uuid}`);
      } catch (err) {
        console.error(`[FacePoke] Failed to modify the image:`, err);
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

    const uuid = this.trackRequest();
    const messageWithUuid = { ...message, uuid };
    // console.log(`[FacePoke] Sending JSON message with UUID ${uuid}:`, messageWithUuid);
    this.ws.send(JSON.stringify(messageWithUuid));
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
