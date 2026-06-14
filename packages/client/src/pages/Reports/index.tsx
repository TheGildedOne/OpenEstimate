import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, DollarSign, Users, Target } from 'lucide-react';
import BidPerformance from './BidPerformance';
import { useBidOutcomes, useBidPerformance, useEstimatorProductivity, useCostAnalysis } from '@/lib/api';
import { formatCurrency, formatPercent } from '@/lib/estimateCalc';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts';

type ReportTab = 'bid-performance' | 'cost-analysis' | 'estimator-productivity' | 'bid-outcomes';

const TABS: Array<{ key: ReportTab; label: string; icon: React.ReactNode }> = [
  { key: 'bid-performance', label: 'Bid Performance', icon: <TrendingUp className="w-4 h-4" /> },
  { key: 'cost-analysis', label: 'Cost Analysis', icon: <DollarSign className="w-4 h-4" /> },
  { key: 'estimator-productivity', label: 'Estimator Productivity', icon: <Users className="w-4 h-4" /> },
  { key: 'bid-outcomes', label: 'Bid Outcomes', icon: <Target className="w-4 h-4" /> },
];

const PIE_COLORS = ['#22c55e', '#ef4444', '#f97316', '#3b82f6', '#8b5cf6'];

function BidOutcomesTab() {
  const { data: outcomes = [], isLoading } = useBidOutcomes();
  const outcomeList = outcomes as Array<{ won: boolean; submittedAmount: number; competitorLowBid: number | null; projectName?: string; recordedAt: string }>;
  const won = outcomeList.filter((o) => o.won).length;
  const total = outcomeList.length;
  const pieData = [
    { name: 'Won', value: won },
    { name: 'Lost', value: total - won },
  ].filter((d) => d.value > 0);

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Bids', value: String(total) },
          { label: 'Won', value: String(won) },
          { label: 'Win Rate', value: total ? `${((won / total) * 100).toFixed(1)}%` : '0%' },
          { label: 'Total Won Value', value: formatCurrency(outcomeList.filter((o) => o.won).reduce((s, o) => s + o.submittedAmount, 0)) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-xs text-gray-400 mb-1">{label}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{isLoading ? '…' : value}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Win / Loss Split</h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}>
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 overflow-hidden">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Recent Outcomes</h3>
          <div className="overflow-y-auto max-h-52">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-400 uppercase">
                <tr><th className="text-left pb-2">Project</th><th className="text-right pb-2">Bid</th><th className="text-right pb-2">Result</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {outcomeList.slice(0, 20).map((o, i) => (
                  <tr key={i} className="text-xs">
                    <td className="py-1.5 text-gray-600 dark:text-gray-400 truncate max-w-[140px]">{o.projectName ?? '—'}</td>
                    <td className="py-1.5 text-right font-mono text-gray-500">{formatCurrency(o.submittedAmount)}</td>
                    <td className="py-1.5 text-right">
                      <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${o.won ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'}`}>
                        {o.won ? 'Won' : 'Lost'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function EstimatorProductivityTab() {
  const { data, isLoading } = useEstimatorProductivity();
  const prodData = data as Array<{ estimatorName: string; estimatesCreated: number; avgTime: number; totalValue: number }> | undefined;

  return (
    <div className="p-6 space-y-6">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Estimator Activity</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Estimator</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Estimates</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td colSpan={3} className="px-4 py-3"><div className="h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" /></td></tr>
              ))
            ) : !prodData || prodData.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400 text-sm">No productivity data available</td></tr>
            ) : (
              prodData.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{row.estimatorName}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{row.estimatesCreated}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-700 dark:text-gray-300">{formatCurrency(row.totalValue)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CostAnalysisTab() {
  const { data, isLoading } = useCostAnalysis();
  const costData = data as Array<{ category: string; totalMaterial: number; totalLabor: number; totalCost: number }> | undefined;

  return (
    <div className="p-6 space-y-6">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Cost by Category</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={costData ?? []} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
              <XAxis dataKey="category" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => [formatCurrency(v)]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="totalMaterial" name="Material" fill="#f97316" stackId="cost" />
              <Bar dataKey="totalLabor" name="Labor" fill="#3b82f6" stackId="cost" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default function Reports() {
  const [activeTab, setActiveTab] = useState<ReportTab>('bid-performance');

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex-shrink-0">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Reports</h1>
        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-700 -mb-4">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          {activeTab === 'bid-performance' && <BidPerformance />}
          {activeTab === 'cost-analysis' && <CostAnalysisTab />}
          {activeTab === 'estimator-productivity' && <EstimatorProductivityTab />}
          {activeTab === 'bid-outcomes' && <BidOutcomesTab />}
        </motion.div>
      </div>
    </div>
  );
}
