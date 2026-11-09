import { audienceChatIds, clearSession, getDb, getDuty, getMenu, saveDuties, saveMenu, setSession, type Menu, type Session } from "./db";
import { esc, mealLine } from "./messages";
import { MEALS, mealTime } from "./schedule";
import { broadcast, btn, edit, kb, send } from "./telegram";
import { addDays, daysInMonth, dowOf, hm, localNow, MONTHS_NOM, ruDate, type LocalNow } from "./time";

// ======================= МЕНЮ =======================

/** «Завтрак: …\nОбед: …\nУжин: …». Первая строка «завтра» — меню на завтра. */
export function parseMenu(text: string): { menu: Menu; tomorrow: boolean } | null {
  const menu: Menu = { breakfast: null, lunch: null, dinner: null };
  let tomorrow = false;
  let last: keyof Menu | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^завтра:?$/i.test(line)) {
      tomorrow = true;
      continue;
    }
    const m = line.match(/^(завтрак|обед|ужин)\s*[:\-—–]?\s*(.*)$/i);
    if (m) {
      last = ({ завтрак: "breakfast", обед: "lunch", ужин: "dinner" } as const)[m[1].toLowerCase() as "завтрак" | "обед" | "ужин"];
      menu[last] = m[2].trim() || null;
    } else if (last) menu[last] = [menu[last], line].filter(Boolean).join(", ");
  }
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
  const text = [existed ? "🔄 <b>Меню обновлено</b>" : "🍽 <b>Меню на сегодня появилось!</b>", ...left.map((m) => mealLine(m.key, menu, now.dow))].join("\n");
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
  const preview = MEALS.map((m) => mealLine(m.key, parsed.menu, dowOf(date))).join("\n");
  await send(chatId, `✅ Меню на ${ruDate(date)} сохранено.\n${preview}\n\n${res.note}`);
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

export async function startDuties(chatId: number, rest: string) {
  const months = monthChoice(localNow());
  setSession(chatId, { kind: "admin_duty", step: "month", data: { list: rest.trim() } });
  await send(chatId, "На какой месяц загружаем дежурных по МИК?", {
    reply_markup: kb([months.map((x) => btn(`${MONTHS_NOM[x.m - 1]} ${x.y}`, `duty:m:${x.y}-${String(x.m).padStart(2, "0")}`)), [btn("✖️ Отмена", "duty:x")]]),
  });
}

export async function dutyCallback(chatId: number, messageId: number, data: string, session: Session | null) {
  if (data === "duty:x" || !session || session.kind !== "admin_duty") {
    clearSession(chatId);
    return edit(chatId, messageId, "Отменено.");
  }
  const month = data.split(":")[2];
  const list = String(session.data.list || "");
  if (list) {
    await edit(chatId, messageId, `Месяц: ${month}`);
    return saveDutyList(chatId, month, list);
  }
  setSession(chatId, { kind: "admin_duty", step: "list", data: { month } });
  await edit(chatId, messageId, `Месяц: <b>${month}</b>\nПришли список из столбца «Деж. по МИК»:\n\n<code>1 Борт\n2 Ельцов\n3 Семенко\n…</code>`);
}

export async function saveDutyList(chatId: number, month: string, text: string) {
  const items = parseDuties(text);
  if (!items.length) return send(chatId, "Не нашёл строк вида «1 Фамилия». Пришли ещё раз или /cancel.");
  clearSession(chatId);
  const [y, m] = month.split("-").map(Number);
  const total = daysInMonth(y, m);
  const valid = items.filter((i) => i.day <= total);
  saveDuties(valid.map((i) => ({ date: `${month}-${String(i.day).padStart(2, "0")}`, name: i.name })));
  const missing = missingDutyDays(month);
  await send(
    chatId,
    `✅ Сохранено дежурных: ${valid.length} (${MONTHS_NOM[m - 1]} ${y}).` +
      (missing.length ? `\n⚠️ Не указан дежурный на: ${missing.join(", ")}.` : "\nВсе дни месяца заполнены."),
  );
}

export function missingDutyDays(month: string) {
  const [y, m] = month.split("-").map(Number);
  const missing: number[] = [];
  for (let d = 1; d <= daysInMonth(y, m); d++) if (!getDuty(`${month}-${String(d).padStart(2, "0")}`)) missing.push(d);
  return missing;
}

/** Даты из ближайших дней без дежурного (для предупреждения админа). */
export const upcomingMissingDuties = (from: string, days = 3) =>
  Array.from({ length: days }, (_, i) => addDays(from, i)).filter((d) => !getDuty(d));

/** Список на ноябрь 2026 из концепта — загружается, только если месяц ещё пустой. */
const NOVEMBER_2026 =
  "Борт,Ельцов,Семенко,Глушко,Борт,Онучин,Ельцов,Семенко,Чинфуло,Шаршеев,Глушко,Борт,Ельцов,Шаршеев,Онучин,Глушко,Семенко,Шаршеев,Онучин,Глушко,Борт,Ельцов,Семенко,Онучин,Борт,Ельцов,Семенко,Онучин,Глушко,Чинфуло".split(",");

export function seedDuties() {
  const has = getDb().query<{ n: number }, [string]>("SELECT COUNT(*) AS n FROM duties WHERE date LIKE ?").get("2026-11-%")!.n;
  if (!has) saveDuties(NOVEMBER_2026.map((name, i) => ({ date: `2026-11-${String(i + 1).padStart(2, "0")}`, name })));
}

export const menuMissingText = (date: string) => `⚠️ Меню на сегодня (${ruDate(date)}) не отправлено. Отправь его командой /меню.`;
export const dutyMissingText = (dates: string[]) => `⚠️ Не указан дежурный по МИК на: ${dates.map((d) => esc(ruDate(d))).join(", ")}. Загрузи список: /дежурные`;
