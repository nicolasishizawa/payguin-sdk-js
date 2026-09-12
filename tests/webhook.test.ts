/**
 * verifyWebhookSignature é o código mais sensível da SDK: um erro aqui libera
 * acesso pago para quem forjar um POST. Os casos abaixo travam o formato
 * (`sha256=<64 hex>`), a comparação sobre os BYTES CRUS do corpo e a recusa
 * de configuração errada (segredo vazio lança, não "valida").
 */
import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import {
  handleWebhook,
  parseWebhookEvent,
  verifyWebhookSignature,
} from "../src/webhook.js";

const SECRET = "test-webhook-secret";
const BODY = '{"event":"payment.paid","order":{"id":"ord-1"}}';

// Vetor calculado FORA da SDK (Python: hmac.new(secret, body, sha256).hexdigest()).
// Se viesse do próprio createHmac usado pelo código, um erro comum aos dois
// passaria despercebido.
const KNOWN_SIG =
  "d646be7dcf0328127e9307e9a324ccf4718a0068229473a3716655527546349b";

function sign(body: string, secret = SECRET): string {
  return "sha256=" + createHmac("sha256", secret).update(body, "utf-8").digest("hex");
}

describe("verifyWebhookSignature", () => {
  test("aceita o vetor conhecido", () => {
    expect(verifyWebhookSignature(BODY, `sha256=${KNOWN_SIG}`, SECRET)).toEqual({
      valid: true,
    });
  });

  test("aceita o corpo como Buffer (express.raw)", () => {
    expect(verifyWebhookSignature(Buffer.from(BODY), sign(BODY), SECRET).valid).toBe(true);
  });

  test("aceita hex maiúsculo", () => {
    const r = verifyWebhookSignature(BODY, `sha256=${KNOWN_SIG.toUpperCase()}`, SECRET);
    expect(r.valid).toBe(true);
  });

  test("recusa assinatura feita com outro segredo", () => {
    const r = verifyWebhookSignature(BODY, sign(BODY, "outro-segredo"), SECRET);
    expect(r).toEqual({ valid: false, reason: "Signature does not match" });
  });

  test("recusa corpo adulterado", () => {
    const r = verifyWebhookSignature(BODY.replace("ord-1", "ord-2"), sign(BODY), SECRET);
    expect(r).toEqual({ valid: false, reason: "Signature does not match" });
  });

  test("recusa JSON re-serializado (tem de ser o corpo cru)", () => {
    const reserialized = JSON.stringify(JSON.parse(BODY), null, 1);
    expect(verifyWebhookSignature(reserialized, sign(BODY), SECRET).valid).toBe(false);
  });

  test("recusa header ausente", () => {
    expect(verifyWebhookSignature(BODY, undefined, SECRET)).toEqual({
      valid: false,
      reason: "Missing X-PayGuin-Signature header",
    });
    expect(verifyWebhookSignature(BODY, null, SECRET).valid).toBe(false);
    expect(verifyWebhookSignature(BODY, "", SECRET).valid).toBe(false);
  });

  test("recusa header sem o prefixo sha256=", () => {
    expect(verifyWebhookSignature(BODY, KNOWN_SIG, SECRET)).toEqual({
      valid: false,
      reason: "Signature header does not start with 'sha256='",
    });
  });

  test("recusa prefixo de outro algoritmo", () => {
    expect(verifyWebhookSignature(BODY, `sha1=${KNOWN_SIG}`, SECRET).valid).toBe(false);
    expect(verifyWebhookSignature(BODY, `SHA256=${KNOWN_SIG}`, SECRET).valid).toBe(false);
  });

  test("recusa hex curto, longo, não-hex ou vazio", () => {
    const tortos = [
      KNOWN_SIG.slice(0, 63),
      KNOWN_SIG + "0",
      "z".repeat(64),
      KNOWN_SIG.slice(0, 62) + " 0",
      "",
    ];
    for (const hex of tortos) {
      expect(verifyWebhookSignature(BODY, `sha256=${hex}`, SECRET)).toEqual({
        valid: false,
        reason: "Signature is not a valid 64-character hex string",
      });
    }
  });

  test("recusa corpo vazio", () => {
    expect(verifyWebhookSignature("", sign(""), SECRET)).toEqual({
      valid: false,
      reason: "Empty request body",
    });
  });

  test("segredo vazio lança TypeError (erro de configuração, não de webhook)", () => {
    expect(() => verifyWebhookSignature(BODY, sign(BODY), "")).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// parseWebhookEvent / handleWebhook — order.items (contrato §6)
// ---------------------------------------------------------------------------

// Formato do payload do Go (outbound.BuildEventPayload) com os itens da 5a.
const PAID = {
  event: "payment.paid",
  timestamp: "2026-09-11T20:00:00Z",
  order: {
    id: "ord-1",
    external_id: "ext-1",
    reference: "purchase-42",
    status: "paid",
    amount_cents: 300,
    currency: "BRL",
    paid_at: "2026-09-11T20:00:00Z",
    created_at: "2026-09-11T19:55:00Z",
    items: [
      { checkout_id: "c-ia", name: "Análise por IA", amount_cents: 100 },
      { checkout_id: "c-robo", name: "Robô", amount_cents: 200 },
    ],
  },
  checkout: { id: "c-ia", slug: "ia", name: "Análise por IA" },
  payer: { name: "Maria", email: "maria@example.com", phone: "5511999999999", document: "12345678909" },
  metadata: {},
};

describe("parseWebhookEvent", () => {
  test("repassa order.items e order.reference tipados", () => {
    const event = parseWebhookEvent(JSON.stringify(PAID), "ord_ord-1_payment.paid_0");
    expect(event.order.reference).toBe("purchase-42");
    expect(event.order.items).toEqual(PAID.order.items);
    expect(event.idempotencyKey).toBe("ord_ord-1_payment.paid_0");
  });

  test("evento sem items (servidor anterior à 5a) continua válido", () => {
    const { items: _omit, ...order } = PAID.order;
    const event = parseWebhookEvent(JSON.stringify({ ...PAID, order }));
    expect(event.order.items).toBeUndefined();
    expect(event.idempotencyKey).toBeNull();
  });

  test("campo novo de nível superior não é descartado", () => {
    const body = JSON.stringify({ ...PAID, delivery: { attempt: 2 } });
    const event = parseWebhookEvent(body) as unknown as Record<string, unknown>;
    expect(event.delivery).toEqual({ attempt: 2 });
  });

  test("metadata ausente vira objeto vazio", () => {
    const { metadata: _omit, ...rest } = PAID;
    expect(parseWebhookEvent(JSON.stringify(rest)).metadata).toEqual({});
  });

  test("order.items que não é lista é recusado", () => {
    const body = JSON.stringify({ ...PAID, order: { ...PAID.order, items: { a: 1 } } });
    expect(() => parseWebhookEvent(body)).toThrow("order.items");
  });
});

describe("handleWebhook", () => {
  test("corpo assinado com itens chega inteiro ao evento", async () => {
    const rawBody = JSON.stringify(PAID);
    const headers: Record<string, string> = {
      "x-payguin-signature": sign(rawBody),
      "x-payguin-idempotency-key": "ord_ord-1_payment.paid_0",
    };
    const result = await handleWebhook({ rawBody, headers, secret: SECRET });
    expect(result.action).toBe("process");
    if (result.action !== "process") return;
    expect(result.event.order.items?.map((i) => i.checkout_id)).toEqual(["c-ia", "c-robo"]);
  });

  test("itens adulterados depois de assinar derrubam a assinatura", async () => {
    const signed = JSON.stringify(PAID);
    const tampered = signed.replace('"amount_cents":200', '"amount_cents":2');
    const result = await handleWebhook({
      rawBody: tampered,
      headers: { "x-payguin-signature": sign(signed) },
      secret: SECRET,
    });
    expect(result).toMatchObject({ action: "skip", reason: "invalid_signature" });
  });
});
