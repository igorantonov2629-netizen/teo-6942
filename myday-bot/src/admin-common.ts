import type { Audience } from "./db";
import { COURSES } from "./schedule-data";
import { btn, grid, kb, type InlineKeyboard } from "./telegram";

export function audienceLabel(a: Audience) {
  if (a.type === "all") return "все курсанты";
  if (a.type === "course") return `${a.course} курс`;
  return `группы ${a.groups.join(", ")}`;
}

export const audienceKeyboard = (prefix: string): InlineKeyboard =>
  kb([
    [btn("Все", `${prefix}:a:all`), btn("1 курс", `${prefix}:a:c1`), btn("2 курс", `${prefix}:a:c2`)],
    [btn("Выбрать группы", `${prefix}:a:pick`)],
    [btn("✖️ Отмена", `${prefix}:x`)],
  ]);

export const groupsPicker = (prefix: string, selected: string[]): InlineKeyboard =>
  kb([
    ...grid(
      [...COURSES[1], ...COURSES[2]].map((g) => btn(`${selected.includes(g) ? "✅ " : ""}${g}`, `${prefix}:t:${g}`)),
      3,
    ),
    [btn("Готово", `${prefix}:a:done`), btn("✖️ Отмена", `${prefix}:x`)],
  ]);

/**
 * Общая обработка выбора аудитории. Возвращает:
 *  - { audience } когда выбор сделан;
 *  - { picking } когда нужно перерисовать выбор групп;
 *  - null если колбэк не про аудиторию.
 */
export function audienceStep(data: string, selected: string[]): { audience?: Audience; picking?: string[] } | null {
  const parts = data.split(":");
  if (parts[1] === "a") {
    const v = parts[2];
    if (v === "all") return { audience: { type: "all" } };
    if (v === "c1" || v === "c2") return { audience: { type: "course", course: Number(v[1]) } };
    if (v === "pick") return { picking: selected };
    if (v === "done") return selected.length ? { audience: { type: "groups", groups: selected } } : { picking: selected };
  }
  if (parts[1] === "t") {
    const g = parts.slice(2).join(":");
    return { picking: selected.includes(g) ? selected.filter((x) => x !== g) : [...selected, g] };
  }
  return null;
}
