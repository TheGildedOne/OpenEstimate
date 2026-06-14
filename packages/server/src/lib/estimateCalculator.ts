/**
 * Estimate Calculator – pure functions, no DB calls.
 *
 * Formula reference:
 *   totalMaterial = quantity * unitMaterialCost * (1 + wasteFactorPct / 100)
 *   totalLabor    = quantity * (unitLaborCost + laborHours * laborRate)
 *   totalCost     = totalMaterial + totalLabor
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface LineItemInput {
  quantity: number;
  unitMaterialCost: number;
  unitLaborCost: number;
  laborHours: number;
  laborRate: number;
  wasteFactorPct: number;
}

export interface LineItemResult {
  totalMaterial: number;
  totalLabor: number;
  totalCost: number;
}

export interface SectionTotalsResult {
  totalMaterial: number;
  totalLabor: number;
  totalCost: number;
  totalLaborHours: number;
}

export interface EstimateTotalsInput {
  subtotal: number;
  overheadPct: number;
  profitPct: number;
  taxPct: number;
  bondPct: number;
}

export interface EstimateTotalsResult {
  subtotal: number;
  overheadAmt: number;
  profitAmt: number;
  taxAmt: number;
  bondAmt: number;
  grandTotal: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core calculation helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Round a value to the nearest cent (2 decimal places). */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate totals for a single line item.
 *
 * totalMaterial = quantity × unitMaterialCost × (1 + wasteFactorPct / 100)
 * totalLabor    = quantity × (unitLaborCost + laborHours × laborRate)
 * totalCost     = totalMaterial + totalLabor
 */
export function calculateLineItem(item: LineItemInput): LineItemResult {
  const { quantity, unitMaterialCost, unitLaborCost, laborHours, laborRate, wasteFactorPct } =
    item;

  const wasteFactor = 1 + wasteFactorPct / 100;
  const totalMaterial = round2(quantity * unitMaterialCost * wasteFactor);
  const totalLabor = round2(quantity * (unitLaborCost + laborHours * laborRate));
  const totalCost = round2(totalMaterial + totalLabor);

  return { totalMaterial, totalLabor, totalCost };
}

/**
 * Aggregate totals for a collection of line items (one section or entire estimate).
 *
 * totalLaborHours = sum of (quantity × laborHours) for each item.
 */
export function calculateSectionTotals(items: LineItemInput[]): SectionTotalsResult {
  let totalMaterial = 0;
  let totalLabor = 0;
  let totalLaborHours = 0;

  for (const item of items) {
    const calc = calculateLineItem(item);
    totalMaterial += calc.totalMaterial;
    totalLabor += calc.totalLabor;
    totalLaborHours += item.quantity * item.laborHours;
  }

  return {
    totalMaterial: round2(totalMaterial),
    totalLabor: round2(totalLabor),
    totalCost: round2(totalMaterial + totalLabor),
    totalLaborHours: round2(totalLaborHours),
  };
}

/**
 * Calculate estimate-level totals from the direct cost subtotal and
 * overhead / profit / tax / bond percentages.
 *
 * Calculation order (industry standard):
 *  overheadAmt  = subtotal × overheadPct / 100
 *  profitAmt    = (subtotal + overheadAmt) × profitPct / 100
 *  preTaxTotal  = subtotal + overheadAmt + profitAmt
 *  taxAmt       = preTaxTotal × taxPct / 100
 *  bondAmt      = (preTaxTotal + taxAmt) × bondPct / 100
 *  grandTotal   = preTaxTotal + taxAmt + bondAmt
 */
export function calculateEstimateTotals({
  subtotal,
  overheadPct,
  profitPct,
  taxPct,
  bondPct,
}: EstimateTotalsInput): EstimateTotalsResult {
  const overheadAmt = round2(subtotal * (overheadPct / 100));
  const profitAmt = round2((subtotal + overheadAmt) * (profitPct / 100));
  const preTaxTotal = subtotal + overheadAmt + profitAmt;
  const taxAmt = round2(preTaxTotal * (taxPct / 100));
  const bondAmt = round2((preTaxTotal + taxAmt) * (bondPct / 100));
  const grandTotal = round2(preTaxTotal + taxAmt + bondAmt);

  return {
    subtotal: round2(subtotal),
    overheadAmt,
    profitAmt,
    taxAmt,
    bondAmt,
    grandTotal,
  };
}

/**
 * Convenience: given a list of all line items across an estimate, compute
 * the full estimate breakdown in one call.
 */
export function calculateFullEstimate(
  items: LineItemInput[],
  overheadPct: number,
  profitPct: number,
  taxPct: number,
  bondPct: number
): SectionTotalsResult & EstimateTotalsResult {
  const sectionTotals = calculateSectionTotals(items);
  const estimateTotals = calculateEstimateTotals({
    subtotal: sectionTotals.totalCost,
    overheadPct,
    profitPct,
    taxPct,
    bondPct,
  });

  return {
    ...sectionTotals,
    ...estimateTotals,
    // Override subtotal from estimateTotals (identical to sectionTotals.totalCost)
    subtotal: estimateTotals.subtotal,
  };
}

/**
 * Annotate a list of line item records with their computed totals.
 * Does not mutate the originals – returns new objects.
 */
export function annotateLineItems<T extends LineItemInput>(
  items: T[]
): (T & LineItemResult)[] {
  return items.map((item) => ({
    ...item,
    ...calculateLineItem(item),
  }));
}
