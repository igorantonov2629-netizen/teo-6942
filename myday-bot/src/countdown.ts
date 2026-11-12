import { parseDate } from "./admin-post";
import { getDb } from "./db";
import { esc } from "./messages";
import { btn, edit, kb, send } from "./telegram";
import { daysBetween, localNow, ruDate } from "./time";

/** Обратный отсчёт в утреннем сообщении: «До каникул — 46 дней». События задаёт админ. */
export type Countdown = { id: number; title: string; date: string };

export const listCountdowns = (from: string) =>
  getDb().query<Countdown, [string]>("SELECT id, title, date FROM countdowns WHERE date >= ? ORDER BY date").all(from);

export function daysWord(n: number) {
  const m10 = n % 10;
  const m100 = n % 100;
  const w = m10 === 1 && m100 !== 11 ? "день" : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? "дня" : "дней";
  return `${n} ${w}`;
}

/** Строки для утреннего сообщения (не больше трёх ближайших). */
export function countdownLines(today: string): string[] {
  return listCountdowns(today)
    .slice(0, 3)
    .map((c) => {
      const n = daysBetween(today, c.date);
      return n === 0 ? `🎉 ${esc(c.title)} — сегодня!` : `⏳ ${esc(c.title)} — ${daysWord(n)}`;
    });
}

function adminView(today: string) {
  const list = listCountdowns(today);
  return {
    text: [
      "⏳ <b>Обратный отсчёт</b> (в утреннем сообщении)",
      ...(list.length ? list.map((c) => `• ${esc(c.title)} — ${ruDate(c.date)} (${daysWord(daysBetween(today, c.date))})`) : ["пока пусто"]),
      "",
      "Добавить: <code>/отсчёт 28.12.2026 До каникул</code>",
    ].join("\n"),
    markup: kb(list.map((c) => [btn(`🗑 ${c.title.slice(0, 30)}`, `cd:del:${c.id}`)])),
  };
}

/** /отсчёт — список; /отсчёт ДД.ММ[.ГГГГ] Название — добавить. */
export async function countdownCommand(chatId: number, rest: string) {
  const today = localNow().date;
  const input = rest.trim();
  if (input) {
    const [d, ...words] = input.split(/\s+/);
    const date = parseDate(d, today);
    const title = words.join(" ").slice(0, 60);
    if (!date || !title) return send(chatId, "Формат: <code>/отсчёт 28.12.2026 До каникул</code>");
    getDb().query("INSERT INTO countdowns (title, date) VALUES (?, ?)").run(title, date);
    await send(chatId, `✅ Добавлено: «${esc(title)}», ${ruDate(date)}.`);
  }
  const v = adminView(today);
  return send(chatId, v.text, { reply_markup: v.markup });
}

export async function countdownCallback(chatId: number, messageId: number, data: string) {
  const [, action, id] = data.split(":");
  if (action === "del") getDb().query("DELETE FROM countdowns WHERE id = ?").run(Number(id));
  const v = adminView(localNow().date);
  return edit(chatId, messageId, v.text, v.markup);
}
