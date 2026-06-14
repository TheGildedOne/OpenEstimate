import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Save,
  Clock,
  History,
  Download,
  ChevronRight,
  Plus,
  Undo2,
  Redo2,
  Check,
  Loader2,
  ChevronDown,
  FileText,
  FileSpreadsheet,
  X,
} from 'lucide-react';
import {
  useEstimate,
  useEstimates,
  useUpdateEstimate,
  useSaveVersion,
  useCreateSection,
} from '@/lib/api';
import { useEstimateStore } from '@/store/estimateStore';
import { useUIStore } from '@/store/uiStore';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import EstimateGrid from './EstimateGrid';
import TotalsPanel from './TotalsPanel';
import VersionHistory from './VersionHistory';
import type { Estimate } from '@openestimate/shared';

// ─── Export dropdown ──────────────────────────────────────────────────────────

function ExportDropdown({ estimateId }: { estimateId: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const options = [
    { label: 'Client Proposal PDF', testId: 'export-proposal-pdf', icon: FileText, url: `/api/estimates/${estimateId}/export/proposal-pdf` },
    { label: 'Internal PDF', testId: 'export-internal-pdf', icon: FileText, url: `/api/estimates/${estimateId}/export/internal-pdf` },
    { label: 'Excel', testId: 'export-excel', icon: FileSpreadsheet, url: `/api/estimates/${estimateId}/export/xlsx` },
    { label: 'CSV', testId: 'export-csv', icon: FileText, url: `/api/estimates/${estimateId}/export/csv` },
    { label: 'QuickBooks CSV', testId: 'export-qbo-csv', icon: FileText, url: `/api/estimates/${estimateId}/export/qbo-csv` },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        data-testid="export-dropdown-button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors"
      >
        <Download className="w-4 h-4" />
        Export
        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-1 z-30 bg-white dark:bg-zinc-900 rounded-lg shadow-xl border border-gray-200 dark:border-zinc-700 py-1 w-52"
          >
            {options.map((opt) => (
              <a
                key={opt.label}
                href={opt.url}
                target="_blank"
                rel="noreferrer"
                data-testid={opt.testId}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800"
              >
                <opt.icon className="w-4 h-4 text-gray-400" />
                {opt.label}
              </a>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Estimate name editor ─────────────────────────────────────────────────────

function EstimateName({ name, onSave }: { name: string; onSave: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [localName, setLocalName] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setLocalName(name); }, [name]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const commit = () => {
    setEditing(false);
    if (localName.trim() && localName !== name) onSave(localName.trim());
    else setLocalName(name);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={localName}
        onChange={(e) => setLocalName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setLocalName(name); setEditing(false); } }}
        className="text-lg font-semibold bg-transparent border-b-2 border-orange-500 focus:outline-none text-gray-900 dark:text-white min-w-[180px] max-w-sm"
      />
    );
  }

  return (
    <h1
      className="text-lg font-semibold text-gray-900 dark:text-white cursor-pointer hover:text-orange-500 dark:hover:text-orange-400 transition-colors truncate max-w-sm"
      onDoubleClick={() => setEditing(true)}
      title="Double-click to rename"
    >
      {name}
    </h1>
  );
}

// ─── Estimate tabs (multiple estimates per project) ───────────────────────────

function EstimateTabs({
  projectId,
  activeEstimateId,
}: {
  projectId: number;
  activeEstimateId: number;
}) {
  const { data: estimates } = useEstimates(projectId);
  const navigate = useNavigate();

  if (!estimates || estimates.length <= 1) return null;

  return (
    <div className="flex items-center gap-0.5 border border-gray-200 dark:border-zinc-700 rounded-lg overflow-hidden">
      {estimates.map((est) => (
        <button
          key={est.id}
          onClick={() => navigate(`/estimates/${est.id}`)}
          className={`px-3 py-1 text-sm transition-colors ${
            est.id === activeEstimateId
              ? 'bg-orange-500 text-white font-medium'
              : 'text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800'
          }`}
        >
          {est.name}
        </button>
      ))}
    </div>
  );
}

// ─── Keyboard hint bar ────────────────────────────────────────────────────────

function ShortcutHints() {
  const hints = [
    { keys: ['Tab'], desc: 'Next cell' },
    { keys: ['Enter'], desc: 'Next row' },
    { keys: ['Ctrl', 'Z'], desc: 'Undo' },
    { keys: ['Ctrl', 'Y'], desc: 'Redo' },
    { keys: ['Ctrl', 'C'], desc: 'Copy rows' },
    { keys: ['Ctrl', 'V'], desc: 'Paste' },
    { keys: ['Ctrl', 'S'], desc: 'Save' },
    { keys: ['?'], desc: 'All shortcuts' },
  ];

  return (
    <div className="flex items-center gap-4 px-4 py-1.5 bg-gray-50 dark:bg-zinc-800/60 border-t border-gray-200 dark:border-zinc-700 text-xs text-gray-400 dark:text-zinc-500 overflow-x-auto flex-shrink-0">
      {hints.map((hint, i) => (
        <span key={i} className="flex items-center gap-1 whitespace-nowrap">
          {hint.keys.map((k, j) => (
            <kbd key={j} className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300 font-mono text-[10px]">
              {k}
            </kbd>
          ))}
          <span>{hint.desc}</span>
        </span>
      ))}
    </div>
  );
}

// ─── Auto-save status indicator ───────────────────────────────────────────────

function SaveStatus({ isDirty, isAutoSaving }: { isDirty: boolean; isAutoSaving: boolean }) {
  if (isAutoSaving) return <span className="text-xs text-gray-400 dark:text-zinc-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Saving…</span>;
  if (!isDirty) return <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1"><Check className="w-3 h-3" />Saved</span>;
  return <span className="text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span>;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EstimateBuilder() {
  const { estimateId } = useParams<{ estimateId: string }>();
  const navigate = useNavigate();
  const id = parseInt(estimateId ?? '0');

  const { data: serverEstimate, isLoading, isError } = useEstimate(id);
  const updateEstimate = useUpdateEstimate();
  const saveVersion = useSaveVersion();
  const createSection = useCreateSection();

  const setEstimate = useEstimateStore((s) => s.setEstimate);
  const estimate = useEstimateStore((s) => s.estimate);
  const isDirty = useEstimateStore((s) => s.isDirty);
  const isAutoSaving = useEstimateStore((s) => s.isAutoSaving);
  const markSaved = useEstimateStore((s) => s.markSaved);
  const setAutoSaving = useEstimateStore((s) => s.setAutoSaving);

  const { showSuccess, showError } = useUIStore();
  const { canUndo, canRedo, undo, redo } = useUndoRedo();

  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>();

  // Load estimate into store on fetch
  useEffect(() => {
    if (serverEstimate) setEstimate(serverEstimate);
  }, [serverEstimate, setEstimate]);

  // Auto-save after 3s of inactivity
  useEffect(() => {
    if (!isDirty || !estimate) return;
    clearTimeout(autoSaveTimer.current);
    setAutoSaving(true);
    autoSaveTimer.current = setTimeout(async () => {
      try {
        await updateEstimate.mutateAsync({ id: estimate.id, sections: estimate.sections } as Parameters<typeof updateEstimate.mutateAsync>[0]);
        markSaved();
      } catch {
        setAutoSaving(false);
      }
    }, 3000);
    return () => clearTimeout(autoSaveTimer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, estimate]);

  const handleManualSave = useCallback(async () => {
    if (!estimate) return;
    try {
      setAutoSaving(true);
      await updateEstimate.mutateAsync({ id: estimate.id, sections: estimate.sections } as Parameters<typeof updateEstimate.mutateAsync>[0]);
      markSaved();
      showSuccess('Estimate saved');
    } catch {
      showError('Failed to save estimate');
      setAutoSaving(false);
    }
  }, [estimate, updateEstimate, markSaved, setAutoSaving, showSuccess, showError]);

  const handleSaveVersion = useCallback(async () => {
    if (!estimate) return;
    try {
      await handleManualSave();
      await saveVersion.mutateAsync(estimate.id);
      showSuccess('Version checkpoint saved');
    } catch {
      showError('Failed to save version');
    }
  }, [estimate, handleManualSave, saveVersion, showSuccess, showError]);

  const handleRenameEstimate = useCallback(async (name: string) => {
    if (!estimate) return;
    try {
      await updateEstimate.mutateAsync({ id: estimate.id, name } as Parameters<typeof updateEstimate.mutateAsync>[0]);
    } catch { /* silent */ }
  }, [estimate, updateEstimate]);

  const handleAddSection = useCallback(async () => {
    if (!estimate) return;
    try {
      await createSection.mutateAsync({
        estimateId: estimate.id,
        name: `Section ${(estimate.sections?.length ?? 0) + 1}`,
        sortOrder: estimate.sections?.length ?? 0,
        color: null,
      } as Parameters<typeof createSection.mutateAsync>[0]);
    } catch {
      showError('Failed to add section');
    }
  }, [estimate, createSection, showError]);

  const handlePctChange = useCallback(
    (field: 'overheadPct' | 'profitPct' | 'taxPct' | 'bondPct', val: number) => {
      useEstimateStore.setState((s) => ({
        estimate: s.estimate ? { ...s.estimate, [field]: val } : null,
        isDirty: true,
      }));
    },
    []
  );

  useKeyboardShortcuts({ onSave: handleManualSave });

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (isError || !estimate) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-500">
        <X className="w-10 h-10 text-red-400" />
        <p className="text-lg font-medium text-gray-700 dark:text-zinc-300">Estimate not found</p>
        <button onClick={() => navigate(-1)} className="text-sm text-orange-500 hover:underline">
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white dark:bg-zinc-950">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 flex-shrink-0">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-sm text-gray-400 flex-shrink-0">
          <Link to="/projects" className="hover:text-orange-500 transition-colors flex items-center gap-1">
            ← Projects
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
        </nav>

        <EstimateName name={estimate.name} onSave={handleRenameEstimate} />

        {/* Estimate tabs */}
        <EstimateTabs projectId={estimate.projectId} activeEstimateId={estimate.id} />

        <div className="flex-1" />

        {/* Auto-save status */}
        <SaveStatus isDirty={isDirty} isAutoSaving={isAutoSaving} />

        {/* Undo / Redo */}
        <div className="flex items-center gap-0.5">
          <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 dark:text-zinc-400 disabled:opacity-30 transition-colors">
            <Undo2 className="w-4 h-4" />
          </button>
          <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)" className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 dark:text-zinc-400 disabled:opacity-30 transition-colors">
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        <div className="w-px h-5 bg-gray-200 dark:bg-zinc-700" />

        {/* Add section */}
        <button
          onClick={handleAddSection}
          disabled={createSection.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-dashed border-gray-300 dark:border-zinc-600 text-gray-500 dark:text-zinc-400 hover:border-orange-400 hover:text-orange-500 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Section
        </button>

        {/* Version history */}
        <button
          onClick={() => setShowVersionHistory(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors"
        >
          <History className="w-4 h-4" />
          Version History
        </button>

        {/* Save version checkpoint */}
        <button
          onClick={handleSaveVersion}
          disabled={saveVersion.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors"
        >
          {saveVersion.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
          Save Version
        </button>

        {/* Export */}
        <ExportDropdown estimateId={estimate.id} />

        {/* Save button */}
        <button
          data-testid="save-estimate-button"
          onClick={handleManualSave}
          disabled={isAutoSaving}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          {isAutoSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : isDirty ? <Save className="w-4 h-4" /> : <Check className="w-4 h-4" />}
          {isAutoSaving ? 'Saving…' : isDirty ? 'Save' : 'Saved'}
        </button>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Grid */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <EstimateGrid estimateId={estimate.id} />
        </div>

        {/* Totals sidebar */}
        <div className="w-80 flex-shrink-0 border-l border-gray-200 dark:border-zinc-700 overflow-y-auto bg-white dark:bg-zinc-900">
          <TotalsPanel onSave={handleManualSave} onPctChange={handlePctChange} />
        </div>
      </div>

      {/* Bottom hint bar */}
      <ShortcutHints />

      {/* Version history drawer */}
      <AnimatePresence>
        {showVersionHistory && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-30 bg-black"
              onClick={() => setShowVersionHistory(false)}
            />
            <VersionHistory
              estimateId={estimate.id}
              onClose={() => setShowVersionHistory(false)}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
