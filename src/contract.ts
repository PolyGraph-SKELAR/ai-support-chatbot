// Contract with the core, v1.1 (PLAN.md §5).
import { z } from "zod";

export const ButtonSchema = z.object({ label: z.string(), data: z.string() });
export const ReplySchema = z.object({
  text: z.string(),
  buttons: z.array(z.array(ButtonSchema)).optional(),
});
export const RepliesResponse = z.object({ replies: z.array(ReplySchema) });

export const EventSchema = z.discriminatedUnion("type", [
  z.object({ id: z.number(), chatId: z.string(), type: z.literal("replies"), replies: z.array(ReplySchema) }),
  z.object({ id: z.number(), chatId: z.string(), type: z.literal("status"), text: z.string() }),
]);
export const EventsResponse = z.object({ events: z.array(EventSchema) });

export type Button = z.infer<typeof ButtonSchema>;
export type Reply = z.infer<typeof ReplySchema>;
export type CoreEvent = z.infer<typeof EventSchema>;
export type User = { firstName?: string; username?: string; languageCode?: string };
