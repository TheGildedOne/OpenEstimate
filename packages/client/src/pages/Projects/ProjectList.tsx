import React, { useState, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { format, differenceInDays } from 'date-fns';
import {
  Plus,
  Search,
  LayoutList,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  Copy,
  Archive,
  MoreHorizontal,
  FolderOpen,
  Loader2,
  X,
  AlertTriangle,
  Eye,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Project, ProjectStatus, PaginatedResponse } from '@openestimate/shared';
import { CreateProjectSchema } from '@openestimate/shared';

// ── Types ─────────────────────────────────────────────────────────────────────

type CreateProjectFormData = z.infer<typeof CreateProjectSchema>;

const STATUS_LABELS: Record<ProjectStatus | 'all', string> = {
  all: 'All',
  draft: 'Draft',
  bidding: 'Bidding',
  submitted: 'Submitted',
  won: 'Won',
  lost: 'Lost',
  archived: 'Archived',
};

const STATUS_COLORS: Record<ProjectStatus, string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  bidding: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  submitted: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
  won: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  lost: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  archived: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
};

const SORT_OPTIONS = [
  { value: 'updatedAt_desc', label: 'Last Updated' },
  { value: 'createdAt_desc', label: 'Newest First' },
  { value: 'bidDueDate_asc', label: 'Bid Due Date' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'clientName_asc', label: 'Client A–Z' },
];

// ── API ───────────────────────────────────────────────────────────────────────

interface FetchProjectsParams {
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: string;
}

async function fetchProjects(params: FetchProjectsParams): Promise<PaginatedResponse<Project>> {
  const q = new URLSearchParams();
  if (params.status && params.status !== 'all') q.set('status', params.status);
  if (params.search) q.set('search', params.search);
  if (params.page) q.set('page', String(params.page));
  if (params.pageSize) q.set('pageSize', String(params.pageSize));
  if (params.sortBy) q.set('sortBy', params.sortBy);
  if (params.sortDir) q.set('sortDir', params.sortDir);

  const res = await fetch(`/api/projects?${q.toString()}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load projects');
  const json = await res.json();
  return json.data ?? json;
}

async function createProject(data: CreateProjectFormData): Promise<Project> {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to create project' }));
    throw new Error(err.error || 'Failed to create project');
  }
  const json = await res.json();
  return json.data ?? json;
}

async function duplicateProject(id: number): Promise<Project> {
  const res = await fetch(`/api/projects/${id}/duplicate`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to duplicate project');
  const json = await res.json();
  return json.data ?? json;
}

async function archiveProject(id: number): Promise<Project> {
  const res = await fetch(`/api/projects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ status: 'archived' }),
  });
  if (!res.ok) throw new Error('Failed to archive project');
  const json = await res.json();
  return json.data ?? json;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(n: number | null | undefined) {
  if (n == null) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function DueBadge({ date }: { date: string | null }) {
  if (!date) return <span className="text-gray-400 text-xs">—</span>;
  const days = differenceInDays(new Date(date), new Date());
  const label = format(new Date(date), 'MMM d');

  if (days <= 3)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
        {label}
        <span className="px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 text-[10px]">
          {days <= 0 ? 'Overdue' : `${days}d`}
        </span>
      </span>
    );
  if (days <= 7)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-600 dark:text-yellow-400">
        {label}
        <span className="px-1.5 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-900/40 text-[10px]">
          {days}d
        </span>
      </span>
    );
  return (
    <span className="text-xs text-gray-600 dark:text-gray-400">
      {label}
    </span>
  );
}

// ── New Project Modal ─────────────────────────────────────────────────────────

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (project: Project) => void;
}

function NewProjectModal({ isOpen, onClose, onCreated }: NewProjectModalProps) {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: createProject,
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      onCreated(project);
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CreateProjectFormData>({
    resolver: zodResolver(CreateProjectSchema),
    defaultValues: { status: 'draft' },
  });

  const handleClose = () => {
    reset();
    mutation.reset();
    onClose();
  };

  const onSubmit = async (data: CreateProjectFormData) => {
    try {
      const project = await mutation.mutateAsync(data);
      reset();
      onCreated(project);
    } catch {
      // error shown inline
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
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
          />
          <motion.div
            className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8"
            initial={{ scale: 0.92, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 16 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">New Project</h2>

            {mutation.error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
                {(mutation.error as Error).message}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Project Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    {...register('name')}
                    placeholder="e.g. Main St Office Renovation"
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  {errors.name && (
                    <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>
                  )}
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Client Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    {...register('clientName')}
                    placeholder="e.g. Acme Corp"
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  {errors.clientName && (
                    <p className="mt-1 text-xs text-red-500">{errors.clientName.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Status
                  </label>
                  <select
                    {...register('status')}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="draft">Draft</option>
                    <option value="bidding">Bidding</option>
                    <option value="submitted">Submitted</option>
                    <option value="won">Won</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Bid Due Date
                  </label>
                  <input
                    {...register('bidDueDate')}
                    type="date"
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Site Address
                  </label>
                  <input
                    {...register('siteAddress')}
                    placeholder="123 Main St, City, State"
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Description
                  </label>
                  <textarea
                    {...register('description')}
                    rows={3}
                    placeholder="Brief project description…"
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
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
                  Create Project
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Confirm Dialog ────────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  loading?: boolean;
}

function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
  loading,
}: ConfirmDialogProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            className="relative w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6"
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">{description}</p>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={loading}
                className="flex-1 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Row Actions Menu ──────────────────────────────────────────────────────────

interface RowActionsProps {
  project: Project;
  onDuplicate: () => void;
  onArchive: () => void;
}

function RowActions({ project, onDuplicate, onArchive }: RowActionsProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <motion.div
              className="absolute right-0 top-8 z-20 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg py-1 min-w-[150px]"
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ duration: 0.12 }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  navigate(`/projects/${project.id}`);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <Eye className="w-3.5 h-3.5" /> View
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  onDuplicate();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <Copy className="w-3.5 h-3.5" /> Duplicate
              </button>
              {project.status !== 'archived' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    onArchive();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <Archive className="w-3.5 h-3.5" /> Archive
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── ProjectList ───────────────────────────────────────────────────────────────

export default function ProjectList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();

  const [newProjectOpen, setNewProjectOpen] = useState(
    searchParams.get('new') === '1'
  );
  const [view] = useState<'list' | 'kanban'>('list');
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [searchDebounced, setSearchDebounced] = useState(search);
  const [status, setStatus] = useState<string>(searchParams.get('status') ?? 'all');
  const [sortKey, setSortKey] = useState('updatedAt_desc');
  const [page, setPage] = useState(1);
  const [confirmDuplicate, setConfirmDuplicate] = useState<Project | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<Project | null>(null);

  const [sortBy, sortDir] = sortKey.split('_') as [string, string];

  // Debounce search
  React.useEffect(() => {
    const t = setTimeout(() => {
      setSearchDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['projects', { status, search: searchDebounced, page, sortBy, sortDir }],
    queryFn: () =>
      fetchProjects({ status, search: searchDebounced, page, pageSize: 20, sortBy, sortDir }),
    placeholderData: (prev) => prev,
  });

  const projects = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const duplicateMutation = useMutation({
    mutationFn: () => duplicateProject(confirmDuplicate!.id),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      setConfirmDuplicate(null);
      navigate(`/projects/${p.id}`);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => archiveProject(confirmArchive!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      setConfirmArchive(null);
    },
  });

  const handleCreated = useCallback(
    (project: Project) => {
      setNewProjectOpen(false);
      navigate(`/projects/${project.id}`);
    },
    [navigate]
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Projects</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {total} project{total !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setNewProjectOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold text-sm transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {/* Filter bar */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 mb-4 space-y-3">
        {/* Status tabs */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {(Object.keys(STATUS_LABELS) as (ProjectStatus | 'all')[]).map((s) => (
            <button
              key={s}
              onClick={() => {
                setStatus(s);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                status === s
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        {/* Search + sort + view toggle */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects or clients…"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button
              className={`p-2 ${view === 'list' ? 'bg-orange-500 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            >
              <LayoutList className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate('/projects/kanban')}
              className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
                <th className="text-left px-5 py-3 font-semibold text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wide">
                  Name
                </th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wide">
                  Client
                </th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wide">
                  Status
                </th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wide">
                  Bid Due
                </th>
                <th className="text-right px-5 py-3 font-semibold text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wide">
                  Est. Total
                </th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wide">
                  Last Updated
                </th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : projects.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-600">
                      <FolderOpen className="w-12 h-12 mb-3" />
                      <p className="text-base font-medium">No projects found</p>
                      <p className="text-sm mt-1">
                        {search
                          ? 'Try a different search term'
                          : 'Create your first project to get started'}
                      </p>
                      {!search && (
                        <button
                          onClick={() => setNewProjectOpen(true)}
                          className="mt-4 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                          New Project
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                projects.map((project) => (
                  <motion.tr
                    key={project.id}
                    onClick={() => navigate(`/projects/${project.id}`)}
                    className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 cursor-pointer transition-colors"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <td className="px-5 py-4">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {project.name}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-gray-600 dark:text-gray-400">
                      {project.clientName}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[project.status]}`}
                      >
                        {project.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <DueBadge date={project.bidDueDate} />
                    </td>
                    <td className="px-5 py-4 text-right font-medium text-gray-900 dark:text-white">
                      {formatCurrency(project.activeEstimateTotal)}
                    </td>
                    <td className="px-5 py-4 text-gray-500 dark:text-gray-400 text-xs">
                      {format(new Date(project.updatedAt), 'MMM d, yyyy')}
                    </td>
                    <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                      <RowActions
                        project={project}
                        onDuplicate={() => setConfirmDuplicate(project)}
                        onArchive={() => setConfirmArchive(project)}
                      />
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Page {page} of {totalPages} ({total} total)
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 text-gray-500 dark:text-gray-400"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                      p === page
                        ? 'bg-orange-500 text-white'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 text-gray-500 dark:text-gray-400"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <NewProjectModal
        isOpen={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        onCreated={handleCreated}
      />

      <ConfirmDialog
        isOpen={!!confirmDuplicate}
        title="Duplicate Project"
        description={`Duplicate "${confirmDuplicate?.name}"? This will create a copy with all estimates.`}
        confirmLabel="Duplicate"
        onConfirm={() => duplicateMutation.mutate()}
        onClose={() => setConfirmDuplicate(null)}
        loading={duplicateMutation.isPending}
      />

      <ConfirmDialog
        isOpen={!!confirmArchive}
        title="Archive Project"
        description={`Archive "${confirmArchive?.name}"? You can restore it later.`}
        confirmLabel="Archive"
        onConfirm={() => archiveMutation.mutate()}
        onClose={() => setConfirmArchive(null)}
        loading={archiveMutation.isPending}
      />
    </div>
  );
}
