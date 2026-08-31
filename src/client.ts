/**
 * PayGuinClient - server-to-server client for the PayGuin checkout API.
 *
 * Creates PIX charges and queries order status. Zero runtime dependencies:
 * uses built-in fetch (Node 18+ / Bun) and node:crypto.
 *
 * Configuration is injected via constructor (no env var reads inside the SDK).
 */

import { PayGuinApiError } from "./errors.js";
import type {
  PayGuinClientConfig,
  CreateChargeInput,
  ChargeResult,
  OrderStatus,
  PayGuinCreateOrderRequest,
  PayGuinCreateOrderResponse,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 30_000;

export class PayGuinClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetch: typeof globalThis.fetch;

  constructor(config: PayGuinClientConfig) {
    if (!config.baseUrl) {
      throw new TypeError(
        "PayGuinClient requires a baseUrl (e.g. 'https://payguin.example.com')",
      );
    }
    // Strip trailing slash for consistent URL building
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
   *
   * @throws {PayGuinApiError} On non-2xx HTTP responses.
   * @throws {Error} On network failures or timeouts.
   */
  async createCharge(
    checkoutId: string,
    input: CreateChargeInput,
  ): Promise<ChargeResult> {
    if (!checkoutId) {
      throw new TypeError("checkoutId must not be empty");
    }

    const payload: PayGuinCreateOrderRequest = {
      payer: {
        name: input.payer.name,
        email: input.payer.email,
        phone: input.payer.phone,
        document: input.payer.document,
      },
    };

    // Omitted when undefined so the backend keeps the Checkout defaults.
    if (input.reference !== undefined) {
      payload.reference = input.reference;
    }
    if (input.metadata !== undefined) {
      payload.metadata = input.metadata;
    }

    const url = `${this.baseUrl}/api/v1/checkouts/${encodeURIComponent(checkoutId)}/orders`;
    const response = await this.doFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      await this.throwApiError("createCharge", response);
    }

    const data = (await response.json()) as PayGuinCreateOrderResponse;

    return {
      orderId: data.order_id,
      externalId: data.external_id,
      status: data.status,
      amountCents: data.amount_cents,
      currency: data.currency,
      pixCopiaECola: data.pix_copia_e_cola,
      pixExpiresAt: data.pix_expires_at,
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
  async getOrderStatus(orderId: string): Promise<OrderStatus> {
    if (!orderId) {
      throw new TypeError("orderId must not be empty");
    }

    const url = `${this.baseUrl}/api/v1/orders/${encodeURIComponent(orderId)}/status`;
    const response = await this.doFetch(url, { method: "GET" });

    if (!response.ok) {
      await this.throwApiError("getOrderStatus", response);
    }

    const data = (await response.json()) as {
      status: OrderStatus["status"];
      amount_cents: number;
      currency: string;
      expires_at?: string | null;
    };

    return {
      status: data.status,
      amountCents: data.amount_cents,
      currency: data.currency,
      expiresAt: data.expires_at ?? null,
    };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async doFetch(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async throwApiError(
    operation: string,
    response: Response,
  ): Promise<never> {
    let body = "";
    let errorCode: string | undefined;
    let errorMessage: string | undefined;

    try {
      body = await response.text();
      const parsed = JSON.parse(body) as Record<string, unknown>;
      errorCode = typeof parsed.code === "string" ? parsed.code : undefined;
      errorMessage = typeof parsed.message === "string" ? parsed.message : undefined;
    } catch {
      // Body is not JSON or unreadable; that's fine.
    }

    throw new PayGuinApiError(
      `[PayGuinClient] ${operation} failed: HTTP ${response.status}${errorMessage ? ` - ${errorMessage}` : ""}`,
      response.status,
      errorCode,
      errorMessage,
      body || undefined,
    );
  }
}
