export type Interval = [number, number];
export type IntervalsByColumn = Record<string, Interval | null>;

export type OrderBy = { column: string; dir: "asc" | "desc" };

export type TimeRangeFilter = {
  type: "timeRange";
  column: string;
  fromISO: string; // ISO string
  toISO: string;   // ISO string (exclusive end is recommended)
};

export type EqualsFilter = {
  type: "equals";
  column: string;
  value: string | number | boolean;
};

export type InFilter = {
  type: "in";
  column: string;
  values: Array<string | number>;
};

export type Filter = TimeRangeFilter | EqualsFilter | InFilter;

export type HistogramRequest = {
  dataset: string;
  xColumn: string;
  numBins: number;                 // matches your histogramBins.js
  brushedIntervals?: IntervalsByColumn; // same shape as UI
  excludeIntervalsForColumns?: string[]; // e.g. [xColumn] for coordinated hist
  domain?: Interval;               // optional: avoids min/max round trip
  filters?: Filter[];              // optional extra filters (e.g. last month)
};

export type HistogramBin = { x0: number; x1: number; length: number };
export type HistogramResponse = {
  dataset: string;
  xColumn: string;
  domain: Interval;
  bins: HistogramBin[];
};

export type RowsRequest = {
  dataset: string;
  columns?: string[];
  brushedIntervals?: IntervalsByColumn;
  filters?: Filter[];
  orderBy?: OrderBy[];
  limit?: number;
  offset?: number;
};

export type RowsResponse = {
  columns: string[];
  rows: Array<Record<string, unknown>>;
};

export type AggregateOp = "count" | "sum" | "avg" | "min" | "max";
export type Measure = { op: AggregateOp; column?: string; as?: string };

export type AggregateRequest = {
  dataset: string;
  groupBy: string[];
  measures: Measure[];
  brushedIntervals?: IntervalsByColumn;
  filters?: Filter[];
  orderBy?: OrderBy[];
  limit?: number;
};

export type AggregateResponse = {
  columns: string[];
  rows: Array<Record<string, unknown>>;
};

export interface DataEngine {
  histogram(req: HistogramRequest, signal?: AbortSignal): Promise<HistogramResponse>;
  rows(req: RowsRequest, signal?: AbortSignal): Promise<RowsResponse>;
  aggregate(req: AggregateRequest, signal?: AbortSignal): Promise<AggregateResponse>;
}
