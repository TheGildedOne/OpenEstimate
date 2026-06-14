import React, { useState } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import {
  ArrowLeft,
  ChevronRight,
  Edit3,
  Trash2,
  Archive,
  Loader2,
  X,
  AlertTriangle,
  MapPin,
  Calendar,
  User,
  Phone,
  Mail,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Project, ProjectStatus } from '@openestimate/shared';
import { UpdateProjectSchema } from '@openestimate/shared';
import { useUIStore } from '@/store/uiStore';
import OverviewTab from './OverviewTab';
import EstimatesTab from './EstimatesTab';
import DocumentsTab from './DocumentsTab';
import SubBidsTab from './SubBidsTab';
import ChangeOrdersTab from './ChangeOrdersTab';
import NotesTab from './NotesTab';
import ActivityTab from './ActivityTab';

// ── Types ─────────────────────────────────────────────────────────────────────

type UpdateProjectFormData = z.infer<typeof UpdateProjectSchema>;

type TabKey =
  | 'overview'
  | 'estimates'
  | 'takeoff'
  | 'documents'
  | 'subbids'
  | 'changeorders'
  | 'notes'
  | 'activity';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'estimates', label: 'Estimates' },
  { key: 'takeoff', label: 'Takeoff' },
  { key: 'documents', label: 'Documents' },
  { key: 'subbids', label: 'Sub Bids' },
  { key: 'changeorders', label: 'Change Orders' },
  { key: 'notes', label: 'Notes' },
  { key: 'activity', label: 'Activity' },
];

const STATUS_OPTIONS: { value: ProjectStatus; label: string; color: string }[] = [
  { value: 'draft', label: 'Draft', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  { value: 'bidding', label: 'Bidding', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
  { value: 'submitted', label: 'Submitted', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400' },
  { value: 'won', label: 'Won', color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' },
  { value: 'lost', label: 'Lost', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
  { value: 'archived', label: 'Archived', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400' },
];

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchProject(id: string): Promise<Project> {
  const res = await fetch(`/api/projects/${id}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Project not found');
  const json = await res.json();
  return json.data ?? json;
}

async function updateProject(id: number, data: UpdateProjectFormData): Promise<Project> {
  const res = await fetch(`/api/projects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Update failed' }));
    throw new Error(err.error || 'Failed to update project');
  }
  const json = await res.json();
  return json.data ?? json;
}

async function deleteProject(id: number): Promise<void> {
  const res = await fetch(`/api/projects/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to delete project');
}

// ── Edit Project Modal ────────────────────────────────────────────────────────

interface EditProjectModalProps {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
}

function EditProjectModal({ project, isOpen, onClose }: EditProjectModalProps) {
  const qc = useQueryClient();
  const { showSuccess, showError } = useUIStore();

  const mutation = useMutation({
    mutationFn: (data: UpdateProjectFormData) => updateProject(project.id, data),
    onSuccess: (updated) => {
      qc.setQueryData(['project', String(project.id)], updated);
      qc.invalidateQueries({ queryKey: ['projects'] });
      showSuccess('Project updated');
      onClose();
    },
    onError: (err) => {
      showError((err as Error).message);
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<UpdateProjectFormData>({
    resolver: zodResolver(UpdateProjectSchema),
    defaultValues: {
      name: project.name,
      clientName: project.clientName,
      clientEmail: project.clientEmail ?? undefined,
      clientPhone: project.clientPhone ?? undefined,
      siteAddress: project.siteAddress ?? undefined,
      description: project.description ?? undefined,
      status: project.status,
      bidDueDate: project.bidDueDate
        ? project.bidDueDate.split('T')[0]
        : undefined,
      startDate: project.startDate ? project.startDate.split('T')[0] : undefined,
      endDate: project.endDate ? project.endDate.split('T')[0] : undefined,
    },
  });

  const handleClose = () => {
    reset();
    mutation.reset();
    onClose();
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
            className="relative w-full max-w-xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 max-h-[90vh] overflow-y-auto"
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <button onClick={handleClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Edit Project</h2>

            <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Project Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    {...register('name')}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Client Name *</label>
                  <input
                    {...register('clientName')}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  {errors.clientName && <p className="mt-1 text-xs text-red-500">{errors.clientName.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                  <select
                    {...register('status')}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Client Email</label>
                  <input
                    {...register('clientEmail')}
                    type="email"
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Client Phone</label>
                  <input
                    {...register('clientPhone')}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bid Due Date</label>
                  <input
                    {...register('bidDueDate')}
                    type="date"
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
                  <input
                    {...register('startDate')}
                    type="date"
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date</label>
                  <input
                    {...register('endDate')}
                    type="date"
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Site Address</label>
                  <input
                    {...register('siteAddress')}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                  <textarea
                    {...register('description')}
                    rows={3}
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
                  Save Changes
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Status Dropdown ───────────────────────────────────────────────────────────

interface StatusDropdownProps {
  project: Project;
}

function StatusDropdown({ project }: StatusDropdownProps) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { showSuccess, showError } = useUIStore();

  const mutation = useMutation({
    mutationFn: (status: ProjectStatus) => updateProject(project.id, { status }),
    onMutate: async (status) => {
      await qc.cancelQueries({ queryKey: ['project', String(project.id)] });
      const prev = qc.getQueryData<Project>(['project', String(project.id)]);
      qc.setQueryData(['project', String(project.id)], { ...project, status });
      return { prev };
    },
    onSuccess: () => {
      showSuccess('Status updated');
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err, _vars, ctx) => {
      showError((err as Error).message);
      if (ctx?.prev) qc.setQueryData(['project', String(project.id)], ctx.prev);
    },
    onSettled: () => setOpen(false),
  });

  const current = STATUS_OPTIONS.find((o) => o.value === project.status);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`px-3 py-1 rounded-full text-xs font-semibold capitalize cursor-pointer transition-all ${current?.color}`}
      >
        {current?.label}
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <motion.div
              className="absolute top-8 left-0 z-20 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg py-1 min-w-[140px]"
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ duration: 0.12 }}
            >
              {STATUS_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => mutation.mutate(o.value)}
                  className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2 ${o.value === project.status ? 'opacity-50' : ''}`}
                >
                  <span className={`inline-block px-2 py-0.5 rounded-full ${o.color}`}>{o.label}</span>
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── ProjectDetail ─────────────────────────────────────────────────────────────

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showSuccess, showError } = useUIStore();

  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as TabKey) || 'overview';
  const setActiveTab = (tab: TabKey) => setSearchParams({ tab }, { replace: true });
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', id],
    queryFn: () => fetchProject(id!),
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteProject(project!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      showSuccess('Project deleted');
      navigate('/projects');
    },
    onError: (err) => showError((err as Error).message),
  });

  const archiveMutation = useMutation({
    mutationFn: () => updateProject(project!.id, { status: 'archived' }),
    onSuccess: (updated) => {
      qc.setQueryData(['project', id], updated);
      showSuccess('Project archived');
    },
    onError: (err) => showError((err as Error).message),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-48" />
          <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-72" />
          <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-full max-w-md" />
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Project not found</h2>
          <Link to="/projects" className="text-orange-500 hover:text-orange-600 text-sm font-medium">
            Back to Projects
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header area */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="px-6 pt-5 pb-0">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 mb-4">
            <Link to="/projects" className="hover:text-gray-700 dark:hover:text-gray-200 flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" />
              Projects
            </Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-gray-900 dark:text-white font-medium truncate max-w-xs">
              {project.name}
            </span>
          </div>

          {/* Project header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">
                  {project.name}
                </h1>
                <StatusDropdown project={project} />
              </div>

              {/* Key info strip */}
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                {project.clientName && (
                  <span className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    {project.clientName}
                  </span>
                )}
                {project.clientEmail && (
                  <span className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" />
                    {project.clientEmail}
                  </span>
                )}
                {project.clientPhone && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5" />
                    {project.clientPhone}
                  </span>
                )}
                {project.siteAddress && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    {project.siteAddress}
                  </span>
                )}
                {project.bidDueDate && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    Due {format(new Date(project.bidDueDate), 'MMM d, yyyy')}
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0 ml-4">
              <button
                onClick={() => setEditOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Edit
              </button>
              {project.status !== 'archived' && (
                <button
                  onClick={() => archiveMutation.mutate()}
                  disabled={archiveMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <Archive className="w-3.5 h-3.5" />
                  Archive
                </button>
              )}
              <button
                onClick={() => setDeleteOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-0 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                role="tab"
                aria-selected={activeTab === tab.key}
                data-testid={tab.key === 'estimates' ? 'estimates-tab' : undefined}
                onClick={() => setActiveTab(tab.key)}
                onKeyDown={(e) => {
                  const keys = TABS.map((t) => t.key);
                  const idx = keys.indexOf(tab.key);
                  if (e.key === 'ArrowRight') setActiveTab(keys[(idx + 1) % keys.length]);
                  if (e.key === 'ArrowLeft') setActiveTab(keys[(idx - 1 + keys.length) % keys.length]);
                }}
                className={`relative px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500 ${
                  activeTab === tab.key
                    ? 'text-orange-600 dark:text-orange-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {tab.label}
                {activeTab === tab.key && (
                  <motion.div
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500 rounded-t-full"
                    layoutId="activeTab"
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="p-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {activeTab === 'overview' && <OverviewTab project={project} />}
            {activeTab === 'estimates' && <EstimatesTab project={project} />}
            {activeTab === 'takeoff' && (
              <div className="text-center py-16 text-gray-500 dark:text-gray-400">
                <p className="text-lg font-medium mb-2">Takeoff</p>
                <p className="text-sm">Open the dedicated takeoff editor for this project.</p>
              </div>
            )}
            {activeTab === 'documents' && <DocumentsTab project={project} />}
            {activeTab === 'subbids' && <SubBidsTab project={project} />}
            {activeTab === 'changeorders' && <ChangeOrdersTab project={project} />}
            {activeTab === 'notes' && <NotesTab project={project} />}
            {activeTab === 'activity' && <ActivityTab projectId={project.id} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Edit modal */}
      {editOpen && (
        <EditProjectModal project={project} isOpen={editOpen} onClose={() => setEditOpen(false)} />
      )}

      {/* Delete confirm */}
      <AnimatePresence>
        {deleteOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteOpen(false)} />
            <motion.div
              className="relative w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6"
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Delete Project</h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
                Are you sure you want to delete "{project.name}"? This action cannot be undone and will permanently
                remove all estimates, documents, and data.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteOpen(false)}
                  className="flex-1 py-2.5 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {deleteMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Delete Permanently
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
