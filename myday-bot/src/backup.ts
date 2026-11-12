import { config } from "./config";
import { getDb } from "./db";
import { safe, tg } from "./telegram";
import { localNow } from "./time";

/**
 * Резервная копия базы: целый снимок SQLite, сжатый gzip, уходит админам в личку
 * (без звука). Восстановить: распаковать в data/myday.db и перезапустить бота.
 */
export function backupFile(date: string) {
  const bytes = Bun.gzipSync(new Uint8Array(getDb().serialize()));
  return new File([bytes], `myday-${date}.db.gz`, { type: "application/gzip" });
}

export async function sendBackup(to: number[] = [...config.adminIds]) {
  const date = localNow().date;
  const users = getDb().query<{ n: number }, []>("SELECT COUNT(*) AS n FROM users WHERE blocked = 0").get()!.n;
  let ok = 0;
  for (const id of to) {
    const file = backupFile(date);
    const res = await safe(id, () =>
      tg("sendDocument", {
        chat_id: id,
        document: file,
        caption: `💾 Резервная копия базы за ${date.split("-").reverse().join(".")}\nПользователей: ${users} · ${Math.ceil(file.size / 1024)} КБ\nХрани в секрете: внутри chat_id курсантов.`,
        disable_notification: true,
      }),
    );
    if (res) ok++;
  }
  return ok;
}
