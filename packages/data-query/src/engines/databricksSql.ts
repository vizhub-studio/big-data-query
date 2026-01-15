import type {
  DataEngine,
  HistogramRequest,
  HistogramResponse,
  RowsRequest,
  RowsResponse,
  AggregateRequest,
  AggregateResponse,
  Interval,
  Measure
} from "../types";
import { normalizeInterval } from "../utils/intervals";

type DatabricksConfig = {
  host: string;        // https://adb-...azuredatabricks.net
  token: string;       // PAT (server-side only)
  warehouseId: string; // SQL Warehouse ID
  tableMap: Record<string, string>; // dataset name -> table name
};

/**
 * DatabricksSqlEngine - STUB IMPLEMENTATION
 * 
 * This engine translates:
 * - brushedIntervals → numeric WHERE clauses
 * - filters (including last month timeRange) → WHERE clauses
 * - histogram → a single SQL query using a CTE that calculates min/max and bins
 * 
 * TODO: Complete implementation with actual Databricks SQL API calls
 */
export class DatabricksSqlEngine implements DataEngine {
  constructor(private config: DatabricksConfig) {}

  async histogram(req: HistogramRequest, signal?: AbortSignal): Promise<HistogramResponse> {
    throw new Error("DatabricksSqlEngine.histogram not yet implemented");
  }

  async rows(req: RowsRequest, signal?: AbortSignal): Promise<RowsResponse> {
    throw new Error("DatabricksSqlEngine.rows not yet implemented");
  }

  async aggregate(req: AggregateRequest, signal?: AbortSignal): Promise<AggregateResponse> {
    throw new Error("DatabricksSqlEngine.aggregate not yet implemented");
  }
}
