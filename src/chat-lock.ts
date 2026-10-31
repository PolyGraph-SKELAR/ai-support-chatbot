// Serializes work per chat: updates and core events of one chat run strictly one after another,
// different chats run in parallel.
const tails = new Map<string, Promise<unknown>>();

export function withChatLock<T>(chatId: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(chatId) ?? Promise.resolve();
  const run = prev.then(fn);
  const tail = run.catch(() => {});
  tails.set(chatId, tail);
  void tail.then(() => {
    if (tails.get(chatId) === tail) tails.delete(chatId);
  });
  return run;
}
