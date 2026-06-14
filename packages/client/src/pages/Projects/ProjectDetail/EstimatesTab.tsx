import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import {
  Plus,
  Copy,
  Star,
  ChevronRight,
  Loader2,
  X,
  FileText,
  CheckCircle,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Project, Estimate, Template } from '@openestimate/shared';
import { CreateEstimateSchema } from '@openestimate/shared';
import { useUIStore } from '@/store/uiStore';

// ── Types ─────────────────────────────────────────────────────────────────────

type CreateEstimateFormData = z.infer<typeof CreateEstimateSchema>;

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchEstimates(projectId: number): Promise<Estimate[]> {
  const res = await fetch(`/api/projects/${projectId}/estimates`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load estimates');
  const json = await res.json();
  return json.data ?? [];
}

async function fetchTemplates(): Promise<Template[]> {
  const res = await fetch('/api/templates', { credentials: 'include' });
  if (!res.ok) return [];
  const json = await res.json();
  return json.data ?? [];
}

async function createEstimate(data: CreateEstimateFormData): Promise<Estimate> {
  const res = await fetch('/api/estimates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to create estimate' }));
    throw new Error(err.error);
  }
  const json = await res.json();
  return json.data ?? json;
}

async function cloneEstimate(id: number): Promise<Estimate> {
  const res = await fetch(`/api/estimates/${id}/clone`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to clone estimate');
  const json = await res.json();
  return json.data ?? json;
}

async function setActiveEstimate(id: number): Promise<Estimate> {
  const res = await fetch(`/api/estimates/${id}/set-active`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to set active estimate');
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

// Compute grand total from sections/lineItems if available
function getEstimateTotal(estimate: Estimate): number | null {
  // Server should provide a computed total but if not, fall back to null
  const sections = estimate.sections ?? [];
  if (sections.length === 0) return null;
  let subtotal = 0;
  for (const s of sections) {
    for (const li of s.lineItems ?? []) {
      subtotal += (li.totalCost ?? 0);
    }
  }
  const oh = subtotal * (estimate.overheadPct / 100);
  const profit = (subtotal + oh) * (estimate.profitPct / 100);
  const tax = (subtotal + oh + profit) * (estimate.taxPct / 100);
  const bond = (subtotal + oh + profit + tax) * (estimate.bondPct / 100);
  return subtotal + oh + profit + tax + bond;
}

// ── New Estimate Modal ────────────────────────────────────────────────────────

interface NewEstimateModalProps {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
  onCreated: (estimate: Estimate) => void;
}

function NewEstimateModal({ project, isOpen, onClose, onCreated }: NewEstimateModalProps) {
  const [templateId, setTemplateId] = useState<number | null>(null);

  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: fetchTemplates,
    enabled: isOpen,
  });

  const mutation = useMutation({
    mutationFn: (data: CreateEstimateFormData) => createEstimate(data),
    onSuccess: (est) => {
      onCreated(est);
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CreateEstimateFormData>({
    resolver: zodResolver(CreateEstimateSchema),
    defaultValues: {
      projectId: project.id,
      overheadPct: 15,
      profitPct: 10,
      taxPct: 0,
      bondPct: 0,
    },
  });

  const handleClose = () => {
    reset();
    mutation.reset();
    setTemplateId(null);
    onClose();
  };

  const onSubmit = async (data: CreateEstimateFormData) => {
    try {
      const payload = templateId ? { ...data, templateId } : data;
      const est = await mutation.mutateAsync(payload as CreateEstimateFormData);
      onCreated(est);
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

            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">New Estimate</h2>

            {mutation.error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
                {(mutation.error as Error).message}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Estimate Name *
                </label>
                <input
                  {...register('name')}
                  placeholder="e.g. Base Estimate v1"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
              </div>

              {templates.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Start from Template (optional)
                  </label>
                  <select
                    value={templateId ?? ''}
                    onChange={(e) => setTemplateId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">Blank estimate</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Overhead %</label>
                  <input
                    {...register('overheadPct', { valueAsNumber: true })}
                    type="number"
                    step="0.1"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Profit %</label>
                  <input
                    {...register('profitPct', { valueAsNumber: true })}
                    type="number"
                    step="0.1"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Tax %</label>
                  <input
                    {...register('taxPct', { valueAsNumber: true })}
                    type="number"
                    step="0.1"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Bond %</label>
                  <input
                    {...register('bondPct', { valueAsNumber: true })}
                    type="number"
                    step="0.1"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
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
                  Create Estimate
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── EstimatesTab ──────────────────────────────────────────────────────────────

interface EstimatesTabProps {
  project: Project;
}

export default function EstimatesTab({ project }: EstimatesTabProps) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showSuccess, showError } = useUIStore();
  const [newOpen, setNewOpen] = useState(false);

  const { data: estimates = [], isLoading } = useQuery({
    queryKey: ['estimates', project.id],
    queryFn: () => fetchEstimates(project.id),
  });

  const cloneMutation = useMutation({
    mutationFn: cloneEstimate,
    onSuccess: (est) => {
      qc.setQueryData(['estimates', project.id], (prev: Estimate[] = []) => [...prev, est]);
      showSuccess('Estimate cloned');
    },
    onError: (err) => showError((err as Error).message),
  });

  const activeMutation = useMutation({
    mutationFn: setActiveEstimate,
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['estimates', project.id] });
      const prev = qc.getQueryData<Estimate[]>(['estimates', project.id]);
      qc.setQueryData(['estimates', project.id], (old: Estimate[] = []) =>
        old.map((e) => ({ ...e, isActive: e.id === id }))
      );
      return { prev };
    },
    onSuccess: () => {
      showSuccess('Active estimate updated');
      qc.invalidateQueries({ queryKey: ['project', String(project.id)] });
    },
    onError: (err, _vars, ctx) => {
      showError((err as Error).message);
      if (ctx?.prev) qc.setQueryData(['estimates', project.id], ctx.prev);
    },
  });

  const handleCreated = (est: Estimate) => {
    qc.setQueryData(['estimates', project.id], (prev: Estimate[] = []) => [...prev, est]);
    setNewOpen(false);
    navigate(`/projects/${project.id}/estimates/${est.id}`);
  };

  const activeEst = estimates.find((e) => e.isActive);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          Estimates ({estimates.length})
        </h2>
        <button
          onClick={() => setNewOpen(true)}
          className="flex items-center gap-2 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Estimate
        </button>
      </div>

      {/* Active estimate banner */}
      {activeEst && (
        <motion.div
          className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900 rounded-xl p-4 flex items-center gap-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <CheckCircle className="w-6 h-6 text-orange-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-orange-800 dark:text-orange-300">
              Active Estimate: {activeEst.name}
            </p>
            <p className="text-xs text-orange-600 dark:text-orange-400">
              This estimate is used for bid totals and reporting
            </p>
          </div>
          <button
            onClick={() => navigate(`/projects/${project.id}/estimates/${activeEst.id}`)}
            className="flex items-center gap-1 text-sm font-medium text-orange-600 dark:text-orange-400 hover:text-orange-700 shrink-0"
          >
            Open <ChevronRight className="w-4 h-4" />
          </button>
        </motion.div>
      )}

      {/* Estimates list */}
      {estimates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-600">
          <FileText className="w-12 h-12 mb-3" />
          <p className="text-base font-medium text-gray-600 dark:text-gray-400">No estimates yet</p>
          <p className="text-sm mt-1">Create your first estimate to start building your bid</p>
          <button
            onClick={() => setNewOpen(true)}
            className="mt-4 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            New Estimate
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {estimates.map((est) => {
            const total = getEstimateTotal(est);
            return (
              <motion.div
                key={est.id}
                className={`bg-white dark:bg-gray-900 rounded-xl border transition-all hover:shadow-md cursor-pointer ${
                  est.isActive
                    ? 'border-orange-300 dark:border-orange-700 shadow-sm'
                    : 'border-gray-200 dark:border-gray-800'
                }`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => navigate(`/projects/${project.id}/estimates/${est.id}`)}
              >
                <div className="p-5 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${est.isActive ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-gray-100 dark:bg-gray-800'}`}>
                    <FileText className={`w-5 h-5 ${est.isActive ? 'text-orange-500' : 'text-gray-400'}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {est.name}
                      </p>
                      {est.isActive && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400 shrink-0">
                          ACTIVE
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 shrink-0">
                        v{est.version}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Created {format(new Date(est.createdAt), 'MMM d, yyyy')} ·{' '}
                      OH {est.overheadPct}% · Profit {est.profitPct}%
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    {total != null && (
                      <p className="text-base font-bold text-gray-900 dark:text-white">
                        {formatCurrency(total)}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 dark:text-gray-600">grand total</p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
                    {!est.isActive && (
                      <button
                        onClick={() => activeMutation.mutate(est.id)}
                        disabled={activeMutation.isPending}
                        title="Set as Active"
                        className="p-2 rounded-lg text-gray-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
                      >
                        <Star className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => cloneMutation.mutate(est.id)}
                      disabled={cloneMutation.isPending}
                      title="Clone"
                      className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-700" />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <NewEstimateModal
        project={project}
        isOpen={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
