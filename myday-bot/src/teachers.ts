import { clearSession, setSession } from "./db";
import { esc, sickPhrase, sickTeacher, surnameKey } from "./messages";
import { ALL_GROUPS, dayPairs, PAIRS, place } from "./schedule";
import { LESSONS, type Lesson } from "./schedule-data";
import { btn, edit, grid, kb, send } from "./telegram";
import { addDays, dowOf, fmtHM, localNow, mondayOf, ruDate, ruDayDate, WEEKDAYS, type LocalNow } from "./time";

/** Все преподаватели из расписания, по алфавиту. Индекс в этом списке — id в кнопках. */
export const TEACHERS: string[] = [...new Set(Object.values(LESSONS).map((l) => l.teacher).filter((t): t is string => !!t))].sort((a, b) =>
  a.localeCompare(b, "ru"),
);

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").trim();

/** Поиск по фамилии или её началу: «малыш» → [«Малышев С.А.»]. */
export function searchTeachers(query: string): string[] {
  const q = norm(query).split(/\s+/)[0];
  if (q.length < 2) return [];
  const exact = TEACHERS.filter((t) => surnameKey(t) === q);
  return exact.length ? exact : TEACHERS.filter((t) => surnameKey(t).startsWith(q));
}

/** Пара принадлежит преподавателю: точное имя, или та же фамилия, если она в расписании одна (замены пишут как попало). */
function teaches(l: Lesson | null, name: string) {
  if (!l?.teacher) return false;
  if (l.teacher === name) return true;
  const key = surnameKey(name);
  return surnameKey(l.teacher) === key && TEACHERS.filter((t) => surnameKey(t) === key).length === 1;
}

type Slot = { n: number; lesson: Lesson; groups: string[] };

/** Пары преподавателя в этот день (с учётом замен), одинаковые пары у нескольких групп объединены. */
export function teacherDay(name: string, date: string): Slot[] {
  const slots: Slot[] = [];
  for (const g of ALL_GROUPS)
    for (const p of dayPairs(g, date)) {
      if (!p.lesson || !teaches(p.lesson, name)) continue;
      const same = slots.find((s) => s.n === p.n && s.lesson.subject === p.lesson!.subject && s.lesson.room === p.lesson!.room);
      if (same) same.groups.push(g);
      else slots.push({ n: p.n, lesson: p.lesson, groups: [g] });
    }
  return slots.sort((a, b) => a.n - b.n);
}

const pairTime = (n: number) => `${fmtHM(PAIRS[n - 1].start)}–${fmtHM(PAIRS[n - 1].end)}`;
const slotLine = (s: Slot) => {
  const where = place(s.lesson);
  return `<b>${s.n} пара</b> ${pairTime(s.n)} · ${s.groups.join(", ")}\n      ${esc(s.lesson.subject)}${where ? `\n      ${esc(where)}` : ""}`;
};

/** Где преподаватель прямо сейчас. */
function nowLine(name: string, now: LocalNow) {
  const today = teacherDay(name, now.date);
  const cur = today.find((s) => now.minutes >= PAIRS[s.n - 1].start && now.minutes < PAIRS[s.n - 1].end);
  if (cur) return `🟢 Сейчас: ${cur.n} пара у ${cur.groups.join(", ")}${place(cur.lesson) ? ` — ${esc(place(cur.lesson))}` : ""}`;
  const next = today.find((s) => PAIRS[s.n - 1].start > now.minutes);
  if (next) return `⏭ Следующая: ${next.n} пара в ${fmtHM(PAIRS[next.n - 1].start)}${place(next.lesson) ? ` — ${esc(place(next.lesson))}` : ""}`;
  return today.length ? "⚪️ Сегодня пар больше нет" : "⚪️ Сегодня пар нет";
}

export type TeacherTab = "today" | "tom" | "week";

export function teacherText(name: string, tab: TeacherTab, now: LocalNow = localNow()) {
  const sick = sickTeacher({ subject: "", teacher: name });
  const head = [`👨‍🏫 <b>${esc(name)}</b>`, ...(sick ? [`🤒 <i>${esc(sickPhrase(sick))}</i>`] : [])];
  if (tab === "week") {
    const monday = dowOf(now.date) === 6 ? addDays(now.date, 1) : mondayOf(now.date);
    const out = [...head, `🗓 Неделя ${ruDate(monday)} – ${ruDate(addDays(monday, 5))}`];
    for (let i = 0; i < 6; i++) {
      const slots = teacherDay(name, addDays(monday, i));
      out.push("", `<b>${WEEKDAYS[i]}</b>`, ...(slots.length ? slots.map((s) => `  ${s.n}. ${s.groups.join(", ")} — ${esc(place(s.lesson) || s.lesson.subject)}`) : ["  пар нет"]));
    }
    return out.join("\n");
  }
  const date = tab === "tom" ? addDays(now.date, 1) : now.date;
  const slots = teacherDay(name, date);
  return [
    ...head,
    ...(tab === "today" ? [nowLine(name, now)] : []),
    "",
    `📅 <b>${tab === "tom" ? "Завтра" : "Сегодня"}, ${ruDayDate(date)}</b>`,
    ...(slots.length ? slots.map(slotLine) : ["Пар нет"]),
  ].join("\n");
}

const TABS: [TeacherTab, string][] = [
  ["today", "Сегодня"],
  ["tom", "Завтра"],
  ["week", "Неделя"],
];
const tabsMarkup = (id: number, active: TeacherTab) =>
  kb([TABS.map(([k, t]) => btn(k === active ? `• ${t} •` : t, `tch:${id}:${k}`)), [btn("🔍 Другой преподаватель", "tch:find")]]);

const PROMPT = "👨‍🏫 <b>Преподаватели</b>\nНапиши фамилию (можно начало), и я покажу, где преподаватель сейчас и его пары на сегодня, завтра и неделю.";

export async function startTeacherSearch(chatId: number) {
  setSession(chatId, { kind: "teacher", step: "query", data: {} });
  await send(chatId, PROMPT);
}

export async function teacherQuery(chatId: number, text: string) {
  const found = searchTeachers(text);
  if (!found.length) return send(chatId, "Не нашёл такого преподавателя в расписании. Попробуй ещё раз — только фамилию, например: <i>Малышев</i>");
  clearSession(chatId);
  if (found.length === 1) {
    const id = TEACHERS.indexOf(found[0]);
    return send(chatId, teacherText(found[0], "today"), { reply_markup: tabsMarkup(id, "today") });
  }
  return send(chatId, "Нашлось несколько, выбери:", { reply_markup: kb(grid(found.slice(0, 20).map((t) => btn(t, `tch:${TEACHERS.indexOf(t)}:today`)), 2)) });
}

export async function teacherCallback(chatId: number, messageId: number, data: string) {
  const [, id, tab] = data.split(":");
  if (id === "find") {
    setSession(chatId, { kind: "teacher", step: "query", data: {} });
    return send(chatId, PROMPT);
  }
  const name = TEACHERS[Number(id)];
  if (!name || !TABS.some(([k]) => k === tab)) return;
  await edit(chatId, messageId, teacherText(name, tab as TeacherTab), tabsMarkup(Number(id), tab as TeacherTab));
}
