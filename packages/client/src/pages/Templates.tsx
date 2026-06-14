import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Search,
  Globe,
  Lock,
  Eye,
  Copy,
  Trash2,
  X,
  Loader2,
  FileText,
  Check,
  ChevronDown,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  useTemplates,
  useTemplate,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
  useApplyTemplate,
  useCreateTemplateFromEstimate,
  useProjects,
  useEstimates,
} from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import type { Template } from '@openestimate/shared';

// ── Trade categories ───────────────────────────────────────────────────────────

const TRADE_CATEGORIES = [
  'General Construction', 'Electrical', 'Plumbing', 'HVAC', 'Roofing',
  'Concrete', 'Framing', 'Drywall', 'Painting', 'Landscaping',
  'Masonry', 'Flooring', 'Sitework', 'Mechanical', 'Other',
];

// ── Apply template modal ───────────────────────────────────────────────────────

interface ApplyModalProps {
  template: Template;
  onClose: () => void;
}

function ApplyTemplateModal({ template, onClose }: ApplyModalProps) {
  const { data: projects = [] } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedEstimateId, setSelectedEstimateId] = useState<number | null>(null);
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const { data: estimates = [] } = useEstimates(selectedProjectId ?? 0);
  const applyTemplate = useApplyTemplate();
  const { showSuccess, showError } = useUIStore();

  const handleApply = async () => {
    if (!selectedEstimateId) return;
    try {
      await applyTemplate.mutateAsync({ templateId: template.id, estimateId: selectedEstimateId });
      showSuccess(`Template "${template.name}" applied`);
      onClose();
    } catch { showError('Failed to apply template'); }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md"
        initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-white">Apply Template</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Template</label>
            <div className="px-3 py-2 rounded-lg bg-orange-50 dark:bg-orange-900/20 text-sm font-medium text-orange-700 dark:text-orange-300">
              {template.name}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Target Project</label>
            <select
              value={selectedProjectId ?? ''}
              onChange={(e) => { setSelectedProjectId(parseInt(e.target.value) || null); setSelectedEstimateId(null); }}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="">Select project…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {selectedProjectId && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Target Estimate</label>
              <select
                value={selectedEstimateId ?? ''}
                onChange={(e) => setSelectedEstimateId(parseInt(e.target.value) || null)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="">Select estimate…</option>
                {(Array.isArray(estimates) ? estimates : []).map((e: { id: number; name: string }) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Apply Mode</label>
            <div className="flex gap-2">
              {(['append', 'replace'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${
                    mode === m
                      ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300'
                      : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {m === 'append' ? 'Append sections' : 'Replace all'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
          <button
            onClick={handleApply}
            disabled={!selectedEstimateId || applyTemplate.isPending}
            className="flex-1 py-2 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {applyTemplate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Apply Template
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Preview modal ──────────────────────────────────────────────────────────────

interface PreviewModalProps {
  templateId: number;
  onClose: () => void;
}

function PreviewModal({ templateId, onClose }: PreviewModalProps) {
  const { data: template, isLoading } = useTemplate(templateId);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
          <h3 className="font-semibold text-gray-900 dark:text-white">{template?.name ?? 'Template Preview'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />)}</div>
          ) : !template ? (
            <p className="text-gray-400 text-sm">Template not found</p>
          ) : (
            <div className="space-y-5">
              {template.description && (
                <p className="text-sm text-gray-500 dark:text-gray-400">{template.description}</p>
              )}
              {(template.sections ?? []).map((section) => (
                <div key={section.id}>
                  <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2 flex items-center gap-2 text-sm">
                    {section.color && <span className="w-3 h-3 rounded-full" style={{ backgroundColor: section.color }} />}
                    {section.name}
                    <span className="text-xs text-gray-400 font-normal ml-1">({(section.lineItems ?? []).length} items)</span>
                  </h4>
                  <div className="space-y-1 pl-5">
                    {(section.lineItems ?? []).map((item) => (
                      <div key={item.id} className="text-sm text-gray-600 dark:text-gray-400 flex items-center justify-between">
                        <span>{item.description}</span>
                        <span className="text-xs text-gray-400 font-mono">{item.quantity} {item.unit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Create template from estimate modal ────────────────────────────────────────

interface FromEstimateModalProps {
  onClose: () => void;
}

function FromEstimateModal({ onClose }: FromEstimateModalProps) {
  const { data: projects = [] } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedEstimateId, setSelectedEstimateId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const { data: estimates = [] } = useEstimates(selectedProjectId ?? 0);
  const createFromEstimate = useCreateTemplateFromEstimate();
  const { showSuccess, showError } = useUIStore();

  const handleCreate = async () => {
    if (!selectedEstimateId || !name.trim()) return;
    try {
      await createFromEstimate.mutateAsync({ estimateId: selectedEstimateId, name: name.trim(), isPublic });
      showSuccess('Template created');
      onClose();
    } catch { showError('Failed to create template'); }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md"
        initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-white">Create Template from Estimate</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Template Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Template"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Source Project</label>
            <select
              value={selectedProjectId ?? ''}
              onChange={(e) => { setSelectedProjectId(parseInt(e.target.value) || null); setSelectedEstimateId(null); }}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="">Select project…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {selectedProjectId && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Source Estimate</label>
              <select
                value={selectedEstimateId ?? ''}
                onChange={(e) => setSelectedEstimateId(parseInt(e.target.value) || null)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="">Select estimate…</option>
                {(Array.isArray(estimates) ? estimates : []).map((e: { id: number; name: string }) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="w-4 h-4 rounded border-gray-300 accent-orange-500" />
            <span className="text-sm text-gray-700 dark:text-gray-300">Make public (visible to all users)</span>
          </label>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
          <button
            onClick={handleCreate}
            disabled={!selectedEstimateId || !name.trim() || createFromEstimate.isPending}
            className="flex-1 py-2 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg disabled:opacity-50"
          >
            {createFromEstimate.isPending ? 'Creating…' : 'Create Template'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Template card ──────────────────────────────────────────────────────────────

interface TemplateCardProps {
  template: Template;
  isOwner: boolean;
  onApply: (t: Template) => void;
  onPreview: (id: number) => void;
  onDelete: (id: number) => void;
}

function TemplateCard({ template, isOwner, onApply, onPreview, onDelete }: TemplateCardProps) {
  const itemCount = (template.sections ?? []).reduce((sum, s) => sum + (s.lineItems?.length ?? 0), 0);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex flex-col gap-3 hover:border-orange-300 dark:hover:border-orange-700 hover:shadow-md transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm truncate">{template.name}</h3>
            {template.isPublic
              ? <Globe className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" title="Public" />
              : <Lock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" title="Private" />
            }
          </div>
          {template.tradeCategory && (
            <span className="text-xs px-2 py-0.5 mt-1 inline-block rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400">
              {template.tradeCategory}
            </span>
          )}
        </div>
        <FileText className="w-8 h-8 text-gray-200 dark:text-gray-700 flex-shrink-0" />
      </div>

      {template.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{template.description}</p>
      )}

      <div className="flex items-center gap-3 text-xs text-gray-400">
        <span>{(template.sections ?? []).length} sections</span>
        <span>·</span>
        <span>{itemCount} items</span>
        {template.createdAt && (
          <>
            <span>·</span>
            <span>{format(new Date(template.createdAt), 'MMM d, yyyy')}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 mt-auto pt-1">
        <button
          onClick={() => onPreview(template.id)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <Eye className="w-3.5 h-3.5" />
          Preview
        </button>
        <button
          onClick={() => onApply(template)}
          className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
        >
          <Copy className="w-3.5 h-3.5" />
          Apply
        </button>
        {isOwner && (
          <button
            onClick={() => onDelete(template.id)}
            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function Templates() {
  const user = useAuthStore((s) => s.user);
  const [search, setSearch] = useState('');
  const [selectedTrade, setSelectedTrade] = useState('');
  const [mineOnly, setMineOnly] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showFromEstimate, setShowFromEstimate] = useState(false);
  const [applyTarget, setApplyTarget] = useState<Template | null>(null);
  const [previewId, setPreviewId] = useState<number | null>(null);

  const { showSuccess, showError } = useUIStore();
  const { data: templates = [], isLoading } = useTemplates();
  const deleteTemplate = useDeleteTemplate();
  const createTemplate = useCreateTemplate();

  const filtered = templates.filter((t) => {
    if (mineOnly && t.createdBy !== user?.id) return false;
    if (selectedTrade && t.tradeCategory !== selectedTrade) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this template?')) return;
    try {
      await deleteTemplate.mutateAsync(id);
      showSuccess('Template deleted');
    } catch { showError('Failed to delete template'); }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex-shrink-0">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Templates</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{filtered.length} templates</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFromEstimate(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <Copy className="w-4 h-4" />
              From Estimate
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Template
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates…"
              className="pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <select
            value={selectedTrade}
            onChange={(e) => setSelectedTrade(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="">All Trades</option>
            {TRADE_CATEGORIES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} className="w-4 h-4 rounded border-gray-300 accent-orange-500" />
            My templates only
          </label>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-44 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <FileText className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-base font-medium text-gray-500 dark:text-gray-400">No templates found</p>
            <p className="text-sm mt-1">Create a template or adjust your filters</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 px-4 py-2 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Template
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <AnimatePresence mode="popLayout">
              {filtered.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  isOwner={t.createdBy === user?.id || user?.role === 'admin'}
                  onApply={setApplyTarget}
                  onPreview={setPreviewId}
                  onDelete={handleDelete}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {applyTarget && <ApplyTemplateModal template={applyTarget} onClose={() => setApplyTarget(null)} />}
        {previewId && <PreviewModal templateId={previewId} onClose={() => setPreviewId(null)} />}
        {showFromEstimate && <FromEstimateModal onClose={() => setShowFromEstimate(false)} />}
      </AnimatePresence>
    </div>
  );
}
