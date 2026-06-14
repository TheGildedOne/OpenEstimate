import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronRight,
  ChevronDown,
  Plus,
  GripVertical,
  MoreHorizontal,
  Copy,
  Trash2,
  ArrowUpToLine,
  ArrowDownToLine,
  MoveRight,
  Package,
  Eye,
  EyeOff,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEstimateStore } from '@/store/estimateStore';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import { calculateLineItem, calculateSectionTotals, formatCurrency } from '@/lib/estimateCalc';
import {
  useUpdateLineItem,
  useCreateLineItem,
  useDeleteLineItem,
  useReorderLineItems,
  useUpdateSection,
  useDeleteSection,
} from '@/lib/api';
import type { EstimateLineItem, EstimateSection } from '@openestimate/shared';

// ─── Constants ────────────────────────────────────────────────────────────────

const UNITS = ['EA', 'LF', 'SF', 'SY', 'CY', 'LS', 'HR', 'TON', 'MBF', 'GAL'] as const;
const SECTION_ROW_HEIGHT = 40;
const ITEM_ROW_HEIGHT = 36;
const SECTION_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280'];

const ALL_COLUMNS = [
  { key: 'drag', label: '', width: 28, editable: false, testId: 'drag-handle' },
  { key: '#', label: '#', width: 40, editable: false, testId: 'row-number-cell' },
  { key: 'description', label: 'Description', width: 236, editable: true, testId: 'description-cell' },
  { key: 'quantity', label: 'Qty', width: 68, editable: true, testId: 'quantity-cell' },
  { key: 'unit', label: 'Unit', width: 68, editable: true, testId: 'unit-cell' },
  { key: 'unitMaterialCost', label: 'Unit Mat', width: 92, editable: true, testId: 'unit-mat-cell' },
  { key: 'unitLaborCost', label: 'Unit Lab', width: 92, editable: true, testId: 'unit-lab-cell' },
  { key: 'laborHours', label: 'Labor Hrs', width: 80, editable: true, testId: 'labor-hrs-cell' },
  { key: 'laborRate', label: 'Labor Rate', width: 84, editable: true, testId: 'labor-rate-cell' },
  { key: 'wasteFactorPct', label: 'Waste %', width: 68, editable: true, testId: 'waste-pct-cell' },
  { key: 'totalMaterial', label: 'Total Mat', width: 96, editable: false, testId: 'total-material-cell' },
  { key: 'totalLabor', label: 'Total Lab', width: 96, editable: false, testId: 'total-labor-cell' },
  { key: 'totalCost', label: 'Total Cost', width: 104, editable: false, testId: 'total-cost-cell' },
  { key: 'notes', label: 'Notes', width: 136, editable: true, testId: 'notes-cell' },
] as const;

type ColKey = typeof ALL_COLUMNS[number]['key'];
type CellId = `${number}-${ColKey}`;

interface FlatRow {
  type: 'section' | 'item';
  section: EstimateSection;
  item?: EstimateLineItem;
  itemIndexInSection: number;
}

// ─── localStorage hook ────────────────────────────────────────────────────────

function useLocalStorage<T>(key: string, initial: T): [T, (v: T) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback((v: T) => {
    setState(v);
    try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
  }, [key]);
  return [state, set];
}

// ─── Autocomplete dropdown ────────────────────────────────────────────────────

interface ACResult {
  id: number;
  name: string;
  unit: string;
  defaultMaterialCost: number;
  defaultLaborCost: number;
  defaultLaborHours: number;
}

function AutocompleteDropdown({
  query,
  style,
  onSelect,
  onClose,
}: {
  query: string;
  style: React.CSSProperties;
  onSelect: (item: ACResult) => void;
  onClose: () => void;
}) {
  const [results, setResults] = useState<ACResult[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/cost-db/items/search?q=${encodeURIComponent(query)}&limit=8`, {
          credentials: 'include',
        });
        if (!res.ok) return;
        const data = await res.json();
        setResults((data.data ?? data).slice(0, 8));
        setActiveIdx(0);
      } catch { /* silent */ }
    }, 300);
    return () => clearTimeout(timer.current);
  }, [query]);

  useEffect(() => {
    const handle = (e: globalThis.KeyboardEvent) => {
      if (!results.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
      if (e.key === 'Enter' && results[activeIdx]) { e.preventDefault(); onSelect(results[activeIdx]); }
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [results, activeIdx, onSelect, onClose]);

  if (!results.length) return null;
  return (
    <motion.ul
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      style={style}
      className="fixed z-[200] bg-white dark:bg-zinc-900 rounded-lg shadow-2xl border border-gray-200 dark:border-zinc-700 overflow-hidden text-sm max-h-56 overflow-y-auto"
    >
      {results.map((item, idx) => (
        <li
          key={item.id}
          onMouseDown={(e) => { e.preventDefault(); onSelect(item); }}
          className={`px-3 py-2 cursor-pointer flex items-center justify-between gap-4 ${
            idx === activeIdx
              ? 'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
              : 'hover:bg-gray-50 dark:hover:bg-zinc-800 text-gray-900 dark:text-zinc-100'
          }`}
        >
          <span className="truncate">{item.name}</span>
          <span className="text-xs text-gray-400 dark:text-zinc-500 flex-shrink-0">
            {item.unit} · {formatCurrency(item.defaultMaterialCost)}
          </span>
        </li>
      ))}
    </motion.ul>
  );
}

// ─── Grid cell ────────────────────────────────────────────────────────────────

interface GridCellProps {
  item: EstimateLineItem;
  col: typeof ALL_COLUMNS[number];
  isActive: boolean;
  isSelected: boolean;
  rowNum: number;
  onClick: (e: ReactMouseEvent) => void;
  onUpdate: (key: string, value: string | number | null) => void;
  onTabNext: () => void;
  onEnterDown: () => void;
  onArrow: (dir: 'up' | 'down' | 'left' | 'right') => void;
}

function GridCell({ item, col, isActive, isSelected, rowNum, onClick, onUpdate, onTabNext, onEnterDown, onArrow }: GridCellProps) {
  const { totalMaterial, totalLabor, totalCost } = calculateLineItem(item);

  const getRawValue = useCallback((): string => {
    switch (col.key) {
      case '#': return String(rowNum);
      case 'totalMaterial': return formatCurrency(totalMaterial);
      case 'totalLabor': return formatCurrency(totalLabor);
      case 'totalCost': return formatCurrency(totalCost);
      default: return String((item as Record<string, unknown>)[col.key] ?? '');
    }
  }, [col.key, item, rowNum, totalMaterial, totalLabor, totalCost]);

  const [editing, setEditing] = useState(false);
  const [localVal, setLocalVal] = useState(getRawValue);
  const [showAC, setShowAC] = useState(false);
  const [cellRect, setCellRect] = useState<DOMRect | null>(null);
  const cellRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);

  useEffect(() => {
    if (!editing) setLocalVal(getRawValue());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, col.key, rowNum]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current instanceof HTMLInputElement) inputRef.current.select();
    }
  }, [editing]);

  const startEdit = () => {
    if (!col.editable) return;
    const raw = getRawValue();
    setLocalVal(raw);
    setEditing(true);
    if (col.key === 'description') {
      setCellRect(cellRef.current?.getBoundingClientRect() ?? null);
      setShowAC(true);
    }
  };

  const commit = useCallback(() => {
    setEditing(false);
    setShowAC(false);
    const numericFields = ['quantity', 'unitMaterialCost', 'unitLaborCost', 'laborHours', 'laborRate', 'wasteFactorPct'];
    if (numericFields.includes(col.key)) {
      onUpdate(col.key, parseFloat(localVal) || 0);
    } else {
      onUpdate(col.key, localVal);
    }
  }, [col.key, localVal, onUpdate]);

  const handleKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Tab') { e.preventDefault(); commit(); onTabNext(); }
    else if (e.key === 'Enter') { e.preventDefault(); commit(); onEnterDown(); }
    else if (e.key === 'Escape') { setEditing(false); setShowAC(false); setLocalVal(getRawValue()); }
    else if (e.key === 'ArrowUp' && col.key !== 'notes') { e.preventDefault(); commit(); onArrow('up'); }
    else if (e.key === 'ArrowDown' && col.key !== 'notes') { e.preventDefault(); commit(); onArrow('down'); }
  };

  const isComputed = ['totalMaterial', 'totalLabor', 'totalCost'].includes(col.key);
  const isCurrencyDisplay = ['unitMaterialCost', 'unitLaborCost', 'laborRate'].includes(col.key);
  const isNonEditable = !col.editable;

  const bgClass = isSelected
    ? 'bg-orange-50 dark:bg-orange-900/20'
    : isActive
    ? 'bg-blue-50 dark:bg-blue-900/20 ring-1 ring-inset ring-blue-400'
    : 'hover:bg-gray-50/80 dark:hover:bg-zinc-800/50';

  if (col.key === '#') {
    return (
      <div
        data-testid={col.testId}
        className={`flex items-center justify-end pr-2 text-xs text-gray-300 dark:text-zinc-600 border-r border-gray-100 dark:border-zinc-800 ${bgClass}`}
        style={{ width: col.width, minWidth: col.width, height: ITEM_ROW_HEIGHT }}
      >
        {rowNum}
      </div>
    );
  }

  if (col.key === 'unit' && editing) {
    return (
      <div
        ref={cellRef}
        data-testid={col.testId}
        className="relative flex items-center border-r border-gray-100 dark:border-zinc-800"
        style={{ width: col.width, minWidth: col.width, height: ITEM_ROW_HEIGHT }}
      >
        <select
          ref={inputRef as React.Ref<HTMLSelectElement>}
          autoFocus
          value={localVal}
          onChange={(e) => setLocalVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); commit(); onTabNext(); } }}
          className="w-full h-full px-1 text-xs bg-white dark:bg-zinc-800 border border-blue-400 focus:outline-none text-gray-900 dark:text-white"
        >
          {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
    );
  }

  return (
    <div
      ref={cellRef}
      data-testid={col.testId}
      className={`relative flex items-center border-r border-gray-100 dark:border-zinc-800 px-2 transition-colors ${bgClass} ${col.editable ? 'cursor-text' : 'cursor-default'}`}
      style={{ width: col.width, minWidth: col.width, height: ITEM_ROW_HEIGHT }}
      onClick={onClick}
      onDoubleClick={() => { if (col.editable) startEdit(); }}
    >
      {editing ? (
        <div className="absolute inset-0 z-10">
          {col.key === 'notes' ? (
            <textarea
              ref={inputRef as React.Ref<HTMLTextAreaElement>}
              value={localVal}
              onChange={(e) => setLocalVal(e.target.value)}
              onBlur={commit}
              onKeyDown={handleKeyDown as unknown as React.KeyboardEventHandler<HTMLTextAreaElement>}
              className="w-full h-full p-1 text-xs bg-white dark:bg-zinc-800 border border-blue-400 focus:outline-none resize-none text-gray-900 dark:text-white"
            />
          ) : (
            <>
              <input
                ref={inputRef as React.Ref<HTMLInputElement>}
                type={['quantity', 'unitMaterialCost', 'unitLaborCost', 'laborHours', 'laborRate', 'wasteFactorPct'].includes(col.key) ? 'number' : 'text'}
                step={['unitMaterialCost', 'unitLaborCost', 'laborRate'].includes(col.key) ? '0.01' : undefined}
                value={localVal}
                onChange={(e) => { setLocalVal(e.target.value); if (col.key === 'description') setShowAC(true); }}
                onBlur={() => { setTimeout(() => { commit(); setShowAC(false); }, 160); }}
                onKeyDown={handleKeyDown}
                className="w-full h-full px-2 text-xs bg-white dark:bg-zinc-800 border border-blue-400 focus:outline-none text-gray-900 dark:text-white"
              />
              {col.key === 'description' && showAC && cellRect && (
                <AutocompleteDropdown
                  query={localVal}
                  style={{ top: cellRect.bottom + 2, left: cellRect.left, width: 340 }}
                  onSelect={(acItem) => {
                    setEditing(false);
                    setShowAC(false);
                    onUpdate('description', acItem.name);
                    onUpdate('unit', acItem.unit);
                    onUpdate('unitMaterialCost', acItem.defaultMaterialCost);
                    onUpdate('unitLaborCost', acItem.defaultLaborCost);
                    onUpdate('laborHours', acItem.defaultLaborHours);
                  }}
                  onClose={() => setShowAC(false)}
                />
              )}
            </>
          )}
        </div>
      ) : (
        <span
          className={`text-xs truncate w-full ${
            col.key === 'totalCost'
              ? 'font-bold text-gray-900 dark:text-white'
              : col.key === 'totalMaterial'
              ? `font-semibold ${totalMaterial > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-zinc-500'}`
              : col.key === 'totalLabor'
              ? 'font-semibold text-gray-700 dark:text-zinc-300'
              : isNonEditable
              ? 'text-gray-400 dark:text-zinc-500'
              : 'text-gray-700 dark:text-zinc-300'
          }`}
        >
          {isCurrencyDisplay
            ? `$${(parseFloat(String((item as Record<string, unknown>)[col.key] ?? '0')) || 0).toFixed(2)}`
            : localVal}
        </span>
      )}
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

interface SectionHeaderProps {
  section: EstimateSection;
  collapsed: boolean;
  subtotal: number;
  onToggle: () => void;
  onAddItem: () => void;
  onRename: (name: string) => void;
  onChangeColor: (color: string) => void;
  onDelete: () => void;
}

function SectionHeader({ section, collapsed, subtotal, onToggle, onAddItem, onRename, onChangeColor, onDelete }: SectionHeaderProps) {
  const [editingName, setEditingName] = useState(false);
  const [localName, setLocalName] = useState(section.name);
  const [showMenu, setShowMenu] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setLocalName(section.name); }, [section.name]);
  useEffect(() => { if (editingName && inputRef.current) inputRef.current.select(); }, [editingName]);

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
    if (localName.trim() && localName !== section.name) onRename(localName.trim());
    else setLocalName(section.name);
  };

  return (
    <div
      className="flex items-center gap-2 px-2 bg-gray-50 dark:bg-zinc-800/80 border-b border-t border-gray-200 dark:border-zinc-700 group select-none"
      style={{ height: SECTION_ROW_HEIGHT }}
    >
      <button
        onClick={onToggle}
        className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 flex-shrink-0 w-5 h-5 flex items-center justify-center"
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {/* Color swatch */}
      <div className="relative flex-shrink-0">
        <button
          onClick={() => setShowColorPicker((v) => !v)}
          className="w-3.5 h-3.5 rounded-full border-2 border-white dark:border-zinc-700 shadow-sm"
          style={{ backgroundColor: section.color ?? '#6b7280' }}
        />
        <AnimatePresence>
          {showColorPicker && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute top-6 left-0 z-30 bg-white dark:bg-zinc-900 rounded-lg shadow-xl border border-gray-200 dark:border-zinc-700 p-2 flex flex-wrap gap-1.5 w-28"
            >
              {SECTION_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => { onChangeColor(c); setShowColorPicker(false); }}
                  className="w-5 h-5 rounded-full border-2 border-transparent hover:border-white dark:hover:border-zinc-300 transition-all"
                  style={{ backgroundColor: c }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Name */}
      {editingName ? (
        <input
          ref={inputRef}
          value={localName}
          onChange={(e) => setLocalName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') { setEditingName(false); setLocalName(section.name); }
          }}
          className="flex-1 min-w-0 px-1 py-0.5 text-sm font-semibold bg-white dark:bg-zinc-700 border border-blue-400 rounded focus:outline-none text-gray-900 dark:text-white"
        />
      ) : (
        <span
          className="flex-1 min-w-0 text-sm font-semibold text-gray-800 dark:text-zinc-200 truncate cursor-pointer"
          onDoubleClick={() => setEditingName(true)}
          title="Double-click to rename"
        >
          {section.name}
        </span>
      )}

      <span className="text-xs font-mono font-semibold text-gray-600 dark:text-zinc-400 flex-shrink-0">
        {formatCurrency(subtotal)}
      </span>

      <button
        onClick={onAddItem}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-orange-100 dark:hover:bg-orange-900/30 text-orange-500 transition-all flex-shrink-0"
        title="Add line item"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>

      <div className="relative flex-shrink-0" ref={menuRef}>
        <button
          onClick={() => setShowMenu((v) => !v)}
          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-400 transition-all"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
        <AnimatePresence>
          {showMenu && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ duration: 0.1 }}
              className="absolute right-0 top-7 z-30 bg-white dark:bg-zinc-900 rounded-lg shadow-xl border border-gray-200 dark:border-zinc-700 py-1 min-w-[150px] text-sm"
            >
              <button onClick={() => { setEditingName(true); setShowMenu(false); }} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-zinc-800 text-gray-700 dark:text-zinc-300">Rename</button>
              <button onClick={() => { setShowColorPicker(true); setShowMenu(false); }} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-zinc-800 text-gray-700 dark:text-zinc-300">Change color</button>
              <div className="my-1 border-t border-gray-100 dark:border-zinc-800" />
              <button onClick={() => { onDelete(); setShowMenu(false); }} className="w-full text-left px-3 py-1.5 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 dark:text-red-400">Delete section</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Row context menu ─────────────────────────────────────────────────────────

interface RowContextMenuProps {
  x: number;
  y: number;
  itemId: number;
  sectionId: number;
  sections: EstimateSection[];
  onClose: () => void;
  onAction: (action: string, payload?: unknown) => void;
}

function RowContextMenu({ x, y, itemId, sectionId, sections, onClose, onAction }: RowContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    let nx = x; let ny = y;
    if (nx + rect.width > window.innerWidth - 8) nx = window.innerWidth - rect.width - 8;
    if (ny + rect.height > window.innerHeight - 8) ny = window.innerHeight - rect.height - 8;
    setPos({ x: nx, y: ny });
  }, [x, y]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose(); };
    const hk = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', h);
    window.addEventListener('keydown', hk);
    return () => { document.removeEventListener('mousedown', h); window.removeEventListener('keydown', hk); };
  }, [onClose]);

  const otherSections = sections.filter((s) => s.id !== sectionId);

  type MenuItem = { label: string; icon: React.ReactNode; action: string; danger?: boolean; sub?: EstimateSection[] } | null;

  const menuItems: MenuItem[] = [
    { label: 'Add row above', icon: <ArrowUpToLine className="w-3.5 h-3.5" />, action: 'addAbove' },
    { label: 'Add row below', icon: <ArrowDownToLine className="w-3.5 h-3.5" />, action: 'addBelow' },
    { label: 'Duplicate row', icon: <Copy className="w-3.5 h-3.5" />, action: 'duplicate' },
    null,
    ...(otherSections.length > 0 ? [{ label: 'Move to section', icon: <MoveRight className="w-3.5 h-3.5" />, action: 'moveToSection', sub: otherSections }] : []),
    { label: 'Convert to assembly', icon: <Package className="w-3.5 h-3.5" />, action: 'convertAssembly' },
    null,
    { label: 'Delete row', icon: <Trash2 className="w-3.5 h-3.5" />, action: 'delete', danger: true },
  ];

  return (
    <motion.div
      ref={menuRef}
      data-testid="context-menu"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.1 }}
      style={{ top: pos.y, left: pos.x }}
      className="fixed z-[9999] bg-white dark:bg-zinc-900 rounded-lg shadow-2xl border border-gray-200 dark:border-zinc-700 py-1 min-w-[190px] text-sm"
    >
      {menuItems.map((entry, i) => {
        if (!entry) return <div key={i} className="my-1 border-t border-gray-100 dark:border-zinc-800" />;
        if (entry.sub) {
          return (
            <div key={entry.label} className="group relative">
              <div className="px-3 py-1.5 flex items-center gap-2.5 justify-between cursor-default text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800">
                <span className="flex items-center gap-2.5">{entry.icon}{entry.label}</span>
                <ChevronRight className="w-3 h-3 text-gray-400" />
              </div>
              <div className="absolute left-full top-0 hidden group-hover:block bg-white dark:bg-zinc-900 rounded-lg shadow-xl border border-gray-200 dark:border-zinc-700 py-1 min-w-[150px]">
                {entry.sub.map((s) => (
                  <button
                    key={s.id}
                    onMouseDown={() => { onAction('moveToSection', { itemId, targetSectionId: s.id }); onClose(); }}
                    className="w-full text-left px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-zinc-800 text-gray-700 dark:text-zinc-300"
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          );
        }
        return (
          <button
            key={entry.label}
            onMouseDown={() => { onAction(entry.action, { itemId }); onClose(); }}
            className={`w-full text-left px-3 py-1.5 flex items-center gap-2.5 hover:bg-gray-50 dark:hover:bg-zinc-800 ${entry.danger ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-zinc-300'}`}
          >
            {entry.icon}{entry.label}
          </button>
        );
      })}
    </motion.div>
  );
}

// ─── Sortable row ─────────────────────────────────────────────────────────────

function SortableRow({ id, children }: { id: string; children: (listeners: ReturnType<typeof useSortable>['listeners']) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
    >
      {children(listeners)}
    </div>
  );
}

// ─── Column visibility toggle ─────────────────────────────────────────────────

function ColumnToggle({ hiddenCols, onToggle }: { hiddenCols: Set<string>; onToggle: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const toggleable = ALL_COLUMNS.filter((c) => !['drag', '#', 'description'].includes(c.key));

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors"
      >
        <Eye className="w-3.5 h-3.5" />
        Columns
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 top-full mt-1 z-30 bg-white dark:bg-zinc-900 rounded-lg shadow-xl border border-gray-200 dark:border-zinc-700 py-2 w-48"
          >
            {toggleable.map((col) => {
              const hidden = hiddenCols.has(col.key);
              return (
                <label key={col.key} className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800 text-sm text-gray-700 dark:text-zinc-300">
                  <input type="checkbox" checked={!hidden} onChange={() => onToggle(col.key)} className="rounded accent-orange-500" />
                  {col.label || col.key}
                  {hidden && <EyeOff className="w-3 h-3 text-gray-400 ml-auto" />}
                </label>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main EstimateGrid ────────────────────────────────────────────────────────

interface EstimateGridProps {
  estimateId: number;
}

export default function EstimateGrid({ estimateId }: EstimateGridProps) {
  const estimate = useEstimateStore((s) => s.estimate);
  const updateLineItemStore = useEstimateStore((s) => s.updateLineItem);
  const addLineItemStore = useEstimateStore((s) => s.addLineItem);
  const deleteLineItemStore = useEstimateStore((s) => s.deleteLineItem);
  const updateSectionStore = useEstimateStore((s) => s.updateSection);
  const deleteSectionStore = useEstimateStore((s) => s.deleteSection);

  const { undo, redo } = useUndoRedo();

  const updateLineItemApi = useUpdateLineItem();
  const createLineItemApi = useCreateLineItem();
  const deleteLineItemApi = useDeleteLineItem();
  const reorderApi = useReorderLineItems();
  const updateSectionApi = useUpdateSection();
  const deleteSectionApi = useDeleteSection();

  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set());
  const [activeCell, setActiveCell] = useState<CellId | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [clipboard, setClipboard] = useState<EstimateLineItem[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; itemId: number; sectionId: number } | null>(null);
  const [hiddenCols, setHiddenCols] = useLocalStorage<string[]>('oe_hidden_cols_v1', []);
  const hiddenColSet = useMemo(() => new Set(hiddenCols), [hiddenCols]);

  const parentRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const sections = useMemo(() => estimate?.sections ?? [], [estimate]);

  const visibleCols = useMemo(
    () => ALL_COLUMNS.filter((c) => !hiddenColSet.has(c.key)),
    [hiddenColSet]
  );

  // Build flat rows for virtualizer
  const flatRows = useMemo<FlatRow[]>(() => {
    const rows: FlatRow[] = [];
    for (const section of sections) {
      rows.push({ type: 'section', section, itemIndexInSection: -1 });
      if (!collapsedSections.has(section.id)) {
        let idx = 0;
        for (const item of section.lineItems ?? []) {
          rows.push({ type: 'item', section, item, itemIndexInSection: idx++ });
        }
      }
    }
    return rows;
  }, [sections, collapsedSections]);

  const rowVirtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (flatRows[i]?.type === 'section' ? SECTION_ROW_HEIGHT : ITEM_ROW_HEIGHT),
    overscan: 12,
  });

  const allVisibleItems = useMemo(
    () => sections.flatMap((s) => (collapsedSections.has(s.id) ? [] : (s.lineItems ?? []))),
    [sections, collapsedSections]
  );

  const handleAddItem = useCallback((sectionId: number) => {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;
    const newItem: EstimateLineItem = {
      id: -(Date.now()),
      sectionId,
      estimateId,
      description: '',
      quantity: 1,
      unit: 'EA',
      unitMaterialCost: 0,
      unitLaborCost: 0,
      laborHours: 0,
      laborRate: 0,
      wasteFactorPct: 0,
      notes: null,
      costDbItemId: null,
      sortOrder: section.lineItems?.length ?? 0,
      isAssembly: false,
      parentItemId: null,
    };
    addLineItemStore(sectionId, newItem);
    createLineItemApi.mutate({ ...newItem, estimateId } as Parameters<typeof createLineItemApi.mutate>[0]);
  }, [sections, estimateId, addLineItemStore, createLineItemApi]);

  const navigateCell = useCallback((dir: 'up' | 'down' | 'left' | 'right') => {
    if (!activeCell) return;
    const dashIdx = activeCell.indexOf('-');
    const itemId = parseInt(activeCell.slice(0, dashIdx));
    const col = activeCell.slice(dashIdx + 1) as ColKey;
    const editableCols = visibleCols.filter((c) => c.editable);
    const colIdx = editableCols.findIndex((c) => c.key === col);
    const itemIdx = allVisibleItems.findIndex((i) => i.id === itemId);

    if (dir === 'right' && colIdx < editableCols.length - 1) {
      setActiveCell(`${itemId}-${editableCols[colIdx + 1].key}` as CellId);
    } else if (dir === 'left' && colIdx > 0) {
      setActiveCell(`${itemId}-${editableCols[colIdx - 1].key}` as CellId);
    } else if (dir === 'up' && itemIdx > 0) {
      setActiveCell(`${allVisibleItems[itemIdx - 1].id}-${col}` as CellId);
    } else if (dir === 'down') {
      if (itemIdx < allVisibleItems.length - 1) {
        setActiveCell(`${allVisibleItems[itemIdx + 1].id}-${col}` as CellId);
      } else {
        const lastSection = sections.at(-1);
        if (lastSection) handleAddItem(lastSection.id);
      }
    }
  }, [activeCell, visibleCols, allVisibleItems, sections, handleAddItem]);

  // Global keyboard handlers
  useEffect(() => {
    const handle = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if (ctrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }

      if (!isInput) {
        if (ctrl && e.key === 'c' && selectedRows.size > 0) {
          const items = sections.flatMap((s) => s.lineItems ?? []).filter((i) => selectedRows.has(i.id));
          setClipboard(items);
          navigator.clipboard.writeText(JSON.stringify(items, null, 2)).catch(() => {});
        }
        if (ctrl && e.key === 'v' && clipboard.length > 0) {
          const lastId = [...selectedRows].at(-1);
          const allItems = sections.flatMap((s) => s.lineItems ?? []);
          const ref = allItems.find((i) => i.id === lastId) ?? allItems.at(-1);
          if (!ref) return;
          clipboard.forEach((itm) => {
            const dup: EstimateLineItem = { ...itm, id: -(Date.now() + Math.random()), sectionId: ref.sectionId };
            addLineItemStore(ref.sectionId, dup);
            createLineItemApi.mutate({ ...dup, estimateId } as Parameters<typeof createLineItemApi.mutate>[0]);
          });
        }
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [undo, redo, selectedRows, sections, clipboard, addLineItemStore, createLineItemApi, estimateId]);

  const handleCellUpdate = useCallback((item: EstimateLineItem, key: string, value: string | number | null) => {
    updateLineItemStore(item.id, { [key]: value } as Partial<EstimateLineItem>);
    // Debounced server sync
    const timer = window.setTimeout(() => {
      updateLineItemApi.mutate({ id: item.id, estimateId, [key]: value } as Parameters<typeof updateLineItemApi.mutate>[0]);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [updateLineItemStore, updateLineItemApi, estimateId]);

  const handleDeleteItem = useCallback((itemId: number) => {
    deleteLineItemStore(itemId);
    deleteLineItemApi.mutate({ id: itemId, estimateId });
  }, [deleteLineItemStore, deleteLineItemApi, estimateId]);

  const handleContextAction = useCallback((action: string, payload?: unknown) => {
    const p = payload as { itemId?: number; targetSectionId?: number };
    const itemId = p?.itemId;
    if (!itemId) return;
    const allItems = sections.flatMap((s) => s.lineItems ?? []);
    const item = allItems.find((i) => i.id === itemId);
    if (!item) return;

    switch (action) {
      case 'delete': handleDeleteItem(itemId); break;
      case 'duplicate': {
        const dup: EstimateLineItem = { ...item, id: -(Date.now()) };
        addLineItemStore(item.sectionId, dup);
        createLineItemApi.mutate({ ...dup, estimateId } as Parameters<typeof createLineItemApi.mutate>[0]);
        break;
      }
      case 'addAbove':
      case 'addBelow':
        handleAddItem(item.sectionId);
        break;
      case 'moveToSection':
        if (p.targetSectionId) {
          updateLineItemStore(itemId, { sectionId: p.targetSectionId });
          updateLineItemApi.mutate({ id: itemId, estimateId, sectionId: p.targetSectionId } as Parameters<typeof updateLineItemApi.mutate>[0]);
        }
        break;
    }
  }, [sections, handleDeleteItem, handleAddItem, addLineItemStore, createLineItemApi, updateLineItemStore, updateLineItemApi, estimateId]);

  const handleDragEnd = useCallback((event: DragEndEvent, sectionId: number) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;
    const items = section.lineItems ?? [];
    const oldIdx = items.findIndex((i) => String(i.id) === String(active.id));
    const newIdx = items.findIndex((i) => String(i.id) === String(over.id));
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(items, oldIdx, newIdx);
    reorderApi.mutate({ sectionId, estimateId, order: reordered.map((i) => i.id) });
  }, [sections, reorderApi, estimateId]);

  const totalColWidth = visibleCols.reduce((sum, c) => sum + c.width, 0);

  if (!estimate) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 dark:text-zinc-500">
        <p className="text-sm">No estimate loaded</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="estimate-grid">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 flex-shrink-0">
        <ColumnToggle hiddenCols={hiddenColSet} onToggle={(key) => setHiddenCols(hiddenCols.includes(key) ? hiddenCols.filter((k) => k !== key) : [...hiddenCols, key])} />
        <span className="text-xs text-gray-400 dark:text-zinc-500">
          {sections.reduce((n, s) => n + (s.lineItems?.length ?? 0), 0)} line items
        </span>
      </div>

      {/* Column headers */}
      <div
        className="flex-shrink-0 flex border-b border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/60 text-xs font-medium text-gray-500 dark:text-zinc-500 select-none"
        style={{ minWidth: totalColWidth }}
      >
        {visibleCols.map((col) => (
          <div
            key={col.key}
            className="flex items-center px-2 border-r border-gray-200 dark:border-zinc-700 py-2 uppercase tracking-wide"
            style={{ width: col.width, minWidth: col.width }}
          >
            {col.label}
          </div>
        ))}
      </div>

      {/* Scrollable body */}
      <div
        ref={parentRef}
        className="flex-1 overflow-auto"
        onClick={() => { if (contextMenu) setContextMenu(null); }}
      >
        <div style={{ height: rowVirtualizer.getTotalSize(), minWidth: totalColWidth, position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map((vRow) => {
            const row = flatRows[vRow.index];
            if (!row) return null;

            if (row.type === 'section') {
              const { subtotal } = calculateSectionTotals(row.section.lineItems ?? []);
              return (
                <div
                  key={`s-${row.section.id}`}
                  style={{ position: 'absolute', top: vRow.start, left: 0, right: 0, height: SECTION_ROW_HEIGHT }}
                >
                  <SectionHeader
                    section={row.section}
                    collapsed={collapsedSections.has(row.section.id)}
                    subtotal={subtotal}
                    onToggle={() => setCollapsedSections((prev) => {
                      const next = new Set(prev);
                      if (next.has(row.section.id)) next.delete(row.section.id); else next.add(row.section.id);
                      return next;
                    })}
                    onAddItem={() => handleAddItem(row.section.id)}
                    onRename={(name) => {
                      updateSectionStore(row.section.id, { name });
                      updateSectionApi.mutate({ id: row.section.id, estimateId, name } as Parameters<typeof updateSectionApi.mutate>[0]);
                    }}
                    onChangeColor={(color) => {
                      updateSectionStore(row.section.id, { color });
                      updateSectionApi.mutate({ id: row.section.id, estimateId, color } as Parameters<typeof updateSectionApi.mutate>[0]);
                    }}
                    onDelete={() => {
                      deleteSectionStore(row.section.id);
                      deleteSectionApi.mutate({ id: row.section.id, estimateId });
                    }}
                  />
                </div>
              );
            }

            if (!row.item) return null;
            const item = row.item;
            const isSelected = selectedRows.has(item.id);
            const indent = item.parentItemId ? 24 : 0;

            return (
              <div
                key={`i-${item.id}`}
                style={{ position: 'absolute', top: vRow.start, left: 0, right: 0, height: ITEM_ROW_HEIGHT }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, itemId: item.id, sectionId: row.section.id });
                }}
              >
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(ev) => handleDragEnd(ev, row.section.id)}
                >
                  <SortableContext
                    items={(row.section.lineItems ?? []).map((i) => String(i.id))}
                    strategy={verticalListSortingStrategy}
                  >
                    <SortableRow id={String(item.id)}>
                      {(listeners) => (
                        <div
                          className={`flex border-b border-gray-100 dark:border-zinc-800 ${isSelected ? 'bg-orange-50/60 dark:bg-orange-900/15' : ''}`}
                          style={{ paddingLeft: indent }}
                          onClick={(e) => {
                            if (e.shiftKey) {
                              setSelectedRows((prev) => new Set([...prev, item.id]));
                            } else if (e.ctrlKey || e.metaKey) {
                              setSelectedRows((prev) => {
                                const next = new Set(prev);
                                if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                                return next;
                              });
                            } else {
                              setSelectedRows(new Set([item.id]));
                            }
                          }}
                        >
                          {visibleCols.map((col) => {
                            if (col.key === 'drag') {
                              return (
                                <div
                                  key="drag"
                                  data-testid="drag-handle"
                                  className="flex items-center justify-center cursor-grab text-gray-300 dark:text-zinc-700 hover:text-gray-500 dark:hover:text-zinc-400 flex-shrink-0 border-r border-gray-100 dark:border-zinc-800"
                                  style={{ width: col.width, minWidth: col.width, height: ITEM_ROW_HEIGHT }}
                                  {...listeners}
                                >
                                  <GripVertical className="w-3 h-3" />
                                </div>
                              );
                            }
                            const cellId = `${item.id}-${col.key}` as CellId;
                            return (
                              <GridCell
                                key={col.key}
                                item={item}
                                col={col}
                                isActive={activeCell === cellId}
                                isSelected={isSelected}
                                rowNum={row.itemIndexInSection + 1}
                                onClick={(e) => {
                                  setActiveCell(cellId);
                                  if (!e.shiftKey && !e.ctrlKey && !e.metaKey) setSelectedRows(new Set([item.id]));
                                }}
                                onUpdate={(key, value) => handleCellUpdate(item, key, value)}
                                onTabNext={() => navigateCell('right')}
                                onEnterDown={() => navigateCell('down')}
                                onArrow={(dir) => navigateCell(dir)}
                              />
                            );
                          })}
                        </div>
                      )}
                    </SortableRow>
                  </SortableContext>
                </DndContext>
              </div>
            );
          })}
        </div>
      </div>

      {/* Context menu */}
      <AnimatePresence>
        {contextMenu && (
          <RowContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            itemId={contextMenu.itemId}
            sectionId={contextMenu.sectionId}
            sections={sections}
            onClose={() => setContextMenu(null)}
            onAction={(action, payload) => { handleContextAction(action, payload); setContextMenu(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
