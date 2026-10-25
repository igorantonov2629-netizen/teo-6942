import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { tgModerator } from "../services/telegram";
import {
  resolveTaobaoInput,
  TaobaoLinkProblem,
} from "../services/taobao-link";
import { taobaoUrl } from "../../shared/taobao";

export const taobao = {
  /** Moderator pasted a link (maybe short / share text) → canonical item link. */
  resolve: tgModerator
    .input(z.object({ link: z.string().trim().min(1).max(2048) }))
    .handler(async ({ input }) => {
      try {
        return { url: taobaoUrl(await resolveTaobaoInput(input.link)) };
      } catch (e) {
        if (e instanceof TaobaoLinkProblem)
          throw new ORPCError("BAD_REQUEST", { message: e.message });
        throw e;
      }
    }),
};
