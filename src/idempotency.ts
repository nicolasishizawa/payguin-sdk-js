/**
 * Idempotency store — prevents duplicate processing of webhook events.
 *
 * PayGuin sends deterministic idempotency keys in the format:
 *   ord_{orderID}_{event}_{seq}
 *
 * The store tracks which keys have been processed. Consumers should provide
 * a durable store (Redis, database) for production multi-instance deployments.
 * The included InMemoryIdempotencyStore works for single-instance setups.
 */

/**
 * Interface for idempotency key storage.
 *
 * Implement this with Redis, a database, or another durable backend
 * when running multiple instances. The in-memory default loses state on restart.
 */
export interface IdempotencyStore {
  /**
   * Returns true if this key has already been processed.
   * Must not throw for normal operation.
   */
  seen(key: string): Promise<boolean>;

  /**
   * Marks this key as processed. Called only after successful processing.
   * Must not throw for normal operation.
   */
  remember(key: string): Promise<void>;
}

/**
 * In-memory idempotency store with a bounded capacity.
 *
 * Suitable for single-instance deployments. The worst case on restart is
 * re-processing a webhook, which your handler should tolerate (upsert logic).
 *
 * When the capacity is reached, new keys are silently dropped (not evicted).
 * In practice the set grows slowly (one entry per webhook event).
 *
 * WARNING: not shared across instances. For multi-instance production,
 * implement IdempotencyStore backed by Redis or your database.
 */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly keys = new Set<string>();
  private readonly maxSize: number;

  constructor(maxSize = 100_000) {
    this.maxSize = maxSize;
  }

  async seen(key: string): Promise<boolean> {
    return this.keys.has(key);
  }

  async remember(key: string): Promise<void> {
    if (this.keys.size < this.maxSize) {
      this.keys.add(key);
    }
  }

  /** Current number of stored keys. */
  get size(): number {
    return this.keys.size;
  }
}
