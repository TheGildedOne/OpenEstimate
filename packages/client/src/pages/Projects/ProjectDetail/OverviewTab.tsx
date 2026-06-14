import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import {
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  FileText,
  ClipboardList,
  MessageSquare,
  GitBranch,
  Loader2,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Project, BidOutcome } from '@openestimate/shared';
import { CreateBidOutcomeSchema } from '@openestimate/shared';
import { useUIStore } from '@/store/uiStore';

// ── Types ─────────────────────────────────────────────────────────────────────

type BidOutcomeFormData = z.infer<typeof CreateBidOutcomeSchema>;

const STATUS_STEPS = ['draft', 'bidding', 'submitted', 'won'] as const;

interface ProjectStats {
  estimateCount: number;
  documentCount: number;
  noteCount: number;
  changeOrderCount: number;
}

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchProjectStats(projectId: number): Promise<ProjectStats> {
  const res = await fetch(`/api/projects/${projectId}/stats`, { credentials: 'include' });
  if (!res.ok) return { estimateCount: 0, documentCount: 0, noteCount: 0, changeOrderCount: 0 };
  const json = await res.json();
  return json.data ?? json;
}

async function fetchBidOutcome(projectId: number): Promise<BidOutcome | null> {
  const res = await fetch(`/api/projects/${projectId}/bid-outcome`, { credentials: 'include' });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? null;
}

async function createBidOutcome(data: BidOutcomeFormData): Promise<BidOutcome> {
  const res = await fetch('/api/projects/bid-outcomes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to record outcome' }));
    throw new Error(err.error);
  }
  const json = await res.json();
  return json.data ?? json;
}

// ── Status Timeline ───────────────────────────────────────────────────────────

function StatusTimeline({ status }: { status: string }) {
  const isLost = status === 'lost';
  const currentIdx = STATUS_STEPS.indexOf(status as (typeof STATUS_STEPS)[number]);

  return (
    <div className="flex items-center gap-0 mt-2">
      {STATUS_STEPS.map((step, idx) => {
        const isDone = isLost ? idx < 3 : idx <= currentIdx;
        const isCurrent = !isLost && idx === currentIdx;
        const isLostStep = isLost && idx === 3;

        return (
          <React.Fragment key={step}>
            <div className="flex flex-col items-center">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                  isLostStep
                    ? 'border-red-400 bg-red-100 text-red-600 dark:bg-red-900/30 dark:border-red-600 dark:text-red-400'
                    : isDone
                      ? isCurrent
                        ? 'border-orange-500 bg-orange-500 text-white shadow-md shadow-orange-500/30'
                        : 'border-green-500 bg-green-500 text-white'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-400 dark:text-gray-600'
                }`}
              >
                {isLostStep ? '✗' : isDone ? '✓' : idx + 1}
              </div>
              <span
                className={`text-[10px] mt-1 font-medium capitalize ${
                  isLostStep
                    ? 'text-red-500 dark:text-red-400'
                    : isCurrent
                      ? 'text-orange-600 dark:text-orange-400'
                      : isDone
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-gray-400 dark:text-gray-600'
                }`}
              >
                {isLostStep ? 'Lost' : step}
              </span>
            </div>
            {idx < STATUS_STEPS.length - 1 && (
              <div
                className={`flex-1 h-0.5 mb-5 mx-1 transition-all ${
                  idx < (isLost ? 2 : currentIdx)
                    ? 'bg-green-400'
                    : 'bg-gray-200 dark:bg-gray-700'
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

interface OverviewTabProps {
  project: Project;
}

export default function OverviewTab({ project }: OverviewTabProps) {
  const qc = useQueryClient();
  const { showSuccess, showError } = useUIStore();
  const [showOutcomeForm, setShowOutcomeForm] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ['project-stats', project.id],
    queryFn: () => fetchProjectStats(project.id),
  });

  const { data: bidOutcome, isLoading: outcomeLoading } = useQuery({
    queryKey: ['bid-outcome', project.id],
    queryFn: () => fetchBidOutcome(project.id),
    enabled: project.status === 'submitted' || project.status === 'won' || project.status === 'lost',
  });

  const outcomeMutation = useMutation({
    mutationFn: createBidOutcome,
    onSuccess: (outcome) => {
      qc.setQueryData(['bid-outcome', project.id], outcome);
      qc.invalidateQueries({ queryKey: ['project', String(project.id)] });
      showSuccess('Bid outcome recorded');
      setShowOutcomeForm(false);
    },
    onError: (err) => showError((err as Error).message),
  });

  const { register, handleSubmit, watch, formState: { errors } } = useForm<BidOutcomeFormData>({
    resolver: zodResolver(CreateBidOutcomeSchema),
    defaultValues: {
      projectId: project.id,
      estimateId: project.activeEstimateId ?? 0,
      won: false,
      submittedAmount: project.activeEstimateTotal ?? 0,
    },
  });

  const won = watch('won');

  const formatCurrency = (n: number | null | undefined) => {
    if (n == null) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  };

  // OSM iframe URL
  const mapUrl = project.siteAddress
    ? `https://www.openstreetmap.org/export/embed.html?bbox=-0.5,51.4,0.5,51.6&layer=mapnik&marker=51.5,0&mlat=51.5&mlon=0`
    : null;

  const STAT_ITEMS = [
    { label: 'Estimates', value: stats?.estimateCount ?? 0, icon: ClipboardList, color: 'text-blue-500' },
    { label: 'Documents', value: stats?.documentCount ?? 0, icon: FileText, color: 'text-purple-500' },
    { label: 'Notes', value: stats?.noteCount ?? 0, icon: MessageSquare, color: 'text-green-500' },
    { label: 'Change Orders', value: stats?.changeOrderCount ?? 0, icon: GitBranch, color: 'text-orange-500' },
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {STAT_ITEMS.map((item) => (
          <motion.div
            key={item.label}
            className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex items-center gap-3"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <item.icon className={`w-8 h-8 ${item.color}`} />
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{item.value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{item.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left col: info + dates */}
        <div className="lg:col-span-2 space-y-5">
          {/* Project Info */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
              Project Information
            </h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <User className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Client</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{project.clientName}</p>
                </div>
              </div>
              {project.clientEmail && (
                <div className="flex items-start gap-3">
                  <Mail className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Email</p>
                    <a
                      href={`mailto:${project.clientEmail}`}
                      className="text-sm font-medium text-orange-500 hover:text-orange-600"
                    >
                      {project.clientEmail}
                    </a>
                  </div>
                </div>
              )}
              {project.clientPhone && (
                <div className="flex items-start gap-3">
                  <Phone className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Phone</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{project.clientPhone}</p>
                  </div>
                </div>
              )}
              {project.siteAddress && (
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Site Address</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{project.siteAddress}</p>
                  </div>
                </div>
              )}
              {project.description && (
                <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Description</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {project.description}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Key Dates */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Key Dates</h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Bid Due Date', value: project.bidDueDate },
                { label: 'Start Date', value: project.startDate },
                { label: 'End Date', value: project.endDate },
                { label: 'Created', value: project.createdAt },
              ].map((d) => (
                <div key={d.label} className="flex items-start gap-2">
                  <Calendar className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{d.label}</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {d.value ? format(new Date(d.value), 'MMM d, yyyy') : '—'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Status Timeline */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
              Status Progress
            </h3>
            <StatusTimeline status={project.status} />
          </div>

          {/* Bid Outcome */}
          {(project.status === 'submitted' || project.status === 'won' || project.status === 'lost') && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Bid Outcome</h3>
                {!bidOutcome && !showOutcomeForm && (
                  <button
                    onClick={() => setShowOutcomeForm(true)}
                    className="text-xs font-medium text-orange-500 hover:text-orange-600 transition-colors"
                  >
                    + Record Outcome
                  </button>
                )}
              </div>

              {outcomeLoading ? (
                <div className="h-16 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
              ) : bidOutcome ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    {bidOutcome.won ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500" />
                    )}
                    <span className={`text-sm font-semibold ${bidOutcome.won ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {bidOutcome.won ? 'Won' : 'Lost'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Submitted Amount</p>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {formatCurrency(bidOutcome.submittedAmount)}
                      </p>
                    </div>
                    {bidOutcome.competitorLowBid != null && (
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Competitor Low Bid</p>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {formatCurrency(bidOutcome.competitorLowBid)}
                        </p>
                      </div>
                    )}
                  </div>
                  {bidOutcome.notes && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                      {bidOutcome.notes}
                    </p>
                  )}
                </div>
              ) : showOutcomeForm ? (
                <form
                  onSubmit={handleSubmit((d) => outcomeMutation.mutate(d))}
                  className="space-y-3"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Submitted Amount *
                      </label>
                      <input
                        {...register('submittedAmount', { valueAsNumber: true })}
                        type="number"
                        step="0.01"
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                      {errors.submittedAmount && (
                        <p className="mt-1 text-xs text-red-500">{errors.submittedAmount.message}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Competitor Low Bid
                      </label>
                      <input
                        {...register('competitorLowBid', { valueAsNumber: true })}
                        type="number"
                        step="0.01"
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      {...register('won')}
                      type="checkbox"
                      className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-orange-500 focus:ring-orange-500"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      We won this bid
                    </span>
                  </label>

                  <textarea
                    {...register('notes')}
                    rows={2}
                    placeholder="Notes (optional)…"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                  />

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowOutcomeForm(false)}
                      className="flex-1 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={outcomeMutation.isPending}
                      className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                    >
                      {outcomeMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                      Record Outcome
                    </button>
                  </div>
                </form>
              ) : (
                <p className="text-sm text-gray-400 dark:text-gray-600">No outcome recorded yet.</p>
              )}
            </div>
          )}
        </div>

        {/* Right col: Map */}
        <div className="space-y-5">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Site Location</h3>
            {project.siteAddress ? (
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-gray-700 dark:text-gray-300">{project.siteAddress}</p>
                </div>
                <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 h-48 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  <div className="text-center text-gray-400 dark:text-gray-600">
                    <MapPin className="w-8 h-8 mx-auto mb-2" />
                    <p className="text-xs">Map preview</p>
                    <a
                      href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(project.siteAddress)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-orange-500 hover:underline mt-1 block"
                    >
                      Open in OpenStreetMap
                    </a>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-600">No site address provided</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
