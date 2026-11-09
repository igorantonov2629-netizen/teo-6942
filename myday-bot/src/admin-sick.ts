import { addAbsence, listAbsences, removeAbsence } from "./db";
import { esc, sickPhrase, surnameKey } from "./messages";
import { LESSONS, TIMETABLE } from "./schedule-data";
import { send } from "./telegram";

/** Полное имя преподавателя из расписания по фамилии: «малышев» → «Малышев С.А.». */
export function findTeacher(input: string): string | null {
  const key = surnameKey(input);
  if (!key) return null;
  const hit = Object.values(LESSONS).find((l) => l.teacher && surnameKey(l.teacher) === key);
  return hit?.teacher ?? null;
}

/** Группы, у которых есть пары этого преподавателя. */
export function teacherGroups(name: string) {
  const key = surnameKey(name);
  return Object.entries(TIMETABLE)
    .filter(([, days]) => days.some((d) => d.some((cell) => cell.split("/").some((c) => LESSONS[c]?.teacher && surnameKey(LESSONS[c].teacher!) === key))))
    .map(([g]) => g);
}

export async function markSick(chatId: number, rest: string) {
  const input = rest.trim();
  if (!input) return send(chatId, "Напиши фамилию: <code>/болеет Малышев</code>");
  const name = findTeacher(input) ?? input.slice(0, 60);
  addAbsence(surnameKey(name), name);
  const groups = teacherGroups(name);
  await send(
    chatId,
    `🤒 Отмечено: ${esc(sickPhrase(name))}.\nВо всех его парах в расписании, утренних сообщениях и напоминаниях теперь пишется, что преподаватель заболел.` +
      (groups.length ? `\nЗатронутые группы: ${groups.join(", ")}.` : "\n⚠️ В расписании нет преподавателя с такой фамилией.") +
      `\n\nКогда выйдет: <code>/вышел ${esc(name.split(" ")[0])}</code>`,
  );
}

export async function markBack(chatId: number, rest: string) {
  const input = rest.trim();
  if (!input) return send(chatId, "Напиши фамилию: <code>/вышел Малышев</code>");
  const ok = removeAbsence(surnameKey(input));
  await send(chatId, ok ? `✅ ${esc(input)} снова в строю — пометка убрана.` : "Такого преподавателя нет в списке болеющих. /болеют — список.");
}

export async function sickList(chatId: number) {
  const list = listAbsences();
  await send(chatId, list.length ? `🤒 <b>Болеют:</b>\n${list.map((a) => `• ${esc(a.name)}`).join("\n")}` : "Сейчас никто не болеет.");
}
