import { config } from "./config";
import { markBlocked } from "./db";

export type InlineButton = { text: string; callback_data?: string; url?: string };
export type InlineKeyboard = { inline_keyboard: InlineButton[][] };

export class TgError extends Error {
  constructor(
    public code: number,
    description: string,
    public retryAfter?: number,
  ) {
    super(`Telegram ${code}: ${description}`);
  }
}

type Transport = (method: string, params: Record<string, unknown>) => Promise<any>;

/** Убирает токен из любых текстов ошибок, чтобы он не попал в логи. */
export const redact = (s: string) => (config.token ? s.split(config.token).join("<token>") : s);

const httpTransport: Transport = async (method, params) => {
  let res: Response;
  try {
    // Файлы (Blob) отправляются multipart-формой, всё остальное — JSON.
    const hasFile = Object.values(params).some((v) => v instanceof Blob);
    let init: RequestInit;
    if (hasFile) {
      const form = new FormData();
      for (const [k, v] of Object.entries(params))
        if (v instanceof Blob) form.append(k, v, (v as File).name ?? "file");
        else if (v !== undefined) form.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
      init = { method: "POST", body: form };
    } else init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params) };
    res = await fetch(`https://api.telegram.org/bot${config.token}/${method}`, init);
  } catch (e) {
    throw new Error(redact(`Сеть: ${(e as Error).message}`));
  }
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: unknown; error_code?: number; description?: string; parameters?: { retry_after?: number } };
  if (!body.ok) throw new TgError(body.error_code ?? res.status, redact(body.description ?? "error"), body.parameters?.retry_after);
  return body.result;
};

let transport: Transport = httpTransport;
/** Для тестов: подменить отправку в Telegram. */
export const setTransport = (t: Transport | null) => {
  transport = t ?? httpTransport;
};

export async function tg<T = any>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await transport(method, params);
    } catch (e) {
      if (e instanceof TgError && e.code === 429 && attempt < 3) {
        await Bun.sleep(((e.retryAfter ?? 1) + 0.5) * 1000);
        continue;
      }
      throw e;
    }
  }
}

/** Отправка с обработкой «пользователь заблокировал бота». Возвращает message или null. */
export async function send(chatId: number, text: string, extra: Record<string, unknown> = {}) {
  return safe(chatId, () => tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...extra }));
}

export async function safe<T>(chatId: number, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof TgError && (e.code === 403 || (e.code === 400 && /chat not found|user is deactivated/i.test(e.message)))) {
      markBlocked(chatId);
      return null;
    }
    console.error(redact(String((e as Error).message)));
    return null;
  }
}

/** Рассылка с ограничением скорости (~25 сообщений в секунду). Возвращает число доставленных. */
export async function broadcast(chatIds: number[], sendOne: (chatId: number) => Promise<unknown>) {
  let ok = 0;
  for (const id of chatIds) {
    if (await sendOne(id)) ok++;
    await Bun.sleep(40);
  }
  return ok;
}

export const answer = (callbackId: string, text?: string) =>
  tg("answerCallbackQuery", { callback_query_id: callbackId, ...(text ? { text } : {}) }).catch(() => null);

export async function edit(chatId: number, messageId: number, text: string, markup?: InlineKeyboard) {
  try {
    await tg("editMessageText", { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...(markup ? { reply_markup: markup } : {}) });
  } catch (e) {
    if (e instanceof TgError && /not modified/i.test(e.message)) return;
    await send(chatId, text, markup ? { reply_markup: markup } : {});
  }
}

export const kb = (rows: InlineButton[][]): InlineKeyboard => ({ inline_keyboard: rows });
export const btn = (text: string, callback_data: string): InlineButton => ({ text, callback_data });

/** Раскладывает кнопки по рядам. */
export function grid(buttons: InlineButton[], perRow: number) {
  const rows: InlineButton[][] = [];
  for (let i = 0; i < buttons.length; i += perRow) rows.push(buttons.slice(i, i + perRow));
  return rows;
}
