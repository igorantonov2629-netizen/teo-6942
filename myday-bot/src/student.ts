import { config } from "./config";
import { clearSession, ensureUser, getUser, setNotify, setUserGroup, type User } from "./db";
import { dutyText, menuText, todayText, tomorrowText, weekText } from "./messages";
import { showMarket } from "./market";
import { startTeacherSearch } from "./teachers";
import { COURSES } from "./schedule-data";
import { courseOf } from "./schedule";
import { btn, edit, grid, kb, send } from "./telegram";
import { addDays, localNow } from "./time";

export const BUTTONS = {
  schedule: "📅 Расписание",
  menu: "🍽 Меню",
  duty: "🎖 Дежурный",
  order: "📝 Заказать конспект",
  settings: "⚙️ Настройки",
  support: "🆘 Поддержка",
  market: "🛒 Барахолка",
  teachers: "👨‍🏫 Преподаватели",
};

export const mainKeyboard = {
  keyboard: [
    [{ text: BUTTONS.schedule }, { text: BUTTONS.menu }],
    [{ text: BUTTONS.duty }, { text: BUTTONS.teachers }],
    [{ text: BUTTONS.market }, { text: BUTTONS.order }],
    [{ text: BUTTONS.settings }, { text: BUTTONS.support }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

/** Старые кнопки клавиатуры (у кого она ещё не обновилась). */
const LEGACY = { today: "📅 Сегодня", tomorrow: "➡️ Завтра", week: "🗓 Неделя" };

type Tab = "today" | "tom" | "week";
const TABS: [Tab, string][] = [
  ["today", "Сегодня"],
  ["tom", "Завтра"],
  ["week", "Неделя"],
];
const scheduleTabs = (active: Tab) => kb([TABS.map(([k, t]) => btn(k === active ? `• ${t} •` : t, `sch:${k}`))]);

function scheduleView(grp: string, tab: Tab) {
  const today = localNow().date;
  if (tab === "tom") return tomorrowText(grp, addDays(today, 1));
  if (tab === "week") return weekText(grp, today);
  return todayText(grp, today);
}

/** Вкладка «Расписание»: сразу показывает сегодня, кнопками — завтра и неделя. */
export async function showSchedule(chatId: number, grp: string, tab: Tab = "today") {
  await send(chatId, scheduleView(grp, tab), { reply_markup: scheduleTabs(tab) });
}

export async function scheduleCallback(chatId: number, messageId: number, data: string, user: User) {
  const tab = data.split(":")[1] as Tab;
  if (!user.grp || !TABS.some(([k]) => k === tab)) return;
  await edit(chatId, messageId, scheduleView(user.grp, tab), scheduleTabs(tab));
}

const courseKeyboard = (prefix: string) => kb([[btn("1 курс", `${prefix}:1`), btn("2 курс", `${prefix}:2`)]]);

const groupKeyboard = (course: 1 | 2) =>
  kb([...grid(COURSES[course].map((g) => btn(g, `reg:g:${g}`)), 3), [btn("← Назад", "reg:back")]]);

export async function startRegistration(chatId: number) {
  ensureUser(chatId);
  clearSession(chatId);
  await send(
    chatId,
    "👋 Привет! Я бот <b>«Мой день»</b> для курсантов МИК.\nКаждый день присылаю пары, кабинеты, меню столовой и дежурного.\n\nВыбери свой курс:",
    { reply_markup: courseKeyboard("reg:c") },
  );
}

export async function registrationCallback(chatId: number, messageId: number, data: string) {
  const [, kind, value] = data.split(":");
  if (kind === "back") return edit(chatId, messageId, "Выбери свой курс:", courseKeyboard("reg:c"));
  if (kind === "c" && (value === "1" || value === "2"))
    return edit(chatId, messageId, `${value} курс. Выбери группу:`, groupKeyboard(Number(value) as 1 | 2));
  if (kind === "g") {
    const course = courseOf(value);
    if (!course) return;
    ensureUser(chatId);
    setUserGroup(chatId, course, value);
    await edit(chatId, messageId, `✅ Готово! Твоя группа — <b>${value}</b>.`);
    await send(
      chatId,
      "Теперь каждый день я сам пришлю:\n• в 7:00 — пары, кабинеты, завтрак и дежурного;\n• за 10 минут до пары — где она;\n• перед обедом и ужином — меню;\n• в 19:00 — расписание на завтра.\n\nКнопки внизу работают в любой момент. Сменить группу или выключить уведомления — в «Настройках».",
      { reply_markup: mainKeyboard },
    );
  }
}

function settingsView(u: User) {
  return {
    text: `⚙️ <b>Настройки</b>\nГруппа: <b>${u.grp ?? "не выбрана"}</b>\nУведомления: <b>${u.notify ? "включены" : "выключены"}</b>`,
    markup: kb([
      [btn("Сменить группу", "set:group")],
      [btn(u.notify ? "🔕 Выключить уведомления" : "🔔 Включить уведомления", u.notify ? "set:off" : "set:on")],
    ]),
  };
}

export async function showSettings(chatId: number) {
  const u = getUser(chatId);
  if (!u) return startRegistration(chatId);
  const v = settingsView(u);
  await send(chatId, v.text, { reply_markup: v.markup });
}

export async function settingsCallback(chatId: number, messageId: number, data: string) {
  if (data === "set:group") return edit(chatId, messageId, "Выбери свой курс:", courseKeyboard("reg:c"));
  if (data === "set:on" || data === "set:off") setNotify(chatId, data === "set:on");
  const u = getUser(chatId);
  if (!u) return;
  const v = settingsView(u);
  await edit(chatId, messageId, v.text, v.markup);
}

/** Обработка кнопок главного меню и команд курсанта. Возвращает true, если что-то обработано. */
export async function studentCommand(chatId: number, text: string, user: User): Promise<boolean> {
  const cmd = text.split(/[\s@]/)[0].toLowerCase();
  const now = localNow();
  const needGroup = async () => {
    await send(chatId, "Сначала выбери группу:", { reply_markup: courseKeyboard("reg:c") });
  };
  const is = (button: string, ...cmds: string[]) => text === button || cmds.includes(cmd);

  const tab: Tab | null = is(BUTTONS.schedule, "/schedule", "/расписание") || is(LEGACY.today, "/today", "/сегодня")
    ? "today"
    : is(LEGACY.tomorrow, "/tomorrow", "/завтра")
      ? "tom"
      : is(LEGACY.week, "/week", "/неделя")
        ? "week"
        : null;
  if (tab) {
    if (!user.grp) await needGroup();
    else {
      // старые кнопки — заодно обновим клавиатуру
      if (Object.values(LEGACY).includes(text)) await send(chatId, "Обновил кнопки внизу 👇", { reply_markup: mainKeyboard });
      await showSchedule(chatId, user.grp, tab);
    }
  } else if (is(BUTTONS.menu, "/menu", "/меню")) {
    await send(chatId, menuText(now.date), { reply_markup: mainKeyboard });
  } else if (is(BUTTONS.duty, "/duty", "/дежурный")) {
    await send(chatId, dutyText(now.date), { reply_markup: mainKeyboard });
  } else if (is(BUTTONS.teachers, "/teacher", "/преподаватель")) {
    await startTeacherSearch(chatId);
  } else if (is(BUTTONS.market, "/market", "/барахолка")) {
    await showMarket(chatId);
  } else if (is(BUTTONS.settings, "/settings", "/настройки")) {
    await showSettings(chatId);
  } else if (is(BUTTONS.support, "/support", "/поддержка")) {
    const c = config.supportContact;
    await send(chatId, `🆘 <b>Поддержка</b>\nЕсть вопрос, нашёл ошибку в расписании или бот работает не так? Пиши @${c} — поможем.`, {
      reply_markup: kb([[{ text: `✉️ Написать @${c}`, url: `https://t.me/${c}` }]]),
    });
  } else if (cmd === "/help") {
    await send(
      chatId,
      "Команды:\n/schedule — расписание (сегодня, завтра, неделя)\n/today — пары на сегодня\n/tomorrow — на завтра\n/week — на неделю\n/menu — меню столовой\n/duty — дежурные по МИК и МГУ\n/order — заказать конспект\n/teacher — где преподаватель, его пары\n/market — барахолка\n/settings — группа и уведомления\n/support — поддержка",
      { reply_markup: mainKeyboard },
    );
  } else return false;
  return true;
}
