import React, { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { format, differenceInDays } from 'date-fns';
import { Plus, GripVertical, Clock, DollarSign, User } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  closestCorners,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Project, ProjectStatus } from '@openestimate/shared';

// ── Types ─────────────────────────────────────────────────────────────────────

const COLUMNS: { id: ProjectStatus; label: string; color: string; accent: string }[] = [
  { id: 'draft', label: 'Draft', color: 'bg-gray-100 dark:bg-gray-800', accent: 'border-gray-300 dark:border-gray-700' },
  { id: 'bidding', label: 'Bidding', color: 'bg-blue-50 dark:bg-blue-950/40', accent: 'border-blue-300 dark:border-blue-800' },
  { id: 'submitted', label: 'Submitted', color: 'bg-purple-50 dark:bg-purple-950/40', accent: 'border-purple-300 dark:border-purple-800' },
  { id: 'won', label: 'Won', color: 'bg-green-50 dark:bg-green-950/40', accent: 'border-green-300 dark:border-green-800' },
  { id: 'lost', label: 'Lost', color: 'bg-red-50 dark:bg-red-950/40', accent: 'border-red-300 dark:border-red-800' },
];

const COLUMN_HEADER_COLORS: Record<ProjectStatus, string> = {
  draft: 'text-gray-600 dark:text-gray-400',
  bidding: 'text-blue-600 dark:text-blue-400',
  submitted: 'text-purple-600 dark:text-purple-400',
  won: 'text-green-600 dark:text-green-400',
  lost: 'text-red-600 dark:text-red-400',
  archived: 'text-yellow-600 dark:text-yellow-400',
};

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchAllProjects(): Promise<Project[]> {
  const res = await fetch('/api/projects?pageSize=200', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load projects');
  const json = await res.json();
  return json.data?.data ?? json.data ?? [];
}

async function updateProjectStatus(id: number, status: ProjectStatus): Promise<Project> {
  const res = await fetch(`/api/projects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error('Failed to update project');
  const json = await res.json();
  return json.data ?? json;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(n: number | null | undefined) {
  if (n == null) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

// ── Project Card ──────────────────────────────────────────────────────────────

interface ProjectCardProps {
  project: Project;
  isDragging?: boolean;
}

function ProjectCardInner({ project, isDragging }: ProjectCardProps) {
  const bidDays = project.bidDueDate
    ? differenceInDays(new Date(project.bidDueDate), new Date())
    : null;

  const dueBadgeClass =
    bidDays !== null
      ? bidDays <= 3
        ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
        : bidDays <= 7
          ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400'
          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
      : '';

  return (
    <div
      className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3.5 shadow-sm transition-all ${
        isDragging ? 'shadow-2xl ring-2 ring-orange-400/50 rotate-1 opacity-90' : 'hover:shadow-md hover:border-gray-300 dark:hover:border-gray-700'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <Link
          to={`/projects/${project.id}`}
          className="font-medium text-sm text-gray-900 dark:text-white hover:text-orange-500 dark:hover:text-orange-400 transition-colors line-clamp-2 flex-1 mr-2"
          onClick={(e) => e.stopPropagation()}
        >
          {project.name}
        </Link>
        <div className="text-gray-300 dark:text-gray-700 shrink-0 mt-0.5">
          <GripVertical className="w-3.5 h-3.5" />
        </div>
      </div>

      <div className="flex items-center gap-1.5 mb-2.5">
        <User className="w-3 h-3 text-gray-400" />
        <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{project.clientName}</span>
      </div>

      <div className="flex items-center justify-between">
        {project.bidDueDate && bidDays !== null && (
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-gray-400" />
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${dueBadgeClass}`}>
              {bidDays <= 0
                ? 'Overdue'
                : bidDays === 1
                  ? 'Tomorrow'
                  : format(new Date(project.bidDueDate), 'MMM d')}
            </span>
          </div>
        )}
        {project.activeEstimateTotal != null && (
          <div className="flex items-center gap-1 ml-auto">
            <DollarSign className="w-3 h-3 text-gray-400" />
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              {formatCurrency(project.activeEstimateTotal)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function SortableProjectCard({ project }: { project: Project }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
    data: { project },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <ProjectCardInner project={project} />
    </div>
  );
}

// ── Column ────────────────────────────────────────────────────────────────────

interface ColumnProps {
  column: (typeof COLUMNS)[number];
  projects: Project[];
  onAddProject: (status: ProjectStatus) => void;
}

function KanbanColumn({ column, projects, onAddProject }: ColumnProps) {
  return (
    <div className={`flex flex-col rounded-xl ${column.color} border ${column.accent} min-w-[260px] max-w-[300px] flex-1`}>
      {/* Column header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-inherit">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${COLUMN_HEADER_COLORS[column.id]}`}>
            {column.label}
          </span>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-900 px-1.5 py-0.5 rounded-full">
            {projects.length}
          </span>
        </div>
        <button
          onClick={() => onAddProject(column.id)}
          className="w-6 h-6 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-white dark:hover:bg-gray-900 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-[120px] max-h-[calc(100vh-200px)]">
        <SortableContext
          items={projects.map((p) => p.id)}
          strategy={verticalListSortingStrategy}
        >
          <AnimatePresence>
            {projects.map((p) => (
              <motion.div
                key={p.id}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.15 }}
              >
                <SortableProjectCard project={p} />
              </motion.div>
            ))}
          </AnimatePresence>
        </SortableContext>

        {projects.length === 0 && (
          <div className="text-center py-6 text-gray-400 dark:text-gray-600">
            <p className="text-xs">Drop cards here</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── New Project mini modal ────────────────────────────────────────────────────

interface QuickAddModalProps {
  status: ProjectStatus | null;
  onClose: () => void;
  onCreated: () => void;
}

function QuickAddModal({ status, onClose, onCreated }: QuickAddModalProps) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !clientName.trim()) {
      setError('Name and client are required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: name.trim(), clientName: clientName.trim(), status }),
      });
      if (!res.ok) throw new Error('Failed to create project');
      qc.invalidateQueries({ queryKey: ['projects-kanban'] });
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {status && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6"
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              New {status.charAt(0).toUpperCase() + status.slice(1)} Project
            </h2>
            {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Project name *"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Client name *"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  Create
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── ProjectKanban ─────────────────────────────────────────────────────────────

export default function ProjectKanban() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [addingStatus, setAddingStatus] = useState<ProjectStatus | null>(null);

  // Local optimistic state for dragging
  const [localProjects, setLocalProjects] = useState<Project[] | null>(null);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects-kanban'],
    queryFn: fetchAllProjects,
    onSuccess: () => setLocalProjects(null),
  } as Parameters<typeof useQuery>[0]);

  const displayProjects = localProjects ?? projects;

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: ProjectStatus }) =>
      updateProjectStatus(id, status),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ['projects-kanban'] });
      const prev = qc.getQueryData<Project[]>(['projects-kanban']);
      setLocalProjects((current) =>
        (current ?? projects).map((p) => (p.id === id ? { ...p, status } : p))
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) setLocalProjects(context.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['projects-kanban'] });
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const groupedProjects = React.useMemo(() => {
    const map: Record<string, Project[]> = {};
    for (const col of COLUMNS) map[col.id] = [];
    for (const p of displayProjects) {
      if (p.status in map) map[p.status].push(p);
    }
    return map;
  }, [displayProjects]);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const project = displayProjects.find((p) => p.id === event.active.id);
      setActiveProject(project ?? null);
    },
    [displayProjects]
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const overId = over.id as string | number;
      // Check if over a column header
      const targetCol = COLUMNS.find((c) => c.id === overId);
      if (targetCol) {
        setLocalProjects((current) =>
          (current ?? projects).map((p) =>
            p.id === active.id ? { ...p, status: targetCol.id } : p
          )
        );
        return;
      }

      // Over a card — find its column
      const overProject = displayProjects.find((p) => p.id === overId);
      if (overProject && overProject.status !== activeProject?.status) {
        setLocalProjects((current) =>
          (current ?? projects).map((p) =>
            p.id === active.id ? { ...p, status: overProject.status } : p
          )
        );
      }
    },
    [displayProjects, projects, activeProject]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveProject(null);

      if (!over) {
        setLocalProjects(null);
        return;
      }

      const project = (localProjects ?? projects).find((p) => p.id === active.id);
      if (!project) return;

      // Determine target column
      const overId = over.id as string | number;
      const targetCol = COLUMNS.find((c) => c.id === overId);
      const targetProject = displayProjects.find((p) => p.id === overId);
      const targetStatus = targetCol?.id ?? targetProject?.status;

      if (targetStatus && targetStatus !== (projects.find((p) => p.id === active.id)?.status)) {
        updateMutation.mutate({ id: project.id, status: targetStatus as ProjectStatus });
      } else {
        setLocalProjects(null);
      }
    },
    [projects, localProjects, displayProjects, updateMutation]
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
        <div className="h-8 w-48 bg-gray-200 dark:bg-gray-800 rounded animate-pulse mb-6" />
        <div className="flex gap-4">
          {COLUMNS.map((c) => (
            <div
              key={c.id}
              className="flex-1 min-w-[260px] h-96 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Kanban Board</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Drag cards to update status
          </p>
        </div>
        <button
          onClick={() => navigate('/projects')}
          className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          List View
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.id}
              column={col}
              projects={groupedProjects[col.id] ?? []}
              onAddProject={(status) => setAddingStatus(status)}
            />
          ))}
        </div>

        <DragOverlay>
          {activeProject && (
            <div className="rotate-2 scale-105">
              <ProjectCardInner project={activeProject} isDragging />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <QuickAddModal
        status={addingStatus}
        onClose={() => setAddingStatus(null)}
        onCreated={() => setAddingStatus(null)}
      />
    </div>
  );
}
