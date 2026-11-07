import { getLondonIsoDate, getTodayIsoDateInLondon } from "@anchor-nights/kit/dates";

/**
 * Music Bingo's rule for tonight's game on a paired /tv (spec M-9, S3.2):
 * the game whose event date is today's date in London.
 *
 * One addition, so a game is never pulled off the TV mid-show: until 04:00
 * London time, yesterday's game still counts while it is live (running,
 * paused or on the break), because a night that runs past midnight is still
 * that night. A game left idle or ended yesterday does not. Music Bingo has
 * no rehearsal games, so `?rehearsal=1` changes nothing here.
 *
 * Several games on one date: one still to finish beats one that has ended,
 * then the most recently changed wins.
 */

export interface TonightRow {
  id: string;
  /** live_sessions.event_date, YYYY-MM-DD. */
  eventDate: string;
  updatedAt: string;
  createdAt: string;
  /** runtime_data.mode, or null for a game never run. */
  mode: string | null;
}

/** The hour (London) until which last night's live game stays on the TV. */
export const LATE_NIGHT_CUTOFF_HOUR = 4;

const LIVE_MODES = new Set(["running", "paused", "break"]);

function londonHour(now: Date): number {
  const hour = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hourCycle: "h23" }).format(now);
  return Number(hour);
}

/** Today in London and, before 04:00 London, yesterday too (YYYY-MM-DD). */
export function tonightDates(now: Date): { today: string; lateNight: string | null } {
  const today = getTodayIsoDateInLondon(now);
  if (londonHour(now) >= LATE_NIGHT_CUTOFF_HOUR) return { today, lateNight: null };
  // Noon UTC on today's London date, minus a day, is always yesterday's London date.
  const yesterday = getLondonIsoDate(new Date(Date.parse(`${today}T12:00:00Z`) - 24 * 60 * 60 * 1000));
  return { today, lateNight: yesterday };
}

function newestFirst(a: TonightRow, b: TonightRow): number {
  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id);
}

/** Picks tonight's game from the rows for tonightDates(now), or null for the idle screen. */
export function pickTonight(rows: readonly TonightRow[], now: Date): TonightRow | null {
  const { today, lateNight } = tonightDates(now);
  const todays = rows.filter((row) => row.eventDate === today);
  if (todays.length > 0) {
    const unfinished = todays.filter((row) => row.mode !== "ended");
    return [...(unfinished.length > 0 ? unfinished : todays)].sort(newestFirst)[0];
  }
  if (lateNight) {
    const live = rows.filter((row) => row.eventDate === lateNight && row.mode !== null && LIVE_MODES.has(row.mode));
    if (live.length > 0) return [...live].sort(newestFirst)[0];
  }
  return null;
}

/** Whether a game with this event date and runtime mode counts as tonight's at `now` (the snapshot route's check for a paired TV). */
export function isTonightGame(row: Pick<TonightRow, "eventDate" | "mode">, now: Date): boolean {
  const { today, lateNight } = tonightDates(now);
  if (row.eventDate === today) return true;
  return lateNight !== null && row.eventDate === lateNight && row.mode !== null && LIVE_MODES.has(row.mode);
}

/**
 * The resolver /tv hands to the kit: the rows for tonight's dates, then
 * pickTonight. Any database error throws, which the kit turns into the
 * "Reconnecting" notice (never a game, never a pairing code).
 */
export function createFindTonight(listOnDates: (dates: string[]) => Promise<TonightRow[]>) {
  return async ({ now }: { now: Date }): Promise<{ id: string } | null> => {
    const { today, lateNight } = tonightDates(now);
    const rows = await listOnDates(lateNight ? [today, lateNight] : [today]);
    const picked = pickTonight(rows, now);
    return picked ? { id: picked.id } : null;
  };
}
