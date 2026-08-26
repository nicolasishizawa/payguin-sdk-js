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

import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  PayGuinWebhookPayload,
  PayGuinWebhookEvent,
  VerificationResult,
  WebhookHandlerResult,
} from "./types.js";
import type { IdempotencyStore } from "./idempotency.js";

// ---------------------------------------------------------------------------
// Header constants
// ---------------------------------------------------------------------------

export const HEADER_SIGNATURE = "x-payguin-signature";
export const HEADER_IDEMPOTENCY_KEY = "x-payguin-idempotency-key";
export const HEADER_EVENT = "x-payguin-event";
export const HEADER_DELIVERY_ID = "x-payguin-delivery-id";
export const HEADER_TIMESTAMP = "x-payguin-timestamp";
export const HEADER_NONCE = "x-payguin-nonce";

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

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
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  secret: string,
): VerificationResult {
  if (!secret) {
    throw new TypeError(
      "PayGuin webhook secret must not be empty. " +
      "Pass the Project's WebhookSigningSecret from your configuration.",
    );
  }

  if (!rawBody || (typeof rawBody === "string" && rawBody.length === 0)) {
    return { valid: false, reason: "Empty request body" };
  }

  if (!signatureHeader) {
    return { valid: false, reason: "Missing X-PayGuin-Signature header" };
  }

  // Extract hex digest from "sha256=<hex>"
  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) {
    return { valid: false, reason: "Signature header does not start with 'sha256='" };
  }
  const receivedHex = signatureHeader.slice(prefix.length);

  // Validate hex format: must be exactly 64 hex chars for SHA-256
  if (!/^[0-9a-f]{64}$/i.test(receivedHex)) {
    return { valid: false, reason: "Signature is not a valid 64-character hex string" };
  }

  // Compute expected HMAC-SHA256 over the raw body
  const bodyStr = typeof rawBody === "string" ? rawBody : rawBody.toString("utf-8");
  const mac = createHmac("sha256", secret);
  mac.update(bodyStr, "utf-8");
  const expectedHex = mac.digest("hex");

  // Constant-time comparison over the binary digest (not hex strings)
  const expectedBuf = Buffer.from(expectedHex, "hex");
  const receivedBuf = Buffer.from(receivedHex, "hex");

  if (expectedBuf.length !== receivedBuf.length) {
    return { valid: false, reason: "Signature length mismatch" };
  }

  if (!timingSafeEqual(expectedBuf, receivedBuf)) {
    return { valid: false, reason: "Signature does not match" };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Event parsing
// ---------------------------------------------------------------------------

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
export function parseWebhookEvent(
  rawBody: string,
  idempotencyKey?: string | null,
): PayGuinWebhookEvent {
  const payload = JSON.parse(rawBody) as PayGuinWebhookPayload;

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
    idempotencyKey: idempotencyKey ?? null,
  } as PayGuinWebhookEvent;
}

// ---------------------------------------------------------------------------
// Convenience handler
// ---------------------------------------------------------------------------

/**
 * A framework-agnostic header accessor. Return the header value or null/undefined.
 * Case-insensitive matching is the caller's responsibility (most frameworks do this).
 */
export type HeaderAccessor =
  | Record<string, string | string[] | undefined>
  | ((name: string) => string | null | undefined);

function getHeader(
  headers: HeaderAccessor,
  name: string,
): string | null {
  if (typeof headers === "function") {
    return headers(name) ?? null;
  }
  const val = headers[name];
  if (Array.isArray(val)) return val[0] ?? null;
  return val ?? null;
}

export interface HandleWebhookOptions {
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
export async function handleWebhook(
  opts: HandleWebhookOptions,
): Promise<WebhookHandlerResult> {
  const { rawBody, headers, secret, store } = opts;

  // 1. Verify signature
  const signatureHeader = getHeader(headers, HEADER_SIGNATURE);
  const verification = verifyWebhookSignature(rawBody, signatureHeader, secret);
  if (!verification.valid) {
    return { action: "skip", reason: "invalid_signature", detail: verification.reason };
  }

  // 2. Check idempotency
  const idempotencyKey = getHeader(headers, HEADER_IDEMPOTENCY_KEY);
  if (store && idempotencyKey) {
    const alreadySeen = await store.seen(idempotencyKey);
    if (alreadySeen) {
      return { action: "skip", reason: "deduplicated" };
    }
  }

  // 3. Parse event
  const bodyStr = typeof rawBody === "string" ? rawBody : rawBody.toString("utf-8");
  try {
    const event = parseWebhookEvent(bodyStr, idempotencyKey);
    return { action: "process", event };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { action: "skip", reason: "parse_error", detail };
  }
}
