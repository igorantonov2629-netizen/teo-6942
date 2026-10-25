import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const teoUsers = sqliteTable("teo_users", {
  id: integer("id").primaryKey(),
  username: text("username"),
  name: text("name").notNull(),
  phone: text("phone"),
  consentAt: integer("consent_at"),
  started: integer("started", { mode: "boolean" }).notNull().default(false),
  role: text("role").notNull().default("buyer"),
  point: text("point").notNull().default(""),
  city: text("city").notNull().default(""),
  // ФИО получателя для СДЭК. middleName "" = у пользователя нет отчества.
  lastName: text("last_name"),
  firstName: text("first_name"),
  middleName: text("middle_name"),
});
export const teoSettings = sqliteTable("teo_settings", {
  id: text("id").primaryKey(),
  data: text("data").notNull(),
});
export const teoProducts = sqliteTable("teo_products", {
  id: integer("id").primaryKey(),
  data: text("data").notNull(),
});
export const teoOrders = sqliteTable("teo_orders", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull(),
  data: text("data").notNull(),
  createdAt: integer("created_at").notNull(),
});
export const teoRequests = sqliteTable("teo_requests", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull(),
  data: text("data").notNull(),
  createdAt: integer("created_at").notNull(),
});
export const teoReviews = sqliteTable("teo_reviews", {
  id: text("id").primaryKey(),
  productId: integer("product_id").notNull(),
  userId: integer("user_id").notNull(),
  data: text("data").notNull(),
});
export const teoUpdates = sqliteTable("teo_updates", {
  id: integer("id").primaryKey(),
  state: text("state").notNull().default("processing"),
  createdAt: integer("created_at").notNull(),
});
/** Step-by-step bot conversations (product wizard, owner broadcast). */
export const teoBotSessions = sqliteTable("teo_bot_sessions", {
  userId: integer("user_id").primaryKey(),
  kind: text("kind").notNull(),
  step: text("step").notNull(),
  data: text("data").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
export const teoOutbox = sqliteTable("teo_outbox", {
  id: text("id").primaryKey(),
  chatId: integer("chat_id").notNull(),
  method: text("method").notNull(),
  data: text("data").notNull(),
  state: text("state").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  processingAt: integer("processing_at"),
  messageId: integer("message_id"),
});

/**
 * Define your database schema here, then apply it with `bun run db:push`
 * (from packages/web). Re-export any generated schema from this file
 * (e.g. Better Auth's auth-schema.ts) so drizzle generates complete migrations.
 * Table patterns and conventions: skills/app/references/api.md
 */
