import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Clock, RotateCcw, Eye, GitCompare, User, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { useVersions, useRestoreVersion } from '@/lib/api';
import { useUIStore } from '@/store/uiStore';
import type { EstimateVersion, Estimate, EstimateLineItem } from '@openestimate/shared';

interface VersionHistoryProps {
  estimateId: number;
  onClose: () => void;
}

interface DiffSummary {
  added: number;
  removed: number;
  changed: number;
}

function computeDiff(a: Estimate | null, b: Estimate | null): DiffSummary {
  if (!a || !b) return { added: 0, removed: 0, changed: 0 };

  const aItems = new Map<number, EstimateLineItem>();
  const bItems = new Map<number, EstimateLineItem>();

  for (const s of a.sections ?? []) {
    for (const item of s.lineItems ?? []) aItems.set(item.id, item);
  }
  for (const s of b.sections ?? []) {
    for (const item of s.lineItems ?? []) bItems.set(item.id, item);
  }

  let added = 0, removed = 0, changed = 0;

  for (const [id, item] of bItems) {
    if (!aItems.has(id)) {
      added++;
    } else {
      const prev = aItems.get(id)!;
      if (
        prev.description !== item.description ||
        prev.quantity !== item.quantity ||
        prev.unitMaterialCost !== item.unitMaterialCost ||
        prev.unitLaborCost !== item.unitLaborCost
      ) {
        changed++;
      }
    }
  }

  for (const id of aItems.keys()) {
    if (!bItems.has(id)) removed++;
  }

  return { added, removed, changed };
}

function parseSnapshot(v: EstimateVersion): Estimate | null {
  try {
    return JSON.parse(v.snapshotJson) as Estimate;
  } catch {
    return null;
  }
}

interface VersionRowProps {
  version: EstimateVersion;
  isSelected: boolean;
  isCompareBase: boolean;
  diff: DiffSummary | null;
  onSelect: () => void;
  onSetCompareBase: () => void;
  onRestore: () => void;
  onPreview: () => void;
  isRestoring: boolean;
}

function VersionRow({
  version,
  isSelected,
  isCompareBase,
  diff,
  onSelect,
  onSetCompareBase,
  onRestore,
  onPreview,
  isRestoring,
}: VersionRowProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`group px-4 py-3 border-b border-gray-100 dark:border-gray-800 cursor-pointer transition-colors ${
        isSelected
          ? 'bg-orange-50 dark:bg-orange-900/20'
          : isCompareBase
          ? 'bg-blue-50 dark:bg-blue-900/20'
          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
              isCompareBase
                ? 'bg-blue-500 text-white'
                : isSelected
                ? 'bg-orange-500 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            }`}
          >
            v{version.versionNumber}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              Version {version.versionNumber}
            </span>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => { e.stopPropagation(); onPreview(); }}
                className="p-1 rounded text-gray-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/30"
                title="Preview"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onSetCompareBase(); }}
                className="p-1 rounded text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                title="Compare with this version"
              >
                <GitCompare className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onRestore(); }}
                disabled={isRestoring}
                className="p-1 rounded text-gray-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/30 disabled:opacity-50"
                title="Restore this version"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 dark:text-gray-500">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {format(new Date(version.savedAt), 'MMM d, yyyy h:mm a')}
            </span>
            {version.savedByName && (
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" />
                {version.savedByName}
              </span>
            )}
          </div>
          {diff && (
            <div className="flex items-center gap-2 mt-1.5">
              {diff.added > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                  +{diff.added} added
                </span>
              )}
              {diff.removed > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                  -{diff.removed} removed
                </span>
              )}
              {diff.changed > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400">
                  ~{diff.changed} changed
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

interface PreviewModalProps {
  version: EstimateVersion | null;
  onClose: () => void;
}

function PreviewModal({ version, onClose }: PreviewModalProps) {
  if (!version) return null;
  const estimate = parseSnapshot(version);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Preview — Version {version.versionNumber}
            </h3>
            <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            {!estimate ? (
              <p className="text-gray-500 text-sm">Unable to parse snapshot.</p>
            ) : (
              <div className="space-y-6">
                {(estimate.sections ?? []).map((section) => (
                  <div key={section.id}>
                    <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2 flex items-center gap-2">
                      {section.color && (
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: section.color }}
                        />
                      )}
                      {section.name}
                    </h4>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
                          <th className="pb-1 font-medium">Description</th>
                          <th className="pb-1 font-medium text-right">Qty</th>
                          <th className="pb-1 font-medium">Unit</th>
                          <th className="pb-1 font-medium text-right">Mat $</th>
                          <th className="pb-1 font-medium text-right">Labor $</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(section.lineItems ?? []).map((item) => (
                          <tr key={item.id} className="border-b border-gray-100 dark:border-gray-800">
                            <td className="py-1 text-gray-700 dark:text-gray-300">{item.description}</td>
                            <td className="py-1 text-right text-gray-600 dark:text-gray-400">{item.quantity}</td>
                            <td className="py-1 text-gray-500">{item.unit}</td>
                            <td className="py-1 text-right text-gray-600 dark:text-gray-400">
                              ${item.unitMaterialCost?.toFixed(2)}
                            </td>
                            <td className="py-1 text-right text-gray-600 dark:text-gray-400">
                              ${item.unitLaborCost?.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default function VersionHistory({ estimateId, onClose }: VersionHistoryProps) {
  const { data: versions = [], isLoading } = useVersions(estimateId);
  const restoreVersion = useRestoreVersion();
  const { showSuccess, showError } = useUIStore();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [compareBaseId, setCompareBaseId] = useState<number | null>(null);
  const [confirmRestoreId, setConfirmRestoreId] = useState<number | null>(null);
  const [previewVersion, setPreviewVersion] = useState<EstimateVersion | null>(null);

  const handleRestore = async (versionId: number) => {
    try {
      await restoreVersion.mutateAsync({ estimateId, versionId });
      showSuccess('Version restored successfully');
      setConfirmRestoreId(null);
      onClose();
    } catch {
      showError('Failed to restore version');
    }
  };

  const getCompareBase = () => versions.find((v) => v.id === compareBaseId) ?? null;
  const getSelected = () => versions.find((v) => v.id === selectedId) ?? null;

  const getDiff = (version: EstimateVersion): DiffSummary | null => {
    const base = getCompareBase();
    if (!base || base.id === version.id) return null;
    return computeDiff(parseSnapshot(base), parseSnapshot(version));
  };

  return (
    <>
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed right-0 top-0 bottom-0 w-96 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-2xl z-40 flex flex-col"
      >
        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-orange-500" />
            Version History
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Compare hint */}
        {compareBaseId && (
          <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-400 flex items-center gap-2">
            <GitCompare className="w-3.5 h-3.5" />
            Comparing against v{versions.find((v) => v.id === compareBaseId)?.versionNumber}
            <button
              onClick={() => setCompareBaseId(null)}
              className="ml-auto underline hover:no-underline"
            >
              Clear
            </button>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
              ))}
            </div>
          ) : versions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <Clock className="w-10 h-10 mb-2 opacity-40" />
              <p className="text-sm">No saved versions yet</p>
              <p className="text-xs mt-1">Save a version to track your history</p>
            </div>
          ) : (
            <div>
              {versions.map((version) => (
                <VersionRow
                  key={version.id}
                  version={version}
                  isSelected={selectedId === version.id}
                  isCompareBase={compareBaseId === version.id}
                  diff={getDiff(version)}
                  onSelect={() => setSelectedId(version.id === selectedId ? null : version.id)}
                  onSetCompareBase={() =>
                    setCompareBaseId(version.id === compareBaseId ? null : version.id)
                  }
                  onPreview={() => setPreviewVersion(version)}
                  onRestore={() => setConfirmRestoreId(version.id)}
                  isRestoring={restoreVersion.isPending}
                />
              ))}
            </div>
          )}
        </div>

        {/* Confirm restore */}
        <AnimatePresence>
          {confirmRestoreId && (
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              className="border-t border-gray-200 dark:border-gray-700 p-4 bg-amber-50 dark:bg-amber-900/20"
            >
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-1">
                Restore version {versions.find((v) => v.id === confirmRestoreId)?.versionNumber}?
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mb-3">
                Current unsaved changes will be lost.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleRestore(confirmRestoreId)}
                  disabled={restoreVersion.isPending}
                  className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
                >
                  {restoreVersion.isPending ? 'Restoring…' : 'Restore'}
                </button>
                <button
                  onClick={() => setConfirmRestoreId(null)}
                  className="flex-1 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <PreviewModal
        version={previewVersion}
        onClose={() => setPreviewVersion(null)}
      />
    </>
  );
}
