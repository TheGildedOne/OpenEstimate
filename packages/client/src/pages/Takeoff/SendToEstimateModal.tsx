import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { useEstimates, useCreateLineItem } from '@/lib/api';
import { useUIStore } from '@/store/uiStore';
import type { TakeoffMeasurement } from '@openestimate/shared';

interface SendToEstimateModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  measurements: TakeoffMeasurement[];
}

interface MeasurementSelection {
  measurementId: number;
  selected: boolean;
  description: string;
  sectionId: string;
}

function getUnitForType(type: string): string {
  switch (type) {
    case 'linear': return 'LF';
    case 'area': return 'SF';
    case 'count': return 'EA';
    case 'volume': return 'CY';
    default: return 'EA';
  }
}

export function SendToEstimateModal({ isOpen, onClose, projectId, measurements }: SendToEstimateModalProps) {
  const { showSuccess, showError } = useUIStore();
  const [selectedEstimateId, setSelectedEstimateId] = useState<string>('');
  const [selections, setSelections] = useState<Record<number, MeasurementSelection>>(() =>
    Object.fromEntries(
      measurements.map((m) => [
        m.id,
        {
          measurementId: m.id,
          selected: true,
          description: m.label,
          sectionId: '',
        },
      ])
    )
  );
  const [isPushing, setIsPushing] = useState(false);

  const { data: estimates } = useEstimates(projectId);
  const createLineItem = useCreateLineItem();

  // Get sections from selected estimate
  const selectedEstimate = estimates?.find((e) => e.id === Number(selectedEstimateId));

  const handleToggle = (id: number) => {
    setSelections((prev) => ({
      ...prev,
      [id]: { ...prev[id], selected: !prev[id].selected },
    }));
  };

  const handleDescChange = (id: number, value: string) => {
    setSelections((prev) => ({
      ...prev,
      [id]: { ...prev[id], description: value },
    }));
  };

  const handleSectionChange = (id: number, sectionId: string) => {
    setSelections((prev) => ({
      ...prev,
      [id]: { ...prev[id], sectionId },
    }));
  };

  const handlePush = async () => {
    if (!selectedEstimateId) {
      showError('Please select an estimate');
      return;
    }

    const toCreate = measurements.filter((m) => {
      const sel = selections[m.id];
      return sel?.selected && sel?.sectionId;
    });

    if (toCreate.length === 0) {
      showError('Select at least one measurement and assign it to a section');
      return;
    }

    setIsPushing(true);
    try {
      let sortOrder = 9999;
      for (const m of toCreate) {
        const sel = selections[m.id];
        await createLineItem.mutateAsync({
          sectionId: Number(sel.sectionId),
          estimateId: Number(selectedEstimateId),
          description: sel.description || m.label,
          quantity: m.calculatedValue,
          unit: getUnitForType(m.type),
          unitMaterialCost: 0,
          unitLaborCost: 0,
          laborHours: 0,
          laborRate: 0,
          wasteFactorPct: 0,
          sortOrder: sortOrder++,
        });
      }
      showSuccess(`${toCreate.length} measurement(s) sent to estimate`);
      onClose();
    } catch {
      showError('Failed to push measurements to estimate');
    } finally {
      setIsPushing(false);
    }
  };

  const selectedCount = Object.values(selections).filter((s) => s.selected).length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Send Measurements to Estimate"
      size="lg"
    >
      <div className="space-y-4">
        {/* Estimate selector */}
        <div>
          <Select
            label="Target Estimate"
            value={selectedEstimateId}
            onChange={(e) => setSelectedEstimateId(e.target.value)}
          >
            <option value="">Select an estimate…</option>
            {estimates?.map((e) => (
              <option key={e.id} value={String(e.id)}>
                {e.name} {e.isActive ? '(Active)' : ''}
              </option>
            ))}
          </Select>
        </div>

        {/* Measurements list */}
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">
            Measurements ({selectedCount} selected)
          </p>
          <div className="border border-gray-200 dark:border-zinc-700 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-700">
                  <th className="px-3 py-2 text-left text-xs text-gray-500 dark:text-zinc-400 w-8"></th>
                  <th className="px-3 py-2 text-left text-xs text-gray-500 dark:text-zinc-400">Type</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-500 dark:text-zinc-400">Value</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-500 dark:text-zinc-400">Description</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-500 dark:text-zinc-400">Section</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                {measurements.map((m) => {
                  const sel = selections[m.id];
                  return (
                    <tr
                      key={m.id}
                      className={`transition-colors ${sel?.selected ? '' : 'opacity-40'}`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={sel?.selected ?? false}
                          onChange={() => handleToggle(m.id)}
                          className="rounded border-gray-300 dark:border-zinc-600"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <span className="capitalize text-gray-700 dark:text-zinc-300">{m.type}</span>
                      </td>
                      <td className="px-3 py-2 text-gray-700 dark:text-zinc-300 whitespace-nowrap">
                        {m.calculatedValue.toFixed(2)} {m.unit}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={sel?.description ?? ''}
                          onChange={(e) => handleDescChange(m.id, e.target.value)}
                          className="w-full bg-transparent border-b border-gray-300 dark:border-zinc-600 text-sm text-gray-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500"
                          disabled={!sel?.selected}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={sel?.sectionId ?? ''}
                          onChange={(e) => handleSectionChange(m.id, e.target.value)}
                          disabled={!sel?.selected || !selectedEstimateId}
                          className="text-sm bg-transparent border border-gray-300 dark:border-zinc-600 rounded px-1.5 py-0.5 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-40"
                        >
                          <option value="">Select section…</option>
                          {selectedEstimate?.sections?.map((s) => (
                            <option key={s.id} value={String(s.id)}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-zinc-700">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handlePush}
            isLoading={isPushing}
            disabled={selectedCount === 0 || !selectedEstimateId}
          >
            Push {selectedCount} Measurement{selectedCount !== 1 ? 's' : ''} to Estimate
          </Button>
        </div>
      </div>
    </Modal>
  );
}
