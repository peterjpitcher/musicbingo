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

export function formatEventDateDisplay(input: string): string {
  const raw = input.trim();
  if (!raw) return "";

  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return raw;

  const year = Number.parseInt(m[1] ?? "", 10);
  const month = Number.parseInt(m[2] ?? "", 10);
  const day = Number.parseInt(m[3] ?? "", 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return raw;
  if (year < 1900 || year > 2100) return raw;
  if (month < 1 || month > 12) return raw;
  if (day < 1 || day > 31) return raw;

  const dt = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const monthName = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(dt);
  return `${monthName} ${day}${ordinalSuffix(day)} ${year}`;
}

