import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import {
  X,
  Save,
  Trash2,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { format } from 'date-fns';
import { useCostItem, useUpdateCostItem, useDeleteCostItem } from '@/lib/api';
import { useUIStore } from '@/store/uiStore';
import type { CostItem } from '@openestimate/shared';

// Use a custom inline price history hook since we might not have it in api.ts
async function fetchPriceHistory(id: number) {
  const res = await fetch(`/api/cost-db/items/${id}/history`, { credentials: 'include' });
  if (!res.ok) return [];
  const data = await res.json();
  return data.data ?? data;
}

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  unit: z.string().min(1, 'Unit is required'),
  defaultMaterialCost: z.number().min(0),
  defaultLaborCost: z.number().min(0),
  defaultLaborHours: z.number().min(0),
  source: z.string().optional(),
  notes: z.string().optional(),
  categoryId: z.number().optional(),
});

type FormData = z.infer<typeof schema>;

interface ItemDetailProps {
  itemId: number;
  onClose: () => void;
  onDeleted: () => void;
}

export default function ItemDetail({ itemId, onClose, onDeleted }: ItemDetailProps) {
  const { data: item, isLoading } = useCostItem(itemId);
  const updateItem = useUpdateCostItem();
  const deleteItem = useDeleteCostItem();
  const { showSuccess, showError } = useUIStore();

  const [priceHistory, setPriceHistory] = React.useState<
    Array<{ date: string; material: number; labor: number }>
  >([]);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (item) {
      reset({
        name: item.name,
        description: item.description ?? '',
        unit: item.unit,
        defaultMaterialCost: item.defaultMaterialCost,
        defaultLaborCost: item.defaultLaborCost,
        defaultLaborHours: item.defaultLaborHours,
        source: item.source ?? '',
        notes: item.notes ?? '',
        categoryId: item.categoryId,
      });
      fetchPriceHistory(itemId).then((history) => {
        setPriceHistory(
          history.map((h: { recordedAt: string; materialCost: number; laborCost: number }) => ({
            date: format(new Date(h.recordedAt), 'MMM d, yy'),
            material: h.materialCost,
            labor: h.laborCost,
          }))
        );
      });
    }
  }, [item, itemId, reset]);

  const onSubmit = async (data: FormData) => {
    try {
      await updateItem.mutateAsync({ id: itemId, ...data });
      showSuccess('Item updated');
    } catch {
      showError('Failed to update item');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteItem.mutateAsync(itemId);
      showSuccess('Item deleted');
      onDeleted();
    } catch {
      showError('Failed to delete item (may be used in estimates)');
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-pulse space-y-3 w-full px-6">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-8 bg-gray-100 dark:bg-gray-800 rounded" />)}
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 text-sm">
        Item not found
      </div>
    );
  }

  return (
    <motion.div
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 40, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="h-full flex flex-col bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white text-base truncate max-w-[220px]">
            {item.name}
          </h2>
          {item.categoryName && (
            <p className="text-xs text-gray-400 mt-0.5">{item.categoryName}</p>
          )}
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Usage count */}
        {item.usageCount !== undefined && (
          <div className="mx-5 mt-4 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-2">
            <ExternalLink className="w-4 h-4 text-blue-500" />
            Used in <strong className="text-blue-600 dark:text-blue-400">{item.usageCount}</strong> estimate{item.usageCount !== 1 ? 's' : ''}
          </div>
        )}

        {/* Form */}
        <form id="item-form" onSubmit={handleSubmit(onSubmit)} className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Name *</label>
            <input
              {...register('name')}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Description</label>
            <textarea
              {...register('description')}
              rows={2}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Unit *</label>
            <input
              {...register('unit')}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Material Cost</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  {...register('defaultMaterialCost', { valueAsNumber: true })}
                  className="w-full pl-7 pr-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Labor Cost</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  {...register('defaultLaborCost', { valueAsNumber: true })}
                  className="w-full pl-7 pr-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Labor Hours</label>
            <input
              type="number"
              step="0.01"
              min="0"
              {...register('defaultLaborHours', { valueAsNumber: true })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Source</label>
            <input
              {...register('source')}
              placeholder="e.g. RSMeans 2024, supplier quote"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Notes</label>
            <textarea
              {...register('notes')}
              rows={2}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
            />
          </div>

          {/* Last updated */}
          {item.lastPriceUpdate && (
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <RefreshCw className="w-3 h-3" />
              Last updated: {format(new Date(item.lastPriceUpdate), 'MMM d, yyyy')}
            </p>
          )}
        </form>

        {/* Price history chart */}
        {priceHistory.length > 1 && (
          <div className="px-5 pb-4">
            <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-1.5 uppercase tracking-wide">
              <TrendingUp className="w-3.5 h-3.5" />
              Price History
            </h3>
            <div className="h-36 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={priceHistory} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    formatter={(v: number) => [`$${v.toFixed(2)}`]}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line
                    type="monotone"
                    dataKey="material"
                    name="Material"
                    stroke="#f97316"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="labor"
                    name="Labor"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Delete section */}
        <div className="px-5 pb-6">
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-2 text-sm text-red-500 hover:text-red-600 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete item
            </button>
          ) : (
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 space-y-2">
              {(item.usageCount ?? 0) > 0 && (
                <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  This item is used in {item.usageCount} estimate(s). Deleting it won't affect existing estimates.
                </div>
              )}
              <p className="text-sm font-medium text-red-700 dark:text-red-300">Delete this item?</p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  className="flex-1 py-1.5 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                >
                  Delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 py-1.5 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
        <button
          type="submit"
          form="item-form"
          disabled={!isDirty || isSubmitting}
          className="w-full flex items-center justify-center gap-2 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {isSubmitting ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </motion.div>
  );
}
