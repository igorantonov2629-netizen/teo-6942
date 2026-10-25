import { z } from "zod";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { base } from "../__core/app";
import { tgAuthed, tgModerator, ownerId } from "../services/telegram";
import { db } from "../database";
import { teoSettings, teoUsers } from "../database/schema";
import {
  getSettings,
  issuePayment,
  reportPayment,
  approvePayment,
  advanceOrder,
  cancelUnpaidOrder,
} from "../services/commerce";
import {
  proposeAvailability,
  respondAvailability,
  addArrivalPhotos,
} from "../services/order-review";
import { photoSchema } from "../services/product-schema";
import { maxArrivalPhotos } from "../../shared/availability";
import { priceTiers, type PriceTier } from "../../shared/pricing";
import cities from "../../shared/cities.json";
import { cleanNamePart, fullNameProblems } from "../../shared/full-name";
const rubAmount = z.number().int().min(0).max(100000);
const markupsSchema = z.object(
  Object.fromEntries(
    priceTiers.map((t) => [
      t,
      z.object({ delivery: rubAmount, service: rubAmount }),
    ]),
  ) as Record<
    PriceTier,
    z.ZodObject<{ delivery: typeof rubAmount; service: typeof rubAmount }>
  >,
);
const arrivalPhotos = z
  .array(photoSchema.max(1000000))
  .max(maxArrivalPhotos)
  .optional();
const owner = tgAuthed.use(({ context, next }) => {
  if (context.user.id !== ownerId()) throw new ORPCError("FORBIDDEN");
  return next();
});
export const commerce = {
  cities: base
    .input(z.object({ query: z.string().max(100) }))
    .handler(({ input }) =>
      cities
        .filter((c) =>
          c.name.toLowerCase().includes(input.query.trim().toLowerCase()),
        )
        .slice(0, 50),
    ),
  settings: tgModerator.handler(async ({ context }) => {
    const s = await getSettings();
    return context.user.id === ownerId()
      ? s
      : { ...s, bank: "", recipient: "", details: "" };
  }),
  saveSettings: owner
    .input(
      z.object({
        rate: z.number().positive().max(1000).nullable(),
        markups: markupsSchema,
        bank: z.string().trim().max(100),
        recipient: z.string().trim().max(160),
        details: z.string().trim().max(200),
      }),
    )
    .handler(async ({ input }) => {
      await db
        .insert(teoSettings)
        .values({ id: "commerce", data: JSON.stringify(input) })
        .onConflictDoUpdate({
          target: teoSettings.id,
          set: { data: JSON.stringify(input) },
        });
      return input;
    }),
  destination: tgAuthed
    .input(
      z.object({
        city: z.string().min(1).max(160),
        address: z.string().trim().max(200),
      }),
    )
    .handler(async ({ context, input }) => {
      if (!cities.some((c) => `${c.name}, ${c.region}` === input.city))
        throw new ORPCError("BAD_REQUEST", {
          message: "Выберите город из справочника.",
        });
      await db
        .update(teoUsers)
        .set({
          city: input.city,
          point: input.address ? `${input.city}, ${input.address}` : "",
        })
        .where(eq(teoUsers.id, context.user.id));
      return {
        city: input.city,
        point: input.address ? `${input.city}, ${input.address}` : "",
      };
    }),
  fullName: tgAuthed
    .input(
      z.object({
        lastName: z.string().max(60),
        firstName: z.string().max(60),
        middleName: z.string().max(60),
        noMiddleName: z.boolean(),
      }),
    )
    .handler(async ({ context, input }) => {
      const problems = fullNameProblems(input);
      if (problems.length)
        throw new ORPCError("BAD_REQUEST", { message: problems.join(" ") });
      const value = {
        lastName: cleanNamePart(input.lastName),
        firstName: cleanNamePart(input.firstName),
        middleName: input.noMiddleName ? "" : cleanNamePart(input.middleName),
      };
      await db
        .update(teoUsers)
        .set(value)
        .where(eq(teoUsers.id, context.user.id));
      return value;
    }),
  issue: tgModerator
    .input(
      z.object({
        id: z.string(),
        phase: z.enum(["goods", "shipping"]),
        amount: z.number().positive().max(10000000).optional(),
      }),
    )
    .handler(({ context, input }) =>
      issuePayment(input.id, input.phase, context.user.id, input.amount),
    ),
  cancelUnpaid: tgModerator
    .input(z.object({ id: z.string() }))
    .handler(({ context, input }) =>
      cancelUnpaidOrder(input.id, context.user.id),
    ),
  report: tgAuthed
    .input(
      z.object({
        id: z.string(),
        phase: z.enum(["goods", "shipping"]),
        receipt: z
          .string()
          .max(2000000)
          .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/)
          .optional(),
      }),
    )
    .handler(({ context, input }) =>
      reportPayment(input.id, input.phase, context.user.id, input.receipt),
    ),
  approve: owner
    .input(
      z.object({
        id: z.string(),
        phase: z.enum(["goods", "shipping"]),
        version: z.string().length(8),
      }),
    )
    .handler(({ context, input }) =>
      approvePayment(input.id, input.phase, context.user.id, input.version),
    ),
  advance: tgModerator
    .input(
      z.object({
        id: z.string(),
        status: z.enum([
          "Заказ у меня",
          "Заказ отправлен получателю",
          "Заказ доставлен",
        ]),
        tracking: z.string().trim().max(100).optional(),
        photos: arrivalPhotos,
      }),
    )
    .handler(({ context, input }) =>
      advanceOrder(
        input.id,
        input.status,
        context.user.id,
        input.tracking,
        input.photos,
      ),
    ),
  addPhotos: tgModerator
    .input(
      z.object({
        id: z.string(),
        photos: z.array(photoSchema.max(1000000)).min(1).max(maxArrivalPhotos),
      }),
    )
    .handler(({ input }) => addArrivalPhotos(input.id, input.photos)),
  propose: tgModerator
    .input(
      z.object({
        id: z.string(),
        comment: z.string().trim().max(500).optional(),
        changes: z
          .array(
            z.object({
              index: z.number().int().min(0).max(200),
              remove: z.boolean().optional(),
              variant: z.string().trim().min(1).max(50).optional(),
              price: z.number().int().positive().max(10000000).optional(),
            }),
          )
          .max(200),
      }),
    )
    .handler(({ context, input }) =>
      proposeAvailability(
        input.id,
        context.user.id,
        input.changes,
        input.comment,
      ),
    ),
  respond: tgAuthed
    .input(
      z.object({
        id: z.string(),
        version: z.string().length(8),
        accept: z.boolean(),
      }),
    )
    .handler(({ context, input }) =>
      respondAvailability(
        input.id,
        context.user.id,
        input.version,
        input.accept,
      ),
    ),
};
