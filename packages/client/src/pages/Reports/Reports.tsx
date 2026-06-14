import React, { useState } from 'react';
import {
  TrendingUp,
  DollarSign,
  Target,
  Award,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { useBidPerformance, useBidOutcomes, useEstimatorProductivity } from '../../lib/api';
import { PageContainer } from '../../components/layout/PageContainer';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { formatCurrency, formatPercent } from '../../lib/estimateCalc';

const PIE_COLORS = ['#22c55e', '#ef4444', '#3b82f6', '#f59e0b'];

function StatCard({
  icon,
  label,
  value,
  subLabel,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subLabel?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg bg-brand-100 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400 flex items-center justify-center">
          {icon}
        </div>
        <span className="text-sm text-gray-500 dark:text-zinc-400">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-zinc-100">{value}</p>
      {subLabel && (
        <p className="text-xs text-gray-400 dark:text-zinc-600 mt-1">{subLabel}</p>
      )}
    </div>
  );
}

export default function Reports() {
  const [dateRange, setDateRange] = useState('ytd');

  const filters = { period: dateRange };
  const { data: bidPerf, isLoading: perfLoading } = useBidPerformance(filters);
  const { data: outcomes, isLoading: outcomesLoading } = useBidOutcomes();
  const { data: productivity, isLoading: prodLoading } = useEstimatorProductivity(filters);

  const perfData = bidPerf as any;
  const outcomeList = (outcomes ?? []) as any[];
  const won = outcomeList.filter((o: any) => o.won).length;
  const total = outcomeList.length;
  const winRate = total > 0 ? (won / total) * 100 : 0;

  const pieData = [
    { name: 'Won', value: won },
    { name: 'Lost', value: total - won },
  ].filter((d) => d.value > 0);

  return (
    <PageContainer title="Reports">
      {/* Date range filter */}
      <div className="flex items-center gap-2 mb-6">
        {['mtd', 'qtd', 'ytd', 'all'].map((r) => (
          <button
            key={r}
            onClick={() => setDateRange(r)}
            className={[
              'px-3 py-1.5 text-sm rounded-lg font-medium transition-colors',
              dateRange === r
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-700',
            ].join(' ')}
          >
            {r.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={<Target className="w-5 h-5" />}
          label="Bids Submitted"
          value={String(total)}
          subLabel="This period"
        />
        <StatCard
          icon={<Award className="w-5 h-5" />}
          label="Win Rate"
          value={formatPercent(winRate, 1)}
          subLabel={`${won} of ${total} bids`}
        />
        <StatCard
          icon={<DollarSign className="w-5 h-5" />}
          label="Total Won Value"
          value={formatCurrency(
            outcomeList.filter((o: any) => o.won).reduce((s: number, o: any) => s + (o.submittedAmount ?? 0), 0)
          )}
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="Avg Bid Amount"
          value={
            total > 0
              ? formatCurrency(
                  outcomeList.reduce((s: number, o: any) => s + (o.submittedAmount ?? 0), 0) / total
                )
              : '$0'
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Win/Loss Pie */}
        <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100 mb-4">
            Bid Outcomes
          </h3>
          {outcomesLoading ? (
            <SkeletonCard rows={3} />
          ) : pieData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400 dark:text-zinc-600 text-sm">
              No bid outcome data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, percent }) =>
                    `${name}: ${(percent * 100).toFixed(0)}%`
                  }
                >
                  {pieData.map((_, idx) => (
                    <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Monthly bid chart */}
        <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100 mb-4">
            Bids Over Time
          </h3>
          {perfLoading ? (
            <SkeletonCard rows={3} />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={(perfData as any)?.monthly ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="submitted" fill="#3b82f6" name="Submitted" radius={[3, 3, 0, 0]} />
                <Bar dataKey="won" fill="#22c55e" name="Won" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
