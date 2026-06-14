import type { FastifyInstance } from 'fastify';
import { db } from '../db/index';
import {
  templates,
  templateSections,
  templateLineItems,
  estimates,
  estimateSections,
  estimateLineItems,
  users,
} from '../db/schema';
import { eq, and, or, asc, desc, inArray } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { requireEstimatorOrAbove } from '../middleware/rbac';

async function getTemplateWithSections(templateId: number) {
  const [tmpl] = await db.select().from(templates).where(eq(templates.id, templateId)).limit(1);
  if (!tmpl) return null;

  const sections = await db
    .select()
    .from(templateSections)
    .where(eq(templateSections.templateId, templateId))
    .orderBy(asc(templateSections.sortOrder));

  const sectionIds = sections.map((s) => s.id);
  const items = sectionIds.length > 0
    ? await db
        .select()
        .from(templateLineItems)
        .where(inArray(templateLineItems.sectionId, sectionIds))
        .orderBy(asc(templateLineItems.sortOrder))
    : [];

  const sectionsWithItems = sections.map((sec) => ({
    ...sec,
    lineItems: items.filter((li) => li.sectionId === sec.id),
  }));

  return { ...tmpl, sections: sectionsWithItems };
}

export default async function templateRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // ── GET /api/templates ────────────────────────────────────────────────────
  fastify.get('/api/templates', async (request, reply) => {
    const userId = request.user.id;

    const rows = await db
      .select({
        id: templates.id,
        name: templates.name,
        tradeCategory: templates.tradeCategory,
        description: templates.description,
        createdBy: templates.createdBy,
        isPublic: templates.isPublic,
        createdAt: templates.createdAt,
        creatorName: users.name,
      })
      .from(templates)
      .leftJoin(users, eq(templates.createdBy, users.id))
      .where(or(eq(templates.isPublic, true), eq(templates.createdBy, userId)))
      .orderBy(desc(templates.createdAt));

    return reply.send(rows);
  });

  // ── POST /api/templates ───────────────────────────────────────────────────
  fastify.post('/api/templates', {
    preHandler: [requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const body = request.body as {
        name: string;
        tradeCategory?: string;
        description?: string;
        isPublic?: boolean;
      };

      if (!body.name) {
        return reply.status(400).send({ error: 'name is required', code: 'VALIDATION_ERROR' });
      }

      const [tmpl] = await db.insert(templates).values({
        name: body.name,
        tradeCategory: body.tradeCategory ?? null,
        description: body.description ?? null,
        isPublic: body.isPublic ?? false,
        createdBy: request.user.id,
        createdAt: new Date().toISOString(),
      }).returning();

      return reply.status(201).send(tmpl);
    },
  });

  // ── GET /api/templates/:id ────────────────────────────────────────────────
  fastify.get('/api/templates/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const tmplId = parseInt(id, 10);
    if (isNaN(tmplId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

    const tmpl = await getTemplateWithSections(tmplId);
    if (!tmpl) return reply.status(404).send({ error: 'Template not found', code: 'NOT_FOUND' });

    // Access control: must be public or own template
    if (!tmpl.isPublic && tmpl.createdBy !== request.user.id && request.user.role !== 'admin') {
      return reply.status(403).send({ error: 'Access denied', code: 'FORBIDDEN' });
    }

    return reply.send(tmpl);
  });

  // ── PUT /api/templates/:id ────────────────────────────────────────────────
  fastify.put('/api/templates/:id', {
    preHandler: [requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const tmplId = parseInt(id, 10);
      if (isNaN(tmplId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

      const [tmpl] = await db.select().from(templates).where(eq(templates.id, tmplId)).limit(1);
      if (!tmpl) return reply.status(404).send({ error: 'Template not found', code: 'NOT_FOUND' });

      if (tmpl.createdBy !== request.user.id && request.user.role !== 'admin') {
        return reply.status(403).send({ error: 'Access denied', code: 'FORBIDDEN' });
      }

      const body = request.body as Partial<{ name: string; tradeCategory: string; description: string; isPublic: boolean }>;
      const updates: Record<string, unknown> = {};
      if (body.name !== undefined) updates.name = body.name;
      if ('tradeCategory' in body) updates.tradeCategory = body.tradeCategory ?? null;
      if ('description' in body) updates.description = body.description ?? null;
      if (body.isPublic !== undefined) updates.isPublic = body.isPublic;

      const [updated] = await db.update(templates).set(updates).where(eq(templates.id, tmplId)).returning();
      return reply.send(updated);
    },
  });

  // ── DELETE /api/templates/:id ─────────────────────────────────────────────
  fastify.delete('/api/templates/:id', {
    preHandler: [requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const tmplId = parseInt(id, 10);
      if (isNaN(tmplId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

      const [tmpl] = await db.select().from(templates).where(eq(templates.id, tmplId)).limit(1);
      if (!tmpl) return reply.status(404).send({ error: 'Template not found', code: 'NOT_FOUND' });

      if (tmpl.createdBy !== request.user.id && request.user.role !== 'admin') {
        return reply.status(403).send({ error: 'Only the owner or an admin can delete a template', code: 'FORBIDDEN' });
      }

      await db.delete(templates).where(eq(templates.id, tmplId));
      return reply.status(204).send();
    },
  });

  // ── POST /api/templates/from-estimate/:estimateId ─────────────────────────
  fastify.post('/api/templates/from-estimate/:estimateId', {
    preHandler: [requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const { estimateId } = request.params as { estimateId: string };
      const estId = parseInt(estimateId, 10);
      if (isNaN(estId)) return reply.status(400).send({ error: 'Invalid estimateId', code: 'VALIDATION_ERROR' });

      const [estimate] = await db.select().from(estimates).where(eq(estimates.id, estId)).limit(1);
      if (!estimate) return reply.status(404).send({ error: 'Estimate not found', code: 'NOT_FOUND' });

      const body = request.body as { name?: string; description?: string; isPublic?: boolean; tradeCategory?: string };

      const sections = await db.select().from(estimateSections).where(eq(estimateSections.estimateId, estId)).orderBy(asc(estimateSections.sortOrder));
      const lineItems = await db.select().from(estimateLineItems).where(eq(estimateLineItems.estimateId, estId)).orderBy(asc(estimateLineItems.sortOrder));

      const [tmpl] = await db.insert(templates).values({
        name: body.name ?? `Template from ${estimate.name}`,
        tradeCategory: body.tradeCategory ?? null,
        description: body.description ?? null,
        isPublic: body.isPublic ?? false,
        createdBy: request.user.id,
        createdAt: new Date().toISOString(),
      }).returning();

      // Copy sections and line items
      for (const sec of sections) {
        const [tmplSec] = await db.insert(templateSections).values({
          templateId: tmpl.id,
          name: sec.name,
          sortOrder: sec.sortOrder,
          color: sec.color ?? null,
        }).returning();

        const sectionItems = lineItems.filter((li) => li.sectionId === sec.id);
        if (sectionItems.length > 0) {
          await db.insert(templateLineItems).values(
            sectionItems.map((li) => ({
              sectionId: tmplSec.id,
              description: li.description,
              quantity: li.quantity,
              unit: li.unit,
              unitMaterialCost: li.unitMaterialCost,
              unitLaborCost: li.unitLaborCost,
              laborHours: li.laborHours,
              laborRate: li.laborRate,
              wasteFactorPct: li.wasteFactorPct,
              notes: li.notes ?? null,
              sortOrder: li.sortOrder,
              isAssembly: li.isAssembly,
              parentItemId: null, // reset parent references
            }))
          );
        }
      }

      const result = await getTemplateWithSections(tmpl.id);
      return reply.status(201).send(result);
    },
  });

  // ── POST /api/templates/:id/apply ─────────────────────────────────────────
  fastify.post('/api/templates/:id/apply', {
    preHandler: [requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const tmplId = parseInt(id, 10);
      if (isNaN(tmplId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

      const tmpl = await getTemplateWithSections(tmplId);
      if (!tmpl) return reply.status(404).send({ error: 'Template not found', code: 'NOT_FOUND' });

      if (!tmpl.isPublic && tmpl.createdBy !== request.user.id && request.user.role !== 'admin') {
        return reply.status(403).send({ error: 'Access denied', code: 'FORBIDDEN' });
      }

      const body = request.body as { estimateId: number; mode: 'merge' | 'replace' | 'append' };

      if (!body.estimateId || !body.mode) {
        return reply.status(400).send({ error: 'estimateId and mode are required', code: 'VALIDATION_ERROR' });
      }

      const [estimate] = await db.select().from(estimates).where(eq(estimates.id, body.estimateId)).limit(1);
      if (!estimate) return reply.status(404).send({ error: 'Estimate not found', code: 'NOT_FOUND' });

      if (body.mode === 'replace') {
        // Delete all existing sections (cascades to line items)
        await db.delete(estimateSections).where(eq(estimateSections.estimateId, body.estimateId));
      }

      // Get current max sort order for append mode
      let baseSortOrder = 0;
      if (body.mode === 'append') {
        const existingSections = await db.select().from(estimateSections).where(eq(estimateSections.estimateId, body.estimateId)).orderBy(desc(estimateSections.sortOrder)).limit(1);
        baseSortOrder = (existingSections[0]?.sortOrder ?? -1) + 1;
      }

      const now = new Date().toISOString();
      for (let i = 0; i < tmpl.sections.length; i++) {
        const tmplSec = tmpl.sections[i];

        if (body.mode === 'merge') {
          // Check if a section with the same name already exists
          const [existingSec] = await db
            .select()
            .from(estimateSections)
            .where(and(eq(estimateSections.estimateId, body.estimateId), eq(estimateSections.name, tmplSec.name)))
            .limit(1);

          if (existingSec) {
            // Append items to existing section
            const currentItems = await db.select().from(estimateLineItems).where(eq(estimateLineItems.sectionId, existingSec.id)).orderBy(desc(estimateLineItems.sortOrder)).limit(1);
            const baseItemSort = (currentItems[0]?.sortOrder ?? -1) + 1;

            if (tmplSec.lineItems.length > 0) {
              await db.insert(estimateLineItems).values(
                tmplSec.lineItems.map((li, j) => ({
                  sectionId: existingSec.id,
                  estimateId: body.estimateId,
                  description: li.description,
                  quantity: li.quantity,
                  unit: li.unit,
                  unitMaterialCost: li.unitMaterialCost,
                  unitLaborCost: li.unitLaborCost,
                  laborHours: li.laborHours,
                  laborRate: li.laborRate,
                  wasteFactorPct: li.wasteFactorPct,
                  notes: li.notes ?? null,
                  sortOrder: baseItemSort + j,
                  isAssembly: li.isAssembly,
                  createdAt: now,
                  updatedAt: now,
                }))
              );
            }
            continue;
          }
        }

        // Create new section
        const [newSec] = await db.insert(estimateSections).values({
          estimateId: body.estimateId,
          name: tmplSec.name,
          sortOrder: baseSortOrder + i,
          color: tmplSec.color ?? null,
        }).returning();

        if (tmplSec.lineItems.length > 0) {
          await db.insert(estimateLineItems).values(
            tmplSec.lineItems.map((li, j) => ({
              sectionId: newSec.id,
              estimateId: body.estimateId,
              description: li.description,
              quantity: li.quantity,
              unit: li.unit,
              unitMaterialCost: li.unitMaterialCost,
              unitLaborCost: li.unitLaborCost,
              laborHours: li.laborHours,
              laborRate: li.laborRate,
              wasteFactorPct: li.wasteFactorPct,
              notes: li.notes ?? null,
              sortOrder: j,
              isAssembly: li.isAssembly,
              createdAt: now,
              updatedAt: now,
            }))
          );
        }
      }

      return reply.send({ success: true, mode: body.mode, estimateId: body.estimateId });
    },
  });

  // ── POST /api/templates/:id/sections ──────────────────────────────────────
  fastify.post('/api/templates/:id/sections', {
    preHandler: [requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const tmplId = parseInt(id, 10);
      if (isNaN(tmplId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

      const [tmpl] = await db.select().from(templates).where(eq(templates.id, tmplId)).limit(1);
      if (!tmpl) return reply.status(404).send({ error: 'Template not found', code: 'NOT_FOUND' });

      if (tmpl.createdBy !== request.user.id && request.user.role !== 'admin') {
        return reply.status(403).send({ error: 'Access denied', code: 'FORBIDDEN' });
      }

      const body = request.body as { name: string; sortOrder?: number; color?: string };
      if (!body.name) return reply.status(400).send({ error: 'name is required', code: 'VALIDATION_ERROR' });

      const [sec] = await db.insert(templateSections).values({
        templateId: tmplId,
        name: body.name,
        sortOrder: body.sortOrder ?? 0,
        color: body.color ?? null,
      }).returning();

      return reply.status(201).send(sec);
    },
  });

  // ── PUT /api/templates/:id/sections/:sectionId ────────────────────────────
  fastify.put('/api/templates/:id/sections/:sectionId', {
    preHandler: [requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const { id, sectionId } = request.params as { id: string; sectionId: string };
      const tmplId = parseInt(id, 10);
      const secId = parseInt(sectionId, 10);
      if (isNaN(tmplId) || isNaN(secId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

      const [tmpl] = await db.select().from(templates).where(eq(templates.id, tmplId)).limit(1);
      if (!tmpl) return reply.status(404).send({ error: 'Template not found', code: 'NOT_FOUND' });

      if (tmpl.createdBy !== request.user.id && request.user.role !== 'admin') {
        return reply.status(403).send({ error: 'Access denied', code: 'FORBIDDEN' });
      }

      const [sec] = await db.select().from(templateSections).where(and(eq(templateSections.id, secId), eq(templateSections.templateId, tmplId))).limit(1);
      if (!sec) return reply.status(404).send({ error: 'Section not found', code: 'NOT_FOUND' });

      const body = request.body as Partial<{ name: string; sortOrder: number; color: string }>;
      const updates: Record<string, unknown> = {};
      if (body.name !== undefined) updates.name = body.name;
      if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;
      if ('color' in body) updates.color = body.color ?? null;

      const [updated] = await db.update(templateSections).set(updates).where(eq(templateSections.id, secId)).returning();
      return reply.send(updated);
    },
  });

  // ── DELETE /api/templates/:id/sections/:sectionId ─────────────────────────
  fastify.delete('/api/templates/:id/sections/:sectionId', {
    preHandler: [requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const { id, sectionId } = request.params as { id: string; sectionId: string };
      const tmplId = parseInt(id, 10);
      const secId = parseInt(sectionId, 10);
      if (isNaN(tmplId) || isNaN(secId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

      const [tmpl] = await db.select().from(templates).where(eq(templates.id, tmplId)).limit(1);
      if (!tmpl) return reply.status(404).send({ error: 'Template not found', code: 'NOT_FOUND' });

      if (tmpl.createdBy !== request.user.id && request.user.role !== 'admin') {
        return reply.status(403).send({ error: 'Access denied', code: 'FORBIDDEN' });
      }

      const [sec] = await db.select().from(templateSections).where(and(eq(templateSections.id, secId), eq(templateSections.templateId, tmplId))).limit(1);
      if (!sec) return reply.status(404).send({ error: 'Section not found', code: 'NOT_FOUND' });

      await db.delete(templateSections).where(eq(templateSections.id, secId));
      return reply.status(204).send();
    },
  });

  // ── POST /api/templates/:id/sections/:sectionId/items ─────────────────────
  fastify.post('/api/templates/:id/sections/:sectionId/items', {
    preHandler: [requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const { id, sectionId } = request.params as { id: string; sectionId: string };
      const tmplId = parseInt(id, 10);
      const secId = parseInt(sectionId, 10);
      if (isNaN(tmplId) || isNaN(secId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

      const [tmpl] = await db.select().from(templates).where(eq(templates.id, tmplId)).limit(1);
      if (!tmpl) return reply.status(404).send({ error: 'Template not found', code: 'NOT_FOUND' });

      if (tmpl.createdBy !== request.user.id && request.user.role !== 'admin') {
        return reply.status(403).send({ error: 'Access denied', code: 'FORBIDDEN' });
      }

      const [sec] = await db.select().from(templateSections).where(and(eq(templateSections.id, secId), eq(templateSections.templateId, tmplId))).limit(1);
      if (!sec) return reply.status(404).send({ error: 'Section not found', code: 'NOT_FOUND' });

      const body = request.body as {
        description: string;
        quantity?: number;
        unit?: string;
        unitMaterialCost?: number;
        unitLaborCost?: number;
        laborHours?: number;
        laborRate?: number;
        wasteFactorPct?: number;
        notes?: string;
        sortOrder?: number;
        isAssembly?: boolean;
      };

      if (!body.description) return reply.status(400).send({ error: 'description is required', code: 'VALIDATION_ERROR' });

      const [item] = await db.insert(templateLineItems).values({
        sectionId: secId,
        description: body.description,
        quantity: body.quantity ?? 0,
        unit: body.unit ?? 'EA',
        unitMaterialCost: body.unitMaterialCost ?? 0,
        unitLaborCost: body.unitLaborCost ?? 0,
        laborHours: body.laborHours ?? 0,
        laborRate: body.laborRate ?? 0,
        wasteFactorPct: body.wasteFactorPct ?? 0,
        notes: body.notes ?? null,
        sortOrder: body.sortOrder ?? 0,
        isAssembly: body.isAssembly ?? false,
        parentItemId: null,
      }).returning();

      return reply.status(201).send(item);
    },
  });

  // ── PUT /api/templates/:id/sections/:sectionId/items/:itemId ──────────────
  fastify.put('/api/templates/:id/sections/:sectionId/items/:itemId', {
    preHandler: [requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const { id, sectionId, itemId } = request.params as { id: string; sectionId: string; itemId: string };
      const tmplId = parseInt(id, 10);
      const secId = parseInt(sectionId, 10);
      const liId = parseInt(itemId, 10);
      if (isNaN(tmplId) || isNaN(secId) || isNaN(liId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

      const [tmpl] = await db.select().from(templates).where(eq(templates.id, tmplId)).limit(1);
      if (!tmpl) return reply.status(404).send({ error: 'Template not found', code: 'NOT_FOUND' });

      if (tmpl.createdBy !== request.user.id && request.user.role !== 'admin') {
        return reply.status(403).send({ error: 'Access denied', code: 'FORBIDDEN' });
      }

      const [item] = await db.select().from(templateLineItems).where(and(eq(templateLineItems.id, liId), eq(templateLineItems.sectionId, secId))).limit(1);
      if (!item) return reply.status(404).send({ error: 'Line item not found', code: 'NOT_FOUND' });

      const body = request.body as Partial<{
        description: string;
        quantity: number;
        unit: string;
        unitMaterialCost: number;
        unitLaborCost: number;
        laborHours: number;
        laborRate: number;
        wasteFactorPct: number;
        notes: string;
        sortOrder: number;
        isAssembly: boolean;
      }>;

      const updates: Record<string, unknown> = {};
      const fields = ['description', 'quantity', 'unit', 'unitMaterialCost', 'unitLaborCost', 'laborHours', 'laborRate', 'wasteFactorPct', 'sortOrder', 'isAssembly'] as const;
      for (const f of fields) {
        if (f in body) updates[f] = (body as Record<string, unknown>)[f];
      }
      if ('notes' in body) updates.notes = body.notes ?? null;

      const [updated] = await db.update(templateLineItems).set(updates).where(eq(templateLineItems.id, liId)).returning();
      return reply.send(updated);
    },
  });

  // ── DELETE /api/templates/:id/sections/:sectionId/items/:itemId ───────────
  fastify.delete('/api/templates/:id/sections/:sectionId/items/:itemId', {
    preHandler: [requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const { id, sectionId, itemId } = request.params as { id: string; sectionId: string; itemId: string };
      const tmplId = parseInt(id, 10);
      const secId = parseInt(sectionId, 10);
      const liId = parseInt(itemId, 10);
      if (isNaN(tmplId) || isNaN(secId) || isNaN(liId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

      const [tmpl] = await db.select().from(templates).where(eq(templates.id, tmplId)).limit(1);
      if (!tmpl) return reply.status(404).send({ error: 'Template not found', code: 'NOT_FOUND' });

      if (tmpl.createdBy !== request.user.id && request.user.role !== 'admin') {
        return reply.status(403).send({ error: 'Access denied', code: 'FORBIDDEN' });
      }

      const [item] = await db.select().from(templateLineItems).where(and(eq(templateLineItems.id, liId), eq(templateLineItems.sectionId, secId))).limit(1);
      if (!item) return reply.status(404).send({ error: 'Line item not found', code: 'NOT_FOUND' });

      await db.delete(templateLineItems).where(eq(templateLineItems.id, liId));
      return reply.status(204).send();
    },
  });
}
