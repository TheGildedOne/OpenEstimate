/**
 * proposalPdf.ts
 *
 * Generates client-facing proposal PDFs and internal estimate PDFs using pdf-lib.
 *
 * Exports:
 *   generateProposalPdf(opts)  – client-facing, hides unit costs and margin detail
 *   generateInternalPdf(opts)  – internal, shows all columns and full margin breakdown
 *
 * Both accept the same PdfOptions shape that the export route constructs:
 *   { estimate: FullEstimate, project: ProjectLike, settings: Settings | null, internal: boolean }
 *
 * The `estimate` object coming from the route already has `totals` pre-computed and
 * each section already has `totalCost / totalMaterial / totalLabor / totalLaborHours`
 * merged in via calculateSectionTotals.  Line items have totalMaterial / totalLabor /
 * totalCost merged via calculateLineItem.
 */

import {
  PDFDocument,
  PDFPage,
  PDFFont,
  rgb,
  RGB,
  StandardFonts,
} from 'pdf-lib';
import type { EstimateTotalsResult, SectionTotalsResult } from '../../lib/estimateCalculator';

// ─────────────────────────────────────────────────────────────────────────────
// Domain types (matching the shape built by loadFullEstimate in export.ts)
// ─────────────────────────────────────────────────────────────────────────────

interface LineItemWithTotals {
  id: number;
  description: string;
  quantity: number;
  unit: string;
  unitMaterialCost: number;
  unitLaborCost: number;
  laborHours: number;
  laborRate: number;
  wasteFactorPct: number;
  isAssembly: boolean;
  parentItemId: number | null;
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
  projectId?: number;
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
  clientEmail?: string | null;
  siteAddress?: string | null;
}

interface Settings {
  companyName: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  licenseNumber?: string | null;
  logoUrl?: string | null;
  termsAndConditions?: string | null;
  defaultOverheadPct?: number;
  defaultProfitPct?: number;
}

export interface PdfOptions {
  estimate: FullEstimate;
  project: ProjectLike;
  settings: Settings | null;
  internal: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout constants (US Letter portrait – 612 × 792 pts)
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

// usable content area (header zone, footer bottom)
const HEADER_BOTTOM = PAGE_H - MARGIN - 78;  // y where content starts below header
const FOOTER_TOP    = MARGIN + 22;
const BODY_BOTTOM   = FOOTER_TOP + 4;

// ─────────────────────────────────────────────────────────────────────────────
// Color palette
// ─────────────────────────────────────────────────────────────────────────────

const C_BRAND      = rgb(0.118, 0.251, 0.686);  // #1e40af
const C_BRAND_DARK = rgb(0.074, 0.157, 0.490);  // darker variant
const C_RED        = rgb(0.750, 0.125, 0.125);
const C_DARK       = rgb(0.20,  0.20,  0.22);
const C_GRAY       = rgb(0.475, 0.525, 0.60);
const C_LGRAY      = rgb(0.90,  0.90,  0.92);
const C_XLGRAY     = rgb(0.945, 0.953, 0.969);
const C_WHITE      = rgb(1,     1,     1);
const C_ALT_ROW    = rgb(0.961, 0.965, 0.980);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmt$(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n: number): string {
  return n % 1 === 0 ? `${n}%` : `${n.toFixed(2)}%`;
}

function fmtQty(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(2);
}

function hexToRgb(hex: string | null | undefined, fallback: RGB): RGB {
  if (!hex) return fallback;
  const h = hex.replace('#', '');
  if (h.length !== 6) return fallback;
  return rgb(
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  );
}

/** Wrap `text` to fit within `maxWidth` pts at `fontSize` using the given font. */
function wrap(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const candidate = cur ? `${cur} ${word}` : word;
    try {
      const w = font.widthOfTextAtSize(candidate, fontSize);
      if (w <= maxWidth) {
        cur = candidate;
      } else {
        if (cur) lines.push(cur);
        // If a single word exceeds maxWidth, hard-break it
        let tail = word;
        while (tail.length > 1) {
          try {
            if (font.widthOfTextAtSize(tail, fontSize) <= maxWidth) break;
          } catch { break; }
          let cut = tail.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(tail.slice(0, cut) + '-', fontSize) > maxWidth) cut--;
          lines.push(tail.slice(0, cut) + '-');
          tail = tail.slice(cut);
        }
        cur = tail;
      }
    } catch {
      cur = candidate;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

function textW(text: string, font: PDFFont, size: number): number {
  try { return font.widthOfTextAtSize(text, size); } catch { return text.length * size * 0.6; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-page renderer
// ─────────────────────────────────────────────────────────────────────────────

class Renderer {
  private doc: PDFDocument;
  private allPages: PDFPage[] = [];
  private page!: PDFPage;
  font!: PDFFont;
  bold!: PDFFont;

  // current write position
  y = HEADER_BOTTOM;

  // state captured at init for headers / footers
  private companyName = '';
  private estimateName = '';
  private clientName = '';
  private isInternal = false;
  private dateStr = '';
  private companyContact = '';
  private companyAddress = '';
  private licenseNumber = '';

  constructor(doc: PDFDocument) { this.doc = doc; }

  async init(opts: {
    font: PDFFont;
    bold: PDFFont;
    companyName: string;
    estimateName: string;
    clientName: string;
    isInternal: boolean;
    dateStr: string;
    companyContact: string;
    companyAddress: string;
    licenseNumber: string;
  }) {
    Object.assign(this, opts);
    this.newPage();
  }

  // ── Page management ────────────────────────────────────────────────────────

  newPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.allPages.push(this.page);
    this.y = HEADER_BOTTOM;
    this.paintHeader();
  }

  pageCount() { return this.allPages.length; }

  /** Call after all content is drawn to stamp page numbers on every page. */
  stampFooters() {
    const total = this.allPages.length;
    this.allPages.forEach((pg, i) => {
      // divider above footer
      pg.drawLine({
        start: { x: MARGIN, y: FOOTER_TOP },
        end:   { x: PAGE_W - MARGIN, y: FOOTER_TOP },
        thickness: 0.5,
        color: C_LGRAY,
      });

      const pageLabel = `Page ${i + 1} of ${total}`;
      pg.drawText(pageLabel, {
        x: MARGIN,
        y: FOOTER_TOP - 12,
        font: this.font,
        size: 7.5,
        color: C_GRAY,
      });

      const confText = `Confidential – Prepared for ${this.clientName} only`;
      const confW = textW(confText, this.font, 7.5);
      pg.drawText(confText, {
        x: PAGE_W - MARGIN - confW,
        y: FOOTER_TOP - 12,
        font: this.font,
        size: 7.5,
        color: C_GRAY,
      });
    });
  }

  // ── Header ─────────────────────────────────────────────────────────────────

  private paintHeader() {
    const pg = this.page;

    // Blue header bar
    pg.drawRectangle({
      x: 0,
      y: HEADER_BOTTOM,
      width: PAGE_W,
      height: PAGE_H - HEADER_BOTTOM,
      color: C_BRAND,
    });

    // Internal banner
    if (this.isInternal) {
      pg.drawRectangle({
        x: 0,
        y: PAGE_H - MARGIN - 14,
        width: PAGE_W,
        height: 14,
        color: C_RED,
      });
      const bannerText = 'INTERNAL ESTIMATE – CONFIDENTIAL – NOT FOR DISTRIBUTION';
      pg.drawText(bannerText, {
        x: PAGE_W / 2 - textW(bannerText, this.bold, 7.5) / 2,
        y: PAGE_H - MARGIN - 10,
        font: this.bold,
        size: 7.5,
        color: C_WHITE,
      });
    }

    // Company name (large, top-left)
    const nameY = this.isInternal
      ? PAGE_H - MARGIN - 28
      : PAGE_H - MARGIN - 16;

    pg.drawText(this.companyName, {
      x: MARGIN,
      y: nameY,
      font: this.bold,
      size: 14,
      color: C_WHITE,
    });

    // Company contact / address (small, below name)
    let subY = nameY - 14;
    if (this.companyAddress) {
      pg.drawText(this.companyAddress, { x: MARGIN, y: subY, font: this.font, size: 8, color: C_XLGRAY });
      subY -= 11;
    }
    if (this.companyContact) {
      pg.drawText(this.companyContact, { x: MARGIN, y: subY, font: this.font, size: 8, color: C_XLGRAY });
      subY -= 11;
    }
    if (this.licenseNumber) {
      pg.drawText(`Lic# ${this.licenseNumber}`, { x: MARGIN, y: subY, font: this.font, size: 8, color: C_XLGRAY });
    }

    // Right side: estimate name + date
    const rightX = PAGE_W - MARGIN;
    const eName  = this.estimateName.length > 36 ? this.estimateName.slice(0, 35) + '…' : this.estimateName;
    const eNameW = textW(eName, this.bold, 11);
    pg.drawText(eName, {
      x: rightX - eNameW,
      y: nameY,
      font: this.bold,
      size: 11,
      color: C_WHITE,
    });
    const dateW = textW(this.dateStr, this.font, 9);
    pg.drawText(this.dateStr, {
      x: rightX - dateW,
      y: nameY - 14,
      font: this.font,
      size: 9,
      color: C_XLGRAY,
    });

    // Bottom divider of header zone
    pg.drawLine({
      start: { x: 0, y: HEADER_BOTTOM },
      end:   { x: PAGE_W, y: HEADER_BOTTOM },
      thickness: 1,
      color: C_BRAND_DARK,
    });
  }

  // ── Space checking ─────────────────────────────────────────────────────────

  ensure(heightPts: number) {
    if (this.y - heightPts < BODY_BOTTOM) {
      this.newPage();
    }
  }

  // ── Drawing primitives ────────────────────────────────────────────────────

  text(
    str: string,
    x: number,
    y: number,
    opts: { size?: number; bold?: boolean; color?: RGB; maxWidth?: number } = {}
  ) {
    const { size = 9, bold = false, color = C_DARK } = opts;
    const f = bold ? this.bold : this.font;
    if (opts.maxWidth) {
      const lines = wrap(str, f, size, opts.maxWidth);
      let ly = y;
      for (const line of lines) {
        this.page.drawText(line, { x, y: ly, font: f, size, color });
        ly -= size + 3;
      }
    } else {
      this.page.drawText(str, { x, y, font: f, size, color });
    }
  }

  /** Draw text right-aligned to `rightEdge`. Returns the text width. */
  textR(str: string, rightEdge: number, y: number, opts: { size?: number; bold?: boolean; color?: RGB } = {}): number {
    const { size = 9, bold = false, color = C_DARK } = opts;
    const f = bold ? this.bold : this.font;
    const w = textW(str, f, size);
    this.page.drawText(str, { x: rightEdge - w, y, font: f, size, color });
    return w;
  }

  hline(x1: number, x2: number, y: number, thickness = 0.5, color: RGB = C_LGRAY) {
    this.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color });
  }

  rect(x: number, y: number, w: number, h: number, color: RGB) {
    this.page.drawRectangle({ x, y, width: w, height: h, color });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section header + column header helpers
// ─────────────────────────────────────────────────────────────────────────────

// ── Proposal columns ──────────────────────────────────────────────────────────
// Description (wraps) | Qty | Unit | Total Cost
const P = {
  descX: MARGIN,
  descW: 340,
  qtyX:  MARGIN + 348,
  unitX: MARGIN + 392,
  totX:  PAGE_W - MARGIN,   // right-aligned
};

// ── Internal columns (full detail) ───────────────────────────────────────────
// # | Description | Qty | Unit | UMat | ULab | LH | Rate | Waste% | TMat | TLab | TCost
const I = {
  numX:   MARGIN,
  descX:  MARGIN + 18,
  descW:  160,
  qtyX:   MARGIN + 182,
  unitX:  MARGIN + 216,
  umatX:  MARGIN + 252,
  ulabX:  MARGIN + 300,
  lhX:    MARGIN + 346,
  rateX:  MARGIN + 376,
  wasteX: MARGIN + 414,
  tmatX:  MARGIN + 450,
  tlabX:  MARGIN + 492,
  tcostX: PAGE_W - MARGIN,   // right-aligned
};

function drawSectionHeader(r: Renderer, section: SectionWithItems, internal: boolean) {
  r.ensure(42);

  const secColor = hexToRgb(section.color, C_BRAND);
  const secY = r.y;

  // Section title bar
  r.rect(MARGIN, secY - 17, CONTENT_W, 18, secColor);
  r.text(section.name.toUpperCase(), MARGIN + 5, secY - 12, { size: 9.5, bold: true, color: C_WHITE });

  // Section total on right of bar
  const secTot = fmt$(section.totalCost);
  r.textR(secTot, PAGE_W - MARGIN - 4, secY - 12, { size: 9.5, bold: true, color: C_WHITE });

  r.y = secY - 18;

  // Column header row
  const chy = r.y;
  r.rect(MARGIN, chy - 14, CONTENT_W, 15, C_XLGRAY);

  if (internal) {
    r.text('#',           I.numX,   chy - 11, { size: 7.5, bold: true, color: C_GRAY });
    r.text('Description', I.descX,  chy - 11, { size: 7.5, bold: true, color: C_GRAY });
    r.text('Qty',         I.qtyX,   chy - 11, { size: 7.5, bold: true, color: C_GRAY });
    r.text('Unit',        I.unitX,  chy - 11, { size: 7.5, bold: true, color: C_GRAY });
    r.text('UMat',        I.umatX,  chy - 11, { size: 7.5, bold: true, color: C_GRAY });
    r.text('ULab',        I.ulabX,  chy - 11, { size: 7.5, bold: true, color: C_GRAY });
    r.text('LH',          I.lhX,    chy - 11, { size: 7.5, bold: true, color: C_GRAY });
    r.text('Rate',        I.rateX,  chy - 11, { size: 7.5, bold: true, color: C_GRAY });
    r.text('Waste%',      I.wasteX, chy - 11, { size: 7.5, bold: true, color: C_GRAY });
    r.text('Total Mat',   I.tmatX,  chy - 11, { size: 7.5, bold: true, color: C_GRAY });
    r.text('Total Lab',   I.tlabX,  chy - 11, { size: 7.5, bold: true, color: C_GRAY });
    r.textR('Total Cost', PAGE_W - MARGIN - 2, chy - 11, { size: 7.5, bold: true, color: C_GRAY });
  } else {
    r.text('Description', P.descX + 2, chy - 11, { size: 7.5, bold: true, color: C_GRAY });
    r.text('Qty',         P.qtyX,      chy - 11, { size: 7.5, bold: true, color: C_GRAY });
    r.text('Unit',        P.unitX,     chy - 11, { size: 7.5, bold: true, color: C_GRAY });
    r.textR('Total Cost', P.totX - 2,  chy - 11, { size: 7.5, bold: true, color: C_GRAY });
  }

  r.y = chy - 15;
}

// ─────────────────────────────────────────────────────────────────────────────
// Line item rows
// ─────────────────────────────────────────────────────────────────────────────

function drawLineItemProposal(r: Renderer, li: LineItemWithTotals, rowIdx: number, indent: boolean) {
  const indentPts = indent ? 12 : 0;
  const descX = P.descX + indentPts;
  const descW = P.descW - indentPts;

  const descLines = wrap(li.description, r.font, 8.5, descW);
  const rowH = Math.max(15, descLines.length * 12 + 5);

  r.ensure(rowH);

  const rowBg = rowIdx % 2 === 0 ? C_WHITE : C_ALT_ROW;
  r.rect(MARGIN, r.y - rowH, CONTENT_W, rowH, rowBg);

  // Description
  const baseY = r.y - 11;
  descLines.forEach((line, i) => {
    r.text(line, descX, baseY - i * 12, { size: 8.5, color: indent ? C_GRAY : C_DARK });
  });

  // Indent indicator
  if (indent) {
    r.text('↳', P.descX + 2, baseY, { size: 7, color: C_GRAY });
  }

  // Numeric columns (vertically centered)
  const midY = r.y - rowH / 2 - 3;
  r.text(fmtQty(li.quantity), P.qtyX, midY, { size: 8.5 });
  r.text(li.unit,              P.unitX, midY, { size: 8.5 });
  r.textR(fmt$(li.totalCost),  P.totX - 2, midY, { size: 8.5 });

  r.y -= rowH;
}

function drawLineItemInternal(r: Renderer, li: LineItemWithTotals, rowNum: number, rowIdx: number, indent: boolean) {
  const indentPts = indent ? 10 : 0;
  const descX = I.descX + indentPts;
  const descW = I.descW - indentPts;

  const descLines = wrap(li.description, r.font, 7.5, descW);
  const rowH = Math.max(13, descLines.length * 11 + 4);

  r.ensure(rowH);

  const rowBg = rowIdx % 2 === 0 ? C_WHITE : C_ALT_ROW;
  r.rect(MARGIN, r.y - rowH, CONTENT_W, rowH, rowBg);

  r.text(String(rowNum), I.numX, r.y - 10, { size: 7.5, color: C_GRAY });

  const baseY = r.y - 10;
  descLines.forEach((line, i) => {
    r.text(line, descX, baseY - i * 11, { size: 7.5, color: indent ? C_GRAY : C_DARK });
  });
  if (indent) {
    r.text('↳', I.descX, baseY, { size: 6.5, color: C_GRAY });
  }

  const midY = r.y - rowH / 2 - 3;
  r.text(fmtQty(li.quantity),           I.qtyX,   midY, { size: 7.5 });
  r.text(li.unit.slice(0, 6),           I.unitX,  midY, { size: 7.5 });
  r.text(fmt$(li.unitMaterialCost),     I.umatX,  midY, { size: 7.5 });
  r.text(fmt$(li.unitLaborCost),        I.ulabX,  midY, { size: 7.5 });
  r.text(li.laborHours.toFixed(1),      I.lhX,    midY, { size: 7.5 });
  r.text(fmt$(li.laborRate),            I.rateX,  midY, { size: 7.5 });
  r.text(fmtPct(li.wasteFactorPct),     I.wasteX, midY, { size: 7.5 });
  r.text(fmt$(li.totalMaterial),        I.tmatX,  midY, { size: 7.5 });
  r.text(fmt$(li.totalLabor),           I.tlabX,  midY, { size: 7.5 });
  r.textR(fmt$(li.totalCost),           I.tcostX - 2, midY, { size: 7.5 });

  r.y -= rowH;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section subtotal rows
// ─────────────────────────────────────────────────────────────────────────────

function drawSubtotalProposal(r: Renderer, section: SectionWithItems) {
  r.ensure(16);
  r.rect(MARGIN, r.y - 14, CONTENT_W, 15, C_XLGRAY);
  r.hline(MARGIN, PAGE_W - MARGIN, r.y, 0.75, C_LGRAY);

  r.text('Section Subtotal', P.descX + 4, r.y - 10, { size: 8.5, bold: true });
  r.textR(fmt$(section.totalCost), P.totX - 2, r.y - 10, { size: 8.5, bold: true });

  r.y -= 15;
  r.y -= 8; // gap after section
}

function drawSubtotalInternal(r: Renderer, section: SectionWithItems) {
  r.ensure(16);
  r.rect(MARGIN, r.y - 14, CONTENT_W, 15, C_XLGRAY);
  r.hline(MARGIN, PAGE_W - MARGIN, r.y, 0.75, C_LGRAY);

  r.text('Section Subtotal', I.descX, r.y - 10, { size: 8, bold: true });
  r.text(`${section.totalLaborHours.toFixed(1)} hrs`, I.lhX, r.y - 10, { size: 8, bold: true });
  r.text(fmt$(section.totalMaterial), I.tmatX, r.y - 10, { size: 8, bold: true });
  r.text(fmt$(section.totalLabor),    I.tlabX, r.y - 10, { size: 8, bold: true });
  r.textR(fmt$(section.totalCost),    I.tcostX - 2, r.y - 10, { size: 8, bold: true });

  r.y -= 15;
  r.y -= 8;
}

// ─────────────────────────────────────────────────────────────────────────────
// Totals block
// ─────────────────────────────────────────────────────────────────────────────

function drawTotalsProposal(r: Renderer, estimate: FullEstimate) {
  const { totals } = estimate;
  r.ensure(120);

  r.y -= 10;
  r.hline(MARGIN, PAGE_W - MARGIN, r.y, 1, C_BRAND);
  r.y -= 14;

  const labelX  = PAGE_W - MARGIN - 220;
  const valueX  = PAGE_W - MARGIN;
  const rowH    = 14;

  const row = (label: string, value: string, bold = false, color: RGB = C_DARK) => {
    r.ensure(rowH + 4);
    r.text(label, labelX, r.y, { size: 9, bold, color });
    r.textR(value, valueX, r.y, { size: 9, bold, color });
    r.y -= rowH;
  };

  row('Subtotal (Direct Costs)', fmt$(totals.subtotal));

  // Proposal shows overhead+profit combined as "General Conditions"
  const gcAmt = totals.overheadAmt + totals.profitAmt;
  if (gcAmt > 0) {
    row('General Conditions', fmt$(gcAmt));
  }
  if (totals.taxAmt > 0) {
    row(`Estimated Tax (${fmtPct(estimate.taxPct)})`, fmt$(totals.taxAmt));
  }
  if (totals.bondAmt > 0) {
    row(`Bond (${fmtPct(estimate.bondPct)})`, fmt$(totals.bondAmt));
  }

  // Grand total — prominent box
  r.ensure(30);
  r.y -= 4;
  r.hline(MARGIN + 120, PAGE_W - MARGIN, r.y, 0.5, C_LGRAY);
  r.y -= 6;

  const gtY = r.y;
  r.rect(labelX - 6, gtY - 22, PAGE_W - MARGIN - (labelX - 6), 24, C_BRAND);
  const labelStr = 'TOTAL BID:';
  const valueStr = fmt$(totals.grandTotal);
  r.text(labelStr, labelX, gtY - 14, { size: 12, bold: true, color: C_WHITE });
  r.textR(valueStr, valueX, gtY - 14, { size: 12, bold: true, color: C_WHITE });
  r.y = gtY - 26;
}

function drawTotalsInternal(r: Renderer, estimate: FullEstimate) {
  const { totals } = estimate;
  r.ensure(150);

  r.y -= 10;
  r.hline(MARGIN, PAGE_W - MARGIN, r.y, 1, C_BRAND);
  r.y -= 16;

  r.text('COST BREAKDOWN', MARGIN, r.y, { size: 10, bold: true, color: C_BRAND });
  r.y -= 16;

  const labelX  = MARGIN + 180;
  const pctX    = MARGIN + 370;
  const amtX    = PAGE_W - MARGIN;
  const rowH    = 14;

  const row = (label: string, pct: string, amt: string, bold = false, color: RGB = C_DARK) => {
    r.ensure(rowH + 2);
    r.text(label, labelX, r.y, { size: 9, bold, color });
    if (pct) r.textR(pct, pctX, r.y, { size: 9, bold, color });
    r.textR(amt, amtX, r.y, { size: 9, bold, color });
    r.y -= rowH;
  };

  row('Direct Cost Subtotal:', '', fmt$(totals.subtotal));
  row('Overhead / General Conditions:', fmtPct(estimate.overheadPct), fmt$(totals.overheadAmt));
  row('Profit:', fmtPct(estimate.profitPct), fmt$(totals.profitAmt));

  r.ensure(14);
  r.hline(labelX, PAGE_W - MARGIN, r.y, 0.3, C_LGRAY);
  r.y -= 6;

  const preTax = totals.subtotal + totals.overheadAmt + totals.profitAmt;
  row('Pre-Tax Total:', '', fmt$(preTax), true);

  if (totals.taxAmt > 0 || estimate.taxPct > 0) {
    row(`Estimated Tax (${fmtPct(estimate.taxPct)}):`, fmtPct(estimate.taxPct), fmt$(totals.taxAmt));
  }
  if (totals.bondAmt > 0 || estimate.bondPct > 0) {
    row(`Bond (${fmtPct(estimate.bondPct)}):`, fmtPct(estimate.bondPct), fmt$(totals.bondAmt));
  }

  // Labor hours
  r.ensure(20);
  r.y -= 4;
  r.text(`Total Labor Hours: ${totals.totalLaborHours.toFixed(1)} hrs`, labelX, r.y, { size: 9, color: C_GRAY });
  r.y -= 14;

  // Grand total box
  r.ensure(32);
  r.y -= 6;
  const gtY = r.y;
  r.rect(MARGIN, gtY - 24, CONTENT_W, 26, C_BRAND);
  r.text('GRAND TOTAL:', MARGIN + 8, gtY - 14, { size: 12, bold: true, color: C_WHITE });
  r.textR(fmt$(totals.grandTotal), PAGE_W - MARGIN - 4, gtY - 14, { size: 12, bold: true, color: C_WHITE });
  r.y = gtY - 28;
}

// ─────────────────────────────────────────────────────────────────────────────
// Project info block (below first-page header)
// ─────────────────────────────────────────────────────────────────────────────

function drawProjectInfo(r: Renderer, estimate: FullEstimate, project: ProjectLike, dateStr: string, internal: boolean) {
  r.y -= 10;

  // Title
  const title = internal
    ? `INTERNAL ESTIMATE: ${project.name}`
    : `Proposal for ${project.clientName}`;

  r.text(title, MARGIN, r.y, { size: 14, bold: true, color: C_BRAND });
  r.y -= 18;

  // Two-column info grid
  const col1 = MARGIN;
  const col2 = MARGIN + 300;
  const rowH = 13;
  const size = 9;

  const pair = (label: string, value: string | null | undefined, col: number = col1) => {
    if (!value) return;
    r.text(`${label}:`, col, r.y, { size, bold: true, color: C_GRAY });
    r.text(value, col + 85, r.y, { size, color: C_DARK });
    r.y -= rowH;
  };

  // Left column
  const leftStartY = r.y;
  pair('Project', project.name);
  pair('Client', project.clientName);
  if (project.siteAddress) pair('Site Address', project.siteAddress);
  if (!internal && project.clientEmail) pair('Client Email', project.clientEmail);
  pair('Prepared', dateStr);

  // Right column (reset Y to start and go parallel if there's space)
  // We can't easily do true two-column with one Y cursor, so skip for now
  // and use the second col only for estimate metadata
  const endY = r.y;
  r.y = leftStartY;
  pair('Estimate', estimate.name, col2);

  // Keep the lower of the two column bottoms
  r.y = Math.min(r.y, endY);

  r.y -= 8;
  r.hline(MARGIN, PAGE_W - MARGIN, r.y, 1, C_BRAND);
  r.y -= 12;
}

// ─────────────────────────────────────────────────────────────────────────────
// Notes block
// ─────────────────────────────────────────────────────────────────────────────

function drawNotes(r: Renderer, notes: string) {
  r.ensure(40);
  r.y -= 8;
  r.text('NOTES', MARGIN, r.y, { size: 9, bold: true, color: C_GRAY });
  r.y -= 14;
  r.hline(MARGIN, PAGE_W - MARGIN, r.y, 0.3, C_LGRAY);
  r.y -= 8;

  const lines = notes.split('\n');
  for (const line of lines) {
    const wrapped = wrap(line, r.font, 9, CONTENT_W);
    for (const wl of wrapped) {
      r.ensure(13);
      r.text(wl, MARGIN, r.y, { size: 9, color: C_DARK });
      r.y -= 13;
    }
    if (wrapped.length === 0) r.y -= 8;
  }
  r.y -= 6;
}

// ─────────────────────────────────────────────────────────────────────────────
// Terms and conditions
// ─────────────────────────────────────────────────────────────────────────────

function drawTermsAndConditions(r: Renderer, terms: string) {
  r.newPage();
  r.y -= 8;
  r.text('TERMS AND CONDITIONS', MARGIN, r.y, { size: 12, bold: true, color: C_BRAND });
  r.y -= 20;
  r.hline(MARGIN, PAGE_W - MARGIN, r.y, 1, C_BRAND);
  r.y -= 12;

  const lines = terms.split('\n');
  for (const line of lines) {
    const wrapped = wrap(line, r.font, 9, CONTENT_W);
    for (const wl of wrapped) {
      r.ensure(13);
      r.text(wl, MARGIN, r.y, { size: 9, color: C_DARK });
      r.y -= 13;
    }
    if (wrapped.length === 0) r.y -= 8;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core renderer
// ─────────────────────────────────────────────────────────────────────────────

async function buildPdf(opts: PdfOptions): Promise<Buffer> {
  const { estimate, project, settings, internal } = opts;

  const doc = await PDFDocument.create();
  doc.setTitle(estimate.name);
  doc.setAuthor(settings?.companyName ?? 'OpenEstimate');
  doc.setCreationDate(new Date());

  const font     = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const companyName  = settings?.companyName ?? 'Company';
  const dateStr      = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const contactParts = [settings?.phone, settings?.email].filter(Boolean);
  const contactStr   = contactParts.join('  |  ');

  const r = new Renderer(doc);
  await r.init({
    font,
    bold:           fontBold,
    companyName,
    estimateName:   estimate.name,
    clientName:     project.clientName,
    isInternal:     internal,
    dateStr,
    companyContact: contactStr,
    companyAddress: settings?.address ?? '',
    licenseNumber:  settings?.licenseNumber ?? '',
  });

  // Project info block
  drawProjectInfo(r, estimate, project, dateStr, internal);

  // Notes before sections (spec says after sections – we'll do after)
  // Sections
  for (const section of estimate.sections) {
    if (section.lineItems.length === 0) continue;

    drawSectionHeader(r, section, internal);

    // Build parent → children map
    const parentItems = section.lineItems.filter((li) => !li.parentItemId);
    const childMap    = new Map<number, LineItemWithTotals[]>();
    for (const li of section.lineItems) {
      if (li.parentItemId != null) {
        const arr = childMap.get(li.parentItemId) ?? [];
        arr.push(li);
        childMap.set(li.parentItemId, arr);
      }
    }

    let rowIdx = 0;
    let rowNum = 1;
    for (const parent of parentItems) {
      if (internal) {
        drawLineItemInternal(r, parent, rowNum++, rowIdx++, false);
      } else {
        drawLineItemProposal(r, parent, rowIdx++, false);
      }
      for (const child of childMap.get(parent.id) ?? []) {
        if (internal) {
          drawLineItemInternal(r, child, rowNum++, rowIdx++, true);
        } else {
          drawLineItemProposal(r, child, rowIdx++, true);
        }
      }
    }

    if (internal) {
      drawSubtotalInternal(r, section);
    } else {
      drawSubtotalProposal(r, section);
    }
  }

  // Totals block
  if (internal) {
    drawTotalsInternal(r, estimate);
  } else {
    drawTotalsProposal(r, estimate);
  }

  // Notes section
  if (estimate.notes) {
    drawNotes(r, estimate.notes);
  }

  // Terms and conditions (proposal only, last page)
  if (!internal && settings?.termsAndConditions) {
    drawTermsAndConditions(r, settings.termsAndConditions);
  }

  // Stamp page X of Y footers on every page now we know total count
  r.stampFooters();

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public exports
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a client-facing proposal PDF.
 * Hides unit costs, margin percentages, and labor detail.
 */
export async function generateProposalPdf(opts: PdfOptions): Promise<Buffer> {
  return buildPdf({ ...opts, internal: false });
}

/**
 * Generate an internal estimate PDF showing all columns and full margin breakdown.
 */
export async function generateInternalPdf(opts: PdfOptions): Promise<Buffer> {
  return buildPdf({ ...opts, internal: true });
}
