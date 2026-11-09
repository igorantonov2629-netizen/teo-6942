import { getDuty, getMenu, listAbsences, type Menu } from "./db";
import { dayPairs, MEALS, mealTime, PAIRS, place, weekLabel, weekType, type DayPair, type Meal } from "./schedule";
import type { Lesson } from "./schedule-data";
import { addDays, dowOf, fmtHM, mondayOf, ruDate, ruDayDate, WEEKDAYS } from "./time";

const NUM = ["0️⃣", "1️⃣", "2️⃣", "3️⃣", "4️⃣"];
export const NO_MENU = "Меню на сегодня пока неизвестно — как появится, сразу оповестим!";

/** Экранирование для parse_mode HTML. */
export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Фамилия преподавателя в нижнем регистре: «Малышев С.А.» → «малышев». */
export const surnameKey = (teacher: string) => teacher.trim().split(/\s+/)[0].toLowerCase().replace(/ё/g, "е");

/** «Малышев С.А. заболел» / «Петрова В.О. заболела». */
export function sickPhrase(name: string) {
  const female = /(ая|а)$/i.test(name.trim().split(/\s+/)[0]);
  return `${name} ${female ? "заболела" : "заболел"}`;
}

/** Если преподаватель пары болеет — его имя из списка, иначе null. */
export function sickTeacher(l: Lesson | null): string | null {
  if (!l?.teacher) return null;
  const key = surnameKey(l.teacher);
  return listAbsences().find((a) => a.key === key)?.name ?? null;
}

export function pairsWord(n: number) {
  if (n === 0) return "пар нет";
  const m10 = n % 10;
  const m100 = n % 100;
  const w = m10 === 1 && m100 !== 11 ? "пара" : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? "пары" : "пар";
  return `${n} ${w}`;
}

const pairTime = (n: number) => `${fmtHM(PAIRS[n - 1].start)}–${fmtHM(PAIRS[n - 1].end)}`;

function lessonDetails(l: Lesson) {
  return [place(l), l.teacher].filter(Boolean).join(" · ");
}

function pairLines(p: DayPair): string[] {
  if (p.change?.kind === "cancel") {
    const was = p.change.was ? ` (${esc(p.change.was.subject)})` : "";
    return [`${NUM[p.n]} <s>${pairTime(p.n)}</s> ❌ пара отменена${was}`];
  }
  if (!p.lesson) return [];
  const mark = p.change?.kind === "replace" ? " ⚠️ <i>замена</i>" : "";
  const details = lessonDetails(p.lesson);
  const sick = sickTeacher(p.lesson);
  return [
    `${NUM[p.n]} ${pairTime(p.n)} <b>${esc(p.lesson.subject)}</b>${mark}`,
    ...(details ? [`      ${esc(details)}`] : []),
    ...(sick ? [`      🤒 <i>${esc(sickPhrase(sick))}</i>`] : []),
  ];
}

/** Блок с парами на день (без заголовка-приветствия). */
export function dayBlock(grp: string, date: string): { text: string; count: number } {
  if (dowOf(date) === 6) return { text: "Воскресенье — пар нет 🎉", count: 0 };
  const pairs = dayPairs(grp, date);
  const count = pairs.filter((p) => p.lesson).length;
  const lines = pairs.flatMap(pairLines);
  const head = `Группа ${grp} · ${weekLabel(weekType(date))} · ${pairsWord(count)}`;
  return { text: lines.length ? `${head}\n\n${lines.join("\n")}` : `${head}\n\nЗанятий нет 🎉`, count };
}

/** Блюда из базы: построчно; старый формат «через запятую» тоже понимаем. */
export function dishList(raw: string): string[] {
  const lines = raw.includes("\n") ? raw.split("\n") : raw.split(/,\s*/);
  return lines.map((s) => s.trim()).filter(Boolean);
}

/** Блок приёма пищи: заголовок со временем и блюда списком. */
export function mealLine(meal: Meal, menu: Menu | null, dow: number) {
  const m = MEALS.find((x) => x.key === meal)!;
  const head = `${m.emoji} <b>${m.title}</b> · ${fmtHM(mealTime(meal, dow))}`;
  const dish = menu?.[meal];
  if (!dish) return `${head}\n${NO_MENU}`;
  const body = dishList(dish).map((d) => (d.endsWith(":") ? `\n<i>${esc(d)}</i>` : `  • ${esc(d)}`));
  return [head, ...body].join("\n");
}

/** Строка(и) дежурных для утреннего сообщения. По МГУ — только если указан. */
export const dutyLine = (date: string) => {
  const mik = getDuty(date, "mik");
  const mgu = getDuty(date, "mgu");
  const lines = [mik ? `🎖 Сегодня заступает: ${esc(mik)}` : "🎖 Дежурный по МИК на сегодня пока не указан"];
  if (mgu) lines.push(`⚓️ Дежурный по МГУ: ${esc(mgu)}`);
  return lines.join("\n");
};

/** Утреннее сообщение (7:00, в воскресенье 8:00). */
export function morningText(grp: string, date: string) {
  const dow = dowOf(date);
  const menu = getMenu(date);
  const { text } = dayBlock(grp, date);
  return [`☀️ <b>Доброе утро! ${ruDayDate(date)}</b>`, text, "", mealLine("breakfast", menu, dow), "", dutyLine(date)].join("\n");
}

/** Кнопка «Сегодня». */
export function todayText(grp: string, date: string) {
  return `📅 <b>Сегодня, ${ruDayDate(date)}</b>\n${dayBlock(grp, date).text}`;
}

/** Кнопка «Завтра» и вечерняя рассылка. */
export function tomorrowText(grp: string, tomorrow: string, evening = false) {
  if (dowOf(tomorrow) === 6) return `🌙 Завтра воскресенье — пар нет. Отдыхай!`;
  const block = dayBlock(grp, tomorrow);
  const title = evening ? `🌙 <b>Расписание на завтра, ${ruDayDate(tomorrow)}</b>` : `📅 <b>Завтра, ${ruDayDate(tomorrow)}</b>`;
  if (evening && block.count === 0 && !block.text.includes("❌")) return `🌙 Завтра (${ruDayDate(tomorrow)}) пар нет. Отдыхай!`;
  return `${title}\n${block.text}`;
}

/** Расписание на неделю. В воскресенье — на следующую неделю. */
export function weekText(grp: string, today: string) {
  const monday = dowOf(today) === 6 ? addDays(today, 1) : mondayOf(today);
  const out = [`🗓 <b>Неделя ${ruDate(monday)} – ${ruDate(addDays(monday, 5))}</b>`, `Группа ${grp} · ${weekLabel(weekType(monday))}`];
  for (let i = 0; i < 6; i++) {
    const date = addDays(monday, i);
    const lines = dayPairs(grp, date).flatMap((p) => {
      if (p.change?.kind === "cancel") return [`  ${p.n}. ❌ отменена`];
      if (!p.lesson) return [];
      const room = place(p.lesson);
      const sick = sickTeacher(p.lesson);
      return [`  ${p.n}. ${esc(p.lesson.subject)}${p.change ? " ⚠️" : ""}${room ? ` — ${esc(room)}` : ""}${sick ? ` · 🤒 ${esc(sickPhrase(sick))}` : ""}`];
    });
    out.push("", `<b>${WEEKDAYS[i]}, ${ruDate(date)}</b>`, ...(lines.length ? lines : ["  пар нет"]));
  }
  return out.join("\n");
}

export function menuText(date: string) {
  const menu = getMenu(date);
  const dow = dowOf(date);
  if (!menu) return `🍽 <b>Меню на ${ruDate(date)}</b>\n${NO_MENU}`;
  return [`🍽 <b>Меню на ${ruDate(date)}</b>`, ...MEALS.map((m) => mealLine(m.key, menu, dow))].join("\n\n");
}

/** Сообщение перед обедом/ужином. */
export function mealReminderText(meal: Meal, date: string) {
  return mealLine(meal, getMenu(date), dowOf(date));
}

export function pairReminderText(p: DayPair) {
  const l = p.lesson!;
  const where = place(l);
  const sick = sickTeacher(l);
  return `⏰ Через 10 минут ${p.n} пара\n<b>${esc(l.subject)}</b>${where ? ` — ${esc(where)}` : ""}${sick ? `\n🤒 ${esc(sickPhrase(sick))}` : ""}`;
}

export const dutyText = (date: string) => {
  const mik = getDuty(date, "mik");
  const mgu = getDuty(date, "mgu");
  return [
    `🎖 <b>Дежурные на ${ruDate(date)}</b>`,
    "",
    `По МИК: ${mik ? `<b>${esc(mik)}</b>` : "пока не указан"}`,
    `По МГУ: ${mgu ? `<b>${esc(mgu)}</b>` : "пока не указан"}`,
  ].join("\n");
};
