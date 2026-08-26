/**
 * Quickstart example — shows the full PayGuin integration flow:
 * 1. Create a PIX charge
 * 2. Receive and verify the webhook
 *
 * This is a runnable sketch using Hono, but the SDK works with any framework.
 *
 * Usage:
 *   bun run examples/quickstart.ts
 *   # or: npx tsx examples/quickstart.ts
 */

import { Hono } from "hono";
import {
  PayGuinClient,
  handleWebhook,
  InMemoryIdempotencyStore,
  PayGuinEventType,
} from "@payguin/sdk";

// --- Setup -------------------------------------------------------------------

const payguin = new PayGuinClient({
  baseUrl: process.env.PAYGUIN_API_URL ?? "http://localhost:8080",
});

const idempotencyStore = new InMemoryIdempotencyStore();
const webhookSecret = process.env.PAYGUIN_WEBHOOK_SECRET ?? "";

const app = new Hono();

// --- Create charge endpoint --------------------------------------------------

app.post("/checkout/:checkoutId", async (c) => {
  const checkoutId = c.req.param("checkoutId");
  const body = await c.req.json<{
    payer: { name: string; email: string; phone: string; document: string };
  }>();

  const charge = await payguin.createCharge(checkoutId, {
    payer: body.payer,
  });

  // Return the PIX code to the frontend
  return c.json({
    orderId: charge.orderId,
    pixCopiaECola: charge.pixCopiaECola,
    expiresAt: charge.pixExpiresAt,
  });
});

// --- Webhook endpoint --------------------------------------------------------

app.post("/webhook/payguin", async (c) => {
  const rawBody = await c.req.text(); // Raw body for HMAC
  const result = await handleWebhook({
    rawBody,
    headers: (name) => c.req.header(name) ?? null,
    secret: webhookSecret,
    store: idempotencyStore,
  });

  if (result.action === "skip") {
    if (result.reason === "invalid_signature") {
      return c.json({ error: "Invalid signature" }, 401);
    }
    // Deduplicated or parse error — return 200 so PayGuin stops retrying
    return c.json({ success: true, deduplicated: true });
  }

  // result.action === "process"
  const event = result.event;

  switch (event.event) {
    case PayGuinEventType.PAYMENT_PAID:
      console.log(`Payment confirmed for order ${event.order.id}`);
      // YOUR LOGIC HERE: grant access, activate subscription, etc.
      // The SDK stops at "payment confirmed" — entitlement is your responsibility.
      break;

    case PayGuinEventType.PAYMENT_FAILED:
    case PayGuinEventType.PAYMENT_CANCELED:
      console.log(`Payment ${event.event} for order ${event.order.id}`);
      // Handle refund/cancellation if needed
      break;

    default:
      console.log(`Unhandled event: ${event.event}`);
  }

  // Mark as processed AFTER your logic succeeds
  if (event.idempotencyKey) {
    await idempotencyStore.remember(event.idempotencyKey);
  }

  return c.json({ success: true });
});

export default app;
