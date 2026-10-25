import { eq } from "drizzle-orm";
import { db } from "../database";
import { teoProducts } from "../database/schema";
import type { Product } from "../../shared/teo";
import { saveProblems } from "../../shared/product-rules";
import { priceBreakdown } from "../../shared/pricing";
import { parseProduct } from "./product-schema";
import { getSettings } from "./commerce";
import { resolveTaobaoInput, TaobaoLinkProblem } from "./taobao-link";

export class ProductProblem extends Error {}

/** Full link, share text or short link → stored item id (before validation). */
async function withTaobaoId(raw: unknown) {
  if (!raw || typeof raw !== "object") return raw;
  const taobao = (raw as { taobao?: unknown }).taobao;
  if (typeof taobao !== "string" || !taobao.trim()) return raw;
  try {
    return { ...raw, taobao: await resolveTaobaoInput(taobao.slice(0, 2048)) };
  } catch (e) {
    if (e instanceof TaobaoLinkProblem) throw new ProductProblem(e.message);
    throw e;
  }
}

/** Validate and upsert a product (used by the app editor and the bot wizard). */
export async function storeProduct(raw: unknown): Promise<Product> {
  const parsed = parseProduct(await withTaobaoId(raw));
  if (!parsed.product) throw new ProductProblem(parsed.problems.join(" "));
  const input = parsed.product;
  const problems = saveProblems(input);
  if (problems.length) throw new ProductProblem(problems.join(" "));
  const calculated = input.taobaoYuan
    ? priceBreakdown(input.taobaoYuan, await getSettings(), input)
    : null;
  if (input.taobaoYuan && !calculated)
    throw new ProductProblem(
      "Для расчёта из юаней нужен курс владельца. Чтобы добавить товар сейчас, оставьте юани пустыми и укажите продажную цену в рублях.",
    );
  const row = (
    await db.select().from(teoProducts).where(eq(teoProducts.id, input.id))
  )[0];
  // Server-owned sourcing provenance is never editable from the client, keep it.
  const sourcing = row ? (JSON.parse(row.data) as Product).sourcing : undefined;
  const sizes = input.sizes ? [...new Set(input.sizes)] : undefined;
  const product: Product = {
    ...input,
    sizes,
    ...(calculated ? { price: Math.max(1, calculated.rub) } : {}),
    ...(sourcing ? { sourcing } : {}),
  };
  await db
    .insert(teoProducts)
    .values({ id: input.id, data: JSON.stringify(product) })
    .onConflictDoUpdate({
      target: teoProducts.id,
      set: { data: JSON.stringify(product) },
    });
  return product;
}
