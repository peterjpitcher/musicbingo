import { z } from "zod";

export const sessionCommandSchema = z.object({
  type: z.enum([
    "start_game",
    "pause_game",
    "resume_game",
    "track_snapshot",
    "advance_track",
    "screen_changed",
    "award_points",
    "brand_changed",
    "end_game",
    "runtime_snapshot",
  ]),
  clientEventId: z.string().trim().min(1).max(120).optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  // Every command carries the runtime it leaves, saved with it in one
  // transaction, and the runtime version the console last saw (spec M-9).
  runtime: z.unknown(),
  expectedVersion: z.number().int().min(0),
});

export type SessionCommandInput = z.infer<typeof sessionCommandSchema>;
