import type { VisitorEntry } from "../types/VisitorEntry";

function csvEscape(value: string): string {
  const s = value ?? "";
  // Escape double quotes by doubling them.
  const escaped = s.replace(/"/g, '""');
  // Wrap in quotes if it contains commas, quotes, or new lines.
  if (/[",\n]/.test(escaped)) return `"${escaped}"`;
  return escaped;
}

export function entriesToCsv(entries: VisitorEntry[]): string {
  const header = [
    "Dignitary Name",
    "Date & Time",
  ];
  const rows = entries.map((e) => [
    csvEscape(e.dignitaryName),
    csvEscape(e.dateTimeISO),
  ]);

  return [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

