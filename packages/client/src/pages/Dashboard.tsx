import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { format, formatDistanceToNow, differenceInDays, addDays } from 'date-fns';
import {
  FolderKanban,
  DollarSign,
  TrendingUp,
  Trophy,
  Plus,
  Search,
  AlertCircle,
  Clock,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import type { Project, ProjectActivityLog } from '@openestimate/shared';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashboardStats {
  totalProjectsThisYear: number;
  totalBidValue: number;
  winRate: number;
  wonRevenue: number;
  totalProjectsLastYear?: number;
  totalBidValueLastYear?: number;
  winRateLastYear?: number;
  wonRevenueLastYear?: number;
}

interface MonthlyBidData {
  month: string;
  won: number;
  lost: number;
}

interface DashboardData {
  stats: DashboardStats;
  activeBids: Project[];
  upcomingDeadlines: Project[];
  recentActivity: ProjectActivityLog[];
  monthlyBidData: MonthlyBidData[];
}

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchDashboard(): Promise<DashboardData> {
  const res = await fetch('/api/projects/dashboard', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load dashboard');
  const json = await res.json();
  return json.data ?? json;
}

function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
    staleTime: 1000 * 60 * 2,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function dueBadge(bidDueDate: string | null) {
  if (!bidDueDate) return null;
  const days = differenceInDays(new Date(bidDueDate), new Date());
  if (days <= 3)
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">
        {days <= 0 ? 'Overdue' : `${days}d`}
      </span>
    );
  if (days <= 7)
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400">
        {days}d
      </span>
    );
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
      {days}d
    </span>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

interface KpiCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  trend?: number;
  color: string;
  loading?: boolean;
}

function KpiCard({ title, value, subtitle, icon, trend, color, loading }: KpiCardProps) {
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-100 dark:border-gray-800">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/2" />
          <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-3/4" />
          <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-2/3" />
        </div>
      </div>
    );
  }

  const trendUp = trend !== undefined && trend >= 0;

  return (
    <motion.div
      className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`p-2.5 rounded-xl ${color}`}>{icon}</div>
        {trend !== undefined && (
          <span
            className={`flex items-center gap-0.5 text-xs font-medium ${trendUp ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}
          >
            {trendUp ? (
              <ArrowUpRight className="w-3.5 h-3.5" />
            ) : (
              <ArrowDownRight className="w-3.5 h-3.5" />
            )}
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-0.5">{title}</p>
      <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">{subtitle}</p>
    </motion.div>
  );
}

// ── Skeleton rows ──────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="animate-pulse flex items-center gap-4 py-3">
      <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded flex-1" />
      <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-24" />
      <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-16" />
    </div>
  );
}

// ── Custom tooltip for chart ──────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-lg text-sm">
      <p className="font-semibold text-gray-900 dark:text-white mb-2">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <span className="font-medium">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useDashboard();

  const stats = data?.stats;
  const activeBids = data?.activeBids ?? [];
  const upcomingDeadlines = data?.upcomingDeadlines ?? [];
  const recentActivity = data?.recentActivity ?? [];
  const monthlyBidData = data?.monthlyBidData ?? [];

  // Fallback monthly data for demo
  const chartData: MonthlyBidData[] =
    monthlyBidData.length > 0
      ? monthlyBidData
      : Array.from({ length: 12 }, (_, i) => {
          const d = new Date();
          d.setMonth(d.getMonth() - (11 - i));
          return {
            month: format(d, 'MMM'),
            won: 0,
            lost: 0,
          };
        });

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-gray-500 dark:text-gray-400">
        <AlertCircle className="w-12 h-12 mb-3 text-red-400" />
        <p className="text-lg font-medium">Failed to load dashboard</p>
        <p className="text-sm mt-1">Please refresh the page</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/projects', { state: { openSearch: true } })}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg hover:border-gray-300 dark:hover:border-gray-700 transition-colors"
          >
            <Search className="w-4 h-4" />
            <span>Search</span>
            <kbd className="ml-1 text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded font-mono">
              ⌘K
            </kbd>
          </button>
          <button
            onClick={() => navigate('/projects?new=1')}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Project
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          loading={isLoading}
          title="Total Projects This Year"
          value={stats ? String(stats.totalProjectsThisYear) : '—'}
          subtitle="All statuses"
          icon={<FolderKanban className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
          color="bg-blue-50 dark:bg-blue-900/30"
          trend={
            stats && stats.totalProjectsLastYear
              ? ((stats.totalProjectsThisYear - stats.totalProjectsLastYear) /
                  (stats.totalProjectsLastYear || 1)) *
                100
              : undefined
          }
        />
        <KpiCard
          loading={isLoading}
          title="Total Bid Value"
          value={stats ? formatCurrency(stats.totalBidValue) : '—'}
          subtitle="Sum of active estimate totals"
          icon={<DollarSign className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
          color="bg-emerald-50 dark:bg-emerald-900/30"
          trend={
            stats && stats.totalBidValueLastYear
              ? ((stats.totalBidValue - stats.totalBidValueLastYear) /
                  (stats.totalBidValueLastYear || 1)) *
                100
              : undefined
          }
        />
        <KpiCard
          loading={isLoading}
          title="Win Rate"
          value={stats ? `${stats.winRate.toFixed(1)}%` : '—'}
          subtitle="Won vs submitted bids"
          icon={<TrendingUp className="w-5 h-5 text-purple-600 dark:text-purple-400" />}
          color="bg-purple-50 dark:bg-purple-900/30"
          trend={
            stats && stats.winRateLastYear !== undefined
              ? stats.winRate - stats.winRateLastYear
              : undefined
          }
        />
        <KpiCard
          loading={isLoading}
          title="Won Revenue"
          value={stats ? formatCurrency(stats.wonRevenue) : '—'}
          subtitle="Revenue from won bids"
          icon={<Trophy className="w-5 h-5 text-orange-600 dark:text-orange-400" />}
          color="bg-orange-50 dark:bg-orange-900/30"
          trend={
            stats && stats.wonRevenueLastYear
              ? ((stats.wonRevenue - stats.wonRevenueLastYear) /
                  (stats.wonRevenueLastYear || 1)) *
                100
              : undefined
          }
        />
      </div>

      {/* Main content: 2-col layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* LEFT: Active Bids + Chart */}
        <div className="xl:col-span-2 space-y-6">
          {/* Active Bids Panel */}
          <motion.div
            className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                Active Bids
              </h2>
              <Link
                to="/projects?status=bidding"
                className="text-sm text-orange-500 hover:text-orange-600 font-medium flex items-center gap-1"
              >
                View all <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="divide-y divide-gray-50 dark:divide-gray-800/60">
              {isLoading ? (
                <div className="px-6 py-2">
                  {[0, 1, 2, 3].map((i) => (
                    <SkeletonRow key={i} />
                  ))}
                </div>
              ) : activeBids.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-600">
                  <FolderKanban className="w-10 h-10 mb-3" />
                  <p className="text-sm font-medium">No active bids</p>
                  <p className="text-xs mt-1">Projects in bidding or submitted status appear here</p>
                </div>
              ) : (
                activeBids.map((project) => (
                  <Link
                    key={project.id}
                    to={`/projects/${project.id}`}
                    className="flex items-center gap-4 px-6 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-orange-500 transition-colors">
                        {project.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {project.clientName}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {project.bidDueDate && (
                        <div className="flex items-center gap-1.5 justify-end mb-1">
                          <Clock className="w-3 h-3 text-gray-400" />
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {format(new Date(project.bidDueDate), 'MMM d')}
                          </span>
                          {dueBadge(project.bidDueDate)}
                        </div>
                      )}
                      {project.activeEstimateTotal != null && (
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {formatCurrency(project.activeEstimateTotal)}
                        </p>
                      )}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </motion.div>

          {/* Win/Loss Chart */}
          <motion.div
            className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-6"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-5">
              Win / Loss — Last 12 Months
            </h2>
            {isLoading ? (
              <div className="h-48 animate-pulse bg-gray-100 dark:bg-gray-800 rounded-xl" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} barGap={4} barSize={14}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" className="dark:stroke-gray-800" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12, fill: '#9ca3af' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: '#9ca3af' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 12, color: '#6b7280' }}
                  />
                  <Bar dataKey="won" name="Won" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="lost" name="Lost" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </motion.div>
        </div>

        {/* RIGHT: Deadlines + Activity */}
        <div className="space-y-6">
          {/* Upcoming Deadlines */}
          <motion.div
            className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                Upcoming Deadlines
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Next 14 days</p>
            </div>
            <div className="px-5 py-3 space-y-1 max-h-64 overflow-y-auto">
              {isLoading ? (
                [0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="animate-pulse h-12 bg-gray-100 dark:bg-gray-800 rounded-lg mb-2"
                  />
                ))
              ) : upcomingDeadlines.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-600 py-6 text-center">
                  No deadlines in the next 14 days
                </p>
              ) : (
                upcomingDeadlines
                  .filter((p) => p.bidDueDate)
                  .map((p) => {
                    const days = differenceInDays(new Date(p.bidDueDate!), new Date());
                    return (
                      <Link
                        key={p.id}
                        to={`/projects/${p.id}`}
                        className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group"
                      >
                        <div
                          className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center shrink-0 text-center ${
                            days <= 3
                              ? 'bg-red-100 dark:bg-red-900/30'
                              : days <= 7
                                ? 'bg-yellow-100 dark:bg-yellow-900/30'
                                : 'bg-gray-100 dark:bg-gray-800'
                          }`}
                        >
                          <span
                            className={`text-xs font-bold leading-none ${
                              days <= 3
                                ? 'text-red-600 dark:text-red-400'
                                : days <= 7
                                  ? 'text-yellow-600 dark:text-yellow-400'
                                  : 'text-gray-600 dark:text-gray-400'
                            }`}
                          >
                            {format(new Date(p.bidDueDate!), 'd')}
                          </span>
                          <span
                            className={`text-[9px] uppercase font-medium ${
                              days <= 3
                                ? 'text-red-500 dark:text-red-500'
                                : days <= 7
                                  ? 'text-yellow-500'
                                  : 'text-gray-400'
                            }`}
                          >
                            {format(new Date(p.bidDueDate!), 'MMM')}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-orange-500 transition-colors">
                            {p.name}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {days === 0 ? 'Due today' : days < 0 ? 'Overdue' : `${days}d remaining`}
                          </p>
                        </div>
                      </Link>
                    );
                  })
              )}
            </div>
          </motion.div>

          {/* Recent Activity */}
          <motion.div
            className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                Recent Activity
              </h2>
            </div>
            <div className="px-5 py-3 space-y-3 max-h-80 overflow-y-auto">
              {isLoading ? (
                [0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="animate-pulse flex gap-3 items-start">
                    <div className="w-7 h-7 bg-gray-200 dark:bg-gray-800 rounded-full shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 bg-gray-200 dark:bg-gray-800 rounded w-full" />
                      <div className="h-3 bg-gray-100 dark:bg-gray-800/60 rounded w-1/2" />
                    </div>
                  </div>
                ))
              ) : recentActivity.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-600 py-6 text-center">
                  No recent activity
                </p>
              ) : (
                recentActivity.slice(0, 20).map((log) => {
                  const initials = (log.userName ?? 'U')
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2);
                  return (
                    <div key={log.id} className="flex gap-3 items-start">
                      <div className="w-7 h-7 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                        <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">
                          {initials}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                          <span className="font-medium">{log.userName ?? 'Unknown'}</span>{' '}
                          {log.action}
                          {log.detail ? ` — ${log.detail}` : ''}
                        </p>
                        <p className="text-[10px] text-gray-400 dark:text-gray-600 mt-0.5">
                          {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
