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
  USDT_MIN_AMOUNT: () => USDT_MIN_AMOUNT,
  USDT_NETWORK: () => USDT_NETWORK,
  createCheckoutSession: () => createCheckoutSession,
  handleWebhook: () => handleWebhook,
  isValidUsdtAmount: () => isValidUsdtAmount,
  parseWebhookEvent: () => parseWebhookEvent,
  usdtToCents: () => usdtToCents,
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

// src/usdt.ts
var USDT_MIN_AMOUNT = 10;
var USDT_NETWORK = "trx";
var USDT_MAX_AMOUNT = 1e7;
function isValidUsdtAmount(amountUsdt) {
  return typeof amountUsdt === "number" && Number.isSafeInteger(amountUsdt) && amountUsdt >= USDT_MIN_AMOUNT && amountUsdt <= USDT_MAX_AMOUNT;
}
function usdtToCents(amountUsdt) {
  if (!isValidUsdtAmount(amountUsdt)) {
    throw new TypeError(
      `USDT amount must be a whole number from ${USDT_MIN_AMOUNT} to ${USDT_MAX_AMOUNT} (got ${String(amountUsdt)}); PayGuin charges whole USDT only`
    );
  }
  return amountUsdt * 100;
}

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
   * `reference` and `metadata` are accepted end to end: the Go backend persists
   * them on the Order and echoes them back in the outbound webhook payload.
   * With a `session`, the extras in `bumpCheckoutIds` are added to the charge
   * (PayGuin sums the prices server-side) and the reference comes from the token.
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
    if (input.session !== void 0) {
      payload.session = input.session;
    }
    if (input.bumpCheckoutIds !== void 0) {
      payload.bump_checkout_ids = input.bumpCheckoutIds;
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
      // The server omits an empty reference; "" and absent both mean "none".
      reference: data.reference || null,
      status: data.status,
      amountCents: data.amount_cents,
      currency: data.currency,
      pixCopiaECola: data.pix_copia_e_cola,
      pixExpiresAt: data.pix_expires_at,
      items: toOrderItems(data.items)
    };
  }
  /**
   * Creates a USDT charge (TRX network) on a USDT Checkout.
   *
   * Same route as `createCharge` (POST /api/v1/checkouts/{checkoutId}/orders),
   * but no payer data is sent: the body is `{"payer": {}}` plus the optional
   * session, extras, reference and metadata. The price comes from the Checkout,
   * or from a v2 session (`amounts`, built with `usdtToCents`). PayGuin answers
   * with an address unique to this charge, valid for about 48h.
   *
   * Amounts are whole USDT, at least 10 (`USDT_MIN_AMOUNT`). PayGuin refuses
   * anything else with 422 `invalid_amount`; 422 `unsupported` means the
   * organization's provider has no crypto; 502 `provider_amount_mismatch`
   * means the provider registered another value and the charge was dropped.
   *
   * @throws {PayGuinApiError} On non-2xx HTTP responses.
   * @throws {Error} When the Checkout is not a USDT one, or the answer lacks
   *                 the crypto fields (a server without crypto support).
   * @throws {Error} On network failures or timeouts.
   */
  async createCryptoCharge(checkoutId, input = {}) {
    if (!checkoutId) {
      throw new TypeError("checkoutId must not be empty");
    }
    const payload = { payer: {} };
    if (input.reference !== void 0) {
      payload.reference = input.reference;
    }
    if (input.metadata !== void 0) {
      payload.metadata = input.metadata;
    }
    if (input.session !== void 0) {
      payload.session = input.session;
    }
    if (input.bumpCheckoutIds !== void 0) {
      payload.bump_checkout_ids = input.bumpCheckoutIds;
    }
    const url = `${this.baseUrl}/api/v1/checkouts/${encodeURIComponent(checkoutId)}/orders`;
    const response = await this.doFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      await this.throwApiError("createCryptoCharge", response);
    }
    const data = await response.json();
    if (data.payment_method !== "crypto") {
      throw new Error(
        `[PayGuinClient] createCryptoCharge: checkout ${checkoutId} is not a USDT checkout (PayGuin created order ${data.order_id} as ${data.payment_method ?? "pix"})`
      );
    }
    if (!data.crypto_address || data.crypto_network !== USDT_NETWORK || !isValidUsdtAmount(data.crypto_amount) || !data.crypto_expires_at) {
      throw new Error(
        `[PayGuinClient] createCryptoCharge: incomplete crypto answer for order ${data.order_id}`
      );
    }
    return {
      orderId: data.order_id,
      externalId: data.external_id,
      reference: data.reference || null,
      status: data.status,
      address: data.crypto_address,
      network: data.crypto_network,
      amountUsdt: data.crypto_amount,
      amountCents: data.amount_cents,
      currency: "USDT",
      expiresAt: data.crypto_expires_at,
      items: toOrderItems(data.items)
    };
  }
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
    const isCrypto = data.payment_method === "crypto";
    return {
      status: data.status,
      amountCents: data.amount_cents,
      currency: data.currency,
      expiresAt: data.expires_at ?? null,
      reference: data.reference || null,
      // Absent payment_method = PIX (PIX responses did not change).
      paymentMethod: isCrypto ? "crypto" : "pix",
      crypto: isCrypto ? {
        address: data.crypto_address ?? "",
        network: data.crypto_network ?? USDT_NETWORK,
        amountUsdt: data.crypto_amount ?? data.amount_cents / 100
      } : null
    };
  }
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
  async getCheckoutSummary(checkoutId) {
    if (!checkoutId) {
      throw new TypeError("checkoutId must not be empty");
    }
    const url = `${this.baseUrl}/api/v1/checkouts/${encodeURIComponent(checkoutId)}/summary`;
    const response = await this.doFetch(url, { method: "GET" });
    if (!response.ok) {
      await this.throwApiError("getCheckoutSummary", response);
    }
    const data = await response.json();
    return {
      id: data.id,
      name: data.name,
      amountCents: data.amount_cents,
      currency: data.currency,
      isActive: data.is_active
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
      errorCode = typeof parsed.error === "string" ? parsed.error : typeof parsed.code === "string" ? parsed.code : void 0;
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
function toOrderItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    checkoutId: item.checkout_id,
    name: item.name,
    amountCents: item.amount_cents
  }));
}

// src/session.ts
var import_node_crypto = require("crypto");
var KEY_LABEL = "payguin-checkout-session-v1";
var MAX_EXP_SECONDS = 1e11;
var MAX_AMOUNTS = 11;
var MAX_AMOUNT_CENTS = 1e9;
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function createCheckoutSession(payload, projectSigningSecret) {
  if (!projectSigningSecret) {
    throw new TypeError(
      "PayGuin project signing secret must not be empty. Pass the Project's WebhookSigningSecret from your configuration."
    );
  }
  const json = JSON.stringify(canonicalPayload(payload));
  const body = Buffer.from(json, "utf-8").toString("base64url");
  const key = (0, import_node_crypto.createHmac)("sha256", projectSigningSecret).update(KEY_LABEL, "utf-8").digest();
  const signature = (0, import_node_crypto.createHmac)("sha256", key).update(body, "utf-8").digest("base64url");
  return `${body}.${signature}`;
}
function canonicalPayload(p) {
  if (!p || typeof p !== "object") {
    throw new TypeError("Checkout session payload must be an object");
  }
  if (p.v !== 1 && p.v !== 2) {
    throw new TypeError("Checkout session payload 'v' must be 1 or 2");
  }
  requireNonEmptyString(p.checkout_id, "checkout_id");
  if (!Array.isArray(p.bump_checkout_ids)) {
    throw new TypeError("Checkout session payload 'bump_checkout_ids' must be an array");
  }
  p.bump_checkout_ids.forEach((id, i) => requireNonEmptyString(id, `bump_checkout_ids[${i}]`));
  requireNonEmptyString(p.reference, "reference");
  const payer = p.payer;
  if (!payer || typeof payer !== "object") {
    throw new TypeError("Checkout session payload 'payer' must be an object");
  }
  requireNonEmptyString(payer.name, "payer.name");
  requireNonEmptyString(payer.email, "payer.email");
  const phone = optionalString(payer.phone, "payer.phone");
  const document = optionalString(payer.document, "payer.document");
  if (!Number.isInteger(p.exp) || p.exp <= 0 || p.exp >= MAX_EXP_SECONDS) {
    throw new TypeError(
      "Checkout session payload 'exp' must be a positive integer in unix SECONDS (e.g. Math.floor(Date.now() / 1000) + 30 * 60)"
    );
  }
  const amounts = canonicalAmounts(p);
  const canonicalPayer = {
    name: payer.name,
    email: payer.email,
    ...phone ? { phone } : {},
    ...document ? { document } : {}
  };
  if (!amounts) {
    return {
      v: 1,
      checkout_id: p.checkout_id,
      bump_checkout_ids: [...p.bump_checkout_ids],
      reference: p.reference,
      payer: canonicalPayer,
      exp: p.exp
    };
  }
  return {
    v: 2,
    checkout_id: p.checkout_id,
    bump_checkout_ids: [...p.bump_checkout_ids],
    amounts,
    reference: p.reference,
    payer: canonicalPayer,
    exp: p.exp
  };
}
function canonicalAmounts(p) {
  const raw = p.amounts;
  if (raw === void 0 || raw === null) return void 0;
  if (!Array.isArray(raw)) {
    throw new TypeError("Checkout session payload 'amounts' must be an array");
  }
  if (raw.length === 0) return void 0;
  if (p.v !== 2) {
    throw new TypeError(
      "Checkout session payload 'amounts' requires 'v' 2 (a v1 session carries no prices)"
    );
  }
  if (raw.length > MAX_AMOUNTS) {
    throw new TypeError(
      `Checkout session payload 'amounts' must have at most ${MAX_AMOUNTS} entries (the main checkout + 10 extras)`
    );
  }
  const allowed = new Set(
    [p.checkout_id, ...p.bump_checkout_ids].filter((id) => UUID_RE.test(id)).map((id) => id.toLowerCase())
  );
  const seen = /* @__PURE__ */ new Set();
  return raw.map((entry, i) => {
    const field = `amounts[${i}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new TypeError(`Checkout session payload '${field}' must be an object`);
    }
    const { checkout_id: id, amount_cents: cents } = entry;
    if (typeof id !== "string" || !UUID_RE.test(id)) {
      throw new TypeError(
        `Checkout session payload '${field}.checkout_id' must be a canonical UUID (36 characters)`
      );
    }
    const key = id.toLowerCase();
    if (!allowed.has(key)) {
      throw new TypeError(
        `Checkout session payload '${field}.checkout_id' must be the payload's 'checkout_id' or one of 'bump_checkout_ids'`
      );
    }
    if (seen.has(key)) {
      throw new TypeError(`Checkout session payload '${field}.checkout_id' is repeated`);
    }
    seen.add(key);
    if (typeof cents !== "number" || !Number.isInteger(cents) || cents < 1 || cents > MAX_AMOUNT_CENTS) {
      throw new TypeError(
        `Checkout session payload '${field}.amount_cents' must be an integer from 1 to ${MAX_AMOUNT_CENTS} (cents)`
      );
    }
    return { checkout_id: id, amount_cents: cents };
  });
}
function requireNonEmptyString(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`Checkout session payload '${field}' must be a non-empty string`);
  }
}
function optionalString(value, field) {
  if (value === void 0 || value === null || value === "") return void 0;
  if (typeof value !== "string") {
    throw new TypeError(`Checkout session payload '${field}' must be a string`);
  }
  return value;
}

// src/webhook.ts
var import_node_crypto2 = require("crypto");
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
  const mac = (0, import_node_crypto2.createHmac)("sha256", secret);
  mac.update(bodyStr, "utf-8");
  const expectedHex = mac.digest("hex");
  const expectedBuf = Buffer.from(expectedHex, "hex");
  const receivedBuf = Buffer.from(receivedHex, "hex");
  if (expectedBuf.length !== receivedBuf.length) {
    return { valid: false, reason: "Signature length mismatch" };
  }
  if (!(0, import_node_crypto2.timingSafeEqual)(expectedBuf, receivedBuf)) {
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
  if (payload.order.items !== void 0 && !Array.isArray(payload.order.items)) {
    throw new Error("PayGuin webhook payload has a non-array 'order.items'");
  }
  return {
    ...payload,
    metadata: payload.metadata ?? {},
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
  USDT_MIN_AMOUNT,
  USDT_NETWORK,
  createCheckoutSession,
  handleWebhook,
  isValidUsdtAmount,
  parseWebhookEvent,
  usdtToCents,
  verifyWebhookSignature
});
//# sourceMappingURL=index.cjs.map