import { randomUUID } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { buyerStageMessage } from "../../shared/order-presentation";
import {
  availabilityTimeout,
  maxArrivalPhotos,
  proposalStatus,
  declinedStatus,
  expiredStatus,
  unavailableStatus,
  normalizeChanges,
  applyChanges,
  itemsTotal,
  describeChange,
  proposalExpired,
  type ItemChange,
} from "../../shared/availability";
import type { Order } from "../../shared/teo";
import {
  loadOrder,
  commit,
  buyerNote,
  withStage,
  getSettings,
  requireRequisites,
  newPayment,
  invoiceNote,
  photoNotes,
  issuePayment,
  type Note,
} from "./commerce";
import { moderatorIds } from "./telegram";

const deadline = (at: number) =>
  new Date(at).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Vladivostok",
  });

async function staffNotes(text: string): Promise<Note[]> {
  return (await moderatorIds()).map((chatId) => ({ chatId, text }));
}

/**
 * Moderator's availability review. No changes → goods invoice right away.
 * Every line removed → order cancelled. Otherwise the buyer has 3 hours to accept.
 */
export async function proposeAvailability(
  id: string,
  actor: number,
  raw: ItemChange[],
  comment = "",
) {
  const { row, order: o } = await loadOrder(id);
  if (o.status !== "Заявка принята")
    throw new ORPCError("CONFLICT", {
      message: "Наличие уже проверено или заказ на другом этапе.",
    });
  const changes = normalizeChanges(o.items, raw);
  if (!changes.length) return issuePayment(id, "goods", actor);
  const items = applyChanges(o.items, changes);
  const now = Date.now();
  const text = changes.map((c) => "• " + describeChange(o.items[c.index]!, c));
  const note = comment.trim() ? `\nКомментарий: ${comment.trim()}` : "";
  if (!items.length) {
    const value = withStage(
      {
        ...o,
        availability: {
          changes,
          comment: comment.trim() || undefined,
          total: 0,
          proposedAt: now,
          expiresAt: now,
          proposedBy: actor,
          version: randomUUID().slice(0, 8),
          state: "declined",
          decidedAt: now,
        },
      },
      unavailableStatus,
      actor,
    );
    return commit(row, value, [
      buyerNote(value, `${buyerStageMessage(value.status)}\n${text.join("\n")}${note}`),
    ]);
  }
  // Fail early: the buyer's "agree" must be able to issue the invoice.
  requireRequisites(await getSettings());
  const total = itemsTotal(items);
  const expiresAt = now + availabilityTimeout;
  const value = withStage(
    {
      ...o,
      availability: {
        changes,
        comment: comment.trim() || undefined,
        total,
        proposedAt: now,
        expiresAt,
        proposedBy: actor,
        version: randomUUID().slice(0, 8),
        state: "proposed",
      },
    },
    proposalStatus,
    actor,
  );
  return commit(row, value, [
    buyerNote(
      value,
      `${buyerStageMessage(value.status)}\n${text.join("\n")}${note}\nНовая сумма за товары: ${total} ₽ (было ${o.total} ₽).\nОтветьте до ${deadline(expiresAt)} (Владивосток), иначе заказ отменится.`,
    ),
  ]);
}

export async function respondAvailability(
  id: string,
  actor: number,
  version: string,
  accept: boolean,
) {
  const { row, order: o } = await loadOrder(id);
  if (o.userId !== actor) throw new ORPCError("FORBIDDEN");
  const a = o.availability;
  if (o.status !== proposalStatus || !a || a.state !== "proposed" || a.version !== version)
    throw new ORPCError("CONFLICT", {
      message: "Предложение уже неактуально. Обновите приложение.",
    });
  if (proposalExpired(o)) {
    await expireOrder(row, o);
    throw new ORPCError("CONFLICT", {
      message: "Время на ответ истекло, заказ отменён.",
    });
  }
  const now = Date.now();
  const buyer = o.buyerName || (o.username ? "@" + o.username : `ID ${o.userId}`);
  if (!accept) {
    const value = withStage(
      { ...o, availability: { ...a, state: "declined", decidedAt: now } },
      declinedStatus,
      actor,
    );
    return commit(row, value, [
      buyerNote(value, buyerStageMessage(value.status)),
      ...(await staffNotes(`Заказ ${o.id}: ${buyer} не принял изменения, заказ отменён.`)),
    ]);
  }
  const s = await getSettings();
  requireRequisites(s);
  const items = applyChanges(o.items, a.changes);
  const total = itemsTotal(items);
  const payment = newPayment(s, total);
  const value = withStage(
    {
      ...o,
      items,
      total,
      originalItems: o.items,
      availability: { ...a, state: "accepted", decidedAt: now },
      goodsPayment: payment,
    },
    "Ожидает оплаты товара",
    actor,
  );
  return commit(row, value, [
    invoiceNote(value, "goods", total),
    ...(await staffNotes(`Заказ ${o.id}: ${buyer} согласился с изменениями, счёт ${total} ₽ выставлен.`)),
  ]);
}

async function expireOrder(row: { id: string; data: string }, o: Order) {
  const value = withStage(
    { ...o, availability: { ...o.availability!, state: "expired", decidedAt: Date.now() } },
    expiredStatus,
    0,
  );
  return commit(row, value, [
    buyerNote(value, buyerStageMessage(value.status)),
    ...(await staffNotes(`Заказ ${o.id}: покупатель не ответил за 3 часа, заказ отменён.`)),
  ]);
}

/** Lazy 3-hour timeout: applied whenever orders are read. CAS keeps it single-shot. */
export async function withExpiry(rows: { id: string; data: string }[]) {
  return Promise.all(
    rows.map(async (row) => {
      const o = JSON.parse(row.data) as Order;
      if (!proposalExpired(o)) return o;
      try {
        return (await expireOrder(row, o)).order;
      } catch {
        return (await loadOrder(row.id)).order;
      }
    }),
  );
}

export async function addArrivalPhotos(id: string, photos: string[]) {
  const { row, order: o } = await loadOrder(id);
  if (o.status !== "Заказ у меня" || o.goodsPayment?.state !== "approved")
    throw new ORPCError("CONFLICT", {
      message: "Фото добавляются, пока заказ у вас на складе.",
    });
  const all = [...(o.arrivalPhotos || []), ...photos];
  if (all.length > maxArrivalPhotos)
    throw new ORPCError("BAD_REQUEST", {
      message: `Не больше ${maxArrivalPhotos} фото на заказ.`,
    });
  const value = { ...o, arrivalPhotos: all };
  return commit(row, value, [
    buyerNote(value, "📸 Добавили новые фото вашего заказа."),
    ...photoNotes(value, photos),
  ]);
}
