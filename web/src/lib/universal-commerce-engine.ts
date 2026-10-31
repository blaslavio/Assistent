/** Universal Commerce Engine — deterministic, side-effect-free domain rules.
 * Supports goods, digital downloads, services, events and subscriptions.
 * Payment capture, inventory reservation and fulfillment belong to trusted server APIs.
 */
export type CommerceKind = "physical" | "digital" | "service" | "event" | "subscription";
export type Currency = "EUR" | "USD" | "GBP";
export type CatalogItem = Readonly<{
  id: string; workspaceId: string; kind: CommerceKind; title: string;
  priceMinor: number; currency: Currency; active: boolean;
  inventory?: number | null; maxPerOrder?: number;
}>;
export type CartLine = Readonly<{ itemId: string; quantity: number }>;
export type CartQuote = Readonly<{
  workspaceId: string; currency: Currency; subtotalMinor: number;
  lines: ReadonlyArray<{ itemId: string; quantity: number; lineTotalMinor: number }>;
}>;
export class CommerceValidationError extends Error {
  constructor(public readonly code: string) { super(code); this.name = "CommerceValidationError"; }
}
const assert = (condition: unknown, code: string): asserts condition => {
  if (!condition) throw new CommerceValidationError(code);
};
export function quoteCart(
  workspaceId: string, catalog: readonly CatalogItem[], cart: readonly CartLine[],
): CartQuote {
  if (!workspaceId) throw new CommerceValidationError("workspace_required");
  if (!cart.length || cart.length > 100) throw new CommerceValidationError("invalid_cart_size");
  const byId = new Map<string, CatalogItem>();
  for (const item of catalog) {
    if (byId.has(item.id)) throw new CommerceValidationError("duplicate_catalog_item");
    byId.set(item.id, item);
  }
  const seen = new Set<string>();
  let currency: Currency | undefined;
  let subtotalMinor = 0;
  const lines = cart.map(({ itemId, quantity }) => {
    if (seen.has(itemId)) throw new CommerceValidationError("duplicate_cart_line");
    seen.add(itemId);
    const item = byId.get(itemId);
    if (!item || !item.active || item.workspaceId !== workspaceId) throw new CommerceValidationError("item_unavailable");
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000 || quantity > (item.maxPerOrder ?? 1000))
      throw new CommerceValidationError("invalid_quantity");
    if (!Number.isSafeInteger(item.priceMinor) || item.priceMinor < 0)
      throw new CommerceValidationError("invalid_price");
    if (item.inventory != null && (!Number.isSafeInteger(item.inventory) || item.inventory < quantity))
      throw new CommerceValidationError("insufficient_inventory");
    if (currency && currency !== item.currency) throw new CommerceValidationError("mixed_currency");
    currency = item.currency;
    const lineTotalMinor = item.priceMinor * quantity;
    if (!Number.isSafeInteger(lineTotalMinor) || !Number.isSafeInteger(subtotalMinor + lineTotalMinor))
      throw new CommerceValidationError("amount_overflow");
    subtotalMinor += lineTotalMinor;
    return { itemId, quantity, lineTotalMinor };
  });
  return { workspaceId, currency: currency!, subtotalMinor, lines };
}
/** Preview only. Recalculate totals on the server from trusted catalog prices. */
export function previewQuote(workspaceId: string, catalog: readonly CatalogItem[], cart: readonly CartLine[]): CartQuote {
  return quoteCart(workspaceId, catalog, cart);
}
