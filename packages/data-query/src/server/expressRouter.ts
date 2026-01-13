/**
 * Express Router for Data Query API - STUB IMPLEMENTATION
 * 
 * This module would export an Express router that exposes the data query API
 * over HTTP, allowing frontend clients to use HttpEngine to query server-side
 * data sources like Databricks or DuckDB.
 * 
 * Example usage:
 * 
 * ```typescript
 * import express from 'express';
 * import { createDataQueryRouter } from '@vizhub/data-query/server/expressRouter';
 * import { DatabricksSqlEngine } from '@vizhub/data-query';
 * 
 * const app = express();
 * const engine = new DatabricksSqlEngine({ ... });
 * app.use('/api/data', createDataQueryRouter(engine));
 * ```
 * 
 * TODO: Implement actual Express router
 */

export function createDataQueryRouter(/* engine: DataEngine */): any {
  throw new Error("createDataQueryRouter not yet implemented");
}
