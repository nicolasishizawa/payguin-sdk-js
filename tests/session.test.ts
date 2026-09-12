/**
 * createCheckoutSession — contrato §6:
 *   token = base64url(payloadJSON) + "." + base64url(HMAC-SHA256(chave, base64url(payloadJSON)))
 *   chave = HMAC-SHA256(webhook_signing_secret, "payguin-checkout-session-v1")
 *
 * Os tokens esperados foram calculados FORA da SDK (Python: hmac + hashlib +
 * base64.urlsafe_b64encode sem "="), a partir do JSON literal abaixo. Esse
 * mesmo vetor está no log C:\dev\docs\progress\P2-sdk-desktop.md para a
 * conferência cruzada com o verificador em Go.
 */
import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { createCheckoutSession } from "../src/session.js";
import type { CheckoutSessionPayload } from "../src/types.js";

const SECRET = "whsec_payguin_session_vector_2026";

const FULL: CheckoutSessionPayload = {
  v: 1,
  checkout_id: "11111111-1111-4111-8111-111111111111",
  bump_checkout_ids: [
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
  ],
  reference: "purchase-42",
  payer: {
    name: "Maria Silva",
    email: "maria@example.com",
    phone: "5511999999999",
    document: "12345678909",
  },
  exp: 1760000000,
};

// JSON assinado (compacto, ordem do contrato):
// {"v":1,"checkout_id":"11111111-1111-4111-8111-111111111111","bump_checkout_ids":["22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333"],"reference":"purchase-42","payer":{"name":"Maria Silva","email":"maria@example.com","phone":"5511999999999","document":"12345678909"},"exp":1760000000}
const FULL_TOKEN =
  "eyJ2IjoxLCJjaGVja291dF9pZCI6IjExMTExMTExLTExMTEtNDExMS04MTExLTExMTExMTExMTExMSIsImJ1bXBfY2hlY2tvdXRfaWRzIjpbIjIyMjIyMjIyLTIyMjItNDIyMi04MjIyLTIyMjIyMjIyMjIyMiIsIjMzMzMzMzMzLTMzMzMtNDMzMy04MzMzLTMzMzMzMzMzMzMzMyJdLCJyZWZlcmVuY2UiOiJwdXJjaGFzZS00MiIsInBheWVyIjp7Im5hbWUiOiJNYXJpYSBTaWx2YSIsImVtYWlsIjoibWFyaWFAZXhhbXBsZS5jb20iLCJwaG9uZSI6IjU1MTE5OTk5OTk5OTkiLCJkb2N1bWVudCI6IjEyMzQ1Njc4OTA5In0sImV4cCI6MTc2MDAwMDAwMH0" +
  ".HYCOEYPVzvYXcsGgM86IPCbpAUZrReNIAImikNr5OlU";

// {"v":1,"checkout_id":"11111111-1111-4111-8111-111111111111","bump_checkout_ids":[],"reference":"purchase-43","payer":{"name":"Joao","email":"joao@example.com"},"exp":1760000000}
const MINI_TOKEN =
  "eyJ2IjoxLCJjaGVja291dF9pZCI6IjExMTExMTExLTExMTEtNDExMS04MTExLTExMTExMTExMTExMSIsImJ1bXBfY2hlY2tvdXRfaWRzIjpbXSwicmVmZXJlbmNlIjoicHVyY2hhc2UtNDMiLCJwYXllciI6eyJuYW1lIjoiSm9hbyIsImVtYWlsIjoiam9hb0BleGFtcGxlLmNvbSJ9LCJleHAiOjE3NjAwMDAwMDB9" +
  ".Rm8D2OmtYy9H3cILkevMono47a83V14FqNNBSFD1Su8";

const MINI: CheckoutSessionPayload = {
  v: 1,
  checkout_id: "11111111-1111-4111-8111-111111111111",
  bump_checkout_ids: [],
  reference: "purchase-43",
  payer: { name: "Joao", email: "joao@example.com" },
  exp: 1760000000,
};

// Vetor publicado pela frente P (verificador em Go), também calculado em Python
// por ela: C:\dev\docs\plans\P-parte-5a-payguin.md, Tarefa 5. Duas
// implementações independentes chegando no mesmo token = mesmo formato.
const GO_SECRET = "whsec_vetor_de_teste_payguin";
const GO_KEY_HEX = "718ea7072fe36ec8ea9d2140d2aa14576faa05420dd606479578bbd95d016c20";
const GO_PAYLOAD: CheckoutSessionPayload = {
  v: 1,
  checkout_id: "8b1b3a35-ac0b-4de7-b46b-13c2f3931d4e",
  bump_checkout_ids: [
    "2f6c1f7e-3d1b-4c55-9d6e-0a7d5b1e9c21",
    "c0a8012e-7a4f-4f0e-8b7d-5e2a1c3b4d5f",
  ],
  reference: "pur_01J8Z3K9Q2",
  payer: {
    name: "Fulana de Tal",
    email: "fulana@example.com",
    phone: "11987654321",
    document: "12345678909",
  },
  exp: 1893456000,
};
const GO_TOKEN =
  "eyJ2IjoxLCJjaGVja291dF9pZCI6IjhiMWIzYTM1LWFjMGItNGRlNy1iNDZiLTEzYzJmMzkzMWQ0ZSIsImJ1bXBfY2hlY2tvdXRfaWRzIjpbIjJmNmMxZjdlLTNkMWItNGM1NS05ZDZlLTBhN2Q1YjFlOWMyMSIsImMwYTgwMTJlLTdhNGYtNGYwZS04YjdkLTVlMmExYzNiNGQ1ZiJdLCJyZWZlcmVuY2UiOiJwdXJfMDFKOFozSzlRMiIsInBheWVyIjp7Im5hbWUiOiJGdWxhbmEgZGUgVGFsIiwiZW1haWwiOiJmdWxhbmFAZXhhbXBsZS5jb20iLCJwaG9uZSI6IjExOTg3NjU0MzIxIiwiZG9jdW1lbnQiOiIxMjM0NTY3ODkwOSJ9LCJleHAiOjE4OTM0NTYwMDB9" +
  ".vzoTv8IA2OvZd8Yc4Rmv86qbW7AmUR-IghApzxrPWYE";

describe("createCheckoutSession", () => {
  test("bate com o vetor completo", () => {
    expect(createCheckoutSession(FULL, SECRET)).toBe(FULL_TOKEN);
  });

  test("bate com o vetor publicado pelo verificador em Go", () => {
    // Mesma leitura de "HMAC-SHA256(segredo, rótulo)": chave = segredo, mensagem = rótulo.
    const key = createHmac("sha256", GO_SECRET).update("payguin-checkout-session-v1").digest("hex");
    expect(key).toBe(GO_KEY_HEX);
    expect(createCheckoutSession(GO_PAYLOAD, GO_SECRET)).toBe(GO_TOKEN);
  });

  test("omite phone/document ausentes e aceita lista de extras vazia", () => {
    expect(createCheckoutSession(MINI, SECRET)).toBe(MINI_TOKEN);
  });

  test("phone/document vazios são omitidos como os ausentes", () => {
    const payload = { ...MINI, payer: { ...MINI.payer, phone: "", document: "" } };
    expect(createCheckoutSession(payload, SECRET)).toBe(MINI_TOKEN);
  });

  test("a ordem das chaves do chamador não muda o token", () => {
    const { exp, v, payer, ...rest } = FULL;
    const shuffled = {
      exp,
      payer: { document: payer.document, phone: payer.phone, email: payer.email, name: payer.name },
      ...rest,
      v,
    } as CheckoutSessionPayload;
    expect(createCheckoutSession(shuffled, SECRET)).toBe(FULL_TOKEN);
  });

  test("descarta campos fora do contrato", () => {
    const extra = {
      ...FULL,
      amount_cents: 1,
      payer: { ...FULL.payer, admin: true },
    } as unknown as CheckoutSessionPayload;
    expect(createCheckoutSession(extra, SECRET)).toBe(FULL_TOKEN);
  });

  test("assina com a chave DERIVADA, não com o segredo cru", () => {
    const [body, sig] = createCheckoutSession(FULL, SECRET).split(".");
    const withRawSecret = createHmac("sha256", SECRET).update(body!).digest("base64url");
    expect(sig).not.toBe(withRawSecret);
  });

  test("não usa padding e só usa o alfabeto base64url", () => {
    expect(createCheckoutSession(FULL, SECRET)).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
  });

  test("segredo vazio lança TypeError", () => {
    expect(() => createCheckoutSession(FULL, "")).toThrow(TypeError);
  });

  test("recusa payload fora do contrato", () => {
    const ruins: Array<Record<string, unknown>> = [
      { v: 2 },
      { checkout_id: "" },
      { reference: "" },
      { bump_checkout_ids: "22222222-2222-4222-8222-222222222222" },
      { bump_checkout_ids: [""] },
      { bump_checkout_ids: [42] },
      { payer: { name: "", email: "a@b.c" } },
      { payer: { name: "A", email: "" } },
      { payer: { name: "A", email: "a@b.c", phone: 11 } },
      { payer: null },
      { exp: 1.5 },
      { exp: 0 },
      { exp: -1 },
      { exp: "1760000000" },
      // Date.now() é milissegundo: aceitar daria um token válido por milênios.
      { exp: Date.now() },
    ];
    for (const patch of ruins) {
      const payload = { ...FULL, ...patch } as unknown as CheckoutSessionPayload;
      expect(() => createCheckoutSession(payload, SECRET)).toThrow(TypeError);
    }
  });
});
