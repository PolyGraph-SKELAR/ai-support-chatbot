import { run } from "@grammyjs/runner";
import { createBot } from "./bot";
import { config } from "./config";
import { runEventsLoop } from "./events-loop";
import { log } from "./logger";

const bot = createBot();
await bot.init();

const runner = run(bot);
const abort = new AbortController();
void runEventsLoop(bot.api, abort.signal);

log("info", "bot started", { username: bot.botInfo.username, core: config.CORE_URL });

const stop = async () => {
  abort.abort();
  if (runner.isRunning()) await runner.stop();
  process.exit(0);
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
