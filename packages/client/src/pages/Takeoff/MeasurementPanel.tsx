import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Ruler,
  Square,
  Hash,
  Box,
  ChevronDown,
  ChevronRight,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import type { TakeoffMeasurement, MeasurementType } from '@openestimate/shared';

const TYPE_ICONS: Record<MeasurementType, React.ReactNode> = {
  linear: <Ruler className="w-4 h-4" />,
  area: <Square className="w-4 h-4" />,
  count: <Hash className="w-4 h-4" />,
  volume: <Box className="w-4 h-4" />,
};

const TYPE_LABELS: Record<MeasurementType, string> = {
  linear: 'Linear',
  area: 'Area',
  count: 'Count',
  volume: 'Volume',
};

const TYPE_UNIT: Record<MeasurementType, string> = {
  linear: 'LF',
  area: 'SF',
  count: 'EA',
  volume: 'CY',
};

interface SendToEstimateModalProps {
  measurements: TakeoffMeasurement[];
  onClose: () => void;
  onSend: (items: Array<{ measurementId: number; estimateId: number; description: string }>) => void;
}

function SendToEstimateModal({ measurements, onClose, onSend }: SendToEstimateModalProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set(measurements.map((m) => m.id)));
  const [estimateId, setEstimateId] = useState('');
  const [descriptions, setDescriptions] = useState<Record<number, string>>(
    Object.fromEntries(measurements.map((m) => [m.id, m.label]))
  );

  const handleSend = () => {
    const items = measurements
      .filter((m) => selected.has(m.id))
      .map((m) => ({
        measurementId: m.id,
        estimateId: parseInt(estimateId) || 0,
        description: descriptions[m.id] ?? m.label,
      }));
    onSend(items);
    onClose();
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Send className="w-4 h-4 text-orange-500" />
            Send to Estimate
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
              Estimate ID
            </label>
            <input
              type="number"
              value={estimateId}
              onChange={(e) => setEstimateId(e.target.value)}
              placeholder="Enter estimate ID"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Select measurements to send:</p>
            {measurements.map((m) => (
              <div key={m.id} className="flex items-center gap-3 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
                <input
                  type="checkbox"
                  checked={selected.has(m.id)}
                  onChange={() => {
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(m.id)) next.delete(m.id);
                      else next.add(m.id);
                      return next;
                    });
                  }}
                  className="w-4 h-4 accent-orange-500"
                />
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={descriptions[m.id] ?? m.label}
                    onChange={(e) => setDescriptions((d) => ({ ...d, [m.id]: e.target.value }))}
                    className="w-full text-sm bg-transparent text-gray-900 dark:text-white focus:outline-none border-b border-transparent focus:border-orange-400"
                  />
                  <span className="text-xs text-gray-400">
                    {m.calculatedValue.toFixed(2)} {m.unit}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={selected.size === 0 || !estimateId}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            Send {selected.size} Measurement{selected.size !== 1 ? 's' : ''}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

interface MeasurementPanelProps {
  measurements: TakeoffMeasurement[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
  onSendToEstimate: (items: Array<{ measurementId: number; estimateId: number; description: string }>) => void;
}

export default function MeasurementPanel({
  measurements,
  selectedId,
  onSelect,
  onDelete,
  onSendToEstimate,
}: MeasurementPanelProps) {
  const [collapsedTypes, setCollapsedTypes] = useState<Set<MeasurementType>>(new Set());
  const [showSendModal, setShowSendModal] = useState(false);

  const grouped = (['linear', 'area', 'count', 'volume'] as MeasurementType[]).reduce(
    (acc, type) => {
      acc[type] = measurements.filter((m) => m.type === type);
      return acc;
    },
    {} as Record<MeasurementType, TakeoffMeasurement[]>
  );

  const totals = {
    linearLF: grouped.linear.reduce((s, m) => s + m.calculatedValue, 0),
    areaSF: grouped.area.reduce((s, m) => s + m.calculatedValue, 0),
    countEA: grouped.count.reduce((s, m) => s + m.calculatedValue, 0),
    volumeCY: grouped.volume.reduce((s, m) => s + m.calculatedValue, 0),
  };

  const toggleType = (type: MeasurementType) => {
    setCollapsedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Measurements</h2>
        {measurements.length > 0 && (
          <button
            onClick={() => setShowSendModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            Send to Estimate
          </button>
        )}
      </div>

      {/* Measurement groups */}
      <div className="flex-1 overflow-y-auto">
        {measurements.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <Ruler className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-xs text-center">No measurements yet.<br />Use the tools to draw on the PDF.</p>
          </div>
        ) : (
          (['linear', 'area', 'count', 'volume'] as MeasurementType[]).map((type) => {
            const group = grouped[type];
            if (group.length === 0) return null;
            const collapsed = collapsedTypes.has(type);

            return (
              <div key={type} className="border-b border-gray-100 dark:border-gray-800">
                {/* Group header */}
                <button
                  onClick={() => toggleType(type)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <span className="text-gray-500 dark:text-gray-400">{TYPE_ICONS[type]}</span>
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide flex-1 text-left">
                    {TYPE_LABELS[type]}
                  </span>
                  <span className="text-xs text-gray-400 font-mono">{group.length}</span>
                  {collapsed ? <ChevronRight className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                </button>

                {/* Group items */}
                <AnimatePresence initial={false}>
                  {!collapsed && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: 'auto' }}
                      exit={{ height: 0 }}
                      className="overflow-hidden"
                    >
                      {group.map((m) => (
                        <div
                          key={m.id}
                          onClick={() => onSelect(m.id)}
                          className={`group flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors border-b border-gray-50 dark:border-gray-800/50 ${
                            selectedId === m.id
                              ? 'bg-orange-50 dark:bg-orange-900/20'
                              : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'
                          }`}
                        >
                          {/* Color swatch */}
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0 border border-white/50 shadow-sm"
                            style={{ backgroundColor: m.color }}
                          />

                          {/* Label & value */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                              {m.label}
                            </p>
                            <p className="text-xs text-gray-400 font-mono">
                              {m.calculatedValue.toFixed(2)} {m.unit}
                            </p>
                          </div>

                          {/* Delete */}
                          <button
                            onClick={(e) => { e.stopPropagation(); onDelete(m.id); }}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-400 transition-opacity"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>

      {/* Summary totals */}
      <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3 flex-shrink-0 bg-gray-50 dark:bg-gray-800/50">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Totals</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {[
            { label: 'Linear', value: totals.linearLF, unit: 'LF' },
            { label: 'Area', value: totals.areaSF, unit: 'SF' },
            { label: 'Count', value: totals.countEA, unit: 'EA' },
            { label: 'Volume', value: totals.volumeCY, unit: 'CY' },
          ].map(({ label, value, unit }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-xs text-gray-400">{label}</span>
              <span className="text-xs font-mono font-medium text-gray-700 dark:text-gray-300">
                {value.toFixed(2)} {unit}
              </span>
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {showSendModal && (
          <SendToEstimateModal
            measurements={measurements}
            onClose={() => setShowSendModal(false)}
            onSend={onSendToEstimate}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
