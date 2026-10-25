import { createHmac, timingSafeEqual } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { eq, inArray, and, lt } from "drizzle-orm";
import { db } from "../database";
import { teoUsers, teoOutbox } from "../database/schema";
import { base } from "../__core/app";
import {
  hasFullName,
  fullNameWhy,
  type FullNameFields,
} from "../../shared/full-name";

export const ownerId = () => Number(process.env.TELEGRAM_OWNER_ID);
export const appUrl = () => process.env.TEO_APP_URL || process.env.WEBSITE_URL!;
type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  is_bot?: boolean;
};
export function verifyInitData(raw: string): TelegramUser {
  const params = new URLSearchParams(raw);
  const hash = params.get("hash") || "";
  if (!/^[a-f0-9]{64}$/i.test(hash))
    throw new ORPCError("UNAUTHORIZED", {
      message: "Откройте приложение через Telegram-бота.",
    });
  params.delete("hash");
  const check = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData")
    .update(process.env.TELEGRAM_BOT_TOKEN!)
    .digest();
  const expected = createHmac("sha256", secret).update(check).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, "hex")))
    throw new ORPCError("UNAUTHORIZED", {
      message: "Не удалось подтвердить аккаунт Telegram.",
    });
  const age = Date.now() / 1000 - Number(params.get("auth_date"));
  if (!Number.isFinite(age) || age < -60 || age > 86400)
    throw new ORPCError("UNAUTHORIZED", {
      message: "Закройте и заново откройте приложение в Telegram.",
    });
  let user: TelegramUser;
  try {
    user = JSON.parse(params.get("user") || "{}");
  } catch {
    throw new ORPCError("UNAUTHORIZED");
  }
  if (!Number.isSafeInteger(user.id) || user.id <= 0 || user.is_bot)
    throw new ORPCError("UNAUTHORIZED");
  return user;
}
export async function upsertUser(user: TelegramUser, started = false) {
  const name =
    [user.first_name, user.last_name].filter(Boolean).join(" ") || "Покупатель";
  await db
    .insert(teoUsers)
    .values({
      id: user.id,
      name,
      username: user.username || null,
      started,
      role: user.id === ownerId() ? "owner" : "buyer",
    })
    .onConflictDoUpdate({
      target: teoUsers.id,
      set: {
        name,
        username: user.username || null,
        ...(started ? { started: true } : {}),
        ...(user.id === ownerId() ? { role: "owner" } : {}),
      },
    });
  return (await db.select().from(teoUsers).where(eq(teoUsers.id, user.id)))[0]!;
}
export const tgAuthed = base.use(async ({ context, next }) => {
  const user = await upsertUser(
    verifyInitData(context.headers.get("x-telegram-init-data") || ""),
  );
  return next({ context: { user } });
});
export const tgModerator = tgAuthed.use(({ context, next }) => {
  if (!["owner", "moderator"].includes(context.user.role))
    throw new ORPCError("FORBIDDEN", {
      message: "Доступ только для модераторов.",
    });
  return next();
});
export function requireContact(user: {
  phone: string | null;
  started: boolean;
}) {
  if (!user.phone || !user.started)
    throw new ORPCError("FORBIDDEN", {
      message:
        "Нажмите /start в боте и поделитесь своим номером для оформления.",
    });
}
export function requireFullName(user: FullNameFields) {
  if (!hasFullName(user))
    throw new ORPCError("BAD_REQUEST", {
      message: `Укажите ФИО получателя в профиле. ${fullNameWhy}`,
    });
}
export async function telegramCall(
  method: string,
  payload: Record<string, unknown>,
) {
  try {
    const r = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      },
    );
    const data = (await r.json()) as {
      ok: boolean;
      result?: unknown;
      description?: string;
    };
    if (!data.ok) throw new Error("Telegram отказал в отправке");
    return data.result;
  } catch {
    throw new Error("Не удалось отправить сообщение Telegram");
  }
}
export async function sendPhotoPayload(payload: Record<string, unknown>) {
  const photo = String(payload.photo || "");
  if (!photo.startsWith("data:")) return telegramCall("sendPhoto", payload);
  const match = photo.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s);
  if (!match) throw new Error("Неверный формат фотографии");
  const form = new FormData();
  form.set(
    "photo",
    new Blob([Buffer.from(match[2]!, "base64")], { type: match[1] }),
    "photo.jpg",
  );
  for (const [k, v] of Object.entries(payload))
    if (k !== "photo")
      form.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  try {
    const r = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`,
      { method: "POST", body: form, signal: AbortSignal.timeout(20000) },
    );
    const j = (await r.json()) as { ok: boolean; result?: unknown };
    if (!j.ok) throw new Error();
    return j.result;
  } catch {
    throw new Error("Не удалось отправить фото Telegram");
  }
}
export async function queueMessage(
  id: string,
  chatId: number,
  method: string,
  data: Record<string, unknown>,
) {
  await db
    .insert(teoOutbox)
    .values({
      id,
      chatId,
      method,
      data: JSON.stringify({ ...data, chat_id: chatId }),
      createdAt: Date.now(),
    })
    .onConflictDoNothing();
}
export async function flushMessages(ids?: string[]) {
  await db
    .update(teoOutbox)
    .set({ state: "pending" })
    .where(
      and(
        eq(teoOutbox.state, "sending"),
        lt(teoOutbox.processingAt, Date.now() - 60000),
      ),
    );
  const rows = await db
    .select()
    .from(teoOutbox)
    .where(ids ? inArray(teoOutbox.id, ids) : eq(teoOutbox.state, "pending"))
    .limit(20);
  let sent = 0,
    failed = 0;
  for (const row of rows) {
    if (row.state !== "pending") continue;
    const claim = await db
      .update(teoOutbox)
      .set({
        state: "sending",
        attempts: row.attempts + 1,
        processingAt: Date.now(),
      })
      .where(and(eq(teoOutbox.id, row.id), eq(teoOutbox.state, "pending")))
      .returning();
    if (!claim.length) continue;
    try {
      const data = JSON.parse(row.data);
      const result =
        row.method === "sendPhoto"
          ? await sendPhotoPayload(data)
          : await telegramCall(row.method, data);
      const messageId = (result as { message_id?: number } | undefined)
        ?.message_id;
      await db
        .update(teoOutbox)
        .set({ state: "sent", ...(messageId ? { messageId } : {}) })
        .where(eq(teoOutbox.id, row.id));
      sent++;
    } catch {
      await db
        .update(teoOutbox)
        .set({ state: "pending" })
        .where(eq(teoOutbox.id, row.id));
      failed++;
    }
  }
  return { sent, failed };
}
export async function moderatorIds() {
  const users = await db
    .select()
    .from(teoUsers)
    .where(inArray(teoUsers.role, ["owner", "moderator"]));
  return [
    ...new Set([ownerId(), ...users.filter((u) => u.started).map((u) => u.id)]),
  ];
}
export const openAppMarkup = () => ({
  inline_keyboard: [[{ text: "Открыть Teo", web_app: { url: appUrl() } }]],
});

export type TelegramPhotoSize = {
  file_id: string;
  width: number;
  height: number;
  file_size?: number;
};
/** Largest Telegram photo size that keeps 8 product photos under the 8 MB limit. */
export function bestPhoto(sizes: TelegramPhotoSize[]) {
  const sorted = [...sizes].sort((a, b) => a.width * a.height - b.width * b.height);
  const fitting = sorted.filter((s) => !s.file_size || s.file_size <= 700000);
  return (fitting.at(-1) || sorted[0])!;
}
/** Download a Telegram file as a data URL (the bot token never leaves the server). */
export async function telegramPhotoDataUrl(fileId: string) {
  const file = (await telegramCall("getFile", { file_id: fileId })) as {
    file_path?: string;
    file_size?: number;
  };
  if (!file?.file_path || (file.file_size || 0) > 1400000)
    throw new Error("Фото слишком большое. Отправьте его сжатым, как фото.");
  const r = await fetch(
    `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`,
    { signal: AbortSignal.timeout(20000) },
  );
  if (!r.ok) throw new Error("Не удалось скачать фото из Telegram");
  const bytes = Buffer.from(await r.arrayBuffer());
  if (bytes.length > 1400000) throw new Error("Фото слишком большое.");
  const type = file.file_path.endsWith(".png")
    ? "image/png"
    : file.file_path.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";
  return `data:${type};base64,${bytes.toString("base64")}`;
}
