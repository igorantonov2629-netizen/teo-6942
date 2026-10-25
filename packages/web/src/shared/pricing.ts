/**
 * Sale price in rubles = Taobao price ¥ × rate + delivery to the supplier ₽ + teo service ₽.
 * Delivery and service are fixed ruble amounts per item type (owner's tariffs).
 * СДЭК from Vladivostok is always paid separately.
 */
export const priceTiers = [
  "футболка",
  "кофта",
  "штаны",
  "куртка",
  "обувь",
  "прочее",
] as const;
export type PriceTier = (typeof priceTiers)[number];
export type TierMarkup = { delivery: number; service: number };
export type Markups = Record<PriceTier, TierMarkup>;

export const tierLabels: Record<PriceTier, string> = {
  футболка: "Футболка",
  кофта: "Худи / кофта",
  штаны: "Штаны / брюки",
  куртка: "Куртка / пуховик",
  обувь: "Кроссовки / обувь",
  прочее: "Другие товары",
};

/** Owner's tariffs: delivery at the upper bound so prices are never understated. */
export const defaultMarkups: Markups = {
  футболка: { delivery: 400, service: 400 },
  кофта: { delivery: 700, service: 600 },
  штаны: { delivery: 700, service: 600 },
  куртка: { delivery: 1200, service: 800 },
  обувь: { delivery: 1200, service: 800 },
  прочее: { delivery: 700, service: 600 },
};

export function priceTier(p: {
  category: string;
  clothingType?: string;
}): PriceTier {
  if (p.category === "Обувь" || p.clothingType === "обувь") return "обувь";
  const t = p.clothingType as PriceTier | undefined;
  if (p.category === "Одежда" && t && t !== "прочее" && priceTiers.includes(t))
    return t;
  return "прочее";
}

export function tierMarkup(
  markups: Partial<Markups> | undefined,
  tier: PriceTier,
): TierMarkup {
  return { ...defaultMarkups[tier], ...markups?.[tier] };
}

export type PriceBreakdown = {
  yuan: number;
  rate: number;
  goods: number;
  delivery: number;
  service: number;
  rub: number;
  tier: PriceTier;
};

export function priceBreakdown(
  yuan: number,
  s: { rate: number | null; markups?: Partial<Markups> },
  product: { category: string; clothingType?: string },
): PriceBreakdown | null {
  if (!s.rate || s.rate <= 0 || !(yuan > 0)) return null;
  const tier = priceTier(product);
  const { delivery, service } = tierMarkup(s.markups, tier);
  const goods = Math.round(yuan * s.rate);
  return {
    yuan,
    rate: s.rate,
    goods,
    delivery,
    service,
    rub: Math.max(1, goods + delivery + service),
    tier,
  };
}

const rub = (n: number) => n.toLocaleString("ru-RU") + " ₽";
export function breakdownText(b: PriceBreakdown) {
  return `${b.yuan.toLocaleString("ru-RU")} ¥ × ${b.rate} ₽ = ${rub(b.goods)} + доставка до поставщика ${rub(b.delivery)} + сервис teo ${rub(b.service)} = ${rub(b.rub)}`;
}

/** Fill missing tiers/fields from the defaults (stored settings may be partial or legacy). */
export function normalizeMarkups(m?: Partial<Record<PriceTier, Partial<TierMarkup>>>): Markups {
  return Object.fromEntries(
    priceTiers.map((t) => [t, { ...defaultMarkups[t], ...m?.[t] }]),
  ) as Markups;
}
