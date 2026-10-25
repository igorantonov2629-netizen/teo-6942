import type { RouterClient } from "@orpc/server";
import { createApp } from "./__core/app";
import { ping } from "./routes/ping";
import { teo } from "./routes/teo";
import { commerce } from "./routes/commerce";
import { taobao } from "./routes/taobao";
import { checkWebhookSecret, handleBotUpdate } from "./services/bot-webhook";

// API features are oRPC procedures, one file per feature in ./routes/,
// composed into this router — typed end-to-end via the clients
// (web: src/web/lib/api.ts, mobile: lib/api.ts).
// Keep each routes/ file under 500 lines (`bun run lint` enforces this);
// split into more feature files as they grow.
// Patterns and examples: skills/app/references/api.md
export const router = {
  ping,
  teo,
  commerce,
  taobao,
};

export type AppRouter = typeof router;
/** Typed client for the router — used by the web and mobile api clients. */
export type AppRouterClient = RouterClient<AppRouter>;

const app = createApp(router);
app.post("/api/webhooks/telegram", async (c) => {
  if (
    !checkWebhookSecret(c.req.header("X-Telegram-Bot-Api-Secret-Token") || "")
  )
    return c.json({ error: "Unauthorized" }, 401);
  if (Number(c.req.header("content-length")) > 200000)
    return c.json({ error: "Too large" }, 413);
  try {
    await handleBotUpdate(await c.req.json());
    return c.json({ ok: true }, 200);
  } catch {
    return c.json({ error: "Processing failed" }, 500);
  }
});
// Rare plain-HTTP endpoints (webhooks, streaming, the Better Auth handler)
// register here with full paths, e.g. app.post("/api/webhooks/example", ...)

export default app;
