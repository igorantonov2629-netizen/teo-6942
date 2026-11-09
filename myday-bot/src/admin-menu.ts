import { audienceChatIds, clearSession, getDb, getDuty, getMenu, saveDuties, saveMenu, setSession, type DutyKind, type Menu, type Session } from "./db";
import { esc, mealLine } from "./messages";
import { MEALS, mealTime } from "./schedule";
import { broadcast, btn, edit, kb, send } from "./telegram";
import { addDays, daysInMonth, dowOf, hm, localNow, MONTHS_NOM, ruDate, type LocalNow } from "./time";

// ======================= МЕНЮ =======================

/** Делит строку на блюда по запятым (кроме запятых в скобках и кавычках). */
export function splitDishes(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if ("(«".includes(ch)) depth++;
    if (")»".includes(ch)) depth = Math.max(0, depth - 1);
    const decimal = ch === "," && /\d/.test(chars[i - 1] ?? "") && /\d/.test(chars[i + 1] ?? ""); // «2,5%»
    if ((ch === "," || ch === ";") && depth === 0 && !decimal) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map(cleanDish).filter(Boolean);
}

/** Убирает граммовку в конце («Борщ 10/25/300», «Яйцо 1шт.») и точку, делает первую букву заглавной. */
export function cleanDish(s: string) {
  const t = s
    .trim()
    .replace(/\s+\d+([.,/]\d+)*\s*(шт\.?|гр?\.?|мл\.?)?$/i, "")
    .replace(/[.\s]+$/, "")
    .trim();
  return t ? t[0].toUpperCase() + t.slice(1) : "";
}

const MEAL_HEAD = /^(завтрак|обед|ужин)(?=\s*([:\-—–]|$))\s*[:\-—–]?\s*(.*)$/i;
const BREAKFAST2 = /^(завтрак\s*2|второй\s+завтрак)\s*(\([^)]*\))?\s*[:\-—–]?\s*(.*)$/i;
const DINNER2 = /^(ужин\s*2|второй\s+ужин)\s*(\([^)]*\))?\s*[:\-—–]?\s*(.*)$/i;
const SNACK = /^полдник\s*(\([^)]*\))?\s*[:\-—–]?\s*(.*)$/i;

/**
 * «Завтрак: …\nОбед: …\nУжин: …» — блюда через запятую или каждое с новой строки.
 * «Завтрак 2 (…)» — подзаголовок в завтраке; блюда второго ужина — в ужин, блюда полдника — просто в обед.
 * Первая строка «завтра» — меню на завтра. Блюда хранятся построчно; строка с «:» в конце — подзаголовок.
 */
export function parseMenu(text: string): { menu: Menu; tomorrow: boolean } | null {
  const items: Record<keyof Menu, string[]> = { breakfast: [], lunch: [], dinner: [] };
  let tomorrow = false;
  let last: keyof Menu | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^завтра:?$/i.test(line)) {
      tomorrow = true;
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(BREAKFAST2))) {
      last = "breakfast";
      items.breakfast.push(`Завтрак 2${m[2] ? ` ${m[2]}` : ""}:`);
      items.breakfast.push(...splitDishes(m[3]));
    } else if ((m = line.match(DINNER2))) {
      last = "dinner"; // второй ужин — просто в общий список ужина
      items.dinner.push(...splitDishes(m[3]));
    } else if ((m = line.match(SNACK))) {
      last = "lunch";
      items.lunch.push(...splitDishes(m[2]));
    } else if ((m = line.match(MEAL_HEAD))) {
      last = ({ завтрак: "breakfast", обед: "lunch", ужин: "dinner" } as const)[m[1].toLowerCase() as "завтрак" | "обед" | "ужин"];
      items[last].push(...splitDishes(m[3]));
    } else if (last) items[last].push(...splitDishes(line));
  }
  const menu: Menu = {
    breakfast: items.breakfast.join("\n") || null,
    lunch: items.lunch.join("\n") || null,
    dinner: items.dinner.join("\n") || null,
  };
  return menu.breakfast || menu.lunch || menu.dinner ? { menu, tomorrow } : null;
}

export const morningAt = (dow: number) => (dow === 6 ? hm("8:00") : hm("7:00"));

/** Сохраняет меню и, если нужно, сразу рассылает оставшиеся приёмы пищи. */
export async function applyMenu(date: string, menu: Menu, now: LocalNow = localNow()) {
  const old = getMenu(date);
  const existed = !!(old && (old.breakfast || old.lunch || old.dinner));
  saveMenu(date, menu);
  if (date !== now.date || now.minutes < morningAt(now.dow)) return { sent: 0, note: "Разошлю вместе с утренним сообщением и перед приёмами пищи." };
  const left = MEALS.filter((m) => menu[m.key] && mealTime(m.key, now.dow) > now.minutes);
  if (!left.length) return { sent: 0, note: "Все приёмы пищи на сегодня уже прошли — рассылки не было." };
  const text = [existed ? "🔄 <b>Меню обновлено</b>" : "🍽 <b>Меню на сегодня появилось!</b>", ...left.map((m) => mealLine(m.key, menu, now.dow))].join("\n\n");
  const sent = await broadcast(audienceChatIds({ type: "all" }), (id) => send(id, text));
  return { sent, note: `Разослано: ${sent}.` };
}

export async function startMenu(chatId: number, rest: string) {
  if (rest.trim()) return handleMenuText(chatId, rest);
  setSession(chatId, { kind: "admin_menu", step: "text", data: {} });
  await send(chatId, "Пришли меню одним сообщением:\n\n<code>Завтрак: каша, омлет, чай\nОбед: борщ, гречка с котлетой, компот\nУжин: макароны, рыба, кисель</code>\n\nЧтобы задать меню на завтра, первой строкой напиши «завтра». /cancel — отмена.");
}

export async function handleMenuText(chatId: number, text: string) {
  const parsed = parseMenu(text);
  if (!parsed) return send(chatId, "Не нашёл строк «Завтрак:», «Обед:», «Ужин:». Попробуй ещё раз или /cancel.");
  clearSession(chatId);
  const now = localNow();
  const date = parsed.tomorrow ? addDays(now.date, 1) : now.date;
  const res = await applyMenu(date, parsed.menu, now);
  const preview = MEALS.map((m) => mealLine(m.key, parsed.menu, dowOf(date))).join("\n\n");
  await send(chatId, `✅ Меню на ${ruDate(date)} сохранено.\n\n${preview}\n\n${res.note}`);
}

// ======================= ДЕЖУРНЫЕ =======================

/** «1 Борт\n2 Ельцов …» → [{day, name}] */
export function parseDuties(text: string) {
  const out: { day: number; name: string }[] = [];
  for (const line of text.split("\n")) {
    const m = line.trim().match(/^(\d{1,2})\s*[.)\-:–—]?\s*(\S.*)$/);
    if (m && Number(m[1]) >= 1 && Number(m[1]) <= 31) out.push({ day: Number(m[1]), name: m[2].trim().slice(0, 60) });
  }
  return out;
}

function monthChoice(now: LocalNow) {
  const [y, m] = now.date.split("-").map(Number);
  const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  return [
    { y, m },
    { y: next.y, m: next.m },
  ];
}

const KIND_LABEL: Record<DutyKind, string> = { mik: "по МИК", mgu: "по МГУ" };

export async function startDuties(chatId: number, rest: string) {
  setSession(chatId, { kind: "admin_duty", step: "kind", data: { list: rest.trim() } });
  await send(chatId, "Какой список дежурных загружаем?", {
    reply_markup: kb([[btn("Дежурный по МИК", "duty:k:mik"), btn("Дежурный по МГУ", "duty:k:mgu")], [btn("✖️ Отмена", "duty:x")]]),
  });
}

export async function dutyCallback(chatId: number, messageId: number, data: string, session: Session | null) {
  if (data === "duty:x" || !session || session.kind !== "admin_duty") {
    clearSession(chatId);
    return edit(chatId, messageId, "Отменено.");
  }
  const [, step, value] = data.split(":");
  if (step === "k" && (value === "mik" || value === "mgu")) {
    setSession(chatId, { ...session, step: "month", data: { ...session.data, dutyKind: value } });
    const months = monthChoice(localNow());
    return edit(chatId, messageId, `Дежурные <b>${KIND_LABEL[value]}</b>. На какой месяц?`, kb([
      months.map((x) => btn(`${MONTHS_NOM[x.m - 1]} ${x.y}`, `duty:m:${x.y}-${String(x.m).padStart(2, "0")}`)),
      [btn("✖️ Отмена", "duty:x")],
    ]));
  }
  if (step !== "m") return;
  const month = value;
  const kind = (session.data.dutyKind as DutyKind) || "mik";
  const list = String(session.data.list || "");
  if (list) {
    await edit(chatId, messageId, `Дежурные ${KIND_LABEL[kind]}, месяц: ${month}`);
    return saveDutyList(chatId, month, list, kind);
  }
  setSession(chatId, { kind: "admin_duty", step: "list", data: { month, dutyKind: kind } });
  await edit(chatId, messageId, `Дежурные <b>${KIND_LABEL[kind]}</b>, месяц <b>${month}</b>.\nПришли список из графика нарядов (столбец «Деж. ${KIND_LABEL[kind].replace("по ", "по ")}»):\n\n<code>1 Борт\n2 Ельцов\n3 Семенко\n…</code>`);
}

export async function saveDutyList(chatId: number, month: string, text: string, kind: DutyKind = "mik") {
  const items = parseDuties(text);
  if (!items.length) return send(chatId, "Не нашёл строк вида «1 Фамилия». Пришли ещё раз или /cancel.");
  clearSession(chatId);
  const [y, m] = month.split("-").map(Number);
  const total = daysInMonth(y, m);
  const valid = items.filter((i) => i.day <= total);
  saveDuties(valid.map((i) => ({ date: `${month}-${String(i.day).padStart(2, "0")}`, name: i.name })), kind);
  const missing = missingDutyDays(month, kind);
  await send(
    chatId,
    `✅ Сохранено дежурных ${KIND_LABEL[kind]}: ${valid.length} (${MONTHS_NOM[m - 1]} ${y}).` +
      (missing.length ? `\n⚠️ Не указан дежурный на: ${missing.join(", ")}.` : "\nВсе дни месяца заполнены."),
  );
}

export function missingDutyDays(month: string, kind: DutyKind = "mik") {
  const [y, m] = month.split("-").map(Number);
  const missing: number[] = [];
  for (let d = 1; d <= daysInMonth(y, m); d++) if (!getDuty(`${month}-${String(d).padStart(2, "0")}`, kind)) missing.push(d);
  return missing;
}

/** Даты из ближайших дней без дежурного (для предупреждения админа). */
export const upcomingMissingDuties = (from: string, days = 3) =>
  Array.from({ length: days }, (_, i) => addDays(from, i)).filter((d) => !getDuty(d));

/** Список на ноябрь 2026 из концепта — загружается, только если месяц ещё пустой. */
const NOVEMBER_2026 =
  "Борт,Ельцов,Семенко,Глушко,Борт,Онучин,Ельцов,Семенко,Чинфуло,Шаршеев,Глушко,Борт,Ельцов,Шаршеев,Онучин,Глушко,Семенко,Шаршеев,Онучин,Глушко,Борт,Ельцов,Семенко,Онучин,Борт,Ельцов,Семенко,Онучин,Глушко,Чинфуло".split(",");

/** Столбец «Деж. по МГУ» из графика нарядов на ноябрь 2026. */
const NOVEMBER_2026_MGU =
  "Грудин,Кайлюнен,Кравцов,Бобров,Евсеенко,Гладченко,Филатов,Бобров,Кравцов,Евсеенко,Гладченко,Грудин,Шубравский,Кравцов,Евсеенко,Бобров,Гладченко,Грудин,Филатов,Евсеенко,Бобров,Шубравский,Кравцов,Грудин,Шубравский,Евсеенко,Бобров,Грудин,Кравцов,Шубравский".split(",");

export function seedDuties() {
  const count = (table: string) => getDb().query<{ n: number }, [string]>(`SELECT COUNT(*) AS n FROM ${table} WHERE date LIKE ?`).get("2026-11-%")!.n;
  const dated = (names: string[]) => names.map((name, i) => ({ date: `2026-11-${String(i + 1).padStart(2, "0")}`, name }));
  if (!count("duties")) saveDuties(dated(NOVEMBER_2026));
  if (!count("duties_mgu")) saveDuties(dated(NOVEMBER_2026_MGU), "mgu");
}

export const menuMissingText = (date: string) => `⚠️ Меню на сегодня (${ruDate(date)}) не отправлено. Отправь его командой /меню.`;
export const dutyMissingText = (dates: string[]) => `⚠️ Не указан дежурный по МИК на: ${dates.map((d) => esc(ruDate(d))).join(", ")}. Загрузи список: /дежурные`;
