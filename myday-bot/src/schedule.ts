import { config } from "./config";
import { getOverrides, type Override } from "./db";
import { LESSONS, TIMETABLE, COURSES, type Lesson } from "./schedule-data";
import { daysBetween, dowOf, hm, mondayOf } from "./time";

export const PAIRS = [
  { n: 1, start: hm("9:00"), end: hm("10:30") },
  { n: 2, start: hm("10:40"), end: hm("12:10") },
  { n: 3, start: hm("12:20"), end: hm("13:30") },
  { n: 4, start: hm("15:00"), end: hm("16:30") },
];

export type Meal = "breakfast" | "lunch" | "dinner";
export const MEALS: { key: Meal; title: string; emoji: string }[] = [
  { key: "breakfast", title: "Завтрак", emoji: "🍳" },
  { key: "lunch", title: "Обед", emoji: "🍲" },
  { key: "dinner", title: "Ужин", emoji: "🍽" },
];

/** Время приёма пищи (минуты). Пн–Сб / Вс. */
export function mealTime(meal: Meal, dow: number) {
  const sun = dow === 6;
  return hm({ breakfast: sun ? "8:30" : "7:30", lunch: sun ? "12:40" : "13:30", dinner: "17:30" }[meal]);
}

export const ALL_GROUPS = [...COURSES[1], ...COURSES[2]];
export const courseOf = (grp: string) => (COURSES[1].includes(grp) ? 1 : COURSES[2].includes(grp) ? 2 : null);

export type WeekType = "upper" | "lower";

export function weekType(date: string): WeekType {
  const weeks = Math.round(daysBetween(mondayOf(config.upperWeekStart), mondayOf(date)) / 7);
  return ((weeks % 2) + 2) % 2 === 0 ? "upper" : "lower";
}

export const weekLabel = (w: WeekType) => (w === "upper" ? "верхняя неделя" : "нижняя неделя");

/** Разбор одной ячейки таблицы с учётом недели. */
export function resolveCell(cell: string, week: WeekType): Lesson | null {
  const [up, down = up] = cell.split("/");
  const code = week === "upper" ? up : down;
  if (code === "X") return null;
  const lesson = LESSONS[code];
  if (!lesson) throw new Error(`Неизвестный код занятия: ${code}`);
  return lesson;
}

/** Расписание без замен. Индекс 0 = 1 пара. Воскресенье — пустой массив. */
export function baseDay(grp: string, date: string): (Lesson | null)[] {
  const dow = dowOf(date);
  const days = TIMETABLE[grp];
  if (!days || dow > 5) return [];
  const week = weekType(date);
  return days[dow].map((c) => resolveCell(c, week));
}

export type DayPair = {
  n: number;
  lesson: Lesson | null;
  change?: { kind: "cancel" | "replace"; was: Lesson | null };
};

/** Расписание дня с заменами и отменами. */
export function dayPairs(grp: string, date: string, overrides: Override[] = getOverrides(grp, date)): DayPair[] {
  const base = baseDay(grp, date);
  const result: DayPair[] = PAIRS.map((p, i) => ({ n: p.n, lesson: base[i] ?? null }));
  if (dowOf(date) === 6) return result.map((p) => ({ ...p, lesson: null }));
  for (const o of overrides) {
    const p = result[o.pair - 1];
    if (!p) continue;
    const was = p.lesson;
    if (o.kind === "cancel") p.lesson = null;
    else p.lesson = { subject: o.subject || "Занятие", room: o.room || undefined, teacher: o.teacher || undefined };
    p.change = { kind: o.kind, was };
  }
  return result;
}

export const isPhysEd = (l: Lesson) => /физ(ическая)?\s*культ|физкульт/i.test(l.subject);

/** "511/8" → "каб. 511, корпус 8"; физкультура → «Место уточни у старшины». */
export function place(l: Lesson): string {
  if (isPhysEd(l)) return "Место уточни у старшины";
  if (!l.room) return "";
  const m = l.room.match(/^\s*([^/]+?)\s*\/\s*(\S+)\s*$/);
  return m ? `каб. ${m[1]}, корпус ${m[2]}` : `каб. ${l.room}`;
}

/** Все предметы группы (для заказа конспекта). */
export function groupSubjects(grp: string): string[] {
  const set = new Set<string>();
  for (const day of TIMETABLE[grp] || [])
    for (const cell of day)
      for (const code of cell.split("/")) if (code !== "X" && LESSONS[code]) set.add(LESSONS[code].subject);
  return [...set];
}
