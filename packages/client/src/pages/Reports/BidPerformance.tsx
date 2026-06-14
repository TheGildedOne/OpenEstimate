import React, { useState } from 'react';
import { format } from 'date-fns';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { Target, Award, DollarSign, TrendingUp, TrendingDown, Percent } from 'lucide-react';
import { useBidPerformance } from '@/lib/api';
import { formatCurrency } from '@/lib/estimateCalc';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BidPerfData {
  summary: {
    totalBids: number;
    won: number;
    lost: number;
    winRate: number;
    avgWonAmount: number;
    avgLostAmount: number;
  };
  byPeriod: Array<{
    period: string;
    won: number;
    lost: number;
    wonAmount: number;
    lostAmount: number;
    winRate: number;
  }>;
  byClient: Array<{
    clientName: string;
    totalBids: number;
    won: number;
    lost: number;
    winRate: number;
  }>;
  byTrade: Array<{
    trade: string;
    totalBids: number;
    won: number;
    winRate: number;
  }>;
}

type Period = 'monthly' | 'quarterly' | 'yearly';

// ── KPI Card ─────────────────────────────────────────────────────────────────

function KPICard({
  icon,
  label,
  value,
  sub,
  color = 'text-gray-600 dark:text-gray-400',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className={color}>{icon}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">{sub}</p>}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function KPISkeleton() {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 animate-pulse">
      <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-24 mb-3" />
      <div className="h-7 bg-gray-200 dark:bg-gray-800 rounded w-32" />
    </div>
  );
}

function ChartSkeleton({ height = 220 }: { height?: number }) {
  return (
    <div
      className="bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse"
      style={{ height }}
    />
  );
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

function BidTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-800 dark:text-white mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.fill || p.stroke }} />
          <span className="text-gray-600 dark:text-gray-400">{p.name}:</span>
          <span className="font-medium text-gray-900 dark:text-white">
            {typeof p.value === 'number' && p.name?.toLowerCase().includes('amount')
              ? formatCurrency(p.value)
              : p.name?.toLowerCase().includes('rate')
              ? `${p.value.toFixed(1)}%`
              : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── BidPerformance ────────────────────────────────────────────────────────────

export default function BidPerformance() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [period, setPeriod] = useState<Period>('monthly');
  const [appliedFilters, setAppliedFilters] = useState<Record<string, string>>({});

  const { data, isLoading } = useBidPerformance(appliedFilters);
  const perf = data as BidPerfData | undefined;

  const summary = perf?.summary;
  const byPeriod = perf?.byPeriod ?? [];
  const byClient = perf?.byClient ?? [];
  const byTrade = perf?.byTrade ?? [];

  const applyFilters = () => {
    const filters: Record<string, string> = { period };
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
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Period</label>
            <div className="flex rounded-lg border border-gray-300 dark:border-gray-700 overflow-hidden">
              {(['monthly', 'quarterly', 'yearly'] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-2 text-sm font-medium capitalize transition-colors ${
                    period === p
                      ? 'bg-orange-500 text-white'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {p.slice(0, 3).toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={applyFilters}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Apply
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <KPISkeleton key={i} />)
        ) : (
          <>
            <KPICard
              icon={<Target className="w-4 h-4" />}
              label="Total Bids"
              value={String(summary?.totalBids ?? 0)}
              color="text-blue-500"
            />
            <KPICard
              icon={<Award className="w-4 h-4" />}
              label="Won"
              value={String(summary?.won ?? 0)}
              color="text-green-500"
            />
            <KPICard
              icon={<TrendingDown className="w-4 h-4" />}
              label="Lost"
              value={String(summary?.lost ?? 0)}
              color="text-red-500"
            />
            <KPICard
              icon={<Percent className="w-4 h-4" />}
              label="Win Rate"
              value={`${(summary?.winRate ?? 0).toFixed(1)}%`}
              sub={`${summary?.won ?? 0} of ${summary?.totalBids ?? 0}`}
              color="text-orange-500"
            />
            <KPICard
              icon={<DollarSign className="w-4 h-4" />}
              label="Avg Won Bid"
              value={formatCurrency(summary?.avgWonAmount ?? 0)}
              color="text-green-500"
            />
            <KPICard
              icon={<TrendingUp className="w-4 h-4" />}
              label="Avg Lost Bid"
              value={formatCurrency(summary?.avgLostAmount ?? 0)}
              color="text-red-500"
            />
          </>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Won vs Lost bar chart */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Bids Won vs Lost by Period</h3>
          {isLoading ? (
            <ChartSkeleton />
          ) : byPeriod.length === 0 ? (
            <div className="flex items-center justify-center h-52 text-sm text-gray-400 dark:text-gray-600">
              No data for this period
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byPeriod} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip content={<BidTooltip />} />
                <Legend />
                <Bar dataKey="won" name="Won" fill="#22c55e" radius={[3, 3, 0, 0]} />
                <Bar dataKey="lost" name="Lost" fill="#ef4444" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Win rate line chart */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Win Rate % Over Time</h3>
          {isLoading ? (
            <ChartSkeleton />
          ) : byPeriod.length === 0 ? (
            <div className="flex items-center justify-center h-52 text-sm text-gray-400 dark:text-gray-600">
              No data for this period
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={byPeriod} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <Tooltip content={<BidTooltip />} />
                <Line
                  type="monotone"
                  dataKey="winRate"
                  name="Win Rate"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ fill: '#3b82f6', r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Client */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Win Rate by Client</h3>
          </div>
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-8 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
              ))}
            </div>
          ) : byClient.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400 dark:text-gray-600">No data</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Client</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Bids</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Won</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Lost</th>
                  <th className="text-right px-5 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Win %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {byClient.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-5 py-2.5 font-medium text-gray-900 dark:text-white">{row.clientName}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300">{row.totalBids}</td>
                    <td className="px-4 py-2.5 text-right text-green-600 dark:text-green-400 font-medium">{row.won}</td>
                    <td className="px-4 py-2.5 text-right text-red-500 dark:text-red-400">{row.lost}</td>
                    <td className="px-5 py-2.5 text-right">
                      <span className={`font-semibold ${row.winRate >= 50 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                        {row.winRate.toFixed(0)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* By Trade */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Win Rate by Trade</h3>
          </div>
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-8 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
              ))}
            </div>
          ) : byTrade.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400 dark:text-gray-600">No data</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Trade</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Bids</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Won</th>
                  <th className="text-right px-5 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Win %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {byTrade.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-5 py-2.5 font-medium text-gray-900 dark:text-white">{row.trade || '—'}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300">{row.totalBids}</td>
                    <td className="px-4 py-2.5 text-right text-green-600 dark:text-green-400 font-medium">{row.won}</td>
                    <td className="px-5 py-2.5 text-right">
                      <span className={`font-semibold ${row.winRate >= 50 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                        {row.winRate.toFixed(0)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
