import { autoRetry } from "@grammyjs/auto-retry";
import { Bot, type Api, type Context, type NextFunction } from "grammy";
import type { MaybeInaccessibleMessage } from "grammy/types";
import { withChatLock } from "./chat-lock";
import { config } from "./config";
import type { User } from "./contract";
import { core } from "./core-client";
import { errMsg, log } from "./logger";
import { begin, finish } from "./placeholder";
import { toMessages } from "./render";

const TEXT_ONLY = "Поки що я розумію лише текст. Опишіть проблему словами.";
const CORE_DOWN = "Сервіс тимчасово недоступний, спробуйте за хвилину.";
const TOO_MANY = "Забагато повідомлень, зачекайте хвилину.";

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 15;
const DOUBLE_TAP_MS = 10_000;

function userOf(ctx: Context): User | undefined {
  const from = ctx.from;
  if (!from) return undefined;
  return { firstName: from.first_name, username: from.username, languageCode: from.language_code };
}

const buckets = new Map<number, { start: number; count: number; warned: boolean }>();

async function rateLimit(ctx: Context, next: NextFunction) {
  const id = ctx.chat?.id;
  if (id === undefined) return next();
  const now = Date.now();
  let b = buckets.get(id);
  if (!b || now - b.start > RATE_WINDOW_MS) {
    b = { start: now, count: 0, warned: false };
    buckets.set(id, b);
  }
  if (++b.count <= RATE_LIMIT) return next();
  if (ctx.callbackQuery) await ctx.answerCallbackQuery().catch(() => {});
  if (!b.warned) {
    b.warned = true;
    await ctx.reply(TOO_MANY).catch(() => {});
  }
  log("warn", "rate limited", { chatId: id });
}

const pressed = new Map<string, number>();

function isDoubleTap(key: string): boolean {
  const now = Date.now();
  const last = pressed.get(key);
  if (last && now - last < DOUBLE_TAP_MS) return true;
  pressed.set(key, now);
  if (pressed.size > 1000) {
    for (const [k, at] of pressed) if (now - at > DOUBLE_TAP_MS) pressed.delete(k);
  }
  return false;
}

// removes the keyboard from the pressed message and notes what was chosen
async function markChosen(api: Api, chatId: string, msg: MaybeInaccessibleMessage, data: string) {
  if (!("text" in msg) || !msg.text) return;
  const label = msg.reply_markup?.inline_keyboard
    .flat()
    .find((b) => "callback_data" in b && b.callback_data === data)?.text;
  const text = label ? `${msg.text}\n\n› ${label}` : msg.text;
  await api
    .editMessageText(chatId, msg.message_id, text, { reply_markup: { inline_keyboard: [] } })
    .catch((err) => log("warn", "mark chosen failed", { chatId, error: errMsg(err) }));
}

export function createBot() {
  const bot = new Bot(config.BOT_TOKEN);
  bot.api.config.use(autoRetry());

  // direct messages only
  const dm = bot.chatType("private");
  dm.use(rateLimit);

  dm.on("message:text", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const text = ctx.message.text;
    await withChatLock(chatId, async () => {
      begin(ctx.api, chatId);
      const started = Date.now();
      try {
        const replies = await core.chat({ chatId, text, user: userOf(ctx) });
        log("info", "chat", { chatId, ms: Date.now() - started, replies: replies.length });
        await finish(ctx.api, chatId, toMessages(replies));
      } catch (err) {
        log("error", "core chat failed", { chatId, ms: Date.now() - started, error: errMsg(err) });
        await finish(ctx.api, chatId, [{ text: CORE_DOWN }]);
      }
    });
  });

  dm.on("callback_query:data", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const data = ctx.callbackQuery.data;
    const msg = ctx.callbackQuery.message;
    await ctx.answerCallbackQuery().catch(() => {});
    if (isDoubleTap(`${chatId}:${msg?.message_id}:${data}`)) return;

    await withChatLock(chatId, async () => {
      begin(ctx.api, chatId);
      const started = Date.now();
      try {
        const replies = await core.button({ chatId, data, user: userOf(ctx) });
        log("info", "button", { chatId, ms: Date.now() - started, replies: replies.length });
        if (msg) await markChosen(ctx.api, chatId, msg, data);
        await finish(ctx.api, chatId, toMessages(replies));
      } catch (err) {
        // keyboard stays so the user can press again
        log("error", "core button failed", { chatId, ms: Date.now() - started, error: errMsg(err) });
        await finish(ctx.api, chatId, [{ text: CORE_DOWN }]);
      }
    });
  });

  dm.on("message", (ctx) => ctx.reply(TEXT_ONLY));

  bot.catch((err) => log("error", "unhandled bot error", { error: errMsg(err.error) }));
  return bot;
}
