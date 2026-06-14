import React, { useState, useMemo } from 'react';
import {
  Plus,
  FileText,
  Edit,
  Trash2,
  Search,
  Eye,
  CheckSquare,
  Lock,
  Globe,
  Copy,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import {
  useTemplates,
  useTemplate,
  useProjects,
  useEstimates,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
  useApplyTemplate,
  useCreateTemplateFromEstimate,
} from '@/lib/api';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import type { Template, Estimate } from '@openestimate/shared';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

// ─── Types ─────────────────────────────────────────────────────────────────────

const TRADE_CATEGORIES = [
  'General Conditions',
  'Site Work',
  'Concrete',
  'Masonry',
  'Metals',
  'Wood & Plastics',
  'Thermal & Moisture',
  'Doors & Windows',
  'Finishes',
  'Specialties',
  'Equipment',
  'Mechanical',
  'Electrical',
  'Plumbing',
  'HVAC',
  'Fire Protection',
];

// ─── Schema ────────────────────────────────────────────────────────────────────

const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  tradeCategory: z.string().optional(),
  description: z.string().optional(),
  isPublic: z.boolean().default(false),
  fromEstimate: z.boolean().default(false),
  sourceProjectId: z.number().optional(),
  sourceEstimateId: z.number().optional(),
});

type CreateForm = z.infer<typeof createSchema>;

// ─── Create Template Modal ─────────────────────────────────────────────────────

interface CreateTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  editTemplate: Template | null;
}

function CreateTemplateModal({ isOpen, onClose, editTemplate }: CreateTemplateModalProps) {
  const { showSuccess, showError } = useUIStore();
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const createFromEstimate = useCreateTemplateFromEstimate();

  const form = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: editTemplate?.name ?? '',
      tradeCategory: editTemplate?.tradeCategory ?? '',
      description: editTemplate?.description ?? '',
      isPublic: editTemplate?.isPublic ?? false,
      fromEstimate: false,
    },
  });

  React.useEffect(() => {
    form.reset({
      name: editTemplate?.name ?? '',
      tradeCategory: editTemplate?.tradeCategory ?? '',
      description: editTemplate?.description ?? '',
      isPublic: editTemplate?.isPublic ?? false,
      fromEstimate: false,
    });
  }, [editTemplate, form]);

  const fromEstimate = form.watch('fromEstimate');
  const sourceProjectId = form.watch('sourceProjectId');

  const { data: projects } = useProjects();
  const { data: estimates } = useEstimates(sourceProjectId ?? 0);

  const handleSubmit = async (data: CreateForm) => {
    try {
      if (editTemplate) {
        await updateTemplate.mutateAsync({ id: editTemplate.id, ...data });
        showSuccess('Template updated');
      } else if (data.fromEstimate && data.sourceEstimateId) {
        await createFromEstimate.mutateAsync({
          estimateId: data.sourceEstimateId,
          name: data.name,
        });
        showSuccess('Template created from estimate');
      } else {
        await createTemplate.mutateAsync({
          name: data.name,
          tradeCategory: data.tradeCategory,
          description: data.description,
          isPublic: data.isPublic,
        });
        showSuccess('Template created');
      }
      onClose();
    } catch {
      showError('Failed to save template');
    }
  };

  const isPending =
    createTemplate.isPending || updateTemplate.isPending || createFromEstimate.isPending;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editTemplate ? 'Edit Template' : 'Create Template'}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={form.handleSubmit(handleSubmit)} isLoading={isPending}>
            {editTemplate ? 'Save Changes' : 'Create Template'}
          </Button>
        </div>
      }
    >
      <form className="space-y-4">
        <Input
          label="Template Name *"
          {...form.register('name')}
          error={form.formState.errors.name?.message}
          placeholder="e.g. Standard Electrical Estimate"
        />

        <Select
          label="Trade Category"
          options={[
            { value: '', label: 'None' },
            ...TRADE_CATEGORIES.map((c) => ({ value: c, label: c })),
          ]}
          {...form.register('tradeCategory')}
        />

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700 dark:text-zinc-300">
            Description
          </label>
          <textarea
            {...form.register('description')}
            rows={3}
            placeholder="Describe what this template is for..."
            className="block w-full rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 text-sm px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" {...form.register('isPublic')} className="rounded" />
          <span className="text-sm text-gray-700 dark:text-zinc-300">
            Make visible to all users
          </span>
        </label>

        {!editTemplate && (
          <>
            <div className="border-t border-gray-200 dark:border-zinc-800 pt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" {...form.register('fromEstimate')} className="rounded" />
                <span className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                  Create from existing estimate
                </span>
              </label>
            </div>

            <AnimatePresence>
              {fromEstimate && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden space-y-3"
                >
                  <Select
                    label="Project"
                    placeholder="Select project..."
                    options={(projects ?? []).map((p) => ({
                      value: p.id,
                      label: p.name,
                    }))}
                    onChange={(e) =>
                      form.setValue('sourceProjectId', Number(e.target.value))
                    }
                  />
                  {sourceProjectId && (
                    <Select
                      label="Estimate"
                      placeholder="Select estimate..."
                      options={(estimates ?? []).map((e) => ({
                        value: e.id,
                        label: `${e.name} v${e.version}`,
                      }))}
                      onChange={(e) =>
                        form.setValue('sourceEstimateId', Number(e.target.value))
                      }
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </form>
    </Modal>
  );
}

// ─── Preview Modal ─────────────────────────────────────────────────────────────

interface PreviewModalProps {
  templateId: number | null;
  onClose: () => void;
}

function PreviewModal({ templateId, onClose }: PreviewModalProps) {
  const { data: template } = useTemplate(templateId ?? 0);

  return (
    <Modal
      isOpen={templateId !== null}
      onClose={onClose}
      title={template ? `Preview: ${template.name}` : 'Preview'}
      size="lg"
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      {!template ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-4 bg-gray-200 dark:bg-zinc-800 rounded" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {template.tradeCategory && (
              <Badge variant="blue">{template.tradeCategory}</Badge>
            )}
            {template.isPublic ? (
              <Badge variant="green">
                <Globe className="w-3 h-3 mr-1" />
                Public
              </Badge>
            ) : (
              <Badge variant="gray">
                <Lock className="w-3 h-3 mr-1" />
                Private
              </Badge>
            )}
          </div>

          {template.description && (
            <p className="text-sm text-gray-600 dark:text-zinc-400">{template.description}</p>
          )}

          {/* Sections */}
          {((template as Template & { sections?: Array<{ name: string; lineItems?: Array<{ description: string; unit?: string }> }> }).sections ?? []).length > 0 ? (
            <div className="space-y-3">
              {((template as Template & { sections?: Array<{ name: string; lineItems?: Array<{ description: string; unit?: string }> }> }).sections ?? []).map((section, si) => (
                <div
                  key={si}
                  className="rounded-lg border border-gray-200 dark:border-zinc-800 overflow-hidden"
                >
                  <div className="bg-gray-50 dark:bg-zinc-800 px-4 py-2 border-b border-gray-200 dark:border-zinc-700">
                    <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100">
                      {section.name}
                    </p>
                  </div>
                  <ul className="divide-y divide-gray-100 dark:divide-zinc-800">
                    {(section.lineItems ?? []).map((item, li) => (
                      <li
                        key={li}
                        className="px-4 py-2 text-sm text-gray-700 dark:text-zinc-300 flex items-center justify-between"
                      >
                        <span>{item.description}</span>
                        {item.unit && (
                          <span className="text-xs text-gray-400 dark:text-zinc-500 uppercase">
                            {item.unit}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-zinc-400 text-center py-6">
              No sections in this template.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

// ─── Apply Template Modal ─────────────────────────────────────────────────────

type ApplyMode = 'append' | 'replace' | 'merge';

interface ApplyTemplateModalProps {
  templateId: number | null;
  onClose: () => void;
}

function ApplyTemplateModal({ templateId, onClose }: ApplyTemplateModalProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedEstimateId, setSelectedEstimateId] = useState<number | null>(null);
  const [mode, setMode] = useState<ApplyMode>('append');

  const { showSuccess, showError } = useUIStore();
  const applyTemplate = useApplyTemplate();

  const { data: projects } = useProjects();
  const { data: estimates } = useEstimates(selectedProjectId ?? 0);

  const handleApply = async () => {
    if (!templateId || !selectedEstimateId) return;
    try {
      await applyTemplate.mutateAsync({ templateId, estimateId: selectedEstimateId });
      showSuccess('Template applied successfully');
      onClose();
    } catch {
      showError('Failed to apply template');
    }
  };

  return (
    <Modal
      isOpen={templateId !== null}
      onClose={onClose}
      title="Apply Template"
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={!selectedEstimateId}
            isLoading={applyTemplate.isPending}
          >
            Apply Template
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Select
          label="Select Project"
          placeholder="Choose a project..."
          options={(projects ?? []).map((p) => ({ value: p.id, label: p.name }))}
          onChange={(e) => {
            setSelectedProjectId(Number(e.target.value) || null);
            setSelectedEstimateId(null);
          }}
        />

        {selectedProjectId && (
          <Select
            label="Select Estimate"
            placeholder="Choose an estimate..."
            options={(estimates ?? []).map((e) => ({
              value: e.id,
              label: `${e.name} v${e.version}${e.isActive ? ' (Active)' : ''}`,
            }))}
            onChange={(e) => setSelectedEstimateId(Number(e.target.value) || null)}
          />
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">Apply Mode</p>
          {(
            [
              {
                value: 'append' as ApplyMode,
                label: 'Append sections',
                desc: 'Add template sections after existing ones',
              },
              {
                value: 'replace' as ApplyMode,
                label: 'Replace all sections',
                desc: 'Remove existing sections and use template',
              },
              {
                value: 'merge' as ApplyMode,
                label: 'Merge into existing',
                desc: 'Combine with existing matching sections',
              },
            ] as const
          ).map((opt) => (
            <label key={opt.value} className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="radio"
                name="applyMode"
                value={opt.value}
                checked={mode === opt.value}
                onChange={() => setMode(opt.value)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-zinc-100">
                  {opt.label}
                </p>
                <p className="text-xs text-gray-500 dark:text-zinc-400">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ─── Template Card ─────────────────────────────────────────────────────────────

interface TemplateCardProps {
  template: Template;
  onEdit: (t: Template) => void;
  onDelete: (t: Template) => void;
  onPreview: (id: number) => void;
  onApply: (id: number) => void;
  currentUserId: number | undefined;
  isAdmin: boolean;
}

function TemplateCard({
  template,
  onEdit,
  onDelete,
  onPreview,
  onApply,
  currentUserId,
  isAdmin,
}: TemplateCardProps) {
  const itemCount =
    (template as Template & { sections?: Array<{ lineItems?: unknown[] }> }).sections?.reduce(
      (sum, s) => sum + (s.lineItems?.length ?? 0),
      0
    ) ?? (template as Template & { itemCount?: number }).itemCount ?? 0;

  const sectionCount =
    (template as Template & { sections?: unknown[] }).sections?.length ??
    (template as Template & { sectionCount?: number }).sectionCount ??
    0;

  const canDelete = isAdmin || template.createdBy === currentUserId;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 flex flex-col gap-3 hover:border-brand-300 dark:hover:border-brand-700 transition-colors"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-zinc-100 truncate">{template.name}</h3>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {template.tradeCategory && (
              <Badge variant="blue" size="sm">{template.tradeCategory}</Badge>
            )}
            {template.isPublic ? (
              <Badge variant="green" size="sm">
                <Globe className="w-2.5 h-2.5 mr-0.5" />
                Public
              </Badge>
            ) : (
              <Badge variant="gray" size="sm">
                <Lock className="w-2.5 h-2.5 mr-0.5" />
                Private
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      {template.description && (
        <p className="text-xs text-gray-500 dark:text-zinc-400 line-clamp-2 flex-1">
          {template.description}
        </p>
      )}

      {/* Meta */}
      <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-zinc-500 mt-auto">
        {sectionCount > 0 && (
          <span>{sectionCount} section{sectionCount !== 1 ? 's' : ''}</span>
        )}
        {itemCount > 0 && (
          <span>{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
        )}
        {(template as Template & { createdByName?: string }).createdByName && (
          <span>by {(template as Template & { createdByName?: string }).createdByName}</span>
        )}
        <span className="ml-auto">
          {format(new Date(template.createdAt), 'MMM d, yyyy')}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 pt-2 border-t border-gray-100 dark:border-zinc-800">
        <Button
          variant="primary"
          size="sm"
          leftIcon={<CheckSquare className="w-3.5 h-3.5" />}
          onClick={() => onApply(template.id)}
          className="flex-1"
        >
          Apply
        </Button>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<Eye className="w-3.5 h-3.5" />}
          onClick={() => onPreview(template.id)}
        >
          Preview
        </Button>
        <button
          onClick={() => onEdit(template)}
          className="p-1.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          aria-label="Edit template"
        >
          <Edit className="w-3.5 h-3.5" />
        </button>
        {canDelete && (
          <button
            onClick={() => onDelete(template)}
            className="p-1.5 rounded text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            aria-label="Delete template"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ─── Templates page ───────────────────────────────────────────────────────────

export default function Templates() {
  const [search, setSearch] = useState('');
  const [tradeFilter, setTradeFilter] = useState('');
  const [myOnly, setMyOnly] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<Template | null>(null);
  const [deleteTemplate, setDeleteTemplate] = useState<Template | null>(null);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [applyId, setApplyId] = useState<number | null>(null);

  const { showSuccess, showError } = useUIStore();
  const currentUser = useAuthStore((s) => s.user);

  const { data: templates, isLoading } = useTemplates();
  const deleteMutation = useDeleteTemplate();

  const isAdmin = currentUser?.role === 'admin';

  // Filter client-side
  const filtered = useMemo(() => {
    let items = templates ?? [];
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.description ?? '').toLowerCase().includes(q) ||
          (t.tradeCategory ?? '').toLowerCase().includes(q)
      );
    }
    if (tradeFilter) {
      items = items.filter((t) => t.tradeCategory === tradeFilter);
    }
    if (myOnly && currentUser) {
      items = items.filter((t) => t.createdBy === currentUser.id);
    }
    return items;
  }, [templates, search, tradeFilter, myOnly, currentUser]);

  const allTrades = useMemo(() => {
    const trades = new Set<string>();
    (templates ?? []).forEach((t) => { if (t.tradeCategory) trades.add(t.tradeCategory); });
    return Array.from(trades).sort();
  }, [templates]);

  const handleDelete = async () => {
    if (!deleteTemplate) return;
    try {
      await deleteMutation.mutateAsync(deleteTemplate.id);
      showSuccess('Template deleted');
    } catch {
      showError('Failed to delete template');
    } finally {
      setDeleteTemplate(null);
    }
  };

  const openEdit = (t: Template) => {
    setEditTemplate(t);
    setCreateModalOpen(true);
  };

  return (
    <PageContainer
      title="Templates"
      actions={
        <Button
          onClick={() => { setEditTemplate(null); setCreateModalOpen(true); }}
          leftIcon={<Plus className="w-4 h-4" />}
        >
          Create Template
        </Button>
      }
    >
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Input
          placeholder="Search templates…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          prefix={<Search className="w-4 h-4" />}
          containerClassName="flex-1 min-w-[180px] max-w-xs"
        />
        <select
          value={tradeFilter}
          onChange={(e) => setTradeFilter(e.target.value)}
          className="rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">All Categories</option>
          {allTrades.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <div className="flex rounded-md border border-gray-300 dark:border-zinc-700 overflow-hidden">
          {(
            [
              { label: 'All Templates', value: false },
              { label: 'My Templates', value: true },
            ] as const
          ).map((opt) => (
            <button
              key={String(opt.value)}
              onClick={() => setMyOnly(opt.value)}
              className={[
                'px-3 py-2 text-sm font-medium transition-colors',
                myOnly === opt.value
                  ? 'bg-brand-600 text-white'
                  : 'bg-white dark:bg-zinc-900 text-gray-600 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800',
              ].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => <SkeletonCard key={i} rows={3} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title={search || tradeFilter || myOnly ? 'No templates match' : 'No templates yet'}
          description={
            search || tradeFilter || myOnly
              ? 'Try adjusting your filters.'
              : 'Create reusable templates to speed up your bidding process.'
          }
          action={
            !search && !tradeFilter
              ? {
                  label: 'Create Template',
                  onClick: () => { setEditTemplate(null); setCreateModalOpen(true); },
                }
              : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {filtered.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onEdit={openEdit}
                onDelete={setDeleteTemplate}
                onPreview={setPreviewId}
                onApply={setApplyId}
                currentUserId={currentUser?.id}
                isAdmin={isAdmin}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Create/Edit modal */}
      <CreateTemplateModal
        isOpen={createModalOpen}
        onClose={() => { setCreateModalOpen(false); setEditTemplate(null); }}
        editTemplate={editTemplate}
      />

      {/* Preview modal */}
      <PreviewModal templateId={previewId} onClose={() => setPreviewId(null)} />

      {/* Apply modal */}
      <ApplyTemplateModal templateId={applyId} onClose={() => setApplyId(null)} />

      {/* Delete confirm */}
      <ConfirmDialog
        isOpen={!!deleteTemplate}
        onClose={() => setDeleteTemplate(null)}
        onConfirm={handleDelete}
        title="Delete Template"
        message={`Delete "${deleteTemplate?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        isLoading={deleteMutation.isPending}
      />
    </PageContainer>
  );
}
