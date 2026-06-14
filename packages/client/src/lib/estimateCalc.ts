import type { EstimateLineItem, EstimateSection, EstimateTotals } from '@openestimate/shared';

// ─── Line item calculation ────────────────────────────────────────────────────

export interface LineItemTotals {
  totalMaterial: number;
  totalLabor: number;
  totalCost: number;
}

/**
 * Calculate the material, labor, and total cost for a single line item.
 * Applies waste factor to material only.
 */
export function calculateLineItem(item: EstimateLineItem): LineItemTotals {
  const qty = item.quantity ?? 0;
  const wasteFactor = 1 + (item.wasteFactorPct ?? 0) / 100;

  const totalMaterial = qty * (item.unitMaterialCost ?? 0) * wasteFactor;
  const totalLabor =
    qty * (item.unitLaborCost ?? 0) +
    (item.laborHours ?? 0) * (item.laborRate ?? 0);

  const totalCost = totalMaterial + totalLabor;

  return {
    totalMaterial: round2(totalMaterial),
    totalLabor: round2(totalLabor),
    totalCost: round2(totalCost),
  };
}

// ─── Section totals ───────────────────────────────────────────────────────────

export interface SectionTotals {
  subtotalMaterial: number;
  subtotalLabor: number;
  subtotal: number;
}

/**
 * Sum all line items within a section.
 */
export function calculateSectionTotals(items: EstimateLineItem[]): SectionTotals {
  let subtotalMaterial = 0;
  let subtotalLabor = 0;

  for (const item of items) {
    const t = calculateLineItem(item);
    subtotalMaterial += t.totalMaterial;
    subtotalLabor += t.totalLabor;
  }

  return {
    subtotalMaterial: round2(subtotalMaterial),
    subtotalLabor: round2(subtotalLabor),
    subtotal: round2(subtotalMaterial + subtotalLabor),
  };
}

// ─── Estimate totals ──────────────────────────────────────────────────────────

/**
 * Compute the full estimate cost summary given percentage add-ons.
 * All percentages are expressed as e.g. 10 for 10%.
 */
export function calculateEstimateTotals(
  subtotal: number,
  overheadPct: number,
  profitPct: number,
  taxPct: number,
  bondPct: number
): EstimateTotals {
  const overheadAmt = round2(subtotal * (overheadPct / 100));
  const afterOverhead = subtotal + overheadAmt;

  const profitAmt = round2(afterOverhead * (profitPct / 100));
  const afterProfit = afterOverhead + profitAmt;

  const taxAmt = round2(afterProfit * (taxPct / 100));
  const bondAmt = round2(afterProfit * (bondPct / 100));

  const grandTotal = round2(afterProfit + taxAmt + bondAmt);

  return {
    subtotal: round2(subtotal),
    overheadAmt,
    profitAmt,
    taxAmt,
    bondAmt,
    grandTotal,
  };
}

// ─── Full estimate rollup ─────────────────────────────────────────────────────

export interface FullEstimateTotals extends EstimateTotals {
  sectionSubtotals: Record<number, SectionTotals>;
}

export function calculateFullEstimateTotals(
  sections: EstimateSection[],
  overheadPct: number,
  profitPct: number,
  taxPct: number,
  bondPct: number
): FullEstimateTotals {
  const sectionSubtotals: Record<number, SectionTotals> = {};
  let grandSubtotal = 0;

  for (const section of sections) {
    const totals = calculateSectionTotals(section.lineItems ?? []);
    sectionSubtotals[section.id] = totals;
    grandSubtotal += totals.subtotal;
  }

  const estimateTotals = calculateEstimateTotals(
    grandSubtotal,
    overheadPct,
    profitPct,
    taxPct,
    bondPct
  );

  return {
    ...estimateTotals,
    sectionSubtotals,
  };
}

// ─── Formatting ───────────────────────────────────────────────────────────────

/**
 * Format a number as currency.
 * @param amount  Numeric value to format
 * @param currency  ISO 4217 currency code (default: USD)
 */
export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format a percentage for display.
 */
export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
