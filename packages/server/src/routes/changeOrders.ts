import type { FastifyInstance } from 'fastify';
import { db } from '../db/index';
import {
  changeOrders,
  changeOrderLineItems,
  projects,
  estimates,
  users,
} from '../db/schema';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { requireEstimatorOrAbove } from '../middleware/rbac';

export default async function changeOrderRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // ── GET /api/projects/:projectId/change-orders ────────────────────────────
  fastify.get('/api/projects/:projectId/change-orders', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const pid = parseInt(projectId, 10);
    if (isNaN(pid)) return reply.status(400).send({ error: 'Invalid projectId', code: 'VALIDATION_ERROR' });

    const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, pid)).limit(1);
    if (!project) return reply.status(404).send({ error: 'Project not found', code: 'NOT_FOUND' });

    const cos = await db
      .select({
        id: changeOrders.id,
        projectId: changeOrders.projectId,
        estimateId: changeOrders.estimateId,
        number: changeOrders.number,
        title: changeOrders.title,
        description: changeOrders.description,
        status: changeOrders.status,
        submittedAt: changeOrders.submittedAt,
        approvedAt: changeOrders.approvedAt,
        approvedByName: changeOrders.approvedByName,
        createdBy: changeOrders.createdBy,
        createdAt: changeOrders.createdAt,
        updatedAt: changeOrders.updatedAt,
        creatorName: users.name,
      })
      .from(changeOrders)
      .leftJoin(users, eq(changeOrders.createdBy, users.id))
      .where(eq(changeOrders.projectId, pid))
      .orderBy(asc(changeOrders.number));

    // Attach line item totals and compute running total
    let runningTotal = 0;
    const cosWithTotals = await Promise.all(cos.map(async (co) => {
      const items = await db.select().from(changeOrderLineItems).where(eq(changeOrderLineItems.changeOrderId, co.id));
      const total = items.reduce((sum, li) => sum + li.totalCost, 0);
      if (co.status === 'approved') runningTotal += total;
      return { ...co, total: Math.round(total * 100) / 100, lineItemCount: items.length };
    }));

    return reply.send({ changeOrders: cosWithTotals, approvedTotal: Math.round(runningTotal * 100) / 100 });
  });

  // ── POST /api/projects/:projectId/change-orders ───────────────────────────
  fastify.post('/api/projects/:projectId/change-orders', {
    preHandler: [requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const { projectId } = request.params as { projectId: string };
      const pid = parseInt(projectId, 10);
      if (isNaN(pid)) return reply.status(400).send({ error: 'Invalid projectId', code: 'VALIDATION_ERROR' });

      const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, pid)).limit(1);
      if (!project) return reply.status(404).send({ error: 'Project not found', code: 'NOT_FOUND' });

      const body = request.body as {
        estimateId: number;
        title: string;
        description?: string;
        lineItems?: Array<{ description: string; quantity: number; unit: string; unitCost: number }>;
      };

      if (!body.estimateId || !body.title) {
        return reply.status(400).send({ error: 'estimateId and title are required', code: 'VALIDATION_ERROR' });
      }

      const [estimate] = await db.select({ id: estimates.id }).from(estimates).where(and(eq(estimates.id, body.estimateId), eq(estimates.projectId, pid))).limit(1);
      if (!estimate) return reply.status(404).send({ error: 'Estimate not found for this project', code: 'NOT_FOUND' });

      // Auto-generate CO number
      const [countRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(changeOrders)
        .where(eq(changeOrders.projectId, pid));
      const nextNum = (countRow?.count ?? 0) + 1;
      const coNumber = `CO-${String(nextNum).padStart(3, '0')}`;

      const now = new Date().toISOString();
      const [co] = await db.insert(changeOrders).values({
        projectId: pid,
        estimateId: body.estimateId,
        number: coNumber,
        title: body.title,
        description: body.description ?? null,
        status: 'draft',
        createdBy: request.user.id,
        createdAt: now,
        updatedAt: now,
      }).returning();

      // Insert line items if provided
      if (body.lineItems && body.lineItems.length > 0) {
        await db.insert(changeOrderLineItems).values(
          body.lineItems.map((li) => ({
            changeOrderId: co.id,
            description: li.description,
            quantity: li.quantity,
            unit: li.unit,
            unitCost: li.unitCost,
            totalCost: Math.round(li.quantity * li.unitCost * 100) / 100,
          }))
        );
      }

      const lineItems = await db.select().from(changeOrderLineItems).where(eq(changeOrderLineItems.changeOrderId, co.id));
      return reply.status(201).send({ ...co, lineItems });
    },
  });

  // ── GET /api/change-orders/:id ────────────────────────────────────────────
  fastify.get('/api/change-orders/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const coId = parseInt(id, 10);
    if (isNaN(coId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

    const [co] = await db
      .select({
        id: changeOrders.id,
        projectId: changeOrders.projectId,
        estimateId: changeOrders.estimateId,
        number: changeOrders.number,
        title: changeOrders.title,
        description: changeOrders.description,
        status: changeOrders.status,
        submittedAt: changeOrders.submittedAt,
        approvedAt: changeOrders.approvedAt,
        approvedByName: changeOrders.approvedByName,
        createdBy: changeOrders.createdBy,
        createdAt: changeOrders.createdAt,
        updatedAt: changeOrders.updatedAt,
        creatorName: users.name,
      })
      .from(changeOrders)
      .leftJoin(users, eq(changeOrders.createdBy, users.id))
      .where(eq(changeOrders.id, coId))
      .limit(1);

    if (!co) return reply.status(404).send({ error: 'Change order not found', code: 'NOT_FOUND' });

    const lineItems = await db.select().from(changeOrderLineItems).where(eq(changeOrderLineItems.changeOrderId, coId));
    const total = lineItems.reduce((sum, li) => sum + li.totalCost, 0);

    return reply.send({ ...co, lineItems, total: Math.round(total * 100) / 100 });
  });

  // ── PUT /api/change-orders/:id ────────────────────────────────────────────
  fastify.put('/api/change-orders/:id', {
    preHandler: [requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const coId = parseInt(id, 10);
      if (isNaN(coId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

      const [co] = await db.select().from(changeOrders).where(eq(changeOrders.id, coId)).limit(1);
      if (!co) return reply.status(404).send({ error: 'Change order not found', code: 'NOT_FOUND' });

      const body = request.body as {
        title?: string;
        description?: string;
        lineItems?: Array<{ description: string; quantity: number; unit: string; unitCost: number }>;
      };

      const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (body.title !== undefined) updates.title = body.title;
      if ('description' in body) updates.description = body.description ?? null;

      const [updated] = await db.update(changeOrders).set(updates).where(eq(changeOrders.id, coId)).returning();

      if (body.lineItems !== undefined) {
        await db.delete(changeOrderLineItems).where(eq(changeOrderLineItems.changeOrderId, coId));
        if (body.lineItems.length > 0) {
          await db.insert(changeOrderLineItems).values(
            body.lineItems.map((li) => ({
              changeOrderId: coId,
              description: li.description,
              quantity: li.quantity,
              unit: li.unit,
              unitCost: li.unitCost,
              totalCost: Math.round(li.quantity * li.unitCost * 100) / 100,
            }))
          );
        }
      }

      const lineItems = await db.select().from(changeOrderLineItems).where(eq(changeOrderLineItems.changeOrderId, coId));
      const total = lineItems.reduce((sum, li) => sum + li.totalCost, 0);

      return reply.send({ ...updated, lineItems, total: Math.round(total * 100) / 100 });
    },
  });

  // ── DELETE /api/change-orders/:id ─────────────────────────────────────────
  fastify.delete('/api/change-orders/:id', {
    preHandler: [requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const coId = parseInt(id, 10);
      if (isNaN(coId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

      const [co] = await db.select().from(changeOrders).where(eq(changeOrders.id, coId)).limit(1);
      if (!co) return reply.status(404).send({ error: 'Change order not found', code: 'NOT_FOUND' });

      if (co.status !== 'draft') {
        return reply.status(400).send({ error: 'Only draft change orders can be deleted', code: 'INVALID_STATUS' });
      }

      await db.delete(changeOrders).where(eq(changeOrders.id, coId));
      return reply.status(204).send();
    },
  });

  // ── POST /api/change-orders/:id/submit ───────────────────────────────────
  fastify.post('/api/change-orders/:id/submit', {
    preHandler: [requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const coId = parseInt(id, 10);
      if (isNaN(coId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

      const [co] = await db.select().from(changeOrders).where(eq(changeOrders.id, coId)).limit(1);
      if (!co) return reply.status(404).send({ error: 'Change order not found', code: 'NOT_FOUND' });

      if (co.status !== 'draft') {
        return reply.status(400).send({ error: 'Only draft change orders can be submitted', code: 'INVALID_STATUS' });
      }

      const now = new Date().toISOString();
      const [updated] = await db
        .update(changeOrders)
        .set({ status: 'submitted', submittedAt: now, updatedAt: now })
        .where(eq(changeOrders.id, coId))
        .returning();

      return reply.send(updated);
    },
  });

  // ── POST /api/change-orders/:id/approve ──────────────────────────────────
  fastify.post('/api/change-orders/:id/approve', {
    preHandler: [requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const coId = parseInt(id, 10);
      if (isNaN(coId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

      const [co] = await db.select().from(changeOrders).where(eq(changeOrders.id, coId)).limit(1);
      if (!co) return reply.status(404).send({ error: 'Change order not found', code: 'NOT_FOUND' });

      if (co.status !== 'submitted') {
        return reply.status(400).send({ error: 'Only submitted change orders can be approved', code: 'INVALID_STATUS' });
      }

      const body = request.body as { approvedByName?: string };
      const now = new Date().toISOString();
      const [updated] = await db
        .update(changeOrders)
        .set({
          status: 'approved',
          approvedAt: now,
          approvedByName: body.approvedByName ?? request.user.name,
          updatedAt: now,
        })
        .where(eq(changeOrders.id, coId))
        .returning();

      return reply.send(updated);
    },
  });

  // ── POST /api/change-orders/:id/reject ───────────────────────────────────
  fastify.post('/api/change-orders/:id/reject', {
    preHandler: [requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const coId = parseInt(id, 10);
      if (isNaN(coId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

      const [co] = await db.select().from(changeOrders).where(eq(changeOrders.id, coId)).limit(1);
      if (!co) return reply.status(404).send({ error: 'Change order not found', code: 'NOT_FOUND' });

      if (co.status === 'approved' || co.status === 'rejected') {
        return reply.status(400).send({ error: 'Change order is already finalized', code: 'INVALID_STATUS' });
      }

      const now = new Date().toISOString();
      const [updated] = await db
        .update(changeOrders)
        .set({ status: 'rejected', updatedAt: now })
        .where(eq(changeOrders.id, coId))
        .returning();

      return reply.send(updated);
    },
  });

  // ── GET /api/projects/:projectId/change-orders/contract-summary ───────────
  fastify.get('/api/projects/:projectId/change-orders/contract-summary', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const pid = parseInt(projectId, 10);
    if (isNaN(pid)) return reply.status(400).send({ error: 'Invalid projectId', code: 'VALIDATION_ERROR' });

    const [project] = await db.select().from(projects).where(eq(projects.id, pid)).limit(1);
    if (!project) return reply.status(404).send({ error: 'Project not found', code: 'NOT_FOUND' });

    // Get active estimate
    const [activeEstimate] = await db
      .select()
      .from(estimates)
      .where(and(eq(estimates.projectId, pid), eq(estimates.isActive, true)))
      .limit(1);

    // Get all COs for project
    const cos = await db.select().from(changeOrders).where(eq(changeOrders.projectId, pid));

    // Sum approved CO totals
    let approvedCoTotal = 0;
    const cosWithTotals = await Promise.all(cos.map(async (co) => {
      const items = await db.select().from(changeOrderLineItems).where(eq(changeOrderLineItems.changeOrderId, co.id));
      const total = items.reduce((sum, li) => sum + li.totalCost, 0);
      if (co.status === 'approved') approvedCoTotal += total;
      return { id: co.id, number: co.number, title: co.title, status: co.status, total: Math.round(total * 100) / 100, approvedAt: co.approvedAt };
    }));

    // The original bid is the active estimate's grand total (we use a placeholder - actual from client)
    // We return the approved CO sum so the client can add it to any base contract value
    return reply.send({
      project: { id: project.id, name: project.name },
      activeEstimateId: activeEstimate?.id ?? null,
      approvedChangeOrdersTotal: Math.round(approvedCoTotal * 100) / 100,
      changeOrders: cosWithTotals,
      summary: {
        draft: cos.filter((co) => co.status === 'draft').length,
        submitted: cos.filter((co) => co.status === 'submitted').length,
        approved: cos.filter((co) => co.status === 'approved').length,
        rejected: cos.filter((co) => co.status === 'rejected').length,
      },
    });
  });
}
