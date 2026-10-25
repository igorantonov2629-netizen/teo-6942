import { ORPCError } from "@orpc/server";
import { and, eq, like } from "drizzle-orm";
import { db } from "../database";
import { teoRequests, teoOutbox } from "../database/schema";
import type { PhotoRequest } from "../../shared/teo";
import { appUrl, queueMessage, flushMessages, telegramCall } from "./telegram";

export const photoReplyText =
  "Просим прощения за неудобства! В течение 15 минут отправим информацию о товаре.\nС уважением поддержка teo.";
type Moderator = {
  id: number;
  name: string;
  username: string | null;
  role: string;
};
type Button = {
  text: string;
  url?: string;
  callback_data?: string;
  web_app?: { url: string };
};

export function buyerDraftUrl(r: PhotoRequest) {
  const username = r.username?.replace(/^@/, "");
  if (username && /^[a-zA-Z0-9_]+$/.test(username))
    return `https://t.me/${username}?text=${encodeURIComponent(photoReplyText)}`;
  const phone = r.phone?.replace(/\D/g, "");
  return phone
    ? `https://t.me/+${phone}?text=${encodeURIComponent(photoReplyText)}`
    : undefined;
}

export function photoRequestMarkup(r: PhotoRequest, moderatorId: number) {
  const rows: Button[][] = [];
  if (r.replyConfirmedAt) {
    rows.push([
      {
        text: `Ответ отмечен · ${r.assignedName || "Модератор"}`,
        callback_data: `photo:info:${r.id}`,
      },
    ]);
  } else if (!r.assignedTo) {
    rows.push([
      { text: "Взял в работу", callback_data: `photo:claim:${r.id}` },
    ]);
  } else if (r.assignedTo === moderatorId) {
    rows.push([
      {
        text: `В работе: ${r.assignedName}`,
        callback_data: `photo:info:${r.id}`,
      },
    ]);
    const url = buyerDraftUrl(r);
    if (url)
      rows.push([
        {
          text: `${r.username ? "@" + r.username : r.buyerName || "Покупатель"} · ответить`,
          url,
        },
      ]);
    rows.push([
      { text: "Ответ отправлен", callback_data: `photo:done:${r.id}` },
    ]);
  } else {
    rows.push([
      {
        text: `В работе: ${r.assignedName}`,
        callback_data: `photo:info:${r.id}`,
      },
    ]);
  }
  rows.push([{ text: "Открыть Teo", web_app: { url: appUrl() } }]);
  return { inline_keyboard: rows };
}

export async function syncPhotoButtons(r: PhotoRequest) {
  const notifications = await db
    .select()
    .from(teoOutbox)
    .where(like(teoOutbox.id, `${r.id}:moder:%`));
  for (const n of notifications) {
    const markup = photoRequestMarkup(r, n.chatId);
    const data = JSON.parse(n.data);
    await db
      .update(teoOutbox)
      .set({ data: JSON.stringify({ ...data, reply_markup: markup }) })
      .where(eq(teoOutbox.id, n.id));
    if (n.messageId) {
      await queueMessage(
        `${r.id}:buttons:${n.chatId}:${r.replyConfirmedAt || r.assignedAt}`,
        n.chatId,
        "editMessageReplyMarkup",
        {
          message_id: n.messageId,
          reply_markup: markup,
        },
      );
    }
  }
  await flushMessages();
}

export async function actOnPhoto(
  id: string,
  action: "claim" | "done",
  moderator: Moderator,
) {
  if (!["owner", "moderator"].includes(moderator.role))
    throw new ORPCError("FORBIDDEN", {
      message: "Доступ только для модераторов.",
    });
  const row = (
    await db.select().from(teoRequests).where(eq(teoRequests.id, id))
  )[0];
  if (!row)
    throw new ORPCError("NOT_FOUND", { message: "Фото-запрос не найден." });
  const r = JSON.parse(row.data) as PhotoRequest;
  if (r.replyConfirmedAt)
    throw new ORPCError("CONFLICT", {
      message: "Ответ уже отмечен как отправленный.",
    });
  if (r.assignedTo && r.assignedTo !== moderator.id)
    throw new ORPCError("CONFLICT", {
      message: `Запрос уже взял ${r.assignedName}.`,
    });
  if (action === "done" && !r.assignedTo)
    throw new ORPCError("BAD_REQUEST", {
      message: "Сначала возьмите запрос в работу.",
    });
  const value: PhotoRequest =
    action === "claim"
      ? {
          ...r,
          assignedTo: moderator.id,
          assignedName: moderator.username
            ? "@" + moderator.username
            : moderator.name,
          assignedAt: r.assignedAt || Date.now(),
          status: r.status === "Новый" ? "В поиске" : r.status,
        }
      : { ...r, replyConfirmedAt: Date.now() };
  const updated = await db
    .update(teoRequests)
    .set({ data: JSON.stringify(value) })
    .where(and(eq(teoRequests.id, id), eq(teoRequests.data, row.data)))
    .returning();
  if (!updated.length)
    throw new ORPCError("CONFLICT", {
      message: "Запрос изменён другим модератором. Обновите панель.",
    });
  await syncPhotoButtons(value);
  return value;
}

export type PhotoCallback = {
  id: string;
  data?: string;
  from: { id: number; first_name: string; username?: string; is_bot?: boolean };
  message?: { message_id: number; chat: { id: number; type: string } };
};
export async function handlePhotoCallback(
  callback: PhotoCallback,
  moderator: Moderator,
) {
  let text = "Неизвестное действие.";
  try {
    if (
      callback.message?.chat.type !== "private" ||
      callback.message.chat.id !== moderator.id
    )
      throw new Error("Действие доступно только в вашем личном чате с ботом.");
    const match = callback.data?.match(
      /^photo:(claim|done|info):(REQ-[a-f0-9-]{36})$/,
    );
    if (match?.[1] === "info") {
      if (!["owner", "moderator"].includes(moderator.role))
        throw new Error("Доступ только для модераторов.");
      text =
        "Запрос закреплён за модератором. Отметка ответа устанавливается вручную.";
    } else if (match) {
      const r = await actOnPhoto(
        match[2]!,
        match[1] as "claim" | "done",
        moderator,
      );
      // Also update this card if it predates durable message-id recording.
      try {
        await telegramCall("editMessageReplyMarkup", {
          chat_id: moderator.id,
          message_id: callback.message.message_id,
          reply_markup: photoRequestMarkup(r, moderator.id),
        });
      } catch {
        /* Already updated by the outbox. */
      }
      text =
        match[1] === "claim"
          ? "Запрос ваш. Откройте чат покупателя и отправьте готовый текст."
          : "Ответ отмечен как отправленный.";
    }
  } catch (error) {
    text = error instanceof Error ? error.message : "Ошибка обработки запроса.";
  }
  await telegramCall("answerCallbackQuery", {
    callback_query_id: callback.id,
    text: text.slice(0, 200),
    show_alert: true,
  });
}
