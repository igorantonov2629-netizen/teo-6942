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
    expect(text).toContain("Дежурный по МИК на сегодня пока не указан");
    expect(dayPairs("501.21", "2026-11-17")[3].lesson?.subject).toBe("Электротехника и электроника");
  });
  test("дежурный и меню в утреннем сообщении", () => {
    seedDuties();
    const text = morningText("501.21", "2026-11-10");
    expect(text).toContain("Сегодня заступает: Шаршеев");
    expect(text).toContain("Завтрак</b> · 7:30\nМеню на сегодня пока неизвестно");
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
    expect(r?.menu).toEqual({ breakfast: "Каша\nОмлет\nЧай", lunch: "Борщ\nГречка с котлетой\nКомпот", dinner: "Макароны\nРыба\nКисель" });
    expect(parseMenu("завтра\nОбед: суп")?.tomorrow).toBe(true);
    expect(parseMenu("привет")).toBeNull();
  });
  test("меню с листа: граммовки убираются, полдник уходит в обед, завтрак 2 — подзаголовок", () => {
    const r = parseMenu("Завтрак\nМасло сливочное 20\nЯйцо вареное 1шт.\nЗавтрак 2 (для несовершеннолетних)\nСок фруктовый 1/200\nОбед\nБорщ с курицей и сметаной 10/25/300\nМандарин 1шт.\nПолдник (для несовершеннолетних)\nПлюшка сдобная с сахаром 1шт.\nУжин\nСалат «Провансаль, оливье» 75")!;
    expect(r.menu.breakfast).toBe("Масло сливочное\nЯйцо вареное\nЗавтрак 2 (для несовершеннолетних):\nСок фруктовый");
    expect(r.menu.lunch).toBe("Борщ с курицей и сметаной\nМандарин\nПлюшка сдобная с сахаром");
    expect(r.menu.dinner).toBe("Салат «Провансаль, оливье»");
    expect(r.menu.lunch).not.toContain("Полдник");
    const r2 = parseMenu("Ужин\nХлеб\nУжин 2\nКисломолочный продукт 2,5% 1/200")!;
    expect(r2.menu.dinner).toBe("Хлеб\nКисломолочный продукт 2,5%");
  });
  test("позднее меню рассылается только с оставшимися приёмами пищи", async () => {
    await register(10, "501.21");
    calls = [];
    const menu = { breakfast: "каша", lunch: "борщ", dinner: "рыба" };
    const r = await applyMenu("2026-11-10", menu, { date: "2026-11-10", dow: 1, minutes: hm("14:00") });
    expect(r.sent).toBe(1);
    const t = textOf(sent(10)[0]);
    expect(t).toContain("Меню на сегодня появилось");
    expect(t).toContain("• рыба");
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
    expect(missingDutyDays("2026-11", "mgu")).toEqual([]);
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
  test("пока выключено — «появится чуть позже»", async () => {
    delete process.env.ORDERS_ENABLED;
    await register(21, "501.11");
    calls = [];
    await msg(21, "📝 Заказать конспект");
    expect(textOf(sent(21)[0])).toContain("пока недоступен — появится чуть позже");
    expect(getDb().query("SELECT * FROM sessions").all()).toHaveLength(0);
  });
  test("полный сценарий через кнопки", async () => {
    process.env.ORDERS_ENABLED = "1";
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

describe("вкладка «Расписание»", () => {
  test("сразу показывает сегодня, кнопки переключают завтра/неделю", async () => {
    await register(90, "501.21");
    calls = [];
    await msg(90, "📅 Расписание");
    const c = sent(90)[0];
    expect(textOf(c)).toContain("Сегодня,");
    const row = c.params.reply_markup.inline_keyboard[0].map((b: any) => b.callback_data);
    expect(row).toEqual(["sch:today", "sch:tom", "sch:week"]);
    calls = [];
    await cb(90, "sch:week");
    const e = calls.find((x) => x.method === "editMessageText")!;
    expect(e.params.text).toContain("Неделя");
    expect(e.params.reply_markup.inline_keyboard[0][2].text).toBe("• Неделя •");
  });
  test("старая кнопка «Сегодня» тоже работает и обновляет клавиатуру", async () => {
    await register(91, "501.21");
    calls = [];
    await msg(91, "📅 Сегодня");
    expect(sent(91).some((c) => textOf(c).includes("Сегодня,"))).toBe(true);
  });
});

describe("дежурные по МИК и МГУ", () => {
  test("кнопка показывает обоих", async () => {
    const { saveDuties } = await import("../src/db");
    const { dutyText } = await import("../src/messages");
    saveDuties([{ date: "2026-11-09", name: "Борт" }], "mik");
    saveDuties([{ date: "2026-11-09", name: "Иванов" }], "mgu");
    const t = dutyText("2026-11-09");
    expect(t).toContain("По МИК: <b>Борт</b>");
    expect(t).toContain("По МГУ: <b>Иванов</b>");
    expect(dutyText("2026-11-10")).toContain("По МГУ: пока не указан");
  });
  test("админ загружает список по МГУ", async () => {
    const { getDuty } = await import("../src/db");
    await msg(1, "/дежурные");
    await cb(1, "duty:k:mgu");
    await cb(1, "duty:m:2026-11");
    await msg(1, "1 Иванов\n2 Петров");
    expect(getDuty("2026-11-02", "mgu")).toBe("Петров");
    expect(getDuty("2026-11-02", "mik")).toBeNull();
  });
});

describe("болеющий преподаватель", () => {
  test("/болеет Малышев — пометка во всех его парах, /вышел — убирает", async () => {
    const { todayText, weekText } = await import("../src/messages");
    await msg(1, "/болеет малышев");
    expect(textOf(sent(1).at(-1)!)).toContain("Малышев С.А. заболел");
    const t = todayText("501.21", "2026-11-10");
    expect(t).toContain("🤒 <i>Малышев С.А. заболел</i>");
    expect(t.match(/заболел/g)).toHaveLength(1); // только у пары Малышева
    expect(weekText("501.23", "2026-11-10")).toContain("🤒 Малышев С.А. заболел");
    await msg(1, "/вышел Малышев");
    expect(todayText("501.21", "2026-11-10")).not.toContain("заболел");
  });
  test("женская фамилия — «заболела»", async () => {
    const { sickPhrase } = await import("../src/messages");
    expect(sickPhrase("Петрова В.О.")).toBe("Петрова В.О. заболела");
  });
});

describe("поддержка", () => {
  test("кнопка «Поддержка» даёт ссылку на @sanekhelper", async () => {
    await register(80, "501.11");
    calls = [];
    await msg(80, "🆘 Поддержка");
    const c = sent(80)[0];
    expect(textOf(c)).toContain("@sanekhelper");
    expect(c.params.reply_markup.inline_keyboard[0][0].url).toBe("https://t.me/sanekhelper");
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

describe("барахолка", () => {
  const cbu = (from: number, data: string, username?: string) =>
    handleUpdate({ update_id: upd++, callback_query: { id: String(upd), from: { id: from, username }, data, message: { message_id: 5, chat: { id: from, type: "private" } } } });
  const photo = (from: number) =>
    handleUpdate({ update_id: upd++, message: { message_id: upd, from: { id: from }, chat: { id: from, type: "private" }, photo: [{ file_id: "PH", width: 1, height: 1 }] } });
  async function post(chatId: number, username = "seller", title = "Китель 48") {
    await cbu(chatId, "mk:new", username);
    await photo(chatId);
    await msg(chatId, title);
    await msg(chatId, "1500 ₽");
    await msg(chatId, "Почти новый, <b>забрать</b> в общаге");
    await cbu(chatId, "mk:cat:form", username);
    await cbu(chatId, "mk:pub", username);
  }
  const listings = () => getDb().query<any, []>("SELECT * FROM listings").all();

  test("кнопка в меню, размещение, админ получает копию с кнопками", async () => {
    await register(50, "501.21");
    calls = [];
    await msg(50, "🛒 Барахолка");
    expect(textOf(sent(50)[0])).toContain("Барахолка");
    await post(50);
    const [l] = listings();
    expect(l).toMatchObject({ chat_id: 50, username: "seller", title: "Китель 48", price: "1500 ₽", category: "form", photo: "PH", status: "active" });
    const toAdmin = sent(1).at(-1)!;
    expect(toAdmin.method).toBe("sendPhoto");
    expect(textOf(toAdmin)).toContain("&lt;b&gt;забрать"); // пользовательский HTML экранируется
    expect(JSON.stringify(toAdmin.params.reply_markup)).toContain(`mk:del:${l.id}`);
  });

  test("без username разместить нельзя", async () => {
    await cbu(51, "mk:new");
    expect(calls.some((c) => String(c.params.text).includes("username"))).toBe(true);
    expect(getDb().query("SELECT * FROM sessions WHERE chat_id = 51").get()).toBeNull();
  });

  test("покупатель видит карточку с кнопкой в личку продавца, может пожаловаться", async () => {
    await post(52, "vasya");
    calls = [];
    await cbu(53, "mk:b:all:0");
    const card = sent(53).at(-1)!;
    expect(JSON.stringify(card.params.reply_markup)).toContain("https://t.me/vasya");
    expect(JSON.stringify(card.params.reply_markup)).not.toContain("mk:del"); // не админ
    const id = listings()[0].id;
    await cbu(53, `mk:rep:${id}`);
    await cbu(53, `mk:rep:${id}`);
    expect(sent(1).filter((c) => textOf(c).includes("Жалоба")).length).toBe(1); // повторная жалоба не дублируется
  });

  test("лимит 3 объявления и пауза 1 минута", async () => {
    await post(54, "a", "Раз");
    await post(54, "a", "Два");
    expect(listings().length).toBe(1); // пауза
    getDb().query("UPDATE listings SET created_at = created_at - 3600000").run();
    await post(54, "a", "Два");
    getDb().query("UPDATE listings SET created_at = created_at - 3600000").run();
    await post(54, "a", "Три");
    getDb().query("UPDATE listings SET created_at = created_at - 3600000").run();
    await post(54, "a", "Четыре");
    expect(listings().length).toBe(3);
  });

  test("продавец закрывает сам; админ удаляет и банит", async () => {
    await post(55, "p");
    const id = listings()[0].id;
    await cbu(56, `mk:sold:${id}`); // чужое — нельзя
    expect(listings()[0].status).toBe("active");
    await cbu(57, `mk:del:${id}`); // не админ
    expect(listings()[0].status).toBe("active");
    await cbu(1, `mk:ban:${id}`);
    expect(listings()[0].status).toBe("removed");
    calls = [];
    await cbu(55, "mk:new", "p");
    expect(calls.some((c) => String(c.params.text).includes("не можешь"))).toBe(true);
  });

  test("истечение срока и напоминание о продлении", async () => {
    const { marketTick } = await import("../src/market");
    await post(58, "q");
    const id = listings()[0].id;
    getDb().query("UPDATE listings SET expires_at = ? WHERE id = ?").run(Date.now() + 3600000, id);
    calls = [];
    await marketTick(hm("3:00")); // ночью не пишем
    expect(sent(58).length).toBe(0);
    await marketTick(hm("12:00"));
    await marketTick(hm("12:01"));
    expect(sent(58).filter((c) => textOf(c).includes("будет снято")).length).toBe(1);
    getDb().query("UPDATE listings SET expires_at = ? WHERE id = ?").run(Date.now() - 1, id);
    await marketTick(hm("12:02"));
    expect(listings()[0].status).toBe("expired");
    await cbu(58, `mk:renew:${id}`, "q");
    expect(listings()[0].status).toBe("active");
  });
});

describe("обратный отсчёт", () => {
  test("админ добавляет событие — оно в утреннем сообщении", async () => {
    const { daysWord } = await import("../src/countdown");
    expect([1, 2, 5, 11, 21, 22, 46].map(daysWord)).toEqual(["1 день", "2 дня", "5 дней", "11 дней", "21 день", "22 дня", "46 дней"]);
    await msg(1, "/отсчёт 28.12.2026 До каникул");
    await msg(77, "/отсчёт 01.01.2027 Взлом"); // не админ
    const text = morningText("501.21", "2026-11-12");
    expect(text).toContain("⏳ До каникул — 46 дней");
    expect(text).not.toContain("Взлом");
    expect(morningText("501.21", "2026-12-28")).toContain("🎉 До каникул — сегодня!");
    expect(morningText("501.21", "2026-12-29")).not.toContain("каникул");
  });
});

describe("преподаватели", () => {
  test("поиск по фамилии, пары по группам, где сейчас", async () => {
    const { searchTeachers, teacherText } = await import("../src/teachers");
    expect(searchTeachers("малыш")).toEqual(["Малышев С.А."]);
    expect(searchTeachers("Мазурик").length).toBe(2);
    // вторник 10.11.2026, 9:30 — идёт 1 пара
    const text = teacherText("Малышев С.А.", "today", { date: "2026-11-10", dow: 1, minutes: hm("9:30") });
    expect(text).toContain("Малышев С.А.");
    expect(text).toMatch(/пара/);
    const week = teacherText("Малышев С.А.", "week", { date: "2026-11-10", dow: 1, minutes: hm("9:30") });
    expect(week).toContain("Понедельник");
    expect(week).toContain("501.");
  });
  test("кнопка → фамилия → карточка с вкладками", async () => {
    await register(60, "501.21");
    calls = [];
    await msg(60, "👨‍🏫 Преподаватели");
    await msg(60, "Малышев");
    const card = sent(60).at(-1)!;
    expect(textOf(card)).toContain("Малышев С.А.");
    expect(JSON.stringify(card.params.reply_markup)).toContain("tch:");
  });
});

describe("резервная копия", () => {
  test("раз в день после 4:05 админу уходит сжатая копия базы, которая открывается", async () => {
    const { Database } = await import("bun:sqlite");
    await register(70, "501.21");
    calls = [];
    await tick({ date: "2026-11-12", dow: 3, minutes: hm("3:00") });
    expect(calls.some((c) => c.method === "sendDocument")).toBe(false);
    await tick({ date: "2026-11-12", dow: 3, minutes: hm("4:05") });
    await tick({ date: "2026-11-12", dow: 3, minutes: hm("4:06") });
    const docs = calls.filter((c) => c.method === "sendDocument");
    expect(docs.length).toBe(1);
    expect(docs[0].params.chat_id).toBe(1);
    const file = docs[0].params.document as File;
    const restored = Database.deserialize(Bun.gunzipSync(new Uint8Array(await file.arrayBuffer())));
    expect(restored.query("SELECT grp FROM users WHERE chat_id = 70").get()).toEqual({ grp: "501.21" });
  });
});

describe("однофамильцы", () => {
  test("/болеет Мазурик просит уточнить, отметка только у нужного", async () => {
    const { sickTeacher } = await import("../src/messages");
    calls = [];
    await msg(1, "/болеет Мазурик");
    expect(textOf(sent(1).at(-1)!)).toContain("несколько");
    await msg(1, "/болеет Мазурик А.В.");
    expect(sickTeacher({ subject: "", teacher: "Мазурик А.В." })).toBe("Мазурик А.В.");
    expect(sickTeacher({ subject: "", teacher: "Мазурик М.А." })).toBeNull();
    await msg(1, "/вышел Мазурик"); // болеет только один — уточнять не нужно
    expect(sickTeacher({ subject: "", teacher: "Мазурик А.В." })).toBeNull();
  });
});
