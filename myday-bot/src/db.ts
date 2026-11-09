import { Database } from "bun:sqlite";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config";

/**
 * Приватность по устройству:
 *  - о курсанте хранится только chat_id, курс, группа и флаг уведомлений —
 *    без имени, username, телефона и текста переписки;
 *  - у бота нет HTTP-сервера и API: базу можно прочитать только с самого сервера;
 *  - файл базы и папка доступны только владельцу процесса (0600 / 0700);
 *  - все запросы параметризованы (без подстановки строк в SQL).
 */
let db: Database | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  chat_id INTEGER PRIMARY KEY,
  course INTEGER,
  grp TEXT,
  notify INTEGER NOT NULL DEFAULT 1,
  blocked INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  chat_id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  step TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS menus (
  date TEXT PRIMARY KEY,
  breakfast TEXT, lunch TEXT, dinner TEXT,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS duties (
  date TEXT PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS duties_mgu (
  date TEXT PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS absences (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS overrides (
  grp TEXT NOT NULL,
  date TEXT NOT NULL,
  pair INTEGER NOT NULL,
  kind TEXT NOT NULL,
  subject TEXT, room TEXT, teacher TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (grp, date, pair)
);
CREATE TABLE IF NOT EXISTS ads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  photo TEXT,
  button_text TEXT, button_url TEXT,
  erid TEXT,
  audience TEXT NOT NULL,
  start_date TEXT NOT NULL,
  time TEXT NOT NULL,
  repeat TEXT NOT NULL DEFAULT 'none',
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ad_deliveries (
  chat_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  ad_id INTEGER NOT NULL,
  PRIMARY KEY (chat_id, date)
);
CREATE TABLE IF NOT EXISTS ad_clicks (
  ad_id INTEGER NOT NULL,
  chat_id INTEGER NOT NULL,
  PRIMARY KEY (ad_id, chat_id)
);
CREATE TABLE IF NOT EXISTS jobs_done (
  key TEXT PRIMARY KEY,
  at INTEGER NOT NULL
);
`;

export function openDb(path = config.dbPath) {
  if (path !== ":memory:") {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
    try {
      chmodSync(dir, 0o700);
    } catch {}
  }
  db = new Database(path, { create: true, strict: true });
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  if (path !== ":memory:") {
    for (const f of [path, `${path}-wal`, `${path}-shm`])
      if (existsSync(f))
        try {
          chmodSync(f, 0o600);
        } catch {}
  }
  return db;
}

export function getDb() {
  if (!db) throw new Error("База не открыта");
  return db;
}

export function closeDb() {
  db?.close();
  db = null;
}

// ---------- пользователи ----------
export type User = { chat_id: number; course: number | null; grp: string | null; notify: number; blocked: number };

export const getUser = (chatId: number) =>
  getDb().query<User, [number]>("SELECT chat_id, course, grp, notify, blocked FROM users WHERE chat_id = ?").get(chatId);

export function ensureUser(chatId: number) {
  getDb()
    .query("INSERT INTO users (chat_id, created_at) VALUES (?, ?) ON CONFLICT(chat_id) DO UPDATE SET blocked = 0")
    .run(chatId, Date.now());
  return getUser(chatId)!;
}

export const setUserGroup = (chatId: number, course: number, grp: string) =>
  getDb().query("UPDATE users SET course = ?, grp = ? WHERE chat_id = ?").run(course, grp, chatId);

export const setNotify = (chatId: number, on: boolean) =>
  getDb().query("UPDATE users SET notify = ? WHERE chat_id = ?").run(on ? 1 : 0, chatId);

export const markBlocked = (chatId: number) =>
  getDb().query("UPDATE users SET blocked = 1 WHERE chat_id = ?").run(chatId);

export type Audience = { type: "all" } | { type: "course"; course: number } | { type: "groups"; groups: string[] };

/** Получатели рассылки. includeMuted — для «Важных» объявлений. */
export function audienceChatIds(aud: Audience, includeMuted = false): number[] {
  const where = ["grp IS NOT NULL", "blocked = 0"];
  const args: (string | number)[] = [];
  if (!includeMuted) where.push("notify = 1");
  if (aud.type === "course") {
    where.push("course = ?");
    args.push(aud.course);
  } else if (aud.type === "groups") {
    if (!aud.groups.length) return [];
    where.push(`grp IN (${aud.groups.map(() => "?").join(",")})`);
    args.push(...aud.groups);
  }
  return getDb()
    .query<{ chat_id: number }, typeof args>(`SELECT chat_id FROM users WHERE ${where.join(" AND ")}`)
    .all(...args)
    .map((r) => r.chat_id);
}

// ---------- пошаговые диалоги ----------
export type Session = { kind: string; step: string; data: Record<string, unknown> };

export function getSession(chatId: number): Session | null {
  const row = getDb()
    .query<{ kind: string; step: string; data: string; updated_at: number }, [number]>(
      "SELECT kind, step, data, updated_at FROM sessions WHERE chat_id = ?",
    )
    .get(chatId);
  if (!row) return null;
  if (Date.now() - row.updated_at > 24 * 3600 * 1000) {
    clearSession(chatId);
    return null;
  }
  return { kind: row.kind, step: row.step, data: JSON.parse(row.data) };
}

export const setSession = (chatId: number, s: Session) =>
  getDb()
    .query(
      `INSERT INTO sessions (chat_id, kind, step, data, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(chat_id) DO UPDATE SET kind = excluded.kind, step = excluded.step, data = excluded.data, updated_at = excluded.updated_at`,
    )
    .run(chatId, s.kind, s.step, JSON.stringify(s.data), Date.now());

export const clearSession = (chatId: number) => getDb().query("DELETE FROM sessions WHERE chat_id = ?").run(chatId);

/** Удаляет брошенные диалоги (в них может быть тема конспекта и т.п.). */
export const purgeOldSessions = () =>
  getDb().query("DELETE FROM sessions WHERE updated_at < ?").run(Date.now() - 24 * 3600 * 1000);

// ---------- меню ----------
export type Menu = { breakfast: string | null; lunch: string | null; dinner: string | null };

export const getMenu = (date: string) =>
  getDb().query<Menu, [string]>("SELECT breakfast, lunch, dinner FROM menus WHERE date = ?").get(date);

export const saveMenu = (date: string, m: Menu) =>
  getDb()
    .query(
      `INSERT INTO menus (date, breakfast, lunch, dinner, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET breakfast = excluded.breakfast, lunch = excluded.lunch, dinner = excluded.dinner, updated_at = excluded.updated_at`,
    )
    .run(date, m.breakfast, m.lunch, m.dinner, Date.now());

// ---------- дежурные ----------
/** mik — дежурный по МИК, mgu — дежурный по МГУ. */
export type DutyKind = "mik" | "mgu";
const dutyTable = (kind: DutyKind) => (kind === "mgu" ? "duties_mgu" : "duties");

export const getDuty = (date: string, kind: DutyKind = "mik") =>
  getDb().query<{ name: string }, [string]>(`SELECT name FROM ${dutyTable(kind)} WHERE date = ?`).get(date)?.name ?? null;

export function saveDuties(entries: { date: string; name: string }[], kind: DutyKind = "mik") {
  const d = getDb();
  const stmt = d.query(`INSERT INTO ${dutyTable(kind)} (date, name) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET name = excluded.name`);
  d.transaction(() => entries.forEach((e) => stmt.run(e.date, e.name)))();
}

// ---------- болеющие преподаватели ----------
export type Absence = { key: string; name: string };
export const listAbsences = () => getDb().query<Absence, []>("SELECT key, name FROM absences ORDER BY name").all();
export const addAbsence = (key: string, name: string) =>
  getDb().query("INSERT INTO absences (key, name, created_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET name = excluded.name").run(key, name, Date.now());
export const removeAbsence = (key: string) => getDb().query("DELETE FROM absences WHERE key = ?").run(key).changes > 0;

// ---------- замены ----------
export type Override = { grp: string; date: string; pair: number; kind: "cancel" | "replace"; subject: string | null; room: string | null; teacher: string | null };

export const getOverrides = (grp: string, date: string) =>
  getDb().query<Override, [string, string]>("SELECT grp, date, pair, kind, subject, room, teacher FROM overrides WHERE grp = ? AND date = ?").all(grp, date);

export const saveOverride = (o: Override) =>
  getDb()
    .query(
      `INSERT INTO overrides (grp, date, pair, kind, subject, room, teacher, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(grp, date, pair) DO UPDATE SET kind = excluded.kind, subject = excluded.subject, room = excluded.room, teacher = excluded.teacher, created_at = excluded.created_at`,
    )
    .run(o.grp, o.date, o.pair, o.kind, o.subject, o.room, o.teacher, Date.now());

export const deleteOverride = (grp: string, date: string, pair: number) =>
  getDb().query("DELETE FROM overrides WHERE grp = ? AND date = ? AND pair = ?").run(grp, date, pair);

// ---------- разовые задачи планировщика ----------
/** true, если задача ещё не выполнялась (и отмечает её выполненной). */
export function claimJob(key: string) {
  return getDb().query("INSERT INTO jobs_done (key, at) VALUES (?, ?) ON CONFLICT(key) DO NOTHING").run(key, Date.now()).changes > 0;
}

export const purgeOldJobs = () =>
  getDb().query("DELETE FROM jobs_done WHERE at < ?").run(Date.now() - 14 * 24 * 3600 * 1000);
