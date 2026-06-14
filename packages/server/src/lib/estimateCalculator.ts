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
  /** When set, this item is a child of an assembly and should be excluded from section totals. */
  parentItemId?: number | null;
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

export interface SectionInput {
  id: number;
  name?: string;
  items: LineItemInput[];
}

export interface SectionTotalsWithId extends SectionTotalsResult {
  sectionId: number;
}

export interface FullEstimateResult extends EstimateTotalsResult {
  sectionTotals: SectionTotalsWithId[];
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
  // Exclude assembly child items — their costs are rolled up into the parent assembly item
  const topLevelItems = items.filter((item) => item.parentItemId == null);

  let totalMaterial = 0;
  let totalLabor = 0;
  let totalLaborHours = 0;

  for (const item of topLevelItems) {
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
 * Compute a full estimate breakdown from an array of sections, each containing
 * their own line items. Returns per-section totals plus estimate-level totals.
 */
export function calculateFullEstimate(
  sections: SectionInput[],
  overheadPct: number,
  profitPct: number,
  taxPct: number,
  bondPct: number
): FullEstimateResult {
  const sectionTotals: SectionTotalsWithId[] = sections.map((section) => ({
    sectionId: section.id,
    ...calculateSectionTotals(section.items),
  }));

  const subtotal = round2(sectionTotals.reduce((sum, s) => sum + s.totalCost, 0));

  const estimateTotals = calculateEstimateTotals({
    subtotal,
    overheadPct,
    profitPct,
    taxPct,
    bondPct,
  });

  return {
    ...estimateTotals,
    sectionTotals,
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
