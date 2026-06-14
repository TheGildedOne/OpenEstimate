import type { FastifyInstance } from 'fastify';
import { db } from '../db/index';
import {
  takeoffSheets,
  takeoffMeasurements,
  projectDocuments,
  projects,
  estimateLineItems,
} from '../db/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { requireEstimatorOrAbove } from '../middleware/rbac';

export default async function takeoffRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // ── POST /api/takeoff/sheets ──────────────────────────────────────────────
  fastify.post('/api/takeoff/sheets', {
    preHandler: [requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const body = request.body as {
        projectId: number;
        pdfDocumentId: number;
        name: string;
        scaleValue?: number;
        scaleUnit?: 'ft' | 'm' | 'in';
        pageNumber?: number;
      };

      const { projectId, pdfDocumentId, name, scaleValue = 1, scaleUnit = 'ft', pageNumber = 1 } = body;

      if (!projectId || !pdfDocumentId || !name) {
        return reply.status(400).send({ error: 'projectId, pdfDocumentId, and name are required', code: 'VALIDATION_ERROR' });
      }

      const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1);
      if (!project) return reply.status(404).send({ error: 'Project not found', code: 'NOT_FOUND' });

      const [doc] = await db.select({ id: projectDocuments.id, projectId: projectDocuments.projectId }).from(projectDocuments).where(eq(projectDocuments.id, pdfDocumentId)).limit(1);
      if (!doc || doc.projectId !== projectId) return reply.status(404).send({ error: 'Document not found in project', code: 'NOT_FOUND' });

      const [sheet] = await db.insert(takeoffSheets).values({
        projectId,
        pdfDocumentId,
        name,
        scaleValue,
        scaleUnit,
        pageNumber,
        createdAt: new Date().toISOString(),
      }).returning();

      return reply.status(201).send(sheet);
    },
  });

  // ── GET /api/takeoff/sheets/:id ───────────────────────────────────────────
  fastify.get('/api/takeoff/sheets/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const sheetId = parseInt(id, 10);
    if (isNaN(sheetId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

    const [sheet] = await db.select().from(takeoffSheets).where(eq(takeoffSheets.id, sheetId)).limit(1);
    if (!sheet) return reply.status(404).send({ error: 'Takeoff sheet not found', code: 'NOT_FOUND' });

    const measurements = await db.select().from(takeoffMeasurements).where(eq(takeoffMeasurements.sheetId, sheetId));

    return reply.send({ ...sheet, measurements });
  });

  // ── PUT /api/takeoff/sheets/:id ───────────────────────────────────────────
  fastify.put('/api/takeoff/sheets/:id', {
    preHandler: [requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const sheetId = parseInt(id, 10);
      if (isNaN(sheetId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

      const [sheet] = await db.select().from(takeoffSheets).where(eq(takeoffSheets.id, sheetId)).limit(1);
      if (!sheet) return reply.status(404).send({ error: 'Takeoff sheet not found', code: 'NOT_FOUND' });

      const body = request.body as { name?: string; scaleValue?: number; scaleUnit?: 'ft' | 'm' | 'in' };
      const updates: Partial<typeof sheet> = {};
      if (body.name !== undefined) updates.name = body.name;
      if (body.scaleValue !== undefined) updates.scaleValue = body.scaleValue;
      if (body.scaleUnit !== undefined) updates.scaleUnit = body.scaleUnit;

      const [updated] = await db.update(takeoffSheets).set(updates).where(eq(takeoffSheets.id, sheetId)).returning();
      return reply.send(updated);
    },
  });

  // ── DELETE /api/takeoff/sheets/:id ────────────────────────────────────────
  fastify.delete('/api/takeoff/sheets/:id', {
    preHandler: [requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const sheetId = parseInt(id, 10);
      if (isNaN(sheetId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

      const [sheet] = await db.select().from(takeoffSheets).where(eq(takeoffSheets.id, sheetId)).limit(1);
      if (!sheet) return reply.status(404).send({ error: 'Takeoff sheet not found', code: 'NOT_FOUND' });

      await db.delete(takeoffSheets).where(eq(takeoffSheets.id, sheetId));
      return reply.status(204).send();
    },
  });

  // ── GET /api/projects/:projectId/takeoff/sheets ───────────────────────────
  fastify.get('/api/projects/:projectId/takeoff/sheets', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const pid = parseInt(projectId, 10);
    if (isNaN(pid)) return reply.status(400).send({ error: 'Invalid projectId', code: 'VALIDATION_ERROR' });

    const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, pid)).limit(1);
    if (!project) return reply.status(404).send({ error: 'Project not found', code: 'NOT_FOUND' });

    const sheets = await db.select().from(takeoffSheets).where(eq(takeoffSheets.projectId, pid));

    // Attach measurement counts
    const sheetsWithCounts = await Promise.all(sheets.map(async (s) => {
      const [countRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(takeoffMeasurements)
        .where(eq(takeoffMeasurements.sheetId, s.id));
      return { ...s, measurementCount: countRow?.count ?? 0 };
    }));

    return reply.send(sheetsWithCounts);
  });

  // ── POST /api/takeoff/sheets/:sheetId/measurements ───────────────────────
  fastify.post('/api/takeoff/sheets/:sheetId/measurements', {
    preHandler: [requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const { sheetId } = request.params as { sheetId: string };
      const sid = parseInt(sheetId, 10);
      if (isNaN(sid)) return reply.status(400).send({ error: 'Invalid sheetId', code: 'VALIDATION_ERROR' });

      const [sheet] = await db.select().from(takeoffSheets).where(eq(takeoffSheets.id, sid)).limit(1);
      if (!sheet) return reply.status(404).send({ error: 'Takeoff sheet not found', code: 'NOT_FOUND' });

      const body = request.body as {
        label: string;
        type: 'linear' | 'area' | 'count' | 'volume';
        pointsJson: string;
        calculatedValue: number;
        unit: string;
        color?: string;
        depth?: number;
        linkedLineItemId?: number;
      };

      const { label, type, pointsJson, calculatedValue, unit, color = '#3b82f6', depth, linkedLineItemId } = body;

      if (!label || !type || !unit || calculatedValue === undefined) {
        return reply.status(400).send({ error: 'label, type, unit, and calculatedValue are required', code: 'VALIDATION_ERROR' });
      }

      if (linkedLineItemId) {
        const [li] = await db.select({ id: estimateLineItems.id }).from(estimateLineItems).where(eq(estimateLineItems.id, linkedLineItemId)).limit(1);
        if (!li) return reply.status(404).send({ error: 'Line item not found', code: 'NOT_FOUND' });
      }

      const [measurement] = await db.insert(takeoffMeasurements).values({
        sheetId: sid,
        label,
        type,
        pointsJson: pointsJson ?? '[]',
        calculatedValue,
        unit,
        color,
        depth: depth ?? null,
        linkedLineItemId: linkedLineItemId ?? null,
        createdAt: new Date().toISOString(),
      }).returning();

      return reply.status(201).send(measurement);
    },
  });

  // ── PUT /api/takeoff/measurements/:id ─────────────────────────────────────
  fastify.put('/api/takeoff/measurements/:id', {
    preHandler: [requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const mid = parseInt(id, 10);
      if (isNaN(mid)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

      const [measurement] = await db.select().from(takeoffMeasurements).where(eq(takeoffMeasurements.id, mid)).limit(1);
      if (!measurement) return reply.status(404).send({ error: 'Measurement not found', code: 'NOT_FOUND' });

      const body = request.body as {
        label?: string;
        pointsJson?: string;
        calculatedValue?: number;
        unit?: string;
        color?: string;
        depth?: number | null;
        linkedLineItemId?: number | null;
      };

      const updates: Record<string, unknown> = {};
      if (body.label !== undefined) updates.label = body.label;
      if (body.pointsJson !== undefined) updates.pointsJson = body.pointsJson;
      if (body.calculatedValue !== undefined) updates.calculatedValue = body.calculatedValue;
      if (body.unit !== undefined) updates.unit = body.unit;
      if (body.color !== undefined) updates.color = body.color;
      if ('depth' in body) updates.depth = body.depth ?? null;
      if ('linkedLineItemId' in body) updates.linkedLineItemId = body.linkedLineItemId ?? null;

      const [updated] = await db.update(takeoffMeasurements).set(updates).where(eq(takeoffMeasurements.id, mid)).returning();
      return reply.send(updated);
    },
  });

  // ── DELETE /api/takeoff/measurements/:id ──────────────────────────────────
  fastify.delete('/api/takeoff/measurements/:id', {
    preHandler: [requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const mid = parseInt(id, 10);
      if (isNaN(mid)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

      const [measurement] = await db.select().from(takeoffMeasurements).where(eq(takeoffMeasurements.id, mid)).limit(1);
      if (!measurement) return reply.status(404).send({ error: 'Measurement not found', code: 'NOT_FOUND' });

      await db.delete(takeoffMeasurements).where(eq(takeoffMeasurements.id, mid));
      return reply.status(204).send();
    },
  });

  // ── POST /api/takeoff/measurements/:id/link-line-item ─────────────────────
  fastify.post('/api/takeoff/measurements/:id/link-line-item', {
    preHandler: [requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const mid = parseInt(id, 10);
      if (isNaN(mid)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

      const [measurement] = await db.select().from(takeoffMeasurements).where(eq(takeoffMeasurements.id, mid)).limit(1);
      if (!measurement) return reply.status(404).send({ error: 'Measurement not found', code: 'NOT_FOUND' });

      const body = request.body as { lineItemId: number | null };

      if (body.lineItemId !== null && body.lineItemId !== undefined) {
        const [li] = await db.select({ id: estimateLineItems.id }).from(estimateLineItems).where(eq(estimateLineItems.id, body.lineItemId)).limit(1);
        if (!li) return reply.status(404).send({ error: 'Line item not found', code: 'NOT_FOUND' });
      }

      const [updated] = await db
        .update(takeoffMeasurements)
        .set({ linkedLineItemId: body.lineItemId ?? null })
        .where(eq(takeoffMeasurements.id, mid))
        .returning();

      return reply.send(updated);
    },
  });

  // ── GET /api/projects/:projectId/takeoff/summary ──────────────────────────
  fastify.get('/api/projects/:projectId/takeoff/summary', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const pid = parseInt(projectId, 10);
    if (isNaN(pid)) return reply.status(400).send({ error: 'Invalid projectId', code: 'VALIDATION_ERROR' });

    const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, pid)).limit(1);
    if (!project) return reply.status(404).send({ error: 'Project not found', code: 'NOT_FOUND' });

    const sheets = await db.select().from(takeoffSheets).where(eq(takeoffSheets.projectId, pid));
    const sheetIds = sheets.map((s) => s.id);

    if (sheetIds.length === 0) {
      return reply.send({
        totalSheets: 0,
        totalMeasurements: 0,
        byType: { linear: { count: 0, totalValue: 0, unit: 'LF' }, area: { count: 0, totalValue: 0, unit: 'SF' }, count: { count: 0, totalValue: 0, unit: 'EA' }, volume: { count: 0, totalValue: 0, unit: 'CF' } },
        sheets: [],
      });
    }

    const allMeasurements = await db
      .select()
      .from(takeoffMeasurements)
      .where(inArray(takeoffMeasurements.sheetId, sheetIds));

    const byType: Record<string, { count: number; totalValue: number; unit: string }> = {
      linear: { count: 0, totalValue: 0, unit: 'LF' },
      area: { count: 0, totalValue: 0, unit: 'SF' },
      count: { count: 0, totalValue: 0, unit: 'EA' },
      volume: { count: 0, totalValue: 0, unit: 'CF' },
    };

    for (const m of allMeasurements) {
      if (byType[m.type]) {
        byType[m.type].count += 1;
        byType[m.type].totalValue += m.calculatedValue;
      }
    }

    const sheetsWithSummary = sheets.map((s) => {
      const sheetMeasurements = allMeasurements.filter((m) => m.sheetId === s.id);
      const sheetByType: Record<string, number> = { linear: 0, area: 0, count: 0, volume: 0 };
      for (const m of sheetMeasurements) sheetByType[m.type] = (sheetByType[m.type] ?? 0) + m.calculatedValue;
      return { ...s, measurementCount: sheetMeasurements.length, totalsByType: sheetByType };
    });

    return reply.send({
      totalSheets: sheets.length,
      totalMeasurements: allMeasurements.length,
      byType,
      sheets: sheetsWithSummary,
    });
  });
}
