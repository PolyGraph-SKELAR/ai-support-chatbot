// Pulls events from the core: GET /api/events long polling (PLAN.md F5).
import type { Api } from "grammy";
import { withChatLock } from "./chat-lock";
import { core, CoreError } from "./core-client";
import { errMsg, log } from "./logger";
import { appendStep } from "./placeholder";
import { sendMessages, toMessages } from "./render";

const BACKOFF_MS = [1000, 2000, 5000];
const UNAUTHORIZED_RETRY_MS = 30_000;
const MIN_POLL_MS = 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runEventsLoop(api: Api, signal: AbortSignal) {
  let lastId: number | undefined;
  let failures = 0;

  while (!signal.aborted) {
    const started = Date.now();
    try {
      const events = await core.events(lastId);
      failures = 0;
      for (const ev of events) {
        if (ev.type === "status") {
          // bypasses the chat lock: it is held by the request this status belongs to
          appendStep(ev.chatId, ev.text);
        } else {
          // not awaited: a busy chat must not stall statuses and events of other chats
          void withChatLock(ev.chatId, () => sendMessages(api, ev.chatId, toMessages(ev.replies))).catch((err) =>
            log("warn", "event delivery failed", { chatId: ev.chatId, eventId: ev.id, error: errMsg(err) }),
          );
        }
        lastId = Math.max(lastId ?? 0, ev.id);
      }
      // guards against a busy loop if the core answers without holding the request
      if (events.length === 0 && Date.now() - started < MIN_POLL_MS) await sleep(MIN_POLL_MS);
    } catch (err) {
      const unauthorized = err instanceof CoreError && err.status === 401;
      const delay = unauthorized ? UNAUTHORIZED_RETRY_MS : BACKOFF_MS[Math.min(failures, BACKOFF_MS.length - 1)];
      failures++;
      log(unauthorized ? "error" : "warn", unauthorized ? "events: invalid CORE_API_KEY" : "events: poll failed", {
        error: errMsg(err),
        retryInMs: delay,
      });
      await sleep(delay);
    }
  }
}
