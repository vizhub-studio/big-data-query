import { describe, it, expect, beforeEach } from 'vitest';
import { CsvEngine } from './csv';
import type { HistogramRequest, RowsRequest, AggregateRequest } from '../types';

describe('CsvEngine', () => {
  let engine: CsvEngine;
  const testData = [
    { id: '1', value: 10, category: 'A', timestamp: '2024-01-01T00:00:00Z' },
    { id: '2', value: 20, category: 'B', timestamp: '2024-01-02T00:00:00Z' },
    { id: '3', value: 30, category: 'A', timestamp: '2024-01-03T00:00:00Z' },
    { id: '4', value: 40, category: 'B', timestamp: '2024-01-04T00:00:00Z' },
    { id: '5', value: 50, category: 'A', timestamp: '2024-01-05T00:00:00Z' },
  ];

  beforeEach(() => {
    engine = new CsvEngine();
    engine.setDataset('test', testData);
  });

  describe('fromCsvText', () => {
    it('should parse CSV text and create engine', () => {
      const csvText = `id,value,category
1,10,A
2,20,B
3,30,A`;
      
      const { engine: newEngine, rows } = CsvEngine.fromCsvText(csvText);
      
      expect(rows).toHaveLength(3);
      expect(rows[0]).toEqual({ id: '1', value: '10', category: 'A' });
      expect(newEngine).toBeInstanceOf(CsvEngine);
    });
  });

  describe('histogram', () => {
    it('should compute basic histogram', async () => {
      const request: HistogramRequest = {
        dataset: 'test',
        xColumn: 'value',
        numBins: 5,
      };

      const response = await engine.histogram(request);

      expect(response.dataset).toBe('test');
      expect(response.xColumn).toBe('value');
      expect(response.bins).toHaveLength(5);
      expect(response.domain).toEqual([10, 50]);
      
      // Check that bins have the correct structure
      expect(response.bins[0]).toHaveProperty('x0');
      expect(response.bins[0]).toHaveProperty('x1');
      expect(response.bins[0]).toHaveProperty('length');
      
      // Verify all values are counted
      const totalCount = response.bins.reduce((sum, bin) => sum + bin.length, 0);
      expect(totalCount).toBe(5);
    });

    it('should respect provided domain', async () => {
      const request: HistogramRequest = {
        dataset: 'test',
        xColumn: 'value',
        numBins: 10,
        domain: [0, 100],
      };

      const response = await engine.histogram(request);

      expect(response.domain).toEqual([0, 100]);
      expect(response.bins).toHaveLength(10);
    });

    it('should filter by brushed intervals', async () => {
      const request: HistogramRequest = {
        dataset: 'test',
        xColumn: 'value',
        numBins: 5,
        brushedIntervals: {
          value: [15, 45], // Should include values 20, 30, 40
        },
      };

      const response = await engine.histogram(request);

      const totalCount = response.bins.reduce((sum, bin) => sum + bin.length, 0);
      expect(totalCount).toBe(3); // Only 20, 30, 40 are in the interval (15, 45)
    });

    it('should exclude intervals for specified columns', async () => {
      const request: HistogramRequest = {
        dataset: 'test',
        xColumn: 'value',
        numBins: 5,
        brushedIntervals: {
          value: [15, 45], // This will be excluded
        },
        excludeIntervalsForColumns: ['value'],
      };

      const response = await engine.histogram(request);

      // With value excluded, all 5 rows should be included
      const totalCount = response.bins.reduce((sum, bin) => sum + bin.length, 0);
      expect(totalCount).toBe(5);
    });

    it('should apply filters', async () => {
      const request: HistogramRequest = {
        dataset: 'test',
        xColumn: 'value',
        numBins: 5,
        filters: [
          { type: 'equals', column: 'category', value: 'A' },
        ],
      };

      const response = await engine.histogram(request);

      const totalCount = response.bins.reduce((sum, bin) => sum + bin.length, 0);
      expect(totalCount).toBe(3); // Only category A
    });

    it('should handle abort signal', async () => {
      const controller = new AbortController();
      controller.abort();

      const request: HistogramRequest = {
        dataset: 'test',
        xColumn: 'value',
        numBins: 5,
      };

      await expect(engine.histogram(request, controller.signal)).rejects.toThrow('Aborted');
    });

    it('should handle empty data gracefully', async () => {
      engine.setDataset('empty', []);
      
      const request: HistogramRequest = {
        dataset: 'empty',
        xColumn: 'value',
        numBins: 5,
      };

      const response = await engine.histogram(request);

      expect(response.domain).toEqual([0, 1]); // Fallback domain
      expect(response.bins).toHaveLength(5);
      expect(response.bins.every(b => b.length === 0)).toBe(true);
    });
  });

  describe('rows', () => {
    it('should return all rows by default', async () => {
      const request: RowsRequest = {
        dataset: 'test',
      };

      const response = await engine.rows(request);

      expect(response.rows).toHaveLength(5);
      expect(response.columns).toContain('id');
      expect(response.columns).toContain('value');
    });

    it('should filter by brushed intervals', async () => {
      const request: RowsRequest = {
        dataset: 'test',
        brushedIntervals: {
          value: [15, 35], // Should include 20, 30
        },
      };

      const response = await engine.rows(request);

      expect(response.rows).toHaveLength(2);
    });

    it('should apply filters', async () => {
      const request: RowsRequest = {
        dataset: 'test',
        filters: [
          { type: 'in', column: 'category', values: ['A'] },
        ],
      };

      const response = await engine.rows(request);

      expect(response.rows).toHaveLength(3);
      expect(response.rows.every(r => r.category === 'A')).toBe(true);
    });

    it('should apply time range filter', async () => {
      const request: RowsRequest = {
        dataset: 'test',
        filters: [
          {
            type: 'timeRange',
            column: 'timestamp',
            fromISO: '2024-01-02T00:00:00Z',
            toISO: '2024-01-04T00:00:00Z',
          },
        ],
      };

      const response = await engine.rows(request);

      expect(response.rows).toHaveLength(2); // Includes 01-02 and 01-03 (exclusive end)
    });

    it('should order by column', async () => {
      const request: RowsRequest = {
        dataset: 'test',
        orderBy: [{ column: 'value', dir: 'desc' }],
      };

      const response = await engine.rows(request);

      expect(response.rows[0].value).toBe(50);
      expect(response.rows[4].value).toBe(10);
    });

    it('should apply limit and offset', async () => {
      const request: RowsRequest = {
        dataset: 'test',
        limit: 2,
        offset: 1,
      };

      const response = await engine.rows(request);

      expect(response.rows).toHaveLength(2);
      expect(response.rows[0].id).toBe('2');
    });

    it('should select specific columns', async () => {
      const request: RowsRequest = {
        dataset: 'test',
        columns: ['id', 'category'],
      };

      const response = await engine.rows(request);

      expect(response.columns).toEqual(['id', 'category']);
      expect(response.rows[0]).toHaveProperty('id');
      expect(response.rows[0]).toHaveProperty('category');
      expect(response.rows[0]).not.toHaveProperty('value');
    });
  });

  describe('aggregate', () => {
    it('should count rows', async () => {
      const request: AggregateRequest = {
        dataset: 'test',
        groupBy: ['category'],
        measures: [{ op: 'count', as: 'total' }],
      };

      const response = await engine.aggregate(request);

      expect(response.rows).toHaveLength(2);
      expect(response.columns).toEqual(['category', 'total']);
      
      const categoryA = response.rows.find(r => r.category === 'A');
      const categoryB = response.rows.find(r => r.category === 'B');
      
      expect(categoryA?.total).toBe(3);
      expect(categoryB?.total).toBe(2);
    });

    it('should compute sum', async () => {
      const request: AggregateRequest = {
        dataset: 'test',
        groupBy: ['category'],
        measures: [{ op: 'sum', column: 'value', as: 'sum_value' }],
      };

      const response = await engine.aggregate(request);

      const categoryA = response.rows.find(r => r.category === 'A');
      const categoryB = response.rows.find(r => r.category === 'B');
      
      expect(categoryA?.sum_value).toBe(90); // 10 + 30 + 50
      expect(categoryB?.sum_value).toBe(60); // 20 + 40
    });

    it('should compute average', async () => {
      const request: AggregateRequest = {
        dataset: 'test',
        groupBy: ['category'],
        measures: [{ op: 'avg', column: 'value', as: 'avg_value' }],
      };

      const response = await engine.aggregate(request);

      const categoryA = response.rows.find(r => r.category === 'A');
      const categoryB = response.rows.find(r => r.category === 'B');
      
      expect(categoryA?.avg_value).toBe(30); // (10 + 30 + 50) / 3
      expect(categoryB?.avg_value).toBe(30); // (20 + 40) / 2
    });

    it('should compute min and max', async () => {
      const request: AggregateRequest = {
        dataset: 'test',
        groupBy: ['category'],
        measures: [
          { op: 'min', column: 'value', as: 'min_value' },
          { op: 'max', column: 'value', as: 'max_value' },
        ],
      };

      const response = await engine.aggregate(request);

      const categoryA = response.rows.find(r => r.category === 'A');
      
      expect(categoryA?.min_value).toBe(10);
      expect(categoryA?.max_value).toBe(50);
    });

    it('should filter before aggregating', async () => {
      const request: AggregateRequest = {
        dataset: 'test',
        groupBy: ['category'],
        measures: [{ op: 'count', as: 'total' }],
        brushedIntervals: {
          value: [15, 45],
        },
      };

      const response = await engine.aggregate(request);

      const categoryA = response.rows.find(r => r.category === 'A');
      const categoryB = response.rows.find(r => r.category === 'B');
      
      expect(categoryA?.total).toBe(1); // Only value 30
      expect(categoryB?.total).toBe(2); // Values 20, 40
    });

    it('should order aggregated results', async () => {
      const request: AggregateRequest = {
        dataset: 'test',
        groupBy: ['category'],
        measures: [{ op: 'count', as: 'total' }],
        orderBy: [{ column: 'total', dir: 'desc' }],
      };

      const response = await engine.aggregate(request);

      expect(response.rows[0].total).toBe(3); // A comes first
      expect(response.rows[1].total).toBe(2); // B comes second
    });

    it('should limit aggregated results', async () => {
      const request: AggregateRequest = {
        dataset: 'test',
        groupBy: ['category'],
        measures: [{ op: 'count', as: 'total' }],
        limit: 1,
      };

      const response = await engine.aggregate(request);

      expect(response.rows).toHaveLength(1);
    });

    it('should handle default measure names', async () => {
      const request: AggregateRequest = {
        dataset: 'test',
        groupBy: ['category'],
        measures: [
          { op: 'count' },
          { op: 'sum', column: 'value' },
        ],
      };

      const response = await engine.aggregate(request);

      expect(response.columns).toContain('count');
      expect(response.columns).toContain('sum_value');
    });
  });

  describe('error handling', () => {
    it('should throw error for unknown dataset', async () => {
      const request: HistogramRequest = {
        dataset: 'unknown',
        xColumn: 'value',
        numBins: 5,
      };

      await expect(engine.histogram(request)).rejects.toThrow('unknown dataset');
    });
  });
});
