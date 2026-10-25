import { taobaoLinkAccepted, taobaoInputHelp } from "./taobao";

export const clothingTypes = [
  "куртка",
  "кофта",
  "футболка",
  "штаны",
  "обувь",
  "размер уточнит модератор",
] as const;
export const moderatorSizeMarker = "Размер уточнит модератор";
export const apparelSizes = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];
// EU shoe sizes incl. halves, because sellers often list 38.5 / 42.5.
export const shoeSizes = Array.from({ length: 23 }, (_, i) =>
  String(35 + i / 2),
);

type Draft = {
  name: string;
  category: string;
  price: number;
  image: string;
  images?: string[];
  color: string;
  taobao: string;
  hidden?: boolean;
  clothing?: boolean;
  clothingType?: string;
  sizes?: string[];
};

/** Problems that block saving at all, even as a hidden draft. */
export function draftProblems(p: Draft): string[] {
  const out: string[] = [];
  if (!p.name.trim()) out.push("Укажите название.");
  if (!Number.isFinite(p.price) || p.price < 1)
    out.push("Укажите продажную цену от 1 ₽.");
  if (p.taobao.trim() && !taobaoLinkAccepted(p.taobao))
    out.push(taobaoInputHelp);
  if (p.clothing === true) {
    if (!p.clothingType) out.push("Выберите тип одежды.");
    else if (p.category !== (p.clothingType === "обувь" ? "Обувь" : "Одежда"))
      out.push("Категория не совпадает с типом одежды.");
  }
  if (
    p.clothing === false &&
    (["Одежда", "Обувь"].includes(p.category) ||
      p.sizes?.length ||
      p.clothingType)
  )
    out.push("Для одежды и обуви сначала выберите «Да».");
  return out;
}

/** Everything a product needs before buyers can see it in the catalog. */
export function publishProblems(p: Draft): string[] {
  const out = draftProblems(p);
  if (!p.taobao.trim()) out.push("Добавьте ссылку на товар Taobao / Tmall.");
  if (!p.image && !p.images?.some(Boolean)) out.push("Добавьте фото товара.");
  if (!p.color.trim()) out.push("Укажите цвет.");
  if (
    p.clothing === true &&
    p.clothingType !== "размер уточнит модератор" &&
    !p.sizes?.length
  )
    out.push("Отметьте размеры из сетки продавца.");
  return out;
}

/** Hidden products only need to be valid drafts; visible ones must be complete. */
export function saveProblems(p: Draft): string[] {
  return p.hidden ? draftProblems(p) : publishProblems(p);
}
