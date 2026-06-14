import type { FastifyInstance } from 'fastify';
import { db } from '../db/index';
import {
  bidOutcomes,
  projects,
  estimates,
  estimateLineItems,
  users,
} from '../db/schema';
import { eq, and, gte, lte, desc, asc, sql } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { requireEstimatorOrAbove } from '../middleware/rbac';
import { calculateLineItem } from '../lib/estimateCalculator';

type Period = 'monthly' | 'quarterly' | 'yearly';

function getPeriodFormat(period: Period): string {
  switch (period) {
    case 'monthly': return '%Y-%m';
    case 'quarterly': return '%Y-Q';
    case 'yearly': return '%Y';
  }
}

function formatPeriodLabel(dateStr: string, period: Period): string {
  const d = new Date(dateStr);
  switch (period) {
    case 'monthly': return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    case 'quarterly': return `${d.getFullYear()}-Q${Math.ceil((d.getMonth() + 1) / 3)}`;
    case 'yearly': return String(d.getFullYear());
  }
}

export default async function reportRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // ── GET /api/reports/bid-performance ──────────────────────────────────────
  fastify.get('/api/reports/bid-performance', async (request, reply) => {
    const { startDate, endDate, period = 'monthly' } = request.query as {
      startDate?: string;
      endDate?: string;
      period?: Period;
    };

    let query = db.select().from(bidOutcomes).$dynamic();

    const conditions = [];
    if (startDate) conditions.push(gte(bidOutcomes.recordedAt, startDate));
    if (endDate) conditions.push(lte(bidOutcomes.recordedAt, endDate));
    if (conditions.length > 0) query = query.where(and(...conditions));

    const outcomes = await query.orderBy(asc(bidOutcomes.recordedAt));

    // Group by period
    const byPeriod: Record<string, { total: number; won: number; totalAmount: number; wonAmount: number }> = {};

    for (const o of outcomes) {
      const label = formatPeriodLabel(o.recordedAt, period as Period);
      if (!byPeriod[label]) byPeriod[label] = { total: 0, won: 0, totalAmount: 0, wonAmount: 0 };
      byPeriod[label].total++;
      byPeriod[label].totalAmount += o.submittedAmount;
      if (o.won) {
        byPeriod[label].won++;
        byPeriod[label].wonAmount += o.submittedAmount;
      }
    }

    const periodData = Object.entries(byPeriod).map(([label, data]) => ({
      period: label,
      totalBids: data.total,
      wonBids: data.won,
      lostBids: data.total - data.won,
      winRate: data.total > 0 ? Math.round((data.won / data.total) * 10000) / 100 : 0,
      totalBidVolume: Math.round(data.totalAmount * 100) / 100,
      wonVolume: Math.round(data.wonAmount * 100) / 100,
      avgBidSize: data.total > 0 ? Math.round((data.totalAmount / data.total) * 100) / 100 : 0,
    }));

    // Overall stats
    const totalBids = outcomes.length;
    const wonBids = outcomes.filter((o) => o.won).length;
    const totalVolume = outcomes.reduce((s, o) => s + o.submittedAmount, 0);
    const wonVolume = outcomes.filter((o) => o.won).reduce((s, o) => s + o.submittedAmount, 0);

    // Win rate by project trade (approximate using project name patterns since trade isn't on projects)
    // Group by project instead
    const projectMap: Record<number, { projectId: number; total: number; won: number }> = {};
    for (const o of outcomes) {
      if (!projectMap[o.projectId]) projectMap[o.projectId] = { projectId: o.projectId, total: 0, won: 0 };
      projectMap[o.projectId].total++;
      if (o.won) projectMap[o.projectId].won++;
    }

    return reply.send({
      summary: {
        totalBids,
        wonBids,
        lostBids: totalBids - wonBids,
        overallWinRate: totalBids > 0 ? Math.round((wonBids / totalBids) * 10000) / 100 : 0,
        totalBidVolume: Math.round(totalVolume * 100) / 100,
        wonVolume: Math.round(wonVolume * 100) / 100,
        avgBidSize: totalBids > 0 ? Math.round((totalVolume / totalBids) * 100) / 100 : 0,
      },
      byPeriod: periodData,
      period,
    });
  });

  // ── GET /api/reports/cost-analysis ────────────────────────────────────────
  fastify.get('/api/reports/cost-analysis', async (request, reply) => {
    const { startDate, endDate } = request.query as { startDate?: string; endDate?: string };

    // Get all line items from estimates created in range
    const allItems = await db
      .select({
        id: estimateLineItems.id,
        description: estimateLineItems.description,
        quantity: estimateLineItems.quantity,
        unitMaterialCost: estimateLineItems.unitMaterialCost,
        unitLaborCost: estimateLineItems.unitLaborCost,
        laborHours: estimateLineItems.laborHours,
        laborRate: estimateLineItems.laborRate,
        wasteFactorPct: estimateLineItems.wasteFactorPct,
        estimateCreatedAt: estimates.createdAt,
      })
      .from(estimateLineItems)
      .leftJoin(estimates, eq(estimateLineItems.estimateId, estimates.id))
      .orderBy(asc(estimates.createdAt));

    const filtered = allItems.filter((item) => {
      if (startDate && item.estimateCreatedAt && item.estimateCreatedAt < startDate) return false;
      if (endDate && item.estimateCreatedAt && item.estimateCreatedAt > endDate) return false;
      return true;
    });

    // By month trends
    const byMonth: Record<string, { totalMaterial: number; totalLabor: number; totalCost: number }> = {};
    for (const item of filtered) {
      const month = (item.estimateCreatedAt ?? '').slice(0, 7);
      if (!byMonth[month]) byMonth[month] = { totalMaterial: 0, totalLabor: 0, totalCost: 0 };
      const calc = calculateLineItem(item);
      byMonth[month].totalMaterial += calc.totalMaterial;
      byMonth[month].totalLabor += calc.totalLabor;
      byMonth[month].totalCost += calc.totalCost;
    }

    const monthlyTrend = Object.entries(byMonth).map(([month, data]) => ({
      month,
      totalMaterial: Math.round(data.totalMaterial * 100) / 100,
      totalLabor: Math.round(data.totalLabor * 100) / 100,
      totalCost: Math.round(data.totalCost * 100) / 100,
      laborPct: data.totalCost > 0 ? Math.round((data.totalLabor / data.totalCost) * 10000) / 100 : 0,
      materialPct: data.totalCost > 0 ? Math.round((data.totalMaterial / data.totalCost) * 10000) / 100 : 0,
    })).sort((a, b) => a.month.localeCompare(b.month));

    // Most expensive line items
    const itemsWithCosts = filtered.map((item) => ({
      description: item.description,
      ...calculateLineItem(item),
    }));
    itemsWithCosts.sort((a, b) => b.totalCost - a.totalCost);
    const topExpensive = itemsWithCosts.slice(0, 20);

    // Overall split
    const totalMaterial = filtered.reduce((s, i) => s + calculateLineItem(i).totalMaterial, 0);
    const totalLabor = filtered.reduce((s, i) => s + calculateLineItem(i).totalLabor, 0);
    const totalCost = totalMaterial + totalLabor;

    return reply.send({
      summary: {
        totalCost: Math.round(totalCost * 100) / 100,
        totalMaterial: Math.round(totalMaterial * 100) / 100,
        totalLabor: Math.round(totalLabor * 100) / 100,
        laborPct: totalCost > 0 ? Math.round((totalLabor / totalCost) * 10000) / 100 : 0,
        materialPct: totalCost > 0 ? Math.round((totalMaterial / totalCost) * 10000) / 100 : 0,
        lineItemCount: filtered.length,
      },
      monthlyTrend,
      topExpensiveItems: topExpensive,
    });
  });

  // ── GET /api/reports/estimator-productivity ────────────────────────────────
  fastify.get('/api/reports/estimator-productivity', async (request, reply) => {
    const { startDate, endDate } = request.query as { startDate?: string; endDate?: string };

    const allEstimates = await db
      .select({
        id: estimates.id,
        createdBy: estimates.createdBy,
        createdAt: estimates.createdAt,
        isActive: estimates.isActive,
        creatorName: users.name,
        creatorEmail: users.email,
      })
      .from(estimates)
      .leftJoin(users, eq(estimates.createdBy, users.id));

    const filtered = allEstimates.filter((e) => {
      if (startDate && e.createdAt < startDate) return false;
      if (endDate && e.createdAt > endDate) return false;
      return true;
    });

    // Group by estimator
    const byEstimator: Record<number, {
      userId: number;
      name: string;
      email: string;
      estimateCount: number;
      activeEstimates: number;
    }> = {};

    for (const est of filtered) {
      const uid = est.createdBy;
      if (!byEstimator[uid]) {
        byEstimator[uid] = {
          userId: uid,
          name: est.creatorName ?? 'Unknown',
          email: est.creatorEmail ?? '',
          estimateCount: 0,
          activeEstimates: 0,
        };
      }
      byEstimator[uid].estimateCount++;
      if (est.isActive) byEstimator[uid].activeEstimates++;
    }

    // Add bid volume per estimator from bidOutcomes
    const allOutcomes = await db.select({
      projectId: bidOutcomes.projectId,
      estimateId: bidOutcomes.estimateId,
      submittedAmount: bidOutcomes.submittedAmount,
      won: bidOutcomes.won,
      createdBy: estimates.createdBy,
    })
    .from(bidOutcomes)
    .leftJoin(estimates, eq(bidOutcomes.estimateId, estimates.id));

    const bidsByEstimator: Record<number, { totalVolume: number; wonVolume: number; bidCount: number; wonCount: number }> = {};
    for (const o of allOutcomes) {
      const uid = o.createdBy ?? 0;
      if (!bidsByEstimator[uid]) bidsByEstimator[uid] = { totalVolume: 0, wonVolume: 0, bidCount: 0, wonCount: 0 };
      bidsByEstimator[uid].totalVolume += o.submittedAmount;
      bidsByEstimator[uid].bidCount++;
      if (o.won) {
        bidsByEstimator[uid].wonVolume += o.submittedAmount;
        bidsByEstimator[uid].wonCount++;
      }
    }

    const productivity = Object.values(byEstimator).map((est) => {
      const bids = bidsByEstimator[est.userId] ?? { totalVolume: 0, wonVolume: 0, bidCount: 0, wonCount: 0 };
      return {
        ...est,
        totalBidVolume: Math.round(bids.totalVolume * 100) / 100,
        wonBidVolume: Math.round(bids.wonVolume * 100) / 100,
        bidCount: bids.bidCount,
        wonBidCount: bids.wonCount,
        winRate: bids.bidCount > 0 ? Math.round((bids.wonCount / bids.bidCount) * 10000) / 100 : 0,
      };
    }).sort((a, b) => b.estimateCount - a.estimateCount);

    return reply.send({ estimators: productivity });
  });

  // ── POST /api/reports/bid-outcomes ────────────────────────────────────────
  fastify.post('/api/reports/bid-outcomes', {
    preHandler: [requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const body = request.body as {
        projectId: number;
        estimateId: number;
        submittedAmount: number;
        competitorLowBid?: number;
        won: boolean;
        notes?: string;
      };

      if (!body.projectId || !body.estimateId || body.submittedAmount === undefined || body.won === undefined) {
        return reply.status(400).send({ error: 'projectId, estimateId, submittedAmount, and won are required', code: 'VALIDATION_ERROR' });
      }

      const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, body.projectId)).limit(1);
      if (!project) return reply.status(404).send({ error: 'Project not found', code: 'NOT_FOUND' });

      const [estimate] = await db.select({ id: estimates.id }).from(estimates).where(eq(estimates.id, body.estimateId)).limit(1);
      if (!estimate) return reply.status(404).send({ error: 'Estimate not found', code: 'NOT_FOUND' });

      const [outcome] = await db.insert(bidOutcomes).values({
        projectId: body.projectId,
        estimateId: body.estimateId,
        submittedAmount: body.submittedAmount,
        competitorLowBid: body.competitorLowBid ?? null,
        won: body.won,
        notes: body.notes ?? null,
        recordedAt: new Date().toISOString(),
      }).returning();

      // Update project status based on outcome
      if (body.won) {
        await db.update(projects).set({ status: 'won' }).where(eq(projects.id, body.projectId));
      } else {
        await db.update(projects).set({ status: 'lost' }).where(eq(projects.id, body.projectId));
      }

      return reply.status(201).send(outcome);
    },
  });

  // ── GET /api/reports/bid-outcomes ─────────────────────────────────────────
  fastify.get('/api/reports/bid-outcomes', async (request, reply) => {
    const { page = '1', limit = '25' } = request.query as { page?: string; limit?: string };
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const offset = (pageNum - 1) * limitNum;

    const rows = await db
      .select({
        id: bidOutcomes.id,
        projectId: bidOutcomes.projectId,
        estimateId: bidOutcomes.estimateId,
        submittedAmount: bidOutcomes.submittedAmount,
        competitorLowBid: bidOutcomes.competitorLowBid,
        won: bidOutcomes.won,
        notes: bidOutcomes.notes,
        recordedAt: bidOutcomes.recordedAt,
        projectName: projects.name,
        clientName: projects.clientName,
        estimateName: estimates.name,
      })
      .from(bidOutcomes)
      .leftJoin(projects, eq(bidOutcomes.projectId, projects.id))
      .leftJoin(estimates, eq(bidOutcomes.estimateId, estimates.id))
      .orderBy(desc(bidOutcomes.recordedAt))
      .limit(limitNum)
      .offset(offset);

    const [countRow] = await db.select({ count: sql<number>`count(*)` }).from(bidOutcomes);

    return reply.send({
      outcomes: rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: countRow?.count ?? 0,
        totalPages: Math.ceil((countRow?.count ?? 0) / limitNum),
      },
    });
  });
}
