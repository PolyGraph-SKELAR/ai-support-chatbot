import { describe, expect, it } from "vitest";
import { withChatLock } from "../src/chat-lock";
import { cleanText, splitText, toKeyboard, toMessages } from "../src/render";

describe("render", () => {
  it("splits long text by paragraphs and keeps chunks within the limit", () => {
    const text = `${"а".repeat(3000)}\n\n${"б".repeat(3000)}`;
    const chunks = splitText(text);
    expect(chunks).toEqual(["а".repeat(3000), "б".repeat(3000)]);
  });

  it("hard-cuts text without line breaks", () => {
    const chunks = splitText("x".repeat(9000));
    expect(chunks.map((c) => c.length)).toEqual([4096, 4096, 808]);
  });

  it("drops buttons whose data exceeds 64 bytes in UTF-8", () => {
    const kb = toKeyboard([
      [
        { label: "ok", data: "confirm:P-1" },
        { label: "too long", data: "msg:" + "ї".repeat(31) }, // 4 + 62 bytes
        { label: " ", data: "msg:x" },
      ],
    ]);
    expect(kb?.inline_keyboard).toEqual([[{ text: "ok", callback_data: "confirm:P-1" }]]);
  });

  it("attaches the keyboard to the last chunk and fills empty text", () => {
    const msgs = toMessages([{ text: "", buttons: [[{ label: "29.10", data: "msg:29.10" }]] }]);
    expect(msgs).toEqual([{ text: "Оберіть:", reply_markup: { inline_keyboard: [[{ text: "29.10", callback_data: "msg:29.10" }]] } }]);
  });

  it("strips markdown leftovers", () => {
    expect(cleanText("**Готово**, __сайт__ працює ")).toBe("Готово, сайт працює");
  });
});

describe("withChatLock", () => {
  it("runs one chat sequentially and different chats in parallel", async () => {
    const order: string[] = [];
    const task = (name: string, ms: number) => async () => {
      order.push(`${name}:start`);
      await new Promise((r) => setTimeout(r, ms));
      order.push(`${name}:end`);
    };
    await Promise.all([withChatLock("a", task("a1", 30)), withChatLock("a", task("a2", 1)), withChatLock("b", task("b1", 1))]);
    expect(order.indexOf("a2:start")).toBeGreaterThan(order.indexOf("a1:end"));
    expect(order.indexOf("b1:end")).toBeLessThan(order.indexOf("a1:end"));
  });
});
