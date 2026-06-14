import type { FastifyInstance } from 'fastify';
import { db } from '../db/index';
import {
  estimates,
  estimateSections,
  estimateLineItems,
  estimateVersions,
  templates,
  templateSections,
  templateLineItems,
  projects,
  users,
} from '../db/schema';
import { eq, and, desc, asc, sql, inArray } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { requireEstimatorOrAbove } from '../middleware/rbac';
import {
  calculateLineItem,
  calculateSectionTotals,
  calculateEstimateTotals,
} from '../lib/estimateCalculator';

// ─── helpers ──────────────────────────────────────────────────────────────────

async function getEstimateOrFail(
  id: number,
  reply: Parameters<Parameters<FastifyInstance['get']>[1]>[1]
) {
  const [est] = await db.select().from(estimates).where(eq(estimates.id, id)).limit(1);
  if (!est) {
    reply.status(404).send({ error: 'Estimate not found', code: 'NOT_FOUND' });
    return null;
  }
  return est;
}

async function buildFullEstimate(estimateId: number) {
  const [est] = await db.select().from(estimates).where(eq(estimates.id, estimateId)).limit(1);
  if (!est) return null;

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

  const annotated = lineItems.map((li) => ({
    ...li,
    ...calculateLineItem(li),
  }));

  const sectionsWithItems = sections.map((sec) => ({
    ...sec,
    lineItems: annotated.filter((li) => li.sectionId === sec.id),
    ...calculateSectionTotals(annotated.filter((li) => li.sectionId === sec.id)),
  }));

  const allItems = annotated;
  const sectionTotals = calculateSectionTotals(allItems);
  const estimateTotals = calculateEstimateTotals({
    subtotal: sectionTotals.totalCost,
    overheadPct: est.overheadPct,
    profitPct: est.profitPct,
    taxPct: est.taxPct,
    bondPct: est.bondPct,
  });

  return {
    ...est,
    sections: sectionsWithItems,
    totals: {
      ...sectionTotals,
      ...estimateTotals,
    },
  };
}

// ─── plugin ───────────────────────────────────────────────────────────────────

export default async function estimateRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // ── GET /api/projects/:projectId/estimates ─────────────────────────────────
  fastify.get('/api/projects/:projectId/estimates', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const pid = parseInt(projectId, 10);
    if (isNaN(pid)) return reply.status(400).send({ error: 'Invalid projectId', code: 'VALIDATION_ERROR' });

    const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, pid)).limit(1);
    if (!project) return reply.status(404).send({ error: 'Project not found', code: 'NOT_FOUND' });

    const rows = await db
      .select({
        id: estimates.id,
        projectId: estimates.projectId,
        name: estimates.name,
        version: estimates.version,
        isActive: estimates.isActive,
        overheadPct: estimates.overheadPct,
        profitPct: estimates.profitPct,
        taxPct: estimates.taxPct,
        bondPct: estimates.bondPct,
        notes: estimates.notes,
        createdBy: estimates.createdBy,
        createdAt: estimates.createdAt,
        updatedAt: estimates.updatedAt,
        createdByName: users.name,
      })
      .from(estimates)
      .leftJoin(users, eq(estimates.createdBy, users.id))
      .where(eq(estimates.projectId, pid))
      .orderBy(desc(estimates.createdAt));

    // Attach quick section/item count
    const enriched = await Promise.all(
      rows.map(async (e) => {
        const [{ sectionCount }] = await db
          .select({ sectionCount: sql<number>`count(*)` })
          .from(estimateSections)
          .where(eq(estimateSections.estimateId, e.id));
        return { ...e, sectionCount: Number(sectionCount) };
      })
    );

    return reply.send({ data: enriched });
  });

  // ── POST /api/projects/:projectId/estimates ────────────────────────────────
  fastify.post('/api/projects/:projectId/estimates', { preHandler: [requireEstimatorOrAbove] }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const pid = parseInt(projectId, 10);
    if (isNaN(pid)) return reply.status(400).send({ error: 'Invalid projectId', code: 'VALIDATION_ERROR' });

    const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, pid)).limit(1);
    if (!project) return reply.status(404).send({ error: 'Project not found', code: 'NOT_FOUND' });

    const body = request.body as {
      name?: string;
      overheadPct?: number;
      profitPct?: number;
      taxPct?: number;
      bondPct?: number;
      notes?: string;
      templateId?: number;
    };

    if (!body.name?.trim()) {
      return reply.status(400).send({ error: 'name is required', code: 'VALIDATION_ERROR' });
    }

    const [newEst] = await db
      .insert(estimates)
      .values({
        projectId: pid,
        name: body.name.trim(),
        version: 1,
        isActive: false,
        overheadPct: body.overheadPct ?? 15,
        profitPct: body.profitPct ?? 10,
        taxPct: body.taxPct ?? 0,
        bondPct: body.bondPct ?? 0,
        notes: body.notes ?? null,
        createdBy: request.user.id,
      })
      .returning();

    // Optionally apply template
    if (body.templateId) {
      const [tpl] = await db.select().from(templates).where(eq(templates.id, body.templateId)).limit(1);
      if (tpl) {
        const tplSections = await db
          .select()
          .from(templateSections)
          .where(eq(templateSections.templateId, tpl.id))
          .orderBy(asc(templateSections.sortOrder));

        for (const sec of tplSections) {
          const [newSec] = await db
            .insert(estimateSections)
            .values({ estimateId: newEst.id, name: sec.name, sortOrder: sec.sortOrder, color: sec.color })
            .returning();

          const tplItems = await db
            .select()
            .from(templateLineItems)
            .where(eq(templateLineItems.sectionId, sec.id))
            .orderBy(asc(templateLineItems.sortOrder));

          for (const ti of tplItems) {
            await db.insert(estimateLineItems).values({
              sectionId: newSec.id,
              estimateId: newEst.id,
              description: ti.description,
              quantity: ti.quantity,
              unit: ti.unit,
              unitMaterialCost: ti.unitMaterialCost,
              unitLaborCost: ti.unitLaborCost,
              laborHours: ti.laborHours,
              laborRate: ti.laborRate,
              wasteFactorPct: ti.wasteFactorPct,
              notes: ti.notes,
              sortOrder: ti.sortOrder,
              isAssembly: ti.isAssembly,
            });
          }
        }
      }
    }

    const full = await buildFullEstimate(newEst.id);
    return reply.status(201).send({ data: full });
  });

  // ── GET /api/estimates/:id ─────────────────────────────────────────────────
  fastify.get('/api/estimates/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const estId = parseInt(id, 10);
    if (isNaN(estId)) return reply.status(400).send({ error: 'Invalid estimate id', code: 'VALIDATION_ERROR' });

    const full = await buildFullEstimate(estId);
    if (!full) return reply.status(404).send({ error: 'Estimate not found', code: 'NOT_FOUND' });

    return reply.send({ data: full });
  });

  // ── PUT /api/estimates/:id ─────────────────────────────────────────────────
  fastify.put('/api/estimates/:id', { preHandler: [requireEstimatorOrAbove] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const estId = parseInt(id, 10);
    if (isNaN(estId)) return reply.status(400).send({ error: 'Invalid estimate id', code: 'VALIDATION_ERROR' });

    const est = await getEstimateOrFail(estId, reply);
    if (!est) return;

    const body = request.body as Partial<{
      name: string;
      overheadPct: number;
      profitPct: number;
      taxPct: number;
      bondPct: number;
      notes: string;
    }>;

    const [updated] = await db
      .update(estimates)
      .set({ ...body, updatedAt: new Date().toISOString() } as any)
      .where(eq(estimates.id, estId))
      .returning();

    return reply.send({ data: updated });
  });

  // ── DELETE /api/estimates/:id ──────────────────────────────────────────────
  fastify.delete('/api/estimates/:id', { preHandler: [requireEstimatorOrAbove] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const estId = parseInt(id, 10);
    if (isNaN(estId)) return reply.status(400).send({ error: 'Invalid estimate id', code: 'VALIDATION_ERROR' });

    const est = await getEstimateOrFail(estId, reply);
    if (!est) return;

    await db.delete(estimates).where(eq(estimates.id, estId));

    return reply.send({ success: true });
  });

  // ── POST /api/estimates/:id/clone ─────────────────────────────────────────
  fastify.post('/api/estimates/:id/clone', { preHandler: [requireEstimatorOrAbove] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const estId = parseInt(id, 10);
    if (isNaN(estId)) return reply.status(400).send({ error: 'Invalid estimate id', code: 'VALIDATION_ERROR' });

    const est = await getEstimateOrFail(estId, reply);
    if (!est) return;

    const body = request.body as { name?: string };

    const [cloned] = await db
      .insert(estimates)
      .values({
        projectId: est.projectId,
        name: body.name ?? `${est.name} (Clone)`,
        version: 1,
        isActive: false,
        overheadPct: est.overheadPct,
        profitPct: est.profitPct,
        taxPct: est.taxPct,
        bondPct: est.bondPct,
        notes: est.notes,
        createdBy: request.user.id,
      })
      .returning();

    const sections = await db.select().from(estimateSections).where(eq(estimateSections.estimateId, estId));

    for (const sec of sections) {
      const [newSec] = await db
        .insert(estimateSections)
        .values({ estimateId: cloned.id, name: sec.name, sortOrder: sec.sortOrder, color: sec.color })
        .returning();

      const items = await db.select().from(estimateLineItems).where(eq(estimateLineItems.sectionId, sec.id));

      for (const li of items) {
        await db.insert(estimateLineItems).values({
          sectionId: newSec.id,
          estimateId: cloned.id,
          description: li.description,
          quantity: li.quantity,
          unit: li.unit,
          unitMaterialCost: li.unitMaterialCost,
          unitLaborCost: li.unitLaborCost,
          laborHours: li.laborHours,
          laborRate: li.laborRate,
          wasteFactorPct: li.wasteFactorPct,
          notes: li.notes,
          sortOrder: li.sortOrder,
          isAssembly: li.isAssembly,
        });
      }
    }

    const full = await buildFullEstimate(cloned.id);
    return reply.status(201).send({ data: full });
  });

  // ── PUT /api/estimates/:id/activate ───────────────────────────────────────
  fastify.put('/api/estimates/:id/activate', { preHandler: [requireEstimatorOrAbove] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const estId = parseInt(id, 10);
    if (isNaN(estId)) return reply.status(400).send({ error: 'Invalid estimate id', code: 'VALIDATION_ERROR' });

    const est = await getEstimateOrFail(estId, reply);
    if (!est) return;

    // Deactivate all other estimates for this project
    await db
      .update(estimates)
      .set({ isActive: false, updatedAt: new Date().toISOString() })
      .where(and(eq(estimates.projectId, est.projectId), sql`${estimates.id} != ${estId}`));

    const [updated] = await db
      .update(estimates)
      .set({ isActive: true, updatedAt: new Date().toISOString() })
      .where(eq(estimates.id, estId))
      .returning();

    return reply.send({ data: updated });
  });

  // ── POST /api/estimates/:id/save-version ──────────────────────────────────
  fastify.post('/api/estimates/:id/save-version', { preHandler: [requireEstimatorOrAbove] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const estId = parseInt(id, 10);
    if (isNaN(estId)) return reply.status(400).send({ error: 'Invalid estimate id', code: 'VALIDATION_ERROR' });

    const est = await getEstimateOrFail(estId, reply);
    if (!est) return;

    const full = await buildFullEstimate(estId);

    // Get next version number
    const [{ maxVer }] = await db
      .select({ maxVer: sql<number>`COALESCE(MAX(version_number), 0)` })
      .from(estimateVersions)
      .where(eq(estimateVersions.estimateId, estId));

    const [version] = await db
      .insert(estimateVersions)
      .values({
        estimateId: estId,
        versionNumber: Number(maxVer) + 1,
        snapshotJson: JSON.stringify(full),
        savedBy: request.user.id,
        savedAt: new Date().toISOString(),
      })
      .returning();

    return reply.status(201).send({ data: version });
  });

  // ── GET /api/estimates/:id/versions ───────────────────────────────────────
  fastify.get('/api/estimates/:id/versions', async (request, reply) => {
    const { id } = request.params as { id: string };
    const estId = parseInt(id, 10);
    if (isNaN(estId)) return reply.status(400).send({ error: 'Invalid estimate id', code: 'VALIDATION_ERROR' });

    const est = await getEstimateOrFail(estId, reply);
    if (!est) return;

    const versions = await db
      .select({
        id: estimateVersions.id,
        estimateId: estimateVersions.estimateId,
        versionNumber: estimateVersions.versionNumber,
        savedBy: estimateVersions.savedBy,
        savedAt: estimateVersions.savedAt,
        savedByName: users.name,
      })
      .from(estimateVersions)
      .leftJoin(users, eq(estimateVersions.savedBy, users.id))
      .where(eq(estimateVersions.estimateId, estId))
      .orderBy(desc(estimateVersions.versionNumber));

    return reply.send({ data: versions });
  });

  // ── POST /api/estimates/:id/versions/:versionId/restore ───────────────────
  fastify.post('/api/estimates/:id/versions/:versionId/restore', { preHandler: [requireEstimatorOrAbove] }, async (request, reply) => {
    const { id, versionId } = request.params as { id: string; versionId: string };
    const estId = parseInt(id, 10);
    const verIdNum = parseInt(versionId, 10);

    if (isNaN(estId) || isNaN(verIdNum)) {
      return reply.status(400).send({ error: 'Invalid ids', code: 'VALIDATION_ERROR' });
    }

    const [version] = await db
      .select()
      .from(estimateVersions)
      .where(and(eq(estimateVersions.id, verIdNum), eq(estimateVersions.estimateId, estId)))
      .limit(1);

    if (!version) return reply.status(404).send({ error: 'Version not found', code: 'NOT_FOUND' });

    // Save current state as a new version before restoring
    const full = await buildFullEstimate(estId);
    const [{ maxVer }] = await db
      .select({ maxVer: sql<number>`COALESCE(MAX(version_number), 0)` })
      .from(estimateVersions)
      .where(eq(estimateVersions.estimateId, estId));

    await db.insert(estimateVersions).values({
      estimateId: estId,
      versionNumber: Number(maxVer) + 1,
      snapshotJson: JSON.stringify(full),
      savedBy: request.user.id,
      savedAt: new Date().toISOString(),
    });

    const snapshot = JSON.parse(version.snapshotJson) as Awaited<ReturnType<typeof buildFullEstimate>>;
    if (!snapshot) return reply.status(422).send({ error: 'Invalid snapshot', code: 'INVALID_SNAPSHOT' });

    // Restore: update estimate header
    await db.update(estimates).set({
      overheadPct: snapshot.overheadPct,
      profitPct: snapshot.profitPct,
      taxPct: snapshot.taxPct,
      bondPct: snapshot.bondPct,
      notes: snapshot.notes,
      updatedAt: new Date().toISOString(),
    }).where(eq(estimates.id, estId));

    // Delete current sections & items, then re-insert from snapshot
    await db.delete(estimateLineItems).where(eq(estimateLineItems.estimateId, estId));
    await db.delete(estimateSections).where(eq(estimateSections.estimateId, estId));

    if (snapshot.sections) {
      for (const sec of snapshot.sections) {
        const [newSec] = await db
          .insert(estimateSections)
          .values({ estimateId: estId, name: sec.name, sortOrder: sec.sortOrder, color: sec.color })
          .returning();

        if (sec.lineItems) {
          for (const li of sec.lineItems) {
            await db.insert(estimateLineItems).values({
              sectionId: newSec.id,
              estimateId: estId,
              description: li.description,
              quantity: li.quantity,
              unit: li.unit,
              unitMaterialCost: li.unitMaterialCost,
              unitLaborCost: li.unitLaborCost,
              laborHours: li.laborHours,
              laborRate: li.laborRate,
              wasteFactorPct: li.wasteFactorPct,
              notes: li.notes,
              sortOrder: li.sortOrder,
              isAssembly: li.isAssembly,
            });
          }
        }
      }
    }

    const restored = await buildFullEstimate(estId);
    return reply.send({ data: restored });
  });

  // ── GET /api/estimates/:id/totals ─────────────────────────────────────────
  fastify.get('/api/estimates/:id/totals', async (request, reply) => {
    const { id } = request.params as { id: string };
    const estId = parseInt(id, 10);
    if (isNaN(estId)) return reply.status(400).send({ error: 'Invalid estimate id', code: 'VALIDATION_ERROR' });

    const [est] = await db.select().from(estimates).where(eq(estimates.id, estId)).limit(1);
    if (!est) return reply.status(404).send({ error: 'Estimate not found', code: 'NOT_FOUND' });

    const lineItems = await db
      .select()
      .from(estimateLineItems)
      .where(eq(estimateLineItems.estimateId, estId));

    const sectionTotals = calculateSectionTotals(lineItems);
    const estimateTotals = calculateEstimateTotals({
      subtotal: sectionTotals.totalCost,
      overheadPct: est.overheadPct,
      profitPct: est.profitPct,
      taxPct: est.taxPct,
      bondPct: est.bondPct,
    });

    return reply.send({
      data: {
        ...sectionTotals,
        ...estimateTotals,
        overheadPct: est.overheadPct,
        profitPct: est.profitPct,
        taxPct: est.taxPct,
        bondPct: est.bondPct,
      },
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Sections
  // ═══════════════════════════════════════════════════════════════════════════

  // ── POST /api/estimates/:id/sections ──────────────────────────────────────
  fastify.post('/api/estimates/:id/sections', { preHandler: [requireEstimatorOrAbove] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const estId = parseInt(id, 10);
    if (isNaN(estId)) return reply.status(400).send({ error: 'Invalid estimate id', code: 'VALIDATION_ERROR' });

    const est = await getEstimateOrFail(estId, reply);
    if (!est) return;

    const body = request.body as { name?: string; sortOrder?: number; color?: string };
    if (!body.name?.trim()) return reply.status(400).send({ error: 'name is required', code: 'VALIDATION_ERROR' });

    const [section] = await db
      .insert(estimateSections)
      .values({
        estimateId: estId,
        name: body.name.trim(),
        sortOrder: body.sortOrder ?? 0,
        color: body.color ?? null,
      })
      .returning();

    await db.update(estimates).set({ updatedAt: new Date().toISOString() }).where(eq(estimates.id, estId));

    return reply.status(201).send({ data: section });
  });

  // ── PUT /api/estimates/:id/sections/:sectionId ────────────────────────────
  fastify.put('/api/estimates/:id/sections/:sectionId', { preHandler: [requireEstimatorOrAbove] }, async (request, reply) => {
    const { id, sectionId } = request.params as { id: string; sectionId: string };
    const estId = parseInt(id, 10);
    const secId = parseInt(sectionId, 10);
    if (isNaN(estId) || isNaN(secId)) return reply.status(400).send({ error: 'Invalid ids', code: 'VALIDATION_ERROR' });

    const [section] = await db
      .select()
      .from(estimateSections)
      .where(and(eq(estimateSections.id, secId), eq(estimateSections.estimateId, estId)))
      .limit(1);

    if (!section) return reply.status(404).send({ error: 'Section not found', code: 'NOT_FOUND' });

    const body = request.body as Partial<{ name: string; sortOrder: number; color: string }>;

    const [updated] = await db
      .update(estimateSections)
      .set(body as any)
      .where(eq(estimateSections.id, secId))
      .returning();

    await db.update(estimates).set({ updatedAt: new Date().toISOString() }).where(eq(estimates.id, estId));

    return reply.send({ data: updated });
  });

  // ── DELETE /api/estimates/:id/sections/:sectionId ─────────────────────────
  fastify.delete('/api/estimates/:id/sections/:sectionId', { preHandler: [requireEstimatorOrAbove] }, async (request, reply) => {
    const { id, sectionId } = request.params as { id: string; sectionId: string };
    const estId = parseInt(id, 10);
    const secId = parseInt(sectionId, 10);
    if (isNaN(estId) || isNaN(secId)) return reply.status(400).send({ error: 'Invalid ids', code: 'VALIDATION_ERROR' });

    const [section] = await db
      .select()
      .from(estimateSections)
      .where(and(eq(estimateSections.id, secId), eq(estimateSections.estimateId, estId)))
      .limit(1);

    if (!section) return reply.status(404).send({ error: 'Section not found', code: 'NOT_FOUND' });

    await db.delete(estimateSections).where(eq(estimateSections.id, secId));
    await db.update(estimates).set({ updatedAt: new Date().toISOString() }).where(eq(estimates.id, estId));

    return reply.send({ success: true });
  });

  // ── POST /api/estimates/:id/sections/reorder ──────────────────────────────
  fastify.post('/api/estimates/:id/sections/reorder', { preHandler: [requireEstimatorOrAbove] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const estId = parseInt(id, 10);
    if (isNaN(estId)) return reply.status(400).send({ error: 'Invalid estimate id', code: 'VALIDATION_ERROR' });

    const { items } = request.body as { items?: Array<{ id: number; sortOrder: number }> };
    if (!Array.isArray(items)) return reply.status(400).send({ error: 'items array is required', code: 'VALIDATION_ERROR' });

    for (const item of items) {
      await db
        .update(estimateSections)
        .set({ sortOrder: item.sortOrder })
        .where(and(eq(estimateSections.id, item.id), eq(estimateSections.estimateId, estId)));
    }

    await db.update(estimates).set({ updatedAt: new Date().toISOString() }).where(eq(estimates.id, estId));

    return reply.send({ success: true });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Line Items
  // ═══════════════════════════════════════════════════════════════════════════

  // ── POST /api/estimates/:id/line-items ────────────────────────────────────
  fastify.post('/api/estimates/:id/line-items', { preHandler: [requireEstimatorOrAbove] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const estId = parseInt(id, 10);
    if (isNaN(estId)) return reply.status(400).send({ error: 'Invalid estimate id', code: 'VALIDATION_ERROR' });

    const est = await getEstimateOrFail(estId, reply);
    if (!est) return;

    const body = request.body as {
      sectionId?: number;
      description?: string;
      quantity?: number;
      unit?: string;
      unitMaterialCost?: number;
      unitLaborCost?: number;
      laborHours?: number;
      laborRate?: number;
      wasteFactorPct?: number;
      notes?: string;
      costDbItemId?: number;
      sortOrder?: number;
      isAssembly?: boolean;
      parentItemId?: number;
    };

    if (!body.sectionId || !body.description?.trim()) {
      return reply.status(400).send({ error: 'sectionId and description are required', code: 'VALIDATION_ERROR' });
    }

    // Verify section belongs to this estimate
    const [section] = await db
      .select({ id: estimateSections.id })
      .from(estimateSections)
      .where(and(eq(estimateSections.id, body.sectionId), eq(estimateSections.estimateId, estId)))
      .limit(1);

    if (!section) return reply.status(404).send({ error: 'Section not found in this estimate', code: 'NOT_FOUND' });

    const [li] = await db
      .insert(estimateLineItems)
      .values({
        sectionId: body.sectionId,
        estimateId: estId,
        description: body.description.trim(),
        quantity: body.quantity ?? 0,
        unit: body.unit ?? 'EA',
        unitMaterialCost: body.unitMaterialCost ?? 0,
        unitLaborCost: body.unitLaborCost ?? 0,
        laborHours: body.laborHours ?? 0,
        laborRate: body.laborRate ?? 65,
        wasteFactorPct: body.wasteFactorPct ?? 0,
        notes: body.notes ?? null,
        costDbItemId: body.costDbItemId ?? null,
        sortOrder: body.sortOrder ?? 0,
        isAssembly: body.isAssembly ?? false,
        parentItemId: body.parentItemId ?? null,
      })
      .returning();

    await db.update(estimates).set({ updatedAt: new Date().toISOString() }).where(eq(estimates.id, estId));

    return reply.status(201).send({ data: { ...li, ...calculateLineItem(li) } });
  });

  // ── PUT /api/estimates/:id/line-items/:itemId ──────────────────────────────
  fastify.put('/api/estimates/:id/line-items/:itemId', { preHandler: [requireEstimatorOrAbove] }, async (request, reply) => {
    const { id, itemId } = request.params as { id: string; itemId: string };
    const estId = parseInt(id, 10);
    const liId = parseInt(itemId, 10);
    if (isNaN(estId) || isNaN(liId)) return reply.status(400).send({ error: 'Invalid ids', code: 'VALIDATION_ERROR' });

    const [lineItem] = await db
      .select()
      .from(estimateLineItems)
      .where(and(eq(estimateLineItems.id, liId), eq(estimateLineItems.estimateId, estId)))
      .limit(1);

    if (!lineItem) return reply.status(404).send({ error: 'Line item not found', code: 'NOT_FOUND' });

    const body = request.body as Partial<{
      sectionId: number;
      description: string;
      quantity: number;
      unit: string;
      unitMaterialCost: number;
      unitLaborCost: number;
      laborHours: number;
      laborRate: number;
      wasteFactorPct: number;
      notes: string;
      costDbItemId: number;
      sortOrder: number;
    }>;

    const [updated] = await db
      .update(estimateLineItems)
      .set({ ...body, updatedAt: new Date().toISOString() } as any)
      .where(eq(estimateLineItems.id, liId))
      .returning();

    await db.update(estimates).set({ updatedAt: new Date().toISOString() }).where(eq(estimates.id, estId));

    return reply.send({ data: { ...updated, ...calculateLineItem(updated) } });
  });

  // ── DELETE /api/estimates/:id/line-items/:itemId ───────────────────────────
  fastify.delete('/api/estimates/:id/line-items/:itemId', { preHandler: [requireEstimatorOrAbove] }, async (request, reply) => {
    const { id, itemId } = request.params as { id: string; itemId: string };
    const estId = parseInt(id, 10);
    const liId = parseInt(itemId, 10);
    if (isNaN(estId) || isNaN(liId)) return reply.status(400).send({ error: 'Invalid ids', code: 'VALIDATION_ERROR' });

    const [lineItem] = await db
      .select({ id: estimateLineItems.id })
      .from(estimateLineItems)
      .where(and(eq(estimateLineItems.id, liId), eq(estimateLineItems.estimateId, estId)))
      .limit(1);

    if (!lineItem) return reply.status(404).send({ error: 'Line item not found', code: 'NOT_FOUND' });

    await db.delete(estimateLineItems).where(eq(estimateLineItems.id, liId));
    await db.update(estimates).set({ updatedAt: new Date().toISOString() }).where(eq(estimates.id, estId));

    return reply.send({ success: true });
  });

  // ── POST /api/estimates/:id/line-items/bulk-update ────────────────────────
  fastify.post('/api/estimates/:id/line-items/bulk-update', { preHandler: [requireEstimatorOrAbove] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const estId = parseInt(id, 10);
    if (isNaN(estId)) return reply.status(400).send({ error: 'Invalid estimate id', code: 'VALIDATION_ERROR' });

    const est = await getEstimateOrFail(estId, reply);
    if (!est) return;

    const { items } = request.body as {
      items?: Array<{ id: number; updates: Record<string, unknown> }>;
    };

    if (!Array.isArray(items) || items.length === 0) {
      return reply.status(400).send({ error: 'items array is required', code: 'VALIDATION_ERROR' });
    }

    const updated = [];
    for (const item of items) {
      const [existing] = await db
        .select({ id: estimateLineItems.id })
        .from(estimateLineItems)
        .where(and(eq(estimateLineItems.id, item.id), eq(estimateLineItems.estimateId, estId)))
        .limit(1);

      if (!existing) continue;

      const [u] = await db
        .update(estimateLineItems)
        .set({ ...item.updates, updatedAt: new Date().toISOString() } as any)
        .where(eq(estimateLineItems.id, item.id))
        .returning();

      updated.push({ ...u, ...calculateLineItem(u) });
    }

    await db.update(estimates).set({ updatedAt: new Date().toISOString() }).where(eq(estimates.id, estId));

    return reply.send({ data: updated });
  });

  // ── POST /api/estimates/:id/line-items/reorder ────────────────────────────
  fastify.post('/api/estimates/:id/line-items/reorder', { preHandler: [requireEstimatorOrAbove] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const estId = parseInt(id, 10);
    if (isNaN(estId)) return reply.status(400).send({ error: 'Invalid estimate id', code: 'VALIDATION_ERROR' });

    const { items } = request.body as { items?: Array<{ id: number; sortOrder: number; sectionId?: number }> };
    if (!Array.isArray(items)) return reply.status(400).send({ error: 'items array is required', code: 'VALIDATION_ERROR' });

    for (const item of items) {
      const updateData: Record<string, unknown> = { sortOrder: item.sortOrder };
      if (item.sectionId !== undefined) updateData.sectionId = item.sectionId;

      await db
        .update(estimateLineItems)
        .set(updateData as any)
        .where(and(eq(estimateLineItems.id, item.id), eq(estimateLineItems.estimateId, estId)));
    }

    await db.update(estimates).set({ updatedAt: new Date().toISOString() }).where(eq(estimates.id, estId));

    return reply.send({ success: true });
  });
}
