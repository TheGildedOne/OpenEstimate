import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../db/index';
import { users, sessions } from '../db/schema';
import { eq, and, gt } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { config } from '../config';
import nodemailer from 'nodemailer';

// ─── helpers ──────────────────────────────────────────────────────────────────

function sha256(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function makeRefreshToken(): string {
  return crypto.randomBytes(64).toString('hex');
}

function makeResetToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function expiresAt(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function safeUser(u: {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean | number;
  createdAt: string;
  lastLogin: string | null;
}) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: Boolean(u.isActive),
    createdAt: u.createdAt,
    lastLogin: u.lastLogin,
  };
}

// ─── plugin ───────────────────────────────────────────────────────────────────

export default async function authRoutes(fastify: FastifyInstance) {
  // ── POST /api/auth/login ───────────────────────────────────────────────────
  fastify.post('/api/auth/login', async (request, reply) => {
    const { email, password, rememberMe } = request.body as {
      email?: string;
      password?: string;
      rememberMe?: boolean;
    };

    if (!email || !password) {
      return reply.status(400).send({ error: 'email and password are required', code: 'VALIDATION_ERROR' });
    }

    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);

    if (!user || !user.isActive) {
      return reply.status(401).send({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    }

    // Update last login
    await db.update(users).set({ lastLogin: new Date().toISOString() }).where(eq(users.id, user.id));

    // Sign access token
    const accessToken = fastify.jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      { expiresIn: config.JWT_ACCESS_TTL }
    );

    // Refresh token
    const refreshTTL = rememberMe ? config.JWT_REFRESH_TTL : 86400; // 30 days or 1 day
    const rawRefresh = makeRefreshToken();
    const tokenHash = sha256(rawRefresh);

    await db.insert(sessions).values({
      userId: user.id,
      tokenHash,
      expiresAt: expiresAt(refreshTTL),
      userAgent: request.headers['user-agent'] ?? null,
      ipAddress: request.ip,
    });

    reply.setCookie('refreshToken', rawRefresh, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: refreshTTL,
    });

    return reply.send({ accessToken, user: safeUser(user) });
  });

  // ── POST /api/auth/refresh ─────────────────────────────────────────────────
  fastify.post('/api/auth/refresh', async (request, reply) => {
    const rawToken = (request.cookies as Record<string, string | undefined>)?.refreshToken;

    if (!rawToken) {
      return reply.status(401).send({ error: 'Refresh token missing', code: 'UNAUTHORIZED' });
    }

    const tokenHash = sha256(rawToken);
    const now = new Date().toISOString();

    const [session] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
      .limit(1);

    if (!session) {
      return reply.status(401).send({ error: 'Refresh token invalid or expired', code: 'UNAUTHORIZED' });
    }

    const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);

    if (!user || !user.isActive) {
      return reply.status(401).send({ error: 'User not found or inactive', code: 'UNAUTHORIZED' });
    }

    // Rotate refresh token (security best practice)
    const newRawRefresh = makeRefreshToken();
    const newTokenHash = sha256(newRawRefresh);
    const ttl = config.JWT_REFRESH_TTL;

    await db.delete(sessions).where(eq(sessions.id, session.id));
    await db.insert(sessions).values({
      userId: user.id,
      tokenHash: newTokenHash,
      expiresAt: expiresAt(ttl),
      userAgent: request.headers['user-agent'] ?? null,
      ipAddress: request.ip,
    });

    const accessToken = fastify.jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      { expiresIn: config.JWT_ACCESS_TTL }
    );

    reply.setCookie('refreshToken', newRawRefresh, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: ttl,
    });

    return reply.send({ accessToken, user: safeUser(user) });
  });

  // ── POST /api/auth/logout ──────────────────────────────────────────────────
  fastify.post('/api/auth/logout', async (request, reply) => {
    const rawToken = (request.cookies as Record<string, string | undefined>)?.refreshToken;

    if (rawToken) {
      const tokenHash = sha256(rawToken);
      await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    }

    reply.clearCookie('refreshToken', { path: '/api/auth' });
    return reply.send({ success: true });
  });

  // ── POST /api/auth/forgot-password ────────────────────────────────────────
  fastify.post('/api/auth/forgot-password', async (request, reply) => {
    const { email } = request.body as { email?: string };

    if (!email) {
      return reply.status(400).send({ error: 'email is required', code: 'VALIDATION_ERROR' });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    // Always return 200 to avoid user enumeration
    if (!user) {
      return reply.send({ success: true });
    }

    const resetToken = makeResetToken();
    const expiry = expiresAt(3600); // 1 hour

    await db
      .update(users)
      .set({ resetToken, resetTokenExpiry: expiry })
      .where(eq(users.id, user.id));

    // Send email only when SMTP is configured
    if (config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS) {
      try {
        const transporter = nodemailer.createTransport({
          host: config.SMTP_HOST,
          port: config.SMTP_PORT,
          secure: config.SMTP_SECURE,
          auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
        });

        const resetUrl = `${config.CLIENT_URL}/reset-password?token=${resetToken}`;

        await transporter.sendMail({
          from: config.SMTP_FROM ?? config.SMTP_USER,
          to: user.email,
          subject: 'OpenEstimate – Password Reset',
          html: `
            <p>Hi ${user.name},</p>
            <p>You requested a password reset. Click the link below to set a new password:</p>
            <p><a href="${resetUrl}">${resetUrl}</a></p>
            <p>This link expires in 1 hour. If you didn't request this, please ignore this email.</p>
          `,
        });
      } catch (err) {
        fastify.log.error({ err }, 'Failed to send password reset email');
      }
    }

    return reply.send({ success: true });
  });

  // ── POST /api/auth/reset-password ─────────────────────────────────────────
  fastify.post('/api/auth/reset-password', async (request, reply) => {
    const { token, newPassword } = request.body as { token?: string; newPassword?: string };

    if (!token || !newPassword || newPassword.length < 8) {
      return reply.status(400).send({ error: 'Valid token and newPassword (min 8 chars) required', code: 'VALIDATION_ERROR' });
    }

    const now = new Date().toISOString();

    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.resetToken, token), gt(users.resetTokenExpiry as any, now)))
      .limit(1);

    if (!user) {
      return reply.status(400).send({ error: 'Invalid or expired reset token', code: 'INVALID_TOKEN' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await db
      .update(users)
      .set({ passwordHash, resetToken: null, resetTokenExpiry: null })
      .where(eq(users.id, user.id));

    // Invalidate all active sessions
    await db.delete(sessions).where(eq(sessions.userId, user.id));

    return reply.send({ success: true });
  });

  // ── GET /api/auth/me ───────────────────────────────────────────────────────
  fastify.get('/api/auth/me', { preHandler: [authenticate] }, async (request, reply) => {
    const [user] = await db.select().from(users).where(eq(users.id, request.user.id)).limit(1);

    if (!user) {
      return reply.status(404).send({ error: 'User not found', code: 'NOT_FOUND' });
    }

    return reply.send({ data: safeUser(user) });
  });

  // ── PUT /api/auth/me ───────────────────────────────────────────────────────
  fastify.put('/api/auth/me', { preHandler: [authenticate] }, async (request, reply) => {
    const { name, email } = request.body as { name?: string; email?: string };

    if (!name && !email) {
      return reply.status(400).send({ error: 'Provide at least name or email', code: 'VALIDATION_ERROR' });
    }

    const updates: Partial<{ name: string; email: string; updatedAt: string }> = {
      updatedAt: new Date().toISOString(),
    };

    if (name) {
      if (name.length < 2 || name.length > 100) {
        return reply.status(400).send({ error: 'name must be 2-100 characters', code: 'VALIDATION_ERROR' });
      }
      updates.name = name;
    }

    if (email) {
      const normalised = email.toLowerCase();
      // Check for duplicate email
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, normalised))
        .limit(1);

      if (existing && existing.id !== request.user.id) {
        return reply.status(409).send({ error: 'Email already in use', code: 'CONFLICT' });
      }

      updates.email = normalised;
    }

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, request.user.id))
      .returning();

    return reply.send({ data: safeUser(updated) });
  });

  // ── PUT /api/auth/me/password ──────────────────────────────────────────────
  fastify.put('/api/auth/me/password', { preHandler: [authenticate] }, async (request, reply) => {
    const { currentPassword, newPassword } = request.body as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (!currentPassword || !newPassword) {
      return reply.status(400).send({ error: 'currentPassword and newPassword are required', code: 'VALIDATION_ERROR' });
    }

    if (newPassword.length < 8 || newPassword.length > 72) {
      return reply.status(400).send({ error: 'newPassword must be 8-72 characters', code: 'VALIDATION_ERROR' });
    }

    const [user] = await db.select().from(users).where(eq(users.id, request.user.id)).limit(1);

    if (!user) {
      return reply.status(404).send({ error: 'User not found', code: 'NOT_FOUND' });
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: 'Current password is incorrect', code: 'INVALID_CREDENTIALS' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date().toISOString() })
      .where(eq(users.id, user.id));

    // Invalidate other sessions so re-login is required on other devices
    const rawToken = (request.cookies as Record<string, string | undefined>)?.refreshToken;
    if (rawToken) {
      const currentHash = sha256(rawToken);
      // Delete all sessions for the user EXCEPT the current one
      const allSessions = await db
        .select()
        .from(sessions)
        .where(eq(sessions.userId, user.id));

      for (const s of allSessions) {
        if (s.tokenHash !== currentHash) {
          await db.delete(sessions).where(eq(sessions.id, s.id));
        }
      }
    }

    return reply.send({ success: true });
  });

  // ── GET /api/auth/sessions ─────────────────────────────────────────────────
  fastify.get('/api/auth/sessions', { preHandler: [authenticate] }, async (request, reply) => {
    const activeSessions = await db
      .select({
        id: sessions.id,
        expiresAt: sessions.expiresAt,
        userAgent: sessions.userAgent,
        ipAddress: sessions.ipAddress,
        createdAt: sessions.createdAt,
      })
      .from(sessions)
      .where(and(eq(sessions.userId, request.user.id), gt(sessions.expiresAt, new Date().toISOString())));

    // Identify current session by cookie
    const rawToken = (request.cookies as Record<string, string | undefined>)?.refreshToken;
    const currentHash = rawToken ? sha256(rawToken) : null;

    const currentSession = currentHash
      ? await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.tokenHash, currentHash)).limit(1)
      : [];

    const currentId = currentSession[0]?.id ?? null;

    const sessionList = activeSessions.map((s) => ({
      ...s,
      isCurrent: s.id === currentId,
    }));

    return reply.send({ data: sessionList });
  });

  // ── DELETE /api/auth/sessions/:id ─────────────────────────────────────────
  fastify.delete('/api/auth/sessions/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const sessionId = parseInt(id, 10);

    if (isNaN(sessionId)) {
      return reply.status(400).send({ error: 'Invalid session id', code: 'VALIDATION_ERROR' });
    }

    const [session] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, request.user.id)))
      .limit(1);

    if (!session) {
      return reply.status(404).send({ error: 'Session not found', code: 'NOT_FOUND' });
    }

    await db.delete(sessions).where(eq(sessions.id, sessionId));

    return reply.send({ success: true });
  });
}
