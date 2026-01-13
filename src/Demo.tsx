import { useEffect, useState } from 'react';
import { CsvEngine, createThrottledRequester } from '@vizhub/data-query';
import type { 
  HistogramResponse, 
  IntervalsByColumn,
  RowsResponse,
  HistogramRequest
} from '@vizhub/data-query';
import './Demo.css';

const NUM_BINS = 40;

// Create throttled requester for histogram queries
const throttledHistogram = createThrottledRequester<HistogramRequest, HistogramResponse>({
  waitMs: 300,
  key: (req) => `${req.dataset}-${req.xColumn}-${JSON.stringify(req.brushedIntervals)}`,
  request: async (req, signal) => {
    const engine = (window as any).__dataEngine;
    return engine.histogram(req, signal);
  }
});

export function Demo() {
  const [engine, setEngine] = useState<CsvEngine | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [unemploymentHist, setUnemploymentHist] = useState<HistogramResponse | null>(null);
  const [educationHist, setEducationHist] = useState<HistogramResponse | null>(null);
  const [brushedIntervals, setBrushedIntervals] = useState<IntervalsByColumn>({
    unemployment: null,
    education: null,
  });
  const [filteredRows, setFilteredRows] = useState<RowsResponse | null>(null);

  // Load data
  useEffect(() => {
    async function loadData() {
      try {
        const response = await fetch('/data/counties.csv');
        const text = await response.text();
        
        const { engine: newEngine, rows } = CsvEngine.fromCsvText(text);
        newEngine.setDataset('counties', rows);
        
        // Store engine globally for throttled requester
        (window as any).__dataEngine = newEngine;
        
        setEngine(newEngine);
        setLoading(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    }
    
    loadData();
  }, []);

  // Update histograms when brushed intervals change
  useEffect(() => {
    if (!engine) return;

    // Unemployment histogram (exclude unemployment interval for coordinated view)
    throttledHistogram({
      dataset: 'counties',
      xColumn: 'unemployment',
      numBins: NUM_BINS,
      brushedIntervals,
      excludeIntervalsForColumns: ['unemployment'],
    }).then(setUnemploymentHist).catch(console.error);

    // Education histogram (exclude education interval for coordinated view)
    throttledHistogram({
      dataset: 'counties',
      xColumn: 'education',
      numBins: NUM_BINS,
      brushedIntervals,
      excludeIntervalsForColumns: ['education'],
    }).then(setEducationHist).catch(console.error);

    // Get filtered rows
    engine.rows({
      dataset: 'counties',
      brushedIntervals,
      limit: 100,
    }).then(setFilteredRows).catch(console.error);
  }, [engine, brushedIntervals]);

  const handleBrush = (column: string, interval: [number, number] | null) => {
    setBrushedIntervals(prev => ({
      ...prev,
      [column]: interval,
    }));
  };

  const clearBrush = (column: string) => {
    handleBrush(column, null);
  };

  if (loading) return <div className="demo">Loading...</div>;
  if (error) return <div className="demo error">Error: {error}</div>;

  return (
    <div className="demo">
      <h1>Data Query Library Demo</h1>
      <p className="subtitle">
        Interactive histograms with coordinated brushing using CSV engine
      </p>

      <div className="controls">
        <button onClick={() => setBrushedIntervals({ unemployment: null, education: null })}>
          Clear All Filters
        </button>
      </div>

      <div className="histograms">
        <div className="histogram-section">
          <h2>Unemployment Rate (%)</h2>
          {unemploymentHist && (
            <>
              <HistogramChart 
                data={unemploymentHist}
                brushed={brushedIntervals.unemployment}
                onBrush={(interval) => handleBrush('unemployment', interval)}
              />
              <div className="brush-info">
                {brushedIntervals.unemployment ? (
                  <>
                    Brushed: {brushedIntervals.unemployment[0].toFixed(1)} - {brushedIntervals.unemployment[1].toFixed(1)}
                    <button onClick={() => clearBrush('unemployment')}>Clear</button>
                  </>
                ) : (
                  'No brush (click and drag to select range)'
                )}
              </div>
            </>
          )}
        </div>

        <div className="histogram-section">
          <h2>Education Level (% with Bachelor's degree)</h2>
          {educationHist && (
            <>
              <HistogramChart 
                data={educationHist}
                brushed={brushedIntervals.education}
                onBrush={(interval) => handleBrush('education', interval)}
              />
              <div className="brush-info">
                {brushedIntervals.education ? (
                  <>
                    Brushed: {brushedIntervals.education[0].toFixed(1)} - {brushedIntervals.education[1].toFixed(1)}
                    <button onClick={() => clearBrush('education')}>Clear</button>
                  </>
                ) : (
                  'No brush (click and drag to select range)'
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="data-table">
        <h2>Filtered Data</h2>
        {filteredRows && (
          <div>
            <p>Showing {filteredRows.rows.length} rows</p>
            <table>
              <thead>
                <tr>
                  {filteredRows.columns.map(col => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.rows.map((row, i) => (
                  <tr key={i}>
                    {filteredRows.columns.map(col => (
                      <td key={col}>{String(row[col])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

interface HistogramChartProps {
  data: HistogramResponse;
  brushed: [number, number] | null;
  onBrush: (interval: [number, number] | null) => void;
}

function HistogramChart({ data, brushed, onBrush }: HistogramChartProps) {
  const width = 600;
  const height = 200;
  const margin = { top: 10, right: 10, bottom: 30, left: 40 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  const [domain] = data.domain;
  const maxCount = Math.max(...data.bins.map(b => b.length), 1);

  const xScale = (value: number) => {
    return ((value - domain) / (data.domain[1] - domain)) * chartWidth;
  };

  const yScale = (count: number) => {
    return chartHeight - (count / maxCount) * chartHeight;
  };

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left - margin.left;
    
    if (x >= 0 && x <= chartWidth) {
      const value = domain + (x / chartWidth) * (data.domain[1] - domain);
      setIsDragging(true);
      setDragStart(value);
      setDragEnd(value);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDragging) return;
    
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = Math.max(0, Math.min(chartWidth, e.clientX - rect.left - margin.left));
    const value = domain + (x / chartWidth) * (data.domain[1] - domain);
    setDragEnd(value);
  };

  const handleMouseUp = () => {
    if (isDragging && dragStart !== null && dragEnd !== null) {
      const min = Math.min(dragStart, dragEnd);
      const max = Math.max(dragStart, dragEnd);
      if (Math.abs(max - min) > 0.01) {
        onBrush([min, max]);
      }
    }
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
  };

  const brushExtent = isDragging && dragStart !== null && dragEnd !== null
    ? [Math.min(dragStart, dragEnd), Math.max(dragStart, dragEnd)]
    : brushed;

  return (
    <svg 
      width={width} 
      height={height}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ cursor: isDragging ? 'crosshair' : 'default' }}
    >
      <g transform={`translate(${margin.left},${margin.top})`}>
        {/* Bars */}
        {data.bins.map((bin, i) => {
          const barWidth = Math.max(1, chartWidth / data.bins.length - 1);
          const x = xScale(bin.x0);
          const y = yScale(bin.length);
          const barHeight = chartHeight - y;
          
          const isInBrush = brushExtent
            ? bin.x0 >= brushExtent[0] && bin.x1 <= brushExtent[1]
            : true;

          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              fill={isInBrush ? '#4285f4' : '#ccc'}
              opacity={0.8}
            />
          );
        })}

        {/* Brush overlay */}
        {brushExtent && (
          <rect
            x={xScale(brushExtent[0])}
            y={0}
            width={xScale(brushExtent[1]) - xScale(brushExtent[0])}
            height={chartHeight}
            fill="rgba(66, 133, 244, 0.1)"
            stroke="#4285f4"
            strokeWidth={2}
            pointerEvents="none"
          />
        )}

        {/* X-axis */}
        <line
          x1={0}
          y1={chartHeight}
          x2={chartWidth}
          y2={chartHeight}
          stroke="#000"
        />
        
        {/* Y-axis */}
        <line
          x1={0}
          y1={0}
          x2={0}
          y2={chartHeight}
          stroke="#000"
        />

        {/* X-axis labels */}
        <text
          x={0}
          y={chartHeight + 20}
          fontSize={12}
          textAnchor="start"
        >
          {data.domain[0].toFixed(1)}
        </text>
        <text
          x={chartWidth}
          y={chartHeight + 20}
          fontSize={12}
          textAnchor="end"
        >
          {data.domain[1].toFixed(1)}
        </text>

        {/* Y-axis label */}
        <text
          x={-5}
          y={-5}
          fontSize={12}
          textAnchor="end"
        >
          {maxCount}
        </text>
      </g>
    </svg>
  );
}
