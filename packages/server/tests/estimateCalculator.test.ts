import { describe, it, expect } from 'vitest';
import {
  calculateLineItem,
  calculateSectionTotals,
  calculateEstimateTotals,
  calculateFullEstimate,
} from '../src/lib/estimateCalculator';
import type { EstimateLineItem } from '@openestimate/shared';

// Helper to create a line item with defaults
function makeItem(overrides: Partial<EstimateLineItem>): EstimateLineItem {
  return {
    id: 1,
    sectionId: 1,
    estimateId: 1,
    description: 'Test item',
    quantity: 1,
    unit: 'EA',
    unitMaterialCost: 0,
    unitLaborCost: 0,
    laborHours: 0,
    laborRate: 0,
    wasteFactorPct: 0,
    notes: null,
    costDbItemId: null,
    sortOrder: 0,
    isAssembly: false,
    parentItemId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('calculateLineItem', () => {
  it('calculates zero costs for empty item', () => {
    const item = makeItem({});
    const result = calculateLineItem(item);
    expect(result.totalMaterial).toBe(0);
    expect(result.totalLabor).toBe(0);
    expect(result.totalCost).toBe(0);
  });

  it('calculates material cost correctly', () => {
    const item = makeItem({ quantity: 10, unitMaterialCost: 5.0 });
    const result = calculateLineItem(item);
    expect(result.totalMaterial).toBe(50.0);
  });

  it('applies waste factor to material cost', () => {
    // 10 qty * $5 material * (1 + 10% waste) = 10 * 5 * 1.1 = $55
    const item = makeItem({ quantity: 10, unitMaterialCost: 5.0, wasteFactorPct: 10 });
    const result = calculateLineItem(item);
    expect(result.totalMaterial).toBe(55.0);
  });

  it('calculates labor cost from unit labor cost', () => {
    // 10 qty * $8 unit labor = $80
    const item = makeItem({ quantity: 10, unitLaborCost: 8.0 });
    const result = calculateLineItem(item);
    expect(result.totalLabor).toBe(80.0);
  });

  it('calculates labor cost from labor hours * rate', () => {
    // 10 qty * 0.5 hrs/unit * $65/hr = $325
    const item = makeItem({ quantity: 10, laborHours: 0.5, laborRate: 65 });
    const result = calculateLineItem(item);
    expect(result.totalLabor).toBe(325.0);
  });

  it('combines unit labor cost and hourly labor cost', () => {
    // totalLabor = qty * (unitLaborCost + laborHours * laborRate)
    // = 10 * (8 + 0.5 * 65) = 10 * (8 + 32.5) = 10 * 40.5 = $405
    const item = makeItem({
      quantity: 10,
      unitLaborCost: 8.0,
      laborHours: 0.5,
      laborRate: 65,
    });
    const result = calculateLineItem(item);
    expect(result.totalLabor).toBe(405.0);
  });

  it('calculates totalCost as sum of material and labor', () => {
    const item = makeItem({
      quantity: 10,
      unitMaterialCost: 5.0,
      unitLaborCost: 8.0,
      wasteFactorPct: 10,
    });
    const result = calculateLineItem(item);
    // material: 10 * 5 * 1.1 = 55, labor: 10 * 8 = 80
    expect(result.totalMaterial).toBe(55.0);
    expect(result.totalLabor).toBe(80.0);
    expect(result.totalCost).toBe(135.0);
  });

  it('handles large quantities and prices without floating point errors', () => {
    const item = makeItem({
      quantity: 1234,
      unitMaterialCost: 45.99,
      wasteFactorPct: 5,
    });
    const result = calculateLineItem(item);
    // Expected: 1234 * 45.99 * 1.05 = ~59,589.24 (rounded to 2 dp)
    expect(result.totalMaterial).toBeCloseTo(59589.24, 1);
  });

  it('rounds to 2 decimal places', () => {
    const item = makeItem({ quantity: 3, unitMaterialCost: 0.1 });
    const result = calculateLineItem(item);
    // 3 * 0.1 = 0.30000000000000004 in JS, should be 0.30
    expect(result.totalMaterial).toBe(0.3);
  });
});

describe('calculateSectionTotals', () => {
  it('returns zeros for empty item list', () => {
    const result = calculateSectionTotals([]);
    expect(result.totalMaterial).toBe(0);
    expect(result.totalLabor).toBe(0);
    expect(result.totalCost).toBe(0);
    expect(result.totalLaborHours).toBe(0);
  });

  it('sums material, labor, and total cost across items', () => {
    const items = [
      makeItem({ quantity: 5, unitMaterialCost: 10 }),  // mat: 50, labor: 0
      makeItem({ quantity: 2, unitLaborCost: 20 }),      // mat: 0, labor: 40
    ];
    const result = calculateSectionTotals(items);
    expect(result.totalMaterial).toBe(50);
    expect(result.totalLabor).toBe(40);
    expect(result.totalCost).toBe(90);
  });

  it('sums total labor hours', () => {
    const items = [
      makeItem({ quantity: 10, laborHours: 0.5 }),   // 5 hrs
      makeItem({ quantity: 5, laborHours: 1.0 }),    // 5 hrs
    ];
    const result = calculateSectionTotals(items);
    expect(result.totalLaborHours).toBe(10);
  });

  it('excludes assembly child items from section totals when parent exists', () => {
    // Parent assembly items should be counted but their children should not
    // (children quantities are factored into parent in assembly mode)
    const parent = makeItem({ id: 1, isAssembly: true, quantity: 2, unitMaterialCost: 100 });
    const child = makeItem({ id: 2, parentItemId: 1, quantity: 4, unitMaterialCost: 50 });
    const result = calculateSectionTotals([parent, child]);
    // Only parent contributes: 2 * 100 = 200
    expect(result.totalMaterial).toBe(200);
  });
});

describe('calculateEstimateTotals', () => {
  it('calculates overhead, profit, tax, bond on correct base', () => {
    const result = calculateEstimateTotals({ subtotal: 10000, overheadPct: 15, profitPct: 10, taxPct: 8, bondPct: 1 });
    expect(result.subtotal).toBe(10000);
    // overhead = 10000 * 0.15 = 1500
    expect(result.overheadAmt).toBe(1500);
    // profit = (10000 + 1500) * 0.10 = 1150
    expect(result.profitAmt).toBe(1150);
    // preTaxTotal = 10000 + 1500 + 1150 = 12650
    // tax = 12650 * 0.08 = 1012
    expect(result.taxAmt).toBe(1012);
    // bond = (12650 + 1012) * 0.01 = 136.62
    expect(result.bondAmt).toBe(136.62);
    // grand total = 12650 + 1012 + 136.62
    expect(result.grandTotal).toBe(13798.62);
  });

  it('returns subtotal as grand total when all percentages are zero', () => {
    const result = calculateEstimateTotals({ subtotal: 50000, overheadPct: 0, profitPct: 0, taxPct: 0, bondPct: 0 });
    expect(result.grandTotal).toBe(50000);
    expect(result.overheadAmt).toBe(0);
    expect(result.profitAmt).toBe(0);
    expect(result.taxAmt).toBe(0);
    expect(result.bondAmt).toBe(0);
  });

  it('handles zero subtotal', () => {
    const result = calculateEstimateTotals({ subtotal: 0, overheadPct: 15, profitPct: 10, taxPct: 8, bondPct: 1 });
    expect(result.grandTotal).toBe(0);
  });
});

describe('calculateFullEstimate', () => {
  it('produces correct output structure for a full estimate', () => {
    const sections = [
      {
        id: 1,
        name: 'Framing',
        items: [
          makeItem({ quantity: 100, unitMaterialCost: 3.5, unitLaborCost: 2.0 }),
          makeItem({ quantity: 50, unitMaterialCost: 6.0, laborHours: 0.25, laborRate: 65 }),
        ],
      },
    ];

    const result = calculateFullEstimate(sections, 15, 10, 0, 0);

    expect(result.subtotal).toBeGreaterThan(0);
    expect(result.grandTotal).toBeGreaterThan(result.subtotal);
    expect(result.sectionTotals).toHaveLength(1);
    expect(result.sectionTotals[0].sectionId).toBe(1);
  });
});
