/**
 * USDT rules shared by the client and the project's own code.
 *
 * PayGuin keeps USDT in `amount_cents` like BRL (USDT cents, 2 decimals), but
 * only accepts whole USDT, at least 10: the provider truncates decimals in
 * silence and refuses less than 10. So 10 USDT = 1000 cents, 25 USDT = 2500.
 */

/** Minimum charge, in whole USDT. */
export const USDT_MIN_AMOUNT = 10;

/** The only network PayGuin charges on: TRX (TRON, USDT TRC-20). */
export const USDT_NETWORK = "trx" as const;

/** Technical ceiling of one item: 1_000_000_000 cents, same as the session's. */
const USDT_MAX_AMOUNT = 10_000_000;

/** True for a whole number of USDT from `USDT_MIN_AMOUNT` up. */
export function isValidUsdtAmount(amountUsdt: unknown): amountUsdt is number {
  return (
    typeof amountUsdt === "number" &&
    Number.isSafeInteger(amountUsdt) &&
    amountUsdt >= USDT_MIN_AMOUNT &&
    amountUsdt <= USDT_MAX_AMOUNT
  );
}

/**
 * Whole USDT → the `amount_cents` PayGuin expects (e.g. in a v2 session's
 * `amounts`). `usdtToCents(25)` is `2500`.
 *
 * @throws {TypeError} Unless `amountUsdt` is an integer from 10 to 10_000_000.
 *                     Checked here so a bad price fails in your code, not as a
 *                     422 `invalid_amount` on the page.
 */
export function usdtToCents(amountUsdt: number): number {
  if (!isValidUsdtAmount(amountUsdt)) {
    throw new TypeError(
      `USDT amount must be a whole number from ${USDT_MIN_AMOUNT} to ${USDT_MAX_AMOUNT} ` +
      `(got ${String(amountUsdt)}); PayGuin charges whole USDT only`,
    );
  }
  return amountUsdt * 100;
}
