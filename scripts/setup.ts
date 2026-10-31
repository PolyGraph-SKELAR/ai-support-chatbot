// One-off bot profile setup: npm run setup
import { Bot } from "grammy";
import { config } from "../src/config";

const bot = new Bot(config.BOT_TOKEN);

await bot.api.setMyCommands([
  { command: "start", description: "Почати" },
  { command: "link", description: "Прив'язати хостинг-акаунт: /link КОД" },
  { command: "help", description: "Що я вмію" },
]);
await bot.api.setMyShortDescription("AI-підтримка хостингу: не лише відповідає, а й виправляє.");
await bot.api.setMyDescription(
  "Я інженер підтримки хостингу. Розберуся, що сталося з вашим сайтом, покажу план і виконаю його лише після вашого підтвердження. Перед ризиковими змінами роблю знімок, тож усе можна відкотити.\n\nПочніть з /link КОД — код є у вашій панелі.",
);
console.log("bot profile updated");
