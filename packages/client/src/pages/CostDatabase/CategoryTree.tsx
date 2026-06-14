import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight,
  ChevronDown,
  Plus,
  MoreHorizontal,
  FolderOpen,
  Folder,
  Tag,
} from 'lucide-react';
import {
  useCostCategories,
  useCreateCostCategory,
  useUpdateCostCategory,
  useDeleteCostCategory,
} from '@/lib/api';
import { useUIStore } from '@/store/uiStore';
import type { CostCategory } from '@openestimate/shared';

interface TreeNodeProps {
  category: CostCategory;
  depth: number;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onAddChild: (parentId: number) => void;
  onRename: (id: number, name: string) => void;
  onDelete: (id: number) => void;
  counts: Record<number, number>;
}

function TreeNode({
  category,
  depth,
  selectedId,
  onSelect,
  onAddChild,
  onRename,
  onDelete,
  counts,
}: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2);
  const [editingName, setEditingName] = useState(false);
  const [localName, setLocalName] = useState(category.name);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasChildren = (category.children?.length ?? 0) > 0;
  const isSelected = selectedId === category.id;
  const count = counts[category.id] ?? 0;

  useEffect(() => {
    if (editingName && inputRef.current) inputRef.current.select();
  }, [editingName]);

  useEffect(() => {
    if (!showMenu) return;
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showMenu]);

  const commitRename = () => {
    setEditingName(false);
    if (localName.trim() && localName !== category.name) onRename(category.id, localName.trim());
  };

  return (
    <div>
      <div
        className={`group flex items-center gap-1 py-1.5 pl-${Math.min(depth * 4, 12)} pr-2 rounded-lg cursor-pointer transition-colors ${
          isSelected
            ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
        }`}
        style={{ paddingLeft: depth * 16 + 8 }}
        onClick={() => { if (!editingName) onSelect(category.id); }}
      >
        {/* Toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); if (hasChildren) setExpanded((v) => !v); }}
          className="w-4 h-4 flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          {hasChildren ? (
            expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
          ) : (
            <div className="w-4" />
          )}
        </button>

        {/* Icon */}
        {hasChildren
          ? (expanded ? <FolderOpen className="w-4 h-4 flex-shrink-0 text-amber-500" /> : <Folder className="w-4 h-4 flex-shrink-0 text-amber-500" />)
          : <Tag className="w-4 h-4 flex-shrink-0 text-gray-400" />
        }

        {/* Name */}
        {editingName ? (
          <input
            ref={inputRef}
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') { setLocalName(category.name); setEditingName(false); }
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 bg-white dark:bg-gray-700 border border-orange-400 rounded px-1 py-0.5 text-sm focus:outline-none text-gray-900 dark:text-white"
          />
        ) : (
          <span className="flex-1 min-w-0 text-sm truncate">{category.name}</span>
        )}

        {/* Count badge */}
        {count > 0 && (
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex-shrink-0">
            {count}
          </span>
        )}

        {/* Menu */}
        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu((v) => !v); }}
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 transition-opacity"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-6 z-30 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[160px] text-sm">
              <button
                onMouseDown={(e) => { e.preventDefault(); onAddChild(category.id); setShowMenu(false); }}
                className="w-full text-left px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" /> Add subcategory
              </button>
              <button
                onMouseDown={(e) => { e.preventDefault(); setEditingName(true); setShowMenu(false); }}
                className="w-full text-left px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
              >
                Rename
              </button>
              <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
              <button
                onMouseDown={(e) => { e.preventDefault(); onDelete(category.id); setShowMenu(false); }}
                className="w-full text-left px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-red-600 dark:text-red-400"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Children */}
      <AnimatePresence initial={false}>
        {expanded && hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            {(category.children ?? []).map((child) => (
              <TreeNode
                key={child.id}
                category={child}
                depth={depth + 1}
                selectedId={selectedId}
                onSelect={onSelect}
                onAddChild={onAddChild}
                onRename={onRename}
                onDelete={onDelete}
                counts={counts}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface CategoryTreeProps {
  selectedCategoryId: number | null;
  onSelect: (id: number | null) => void;
  counts?: Record<number, number>;
}

export default function CategoryTree({ selectedCategoryId, onSelect, counts = {} }: CategoryTreeProps) {
  const { data: categories = [], isLoading } = useCostCategories();
  const createCategory = useCreateCostCategory();
  const updateCategory = useUpdateCostCategory();
  const deleteCategory = useDeleteCostCategory();
  const { showSuccess, showError } = useUIStore();

  // Build tree from flat list
  const tree = React.useMemo(() => {
    const map = new Map<number, CostCategory & { children: CostCategory[] }>();
    for (const cat of categories) map.set(cat.id, { ...cat, children: [] });
    const roots: (CostCategory & { children: CostCategory[] })[] = [];
    for (const cat of categories) {
      if (cat.parentId == null) {
        roots.push(map.get(cat.id)!);
      } else {
        const parent = map.get(cat.parentId);
        if (parent) parent.children.push(map.get(cat.id)!);
      }
    }
    roots.sort((a, b) => a.sortOrder - b.sortOrder);
    return roots;
  }, [categories]);

  const handleAddRoot = async () => {
    try {
      await createCategory.mutateAsync({ name: 'New Category', parentId: null, sortOrder: categories.length });
    } catch { showError('Failed to create category'); }
  };

  const handleAddChild = async (parentId: number) => {
    try {
      await createCategory.mutateAsync({ name: 'New Subcategory', parentId, sortOrder: 0 });
    } catch { showError('Failed to create subcategory'); }
  };

  const handleRename = async (id: number, name: string) => {
    try {
      await updateCategory.mutateAsync({ id, name });
    } catch { showError('Failed to rename category'); }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteCategory.mutateAsync(id);
      if (selectedCategoryId === id) onSelect(null);
      showSuccess('Category deleted');
    } catch { showError('Failed to delete category (may have items)'); }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Categories</h2>
        <button
          onClick={handleAddRoot}
          disabled={createCategory.isPending}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="space-y-2 p-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-7 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
            ))}
          </div>
        ) : tree.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400">
            <Folder className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-xs">No categories yet</p>
            <button
              onClick={handleAddRoot}
              className="mt-2 text-xs text-orange-500 hover:underline"
            >
              Create first category
            </button>
          </div>
        ) : (
          <>
            {/* "All items" option */}
            <button
              onClick={() => onSelect(null)}
              className={`w-full text-left flex items-center gap-2 py-1.5 px-3 rounded-lg text-sm transition-colors mb-1 ${
                selectedCategoryId === null
                  ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <FolderOpen className="w-4 h-4 text-gray-400" />
              All Items
              <span className="ml-auto text-xs px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                {Object.values(counts).reduce((a, b) => a + b, 0)}
              </span>
            </button>

            {tree.map((cat) => (
              <TreeNode
                key={cat.id}
                category={cat}
                depth={0}
                selectedId={selectedCategoryId}
                onSelect={onSelect}
                onAddChild={handleAddChild}
                onRename={handleRename}
                onDelete={handleDelete}
                counts={counts}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
