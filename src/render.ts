import type { Api } from "grammy";
import type { InlineKeyboardMarkup } from "grammy/types";
import type { Button, Reply } from "./contract";
import { log } from "./logger";

const MAX_TEXT = 4096;
const MAX_DATA_BYTES = 64;

export type OutMessage = { text: string; reply_markup?: InlineKeyboardMarkup };

// replies are plain text; drop Markdown leftovers in case the model still emits them
export function cleanText(text: string): string {
  return text.replace(/\*\*|__/g, "").trim();
}

export function splitText(text: string, max = MAX_TEXT): string[] {
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf("\n\n", max);
    if (cut <= 0) cut = rest.lastIndexOf("\n", max);
    if (cut <= 0) cut = max;
    chunks.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function isValidButton(b: Button): boolean {
  return b.label.trim() !== "" && b.data !== "" && Buffer.byteLength(b.data, "utf8") <= MAX_DATA_BYTES;
}

export function toKeyboard(buttons?: Button[][]): InlineKeyboardMarkup | undefined {
  const rows = (buttons ?? [])
    .map((row) =>
      row
        .filter((b) => {
          if (isValidButton(b)) return true;
          log("error", "invalid button from core skipped", { label: b.label, dataBytes: Buffer.byteLength(b.data, "utf8") });
          return false;
        })
        .map((b) => ({ text: b.label, callback_data: b.data })),
    )
    .filter((row) => row.length > 0);
  return rows.length ? { inline_keyboard: rows } : undefined;
}

export function toMessages(replies: Reply[]): OutMessage[] {
  const out: OutMessage[] = [];
  for (const reply of replies) {
    const keyboard = toKeyboard(reply.buttons);
    let text = cleanText(reply.text);
    if (!text && !keyboard) continue;
    if (!text) text = "Оберіть:";
    const chunks = splitText(text);
    chunks.forEach((chunk, i) => {
      const last = i === chunks.length - 1;
      out.push(last && keyboard ? { text: chunk, reply_markup: keyboard } : { text: chunk });
    });
  }
  return out;
}

export async function sendMessages(api: Api, chatId: string, messages: OutMessage[]) {
  for (const m of messages) {
    await api.sendMessage(chatId, m.text, m.reply_markup ? { reply_markup: m.reply_markup } : {});
  }
}
