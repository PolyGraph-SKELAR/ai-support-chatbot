// «🔎 Досліджую…» message shown while the core is working (PLAN.md F3).
import type { Api } from "grammy";
import type { InlineKeyboardMarkup } from "grammy/types";
import { errMsg, log } from "./logger";
import { sendMessages, type OutMessage } from "./render";

const HEADER = "🔎 Досліджую…";
const DONE_HEADER = "🔎 Що я перевірив:";
const SHOW_AFTER_MS = 1000;
const LONG_WAIT_MS = 10_000;
const EDIT_INTERVAL_MS = 1000;
const MAX_STEPS = 15;

type State = {
  api: Api;
  startedAt: number;
  steps: string[];
  messageId?: number;
  creating?: Promise<void>;
  showTimer?: NodeJS.Timeout;
  editTimer?: NodeJS.Timeout;
  lastEditAt: number;
};

const active = new Map<string, State>();

function body(s: State, header = HEADER): string {
  return [header, ...s.steps.slice(-MAX_STEPS).map((step) => `• ${step}`)].join("\n");
}

async function safeEdit(api: Api, chatId: string, messageId: number, text: string, markup?: InlineKeyboardMarkup) {
  try {
    await api.editMessageText(chatId, messageId, text, markup ? { reply_markup: markup } : {});
    return true;
  } catch (err) {
    if (errMsg(err).includes("message is not modified")) return true;
    log("warn", "placeholder edit failed", { chatId, error: errMsg(err) });
    return false;
  }
}

function show(chatId: string, s: State) {
  if (s.messageId || s.creating) return;
  s.creating = s.api
    .sendMessage(chatId, body(s))
    .then((m) => {
      s.messageId = m.message_id;
    })
    .catch((err) => log("warn", "placeholder send failed", { chatId, error: errMsg(err) }));
}

function scheduleEdit(chatId: string, s: State) {
  if (s.editTimer) return;
  const delay = Math.max(0, EDIT_INTERVAL_MS - (Date.now() - s.lastEditAt));
  s.editTimer = setTimeout(async () => {
    s.editTimer = undefined;
    await s.creating;
    if (!s.messageId || active.get(chatId) !== s) return;
    s.lastEditAt = Date.now();
    await safeEdit(s.api, chatId, s.messageId, body(s));
  }, delay);
}

export function begin(api: Api, chatId: string) {
  const s: State = { api, startedAt: Date.now(), steps: [], lastEditAt: 0 };
  s.showTimer = setTimeout(() => show(chatId, s), SHOW_AFTER_MS);
  active.set(chatId, s);
}

// a `status` event from the core; ignored when nothing is in flight for this chat
export function appendStep(chatId: string, text: string) {
  const s = active.get(chatId);
  if (!s) return;
  s.steps.push(text.trim());
  if (!s.messageId && !s.creating) {
    clearTimeout(s.showTimer);
    show(chatId, s);
  } else {
    scheduleEdit(chatId, s);
  }
}

// replaces the placeholder with the core's answer (or an error text)
export async function finish(api: Api, chatId: string, messages: OutMessage[]) {
  const s = active.get(chatId);
  if (s) active.delete(chatId);
  if (!s) return sendMessages(api, chatId, messages);

  clearTimeout(s.showTimer);
  clearTimeout(s.editTimer);
  await s.creating;
  if (!s.messageId) return sendMessages(api, chatId, messages);

  // the steps stay as a log of what the AI checked
  if (s.steps.length) {
    await safeEdit(api, chatId, s.messageId, body(s, DONE_HEADER));
    return sendMessages(api, chatId, messages);
  }

  // an edited message makes no notification, so after a long wait answer with a new one
  const [first, ...rest] = messages;
  if (!first || Date.now() - s.startedAt > LONG_WAIT_MS) {
    await api.deleteMessage(chatId, s.messageId).catch(() => {});
    return sendMessages(api, chatId, messages);
  }
  if (!(await safeEdit(api, chatId, s.messageId, first.text, first.reply_markup))) {
    return sendMessages(api, chatId, messages);
  }
  return sendMessages(api, chatId, rest);
}
