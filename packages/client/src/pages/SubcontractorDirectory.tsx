import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Star,
  Plus,
  X,
  Phone,
  Mail,
  Building2,
  TrendingUp,
  DollarSign,
  Loader2,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { format } from 'date-fns';
import {
  useSubcontractors,
  useCreateSubcontractor,
  useUpdateSubcontractor,
  useDeleteSubcontractor,
  useSubcontractorAnalytics,
} from '@/lib/api';
import { useUIStore } from '@/store/uiStore';
import { formatCurrency } from '@/lib/estimateCalc';
import type { Subcontractor } from '@openestimate/shared';

// ── Add subcontractor form ─────────────────────────────────────────────────────

const SubSchema = z.object({
  companyName: z.string().min(1, 'Company name required'),
  contactName: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  trade: z.string().optional(),
  notes: z.string().optional(),
  isPreferred: z.boolean().optional(),
});
type SubFormData = z.infer<typeof SubSchema>;

interface AddSubModalProps {
  onClose: () => void;
  onSaved: () => void;
}

function AddSubModal({ onClose, onSaved }: AddSubModalProps) {
  const create = useCreateSubcontractor();
  const { showSuccess, showError } = useUIStore();

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SubFormData>({
    resolver: zodResolver(SubSchema),
    defaultValues: { isPreferred: false },
  });

  const onSubmit = async (data: SubFormData) => {
    try {
      await create.mutateAsync({ ...data, email: data.email || null, isPreferred: data.isPreferred ?? false });
      showSuccess('Subcontractor added');
      onSaved();
      onClose();
    } catch { showError('Failed to add subcontractor'); }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 dark:text-white">Add Subcontractor</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Company Name *</label>
            <input {...register('companyName')} className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500" />
            {errors.companyName && <p className="mt-1 text-xs text-red-500">{errors.companyName.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Contact Name</label>
              <input {...register('contactName')} className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Trade</label>
              <input {...register('trade')} placeholder="e.g. Electrical" className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Email</label>
              <input type="email" {...register('email')} className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500" />
              {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Phone</label>
              <input {...register('phone')} className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Notes</label>
            <textarea {...register('notes')} rows={2} className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" {...register('isPreferred')} className="w-4 h-4 rounded border-gray-300 accent-orange-500" />
            <span className="text-sm text-gray-700 dark:text-gray-300">Mark as preferred subcontractor</span>
          </label>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="flex-1 py-2 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg flex items-center justify-center gap-2 disabled:opacity-60">
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Add Subcontractor
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// ── Subcontractor detail drawer ────────────────────────────────────────────────

interface SubDetailProps {
  sub: Subcontractor;
  onClose: () => void;
  onTogglePreferred: (id: number, isPreferred: boolean) => void;
}

function SubDetail({ sub, onClose, onTogglePreferred }: SubDetailProps) {
  const { data: analytics } = useSubcontractorAnalytics(sub.id);
  const analyticsData = analytics as {
    totalBids: number;
    wonBids: number;
    winRate: number;
    avgBidAmount: number;
    bidsOverTime: Array<{ month: string; count: number; amount: number }>;
  } | undefined;

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="fixed right-0 top-0 bottom-0 w-96 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-2xl z-40 flex flex-col"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-gray-900 dark:text-white">{sub.companyName}</h2>
            <button
              onClick={() => onTogglePreferred(sub.id, !sub.isPreferred)}
              className={`${sub.isPreferred ? 'text-amber-400' : 'text-gray-300 dark:text-gray-600'} hover:text-amber-400 transition-colors`}
            >
              <Star className={`w-4 h-4 ${sub.isPreferred ? 'fill-current' : ''}`} />
            </button>
          </div>
          {sub.trade && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{sub.trade}</p>}
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Contact info */}
        <div className="space-y-2">
          {sub.contactName && (
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="text-gray-700 dark:text-gray-300">{sub.contactName}</span>
            </div>
          )}
          {sub.email && (
            <div className="flex items-center gap-2 text-sm">
              <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <a href={`mailto:${sub.email}`} className="text-orange-500 hover:underline">{sub.email}</a>
            </div>
          )}
          {sub.phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <a href={`tel:${sub.phone}`} className="text-orange-500 hover:underline">{sub.phone}</a>
            </div>
          )}
          {sub.notes && <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 italic">{sub.notes}</p>}
        </div>

        {/* Analytics KPIs */}
        {analyticsData && (
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Total Bids', value: String(analyticsData.totalBids) },
              { label: 'Won Bids', value: String(analyticsData.wonBids) },
              { label: 'Win Rate', value: `${(analyticsData.winRate * 100).toFixed(0)}%` },
              { label: 'Avg Bid', value: formatCurrency(analyticsData.avgBidAmount) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Bids over time chart */}
        {analyticsData?.bidsOverTime && analyticsData.bidsOverTime.length > 1 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" />
              Bid Activity
            </h3>
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analyticsData.bidsOverTime} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Line type="monotone" dataKey="count" name="Bids" stroke="#f97316" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

const TRADES = ['Electrical', 'Plumbing', 'HVAC', 'Concrete', 'Framing', 'Roofing', 'Painting', 'Landscaping', 'Masonry', 'Drywall'];

export default function SubcontractorDirectory() {
  const [search, setSearch] = useState('');
  const [selectedTrade, setSelectedTrade] = useState('');
  const [preferredOnly, setPreferredOnly] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedSub, setSelectedSub] = useState<Subcontractor | null>(null);

  const { showSuccess, showError } = useUIStore();
  const update = useUpdateSubcontractor();

  const filters: Record<string, unknown> = {};
  if (search) filters.search = search;
  if (selectedTrade) filters.trade = selectedTrade;
  if (preferredOnly) filters.preferredOnly = '1';

  const { data: subs = [], isLoading, refetch } = useSubcontractors(filters);

  const handleTogglePreferred = async (id: number, isPreferred: boolean) => {
    try {
      await update.mutateAsync({ id, isPreferred });
      if (selectedSub?.id === id) setSelectedSub((s) => s ? { ...s, isPreferred } : null);
    } catch { showError('Failed to update'); }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex-shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Subcontractors</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{subs.length} subcontractors</p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Subcontractor
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mt-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search company, contact…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <select
            value={selectedTrade}
            onChange={(e) => setSelectedTrade(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="">All Trades</option>
            {TRADES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={preferredOnly}
              onChange={(e) => setPreferredOnly(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 accent-orange-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-1">
              <Star className="w-3.5 h-3.5 text-amber-400" />
              Preferred only
            </span>
          </label>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-white dark:bg-gray-900">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <tr>
              {['', 'Company', 'Contact', 'Email', 'Phone', 'Trade', 'Preferred', 'Added'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : subs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                  No subcontractors found
                </td>
              </tr>
            ) : (
              subs.map((sub) => (
                <tr
                  key={sub.id}
                  onClick={() => setSelectedSub(sub)}
                  className={`cursor-pointer transition-colors ${
                    selectedSub?.id === sub.id
                      ? 'bg-orange-50 dark:bg-orange-900/20'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  }`}
                >
                  <td className="pl-4 py-3 w-8">
                    <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{sub.companyName}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{sub.contactName ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {sub.email ? (
                      <a href={`mailto:${sub.email}`} className="text-orange-500 hover:underline" onClick={(e) => e.stopPropagation()}>
                        {sub.email}
                      </a>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{sub.phone ?? '—'}</td>
                  <td className="px-4 py-3">
                    {sub.trade ? (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                        {sub.trade}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleTogglePreferred(sub.id, !sub.isPreferred)}
                      className={`${sub.isPreferred ? 'text-amber-400' : 'text-gray-200 dark:text-gray-700'} hover:text-amber-400 transition-colors`}
                    >
                      <Star className={`w-4 h-4 ${sub.isPreferred ? 'fill-current' : ''}`} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {format(new Date(sub.createdAt), 'MMM d, yyyy')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detail drawer */}
      <AnimatePresence>
        {selectedSub && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.3 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-30 bg-black"
              onClick={() => setSelectedSub(null)}
            />
            <SubDetail
              sub={selectedSub}
              onClose={() => setSelectedSub(null)}
              onTogglePreferred={handleTogglePreferred}
            />
          </>
        )}
      </AnimatePresence>

      {/* Add modal */}
      <AnimatePresence>
        {showAdd && (
          <AddSubModal
            onClose={() => setShowAdd(false)}
            onSaved={() => refetch()}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
