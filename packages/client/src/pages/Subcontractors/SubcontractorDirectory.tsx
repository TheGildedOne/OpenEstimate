import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  Users,
  Star,
  Phone,
  Mail,
  Edit,
  Trash2,
  X,
  TrendingUp,
  DollarSign,
  ClipboardList,
  ChevronRight,
  BarChart2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartTooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  useSubcontractors,
  useSubcontractor,
  useSubcontractorAnalytics,
  useCreateSubcontractor,
  useUpdateSubcontractor,
  useDeleteSubcontractor,
} from '@/lib/api';
import { formatCurrency } from '@/lib/estimateCalc';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { Tooltip } from '@/components/ui/Tooltip';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import type { Subcontractor } from '@openestimate/shared';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SubcontractorAnalytics {
  totalBids: number;
  wonBids: number;
  winRate: number;
  avgBidAmount: number;
  bidsPerMonth: Array<{ month: string; count: number; totalAmount: number }>;
  bidHistory: Array<{
    projectName: string;
    trade: string;
    bidAmount: number;
    status: string;
    date: string;
  }>;
}

// ─── Schema ────────────────────────────────────────────────────────────────────

const subSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  contactName: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  trade: z.string().optional(),
  notes: z.string().optional(),
  isPreferred: z.boolean().default(false),
});

type SubForm = z.infer<typeof subSchema>;

const TRADE_OPTIONS = [
  'Concrete',
  'Masonry',
  'Structural Steel',
  'Carpentry',
  'Roofing',
  'Plumbing',
  'HVAC',
  'Electrical',
  'Insulation',
  'Drywall',
  'Flooring',
  'Painting',
  'Landscaping',
  'Site Work',
  'Demo',
  'Other',
];

// ─── SubForm Modal ──────────────────────────────────────────────────────────────

interface SubFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editSub: Subcontractor | null;
}

function SubFormModal({ isOpen, onClose, editSub }: SubFormModalProps) {
  const { showSuccess, showError } = useUIStore();
  const createSub = useCreateSubcontractor();
  const updateSub = useUpdateSubcontractor();

  const form = useForm<SubForm>({
    resolver: zodResolver(subSchema),
    defaultValues: {
      companyName: editSub?.companyName ?? '',
      contactName: editSub?.contactName ?? '',
      email: editSub?.email ?? '',
      phone: editSub?.phone ?? '',
      trade: editSub?.trade ?? '',
      notes: editSub?.notes ?? '',
      isPreferred: editSub?.isPreferred ?? false,
    },
  });

  React.useEffect(() => {
    form.reset({
      companyName: editSub?.companyName ?? '',
      contactName: editSub?.contactName ?? '',
      email: editSub?.email ?? '',
      phone: editSub?.phone ?? '',
      trade: editSub?.trade ?? '',
      notes: editSub?.notes ?? '',
      isPreferred: editSub?.isPreferred ?? false,
    });
  }, [editSub, form]);

  const handleSubmit = async (data: SubForm) => {
    try {
      if (editSub) {
        await updateSub.mutateAsync({ id: editSub.id, ...data });
        showSuccess('Subcontractor updated');
      } else {
        await createSub.mutateAsync(data);
        showSuccess('Subcontractor added');
      }
      onClose();
    } catch {
      showError('Failed to save subcontractor');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editSub ? 'Edit Subcontractor' : 'Add Subcontractor'}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={form.handleSubmit(handleSubmit)}
            isLoading={createSub.isPending || updateSub.isPending}
          >
            {editSub ? 'Save Changes' : 'Add Subcontractor'}
          </Button>
        </div>
      }
    >
      <form className="space-y-3">
        <Input
          label="Company Name *"
          {...form.register('companyName')}
          error={form.formState.errors.companyName?.message}
        />
        <Input label="Contact Name" {...form.register('contactName')} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Email" type="email" {...form.register('email')} />
          <Input label="Phone" {...form.register('phone')} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700 dark:text-zinc-300">
            Trade / Specialty
          </label>
          <select
            {...form.register('trade')}
            className="block w-full rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">Select trade...</option>
            {TRADE_OPTIONS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700 dark:text-zinc-300">Notes</label>
          <textarea
            {...form.register('notes')}
            rows={3}
            className="block w-full rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 text-sm px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" {...form.register('isPreferred')} className="rounded" />
          <span className="text-sm text-gray-700 dark:text-zinc-300">Preferred subcontractor</span>
        </label>
      </form>
    </Modal>
  );
}

// ─── Detail Drawer ─────────────────────────────────────────────────────────────

interface DetailDrawerProps {
  subId: number | null;
  onClose: () => void;
  onEdit: (sub: Subcontractor) => void;
}

function DetailDrawer({ subId, onClose, onEdit }: DetailDrawerProps) {
  const { data: sub } = useSubcontractor(subId ?? 0);
  const { data: analytics } = useSubcontractorAnalytics(subId ?? 0);
  const stats = analytics as SubcontractorAnalytics | undefined;

  const chartData = (stats?.bidsPerMonth ?? []).slice(-12).map((m) => ({
    month: m.month,
    bids: m.count,
    amount: m.totalAmount,
  }));

  return (
    <AnimatePresence>
      {subId !== null && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            className="fixed right-0 top-0 h-full z-50 w-full max-w-xl bg-white dark:bg-zinc-900 border-l border-gray-200 dark:border-zinc-800 shadow-2xl overflow-y-auto"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 35 }}
          >
            <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-base font-semibold text-gray-900 dark:text-zinc-100">
                {sub?.companyName ?? '...'}
              </h2>
              <div className="flex items-center gap-2">
                {sub && (
                  <Button size="sm" variant="secondary" leftIcon={<Edit className="w-3.5 h-3.5" />} onClick={() => onEdit(sub)}>
                    Edit
                  </Button>
                )}
                <button
                  onClick={onClose}
                  className="p-1.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {!sub ? (
              <div className="p-6 space-y-4 animate-pulse">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-4 bg-gray-200 dark:bg-zinc-800 rounded" />
                ))}
              </div>
            ) : (
              <div className="p-6 space-y-6">
                {/* Contact info */}
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400">
                    Contact Information
                  </h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {sub.contactName && (
                      <div>
                        <p className="text-xs text-gray-400 dark:text-zinc-500 mb-0.5">Contact</p>
                        <p className="text-gray-900 dark:text-zinc-100">{sub.contactName}</p>
                      </div>
                    )}
                    {sub.trade && (
                      <div>
                        <p className="text-xs text-gray-400 dark:text-zinc-500 mb-0.5">Trade</p>
                        <Badge variant="blue" size="sm">{sub.trade}</Badge>
                      </div>
                    )}
                    {sub.email && (
                      <div>
                        <p className="text-xs text-gray-400 dark:text-zinc-500 mb-0.5">Email</p>
                        <a
                          href={`mailto:${sub.email}`}
                          className="text-brand-600 dark:text-brand-400 hover:underline truncate"
                        >
                          {sub.email}
                        </a>
                      </div>
                    )}
                    {sub.phone && (
                      <div>
                        <p className="text-xs text-gray-400 dark:text-zinc-500 mb-0.5">Phone</p>
                        <a href={`tel:${sub.phone}`} className="text-gray-900 dark:text-zinc-100 hover:underline">
                          {sub.phone}
                        </a>
                      </div>
                    )}
                  </div>
                  {sub.notes && (
                    <div>
                      <p className="text-xs text-gray-400 dark:text-zinc-500 mb-0.5">Notes</p>
                      <p className="text-sm text-gray-700 dark:text-zinc-300">{sub.notes}</p>
                    </div>
                  )}
                </div>

                {/* Analytics */}
                {stats && (
                  <>
                    <div className="space-y-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400">
                        Analytics
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          { label: 'Total Bids', value: stats.totalBids, icon: <ClipboardList className="w-4 h-4" /> },
                          { label: 'Bids Won', value: stats.wonBids, icon: <TrendingUp className="w-4 h-4" /> },
                          { label: 'Win Rate', value: `${(stats.winRate * 100).toFixed(0)}%`, icon: <BarChart2 className="w-4 h-4" /> },
                          { label: 'Avg Bid', value: formatCurrency(stats.avgBidAmount), icon: <DollarSign className="w-4 h-4" /> },
                        ].map(({ label, value, icon }) => (
                          <div
                            key={label}
                            className="rounded-xl border border-gray-200 dark:border-zinc-800 p-3 text-center"
                          >
                            <div className="text-gray-400 dark:text-zinc-500 flex justify-center mb-1">
                              {icon}
                            </div>
                            <p className="text-lg font-bold text-gray-900 dark:text-zinc-100">{value}</p>
                            <p className="text-xs text-gray-500 dark:text-zinc-400">{label}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Bids chart */}
                    {chartData.length > 0 && (
                      <div className="space-y-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400">
                          Bids Over Last 12 Months
                        </h3>
                        <div className="h-40">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                              <XAxis
                                dataKey="month"
                                tick={{ fontSize: 10 }}
                                tickLine={false}
                                axisLine={false}
                              />
                              <YAxis
                                tick={{ fontSize: 10 }}
                                tickLine={false}
                                axisLine={false}
                                allowDecimals={false}
                              />
                              <RechartTooltip
                                contentStyle={{
                                  fontSize: 12,
                                  borderRadius: 8,
                                  border: '1px solid #e5e7eb',
                                }}
                                formatter={(value: number, name: string) =>
                                  name === 'amount' ? [formatCurrency(value), 'Amount'] : [value, 'Bids']
                                }
                              />
                              <Bar dataKey="bids" fill="#6366f1" radius={[3, 3, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    {/* Bid history */}
                    {stats.bidHistory && stats.bidHistory.length > 0 && (
                      <div className="space-y-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400">
                          Bid History
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-gray-200 dark:border-zinc-800 text-left text-gray-500 dark:text-zinc-400">
                                <th className="pb-2 font-medium">Project</th>
                                <th className="pb-2 font-medium">Trade</th>
                                <th className="pb-2 font-medium text-right">Amount</th>
                                <th className="pb-2 font-medium">Status</th>
                                <th className="pb-2 font-medium">Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {stats.bidHistory.map((bid, i) => (
                                <tr
                                  key={i}
                                  className="border-b border-gray-100 dark:border-zinc-800/50 last:border-0"
                                >
                                  <td className="py-2 pr-3 text-gray-900 dark:text-zinc-100 max-w-[120px] truncate">
                                    {bid.projectName}
                                  </td>
                                  <td className="py-2 pr-3 text-gray-500 dark:text-zinc-400">
                                    {bid.trade}
                                  </td>
                                  <td className="py-2 pr-3 text-right font-mono text-gray-900 dark:text-zinc-100">
                                    {formatCurrency(bid.bidAmount)}
                                  </td>
                                  <td className="py-2 pr-3">
                                    <Badge
                                      variant={
                                        bid.status === 'awarded'
                                          ? 'green'
                                          : bid.status === 'rejected'
                                          ? 'red'
                                          : 'gray'
                                      }
                                      size="sm"
                                    >
                                      {bid.status}
                                    </Badge>
                                  </td>
                                  <td className="py-2 text-gray-400 dark:text-zinc-500 whitespace-nowrap">
                                    {format(new Date(bid.date), 'MMM d, yyyy')}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Preferred Toggle ─────────────────────────────────────────────────────────

function PreferredToggle({ sub }: { sub: Subcontractor }) {
  const update = useUpdateSubcontractor();
  const { showError } = useUIStore();

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await update.mutateAsync({ id: sub.id, isPreferred: !sub.isPreferred });
    } catch {
      showError('Failed to update preferred status');
    }
  };

  return (
    <Tooltip content={sub.isPreferred ? 'Remove preferred' : 'Mark preferred'}>
      <button
        onClick={toggle}
        disabled={update.isPending}
        className={`p-1 rounded transition-colors ${
          sub.isPreferred
            ? 'text-amber-400 hover:text-amber-500'
            : 'text-gray-300 dark:text-zinc-600 hover:text-amber-400'
        }`}
        aria-label={sub.isPreferred ? 'Remove preferred status' : 'Mark as preferred'}
      >
        <Star className={`w-4 h-4 ${sub.isPreferred ? 'fill-amber-400' : ''}`} />
      </button>
    </Tooltip>
  );
}

// ─── SubcontractorDirectory ───────────────────────────────────────────────────

export default function SubcontractorDirectory() {
  const [search, setSearch] = useState('');
  const [tradeFilter, setTradeFilter] = useState('');
  const [preferredOnly, setPreferredOnly] = useState(false);
  const [selectedSubId, setSelectedSubId] = useState<number | null>(null);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editSub, setEditSub] = useState<Subcontractor | null>(null);
  const [deleteSub, setDeleteSub] = useState<Subcontractor | null>(null);

  const { showSuccess, showError } = useUIStore();
  const currentUser = useAuthStore((s) => s.user);

  const filters: Record<string, string> = {};
  if (search) filters.q = search;
  if (tradeFilter) filters.trade = tradeFilter;
  if (preferredOnly) filters.preferred = 'true';

  const { data: subs, isLoading } = useSubcontractors(filters);
  const deleteMutation = useDeleteSubcontractor();

  const items = subs ?? [];

  // Collect all unique trades from the data
  const allTrades = useMemo(() => {
    const trades = new Set<string>();
    (subs ?? []).forEach((s) => { if (s.trade) trades.add(s.trade); });
    return Array.from(trades).sort();
  }, [subs]);

  const openAdd = () => {
    setEditSub(null);
    setFormModalOpen(true);
  };

  const openEdit = (sub: Subcontractor, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditSub(sub);
    setFormModalOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteSub) return;
    try {
      await deleteMutation.mutateAsync(deleteSub.id);
      showSuccess('Subcontractor deleted');
      if (selectedSubId === deleteSub.id) setSelectedSubId(null);
    } catch {
      showError('Failed to delete');
    } finally {
      setDeleteSub(null);
    }
  };

  return (
    <PageContainer
      title="Subcontractors"
      actions={
        <Button onClick={openAdd} leftIcon={<Plus className="w-4 h-4" />}>
          Add Subcontractor
        </Button>
      }
    >
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Input
          placeholder="Search subcontractors…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          prefix={<Search className="w-4 h-4" />}
          className="max-w-xs"
          containerClassName="flex-1 min-w-[180px] max-w-xs"
        />
        <select
          value={tradeFilter}
          onChange={(e) => setTradeFilter(e.target.value)}
          className="rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">All Trades</option>
          {allTrades.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button
          onClick={() => setPreferredOnly((v) => !v)}
          className={[
            'flex items-center gap-1.5 px-3 py-2 rounded-md border text-sm font-medium transition-colors',
            preferredOnly
              ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400'
              : 'bg-white dark:bg-zinc-900 border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800',
          ].join(' ')}
        >
          <Star className={`w-3.5 h-3.5 ${preferredOnly ? 'fill-amber-500 text-amber-500' : ''}`} />
          Preferred only
        </button>
      </div>

      {isLoading ? (
        <SkeletonTable rows={6} cols={6} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="No subcontractors found"
          description={
            search || tradeFilter || preferredOnly
              ? 'Try adjusting your filters.'
              : 'Build your subcontractor database to streamline bid collection.'
          }
          action={
            !search && !tradeFilter && !preferredOnly
              ? { label: 'Add Subcontractor', onClick: openAdd }
              : undefined
          }
        />
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-zinc-900">
              <tr className="text-left text-xs text-gray-500 dark:text-zinc-400 border-b border-gray-200 dark:border-zinc-800">
                <th className="px-4 py-3 font-medium">Company Name</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Contact</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Email</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Phone</th>
                <th className="px-4 py-3 font-medium">Trade</th>
                <th className="px-4 py-3 font-medium text-center">Preferred</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((sub) => (
                <motion.tr
                  key={sub.id}
                  layout
                  className="border-b border-gray-100 dark:border-zinc-800/50 last:border-0 hover:bg-gray-50 dark:hover:bg-zinc-800/40 cursor-pointer transition-colors"
                  onClick={() => setSelectedSubId(sub.id === selectedSubId ? null : sub.id)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-zinc-100">
                        {sub.companyName}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100" />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-zinc-400 hidden sm:table-cell">
                    {sub.contactName ?? '—'}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {sub.email ? (
                      <a
                        href={`mailto:${sub.email}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 text-brand-600 dark:text-brand-400 hover:underline text-xs"
                      >
                        <Mail className="w-3 h-3" />
                        {sub.email}
                      </a>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-zinc-400 text-xs hidden md:table-cell">
                    {sub.phone ? (
                      <a
                        href={`tel:${sub.phone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 hover:underline"
                      >
                        <Phone className="w-3 h-3" />
                        {sub.phone}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {sub.trade ? (
                      <Badge variant="blue" size="sm">{sub.trade}</Badge>
                    ) : (
                      <span className="text-gray-400 dark:text-zinc-600 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <PreferredToggle sub={sub} />
                  </td>
                  <td className="px-4 py-3">
                    <div
                      className="flex items-center justify-end gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={(e) => openEdit(sub, e)}
                        className="p-1.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                        aria-label="Edit"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteSub(sub)}
                        className="p-1.5 rounded text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                        aria-label="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail drawer */}
      <DetailDrawer
        subId={selectedSubId}
        onClose={() => setSelectedSubId(null)}
        onEdit={(sub) => {
          setSelectedSubId(null);
          openEdit(sub);
        }}
      />

      {/* Add/Edit modal */}
      <SubFormModal
        isOpen={formModalOpen}
        onClose={() => { setFormModalOpen(false); setEditSub(null); }}
        editSub={editSub}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        isOpen={!!deleteSub}
        onClose={() => setDeleteSub(null)}
        onConfirm={handleDelete}
        title="Delete Subcontractor"
        message={`Remove "${deleteSub?.companyName}" from your directory? This cannot be undone.`}
        confirmLabel="Delete"
        isLoading={deleteMutation.isPending}
      />
    </PageContainer>
  );
}
