/** Все настройки читаются из переменных окружения (.env). Секреты в коде не хранятся. */
export const config = {
  get token() {
    return process.env.BOT_TOKEN || "";
  },
  /** Числовые Telegram ID админов через запятую. Только они видят админ-команды. */
  get adminIds(): Set<number> {
    return new Set(
      (process.env.ADMIN_IDS || "")
        .split(/[,\s]+/)
        .map(Number)
        .filter((n) => Number.isSafeInteger(n) && n > 0),
    );
  },
  get dbPath() {
    return process.env.DB_PATH || "./data/myday.db";
  },
  get tz() {
    return process.env.TIMEZONE || "Asia/Vladivostok";
  },
  /** Понедельник любой верхней недели. Дальше недели чередуются автоматически. */
  get upperWeekStart() {
    return process.env.UPPER_WEEK_START || "2026-11-09";
  },
  /** Поддержка (username без @). */
  get supportContact() {
    return (process.env.SUPPORT_CONTACT || "sanekhelper").replace(/^@/, "");
  },
  /** Куда отправлять заказ конспекта (username без @). */
  get orderContact() {
    return (process.env.ORDER_CONTACT || "sanekhelper").replace(/^@/, "");
  },
};

export const isAdmin = (id: number) => config.adminIds.has(id);
