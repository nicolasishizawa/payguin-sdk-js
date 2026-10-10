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
/**
 * One paid line of an order, as PayGuin sends it (wire names).
 * The main Checkout is always one of the items; order-bump extras are the rest.
 */
interface PayGuinOrderItem {
    checkout_id: string;
    name: string;
    /** Price of this Checkout at order time, integer cents. */
    amount_cents: number;
}
interface PayGuinOrder {
    id: string;
    external_id: string;
    /** Your correlation id (from the checkout session or `createCharge`). Empty string when none. */
    reference: string;
    status: string;
    /** Total charged: sum of `items`, computed by PayGuin. */
    amount_cents: number;
    currency: string;
    paid_at: string | null;
    created_at: string;
    /**
     * Every line of the order, main Checkout included. Absent on servers older
     * than the order-bump release; treat absent as "only `checkout`".
     */
    items?: PayGuinOrderItem[];
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
    /** Caller-defined reference for correlation. Returned in `order.reference`. */
    reference?: string;
    /**
     * Arbitrary key-value metadata attached to the order.
     *
     * The Checkout's own metadata is inherited by every Order created on it, and
     * these keys are merged on top: order keys win, the rest survive. Null becomes
     * an empty object in the webhook payload, never `null`.
     */
    metadata?: Record<string, unknown>;
    /** Signed checkout session (see `createCheckoutSession`). */
    session?: string;
    /** Extras the buyer chose; must be a subset of the session's `bump_checkout_ids`. */
    bump_checkout_ids?: string[];
}
/** Response from PayGuin: POST /api/v1/checkouts/{checkoutId}/orders */
interface PayGuinCreateOrderResponse {
    order_id: string;
    external_id: string;
    /** Omitted by the server when the order has no reference. */
    reference?: string;
    status: string;
    amount_cents: number;
    currency: string;
    pix_copia_e_cola: string;
    pix_expires_at: string | null;
    /** Every line charged, main Checkout included. Absent on servers before order bump. */
    items?: PayGuinOrderItem[];
}
/** Response from PayGuin: GET /api/v1/orders/{orderId}/status */
interface PayGuinOrderStatusResponse {
    status: OrderStatus["status"];
    amount_cents: number;
    currency: string;
    expires_at?: string | null;
    /** Not personal data: lets the project check whose order this is. */
    reference?: string;
}
/** Response from PayGuin: GET /api/v1/checkouts/{checkoutId}/summary */
interface PayGuinCheckoutSummaryResponse {
    id: string;
    name: string;
    amount_cents: number;
    currency: string;
    is_active: boolean;
}
/** One line of an order (camelCase view of {@link PayGuinOrderItem}). */
interface OrderItem {
    checkoutId: string;
    name: string;
    amountCents: number;
}
interface ChargeResult {
    orderId: string;
    externalId: string;
    /** Reference stored on the order (from the session when one was sent); null when none. */
    reference: string | null;
    status: string;
    /** Total: main Checkout + chosen extras, computed by PayGuin. */
    amountCents: number;
    currency: string;
    pixCopiaECola: string;
    pixExpiresAt: string | null;
    /** Lines charged, main Checkout included. Empty when the server does not report items. */
    items: OrderItem[];
}
interface OrderStatus {
    status: "pending" | "paid" | "canceled" | "failed" | "expired";
    amountCents: number;
    currency: string;
    expiresAt: string | null;
    /** Reference stored on the order; null when none. */
    reference: string | null;
}
/** Public summary of a Checkout — current price and whether it can be sold. */
interface CheckoutSummary {
    id: string;
    name: string;
    amountCents: number;
    currency: string;
    isActive: boolean;
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
     * Caller-defined reference for correlation. Persisted on the Order and
     * echoed back as `order.reference` in the webhook.
     *
     * With a `session`, the reference inside the signed token is the one that
     * counts — PayGuin never takes it from the request body in that case.
     */
    reference?: string;
    /**
     * Arbitrary key-value metadata attached to the order, merged on top of the
     * Checkout's own metadata (order keys win) and echoed back in the webhook.
     */
    metadata?: Record<string, unknown>;
    /**
     * Signed checkout session (see `createCheckoutSession`). Sent as `session`.
     * Required for order bump: it is what authorizes the extras and the reference.
     */
    session?: string;
    /**
     * Extras the buyer chose, a subset of the session's `bump_checkout_ids`.
     * Sent as `bump_checkout_ids`. An empty array means "no extras" explicitly.
     */
    bumpCheckoutIds?: string[];
}
/** Payer data pre-filled on the checkout page. Empty `phone`/`document` are omitted. */
interface CheckoutSessionPayer {
    name: string;
    email: string;
    phone?: string;
    /** CPF or CNPJ. Travels inside the signed token; never log the token. */
    document?: string;
}
/**
 * Price charged for one item of a v2 session, overriding the Checkout's own
 * `amount_cents`. Items without an entry are charged the Checkout price.
 */
interface CheckoutSessionAmount {
    /** The main `checkout_id` or one of `bump_checkout_ids` (canonical 36-char UUID). */
    checkout_id: string;
    /** Integer cents, 1 to 1_000_000_000 (R$ 10.000.000,00). */
    amount_cents: number;
}
/** Fields shared by every session version. */
interface CheckoutSessionPayloadBase {
    /** Main Checkout being sold. */
    checkout_id: string;
    /** Extras OFFERED on the page (order bump); the buyer picks among them. */
    bump_checkout_ids: string[];
    /** Your purchase id. Comes back as `order.reference` on the webhook. */
    reference: string;
    payer: CheckoutSessionPayer;
    /** Expiry in unix SECONDS (not milliseconds). Keep it short, e.g. now + 30 min. */
    exp: number;
}
/** v1: every item is charged the Checkout's own price. */
interface CheckoutSessionPayloadV1 extends CheckoutSessionPayloadBase {
    /** Token format version. */
    v: 1;
    /** A v1 carries no prices; a non-empty list here throws (use `v: 2`). */
    amounts?: readonly [] | null;
}
/**
 * v2: the session also fixes the price of the listed items (e.g. an affiliate
 * price). Only items with their own price need an entry. An empty or absent
 * `amounts` is signed as a v1, byte for byte.
 */
interface CheckoutSessionPayloadV2 extends CheckoutSessionPayloadBase {
    /** Token format version. */
    v: 2;
    /** 1 to 11 entries; each id is the main checkout or an offered extra, no repeats. */
    amounts?: readonly CheckoutSessionAmount[] | null;
}
/**
 * What the project signs for PayGuin (wire names, snake_case, on purpose: this
 * is exactly the JSON that gets signed). PayGuin trusts `reference`, the
 * offered extras and the `amounts` ONLY from here, never from the browser.
 */
type CheckoutSessionPayload = CheckoutSessionPayloadV1 | CheckoutSessionPayloadV2;
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
 * Creates PIX charges, queries order status and reads Checkout summaries.
 * Zero runtime dependencies: uses built-in fetch (Node 18+ / Bun) and node:crypto.
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
     * `reference` and `metadata` are accepted end to end: the Go backend persists
     * them on the Order and echoes them back in the outbound webhook payload.
     * With a `session`, the extras in `bumpCheckoutIds` are added to the charge
     * (PayGuin sums the prices server-side) and the reference comes from the token.
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
     * `reference` lets you confirm the order belongs to the purchase you expect
     * before acting on an order id that came from a browser.
     *
     * @throws {PayGuinApiError} On non-2xx HTTP responses.
     * @throws {Error} On network failures or timeouts.
     */
    getOrderStatus(orderId: string): Promise<OrderStatus>;
    /**
     * Reads the public summary of a Checkout: current name, price and whether
     * it is active.
     *
     * Calls GET /api/v1/checkouts/{checkoutId}/summary. Lets a project show the
     * price that is configured in PayGuin right now, so changing a price in the
     * desktop app needs no deploy on the project side.
     *
     * @throws {PayGuinApiError} On non-2xx HTTP responses (404 for an unknown id).
     * @throws {Error} On network failures or timeouts.
     */
    getCheckoutSummary(checkoutId: string): Promise<CheckoutSummary>;
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
 * Checkout session — the signed token a project hands to the embedded PayGuin
 * checkout page (via postMessage, never in the URL).
 *
 *   token = base64url(payloadJSON) + "." + base64url(HMAC-SHA256(key, base64url(payloadJSON)))
 *   key   = HMAC-SHA256(projectSigningSecret, "payguin-checkout-session-v1")
 *
 * Why a derived key instead of the webhook secret itself: the same secret
 * already signs outbound webhooks; deriving a purpose-bound key means a token
 * signature can never be replayed as a webhook signature (or vice versa), and
 * no new secret has to be configured per project.
 *
 * base64url is RFC 4648 §5 WITHOUT padding (Node's "base64url", Go's
 * base64.RawURLEncoding). PayGuin verifies the HMAC over the base64url string
 * exactly as received, so it never depends on how the JSON was serialized —
 * but we still emit a fixed field order so the output is reproducible and can
 * be cross-checked against a known vector.
 *
 * Payload versions (the key label above belongs to the KEY, not the payload):
 *
 *   v1: {"v":1,"checkout_id","bump_checkout_ids","reference","payer","exp"}
 *   v2: {"v":2,"checkout_id","bump_checkout_ids","amounts","reference","payer","exp"}
 *       amounts = [{"checkout_id":"<uuid>","amount_cents":<int>}, ...]
 *
 * A non-empty `amounts` makes it a v2; without one (absent, null or []) the
 * token is the v1 of before, byte for byte. The JSON has no spaces and does not
 * escape & < > (JSON.stringify; PayGuin's Go side turns HTML escaping off).
 */

/**
 * Builds and signs a checkout session token.
 *
 * @param payload              - Session contents (see {@link CheckoutSessionPayload}).
 * @param projectSigningSecret - The Project's webhook signing secret (the same one
 *                               used with `verifyWebhookSignature`).
 * @returns The token: `<base64url payload>.<base64url signature>`.
 * @throws {TypeError} On an empty secret or a payload outside the contract
 *                     (programmer errors: failing loudly beats a token PayGuin rejects later).
 */
declare function createCheckoutSession(payload: CheckoutSessionPayload, projectSigningSecret: string): string;

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
 * `order.items` (every paid line, main Checkout included) comes through as
 * sent; it is absent on servers older than order bump.
 *
 * @throws {SyntaxError} If the body is not valid JSON.
 * @throws {Error} If required fields (event, order.id) are missing, or if
 *                 `order.items` is present but not an array.
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

export { type ChargeResult, type CheckoutSessionAmount, type CheckoutSessionPayer, type CheckoutSessionPayload, type CheckoutSessionPayloadV1, type CheckoutSessionPayloadV2, type CheckoutSummary, type CreateChargeInput, HEADER_DELIVERY_ID, HEADER_EVENT, HEADER_IDEMPOTENCY_KEY, HEADER_NONCE, HEADER_SIGNATURE, HEADER_TIMESTAMP, type HandleWebhookOptions, type HeaderAccessor, type IdempotencyStore, InMemoryIdempotencyStore, type OrderCreatedEvent, type OrderItem, type OrderStatus, PayGuinApiError, type PayGuinCheckout, type PayGuinCheckoutSummaryResponse, PayGuinClient, type PayGuinClientConfig, type PayGuinCreateOrderRequest, type PayGuinCreateOrderResponse, PayGuinEventType, type PayGuinOrder, type PayGuinOrderItem, type PayGuinOrderStatusResponse, type PayGuinPayer, type PayGuinWebhookEvent, type PayGuinWebhookHeaders, type PayGuinWebhookPayload, type PayerInput, type PaymentCanceledEvent, type PaymentExpiredEvent, type PaymentFailedEvent, type PaymentPaidEvent, type PayoutCompletedEvent, type PayoutCreatedEvent, type PayoutFailedEvent, type PayoutPaidEvent, type PayoutRequestedEvent, type RefundCompletedEvent, type RefundCreatedEvent, type VerificationResult, type WebhookHandlerResult, createCheckoutSession, handleWebhook, parseWebhookEvent, verifyWebhookSignature };
