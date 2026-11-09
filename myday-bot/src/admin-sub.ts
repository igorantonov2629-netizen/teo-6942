import { audienceChatIds, clearSession, deleteOverride, getOverrides, setSession, saveOverride, type Session } from "./db";
import { esc } from "./messages";
import { baseDay, dayPairs, place } from "./schedule";
import { COURSES } from "./schedule-data";
import { broadcast, btn, edit, grid, kb, send } from "./telegram";
import { addDays, dowOf, localNow, ruDate, WEEKDAYS_SHORT } from "./time";

/** Замены и отмены пар: группа → дата → пара → отменить / заменить / вернуть. */
export async function startSub(chatId: number) {
  clearSession(chatId);
  setSession(chatId, { kind: "admin_sub", step: "pick", data: {} });
  await send(chatId, "🔁 <b>Замена или отмена пары</b>\nВыбери группу:", { reply_markup: groupsKeyboard() });
}

const groupsKeyboard = () =>
  kb([...grid([...COURSES[1], ...COURSES[2]].map((g) => btn(g, `sub:g:${g}`)), 3), [btn("✖️ Отмена", "sub:x")]]);

function datesKeyboard(today: string) {
  const dates = Array.from({ length: 8 }, (_, i) => addDays(today, i)).filter((d) => dowOf(d) !== 6);
  return kb([...grid(dates.map((d) => btn(`${WEEKDAYS_SHORT[dowOf(d)]} ${ruDate(d)}`, `sub:d:${d}`)), 2), [btn("← Группы", "sub:back"), btn("✖️ Отмена", "sub:x")]]);
}

function pairsKeyboard(grp: string, date: string) {
  const pairs = dayPairs(grp, date);
  return kb([
    ...pairs.map((p) => [btn(`${p.n} пара: ${p.change?.kind === "cancel" ? "❌ отменена" : p.lesson ? p.lesson.subject.slice(0, 40) : "—"}${p.change ? " ⚠️" : ""}`, `sub:p:${p.n}`)]),
    [btn("← Даты", `sub:g:${grp}`), btn("✖️ Отмена", "sub:x")],
  ]);
}

export function datePhrase(date: string, today: string) {
  if (date === today) return "на сегодня";
  if (date === addDays(today, 1)) return "на завтра";
  return `на ${ruDate(date)} (${WEEKDAYS_SHORT[dowOf(date)]})`;
}

export async function subCallback(chatId: number, messageId: number, data: string, session: Session | null) {
  if (data === "sub:x") {
    clearSession(chatId);
    return edit(chatId, messageId, "Отменено.");
  }
  if (!session || session.kind !== "admin_sub") return edit(chatId, messageId, "Диалог устарел. Начни заново: /замена");
  const d = session.data as { grp?: string; date?: string; pair?: number };
  const [, kind, ...rest] = data.split(":");
  const value = rest.join(":");
  const today = localNow().date;

  if (kind === "back") return edit(chatId, messageId, "Выбери группу:", groupsKeyboard());
  if (kind === "g") {
    setSession(chatId, { ...session, data: { grp: value } });
    return edit(chatId, messageId, `Группа <b>${value}</b>. Выбери дату:`, datesKeyboard(today));
  }
  if (kind === "d" && d.grp) {
    setSession(chatId, { ...session, data: { ...d, date: value } });
    return edit(chatId, messageId, `Группа <b>${d.grp}</b>, ${ruDate(value)}. Выбери пару:`, pairsKeyboard(d.grp, value));
  }
  if (kind === "p" && d.grp && d.date) {
    const pair = Number(value);
    setSession(chatId, { ...session, data: { ...d, pair } });
    const p = dayPairs(d.grp, d.date)[pair - 1];
    const has = getOverrides(d.grp, d.date).some((o) => o.pair === pair);
    const now = p.change?.kind === "cancel" ? "отменена" : p.lesson ? `${p.lesson.subject}${place(p.lesson) ? `, ${place(p.lesson)}` : ""}` : "пары нет";
    return edit(chatId, messageId, `Группа <b>${d.grp}</b>, ${ruDate(d.date)}, <b>${pair} пара</b>\nСейчас: ${esc(now)}`, kb([
      [btn("❌ Отменить пару", "sub:k:cancel"), btn("🔁 Заменить", "sub:k:replace")],
      ...(has ? [[btn("↩️ Вернуть как в расписании", "sub:k:reset")]] : []),
      [btn("← Пары", `sub:d:${d.date}`), btn("✖️ Отмена", "sub:x")],
    ]));
  }
  if (kind === "k" && d.grp && d.date && d.pair) {
    if (value === "replace") {
      setSession(chatId, { ...session, step: "replace", data: d });
      return edit(chatId, messageId, `Напиши новую пару одной строкой через «;»:\n<code>Предмет; кабинет; преподаватель</code>\nНапример: <code>Информатика; 401/8; Кобылкин С.В.</code>\nКабинет и преподавателя можно не указывать.`);
    }
    if (value === "reset") {
      const was = dayPairs(d.grp, d.date)[d.pair - 1];
      deleteOverride(d.grp, d.date, d.pair);
      clearSession(chatId);
      const p = dayPairs(d.grp, d.date)[d.pair - 1];
      const text = `⚠️ <b>Изменение ${datePhrase(d.date, today)}</b>\n${d.pair} пара: ${esc(was.lesson?.subject ?? "отменена")} → ${p.lesson ? esc(p.lesson.subject) + (place(p.lesson) ? `, ${esc(place(p.lesson))}` : "") : "пары нет"} (как в расписании)`;
      const sent = await notifyGroup(d.grp, text);
      return edit(chatId, messageId, `✅ Возвращено как в расписании. Уведомлено: ${sent}.`);
    }
    if (value === "cancel") {
      const before = dayPairs(d.grp, d.date)[d.pair - 1].lesson;
      saveOverride({ grp: d.grp, date: d.date, pair: d.pair, kind: "cancel", subject: null, room: null, teacher: null });
      clearSession(chatId);
      const text = `⚠️ <b>Изменение ${datePhrase(d.date, today)}</b>\n${d.pair} пара${before ? ` (${esc(before.subject)})` : ""} отменена`;
      const sent = await notifyGroup(d.grp, text);
      return edit(chatId, messageId, `✅ Пара отменена. Уведомлено: ${sent}.`);
    }
  }
}

/** Разбор «Предмет; кабинет; преподаватель». */
export function parseReplacement(text: string) {
  const [subject, room, teacher] = text.split(/[;|]/).map((s) => s.trim().slice(0, 150));
  return subject ? { subject, room: room || null, teacher: teacher || null } : null;
}

export async function subText(chatId: number, text: string, session: Session) {
  const d = session.data as { grp: string; date: string; pair: number };
  const r = parseReplacement(text);
  if (session.step !== "replace" || !r || !d.grp) return send(chatId, "Напиши: Предмет; кабинет; преподаватель — или /cancel.");
  const before = dayPairs(d.grp, d.date)[d.pair - 1].lesson ?? baseDay(d.grp, d.date)[d.pair - 1] ?? null;
  saveOverride({ grp: d.grp, date: d.date, pair: d.pair, kind: "replace", ...r });
  clearSession(chatId);
  const lesson = { subject: r.subject, room: r.room ?? undefined, teacher: r.teacher ?? undefined };
  const where = place(lesson);
  const text2 = `⚠️ <b>Изменение ${datePhrase(d.date, localNow().date)}</b>\n${d.pair} пара: ${before ? `${esc(before.subject)} → ` : ""}${esc(r.subject)}${where ? `, ${esc(where)}` : ""}${r.teacher ? ` · ${esc(r.teacher)}` : ""}`;
  const sent = await notifyGroup(d.grp, text2);
  await send(chatId, `✅ Замена сохранена (группа ${d.grp}, ${ruDate(d.date)}, ${d.pair} пара). Уведомлено: ${sent}.\nОна уже видна в «Сегодня/Завтра/Неделя» и попадёт в вечернюю рассылку.`);
}

const notifyGroup = (grp: string, text: string) => broadcast(audienceChatIds({ type: "groups", groups: [grp] }), (id) => send(id, text));
