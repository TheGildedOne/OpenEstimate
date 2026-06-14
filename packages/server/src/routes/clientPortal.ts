import type { FastifyInstance } from 'fastify';
import { db } from '../db/index';
import {
  estimateShareLinks,
  estimates,
  estimateSections,
  estimateLineItems,
  projects,
  notifications,
  users,
  notificationSettings,
} from '../db/schema';
import { eq, desc, asc } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { requireEstimatorOrAbove } from '../middleware/rbac';
import { calculateLineItem, calculateSectionTotals, calculateEstimateTotals } from '../lib/estimateCalculator';
import { randomBytes } from 'crypto';
import { sendClientPortalNotification } from '../services/notifications/email';

export default async function clientPortalRoutes(fastify: FastifyInstance) {

  // ── POST /api/share-links (auth required) ─────────────────────────────────
  fastify.post('/api/share-links', {
    preHandler: [authenticate, requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const body = request.body as { estimateId: number; expiresAt?: string };

      if (!body.estimateId) {
        return reply.status(400).send({ error: 'estimateId is required', code: 'VALIDATION_ERROR' });
      }

      const [estimate] = await db.select().from(estimates).where(eq(estimates.id, body.estimateId)).limit(1);
      if (!estimate) return reply.status(404).send({ error: 'Estimate not found', code: 'NOT_FOUND' });

      const token = randomBytes(32).toString('hex');

      const [link] = await db.insert(estimateShareLinks).values({
        estimateId: body.estimateId,
        token,
        expiresAt: body.expiresAt ?? null,
        isRevoked: false,
        createdBy: request.user.id,
        createdAt: new Date().toISOString(),
      }).returning();

      return reply.status(201).send(link);
    },
  });

  // ── GET /api/share-links?estimateId=X (auth required) ─────────────────────
  fastify.get('/api/share-links', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { estimateId } = request.query as { estimateId?: string };

      if (!estimateId) {
        return reply.status(400).send({ error: 'estimateId query param is required', code: 'VALIDATION_ERROR' });
      }

      const estId = parseInt(estimateId, 10);
      if (isNaN(estId)) return reply.status(400).send({ error: 'Invalid estimateId', code: 'VALIDATION_ERROR' });

      const [estimate] = await db.select().from(estimates).where(eq(estimates.id, estId)).limit(1);
      if (!estimate) return reply.status(404).send({ error: 'Estimate not found', code: 'NOT_FOUND' });

      const links = await db
        .select()
        .from(estimateShareLinks)
        .where(eq(estimateShareLinks.estimateId, estId))
        .orderBy(desc(estimateShareLinks.createdAt));

      return reply.send(links);
    },
  });

  // ── DELETE /api/share-links/:id (auth required) ────────────────────────────
  fastify.delete('/api/share-links/:id', {
    preHandler: [authenticate, requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const linkId = parseInt(id, 10);
      if (isNaN(linkId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

      const [link] = await db.select().from(estimateShareLinks).where(eq(estimateShareLinks.id, linkId)).limit(1);
      if (!link) return reply.status(404).send({ error: 'Share link not found', code: 'NOT_FOUND' });

      // Only the creator or admin can revoke
      if (link.createdBy !== request.user.id && request.user.role !== 'admin') {
        return reply.status(403).send({ error: 'Access denied', code: 'FORBIDDEN' });
      }

      await db.update(estimateShareLinks).set({ isRevoked: true }).where(eq(estimateShareLinks.id, linkId));
      return reply.status(204).send();
    },
  });

  // ── GET /api/portal/:token (PUBLIC) ───────────────────────────────────────
  fastify.get('/api/portal/:token', async (request, reply) => {
    const { token } = request.params as { token: string };

    const [link] = await db
      .select()
      .from(estimateShareLinks)
      .where(eq(estimateShareLinks.token, token))
      .limit(1);

    if (!link) return reply.status(404).send({ error: 'Share link not found', code: 'NOT_FOUND' });
    if (link.isRevoked) return reply.status(410).send({ error: 'This link has been revoked', code: 'LINK_REVOKED' });
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      return reply.status(410).send({ error: 'This link has expired', code: 'LINK_EXPIRED' });
    }

    const [estimate] = await db.select().from(estimates).where(eq(estimates.id, link.estimateId)).limit(1);
    if (!estimate) return reply.status(404).send({ error: 'Estimate not found', code: 'NOT_FOUND' });

    const [project] = await db.select().from(projects).where(eq(projects.id, estimate.projectId)).limit(1);

    const sections = await db
      .select()
      .from(estimateSections)
      .where(eq(estimateSections.estimateId, estimate.id))
      .orderBy(asc(estimateSections.sortOrder));

    const lineItems = await db
      .select()
      .from(estimateLineItems)
      .where(eq(estimateLineItems.estimateId, estimate.id));

    const annotated = lineItems.map((li) => ({ ...li, ...calculateLineItem(li) }));

    const sectionsWithItems = sections.map((sec) => ({
      ...sec,
      lineItems: annotated
        .filter((li) => li.sectionId === sec.id)
        .map((li) => ({
          // Strip cost details from client-facing view
          id: li.id,
          description: li.description,
          quantity: li.quantity,
          unit: li.unit,
          totalCost: li.totalCost,
        })),
    }));

    const sectionTotals = calculateSectionTotals(annotated);
    const estimateTotals = calculateEstimateTotals({
      subtotal: sectionTotals.totalCost,
      overheadPct: estimate.overheadPct,
      profitPct: estimate.profitPct,
      taxPct: estimate.taxPct,
      bondPct: estimate.bondPct,
    });

    return reply.send({
      estimateId: estimate.id,
      estimateName: estimate.name,
      projectName: project?.name ?? '',
      clientName: project?.clientName ?? '',
      siteAddress: project?.siteAddress ?? '',
      sections: sectionsWithItems,
      totals: {
        subtotal: estimateTotals.subtotal,
        grandTotal: estimateTotals.grandTotal,
      },
      link: {
        expiresAt: link.expiresAt,
        clientApprovedAt: link.clientApprovedAt,
        clientRejectedAt: link.clientRejectedAt,
      },
    });
  });

  // ── POST /api/portal/:token/action (PUBLIC) ────────────────────────────────
  fastify.post('/api/portal/:token/action', async (request, reply) => {
    const { token } = request.params as { token: string };
    const body = request.body as { action: 'approve' | 'reject'; comment?: string };

    if (!body.action || !['approve', 'reject'].includes(body.action)) {
      return reply.status(400).send({ error: 'action must be "approve" or "reject"', code: 'VALIDATION_ERROR' });
    }

    const [link] = await db
      .select()
      .from(estimateShareLinks)
      .where(eq(estimateShareLinks.token, token))
      .limit(1);

    if (!link) return reply.status(404).send({ error: 'Share link not found', code: 'NOT_FOUND' });
    if (link.isRevoked) return reply.status(410).send({ error: 'This link has been revoked', code: 'LINK_REVOKED' });
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      return reply.status(410).send({ error: 'This link has expired', code: 'LINK_EXPIRED' });
    }
    if (link.clientApprovedAt || link.clientRejectedAt) {
      return reply.status(409).send({ error: 'Action already recorded for this link', code: 'ALREADY_ACTIONED' });
    }

    const clientIp = request.ip || (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || null;
    const now = new Date().toISOString();

    const updates: Record<string, unknown> = {
      clientIp,
      clientComment: body.comment ?? null,
    };

    if (body.action === 'approve') {
      updates.clientApprovedAt = now;
    } else {
      updates.clientRejectedAt = now;
    }

    await db.update(estimateShareLinks).set(updates).where(eq(estimateShareLinks.id, link.id));

    // Notify the creator
    try {
      const [creator] = await db.select().from(users).where(eq(users.id, link.createdBy)).limit(1);
      const [estimate] = await db.select().from(estimates).where(eq(estimates.id, link.estimateId)).limit(1);

      if (creator) {
        // Create in-app notification
        const [notifSettings] = await db
          .select()
          .from(notificationSettings)
          .where(eq(notificationSettings.userId, creator.id))
          .limit(1);

        const inAppEnabled = notifSettings?.inAppEnabled ?? true;

        if (inAppEnabled) {
          await db.insert(notifications).values({
            userId: creator.id,
            type: body.action === 'approve' ? 'estimate_approved' : 'estimate_rejected',
            title: `Estimate ${body.action === 'approve' ? 'Approved' : 'Rejected'} by Client`,
            body: `Your estimate "${estimate?.name ?? ''}" has been ${body.action === 'approve' ? 'approved' : 'rejected'} by the client.${body.comment ? ` Comment: "${body.comment}"` : ''}`,
            link: `/estimates/${link.estimateId}`,
            isRead: false,
            createdAt: now,
          });
        }

        // Send email notification (non-blocking)
        if (estimate) {
          sendClientPortalNotification(creator, estimate as never, body.action).catch((err) => {
            fastify.log.warn(`Email notification failed: ${(err as Error).message}`);
          });
        }
      }
    } catch (err) {
      fastify.log.warn(`Notification dispatch failed: ${(err as Error).message}`);
    }

    return reply.send({ success: true, action: body.action });
  });
}
