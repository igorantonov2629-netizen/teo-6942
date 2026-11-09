import { config } from "./config";
import { audienceChatIds, claimJob, getDb, getMenu, purgeOldJobs, purgeOldSessions, type Audience } from "./db";
import { adMarkup, adPost, AD_FROM, AD_TO, sendPost, stopAd, type Ad } from "./admin-post";
import { dutyMissingText, menuMissingText, morningAt, upcomingMissingDuties } from "./admin-menu";
import { mealReminderText, morningText, pairReminderText, tomorrowText } from "./messages";
import { dayPairs, mealTime, PAIRS, type Meal } from "./schedule";
import { broadcast, send } from "./telegram";
import { addDays, daysBetween, hm, localNow, type LocalNow } from "./time";

/** Если бот был выключен дольше этого, пропущенную рассылку уже не шлём. */
const GRACE = 5;

type Job = { key: string; at: number; run: () => Promise<unknown> };

/** Группы → chat_id курсантов с включёнными уведомлениями. */
function usersByGroup() {
  const map = new Map<string, number[]>();
  for (const r of getDb()
    .query<{ chat_id: number; grp: string }, []>("SELECT chat_id, grp FROM users WHERE grp IS NOT NULL AND notify = 1 AND blocked = 0")
    .all()) {
    if (!map.has(r.grp)) map.set(r.grp, []);
    map.get(r.grp)!.push(r.chat_id);
  }
  return map;
}

async function perGroup(build: (grp: string) => string | null) {
  let n = 0;
  for (const [grp, ids] of usersByGroup()) {
    const text = build(grp);
    if (text) n += await broadcast(ids, (id) => send(id, text));
  }
  return n;
}

const toAdmins = (text: string) => Promise.all([...config.adminIds].map((id) => send(id, text)));

/** Все плановые рассылки на день. */
export function dailyJobs(now: LocalNow): Job[] {
  const { date, dow } = now;
  const jobs: Job[] = [
    { key: `morning:${date}`, at: morningAt(dow), run: () => perGroup((g) => morningText(g, date)) },
    { key: `evening:${date}`, at: hm("19:00"), run: () => perGroup((g) => tomorrowText(g, addDays(date, 1), true)) },
    { key: `menu-check:${date}`, at: morningAt(dow), run: async () => (getMenu(date) ? null : toAdmins(menuMissingText(date))) },
    {
      key: `duty-check:${date}`,
      at: hm("12:00"),
      run: async () => {
        const missing = upcomingMissingDuties(date, 3);
        return missing.length ? toAdmins(dutyMissingText(missing)) : null;
      },
    },
  ];
  for (const meal of ["lunch", "dinner"] as Meal[])
    jobs.push({ key: `meal-${meal}:${date}`, at: mealTime(meal, dow) - 15, run: () => perGroup(() => mealReminderText(meal, date)) });
  if (dow < 6)
    for (const p of PAIRS)
      jobs.push({
        key: `pair${p.n}:${date}`,
        at: p.start - 10,
        run: () =>
          perGroup((g) => {
            const pair = dayPairs(g, date)[p.n - 1];
            return pair.lesson ? pairReminderText(pair) : null;
          }),
      });
  return jobs;
}

/** Нужно ли показывать рекламу сегодня. */
export function adDueToday(ad: Pick<Ad, "start_date" | "repeat">, date: string) {
  if (ad.repeat === "none") return ad.start_date === date;
  if (date < ad.start_date) return false;
  return ad.repeat === "daily" || daysBetween(ad.start_date, date) % 7 === 0;
}

export async function runAds(now: LocalNow) {
  if (now.minutes < AD_FROM || now.minutes >= AD_TO) return;
  const ads = getDb().query<Ad, []>("SELECT * FROM ads WHERE active = 1").all();
  for (const ad of ads) {
    if (!adDueToday(ad, now.date) || hm(ad.time) > now.minutes) {
      if (ad.repeat === "none" && ad.start_date < now.date) stopAd(ad.id);
      continue;
    }
    if (!claimJob(`ad:${ad.id}:${now.date}`)) continue;
    const post = adPost(ad);
    const markup = adMarkup(ad.id, ad.button_text);
    const db = getDb();
    const take = db.query("INSERT INTO ad_deliveries (chat_id, date, ad_id) VALUES (?, ?, ?) ON CONFLICT DO NOTHING");
    const ids = audienceChatIds(JSON.parse(ad.audience) as Audience);
    await broadcast(ids, async (id) => {
      // Не больше одного рекламного поста в день на человека.
      if (take.run(id, now.date, ad.id).changes === 0) return null;
      const ok = await sendPost(id, post, markup);
      if (!ok) db.query("DELETE FROM ad_deliveries WHERE chat_id = ? AND date = ? AND ad_id = ?").run(id, now.date, ad.id);
      return ok;
    });
    if (ad.repeat === "none") stopAd(ad.id);
  }
}

export async function tick(now: LocalNow = localNow()) {
  for (const job of dailyJobs(now)) {
    if (now.minutes < job.at || now.minutes > job.at + GRACE) continue;
    if (!claimJob(job.key)) continue;
    try {
      await job.run();
    } catch (e) {
      console.error(`Задача ${job.key}:`, (e as Error).message);
    }
  }
  await runAds(now).catch((e) => console.error("Реклама:", (e as Error).message));
  if (now.minutes === hm("4:00")) {
    purgeOldSessions();
    purgeOldJobs();
  }
}

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

export function startScheduler() {
  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await tick();
    } finally {
      running = false;
    }
  }, 20_000);
}

export const stopScheduler = () => timer && clearInterval(timer);

