"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  HEADER_DELIVERY_ID: () => HEADER_DELIVERY_ID,
  HEADER_EVENT: () => HEADER_EVENT,
  HEADER_IDEMPOTENCY_KEY: () => HEADER_IDEMPOTENCY_KEY,
  HEADER_NONCE: () => HEADER_NONCE,
  HEADER_SIGNATURE: () => HEADER_SIGNATURE,
  HEADER_TIMESTAMP: () => HEADER_TIMESTAMP,
  InMemoryIdempotencyStore: () => InMemoryIdempotencyStore,
  PayGuinApiError: () => PayGuinApiError,
  PayGuinClient: () => PayGuinClient,
  PayGuinEventType: () => PayGuinEventType,
  handleWebhook: () => handleWebhook,
  parseWebhookEvent: () => parseWebhookEvent,
  verifyWebhookSignature: () => verifyWebhookSignature
});
module.exports = __toCommonJS(index_exports);

// src/errors.ts
var PayGuinApiError = class extends Error {
  constructor(message, httpStatus, errorCode, errorMessage, responseBody) {
    super(message);
    this.httpStatus = httpStatus;
    this.errorCode = errorCode;
    this.errorMessage = errorMessage;
    this.responseBody = responseBody;
    this.name = "PayGuinApiError";
  }
  httpStatus;
  errorCode;
  errorMessage;
  responseBody;
  kind = "PayGuinApiError";
};

// src/client.ts
var DEFAULT_TIMEOUT_MS = 3e4;
var PayGuinClient = class {
  baseUrl;
  timeoutMs;
  fetch;
  constructor(config) {
    if (!config.baseUrl) {
      throw new TypeError(
        "PayGuinClient requires a baseUrl (e.g. 'https://payguin.example.com')"
      );
    }
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetch = config.fetch ?? globalThis.fetch;
  }
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
  async createCharge(checkoutId, input) {
    if (!checkoutId) {
      throw new TypeError("checkoutId must not be empty");
    }
    const payload = {
      payer: {
        name: input.payer.name,
        email: input.payer.email,
        phone: input.payer.phone,
        document: input.payer.document
      }
    };
    if (input.reference !== void 0) {
      payload.reference = input.reference;
    }
    if (input.metadata !== void 0) {
      payload.metadata = input.metadata;
    }
    const url = `${this.baseUrl}/api/v1/checkouts/${encodeURIComponent(checkoutId)}/orders`;
    const response = await this.doFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      await this.throwApiError("createCharge", response);
    }
    const data = await response.json();
    return {
      orderId: data.order_id,
      externalId: data.external_id,
      status: data.status,
      amountCents: data.amount_cents,
      currency: data.currency,
      pixCopiaECola: data.pix_copia_e_cola,
      pixExpiresAt: data.pix_expires_at
    };
  }
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
  async getOrderStatus(orderId) {
    if (!orderId) {
      throw new TypeError("orderId must not be empty");
    }
    const url = `${this.baseUrl}/api/v1/orders/${encodeURIComponent(orderId)}/status`;
    const response = await this.doFetch(url, { method: "GET" });
    if (!response.ok) {
      await this.throwApiError("getOrderStatus", response);
    }
    const data = await response.json();
    return {
      status: data.status,
      amountCents: data.amount_cents,
      currency: data.currency,
      expiresAt: data.expires_at ?? null
    };
  }
  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------
  async doFetch(url, init) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }
  async throwApiError(operation, response) {
    let body = "";
    let errorCode;
    let errorMessage;
    try {
      body = await response.text();
      const parsed = JSON.parse(body);
      errorCode = typeof parsed.code === "string" ? parsed.code : void 0;
      errorMessage = typeof parsed.message === "string" ? parsed.message : void 0;
    } catch {
    }
    throw new PayGuinApiError(
      `[PayGuinClient] ${operation} failed: HTTP ${response.status}${errorMessage ? ` - ${errorMessage}` : ""}`,
      response.status,
      errorCode,
      errorMessage,
      body || void 0
    );
  }
};

// src/webhook.ts
var import_node_crypto = require("crypto");
var HEADER_SIGNATURE = "x-payguin-signature";
var HEADER_IDEMPOTENCY_KEY = "x-payguin-idempotency-key";
var HEADER_EVENT = "x-payguin-event";
var HEADER_DELIVERY_ID = "x-payguin-delivery-id";
var HEADER_TIMESTAMP = "x-payguin-timestamp";
var HEADER_NONCE = "x-payguin-nonce";
function verifyWebhookSignature(rawBody, signatureHeader, secret) {
  if (!secret) {
    throw new TypeError(
      "PayGuin webhook secret must not be empty. Pass the Project's WebhookSigningSecret from your configuration."
    );
  }
  if (!rawBody || typeof rawBody === "string" && rawBody.length === 0) {
    return { valid: false, reason: "Empty request body" };
  }
  if (!signatureHeader) {
    return { valid: false, reason: "Missing X-PayGuin-Signature header" };
  }
  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) {
    return { valid: false, reason: "Signature header does not start with 'sha256='" };
  }
  const receivedHex = signatureHeader.slice(prefix.length);
  if (!/^[0-9a-f]{64}$/i.test(receivedHex)) {
    return { valid: false, reason: "Signature is not a valid 64-character hex string" };
  }
  const bodyStr = typeof rawBody === "string" ? rawBody : rawBody.toString("utf-8");
  const mac = (0, import_node_crypto.createHmac)("sha256", secret);
  mac.update(bodyStr, "utf-8");
  const expectedHex = mac.digest("hex");
  const expectedBuf = Buffer.from(expectedHex, "hex");
  const receivedBuf = Buffer.from(receivedHex, "hex");
  if (expectedBuf.length !== receivedBuf.length) {
    return { valid: false, reason: "Signature length mismatch" };
  }
  if (!(0, import_node_crypto.timingSafeEqual)(expectedBuf, receivedBuf)) {
    return { valid: false, reason: "Signature does not match" };
  }
  return { valid: true };
}
function parseWebhookEvent(rawBody, idempotencyKey) {
  const payload = JSON.parse(rawBody);
  if (!payload.event) {
    throw new Error("PayGuin webhook payload is missing the 'event' field");
  }
  if (!payload.order?.id) {
    throw new Error("PayGuin webhook payload is missing 'order.id'");
  }
  return {
    event: payload.event,
    order: payload.order,
    checkout: payload.checkout,
    payer: payload.payer,
    metadata: payload.metadata ?? {},
    timestamp: payload.timestamp,
    idempotencyKey: idempotencyKey ?? null
  };
}
function getHeader(headers, name) {
  if (typeof headers === "function") {
    return headers(name) ?? null;
  }
  const val = headers[name];
  if (Array.isArray(val)) return val[0] ?? null;
  return val ?? null;
}
async function handleWebhook(opts) {
  const { rawBody, headers, secret, store } = opts;
  const signatureHeader = getHeader(headers, HEADER_SIGNATURE);
  const verification = verifyWebhookSignature(rawBody, signatureHeader, secret);
  if (!verification.valid) {
    return { action: "skip", reason: "invalid_signature", detail: verification.reason };
  }
  const idempotencyKey = getHeader(headers, HEADER_IDEMPOTENCY_KEY);
  if (store && idempotencyKey) {
    const alreadySeen = await store.seen(idempotencyKey);
    if (alreadySeen) {
      return { action: "skip", reason: "deduplicated" };
    }
  }
  const bodyStr = typeof rawBody === "string" ? rawBody : rawBody.toString("utf-8");
  try {
    const event = parseWebhookEvent(bodyStr, idempotencyKey);
    return { action: "process", event };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { action: "skip", reason: "parse_error", detail };
  }
}

// src/idempotency.ts
var InMemoryIdempotencyStore = class {
  keys = /* @__PURE__ */ new Set();
  maxSize;
  constructor(maxSize = 1e5) {
    this.maxSize = maxSize;
  }
  async seen(key) {
    return this.keys.has(key);
  }
  async remember(key) {
    if (this.keys.size < this.maxSize) {
      this.keys.add(key);
    }
  }
  /** Current number of stored keys. */
  get size() {
    return this.keys.size;
  }
};

// src/types.ts
var PayGuinEventType = {
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
  PAYOUT_PAID: "payout.paid"
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  HEADER_DELIVERY_ID,
  HEADER_EVENT,
  HEADER_IDEMPOTENCY_KEY,
  HEADER_NONCE,
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
  InMemoryIdempotencyStore,
  PayGuinApiError,
  PayGuinClient,
  PayGuinEventType,
  handleWebhook,
  parseWebhookEvent,
  verifyWebhookSignature
});
//# sourceMappingURL=index.cjs.map