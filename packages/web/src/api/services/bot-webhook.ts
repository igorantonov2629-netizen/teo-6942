import { timingSafeEqual } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db } from "../database";
import { teoUsers, teoUpdates } from "../database/schema";
import {
  botMenu,
  supportText,
  supportMarkup,
  moderatorCommands,
} from "./bot-menu";
import { handlePhotoCallback } from "./photo-workflow";
import { handlePaymentCallback } from "./commerce";
import { clearSession, getSession } from "./bot-session";
import {
  broadcastCallback,
  broadcastMessage,
  startBroadcast,
} from "./bot-broadcast";
import {
  productWizardCallback,
  productWizardMessage,
  startProductWizard,
} from "./bot-product-wizard";
import type { BotCallback, BotMessage } from "./bot-types";
import {
  ownerId,
  appUrl,
  telegramCall,
  upsertUser,
  openAppMarkup,
} from "./telegram";

type BotUpdate = {
  update_id: number;
  callback_query?: BotCallback;
  message?: BotMessage;
};
export function checkWebhookSecret(value: string) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  return (
    !!secret &&
    value.length === secret.length &&
    timingSafeEqual(Buffer.from(value), Buffer.from(secret))
  );
}
export async function handleBotUpdate(update: BotUpdate) {
  if (!Number.isSafeInteger(update.update_id)) return;
  const claimed = await db
    .insert(teoUpdates)
    .values({ id: update.update_id, createdAt: Date.now() })
    .onConflictDoNothing()
    .returning();
  if (!claimed.length) {
    const old = (
      await db
        .select()
        .from(teoUpdates)
        .where(eq(teoUpdates.id, update.update_id))
    )[0];
    if (!old || old.state === "done" || Date.now() - old.createdAt < 60000)
      return;
    await db
      .update(teoUpdates)
      .set({ state: "processing", createdAt: Date.now() })
      .where(eq(teoUpdates.id, update.update_id));
  }
  try {
    if (update.callback_query && !update.callback_query.from.is_bot) {
      const moderator = await upsertUser(update.callback_query.from);
      const data = update.callback_query.data || "";
      if (data.startsWith("pay:"))
        await handlePaymentCallback(update.callback_query);
      else if (data.startsWith("bc:"))
        await broadcastCallback(update.callback_query, moderator);
      else if (data.startsWith("np:"))
        await productWizardCallback(update.callback_query, moderator);
      else await handlePhotoCallback(update.callback_query, moderator);
    }
    const m = update.message;
    if (m?.from && m.chat.type === "private" && !m.from.is_bot) {
      const user = await upsertUser(m.from, true);
      const send = (text: string, reply_markup?: unknown) =>
        telegramCall("sendMessage", {
          chat_id: m.chat.id,
          text,
          ...(reply_markup ? { reply_markup } : {}),
        });
      const text = m.text || "";
      const command = text.split(/\s/)[0]?.split("@")[0]?.toLowerCase();
      const lower = text.trim().toLowerCase();
      // Commands and the reply-keyboard buttons always work; anything else
      // continues an open conversation (broadcast / new product).
      const session =
        command?.startsWith("/") || ["старт", "поддержка"].includes(lower)
          ? null
          : await getSession(user.id);
      if (command === "/cancel" || lower === "отмена") {
        const open = await getSession(user.id);
        await clearSession(user.id);
        await send(
          open ? "Отменено." : "Нечего отменять.",
          botMenu(!user.phone),
        );
      } else if (session?.kind === "broadcast")
        await broadcastMessage(user, m);
      else if (session?.kind === "product")
        await productWizardMessage(user, m);
      else if (command === "/broadcast" || lower === "рассылка")
        await startBroadcast(user);
      else if (command === "/newproduct" || lower === "новый товар")
        await startProductWizard(user);
      else if (m.contact) {
        if (m.contact.user_id !== m.from.id)
          await send(
            "Пожалуйста, отправьте свой номер через кнопку «Поделиться номером», а не чужой контакт.",
          );
        else {
          await db
            .update(teoUsers)
            .set({ phone: m.contact.phone_number, consentAt: Date.now() })
            .where(eq(teoUsers.id, m.from.id));
          await send(
            "✅ Номер сохранён. Он будет доступен владельцу и модераторам для связи по вашим заказам. Удалить номер: /deletephone.",
            botMenu(),
          );
          await send(
            "🧡 Добро пожаловать в teo! Выбирайте любимые вещи — с заказом поможем.",
            openAppMarkup(),
          );
        }
      } else if (
        command === "/support" ||
        text.trim().toLowerCase() === "поддержка"
      ) {
        await send(supportText, supportMarkup());
      } else if (
        command === "/start" ||
        command === "/phone" ||
        text.trim().toLowerCase() === "старт"
      ) {
        // Phone already saved: no consent/phone text again on every «Старт».
        if (user.phone && command !== "/phone")
          await send(
            "🧡 С возвращением в teo! ✨ Ваши новые находки — в каталоге по кнопке ниже.",
            openAppMarkup(),
          );
        else {
          await send(
            "🧡 С teo — заказывать из Китая просто.\n\nДля оформления заявок поделитесь своим номером. Нажимая кнопку, вы разрешаете хранить номер и передавать его владельцу и модераторам для связи по заказам. Username сохраняется, если он указан в Telegram. Удалить номер: /deletephone.",
            botMenu(true),
          );
          await send(
            "✨ Ваши новые находки — в каталоге по кнопке ниже.",
            openAppMarkup(),
          );
        }
      } else if (command === "/id") await send(`Ваш Telegram ID: ${m.from.id}`);
      else if (command === "/deletephone") {
        await db
          .update(teoUsers)
          .set({ phone: null, consentAt: null })
          .where(eq(teoUsers.id, m.from.id));
        await send(
          "Номер удалён из профиля. Для новых заявок потребуется повторно поделиться номером. Контакт в уже оформленных заявках и ранее отправленных сообщениях может сохраняться.",
          botMenu(true),
        );
      } else if (command === "/newmoder" || command === "/delmoder") {
        if (user.id !== ownerId())
          await send("Эта команда доступна только владельцу.");
        else {
          const arg = text.trim().split(/\s+/)[1] || "";
          let target;
          if (/^\d+$/.test(arg))
            target = (
              await db
                .select()
                .from(teoUsers)
                .where(eq(teoUsers.id, Number(arg)))
            )[0];
          else if (/^@[a-z0-9_]+$/i.test(arg))
            target = (
              await db
                .select()
                .from(teoUsers)
                .where(eq(teoUsers.username, arg.slice(1)))
            )[0];
          if (!target)
            await send(
              "Укажите Telegram ID или @username пользователя, который уже нажал /start в этом боте. Пример: /newmoder 123456789",
            );
          else if (target.id === ownerId())
            await send("Роль владельца изменить нельзя.");
          else {
            await db
              .update(teoUsers)
              .set({ role: command === "/newmoder" ? "moderator" : "buyer" })
              .where(
                and(eq(teoUsers.id, target.id), eq(teoUsers.role, target.role)),
              );
            await send(
              `${target.username ? "@" + target.username : target.id}: ${command === "/newmoder" ? "добавлен в модераторы" : "доступ модератора отозван"}.`,
            );
            // Moderators see /newproduct in their «/» menu; best effort.
            await (command === "/newmoder"
              ? telegramCall("setMyCommands", {
                  scope: { type: "chat", chat_id: target.id },
                  commands: moderatorCommands,
                })
              : telegramCall("deleteMyCommands", {
                  scope: { type: "chat", chat_id: target.id },
                })
            ).catch(() => undefined);
            await telegramCall("sendMessage", {
              chat_id: target.id,
              text:
                command === "/newmoder"
                  ? "Вам открыт доступ к панели модератора в Teo. Заново откройте приложение. Добавлять товары можно и прямо здесь: /newproduct"
                  : "Доступ к панели модератора отозван.",
              reply_markup: openAppMarkup(),
            });
          }
        }
      } else if (command === "/moderators") {
        if (user.id !== ownerId())
          await send("Эта команда доступна только владельцу.");
        else {
          const rows = await db
            .select()
            .from(teoUsers)
            .where(eq(teoUsers.role, "moderator"));
          await send(
            "Модераторы:\n" +
              (rows
                .map((u) => `${u.id} ${u.username ? "@" + u.username : u.name}`)
                .join("\n") || "Пока не добавлены."),
          );
        }
      } else if (command === "/help")
        await send(
          "/start — открыть каталог и поделиться номером\n/support — поддержка\n/id — ваш Telegram ID\n/deletephone — удалить номер из профиля\n/cancel — отменить текущее действие" +
            (["owner", "moderator"].includes(user.role)
              ? "\n/newproduct — добавить товар по шагам"
              : "") +
            (user.id === ownerId()
              ? "\n/broadcast — рассылка всем пользователям (текст, фото, альбом)\n/newmoder ID или @username — добавить модератора\n/delmoder ID или @username — отозвать доступ\n/moderators — список модераторов"
              : ""),
          openAppMarkup(),
        );
      else
        await send("Откройте каталог Teo или нажмите /start для регистрации.", {
          inline_keyboard: [
            [{ text: "Открыть Teo", web_app: { url: appUrl() } }],
          ],
        });
    }
    await db
      .update(teoUpdates)
      .set({ state: "done" })
      .where(eq(teoUpdates.id, update.update_id));
  } catch {
    await db.delete(teoUpdates).where(eq(teoUpdates.id, update.update_id));
    throw new Error("Не удалось обработать обновление бота");
  }
}
