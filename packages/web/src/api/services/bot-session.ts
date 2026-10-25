import { and, eq } from "drizzle-orm";
import { db } from "../database";
import { teoBotSessions } from "../database/schema";

/** Abandoned conversations expire after a day. */
const sessionTtl = 24 * 60 * 60 * 1000;

export type BotSession<T> = { kind: string; step: string; data: T };

export async function getSession<T>(
  userId: number,
): Promise<BotSession<T> | null> {
  const row = (
    await db
      .select()
      .from(teoBotSessions)
      .where(eq(teoBotSessions.userId, userId))
  )[0];
  if (!row) return null;
  if (Date.now() - row.updatedAt > sessionTtl) {
    await clearSession(userId);
    return null;
  }
  return { kind: row.kind, step: row.step, data: JSON.parse(row.data) as T };
}

export async function setSession<T>(
  userId: number,
  kind: string,
  step: string,
  data: T,
) {
  const value = {
    kind,
    step,
    data: JSON.stringify(data),
    updatedAt: Date.now(),
  };
  await db
    .insert(teoBotSessions)
    .values({ userId, ...value })
    .onConflictDoUpdate({ target: teoBotSessions.userId, set: value });
}

/** Atomically move a session from one step to another; false if someone else already did. */
export async function advanceSession<T>(
  userId: number,
  kind: string,
  from: string,
  to: string,
  data?: T,
) {
  const r = await db
    .update(teoBotSessions)
    .set({
      step: to,
      updatedAt: Date.now(),
      ...(data === undefined ? {} : { data: JSON.stringify(data) }),
    })
    .where(
      and(
        eq(teoBotSessions.userId, userId),
        eq(teoBotSessions.kind, kind),
        eq(teoBotSessions.step, from),
      ),
    )
    .returning();
  return r.length > 0;
}

export async function clearSession(userId: number) {
  await db.delete(teoBotSessions).where(eq(teoBotSessions.userId, userId));
}

/**
 * Optimistic read-modify-write of session data. Telegram may deliver album
 * photos as parallel webhook calls, so retry when another update won the race.
 * Returns the new data, or null when the session is gone or on another step.
 */
export async function mutateSession<T>(
  userId: number,
  kind: string,
  step: string,
  change: (data: T) => T,
): Promise<T | null> {
  for (let i = 0; i < 8; i++) {
    const row = (
      await db
        .select()
        .from(teoBotSessions)
        .where(eq(teoBotSessions.userId, userId))
    )[0];
    if (!row || row.kind !== kind || row.step !== step) return null;
    const next = change(JSON.parse(row.data) as T);
    const r = await db
      .update(teoBotSessions)
      .set({ data: JSON.stringify(next), updatedAt: Date.now() })
      .where(
        and(
          eq(teoBotSessions.userId, userId),
          eq(teoBotSessions.step, step),
          eq(teoBotSessions.data, row.data),
        ),
      )
      .returning();
    if (r.length) return next;
  }
  throw new Error("Слишком много одновременных сообщений, повторите.");
}
