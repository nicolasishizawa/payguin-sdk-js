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

export interface PayGuinOrder {
  id: string; // UUID
  external_id: string;
  status: string; // "pending" | "paid" | "failed" | "canceled" | "expired"
  amount_cents: number;
  currency: string; // "BRL"
  paid_at: string | null;
  created_at: string; // ISO 8601
}

export interface PayGuinCheckout {
  id: string; // UUID
  slug: string;
  name: string;
}

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
}

/** Response from PayGuin: POST /api/v1/checkouts/{checkoutId}/orders */
export interface PayGuinCreateOrderResponse {
  order_id: string;
  external_id: string;
  status: string;
  amount_cents: number;
  currency: string;
  pix_copia_e_cola: string;
  pix_expires_at: string | null;
}

// ---------------------------------------------------------------------------
// SDK return types (camelCase, consumer-friendly)
// ---------------------------------------------------------------------------

export interface ChargeResult {
  orderId: string;
  externalId: string;
  status: string;
  amountCents: number;
  currency: string;
  pixCopiaECola: string;
  pixExpiresAt: string | null;
}

export interface OrderStatus {
  status: "pending" | "paid" | "canceled" | "failed" | "expired";
  amountCents: number;
  currency: string;
  expiresAt: string | null;
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
