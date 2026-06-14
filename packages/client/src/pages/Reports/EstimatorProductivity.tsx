import React, { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useEstimatorProductivity } from '@/lib/api';
import { formatCurrency } from '@/lib/estimateCalc';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProductivityData {
  byEstimator: Array<{
    estimatorId: number;
    estimatorName: string;
    estimatesCreated: number;
    totalBidVolume: number;
    avgBidSize: number;
    winRate: number;
  }>;
  monthly: Array<{
    month: string;
    [estimatorName: string]: number | string;
  }>;
  estimatorNames: string[];
}

const CHART_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#f97316',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f59e0b',
  '#ef4444',
];

// ── Skeleton ──────────────────────────────────────────────────────────────────

function ChartSkeleton({ height = 240 }: { height?: number }) {
  return <div className="bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" style={{ height }} />;
}

function TableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
      ))}
    </div>
  );
}

// ── EstimatorProductivity ─────────────────────────────────────────────────────

export default function EstimatorProductivity() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [appliedFilters, setAppliedFilters] = useState<Record<string, string>>({});

  const { data, isLoading } = useEstimatorProductivity(appliedFilters);
  const prodData = data as ProductivityData | undefined;

  const byEstimator = prodData?.byEstimator ?? [];
  const monthly = prodData?.monthly ?? [];
  const estimatorNames = prodData?.estimatorNames ?? [];

  const applyFilters = () => {
    const filters: Record<string, string> = {};
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    setAppliedFilters(filters);
  };

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <button
            onClick={applyFilters}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Apply
          </button>
        </div>
      </div>

      {/* Grouped bar chart: estimates per estimator per month */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
          Estimates Created per Estimator per Month
        </h3>
        {isLoading ? (
          <ChartSkeleton />
        ) : monthly.length === 0 || estimatorNames.length === 0 ? (
          <div className="flex items-center justify-center h-52 text-sm text-gray-400 dark:text-gray-600">
            No productivity data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthly} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 text-xs">
                      <p className="font-semibold text-gray-800 dark:text-white mb-2">{label}</p>
                      {payload.map((p: any) => (
                        <div key={p.name} className="flex items-center gap-2 mb-1">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.fill }} />
                          <span className="text-gray-500">{p.name}:</span>
                          <span className="font-medium text-gray-900 dark:text-white">{p.value}</span>
                        </div>
                      ))}
                    </div>
                  );
                }}
              />
              <Legend />
              {estimatorNames.map((name, idx) => (
                <Bar
                  key={name}
                  dataKey={name}
                  fill={CHART_COLORS[idx % CHART_COLORS.length]}
                  radius={[3, 3, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Productivity table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Estimator Summary</h3>
        </div>
        {isLoading ? (
          <div className="p-5">
            <TableSkeleton />
          </div>
        ) : byEstimator.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400 dark:text-gray-600">
            No estimator data available
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Estimator</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Estimates Created</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Total Bid Volume</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Avg Bid Size</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Win Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {byEstimator.map((row) => (
                  <tr key={row.estimatorId} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                          <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">
                            {row.estimatorName
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .toUpperCase()
                              .slice(0, 2)}
                          </span>
                        </div>
                        <span className="font-medium text-gray-900 dark:text-white">{row.estimatorName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300 tabular-nums">
                      {row.estimatesCreated}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300 tabular-nums">
                      {formatCurrency(row.totalBidVolume)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300 tabular-nums">
                      {formatCurrency(row.avgBidSize)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span
                        className={`font-semibold ${
                          row.winRate >= 50
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-500 dark:text-red-400'
                        }`}
                      >
                        {row.winRate.toFixed(1)}%
                      </span>
                    </td>
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
