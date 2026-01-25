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
 * HttpEngine - STUB IMPLEMENTATION
 * 
 * This engine delegates to a remote HTTP API endpoint.
 * Useful for proxying requests to server-side engines like Databricks.
 * 
 * TODO: Complete implementation with actual HTTP API calls
 */
export class HttpEngine implements DataEngine {
  constructor(private baseUrl: string) {}

  async histogram(req: HistogramRequest, signal?: AbortSignal): Promise<HistogramResponse> {
    const response = await fetch(`${this.baseUrl}/histogram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  async rows(req: RowsRequest, signal?: AbortSignal): Promise<RowsResponse> {
    const response = await fetch(`${this.baseUrl}/rows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  async aggregate(req: AggregateRequest, signal?: AbortSignal): Promise<AggregateResponse> {
    const response = await fetch(`${this.baseUrl}/aggregate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }
}
