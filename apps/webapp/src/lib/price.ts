import { MAX_PRICE } from 'aow5-api-contract';
import { formatGold, formatGoldExact } from 'aow5-shared/format';

/**
 * A gold amount, in the two forms the site writes one.
 *
 * The algorithms moved to `aow5-shared/format` when the social card started
 * needing them: a card is rendered by the API, which cannot import from this
 * app, and a price that reads `12.4k` on a browse row and `12 400` on the card
 * linking to it is the same build quoting two numbers. What stays here is the
 * one thing the shared package deliberately does not know — `MAX_PRICE`, which
 * belongs to the API contract.
 *
 * The tests in `price.test.ts` are unchanged and are still the specification
 * for both.
 */

export function formatPrice(gold: number): string {
  return formatGold(gold, MAX_PRICE);
}

export function formatPriceExact(gold: number): string {
  return formatGoldExact(gold);
}
