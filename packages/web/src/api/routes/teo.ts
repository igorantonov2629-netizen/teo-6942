import { fullNameOf, type FullNameFields } from "../../shared/full-name";
import { z } from "zod";
import {
  photoSchema,
  productInput,
} from "../services/product-schema";
import { publishProblems } from "../../shared/product-rules";
import { buyerStageMessage } from "../../shared/order-presentation";
import { randomUUID } from "node:crypto";
import { eq, desc, and } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { base } from "../__core/app";
import { actOnPhoto, photoRequestMarkup } from "../services/photo-workflow";
import { getSettings } from "../services/commerce";
import { withExpiry } from "../services/order-review";
import { storeProduct, ProductProblem } from "../services/product-store";
import { shippingNotice } from "../../shared/commerce";
import { priceBreakdown } from "../../shared/pricing";
import cities from "../../shared/cities.json";
import { db } from "../database";
import {
  teoProducts,
  teoOrders,
  teoRequests,
  teoUsers,
  teoReviews,
  teoOutbox,
} from "../database/schema";
import {
  initialProducts,
  type Product,
  type Order,
  type PhotoRequest,
} from "../../shared/teo";
import {
  tgAuthed,
  tgModerator,
  requireContact,
  queueMessage,
  flushMessages,
  requireFullName,
  moderatorIds,
  appUrl,
  openAppMarkup,
} from "../services/telegram";

async function catalog() {
  let rows = await db.select().from(teoProducts);
  if (!rows.length) {
    await db
      .insert(teoProducts)
      .values(
        initialProducts.map((p) => ({ id: p.id, data: JSON.stringify(p) })),
      )
      .onConflictDoNothing();
    rows = await db.select().from(teoProducts);
  }
  const s = await getSettings();
  return rows.map((r) => {
    const p = JSON.parse(r.data) as Product;
    const calculated = p.taobaoYuan ? priceBreakdown(p.taobaoYuan, s, p) : null;
    // yuanPrice is legacy (percent model); the ruble price is the only buyer price.
    return {
      ...p,
      ...(calculated ? { price: calculated.rub } : {}),
      yuanPrice: undefined,
    };
  });
}
function buyerInfo(
  user: {
    id: number;
    username: string | null;
    name: string;
    phone: string | null;
  } & FullNameFields,
) {
  const fio = fullNameOf(user);
  return `${fio ? `ФИО: ${fio}\n` : ""}${user.name}\n${user.username ? "@" + user.username : "Username не задан"} · ID ${user.id}\nТелефон: ${user.phone || "не указан"}`;
}
export const teo = {
  catalog: base.handler(async () =>
    (await catalog())
      .filter((p) => !p.hidden)
      .map(({ sourcing: _sourcing, ...p }) => p),
  ),
  profile: tgAuthed.handler(({ context }) => context.user),
  point: tgAuthed
    .input(z.object({ point: z.string().min(1).max(300) }))
    .handler(async ({ context, input }) => {
      await db
        .update(teoUsers)
        .set({ point: input.point })
        .where(eq(teoUsers.id, context.user.id));
      return { ok: true };
    }),
  orders: tgAuthed.handler(async ({ context }) =>
    withExpiry(
      await db
        .select()
        .from(teoOrders)
        .where(eq(teoOrders.userId, context.user.id))
        .orderBy(desc(teoOrders.createdAt)),
    ),
  ),
  requests: tgAuthed.handler(async ({ context }) =>
    (
      await db
        .select()
        .from(teoRequests)
        .where(eq(teoRequests.userId, context.user.id))
        .orderBy(desc(teoRequests.createdAt))
    ).map((r) => JSON.parse(r.data) as PhotoRequest),
  ),
  createOrder: tgAuthed
    .input(
      z.object({
        key: z.string().uuid(),
        point: z.string().min(3).max(300),
        city: z.string().min(1).max(160),
        items: z
          .array(
            z.object({
              productId: z.number().int().positive(),
              qty: z.number().int().min(1).max(99),
              variant: z.string().min(1).max(100),
            }),
          )
          .min(1)
          .max(50),
      }),
    )
    .handler(async ({ context, input }) => {
      requireContact(context.user);
      requireFullName(context.user);
      if (
        !cities.some((c) => `${c.name}, ${c.region}` === input.city) ||
        !input.point.startsWith(input.city + ", ") ||
        input.point.length < input.city.length + 5
      )
        throw new ORPCError("BAD_REQUEST", {
          message: "Выберите город и укажите адрес ПВЗ.",
        });
      const id = "TEO-" + input.key;
      const existing = (
        await db.select().from(teoOrders).where(eq(teoOrders.id, id))
      )[0];
      if (existing) {
        if (existing.userId !== context.user.id)
          throw new ORPCError("FORBIDDEN");
        return {
          order: JSON.parse(existing.data) as Order,
          notifications: await flushMessages(),
        };
      }
      const products = await catalog();
      const items = input.items.map((c) => {
        const p = products.find((p) => p.id === c.productId && !p.hidden);
        if (!p)
          throw new ORPCError("BAD_REQUEST", {
            message: "Товар больше недоступен. Обновите корзину.",
          });
        const variants = p.clothing
          ? p.sizes?.length
            ? p.sizes
            : ["Размер уточнит модератор"]
          : p.category === "Одежда"
            ? ["S", "M", "L", "XL"]
            : p.category === "Обувь"
              ? ["36", "37", "38", "39", "40", "41"]
              : [p.color];
        if (!variants.includes(c.variant))
          throw new ORPCError("BAD_REQUEST", {
            message: "Выберите доступный размер или цвет.",
          });
        return {
          ...c,
          name: p.name,
          price: p.price,
          image: p.image,
          taobao: p.taobao,
          taobaoYuan: p.taobaoYuan,
        };
      });
      const order: Order = {
        id,
        items,
        total: items.reduce((a, c) => a + c.price * c.qty, 0),
        point: input.point,
        status: "Заявка принята",
        date: new Date().toLocaleDateString("ru-RU"),
        userId: context.user.id,
        username: context.user.username,
        phone: context.user.phone,
        buyerName: context.user.name,
        recipient: fullNameOf(context.user),
        city: input.city,
        history: [
          { status: "Заявка принята", at: Date.now(), actor: context.user.id },
        ],
      };
      const lines = items
        .map(
          (c) =>
            `${c.name} · ${c.variant} · ${c.qty} шт. · ${c.price * c.qty} ₽\nhttps://item.taobao.com/item.htm?id=${c.taobao}`,
        )
        .join("\n\n");
      const recipients = await moderatorIds();
      await db.transaction(async (tx) => {
        await tx.insert(teoOrders).values({
          id,
          userId: context.user.id,
          data: JSON.stringify(order),
          createdAt: Date.now(),
        });
        await tx
          .update(teoUsers)
          .set({ point: input.point, city: input.city })
          .where(eq(teoUsers.id, context.user.id));
        const message = `Новая заявка ${id}\n\n${buyerInfo(context.user)}\n\n${lines}\n\nТовары: ${order.total} ₽\nПВЗ: ${input.point}\nОплата не проведена. Доставка согласуется отдельно.`;
        for (const chatId of recipients)
          await tx
            .insert(teoOutbox)
            .values({
              id: `${id}:moder:${chatId}`,
              chatId,
              method: "sendMessage",
              data: JSON.stringify({
                chat_id: chatId,
                text: message,
                reply_markup: openAppMarkup(),
              }),
              createdAt: Date.now(),
            })
            .onConflictDoNothing();
        await tx.insert(teoOutbox).values({
          id: `${id}:buyer`,
          chatId: context.user.id,
          method: "sendMessage",
          data: JSON.stringify({
            chat_id: context.user.id,
            text: `Заказ ${id}\n${buyerStageMessage("Заявка принята")}\n\n${lines}\n\nТовары: ${order.total} ₽\nПВЗ: ${input.point}\nСначала подтвердим наличие, затем выставим оплату товара.\n${shippingNotice}\n\nСледить за товаром можно в приложении.`,
            reply_markup: openAppMarkup(),
          }),
          createdAt: Date.now(),
        });
      });
      return { order, notifications: await flushMessages() };
    }),
  createRequest: tgAuthed
    .input(
      z.object({
        key: z.string().uuid(),
        image: photoSchema,
        comment: z.string().max(1500),
      }),
    )
    .handler(async ({ context, input }) => {
      requireContact(context.user);
      const id = "REQ-" + input.key;
      const existing = (
        await db.select().from(teoRequests).where(eq(teoRequests.id, id))
      )[0];
      if (existing) {
        if (existing.userId !== context.user.id)
          throw new ORPCError("FORBIDDEN");
        return {
          request: JSON.parse(existing.data) as PhotoRequest,
          notifications: await flushMessages(),
        };
      }
      const request: PhotoRequest = {
        id,
        image: input.image,
        comment: input.comment,
        status: "Новый",
        userId: context.user.id,
        username: context.user.username,
        phone: context.user.phone,
        buyerName: context.user.name,
      };
      const recipients = await moderatorIds();
      await db.transaction(async (tx) => {
        await tx.insert(teoRequests).values({
          id,
          userId: context.user.id,
          data: JSON.stringify(request),
          createdAt: Date.now(),
        });
        for (const chatId of recipients)
          await tx.insert(teoOutbox).values({
            id: `${id}:moder:${chatId}`,
            chatId,
            method: "sendPhoto",
            data: JSON.stringify({
              chat_id: chatId,
              photo: input.image,
              caption: `Фото-поиск ${id}\n${buyerInfo(context.user)}\n${input.comment.slice(0, 500)}`,
              reply_markup: photoRequestMarkup(request, chatId),
            }),
            createdAt: Date.now(),
          });
        await tx.insert(teoOutbox).values({
          id: `${id}:buyer`,
          chatId: context.user.id,
          method: "sendPhoto",
          data: JSON.stringify({
            chat_id: context.user.id,
            photo: input.image,
            caption: `📷 Фото-запрос ${id} принят! Поможем найти вашу находку и свяжемся с вами.\n${input.comment.slice(0, 500)}\n\nСледить за поиском можно в приложении.`,
            reply_markup: openAppMarkup(),
          }),
          createdAt: Date.now(),
        });
      });
      return { request, notifications: await flushMessages() };
    }),
  admin: tgModerator.handler(async ({ context }) => ({
    products: await catalog(),
    orders: await withExpiry(
      await db.select().from(teoOrders).orderBy(desc(teoOrders.createdAt)),
    ),
    requests: (
      await db.select().from(teoRequests).orderBy(desc(teoRequests.createdAt))
    ).map((r) => JSON.parse(r.data) as PhotoRequest),
    users:
      context.user.role === "owner" ? await db.select().from(teoUsers) : [],
    pendingNotifications: (
      await db.select().from(teoOutbox).where(eq(teoOutbox.state, "pending"))
    ).length,
  })),
  saveProduct: tgModerator
    .input(productInput)
    .handler(async ({ input: raw }) => {
      try {
        return await storeProduct(raw);
      } catch (e) {
        if (e instanceof ProductProblem)
          throw new ORPCError("BAD_REQUEST", { message: e.message });
        throw e;
      }
    }),
  hideProduct: tgModerator
    .input(z.object({ id: z.number(), hidden: z.boolean() }))
    .handler(async ({ input }) => {
      const row = (
        await db.select().from(teoProducts).where(eq(teoProducts.id, input.id))
      )[0];
      if (!row) throw new ORPCError("NOT_FOUND");
      const p = JSON.parse(row.data) as Product;
      if (!input.hidden) {
        const problems = publishProblems(p);
        if (problems.length)
          throw new ORPCError("BAD_REQUEST", {
            message: "Нельзя вернуть в каталог: " + problems.join(" "),
          });
      }
      await db
        .update(teoProducts)
        .set({ data: JSON.stringify({ ...p, hidden: input.hidden }) })
        .where(eq(teoProducts.id, input.id));
      return { ok: true };
    }),
  setRequest: tgModerator
    .input(
      z.object({
        id: z.string(),
        status: z.enum(["Новый", "В поиске", "Найден", "Добавлен"]),
        productId: z.number().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const row = (
        await db.select().from(teoRequests).where(eq(teoRequests.id, input.id))
      )[0];
      if (!row) throw new ORPCError("NOT_FOUND");
      const r = JSON.parse(row.data) as PhotoRequest;
      if (r.assignedTo && r.assignedTo !== context.user.id)
        throw new ORPCError("CONFLICT", {
          message: `Запрос уже взял ${r.assignedName}.`,
        });
      if (
        input.productId &&
        !(await catalog()).some((p) => p.id === input.productId && !p.hidden)
      )
        throw new ORPCError("BAD_REQUEST", {
          message: "Выберите доступный товар.",
        });
      if (input.status === "Добавлен" && !input.productId)
        throw new ORPCError("BAD_REQUEST", {
          message: "Привяжите найденный товар.",
        });
      const value = { ...r, status: input.status, productId: input.productId };
      const updated = await db
        .update(teoRequests)
        .set({ data: JSON.stringify(value) })
        .where(and(eq(teoRequests.id, row.id), eq(teoRequests.data, row.data)))
        .returning();
      if (!updated.length)
        throw new ORPCError("CONFLICT", {
          message: "Запрос изменён другим модератором. Обновите панель.",
        });
      await queueMessage(
        `${row.id}:status:${randomUUID()}`,
        row.userId,
        "sendMessage",
        {
          text: `🔎 Фото-запрос ${row.id}: ${{ Новый: "Приняли фото — скоро начнём поиск!", "В поиске": "Ищем вашу находку! Сообщим, когда появится результат.", Найден: "Ваша находка найдена! Модератор поможет с деталями.", Добавлен: "Товар добавлен в каталог — можно открыть и оформить заявку." }[input.status]}\nСледить за поиском можно в приложении.${input.productId ? "\nВаш товар: " + appUrl() + "/?product=" + input.productId : ""}`,
          reply_markup: openAppMarkup(),
        },
      );
      return { request: value, notifications: await flushMessages() };
    }),
  retryNotifications: tgModerator.handler(() => flushMessages()),
  photoAction: tgModerator
    .input(z.object({ id: z.string(), action: z.enum(["claim", "done"]) }))
    .handler(({ context, input }) =>
      actOnPhoto(input.id, input.action, context.user),
    ),
  reviews: base
    .input(z.object({ productId: z.number() }))
    .handler(async ({ input }) =>
      (
        await db
          .select()
          .from(teoReviews)
          .where(eq(teoReviews.productId, input.productId))
      ).map(
        (r) =>
          JSON.parse(r.data) as {
            id: string;
            name: string;
            text: string;
            rating: number;
            date: string;
          },
      ),
    ),
  addReview: tgAuthed
    .input(
      z.object({
        productId: z.number(),
        name: z.string().trim().min(1).max(60),
        text: z.string().trim().min(1).max(2000),
        rating: z.number().int().min(1).max(5),
      }),
    )
    .handler(async ({ context, input }) => {
      const value = {
        ...input,
        id: randomUUID(),
        date: new Date().toLocaleDateString("ru-RU"),
      };
      await db.insert(teoReviews).values({
        id: value.id,
        productId: input.productId,
        userId: context.user.id,
        data: JSON.stringify(value),
      });
      return value;
    }),
};
