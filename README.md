# @payguin/sdk

The friendly way to take PIX payments — and USDT on the TRX network — through **PayGuin** from any TypeScript backend.

PayGuin creates the charge, watches the money land, and pings you with a signed webhook the moment it does. This SDK is the small, honest layer in the middle: it creates charges, checks order status, and — the part you really don't want to hand-roll — verifies those webhook signatures correctly. Everything else about your product stays yours.

- **No runtime dependencies.** Just `node:crypto` and the built-in `fetch`.
- **Runs anywhere.** Node 18+, Bun, Deno. Bring your own framework — Hono, Express, Fastify, whatever.
- **Typed end to end.** Webhook events come back as a discriminated union you can `switch` on.

---

## Install

It's a git dependency, pinned to a tag — no registry, no surprises:

```jsonc
// package.json
{
  "dependencies": {
    "@payguin/sdk": "github:nicolasishizawa/payguin-sdk-js#v0.4.0"
  }
}
```

Then `bun install` (or `npm install`). Bump the `#v0.4.0` when you want a newer version — you upgrade on purpose, never by accident. Working on the SDK and the app side by side? Point at your local checkout instead: `"@payguin/sdk": "file:../payguin-sdk-js"`.

---

## Configure

Whoever runs your PayGuin instance hands you three things. Keep them in your backend config, never in the browser:

```bash
PAYGUIN_BASE_URL=https://pay.example.com      # the instance's public address
PAYGUIN_CHECKOUT_ID=<uuid>                    # one per thing you sell (a BRL one for PIX, a USDT one for crypto)
PAYGUIN_WEBHOOK_SECRET=<project signing secret> # verifies webhooks and signs checkout sessions
```

```ts
const payguin = new PayGuinClient({
  baseUrl: process.env.PAYGUIN_BASE_URL!, // required
  timeoutMs: 30_000,                      // optional, default 30s
  fetch: myFetch,                         // optional, injectable for tests
});
```

The Checkout currency decides how it is paid: a **BRL** Checkout is PIX (`createCharge`), a **USDT** Checkout is crypto (`createCryptoCharge`).

---

## The 20-line integration

Two moments matter: **you create a charge**, and later **PayGuin tells you it was paid**. That's the whole dance.

```ts
import {
  PayGuinClient,
  handleWebhook,
  InMemoryIdempotencyStore,
  PayGuinEventType,
} from "@payguin/sdk";

const payguin = new PayGuinClient({ baseUrl: "https://payguin.example.com" });
const store = new InMemoryIdempotencyStore();

// 1) Someone wants to pay → create a charge, show them the PIX code.
const charge = await payguin.createCharge("your-checkout-uuid", {
  payer: { name: "Maria", email: "maria@example.com", phone: "+5511999999999", document: "12345678900" },
  reference: "order-42", // your own id — comes back on the webhook
});
showToUser(charge.pixCopiaECola);

// 2) Money lands → PayGuin calls your webhook. Verify it, then act.
const result = await handleWebhook({
  rawBody,                                     // the raw request body, untouched
  headers: (name) => req.header(name),         // however your framework reads headers
  secret: process.env.PAYGUIN_WEBHOOK_SECRET!, // your project's signing secret
  store,
});

if (result.action === "process" && result.event.event === PayGuinEventType.PAYMENT_PAID) {
  await grantAccess(result.event);          // ← your logic lives here
  await store.remember(result.event.idempotencyKey!);
}
```

That's it. The SDK gets you to a trustworthy "this was paid." What happens next — activating an account, extending a subscription, shipping the thing — is your call.

---

## Where the SDK stops (on purpose)

PayGuin is a **one-shot payment rail** (PIX or USDT). It charges, it confirms, it notifies. It does *not* know about subscriptions, renewals, trials, or who's allowed in.

So when `payment.paid` arrives, **your app owns what happens next**. Monthly plan? You track "paid until when" and charge again next cycle. One-time purchase? You unlock it and you're done. Keeping that logic on your side is deliberate — it's the part that's unique to your product, and neither PIX nor a USDT transfer has auto-debit to lean on anyway.

---

## Creating PIX charges

### `createCharge(checkoutId, input)`

Fires a PIX charge (`POST /api/v1/checkouts/{checkoutId}/orders`) and hands back the code to show your user.

```ts
const charge = await client.createCharge("checkout-uuid", {
  payer: { name, email, phone, document },
  reference: "order-42",              // your correlation id (optional)
  metadata: { plan: "pro", userId },  // free-form, echoed back on the webhook (optional)
  session,                            // signed checkout session (optional, see below)
  bumpCheckoutIds: ["extra-uuid"],    // extras the buyer ticked; needs a session (optional)
});
// → { orderId, externalId, reference, status, amountCents, currency,
//     pixCopiaECola, pixExpiresAt, items: [{ checkoutId, name, amountCents }] }
```

`reference` and `metadata` ride along to the outbound webhook, so you can tie a payment straight back to whatever it means in your system. (No reference? The returned `orderId` works just as well as a key.)

With a `session`, the extras in `bumpCheckoutIds` must be among the ones the session offers; PayGuin sums the prices server-side (`amountCents` is the total) and the `reference` comes from the signed token, never from the request. `items` lists every line charged, main checkout included (empty on servers that predate order bump).

### `getOrderStatus(orderId)`

Your safety net when a webhook gets lost in the ether. Poll the truth directly:

```ts
const status = await client.getOrderStatus("order-uuid");
// → { status: "pending" | "paid" | "canceled" | "failed" | "expired", amountCents, currency, expiresAt, reference,
//     paymentMethod: "pix" | "crypto",
//     crypto: { address, network: "trx", amountUsdt } | null }   // null on PIX
```

Got an order id from a browser? Check `reference` matches the purchase you expect before acting on it. On a crypto order `expiresAt` is the address expiry and `crypto` lets you redraw the payment screen after a reload.

### `getCheckoutSummary(checkoutId)`

The price that is configured in PayGuin *right now* — change it in the desktop app and your catalog follows, no deploy:

```ts
const summary = await client.getCheckoutSummary("checkout-uuid");
// → { id, name, amountCents, currency, isActive }
```

### When things go wrong: `PayGuinApiError`

Any non-2xx response throws a `PayGuinApiError` carrying `httpStatus`, `errorCode`, `errorMessage`, and the raw `responseBody` — enough to actually debug, never a silent failure. `errorCode` is PayGuin's code (`invalid_payer`, `invalid_session`, `invalid_amount`, ...).

---

## USDT on TRX (since 0.4.0)

For buyers outside Brazil. A USDT Checkout gets you an address unique to each charge; the buyer sends the exact amount from any wallet and PayGuin fires the same `payment.paid` webhook as PIX. No CPF, no payer form.

### Limits

| | |
|---|---|
| Amount | Whole USDT only, at least **10** (10.5 is refused, not rounded) |
| Network | **TRX** (TRON, USDT TRC-20). Fixed; no other network |
| Address | One per charge, valid about **48h** (`expiresAt`) |
| Units | `amountUsdt` is whole USDT; `amountCents` / `order.amount_cents` are USDT cents (10 USDT = `1000`) |

PayGuin checks the amount before it asks the provider for an address: anything else is a 422 `invalid_amount`. The SDK checks it first too, with `usdtToCents` (below).

### `createCryptoCharge(checkoutId, input?)`

Same route as PIX (`POST /api/v1/checkouts/{checkoutId}/orders`), on a USDT Checkout. Nothing about the buyer is sent:

```ts
const charge = await client.createCryptoCharge(process.env.PAYGUIN_USDT_CHECKOUT_ID!, {
  reference: "order-42",              // optional, comes back on the webhook
  metadata: { plan: "global" },       // optional
  session,                            // optional signed session (v2 sets the USDT price)
  bumpCheckoutIds: ["extra-uuid"],    // optional, USDT extras offered by the session
});
// → { orderId, externalId, reference, status: "pending",
//     address: "T...", network: "trx", amountUsdt: 10, amountCents: 1000, currency: "USDT",
//     expiresAt: "2026-10-22T21:45:05.688Z", items: [{ checkoutId, name, amountCents }] }
```

The price is the Checkout's, or the one your signed session fixes. Compare `amountUsdt` with what you quoted before showing the address.

Errors beyond the PIX ones: 422 `invalid_amount` (not a whole USDT >= 10), 422 `unsupported` (the instance's provider has no crypto), 502 `provider_amount_mismatch` (the provider registered another amount; the charge was dropped, try again). Calling it on a BRL Checkout fails with 400 `invalid_payer`.

### Showing the address on your own site

Your backend creates the charge and hands the browser only what it needs. The QR is just the address; draw it with any QR library on your side (the SDK ships none).

```ts
// backend (Hono)
app.post("/pay/usdt", async (c) => {
  const purchase = await createPurchase(c);   // your own record
  const charge = await payguin.createCryptoCharge(process.env.PAYGUIN_USDT_CHECKOUT_ID!, {
    reference: purchase.id,
  });
  await savePurchaseOrder(purchase.id, charge.orderId);
  return c.json({
    orderId: charge.orderId,
    address: charge.address,
    amountUsdt: charge.amountUsdt,
    expiresAt: charge.expiresAt,
  });
});

app.get("/pay/usdt/:orderId", async (c) => {
  const s = await payguin.getOrderStatus(c.req.param("orderId"));
  return c.json({ status: s.status });
});
```

```ts
// browser
import QRCode from "qrcode"; // any QR lib works

const pay = await (await fetch("/pay/usdt", { method: "POST" })).json();
document.querySelector("#amount")!.textContent = `${pay.amountUsdt} USDT`;
document.querySelector("#network")!.textContent = "TRON (TRC-20)";
document.querySelector("#address")!.textContent = pay.address;
await QRCode.toCanvas(document.querySelector("#qr") as HTMLCanvasElement, pay.address);
document.querySelector("#copy")!.addEventListener("click", () => navigator.clipboard.writeText(pay.address));

// Poll your backend; the webhook is still what grants access.
const timer = setInterval(async () => {
  const { status } = await (await fetch(`/pay/usdt/${pay.orderId}`)).json();
  if (status === "paid") { clearInterval(timer); showThanks(); }
}, 5000);
```

Tell the buyer to send **exactly** `amountUsdt` on **TRON**: another network or token is lost, and PayGuin is not told how much arrived (see the webhook note below). Keep polling after `expiresAt` if you like: on crypto, `expired` is not the end.

### USDT prices in a session (v2)

A v2 session prices USDT items in USDT cents. Use `usdtToCents` so a bad price fails in your code, not on the page:

```ts
import { createCheckoutSession, usdtToCents } from "@payguin/sdk";

const session = createCheckoutSession(
  {
    v: 2,
    checkout_id: usdtCheckoutId,
    bump_checkout_ids: [],
    amounts: [{ checkout_id: usdtCheckoutId, amount_cents: usdtToCents(25) }], // 25 USDT → 2500
    reference: purchase.id,
    payer: { name: user.name, email: user.email },
    exp: Math.floor(Date.now() / 1000) + 30 * 60,
  },
  process.env.PAYGUIN_WEBHOOK_SECRET!,
);
```

`usdtToCents(n)` throws a `TypeError` unless `n` is an integer from 10 up (`isValidUsdtAmount(n)` is the non-throwing check; `USDT_MIN_AMOUNT` and `USDT_NETWORK` are exported too). Extras must be USDT Checkouts as well: PayGuin never mixes currencies in one order.

### Hosted page or embed

No code of your own for the payment screen? Point the buyer at the hosted page, `https://<instance>/checkout/<usdt-checkout-id>`, or open the embed with a session exactly as for PIX (`PayGuin.open({ embedUrl: "https://<instance>/embed/checkout/<id>", session, onEvent })`). On a USDT Checkout both show the amount, the TRX network, the address with a copy button and its QR, the time left, and poll the status — no payer form. Your backend still learns about the payment through the webhook.

---

## Checkout session (embedded checkout with order bump)

When your app embeds the PayGuin checkout page (a modal with an iframe), your **backend** signs a short-lived session saying what may be sold: the main checkout, the extras offered as order bump, your purchase reference, and the payer data to pre-fill. PayGuin takes the reference and the extras **only** from this signed token — never from the browser — so nobody can hang a purchase on someone else's account or invent an extra.

```ts
import { createCheckoutSession } from "@payguin/sdk";

const session = createCheckoutSession(
  {
    v: 1,
    checkout_id: "main-checkout-uuid",
    bump_checkout_ids: ["extra-1-uuid", "extra-2-uuid"], // extras OFFERED; the buyer picks
    reference: purchase.id,                               // comes back as order.reference
    payer: { name: user.name, email: user.email },        // phone/document optional
    exp: Math.floor(Date.now() / 1000) + 30 * 60,         // unix SECONDS — keep it short
  },
  process.env.PAYGUIN_WEBHOOK_SECRET!, // the project's signing secret, same one as the webhooks
);
// Hand it to the iframe via postMessage after its "ready" event. Never put it in a URL.
```

Under the hood: `base64url(payloadJSON) + "." + base64url(HMAC-SHA256(key, base64url(payloadJSON)))`, with `key = HMAC-SHA256(secret, "payguin-checkout-session-v1")` — a key derived for this purpose, so a session signature can never pass as a webhook signature. base64url has no padding. A payload outside the contract (missing field, `exp` in milliseconds, empty secret) throws a `TypeError` right away instead of minting a token PayGuin will refuse.

### Per-item prices (session v2, since 0.3.0)

When your app sells an item at its own price (an affiliate price, say), put the price **in the session** — never in the browser. Use `v: 2` and list only the items that have their own price; the others are charged the Checkout price as usual:

```ts
const session = createCheckoutSession(
  {
    v: 2,
    checkout_id: "main-checkout-uuid",
    bump_checkout_ids: ["extra-1-uuid", "extra-2-uuid"],
    amounts: [
      { checkout_id: "main-checkout-uuid", amount_cents: 15000 }, // R$ 150,00 instead of the Checkout price
      { checkout_id: "extra-2-uuid", amount_cents: 4041 },        // extra-1 keeps its Checkout price
    ],
    reference: purchase.id,
    payer: { name: user.name, email: user.email },
    exp: Math.floor(Date.now() / 1000) + 30 * 60,
  },
  process.env.PAYGUIN_WEBHOOK_SECRET!,
);
```

PayGuin charges those values, shows them on the page, and reports them back in `order.items[].amount_cents` on the webhook — so check the paid amount against what you quoted. The rules are PayGuin's, checked here first (a `TypeError` naming the field, instead of a 403 `invalid_session` on the page):

- `amounts` has 1 to 11 entries (the main checkout + 10 extras).
- Each `checkout_id` is a canonical 36-character UUID, equal (case-insensitive) to the main `checkout_id` or one of `bump_checkout_ids`, and appears once.
- Each `amount_cents` is an integer from `1` to `1_000_000_000` (R$ 10.000.000,00).
- `v: 1` with a non-empty `amounts` throws: a v1 would silently charge the Checkout price.

An absent, `null` or empty `amounts` signs a **v1, byte for byte the same as 0.2.0** — even with `v: 2` — so you can always pass the list you computed and let the SDK pick. Wire order is `v, checkout_id, bump_checkout_ids, amounts, reference, payer, exp`; the key and the label are the same in both versions. The PayGuin side must already understand v2 (servers before it refuse the token as `invalid_session`).

---

## Verifying webhooks (the important part)

A payment webhook is a message that grants money's worth of access. Verifying it isn't optional, and getting HMAC right by hand is where people quietly slip. The SDK does it for you.

### `handleWebhook(options)` — the one you'll usually reach for

Verifies the signature, drops duplicates, parses the body, and tells you plainly what to do:

```ts
const result = await handleWebhook({ rawBody, headers, secret, store });

switch (result.action) {
  case "process":
    // result.event is a fully typed PayGuinWebhookEvent — go handle it.
    // Then, once YOUR work succeeded: store.remember(result.event.idempotencyKey)
    break;
  case "skip":
    // result.reason: "invalid_signature" | "deduplicated" | "parse_error"
    break;
}
```

> **Remember *after* you succeed, not before.** Mark the event handled only once your own processing worked. If it throws, you leave the key unremembered and PayGuin retries — which is exactly what you want.

### `verifyWebhookSignature(rawBody, signatureHeader, secret)` — the low-level check

If you'd rather wire the steps yourself:

```ts
const check = verifyWebhookSignature(rawBody, headers["x-payguin-signature"], secret);
if (!check.valid) reject(check.reason);
```

Under the hood, exactly:

- Header shaped `sha256=<64 hex chars>`.
- HMAC-SHA256 over the **raw body bytes** — never a re-serialized JSON string, or the signature won't match.
- Constant-time compare via `crypto.timingSafeEqual`.
- A missing or malformed header returns `{ valid: false, reason }` — it won't throw on you.
- An empty secret *does* throw (`TypeError`) — that's a bug in your setup, not a bad request.

### `parseWebhookEvent(rawBody, idempotencyKey?)`

Turns a verified body into a typed event. `handleWebhook` calls this for you; use it directly only if you're rolling your own flow.

---

## Not paying twice: idempotency

PayGuin retries until you acknowledge, so the same event can arrive more than once. An `IdempotencyStore` is how you shrug off the repeats.

```ts
import { InMemoryIdempotencyStore, type IdempotencyStore } from "@payguin/sdk";

// Fine for a single instance: in-memory, bounded at 100k keys.
const store = new InMemoryIdempotencyStore();

// Running more than one instance? Back it with something shared:
class RedisIdempotencyStore implements IdempotencyStore {
  async seen(key: string) { /* Redis EXISTS */ return false; }
  async remember(key: string) { /* Redis SET key with a TTL */ }
}
```

The in-memory store is a solid default, but it forgets on restart and doesn't cross process boundaries — reach for Redis or your DB the moment you scale past one instance.

---

## The events you'll get

Every event is a member of a discriminated union keyed on `event`, so TypeScript narrows it for you:

| Event | Meaning |
|-------|---------|
| `order.created` | A charge was created (still pending) |
| `payment.paid` | The money landed — this is the one that grants access |
| `payment.failed` | The payment failed |
| `payment.expired` | The PIX code (or the USDT address) expired unpaid |
| `payment.canceled` | The payment was canceled |
| `refund.created` / `refund.completed` | A refund was opened / settled |
| `payout.*` | Payout (cash-out) lifecycle events |

Each one carries `order`, `checkout`, `payer`, `metadata`, `timestamp`, and `idempotencyKey`. Heads up: PayGuin normalizes a provider `refunded` status into `payment.failed` / `payment.canceled`.

`order.reference` is your correlation id (the session's `reference`, or `""` when none). `order.items` lists every paid line — the main checkout plus any order-bump extras — as `{ checkout_id, name, amount_cents }`, and `order.amount_cents` is their sum. Grant access **per item**, keyed on `checkout_id`. Servers older than order bump don't send `items`; treat that as "only `checkout`".

### Crypto orders in the webhook

A USDT order carries `order.payment_method: "crypto"`, `order.crypto_address` and `order.crypto_network: "trx"`, with `order.currency: "USDT"` and `order.amount_cents` in USDT cents. PIX orders don't have these fields (their payload did not change): absent means PIX. Without a session the `payer` fields of a crypto order are empty strings.

> **On crypto, `payment.paid` can arrive AFTER `payment.expired`.** The address keeps receiving after `expiresAt`: if the buyer pays late, PayGuin moves the order from `expired` to `paid` and sends `payment.paid` as usual. So never treat `payment.expired` as final on a crypto order — don't delete the purchase, and grant access when the late `payment.paid` comes (or refund it your way). On PIX, `expired` is still terminal.

The provider does not report how much USDT arrived, only that the charge was paid. PayGuin trusts that; the amount actually received can only be checked in the provider panel by whoever runs the instance.

`handleWebhook` works the same for both methods; nothing changes in how you verify or deduplicate.

---

## Framework snippets

### Hono

```ts
import { Hono } from "hono";
import { handleWebhook, InMemoryIdempotencyStore } from "@payguin/sdk";

const store = new InMemoryIdempotencyStore();
const app = new Hono();

app.post("/webhook/payguin", async (c) => {
  const rawBody = await c.req.text(); // raw body — needed for the HMAC
  const result = await handleWebhook({
    rawBody,
    headers: (name) => c.req.header(name) ?? null,
    secret: process.env.PAYGUIN_WEBHOOK_SECRET!,
    store,
  });

  if (result.action === "skip") {
    return result.reason === "invalid_signature"
      ? c.json({ error: "invalid signature" }, 401)
      : c.json({ ok: true, deduplicated: true });
  }

  await handleEvent(result.event);
  if (result.event.idempotencyKey) await store.remember(result.event.idempotencyKey);
  return c.json({ ok: true });
});
```

### Express

```ts
import express from "express";
import { handleWebhook, InMemoryIdempotencyStore } from "@payguin/sdk";

const store = new InMemoryIdempotencyStore();
const app = express();

// Use the RAW body on this route. express.json() would re-serialize it and break the signature.
app.post("/webhook/payguin", express.raw({ type: "application/json" }), async (req, res) => {
  const result = await handleWebhook({
    rawBody: req.body, // Buffer from express.raw()
    headers: (name) => {
      const v = req.headers[name];
      return typeof v === "string" ? v : v?.[0] ?? null;
    },
    secret: process.env.PAYGUIN_WEBHOOK_SECRET!,
    store,
  });

  if (result.action === "skip") {
    return result.reason === "invalid_signature"
      ? res.status(401).json({ error: "invalid signature" })
      : res.json({ ok: true, deduplicated: true });
  }

  await handleEvent(result.event);
  if (result.event.idempotencyKey) await store.remember(result.event.idempotencyKey);
  return res.json({ ok: true });
});
```

---

## License

MIT — do what you like with it.
