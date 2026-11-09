import { beforeEach, describe, expect, test } from "bun:test";

process.env.ADMIN_IDS = "1";
process.env.TIMEZONE = "Asia/Vladivostok";
process.env.UPPER_WEEK_START = "2026-11-09";

const { openDb, closeDb, getDb, getUser, saveOverride, getMenu } = await import("../src/db");
const { setTransport } = await import("../src/telegram");
const { handleUpdate, statsText } = await import("../src/bot");
const { TIMETABLE, LESSONS, COURSES } = await import("../src/schedule-data");
const { weekType, dayPairs, place, groupSubjects } = await import("../src/schedule");
const { morningText, tomorrowText, pairsWord } = await import("../src/messages");
const { parseMenu, applyMenu, parseDuties, seedDuties, missingDutyDays } = await import("../src/admin-menu");
const { orderMessage, orderLink, orderPrice } = await import("../src/order");
const { tick, adDueToday } = await import("../src/scheduler");
const { parseTime, parseDate } = await import("../src/admin-post");
const { hm } = await import("../src/time");

type Call = { method: string; params: Record<string, any> };
let calls: Call[] = [];
let msgId = 100;

beforeEach(() => {
  closeDb();
  openDb(":memory:");
  calls = [];
  setTransport(async (method, params) => {
    calls.push({ method, params });
    return method === "sendMessage" || method === "sendPhoto" ? { message_id: ++msgId } : true;
  });
});

const sent = (chatId?: number) => calls.filter((c) => (c.method === "sendMessage" || c.method === "sendPhoto") && (chatId === undefined || c.params.chat_id === chatId));
const textOf = (c: Call) => String(c.params.text ?? c.params.caption ?? "");
let upd = 1;
const msg = (from: number, text: string) =>
  handleUpdate({ update_id: upd++, message: { message_id: upd, from: { id: from }, chat: { id: from, type: "private" }, text } });
const cb = (from: number, data: string) =>
  handleUpdate({ update_id: upd++, callback_query: { id: String(upd), from: { id: from }, data, message: { message_id: 5, chat: { id: from, type: "private" } } } });

async function register(chatId: number, grp: string) {
  await msg(chatId, "/start");
  await cb(chatId, `reg:c:${COURSES[1].includes(grp) ? 1 : 2}`);
  await cb(chatId, `reg:g:${grp}`);
}

describe("данные расписания", () => {
  test("17 групп, 6 дней, все коды известны", () => {
    const groups = [...COURSES[1], ...COURSES[2]];
    expect(groups.length).toBe(17);
    for (const g of groups) {
      expect(TIMETABLE[g]).toHaveLength(6);
      for (const day of TIMETABLE[g]) {
        expect(day.length).toBeLessThanOrEqual(4);
        for (const cell of day) for (const code of cell.split("/")) expect(code === "X" || !!LESSONS[code]).toBe(true);
      }
    }
  });
  test("у 1 курса в субботу пар нет", () => {
    for (const g of COURSES[1]) expect(dayPairs(g, "2026-11-14").every((p) => !p.lesson)).toBe(true);
  });
});

describe("верхняя/нижняя неделя", () => {
  test("чередование от 9 ноября 2026", () => {
    expect(weekType("2026-11-09")).toBe("upper");
    expect(weekType("2026-11-15")).toBe("upper");
    expect(weekType("2026-11-16")).toBe("lower");
    expect(weekType("2026-11-23")).toBe("upper");
    expect(weekType("2026-11-02")).toBe("lower");
  });
  test("пример из концепта: 501.21, вторник 10 ноября — 3 пары", () => {
    const text = morningText("501.21", "2026-11-10");
    expect(text).toContain("Вторник, 10 ноября");
    expect(text).toContain("Группа 501.21 · верхняя неделя · 3 пары");
    expect(text).toContain("Техническая механика");
    expect(text).toContain("каб. 216, корпус 8 · Полисадина Е.В.");
    expect(text).toContain("Дежурный на сегодня пока не указан");
    expect(dayPairs("501.21", "2026-11-17")[3].lesson?.subject).toBe("Электротехника и электроника");
  });
  test("дежурный и меню в утреннем сообщении", () => {
    seedDuties();
    const text = morningText("501.21", "2026-11-10");
    expect(text).toContain("Сегодня заступает: Шаршеев");
    expect(text).toContain("Завтрак (7:30): меню на сегодня пока неизвестно");
  });
});

describe("форматирование", () => {
  test("кабинеты и физкультура", () => {
    expect(place({ subject: "Математика", room: "210а/9" })).toBe("каб. 210а, корпус 9");
    expect(place({ subject: "Физическая культура", teacher: "Козлова А.В." })).toBe("Место уточни у старшины");
    expect(place({ subject: "Физкультура" })).toBe("Место уточни у старшины");
  });
  test("склонение «пара»", () => {
    expect([1, 2, 3, 4, 0].map(pairsWord)).toEqual(["1 пара", "2 пары", "3 пары", "4 пары", "пар нет"]);
  });
  test("в субботу вечером — завтра пар нет", () => {
    expect(tomorrowText("501.21", "2026-11-15", true)).toContain("пар нет");
    expect(tomorrowText("501.11", "2026-11-14", true)).toContain("пар нет");
  });
});

describe("меню", () => {
  test("разбор сообщения админа", () => {
    const r = parseMenu("Завтрак: каша, омлет, чай\nОбед: борщ, гречка с котлетой, компот\nУжин: макароны, рыба, кисель");
    expect(r?.menu).toEqual({ breakfast: "каша, омлет, чай", lunch: "борщ, гречка с котлетой, компот", dinner: "макароны, рыба, кисель" });
    expect(parseMenu("завтра\nОбед: суп")?.tomorrow).toBe(true);
    expect(parseMenu("привет")).toBeNull();
  });
  test("позднее меню рассылается только с оставшимися приёмами пищи", async () => {
    await register(10, "501.21");
    calls = [];
    const menu = { breakfast: "каша", lunch: "борщ", dinner: "рыба" };
    const r = await applyMenu("2026-11-10", menu, { date: "2026-11-10", dow: 1, minutes: hm("14:00") });
    expect(r.sent).toBe(1);
    const t = textOf(sent(10)[0]);
    expect(t).toContain("Меню на сегодня появилось");
    expect(t).toContain("рыба");
    expect(t).not.toContain("борщ");
    calls = [];
    await applyMenu("2026-11-10", { ...menu, dinner: "плов" }, { date: "2026-11-10", dow: 1, minutes: hm("15:00") });
    expect(textOf(sent(10)[0])).toContain("Меню обновлено");
    expect(getMenu("2026-11-10")?.dinner).toBe("плов");
  });
  test("до утренней рассылки меню сохраняется молча", async () => {
    await register(10, "501.21");
    calls = [];
    const r = await applyMenu("2026-11-10", { breakfast: "каша", lunch: null, dinner: null }, { date: "2026-11-10", dow: 1, minutes: hm("6:50") });
    expect(r.sent).toBe(0);
    expect(sent(10)).toHaveLength(0);
  });
});

describe("дежурные", () => {
  test("разбор списка и пропуски", () => {
    expect(parseDuties("1 Борт\n2 Ельцов\n3. Семенко")).toEqual([
      { day: 1, name: "Борт" },
      { day: 2, name: "Ельцов" },
      { day: 3, name: "Семенко" },
    ]);
    seedDuties();
    expect(missingDutyDays("2026-11")).toEqual([]);
    expect(missingDutyDays("2026-12")).toHaveLength(31);
  });
});

describe("заказ конспекта", () => {
  test("цена и текст как в концепте", () => {
    expect(orderPrice(6, "urgent")).toBe(450);
    expect(orderPrice(6, "normal")).toBe(300);
    const text = orderMessage("501.21", { subject: "Механика", topic: "Сопромат", pages: 6, kind: "urgent" });
    expect(text).toContain("Страниц: 6 · без очереди\nИтого: 450 ₽");
    expect(orderLink(text)).toStartWith("https://t.me/sanekhelper?text=");
  });
  test("полный сценарий через кнопки", async () => {
    await register(20, "502.21");
    await msg(20, "📝 Заказать конспект");
    expect(groupSubjects("502.21")).toContain("Механика");
    const i = groupSubjects("502.21").indexOf("Механика");
    await cb(20, `ord:s:${i}`);
    await msg(20, "Сопромат");
    await cb(20, "ord:p:6");
    calls = [];
    await cb(20, "ord:k:urgent");
    const final = calls.find((c) => c.method === "editMessageText")!;
    expect(final.params.text).toContain("Итого: 450 ₽");
    const url = final.params.reply_markup.inline_keyboard[0][0].url as string;
    expect(decodeURIComponent(url)).toContain("Предмет: Механика");
    // данные заказа не остаются в базе
    expect(getDb().query("SELECT * FROM sessions").all()).toHaveLength(0);
  });
});

describe("рассылки по расписанию", () => {
  test("утро, напоминание о паре и вечер; без дублей", async () => {
    await register(30, "501.21");
    calls = [];
    const day = { date: "2026-11-10", dow: 1 };
    await tick({ ...day, minutes: hm("7:00") });
    await tick({ ...day, minutes: hm("7:01") });
    const morning = sent(30).filter((c) => textOf(c).includes("Доброе утро"));
    expect(morning).toHaveLength(1);
    calls = [];
    await tick({ ...day, minutes: hm("10:30") });
    expect(textOf(sent(30)[0])).toContain("Через 10 минут 2 пара");
    expect(textOf(sent(30)[0])).toContain("каб. 511, корпус 8");
    calls = [];
    await tick({ ...day, minutes: hm("14:50") }); // 4 пары нет на верхней неделе
    expect(sent(30)).toHaveLength(0);
    await tick({ ...day, minutes: hm("19:00") });
    expect(textOf(sent(30)[0])).toContain("Расписание на завтра");
  });
  test("выключенные уведомления — ничего не приходит", async () => {
    await register(31, "501.21");
    await cb(31, "set:off");
    calls = [];
    await tick({ date: "2026-11-10", dow: 1, minutes: hm("7:00") });
    expect(sent(31)).toHaveLength(0);
  });
  test("админу приходит напоминание о меню", async () => {
    await tick({ date: "2026-11-10", dow: 1, minutes: hm("7:00") });
    expect(sent(1).some((c) => textOf(c).includes("Меню на сегодня"))).toBe(true);
  });
});

describe("замены", () => {
  test("замена видна в расписании и в уведомлении группы", async () => {
    await register(40, "501.21");
    saveOverride({ grp: "501.21", date: "2026-11-11", pair: 3, kind: "replace", subject: "Информатика", room: "401", teacher: null });
    const p = dayPairs("501.21", "2026-11-11")[2];
    expect(p.lesson?.subject).toBe("Информатика");
    expect(tomorrowText("501.21", "2026-11-11", true)).toContain("замена");
  });
  test("сценарий админа: отмена пары уведомляет группу", async () => {
    await register(41, "502.22");
    await msg(1, "/замена");
    await cb(1, "sub:g:502.22");
    await cb(1, "sub:d:2026-11-12");
    await cb(1, "sub:p:2");
    calls = [];
    await cb(1, "sub:k:cancel");
    expect(textOf(sent(41)[0])).toContain("2 пара (Инженерная графика) отменена");
  });
});

describe("реклама", () => {
  test("время только с 9 до 21, повторы", () => {
    expect(parseTime("8:59")).toBeNull();
    expect(parseTime("21:00")).toBeNull();
    expect(parseTime("12:30")).toBe("12:30");
    expect(parseDate("15.11", "2026-11-10")).toBe("2026-11-15");
    expect(adDueToday({ start_date: "2026-11-10", repeat: "weekly" }, "2026-11-17")).toBe(true);
    expect(adDueToday({ start_date: "2026-11-10", repeat: "weekly" }, "2026-11-18")).toBe(false);
  });
  test("не больше одной рекламы в день на человека, пометка «Реклама», клики", async () => {
    await register(50, "501.11");
    const ins = getDb().query("INSERT INTO ads (text, erid, button_text, button_url, audience, start_date, time, repeat, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    ins.run("Кофе -20%", "2SDnjXXX", "Подробнее", "https://example.com", JSON.stringify({ type: "all" }), "2026-11-10", "12:00", "daily", 0);
    ins.run("Второй пост", null, null, null, JSON.stringify({ type: "all" }), "2026-11-10", "12:00", "none", 0);
    calls = [];
    await tick({ date: "2026-11-10", dow: 1, minutes: hm("12:00") });
    const ads = sent(50).filter((c) => textOf(c).startsWith("<b>Реклама</b>"));
    expect(ads).toHaveLength(1);
    expect(textOf(ads[0])).toContain("erid: 2SDnjXXX");
    await cb(50, "adc:1");
    await cb(50, "adc:1");
    expect(statsText()).toContain("получили 1, нажали 1 (100%)");
  });
});

describe("приватность", () => {
  test("о курсанте хранится только chat_id, курс, группа и флаги", async () => {
    await register(60, "503.22");
    const cols = getDb().query<{ name: string }, []>("PRAGMA table_info(users)").all().map((c) => c.name);
    expect(cols.sort()).toEqual(["blocked", "chat_id", "course", "created_at", "grp", "notify"]);
    expect(getUser(60)?.grp).toBe("503.22");
  });
  test("не-админ не может пользоваться админ-командами", async () => {
    await register(61, "501.11");
    calls = [];
    for (const c of ["/stats", "/статистика", "/sub", "/ad", "/announce", "/duties"]) await msg(61, c);
    for (const c of sent(61)) {
      expect(textOf(c)).not.toContain("Статистика");
      expect(textOf(c)).not.toContain("Админ");
    }
    await cb(61, "sub:g:501.11");
    await cb(61, "adstop:1");
    expect(calls.filter((c) => c.method === "editMessageText")).toHaveLength(0);
  });
  test("статистика — только агрегаты, без chat_id", async () => {
    await register(987654321, "501.21");
    expect(statsText()).not.toContain("987654321");
  });
  test("групповые чаты игнорируются", async () => {
    await handleUpdate({ update_id: upd++, message: { message_id: 1, from: { id: 70 }, chat: { id: -100, type: "group" }, text: "/today" } });
    expect(calls).toHaveLength(0);
    expect(getUser(70)).toBeNull();
  });
});
