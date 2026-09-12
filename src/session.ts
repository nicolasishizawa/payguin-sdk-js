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
 */

import { createHmac } from "node:crypto";
import type { CheckoutSessionPayload } from "./types.js";

const KEY_LABEL = "payguin-checkout-session-v1";

/**
 * Unix seconds this large are really `Date.now()` milliseconds (year ~5138 in
 * seconds). Accepting them would mint a token valid for millennia and quietly
 * defeat the short expiry the session relies on.
 */
const MAX_EXP_SECONDS = 1e11;

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
export function createCheckoutSession(
  payload: CheckoutSessionPayload,
  projectSigningSecret: string,
): string {
  if (!projectSigningSecret) {
    throw new TypeError(
      "PayGuin project signing secret must not be empty. " +
      "Pass the Project's WebhookSigningSecret from your configuration.",
    );
  }

  const json = JSON.stringify(canonicalPayload(payload));
  const body = Buffer.from(json, "utf-8").toString("base64url");
  const key = createHmac("sha256", projectSigningSecret).update(KEY_LABEL, "utf-8").digest();
  const signature = createHmac("sha256", key).update(body, "utf-8").digest("base64url");
  return `${body}.${signature}`;
}

/**
 * Validates the payload and rebuilds it field by field in contract order.
 * Unknown keys are dropped: PayGuin may reject fields it does not know, and a
 * signed token should carry exactly what the contract says — nothing a caller
 * spread in by accident.
 */
function canonicalPayload(p: CheckoutSessionPayload): CheckoutSessionPayload {
  if (!p || typeof p !== "object") {
    throw new TypeError("Checkout session payload must be an object");
  }
  if (p.v !== 1) {
    throw new TypeError("Checkout session payload 'v' must be 1");
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
      "Checkout session payload 'exp' must be a positive integer in unix SECONDS " +
      "(e.g. Math.floor(Date.now() / 1000) + 30 * 60)",
    );
  }

  return {
    v: 1,
    checkout_id: p.checkout_id,
    bump_checkout_ids: [...p.bump_checkout_ids],
    reference: p.reference,
    payer: {
      name: payer.name,
      email: payer.email,
      ...(phone ? { phone } : {}),
      ...(document ? { document } : {}),
    },
    exp: p.exp,
  };
}

function requireNonEmptyString(value: unknown, field: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`Checkout session payload '${field}' must be a non-empty string`);
  }
}

/** Absent, null or "" → omitted (the page asks for it). Anything else must be a string. */
function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new TypeError(`Checkout session payload '${field}' must be a string`);
  }
  return value;
}
