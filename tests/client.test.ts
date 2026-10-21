/**
 * PayGuinClient contra um fetch injetado (PayGuinClientConfig.fetch): o teste
 * vê a requisição exata que sairia e controla a resposta, sem rede.
 */
import { describe, expect, test } from "bun:test";
import { PayGuinClient } from "../src/client.js";
import { PayGuinApiError } from "../src/errors.js";

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(status: number, body: unknown) {
  const calls: Call[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

function sentBody(call: Call | undefined): unknown {
  return JSON.parse(call!.init.body as string);
}

const PAYER = {
  name: "Maria Silva",
  email: "maria@example.com",
  phone: "5511999999999",
  document: "12345678909",
};

const ORDER_BASE = {
  order_id: "o1",
  external_id: "e1",
  status: "pending",
  amount_cents: 300,
  currency: "BRL",
  pix_copia_e_cola: "000201",
  pix_expires_at: null,
};

describe("createCharge", () => {
  test("envia session e bump_checkout_ids e devolve itens e reference", async () => {
    const f = fakeFetch(201, {
      ...ORDER_BASE,
      reference: "purchase-42",
      items: [
        { checkout_id: "c1", name: "Análise por IA", amount_cents: 100 },
        { checkout_id: "c2", name: "Robô", amount_cents: 200 },
      ],
    });
    const client = new PayGuinClient({ baseUrl: "https://pg.test/", fetch: f.fn });

    const r = await client.createCharge("c1", {
      payer: PAYER,
      session: "tok.sig",
      bumpCheckoutIds: ["c2"],
    });

    expect(f.calls[0]!.url).toBe("https://pg.test/api/v1/checkouts/c1/orders");
    expect(f.calls[0]!.init.method).toBe("POST");
    expect(sentBody(f.calls[0])).toEqual({
      payer: PAYER,
      session: "tok.sig",
      bump_checkout_ids: ["c2"],
    });
    expect(r.reference).toBe("purchase-42");
    expect(r.items).toEqual([
      { checkoutId: "c1", name: "Análise por IA", amountCents: 100 },
      { checkoutId: "c2", name: "Robô", amountCents: 200 },
    ]);
    expect(r.amountCents).toBe(300);
  });

  test("lista de extras vazia é enviada (escolha explícita de nenhum extra)", async () => {
    const f = fakeFetch(201, ORDER_BASE);
    const client = new PayGuinClient({ baseUrl: "https://pg.test", fetch: f.fn });
    await client.createCharge("c1", { payer: PAYER, session: "tok.sig", bumpCheckoutIds: [] });
    expect(sentBody(f.calls[0])).toEqual({ payer: PAYER, session: "tok.sig", bump_checkout_ids: [] });
  });

  test("sem session/extras o corpo continua o de antes", async () => {
    const f = fakeFetch(201, ORDER_BASE);
    const client = new PayGuinClient({ baseUrl: "https://pg.test", fetch: f.fn });
    await client.createCharge("c1", { payer: PAYER, reference: "r1", metadata: { a: 1 } });
    expect(sentBody(f.calls[0])).toEqual({ payer: PAYER, reference: "r1", metadata: { a: 1 } });
  });

  test("resposta sem items/reference (servidor anterior à 5a) vira [] e null", async () => {
    const f = fakeFetch(201, ORDER_BASE);
    const client = new PayGuinClient({ baseUrl: "https://pg.test", fetch: f.fn });
    const r = await client.createCharge("c1", { payer: PAYER });
    expect(r.items).toEqual([]);
    expect(r.reference).toBeNull();
  });

  test("erro HTTP continua lançando PayGuinApiError com o código do servidor", async () => {
    const f = fakeFetch(400, { code: "invalid_session", message: "sessao invalida" });
    const client = new PayGuinClient({ baseUrl: "https://pg.test", fetch: f.fn });
    const err = await client
      .createCharge("c1", { payer: PAYER, session: "x" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PayGuinApiError);
    expect((err as PayGuinApiError).httpStatus).toBe(400);
    expect((err as PayGuinApiError).errorCode).toBe("invalid_session");
  });
});

describe("getOrderStatus", () => {
  test("devolve reference", async () => {
    const f = fakeFetch(200, {
      status: "paid",
      amount_cents: 300,
      currency: "BRL",
      expires_at: "2026-09-11T20:00:00Z",
      reference: "purchase-42",
    });
    const client = new PayGuinClient({ baseUrl: "https://pg.test", fetch: f.fn });
    const r = await client.getOrderStatus("o1");
    expect(f.calls[0]!.url).toBe("https://pg.test/api/v1/orders/o1/status");
    expect(r).toEqual({
      status: "paid",
      amountCents: 300,
      currency: "BRL",
      expiresAt: "2026-09-11T20:00:00Z",
      reference: "purchase-42",
      paymentMethod: "pix",
      crypto: null,
    });
  });

  test("reference ausente vira null", async () => {
    const f = fakeFetch(200, { status: "pending", amount_cents: 300, currency: "BRL" });
    const client = new PayGuinClient({ baseUrl: "https://pg.test", fetch: f.fn });
    const r = await client.getOrderStatus("o1");
    expect(r.reference).toBeNull();
    expect(r.expiresAt).toBeNull();
  });
});

describe("getCheckoutSummary", () => {
  test("chama o resumo e devolve camelCase", async () => {
    const f = fakeFetch(200, {
      id: "c1",
      name: "Análise por IA",
      amount_cents: 100,
      currency: "BRL",
      is_active: true,
    });
    const client = new PayGuinClient({ baseUrl: "https://pg.test", fetch: f.fn });
    const r = await client.getCheckoutSummary("c1");
    expect(f.calls[0]!.url).toBe("https://pg.test/api/v1/checkouts/c1/summary");
    expect(f.calls[0]!.init.method).toBe("GET");
    expect(r).toEqual({
      id: "c1",
      name: "Análise por IA",
      amountCents: 100,
      currency: "BRL",
      isActive: true,
    });
  });

  test("escapa o id na URL", async () => {
    const f = fakeFetch(200, { id: "a/b", name: "x", amount_cents: 1, currency: "BRL", is_active: false });
    const client = new PayGuinClient({ baseUrl: "https://pg.test", fetch: f.fn });
    await client.getCheckoutSummary("a/b");
    expect(f.calls[0]!.url).toBe("https://pg.test/api/v1/checkouts/a%2Fb/summary");
  });

  test("id vazio lança TypeError", async () => {
    const client = new PayGuinClient({ baseUrl: "https://pg.test", fetch: fakeFetch(200, {}).fn });
    await expect(client.getCheckoutSummary("")).rejects.toThrow(TypeError);
  });

  test("404 lança PayGuinApiError", async () => {
    const f = fakeFetch(404, { code: "not_found", message: "checkout nao encontrado" });
    const client = new PayGuinClient({ baseUrl: "https://pg.test", fetch: f.fn });
    await expect(client.getCheckoutSummary("c9")).rejects.toBeInstanceOf(PayGuinApiError);
  });
});
