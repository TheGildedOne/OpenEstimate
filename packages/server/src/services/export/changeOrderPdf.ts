/**
 * changeOrderPdf.ts
 *
 * Generate a professional change order PDF using pdf-lib.
 *
 * Export: generateChangeOrderPdf(input: ChangeOrderPdfInput) → Promise<Buffer>
 */

import { PDFDocument, PDFFont, PDFPage, rgb, RGB, StandardFonts } from 'pdf-lib';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ChangeOrderLineItem {
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
}

export interface ChangeOrderPdfInput {
  changeOrder: {
    number: string;          // e.g. "CO-001"
    title: string;
    description: string | null;
    status: string;          // 'draft' | 'submitted' | 'approved' | 'rejected'
    submittedAt: string | null;
    approvedAt: string | null;
    approvedByName: string | null;
    lineItems: ChangeOrderLineItem[];
  };
  project: {
    name: string;
    clientName: string;
    siteAddress: string | null;
  };
  originalContractValue: number;
  company: {
    companyName: string;
    address: string | null;
    phone: string | null;
    email: string | null;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_W  = 612;
const PAGE_H  = 792;
const MARGIN  = 50;
const RIGHT   = PAGE_W - MARGIN;
const CONTENT = PAGE_W - MARGIN * 2;

// ─────────────────────────────────────────────────────────────────────────────
// Colors
// ─────────────────────────────────────────────────────────────────────────────

const C_BRAND   = rgb(0.118, 0.251, 0.686);
const C_DARK    = rgb(0.08,  0.08,  0.08);
const C_GRAY    = rgb(0.47,  0.52,  0.60);
const C_LGRAY   = rgb(0.88,  0.88,  0.90);
const C_XLGRAY  = rgb(0.95,  0.95,  0.97);
const C_WHITE   = rgb(1,     1,     1);
const C_RED     = rgb(0.72,  0.10,  0.10);
const C_GREEN   = rgb(0.07,  0.45,  0.18);
const C_ORANGE  = rgb(0.75,  0.40,  0.05);
const C_ALT_ROW = rgb(0.96,  0.96,  0.98);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmt$(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return iso;
  }
}

function statusColor(status: string): RGB {
  switch (status.toLowerCase()) {
    case 'approved':  return C_GREEN;
    case 'rejected':  return C_RED;
    case 'submitted': return C_ORANGE;
    default:          return C_GRAY;
  }
}

function textW(text: string, font: PDFFont, size: number): number {
  try { return font.widthOfTextAtSize(text, size); } catch { return text.length * size * 0.6; }
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const candidate = cur ? `${cur} ${word}` : word;
    try {
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        cur = candidate;
      } else {
        if (cur) lines.push(cur);
        cur = word;
      }
    } catch {
      cur = candidate;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

// ─────────────────────────────────────────────────────────────────────────────
// Column layout for line items table
// ─────────────────────────────────────────────────────────────────────────────

const COL = {
  num:   { x: MARGIN,       w: 24 },
  desc:  { x: MARGIN + 26,  w: 248 },
  qty:   { x: MARGIN + 278, w: 46 },
  unit:  { x: MARGIN + 326, w: 46 },
  uCost: { x: MARGIN + 374, w: 72 },
  total: { x: RIGHT,        w: 72 },  // right-aligned
};

// ─────────────────────────────────────────────────────────────────────────────
// Renderer
// ─────────────────────────────────────────────────────────────────────────────

class CO_Renderer {
  doc: PDFDocument;
  private pages: PDFPage[] = [];
  private page!: PDFPage;
  font!: PDFFont;
  bold!: PDFFont;
  y = 0;

  constructor(doc: PDFDocument) { this.doc = doc; }

  async init() {
    this.font = await this.doc.embedFont(StandardFonts.Helvetica);
    this.bold = await this.doc.embedFont(StandardFonts.HelveticaBold);
    this.addPage();
  }

  addPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.pages.push(this.page);
    this.y = PAGE_H - MARGIN;
  }

  ensure(pts: number) {
    if (this.y - pts < MARGIN + 30) this.addPage();
  }

  t(str: string, x: number, y: number, opts: { size?: number; bold?: boolean; color?: RGB } = {}) {
    const { size = 10, bold = false, color = C_DARK } = opts;
    this.page.drawText(str, { x, y, font: bold ? this.bold : this.font, size, color });
  }

  tRight(str: string, rightEdge: number, y: number, opts: { size?: number; bold?: boolean; color?: RGB } = {}) {
    const { size = 10, bold = false, color = C_DARK } = opts;
    const f = bold ? this.bold : this.font;
    const w = textW(str, f, size);
    this.page.drawText(str, { x: rightEdge - w, y, font: f, size, color });
  }

  hline(x1: number, x2: number, y: number, thickness = 0.5, color: RGB = C_LGRAY) {
    this.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color });
  }

  rect(x: number, y: number, w: number, h: number, color: RGB) {
    this.page.drawRectangle({ x, y, width: w, height: h, color });
  }

  stampPageNumbers() {
    const total = this.pages.length;
    this.pages.forEach((pg, i) => {
      const label = `Page ${i + 1} of ${total}`;
      pg.drawText(label, {
        x: PAGE_W / 2 - textW(label, this.font, 8) / 2,
        y: 18,
        font: this.font,
        size: 8,
        color: C_GRAY,
      });
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: header
// ─────────────────────────────────────────────────────────────────────────────

function drawHeader(r: CO_Renderer, company: ChangeOrderPdfInput['company']) {
  const top = r.y;

  // Blue header bar
  r.rect(0, top - 72, PAGE_W, 72 + (PAGE_H - top), C_BRAND);

  // Company name
  r.t(company.companyName, MARGIN, top - 18, { size: 16, bold: true, color: C_WHITE });

  // Contact info
  let cy = top - 36;
  if (company.address) {
    r.t(company.address, MARGIN, cy, { size: 9, color: rgb(0.85, 0.90, 1) });
    cy -= 12;
  }
  const contact = [company.phone, company.email].filter(Boolean).join('  |  ');
  if (contact) {
    r.t(contact, MARGIN, cy, { size: 9, color: rgb(0.85, 0.90, 1) });
    cy -= 12;
  }

  // "CHANGE ORDER" title on the right
  r.tRight('CHANGE ORDER', RIGHT, top - 18, { size: 20, bold: true, color: C_WHITE });
  r.y = top - 76;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: CO identifier block
// ─────────────────────────────────────────────────────────────────────────────

function drawCoBlock(
  r: CO_Renderer,
  co: ChangeOrderPdfInput['changeOrder'],
  project: ChangeOrderPdfInput['project']
) {
  r.y -= 10;

  // CO number + title
  r.t(`${co.number} – ${co.title}`, MARGIN, r.y, { size: 14, bold: true, color: C_BRAND });
  r.y -= 18;

  // Status badge
  const statusText = co.status.toUpperCase();
  const statColor  = statusColor(co.status);
  r.rect(MARGIN, r.y - 14, textW(statusText, r.bold, 9) + 12, 16, statColor);
  r.t(statusText, MARGIN + 6, r.y - 11, { size: 9, bold: true, color: C_WHITE });
  r.y -= 22;

  // Approved banner (if approved)
  if (co.status.toLowerCase() === 'approved' && co.approvedByName) {
    const approvedLine = `APPROVED by ${co.approvedByName} on ${fmtDate(co.approvedAt)}`;
    r.rect(MARGIN, r.y - 16, CONTENT, 18, C_GREEN);
    r.t(approvedLine, MARGIN + 6, r.y - 12, { size: 9.5, bold: true, color: C_WHITE });
    r.y -= 24;
  }

  r.y -= 6;
  r.hline(MARGIN, RIGHT, r.y, 0.5, C_LGRAY);
  r.y -= 10;

  // Project info (two columns)
  const col2 = MARGIN + 290;

  const infoRow = (label: string, value: string, col = MARGIN) => {
    r.t(label + ':', col, r.y, { size: 9, bold: true, color: C_GRAY });
    r.t(value, col + 90, r.y, { size: 9, color: C_DARK });
  };

  infoRow('Project',    project.name);
  infoRow('Date',       new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), col2);
  r.y -= 14;

  infoRow('Client',     project.clientName);
  if (co.submittedAt) {
    infoRow('Submitted', fmtDate(co.submittedAt), col2);
  }
  r.y -= 14;

  if (project.siteAddress) {
    infoRow('Site', project.siteAddress);
    r.y -= 14;
  }

  r.y -= 6;
  r.hline(MARGIN, RIGHT, r.y, 0.5, C_LGRAY);
  r.y -= 12;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: description paragraph
// ─────────────────────────────────────────────────────────────────────────────

function drawDescription(r: CO_Renderer, description: string) {
  r.t('Description:', MARGIN, r.y, { size: 10, bold: true, color: C_GRAY });
  r.y -= 14;

  const paragraphs = description.split('\n');
  for (const para of paragraphs) {
    const lines = wrap(para, r.font, 9.5, CONTENT);
    for (const line of lines) {
      r.ensure(13);
      r.t(line, MARGIN, r.y, { size: 9.5, color: C_DARK });
      r.y -= 13;
    }
    if (lines.length === 0) r.y -= 8;
  }
  r.y -= 8;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: line items table
// ─────────────────────────────────────────────────────────────────────────────

function drawLineItemsTable(r: CO_Renderer, items: ChangeOrderLineItem[]): number {
  r.ensure(40);

  // Table header
  r.rect(MARGIN, r.y - 16, CONTENT, 17, C_BRAND);
  const hOpts = { size: 8.5, bold: true, color: C_WHITE };
  r.t('#',          COL.num.x,   r.y - 12, hOpts);
  r.t('Description',COL.desc.x,  r.y - 12, hOpts);
  r.t('Qty',        COL.qty.x,   r.y - 12, hOpts);
  r.t('Unit',       COL.unit.x,  r.y - 12, hOpts);
  r.t('Unit Cost',  COL.uCost.x, r.y - 12, hOpts);
  r.tRight('Total', COL.total.x, r.y - 12, hOpts);
  r.y -= 17;

  let grandTotal = 0;
  items.forEach((li, idx) => {
    const descLines = wrap(li.description, r.font, 8.5, COL.desc.w);
    const rowH      = Math.max(15, descLines.length * 12 + 5);

    r.ensure(rowH);

    const rowBg = idx % 2 === 0 ? C_WHITE : C_ALT_ROW;
    r.rect(MARGIN, r.y - rowH, CONTENT, rowH, rowBg);

    // Row number
    r.t(String(idx + 1), COL.num.x, r.y - 11, { size: 8.5, color: C_GRAY });

    // Description (multi-line)
    const baseY = r.y - 11;
    descLines.forEach((line, li2) => {
      r.t(line, COL.desc.x, baseY - li2 * 12, { size: 8.5, color: C_DARK });
    });

    // Numeric values (vertically centered)
    const midY = r.y - rowH / 2 - 3;
    r.t(li.quantity % 1 === 0 ? String(li.quantity) : li.quantity.toFixed(2), COL.qty.x, midY, { size: 8.5 });
    r.t(li.unit, COL.unit.x, midY, { size: 8.5 });
    r.t(fmt$(li.unitCost), COL.uCost.x, midY, { size: 8.5 });
    r.tRight(fmt$(li.totalCost), COL.total.x, midY, { size: 8.5 });

    grandTotal += li.totalCost;
    r.y -= rowH;
  });

  // Total row
  r.ensure(20);
  r.hline(MARGIN, RIGHT, r.y, 1, C_BRAND);
  r.y -= 4;
  r.rect(MARGIN, r.y - 18, CONTENT, 20, C_XLGRAY);
  r.t('TOTAL CHANGE AMOUNT:', COL.uCost.x - 14, r.y - 13, { size: 10, bold: true, color: C_DARK });
  r.tRight(fmt$(grandTotal), COL.total.x, r.y - 13, { size: 10, bold: true, color: C_BRAND });
  r.y -= 22;

  return grandTotal;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: contract summary
// ─────────────────────────────────────────────────────────────────────────────

function drawContractSummary(
  r: CO_Renderer,
  originalContractValue: number,
  changeAmount: number
) {
  r.ensure(80);
  r.y -= 12;
  r.hline(MARGIN, RIGHT, r.y, 0.5, C_LGRAY);
  r.y -= 14;

  r.t('CONTRACT SUMMARY', MARGIN, r.y, { size: 10, bold: true, color: C_GRAY });
  r.y -= 16;

  const labelX = MARGIN + 40;
  const valueX = RIGHT;
  const rowH   = 16;

  let summaryRowIdx = 0;
  const summaryRow = (label: string, amount: number, bold = false, color: RGB = C_DARK) => {
    r.ensure(rowH);
    r.rect(MARGIN, r.y - rowH + 2, CONTENT, rowH, summaryRowIdx % 2 === 0 ? C_XLGRAY : C_WHITE);
    r.t(label, labelX, r.y - 11, { size: 10, bold, color });
    r.tRight(fmt$(amount), valueX, r.y - 11, { size: 10, bold, color });
    r.y -= rowH;
    summaryRowIdx++;
  };

  summaryRow('Original Contract Value:', originalContractValue);
  summaryRow('This Change Order:', changeAmount, false, changeAmount >= 0 ? C_GREEN : C_RED);

  const newTotal = originalContractValue + changeAmount;
  r.ensure(22);
  r.hline(MARGIN, RIGHT, r.y, 0.75, C_BRAND);
  r.y -= 4;
  r.rect(MARGIN, r.y - 20, CONTENT, 22, C_BRAND);
  r.t('New Contract Value:', labelX, r.y - 14, { size: 11, bold: true, color: C_WHITE });
  r.tRight(fmt$(newTotal), valueX, r.y - 14, { size: 11, bold: true, color: C_WHITE });
  r.y -= 24;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: signature lines
// ─────────────────────────────────────────────────────────────────────────────

function drawSignatures(r: CO_Renderer, co: ChangeOrderPdfInput['changeOrder']) {
  r.ensure(100);
  r.y -= 20;
  r.hline(MARGIN, RIGHT, r.y, 0.5, C_LGRAY);
  r.y -= 16;

  r.t('AUTHORIZATION', MARGIN, r.y, { size: 10, bold: true, color: C_GRAY });
  r.y -= 12;
  r.t('By signing below, all parties agree to the terms of this change order.', MARGIN, r.y, { size: 8.5, color: C_GRAY });
  r.y -= 24;

  // Contractor signature block
  const col1End = MARGIN + 210;
  const col2Start = MARGIN + 270;
  const col2End   = RIGHT;

  r.hline(MARGIN, col1End, r.y, 0.75, C_DARK);
  r.hline(col2Start, col2End, r.y, 0.75, C_DARK);
  r.y -= 14;
  r.t('Contractor Authorized Signature', MARGIN, r.y, { size: 8, color: C_GRAY });
  r.t('Date', col2Start, r.y, { size: 8, color: C_GRAY });
  r.y -= 30;

  // Print name
  r.hline(MARGIN, col1End, r.y, 0.75, C_DARK);
  r.hline(col2Start, col2End, r.y, 0.75, C_DARK);
  r.y -= 14;
  r.t('Print Name / Title', MARGIN, r.y, { size: 8, color: C_GRAY });
  r.y -= 30;

  // Client signature block
  r.hline(MARGIN, col1End, r.y, 0.75, C_DARK);
  r.hline(col2Start, col2End, r.y, 0.75, C_DARK);
  r.y -= 14;
  r.t('Client / Owner Authorized Signature', MARGIN, r.y, { size: 8, color: C_GRAY });
  r.t('Date', col2Start, r.y, { size: 8, color: C_GRAY });
  r.y -= 30;

  // Print name
  r.hline(MARGIN, col1End, r.y, 0.75, C_DARK);
  r.y -= 14;
  r.t('Print Name', MARGIN, r.y, { size: 8, color: C_GRAY });

  // If already approved, show approval stamp
  if (co.status.toLowerCase() === 'approved' && co.approvedByName) {
    r.y -= 20;
    r.rect(MARGIN, r.y - 20, CONTENT, 22, C_GREEN);
    const stamp = `APPROVED by ${co.approvedByName} on ${fmtDate(co.approvedAt)}`;
    r.t(stamp, PAGE_W / 2 - textW(stamp, r.bold, 10) / 2, r.y - 14, { size: 10, bold: true, color: C_WHITE });
    r.y -= 24;
  }

  if (co.status.toLowerCase() === 'rejected') {
    r.y -= 20;
    r.rect(MARGIN, r.y - 20, CONTENT, 22, C_RED);
    const stamp = 'REJECTED – Not Approved';
    r.t(stamp, PAGE_W / 2 - textW(stamp, r.bold, 10) / 2, r.y - 14, { size: 10, bold: true, color: C_WHITE });
    r.y -= 24;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a professional change order PDF.
 */
export async function generateChangeOrderPdf(input: ChangeOrderPdfInput): Promise<Buffer> {
  const { changeOrder: co, project, company, originalContractValue } = input;

  const doc = await PDFDocument.create();
  doc.setTitle(`Change Order ${co.number}: ${co.title}`);
  doc.setAuthor(company.companyName);
  doc.setCreationDate(new Date());

  const r = new CO_Renderer(doc);
  await r.init();

  // 1. Header
  drawHeader(r, company);

  // 2. CO identification block
  drawCoBlock(r, co, project);

  // 3. Description paragraph
  if (co.description) {
    drawDescription(r, co.description);
  }

  // 4. Line items table → returns grand total
  const changeAmount = co.lineItems.length > 0
    ? drawLineItemsTable(r, co.lineItems)
    : 0;

  // 5. Contract summary (original + this CO + new total)
  drawContractSummary(r, originalContractValue, changeAmount);

  // 6. Signature lines
  drawSignatures(r, co);

  // 7. Page numbers
  r.stampPageNumbers();

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
