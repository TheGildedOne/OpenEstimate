import type { FastifyInstance } from 'fastify';
import { db } from '../db/index';
import { notifications, notificationSettings } from '../db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';

export default async function notificationRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // ── GET /api/notifications ────────────────────────────────────────────────
  fastify.get('/api/notifications', async (request, reply) => {
    const { page = '1', limit = '25' } = request.query as { page?: string; limit?: string };
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const offset = (pageNum - 1) * limitNum;

    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, request.user.id))
      .orderBy(desc(notifications.isRead), desc(notifications.createdAt))
      .limit(limitNum)
      .offset(offset);

    const [countRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(eq(notifications.userId, request.user.id));

    return reply.send({
      notifications: rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: countRow?.count ?? 0,
        totalPages: Math.ceil((countRow?.count ?? 0) / limitNum),
      },
    });
  });

  // ── POST /api/notifications/mark-read ─────────────────────────────────────
  fastify.post('/api/notifications/mark-read', async (request, reply) => {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.userId, request.user.id), eq(notifications.isRead, false)));

    return reply.send({ success: true });
  });

  // ── PUT /api/notifications/:id/read ───────────────────────────────────────
  fastify.put('/api/notifications/:id/read', async (request, reply) => {
    const { id } = request.params as { id: string };
    const notifId = parseInt(id, 10);
    if (isNaN(notifId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

    const [notif] = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.id, notifId), eq(notifications.userId, request.user.id)))
      .limit(1);

    if (!notif) return reply.status(404).send({ error: 'Notification not found', code: 'NOT_FOUND' });

    const [updated] = await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, notifId))
      .returning();

    return reply.send(updated);
  });

  // ── GET /api/notifications/unread-count ───────────────────────────────────
  fastify.get('/api/notifications/unread-count', async (request, reply) => {
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.userId, request.user.id), eq(notifications.isRead, false)));

    return reply.send({ count: row?.count ?? 0 });
  });

  // ── GET /api/notifications/settings ──────────────────────────────────────
  fastify.get('/api/notifications/settings', async (request, reply) => {
    const [settings] = await db
      .select()
      .from(notificationSettings)
      .where(eq(notificationSettings.userId, request.user.id))
      .limit(1);

    if (!settings) {
      // Return defaults
      return reply.send({
        userId: request.user.id,
        bidDueReminderDaysJson: '[7,3,1]',
        emailOnBidDue: true,
        emailOnChangeOrder: true,
        inAppEnabled: true,
      });
    }

    return reply.send(settings);
  });

  // ── PUT /api/notifications/settings ──────────────────────────────────────
  fastify.put('/api/notifications/settings', async (request, reply) => {
    const body = request.body as {
      bidDueReminderDaysJson?: string;
      emailOnBidDue?: boolean;
      emailOnChangeOrder?: boolean;
      inAppEnabled?: boolean;
    };

    const userId = request.user.id;
    const [existing] = await db
      .select()
      .from(notificationSettings)
      .where(eq(notificationSettings.userId, userId))
      .limit(1);

    if (existing) {
      const updates: Record<string, unknown> = {};
      if (body.bidDueReminderDaysJson !== undefined) updates.bidDueReminderDaysJson = body.bidDueReminderDaysJson;
      if (body.emailOnBidDue !== undefined) updates.emailOnBidDue = body.emailOnBidDue;
      if (body.emailOnChangeOrder !== undefined) updates.emailOnChangeOrder = body.emailOnChangeOrder;
      if (body.inAppEnabled !== undefined) updates.inAppEnabled = body.inAppEnabled;

      const [updated] = await db
        .update(notificationSettings)
        .set(updates)
        .where(eq(notificationSettings.userId, userId))
        .returning();

      return reply.send(updated);
    } else {
      const [created] = await db.insert(notificationSettings).values({
        userId,
        bidDueReminderDaysJson: body.bidDueReminderDaysJson ?? '[7,3,1]',
        emailOnBidDue: body.emailOnBidDue ?? true,
        emailOnChangeOrder: body.emailOnChangeOrder ?? true,
        inAppEnabled: body.inAppEnabled ?? true,
      }).returning();

      return reply.status(201).send(created);
    }
  });
}
