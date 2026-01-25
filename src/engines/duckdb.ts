import type {
  DataEngine,
  HistogramRequest,
  HistogramResponse,
  RowsRequest,
  RowsResponse,
  AggregateRequest,
  AggregateResponse
} from "../types";

/**
 * DuckDbEngine - STUB IMPLEMENTATION
 * 
 * This engine would use DuckDB for in-process SQL queries.
 * DuckDB is a node-native library, so this would be used server-side.
 * 
 * TODO: Complete implementation with actual DuckDB API calls
 */
export class DuckDbEngine implements DataEngine {
  constructor(private dbPath?: string) {}

  async histogram(req: HistogramRequest, signal?: AbortSignal): Promise<HistogramResponse> {
    throw new Error("DuckDbEngine.histogram not yet implemented");
  }

  async rows(req: RowsRequest, signal?: AbortSignal): Promise<RowsResponse> {
    throw new Error("DuckDbEngine.rows not yet implemented");
  }

  async aggregate(req: AggregateRequest, signal?: AbortSignal): Promise<AggregateResponse> {
    throw new Error("DuckDbEngine.aggregate not yet implemented");
  }
}
