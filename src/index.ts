/**
 * @payguin/sdk — TypeScript SDK for integrating with PayGuin PIX payment gateway.
 *
 * Covers the full PayGuin contract:
 * - Charge creation (PIX copia-e-cola)
 * - Order status polling
 * - Webhook signature verification (HMAC-SHA256)
 * - Webhook event parsing (typed discriminated union)
 * - Idempotency store for deduplication
 *
 * Zero runtime dependencies. Works with Node 18+, Bun, and any HTTP framework.
 */

// Client
export { PayGuinClient } from "./client.js";

// Errors
export { PayGuinApiError } from "./errors.js";

// Webhook
export {
  verifyWebhookSignature,
  parseWebhookEvent,
  handleWebhook,
  HEADER_SIGNATURE,
  HEADER_IDEMPOTENCY_KEY,
  HEADER_EVENT,
  HEADER_DELIVERY_ID,
  HEADER_TIMESTAMP,
  HEADER_NONCE,
} from "./webhook.js";
export type { HandleWebhookOptions, HeaderAccessor } from "./webhook.js";

// Idempotency
export { InMemoryIdempotencyStore } from "./idempotency.js";
export type { IdempotencyStore } from "./idempotency.js";

// Types
export { PayGuinEventType } from "./types.js";

export type {
  // Config
  PayGuinClientConfig,

  // Charge
  PayerInput,
  CreateChargeInput,
  ChargeResult,
  OrderStatus,

  // Webhook payload (raw)
  PayGuinWebhookPayload,
  PayGuinOrder,
  PayGuinCheckout,
  PayGuinPayer,
  PayGuinWebhookHeaders,

  // Webhook event (discriminated union)
  PayGuinWebhookEvent,
  OrderCreatedEvent,
  PaymentPaidEvent,
  PaymentFailedEvent,
  PaymentExpiredEvent,
  PaymentCanceledEvent,
  RefundCreatedEvent,
  RefundCompletedEvent,
  PayoutRequestedEvent,
  PayoutCompletedEvent,
  PayoutFailedEvent,
  PayoutCreatedEvent,
  PayoutPaidEvent,

  // API wire types
  PayGuinCreateOrderRequest,
  PayGuinCreateOrderResponse,

  // Results
  VerificationResult,
  WebhookHandlerResult,
} from "./types.js";
