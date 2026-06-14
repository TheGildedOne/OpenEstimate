import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import { db } from './db/index';
import { companySettings } from './db/schema';

// Route imports
import authRoutes from './routes/auth';
import projectRoutes from './routes/projects';
import estimateRoutes from './routes/estimates';
import costDatabaseRoutes from './routes/costDatabase';
import takeoffRoutes from './routes/takeoff';
import subcontractorRoutes from './routes/subcontractors';
import changeOrderRoutes from './routes/changeOrders';
import templateRoutes from './routes/templates';
import documentRoutes from './routes/documents';
import exportRoutes from './routes/export';
import clientPortalRoutes from './routes/clientPortal';
import notificationRoutes from './routes/notifications';
import reportRoutes from './routes/reports';
import settingsRoutes from './routes/settings';

import { startScheduler } from './services/notifications/scheduler';

const app = Fastify({
  logger:
    config.NODE_ENV === 'development'
      ? { level: 'info', transport: { target: 'pino-pretty' } }
      : { level: 'warn' },
  trustProxy: true,
});

async function bootstrap() {
  // ── Plugins ───────────────────────────────────────────────────────────────
  await app.register(fastifyCors, {
    origin: [config.CLIENT_URL],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.register(fastifyCookie, {
    secret: config.JWT_REFRESH_SECRET,
  });

  await app.register(fastifyJwt, {
    secret: config.JWT_ACCESS_SECRET,
    sign: { expiresIn: config.JWT_ACCESS_TTL },
  });

  await app.register(fastifyMultipart, {
    limits: {
      fileSize: config.MAX_FILE_SIZE,
      files: 10,
    },
  });

  // ── Static Files (serve built client in production) ───────────────────────
  const clientDistPath = path.join(__dirname, 'public');
  if (fs.existsSync(clientDistPath)) {
    await app.register(fastifyStatic, {
      root: clientDistPath,
      prefix: '/',
      decorateReply: false,
    });
  }

  // ── Health Check ──────────────────────────────────────────────────────────
  app.get('/health', async () => ({
    status: 'ok',
    version: process.env.npm_package_version ?? '1.0.0',
    timestamp: new Date().toISOString(),
  }));

  // ── API Routes ─────────────────────────────────────────────────────────────
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(projectRoutes, { prefix: '/api' });
  await app.register(estimateRoutes, { prefix: '/api' });
  await app.register(costDatabaseRoutes, { prefix: '/api/cost-db' });
  await app.register(takeoffRoutes, { prefix: '/api' });
  await app.register(subcontractorRoutes, { prefix: '/api' });
  await app.register(changeOrderRoutes, { prefix: '/api' });
  await app.register(templateRoutes, { prefix: '/api/templates' });
  await app.register(documentRoutes, { prefix: '/api' });
  await app.register(exportRoutes, { prefix: '/api' });
  await app.register(clientPortalRoutes, { prefix: '/api' });
  await app.register(notificationRoutes, { prefix: '/api/notifications' });
  await app.register(reportRoutes, { prefix: '/api/reports' });
  await app.register(settingsRoutes, { prefix: '/api' });

  // ── SPA Fallback (catch all non-API routes) ────────────────────────────────
  if (fs.existsSync(clientDistPath)) {
    app.setNotFoundHandler(async (request, reply) => {
      if (!request.url.startsWith('/api') && !request.url.startsWith('/health')) {
        return reply.sendFile('index.html');
      }
      return reply.status(404).send({ error: 'Not found', code: 'NOT_FOUND' });
    });
  }

  // ── Global Error Handler ───────────────────────────────────────────────────
  app.setErrorHandler((error, request, reply) => {
    app.log.error({ err: error, url: request.url }, 'Unhandled error');

    if (error.validation) {
      return reply.status(400).send({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: error.validation,
      });
    }

    if (error.statusCode) {
      return reply.status(error.statusCode).send({
        error: error.message,
        code: 'HTTP_ERROR',
      });
    }

    return reply.status(500).send({
      error: config.NODE_ENV === 'production' ? 'Internal server error' : error.message,
      code: 'INTERNAL_ERROR',
    });
  });

  // ── Ensure company settings row exists ────────────────────────────────────
  const existing = db.select().from(companySettings).limit(1).all();
  if (existing.length === 0) {
    db.insert(companySettings).values({ companyName: 'My Company' }).run();
  }

  // ── Start notification scheduler ──────────────────────────────────────────
  if (config.NODE_ENV !== 'test') {
    startScheduler();
  }

  // ── Start server ──────────────────────────────────────────────────────────
  await app.listen({ port: config.PORT, host: config.HOST });
  app.log.info(`OpenEstimate server running on port ${config.PORT}`);
}

bootstrap().catch((err) => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});

export { app };
