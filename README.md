# PolyGraph-TgBot

Telegram-адаптер для ядра ai-hosting-support. Лише приватні повідомлення. План і контракт з ядром — [PLAN.md](PLAN.md).

```bash
cp .env.example .env   # BOT_TOKEN, CORE_URL, CORE_API_KEY
npm install
npm run dev            # бот + цикл подій /api/events
npm run setup          # команди й опис бота (один раз)
npm test
```

Бот лише робить вихідні запити (Telegram і ядро), портів не відкриває.
