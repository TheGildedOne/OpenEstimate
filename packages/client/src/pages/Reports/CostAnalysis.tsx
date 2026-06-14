import React, { useState } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Legend,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts';
import { useCostAnalysis } from '@/lib/api';
import { formatCurrency } from '@/lib/estimateCalc';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CostData {
  split: {
    labor: number;
    material: number;
    total: number;
  };
  monthly: Array<{
    month: string;
    labor: number;
    material: number;
    total: number;
  }>;
  topItems: Array<{
    description: string;
    totalCost: number;
  }>;
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

function CostTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 text-xs">
      {label && <p className="font-semibold text-gray-800 dark:text-white mb-2">{label}</p>}
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.fill || p.stroke }} />
          <span className="text-gray-500 dark:text-gray-400">{p.name}:</span>
          <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function ChartSkeleton({ height = 240 }: { height?: number }) {
  return <div className="bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" style={{ height }} />;
}

// ── CostAnalysis ──────────────────────────────────────────────────────────────

export default function CostAnalysis() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [appliedFilters, setAppliedFilters] = useState<Record<string, string>>({});

  const { data, isLoading } = useCostAnalysis(appliedFilters);
  const costData = data as CostData | undefined;

  const split = costData?.split;
  const monthly = costData?.monthly ?? [];
  const topItems = costData?.topItems ?? [];

  const pieData = split
    ? [
        { name: 'Labor', value: split.labor },
        { name: 'Material', value: split.material },
      ]
    : [];

  const PIE_COLORS = ['#f97316', '#3b82f6'];

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

      {/* Labor vs Material pie */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Labor vs Material Split</h3>
          {isLoading ? (
            <ChartSkeleton />
          ) : pieData.length === 0 || (pieData[0].value === 0 && pieData[1].value === 0) ? (
            <div className="flex items-center justify-center h-48 text-sm text-gray-400 dark:text-gray-600">
              No cost data available
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    dataKey="value"
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {pieData.map((_, idx) => (
                      <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend />
                  <Tooltip content={<CostTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              {split && (
                <div className="grid grid-cols-3 gap-3 mt-2">
                  {[
                    { label: 'Labor', value: split.labor, color: 'text-orange-600 dark:text-orange-400' },
                    { label: 'Material', value: split.material, color: 'text-blue-600 dark:text-blue-400' },
                    { label: 'Total', value: split.total, color: 'text-gray-900 dark:text-white' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
                      <p className={`text-sm font-bold ${color}`}>{formatCurrency(value)}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Monthly trend */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Monthly Cost Trend</h3>
          {isLoading ? (
            <ChartSkeleton />
          ) : monthly.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-sm text-gray-400 dark:text-gray-600">
              No monthly data
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={monthly} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CostTooltip />} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="material"
                  name="Material"
                  stackId="1"
                  stroke="#3b82f6"
                  fill="#93c5fd"
                  fillOpacity={0.7}
                />
                <Area
                  type="monotone"
                  dataKey="labor"
                  name="Labor"
                  stackId="1"
                  stroke="#f97316"
                  fill="#fdba74"
                  fillOpacity={0.7}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top 10 most expensive line items */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Top 10 Most Expensive Line Items</h3>
        {isLoading ? (
          <ChartSkeleton height={280} />
        ) : topItems.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-sm text-gray-400 dark:text-gray-600">
            No line item data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(220, topItems.length * 36)}>
            <BarChart
              data={topItems.slice(0, 10)}
              layout="vertical"
              margin={{ top: 4, right: 60, bottom: 4, left: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <YAxis
                type="category"
                dataKey="description"
                width={200}
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => v.length > 28 ? v.slice(0, 27) + '…' : v}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const item = payload[0];
                  return (
                    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 text-xs max-w-xs">
                      <p className="font-semibold text-gray-800 dark:text-white mb-1 whitespace-normal">
                        {item.payload?.description}
                      </p>
                      <p className="text-gray-600 dark:text-gray-400">
                        {formatCurrency(item.value as number)}
                      </p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="totalCost" name="Total Cost" fill="#3b82f6" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
