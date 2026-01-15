# @vizhub/data-query

A TypeScript library for querying and filtering data with support for CSV (client-side), DuckDB, and Databricks SQL. Designed for interactive visualizations with coordinated histograms and brushing.

## Features

- **CSV Engine** (fully implemented): Client-side data queries for CSV files
- **Histogram queries**: Generate binned histograms with configurable bin counts
- **Row queries**: Filter, sort, and paginate data
- **Aggregate queries**: Group by columns and compute aggregations (count, sum, avg, min, max)
- **Coordinated brushing**: Support for multi-dimensional filtering with interval exclusion
- **Throttled requests**: Built-in request throttling and deduplication
- **TypeScript**: Full type safety with TypeScript definitions

## Installation

```bash
npm install @vizhub/data-query
```

## Quick Start

### Loading CSV Data

```typescript
import { CsvEngine } from '@vizhub/data-query';

// Load CSV from text
const csvText = await fetch('/data/mydata.csv').then(r => r.text());
const { engine, rows } = CsvEngine.fromCsvText(csvText);

// Or create engine and set dataset manually
const engine = new CsvEngine();
engine.setDataset('mydata', rows);
```

### Creating a Histogram

```typescript
const histogramResponse = await engine.histogram({
  dataset: 'mydata',
  xColumn: 'unemployment',
  numBins: 40,
  brushedIntervals: {
    education: [20, 40], // Filter by education range
  },
  excludeIntervalsForColumns: ['unemployment'], // Exclude unemployment filter for coordinated view
});

console.log(histogramResponse.bins); // [{ x0: 0, x1: 1, length: 5 }, ...]
```

### Querying Rows

```typescript
const rowsResponse = await engine.rows({
  dataset: 'mydata',
  columns: ['id', 'unemployment', 'education'],
  brushedIntervals: {
    unemployment: [5, 10],
    education: [20, 40],
  },
  orderBy: [{ column: 'unemployment', dir: 'desc' }],
  limit: 100,
  offset: 0,
});

console.log(rowsResponse.rows); // [{ id: '1', unemployment: 9.5, education: 35 }, ...]
```

### Computing Aggregates

```typescript
const aggResponse = await engine.aggregate({
  dataset: 'mydata',
  groupBy: ['category'],
  measures: [
    { op: 'count', as: 'total' },
    { op: 'avg', column: 'value', as: 'avg_value' },
    { op: 'sum', column: 'value', as: 'sum_value' },
  ],
  brushedIntervals: {
    value: [10, 50],
  },
});

console.log(aggResponse.rows); // [{ category: 'A', total: 10, avg_value: 30, sum_value: 300 }, ...]
```

### Throttled Requests

For interactive applications with frequent updates (like brushing), use the throttled requester:

```typescript
import { createThrottledRequester } from '@vizhub/data-query';

const throttledHistogram = createThrottledRequester({
  waitMs: 300, // Wait 300ms before executing
  key: (req) => `${req.dataset}-${req.xColumn}`, // Dedupe key
  request: async (req, signal) => engine.histogram(req, signal),
});

// Multiple rapid calls will be debounced and deduplicated
throttledHistogram({ dataset: 'mydata', xColumn: 'value', numBins: 40 });
throttledHistogram({ dataset: 'mydata', xColumn: 'value', numBins: 40 });
// Only one request will be executed after 300ms
```

## API Reference

### Types

#### `IntervalsByColumn`
```typescript
type IntervalsByColumn = Record<string, [number, number] | null>;
```

Shape for brushed intervals. Matches the UI state shape:
```typescript
const brushedIntervals: IntervalsByColumn = {
  unemployment: [5, 10],
  education: [20, 40],
};
```

#### `HistogramRequest`
```typescript
type HistogramRequest = {
  dataset: string;
  xColumn: string;
  numBins: number;
  brushedIntervals?: IntervalsByColumn;
  excludeIntervalsForColumns?: string[]; // For coordinated histograms
  domain?: [number, number]; // Optional: specify domain to avoid computation
  filters?: Filter[];
};
```

#### `HistogramResponse`
```typescript
type HistogramResponse = {
  dataset: string;
  xColumn: string;
  domain: [number, number];
  bins: Array<{ x0: number; x1: number; length: number }>;
};
```

#### `RowsRequest`
```typescript
type RowsRequest = {
  dataset: string;
  columns?: string[];
  brushedIntervals?: IntervalsByColumn;
  filters?: Filter[];
  orderBy?: Array<{ column: string; dir: 'asc' | 'desc' }>;
  limit?: number;
  offset?: number;
};
```

#### `AggregateRequest`
```typescript
type AggregateRequest = {
  dataset: string;
  groupBy: string[];
  measures: Array<{
    op: 'count' | 'sum' | 'avg' | 'min' | 'max';
    column?: string;
    as?: string;
  }>;
  brushedIntervals?: IntervalsByColumn;
  filters?: Filter[];
  orderBy?: Array<{ column: string; dir: 'asc' | 'desc' }>;
  limit?: number;
};
```

#### Filters

```typescript
type TimeRangeFilter = {
  type: 'timeRange';
  column: string;
  fromISO: string;
  toISO: string;
};

type EqualsFilter = {
  type: 'equals';
  column: string;
  value: string | number | boolean;
};

type InFilter = {
  type: 'in';
  column: string;
  values: Array<string | number>;
};
```

### Engines

#### `CsvEngine`

Client-side CSV data engine.

**Methods:**
- `static fromCsvText(text: string)`: Parse CSV text and return engine + rows
- `setDataset(dataset: string, rows: Record<string, unknown>[])`: Register a dataset
- `histogram(req: HistogramRequest, signal?: AbortSignal): Promise<HistogramResponse>`
- `rows(req: RowsRequest, signal?: AbortSignal): Promise<RowsResponse>`
- `aggregate(req: AggregateRequest, signal?: AbortSignal): Promise<AggregateResponse>`

#### `HttpEngine` (stub)

Proxy engine for remote HTTP API.

```typescript
const engine = new HttpEngine('http://localhost:3000/api/data');
```

#### `DatabricksSqlEngine` (stub)

Server-side engine for Databricks SQL.

#### `DuckDbEngine` (stub)

Server-side engine for DuckDB.

### Utilities

#### `createThrottledRequester<TArg, TResult>(options)`

Create a throttled and deduplicated request function.

**Options:**
- `waitMs: number`: Debounce wait time in milliseconds
- `key: (arg: TArg) => string`: Function to generate deduplication key
- `request: (arg: TArg, signal: AbortSignal) => Promise<TResult>`: The actual request function

## Testing

The library includes comprehensive unit tests using Vitest:

```bash
cd packages/data-query
npm test
```

24 tests covering:
- CSV parsing
- Histogram generation with various configurations
- Row filtering, sorting, and pagination
- Aggregation operations
- Filter types (equals, in, timeRange)
- Brushed intervals and coordinated filtering
- Error handling

## Architecture

### Coordinated Histograms

The library supports coordinated histograms where filtering one dimension doesn't affect its own histogram:

```typescript
// When computing unemployment histogram, exclude unemployment filter
// but apply education filter
await engine.histogram({
  dataset: 'mydata',
  xColumn: 'unemployment',
  numBins: 40,
  brushedIntervals: {
    unemployment: [5, 10],
    education: [20, 40],
  },
  excludeIntervalsForColumns: ['unemployment'], // ← Key feature
});
```

This creates the coordinated view pattern where:
1. User brushes unemployment → filters education histogram and data table
2. User brushes education → filters unemployment histogram and data table
3. Both histograms remain interactive and show their full distribution

### Brushed Intervals

The library uses a consistent interval format matching typical UI state:

```typescript
brushedIntervals = {
  unemployment: [min, max] | null,
  education: [min, max] | null,
}
```

Intervals use **strict inside** logic: `value > min && value < max`

## Future Work

### Planned Features

1. **Parquet Support**: Client-side Parquet file reading
2. **DuckDB Engine**: Complete implementation with WASM support
3. **Databricks SQL Engine**: Server-side integration
4. **Express Router**: Ready-to-use Express middleware for HTTP engine
5. **Streaming**: Support for large datasets with streaming
6. **Caching**: Intelligent query result caching

## License

MIT

## Contributing

See the main repository for contribution guidelines.
