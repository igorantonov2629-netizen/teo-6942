import { config, isAdmin } from "./config";
import { clearSession, getDb, setSession, type Session } from "./db";
import { isBanned } from "./market";
import { esc } from "./messages";
import { broadcast, btn, edit, kb, send, tg, type InlineButton } from "./telegram";
import { fmtHM, localNow } from "./time";
import type { TgMessage, TgUser } from "./types";

/**
 * Подработка: курсант даёт задание («сходи на Озон — 200 ₽»), другой берёт его.
 * Берёт первый нажавший «Возьмусь» — задание сразу пропадает из списка.
 * Заказчик отмечает «Выполнено» (или вернуть в список), оба ставят 👍/👎.
 * Несделанные задания снимаются по сроку, взятые — закрываются через 48 ч.
 * Деньги бот не трогает. Бан — общий с барахолкой.
 */

const MAX_OPEN = 3;
const MAX_TAKEN = 3;
const H = 3600 * 1000;
const DAY = 24 * H;
const PUSH_GAP = 10 * 60 * 1000;

export const JOB_CATEGORIES: Record<string, string> = {
  shop: "🛒 Магазин",
  parcel: "📦 Посылки",
  help: "🤝 Помощь",
  study: "📚 Учёба",
  other: "✨ Другое",
};
/** Учебные задания разрешены, пока не включён заказ конспектов. */
const studyAllowed = () => !config.ordersEnabled;
const STUDY_WORDS = /реферат|контрольн|курсов|конспект|домашк|лаборатор|решить|решу|сочинени|доклад/i;
const categories = () => Object.entries(JOB_CATEGORIES).filter(([k]) => k !== "study" || studyAllowed());

export type Job = {
  id: number;
  chat_id: number;
  username: string;
  text: string;
  reward: string;
  category: string;
  deadline: number;
  status: "open" | "taken" | "done" | "cancelled" | "expired" | "removed";
  worker_id: number | null;
  worker_username: string | null;
  created_at: number;
  taken_at: number | null;
  closed_at: number | null;
  remind_stage: number;
};

// ---------- база ----------
const db = () => getDb();
export const getJob = (id: number) => db().query<Job, [number]>("SELECT * FROM jobs WHERE id = ?").get(id);
const openJobs = () =>
  db()
    .query<Job, []>(`SELECT * FROM jobs WHERE status = 'open' ${studyAllowed() ? "" : "AND category != 'study'"} ORDER BY created_at DESC`)
    .all();
const count = (sql: string, ...args: number[]) => db().query<{ n: number }, number[]>(sql).get(...args)!.n;
const closeJob = (id: number, status: Job["status"]) => db().query("UPDATE jobs SET status = ?, closed_at = ? WHERE id = ?").run(status, Date.now(), id);

/** «✅ 14 · 👍 93%» — по выполненным заданиям в роли исполнителя или заказчика. */
export function reputation(chatId: number, role: "worker" | "client") {
  const done = count(`SELECT COUNT(*) AS n FROM jobs WHERE status = 'done' AND ${role === "worker" ? "worker_id" : "chat_id"} = ?`, chatId);
  const r = db()
    .query<{ n: number; up: number | null }, [number, string]>("SELECT COUNT(*) AS n, SUM(value > 0) AS up FROM job_ratings WHERE target_id = ? AND role = ?")
    .get(chatId, role)!;
  if (!done && !r.n) return "новичок";
  return `✅ ${done}${r.n ? ` · 👍 ${Math.round(((r.up ?? 0) / r.n) * 100)}%` : ""}`;
}

/** Закрытые задания и всё, что к ним относится, удаляются через неделю. */
export function purgeOldJobs() {
  const cutoff = Date.now() - 7 * DAY;
  const old = "SELECT id FROM jobs WHERE status NOT IN ('open', 'taken') AND closed_at < ?";
  db().query(`DELETE FROM job_reports WHERE job_id IN (${old})`).run(cutoff);
  db().query(`DELETE FROM jobs WHERE status NOT IN ('open', 'taken') AND closed_at < ?`).run(cutoff);
  // оценки храним — на них держится рейтинг; в них нет ничего, кроме id и ±1
}

// ---------- отображение ----------
function fmtWhen(ms: number) {
  const t = localNow(new Date(ms));
  const today = localNow().date;
  const day = t.date === today ? "сегодня" : `${t.date.slice(8, 10)}.${t.date.slice(5, 7)}`;
  return `${day} ${fmtHM(t.minutes)}`;
}

export function jobCard(j: Pick<Job, "text" | "reward" | "category" | "deadline" | "username" | "chat_id">) {
  return [
    `💰 <b>${esc(j.reward)}</b> · ${JOB_CATEGORIES[j.category] ?? JOB_CATEGORIES.other}`,
    "",
    esc(j.text),
    "",
    `⏰ Срок: до ${fmtWhen(j.deadline)}`,
    `👤 @${esc(j.username)} · ${reputation(j.chat_id, "client")}`,
    "",
    "<i>Оплата — при встрече, не переводи и не бери деньги заранее.</i>",
  ].join("\n");
}

const isSubscribed = (chatId: number) => !!db().query("SELECT 1 FROM job_subs WHERE chat_id = ?").get(chatId);

function homeView(chatId: number) {
  const n = openJobs().length;
  return {
    text:
      "💰 <b>Подработка</b>\nДай задание — «сходи в магазин», «забери посылку с Озона» — и назначь цену. Кто хочет подзаработать, берёт задание и пишет тебе в личку.",
    markup: kb([
      [btn(`🔍 Свободные задания (${n})`, "jb:l:0")],
      [btn("➕ Дать задание", "jb:new"), btn("📋 Мои", "jb:my")],
      [btn(isSubscribed(chatId) ? "🔕 Не присылать новые задания" : "🔔 Присылать новые задания", "jb:sub")],
    ]),
  };
}

export async function showJobs(chatId: number) {
  const v = homeView(chatId);
  await send(chatId, v.text, { reply_markup: v.markup });
}

function listView(idx: number, admin: boolean) {
  const list = openJobs();
  if (!list.length)
    return { text: "Свободных заданий пока нет. Включи «🔔 Присылать новые задания» — сообщу, как появятся.", markup: kb([[btn("➕ Дать задание", "jb:new")], [btn("← Назад", "jb:home")]]) };
  const i = ((idx % list.length) + list.length) % list.length;
  const j = list[i];
  const rows: InlineButton[][] = [];
  if (list.length > 1) rows.push([btn("◀️", `jb:l:${i - 1}`), btn(`${i + 1} / ${list.length}`, "noop"), btn("▶️", `jb:l:${i + 1}`)]);
  rows.push([btn("🙋 Возьмусь", `jb:take:${j.id}`)]);
  rows.push([btn("⚠️ Пожаловаться", `jb:rep:${j.id}`), btn("← Назад", "jb:home")]);
  if (admin) rows.push([btn("🗑 Удалить", `jb:del:${j.id}`), btn("🚫 Бан", `jb:ban:${j.id}`)]);
  return { text: jobCard(j), markup: kb(rows) };
}

function myView(chatId: number) {
  const mine = db().query<Job, [number]>("SELECT * FROM jobs WHERE chat_id = ? AND status IN ('open', 'taken') ORDER BY created_at DESC").all(chatId);
  const doing = db().query<Job, [number]>("SELECT * FROM jobs WHERE worker_id = ? AND status = 'taken' ORDER BY taken_at DESC").all(chatId);
  if (!mine.length && !doing.length) return { text: "У тебя нет активных заданий.", markup: kb([[btn("➕ Дать задание", "jb:new")], [btn("← Назад", "jb:home")]]) };
  const lines = ["📋 <b>Мои задания</b>"];
  const rows: InlineButton[][] = [];
  if (mine.length) {
    lines.push("", "<b>Я заказал:</b>");
    mine.forEach((j, n) => {
      lines.push(`${n + 1}. ${esc(j.text.slice(0, 50))} — ${esc(j.reward)} · ${j.status === "open" ? "ждёт исполнителя" : `делает @${esc(j.worker_username ?? "")}`}`);
      rows.push(
        j.status === "taken"
          ? [btn(`✅ ${n + 1} выполнено`, `jb:done:${j.id}`), btn("🔁 В список", `jb:back:${j.id}`)]
          : [btn(`🗑 Снять ${n + 1}`, `jb:cancel:${j.id}`)],
      );
    });
  }
  if (doing.length) {
    lines.push("", "<b>Я делаю:</b>");
    doing.forEach((j) => {
      lines.push(`• ${esc(j.text.slice(0, 50))} — ${esc(j.reward)} · заказчик @${esc(j.username)}`);
      rows.push([{ text: `✉️ @${j.username}`, url: `https://t.me/${j.username}` }, btn("Отказаться", `jb:drop:${j.id}`)]);
    });
  }
  rows.push([btn("← Назад", "jb:home")]);
  return { text: lines.join("\n"), markup: kb(rows) };
}

// ---------- новое задание ----------
const cancelRow = [btn("✖️ Отмена", "jb:abort")];
const ASK: Record<string, string> = {
  text: "✏️ Что нужно сделать? Опиши коротко: что, где, куда принести. До 300 символов.\n<i>Например: Забрать посылку с Озона на Светланской, принести в общагу 2</i>",
  reward: "💰 Сколько платишь? До 30 символов.\n<i>Например: 200 ₽</i>",
};
const DEADLINES: [string, string][] = [
  ["3h", "За 3 часа"],
  ["today", "Сегодня"],
  ["tom", "До завтра"],
  ["week", "Без срока (неделя)"],
];
function deadlineMs(code: string) {
  const now = Date.now();
  const endOfToday = now + (24 * 60 - localNow().minutes) * 60000 - 60000;
  return code === "3h" ? now + 3 * H : code === "today" ? endOfToday : code === "tom" ? endOfToday + DAY : now + 7 * DAY;
}

function postBlocker(chatId: number, username?: string) {
  if (isBanned(chatId)) return "🚫 Тебе закрыт доступ к барахолке и подработке. Вопросы — @" + config.supportContact;
  if (!username) return "Нужен <b>username</b> в Telegram, чтобы с тобой могли связаться. Заведи его: Настройки Telegram → Имя пользователя.";
  if (count("SELECT COUNT(*) AS n FROM jobs WHERE chat_id = ? AND status IN ('open', 'taken')", chatId) >= MAX_OPEN)
    return `У тебя уже ${MAX_OPEN} активных задания — это максимум. Закрой одно в «Мои».`;
  return null;
}

export async function jobMessage(chatId: number, m: TgMessage, s: Session) {
  const text = (m.text || "").trim();
  // Написали задание сразу, не выбрав категорию, — принимаем как «Другое».
  if (s.step === "cat" && text) s = { ...s, step: "text", data: { category: "other" } };
  if (s.step === "text") {
    if (!text || text.length > 300) return send(chatId, "Описание — от 1 до 300 символов.", { reply_markup: kb([cancelRow]) });
    if (!studyAllowed() && STUDY_WORDS.test(text))
      return send(chatId, "Учебные задания (рефераты, контрольные, конспекты) здесь больше не размещаются — для них есть «📝 Заказать конспект».", {
        reply_markup: kb([cancelRow]),
      });
    setSession(chatId, { kind: "job", step: "reward", data: { ...s.data, text } });
    return send(chatId, ASK.reward, { reply_markup: kb([cancelRow]) });
  }
  if (s.step === "reward") {
    if (!text || text.length > 30) return send(chatId, "Оплата — до 30 символов. Например: 200 ₽", { reply_markup: kb([cancelRow]) });
    setSession(chatId, { kind: "job", step: "deadline", data: { ...s.data, reward: text } });
    return send(chatId, "⏰ К какому сроку?", { reply_markup: kb([...DEADLINES.map(([k, t]) => [btn(t, `jb:dl:${k}`)]), cancelRow]) });
  }
  return send(chatId, "Используй кнопки выше или нажми «Отмена».", { reply_markup: kb([cancelRow]) });
}

async function publish(chatId: number, s: Session, from: TgUser) {
  const blocker = postBlocker(chatId, from.username);
  clearSession(chatId);
  if (blocker) return send(chatId, blocker);
  const d = s.data as Record<string, string | number>;
  const id = Number(
    db()
      .query("INSERT INTO jobs (chat_id, username, text, reward, category, deadline, status, created_at, remind_stage) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, 0)")
      .run(chatId, from.username!, String(d.text), String(d.reward), String(d.category), Number(d.deadline), Date.now()).lastInsertRowid,
  );
  await send(chatId, "✅ Задание опубликовано! Как только кто-то возьмётся — пришлю его @username.");
  const j = getJob(id)!;
  for (const admin of config.adminIds) await send(admin, `💰 <b>Новое задание #${id}</b>\n\n${jobCard(j)}`, { reply_markup: adminMarkup(id) });
  await pushToSubscribers(j);
}

const adminMarkup = (id: number) => kb([[btn("🗑 Удалить", `jb:del:${id}`), btn("🚫 Забанить", `jb:ban:${id}`)]]);

// ---------- подписка ----------
const pushHours = (minutes: number) => minutes >= 8 * 60 && minutes < 22 * 60;

/** Новое задание — подписчикам сразу, но не чаще раза в 10 минут; остальное копится в сводку. */
async function pushToSubscribers(j: Job) {
  const now = Date.now();
  const subs = db().query<{ chat_id: number; last_push: number }, [number]>("SELECT chat_id, last_push FROM job_subs WHERE chat_id != ?").all(j.chat_id);
  const ready = pushHours(localNow().minutes) ? subs.filter((s) => now - s.last_push >= PUSH_GAP).map((s) => s.chat_id) : [];
  const later = subs.filter((s) => !ready.includes(s.chat_id)).map((s) => s.chat_id);
  const mark = db().query("UPDATE job_subs SET last_push = ?, pending = 0 WHERE chat_id = ?");
  const pend = db().query("UPDATE job_subs SET pending = pending + 1 WHERE chat_id = ?");
  for (const id of later) pend.run(id);
  await broadcast(ready, async (id) => {
    mark.run(now, id);
    return send(id, `🔔 <b>Новое задание</b>\n\n${jobCard(j)}`, { reply_markup: kb([[btn("🙋 Возьмусь", `jb:take:${j.id}`)], [btn("Все задания", "jb:l:0")]]) });
  });
}

// ---------- действия ----------
async function take(chatId: number, id: number, from: TgUser) {
  if (isBanned(chatId)) return send(chatId, "🚫 Тебе закрыт доступ к подработке.");
  if (!from.username) return send(chatId, "Нужен <b>username</b> в Telegram, чтобы заказчик мог тебе написать. Заведи его: Настройки Telegram → Имя пользователя.");
  const j = getJob(id);
  if (!j || j.status !== "open") return send(chatId, "😕 Это задание уже взяли или сняли.");
  if (j.chat_id === chatId) return send(chatId, "Это твоё собственное задание 🙂");
  if (count("SELECT COUNT(*) AS n FROM jobs WHERE worker_id = ? AND status = 'taken'", chatId) >= MAX_TAKEN)
    return send(chatId, `У тебя уже ${MAX_TAKEN} задания в работе. Сначала выполни их.`);
  // Атомарно: берёт только первый нажавший.
  const won =
    db()
      .query("UPDATE jobs SET status = 'taken', worker_id = ?, worker_username = ?, taken_at = ?, remind_stage = 0 WHERE id = ? AND status = 'open'")
      .run(chatId, from.username, Date.now(), id).changes > 0;
  if (!won) return send(chatId, "😕 Кто-то успел раньше — задание уже взяли.");
  await send(chatId, `🙋 Задание твоё!\n\n${esc(j.text)}\n💰 ${esc(j.reward)}\n\nНапиши заказчику @${esc(j.username)} и договоритесь. Передумал — нажми «Отказаться».`, {
    reply_markup: kb([[{ text: `✉️ Написать @${j.username}`, url: `https://t.me/${j.username}` }], [btn("Отказаться", `jb:drop:${id}`)]]),
  });
  await send(
    j.chat_id,
    `🙋 За твоё задание «${esc(j.text.slice(0, 60))}» взялся @${esc(from.username)} (${reputation(chatId, "worker")}).\nОн напишет тебе, или напиши сам.`,
    {
      reply_markup: kb([
        [{ text: `✉️ Написать @${from.username}`, url: `https://t.me/${from.username}` }],
        [btn("✅ Выполнено", `jb:done:${id}`), btn("🔁 Вернуть в список", `jb:back:${id}`)],
      ]),
    },
  );
}

const rateRow = (id: number) => [btn("👍", `jb:rate:${id}:1`), btn("👎", `jb:rate:${id}:-1`)];

async function finish(j: Job, auto = false) {
  closeJob(j.id, "done");
  if (!auto) await send(j.chat_id, `✅ Задание закрыто. Оцени исполнителя @${esc(j.worker_username ?? "")}:`, { reply_markup: kb([rateRow(j.id)]) });
  if (j.worker_id)
    await send(j.worker_id, `✅ ${auto ? "Задание закрыто автоматически" : "Заказчик отметил задание выполненным"}: «${esc(j.text.slice(0, 60))}». Оцени заказчика @${esc(j.username)}:`, {
      reply_markup: kb([rateRow(j.id)]),
    });
}

async function reopen(j: Job, by: "client" | "worker") {
  db().query("UPDATE jobs SET status = 'open', worker_id = NULL, worker_username = NULL, taken_at = NULL, remind_stage = 0 WHERE id = ?").run(j.id);
  if (by === "client" && j.worker_id) await send(j.worker_id, `ℹ️ Заказчик вернул задание «${esc(j.text.slice(0, 60))}» в общий список.`);
  if (by === "worker") await send(j.chat_id, `ℹ️ @${esc(j.worker_username ?? "")} отказался от задания «${esc(j.text.slice(0, 60))}». Оно снова в списке.`);
}

function rate(chatId: number, j: Job, value: number) {
  const role = chatId === j.chat_id ? "worker" : chatId === j.worker_id ? "client" : null;
  if (!role || j.status !== "done") return false;
  const target = role === "worker" ? j.worker_id! : j.chat_id;
  return (
    db()
      .query("INSERT INTO job_ratings (job_id, rater_id, target_id, role, value) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING")
      .run(j.id, chatId, target, role, value > 0 ? 1 : -1).changes > 0
  );
}

async function moderate(chatId: number, messageId: number, id: number, ban: boolean) {
  const j = getJob(id);
  await tg("editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }).catch(() => null);
  if (!j) return send(chatId, `Задания #${id} уже нет.`);
  if (ban) {
    db().query("INSERT INTO market_bans (chat_id, created_at) VALUES (?, ?) ON CONFLICT DO NOTHING").run(j.chat_id, Date.now());
    const active = db().query<Job, [number]>("SELECT * FROM jobs WHERE chat_id = ? AND status IN ('open', 'taken')").all(j.chat_id);
    for (const x of active) closeJob(x.id, "removed");
    await send(j.chat_id, "🚫 Твои задания сняты модератором, размещать новые больше нельзя. Вопросы — @" + config.supportContact);
    return send(chatId, `🚫 @${esc(j.username)} забанен в барахолке и подработке, снято заданий: ${active.length}.`);
  }
  if (j.status !== "open" && j.status !== "taken") return send(chatId, `Задание #${id} уже закрыто.`);
  closeJob(id, "removed");
  await send(j.chat_id, `🗑 Задание «${esc(j.text.slice(0, 60))}» снято модератором.`);
  if (j.worker_id) await send(j.worker_id, `ℹ️ Задание «${esc(j.text.slice(0, 60))}» снято модератором.`);
  return send(chatId, `🗑 Задание #${id} удалено.`);
}

/** /подработка для админа: все активные задания. */
export async function adminJobsList(chatId: number) {
  const list = db().query<Job, []>("SELECT * FROM jobs WHERE status IN ('open', 'taken') ORDER BY created_at DESC LIMIT 40").all();
  if (!list.length) return send(chatId, "💰 Активных заданий нет.");
  await send(
    chatId,
    ["💰 <b>Активные задания</b>", ...list.map((j) => `#${j.id} ${j.status === "taken" ? "🔒" : "🟢"} ${esc(j.text.slice(0, 40))} — ${esc(j.reward)} · @${esc(j.username)}`)].join("\n"),
    { reply_markup: kb(list.map((j) => [btn(`🗑 #${j.id} ${j.text.slice(0, 25)}`, `jb:del:${j.id}`)])) },
  );
}

export async function jobCallback(chatId: number, messageId: number, data: string, from: TgUser, session: Session | null) {
  const [, action, a, b] = data.split(":");
  const id = Number(a);
  const j = Number.isFinite(id) ? getJob(id) : null;
  switch (action) {
    case "home": {
      const v = homeView(chatId);
      return edit(chatId, messageId, v.text, v.markup);
    }
    case "l": {
      const v = listView(Number(a) || 0, isAdmin(from.id));
      return edit(chatId, messageId, v.text, v.markup);
    }
    case "my": {
      const v = myView(chatId);
      return edit(chatId, messageId, v.text, v.markup);
    }
    case "sub": {
      if (isSubscribed(chatId)) db().query("DELETE FROM job_subs WHERE chat_id = ?").run(chatId);
      else db().query("INSERT INTO job_subs (chat_id, last_push, pending) VALUES (?, 0, 0) ON CONFLICT DO NOTHING").run(chatId);
      const v = homeView(chatId);
      return edit(chatId, messageId, (isSubscribed(chatId) ? "🔔 Буду присылать новые задания (с 8 до 22).\n\n" : "🔕 Больше не присылаю.\n\n") + v.text, v.markup);
    }
    case "new": {
      const blocker = postBlocker(chatId, from.username);
      if (blocker) return edit(chatId, messageId, blocker, kb([[btn("← Назад", "jb:home")]]));
      setSession(chatId, { kind: "job", step: "cat", data: {} });
      return edit(chatId, messageId, "Что за задание?", kb([...categories().map(([k, t]) => [btn(t, `jb:cat:${k}`)]), cancelRow]));
    }
    case "cat":
      if (session?.kind !== "job" || session.step !== "cat" || !categories().some(([k]) => k === a)) return;
      setSession(chatId, { kind: "job", step: "text", data: { category: a } });
      return edit(chatId, messageId, ASK.text, kb([cancelRow]));
    case "dl": {
      if (session?.kind !== "job" || session.step !== "deadline" || !DEADLINES.some(([k]) => k === a)) return;
      const d = { ...session.data, deadline: deadlineMs(a) };
      setSession(chatId, { kind: "job", step: "confirm", data: d });
      const preview = jobCard({ ...(d as any), username: from.username ?? "username", chat_id: chatId });
      return edit(chatId, messageId, `👀 <b>Так увидят задание другие:</b>\n\n${preview}`, kb([[btn("✅ Опубликовать", "jb:pub")], cancelRow]));
    }
    case "pub":
      if (session?.kind !== "job" || session.step !== "confirm") return;
      await tg("editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }).catch(() => null);
      return publish(chatId, session, from);
    case "abort":
      clearSession(chatId);
      return edit(chatId, messageId, "Ок, задание не размещено.", kb([[btn("← К подработке", "jb:home")]]));
    case "take":
      return take(chatId, id, from);
    case "done":
      if (!j || j.chat_id !== chatId || j.status !== "taken") return send(chatId, "Это задание уже закрыто.");
      return finish(j);
    case "back":
      if (!j || j.chat_id !== chatId || j.status !== "taken") return send(chatId, "Это задание уже не в работе.");
      await reopen(j, "client");
      return send(chatId, "🔁 Задание снова в общем списке.");
    case "drop":
      if (!j || j.worker_id !== chatId || j.status !== "taken") return send(chatId, "Это задание уже не за тобой.");
      await reopen(j, "worker");
      return send(chatId, "Ок, ты отказался от задания.");
    case "cancel":
      if (!j || j.chat_id !== chatId || (j.status !== "open" && j.status !== "taken")) return;
      closeJob(j.id, "cancelled");
      if (j.worker_id && j.status === "taken") await send(j.worker_id, `ℹ️ Заказчик снял задание «${esc(j.text.slice(0, 60))}».`);
      {
        const v = myView(chatId);
        return edit(chatId, messageId, "🗑 Задание снято.\n\n" + v.text, v.markup);
      }
    case "rate":
      if (!j) return;
      return edit(chatId, messageId, rate(chatId, j, Number(b)) ? "Спасибо за оценку!" : "Оценка уже стоит.");
    case "re":
      if (!j || j.chat_id !== chatId || j.status !== "expired") return;
      if (postBlocker(chatId, from.username)) return send(chatId, postBlocker(chatId, from.username)!);
      db().query("UPDATE jobs SET status = 'open', deadline = ?, closed_at = NULL, created_at = ? WHERE id = ?").run(Date.now() + DAY, Date.now(), j.id);
      await send(chatId, "🔁 Задание снова в списке на сутки.");
      return pushToSubscribers(getJob(j.id)!);
    case "rep": {
      if (!j || j.status !== "open") return send(chatId, "Это задание уже снято.");
      const fresh = db().query("INSERT INTO job_reports (job_id, chat_id) VALUES (?, ?) ON CONFLICT DO NOTHING").run(id, chatId).changes > 0;
      if (fresh) for (const admin of config.adminIds) await send(admin, `⚠️ <b>Жалоба на задание #${id}</b>\n\n${jobCard(j)}`, { reply_markup: adminMarkup(id) });
      return send(chatId, "Спасибо, жалоба отправлена модератору.");
    }
    case "del":
    case "ban":
      if (!isAdmin(from.id)) return;
      return moderate(chatId, messageId, id, action === "ban");
  }
}

// ---------- сроки и сводки ----------
export async function jobsTick(minutes: number) {
  if (!pushHours(minutes)) return;
  const now = Date.now();
  // Никто не взял к сроку — скрываем.
  for (const j of db().query<Job, [number]>("SELECT * FROM jobs WHERE status = 'open' AND deadline <= ?").all(now)) {
    closeJob(j.id, "expired");
    await send(j.chat_id, `⌛️ Задание «${esc(j.text.slice(0, 60))}» никто не взял к сроку — я его скрыл.`, { reply_markup: kb([[btn("🔁 Разместить снова на сутки", `jb:re:${j.id}`)]]) });
  }
  // Взяли, но не закрыли: через сутки спрашиваем, через двое — закрываем.
  for (const j of db().query<Job, [number]>("SELECT * FROM jobs WHERE status = 'taken' AND remind_stage = 0 AND taken_at <= ?").all(now - DAY)) {
    db().query("UPDATE jobs SET remind_stage = 1 WHERE id = ?").run(j.id);
    await send(j.chat_id, `❓ Задание «${esc(j.text.slice(0, 60))}» выполнено? Если не отметить, через сутки закроется само.`, {
      reply_markup: kb([[btn("✅ Выполнено", `jb:done:${j.id}`), btn("🔁 Вернуть в список", `jb:back:${j.id}`)]]),
    });
  }
  for (const j of db().query<Job, [number]>("SELECT * FROM jobs WHERE status = 'taken' AND taken_at <= ?").all(now - 2 * DAY)) await finish(j, true);
  // Сводка тем, кому не отправили из-за паузы или ночи.
  const due = db().query<{ chat_id: number; pending: number }, [number]>("SELECT chat_id, pending FROM job_subs WHERE pending > 0 AND last_push <= ?").all(now - PUSH_GAP);
  for (const s of due) {
    const open = openJobs().filter((j) => j.chat_id !== s.chat_id).length;
    db().query("UPDATE job_subs SET pending = 0, last_push = ? WHERE chat_id = ?").run(now, s.chat_id);
    if (open) await send(s.chat_id, `🔔 Новых заданий: ${s.pending}. Сейчас свободно: ${open}.`, { reply_markup: kb([[btn("🔍 Смотреть", "jb:l:0")]]) });
  }
}
