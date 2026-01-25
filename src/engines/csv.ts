import { csvParse } from "d3-dsv";
import type {
  DataEngine,
  HistogramRequest,
  HistogramResponse,
  RowsRequest,
  RowsResponse,
  AggregateRequest,
  AggregateResponse,
  Interval,
  HistogramBin
} from "../types";
import { applyBrushedIntervalsToPredicate, applyFiltersToPredicate, normalizeInterval } from "../utils/intervals";

function toNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function applyOrderBy(rows: Array<Record<string, unknown>>, orderBy?: { column: string; dir: "asc" | "desc" }[]) {
  if (!orderBy?.length) return rows;
  const dirs = orderBy.map(o => (o.dir === "asc" ? 1 : -1));
  const cols = orderBy.map(o => o.column);
  return [...rows].sort((a, b) => {
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      const valA = a[col];
      const valB = b[col];
      if (valA === valB) continue;
      // Handle comparison - treat nullish values as less than any other value
      if (valA == null) return -dirs[i];
      if (valB == null) return dirs[i];
      return valA > valB ? dirs[i] : -dirs[i];
    }
    return 0;
  });
}

export class CsvEngine implements DataEngine {
  private datasets: Map<string, Array<Record<string, unknown>>> = new Map();

  setDataset(dataset: string, rows: Array<Record<string, unknown>>) {
    this.datasets.set(dataset, rows);
  }

  static fromCsvText(text: string) {
    const rows = csvParse(text) as unknown as Array<Record<string, unknown>>;
    const engine = new CsvEngine();
    return { engine, rows };
  }

  private getRows(dataset: string) {
    const rows = this.datasets.get(dataset);
    if (!rows) throw new Error(`CsvEngine: unknown dataset "${dataset}"`);
    return rows;
  }

  async histogram(req: HistogramRequest, signal?: AbortSignal): Promise<HistogramResponse> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const rows = this.getRows(req.dataset);

    const predIntervals = applyBrushedIntervalsToPredicate(
      req.brushedIntervals,
      req.excludeIntervalsForColumns ?? []
    );
    const predFilters = applyFiltersToPredicate(req.filters);

    const filtered = rows.filter(r => predIntervals(r) && predFilters(r));

    // Determine domain (either provided or computed from filtered values)
    let domain: Interval | null = req.domain ? normalizeInterval(req.domain) : null;

    if (!domain) {
      let min = Infinity;
      let max = -Infinity;
      for (const r of filtered) {
        const x = toNumber(r[req.xColumn]);
        if (x === null) continue;
        if (x < min) min = x;
        if (x > max) max = x;
      }
      if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
        // fallback safe domain
        min = 0;
        max = 1;
      }
      domain = [min, max];
    }

    const [min, max] = domain;
    const numBins = req.numBins;
    const width = (max - min) / numBins || 1;

    // counts array
    const counts = new Array<number>(numBins).fill(0);

    for (const r of filtered) {
      const x = toNumber(r[req.xColumn]);
      if (x === null) continue;
      if (x < min || x > max) continue;

      let idx = Math.floor((x - min) / width);
      if (idx === numBins) idx = numBins - 1; // edge case x==max
      if (idx >= 0 && idx < numBins) counts[idx]++;
    }

    const bins: HistogramBin[] = counts.map((c, i) => ({
      x0: min + i * width,
      x1: min + (i + 1) * width,
      length: c
    }));

    return { dataset: req.dataset, xColumn: req.xColumn, domain, bins };
  }

  async rows(req: RowsRequest, signal?: AbortSignal): Promise<RowsResponse> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const rows = this.getRows(req.dataset);

    const predIntervals = applyBrushedIntervalsToPredicate(req.brushedIntervals);
    const predFilters = applyFiltersToPredicate(req.filters);

    let out = rows.filter(r => predIntervals(r) && predFilters(r));

    out = applyOrderBy(out, req.orderBy);
    const offset = req.offset ?? 0;
    const limit = req.limit ?? 500;
    out = out.slice(offset, offset + limit);

    const columns = req.columns ?? (out[0] ? Object.keys(out[0]) : []);
    const trimmed = out.map(r => {
      const o: Record<string, unknown> = {};
      for (const c of columns) o[c] = r[c];
      return o;
    });

    return { columns, rows: trimmed };
  }

  async aggregate(req: AggregateRequest, signal?: AbortSignal): Promise<AggregateResponse> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const rows = this.getRows(req.dataset);
    const predIntervals = applyBrushedIntervalsToPredicate(req.brushedIntervals);
    const predFilters = applyFiltersToPredicate(req.filters);
    const filtered = rows.filter(r => predIntervals(r) && predFilters(r));

    // Simple grouping using Map key strings
    const keyCols = req.groupBy;
    const measures = req.measures;

    const groups = new Map<string, Array<Record<string, unknown>>>();
    for (const r of filtered) {
      const key = keyCols.map(c => String(r[c])).join("\u0001");
      const arr = groups.get(key);
      if (arr) arr.push(r);
      else groups.set(key, [r]);
    }

    const resultRows: Array<Record<string, unknown>> = [];
    for (const [key, vals] of groups.entries()) {
      const parts = key.split("\u0001");
      const out: Record<string, unknown> = {};
      keyCols.forEach((c, i) => (out[c] = parts[i]));

      for (const m of measures) {
        const as = m.as ?? (m.op + (m.column ? `_${m.column}` : ""));
        if (m.op === "count") {
          out[as] = vals.length;
        } else {
          const col = m.column!;
          const nums = vals.map(v => toNumber(v[col])).filter((n): n is number => n !== null);
          if (!nums.length) {
            out[as] = null;
            continue;
          }
          if (m.op === "sum") out[as] = nums.reduce((a, b) => a + b, 0);
          else if (m.op === "avg") out[as] = nums.reduce((a, b) => a + b, 0) / nums.length;
          else if (m.op === "min") out[as] = Math.min(...nums);
          else if (m.op === "max") out[as] = Math.max(...nums);
        }
      }

      resultRows.push(out);
    }

    let out = resultRows;
    // order/limit
    if (req.orderBy?.length) {
      out = applyOrderBy(out, req.orderBy);
    }
    if (req.limit != null) out = out.slice(0, req.limit);

    const columns = [...req.groupBy, ...req.measures.map(m => m.as ?? (m.op + (m.column ? `_${m.column}` : "")))];
    return { columns, rows: out };
  }
}
