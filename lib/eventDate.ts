function ordinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

function parseIsoDateParts(input: string): { year: number; month: number; day: number } | null {
  const raw = input.trim();
  if (!raw) return null;

  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;

  const year = Number.parseInt(m[1] ?? "", 10);
  const month = Number.parseInt(m[2] ?? "", 10);
  const day = Number.parseInt(m[3] ?? "", 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (year < 1900 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  return { year, month, day };
}

export function formatEventDateDisplay(input: string): string {
  const raw = input.trim();
  if (!raw) return "";

  const parts = parseIsoDateParts(raw);
  if (!parts) return raw;

  const dt = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
  const monthName = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(dt);
  return `${monthName} ${parts.day}${ordinalSuffix(parts.day)} ${parts.year}`;
}

export function formatEventDateWithWeekdayDisplay(input: string): string {
  const raw = input.trim();
  if (!raw) return "";

  const parts = parseIsoDateParts(raw);
  if (!parts) return raw;

  const dt = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(dt);
  const monthName = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(dt);
  return `${weekday}, ${monthName} ${parts.day}${ordinalSuffix(parts.day)} ${parts.year}`;
}
