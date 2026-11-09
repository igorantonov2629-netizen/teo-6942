import { config } from "./config";

/** Локальное время колледжа. date — "YYYY-MM-DD", dow — 0=Пн … 6=Вс, minutes — минуты от полуночи. */
export type LocalNow = { date: string; dow: number; minutes: number };

export function localNow(at: Date = new Date(), tz = config.tz): LocalNow {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return { date, dow: dowOf(date), minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

const toUtc = (date: string) => new Date(`${date}T00:00:00Z`);

export const dowOf = (date: string) => (toUtc(date).getUTCDay() + 6) % 7;

export function addDays(date: string, n: number) {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const daysBetween = (a: string, b: string) =>
  Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86400000);

export const mondayOf = (date: string) => addDays(date, -dowOf(date));

export const hm = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};

export const fmtHM = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
export const MONTHS_NOM = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
export const WEEKDAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
export const WEEKDAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/** "10 ноября" */
export function ruDate(date: string) {
  const d = toUtc(date);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "Вторник, 10 ноября" */
export const ruDayDate = (date: string) => `${WEEKDAYS[dowOf(date)]}, ${ruDate(date)}`;

export const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
