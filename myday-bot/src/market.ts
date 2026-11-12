import { config, isAdmin } from "./config";
import { clearSession, getDb, setSession, type Session } from "./db";
import { esc } from "./messages";
import { btn, edit, kb, safe, send, tg, type InlineButton, type InlineKeyboard } from "./telegram";
import { localNow } from "./time";
import type { TgMessage, TgUser } from "./types";

/**
 * Барахолка: курсанты сами выкладывают объявления, покупатели пишут продавцу
 * в личку по его @username. Объявление публикуется сразу, админ получает копию
 * с кнопками «Удалить» и «Забанить». В базе у объявления хранится chat_id
 * владельца (чтобы он мог им управлять) и @username, который продавец
 * сам согласился показать. Закрытые объявления удаляются через 7 дней.
 */

export const MAX_ACTIVE = 3;
export const LIFETIME_DAYS = 14;
const COOLDOWN_MIN = 1;
const DAY = 24 * 3600 * 1000;

export const CATEGORIES: Record<string, string> = {
  form: "👕 Форма",
  tech: "📱 Техника",
  study: "📚 Учёба",
  other: "📦 Другое",
};

export type Listing = {
  id: number;
  chat_id: number;
  username: string;
  title: string;
  price: string;
  descr: string;
  category: string;
  photo: string | null;
  status: "active" | "sold" | "removed" | "expired";
  created_at: number;
  expires_at: number;
  renew_notified: number;
};

// ---------- база ----------
const db = () => getDb();
export const getListing = (id: number) => db().query<Listing, [number]>("SELECT * FROM listings WHERE id = ?").get(id);
const activeListings = (cat: string) =>
  cat === "all"
    ? db().query<Listing, []>("SELECT * FROM listings WHERE status = 'active' ORDER BY created_at DESC").all()
    : db().query<Listing, [string]>("SELECT * FROM listings WHERE status = 'active' AND category = ? ORDER BY created_at DESC").all(cat);
const myListings = (chatId: number) =>
  db().query<Listing, [number]>("SELECT * FROM listings WHERE chat_id = ? AND status = 'active' ORDER BY created_at DESC").all(chatId);
const activeCount = (chatId: number) =>
  db().query<{ n: number }, [number]>("SELECT COUNT(*) AS n FROM listings WHERE chat_id = ? AND status = 'active'").get(chatId)!.n;
const lastPostAt = (chatId: number) =>
  db().query<{ t: number | null }, [number]>("SELECT MAX(created_at) AS t FROM listings WHERE chat_id = ?").get(chatId)?.t ?? 0;
export const isBanned = (chatId: number) => !!db().query("SELECT 1 FROM market_bans WHERE chat_id = ?").get(chatId);
const close = (id: number, status: Listing["status"]) =>
  db().query("UPDATE listings SET status = ?, expires_at = ? WHERE id = ?").run(status, Date.now(), id);

/** Удаляет закрытые объявления старше недели и жалобы на них. */
export function purgeOldListings() {
  const cutoff = Date.now() - 7 * DAY;
  db().query("DELETE FROM market_reports WHERE listing_id IN (SELECT id FROM listings WHERE status != 'active' AND expires_at < ?)").run(cutoff);
  db().query("DELETE FROM listings WHERE status != 'active' AND expires_at < ?").run(cutoff);
}

// ---------- отображение ----------
const fmtDate = (ms: number) => {
  const d = localNow(new Date(ms)).date;
  return `${d.slice(8, 10)}.${d.slice(5, 7)}`;
};

export function cardText(l: Pick<Listing, "title" | "price" | "descr" | "category" | "username"> & { expires_at?: number }) {
  return [
    `<b>${esc(l.title)}</b>`,
    `💰 ${esc(l.price)}`,
    `${CATEGORIES[l.category] ?? CATEGORIES.other}`,
    "",
    esc(l.descr),
    "",
    `👤 @${esc(l.username)}${l.expires_at ? ` · до ${fmtDate(l.expires_at)}` : ""}`,
  ].join("\n");
}

const sellerButton = (username: string): InlineButton => ({ text: "✉️ Написать продавцу", url: `https://t.me/${username}` });

async function sendCard(chatId: number, l: Pick<Listing, "photo"> & Parameters<typeof cardText>[0], markup: InlineKeyboard, header = "") {
  const text = header + cardText(l);
  if (l.photo)
    return safe(chatId, () => tg("sendPhoto", { chat_id: chatId, photo: l.photo, caption: text.slice(0, 1024), parse_mode: "HTML", reply_markup: markup }));
  return send(chatId, text, { reply_markup: markup });
}

const homeMarkup = kb([[btn("🔍 Смотреть объявления", "mk:cats")], [btn("➕ Разместить", "mk:new"), btn("📋 Мои", "mk:my")]]);
const HOME_TEXT =
  "🛒 <b>Барахолка</b>\nКурсанты продают и покупают друг у друга: форму, технику, учебники и всё остальное.\nСвязь с продавцом — в личке, по кнопке на объявлении.";

const catsMarkup = () => {
  const count = (c: string) => activeListings(c).length;
  return kb([
    [btn(`Все (${count("all")})`, "mk:b:all:0")],
    ...Object.entries(CATEGORIES).map(([k, t]) => [btn(`${t} (${count(k)})`, `mk:b:${k}:0`)]),
    [btn("← Назад", "mk:home")],
  ]);
};

export const showMarket = (chatId: number) => send(chatId, HOME_TEXT, { reply_markup: homeMarkup });

async function replace(chatId: number, messageId: number, fn: () => Promise<unknown>) {
  await tg("deleteMessage", { chat_id: chatId, message_id: messageId }).catch(() => null);
  return fn();
}

async function showBrowse(chatId: number, messageId: number, cat: string, idx: number, admin: boolean) {
  const list = activeListings(cat);
  if (!list.length)
    return replace(chatId, messageId, () =>
      send(chatId, "Здесь пока нет объявлений. Будь первым — нажми «Разместить».", { reply_markup: kb([[btn("➕ Разместить", "mk:new")], [btn("← Категории", "mk:cats")]]) }),
    );
  const i = ((idx % list.length) + list.length) % list.length;
  const l = list[i];
  const rows: InlineButton[][] = [];
  if (list.length > 1) rows.push([btn("◀️", `mk:b:${cat}:${i - 1}`), btn(`${i + 1} / ${list.length}`, "noop"), btn("▶️", `mk:b:${cat}:${i + 1}`)]);
  rows.push([sellerButton(l.username)]);
  rows.push([btn("⚠️ Пожаловаться", `mk:rep:${l.id}`), btn("← Категории", "mk:cats")]);
  if (admin) rows.push([btn("🗑 Удалить", `mk:del:${l.id}`), btn("🚫 Бан", `mk:ban:${l.id}`)]);
  return replace(chatId, messageId, () => sendCard(chatId, l, kb(rows)));
}

function myView(chatId: number) {
  const list = myListings(chatId);
  if (!list.length) return { text: "У тебя нет активных объявлений.", markup: kb([[btn("➕ Разместить", "mk:new")], [btn("← Назад", "mk:home")]]) };
  return {
    text: [
      `📋 <b>Мои объявления</b> (${list.length} из ${MAX_ACTIVE})`,
      ...list.map((l, n) => `${n + 1}. <b>${esc(l.title)}</b> — ${esc(l.price)} · до ${fmtDate(l.expires_at)}`),
    ].join("\n"),
    markup: kb([
      ...list.map((l, n) => [btn(`✅ ${n + 1} продано`, `mk:sold:${l.id}`), btn(`🔁 Продлить`, `mk:renew:${l.id}`), btn(`🗑 Удалить`, `mk:rm:${l.id}`)]),
      [btn("← Назад", "mk:home")],
    ]),
  };
}

// ---------- размещение ----------
const cancelRow = [btn("✖️ Отмена", "mk:cancel")];
const STEPS: Record<string, string> = {
  photo: "📷 Пришли <b>фото</b> вещи (одно) или нажми «Без фото».",
  title: "✏️ Что продаёшь? Коротко, до 60 символов.\n<i>Например: Китель парадный, 48 размер</i>",
  price: "💰 Цена? До 30 символов.\n<i>Например: 1500 ₽ или договорная</i>",
  descr: "📝 Описание: состояние, размер, где забрать. До 500 символов.",
};

/** Проверки перед размещением. Возвращает текст отказа или null. */
function postBlocker(chatId: number, username?: string) {
  if (isBanned(chatId)) return "🚫 Ты не можешь размещать объявления в барахолке. Вопросы — @" + config.supportContact;
  if (!username)
    return "Чтобы покупатели могли тебе написать, нужен <b>username</b> в Telegram.\nЗаведи его: Настройки Telegram → Имя пользователя, — и нажми «Разместить» ещё раз.";
  if (activeCount(chatId) >= MAX_ACTIVE) return `У тебя уже ${MAX_ACTIVE} активных объявления — это максимум. Закрой одно в «Мои объявления».`;
  const wait = COOLDOWN_MIN - Math.floor((Date.now() - lastPostAt(chatId)) / 60000);
  if (wait > 0) return `Новое объявление можно разместить через ${wait} мин.`;
  return null;
}

async function startNew(chatId: number, messageId: number, from: TgUser) {
  const blocker = postBlocker(chatId, from.username);
  if (blocker) return edit(chatId, messageId, blocker, kb([[btn("← Назад", "mk:home")]]));
  setSession(chatId, { kind: "market", step: "photo", data: {} });
  await edit(chatId, messageId, STEPS.photo, kb([[btn("Без фото", "mk:nophoto")], cancelRow]));
}

const ask = (chatId: number, step: string) => send(chatId, STEPS[step], { reply_markup: kb([cancelRow]) });

export async function marketMessage(chatId: number, m: TgMessage, s: Session) {
  const text = (m.text || m.caption || "").trim();
  const next = (step: string, patch: Record<string, unknown>) => {
    setSession(chatId, { kind: "market", step, data: { ...s.data, ...patch } });
    return ask(chatId, step);
  };
  switch (s.step) {
    case "photo":
      if (!m.photo?.length) return send(chatId, "Нужна фотография. Или нажми «Без фото».", { reply_markup: kb([[btn("Без фото", "mk:nophoto")], cancelRow]) });
      return next("title", { photo: m.photo[m.photo.length - 1].file_id });
    case "title":
      if (!text || text.length > 60) return send(chatId, "Название — от 1 до 60 символов. Попробуй ещё раз.", { reply_markup: kb([cancelRow]) });
      return next("price", { title: text });
    case "price":
      if (!text || text.length > 30) return send(chatId, "Цена — до 30 символов. Например: 1500 ₽", { reply_markup: kb([cancelRow]) });
      return next("descr", { price: text });
    case "descr":
      if (!text || text.length > 500) return send(chatId, `Описание — от 1 до 500 символов (сейчас ${text.length}).`, { reply_markup: kb([cancelRow]) });
      setSession(chatId, { kind: "market", step: "cat", data: { ...s.data, descr: text } });
      return send(chatId, "🏷 Выбери категорию:", {
        reply_markup: kb([...Object.entries(CATEGORIES).map(([k, t]) => [btn(t, `mk:cat:${k}`)]), cancelRow]),
      });
    default:
      return send(chatId, "Используй кнопки выше или нажми «Отмена».", { reply_markup: kb([cancelRow]) });
  }
}

async function showPreview(chatId: number, data: Record<string, unknown>, username: string) {
  const l = { ...(data as any), username, photo: (data.photo as string) ?? null };
  await sendCard(chatId, l, kb([[btn("✅ Опубликовать", "mk:pub")], cancelRow]), "👀 <b>Так увидят объявление другие:</b>\n\n");
}

const adminMarkup = (id: number) => kb([[btn("🗑 Удалить", `mk:del:${id}`), btn("🚫 Забанить", `mk:ban:${id}`)]]);

async function publish(chatId: number, s: Session, from: TgUser) {
  const blocker = postBlocker(chatId, from.username);
  clearSession(chatId);
  if (blocker) return send(chatId, blocker);
  const d = s.data as Record<string, string>;
  const now = Date.now();
  const id = Number(
    db()
      .query(
        `INSERT INTO listings (chat_id, username, title, price, descr, category, photo, status, created_at, expires_at, renew_notified)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, 0)`,
      )
      .run(chatId, from.username!, d.title, d.price, d.descr, d.category, d.photo ?? null, now, now + LIFETIME_DAYS * DAY).lastInsertRowid,
  );
  await send(chatId, `✅ Объявление опубликовано на ${LIFETIME_DAYS} дней. Управлять им — в «🛒 Барахолка» → «Мои».`);
  const l = getListing(id)!;
  for (const admin of config.adminIds) await sendCard(admin, l, adminMarkup(id), `🛒 <b>Новое объявление #${id}</b>\n\n`);
}

// ---------- модерация ----------
async function removeByAdmin(chatId: number, messageId: number, id: number, ban: boolean) {
  const l = getListing(id);
  await tg("editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }).catch(() => null);
  if (!l) return send(chatId, `Объявления #${id} уже нет.`);
  if (ban) {
    db().query("INSERT INTO market_bans (chat_id, created_at) VALUES (?, ?) ON CONFLICT DO NOTHING").run(l.chat_id, Date.now());
    const all = myListings(l.chat_id);
    for (const x of all) close(x.id, "removed");
    await send(l.chat_id, "🚫 Твои объявления сняты модератором, размещать новые больше нельзя. Вопросы — @" + config.supportContact);
    return send(chatId, `🚫 Продавец @${esc(l.username)} забанен в барахолке, снято объявлений: ${all.length || (l.status === "active" ? 1 : 0)}.`);
  }
  if (l.status !== "active") return send(chatId, `Объявление #${id} уже закрыто.`);
  close(id, "removed");
  await send(l.chat_id, `🗑 Объявление «${esc(l.title)}» снято модератором.`);
  return send(chatId, `🗑 Объявление #${id} «${esc(l.title)}» удалено.`);
}

async function report(chatId: number, id: number) {
  const l = getListing(id);
  if (!l || l.status !== "active") return send(chatId, "Это объявление уже снято.");
  const fresh = db().query("INSERT INTO market_reports (listing_id, chat_id) VALUES (?, ?) ON CONFLICT DO NOTHING").run(id, chatId).changes > 0;
  if (fresh) for (const admin of config.adminIds) await sendCard(admin, l, adminMarkup(id), `⚠️ <b>Жалоба на объявление #${id}</b>\n\n`);
  return send(chatId, "Спасибо, жалоба отправлена модератору.");
}

/** /барахолка для админа: все активные объявления с кнопками удаления. */
export async function adminMarketList(chatId: number) {
  const list = activeListings("all");
  if (!list.length) return send(chatId, "🛒 В барахолке нет активных объявлений.");
  const shown = list.slice(0, 40);
  await send(
    chatId,
    [`🛒 <b>Активные объявления: ${list.length}</b>`, ...shown.map((l) => `#${l.id} <b>${esc(l.title)}</b> — ${esc(l.price)} · @${esc(l.username)}`)].join("\n"),
    { reply_markup: kb(shown.map((l) => [btn(`🗑 #${l.id} ${l.title.slice(0, 25)}`, `mk:del:${l.id}`)])) },
  );
}

// ---------- кнопки ----------
export async function marketCallback(chatId: number, messageId: number, data: string, from: TgUser, session: Session | null) {
  const [, action, a, b] = data.split(":");
  const admin = isAdmin(from.id);
  const own = (id: number) => {
    const l = getListing(id);
    return l && l.chat_id === chatId ? l : null;
  };
  switch (action) {
    case "home":
      return replace(chatId, messageId, () => showMarket(chatId));
    case "cats":
      return replace(chatId, messageId, () => send(chatId, "🔍 Выбери категорию:", { reply_markup: catsMarkup() }));
    case "b":
      return showBrowse(chatId, messageId, a in CATEGORIES || a === "all" ? a : "all", Number(b) || 0, admin);
    case "my": {
      const v = myView(chatId);
      return edit(chatId, messageId, v.text, v.markup);
    }
    case "new":
      return startNew(chatId, messageId, from);
    case "cancel":
      clearSession(chatId);
      return replace(chatId, messageId, () => send(chatId, "Ок, объявление не размещено.", { reply_markup: homeMarkup }));
    case "nophoto":
      if (session?.kind !== "market" || session.step !== "photo") return;
      setSession(chatId, { kind: "market", step: "title", data: { ...session.data, photo: null } });
      return edit(chatId, messageId, STEPS.title, kb([cancelRow]));
    case "cat": {
      if (session?.kind !== "market" || session.step !== "cat" || !(a in CATEGORIES)) return;
      const d = { ...session.data, category: a };
      setSession(chatId, { kind: "market", step: "confirm", data: d });
      await tg("deleteMessage", { chat_id: chatId, message_id: messageId }).catch(() => null);
      return showPreview(chatId, d, from.username ?? "username");
    }
    case "pub":
      if (session?.kind !== "market" || session.step !== "confirm") return;
      await tg("editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }).catch(() => null);
      return publish(chatId, session, from);
    case "sold":
    case "rm": {
      const l = own(Number(a));
      if (l?.status === "active") close(l.id, action === "sold" ? "sold" : "removed");
      const v = myView(chatId);
      return edit(chatId, messageId, (l ? (action === "sold" ? "✅ Отмечено как продано.\n\n" : "🗑 Удалено.\n\n") : "") + v.text, v.markup);
    }
    case "renew": {
      const l = own(Number(a));
      if (!l || l.status === "removed" || l.status === "sold") return send(chatId, "Это объявление продлить нельзя.");
      if (isBanned(chatId)) return send(chatId, "🚫 Размещать объявления больше нельзя.");
      if (l.status === "expired" && activeCount(chatId) >= MAX_ACTIVE) return send(chatId, `У тебя уже ${MAX_ACTIVE} активных объявления.`);
      const until = Date.now() + LIFETIME_DAYS * DAY;
      db().query("UPDATE listings SET status = 'active', expires_at = ?, renew_notified = 0, username = COALESCE(?, username) WHERE id = ?").run(until, from.username ?? null, l.id);
      return send(chatId, `🔁 «${esc(l.title)}» продлено до ${fmtDate(until)}.`);
    }
    case "rep":
      return report(chatId, Number(a));
    case "del":
    case "ban":
      if (!admin) return;
      return removeByAdmin(chatId, messageId, Number(a), action === "ban");
  }
}

// ---------- сроки ----------
/** Снимает просроченные объявления и за сутки предупреждает продавца. Сообщения — только с 9 до 21. */
export async function marketTick(minutes: number) {
  if (minutes < 9 * 60 || minutes >= 21 * 60) return;
  const now = Date.now();
  for (const l of db().query<Listing, [number]>("SELECT * FROM listings WHERE status = 'active' AND expires_at <= ?").all(now)) {
    db().query("UPDATE listings SET status = 'expired' WHERE id = ?").run(l.id);
    await send(l.chat_id, `⌛️ Срок объявления «${esc(l.title)}» истёк, оно скрыто.`, { reply_markup: kb([[btn("🔁 Вернуть ещё на 14 дней", `mk:renew:${l.id}`)]]) });
  }
  for (const l of db()
    .query<Listing, [number]>("SELECT * FROM listings WHERE status = 'active' AND renew_notified = 0 AND expires_at <= ?")
    .all(now + DAY)) {
    db().query("UPDATE listings SET renew_notified = 1 WHERE id = ?").run(l.id);
    await send(l.chat_id, `⏳ Объявление «${esc(l.title)}» будет снято завтра. Продлить?`, {
      reply_markup: kb([[btn("🔁 Продлить на 14 дней", `mk:renew:${l.id}`), btn("✅ Уже продано", `mk:sold:${l.id}`)]]),
    });
  }
}
