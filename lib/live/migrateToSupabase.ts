import { LIVE_SESSIONS_STORAGE_KEY } from "@/lib/live/storage";
import { validateLiveSession } from "@/lib/live/validate";
import { upsertLiveSession } from "@/lib/live/sessionApi";
import type { LiveSessionV1 } from "@/lib/live/types";

export async function migrateLocalSessionsToSupabase(): Promise<{ migrated: LiveSessionV1[]; errors: string[] }> {
  const migrated: LiveSessionV1[] = [];
  const errors: string[] = [];

  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(LIVE_SESSIONS_STORAGE_KEY) : null;
    if (!raw) return { migrated, errors };

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return { migrated, errors };

    const sessions = parsed
      .map(validateLiveSession)
      .filter((s): s is LiveSessionV1 => s !== null);

    for (const session of sessions) {
      try {
        await upsertLiveSession(session);
        migrated.push(session);
      } catch (err: any) {
        errors.push(`${session.name}: ${err?.message ?? "Unknown error"}`);
      }
    }

    if (migrated.length > 0) {
      try {
        window.localStorage.removeItem(LIVE_SESSIONS_STORAGE_KEY);
      } catch {
        // best-effort
      }
    }
  } catch {
    // best-effort: never block usage
  }

  return { migrated, errors };
}
