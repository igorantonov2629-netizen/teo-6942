import { config } from "./config";
import { getUpdateOffset, openDb, setUpdateOffset } from "./db";
import { seedDuties } from "./admin-menu";
import { handleUpdate } from "./bot";
import { startScheduler, stopScheduler } from "./scheduler";
import { redact, tg } from "./telegram";
import type { TgUpdate } from "./types";

if (!config.token) {
  console.error("Не задан BOT_TOKEN в .env");
  process.exit(1);
}
if (!config.adminIds.size) console.warn("ADMIN_IDS не задан — админ-команды недоступны никому.");

openDb();
seedDuties();

const STUDENT_COMMANDS = [
  { command: "schedule", description: "Расписание: сегодня, завтра, неделя" },
  { command: "today", description: "Пары на сегодня" },
  { command: "tomorrow", description: "Пары на завтра" },
  { command: "week", description: "Расписание на неделю" },
  { command: "menu", description: "Меню столовой" },
  { command: "duty", description: "Дежурные по МИК и МГУ" },
  { command: "order", description: "Заказать конспект" },
  { command: "teacher", description: "Где преподаватель, его пары" },
  { command: "market", description: "Барахолка" },
  { command: "jobs", description: "Подработка: задания за деньги" },
  { command: "settings", description: "Группа и уведомления" },
  { command: "support", description: "Поддержка" },
];
const ADMIN_COMMANDS = [
  { command: "setmenu", description: "Отправить меню (/меню)" },
  { command: "duties", description: "Дежурные на месяц (/дежурные)" },
  { command: "sub", description: "Замена или отмена пары (/замена)" },
  { command: "announce", description: "Объявление (/объявление)" },
  { command: "ad", description: "Реклама (/реклама)" },
  { command: "ads", description: "Список рекламы" },
  { command: "mod", description: "Барахолка: модерация (/барахолка)" },
  { command: "modjobs", description: "Подработка: модерация (/подработка)" },
  { command: "countdown", description: "Обратный отсчёт (/отсчёт)" },
  { command: "backup", description: "Копия базы (/бэкап)" },
  { command: "stats", description: "Статистика (/статистика)" },
  { command: "cancel", description: "Прервать диалог" },
];

const DESCRIPTION =
  "Вся информация жизни МИК!\nПриемы пищи, расписание, заказать конспекты - все, что тебе нужно уже здесь, в удобном интерфейсе!\n\nПоддержка - @sanekhelper";
const SHORT_DESCRIPTION = "Вся информация жизни МИК! Поддержка - @sanekhelper";

async function setup() {
  // Бот работает через long polling: никакого входящего HTTP-порта наружу.
  await tg("deleteWebhook", { drop_pending_updates: false });
  await tg("setMyCommands", { commands: STUDENT_COMMANDS });
  await tg("setMyDescription", { description: DESCRIPTION }).catch(() => null);
  await tg("setMyShortDescription", { short_description: SHORT_DESCRIPTION }).catch(() => null);
  for (const id of config.adminIds)
    await tg("setMyCommands", { commands: [...STUDENT_COMMANDS, ...ADMIN_COMMANDS], scope: { type: "chat", chat_id: id } }).catch(() => null);
  const me = await tg<{ username: string }>("getMe");
  console.log(`Бот @${me.username} запущен. Часовой пояс: ${config.tz}.`);
}

let stopping = false;

async function poll() {
  let offset = getUpdateOffset();
  while (!stopping) {
    try {
      const updates = await tg<TgUpdate[]>("getUpdates", { offset, timeout: 30, allowed_updates: ["message", "callback_query"] });
      for (const u of updates) {
        if (u.update_id < offset) continue; // уже обработано до перезапуска
        offset = u.update_id + 1;
        setUpdateOffset(offset);
        try {
          await handleUpdate(u);
        } catch (e) {
          console.error("Ошибка обработки:", redact((e as Error).message));
        }
      }
    } catch (e) {
      console.error("getUpdates:", redact((e as Error).message));
      await Bun.sleep(3000);
    }
  }
}

for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, () => {
    stopping = true;
    stopScheduler();
    setTimeout(() => process.exit(0), 500);
  });

await setup();
startScheduler();
await poll();
