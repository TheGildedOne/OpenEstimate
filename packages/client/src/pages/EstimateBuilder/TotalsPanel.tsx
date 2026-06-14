import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, Clock, ChevronDown, ChevronUp, HardHat } from 'lucide-react';
import {
  calculateSectionTotals,
  calculateEstimateTotals,
  formatCurrency,
} from '@/lib/estimateCalc';
import { useEstimateStore } from '@/store/estimateStore';

interface TotalRowProps {
  label: string;
  value: number;
  bold?: boolean;
  large?: boolean;
  accent?: boolean;
  pct?: number;
  onPctChange?: (val: number) => void;
  pctMin?: number;
  pctMax?: number;
  showSlider?: boolean;
}

function TotalRow({
  label,
  value,
  bold,
  large,
  accent,
  pct,
  onPctChange,
  pctMin = 0,
  pctMax = 50,
  showSlider = false,
}: TotalRowProps) {
  return (
    <div className={`py-2 ${large ? 'py-3' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span
            className={`text-sm truncate ${
              bold || large
                ? 'font-semibold text-gray-900 dark:text-white'
                : 'text-gray-600 dark:text-gray-400'
            } ${large ? 'text-base' : ''} ${accent ? 'text-orange-600 dark:text-orange-400' : ''}`}
          >
            {label}
          </span>
          {pct !== undefined && onPctChange && (
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={pct}
                min={pctMin}
                max={pctMax}
                step={0.1}
                onChange={(e) => onPctChange(parseFloat(e.target.value) || 0)}
                className="w-14 px-1.5 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
              <span className="text-xs text-gray-400">%</span>
            </div>
          )}
        </div>
        <span
          className={`font-mono text-sm whitespace-nowrap ${
            bold || large ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'
          } ${large ? 'text-xl font-bold text-orange-600 dark:text-orange-400' : ''}`}
        >
          {formatCurrency(value)}
        </span>
      </div>
      {pct !== undefined && onPctChange && showSlider && (
        <input
          type="range"
          min={pctMin}
          max={pctMax}
          step={0.5}
          value={pct}
          onChange={(e) => onPctChange(parseFloat(e.target.value))}
          className="w-full h-1.5 mt-1.5 accent-orange-500 cursor-pointer"
        />
      )}
    </div>
  );
}

interface TotalsPanelProps {
  onSave: () => void;
  onPctChange: (field: 'overheadPct' | 'profitPct' | 'taxPct' | 'bondPct', val: number) => void;
}

export default function TotalsPanel({ onSave, onPctChange }: TotalsPanelProps) {
  const estimate = useEstimateStore((s) => s.estimate);
  const isDirty = useEstimateStore((s) => s.isDirty);
  const isAutoSaving = useEstimateStore((s) => s.isAutoSaving);
  const [expanded, setExpanded] = useState(true);

  const totals = useMemo(() => {
    if (!estimate) return null;
    const sections = estimate.sections ?? [];
    let subtotalMaterial = 0;
    let subtotalLabor = 0;
    let totalLaborHours = 0;

    for (const section of sections) {
      const st = calculateSectionTotals(section.lineItems ?? []);
      subtotalMaterial += st.subtotalMaterial;
      subtotalLabor += st.subtotalLabor;
      for (const item of section.lineItems ?? []) {
        totalLaborHours += (item.laborHours ?? 0) * (item.quantity ?? 0);
      }
    }

    const subtotal = subtotalMaterial + subtotalLabor;
    const est = calculateEstimateTotals(
      subtotal,
      estimate.overheadPct,
      estimate.profitPct,
      estimate.taxPct,
      estimate.bondPct
    );

    return { ...est, subtotalMaterial, subtotalLabor, totalLaborHours };
  }, [estimate]);

  if (!estimate) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="w-72 flex-shrink-0 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 flex flex-col h-full"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Estimate Summary</h2>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <AnimatePresence initial={false}>
          {expanded && totals && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="px-4 divide-y divide-gray-100 dark:divide-gray-800"
            >
              {/* Material & Labor subtotals */}
              <div className="py-3 space-y-1">
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-500">
                  <span>Materials</span>
                  <span className="font-mono">{formatCurrency(totals.subtotalMaterial)}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-500">
                  <span>Labor</span>
                  <span className="font-mono">{formatCurrency(totals.subtotalLabor)}</span>
                </div>
              </div>

              {/* Main totals */}
              <div className="space-y-0.5">
                <TotalRow label="Subtotal" value={totals.subtotal} bold />
                <TotalRow
                  label="Overhead"
                  value={totals.overheadAmt}
                  pct={estimate.overheadPct}
                  onPctChange={(v) => onPctChange('overheadPct', v)}
                  pctMax={50}
                  showSlider
                />
                <TotalRow
                  label="Profit"
                  value={totals.profitAmt}
                  pct={estimate.profitPct}
                  onPctChange={(v) => onPctChange('profitPct', v)}
                  pctMax={50}
                  showSlider
                />
                <TotalRow
                  label="Tax"
                  value={totals.taxAmt}
                  pct={estimate.taxPct}
                  onPctChange={(v) => onPctChange('taxPct', v)}
                  pctMax={20}
                />
                <TotalRow
                  label="Bond"
                  value={totals.bondAmt}
                  pct={estimate.bondPct}
                  onPctChange={(v) => onPctChange('bondPct', v)}
                  pctMax={10}
                />
              </div>

              {/* Grand total */}
              <div>
                <motion.div
                  key={totals.grandTotal}
                  initial={{ scale: 1.03 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.15 }}
                >
                  <TotalRow label="GRAND TOTAL" value={totals.grandTotal} bold large accent />
                </motion.div>
              </div>

              {/* Labor hours */}
              <div className="py-3">
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <HardHat className="w-4 h-4 text-orange-500" />
                  <span>Total Labor Hours</span>
                  <span className="ml-auto font-mono font-medium text-gray-900 dark:text-white">
                    {totals.totalLaborHours.toFixed(1)} hrs
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Save button */}
      <div className="px-4 py-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
        {/* Auto-save status */}
        <div className="flex items-center gap-1.5 text-xs">
          {isAutoSaving ? (
            <>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              >
                <Clock className="w-3.5 h-3.5 text-orange-500" />
              </motion.div>
              <span className="text-orange-500">Auto-saving…</span>
            </>
          ) : isDirty ? (
            <>
              <div className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-amber-600 dark:text-amber-400">Unsaved changes</span>
            </>
          ) : (
            <>
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-green-600 dark:text-green-400">All changes saved</span>
            </>
          )}
        </div>

        <button
          onClick={onSave}
          disabled={!isDirty || isAutoSaving}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
        >
          <Save className="w-4 h-4" />
          Save Changes
        </button>
      </div>
    </motion.div>
  );
}
