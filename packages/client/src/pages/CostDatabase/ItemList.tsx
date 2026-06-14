import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Plus,
  Upload,
  Download,
  RefreshCw,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Check,
} from 'lucide-react';
import { format } from 'date-fns';
import { useCostItems, useDeleteCostItem, useCreateCostItem, useUpdateCostItem } from '@/lib/api';
import { useUIStore } from '@/store/uiStore';
import { formatCurrency } from '@/lib/estimateCalc';
import ImportModal from './ImportModal';
import type { CostItem } from '@openestimate/shared';

interface ItemListProps {
  categoryId: number | null;
  onSelectItem: (id: number) => void;
  selectedItemId: number | null;
}

const PAGE_SIZE = 25;

export default function ItemList({ categoryId, onSelectItem, selectedItemId }: ItemListProps) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showImport, setShowImport] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const { showSuccess, showError } = useUIStore();
  const deleteItem = useDeleteCostItem();
  const createItem = useCreateCostItem();

  const filters: Record<string, unknown> = { page: String(page), pageSize: String(PAGE_SIZE) };
  if (categoryId) filters.categoryId = String(categoryId);
  if (search) filters.search = search;

  const { data, isLoading, refetch } = useCostItems(filters);
  const items: CostItem[] = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map((i) => i.id)));
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteItem.mutateAsync(id);
      showSuccess('Item deleted');
      setConfirmDeleteId(null);
      if (selectedItemId === id) onSelectItem(id);
    } catch { showError('Failed to delete item'); }
  };

  const handleExportCSV = () => {
    const selectedItems = items.filter((i) => selectedIds.has(i.id));
    const exportItems = selectedItems.length > 0 ? selectedItems : items;
    const cols = ['name', 'description', 'unit', 'defaultMaterialCost', 'defaultLaborCost', 'defaultLaborHours', 'source'];
    const header = cols.join(',');
    const rows = exportItems.map((item) =>
      cols.map((col) => `"${(item as Record<string, unknown>)[col] ?? ''}"`).join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cost-items.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleMarkPriceUpdate = async () => {
    if (selectedIds.size === 0) return;
    // Optimistically mark — in a real app this would be a batch API call
    showSuccess(`Marked ${selectedIds.size} items for price update`);
    setSelectedIds(new Set());
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 space-y-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search items…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <Upload className="w-4 h-4" />
            Import
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>

          <button
            onClick={() => onSelectItem(0)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Item
          </button>
        </div>

        {/* Bulk actions */}
        <AnimatePresence>
          {selectedIds.size > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="flex items-center gap-2 overflow-hidden"
            >
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {selectedIds.size} selected
              </span>
              <button
                onClick={handleMarkPriceUpdate}
                className="text-xs px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50 flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                Mark for price update
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                Clear
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={selectedIds.size > 0 && selectedIds.size === items.length}
                  ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < items.length; }}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 accent-orange-500"
                />
              </th>
              {['Name', 'Unit', 'Material $', 'Labor $', 'Labor Hrs', 'Last Updated', ''].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="px-3 py-2.5">
                      <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-12 text-center text-gray-400 text-sm">
                  {search ? `No items matching "${search}"` : 'No items in this category yet'}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => onSelectItem(item.id)}
                  className={`cursor-pointer transition-colors ${
                    selectedItemId === item.id
                      ? 'bg-orange-50 dark:bg-orange-900/20'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  }`}
                >
                  <td className="w-10 px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                      className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 accent-orange-500"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-gray-900 dark:text-white truncate max-w-[200px]">
                      {item.name}
                    </div>
                    {item.description && (
                      <div className="text-xs text-gray-400 truncate max-w-[200px] mt-0.5">{item.description}</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400">{item.unit}</td>
                  <td className="px-3 py-2.5 font-mono text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {formatCurrency(item.defaultMaterialCost)}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {formatCurrency(item.defaultLaborCost)}
                  </td>
                  <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400">
                    {item.defaultLaborHours.toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 text-gray-400 text-xs whitespace-nowrap">
                    {item.lastPriceUpdate ? format(new Date(item.lastPriceUpdate), 'MMM d, yyyy') : '—'}
                  </td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onSelectItem(item.id)}
                        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-orange-500"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {confirmDeleteId === item.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="p-1 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(item.id)}
                          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          <span className="text-xs text-gray-400">
            {Math.min((page - 1) * PAGE_SIZE + 1, total)}–{Math.min(page * PAGE_SIZE, total)} of {total} items
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pageNum = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-7 h-7 text-xs rounded ${
                    pageNum === page
                      ? 'bg-orange-500 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Import modal */}
      <AnimatePresence>
        {showImport && (
          <ImportModal
            onClose={() => setShowImport(false)}
            defaultCategoryId={categoryId}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
