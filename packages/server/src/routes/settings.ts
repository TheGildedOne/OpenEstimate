import type { FastifyInstance } from 'fastify';
import { db } from '../db/index';
import { companySettings, users, sessions } from '../db/schema';
import { eq, and, ne } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';
import { getStorage, saveUploadedFile } from '../services/storage';
import { sendEmail } from '../services/notifications/email';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

export default async function settingsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // ── GET /api/settings ─────────────────────────────────────────────────────
  fastify.get('/api/settings', {
    preHandler: [requireAdmin],
    handler: async (_request, reply) => {
      const [settings] = await db.select().from(companySettings).limit(1);
      if (!settings) {
        // Return defaults
        return reply.send({
          companyName: 'My Company',
          address: null,
          phone: null,
          email: null,
          logoUrl: null,
          licenseNumber: null,
          defaultOverheadPct: 15,
          defaultProfitPct: 10,
          defaultTaxPct: 0,
          defaultBondPct: 0,
          defaultLaborRate: 65,
          defaultWasteFactorPct: 5,
          currency: 'USD',
          timezone: 'America/New_York',
          fiscalYearStartMonth: 1,
          customUnitsJson: '[]',
          termsAndConditions: null,
          smtpHost: null,
          smtpPort: 587,
          smtpSecure: false,
          smtpUser: null,
          smtpFrom: null,
        });
      }
      // Strip the SMTP password from the response
      const { smtpPassEncrypted: _, ...rest } = settings;
      return reply.send(rest);
    },
  });

  // ── PUT /api/settings ─────────────────────────────────────────────────────
  fastify.put('/api/settings', {
    preHandler: [requireAdmin],
    handler: async (request, reply) => {
      const body = request.body as Partial<{
        companyName: string;
        address: string;
        phone: string;
        email: string;
        licenseNumber: string;
        defaultOverheadPct: number;
        defaultProfitPct: number;
        defaultTaxPct: number;
        defaultBondPct: number;
        defaultLaborRate: number;
        defaultWasteFactorPct: number;
        currency: string;
        timezone: string;
        fiscalYearStartMonth: number;
        customUnitsJson: string;
        termsAndConditions: string;
        smtpHost: string;
        smtpPort: number;
        smtpSecure: boolean;
        smtpUser: string;
        smtpPass: string;
        smtpFrom: string;
      }>;

      const [existing] = await db.select().from(companySettings).limit(1);

      const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      const textFields = ['companyName', 'address', 'phone', 'email', 'licenseNumber', 'currency', 'timezone', 'customUnitsJson', 'termsAndConditions', 'smtpHost', 'smtpUser', 'smtpFrom'] as const;
      const numberFields = ['defaultOverheadPct', 'defaultProfitPct', 'defaultTaxPct', 'defaultBondPct', 'defaultLaborRate', 'defaultWasteFactorPct', 'smtpPort', 'fiscalYearStartMonth'] as const;

      for (const f of textFields) {
        if (f in body) updates[f] = (body as Record<string, unknown>)[f] ?? null;
      }
      for (const f of numberFields) {
        if (f in body) updates[f] = (body as Record<string, unknown>)[f];
      }
      if ('smtpSecure' in body) updates.smtpSecure = body.smtpSecure ?? false;

      // Encrypt SMTP password if provided
      if (body.smtpPass) {
        // Simple base64 obfuscation (in production use proper encryption with a key)
        updates.smtpPassEncrypted = Buffer.from(body.smtpPass).toString('base64');
      }

      let result;
      if (existing) {
        const [updated] = await db.update(companySettings).set(updates).where(eq(companySettings.id, existing.id)).returning();
        result = updated;
      } else {
        const [created] = await db.insert(companySettings).values(updates as never).returning();
        result = created;
      }

      const { smtpPassEncrypted: _, ...rest } = result;
      return reply.send(rest);
    },
  });

  // ── POST /api/settings/logo ───────────────────────────────────────────────
  fastify.post('/api/settings/logo', {
    preHandler: [requireAdmin],
    handler: async (request, reply) => {
      const data = await request.file();
      if (!data) return reply.status(400).send({ error: 'No file uploaded', code: 'VALIDATION_ERROR' });

      const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp'];
      if (!allowed.includes(data.mimetype)) {
        return reply.status(400).send({ error: 'File must be an image (PNG, JPEG, GIF, SVG, WEBP)', code: 'VALIDATION_ERROR' });
      }

      const chunks: Buffer[] = [];
      for await (const chunk of data.file) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);

      const saved = await saveUploadedFile(buffer, data.filename || 'logo', data.mimetype);

      const [existing] = await db.select().from(companySettings).limit(1);
      const now = new Date().toISOString();

      if (existing) {
        await db.update(companySettings).set({ logoUrl: saved.url, updatedAt: now }).where(eq(companySettings.id, existing.id));
      } else {
        await db.insert(companySettings).values({ companyName: 'My Company', logoUrl: saved.url, updatedAt: now });
      }

      return reply.send({ logoUrl: saved.url });
    },
  });

  // ── POST /api/settings/smtp/test ──────────────────────────────────────────
  fastify.post('/api/settings/smtp/test', {
    preHandler: [requireAdmin],
    handler: async (request, reply) => {
      try {
        await sendEmail({
          to: request.user.email,
          subject: 'OpenEstimate SMTP Test',
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px">
              <h2>SMTP Test Email</h2>
              <p>This is a test email from OpenEstimate. Your SMTP configuration is working correctly.</p>
              <p>Sent to: ${request.user.email}</p>
              <p>Time: ${new Date().toISOString()}</p>
            </div>
          `,
        });
        return reply.send({ success: true, message: `Test email sent to ${request.user.email}` });
      } catch (err) {
        return reply.status(500).send({ error: `SMTP test failed: ${(err as Error).message}`, code: 'SMTP_ERROR' });
      }
    },
  });

  // ── GET /api/users ────────────────────────────────────────────────────────
  fastify.get('/api/users', {
    preHandler: [requireAdmin],
    handler: async (_request, reply) => {
      const rows = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          isActive: users.isActive,
          lastLogin: users.lastLogin,
          createdAt: users.createdAt,
        })
        .from(users);

      return reply.send(rows);
    },
  });

  // ── POST /api/users/invite ────────────────────────────────────────────────
  fastify.post('/api/users/invite', {
    preHandler: [requireAdmin],
    handler: async (request, reply) => {
      const body = request.body as { name: string; email: string; role?: 'admin' | 'estimator' | 'viewer' };

      if (!body.name || !body.email) {
        return reply.status(400).send({ error: 'name and email are required', code: 'VALIDATION_ERROR' });
      }

      const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email)).limit(1);
      if (existing) return reply.status(409).send({ error: 'A user with this email already exists', code: 'CONFLICT' });

      // Generate temporary password
      const tempPassword = randomBytes(8).toString('hex');
      const passwordHash = await bcrypt.hash(tempPassword, 12);

      const now = new Date().toISOString();
      const [user] = await db.insert(users).values({
        name: body.name,
        email: body.email,
        passwordHash,
        role: body.role ?? 'estimator',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      }).returning();

      // Send invite email (non-blocking)
      const { sendInviteEmail } = await import('../services/notifications/email');
      sendInviteEmail(user as never, tempPassword).catch((err) => {
        fastify.log.warn(`Invite email failed: ${(err as Error).message}`);
      });

      const { passwordHash: _ph, resetToken: _rt, resetTokenExpiry: _rte, ...safeUser } = user;
      return reply.status(201).send(safeUser);
    },
  });

  // ── PUT /api/users/:id ────────────────────────────────────────────────────
  fastify.put('/api/users/:id', {
    preHandler: [requireAdmin],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const userId = parseInt(id, 10);
      if (isNaN(userId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) return reply.status(404).send({ error: 'User not found', code: 'NOT_FOUND' });

      const body = request.body as Partial<{
        name: string;
        email: string;
        role: 'admin' | 'estimator' | 'viewer';
        isActive: boolean;
      }>;

      const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (body.name !== undefined) updates.name = body.name;
      if (body.email !== undefined) {
        const [dupe] = await db.select({ id: users.id }).from(users).where(and(eq(users.email, body.email), ne(users.id, userId))).limit(1);
        if (dupe) return reply.status(409).send({ error: 'Email already in use by another user', code: 'CONFLICT' });
        updates.email = body.email;
      }
      if (body.role !== undefined) updates.role = body.role;
      if (body.isActive !== undefined) updates.isActive = body.isActive;

      const [updated] = await db.update(users).set(updates).where(eq(users.id, userId)).returning();
      const { passwordHash: _ph, resetToken: _rt, resetTokenExpiry: _rte, ...safeUser } = updated;
      return reply.send(safeUser);
    },
  });

  // ── DELETE /api/users/:id ─────────────────────────────────────────────────
  fastify.delete('/api/users/:id', {
    preHandler: [requireAdmin],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const userId = parseInt(id, 10);
      if (isNaN(userId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

      if (userId === request.user.id) {
        return reply.status(400).send({ error: 'You cannot deactivate your own account', code: 'INVALID_OPERATION' });
      }

      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) return reply.status(404).send({ error: 'User not found', code: 'NOT_FOUND' });

      // Deactivate rather than hard-delete to preserve referential integrity
      const [updated] = await db
        .update(users)
        .set({ isActive: false, updatedAt: new Date().toISOString() })
        .where(eq(users.id, userId))
        .returning();

      // Invalidate all sessions
      await db.delete(sessions).where(eq(sessions.userId, userId));

      const { passwordHash: _ph, resetToken: _rt, resetTokenExpiry: _rte, ...safeUser } = updated;
      return reply.send({ ...safeUser, deactivated: true });
    },
  });
}
