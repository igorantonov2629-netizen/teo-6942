import { and, eq, like } from "drizzle-orm";
import { db } from "../database";
import { teoOutbox, teoUsers } from "../database/schema";
import {
  advanceSession,
  clearSession,
  getSession,
  mutateSession,
  setSession,
} from "./bot-session";
import {
  bestPhoto,
  flushMessages,
  ownerId,
  queueMessage,
  telegramCall,
} from "./telegram";
import { cancelHint, type BotCallback, type BotMessage, type BotUser } from "./bot-types";

/** Owner-only announcement to everyone who started the bot. */
const kind = "broadcast";
type Draft = { text: string; photos: string[]; groups: string[] };

const captionLimit = 1024;
const textLimit = 4096;
const maxPhotos = 10; // sendMediaGroup limit

const collectMarkup = {
  inline_keyboard: [
    [{ text: "👀 Предпросмотр", callback_data: "bc:preview" }],
    [{ text: "Отмена", callback_data: "bc:cancel" }],
  ],
};

export const isOwner = (user: BotUser) => user.id === ownerId();

export async function startBroadcast(user: BotUser) {
  const send = (text: string) =>
    telegramCall("sendMessage", { chat_id: user.id, text });
  if (!isOwner(user))
    return send("Рассылка доступна только владельцу.");
  await setSession<Draft>(user.id, kind, "collect", {
    text: "",
    photos: [],
    groups: [],
  });
  await send(
    "📣 Рассылка всем пользователям бота.\n\nОтправьте сообщение: текст, фото с подписью или несколько фото (альбомом). Затем нажмите «Предпросмотр» — до подтверждения никто ничего не получит.\n\n" +
      cancelHint,
  );
}

/** Builds the Telegram calls for the announcement (photos by file_id). */
function payloads(d: Draft): { method: string; data: Record<string, unknown> }[] {
  const caption = d.text ? { caption: d.text } : {};
  if (!d.photos.length) return [{ method: "sendMessage", data: { text: d.text } }];
  if (d.photos.length === 1)
    return [{ method: "sendPhoto", data: { photo: d.photos[0], ...caption } }];
  return [
    {
      method: "sendMediaGroup",
      data: {
        media: d.photos.map((p, i) => ({
          type: "photo",
          media: p,
          ...(i === 0 ? caption : {}),
        })),
      },
    },
  ];
}

function problems(d: Draft) {
  if (!d.text && !d.photos.length) return "Сначала отправьте текст или фото.";
  if (d.photos.length && d.text.length > captionLimit)
    return `Подпись к фото — не длиннее ${captionLimit} символов (сейчас ${d.text.length}). Отправьте текст короче.`;
  if (d.text.length > textLimit)
    return `Текст — не длиннее ${textLimit} символов.`;
  return "";
}

/** Owner message while a broadcast is being collected. */
export async function broadcastMessage(user: BotUser, m: BotMessage) {
  const send = (text: string, reply_markup?: unknown) =>
    telegramCall("sendMessage", {
      chat_id: user.id,
      text,
      ...(reply_markup ? { reply_markup } : {}),
    });
  const session = await getSession<Draft>(user.id);
  if (session?.step !== "collect")
    return send("Рассылка ждёт подтверждения: нажмите «Отправить» или «Отмена» выше.");
  const text = (m.caption ?? m.text ?? "").trim();
  const photo = m.photo?.length ? bestPhoto(m.photo).file_id : "";
  if (!text && !photo)
    return send("Поддерживаются текст и фото. " + cancelHint);
  let firstOfAlbum = true;
  const d = await mutateSession<Draft>(user.id, kind, "collect", (old) => {
    const groups = [...old.groups];
    if (m.media_group_id) {
      firstOfAlbum = !groups.includes(m.media_group_id);
      if (firstOfAlbum) groups.push(m.media_group_id);
    }
    return {
      text: text || old.text,
      photos: photo
        ? [...old.photos, photo].slice(0, maxPhotos)
        : old.photos,
      groups,
    };
  });
  if (!d) return;
  // Albums arrive as several updates — answer once, not per photo.
  if (!firstOfAlbum) return;
  await send(
    `Добавлено. Сейчас: ${d.photos.length ? `фото — ${d.photos.length}` : "без фото"}, ${d.text ? `текст — ${d.text.length} симв.` : "без текста"}.\nМожно отправить ещё фото или новый текст (заменит прежний). Максимум ${maxPhotos} фото.`,
    collectMarkup,
  );
}

async function recipients() {
  const rows = await db
    .select({ id: teoUsers.id })
    .from(teoUsers)
    .where(eq(teoUsers.started, true));
  return rows.map((r) => r.id);
}

export async function broadcastCallback(c: BotCallback, user: BotUser) {
  let answer = "Готово.";
  const chatId = user.id;
  const send = (text: string, reply_markup?: unknown) =>
    telegramCall("sendMessage", {
      chat_id: chatId,
      text,
      ...(reply_markup ? { reply_markup } : {}),
    });
  try {
    if (!isOwner(user) || c.message?.chat.id !== user.id)
      throw new Error("Рассылка доступна только владельцу.");
    const session = await getSession<Draft>(user.id);
    if (session?.kind !== kind) throw new Error("Рассылка уже завершена или отменена.");
    const d = session.data;
    if (c.data === "bc:cancel") {
      await clearSession(user.id);
      answer = "Рассылка отменена.";
      await send("Рассылка отменена — никто ничего не получил.");
    } else if (c.data === "bc:preview") {
      const problem = problems(d);
      if (problem) throw new Error(problem);
      if (!(await advanceSession(user.id, kind, "collect", "preview")))
        throw new Error("Предпросмотр уже показан.");
      await send("Так увидят сообщение пользователи:");
      for (const p of payloads(d))
        await telegramCall(p.method, { ...p.data, chat_id: chatId });
      const count = (await recipients()).length;
      await send(`Отправить ${count} получателям?`, {
        inline_keyboard: [
          [{ text: `✅ Отправить (${count})`, callback_data: "bc:send" }],
          [
            { text: "✏️ Изменить", callback_data: "bc:edit" },
            { text: "Отмена", callback_data: "bc:cancel" },
          ],
        ],
      });
      answer = "Проверьте предпросмотр.";
    } else if (c.data === "bc:edit") {
      if (!(await advanceSession(user.id, kind, "preview", "collect", { text: "", photos: [], groups: [] })))
        throw new Error("Рассылку уже нельзя изменить.");
      answer = "Начнём заново.";
      await send("Отправьте сообщение заново: текст, фото с подписью или альбом. " + cancelHint);
    } else if (c.data === "bc:send") {
      // CAS: a double tap or a retried webhook cannot send twice.
      if (!(await advanceSession(user.id, kind, "preview", "sending")))
        throw new Error("Рассылка уже отправляется или отправлена.");
      answer = "Отправляем…";
      await telegramCall("answerCallbackQuery", { callback_query_id: c.id, text: answer });
      const id = Date.now().toString(36);
      const ids: string[] = [];
      for (const to of await recipients())
        for (const [i, p] of payloads(d).entries()) {
          const rowId = `bc:${id}:${to}:${i}`;
          await queueMessage(rowId, to, p.method, p.data);
          ids.push(rowId);
        }
      let sent = 0;
      for (let i = 0; i < ids.length; i += 20)
        sent += (await flushMessages(ids.slice(i, i + 20))).sent;
      // Users who blocked the bot must not be retried forever by later flushes.
      const failed = await db
        .update(teoOutbox)
        .set({ state: "failed" })
        .where(and(like(teoOutbox.id, `bc:${id}:%`), eq(teoOutbox.state, "pending")))
        .returning();
      await clearSession(user.id);
      await send(
        `📣 Рассылка завершена.\nДоставлено: ${sent}\nНе доставлено: ${failed.length}${failed.length ? " (пользователь заблокировал бота или удалил чат)" : ""}`,
      );
      return;
    }
  } catch (error) {
    answer = error instanceof Error ? error.message : "Ошибка рассылки.";
  }
  await telegramCall("answerCallbackQuery", {
    callback_query_id: c.id,
    text: answer.slice(0, 200),
    show_alert: answer.length > 60,
  }).catch(() => {
    /* Already answered (send path) or the button expired. */
  });
}
