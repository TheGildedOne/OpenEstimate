/**
 * excel.ts
 *
 * Generate a formatted Excel workbook (.xlsx) for an estimate using ExcelJS.
 *
 * Workbook structure:
 *   Sheet "Summary"  – company/project header, section subtotals table, margin totals, grand total
 *   One sheet per section – full line-item detail with all columns, styled rows, subtotal footer
 *
 * Export: generateEstimateExcel(opts) → Promise<Buffer>
 */

import ExcelJS from 'exceljs';
import type { EstimateTotalsResult, SectionTotalsResult } from '../../lib/estimateCalculator';

// ─────────────────────────────────────────────────────────────────────────────
// Types (matching the shape built by loadFullEstimate in export.ts)
// ─────────────────────────────────────────────────────────────────────────────

interface LineItemWithTotals {
  id?: number;
  description: string;
  quantity: number;
  unit: string;
  unitMaterialCost: number;
  unitLaborCost: number;
  laborHours: number;
  laborRate: number;
  wasteFactorPct: number;
  isAssembly?: boolean;
  parentItemId?: number | null;
  notes?: string | null;
  // computed by calculateLineItem – merged in by the route
  totalMaterial: number;
  totalLabor: number;
  totalCost: number;
}

interface SectionWithItems extends SectionTotalsResult {
  id: number;
  name: string;
  color?: string | null;
  lineItems: LineItemWithTotals[];
}

interface FullEstimate {
  id: number;
  name: string;
  overheadPct: number;
  profitPct: number;
  taxPct: number;
  bondPct: number;
  notes?: string | null;
  sections: SectionWithItems[];
  totals: SectionTotalsResult & EstimateTotalsResult;
}

interface ProjectLike {
  name: string;
  clientName: string;
  siteAddress?: string | null;
}

export interface ExcelOptions {
  estimate: FullEstimate;
  project: ProjectLike;
}

// ─────────────────────────────────────────────────────────────────────────────
// Color constants (ARGB hex, no leading #)
// ─────────────────────────────────────────────────────────────────────────────

const ARGB_BLUE       = 'FF1E40AF';
const ARGB_BLUE_LIGHT = 'FFDBEAFE';
const ARGB_WHITE      = 'FFFFFFFF';
const ARGB_ALT        = 'FFF1F5F9';
const ARGB_SUBTOTAL   = 'FFE0E7FF';
const ARGB_GRAND      = 'FF1E40AF';
const ARGB_GRAND_FG   = 'FFFFFFFF';
const ARGB_GRAY_FG    = 'FF64748B';
const ARGB_RED        = 'FFB91C1C';

const CURRENCY_FMT = '$#,##0.00';
const DECIMAL_FMT  = '#,##0.00';
const PCT_FMT      = '0.00"%"';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Sanitise a value to be safe as an Excel sheet name (max 31 chars, no :\/?*[]). */
function safeSheetName(name: string, maxLen = 31): string {
  return name.replace(/[:\\/?*[\]]/g, '').slice(0, maxLen).trim() || 'Sheet';
}

/** Parse a #RRGGBB hex string into an ARGB string for ExcelJS (FF prefix). */
function hexToArgb(hex: string | null | undefined, fallback: string): string {
  if (!hex) return fallback;
  const h = hex.replace('#', '');
  if (h.length === 6) return `FF${h.toUpperCase()}`;
  if (h.length === 8) return h.toUpperCase();
  return fallback;
}

/** Estimate content width for a column based on the widest value seen. */
function autoWidth(values: (string | number | null | undefined)[], header: string, min = 8, max = 60): number {
  const headerLen = header.length + 2;
  const maxValLen = values.reduce<number>((acc, v) => {
    if (v == null) return acc;
    const len = String(v).length;
    return len > acc ? len : acc;
  }, 0);
  return Math.min(max, Math.max(min, headerLen, maxValLen + 2));
}

// ─────────────────────────────────────────────────────────────────────────────
// Style helpers
// ─────────────────────────────────────────────────────────────────────────────

function solidFill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function thinBorder(color = 'FFD1D5DB'): Partial<ExcelJS.Borders> {
  return {
    top:    { style: 'thin', color: { argb: color } },
    bottom: { style: 'thin', color: { argb: color } },
    left:   { style: 'thin', color: { argb: color } },
    right:  { style: 'thin', color: { argb: color } },
  };
}

function applyHeaderStyle(
  row: ExcelJS.Row,
  bgArgb: string = ARGB_BLUE,
  fgArgb: string = ARGB_WHITE
): void {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = solidFill(bgArgb);
    cell.font = { color: { argb: fgArgb }, bold: true, size: 10, name: 'Calibri' };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thinBorder('FFffffff');
  });
  row.height = 24;
}

function applyDataRow(row: ExcelJS.Row, altBg: boolean): void {
  const bg = altBg ? ARGB_ALT : ARGB_WHITE;
  row.eachCell({ includeEmpty: true }, (cell) => {
    if (!cell.fill || (cell.fill as ExcelJS.FillPattern).pattern !== 'solid') {
      cell.fill = solidFill(bg);
    }
    cell.font = { size: 9.5, name: 'Calibri' };
    cell.alignment = { vertical: 'top', wrapText: false };
    cell.border = thinBorder();
  });
  row.height = 18;
}

function applyCurrency(cell: ExcelJS.Cell): void {
  cell.numFmt = CURRENCY_FMT;
  cell.alignment = { horizontal: 'right', vertical: 'top' };
}

function applySubtotalRow(row: ExcelJS.Row): void {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = solidFill(ARGB_SUBTOTAL);
    cell.font = { bold: true, size: 10, name: 'Calibri' };
    cell.border = {
      top:    { style: 'medium', color: { argb: ARGB_BLUE } },
      bottom: { style: 'thin',   color: { argb: ARGB_BLUE } },
      left:   { style: 'thin',   color: { argb: 'FFD1D5DB' } },
      right:  { style: 'thin',   color: { argb: 'FFD1D5DB' } },
    };
  });
  row.height = 20;
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary sheet
// ─────────────────────────────────────────────────────────────────────────────

function buildSummarySheet(
  wb: ExcelJS.Workbook,
  estimate: FullEstimate,
  project: ProjectLike
): void {
  const ws = wb.addWorksheet('Summary', {
    views: [{ state: 'frozen', ySplit: 6 }],
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // ── Title block ──────────────────────────────────────────────────────────

  // Row 1: Estimate name
  ws.mergeCells('A1:E1');
  const r1 = ws.getRow(1);
  r1.getCell(1).value = estimate.name;
  r1.getCell(1).font  = { bold: true, size: 16, color: { argb: ARGB_BLUE }, name: 'Calibri' };
  r1.getCell(1).fill  = solidFill(ARGB_BLUE_LIGHT);
  r1.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
  r1.height = 32;

  // Row 2: Project + client
  ws.mergeCells('A2:E2');
  const r2 = ws.getRow(2);
  r2.getCell(1).value = `Project: ${project.name}   |   Client: ${project.clientName}`;
  r2.getCell(1).font  = { size: 11, name: 'Calibri', color: { argb: ARGB_GRAY_FG } };
  r2.getCell(1).fill  = solidFill(ARGB_BLUE_LIGHT);
  r2.height = 20;

  // Row 3: Site address
  if (project.siteAddress) {
    ws.mergeCells('A3:E3');
    const r3 = ws.getRow(3);
    r3.getCell(1).value = `Site: ${project.siteAddress}`;
    r3.getCell(1).font  = { size: 10, name: 'Calibri', color: { argb: ARGB_GRAY_FG } };
    r3.getCell(1).fill  = solidFill(ARGB_BLUE_LIGHT);
    r3.height = 18;
  }

  // Row 4: Generated date
  const dateRowNum = project.siteAddress ? 4 : 3;
  ws.mergeCells(`A${dateRowNum}:E${dateRowNum}`);
  ws.getRow(dateRowNum).getCell(1).value = `Generated: ${dateStr}`;
  ws.getRow(dateRowNum).getCell(1).font  = { size: 9, name: 'Calibri', italic: true, color: { argb: ARGB_GRAY_FG } };
  ws.getRow(dateRowNum).getCell(1).fill  = solidFill(ARGB_BLUE_LIGHT);
  ws.getRow(dateRowNum).height = 16;

  // Spacer row before section table
  const spacerRow = dateRowNum + 1;
  ws.getRow(spacerRow).height = 8;

  // ── Section breakdown table ───────────────────────────────────────────────

  ws.columns = [
    { key: 'section',  width: 40 },
    { key: 'material', width: 16 },
    { key: 'labor',    width: 16 },
    { key: 'cost',     width: 16 },
    { key: 'pct',      width: 12 },
  ];

  const hdrRowNum = spacerRow + 1;
  const hdrRow = ws.getRow(hdrRowNum);
  hdrRow.values = ['Section', 'Total Material', 'Total Labor', 'Total Cost', '% of Total'];
  applyHeaderStyle(hdrRow, ARGB_BLUE, ARGB_WHITE);

  const grandTotal = estimate.totals.grandTotal;

  let dataRowIdx = 0;
  for (const sec of estimate.sections) {
    const row = ws.addRow({
      section:  sec.name,
      material: sec.totalMaterial,
      labor:    sec.totalLabor,
      cost:     sec.totalCost,
      pct:      grandTotal > 0 ? sec.totalCost / grandTotal : 0,
    });

    applyDataRow(row, dataRowIdx % 2 === 1);
    applyCurrency(row.getCell('material'));
    applyCurrency(row.getCell('labor'));
    applyCurrency(row.getCell('cost'));
    row.getCell('pct').numFmt = '0.0%';
    row.getCell('pct').alignment = { horizontal: 'right' };
    row.getCell('section').font = { size: 9.5, name: 'Calibri' };

    // Tint section cell with section color
    const secArgb = hexToArgb(sec.color, ARGB_WHITE);
    if (secArgb !== ARGB_WHITE) {
      row.getCell('section').fill = solidFill(secArgb.replace(/^FF/, 'CC')); // 80% opacity
    }

    dataRowIdx++;
  }

  // Subtotal row (sum of sections)
  const subRow = ws.addRow({
    section:  'Subtotal (Direct Costs)',
    material: estimate.totals.totalMaterial,
    labor:    estimate.totals.totalLabor,
    cost:     estimate.totals.subtotal,
    pct:      '',
  });
  applySubtotalRow(subRow);
  applyCurrency(subRow.getCell('material'));
  applyCurrency(subRow.getCell('labor'));
  applyCurrency(subRow.getCell('cost'));

  // Spacer
  ws.addRow([]);

  // ── Margin detail rows ────────────────────────────────────────────────────

  const addMarginRow = (label: string, pct: string, amt: number): void => {
    const row = ws.addRow(['', '', label, pct, amt]);
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = solidFill(ARGB_SUBTOTAL);
      cell.font = { size: 9.5, name: 'Calibri' };
      cell.border = thinBorder();
    });
    row.getCell(4).alignment = { horizontal: 'right' };
    row.getCell(5).numFmt = CURRENCY_FMT;
    row.getCell(5).alignment = { horizontal: 'right' };
    row.height = 18;
  };

  addMarginRow('Overhead / General Conditions', `${estimate.overheadPct}%`, estimate.totals.overheadAmt);
  addMarginRow('Profit',                         `${estimate.profitPct}%`,  estimate.totals.profitAmt);
  if (estimate.taxPct > 0 || estimate.totals.taxAmt > 0) {
    addMarginRow('Estimated Tax', `${estimate.taxPct}%`, estimate.totals.taxAmt);
  }
  if (estimate.bondPct > 0 || estimate.totals.bondAmt > 0) {
    addMarginRow('Bond', `${estimate.bondPct}%`, estimate.totals.bondAmt);
  }

  // ── Grand total row ───────────────────────────────────────────────────────
  const gtRow = ws.addRow(['', '', 'GRAND TOTAL', '', estimate.totals.grandTotal]);
  gtRow.eachCell({ includeEmpty: true }, (cell, col) => {
    cell.fill = solidFill(ARGB_GRAND);
    cell.font = { bold: true, size: 12, name: 'Calibri', color: { argb: ARGB_WHITE } };
    cell.border = thinBorder(ARGB_BLUE);
    if (col === 5) {
      cell.numFmt = CURRENCY_FMT;
      cell.alignment = { horizontal: 'right' };
    }
  });
  gtRow.height = 26;

  // ── Labor hours footer ────────────────────────────────────────────────────
  ws.addRow([]);
  const lhRow = ws.addRow([`Total Labor Hours: ${estimate.totals.totalLaborHours.toFixed(1)} hrs`]);
  lhRow.getCell(1).font = { italic: true, color: { argb: ARGB_GRAY_FG }, name: 'Calibri' };

  if (estimate.notes) {
    ws.addRow([]);
    const notesHeader = ws.addRow(['Notes:']);
    notesHeader.getCell(1).font = { bold: true, name: 'Calibri' };
    const notesRow = ws.addRow([estimate.notes]);
    notesRow.getCell(1).alignment = { wrapText: true };
    notesRow.height = 60;
    ws.mergeCells(`A${notesRow.number}:E${notesRow.number}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section sheet
// ─────────────────────────────────────────────────────────────────────────────

function buildSectionSheet(
  wb: ExcelJS.Workbook,
  section: SectionWithItems,
  sectionIndex: number
): void {
  const sheetName = safeSheetName(`${sectionIndex + 1}. ${section.name}`);
  const ws = wb.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 2 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  // Section header color from section.color, fallback to blue
  const secArgb = hexToArgb(section.color, ARGB_BLUE);

  // ── Row 1: Section title (merged, colored) ────────────────────────────────
  ws.mergeCells('A1:M1');
  const titleRow = ws.getRow(1);
  titleRow.getCell(1).value = section.name;
  titleRow.getCell(1).fill  = solidFill(secArgb);
  titleRow.getCell(1).font  = {
    bold: true, size: 13, name: 'Calibri',
    color: { argb: ARGB_WHITE },
  };
  titleRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
  titleRow.height = 28;

  // ── Row 2: Column headers ─────────────────────────────────────────────────
  ws.columns = [
    { key: 'num',             header: '#',              width: 5  },
    { key: 'description',     header: 'Description',    width: 38 },
    { key: 'quantity',        header: 'Qty',            width: 8  },
    { key: 'unit',            header: 'Unit',           width: 7  },
    { key: 'unitMaterialCost',header: 'Unit Material',  width: 14 },
    { key: 'unitLaborCost',   header: 'Unit Labor',     width: 13 },
    { key: 'laborHours',      header: 'Labor Hrs',      width: 10 },
    { key: 'laborRate',       header: 'Labor Rate',     width: 11 },
    { key: 'wasteFactorPct',  header: 'Waste %',        width: 9  },
    { key: 'totalMaterial',   header: 'Total Material', width: 14 },
    { key: 'totalLabor',      header: 'Total Labor',    width: 13 },
    { key: 'totalCost',       header: 'Total Cost',     width: 13 },
    { key: 'notes',           header: 'Notes',          width: 22 },
  ];

  const hdrRow = ws.getRow(2);
  hdrRow.values = ws.columns.map((c) => c.header);
  applyHeaderStyle(hdrRow, secArgb, ARGB_WHITE);

  // ── Data rows ─────────────────────────────────────────────────────────────

  // Build parent → children map for indentation
  const parentItems = section.lineItems.filter((li) => !li.parentItemId);
  const childMap    = new Map<number, LineItemWithTotals[]>();
  for (const li of section.lineItems) {
    if (li.parentItemId != null && li.id != null) {
      const arr = childMap.get(li.parentItemId) ?? [];
      arr.push(li);
      childMap.set(li.parentItemId, arr);
    }
  }

  // Collect all items in display order (parent then children)
  const orderedItems: { item: LineItemWithTotals; indent: boolean }[] = [];
  for (const parent of parentItems) {
    orderedItems.push({ item: parent, indent: false });
    for (const child of childMap.get(parent.id ?? -1) ?? []) {
      orderedItems.push({ item: child, indent: true });
    }
  }

  // Collect description values for auto-width
  const descValues = orderedItems.map(({ item }) => item.description);

  let rowIdx = 0;
  let rowNum = 1;
  for (const { item: li, indent } of orderedItems) {
    const row = ws.addRow({
      num:              rowNum++,
      description:      (indent ? '    ↳ ' : '') + li.description,
      quantity:         li.quantity,
      unit:             li.unit,
      unitMaterialCost: li.unitMaterialCost,
      unitLaborCost:    li.unitLaborCost,
      laborHours:       li.laborHours,
      laborRate:        li.laborRate,
      wasteFactorPct:   li.wasteFactorPct,
      totalMaterial:    li.totalMaterial,
      totalLabor:       li.totalLabor,
      totalCost:        li.totalCost,
      notes:            li.notes ?? '',
    });

    applyDataRow(row, rowIdx % 2 === 1);

    // Description: left-align, wrap for children
    const descCell = row.getCell('description');
    descCell.alignment = { horizontal: 'left', vertical: 'top', wrapText: indent };
    if (indent) {
      descCell.font = { size: 9, name: 'Calibri', italic: true, color: { argb: ARGB_GRAY_FG } };
    }

    // Number format
    row.getCell('quantity').numFmt = '#,##0.##';
    row.getCell('wasteFactorPct').numFmt = DECIMAL_FMT;
    row.getCell('laborHours').numFmt = DECIMAL_FMT;

    // Currency cells
    for (const key of ['unitMaterialCost', 'unitLaborCost', 'laborRate', 'totalMaterial', 'totalLabor', 'totalCost']) {
      applyCurrency(row.getCell(key));
    }

    rowIdx++;
  }

  // ── Subtotal row ──────────────────────────────────────────────────────────
  const subtotalRow = ws.addRow({
    num:              '',
    description:      'SECTION TOTAL',
    quantity:         '',
    unit:             '',
    unitMaterialCost: '',
    unitLaborCost:    '',
    laborHours:       section.totalLaborHours,
    laborRate:        '',
    wasteFactorPct:   '',
    totalMaterial:    section.totalMaterial,
    totalLabor:       section.totalLabor,
    totalCost:        section.totalCost,
    notes:            '',
  });

  applySubtotalRow(subtotalRow);
  subtotalRow.getCell('laborHours').numFmt = DECIMAL_FMT;
  applyCurrency(subtotalRow.getCell('totalMaterial'));
  applyCurrency(subtotalRow.getCell('totalLabor'));
  applyCurrency(subtotalRow.getCell('totalCost'));
  subtotalRow.getCell('description').font = { bold: true, size: 10, name: 'Calibri', color: { argb: ARGB_BLUE } };

  // ── Auto-fit column widths ────────────────────────────────────────────────
  // Description column: based on content
  ws.getColumn('description').width = autoWidth(descValues, 'Description', 28, 56);
  ws.getColumn('notes').width = autoWidth(
    orderedItems.map(({ item }) => item.notes ?? ''),
    'Notes', 10, 40
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Public export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a formatted Excel workbook for an estimate.
 * Returns a Buffer containing the .xlsx file bytes.
 */
export async function generateEstimateExcel(opts: ExcelOptions): Promise<Buffer> {
  const { estimate, project } = opts;

  const wb = new ExcelJS.Workbook();
  wb.creator  = 'OpenEstimate';
  wb.created  = new Date();
  wb.modified = new Date();
  wb.title    = estimate.name;
  wb.subject  = `Estimate for ${project.name}`;

  // Summary sheet first
  buildSummarySheet(wb, estimate, project);

  // One sheet per section (skip empty sections)
  estimate.sections.forEach((section, i) => {
    if (section.lineItems.length > 0) {
      buildSectionSheet(wb, section, i);
    }
  });

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// Alias kept for any future callers that might use the shorter name
export const generateExcel = generateEstimateExcel;
