import type { teoUsers } from "../database/schema";
import type { TelegramPhotoSize } from "./telegram";

export type BotUser = typeof teoUsers.$inferSelect;

export type BotMessage = {
  message_id: number;
  from?: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    is_bot?: boolean;
  };
  chat: { id: number; type: string };
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  media_group_id?: string;
  contact?: { phone_number: string; user_id?: number };
};

export type BotCallback = {
  id: string;
  data?: string;
  from: { id: number; first_name: string; username?: string; is_bot?: boolean };
  message?: { message_id: number; chat: { id: number; type: string } };
};

export const cancelHint = "Отменить: /cancel";
