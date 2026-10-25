import { z } from "zod";
import { taobaoItemId, taobaoInputHelp } from "../../shared/taobao";
import { clothingTypes } from "../../shared/product-rules";

export const photoSchema = z
  .string()
  .max(2000000)
  .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/);
export const productImageSchema = z.union([
  photoSchema,
  z
    .string()
    .max(2048)
    .regex(/^\/images\/[a-zA-Z0-9_./-]+$/),
  z
    .string()
    .max(2048)
    .url()
    .refine(
      (v) => v.startsWith("https://"),
      "Используйте HTTPS-ссылку на фото",
    ),
]);
export const productSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().trim().min(1).max(160),
    category: z.string().max(50),
    price: z.number().positive().max(10000000),
    taobaoYuan: z.number().positive().max(10000000).optional(),
    oldPrice: z.number().positive().optional(),
    image: z.union([z.literal(""), productImageSchema]),
    images: z.array(productImageSchema).max(8).optional(),
    color: z.string().max(100),
    description: z.string().max(5000),
    tag: z.string().max(40).optional(),
    rating: z.string().max(10),
    taobao: z
      .string()
      .trim()
      .max(2048)
      .transform((v, ctx) => {
        if (!v) return "";
        const id = taobaoItemId(v);
        if (!id) {
          ctx.addIssue({ code: "custom", message: taobaoInputHelp });
          return z.NEVER;
        }
        return id;
      }),
    hidden: z.boolean().optional(),
    clothing: z.boolean().optional(),
    clothingType: z.enum(clothingTypes).optional(),
    sizes: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
  })
  .superRefine((p, ctx) => {
    if (
      (p.images || []).reduce((sum, v) => sum + v.length, p.image.length) >
      8000000
    )
      ctx.addIssue({
        code: "custom",
        message: "Общий размер фотографий слишком большой.",
      });
  });

const fieldLabels: Record<string, string> = {
  name: "Название",
  price: "Продажная цена",
  taobaoYuan: "Закупка в юанях",
  oldPrice: "Старая цена",
  image: "Фото",
  images: "Фото",
  color: "Цвет",
  description: "Описание",
  tag: "Метка",
  sizes: "Размеры",
  clothingType: "Тип одежды",
  category: "Категория",
};
/**
 * The oRPC input layer only reports "Input validation failed", which tells a
 * moderator nothing. Accept the typed shape, then parse here with readable errors.
 */
export const productInput = z.custom<z.input<typeof productSchema>>(
  (v) => typeof v === "object" && v !== null,
);
export function parseProduct(value: unknown) {
  const r = productSchema.safeParse(value);
  if (r.success) return { product: r.data, problems: [] as string[] };
  const problems = [
    ...new Set(
      r.error.issues.map((i) => {
        if (i.code === "custom") return i.message;
        const label = fieldLabels[String(i.path[0])] || String(i.path[0]);
        if (i.code === "too_big")
          return i.path[0] === "images"
            ? "Не больше 8 фото."
            : `${label}: слишком длинное или большое значение.`;
        if (i.code === "too_small") return `${label}: заполните поле.`;
        return `${label}: некорректное значение.`;
      }),
    ),
  ];
  return { product: null, problems };
}
