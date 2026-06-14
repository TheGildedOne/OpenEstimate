import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from 'pdf-lib';
import {
  calculateLineItem,
  calculateSectionTotals,
  calculateEstimateTotals,
} from '../../lib/estimateCalculator';
import type { EstimateLineItem } from '@openestimate/shared';

// Re-export the shared interface type so export.ts can import from here
export interface ProposalPdfInput {
  estimate: {
    id: number;
    name: string;
    overheadPct: number;
    profitPct: number;
    taxPct: number;
    bondPct: number;
    notes: string | null;
    sections: Array<{
      id: number;
      name: string;
      color: string | null;
      lineItems: Array<EstimateLineItem>;
    }>;
  };
  project: {
    name: string;
    clientName: string;
    clientEmail: string | null;
    siteAddress: string | null;
  };
  company: {
    companyName: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    licenseNumber: string | null;
    logoUrl: string | null;
    termsAndConditions: string | null;
    defaultOverheadPct: number;
    defaultProfitPct: number;
  };
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function formatPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

interface DrawContext {
  page: PDFPage;
  font: PDFFont;
  boldFont: PDFFont;
  width: number;
  height: number;
  margin: number;
  y: number;
  pageCount: number;
  totalPages: number;
}

const FONT_SIZE = 7.5;
const LINE_HEIGHT = 11;
const HEADER_HEIGHT = 60;
const FOOTER_HEIGHT = 20;

function ensureSpace(ctx: DrawContext, needed: number, pages: PDFPage[], doc: PDFDocument, headerFn: (c: DrawContext) => void): DrawContext {
  if (ctx.y - needed < ctx.margin + FOOTER_HEIGHT) {
    // Draw footer on current page
    drawFooter(ctx);
    ctx.pageCount++;
    const newPage = doc.addPage([612, 792]);
    pages.push(newPage);
    const newCtx: DrawContext = {
      ...ctx,
      page: newPage,
      y: newPage.getHeight() - ctx.margin,
    };
    headerFn(newCtx);
    newCtx.y -= HEADER_HEIGHT + 8;
    return newCtx;
  }
  return ctx;
}

function drawFooter(ctx: DrawContext) {
  const text = `CONFIDENTIAL — NOT FOR CLIENT DISTRIBUTION  |  Page ${ctx.pageCount} of ${ctx.totalPages}`;
  ctx.page.drawText(text, {
    x: ctx.margin,
    y: 18,
    size: 7,
    font: ctx.font,
    color: rgb(0.5, 0.5, 0.5),
  });
}

function drawHeader(ctx: DrawContext, company: ProposalPdfInput['company'], estimateName: string, isFirst: boolean) {
  const { page, boldFont, font, width, margin } = ctx;
  const y = page.getHeight() - margin;

  // Red "INTERNAL" banner on first page
  if (isFirst) {
    page.drawRectangle({
      x: margin,
      y: y - 14,
      width: width - margin * 2,
      height: 14,
      color: rgb(0.8, 0.1, 0.1),
    });
    page.drawText('INTERNAL ESTIMATE — CONFIDENTIAL — NOT FOR CLIENT DISTRIBUTION', {
      x: margin + 4,
      y: y - 11,
      size: 7,
      font: boldFont,
      color: rgb(1, 1, 1),
    });
  }

  const hY = y - (isFirst ? 24 : 4);

  // Company name
  page.drawText(company.companyName, {
    x: margin,
    y: hY - 10,
    size: 12,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  });

  const contactParts = [company.address, company.phone, company.email].filter(Boolean);
  page.drawText(contactParts.join(' | '), {
    x: margin,
    y: hY - 22,
    size: 7,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  // Right side: estimate name + date
  const rightX = width - margin;
  page.drawText(estimateName, {
    x: rightX - boldFont.widthOfTextAtSize(estimateName, 10),
    y: hY - 10,
    size: 10,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  });

  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  page.drawText(dateStr, {
    x: rightX - font.widthOfTextAtSize(dateStr, 8),
    y: hY - 22,
    size: 8,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  // Divider
  page.drawLine({
    start: { x: margin, y: hY - 28 },
    end: { x: width - margin, y: hY - 28 },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });
}

export async function generateInternalPdf(input: ProposalPdfInput): Promise<Buffer> {
  const doc = PDFDocument.create ? await PDFDocument.create() : (PDFDocument as any).create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const WIDTH = 612;
  const HEIGHT = 792;
  const MARGIN = 36;

  const pages: PDFPage[] = [];
  const firstPage = doc.addPage([WIDTH, HEIGHT]);
  pages.push(firstPage);

  // Column widths for the full internal grid
  const cols = {
    num: 18,
    desc: 120,
    qty: 30,
    unit: 24,
    unitMat: 42,
    unitLab: 42,
    lh: 22,
    lr: 38,
    waste: 28,
    totMat: 42,
    totLab: 42,
    totCost: 46,
  };
  const totalTableW = Object.values(cols).reduce((a, b) => a + b, 0);

  let isFirst = true;

  const makeHeader = (c: DrawContext) => drawHeader(c, input.company, input.estimate.name, isFirst);

  let ctx: DrawContext = {
    page: firstPage,
    font,
    boldFont,
    width: WIDTH,
    height: HEIGHT,
    margin: MARGIN,
    y: HEIGHT - MARGIN,
    pageCount: 1,
    totalPages: 1, // Will be updated after
  };

  makeHeader(ctx);
  isFirst = false;
  ctx.y -= HEADER_HEIGHT + 12;

  // Project info block
  const projectLine = `${input.project.name} — ${input.project.clientName}${input.project.siteAddress ? ` — ${input.project.siteAddress}` : ''}`;
  ctx.page.drawText(projectLine, {
    x: MARGIN,
    y: ctx.y,
    size: 9,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  });
  ctx.y -= 18;

  // Column headers row
  function drawColumnHeaders(c: DrawContext) {
    const headers = ['#', 'Description', 'Qty', 'Unit', 'Unit Mat', 'Unit Lab', 'L.Hrs', 'Rate', 'Wst%', 'Tot Mat', 'Tot Lab', 'Total'];
    const widths = Object.values(cols);
    c.page.drawRectangle({
      x: MARGIN,
      y: c.y - LINE_HEIGHT,
      width: totalTableW,
      height: LINE_HEIGHT,
      color: rgb(0.2, 0.2, 0.2),
    });
    let x = MARGIN + 2;
    headers.forEach((h, i) => {
      c.page.drawText(h, {
        x,
        y: c.y - LINE_HEIGHT + 2,
        size: 6,
        font: boldFont,
        color: rgb(1, 1, 1),
      });
      x += widths[i];
    });
    c.y -= LINE_HEIGHT + 2;
    return c;
  }

  ctx = drawColumnHeaders(ctx);

  // Calculate all totals first
  let allItems: EstimateLineItem[] = [];
  input.estimate.sections.forEach((s) => allItems.push(...s.lineItems));

  const annotated = allItems.map((item) => ({
    ...item,
    ...calculateLineItem(item),
  }));

  const sectionAnnotations = input.estimate.sections.map((section) => {
    const items = annotated.filter((i) => section.lineItems.some((li) => li.id === i.id));
    return { ...section, annotatedItems: items, totals: calculateSectionTotals(items) };
  });

  const subtotal = sectionAnnotations.reduce((s, sec) => s + sec.totals.totalCost, 0);
  const totals = calculateEstimateTotals({
    subtotal,
    overheadPct: input.estimate.overheadPct,
    profitPct:   input.estimate.profitPct,
    taxPct:      input.estimate.taxPct,
    bondPct:     input.estimate.bondPct,
  });
  let totalLaborHours = 0;
  annotated.forEach((i) => { totalLaborHours += i.quantity * i.laborHours; });

  // Draw sections
  for (let si = 0; si < sectionAnnotations.length; si++) {
    const section = sectionAnnotations[si];

    ctx = ensureSpace(ctx, LINE_HEIGHT + 4, pages, doc, (c) => { drawHeader(c, input.company, input.estimate.name, false); c.y -= HEADER_HEIGHT + 12; });

    // Section header
    ctx.page.drawRectangle({
      x: MARGIN,
      y: ctx.y - LINE_HEIGHT,
      width: totalTableW,
      height: LINE_HEIGHT,
      color: rgb(0.85, 0.87, 0.92),
    });
    ctx.page.drawText(section.name.toUpperCase(), {
      x: MARGIN + 2,
      y: ctx.y - LINE_HEIGHT + 2,
      size: 7,
      font: boldFont,
      color: rgb(0.2, 0.2, 0.6),
    });
    ctx.y -= LINE_HEIGHT + 1;

    // Line items
    for (let ii = 0; ii < section.annotatedItems.length; ii++) {
      const item = section.annotatedItems[ii];
      if (item.parentItemId) continue; // Skip child items (listed under parent)

      ctx = ensureSpace(ctx, LINE_HEIGHT, pages, doc, (c) => {
        drawHeader(c, input.company, input.estimate.name, false);
        c.y -= HEADER_HEIGHT + 12;
        drawColumnHeaders(c);
      });

      const isEven = ii % 2 === 0;
      if (isEven) {
        ctx.page.drawRectangle({
          x: MARGIN,
          y: ctx.y - LINE_HEIGHT,
          width: totalTableW,
          height: LINE_HEIGHT,
          color: rgb(0.97, 0.97, 0.98),
        });
      }

      const widths = Object.values(cols);
      const values = [
        `${ii + 1}`,
        (item.description.length > 22 ? item.description.slice(0, 22) + '…' : item.description),
        item.quantity.toString(),
        item.unit,
        formatCurrency(item.unitMaterialCost),
        formatCurrency(item.unitLaborCost),
        item.laborHours.toFixed(2),
        formatCurrency(item.laborRate),
        `${item.wasteFactorPct}%`,
        formatCurrency((item as any).totalMaterial ?? 0),
        formatCurrency((item as any).totalLabor ?? 0),
        formatCurrency((item as any).totalCost ?? 0),
      ];

      let x = MARGIN + 2;
      values.forEach((v, i) => {
        const isRight = i >= 4;
        ctx.page.drawText(v, {
          x: isRight ? x + widths[i] - font.widthOfTextAtSize(v, FONT_SIZE) - 2 : x,
          y: ctx.y - LINE_HEIGHT + 2,
          size: FONT_SIZE,
          font: i === values.length - 1 ? boldFont : font,
          color: rgb(0.1, 0.1, 0.1),
        });
        x += widths[i];
      });
      ctx.y -= LINE_HEIGHT;
    }

    // Section subtotal
    const st = section.totals;
    ctx.page.drawRectangle({
      x: MARGIN,
      y: ctx.y - LINE_HEIGHT,
      width: totalTableW,
      height: LINE_HEIGHT,
      color: rgb(0.93, 0.93, 0.97),
    });
    ctx.page.drawText(`${section.name} Subtotal`, {
      x: MARGIN + 2,
      y: ctx.y - LINE_HEIGHT + 2,
      size: FONT_SIZE,
      font: boldFont,
      color: rgb(0.1, 0.1, 0.3),
    });
    const subtotalRight = MARGIN + totalTableW - 2;
    ctx.page.drawText(formatCurrency(st.totalCost), {
      x: subtotalRight - boldFont.widthOfTextAtSize(formatCurrency(st.totalCost), FONT_SIZE),
      y: ctx.y - LINE_HEIGHT + 2,
      size: FONT_SIZE,
      font: boldFont,
      color: rgb(0.1, 0.1, 0.3),
    });
    ctx.y -= LINE_HEIGHT + 6;
  }

  // Totals section
  ctx = ensureSpace(ctx, 100, pages, doc, (c) => { drawHeader(c, input.company, input.estimate.name, false); c.y -= HEADER_HEIGHT + 12; });
  ctx.y -= 8;

  const totalsData = [
    ['Subtotal', formatCurrency(totals.subtotal)],
    [`Overhead (${formatPct(input.estimate.overheadPct)})`, formatCurrency(totals.overheadAmt)],
    [`Profit (${formatPct(input.estimate.profitPct)})`, formatCurrency(totals.profitAmt)],
    [`Tax (${formatPct(input.estimate.taxPct)})`, formatCurrency(totals.taxAmt)],
    ...(input.estimate.bondPct > 0
      ? [[`Bond (${formatPct(input.estimate.bondPct)})`, formatCurrency(totals.bondAmt)]]
      : []),
    ['GRAND TOTAL', formatCurrency(totals.grandTotal)],
  ];

  const totalsX = WIDTH - MARGIN - 200;
  for (const [label, value] of totalsData) {
    const isGrand = label === 'GRAND TOTAL';
    if (isGrand) {
      ctx.page.drawRectangle({
        x: totalsX - 4,
        y: ctx.y - LINE_HEIGHT - 2,
        width: 204,
        height: LINE_HEIGHT + 4,
        color: rgb(0.15, 0.25, 0.55),
      });
    }
    ctx.page.drawText(label, {
      x: totalsX,
      y: ctx.y - LINE_HEIGHT + 2,
      size: isGrand ? 9 : 8,
      font: isGrand ? boldFont : font,
      color: isGrand ? rgb(1, 1, 1) : rgb(0.1, 0.1, 0.1),
    });
    ctx.page.drawText(value, {
      x: WIDTH - MARGIN - boldFont.widthOfTextAtSize(value, isGrand ? 9 : 8),
      y: ctx.y - LINE_HEIGHT + 2,
      size: isGrand ? 9 : 8,
      font: boldFont,
      color: isGrand ? rgb(1, 1, 1) : rgb(0.1, 0.1, 0.1),
    });
    ctx.y -= isGrand ? LINE_HEIGHT + 8 : LINE_HEIGHT + 2;
  }

  // Labor summary
  ctx.y -= 10;
  ctx.page.drawText(
    `Total Labor Hours: ${totalLaborHours.toFixed(1)} hrs`,
    { x: MARGIN, y: ctx.y, size: 8, font, color: rgb(0.3, 0.3, 0.3) }
  );

  // Draw footers on all pages
  ctx.totalPages = pages.length;
  pages.forEach((p, i) => {
    const fCtx: DrawContext = { ...ctx, page: p, pageCount: i + 1, totalPages: pages.length };
    drawFooter(fCtx);
  });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
