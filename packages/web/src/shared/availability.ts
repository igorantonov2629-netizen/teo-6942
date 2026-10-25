import type { Order } from "./teo";

/** Buyer has 3 hours to accept availability changes before the order is cancelled. */
export const availabilityTimeout = 3 * 60 * 60 * 1000;
export const maxArrivalPhotos = 8;

export const proposalStatus = "Ждём согласия покупателя";
export const declinedStatus = "Заказ отменён: изменения не приняты";
export const expiredStatus = "Заказ отменён: нет ответа 3 часа";
export const unavailableStatus = "Заказ отменён: товара нет в наличии";

/** One line of the moderator's availability review. Untouched lines are "available". */
export type ItemChange = {
  index: number;
  remove?: boolean;
  variant?: string;
  price?: number;
};
export type AvailabilityProposal = {
  changes: ItemChange[];
  comment?: string;
  total: number;
  proposedAt: number;
  expiresAt: number;
  proposedBy: number;
  version: string;
  state: "proposed" | "accepted" | "declined" | "expired";
  decidedAt?: number;
};

type Item = Order["items"][number];

/** Only real changes survive: same size / same price are treated as "available". */
export function normalizeChanges(items: Item[], changes: ItemChange[]) {
  const seen = new Set<number>();
  const out: ItemChange[] = [];
  for (const c of changes) {
    const item = items[c.index];
    if (!item || seen.has(c.index)) continue;
    seen.add(c.index);
    if (c.remove) {
      out.push({ index: c.index, remove: true });
      continue;
    }
    const variant = c.variant?.trim();
    const change: ItemChange = { index: c.index };
    if (variant && variant !== item.variant) change.variant = variant;
    if (c.price !== undefined && c.price !== item.price) change.price = c.price;
    if (change.variant || change.price !== undefined) out.push(change);
  }
  return out.sort((a, b) => a.index - b.index);
}

export function applyChanges(items: Item[], changes: ItemChange[]): Item[] {
  return items.flatMap((item, index) => {
    const c = changes.find((x) => x.index === index);
    if (!c) return [item];
    if (c.remove) return [];
    const next: Item = { ...item };
    if (c.variant) next.variant = c.variant;
    if (c.price !== undefined) {
      next.price = c.price;
      // The old CNY figure no longer matches a manually changed price.
      delete next.yuanPrice;
    }
    return [next];
  });
}

export function itemsTotal(items: Item[]) {
  return items.reduce((s, i) => s + i.price * i.qty, 0);
}

export function describeChange(item: Item, c: ItemChange) {
  if (c.remove) return `${item.name} (${item.variant}) — нет в наличии, убираем`;
  const parts: string[] = [];
  if (c.variant) parts.push(`размер ${item.variant} → ${c.variant}`);
  if (c.price !== undefined)
    parts.push(`цена ${item.price} ₽ → ${c.price} ₽ за шт.`);
  return `${item.name}: ${parts.join(", ")}`;
}

export function proposalExpired(o: Order, now = Date.now()) {
  return (
    o.status === proposalStatus &&
    o.availability?.state === "proposed" &&
    now >= o.availability.expiresAt
  );
}
