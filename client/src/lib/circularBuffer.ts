

/**
 * Circular buffer for storing and managing response times.
 */
export class CircularBuffer<T> {
  private buffer: T[];
  private pointer: number;

  constructor(private capacity: number) {
    this.buffer = new Array<T>(capacity);
    this.pointer = 0;
  }

  /**
   * Adds an item to the buffer, overwriting the oldest item if full.
   * @param item - The item to add to the buffer.
   */
  push(item: T): void {
    this.buffer[this.pointer] = item;
    this.pointer = (this.pointer + 1) % this.capacity;
  }

  /**
   * Retrieves all items currently in the buffer.
   * @returns An array of all items in the buffer.
   */
  getAll(): T[] {
    return this.buffer.filter(item => item !== undefined);
  }
}
