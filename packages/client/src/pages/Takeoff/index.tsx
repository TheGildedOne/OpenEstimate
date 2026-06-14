import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  FileText,
  Settings,
  Trash2,
  Plus,
  X,
  Loader2,
  MousePointer2,
  Ruler,
  Square,
  Hash,
  Box,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react';
import {
  useTakeoffSheets,
  useCreateTakeoffSheet,
  useUpdateTakeoffSheet,
  useDeleteTakeoffSheet,
  useUploadDocument,
  useDocuments,
} from '@/lib/api';
import { useUIStore } from '@/store/uiStore';
import TakeoffCanvas from './TakeoffCanvas';
import MeasurementPanel from './MeasurementPanel';
import type { TakeoffMeasurement } from '@openestimate/shared';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tool = 'select' | 'linear' | 'area' | 'count' | 'volume';

interface TakeoffPageProps {
  projectId: number;
}

// ── Sheet Settings Popover ────────────────────────────────────────────────────

interface SheetSettingsProps {
  sheet: any;
  onClose: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
}

function SheetSettings({ sheet, onClose, onDelete, onRename }: SheetSettingsProps) {
  const [name, setName] = useState(sheet.name);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  return (
    <motion.div
      className="absolute left-full ml-2 top-0 z-30 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-xl p-4 w-56"
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -4 }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Sheet Settings</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="mb-3">
        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-2 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
        <button
          onClick={() => { onRename(name); onClose(); }}
          disabled={!name.trim() || name === sheet.name}
          className="mt-2 w-full py-1.5 text-xs bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded transition-colors"
        >
          Save Name
        </button>
      </div>
      {deleteConfirm ? (
        <div className="space-y-2">
          <p className="text-xs text-red-600 dark:text-red-400">Delete this sheet and all measurements?</p>
          <div className="flex gap-2">
            <button
              onClick={onDelete}
              className="flex-1 py-1.5 text-xs bg-red-500 hover:bg-red-600 text-white rounded"
            >
              Delete
            </button>
            <button
              onClick={() => setDeleteConfirm(false)}
              className="flex-1 py-1.5 text-xs border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setDeleteConfirm(true)}
          className="w-full py-1.5 text-xs text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 rounded hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors flex items-center justify-center gap-1"
        >
          <Trash2 className="w-3 h-3" /> Delete Sheet
        </button>
      )}
    </motion.div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────

interface TakeoffEmptyStateProps {
  onUpload: (file: File) => void;
  isUploading: boolean;
}

function TakeoffEmptyState({ onUpload, isUploading }: TakeoffEmptyStateProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const pdf = Array.from(files).find((f) => f.type === 'application/pdf');
    if (pdf) onUpload(pdf);
  };

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-sm">
        <div
          className={`border-2 border-dashed rounded-2xl p-12 mb-4 cursor-pointer transition-all ${
            isDragOver
              ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/20'
              : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'
          }`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragOver(false); handleFiles(e.dataTransfer.files); }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          {isUploading ? (
            <Loader2 className="w-12 h-12 mx-auto text-orange-400 animate-spin mb-3" />
          ) : (
            <FileText className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-700 mb-3" />
          )}
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {isUploading ? 'Uploading PDF...' : 'Upload a PDF blueprint to get started'}
          </p>
          {!isUploading && (
            <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">
              Drop a PDF here or click to browse
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Takeoff Page ─────────────────────────────────────────────────────────

export default function TakeoffPage({ projectId }: TakeoffPageProps) {
  const { showSuccess, showError } = useUIStore();

  const { data: sheets = [], isLoading: sheetsLoading } = useTakeoffSheets(projectId);
  const { data: documents = [] } = useDocuments(projectId);
  const createSheet = useCreateTakeoffSheet();
  const updateSheet = useUpdateTakeoffSheet();
  const deleteSheetMut = useDeleteTakeoffSheet();
  const uploadDocument = useUploadDocument();

  const [activeSheetId, setActiveSheetId] = useState<number | null>(null);
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [measurements, setMeasurements] = useState<TakeoffMeasurement[]>([]);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<number | null>(null);
  const [settingsSheetId, setSettingsSheetId] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const sheetList = sheets as any[];
  const activeSheet = sheetList.find((s: any) => s.id === activeSheetId) ?? sheetList[0] ?? null;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-select first sheet
  React.useEffect(() => {
    if (sheetList.length > 0 && !activeSheetId) {
      setActiveSheetId(sheetList[0].id);
    }
  }, [sheetList, activeSheetId]);

  const handlePdfUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const doc = await uploadDocument.mutateAsync({ projectId, file, label: file.name });
      const sheet = await createSheet.mutateAsync({
        projectId,
        name: file.name.replace(/\.pdf$/i, ''),
        pdfDocumentId: (doc as any).id,
        pageNumber: 1,
        scaleValue: 1,
        scaleUnit: 'ft',
      });
      setActiveSheetId(sheet.id);
      showSuccess('PDF uploaded and sheet created');
    } catch (e) {
      showError((e as Error).message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteSheet = async (sheetId: number) => {
    try {
      await deleteSheetMut.mutateAsync({ id: sheetId, projectId });
      if (activeSheetId === sheetId) {
        const remaining = sheetList.filter((s: any) => s.id !== sheetId);
        setActiveSheetId(remaining[0]?.id ?? null);
      }
      setSettingsSheetId(null);
      showSuccess('Sheet deleted');
    } catch (e) {
      showError((e as Error).message);
    }
  };

  const handleRenameSheet = async (sheetId: number, name: string) => {
    try {
      await updateSheet.mutateAsync({ id: sheetId, name });
    } catch (e) {
      showError((e as Error).message);
    }
  };

  const handleMeasurementCreated = (m: Partial<TakeoffMeasurement>) => {
    setMeasurements((prev) => [...prev, m as TakeoffMeasurement]);
  };

  if (sheetsLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (sheetList.length === 0) {
    return (
      <div className="flex flex-col flex-1 h-full">
        <TakeoffEmptyState onUpload={handlePdfUpload} isUploading={isUploading} />
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden bg-gray-100 dark:bg-gray-950">
      {/* Left panel: sheet list */}
      <div className="w-48 flex-shrink-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Sheets</span>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 px-2 py-1 text-xs text-orange-500 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/20 rounded transition-colors"
          >
            <Upload className="w-3 h-3" /> PDF
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handlePdfUpload(f);
              e.target.value = '';
            }}
          />
        </div>

        <div className="flex-1 overflow-y-auto py-2 space-y-1 px-2">
          <AnimatePresence>
            {sheetList.map((sheet: any) => (
              <motion.div
                key={sheet.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative"
              >
                <button
                  onClick={() => setActiveSheetId(sheet.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    activeSheetId === sheet.id
                      ? 'bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 ring-1 ring-orange-300 dark:ring-orange-700'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                    <span className="truncate">{sheet.name}</span>
                  </div>
                  {sheet.pageNumber && (
                    <span className="ml-5 text-[10px] text-gray-400 dark:text-gray-600">
                      p.{sheet.pageNumber}
                    </span>
                  )}
                </button>

                {/* Settings button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSettingsSheetId(settingsSheetId === sheet.id ? null : sheet.id);
                  }}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-1 opacity-0 group-hover:opacity-100 hover:opacity-100 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded transition-all"
                  style={{ opacity: settingsSheetId === sheet.id ? 1 : undefined }}
                >
                  <Settings className="w-3 h-3" />
                </button>

                {/* Sheet settings popover */}
                <AnimatePresence>
                  {settingsSheetId === sheet.id && (
                    <SheetSettings
                      sheet={sheet}
                      onClose={() => setSettingsSheetId(null)}
                      onDelete={() => handleDeleteSheet(sheet.id)}
                      onRename={(name) => handleRenameSheet(sheet.id, name)}
                    />
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Center: canvas */}
      <div className="flex-1 min-w-0 flex flex-col">
        <TakeoffCanvas projectId={projectId} sheetId={activeSheetId ?? undefined} />
      </div>

      {/* Right panel: measurements */}
      <div className="w-72 flex-shrink-0">
        <MeasurementPanel
          measurements={measurements}
          selectedId={selectedMeasurementId}
          onSelect={setSelectedMeasurementId}
          onDelete={(id) => setMeasurements((prev) => prev.filter((m) => m.id !== id))}
          onSendToEstimate={(items) => {
            showSuccess(`${items.length} measurement(s) queued for estimate`);
          }}
        />
      </div>
    </div>
  );
}
