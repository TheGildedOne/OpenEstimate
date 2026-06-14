import React, { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import {
  Plus,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
  GitBranch,
  Check,
  XCircle,
  Send,
  Trash2,
  Download,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Project, ChangeOrder, ChangeOrderLineItem, Estimate } from '@openestimate/shared';
import { CreateChangeOrderSchema } from '@openestimate/shared';
import { useUIStore } from '@/store/uiStore';

// ── Types ─────────────────────────────────────────────────────────────────────

type CreateCOFormData = z.infer<typeof CreateChangeOrderSchema>;

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
};

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchChangeOrders(projectId: number): Promise<ChangeOrder[]> {
  const res = await fetch(`/api/projects/${projectId}/change-orders`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load change orders');
  const json = await res.json();
  return json.data ?? [];
}

async function fetchEstimates(projectId: number): Promise<Estimate[]> {
  const res = await fetch(`/api/projects/${projectId}/estimates`, { credentials: 'include' });
  if (!res.ok) return [];
  const json = await res.json();
  return json.data ?? [];
}

async function createChangeOrder(data: CreateCOFormData): Promise<ChangeOrder> {
  const res = await fetch('/api/change-orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to create change order' }));
    throw new Error(err.error);
  }
  const json = await res.json();
  return json.data ?? json;
}

async function updateCOStatus(
  id: number,
  status: string,
  approvedByName?: string
): Promise<ChangeOrder> {
  const res = await fetch(`/api/change-orders/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ status, approvedByName }),
  });
  if (!res.ok) throw new Error('Failed to update change order');
  const json = await res.json();
  return json.data ?? json;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(n: number | null | undefined) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

function computeCOTotal(lineItems: ChangeOrderLineItem[] = []) {
  return lineItems.reduce((s, li) => s + (li.totalCost ?? li.quantity * li.unitCost), 0);
}

// ── New CO Modal ──────────────────────────────────────────────────────────────

interface NewCOModalProps {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
  onCreated: (co: ChangeOrder) => void;
}

function NewCOModal({ project, isOpen, onClose, onCreated }: NewCOModalProps) {
  const mutation = useMutation({ mutationFn: createChangeOrder });

  const { data: estimates = [] } = useQuery({
    queryKey: ['estimates', project.id],
    queryFn: () => fetchEstimates(project.id),
    enabled: isOpen,
  });

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
    reset,
  } = useForm<CreateCOFormData>({
    resolver: zodResolver(CreateChangeOrderSchema),
    defaultValues: {
      projectId: project.id,
      estimateId: project.activeEstimateId ?? 0,
      lineItems: [{ description: '', quantity: 1, unit: 'LS', unitCost: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'lineItems' });

  const lineItems = watch('lineItems');
  const total = lineItems?.reduce(
    (s, li) => s + (Number(li.quantity) || 0) * (Number(li.unitCost) || 0),
    0
  ) ?? 0;

  const handleClose = () => {
    reset();
    mutation.reset();
    onClose();
  };

  const onSubmit = async (data: CreateCOFormData) => {
    try {
      const co = await mutation.mutateAsync({
        ...data,
        lineItems: data.lineItems.map((li) => ({
          ...li,
          quantity: Number(li.quantity),
          unitCost: Number(li.unitCost),
        })),
      });
      reset();
      onCreated(co);
    } catch {
      // shown via mutation.error
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
            className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 max-h-[90vh] overflow-y-auto"
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <button onClick={handleClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
              New Change Order
            </h2>

            {mutation.error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
                {(mutation.error as Error).message}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title *</label>
                  <input
                    {...register('title')}
                    placeholder="e.g. Additional electrical work – floor 3"
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  {errors.title && <p className="mt-1 text-xs text-red-500">{errors.title.message}</p>}
                </div>

                {estimates.length > 1 && (
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Linked Estimate</label>
                    <select
                      {...register('estimateId', { valueAsNumber: true })}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      {estimates.map((e) => (
                        <option key={e.id} value={e.id}>{e.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                  <textarea
                    {...register('description')}
                    rows={2}
                    placeholder="Describe the scope of work for this change order…"
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                  />
                </div>
              </div>

              {/* Line items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Line Items
                  </label>
                  <button
                    type="button"
                    onClick={() => append({ description: '', quantity: 1, unit: 'LS', unitCost: 0 })}
                    className="text-xs text-orange-500 hover:text-orange-600 font-medium flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add Row
                  </button>
                </div>

                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800">
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400">Description</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400 w-16">Qty</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400 w-16">Unit</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400 w-24">Unit Cost</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400 w-24">Total</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {fields.map((field, idx) => {
                        const qty = Number(watch(`lineItems.${idx}.quantity`)) || 0;
                        const cost = Number(watch(`lineItems.${idx}.unitCost`)) || 0;
                        return (
                          <tr key={field.id}>
                            <td className="px-3 py-2">
                              <input
                                {...register(`lineItems.${idx}.description`)}
                                placeholder="Description"
                                className="w-full px-2 py-1.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                {...register(`lineItems.${idx}.quantity`, { valueAsNumber: true })}
                                type="number"
                                step="0.01"
                                className="w-full px-2 py-1.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs text-right focus:outline-none focus:ring-2 focus:ring-orange-500"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                {...register(`lineItems.${idx}.unit`)}
                                className="w-full px-2 py-1.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                {...register(`lineItems.${idx}.unitCost`, { valueAsNumber: true })}
                                type="number"
                                step="0.01"
                                className="w-full px-2 py-1.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs text-right focus:outline-none focus:ring-2 focus:ring-orange-500"
                              />
                            </td>
                            <td className="px-3 py-2 text-right text-xs font-medium text-gray-900 dark:text-white">
                              {formatCurrency(qty * cost)}
                            </td>
                            <td className="px-3 py-2">
                              {fields.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => remove(idx)}
                                  className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                        <td colSpan={4} className="px-3 py-2 text-right text-xs font-semibold text-gray-700 dark:text-gray-300">
                          Total
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-bold text-gray-900 dark:text-white">
                          {formatCurrency(total)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
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
                  Create Change Order
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Approve Modal ─────────────────────────────────────────────────────────────

interface ApproveModalProps {
  co: ChangeOrder | null;
  onClose: () => void;
  onApprove: (co: ChangeOrder, approvedBy: string) => void;
}

function ApproveModal({ co, onClose, onApprove }: ApproveModalProps) {
  const [name, setName] = useState('');

  return (
    <AnimatePresence>
      {co && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            className="relative w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6"
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
              Approve Change Order
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Enter the name of the person approving this change order.
            </p>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Approved by (name)"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => name.trim() && onApprove(co, name.trim())}
                disabled={!name.trim()}
                className="flex-1 py-2 bg-green-500 hover:bg-green-600 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Approve
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── CO Card ───────────────────────────────────────────────────────────────────

interface COCardProps {
  co: ChangeOrder;
  onSubmit: (co: ChangeOrder) => void;
  onApprove: (co: ChangeOrder) => void;
  onReject: (co: ChangeOrder) => void;
}

function COCard({ co, onSubmit, onApprove, onReject }: COCardProps) {
  const [expanded, setExpanded] = useState(false);
  const total = co.totalCost ?? computeCOTotal(co.lineItems);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div
        className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs font-bold text-gray-400 dark:text-gray-600 font-mono">
              {co.number}
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${STATUS_COLORS[co.status]}`}
            >
              {co.status}
            </span>
          </div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{co.title}</p>
          {co.submittedAt && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Submitted {format(new Date(co.submittedAt), 'MMM d, yyyy')}
              {co.approvedAt && ` · Approved ${format(new Date(co.approvedAt), 'MMM d, yyyy')}`}
              {co.approvedByName && ` by ${co.approvedByName}`}
            </p>
          )}
        </div>

        <div className="text-right shrink-0">
          <p
            className={`text-base font-bold ${total >= 0 ? 'text-gray-900 dark:text-white' : 'text-red-600 dark:text-red-400'}`}
          >
            {total >= 0 ? '+' : ''}
            {formatCurrency(total)}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {co.status === 'draft' && (
            <button
              onClick={() => onSubmit(co)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
            >
              <Send className="w-3 h-3" /> Submit
            </button>
          )}
          {co.status === 'submitted' && (
            <>
              <button
                onClick={() => onApprove(co)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg transition-colors"
              >
                <Check className="w-3 h-3" /> Approve
              </button>
              <button
                onClick={() => onReject(co)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
              >
                <XCircle className="w-3 h-3" /> Reject
              </button>
            </>
          )}
          <button
            onClick={() => window.open(`/api/change-orders/${co.id}/pdf`, '_blank')}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Export PDF"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>

        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        )}
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-gray-100 dark:border-gray-800"
          >
            <div className="px-5 py-4 space-y-4">
              {co.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400">{co.description}</p>
              )}

              {co.lineItems && co.lineItems.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800">
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400">Description</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400">Qty</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400">Unit</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400">Unit Cost</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                      {co.lineItems.map((li) => (
                        <tr key={li.id}>
                          <td className="px-3 py-2 text-gray-900 dark:text-white">{li.description}</td>
                          <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">{li.quantity}</td>
                          <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{li.unit}</td>
                          <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">{formatCurrency(li.unitCost)}</td>
                          <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-white">{formatCurrency(li.totalCost ?? li.quantity * li.unitCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                        <td colSpan={4} className="px-3 py-2 text-right text-xs font-semibold text-gray-700 dark:text-gray-300">Total</td>
                        <td className="px-3 py-2 text-right text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── ChangeOrdersTab ───────────────────────────────────────────────────────────

interface ChangeOrdersTabProps {
  project: Project;
}

export default function ChangeOrdersTab({ project }: ChangeOrdersTabProps) {
  const qc = useQueryClient();
  const { showSuccess, showError } = useUIStore();
  const [newOpen, setNewOpen] = useState(false);
  const [approvingCO, setApprovingCO] = useState<ChangeOrder | null>(null);

  const { data: changeOrders = [], isLoading } = useQuery({
    queryKey: ['change-orders', project.id],
    queryFn: () => fetchChangeOrders(project.id),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status, approvedByName }: { id: number; status: string; approvedByName?: string }) =>
      updateCOStatus(id, status, approvedByName),
    onSuccess: (updated) => {
      qc.setQueryData<ChangeOrder[]>(['change-orders', project.id], (old = []) =>
        old.map((co) => (co.id === updated.id ? updated : co))
      );
      showSuccess(`Change order ${updated.status}`);
    },
    onError: (err) => showError((err as Error).message),
  });

  const handleCreated = (co: ChangeOrder) => {
    qc.setQueryData<ChangeOrder[]>(['change-orders', project.id], (old = []) => [co, ...old]);
    setNewOpen(false);
    showSuccess('Change order created');
  };

  const handleApprove = (co: ChangeOrder, approvedByName: string) => {
    statusMutation.mutate({ id: co.id, status: 'approved', approvedByName });
    setApprovingCO(null);
  };

  // Contract summary
  const originalContract = project.activeEstimateTotal ?? 0;
  const approvedCOs = changeOrders
    .filter((co) => co.status === 'approved')
    .reduce((s, co) => s + (co.totalCost ?? computeCOTotal(co.lineItems)), 0);
  const currentContract = originalContract + approvedCOs;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Contract Summary Bar */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
          Contract Summary
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Original Contract</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {formatCurrency(originalContract)}
            </p>
          </div>
          <div className="text-center p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Approved Change Orders</p>
            <p className={`text-lg font-bold ${approvedCOs >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {approvedCOs >= 0 ? '+' : ''}{formatCurrency(approvedCOs)}
            </p>
          </div>
          <div className="text-center p-4 bg-orange-50 dark:bg-orange-950/30 rounded-lg border border-orange-200 dark:border-orange-900">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Current Contract Value</p>
            <p className="text-lg font-bold text-orange-700 dark:text-orange-400">
              {formatCurrency(currentContract)}
            </p>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          Change Orders ({changeOrders.length})
        </h2>
        <button
          onClick={() => setNewOpen(true)}
          className="flex items-center gap-2 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Change Order
        </button>
      </div>

      {/* CO List */}
      {changeOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-600">
          <GitBranch className="w-12 h-12 mb-3" />
          <p className="text-base font-medium text-gray-600 dark:text-gray-400">No change orders yet</p>
          <p className="text-sm mt-1">Create a change order when project scope changes</p>
          <button
            onClick={() => setNewOpen(true)}
            className="mt-4 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            New Change Order
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {changeOrders.map((co) => (
            <motion.div
              key={co.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <COCard
                co={co}
                onSubmit={(c) => statusMutation.mutate({ id: c.id, status: 'submitted' })}
                onApprove={(c) => setApprovingCO(c)}
                onReject={(c) => statusMutation.mutate({ id: c.id, status: 'rejected' })}
              />
            </motion.div>
          ))}
        </div>
      )}

      <NewCOModal
        project={project}
        isOpen={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={handleCreated}
      />

      <ApproveModal
        co={approvingCO}
        onClose={() => setApprovingCO(null)}
        onApprove={handleApprove}
      />
    </div>
  );
}
