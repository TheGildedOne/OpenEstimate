import React, { useState } from 'react';
import { Search, Plus, Database, Edit, Trash2, ChevronRight, ChevronDown } from 'lucide-react';
import {
  useCostCategories,
  useCostItems,
  useCreateCostItem,
  useUpdateCostItem,
  useDeleteCostItem,
  useCreateCostCategory,
} from '../../lib/api';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { SkeletonTable } from '../../components/ui/Skeleton';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Modal } from '../../components/ui/Modal';
import { useUIStore } from '../../store/uiStore';
import { formatCurrency } from '../../lib/estimateCalc';
import type { CostCategory, CostItem } from '@openestimate/shared';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const itemSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  categoryId: z.number({ required_error: 'Category required' }),
  unit: z.string().min(1, 'Unit required'),
  defaultMaterialCost: z.number().min(0),
  defaultLaborCost: z.number().min(0),
  defaultLaborHours: z.number().min(0),
  description: z.string().optional(),
  notes: z.string().optional(),
});

type ItemForm = z.infer<typeof itemSchema>;

function CategoryTree({
  categories,
  selectedId,
  onSelect,
  depth = 0,
}: {
  categories: CostCategory[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <ul className="space-y-0.5">
      {depth === 0 && (
        <li>
          <button
            onClick={() => onSelect(null)}
            className={[
              'flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-sm text-left transition-colors',
              selectedId === null
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-400 font-medium'
                : 'text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800',
            ].join(' ')}
          >
            All Items
          </button>
        </li>
      )}
      {categories.map((cat) => {
        const hasChildren = (cat.children?.length ?? 0) > 0;
        const isExpanded = expanded.has(cat.id);
        const isSelected = selectedId === cat.id;

        return (
          <li key={cat.id}>
            <button
              onClick={() => {
                onSelect(cat.id);
                if (hasChildren) toggle(cat.id);
              }}
              className={[
                'flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-sm text-left transition-colors',
                isSelected
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-400 font-medium'
                  : 'text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800',
              ].join(' ')}
              style={{ paddingLeft: `${12 + depth * 16}px` }}
            >
              {hasChildren ? (
                isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                )
              ) : (
                <span className="w-3.5" />
              )}
              {cat.name}
            </button>
            {hasChildren && isExpanded && (
              <CategoryTree
                categories={cat.children!}
                selectedId={selectedId}
                onSelect={onSelect}
                depth={depth + 1}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function CostDatabase() {
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [editItem, setEditItem] = useState<CostItem | null>(null);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [deleteItem, setDeleteItem] = useState<CostItem | null>(null);
  const showSuccess = useUIStore((s) => s.showSuccess);
  const showError = useUIStore((s) => s.showError);

  const { data: categories, isLoading: catLoading } = useCostCategories();
  const filters: Record<string, string> = {};
  if (selectedCategoryId) filters.categoryId = String(selectedCategoryId);
  if (search) filters.q = search;

  const { data: itemsData, isLoading: itemsLoading } = useCostItems(filters);
  const items = Array.isArray(itemsData) ? itemsData : (itemsData as any)?.data ?? [];

  const createItem = useCreateCostItem();
  const updateItem = useUpdateCostItem();
  const deleteItemMutation = useDeleteCostItem();

  const form = useForm<ItemForm>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      name: '',
      categoryId: undefined as any,
      unit: 'EA',
      defaultMaterialCost: 0,
      defaultLaborCost: 0,
      defaultLaborHours: 0,
    },
  });

  const openAdd = () => {
    form.reset({
      name: '',
      categoryId: selectedCategoryId ?? (undefined as any),
      unit: 'EA',
      defaultMaterialCost: 0,
      defaultLaborCost: 0,
      defaultLaborHours: 0,
    });
    setEditItem(null);
    setAddItemOpen(true);
  };

  const openEdit = (item: CostItem) => {
    form.reset({
      name: item.name,
      categoryId: item.categoryId,
      unit: item.unit,
      defaultMaterialCost: item.defaultMaterialCost,
      defaultLaborCost: item.defaultLaborCost,
      defaultLaborHours: item.defaultLaborHours,
      description: item.description ?? '',
      notes: item.notes ?? '',
    });
    setEditItem(item);
    setAddItemOpen(true);
  };

  const handleSubmit = async (data: ItemForm) => {
    try {
      if (editItem) {
        await updateItem.mutateAsync({ id: editItem.id, ...data });
        showSuccess('Item updated');
      } else {
        await createItem.mutateAsync(data);
        showSuccess('Item created');
      }
      setAddItemOpen(false);
    } catch {
      showError('Failed to save item');
    }
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    try {
      await deleteItemMutation.mutateAsync(deleteItem.id);
      showSuccess('Item deleted');
    } catch {
      showError('Failed to delete item');
    } finally {
      setDeleteItem(null);
    }
  };

  const catOptions = (cats: CostCategory[], depth = 0): { value: number; label: string }[] => {
    return cats.flatMap((c) => [
      { value: c.id, label: `${'  '.repeat(depth)}${c.name}` },
      ...catOptions(c.children ?? [], depth + 1),
    ]);
  };

  return (
    <PageContainer>
      <div className="flex gap-6">
        {/* Category sidebar */}
        <aside className="w-48 shrink-0">
          <div className="sticky top-20">
            <p className="text-xs font-semibold text-gray-500 dark:text-zinc-500 uppercase tracking-wider mb-2 px-3">
              Categories
            </p>
            {catLoading ? (
              <div className="space-y-1">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-8 bg-gray-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : (
              <CategoryTree
                categories={categories ?? []}
                selectedId={selectedCategoryId}
                onSelect={setSelectedCategoryId}
              />
            )}
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-4">
            <Input
              placeholder="Search items…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              prefix={<Search className="w-4 h-4" />}
              className="max-w-xs"
            />
            <Button onClick={openAdd} leftIcon={<Plus className="w-4 h-4" />} className="ml-auto">
              Add Item
            </Button>
          </div>

          {itemsLoading ? (
            <SkeletonTable rows={8} cols={5} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Database />}
              title="No cost items found"
              description="Add cost items to build your pricing database."
              action={{ label: 'Add Item', onClick: openAdd }}
            />
          ) : (
            <div className="rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-zinc-400">
                      Name
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-zinc-400">
                      Category
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-zinc-400">
                      Unit
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-zinc-400">
                      Material
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-zinc-400">
                      Labor
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                  {items.map((item: CostItem) => (
                    <tr
                      key={item.id}
                      className="hover:bg-gray-50 dark:hover:bg-zinc-900/50 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-zinc-100">
                        {item.name}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-zinc-400">
                        {item.categoryName ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="gray">{item.unit}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700 dark:text-zinc-300">
                        {formatCurrency(item.defaultMaterialCost)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700 dark:text-zinc-300">
                        {formatCurrency(item.defaultLaborCost)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(item)}
                            className="p-1.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                            aria-label="Edit item"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteItem(item)}
                            className="p-1.5 rounded text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            aria-label="Delete item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={addItemOpen}
        onClose={() => setAddItemOpen(false)}
        title={editItem ? 'Edit Cost Item' : 'Add Cost Item'}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAddItemOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={form.handleSubmit(handleSubmit)}
              isLoading={createItem.isPending || updateItem.isPending}
            >
              {editItem ? 'Save Changes' : 'Add Item'}
            </Button>
          </div>
        }
      >
        <form className="space-y-3">
          <Input
            label="Name *"
            {...form.register('name')}
            error={form.formState.errors.name?.message}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Unit *"
              {...form.register('unit')}
              error={form.formState.errors.unit?.message}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Material Cost"
              type="number"
              step="0.01"
              {...form.register('defaultMaterialCost', { valueAsNumber: true })}
            />
            <Input
              label="Labor Cost"
              type="number"
              step="0.01"
              {...form.register('defaultLaborCost', { valueAsNumber: true })}
            />
            <Input
              label="Labor Hours"
              type="number"
              step="0.01"
              {...form.register('defaultLaborHours', { valueAsNumber: true })}
            />
          </div>
          <Input label="Description" {...form.register('description')} />
          <Input label="Notes" {...form.register('notes')} />
        </form>
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        isOpen={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={handleDelete}
        title="Delete Cost Item"
        message={`Are you sure you want to delete "${deleteItem?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        isLoading={deleteItemMutation.isPending}
      />
    </PageContainer>
  );
}
