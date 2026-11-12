export type TgUser = { id: number; is_bot?: boolean; username?: string };
export type TgMessage = {
  message_id: number;
  from?: TgUser;
  chat: { id: number; type: string };
  text?: string;
  caption?: string;
  photo?: { file_id: string; width: number; height: number }[];
};
export type TgCallback = { id: string; from: TgUser; data?: string; message?: TgMessage };
export type TgUpdate = { update_id: number; message?: TgMessage; callback_query?: TgCallback };

/** Текст или фото с подписью, которые админ прислал для поста. */
export type Post = { text: string; photo?: string };

export function postFromMessage(m: TgMessage): Post | null {
  if (m.photo?.length) return { photo: m.photo[m.photo.length - 1].file_id, text: (m.caption || "").trim() };
  const text = (m.text || "").trim();
  return text ? { text } : null;
}
