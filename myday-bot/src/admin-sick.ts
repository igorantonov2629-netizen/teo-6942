import { addAbsence, listAbsences, removeAbsence } from "./db";
import { esc, fullKey, sickPhrase, surnameKey } from "./messages";
import { LESSONS, TIMETABLE } from "./schedule-data";
import { send } from "./telegram";

const ALL_TEACHERS = [...new Set(Object.values(LESSONS).map((l) => l.teacher).filter((t): t is string => !!t))];

/** Преподаватели из расписания по фамилии или фамилии с инициалами: «мазурик а.в.» → [«Мазурик А.В.»]. */
export function findTeachers(input: string): string[] {
  const q = fullKey(input);
  if (!q) return [];
  const bySurname = ALL_TEACHERS.filter((t) => surnameKey(t) === surnameKey(q));
  if (bySurname.length <= 1) return bySurname;
  const exact = bySurname.filter((t) => fullKey(t).replace(/\s/g, "").startsWith(q.replace(/\s/g, "")));
  return exact.length ? exact : bySurname;
}

/** Ключ отметки «болеет»: фамилия, а у однофамильцев — полное имя. */
export const absenceKey = (name: string) =>
  ALL_TEACHERS.filter((t) => surnameKey(t) === surnameKey(name)).length > 1 ? fullKey(name) : surnameKey(name);

/** Группы, у которых есть пары этого преподавателя. */
export function teacherGroups(name: string) {
  return Object.entries(TIMETABLE)
    .filter(([, days]) => days.some((d) => d.some((cell) => cell.split("/").some((c) => LESSONS[c]?.teacher === name))))
    .map(([g]) => g);
}

const ambiguous = (cmd: string, list: string[]) =>
  `Таких преподавателей несколько: ${list.map(esc).join(", ")}.\nУточни инициалы, например: <code>/${cmd} ${esc(list[0])}</code>`;

export async function markSick(chatId: number, rest: string) {
  const input = rest.trim();
  if (!input) return send(chatId, "Напиши фамилию: <code>/болеет Малышев</code>");
  const found = findTeachers(input);
  if (found.length > 1) return send(chatId, ambiguous("болеет", found));
  const name = found[0] ?? input.slice(0, 60);
  addAbsence(absenceKey(name), name);
  const groups = teacherGroups(name);
  await send(
    chatId,
    `🤒 Отмечено: ${esc(sickPhrase(name))}.\nВо всех его парах в расписании, утренних сообщениях и напоминаниях теперь пишется, что преподаватель заболел.` +
      (groups.length ? `\nЗатронутые группы: ${groups.join(", ")}.` : "\n⚠️ В расписании нет преподавателя с такой фамилией.") +
      `\n\nКогда выйдет: <code>/вышел ${esc(absenceKey(name) === surnameKey(name) ? name.split(" ")[0] : name)}</code>`,
  );
}

export async function markBack(chatId: number, rest: string) {
  const input = rest.trim();
  if (!input) return send(chatId, "Напиши фамилию: <code>/вышел Малышев</code>");
  const sick = listAbsences();
  const found = findTeachers(input).filter((t) => sick.some((a) => a.name === t));
  if (found.length > 1) return send(chatId, ambiguous("вышел", found));
  const ok = found.length ? removeAbsence(absenceKey(found[0])) : removeAbsence(surnameKey(input)) || removeAbsence(fullKey(input));
  await send(chatId, ok ? `✅ ${esc(input)} снова в строю — пометка убрана.` : "Такого преподавателя нет в списке болеющих. /болеют — список.");
}

export async function sickList(chatId: number) {
  const list = listAbsences();
  await send(chatId, list.length ? `🤒 <b>Болеют:</b>\n${list.map((a) => `• ${esc(a.name)}`).join("\n")}` : "Сейчас никто не болеет.");
}
