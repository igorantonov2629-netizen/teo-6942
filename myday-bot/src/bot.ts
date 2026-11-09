import { isAdmin } from "./config";
import { clearSession, ensureUser, getDb, getSession, getUser } from "./db";
import { handleMenuText, parseMenu, saveDutyList, startDuties, startMenu, dutyCallback } from "./admin-menu";
import { adCallback, adClick, adMessage, annCallback, annMessage, listAds, startAd, startAnnouncement, stopAd } from "./admin-post";
import { startSub, subCallback, subText } from "./admin-sub";
import { markBack, markSick, sickList } from "./admin-sick";
import { esc } from "./messages";
import { orderCallback, orderText, startOrder } from "./order";
import { BUTTONS, mainKeyboard, registrationCallback, scheduleCallback, settingsCallback, startRegistration, studentCommand } from "./student";
import { answer, edit, send } from "./telegram";
import type { TgCallback, TgMessage, TgUpdate } from "./types";

const ADMIN_COMMANDS: Record<string, (chatId: number, rest: string) => Promise<unknown>> = {
  "/меню": startMenu,
  "/setmenu": startMenu,
  "/дежурные": startDuties,
  "/duties": startDuties,
  "/замена": (id) => startSub(id),
  "/sub": (id) => startSub(id),
  "/объявление": (id) => startAnnouncement(id),
  "/announce": (id) => startAnnouncement(id),
  "/реклама": (id) => startAd(id),
  "/ad": (id) => startAd(id),
  "/ads": (id) => listAds(id),
  "/болеет": markSick,
  "/sick": markSick,
  "/вышел": markBack,
  "/back": markBack,
  "/болеют": (id) => sickList(id),
  "/статистика": (id) => sendStats(id),
  "/stats": (id) => sendStats(id),
  "/админ": (id) => adminHelp(id),
  "/admin": (id) => adminHelp(id),
};

const adminHelp = (chatId: number) =>
  send(
    chatId,
    [
      "🛠 <b>Админ-панель</b>",
      "/меню (/setmenu) — отправить или исправить меню на день",
      "/дежурные (/duties) — список дежурных на месяц",
      "/замена (/sub) — замена или отмена пары",
      "/болеет Фамилия (/sick) — преподаватель заболел, /вышел Фамилия (/back) — вышел, /болеют — список",
      "/объявление (/announce) — объявление",
      "/реклама (/ad) — запланировать рекламный пост, /ads — список",
      "/статистика (/stats) — пользователи и охват рекламы",
      "/cancel — прервать текущий диалог",
    ].join("\n"),
  );

/** Только агрегированные числа — без chat_id и прочих персональных данных. */
export function statsText() {
  const db = getDb();
  const one = (sql: string) => db.query<{ n: number }, []>(sql).get()!.n;
  const groups = db
    .query<{ grp: string; n: number }, []>("SELECT grp, COUNT(*) AS n FROM users WHERE grp IS NOT NULL AND blocked = 0 GROUP BY grp ORDER BY grp")
    .all();
  const ads = db
    .query<{ id: number; text: string; sent: number; clicks: number }, []>(
      `SELECT a.id, a.text,
        (SELECT COUNT(*) FROM ad_deliveries d WHERE d.ad_id = a.id) AS sent,
        (SELECT COUNT(*) FROM ad_clicks c WHERE c.ad_id = a.id) AS clicks
       FROM ads a ORDER BY a.id DESC LIMIT 10`,
    )
    .all();
  return [
    "📊 <b>Статистика</b>",
    `Курсантов с группой: <b>${one("SELECT COUNT(*) AS n FROM users WHERE grp IS NOT NULL AND blocked = 0")}</b>`,
    `1 курс: ${one("SELECT COUNT(*) AS n FROM users WHERE course = 1 AND blocked = 0")} · 2 курс: ${one("SELECT COUNT(*) AS n FROM users WHERE course = 2 AND blocked = 0")}`,
    `Уведомления выключены: ${one("SELECT COUNT(*) AS n FROM users WHERE notify = 0 AND blocked = 0")}`,
    `Заблокировали бота: ${one("SELECT COUNT(*) AS n FROM users WHERE blocked = 1")}`,
    "",
    "<b>По группам:</b>",
    groups.length ? groups.map((g) => `${g.grp}: ${g.n}`).join(" · ") : "пока никого",
    "",
    "<b>Реклама (последние 10):</b>",
    ...(ads.length
      ? ads.map((a) => `#${a.id} «${esc(a.text.slice(0, 30))}» — получили ${a.sent}, нажали ${a.clicks}${a.sent ? ` (${Math.round((a.clicks / a.sent) * 100)}%)` : ""}`)
      : ["нет"]),
  ].join("\n");
}

const sendStats = (chatId: number) => send(chatId, statsText());

export async function handleUpdate(u: TgUpdate) {
  if (u.callback_query) return handleCallback(u.callback_query);
  if (u.message) return handleMessage(u.message);
}

async function handleMessage(m: TgMessage) {
  // Бот работает только в личных сообщениях.
  if (m.chat.type !== "private" || !m.from || m.from.is_bot) return;
  const chatId = m.chat.id;
  const admin = isAdmin(m.from.id);
  const text = (m.text || "").trim();
  const cmd = text.startsWith("/") ? text.split(/[\s@]/)[0].toLowerCase() : "";
  const rest = cmd ? text.slice(text.indexOf(cmd) + cmd.length).replace(/^@\S+/, "") : "";
  const user = ensureUser(chatId);

  if (cmd === "/cancel" || text === "Отмена") {
    clearSession(chatId);
    return send(chatId, "Ок, отменено.", { reply_markup: mainKeyboard });
  }
  if (cmd === "/start") {
    clearSession(chatId);
    if (!user.grp) return startRegistration(chatId);
    return send(chatId, `С возвращением! Твоя группа — <b>${user.grp}</b>.\nСменить группу можно в «Настройках».`, { reply_markup: mainKeyboard });
  }
  if (admin && ADMIN_COMMANDS[cmd]) {
    clearSession(chatId);
    return ADMIN_COMMANDS[cmd](chatId, rest);
  }
  if (cmd || Object.values(BUTTONS).includes(text) || ["📅 Сегодня", "➡️ Завтра", "🗓 Неделя"].includes(text)) {
    clearSession(chatId);
    if (text === BUTTONS.order || cmd === "/order") return startOrder(chatId, user);
    if (await studentCommand(chatId, text, user)) return;
    return send(chatId, "Не знаю такой команды. Пользуйся кнопками внизу или /help.", { reply_markup: mainKeyboard });
  }

  const session = getSession(chatId);
  if (session?.kind === "order") return orderText(chatId, text, session);
  if (admin && session) {
    if (session.kind === "admin_menu") return handleMenuText(chatId, text);
    if (session.kind === "admin_duty" && session.step === "list") return saveDutyList(chatId, String(session.data.month), text, (session.data.dutyKind as "mik" | "mgu") || "mik");
    if (session.kind === "admin_sub") return subText(chatId, text, session);
    if (session.kind === "admin_ann" && session.step === "content") return annMessage(chatId, m, session);
    if (session.kind === "admin_ad") return adMessage(chatId, m, session);
    return send(chatId, "Используй кнопки выше или /cancel.");
  }
  // Админ может просто прислать меню без команды.
  if (admin && parseMenu(text)) return handleMenuText(chatId, text);
  if (!user.grp) return startRegistration(chatId);
  return send(chatId, "Пользуйся кнопками внизу 👇", { reply_markup: mainKeyboard });
}

async function handleCallback(q: TgCallback) {
  const chatId = q.message?.chat.id;
  const messageId = q.message?.message_id;
  const data = q.data || "";
  if (!chatId || !messageId || q.message?.chat.type !== "private" || q.from.is_bot) return answer(q.id);
  await answer(q.id);
  const prefix = data.split(":")[0];
  const user = ensureUser(chatId);

  if (prefix === "reg") return registrationCallback(chatId, messageId, data);
  if (prefix === "set") return settingsCallback(chatId, messageId, data);
  if (prefix === "sch") return scheduleCallback(chatId, messageId, data, user);
  if (prefix === "ord") return orderCallback(chatId, messageId, data, getUser(chatId) ?? user, getSession(chatId));
  if (prefix === "adc") return adClick(chatId, Number(data.split(":")[1]));
  if (prefix === "noop") return;

  // Всё остальное — только для админа.
  if (!isAdmin(q.from.id)) return;
  const session = getSession(chatId);
  if (prefix === "duty") return dutyCallback(chatId, messageId, data, session);
  if (prefix === "sub") return subCallback(chatId, messageId, data, session);
  if (prefix === "ann") return annCallback(chatId, messageId, data, session);
  if (prefix === "ad") return adCallback(chatId, messageId, data, session);
  if (prefix === "adstop") {
    stopAd(Number(data.split(":")[1]));
    return edit(chatId, messageId, "⛔️ Реклама остановлена.");
  }
}
