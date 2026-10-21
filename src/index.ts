/**
 * @payguin/sdk — TypeScript SDK for integrating with PayGuin (PIX and USDT).
 *
 * Covers the full PayGuin contract:
 * - Charge creation (PIX copia-e-cola), with order-bump extras via a signed session
 * - USDT charge on the TRX network (address unique per charge, ~48h)
 * - Checkout session signing (embedded checkout; v2 carries per-item prices)
 * - Order status polling
 * - Checkout summary (current price)
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

// Checkout session (embed)
export { createCheckoutSession } from "./session.js";

// USDT (crypto) rules
export { usdtToCents, isValidUsdtAmount, USDT_MIN_AMOUNT, USDT_NETWORK } from "./usdt.js";

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
  OrderItem,
  CheckoutSummary,

  // Crypto charge (USDT on TRX)
  PaymentMethod,
  CryptoNetwork,
  CreateCryptoChargeInput,
  CryptoChargeResult,
  CryptoOrderInfo,

  // Webhook payload (raw)
  PayGuinWebhookPayload,
  PayGuinOrder,
  PayGuinOrderItem,
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
  PayGuinCreateCryptoOrderRequest,
  PayGuinCreateOrderResponse,
  PayGuinOrderStatusResponse,
  PayGuinCheckoutSummaryResponse,

  // Checkout session
  CheckoutSessionPayload,
  CheckoutSessionPayloadV1,
  CheckoutSessionPayloadV2,
  CheckoutSessionAmount,
  CheckoutSessionPayer,

  // Results
  VerificationResult,
  WebhookHandlerResult,
} from "./types.js";
