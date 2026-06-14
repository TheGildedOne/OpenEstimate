import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, FileText, AlertCircle, CheckCircle2, ArrowRight, ChevronDown } from 'lucide-react';
import { useCostCategories, useCreateCostItem } from '@/lib/api';
import { useUIStore } from '@/store/uiStore';
import type { CostCategory } from '@openestimate/shared';

interface ParsedRow {
  name: string;
  description: string;
  unit: string;
  materialCost: number;
  laborCost: number;
  laborHours: number;
  raw: Record<string, string>;
  errors: string[];
}

// Column mapping keys
type MappingKey = 'name' | 'description' | 'unit' | 'materialCost' | 'laborCost' | 'laborHours';

const REQUIRED_COLS: MappingKey[] = ['name', 'unit'];
const ALL_COLS: { key: MappingKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'description', label: 'Description' },
  { key: 'unit', label: 'Unit' },
  { key: 'materialCost', label: 'Material Cost' },
  { key: 'laborCost', label: 'Labor Cost' },
  { key: 'laborHours', label: 'Labor Hours' },
];

function guessMapping(headers: string[]): Partial<Record<MappingKey, string>> {
  const lc = headers.map((h) => h.toLowerCase().trim());
  const mapping: Partial<Record<MappingKey, string>> = {};

  const try_ = (key: MappingKey, patterns: string[]) => {
    for (const p of patterns) {
      const idx = lc.findIndex((h) => h.includes(p));
      if (idx !== -1) { mapping[key] = headers[idx]; return; }
    }
  };

  try_('name', ['name', 'description', 'item']);
  try_('description', ['desc', 'detail', 'note']);
  try_('unit', ['unit', 'uom', 'measure']);
  try_('materialCost', ['mat', 'material', 'mat cost', 'material cost', 'mat$']);
  try_('laborCost', ['labor cost', 'labour cost', 'labor$', 'lab cost']);
  try_('laborHours', ['labor hr', 'labour hr', 'hours', 'man hour', 'labor hours']);

  return mapping;
}

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map((line) => {
    const vals = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });
    return row;
  });
  return { headers, rows };
}

function validateRow(row: Record<string, string>, mapping: Partial<Record<MappingKey, string>>): ParsedRow {
  const errors: string[] = [];
  const name = mapping.name ? (row[mapping.name] ?? '').trim() : '';
  const unit = mapping.unit ? (row[mapping.unit] ?? '').trim() : '';

  if (!name) errors.push('Name is required');
  if (!unit) errors.push('Unit is required');

  const parseMoney = (key: MappingKey) => {
    if (!mapping[key]) return 0;
    const raw = (row[mapping[key]!] ?? '').replace(/[$,]/g, '').trim();
    const n = parseFloat(raw);
    return isNaN(n) ? 0 : n;
  };

  return {
    name,
    description: mapping.description ? (row[mapping.description] ?? '') : '',
    unit,
    materialCost: parseMoney('materialCost'),
    laborCost: parseMoney('laborCost'),
    laborHours: parseMoney('laborHours'),
    raw: row,
    errors,
  };
}

interface ImportModalProps {
  onClose: () => void;
  defaultCategoryId?: number | null;
}

export default function ImportModal({ onClose, defaultCategoryId = null }: ImportModalProps) {
  const { data: categories = [] } = useCostCategories();
  const createItem = useCreateCostItem();
  const { showSuccess, showError } = useUIStore();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [csvText, setCsvText] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<MappingKey, string>>>({});
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(defaultCategoryId ?? null);
  const [isDragging, setIsDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const flatCategories = React.useMemo(() => {
    const flatten = (cats: CostCategory[], depth = 0): Array<CostCategory & { depth: number }> =>
      cats.flatMap((c) => [{ ...c, depth }, ...flatten(c.children ?? [], depth + 1)]);
    return flatten(categories);
  }, [categories]);

  const processFile = useCallback((text: string) => {
    setCsvText(text);
    const { headers: h, rows: r } = parseCSV(text);
    setHeaders(h);
    setRawRows(r);
    const guessed = guessMapping(h);
    setMapping(guessed);
  }, []);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => processFile(e.target?.result as string ?? '');
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) handleFile(file);
  };

  const handleNext = () => {
    const rows = rawRows.map((r) => validateRow(r, mapping));
    setParsedRows(rows);
    setStep(2);
  };

  const handleImport = async () => {
    setImporting(true);
    let imported = 0;
    const errors: string[] = [];

    for (const row of parsedRows) {
      if (row.errors.length > 0) {
        errors.push(`"${row.name || 'unnamed'}": ${row.errors.join(', ')}`);
        continue;
      }
      try {
        await createItem.mutateAsync({
          name: row.name,
          description: row.description || null,
          unit: row.unit,
          defaultMaterialCost: row.materialCost,
          defaultLaborCost: row.laborCost,
          defaultLaborHours: row.laborHours,
          categoryId: selectedCategoryId ?? undefined,
        });
        imported++;
      } catch {
        errors.push(`"${row.name}": Failed to create`);
      }
    }

    setImportResult({ imported, errors });
    setImporting(false);
    setStep(3);
    if (imported > 0) showSuccess(`Imported ${imported} item(s)`);
  };

  const validRows = parsedRows.filter((r) => r.errors.length === 0);
  const invalidRows = parsedRows.filter((r) => r.errors.length > 0);

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
          className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col"
          initial={{ scale: 0.95, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white text-lg">Import Cost Items</h2>
              <div className="flex items-center gap-2 mt-1">
                {([1, 2, 3] as const).map((s) => (
                  <React.Fragment key={s}>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        step === s
                          ? 'bg-orange-500 text-white'
                          : step > s
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                      }`}
                    >
                      {s === 1 ? 'Upload' : s === 2 ? 'Map & Preview' : 'Result'}
                    </span>
                    {s < 3 && <ArrowRight className="w-3.5 h-3.5 text-gray-300" />}
                  </React.Fragment>
                ))}
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Step 1: Upload */}
            {step === 1 && (
              <div className="space-y-6">
                {/* Drop zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                    isDragging
                      ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/20'
                      : 'border-gray-300 dark:border-gray-600 hover:border-orange-400 hover:bg-orange-50/50 dark:hover:bg-orange-900/10'
                  }`}
                >
                  <Upload className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Drag & drop a CSV file here
                  </p>
                  <p className="text-xs text-gray-400 mt-1">or click to browse</p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                  />
                </div>

                {/* Column mapping */}
                {headers.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                      Column Mapping
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {ALL_COLS.map(({ key, label }) => (
                        <div key={key}>
                          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                            {label} {REQUIRED_COLS.includes(key) && <span className="text-red-400">*</span>}
                          </label>
                          <select
                            value={mapping[key] ?? ''}
                            onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value || undefined }))}
                            className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                          >
                            <option value="">(skip)</option>
                            {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Preview first 10 rows */}
                {rawRows.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Preview (first {Math.min(10, rawRows.length)} rows)
                    </h3>
                    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                      <table className="min-w-full text-xs">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                          <tr>
                            {headers.map((h) => (
                              <th key={h} className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {rawRows.slice(0, 10).map((row, i) => (
                            <tr key={i}>
                              {headers.map((h) => (
                                <td key={h} className="px-3 py-1.5 text-gray-600 dark:text-gray-400 max-w-[120px] truncate">
                                  {row[h]}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{rawRows.length} total rows in CSV</p>
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Select category + preview */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Default category for imported items
                  </label>
                  <select
                    value={selectedCategoryId ?? ''}
                    onChange={(e) => setSelectedCategoryId(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">(No category)</option>
                    {flatCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {'  '.repeat(c.depth)}{c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Valid rows */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {validRows.length} valid items to import
                    </span>
                  </div>
                  {validRows.length > 0 && (
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400">Name</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400">Unit</th>
                            <th className="px-3 py-2 text-right font-medium text-gray-500 dark:text-gray-400">Material $</th>
                            <th className="px-3 py-2 text-right font-medium text-gray-500 dark:text-gray-400">Labor $</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {validRows.slice(0, 20).map((row, i) => (
                            <tr key={i}>
                              <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300 truncate max-w-[180px]">{row.name}</td>
                              <td className="px-3 py-1.5 text-gray-500">{row.unit}</td>
                              <td className="px-3 py-1.5 text-right text-gray-500">${row.materialCost.toFixed(2)}</td>
                              <td className="px-3 py-1.5 text-right text-gray-500">${row.laborCost.toFixed(2)}</td>
                            </tr>
                          ))}
                          {validRows.length > 20 && (
                            <tr>
                              <td colSpan={4} className="px-3 py-2 text-center text-gray-400 text-xs">
                                …and {validRows.length - 20} more
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Errors */}
                {invalidRows.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="w-4 h-4 text-red-500" />
                      <span className="text-sm font-medium text-red-600 dark:text-red-400">
                        {invalidRows.length} rows have errors (will be skipped)
                      </span>
                    </div>
                    <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 space-y-1 max-h-32 overflow-y-auto">
                      {invalidRows.map((row, i) => (
                        <div key={i} className="text-xs text-red-600 dark:text-red-400">
                          Row {parsedRows.indexOf(row) + 2}: {row.errors.join(', ')} {row.name ? `(${row.name})` : ''}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Result */}
            {step === 3 && importResult && (
              <div className="flex flex-col items-center justify-center py-8 gap-4">
                {importResult.imported > 0 ? (
                  <>
                    <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                      <CheckCircle2 className="w-8 h-8 text-green-500" />
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-semibold text-gray-900 dark:text-white">
                        {importResult.imported} item{importResult.imported !== 1 ? 's' : ''} imported!
                      </p>
                      {importResult.errors.length > 0 && (
                        <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                          {importResult.errors.length} items failed
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                      <AlertCircle className="w-8 h-8 text-red-500" />
                    </div>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">Import failed</p>
                  </>
                )}
                {importResult.errors.length > 0 && (
                  <div className="w-full bg-red-50 dark:bg-red-900/20 rounded-lg p-3 max-h-32 overflow-y-auto">
                    {importResult.errors.map((e, i) => (
                      <p key={i} className="text-xs text-red-600 dark:text-red-400">{e}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              {step === 3 ? 'Close' : 'Cancel'}
            </button>
            {step === 1 && (
              <button
                onClick={handleNext}
                disabled={rawRows.length === 0 || !mapping.name || !mapping.unit}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                Next
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
            {step === 2 && (
              <div className="flex gap-2">
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleImport}
                  disabled={validRows.length === 0 || importing}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {importing ? (
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  Import {validRows.length} Item{validRows.length !== 1 ? 's' : ''}
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
