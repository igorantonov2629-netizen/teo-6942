import { buyerStageMessage } from "../../shared/order-presentation";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { db } from "../database";
import { teoSettings, teoOrders, teoOutbox } from "../database/schema";
import { normalizeMarkups } from "../../shared/pricing";
import {
  emptySettings,
  shippingNotice,
  goodsIssuedAt,
  unpaidTimeout,
  type CommerceSettings,
  type OrderPayment,
} from "../../shared/commerce";
import type { Order } from "../../shared/teo";
import {
  ownerId,
  openAppMarkup,
  flushMessages,
  telegramCall,
} from "./telegram";

export async function getSettings(): Promise<CommerceSettings> {
  const r = (
    await db.select().from(teoSettings).where(eq(teoSettings.id, "commerce"))
  )[0];
  const stored = r ? (JSON.parse(r.data) as Partial<CommerceSettings>) : {};
  const { rate, bank, recipient, details } = { ...emptySettings, ...stored };
  return {
    rate,
    markups: normalizeMarkups(stored.markups),
    bank,
    recipient,
    details,
  };
}
export function paymentMarkup(
  o: Order,
  phase: "goods" | "shipping",
  version: string,
  confirm = false,
) {
  const action = confirm ? "approve" : "confirm";
  return {
    inline_keyboard: [
      [
        {
          text: confirm ? "Да, деньги поступили" : "Подтвердить поступление",
          callback_data: `pay:${action}:${phase === "goods" ? "g" : "s"}:${o.id.slice(4)}:${version}`,
        },
      ],
      ...(confirm ? [[{ text: "Отмена", callback_data: "pay:cancel" }]] : []),
      ...openAppMarkup().inline_keyboard,
    ],
  };
}
export async function loadOrder(id: string) {
  const row = (
    await db.select().from(teoOrders).where(eq(teoOrders.id, id))
  )[0];
  if (!row) throw new ORPCError("NOT_FOUND", { message: "Заказ не найден." });
  return { row, order: JSON.parse(row.data) as Order };
}
export type Note = { chatId: number; text: string; markup?: unknown; photo?: string };
export async function commit(
  row: { id: string; data: string },
  value: Order,
  notes: Note[],
) {
  // A single atomic batch. Unique revision guards notifications if CAS loses.
  const updated = { ...value, revision: randomUUID() };
  const encoded = JSON.stringify(updated);
  const ids = notes.map(() => `${row.id}:event:${randomUUID()}`);
  const writes = notes.map((n, i) => {
    const data = JSON.stringify({
      chat_id: n.chatId,
      ...(n.photo
        ? { photo: n.photo, caption: n.text.slice(0, 1000) }
        : { text: n.text }),
      reply_markup: n.markup || openAppMarkup(),
    });
    return db.insert(teoOutbox).select(sql`SELECT
      ${ids[i]!}, ${n.chatId}, ${n.photo ? "sendPhoto" : "sendMessage"},
      ${data}, 'pending', 0, ${Date.now()}, NULL, NULL
      WHERE EXISTS (SELECT 1 FROM ${teoOrders}
        WHERE ${teoOrders.id} = ${row.id} AND ${teoOrders.data} = ${encoded})`);
  });
  const [changed] = await db.batch([
    db
      .update(teoOrders)
      .set({ data: encoded })
      .where(and(eq(teoOrders.id, row.id), eq(teoOrders.data, row.data)))
      .returning(),
    ...writes,
  ]);
  if (!changed.length)
    throw new ORPCError("CONFLICT", {
      message: "Заказ уже изменён. Обновите приложение.",
    });
  return { order: updated, notifications: await flushMessages(ids) };
}
export function buyerNote(o: Order, text: string): Note {
  return {
    chatId: o.userId!,
    text: `Заказ ${o.id}\n${text}\n\nВсе детали и следующий шаг — в вашем заказе в приложении.`,
  };
}
export function photoNotes(o: Order, photos: string[]): Note[] {
  return photos.map((photo, i) => ({
    chatId: o.userId!,
    photo,
    text: `Заказ ${o.id} · фото ${i + 1}/${photos.length}`,
  }));
}
export function withStage(o: Order, status: string, actor: number): Order {
  return {
    ...o,
    status,
    history: [...(o.history || []), { status, at: Date.now(), actor }],
  };
}
export async function issuePayment(
  id: string,
  phase: "goods" | "shipping",
  actor: number,
  amount?: number,
) {
  const { row, order: o } = await loadOrder(id);
  const s = await getSettings();
  requireRequisites(s);
  if (phase === "goods" && o.status !== "Заявка принята")
    throw new ORPCError("CONFLICT", {
      message: "Счёт за товар уже выставлен или заказ на другом этапе.",
    });
  if (
    phase === "shipping" &&
    (o.status !== "Заказ у меня" || o.goodsPayment?.state !== "approved")
  )
    throw new ORPCError("CONFLICT", {
      message: "Доставку выставляем после оплаты товара и получения на склад.",
    });
  const payment = newPayment(s, phase === "goods" ? o.total : amount!);
  const value = withStage(
    { ...o, [phase === "goods" ? "goodsPayment" : "shippingPayment"]: payment },
    phase === "goods" ? "Ожидает оплаты товара" : "Ожидает оплаты доставки",
    actor,
  );
  return commit(row, value, [invoiceNote(value, phase, payment.amount)]);
}
export function requireRequisites(s: CommerceSettings) {
  if (!s.bank || !s.recipient || !s.details)
    throw new ORPCError("BAD_REQUEST", {
      message: "Владелец должен заполнить реквизиты оплаты.",
    });
}
export function newPayment(s: CommerceSettings, amount: number): OrderPayment {
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000)
    throw new ORPCError("BAD_REQUEST", { message: "Некорректная сумма." });
  return {
    amount,
    issuedAt: Date.now(),
    state: "waiting",
    version: randomUUID().slice(0, 8),
    bank: s.bank,
    recipient: s.recipient,
    details: s.details,
  };
}
export function invoiceNote(
  value: Order,
  phase: "goods" | "shipping",
  amount: number,
) {
  return buyerNote(
    value,
    `${buyerStageMessage(value.status)}\nК оплате: ${amount} ₽.\n${phase === "goods" ? shippingNotice : "Это отдельный счёт за доставку, товар уже оплачен."}`,
  );
}
export async function cancelUnpaidOrder(id: string, actor: number) {
  const { row, order: o } = await loadOrder(id);
  const issuedAt = goodsIssuedAt(o);
  if (
    !issuedAt ||
    Date.now() - issuedAt < unpaidTimeout ||
    !["Ожидает оплаты товара", "Проверяем оплату товара"].includes(o.status) ||
    !o.goodsPayment ||
    !["waiting", "pending"].includes(o.goodsPayment.state)
  )
    throw new ORPCError("CONFLICT", {
      message:
        "Отмена доступна через 30 минут после счёта за товар, пока поступление денег не подтверждено.",
    });
  const value = withStage(
    {
      ...o,
      goodsPayment: {
        ...o.goodsPayment,
        state: "cancelled",
        cancelledAt: Date.now(),
        cancelledBy: actor,
      },
    },
    "Заказ отменён: товар не оплачен",
    actor,
  );
  return commit(row, value, [
    buyerNote(value, buyerStageMessage(value.status)),
  ]);
}
export async function reportPayment(
  id: string,
  phase: "goods" | "shipping",
  actor: number,
  receipt?: string,
) {
  const { row, order: o } = await loadOrder(id);
  if (o.userId !== actor) throw new ORPCError("FORBIDDEN");
  const key = phase === "goods" ? "goodsPayment" : "shippingPayment";
  const payment = o[key];
  if (!payment || payment.state !== "waiting")
    throw new ORPCError("CONFLICT", {
      message: "Оплата уже отправлена на проверку или счёт ещё не выставлен.",
    });
  const value = withStage(
    {
      ...o,
      [key]: { ...payment, state: "pending", receipt, submittedAt: Date.now() },
    },
    phase === "goods" ? "Проверяем оплату товара" : "Проверяем оплату доставки",
    actor,
  );
  return commit(row, value, [
    buyerNote(
      value,
      `${buyerStageMessage(value.status)}\nСумма на проверке: ${payment.amount} ₽.`,
    ),
    {
      chatId: ownerId(),
      text: `${o.buyerName || "Покупатель"} ${o.username ? "@" + o.username : "ID " + o.userId}\nТелефон: ${o.phone || "—"}\nЗаказ ${o.id}\nПроверить оплату ${phase === "goods" ? "товара" : "доставки"}: ${payment.amount} ₽.\nПроверьте поступление на счёт, чек не подтверждает оплату.`,
      markup: paymentMarkup(o, phase, payment.version),
      photo: receipt,
    },
  ]);
}
export async function approvePayment(
  id: string,
  phase: "goods" | "shipping",
  actor: number,
  version: string,
) {
  if (actor !== ownerId())
    throw new ORPCError("FORBIDDEN", {
      message: "Оплату подтверждает только владелец.",
    });
  const { row, order: o } = await loadOrder(id);
  const key = phase === "goods" ? "goodsPayment" : "shippingPayment";
  const p = o[key];
  if (!p || p.state !== "pending" || p.version !== version)
    throw new ORPCError("CONFLICT", {
      message: "Оплата уже проверена или кнопка устарела.",
    });
  const value = withStage(
    {
      ...o,
      [key]: {
        ...p,
        state: "approved",
        approvedAt: Date.now(),
        approvedBy: actor,
      },
    },
    phase === "goods" ? "В пути к поставщику" : "Доставка оплачена",
    actor,
  );
  return commit(row, value, [
    buyerNote(
      value,
      `${buyerStageMessage(value.status)}\nПолучено: ${p.amount} ₽.`,
    ),
  ]);
}
export async function advanceOrder(
  id: string,
  status: string,
  actor: number,
  tracking?: string,
  photos: string[] = [],
) {
  const { row, order: o } = await loadOrder(id);
  if (photos.length && status !== "Заказ у меня")
    throw new ORPCError("BAD_REQUEST", {
      message: "Фото прикладываются, когда заказ приехал.",
    });
  const valid =
    (status === "Заказ у меня" &&
      o.status === "В пути к поставщику" &&
      o.goodsPayment?.state === "approved") ||
    (status === "Заказ отправлен получателю" &&
      o.status === "Доставка оплачена" &&
      o.shippingPayment?.state === "approved") ||
    (status === "Заказ доставлен" && o.status === "Заказ отправлен получателю");
  if (!valid)
    throw new ORPCError("CONFLICT", {
      message: "Нельзя пропускать этапы или отправлять неоплаченный заказ.",
    });
  if (status === "Заказ отправлен получателю" && !tracking?.trim())
    throw new ORPCError("BAD_REQUEST", { message: "Укажите трек-номер СДЭК." });
  const value = withStage(
    {
      ...o,
      ...(tracking ? { tracking: tracking.trim() } : {}),
      ...(photos.length ? { arrivalPhotos: photos } : {}),
    },
    status,
    actor,
  );
  return commit(row, value, [
    buyerNote(
      value,
      `${buyerStageMessage(status)}${value.tracking ? "\nТрек-номер СДЭК: " + value.tracking : ""}${photos.length ? "\nФото вашего заказа — ниже и в приложении." : ""}`,
    ),
    ...photoNotes(value, photos),
  ]);
}
export async function handlePaymentCallback(c: {
  id: string;
  data?: string;
  from: { id: number };
  message?: { message_id: number; chat: { id: number; type: string } };
}) {
  let text = "Действие недоступно.";
  try {
    if (
      c.from.id !== ownerId() ||
      c.message?.chat.id !== ownerId() ||
      c.message.chat.type !== "private"
    )
      throw new Error("Оплату подтверждает только владелец.");
    const match = c.data?.match(
      /^pay:(confirm|approve):(g|s):([a-f0-9-]{36}):([a-f0-9]{8})$/,
    );
    if (c.data === "pay:cancel") {
      await telegramCall("editMessageReplyMarkup", {
        chat_id: c.from.id,
        message_id: c.message.message_id,
        reply_markup: openAppMarkup(),
      });
      text =
        "Подтверждение отменено. Проверить оплату можно в панели владельца.";
    } else if (match) {
      const phase = match[2] === "g" ? "goods" : "shipping";
      const { order } = await loadOrder("TEO-" + match[3]);
      const p = phase === "goods" ? order.goodsPayment : order.shippingPayment;
      if (!p || p.state !== "pending" || p.version !== match[4])
        throw new Error("Оплата уже проверена или кнопка устарела.");
      if (match[1] === "confirm") {
        await telegramCall("editMessageReplyMarkup", {
          chat_id: c.from.id,
          message_id: c.message.message_id,
          reply_markup: paymentMarkup(order, phase, p.version, true),
        });
        text = `Подтвердите поступление ${p.amount} ₽ на ваш счёт.`;
      } else {
        await approvePayment(order.id, phase, c.from.id, p.version);
        text = "Оплата подтверждена, уведомление покупателю сохранено.";
        try {
          await telegramCall("editMessageReplyMarkup", {
            chat_id: c.from.id,
            message_id: c.message.message_id,
            reply_markup: openAppMarkup(),
          });
        } catch {
          /* Stale buttons are also rejected server-side. */
        }
      }
    }
  } catch (e) {
    text = e instanceof Error ? e.message : "Не удалось подтвердить оплату.";
  }
  await telegramCall("answerCallbackQuery", {
    callback_query_id: c.id,
    text: text.slice(0, 200),
    show_alert: true,
  });
}
