import type { IntervalsByColumn, Interval, Filter } from "../types";

export function normalizeInterval(i: Interval): Interval {
  return i[0] <= i[1] ? i : [i[1], i[0]];
}

export function applyBrushedIntervalsToPredicate(
  brushed: IntervalsByColumn | undefined,
  exclude: string[] = []
) {
  const excluded = new Set(exclude);
  return (row: Record<string, unknown>) => {
    if (!brushed) return true;
    for (const [col, interval] of Object.entries(brushed)) {
      if (!interval) continue;
      if (excluded.has(col)) continue;

      const v = row[col];
      const num = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(num)) return false;

      const [min, max] = normalizeInterval(interval);
      // Use strict inside interval logic (exclusive bounds):
      // A value is considered "inside" only if min < value < max
      // This ensures that exact boundary values are excluded
      if (!(num > min && num < max)) return false;
    }
    return true;
  };
}

export function applyFiltersToPredicate(filters: Filter[] | undefined) {
  return (row: Record<string, unknown>) => {
    if (!filters?.length) return true;

    for (const f of filters) {
      if (f.type === "equals") {
        if (row[f.column] !== f.value) return false;
      } else if (f.type === "in") {
        const rowValue = row[f.column];
        if (!f.values.includes(rowValue as string | number)) return false;
      } else if (f.type === "timeRange") {
        const rowValue = row[f.column];
        const t = new Date(rowValue as string | number | Date).getTime();
        if (!Number.isFinite(t)) return false;
        const from = new Date(f.fromISO).getTime();
        const to = new Date(f.toISO).getTime();
        if (!(t >= from && t < to)) return false;
      }
    }

    return true;
  };
}
