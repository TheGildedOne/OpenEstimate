import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import {
  Plus,
  X,
  Loader2,
  Trophy,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Users,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Project, SubBid, SubBidAdjustment, Subcontractor } from '@openestimate/shared';
import { CreateSubBidSchema } from '@openestimate/shared';
import { useUIStore } from '@/store/uiStore';

// ── Types ─────────────────────────────────────────────────────────────────────

type CreateSubBidFormData = z.infer<typeof CreateSubBidSchema>;

interface SubBidWithAdjustments extends SubBid {
  adjustments: SubBidAdjustment[];
  adjustedTotal: number;
}

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchSubBids(projectId: number): Promise<SubBidWithAdjustments[]> {
  const res = await fetch(`/api/projects/${projectId}/sub-bids`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load sub bids');
  const json = await res.json();
  return (json.data ?? []).map((b: SubBid) => ({
    ...b,
    adjustments: b.adjustments ?? [],
    adjustedTotal:
      b.bidAmount + (b.adjustments ?? []).reduce((s: number, a: SubBidAdjustment) => s + a.amount, 0),
  }));
}

async function fetchSubcontractors(): Promise<Subcontractor[]> {
  const res = await fetch('/api/subcontractors?pageSize=200', { credentials: 'include' });
  if (!res.ok) return [];
  const json = await res.json();
  return json.data?.data ?? json.data ?? [];
}

async function createSubBid(data: CreateSubBidFormData): Promise<SubBid> {
  const res = await fetch('/api/sub-bids', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to create sub bid' }));
    throw new Error(err.error);
  }
  const json = await res.json();
  return json.data ?? json;
}

async function updateSubBidStatus(
  id: number,
  status: 'received' | 'awarded' | 'rejected'
): Promise<SubBid> {
  const res = await fetch(`/api/sub-bids/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error('Failed to update sub bid');
  const json = await res.json();
  return json.data ?? json;
}

async function addAdjustment(
  subBidId: number,
  description: string,
  amount: number
): Promise<SubBidAdjustment> {
  const res = await fetch(`/api/sub-bids/${subBidId}/adjustments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ description, amount }),
  });
  if (!res.ok) throw new Error('Failed to add adjustment');
  const json = await res.json();
  return json.data ?? json;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

// ── Add Sub Bid Modal ─────────────────────────────────────────────────────────

interface AddSubBidModalProps {
  projectId: number;
  isOpen: boolean;
  onClose: () => void;
  onCreated: (bid: SubBid) => void;
}

function AddSubBidModal({ projectId, isOpen, onClose, onCreated }: AddSubBidModalProps) {
  const mutation = useMutation({ mutationFn: createSubBid });

  const { data: subcontractors = [] } = useQuery({
    queryKey: ['subcontractors'],
    queryFn: fetchSubcontractors,
    enabled: isOpen,
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CreateSubBidFormData>({
    resolver: zodResolver(CreateSubBidSchema),
    defaultValues: {
      projectId,
      receivedDate: new Date().toISOString(),
    },
  });

  const handleClose = () => {
    reset();
    mutation.reset();
    onClose();
  };

  const onSubmit = async (data: CreateSubBidFormData) => {
    try {
      const bid = await mutation.mutateAsync({
        ...data,
        receivedDate: new Date(data.receivedDate).toISOString(),
        validUntil: data.validUntil ? new Date(data.validUntil).toISOString() : null,
      });
      reset();
      onCreated(bid);
    } catch {
      // error shown via mutation state
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
          <motion.div
            className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8"
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <button onClick={handleClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Add Sub Bid</h2>

            {mutation.error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
                {(mutation.error as Error).message}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Subcontractor *
                </label>
                <select
                  {...register('subcontractorId', { valueAsNumber: true })}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="">Select subcontractor…</option>
                  {subcontractors.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.companyName} {s.trade ? `(${s.trade})` : ''}
                    </option>
                  ))}
                </select>
                {errors.subcontractorId && (
                  <p className="mt-1 text-xs text-red-500">{errors.subcontractorId.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Trade / Scope Description *
                </label>
                <input
                  {...register('tradeDescription')}
                  placeholder="e.g. Electrical rough-in and finish"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                {errors.tradeDescription && (
                  <p className="mt-1 text-xs text-red-500">{errors.tradeDescription.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Bid Amount *
                  </label>
                  <input
                    {...register('bidAmount', { valueAsNumber: true })}
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  {errors.bidAmount && (
                    <p className="mt-1 text-xs text-red-500">{errors.bidAmount.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Received Date *
                  </label>
                  <input
                    {...register('receivedDate')}
                    type="date"
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Valid Until
                  </label>
                  <input
                    {...register('validUntil')}
                    type="date"
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                <textarea
                  {...register('notes')}
                  rows={2}
                  placeholder="Any notes or conditions…"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 py-2.5 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={mutation.isPending}
                  className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Add Sub Bid
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Adjustment Row ────────────────────────────────────────────────────────────

interface AddAdjustmentRowProps {
  subBidId: number;
  onAdded: (adj: SubBidAdjustment) => void;
}

function AddAdjustmentRow({ subBidId, onAdded }: AddAdjustmentRowProps) {
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!desc.trim() || !amount) return;
    setSaving(true);
    try {
      const adj = await addAdjustment(subBidId, desc.trim(), parseFloat(amount));
      onAdded(adj);
      setDesc('');
      setAmount('');
      setOpen(false);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-orange-500 hover:text-orange-600 font-medium flex items-center gap-1"
      >
        <Plus className="w-3 h-3" /> Add Adjustment
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 mt-2">
      <input
        autoFocus
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="Description"
        className="flex-1 px-2 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
      />
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        type="number"
        step="0.01"
        placeholder="Amount (neg = deduct)"
        className="w-36 px-2 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
      />
      <button
        onClick={save}
        disabled={saving}
        className="px-2 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded text-xs font-medium transition-colors"
      >
        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Add'}
      </button>
      <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── SubBidsTab ────────────────────────────────────────────────────────────────

interface SubBidsTabProps {
  project: Project;
}

export default function SubBidsTab({ project }: SubBidsTabProps) {
  const qc = useQueryClient();
  const { showSuccess, showError } = useUIStore();
  const [addOpen, setAddOpen] = useState(false);
  const [expandedTrades, setExpandedTrades] = useState<Set<string>>(new Set());

  const { data: subBids = [], isLoading } = useQuery({
    queryKey: ['sub-bids', project.id],
    queryFn: () => fetchSubBids(project.id),
  });

  const awardMutation = useMutation({
    mutationFn: (id: number) => updateSubBidStatus(id, 'awarded'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sub-bids', project.id] });
      showSuccess('Sub bid awarded');
    },
    onError: (err) => showError((err as Error).message),
  });

  const handleCreated = (bid: SubBid) => {
    qc.setQueryData<SubBidWithAdjustments[]>(['sub-bids', project.id], (old = []) => [
      ...old,
      { ...bid, adjustments: [], adjustedTotal: bid.bidAmount },
    ]);
    setAddOpen(false);
    showSuccess('Sub bid added');
  };

  const handleAdjustmentAdded = (subBidId: number, adj: SubBidAdjustment) => {
    qc.setQueryData<SubBidWithAdjustments[]>(['sub-bids', project.id], (old = []) =>
      old.map((b) => {
        if (b.id !== subBidId) return b;
        const adjustments = [...b.adjustments, adj];
        const adjustedTotal =
          b.bidAmount + adjustments.reduce((s, a) => s + a.amount, 0);
        return { ...b, adjustments, adjustedTotal };
      })
    );
  };

  // Group by trade
  const byTrade = React.useMemo(() => {
    const map = new Map<string, SubBidWithAdjustments[]>();
    for (const b of subBids) {
      const t = b.tradeDescription;
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(b);
    }
    return map;
  }, [subBids]);

  const toggleTrade = (trade: string) => {
    setExpandedTrades((prev) => {
      const next = new Set(prev);
      if (next.has(trade)) next.delete(trade);
      else next.add(trade);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <div key={i} className="h-32 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          Sub Bids ({subBids.length})
        </h2>
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-2 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Sub Bid
        </button>
      </div>

      {subBids.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-600">
          <Users className="w-12 h-12 mb-3" />
          <p className="text-base font-medium text-gray-600 dark:text-gray-400">No sub bids yet</p>
          <p className="text-sm mt-1">Add bids from subcontractors to start leveling</p>
          <button
            onClick={() => setAddOpen(true)}
            className="mt-4 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Add Sub Bid
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from(byTrade.entries()).map(([trade, bids]) => {
            const expanded = expandedTrades.has(trade);
            const sorted = [...bids].sort((a, b) => a.adjustedTotal - b.adjustedTotal);
            const minTotal = sorted[0]?.adjustedTotal;
            const maxTotal = sorted[sorted.length - 1]?.adjustedTotal;

            return (
              <div
                key={trade}
                className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden"
              >
                {/* Trade header */}
                <button
                  onClick={() => toggleTrade(trade)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {trade}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {bids.length} bid{bids.length !== 1 ? 's' : ''}
                    </span>
                    <span className="text-xs font-medium text-green-600 dark:text-green-400">
                      Low: {formatCurrency(minTotal)}
                    </span>
                  </div>
                  {expanded ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </button>

                {/* Leveling table */}
                <AnimatePresence>
                  {expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="overflow-x-auto border-t border-gray-100 dark:border-gray-800">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50 dark:bg-gray-800/50">
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                                Subcontractor
                              </th>
                              <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                                Bid Amount
                              </th>
                              <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                                Adjustments
                              </th>
                              <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                                Adjusted Total
                              </th>
                              <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                                Status
                              </th>
                              <th className="px-4 py-2.5" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                            {sorted.map((bid) => {
                              const isLow = bid.adjustedTotal === minTotal && bids.length > 1;
                              const isHigh = bid.adjustedTotal === maxTotal && bids.length > 1;
                              const adjSum = bid.adjustments.reduce((s, a) => s + a.amount, 0);

                              return (
                                <tr
                                  key={bid.id}
                                  className={`${
                                    isLow
                                      ? 'bg-green-50/60 dark:bg-green-950/20'
                                      : isHigh
                                        ? 'bg-red-50/60 dark:bg-red-950/20'
                                        : ''
                                  }`}
                                >
                                  <td className="px-4 py-3">
                                    <div>
                                      <p className="font-medium text-gray-900 dark:text-white flex items-center gap-1.5">
                                        {bid.subcontractorName ?? `Sub #${bid.subcontractorId}`}
                                        {isLow && (
                                          <span className="text-[10px] font-bold px-1.5 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 rounded-full">
                                            LOWEST
                                          </span>
                                        )}
                                        {isHigh && bids.length > 2 && (
                                          <span className="text-[10px] font-bold px-1.5 py-0.5 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 rounded-full">
                                            HIGHEST
                                          </span>
                                        )}
                                      </p>
                                      {bid.receivedDate && (
                                        <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">
                                          Received {format(new Date(bid.receivedDate), 'MMM d')}
                                          {bid.validUntil &&
                                            ` · Valid until ${format(new Date(bid.validUntil), 'MMM d')}`}
                                        </p>
                                      )}
                                      {/* Adjustments list */}
                                      {bid.adjustments.length > 0 && (
                                        <div className="mt-1.5 space-y-0.5">
                                          {bid.adjustments.map((adj) => (
                                            <p
                                              key={adj.id}
                                              className="text-xs text-gray-500 dark:text-gray-400"
                                            >
                                              {adj.description}:{' '}
                                              <span
                                                className={adj.amount < 0 ? 'text-red-500' : 'text-green-500'}
                                              >
                                                {adj.amount >= 0 ? '+' : ''}
                                                {formatCurrency(adj.amount)}
                                              </span>
                                            </p>
                                          ))}
                                        </div>
                                      )}
                                      <AddAdjustmentRow
                                        subBidId={bid.id}
                                        onAdded={(adj) => handleAdjustmentAdded(bid.id, adj)}
                                      />
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                                    {formatCurrency(bid.bidAmount)}
                                  </td>
                                  <td
                                    className={`px-4 py-3 text-right text-sm font-medium ${
                                      adjSum < 0
                                        ? 'text-red-600 dark:text-red-400'
                                        : adjSum > 0
                                          ? 'text-green-600 dark:text-green-400'
                                          : 'text-gray-400 dark:text-gray-600'
                                    }`}
                                  >
                                    {adjSum !== 0
                                      ? `${adjSum >= 0 ? '+' : ''}${formatCurrency(adjSum)}`
                                      : '—'}
                                  </td>
                                  <td
                                    className={`px-4 py-3 text-right font-bold text-base ${
                                      isLow
                                        ? 'text-green-700 dark:text-green-400'
                                        : isHigh && bids.length > 2
                                          ? 'text-red-600 dark:text-red-400'
                                          : 'text-gray-900 dark:text-white'
                                    }`}
                                  >
                                    {formatCurrency(bid.adjustedTotal)}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${
                                        bid.status === 'awarded'
                                          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                                          : bid.status === 'rejected'
                                            ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                                      }`}
                                    >
                                      {bid.status}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    {bid.status !== 'awarded' && (
                                      <button
                                        onClick={() => awardMutation.mutate(bid.id)}
                                        disabled={awardMutation.isPending}
                                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg transition-colors"
                                      >
                                        <Trophy className="w-3 h-3" />
                                        Award
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      <AddSubBidModal
        projectId={project.id}
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
