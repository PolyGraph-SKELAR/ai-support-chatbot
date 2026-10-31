const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

const minLevel: Level = (process.env.LOG_LEVEL as Level) in LEVELS ? (process.env.LOG_LEVEL as Level) : "info";

export function log(level: Level, msg: string, extra: Record<string, unknown> = {}) {
  if (LEVELS[level] < LEVELS[minLevel]) return;
  let line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra });
  // the token is part of every Bot API URL, so it can leak through error messages
  const token = process.env.BOT_TOKEN;
  if (token) line = line.replaceAll(token, "***");
  (level === "error" || level === "warn" ? console.error : console.log)(line);
}

export function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
