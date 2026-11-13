import { getDb } from "./db";
import type { Post } from "./types";
import { edit, safe, send, tg } from "./telegram";

/**
 * Очередь рассылки объявлений в базе. Сначала все получатели записываются
 * в outbox, потом по одному отправляются и удаляются из очереди. Если бота
 * перезапустили посреди рассылки, после запуска она продолжится с того же места.
 * Если не удалось дослать за 6 часов — остаток отбрасывается (устарело).
 */

const STALE = 6 * 3600 * 1000;

type Payload = { post: Post; pin?: boolean };
type Batch = { batch: string; admin_chat: number; admin_msg: number; total: number; sent: number };

export function enqueue(recipients: number[], payload: Payload, admin: { chat: number; msg: number }) {
  const db = getDb();
  const batch = `b${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const now = Date.now();
  const json = JSON.stringify(payload);
  db.transaction(() => {
    db.query("INSERT INTO outbox_batches (batch, admin_chat, admin_msg, total, sent, created_at) VALUES (?, ?, ?, ?, 0, ?)").run(
      batch,
      admin.chat,
      admin.msg,
      recipients.length,
      now,
    );
    const row = db.query("INSERT INTO outbox (batch, chat_id, payload, created_at) VALUES (?, ?, ?, ?)");
    for (const id of recipients) row.run(batch, id, json, now);
  })();
  kick();
  return batch;
}

async function deliver(chatId: number, p: Payload) {
  const msg = (await (p.post.photo
    ? safe(chatId, () => tg("sendPhoto", { chat_id: chatId, photo: p.post.photo, caption: p.post.text.slice(0, 1024), parse_mode: "HTML" }))
    : send(chatId, p.post.text))) as { message_id: number } | null;
  if (msg && p.pin) await tg("pinChatMessage", { chat_id: chatId, message_id: msg.message_id, disable_notification: true }).catch(() => null);
  return !!msg;
}

async function finishBatch(b: Batch) {
  getDb().query("DELETE FROM outbox_batches WHERE batch = ?").run(b.batch);
  await edit(b.admin_chat, b.admin_msg, `✅ Объявление отправлено: ${b.sent} из ${b.total}.`);
}

let running = false;
let stopping = false;
let wake: (() => void) | null = null;

/** Разбудить отправку (после постановки в очередь). */
export const kick = () => wake?.();

/** Один проход по очереди. Возвращает число обработанных сообщений. */
export async function drainOnce(pause = 40) {
  const db = getDb();
  db.query("DELETE FROM outbox WHERE created_at < ?").run(Date.now() - STALE);
  let n = 0;
  while (!stopping) {
    const row = db.query<{ id: number; batch: string; chat_id: number; payload: string }, []>("SELECT id, batch, chat_id, payload FROM outbox ORDER BY id LIMIT 1").get();
    if (!row) break;
    const ok = await deliver(row.chat_id, JSON.parse(row.payload));
    db.transaction(() => {
      db.query("DELETE FROM outbox WHERE id = ?").run(row.id);
      if (ok) db.query("UPDATE outbox_batches SET sent = sent + 1 WHERE batch = ?").run(row.batch);
    })();
    n++;
    if (pause) await Bun.sleep(pause);
  }
  // Закрыть пачки, в которых не осталось получателей.
  for (const b of db
    .query<Batch, []>("SELECT batch, admin_chat, admin_msg, total, sent FROM outbox_batches WHERE batch NOT IN (SELECT DISTINCT batch FROM outbox)")
    .all())
    await finishBatch(b);
  return n;
}

/** Фоновый цикл: отправляет очередь, при запуске — досылает оборванное. */
export function startOutbox() {
  if (running) return;
  running = true;
  (async () => {
    while (!stopping) {
      try {
        await drainOnce();
      } catch (e) {
        console.error("Очередь рассылки:", (e as Error).message);
      }
      await new Promise<void>((r) => {
        wake = r;
        setTimeout(r, 30_000);
      });
      wake = null;
    }
    running = false;
  })();
}

export const stopOutbox = () => {
  stopping = true;
  kick();
};

/** Сколько ещё ждёт отправки (для админа). */
export const pendingCount = () => getDb().query<{ n: number }, []>("SELECT COUNT(*) AS n FROM outbox").get()!.n;
