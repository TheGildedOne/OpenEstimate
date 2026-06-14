import React, { useMemo, useState } from 'react';
import { X, ChevronDown, ChevronRight, Plus, Minus, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { EstimateSection, EstimateLineItem } from '@openestimate/shared';
import { formatCurrency } from '@/lib/estimateCalc';
import { Button } from '@/components/ui/Button';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VersionSnapshot {
  sections: EstimateSection[];
  lineItems?: EstimateLineItem[];
}

interface EstimateVersion {
  versionNumber: number;
  savedAt: string;
  savedByName?: string;
  snapshot: VersionSnapshot;
}

interface VersionDiffProps {
  versionA: EstimateVersion;
  versionB: EstimateVersion;
  onClose: () => void;
}

type DiffStatus = 'added' | 'removed' | 'changed' | 'unchanged';

interface DiffItem {
  id: number;
  description: string;
  status: DiffStatus;
  aItem?: EstimateLineItem;
  bItem?: EstimateLineItem;
  changedFields?: string[];
}

interface DiffSection {
  id: number;
  name: string;
  status: DiffStatus;
  items: DiffItem[];
}

// ─── Diff computation ─────────────────────────────────────────────────────────

const NUMERIC_FIELDS: (keyof EstimateLineItem)[] = [
  'quantity', 'unitMaterialCost', 'unitLaborCost', 'laborHours', 'laborRate', 'wasteFactorPct',
];

function getChangedFields(a: EstimateLineItem, b: EstimateLineItem): string[] {
  const fields: string[] = [];
  if (a.description !== b.description) fields.push('description');
  if (a.unit !== b.unit) fields.push('unit');
  for (const f of NUMERIC_FIELDS) {
    if ((a[f] ?? 0) !== (b[f] ?? 0)) fields.push(f);
  }
  if (a.notes !== b.notes) fields.push('notes');
  return fields;
}

function extractItems(snapshot: VersionSnapshot): EstimateLineItem[] {
  const items: EstimateLineItem[] = snapshot.lineItems ?? [];
  if (items.length === 0) {
    for (const s of snapshot.sections ?? []) {
      items.push(...(s.lineItems ?? []));
    }
  }
  return items;
}

function computeDiff(a: VersionSnapshot, b: VersionSnapshot): DiffSection[] {
  const aItems = extractItems(a);
  const bItems = extractItems(b);
  const aById = new Map(aItems.map((i) => [i.id, i]));
  const bById = new Map(bItems.map((i) => [i.id, i]));

  const aSections = a.sections ?? [];
  const bSections = b.sections ?? [];
  const aSectionMap = new Map(aSections.map((s) => [s.id, s]));
  const bSectionMap = new Map(bSections.map((s) => [s.id, s]));
  const allSectionIds = new Set([...aSectionMap.keys(), ...bSectionMap.keys()]);

  const result: DiffSection[] = [];

  for (const sectionId of allSectionIds) {
    const aSection = aSectionMap.get(sectionId);
    const bSection = bSectionMap.get(sectionId);
    const sectionStatus: DiffStatus = !aSection ? 'added' : !bSection ? 'removed' : 'unchanged';
    const currentSection = bSection ?? aSection!;

    const sectionAItems = aItems.filter((i) => i.sectionId === sectionId);
    const sectionBItems = bItems.filter((i) => i.sectionId === sectionId);
    const allItemIds = new Set([...sectionAItems.map((i) => i.id), ...sectionBItems.map((i) => i.id)]);

    const items: DiffItem[] = [];
    for (const itemId of allItemIds) {
      const aItem = aById.get(itemId);
      const bItem = bById.get(itemId);
      let status: DiffStatus;
      let changedFields: string[] | undefined;

      if (!aItem) { status = 'added'; }
      else if (!bItem) { status = 'removed'; }
      else {
        changedFields = getChangedFields(aItem, bItem);
        status = changedFields.length > 0 ? 'changed' : 'unchanged';
      }

      items.push({
        id: itemId,
        description: (bItem ?? aItem)?.description ?? '(no description)',
        status,
        aItem,
        bItem,
        changedFields,
      });
    }

    result.push({
      id: sectionId,
      name: currentSection.name,
      status: sectionStatus,
      items,
    });
  }

  return result;
}

// ─── Field label map ──────────────────────────────────────────────────────────

const FIELD_LABELS: Partial<Record<string, string>> = {
  description: 'Description',
  quantity: 'Qty',
  unit: 'Unit',
  unitMaterialCost: 'Unit Mat',
  unitLaborCost: 'Unit Lab',
  laborHours: 'Labor Hrs',
  laborRate: 'Labor Rate',
  wasteFactorPct: 'Waste %',
  notes: 'Notes',
};

const CURRENCY_FIELDS = new Set(['unitMaterialCost', 'unitLaborCost', 'laborRate']);

function fmtField(key: string, value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (CURRENCY_FIELDS.has(key)) return formatCurrency(Number(value));
  if (key === 'wasteFactorPct') return `${value}%`;
  return String(value);
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: DiffStatus }) {
  const cfg = {
    added: { label: 'Added', cls: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400', icon: <Plus className="w-3 h-3" /> },
    removed: { label: 'Removed', cls: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400', icon: <Minus className="w-3 h-3" /> },
    changed: { label: 'Changed', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400', icon: <AlertCircle className="w-3 h-3" /> },
    unchanged: { label: 'Unchanged', cls: 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400', icon: null },
  } as const;

  const { label, cls, icon } = cfg[status];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${cls}`}>
      {icon}{label}
    </span>
  );
}

// ─── Item diff row ────────────────────────────────────────────────────────────

function ItemDiffRow({ diff }: { diff: DiffItem }) {
  const [expanded, setExpanded] = useState(diff.status === 'changed');

  const rowBg = {
    added: 'bg-green-50/60 dark:bg-green-950/20 border-l-2 border-green-500',
    removed: 'bg-red-50/60 dark:bg-red-950/20 border-l-2 border-red-500',
    changed: 'bg-amber-50/60 dark:bg-amber-950/20 border-l-2 border-amber-500',
    unchanged: '',
  }[diff.status];

  return (
    <div className={`mb-0.5 rounded ${rowBg}`}>
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
        onClick={() => diff.status === 'changed' && setExpanded((v) => !v)}
      >
        {diff.status === 'changed' && (
          <span className="text-gray-400">{expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}</span>
        )}
        <span className="flex-1 text-sm text-gray-800 dark:text-zinc-200 truncate">{diff.description}</span>
        <StatusBadge status={diff.status} />
        {diff.bItem && (
          <span className="text-xs font-mono text-gray-500 dark:text-zinc-400 ml-2">
            {formatCurrency(
              (diff.bItem.quantity ?? 0) * ((diff.bItem.unitMaterialCost ?? 0) + (diff.bItem.unitLaborCost ?? 0))
            )}
          </span>
        )}
      </div>
      <AnimatePresence>
        {expanded && diff.changedFields && diff.changedFields.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400 dark:text-zinc-500">
                    <th className="text-left py-1 w-32">Field</th>
                    <th className="text-left py-1">Before</th>
                    <th className="text-left py-1">After</th>
                  </tr>
                </thead>
                <tbody>
                  {diff.changedFields.map((field) => (
                    <tr key={field} className="border-t border-gray-100 dark:border-zinc-800">
                      <td className="py-1 font-medium text-gray-600 dark:text-zinc-400">{FIELD_LABELS[field] ?? field}</td>
                      <td className="py-1 text-red-600 dark:text-red-400 line-through">
                        {fmtField(field, (diff.aItem as Record<string, unknown>)?.[field])}
                      </td>
                      <td className="py-1 text-green-600 dark:text-green-400 font-medium">
                        {fmtField(field, (diff.bItem as Record<string, unknown>)?.[field])}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main VersionDiff ─────────────────────────────────────────────────────────

export default function VersionDiff({ versionA, versionB, onClose }: VersionDiffProps) {
  const [showAll, setShowAll] = useState(false);

  const diff = useMemo(() => computeDiff(versionA.snapshot, versionB.snapshot), [versionA, versionB]);

  const changedSections = diff.filter((s) => s.status !== 'unchanged' || s.items.some((i) => i.status !== 'unchanged'));
  const displaySections = showAll ? diff : changedSections;

  const stats = useMemo(() => {
    const allItems = diff.flatMap((s) => s.items);
    return {
      added: allItems.filter((i) => i.status === 'added').length,
      removed: allItems.filter((i) => i.status === 'removed').length,
      changed: allItems.filter((i) => i.status === 'changed').length,
    };
  }, [diff]);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-950">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-200 dark:border-zinc-700 flex-shrink-0">
        <div className="flex-1">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Version Comparison</h2>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-0.5">
            v{versionA.versionNumber} → v{versionB.versionNumber}
          </p>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
            <Plus className="w-3 h-3" />{stats.added} added
          </span>
          <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
            <Minus className="w-3 h-3" />{stats.removed} removed
          </span>
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <AlertCircle className="w-3 h-3" />{stats.changed} changed
          </span>
        </div>

        <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-zinc-400 cursor-pointer">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="rounded accent-orange-500" />
          Show all
        </label>

        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Version labels */}
      <div className="grid grid-cols-2 gap-px bg-gray-200 dark:bg-zinc-700 flex-shrink-0">
        {[versionA, versionB].map((v, i) => (
          <div key={i} className="bg-gray-50 dark:bg-zinc-800 px-4 py-2">
            <span className="text-xs font-semibold text-gray-700 dark:text-zinc-300">
              Version {v.versionNumber}
            </span>
            <span className="text-xs text-gray-400 dark:text-zinc-500 ml-2">
              {new Date(v.savedAt).toLocaleString()}
              {v.savedByName && ` · ${v.savedByName}`}
            </span>
          </div>
        ))}
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {displaySections.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-zinc-500">
            <Check className="w-10 h-10 mb-3 text-green-400" />
            <p className="text-sm font-medium">No differences found</p>
            <p className="text-xs mt-1">These two versions are identical</p>
          </div>
        ) : (
          displaySections.map((section) => {
            const hasChanges = section.status !== 'unchanged' || section.items.some((i) => i.status !== 'unchanged');
            if (!hasChanges && !showAll) return null;

            return (
              <div key={section.id} className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-zinc-200">{section.name}</h3>
                  {section.status !== 'unchanged' && <StatusBadge status={section.status} />}
                </div>
                <div>
                  {section.items
                    .filter((i) => showAll || i.status !== 'unchanged')
                    .map((item) => (
                      <ItemDiffRow key={item.id} diff={item} />
                    ))}
                  {section.items.every((i) => i.status === 'unchanged') && (
                    <p className="text-xs text-gray-400 dark:text-zinc-500 px-3 py-1">No changes in this section</p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// Needed for the Check icon referenced above
function Check({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
