/**
 * Проверка, что данные курсантов скрыты:
 *   bun run check-privacy
 * 1) файл базы и папка закрыты для других пользователей сервера (0600 / 0700);
 * 2) в базе нет колонок с персональными данными (имя, username, телефон, текст переписки);
 * 3) .env и база не попадают в git;
 * 4) в исходниках нет токенов;
 * 5) у бота нет HTTP-сервера (данные нельзя получить по сети).
 */
import { Database } from "bun:sqlite";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { config } from "../src/config";
import { openDb, closeDb } from "../src/db";

const root = join(import.meta.dir, "..");
const problems: string[] = [];
const ok = (s: string) => console.log(`✅ ${s}`);

// --- 1. Права на файл базы ---
const dbPath = join(root, config.dbPath.replace(/^\.\//, ""));
if (!existsSync(dbPath)) {
  openDb(dbPath); // создаём пустую базу, чтобы проверить права и схему
  closeDb();
}
const mode = (p: string) => statSync(p).mode & 0o777;
if (mode(dbPath) & 0o077) problems.push(`файл базы доступен другим пользователям (права ${mode(dbPath).toString(8)}), нужно 600`);
else ok(`файл базы: права ${mode(dbPath).toString(8)}`);
if (mode(dirname(dbPath)) & 0o077) problems.push(`папка базы доступна другим (права ${mode(dirname(dbPath)).toString(8)}), нужно 700`);
else ok(`папка базы: права ${mode(dirname(dbPath)).toString(8)}`);

// --- 2. Схема: никаких персональных данных ---
const db = new Database(dbPath, { readonly: true });
const PII = /name|username|phone|first|last|email|address|birth|passport|message|text_in/i;
const ALLOWED = new Set(["duties.name", "duties_mgu.name", "absences.name", "ads.text", "ads.button_text", "announcements.text"]); // админские данные, не курсантов
for (const { name: table } of db.query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()) {
  for (const { name: col } of db.query<{ name: string }, []>(`PRAGMA table_info("${table}")`).all())
    if (PII.test(col) && !ALLOWED.has(`${table}.${col}`)) problems.push(`колонка ${table}.${col} похожа на персональные данные`);
}
const userCols = db.query<{ name: string }, []>("PRAGMA table_info(users)").all().map((c) => c.name);
ok(`о курсанте хранится только: ${userCols.join(", ")}`);
const stale = db.query<{ n: number }, [number]>("SELECT COUNT(*) AS n FROM sessions WHERE updated_at < ?").get(Date.now() - 24 * 3600 * 1000)!.n;
if (stale) problems.push(`в базе ${stale} старых незавершённых диалогов (удалятся в 4:00 автоматически)`);
db.close();

// --- 3. git: .env и база не коммитятся ---
const gitCheck = (p: string) => Bun.spawnSync(["git", "check-ignore", "-q", p], { cwd: root }).exitCode === 0;
for (const p of [".env", "data/myday.db", "data/x.db-wal"])
  if (!gitCheck(p)) problems.push(`${p} не в .gitignore`);
  else ok(`${p} игнорируется git`);
const tracked = Bun.spawnSync(["git", "ls-files", "."], { cwd: root }).stdout.toString().split("\n");
if (tracked.some((f) => /(^|\/)\.env$|\.db$/.test(f))) problems.push("в git уже лежит .env или файл базы");

// --- 4. Исходники: нет токенов и секретов ---
const TOKEN = /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/;
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));
const sources = ["src", "test", "tools"].flatMap((d) => files(join(root, d)));
for (const f of sources) {
  const s = readFileSync(f, "utf8");
  if (TOKEN.test(s)) problems.push(`похоже на токен бота в ${f}`);
}
ok(`в ${sources.length} файлах исходников токенов нет`);

// --- 5. Нет входящего HTTP ---
if (sources.some((f) => f.includes("/src/") && /Bun\.serve|createServer|listen\(/.test(readFileSync(f, "utf8"))))
  problems.push("в коде бота найден HTTP-сервер — данные могут быть доступны по сети");
else ok("у бота нет HTTP-сервера, база доступна только на самом сервере");

if (problems.length) {
  console.log("\n❌ Найдены проблемы:");
  for (const p of problems) console.log(` - ${p}`);
  process.exit(1);
}
console.log("\nВсё в порядке: данные курсантов скрыты.");
