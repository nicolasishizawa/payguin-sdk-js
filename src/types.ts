/**
 * PayGuin SDK types — matches the webhook envelope built by
 * `outbound.BuildEventPayload` in the PayGuin Go service.
 *
 * Reference: paygu-in/internal/outbound/enqueue.go (BuildEventPayload)
 * Reference: paygu-in/internal/core/events.go (event constants)
 */

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export const PayGuinEventType = {
  ORDER_CREATED: "order.created",
  PAYMENT_PAID: "payment.paid",
  PAYMENT_FAILED: "payment.failed",
  PAYMENT_EXPIRED: "payment.expired",
  PAYMENT_CANCELED: "payment.canceled",
  REFUND_CREATED: "refund.created",
  REFUND_COMPLETED: "refund.completed",
  PAYOUT_REQUESTED: "payout.requested",
  PAYOUT_COMPLETED: "payout.completed",
  PAYOUT_FAILED: "payout.failed",
  PAYOUT_CREATED: "payout.created",
  PAYOUT_PAID: "payout.paid",
} as const;

export type PayGuinEventType =
  (typeof PayGuinEventType)[keyof typeof PayGuinEventType];

// ---------------------------------------------------------------------------
// Webhook payload (the JSON body PayGuin POSTs to your endpoint)
// ---------------------------------------------------------------------------

export interface PayGuinWebhookPayload {
  event: PayGuinEventType;
  timestamp: string; // ISO 8601

  order: PayGuinOrder;
  checkout: PayGuinCheckout;
  payer: PayGuinPayer;
  metadata: Record<string, unknown>;
}

/**
 * One paid line of an order, as PayGuin sends it (wire names).
 * The main Checkout is always one of the items; order-bump extras are the rest.
 */
export interface PayGuinOrderItem {
  checkout_id: string; // UUID
  name: string;
  /** Price of this Checkout at order time, integer cents. */
  amount_cents: number;
}

export interface PayGuinOrder {
  id: string; // UUID
  external_id: string;
  /** Your correlation id (from the checkout session or `createCharge`). Empty string when none. */
  reference: string;
  status: string; // "pending" | "paid" | "failed" | "canceled" | "expired"
  /** Total charged: sum of `items`, computed by PayGuin. In USDT cents on a USDT order. */
  amount_cents: number;
  currency: string; // "BRL" | "USDT"
  paid_at: string | null;
  created_at: string; // ISO 8601
  /**
   * Every line of the order, main Checkout included. Absent on servers older
   * than the order-bump release; treat absent as "only `checkout`".
   */
  items?: PayGuinOrderItem[];
  /**
   * `"crypto"` on a USDT order. Absent on a PIX order (the PIX payload did not
   * change): treat absent as `"pix"`.
   */
  payment_method?: PaymentMethod;
  /** Crypto only: the TRX address of this order. */
  crypto_address?: string;
  /** Crypto only: always `"trx"`. */
  crypto_network?: CryptoNetwork;
}

export interface PayGuinCheckout {
  id: string; // UUID
  slug: string;
  name: string;
}

/** On a crypto order without a session every field may be an empty string. */
export interface PayGuinPayer {
  name: string;
  email: string;
  phone: string;
  /** CPF/CNPJ - decrypted by PayGuin before sending. NEVER log this field. */
  document: string;
}

// ---------------------------------------------------------------------------
// Webhook headers sent by PayGuin dispatcher
// ---------------------------------------------------------------------------

export interface PayGuinWebhookHeaders {
  "x-payguin-event": string;
  "x-payguin-delivery-id": string;
  "x-payguin-idempotency-key": string;
  "x-payguin-timestamp": string;
  "x-payguin-nonce": string;
  "x-payguin-signature": string; // "sha256=<hex>"
}

// ---------------------------------------------------------------------------
// Webhook event — discriminated union on `event`
// ---------------------------------------------------------------------------

interface BaseWebhookEvent {
  order: PayGuinOrder;
  checkout: PayGuinCheckout;
  payer: PayGuinPayer;
  metadata: Record<string, unknown>;
  timestamp: string;
  idempotencyKey: string | null;
}

export interface OrderCreatedEvent extends BaseWebhookEvent {
  event: typeof PayGuinEventType.ORDER_CREATED;
}

export interface PaymentPaidEvent extends BaseWebhookEvent {
  event: typeof PayGuinEventType.PAYMENT_PAID;
}

export interface PaymentFailedEvent extends BaseWebhookEvent {
  event: typeof PayGuinEventType.PAYMENT_FAILED;
}

export interface PaymentExpiredEvent extends BaseWebhookEvent {
  event: typeof PayGuinEventType.PAYMENT_EXPIRED;
}

export interface PaymentCanceledEvent extends BaseWebhookEvent {
  event: typeof PayGuinEventType.PAYMENT_CANCELED;
}

export interface RefundCreatedEvent extends BaseWebhookEvent {
  event: typeof PayGuinEventType.REFUND_CREATED;
}

export interface RefundCompletedEvent extends BaseWebhookEvent {
  event: typeof PayGuinEventType.REFUND_COMPLETED;
}

export interface PayoutRequestedEvent extends BaseWebhookEvent {
  event: typeof PayGuinEventType.PAYOUT_REQUESTED;
}

export interface PayoutCompletedEvent extends BaseWebhookEvent {
  event: typeof PayGuinEventType.PAYOUT_COMPLETED;
}

export interface PayoutFailedEvent extends BaseWebhookEvent {
  event: typeof PayGuinEventType.PAYOUT_FAILED;
}

export interface PayoutCreatedEvent extends BaseWebhookEvent {
  event: typeof PayGuinEventType.PAYOUT_CREATED;
}

export interface PayoutPaidEvent extends BaseWebhookEvent {
  event: typeof PayGuinEventType.PAYOUT_PAID;
}

export type PayGuinWebhookEvent =
  | OrderCreatedEvent
  | PaymentPaidEvent
  | PaymentFailedEvent
  | PaymentExpiredEvent
  | PaymentCanceledEvent
  | RefundCreatedEvent
  | RefundCompletedEvent
  | PayoutRequestedEvent
  | PayoutCompletedEvent
  | PayoutFailedEvent
  | PayoutCreatedEvent
  | PayoutPaidEvent;

// ---------------------------------------------------------------------------
// API types — Create Charge
// ---------------------------------------------------------------------------

/** Request body sent to PayGuin: POST /api/v1/checkouts/{checkoutId}/orders */
export interface PayGuinCreateOrderRequest {
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

/**
 * Request body of a USDT charge (same route, on a USDT Checkout). No payer
 * data is sent; with a session, PayGuin takes it from the token.
 */
export interface PayGuinCreateCryptoOrderRequest
  extends Omit<PayGuinCreateOrderRequest, "payer"> {
  payer: Record<string, never>;
}

/** Response from PayGuin: POST /api/v1/checkouts/{checkoutId}/orders */
export interface PayGuinCreateOrderResponse {
  order_id: string;
  external_id: string;
  /** Omitted by the server when the order has no reference. */
  reference?: string;
  status: string;
  amount_cents: number;
  currency: string;
  /** `""` on a crypto charge. */
  pix_copia_e_cola: string;
  /** Absent on a crypto charge (see `crypto_expires_at`). */
  pix_expires_at: string | null;
  /** Every line charged, main Checkout included. Absent on servers before order bump. */
  items?: PayGuinOrderItem[];
  /** `"crypto"` on a USDT charge; absent on PIX. */
  payment_method?: PaymentMethod;
  /** Crypto only: TRX address unique to this charge. */
  crypto_address?: string;
  /** Crypto only: `"trx"`. */
  crypto_network?: CryptoNetwork;
  /** Crypto only: whole USDT (= amount_cents / 100). */
  crypto_amount?: number;
  /** Crypto only: ISO 8601, about 48h after creation. */
  crypto_expires_at?: string;
}

/** Response from PayGuin: GET /api/v1/orders/{orderId}/status */
export interface PayGuinOrderStatusResponse {
  status: OrderStatus["status"];
  amount_cents: number;
  currency: string;
  /** On a crypto order this is the address expiry (`crypto_expires_at`). */
  expires_at?: string | null;
  /** Not personal data: lets the project check whose order this is. */
  reference?: string;
  /** `"crypto"` on a USDT order; absent on PIX. */
  payment_method?: PaymentMethod;
  crypto_address?: string;
  crypto_network?: CryptoNetwork;
  /** Whole USDT. */
  crypto_amount?: number;
}

/** Response from PayGuin: GET /api/v1/checkouts/{checkoutId}/summary */
export interface PayGuinCheckoutSummaryResponse {
  id: string;
  name: string;
  amount_cents: number;
  currency: string;
  is_active: boolean;
}

// ---------------------------------------------------------------------------
// SDK return types (camelCase, consumer-friendly)
// ---------------------------------------------------------------------------

/** One line of an order (camelCase view of {@link PayGuinOrderItem}). */
export interface OrderItem {
  checkoutId: string;
  name: string;
  amountCents: number;
}

export interface ChargeResult {
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

export interface OrderStatus {
  /**
   * On a crypto order `"expired"` is NOT final: the address keeps receiving and
   * a late payment moves it to `"paid"`. On PIX `"expired"` is terminal.
   */
  status: "pending" | "paid" | "canceled" | "failed" | "expired";
  /** In USDT cents on a crypto order. */
  amountCents: number;
  currency: string;
  /** PIX code expiry, or the address expiry on a crypto order. */
  expiresAt: string | null;
  /** Reference stored on the order; null when none. */
  reference: string | null;
  /** `"pix"` or `"crypto"` (servers without crypto always report PIX). */
  paymentMethod: PaymentMethod;
  /** Address, network and amount of a crypto order; null on PIX. */
  crypto: CryptoOrderInfo | null;
}

/** The crypto side of an order (USDT on TRX). */
export interface CryptoOrderInfo {
  /** TRX address unique to this order. */
  address: string;
  network: CryptoNetwork;
  /** Whole USDT. */
  amountUsdt: number;
}

/** Public summary of a Checkout — current price and whether it can be sold. */
export interface CheckoutSummary {
  id: string;
  name: string;
  amountCents: number;
  currency: string;
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// Crypto (USDT on TRX)
// ---------------------------------------------------------------------------

/** How an order is paid. The Checkout currency decides it: BRL = PIX, USDT = crypto. */
export type PaymentMethod = "pix" | "crypto";

/** Network of a crypto charge. PayGuin only uses TRX (TRON, USDT TRC-20). */
export type CryptoNetwork = "trx";

export interface CreateCryptoChargeInput {
  /**
   * Caller-defined reference for correlation, echoed back as `order.reference`.
   * With a `session`, the reference inside the signed token is the one that counts.
   */
  reference?: string;
  /** Free-form metadata, merged on top of the Checkout's own and echoed back in the webhook. */
  metadata?: Record<string, unknown>;
  /**
   * Signed checkout session (see `createCheckoutSession`). A v2 session can fix
   * the USDT price of each item: fill `amounts` with `usdtToCents(...)`.
   */
  session?: string;
  /** Extras the buyer chose (USDT Checkouts), a subset of the session's `bump_checkout_ids`. */
  bumpCheckoutIds?: string[];
}

export interface CryptoChargeResult {
  orderId: string;
  externalId: string;
  /** Reference stored on the order (from the session when one was sent); null when none. */
  reference: string | null;
  status: string;
  /** TRX address unique to this charge. Show it (and a QR of it) to the buyer. */
  address: string;
  network: CryptoNetwork;
  /** Whole USDT the buyer must send: Checkout + chosen extras, computed by PayGuin. */
  amountUsdt: number;
  /** Same total in USDT cents (`amountUsdt * 100`), as in `order.amount_cents`. */
  amountCents: number;
  currency: "USDT";
  /** ISO 8601, about 48h after creation. A payment after it still counts (see README). */
  expiresAt: string;
  /** Lines charged, main Checkout included. `amountCents` in USDT cents. */
  items: OrderItem[];
}

// ---------------------------------------------------------------------------
// Payer input (what the consumer passes in)
// ---------------------------------------------------------------------------

export interface PayerInput {
  name: string;
  email: string;
  phone: string;
  /** CPF or CNPJ. The SDK transmits it but NEVER logs it. */
  document: string;
}

export interface CreateChargeInput {
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

// ---------------------------------------------------------------------------
// Checkout session (signed token handed to the embedded checkout page)
// ---------------------------------------------------------------------------

/** Payer data pre-filled on the checkout page. Empty `phone`/`document` are omitted. */
export interface CheckoutSessionPayer {
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
export interface CheckoutSessionAmount {
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
export interface CheckoutSessionPayloadV1 extends CheckoutSessionPayloadBase {
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
export interface CheckoutSessionPayloadV2 extends CheckoutSessionPayloadBase {
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
export type CheckoutSessionPayload = CheckoutSessionPayloadV1 | CheckoutSessionPayloadV2;

// ---------------------------------------------------------------------------
// Webhook verification result
// ---------------------------------------------------------------------------

export interface VerificationResult {
  valid: boolean;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Webhook handler result
// ---------------------------------------------------------------------------

export type WebhookHandlerResult =
  | { action: "process"; event: PayGuinWebhookEvent }
  | { action: "skip"; reason: "deduplicated" | "invalid_signature" | "parse_error"; detail?: string };

// ---------------------------------------------------------------------------
// Client config
// ---------------------------------------------------------------------------

export interface PayGuinClientConfig {
  /** Base URL of the PayGuin service (e.g. "https://payguin.example.com"). */
  baseUrl: string;
  /** HTTP request timeout in milliseconds. Default: 30000 (30s). */
  timeoutMs?: number;
  /** Injectable fetch for testing. Default: globalThis.fetch. */
  fetch?: typeof globalThis.fetch;
}
