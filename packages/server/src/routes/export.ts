import type { FastifyInstance } from 'fastify';
import { db } from '../db/index';
import {
  estimates,
  estimateSections,
  estimateLineItems,
  changeOrders,
  changeOrderLineItems,
  projects,
  takeoffSheets,
  takeoffMeasurements,
  companySettings,
} from '../db/schema';
import { eq, asc } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { calculateLineItem, calculateSectionTotals, calculateEstimateTotals } from '../lib/estimateCalculator';
import { generateProposalPdf } from '../services/export/proposalPdf';
import { generateInternalPdf } from '../services/export/proposalPdf';
import { generateEstimateExcel } from '../services/export/excel';

// ── Helper: load full estimate ────────────────────────────────────────────────
async function loadFullEstimate(estimateId: number) {
  const [estimate] = await db.select().from(estimates).where(eq(estimates.id, estimateId)).limit(1);
  if (!estimate) return null;

  const sections = await db
    .select()
    .from(estimateSections)
    .where(eq(estimateSections.estimateId, estimateId))
    .orderBy(asc(estimateSections.sortOrder));

  const lineItems = await db
    .select()
    .from(estimateLineItems)
    .where(eq(estimateLineItems.estimateId, estimateId))
    .orderBy(asc(estimateLineItems.sortOrder));

  const annotated = lineItems.map((li) => ({ ...li, ...calculateLineItem(li) }));

  const sectionsWithItems = sections.map((sec) => ({
    ...sec,
    lineItems: annotated.filter((li) => li.sectionId === sec.id),
    ...calculateSectionTotals(annotated.filter((li) => li.sectionId === sec.id)),
  }));

  const sectionTotals = calculateSectionTotals(annotated);
  const estimateTotals = calculateEstimateTotals({
    subtotal: sectionTotals.totalCost,
    overheadPct: estimate.overheadPct,
    profitPct: estimate.profitPct,
    taxPct: estimate.taxPct,
    bondPct: estimate.bondPct,
  });

  return { ...estimate, sections: sectionsWithItems, totals: { ...sectionTotals, ...estimateTotals } };
}

export default async function exportRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // ── GET /api/estimates/:id/export/proposal-pdf ────────────────────────────
  fastify.get('/api/estimates/:id/export/proposal-pdf', async (request, reply) => {
    const { id } = request.params as { id: string };
    const estId = parseInt(id, 10);
    if (isNaN(estId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

    const fullEstimate = await loadFullEstimate(estId);
    if (!fullEstimate) return reply.status(404).send({ error: 'Estimate not found', code: 'NOT_FOUND' });

    const [project] = await db.select().from(projects).where(eq(projects.id, fullEstimate.projectId)).limit(1);
    const [settings] = await db.select().from(companySettings).limit(1);

    const pdfBuffer = await generateProposalPdf({ estimate: fullEstimate, project: project!, settings: settings ?? null, internal: false });

    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="proposal-${estId}.pdf"`);
    return reply.send(pdfBuffer);
  });

  // ── GET /api/estimates/:id/export/internal-pdf ────────────────────────────
  fastify.get('/api/estimates/:id/export/internal-pdf', async (request, reply) => {
    const { id } = request.params as { id: string };
    const estId = parseInt(id, 10);
    if (isNaN(estId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

    const fullEstimate = await loadFullEstimate(estId);
    if (!fullEstimate) return reply.status(404).send({ error: 'Estimate not found', code: 'NOT_FOUND' });

    const [project] = await db.select().from(projects).where(eq(projects.id, fullEstimate.projectId)).limit(1);
    const [settings] = await db.select().from(companySettings).limit(1);

    const pdfBuffer = await generateInternalPdf({ estimate: fullEstimate, project: project!, settings: settings ?? null, internal: true });

    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="estimate-internal-${estId}.pdf"`);
    return reply.send(pdfBuffer);
  });

  // ── GET /api/estimates/:id/export/excel ───────────────────────────────────
  fastify.get('/api/estimates/:id/export/excel', async (request, reply) => {
    const { id } = request.params as { id: string };
    const estId = parseInt(id, 10);
    if (isNaN(estId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

    const fullEstimate = await loadFullEstimate(estId);
    if (!fullEstimate) return reply.status(404).send({ error: 'Estimate not found', code: 'NOT_FOUND' });

    const [project] = await db.select().from(projects).where(eq(projects.id, fullEstimate.projectId)).limit(1);

    const xlsxBuffer = await generateEstimateExcel({ estimate: fullEstimate, project: project! });

    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', `attachment; filename="estimate-${estId}.xlsx"`);
    return reply.send(xlsxBuffer);
  });

  // ── GET /api/estimates/:id/export/csv ─────────────────────────────────────
  fastify.get('/api/estimates/:id/export/csv', async (request, reply) => {
    const { id } = request.params as { id: string };
    const estId = parseInt(id, 10);
    if (isNaN(estId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

    const fullEstimate = await loadFullEstimate(estId);
    if (!fullEstimate) return reply.status(404).send({ error: 'Estimate not found', code: 'NOT_FOUND' });

    const rows: string[] = [];
    rows.push(['Section', 'Description', 'Qty', 'Unit', 'Unit Mat Cost', 'Unit Labor Cost', 'Labor Hours', 'Labor Rate', 'Waste%', 'Total Material', 'Total Labor', 'Total Cost'].join(','));

    for (const sec of fullEstimate.sections) {
      for (const li of sec.lineItems) {
        rows.push([
          `"${sec.name.replace(/"/g, '""')}"`,
          `"${li.description.replace(/"/g, '""')}"`,
          li.quantity,
          `"${li.unit}"`,
          li.unitMaterialCost.toFixed(2),
          li.unitLaborCost.toFixed(2),
          li.laborHours.toFixed(2),
          li.laborRate.toFixed(2),
          li.wasteFactorPct.toFixed(2),
          li.totalMaterial.toFixed(2),
          li.totalLabor.toFixed(2),
          li.totalCost.toFixed(2),
        ].join(','));
      }
    }

    const csv = rows.join('\n');

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', `attachment; filename="estimate-${estId}.csv"`);
    return reply.send(csv);
  });

  // ── GET /api/estimates/:id/export/quickbooks-csv ──────────────────────────
  fastify.get('/api/estimates/:id/export/quickbooks-csv', async (request, reply) => {
    const { id } = request.params as { id: string };
    const estId = parseInt(id, 10);
    if (isNaN(estId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

    const fullEstimate = await loadFullEstimate(estId);
    if (!fullEstimate) return reply.status(404).send({ error: 'Estimate not found', code: 'NOT_FOUND' });

    const [project] = await db.select().from(projects).where(eq(projects.id, fullEstimate.projectId)).limit(1);

    const rows: string[] = [];
    // QuickBooks-style: Invoice line items format
    rows.push(['Customer', 'Date', 'Item', 'Description', 'Qty', 'Rate', 'Amount', 'Class'].join(','));

    const date = new Date().toISOString().split('T')[0];
    const customer = `"${(project?.clientName ?? 'Unknown').replace(/"/g, '""')}"`;

    for (const sec of fullEstimate.sections) {
      for (const li of sec.lineItems) {
        rows.push([
          customer,
          date,
          `"${li.unit}"`,
          `"${li.description.replace(/"/g, '""')}"`,
          li.quantity,
          (li.totalCost / (li.quantity || 1)).toFixed(2),
          li.totalCost.toFixed(2),
          `"${sec.name.replace(/"/g, '""')}"`,
        ].join(','));
      }
    }

    const csv = rows.join('\n');

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', `attachment; filename="quickbooks-${estId}.csv"`);
    return reply.send(csv);
  });

  // ── GET /api/change-orders/:id/export/pdf ─────────────────────────────────
  fastify.get('/api/change-orders/:id/export/pdf', async (request, reply) => {
    const { id } = request.params as { id: string };
    const coId = parseInt(id, 10);
    if (isNaN(coId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

    const [co] = await db.select().from(changeOrders).where(eq(changeOrders.id, coId)).limit(1);
    if (!co) return reply.status(404).send({ error: 'Change order not found', code: 'NOT_FOUND' });

    const [project] = await db.select().from(projects).where(eq(projects.id, co.projectId)).limit(1);
    const lineItems = await db.select().from(changeOrderLineItems).where(eq(changeOrderLineItems.changeOrderId, coId));
    const [settings] = await db.select().from(companySettings).limit(1);

    const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const { width, height } = page.getSize();

    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    let y = height - 50;
    const margin = 50;

    const companyName = settings?.companyName ?? 'Company';
    page.drawText(companyName, { x: margin, y, font: fontBold, size: 16, color: rgb(0.1, 0.1, 0.1) });
    y -= 30;

    page.drawText(`CHANGE ORDER`, { x: margin, y, font: fontBold, size: 20, color: rgb(0.2, 0.2, 0.8) });
    y -= 25;
    page.drawText(`${co.number} – ${co.title}`, { x: margin, y, font: fontBold, size: 14 });
    y -= 20;
    page.drawText(`Project: ${project?.name ?? ''}`, { x: margin, y, font, size: 11 });
    y -= 16;
    page.drawText(`Client: ${project?.clientName ?? ''}`, { x: margin, y, font, size: 11 });
    y -= 16;
    page.drawText(`Status: ${co.status.toUpperCase()}`, { x: margin, y, font: fontBold, size: 11 });
    y -= 16;
    page.drawText(`Date: ${new Date().toLocaleDateString()}`, { x: margin, y, font, size: 11 });
    y -= 25;

    if (co.description) {
      page.drawText('Description:', { x: margin, y, font: fontBold, size: 11 });
      y -= 15;
      // Simple word wrap
      const words = co.description.split(' ');
      let line = '';
      for (const word of words) {
        const testLine = line ? `${line} ${word}` : word;
        if (testLine.length > 90) {
          page.drawText(line, { x: margin, y, font, size: 10 });
          y -= 14;
          line = word;
        } else {
          line = testLine;
        }
      }
      if (line) { page.drawText(line, { x: margin, y, font, size: 10 }); y -= 14; }
      y -= 10;
    }

    // Line items header
    page.drawText('No.', { x: margin, y, font: fontBold, size: 10 });
    page.drawText('Description', { x: margin + 30, y, font: fontBold, size: 10 });
    page.drawText('Qty', { x: margin + 310, y, font: fontBold, size: 10 });
    page.drawText('Unit', { x: margin + 350, y, font: fontBold, size: 10 });
    page.drawText('Unit Cost', { x: margin + 390, y, font: fontBold, size: 10 });
    page.drawText('Total', { x: margin + 460, y, font: fontBold, size: 10 });
    y -= 15;
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: rgb(0.5, 0.5, 0.5) });
    y -= 12;

    let grandTotal = 0;
    lineItems.forEach((li, i) => {
      if (y < 150) return; // simple overflow protection
      page.drawText(String(i + 1), { x: margin, y, font, size: 9 });
      const desc = li.description.length > 55 ? li.description.slice(0, 55) + '…' : li.description;
      page.drawText(desc, { x: margin + 30, y, font, size: 9 });
      page.drawText(String(li.quantity), { x: margin + 310, y, font, size: 9 });
      page.drawText(li.unit, { x: margin + 350, y, font, size: 9 });
      page.drawText(`$${li.unitCost.toFixed(2)}`, { x: margin + 390, y, font, size: 9 });
      page.drawText(`$${li.totalCost.toFixed(2)}`, { x: margin + 460, y, font, size: 9 });
      grandTotal += li.totalCost;
      y -= 14;
    });

    y -= 10;
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: rgb(0.5, 0.5, 0.5) });
    y -= 15;
    page.drawText(`TOTAL:`, { x: margin + 390, y, font: fontBold, size: 11 });
    page.drawText(`$${grandTotal.toFixed(2)}`, { x: margin + 460, y, font: fontBold, size: 11 });

    // Signature line
    y -= 60;
    page.drawLine({ start: { x: margin, y }, end: { x: margin + 200, y }, thickness: 1, color: rgb(0.3, 0.3, 0.3) });
    page.drawLine({ start: { x: margin + 260, y }, end: { x: margin + 460, y }, thickness: 1, color: rgb(0.3, 0.3, 0.3) });
    y -= 14;
    page.drawText('Authorized Signature', { x: margin, y, font, size: 9 });
    page.drawText('Date', { x: margin + 260, y, font, size: 9 });

    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);

    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="change-order-${co.number}.pdf"`);
    return reply.send(pdfBuffer);
  });

  // ── GET /api/projects/:projectId/takeoff/export/summary-csv ──────────────
  fastify.get('/api/projects/:projectId/takeoff/export/summary-csv', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const pid = parseInt(projectId, 10);
    if (isNaN(pid)) return reply.status(400).send({ error: 'Invalid projectId', code: 'VALIDATION_ERROR' });

    const [project] = await db.select().from(projects).where(eq(projects.id, pid)).limit(1);
    if (!project) return reply.status(404).send({ error: 'Project not found', code: 'NOT_FOUND' });

    const sheets = await db.select().from(takeoffSheets).where(eq(takeoffSheets.projectId, pid));

    const rows: string[] = [];
    rows.push(['Sheet Name', 'Page', 'Scale', 'Label', 'Type', 'Calculated Value', 'Unit', 'Color'].join(','));

    for (const sheet of sheets) {
      const measurements = await db
        .select()
        .from(takeoffMeasurements)
        .where(eq(takeoffMeasurements.sheetId, sheet.id));

      for (const m of measurements) {
        rows.push([
          `"${sheet.name.replace(/"/g, '""')}"`,
          sheet.pageNumber,
          `${sheet.scaleValue} ${sheet.scaleUnit}`,
          `"${m.label.replace(/"/g, '""')}"`,
          m.type,
          m.calculatedValue.toFixed(4),
          m.unit,
          m.color,
        ].join(','));
      }

      if (measurements.length === 0) {
        rows.push([`"${sheet.name.replace(/"/g, '""')}"`, sheet.pageNumber, `${sheet.scaleValue} ${sheet.scaleUnit}`, '', '', '', '', ''].join(','));
      }
    }

    const csv = rows.join('\n');

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', `attachment; filename="takeoff-summary-${pid}.csv"`);
    return reply.send(csv);
  });
}
