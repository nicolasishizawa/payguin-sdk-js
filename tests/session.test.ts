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
import { readFileSync } from "node:fs";
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
      // v: 2 sem amounts não é mais erro: vira v1 (ver "golden v1" abaixo).
      { v: 3 },
      { v: "1" },
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

// ---------------------------------------------------------------------------
// Vetores oficiais do PayGuin (sub 6). Cópia byte a byte de
// C:\dev\paygu.in\internal\checkoutsession\testdata\ — o mesmo arquivo é
// conferido pelo Go, pela SDK e pelo infinityia-back. Nunca regerar aqui.
// ---------------------------------------------------------------------------

type Fixture<T> = T & { note: string; secret: string };
const fixture = <T>(name: string): Fixture<T> =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf-8"));

const V1_GOLDEN = fixture<{ cases: Array<{ name: string; payload_json: string; token: string }> }>(
  "session_v1_golden.json",
);
const V2_VECTOR = fixture<{
  key_hex: string;
  vectors: Array<{ name: string; payload: string; token: string }>;
}>("session_v2_vector.json");

const PRINCIPAL = "11111111-1111-4111-8111-111111111111";
const EXTRA_A = "22222222-2222-4222-8222-222222222222";
const EXTRA_B = "33333333-3333-4333-8333-333333333333";

/** v1 base para as recusas da v2: principal + dois extras. */
const BASE_V1: CheckoutSessionPayload = {
  v: 1,
  checkout_id: PRINCIPAL,
  bump_checkout_ids: [EXTRA_A, EXTRA_B],
  reference: "purchase-v2-x",
  payer: { name: "Maria Silva", email: "maria@example.com" },
  exp: 1893456000,
};

function v2(amounts: unknown, patch: Record<string, unknown> = {}): CheckoutSessionPayload {
  return { ...BASE_V1, v: 2, amounts, ...patch } as unknown as CheckoutSessionPayload;
}

function expectTypeError(fn: () => unknown, message: RegExp): void {
  let thrown: unknown;
  try {
    fn();
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeInstanceOf(TypeError);
  expect((thrown as Error).message).toMatch(message);
}

describe("createCheckoutSession — golden v1 do PayGuin (bytes de antes do sub 6)", () => {
  for (const c of V1_GOLDEN.cases) {
    test(c.name, () => {
      const payload = JSON.parse(c.payload_json) as CheckoutSessionPayload;
      expect(createCheckoutSession(payload, V1_GOLDEN.secret)).toBe(c.token);
    });
  }

  test("amounts vazio, null ou ausente emite a v1 byte a byte", () => {
    for (const c of V1_GOLDEN.cases) {
      const payload = JSON.parse(c.payload_json) as CheckoutSessionPayload;
      for (const amounts of [[], null, undefined]) {
        const withAmounts = { ...payload, amounts } as unknown as CheckoutSessionPayload;
        expect(createCheckoutSession(withAmounts, V1_GOLDEN.secret)).toBe(c.token);
      }
    }
  });

  test("v: 2 sem nenhum valor vira v1 (nada a cobrar diferente do Checkout)", () => {
    for (const c of V1_GOLDEN.cases) {
      const payload = JSON.parse(c.payload_json) as Record<string, unknown>;
      for (const amounts of [[], null, undefined]) {
        const asV2 = { ...payload, v: 2, amounts } as unknown as CheckoutSessionPayload;
        expect(createCheckoutSession(asV2, V1_GOLDEN.secret)).toBe(c.token);
      }
    }
  });
});

describe("createCheckoutSession — v2 (amounts)", () => {
  test("a chave derivada bate com o vetor v2", () => {
    const key = createHmac("sha256", V2_VECTOR.secret)
      .update("payguin-checkout-session-v1")
      .digest("hex");
    expect(key).toBe(V2_VECTOR.key_hex);
  });

  for (const vec of V2_VECTOR.vectors) {
    test(`bate com o vetor oficial: ${vec.name}`, () => {
      const payload = JSON.parse(vec.payload) as CheckoutSessionPayload;
      expect(createCheckoutSession(payload, V2_VECTOR.secret)).toBe(vec.token);
    });
  }

  test("o corpo assinado é exatamente o JSON do vetor (ordem, sem espaço, & < > crus)", () => {
    for (const vec of V2_VECTOR.vectors) {
      const payload = JSON.parse(vec.payload) as CheckoutSessionPayload;
      const [body] = createCheckoutSession(payload, V2_VECTOR.secret).split(".");
      expect(Buffer.from(body!, "base64url").toString("utf-8")).toBe(vec.payload);
    }
  });

  test("a ordem das chaves do chamador (topo e itens) não muda o token", () => {
    const vec = V2_VECTOR.vectors[0]!;
    const p = JSON.parse(vec.payload) as Record<string, any>;
    const shuffled = {
      exp: p.exp,
      payer: { document: p.payer.document, phone: p.payer.phone, email: p.payer.email, name: p.payer.name },
      reference: p.reference,
      amounts: p.amounts.map((a: any) => ({ amount_cents: a.amount_cents, checkout_id: a.checkout_id })),
      bump_checkout_ids: p.bump_checkout_ids,
      checkout_id: p.checkout_id,
      v: p.v,
    } as CheckoutSessionPayload;
    expect(createCheckoutSession(shuffled, V2_VECTOR.secret)).toBe(vec.token);
  });

  test("descarta chaves fora do contrato (topo, pagador e itens de amounts)", () => {
    const vec = V2_VECTOR.vectors[0]!;
    const p = JSON.parse(vec.payload) as Record<string, any>;
    const extra = {
      ...p,
      amount_cents: 1,
      payer: { ...p.payer, admin: true },
      amounts: p.amounts.map((a: any) => ({ ...a, currency: "USD" })),
    } as unknown as CheckoutSessionPayload;
    expect(createCheckoutSession(extra, V2_VECTOR.secret)).toBe(vec.token);
  });

  test("não altera o objeto do chamador", () => {
    const payload = v2([{ checkout_id: PRINCIPAL, amount_cents: 15000 }]);
    const before = JSON.stringify(payload);
    createCheckoutSession(payload, SECRET);
    expect(JSON.stringify(payload)).toBe(before);
  });

  test("sem 'v' lança (a versão não é inferida de um payload sem versão)", () => {
    const { v: _v, ...rest } = v2([{ checkout_id: PRINCIPAL, amount_cents: 1 }]) as any;
    expectTypeError(() => createCheckoutSession(rest, SECRET), /'v'/);
  });

  test("aceita o UUID em maiúsculas (o PayGuin compara como UUID) e o emite como veio", () => {
    const token = createCheckoutSession(
      v2([{ checkout_id: EXTRA_B.toUpperCase(), amount_cents: 500 }]),
      SECRET,
    );
    const [body] = token.split(".");
    expect(Buffer.from(body!, "base64url").toString("utf-8")).toContain(
      `"amounts":[{"checkout_id":"${EXTRA_B.toUpperCase()}","amount_cents":500}]`,
    );
  });

  test("aceita 11 entradas (principal + 10 extras)", () => {
    const extras = Array.from({ length: 10 }, (_, i) => `aaaaaaa${i}-1111-4111-8111-111111111111`);
    const amounts = [PRINCIPAL, ...extras].map((checkout_id) => ({ checkout_id, amount_cents: 100 }));
    expect(() =>
      createCheckoutSession(v2(amounts, { bump_checkout_ids: extras }), SECRET),
    ).not.toThrow();
  });

  test("v: 1 com valores lança (v1 não carrega amounts)", () => {
    const payload = { ...BASE_V1, amounts: [{ checkout_id: PRINCIPAL, amount_cents: 15000 }] };
    expectTypeError(
      () => createCheckoutSession(payload as unknown as CheckoutSessionPayload, SECRET),
      /'amounts'.*'v' 2/,
    );
  });

  test("v fora de {1, 2} lança", () => {
    for (const v of [0, 3, "2", null]) {
      expectTypeError(
        () => createCheckoutSession(v2([{ checkout_id: PRINCIPAL, amount_cents: 1 }], { v }), SECRET),
        /'v'/,
      );
    }
  });

  test("recusa amounts fora do contrato, apontando o campo", () => {
    const ok = (id = PRINCIPAL, cents: unknown = 100) => ({ checkout_id: id, amount_cents: cents });
    const elevenExtras = Array.from({ length: 11 }, (_, i) =>
      `bbbbbbb${i.toString(16)}-1111-4111-8111-111111111111`,
    );
    const ruins: Array<[unknown, RegExp, Record<string, unknown>?]> = [
      ["15000", /'amounts' must be an array/],
      [{ [PRINCIPAL]: 15000 }, /'amounts' must be an array/],
      [
        [PRINCIPAL, ...elevenExtras].map((id) => ok(id)),
        /'amounts'.*at most 11/,
        { bump_checkout_ids: elevenExtras },
      ],
      [[null], /'amounts\[0\]' must be an object/],
      [[ok(), "x"], /'amounts\[1\]' must be an object/],
      [[{ amount_cents: 1 }], /'amounts\[0\]\.checkout_id'/],
      [[ok("not-a-uuid")], /'amounts\[0\]\.checkout_id'.*UUID/],
      [[ok(PRINCIPAL.replace(/-/g, ""))], /'amounts\[0\]\.checkout_id'.*UUID/],
      [[ok(`{${PRINCIPAL}}`)], /'amounts\[0\]\.checkout_id'.*UUID/],
      [[ok(`urn:uuid:${PRINCIPAL}`)], /'amounts\[0\]\.checkout_id'.*UUID/],
      [[ok("zzzzzzzz-1111-4111-8111-111111111111")], /'amounts\[0\]\.checkout_id'.*UUID/],
      [
        [ok("44444444-4444-4444-8444-444444444444")],
        /'amounts\[0\]\.checkout_id'.*'checkout_id' or one of 'bump_checkout_ids'/,
      ],
      [[ok(), ok(EXTRA_A), ok(PRINCIPAL)], /'amounts\[2\]\.checkout_id'.*repeated/],
      [[ok(EXTRA_A), ok(EXTRA_A.toUpperCase())], /'amounts\[1\]\.checkout_id'.*repeated/],
      [[ok(PRINCIPAL, 0)], /'amounts\[0\]\.amount_cents'/],
      [[ok(PRINCIPAL, -1)], /'amounts\[0\]\.amount_cents'/],
      [[ok(PRINCIPAL, 1.5)], /'amounts\[0\]\.amount_cents'/],
      [[ok(PRINCIPAL, 1_000_000_001)], /'amounts\[0\]\.amount_cents'.*1000000000/],
      [[ok(PRINCIPAL, "15000")], /'amounts\[0\]\.amount_cents'/],
      [[ok(PRINCIPAL, NaN)], /'amounts\[0\]\.amount_cents'/],
      [[ok(PRINCIPAL, Infinity)], /'amounts\[0\]\.amount_cents'/],
      [[ok(PRINCIPAL, 15000n)], /'amounts\[0\]\.amount_cents'/],
      [[ok(), ok(EXTRA_B, null)], /'amounts\[1\]\.amount_cents'/],
    ];
    for (const [amounts, message, patch] of ruins) {
      expectTypeError(() => createCheckoutSession(v2(amounts, patch), SECRET), message);
    }
  });

  test("a v2 continua exigindo os campos da v1", () => {
    const amounts = [{ checkout_id: PRINCIPAL, amount_cents: 1 }];
    for (const patch of [{ reference: "" }, { checkout_id: "" }, { exp: Date.now() }, { payer: null }]) {
      expect(() => createCheckoutSession(v2(amounts, patch), SECRET)).toThrow(TypeError);
    }
  });
});
