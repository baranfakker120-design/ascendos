/**
 * Phase 11 — billing money math in integer cents.
 * Never use floats for EUR amounts.
 */

export const BILLING_PLAN_KEY = 'ascendos_standard';
export const DEFAULT_BASE_PRICE_CENTS = 2000;
export const DEFAULT_SEAT_PRICE_CENTS = 200;
export const BILLING_CURRENCY = 'EUR';

export function estimateMonthlyCents(
  activeSeats: number,
  basePriceCents: number = DEFAULT_BASE_PRICE_CENTS,
  seatPriceCents: number = DEFAULT_SEAT_PRICE_CENTS
): number {
  const seats = Math.max(0, Math.trunc(activeSeats));
  const base = Math.max(0, Math.trunc(basePriceCents));
  const seat = Math.max(0, Math.trunc(seatPriceCents));
  return base + seats * seat;
}

export function seatTotalCents(
  activeSeats: number,
  seatPriceCents: number = DEFAULT_SEAT_PRICE_CENTS
): number {
  return Math.max(0, Math.trunc(activeSeats)) * Math.max(0, Math.trunc(seatPriceCents));
}

/** Format cents as EUR display string without float drift (e.g. 42000 → "420,00 €"). */
export function formatEurFromCents(cents: number, locale = 'de-DE'): string {
  const amount = Math.trunc(cents);
  const whole = Math.trunc(amount / 100);
  const frac = Math.abs(amount % 100)
    .toString()
    .padStart(2, '0');
  if (
    locale.startsWith('de') ||
    locale.startsWith('fr') ||
    locale.startsWith('it') ||
    locale.startsWith('pl')
  ) {
    return `${whole.toLocaleString(locale)},${frac} €`;
  }
  return `€${whole.toLocaleString('en-US')}.${frac}`;
}
