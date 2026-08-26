/**
 * PayGuin SDK types — matches the webhook envelope built by
 * `outbound.BuildEventPayload` in the PayGuin Go service.
 *
 * Reference: paygu-in/internal/outbound/enqueue.go (BuildEventPayload)
 * Reference: paygu-in/internal/core/events.go (event constants)
 */
declare const PayGuinEventType: {
    readonly ORDER_CREATED: "order.created";
    readonly PAYMENT_PAID: "payment.paid";
    readonly PAYMENT_FAILED: "payment.failed";
    readonly PAYMENT_EXPIRED: "payment.expired";
    readonly PAYMENT_CANCELED: "payment.canceled";
    readonly REFUND_CREATED: "refund.created";
    readonly REFUND_COMPLETED: "refund.completed";
    readonly PAYOUT_REQUESTED: "payout.requested";
    readonly PAYOUT_COMPLETED: "payout.completed";
    readonly PAYOUT_FAILED: "payout.failed";
    readonly PAYOUT_CREATED: "payout.created";
    readonly PAYOUT_PAID: "payout.paid";
};
type PayGuinEventType = (typeof PayGuinEventType)[keyof typeof PayGuinEventType];
interface PayGuinWebhookPayload {
    event: PayGuinEventType;
    timestamp: string;
    order: PayGuinOrder;
    checkout: PayGuinCheckout;
    payer: PayGuinPayer;
    metadata: Record<string, unknown>;
}
interface PayGuinOrder {
    id: string;
    external_id: string;
    status: string;
    amount_cents: number;
    currency: string;
    paid_at: string | null;
    created_at: string;
}
interface PayGuinCheckout {
    id: string;
    slug: string;
    name: string;
}
interface PayGuinPayer {
    name: string;
    email: string;
    phone: string;
    /** CPF/CNPJ - decrypted by PayGuin before sending. NEVER log this field. */
    document: string;
}
interface PayGuinWebhookHeaders {
    "x-payguin-event": string;
    "x-payguin-delivery-id": string;
    "x-payguin-idempotency-key": string;
    "x-payguin-timestamp": string;
    "x-payguin-nonce": string;
    "x-payguin-signature": string;
}
interface BaseWebhookEvent {
    order: PayGuinOrder;
    checkout: PayGuinCheckout;
    payer: PayGuinPayer;
    metadata: Record<string, unknown>;
    timestamp: string;
    idempotencyKey: string | null;
}
interface OrderCreatedEvent extends BaseWebhookEvent {
    event: typeof PayGuinEventType.ORDER_CREATED;
}
interface PaymentPaidEvent extends BaseWebhookEvent {
    event: typeof PayGuinEventType.PAYMENT_PAID;
}
interface PaymentFailedEvent extends BaseWebhookEvent {
    event: typeof PayGuinEventType.PAYMENT_FAILED;
}
interface PaymentExpiredEvent extends BaseWebhookEvent {
    event: typeof PayGuinEventType.PAYMENT_EXPIRED;
}
interface PaymentCanceledEvent extends BaseWebhookEvent {
    event: typeof PayGuinEventType.PAYMENT_CANCELED;
}
interface RefundCreatedEvent extends BaseWebhookEvent {
    event: typeof PayGuinEventType.REFUND_CREATED;
}
interface RefundCompletedEvent extends BaseWebhookEvent {
    event: typeof PayGuinEventType.REFUND_COMPLETED;
}
interface PayoutRequestedEvent extends BaseWebhookEvent {
    event: typeof PayGuinEventType.PAYOUT_REQUESTED;
}
interface PayoutCompletedEvent extends BaseWebhookEvent {
    event: typeof PayGuinEventType.PAYOUT_COMPLETED;
}
interface PayoutFailedEvent extends BaseWebhookEvent {
    event: typeof PayGuinEventType.PAYOUT_FAILED;
}
interface PayoutCreatedEvent extends BaseWebhookEvent {
    event: typeof PayGuinEventType.PAYOUT_CREATED;
}
interface PayoutPaidEvent extends BaseWebhookEvent {
    event: typeof PayGuinEventType.PAYOUT_PAID;
}
type PayGuinWebhookEvent = OrderCreatedEvent | PaymentPaidEvent | PaymentFailedEvent | PaymentExpiredEvent | PaymentCanceledEvent | RefundCreatedEvent | RefundCompletedEvent | PayoutRequestedEvent | PayoutCompletedEvent | PayoutFailedEvent | PayoutCreatedEvent | PayoutPaidEvent;
/** Request body sent to PayGuin: POST /api/v1/checkouts/{checkoutId}/orders */
interface PayGuinCreateOrderRequest {
    payer: {
        name: string;
        email: string;
        phone: string;
        document: string;
    };
    /**
     * Caller-defined reference for correlation.
     * NOTE: the Go backend does NOT accept this field yet.
     * Including it is forward-compatible; it will be ignored until
     * the backend adds support.
     */
    reference?: string;
    /**
     * Arbitrary key-value metadata attached to the order.
     * NOTE: the Go backend does NOT accept this field yet.
     * Same forward-compatibility note as `reference`.
     */
    metadata?: Record<string, unknown>;
}
/** Response from PayGuin: POST /api/v1/checkouts/{checkoutId}/orders */
interface PayGuinCreateOrderResponse {
    order_id: string;
    external_id: string;
    status: string;
    amount_cents: number;
    currency: string;
    pix_copia_e_cola: string;
    pix_expires_at: string | null;
}
interface ChargeResult {
    orderId: string;
    externalId: string;
    status: string;
    amountCents: number;
    currency: string;
    pixCopiaECola: string;
    pixExpiresAt: string | null;
}
interface OrderStatus {
    status: "pending" | "paid" | "canceled" | "failed" | "expired";
    amountCents: number;
    currency: string;
    expiresAt: string | null;
}
interface PayerInput {
    name: string;
    email: string;
    phone: string;
    /** CPF or CNPJ. The SDK transmits it but NEVER logs it. */
    document: string;
}
interface CreateChargeInput {
    payer: PayerInput;
    /**
     * Caller-defined reference for correlation.
     * NOTE: requires a pending PayGuin backend change to take effect.
     */
    reference?: string;
    /**
     * Arbitrary key-value metadata attached to the order.
     * NOTE: requires a pending PayGuin backend change to take effect.
     */
    metadata?: Record<string, unknown>;
}
interface VerificationResult {
    valid: boolean;
    reason?: string;
}
type WebhookHandlerResult = {
    action: "process";
    event: PayGuinWebhookEvent;
} | {
    action: "skip";
    reason: "deduplicated" | "invalid_signature" | "parse_error";
    detail?: string;
};
interface PayGuinClientConfig {
    /** Base URL of the PayGuin service (e.g. "https://payguin.example.com"). */
    baseUrl: string;
    /** HTTP request timeout in milliseconds. Default: 30000 (30s). */
    timeoutMs?: number;
    /** Injectable fetch for testing. Default: globalThis.fetch. */
    fetch?: typeof globalThis.fetch;
}

/**
 * PayGuinClient - server-to-server client for the PayGuin checkout API.
 *
 * Creates PIX charges and queries order status. Zero runtime dependencies:
 * uses built-in fetch (Node 18+ / Bun) and node:crypto.
 *
 * Configuration is injected via constructor (no env var reads inside the SDK).
 */

declare class PayGuinClient {
    private readonly baseUrl;
    private readonly timeoutMs;
    private readonly fetch;
    constructor(config: PayGuinClientConfig);
    /**
     * Creates a PIX charge via a PayGuin checkout.
     *
     * Calls POST /api/v1/checkouts/{checkoutId}/orders with payer data.
     * Returns the PIX copia-e-cola string and order metadata.
     *
     * NOTE: `reference` and `metadata` fields in the input are forward-compatible.
     * The Go backend does NOT accept them yet. They are included in the request
     * body but will be ignored until the backend adds support. Correlation today
     * works via the returned `orderId`.
     *
     * @throws {PayGuinApiError} On non-2xx HTTP responses.
     * @throws {Error} On network failures or timeouts.
     */
    createCharge(checkoutId: string, input: CreateChargeInput): Promise<ChargeResult>;
    /**
     * Queries the status of an existing order.
     *
     * Calls GET /api/v1/orders/{orderId}/status.
     *
     * Useful as a fallback when the `payment.paid` webhook is lost: poll the
     * status directly instead of waiting for an event that may never arrive.
     *
     * @throws {PayGuinApiError} On non-2xx HTTP responses.
     * @throws {Error} On network failures or timeouts.
     */
    getOrderStatus(orderId: string): Promise<OrderStatus>;
    private doFetch;
    private throwApiError;
}

/**
 * PayGuin API error — thrown when the PayGuin HTTP API returns a non-2xx response.
 *
 * Carries the HTTP status code and, when available, the PayGuin error code/message
 * from the response body.
 */
declare class PayGuinApiError extends Error {
    readonly httpStatus: number;
    readonly errorCode?: string | undefined;
    readonly errorMessage?: string | undefined;
    readonly responseBody?: string | undefined;
    readonly kind: "PayGuinApiError";
    constructor(message: string, httpStatus: number, errorCode?: string | undefined, errorMessage?: string | undefined, responseBody?: string | undefined);
}

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
interface IdempotencyStore {
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
declare class InMemoryIdempotencyStore implements IdempotencyStore {
    private readonly keys;
    private readonly maxSize;
    constructor(maxSize?: number);
    seen(key: string): Promise<boolean>;
    remember(key: string): Promise<void>;
    /** Current number of stored keys. */
    get size(): number;
}

/**
 * Webhook signature verification and event parsing.
 *
 * HMAC-SHA256 verification for PayGuin webhooks — byte-exact match of the
 * proven recipe from infinityia-back/src/modules/payguin/payguin-hmac.ts.
 *
 * PayGuin signs outbound webhooks by computing HMAC-SHA256 over the CANONICAL
 * BODY (the raw JSON bytes as sent, NOT re-serialized) using the Project's
 * WebhookSigningSecret.
 *
 * The signature is sent in the header:
 *   X-PayGuin-Signature: sha256=<hex>
 *
 * CRITICAL: verification MUST use the raw body bytes, not JSON.parse'd and
 * re-stringified data. Any whitespace or key-order difference would produce
 * a different HMAC.
 *
 * Comparison is done in constant time (crypto.timingSafeEqual) to prevent
 * timing attacks.
 *
 * Framework-agnostic: takes raw bytes + header values. Works with Hono, Express,
 * Fastify, or any framework that gives you the raw body.
 */

declare const HEADER_SIGNATURE = "x-payguin-signature";
declare const HEADER_IDEMPOTENCY_KEY = "x-payguin-idempotency-key";
declare const HEADER_EVENT = "x-payguin-event";
declare const HEADER_DELIVERY_ID = "x-payguin-delivery-id";
declare const HEADER_TIMESTAMP = "x-payguin-timestamp";
declare const HEADER_NONCE = "x-payguin-nonce";
/**
 * Verifies a PayGuin HMAC-SHA256 webhook signature.
 *
 * @param rawBody         - The raw request body (string or Buffer, as received over the wire).
 *                          NEVER pass re-serialized JSON.
 * @param signatureHeader - The value of the X-PayGuin-Signature header ("sha256=<hex>"),
 *                          or null/undefined if the header is missing.
 * @param secret          - The Project's WebhookSigningSecret.
 * @returns A typed result: { valid: true } or { valid: false, reason: string }.
 * @throws {TypeError} If `secret` is empty/missing (programmer error, not a webhook issue).
 */
declare function verifyWebhookSignature(rawBody: string | Buffer, signatureHeader: string | null | undefined, secret: string): VerificationResult;
/**
 * Parses a raw webhook body into a typed PayGuinWebhookEvent.
 *
 * The returned event is a discriminated union on `event`, so you can switch
 * on `event.event` and get full type narrowing.
 *
 * @param rawBody        - The raw body string (already verified by HMAC).
 * @param idempotencyKey - The X-PayGuin-Idempotency-Key header value (optional).
 * @throws {SyntaxError} If the body is not valid JSON.
 * @throws {Error} If required fields (event, order.id) are missing.
 */
declare function parseWebhookEvent(rawBody: string, idempotencyKey?: string | null): PayGuinWebhookEvent;
/**
 * A framework-agnostic header accessor. Return the header value or null/undefined.
 * Case-insensitive matching is the caller's responsibility (most frameworks do this).
 */
type HeaderAccessor = Record<string, string | string[] | undefined> | ((name: string) => string | null | undefined);
interface HandleWebhookOptions {
    /** Raw request body as received over the wire. */
    rawBody: string | Buffer;
    /** Header accessor: a function (name => value) or a plain object. */
    headers: HeaderAccessor;
    /** The Project's WebhookSigningSecret. */
    secret: string;
    /** Idempotency store. If omitted, deduplication is skipped. */
    store?: IdempotencyStore;
}
/**
 * All-in-one webhook handler: verifies signature, deduplicates, parses.
 *
 * Returns a discriminated union telling the caller whether to process or skip:
 *
 * - `{ action: "process", event }` — signature valid, not a duplicate. Process the event.
 * - `{ action: "skip", reason: "deduplicated" }` — already processed. Return 200 to PayGuin.
 * - `{ action: "skip", reason: "invalid_signature" }` — reject with 401.
 * - `{ action: "skip", reason: "parse_error" }` — body is not valid JSON or missing fields.
 *
 * After successful processing, the caller MUST call `store.remember(event.idempotencyKey)`
 * to mark the event as processed. This is intentionally left to the caller so that
 * failed processing can be retried by PayGuin.
 *
 * @throws {TypeError} If `secret` is empty (programmer error).
 */
declare function handleWebhook(opts: HandleWebhookOptions): Promise<WebhookHandlerResult>;

export { type ChargeResult, type CreateChargeInput, HEADER_DELIVERY_ID, HEADER_EVENT, HEADER_IDEMPOTENCY_KEY, HEADER_NONCE, HEADER_SIGNATURE, HEADER_TIMESTAMP, type HandleWebhookOptions, type HeaderAccessor, type IdempotencyStore, InMemoryIdempotencyStore, type OrderCreatedEvent, type OrderStatus, PayGuinApiError, type PayGuinCheckout, PayGuinClient, type PayGuinClientConfig, type PayGuinCreateOrderRequest, type PayGuinCreateOrderResponse, PayGuinEventType, type PayGuinOrder, type PayGuinPayer, type PayGuinWebhookEvent, type PayGuinWebhookHeaders, type PayGuinWebhookPayload, type PayerInput, type PaymentCanceledEvent, type PaymentExpiredEvent, type PaymentFailedEvent, type PaymentPaidEvent, type PayoutCompletedEvent, type PayoutCreatedEvent, type PayoutFailedEvent, type PayoutPaidEvent, type PayoutRequestedEvent, type RefundCompletedEvent, type RefundCreatedEvent, type VerificationResult, type WebhookHandlerResult, handleWebhook, parseWebhookEvent, verifyWebhookSignature };
