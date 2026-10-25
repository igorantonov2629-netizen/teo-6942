import { categories } from "../../shared/teo";
import {
  apparelSizes,
  clothingTypes,
  publishProblems,
  shoeSizes,
} from "../../shared/product-rules";
import { taobaoUrl } from "../../shared/taobao";
import { resolveTaobaoInput, TaobaoLinkProblem } from "./taobao-link";
import {
  advanceSession,
  clearSession,
  getSession,
  mutateSession,
  setSession,
} from "./bot-session";
import { storeProduct, ProductProblem } from "./product-store";
import { getSettings } from "./commerce";
import { breakdownText, priceBreakdown } from "../../shared/pricing";
import {
  bestPhoto,
  openAppMarkup,
  telegramCall,
  telegramPhotoDataUrl,
} from "./telegram";
import { cancelHint, type BotCallback, type BotMessage, type BotUser } from "./bot-types";

/** Guided «add product» conversation for the owner and moderators. */
const kind = "product";
type Step =
  | "category"
  | "type"
  | "name"
  | "price"
  | "taobao"
  | "color"
  | "sizes"
  | "photos"
  | "description"
  | "summary"
  | "saving";
type Draft = {
  category: string;
  clothingType: string;
  name: string;
  price: number;
  /** Taobao price ¥ when the ruble price is calculated (owner's rate + markup). */
  yuan?: number;
  priceNote?: string;
  taobao: string;
  color: string;
  sizes: string[];
  photos: string[]; // Telegram file_id, downloaded only on save
  description: string;
  groups: string[];
};
const empty: Draft = {
  category: "",
  clothingType: "",
  name: "",
  price: 0,
  taobao: "",
  color: "",
  sizes: [],
  photos: [],
  description: "",
  groups: [],
};
const productCategories = categories.filter((c) => c !== "Все");
const clothingOnly = clothingTypes.filter((t) => t !== "обувь");
const maxPhotos = 8;

export const canAddProducts = (u: BotUser) =>
  u.role === "owner" || u.role === "moderator";

const isClothing = (d: Draft) => d.category === "Одежда" || d.category === "Обувь";
const needsSizes = (d: Draft) =>
  isClothing(d) && d.clothingType !== "размер уточнит модератор";
const sizeOptions = (d: Draft) => (d.category === "Обувь" ? shoeSizes : apparelSizes);

const order: Step[] = [
  "category",
  "type",
  "name",
  "price",
  "taobao",
  "color",
  "sizes",
  "photos",
  "description",
  "summary",
];
function nextStep(step: Step, d: Draft): Step {
  let i = order.indexOf(step) + 1;
  while (
    (order[i] === "type" && d.category !== "Одежда") ||
    (order[i] === "sizes" && !needsSizes(d))
  )
    i++;
  return order[i] || "summary";
}

const rows = <T>(items: T[], per: number) =>
  Array.from({ length: Math.ceil(items.length / per) }, (_, i) =>
    items.slice(i * per, i * per + per),
  );
const cancelRow = [{ text: "Отмена", callback_data: "np:cancel" }];
const skipRow = (label = "Пропустить") => [
  { text: label, callback_data: "np:skip" },
];
const sizesMarkup = (d: Draft) => ({
  inline_keyboard: [
    ...rows(
      sizeOptions(d).map((s) => ({
        text: (d.sizes.includes(s) ? "✅ " : "") + s,
        callback_data: `np:size:${s}`,
      })),
      d.category === "Обувь" ? 5 : 4,
    ),
    [{ text: `Готово (${d.sizes.length})`, callback_data: "np:done" }],
    cancelRow,
  ],
});

function candidate(d: Draft, hidden: boolean) {
  return {
    name: d.name,
    category: d.category,
    price: d.price,
    image: d.photos[0] ? "photo" : "",
    color: d.color,
    taobao: d.taobao,
    hidden,
    clothing: isClothing(d),
    ...(isClothing(d) ? { clothingType: d.clothingType, sizes: d.sizes } : {}),
  };
}

function summary(d: Draft) {
  const lines = [
    "🧾 Проверьте товар:",
    "",
    `Категория: ${d.category}${d.category === "Одежда" ? ` · ${d.clothingType}` : ""}`,
    `Название: ${d.name}`,
    `Цена: ${d.price.toLocaleString("ru-RU")} ₽${d.priceNote ? `\n   ${d.priceNote}` : " (вручную)"}`,
    `Taobao: ${d.taobao ? taobaoUrl(d.taobao) : "—"}`,
    `Цвет: ${d.color || "—"}`,
    ...(isClothing(d)
      ? [`Размеры: ${needsSizes(d) ? d.sizes.join(", ") || "—" : "уточнит модератор"}`]
      : []),
    `Фото: ${d.photos.length}`,
    `Описание: ${d.description ? d.description.slice(0, 200) : "—"}`,
  ];
  const problems = publishProblems(candidate(d, false));
  if (problems.length)
    lines.push(
      "",
      "Чтобы опубликовать в каталоге, не хватает:",
      ...problems.map((p) => "• " + p),
      "",
      "Можно сохранить черновик (скрыт от покупателей) и дополнить в приложении.",
    );
  return {
    text: lines.join("\n"),
    reply_markup: {
      inline_keyboard: [
        ...(problems.length
          ? []
          : [[{ text: "✅ Опубликовать", callback_data: "np:publish" }]]),
        [{ text: "💾 Сохранить черновик", callback_data: "np:draft" }],
        cancelRow,
      ],
    },
  };
}

async function ask(chatId: number, step: Step, d: Draft) {
  const send = (text: string, inline_keyboard: unknown[][]) =>
    telegramCall("sendMessage", {
      chat_id: chatId,
      text,
      reply_markup: { inline_keyboard },
    });
  switch (step) {
    case "category":
      return send("1. Что добавляем?", [
        ...rows(
          productCategories.map((c, i) => ({ text: c, callback_data: `np:cat:${i}` })),
          2,
        ),
        cancelRow,
      ]);
    case "type":
      return send("Какой тип одежды?", [
        ...rows(
          clothingOnly.map((t, i) => ({ text: t, callback_data: `np:type:${i}` })),
          2,
        ),
        cancelRow,
      ]);
    case "name":
      return send("2. Впишите название товара.", [cancelRow]);
    case "price":
      return send(
        "3. Цена на Taobao в юанях (например 672) — рубли посчитаю по курсу и наценке для этого типа товара.\nЕсли хотите указать готовую цену в рублях, добавьте ₽: 2490 ₽",
        [cancelRow],
      );
    case "taobao":
      return send(
        "4. Ссылка на товар Taobao / Tmall — можно вставить прямо из «Поделиться».",
        [skipRow(), cancelRow],
      );
    case "color":
      return send("5. Цвет (например: чёрный).", [skipRow(), cancelRow]);
    case "sizes":
      return telegramCall("sendMessage", {
        chat_id: chatId,
        text: "6. Отметьте размеры из сетки продавца и нажмите «Готово». Можно вписать текстом: S, M, L",
        reply_markup: sizesMarkup(d),
      });
    case "photos":
      return send(
        `7. Отправьте фото товара (до ${maxPhotos}, можно альбомом). Первое станет обложкой. Затем нажмите «Готово».`,
        [[{ text: "Готово", callback_data: "np:done" }], cancelRow],
      );
    case "description":
      return send("8. Описание товара (состав, посадка, детали).", [skipRow(), cancelRow]);
    case "summary": {
      const s = summary(d);
      return telegramCall("sendMessage", { chat_id: chatId, ...s });
    }
  }
}

/** CAS step move + next question, so double taps / retried webhooks act once. */
async function go(user: BotUser, from: Step, d: Draft) {
  const to = nextStep(from, d);
  if (!(await advanceSession(user.id, kind, from, to, d))) return false;
  await ask(user.id, to, d);
  return true;
}

export async function startProductWizard(user: BotUser) {
  if (!canAddProducts(user))
    return telegramCall("sendMessage", {
      chat_id: user.id,
      text: "Добавлять товары могут владелец и модераторы.",
    });
  await setSession<Draft>(user.id, kind, "category", empty);
  await telegramCall("sendMessage", {
    chat_id: user.id,
    text: "🆕 Новый товар. Отвечайте на вопросы — в конце покажу сводку.\n" + cancelHint,
  });
  await ask(user.id, "category", empty);
}

const parseYuan = (v: string) => {
  const n = Number(v.replace(/[\s¥юаней]/gi, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 && n <= 1000000 ? Math.round(n * 100) / 100 : 0;
};
const wizardProduct = (d: Draft) => ({
  category: d.category,
  clothingType: d.category === "Обувь" ? "обувь" : d.clothingType,
});
const parsePrice = (v: string) => {
  const n = Number(v.replace(/[\s₽руб.]/gi, "").replace(",", "."));
  return Number.isFinite(n) && n >= 1 && n <= 10000000 ? Math.round(n) : 0;
};

export async function productWizardMessage(user: BotUser, m: BotMessage) {
  const reply = (text: string) =>
    telegramCall("sendMessage", { chat_id: user.id, text });
  if (!canAddProducts(user)) {
    await clearSession(user.id);
    return reply("Доступ модератора отозван — добавление товара отменено.");
  }
  const session = await getSession<Draft>(user.id);
  if (session?.kind !== kind) return;
  const step = session.step as Step;
  const d = session.data;
  const text = (m.text ?? m.caption ?? "").trim();

  if (step === "photos" && m.photo?.length) {
    let reportable = true;
    const before = d.photos.length;
    const next = await mutateSession<Draft>(user.id, kind, "photos", (old) => {
      const groups = [...old.groups];
      if (m.media_group_id) {
        reportable = !groups.includes(m.media_group_id);
        if (reportable) groups.push(m.media_group_id);
      }
      const photos = [...old.photos, bestPhoto(m.photo!).file_id].slice(0, maxPhotos);
      return { ...old, photos, groups };
    });
    if (!next || !reportable) return;
    return telegramCall("sendMessage", {
      chat_id: user.id,
      text:
        next.photos.length >= maxPhotos && before < maxPhotos
          ? `Фото добавлены (максимум ${maxPhotos}). Нажмите «Готово».`
          : `Фото получено (${next.photos.length}/${maxPhotos}). Отправьте ещё или нажмите «Готово».`,
      reply_markup: {
        inline_keyboard: [[{ text: "Готово", callback_data: "np:done" }], cancelRow],
      },
    });
  }
  if (!text) return reply("Ответьте текстом. " + cancelHint);

  switch (step) {
    case "category": {
      const c = productCategories.find((x) => x.toLowerCase() === text.toLowerCase());
      if (!c) return ask(user.id, step, d);
      return go(user, step, {
        ...d,
        category: c,
        clothingType: c === "Обувь" ? "обувь" : "",
        sizes: [],
      });
    }
    case "type": {
      const t = clothingOnly.find((x) => x === text.toLowerCase());
      if (!t) return ask(user.id, step, d);
      return go(user, step, { ...d, clothingType: t });
    }
    case "name":
      if (text.length > 160) return reply("Название — до 160 символов.");
      return go(user, step, { ...d, name: text });
    case "price": {
      const price = parsePrice(text);
      if (!price)
        return reply("Не понял цену. Впишите юани числом, например 672, или рубли со знаком ₽: 2490 ₽.");
      if (/₽|руб|р\.?$/i.test(text))
        return go(user, step, { ...d, price, yuan: undefined, priceNote: undefined });
      const yuan = parseYuan(text);
      const b = yuan ? priceBreakdown(yuan, await getSettings(), wizardProduct(d)) : null;
      if (!b)
        return reply(
          yuan
            ? "Курс ещё не настроен владельцем. Впишите готовую цену в рублях со знаком ₽, например 2490 ₽."
            : "Не понял цену в юанях. Например: 672 или 89,5.",
        );
      return go(user, step, { ...d, price: b.rub, yuan, priceNote: breakdownText(b) });
    }
    case "taobao": {
      if (text === "-") return go(user, step, { ...d, taobao: "" });
      let id = "";
      try {
        id = await resolveTaobaoInput(text);
      } catch (e) {
        if (!(e instanceof TaobaoLinkProblem)) throw e;
        return reply(e.message + " Или нажмите «Пропустить».");
      }
      return go(user, step, { ...d, taobao: id });
    }
    case "color":
      if (text.length > 100) return reply("Цвет — до 100 символов.");
      return go(user, step, { ...d, color: text === "-" ? "" : text });
    case "sizes": {
      const sizes = [
        ...new Set(text.split(/[,;\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean)),
      ];
      if (!sizes.length || sizes.length > 30 || sizes.some((s) => s.length > 50))
        return reply("Впишите размеры через запятую, например: S, M, L");
      return go(user, step, { ...d, sizes });
    }
    case "photos":
      if (/^готово$/i.test(text)) return go(user, step, d);
      return reply("Отправьте фото (как фото, не файлом) или нажмите «Готово».");
    case "description":
      if (text.length > 5000) return reply("Описание — до 5000 символов.");
      return go(user, step, { ...d, description: text === "-" ? "" : text });
    case "summary":
      return reply("Выберите действие под сводкой: опубликовать, сохранить черновик или отменить.");
    default:
      return reply("Сохраняю товар, подождите…");
  }
}

async function save(user: BotUser, d: Draft, hidden: boolean) {
  const reply = (text: string, reply_markup?: unknown) =>
    telegramCall("sendMessage", {
      chat_id: user.id,
      text,
      ...(reply_markup ? { reply_markup } : {}),
    });
  try {
    const images: string[] = [];
    for (const id of d.photos) images.push(await telegramPhotoDataUrl(id));
    const product = await storeProduct({
      id: Date.now(),
      name: d.name,
      category: d.category,
      price: d.price,
      ...(d.yuan ? { taobaoYuan: d.yuan } : {}),
      image: images[0] || "",
      images,
      color: d.color,
      description: d.description,
      rating: "5.0",
      taobao: d.taobao,
      hidden,
      clothing: isClothing(d),
      ...(isClothing(d)
        ? { clothingType: d.clothingType, sizes: needsSizes(d) ? d.sizes : [] }
        : {}),
    });
    await clearSession(user.id);
    await reply(
      hidden
        ? `💾 Черновик «${product.name}» сохранён. Он скрыт от покупателей — дополните и опубликуйте в Профиль → Панель модератора → Товары.`
        : `✅ «${product.name}» опубликован в каталоге.`,
      openAppMarkup(),
    );
  } catch (error) {
    await advanceSession(user.id, kind, "saving", "summary");
    const why =
      error instanceof ProductProblem || error instanceof Error
        ? error.message
        : "Не удалось сохранить товар.";
    await reply(`Не сохранено: ${why}`);
    await ask(user.id, "summary", d);
  }
}

export async function productWizardCallback(c: BotCallback, user: BotUser) {
  let answer = "";
  try {
    if (!canAddProducts(user) || c.message?.chat.id !== user.id)
      throw new Error("Добавлять товары могут владелец и модераторы.");
    const session = await getSession<Draft>(user.id);
    if (session?.kind !== kind) throw new Error("Добавление товара уже завершено.");
    const step = session.step as Step;
    const d = session.data;
    const [, action, value = ""] = (c.data || "").split(":", 3) as [string, string, string?];
    const stale = () => {
      throw new Error("Эта кнопка уже неактуальна — ответьте на последний вопрос.");
    };
    if (action === "cancel") {
      await clearSession(user.id);
      answer = "Отменено.";
      await telegramCall("sendMessage", {
        chat_id: user.id,
        text: "Добавление товара отменено. Начать заново: /newproduct",
      });
    } else if (action === "cat") {
      const cat = productCategories[Number(value)];
      if (step !== "category" || !cat) stale();
      const ok = await go(user, step, {
        ...d,
        category: cat!,
        clothingType: cat === "Обувь" ? "обувь" : "",
        sizes: [],
      });
      if (!ok) stale();
      answer = cat!;
    } else if (action === "type") {
      const t = clothingOnly[Number(value)];
      if (step !== "type" || !t) stale();
      if (!(await go(user, step, { ...d, clothingType: t! }))) stale();
      answer = t!;
    } else if (action === "skip") {
      if (!["taobao", "color", "description"].includes(step)) stale();
      if (!(await go(user, step, d))) stale();
      answer = "Пропущено.";
    } else if (action === "size") {
      if (step !== "sizes" || !sizeOptions(d).includes(value)) stale();
      const next = await mutateSession<Draft>(user.id, kind, "sizes", (old) => ({
        ...old,
        sizes: old.sizes.includes(value)
          ? old.sizes.filter((s) => s !== value)
          : sizeOptions(old).filter((s) => s === value || old.sizes.includes(s)),
      }));
      if (!next) stale();
      await telegramCall("editMessageReplyMarkup", {
        chat_id: user.id,
        message_id: c.message!.message_id,
        reply_markup: sizesMarkup(next!),
      }).catch(() => undefined);
      answer = next!.sizes.includes(value) ? `${value} ✓` : `${value} убран`;
    } else if (action === "done") {
      if (step !== "sizes" && step !== "photos") stale();
      if (step === "sizes" && !d.sizes.length)
        throw new Error("Отметьте хотя бы один размер.");
      if (!(await go(user, step, d))) stale();
      answer = "Дальше.";
    } else if (action === "publish" || action === "draft") {
      if (step !== "summary") stale();
      const hidden = action === "draft";
      const problems = hidden ? [] : publishProblems(candidate(d, false));
      if (problems.length) throw new Error(problems.join(" "));
      if (!(await advanceSession(user.id, kind, "summary", "saving")))
        throw new Error("Товар уже сохраняется.");
      await telegramCall("answerCallbackQuery", {
        callback_query_id: c.id,
        text: "Сохраняю…",
      });
      await save(user, d, hidden);
      return;
    } else stale();
  } catch (error) {
    answer = error instanceof Error ? error.message : "Ошибка.";
  }
  await telegramCall("answerCallbackQuery", {
    callback_query_id: c.id,
    text: answer.slice(0, 200),
    show_alert: answer.length > 60,
  }).catch(() => undefined);
}
