import { config } from "./config";
import { clearSession, setSession, type Session, type User } from "./db";
import { esc } from "./messages";
import { groupSubjects } from "./schedule";
import { btn, edit, grid, kb, send } from "./telegram";

/** Заказ конспекта. Ничего из заказа не сохраняется — данные живут только в диалоге и удаляются в конце. */
export const PRICES = { normal: 50, urgent: 75 } as const;
type Kind = keyof typeof PRICES;

type OrderData = { subject?: string; topic?: string; pages?: number; kind?: Kind };

export const orderPrice = (pages: number, kind: Kind) => pages * PRICES[kind];

export function orderMessage(grp: string, o: Required<OrderData>) {
  return [
    "Здравствуйте! Хочу заказать конспект",
    `Группа: ${grp}`,
    `Предмет: ${o.subject}`,
    `Тема: ${o.topic}`,
    `Страниц: ${o.pages} · ${o.kind === "urgent" ? "без очереди" : "обычный"}`,
    `Итого: ${orderPrice(o.pages, o.kind)} ₽`,
  ].join("\n");
}

export const orderLink = (text: string) => `https://t.me/${config.orderContact}?text=${encodeURIComponent(text)}`;

const pagesKeyboard = () => kb([...grid(Array.from({ length: 10 }, (_, i) => btn(String(i + 1), `ord:p:${i + 1}`)), 5), [btn("✖️ Отмена", "ord:x")]]);

export async function startOrder(chatId: number, user: User) {
  if (!user.grp) return send(chatId, "Сначала выбери группу: /start");
  const subjects = groupSubjects(user.grp);
  setSession(chatId, { kind: "order", step: "subject", data: { subjects } });
  await send(
    chatId,
    `📝 <b>Заказ конспекта</b>\nОбычный — ${PRICES.normal} ₽/стр., без очереди — ${PRICES.urgent} ₽/стр.\n\nВыбери предмет:`,
    { reply_markup: kb([...subjects.map((s, i) => [btn(s, `ord:s:${i}`)]), [btn("Другое", "ord:s:other")], [btn("✖️ Отмена", "ord:x")]]) },
  );
}

export async function orderCallback(chatId: number, messageId: number, data: string, user: User, session: Session | null) {
  if (data === "ord:x") {
    clearSession(chatId);
    return edit(chatId, messageId, "Заказ отменён.");
  }
  if (!session || session.kind !== "order" || !user.grp) return edit(chatId, messageId, "Заказ устарел. Нажми «Заказать конспект» ещё раз.");
  const d = session.data as OrderData & { subjects?: string[] };
  const [, kind, value] = data.split(":");

  if (kind === "s") {
    if (value === "other") {
      setSession(chatId, { ...session, step: "subject_text" });
      return edit(chatId, messageId, "Напиши название предмета:");
    }
    const subject = d.subjects?.[Number(value)];
    if (!subject) return;
    setSession(chatId, { ...session, step: "topic", data: { ...d, subject } });
    return edit(chatId, messageId, `Предмет: <b>${esc(subject)}</b>\n\nНапиши тему конспекта:`);
  }
  if (kind === "p") return setPages(chatId, session, Number(value), messageId);
  if (kind === "k" && (value === "normal" || value === "urgent")) {
    const o = { ...d, kind: value as Kind } as Required<OrderData>;
    clearSession(chatId);
    const text = orderMessage(user.grp, o);
    return edit(
      chatId,
      messageId,
      `<b>Твой заказ</b>\n\n${esc(text)}\n\nНажми «Написать конспект» — откроется чат @${config.orderContact} с готовым текстом. Останется нажать «Отправить». Реквизиты и сроки обсуждаются там.`,
      kb([[{ text: "✍️ Написать конспект", url: orderLink(text) }]]),
    );
  }
}

async function setPages(chatId: number, session: Session, pages: number, messageId?: number) {
  if (!Number.isInteger(pages) || pages < 1 || pages > 200) return send(chatId, "Укажи число страниц от 1 до 200.");
  setSession(chatId, { ...session, step: "kind", data: { ...session.data, pages } });
  const text = `Страниц: <b>${pages}</b>\nВыбери тип:`;
  const markup = kb([
    [btn(`Обычный — ${orderPrice(pages, "normal")} ₽`, "ord:k:normal")],
    [btn(`Без очереди — ${orderPrice(pages, "urgent")} ₽`, "ord:k:urgent")],
    [btn("✖️ Отмена", "ord:x")],
  ]);
  return messageId ? edit(chatId, messageId, text, markup) : send(chatId, text, { reply_markup: markup });
}

/** Текстовые ответы внутри заказа. */
export async function orderText(chatId: number, text: string, session: Session) {
  const value = text.trim().slice(0, 300);
  if (!value) return;
  if (session.step === "subject_text") {
    setSession(chatId, { ...session, step: "topic", data: { ...session.data, subject: value } });
    return send(chatId, "Напиши тему конспекта:");
  }
  if (session.step === "topic") {
    setSession(chatId, { ...session, step: "pages", data: { ...session.data, topic: value } });
    return send(chatId, "Сколько страниц? Выбери или напиши число:", { reply_markup: pagesKeyboard() });
  }
  if (session.step === "pages") return setPages(chatId, session, Number(value));
  return send(chatId, "Выбери вариант кнопкой выше или нажми «Отмена».");
}
