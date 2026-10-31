import type { z } from "zod";
import { config } from "./config";
import { EventsResponse, RepliesResponse, type User } from "./contract";

export class CoreError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

const EVENTS_TIMEOUT_MS = 35_000; // core holds /api/events up to 25 s

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isConnRefused(err: unknown): boolean {
  return (err as { cause?: { code?: string } })?.cause?.code === "ECONNREFUSED";
}

async function request<S extends z.ZodTypeAny>(
  path: string,
  init: RequestInit,
  schema: S,
  timeoutMs: number,
): Promise<z.infer<S>> {
  const url = new URL(path, config.CORE_URL);
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: { "content-type": "application/json", authorization: `Bearer ${config.CORE_API_KEY}` },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      // retry only when the request surely never reached the core; a retry after a timeout
      // could hand the same message to the agent twice
      if (attempt === 0 && isConnRefused(err)) {
        await sleep(1000);
        continue;
      }
      throw new CoreError(`network: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!res.ok) throw new CoreError(`HTTP ${res.status} ${path}`, res.status);
    const parsed = schema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw new CoreError(`invalid response from ${path}`);
    return parsed.data;
  }
}

export const core = {
  async chat(body: { chatId: string; text: string; user?: User }) {
    const res = await request("/api/chat", { method: "POST", body: JSON.stringify(body) }, RepliesResponse, config.CORE_TIMEOUT_MS);
    return res.replies;
  },
  async button(body: { chatId: string; data: string; user?: User }) {
    const res = await request("/api/button", { method: "POST", body: JSON.stringify(body) }, RepliesResponse, config.CORE_TIMEOUT_MS);
    return res.replies;
  },
  async events(after?: number) {
    const query = after === undefined ? "" : `?after=${after}`;
    const res = await request(`/api/events${query}`, { method: "GET" }, EventsResponse, EVENTS_TIMEOUT_MS);
    return res.events;
  },
};
