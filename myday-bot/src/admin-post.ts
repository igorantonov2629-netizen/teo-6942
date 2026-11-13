import { audienceChatIds, clearSession, getDb, setSession, type Audience, type Session } from "./db";
import { audienceKeyboard, audienceLabel, audienceStep, groupsPicker } from "./admin-common";
import { esc } from "./messages";
import { enqueue } from "./outbox";
import { broadcast, btn, edit, kb, safe, send, tg, type InlineKeyboard } from "./telegram";
import { addDays, dowOf, hm, localNow, ruDate, WEEKDAYS_SHORT } from "./time";
import { postFromMessage, type Post, type TgMessage } from "./types";

/** Отправка поста (текст или фото с подписью). */
export async function sendPost(chatId: number, post: Post, markup?: InlineKeyboard) {
  const extra = markup ? { reply_markup: markup } : {};
  if (post.photo)
    return safe(chatId, () => tg("sendPhoto", { chat_id: chatId, photo: post.photo, caption: post.text.slice(0, 1024), parse_mode: "HTML", ...extra }));
  return send(chatId, post.text, extra);
}

// ======================= ОБЪЯВЛЕНИЯ =======================
type AnnData = { post?: Post; audience?: Audience; picking?: string[]; important?: boolean };

export async function startAnnouncement(chatId: number) {
  setSession(chatId, { kind: "admin_ann", step: "content", data: {} });
  await send(chatId, "📢 <b>Объявление</b>\nПришли текст (или фото с подписью). /cancel — отмена.");
}

const annPostText = (p: Post, important?: boolean) => ({ ...p, text: `${important ? "❗️ <b>Важное объявление</b>" : "📢 <b>Объявление</b>"}\n\n${esc(p.text)}` });

function annControls(d: AnnData) {
  return kb([
    [btn(`⭐ Важное: ${d.important ? "да" : "нет"}`, "ann:imp")],
    [btn("✅ Отправить", "ann:send"), btn("✖️ Отмена", "ann:x")],
  ]);
}

const annSummary = (d: AnnData) =>
  `Кому: <b>${audienceLabel(d.audience!)}</b>\n${d.important ? "Важное: придёт даже тем, кто выключил уведомления, и закрепится в чате." : "Обычное: придёт тем, у кого включены уведомления."}`;

export async function annMessage(chatId: number, m: TgMessage, session: Session) {
  const post = postFromMessage(m);
  if (!post) return send(chatId, "Пришли текст или фото с подписью.");
  setSession(chatId, { ...session, step: "audience", data: { post } });
  await send(chatId, "Кому отправить?", { reply_markup: audienceKeyboard("ann") });
}

export async function annCallback(chatId: number, messageId: number, data: string, session: Session | null) {
  if (data === "ann:x" || !session || session.kind !== "admin_ann") {
    clearSession(chatId);
    return edit(chatId, messageId, "Отменено.");
  }
  const d = session.data as AnnData;
  const step = audienceStep(data, d.picking || []);
  if (step?.picking) {
    setSession(chatId, { ...session, data: { ...d, picking: step.picking } });
    return edit(chatId, messageId, "Отметь группы и нажми «Готово»:", groupsPicker("ann", step.picking));
  }
  if (step?.audience) {
    const next = { ...d, audience: step.audience };
    setSession(chatId, { ...session, step: "confirm", data: next });
    await edit(chatId, messageId, "Предпросмотр:");
    await sendPost(chatId, annPostText(d.post!, next.important));
    return send(chatId, annSummary(next), { reply_markup: annControls(next) });
  }
  if (data === "ann:imp" && d.audience) {
    const next = { ...d, important: !d.important };
    setSession(chatId, { ...session, data: next });
    return edit(chatId, messageId, annSummary(next), annControls(next));
  }
  if (data === "ann:send" && d.post && d.audience) {
    clearSession(chatId);
    const ids = audienceChatIds(d.audience, !!d.important);
    await edit(chatId, messageId, `⏳ Отправляю ${ids.length} получателям… Даже если бота перезапустят, рассылка продолжится сама.`);
    // Через очередь в базе: рассылка переживает перезапуск бота.
    enqueue(ids, { post: annPostText(d.post, d.important), pin: !!d.important }, { chat: chatId, msg: messageId });
  }
}

// ======================= РЕКЛАМА =======================
export type Ad = {
  id: number;
  text: string;
  photo: string | null;
  button_text: string | null;
  button_url: string | null;
  erid: string | null;
  audience: string;
  start_date: string;
  time: string;
  repeat: "none" | "daily" | "weekly";
  active: number;
};
type AdData = {
  post?: Post;
  button?: { text: string; url: string } | null;
  erid?: string | null;
  audience?: Audience;
  picking?: string[];
  date?: string;
  time?: string;
  repeat?: Ad["repeat"];
};

export const AD_FROM = hm("9:00");
export const AD_TO = hm("21:00");

/** Как пост выглядит у курсанта: пометка «Реклама» и erid. */
export function adPost(a: { text: string; photo?: string | null; erid?: string | null }): Post {
  const body = ["<b>Реклама</b>", "", esc(a.text), ...(a.erid ? ["", `erid: ${esc(a.erid)}`] : [])].join("\n");
  return { text: body, photo: a.photo || undefined };
}

export const adMarkup = (id: number, buttonText: string | null) => (buttonText ? kb([[btn(buttonText, `adc:${id}`)]]) : undefined);

export async function startAd(chatId: number) {
  setSession(chatId, { kind: "admin_ad", step: "content", data: {} });
  await send(chatId, "💰 <b>Рекламный пост</b>\nПришли текст или фото с подписью. /cancel — отмена.\n\nПравила: не больше 1 рекламы в день на человека, только с 9:00 до 21:00, отдельным сообщением с пометкой «Реклама».");
}

export function parseButton(text: string) {
  const [t, u] = text.split("|").map((s) => s.trim());
  if (!t || !u || !/^https?:\/\/\S+$/i.test(u)) return null;
  return { text: t.slice(0, 40), url: u };
}

export function parseDate(text: string, today: string) {
  const m = text.trim().match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/);
  if (!m) return null;
  const y = m[3] ? Number(m[3]) : Number(today.slice(0, 4));
  const date = `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const check = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== date) return null;
  if (date < today) return m[3] ? null : `${y + 1}${date.slice(4)}`;
  return date;
}

export function parseTime(text: string) {
  const m = text.trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  const min = Number(m[1]) * 60 + Number(m[2]);
  if (min < AD_FROM || min >= AD_TO) return null;
  return `${String(m[1]).padStart(2, "0")}:${m[2]}`;
}

const repeatLabel = (r: Ad["repeat"]) => ({ none: "один раз", daily: "каждый день", weekly: "раз в неделю" })[r];

export async function adMessage(chatId: number, m: TgMessage, session: Session) {
  const d = session.data as AdData;
  const text = (m.text || "").trim();
  const today = localNow().date;
  if (session.step === "content") {
    const post = postFromMessage(m);
    if (!post?.text) return send(chatId, "Нужен текст поста (у фото — подпись).");
    setSession(chatId, { ...session, step: "button", data: { post } });
    return send(chatId, "Кнопка со ссылкой: пришли <code>Текст кнопки | https://ссылка</code>\nили «-», если кнопка не нужна.");
  }
  if (session.step === "button") {
    const button = text === "-" ? null : parseButton(text);
    if (button === null && text !== "-") return send(chatId, "Формат: <code>Текст | https://ссылка</code> или «-».");
    setSession(chatId, { ...session, step: "erid", data: { ...d, button } });
    return send(chatId, "Токен erid из ОРД (маркировка рекламы). Пришли токен или «-», если его нет.\n<i>Платная реклама в Telegram должна быть зарегистрирована через ОРД — уточни у рекламодателя или юриста.</i>");
  }
  if (session.step === "erid") {
    setSession(chatId, { ...session, step: "audience", data: { ...d, erid: text === "-" ? null : text.slice(0, 100) } });
    return send(chatId, "Кому показывать?", { reply_markup: audienceKeyboard("ad") });
  }
  if (session.step === "date") {
    const date = parseDate(text, today);
    if (!date) return send(chatId, "Дата в формате ДД.ММ, например 15.11.");
    return askTime(chatId, session, date);
  }
  if (session.step === "time") {
    const time = parseTime(text);
    if (!time) return send(chatId, "Время ЧЧ:ММ с 09:00 до 20:59, например 12:30.");
    if (d.date === today && hm(time) <= localNow().minutes) return send(chatId, "Это время сегодня уже прошло. Укажи более позднее.");
    setSession(chatId, { ...session, step: "repeat", data: { ...d, time } });
    return send(chatId, "Повторять?", {
      reply_markup: kb([[btn("Один раз", "ad:r:none"), btn("Каждый день", "ad:r:daily"), btn("Раз в неделю", "ad:r:weekly")], [btn("✖️ Отмена", "ad:x")]]),
    });
  }
  return send(chatId, "Используй кнопки выше или /cancel.");
}

async function askTime(chatId: number, session: Session, date: string) {
  setSession(chatId, { ...session, step: "time", data: { ...session.data, date } });
  return send(chatId, `Дата: <b>${ruDate(date)}</b>. Во сколько отправить? (ЧЧ:ММ, с 09:00 до 20:59)`);
}

export async function adCallback(chatId: number, messageId: number, data: string, session: Session | null) {
  if (data === "ad:x" || !session || session.kind !== "admin_ad") {
    clearSession(chatId);
    return edit(chatId, messageId, "Отменено.");
  }
  const d = session.data as AdData;
  const today = localNow().date;
  const step = audienceStep(data, d.picking || []);
  if (step?.picking) {
    setSession(chatId, { ...session, data: { ...d, picking: step.picking } });
    return edit(chatId, messageId, "Отметь группы и нажми «Готово»:", groupsPicker("ad", step.picking));
  }
  if (step?.audience) {
    setSession(chatId, { ...session, step: "date", data: { ...d, audience: step.audience } });
    const tomorrow = addDays(today, 1);
    return edit(chatId, messageId, `Аудитория: <b>${audienceLabel(step.audience)}</b>\nКогда отправить? Выбери или напиши дату ДД.ММ:`, kb([
      [btn(`Сегодня (${ruDate(today)})`, `ad:d:${today}`), btn(`Завтра (${ruDate(tomorrow)})`, `ad:d:${tomorrow}`)],
      [btn("✖️ Отмена", "ad:x")],
    ]));
  }
  const [, kind, value] = data.split(":");
  if (kind === "d") {
    await edit(chatId, messageId, `Дата: ${ruDate(value)}`);
    return askTime(chatId, session, value);
  }
  if (kind === "r" && (value === "none" || value === "daily" || value === "weekly")) {
    const next = { ...d, repeat: value as Ad["repeat"] };
    setSession(chatId, { ...session, step: "confirm", data: next });
    await edit(chatId, messageId, "Предпросмотр — так пост увидят курсанты:");
    await sendPost(chatId, adPost({ text: next.post!.text, photo: next.post!.photo, erid: next.erid }), next.button ? kb([[btn(next.button.text, "noop")]]) : undefined);
    const when = `${ruDate(next.date!)} (${WEEKDAYS_SHORT[dowOf(next.date!)]}) в ${next.time}, ${repeatLabel(next.repeat)}`;
    return send(chatId, `Кому: <b>${audienceLabel(next.audience!)}</b>\nКогда: <b>${when}</b>\nКнопка: ${next.button ? esc(`${next.button.text} → ${next.button.url}`) : "нет"}\nerid: ${next.erid ? esc(next.erid) : "не указан"}`, {
      reply_markup: kb([[btn("✅ Запланировать", "ad:ok"), btn("✖️ Отмена", "ad:x")]]),
    });
  }
  if (kind === "ok" && d.post && d.audience && d.date && d.time && d.repeat) {
    clearSession(chatId);
    const id = getDb()
      .query<{ id: number }, (string | null | number)[]>(
        `INSERT INTO ads (text, photo, button_text, button_url, erid, audience, start_date, time, repeat, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      )
      .get(d.post.text, d.post.photo ?? null, d.button?.text ?? null, d.button?.url ?? null, d.erid ?? null, JSON.stringify(d.audience), d.date, d.time, d.repeat, Date.now())!.id;
    return edit(chatId, messageId, `✅ Реклама #${id} запланирована. Список и отмена: /ads`);
  }
}

/** Список активных рекламных постов с кнопкой остановки. */
export async function listAds(chatId: number) {
  const ads = getDb().query<Ad, []>("SELECT * FROM ads WHERE active = 1 ORDER BY id").all();
  if (!ads.length) return send(chatId, "Активной рекламы нет. Создать: /реклама");
  for (const a of ads)
    await send(chatId, `#${a.id} · ${ruDate(a.start_date)} в ${a.time}, ${repeatLabel(a.repeat)}\nКому: ${audienceLabel(JSON.parse(a.audience))}\n${esc(a.text.slice(0, 120))}`, {
      reply_markup: kb([[btn("⛔️ Остановить", `adstop:${a.id}`)]]),
    });
}

export function stopAd(id: number) {
  getDb().query("UPDATE ads SET active = 0 WHERE id = ?").run(id);
}

/** Клик по кнопке рекламы: считаем (один раз на человека) и даём ссылку. */
export async function adClick(chatId: number, adId: number) {
  const ad = getDb().query<Ad, [number]>("SELECT * FROM ads WHERE id = ?").get(adId);
  if (!ad?.button_url) return;
  getDb().query("INSERT INTO ad_clicks (ad_id, chat_id) VALUES (?, ?) ON CONFLICT DO NOTHING").run(adId, chatId);
  await send(chatId, `🔗 ${esc(ad.button_text || "Ссылка")}`, { reply_markup: kb([[{ text: "Открыть", url: ad.button_url }]]) });
}
