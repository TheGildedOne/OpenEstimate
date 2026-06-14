import type { FastifyInstance } from 'fastify';
import { db } from '../db/index';
import {
  subcontractors,
  subBids,
  subBidAdjustments,
  projects,
  estimateSections,
} from '../db/schema';
import { eq, and, or, like, desc, asc, type SQL } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { requireEstimatorOrAbove } from '../middleware/rbac';

export default async function subcontractorRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // ── GET /api/subcontractors ───────────────────────────────────────────────
  fastify.get('/api/subcontractors', async (request, reply) => {
    const { trade, isPreferred, search } = request.query as {
      trade?: string;
      isPreferred?: string;
      search?: string;
    };

    const conditions: SQL[] = [];

    if (trade) conditions.push(eq(subcontractors.trade, trade));
    if (isPreferred === 'true') conditions.push(eq(subcontractors.isPreferred, true));
    if (isPreferred === 'false') conditions.push(eq(subcontractors.isPreferred, false));
    if (search) {
      const searchClause = or(
        like(subcontractors.companyName, `%${search}%`),
        like(subcontractors.contactName, `%${search}%`),
        like(subcontractors.email, `%${search}%`),
        like(subcontractors.trade, `%${search}%`)
      );
      if (searchClause) conditions.push(searchClause);
    }

    const rows = conditions.length > 0
      ? await db.select().from(subcontractors).where(and(...conditions)).orderBy(asc(subcontractors.companyName))
      : await db.select().from(subcontractors).orderBy(asc(subcontractors.companyName));

    return reply.send(rows);
  });

  // ── POST /api/subcontractors ──────────────────────────────────────────────
  fastify.post('/api/subcontractors', {
    preHandler: [requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const body = request.body as {
        companyName: string;
        contactName?: string;
        email?: string;
        phone?: string;
        trade?: string;
        notes?: string;
        isPreferred?: boolean;
      };

      if (!body.companyName) {
        return reply.status(400).send({ error: 'companyName is required', code: 'VALIDATION_ERROR' });
      }

      const [sub] = await db.insert(subcontractors).values({
        companyName: body.companyName,
        contactName: body.contactName ?? null,
        email: body.email ?? null,
        phone: body.phone ?? null,
        trade: body.trade ?? null,
        notes: body.notes ?? null,
        isPreferred: body.isPreferred ?? false,
        createdAt: new Date().toISOString(),
      }).returning();

      return reply.status(201).send(sub);
    },
  });

  // ── GET /api/subcontractors/:id ───────────────────────────────────────────
  fastify.get('/api/subcontractors/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const subId = parseInt(id, 10);
    if (isNaN(subId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

    const [sub] = await db.select().from(subcontractors).where(eq(subcontractors.id, subId)).limit(1);
    if (!sub) return reply.status(404).send({ error: 'Subcontractor not found', code: 'NOT_FOUND' });

    const bids = await db
      .select({
        id: subBids.id,
        projectId: subBids.projectId,
        tradeDescription: subBids.tradeDescription,
        bidAmount: subBids.bidAmount,
        receivedDate: subBids.receivedDate,
        validUntil: subBids.validUntil,
        notes: subBids.notes,
        status: subBids.status,
        awardedAt: subBids.awardedAt,
        projectName: projects.name,
        createdAt: subBids.createdAt,
      })
      .from(subBids)
      .leftJoin(projects, eq(subBids.projectId, projects.id))
      .where(eq(subBids.subcontractorId, subId))
      .orderBy(desc(subBids.createdAt));

    return reply.send({ ...sub, bidHistory: bids });
  });

  // ── PUT /api/subcontractors/:id ───────────────────────────────────────────
  fastify.put('/api/subcontractors/:id', {
    preHandler: [requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const subId = parseInt(id, 10);
      if (isNaN(subId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

      const [sub] = await db.select().from(subcontractors).where(eq(subcontractors.id, subId)).limit(1);
      if (!sub) return reply.status(404).send({ error: 'Subcontractor not found', code: 'NOT_FOUND' });

      const body = request.body as Partial<{
        companyName: string;
        contactName: string;
        email: string;
        phone: string;
        trade: string;
        notes: string;
        isPreferred: boolean;
      }>;

      const updates: Record<string, unknown> = {};
      if (body.companyName !== undefined) updates.companyName = body.companyName;
      if ('contactName' in body) updates.contactName = body.contactName ?? null;
      if ('email' in body) updates.email = body.email ?? null;
      if ('phone' in body) updates.phone = body.phone ?? null;
      if ('trade' in body) updates.trade = body.trade ?? null;
      if ('notes' in body) updates.notes = body.notes ?? null;
      if (body.isPreferred !== undefined) updates.isPreferred = body.isPreferred;

      const [updated] = await db.update(subcontractors).set(updates).where(eq(subcontractors.id, subId)).returning();
      return reply.send(updated);
    },
  });

  // ── DELETE /api/subcontractors/:id ────────────────────────────────────────
  fastify.delete('/api/subcontractors/:id', {
    preHandler: [requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const subId = parseInt(id, 10);
      if (isNaN(subId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

      const [sub] = await db.select().from(subcontractors).where(eq(subcontractors.id, subId)).limit(1);
      if (!sub) return reply.status(404).send({ error: 'Subcontractor not found', code: 'NOT_FOUND' });

      await db.delete(subcontractors).where(eq(subcontractors.id, subId));
      return reply.status(204).send();
    },
  });

  // ── GET /api/projects/:projectId/sub-bids ─────────────────────────────────
  fastify.get('/api/projects/:projectId/sub-bids', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const pid = parseInt(projectId, 10);
    if (isNaN(pid)) return reply.status(400).send({ error: 'Invalid projectId', code: 'VALIDATION_ERROR' });

    const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, pid)).limit(1);
    if (!project) return reply.status(404).send({ error: 'Project not found', code: 'NOT_FOUND' });

    const bids = await db
      .select({
        id: subBids.id,
        projectId: subBids.projectId,
        estimateSectionId: subBids.estimateSectionId,
        subcontractorId: subBids.subcontractorId,
        tradeDescription: subBids.tradeDescription,
        bidAmount: subBids.bidAmount,
        receivedDate: subBids.receivedDate,
        validUntil: subBids.validUntil,
        notes: subBids.notes,
        status: subBids.status,
        awardedAt: subBids.awardedAt,
        createdAt: subBids.createdAt,
        updatedAt: subBids.updatedAt,
        subCompanyName: subcontractors.companyName,
        subContactName: subcontractors.contactName,
        subEmail: subcontractors.email,
        subTrade: subcontractors.trade,
      })
      .from(subBids)
      .leftJoin(subcontractors, eq(subBids.subcontractorId, subcontractors.id))
      .where(eq(subBids.projectId, pid))
      .orderBy(desc(subBids.createdAt));

    // Fetch adjustments for each bid
    const bidsWithAdjustments = await Promise.all(bids.map(async (bid) => {
      const adjustments = await db.select().from(subBidAdjustments).where(eq(subBidAdjustments.subBidId, bid.id));
      const adjustmentTotal = adjustments.reduce((sum, a) => sum + a.amount, 0);
      return { ...bid, adjustments, adjustedTotal: bid.bidAmount + adjustmentTotal };
    }));

    return reply.send(bidsWithAdjustments);
  });

  // ── POST /api/projects/:projectId/sub-bids ────────────────────────────────
  fastify.post('/api/projects/:projectId/sub-bids', {
    preHandler: [requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const { projectId } = request.params as { projectId: string };
      const pid = parseInt(projectId, 10);
      if (isNaN(pid)) return reply.status(400).send({ error: 'Invalid projectId', code: 'VALIDATION_ERROR' });

      const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, pid)).limit(1);
      if (!project) return reply.status(404).send({ error: 'Project not found', code: 'NOT_FOUND' });

      const body = request.body as {
        subcontractorId: number;
        tradeDescription: string;
        bidAmount: number;
        receivedDate: string;
        validUntil?: string;
        notes?: string;
        estimateSectionId?: number;
      };

      if (!body.subcontractorId || !body.tradeDescription || body.bidAmount === undefined || !body.receivedDate) {
        return reply.status(400).send({ error: 'subcontractorId, tradeDescription, bidAmount, and receivedDate are required', code: 'VALIDATION_ERROR' });
      }

      const [sub] = await db.select({ id: subcontractors.id }).from(subcontractors).where(eq(subcontractors.id, body.subcontractorId)).limit(1);
      if (!sub) return reply.status(404).send({ error: 'Subcontractor not found', code: 'NOT_FOUND' });

      const now = new Date().toISOString();
      const [bid] = await db.insert(subBids).values({
        projectId: pid,
        subcontractorId: body.subcontractorId,
        estimateSectionId: body.estimateSectionId ?? null,
        tradeDescription: body.tradeDescription,
        bidAmount: body.bidAmount,
        receivedDate: body.receivedDate,
        validUntil: body.validUntil ?? null,
        notes: body.notes ?? null,
        status: 'received',
        createdAt: now,
        updatedAt: now,
      }).returning();

      return reply.status(201).send(bid);
    },
  });

  // ── PUT /api/sub-bids/:id ─────────────────────────────────────────────────
  fastify.put('/api/sub-bids/:id', {
    preHandler: [requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const bidId = parseInt(id, 10);
      if (isNaN(bidId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

      const [bid] = await db.select().from(subBids).where(eq(subBids.id, bidId)).limit(1);
      if (!bid) return reply.status(404).send({ error: 'Sub bid not found', code: 'NOT_FOUND' });

      const body = request.body as {
        status?: 'received' | 'awarded' | 'rejected';
        bidAmount?: number;
        notes?: string;
        validUntil?: string;
        adjustments?: Array<{ id?: number; description: string; amount: number }>;
      };

      const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (body.status !== undefined) updates.status = body.status;
      if (body.bidAmount !== undefined) updates.bidAmount = body.bidAmount;
      if ('notes' in body) updates.notes = body.notes ?? null;
      if ('validUntil' in body) updates.validUntil = body.validUntil ?? null;

      const [updated] = await db.update(subBids).set(updates).where(eq(subBids.id, bidId)).returning();

      // Handle adjustments replacement if provided
      if (body.adjustments !== undefined) {
        await db.delete(subBidAdjustments).where(eq(subBidAdjustments.subBidId, bidId));
        if (body.adjustments.length > 0) {
          await db.insert(subBidAdjustments).values(
            body.adjustments.map((a) => ({ subBidId: bidId, description: a.description, amount: a.amount }))
          );
        }
      }

      const adjustments = await db.select().from(subBidAdjustments).where(eq(subBidAdjustments.subBidId, bidId));
      const adjustmentTotal = adjustments.reduce((sum, a) => sum + a.amount, 0);

      return reply.send({ ...updated, adjustments, adjustedTotal: updated.bidAmount + adjustmentTotal });
    },
  });

  // ── DELETE /api/sub-bids/:id ──────────────────────────────────────────────
  fastify.delete('/api/sub-bids/:id', {
    preHandler: [requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const bidId = parseInt(id, 10);
      if (isNaN(bidId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

      const [bid] = await db.select().from(subBids).where(eq(subBids.id, bidId)).limit(1);
      if (!bid) return reply.status(404).send({ error: 'Sub bid not found', code: 'NOT_FOUND' });

      await db.delete(subBids).where(eq(subBids.id, bidId));
      return reply.status(204).send();
    },
  });

  // ── POST /api/sub-bids/:id/award ──────────────────────────────────────────
  fastify.post('/api/sub-bids/:id/award', {
    preHandler: [requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const bidId = parseInt(id, 10);
      if (isNaN(bidId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

      const [bid] = await db.select().from(subBids).where(eq(subBids.id, bidId)).limit(1);
      if (!bid) return reply.status(404).send({ error: 'Sub bid not found', code: 'NOT_FOUND' });

      const now = new Date().toISOString();
      const [updated] = await db
        .update(subBids)
        .set({ status: 'awarded', awardedAt: now, updatedAt: now })
        .where(eq(subBids.id, bidId))
        .returning();

      return reply.send(updated);
    },
  });

  // ── GET /api/projects/:projectId/sub-bids/leveling ────────────────────────
  fastify.get('/api/projects/:projectId/sub-bids/leveling', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const pid = parseInt(projectId, 10);
    if (isNaN(pid)) return reply.status(400).send({ error: 'Invalid projectId', code: 'VALIDATION_ERROR' });

    const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, pid)).limit(1);
    if (!project) return reply.status(404).send({ error: 'Project not found', code: 'NOT_FOUND' });

    const bids = await db
      .select({
        id: subBids.id,
        tradeDescription: subBids.tradeDescription,
        bidAmount: subBids.bidAmount,
        status: subBids.status,
        receivedDate: subBids.receivedDate,
        notes: subBids.notes,
        subcontractorId: subBids.subcontractorId,
        subCompanyName: subcontractors.companyName,
        subContactName: subcontractors.contactName,
        subEmail: subcontractors.email,
        subIsPreferred: subcontractors.isPreferred,
      })
      .from(subBids)
      .leftJoin(subcontractors, eq(subBids.subcontractorId, subcontractors.id))
      .where(eq(subBids.projectId, pid));

    // Enrich with adjustments
    const enriched = await Promise.all(bids.map(async (bid) => {
      const adjustments = await db.select().from(subBidAdjustments).where(eq(subBidAdjustments.subBidId, bid.id));
      const adjustmentTotal = adjustments.reduce((sum, a) => sum + a.amount, 0);
      return { ...bid, adjustments, adjustedTotal: bid.bidAmount + adjustmentTotal };
    }));

    // Group by tradeDescription
    const grouped: Record<string, typeof enriched> = {};
    for (const bid of enriched) {
      const key = bid.tradeDescription;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(bid);
    }

    const trades = Object.entries(grouped).map(([trade, tradeBids]) => {
      const sorted = [...tradeBids].sort((a, b) => a.adjustedTotal - b.adjustedTotal);
      const low = sorted[0]?.adjustedTotal ?? 0;
      const high = sorted[sorted.length - 1]?.adjustedTotal ?? 0;
      return {
        trade,
        bids: sorted.map((b) => ({
          ...b,
          isLow: b.adjustedTotal === low && sorted.length > 1,
          isHigh: b.adjustedTotal === high && sorted.length > 1,
        })),
        lowBid: low,
        highBid: high,
        bidCount: sorted.length,
        spread: high - low,
        spreadPct: low > 0 ? Math.round(((high - low) / low) * 10000) / 100 : 0,
      };
    });

    return reply.send({ trades });
  });

  // ── GET /api/subcontractors/:id/analytics ─────────────────────────────────
  fastify.get('/api/subcontractors/:id/analytics', async (request, reply) => {
    const { id } = request.params as { id: string };
    const subId = parseInt(id, 10);
    if (isNaN(subId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

    const [sub] = await db.select().from(subcontractors).where(eq(subcontractors.id, subId)).limit(1);
    if (!sub) return reply.status(404).send({ error: 'Subcontractor not found', code: 'NOT_FOUND' });

    const bids = await db.select().from(subBids).where(eq(subBids.subcontractorId, subId));

    const totalBids = bids.length;
    const wonBids = bids.filter((b) => b.status === 'awarded').length;
    const rejectedBids = bids.filter((b) => b.status === 'rejected').length;
    const avgAmount = totalBids > 0 ? bids.reduce((sum, b) => sum + b.bidAmount, 0) / totalBids : 0;
    const winRate = totalBids > 0 ? Math.round((wonBids / totalBids) * 10000) / 100 : 0;
    const totalVolume = bids.reduce((sum, b) => sum + b.bidAmount, 0);

    return reply.send({
      subcontractor: sub,
      analytics: {
        totalBids,
        wonBids,
        rejectedBids,
        pendingBids: totalBids - wonBids - rejectedBids,
        avgBidAmount: Math.round(avgAmount * 100) / 100,
        totalVolume: Math.round(totalVolume * 100) / 100,
        winRate,
      },
    });
  });
}
