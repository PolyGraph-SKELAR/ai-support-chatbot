import { z } from "zod";

try {
  process.loadEnvFile();
} catch {
  // .env is optional: in docker the env comes from compose
}

const Env = z.object({
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required"),
  CORE_URL: z.string().url().default("http://localhost:3000"),
  CORE_API_KEY: z.string().default(""),
  CORE_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
});

export const config = Env.parse(process.env);
