import type { FastifyInstance } from 'fastify';
import { db } from '../db/index';
import { projectDocuments, projects } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { requireEstimatorOrAbove } from '../middleware/rbac';
import { getStorage, saveUploadedFile } from '../services/storage';

export default async function documentRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // ── POST /api/projects/:projectId/documents ───────────────────────────────
  fastify.post('/api/projects/:projectId/documents', {
    preHandler: [requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const { projectId } = request.params as { projectId: string };
      const pid = parseInt(projectId, 10);
      if (isNaN(pid)) return reply.status(400).send({ error: 'Invalid projectId', code: 'VALIDATION_ERROR' });

      const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, pid)).limit(1);
      if (!project) return reply.status(404).send({ error: 'Project not found', code: 'NOT_FOUND' });

      const data = await request.file();
      if (!data) return reply.status(400).send({ error: 'No file uploaded', code: 'VALIDATION_ERROR' });

      // Read file into buffer
      const chunks: Buffer[] = [];
      for await (const chunk of data.file) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      if (buffer.length === 0) {
        return reply.status(400).send({ error: 'Uploaded file is empty', code: 'VALIDATION_ERROR' });
      }

      const label = (data.fields as Record<string, { value: string }>)?.label?.value ?? null;
      const mimeType = data.mimetype || 'application/octet-stream';
      const originalName = data.filename || 'upload';

      const saved = await saveUploadedFile(buffer, originalName, mimeType);

      const [doc] = await db.insert(projectDocuments).values({
        projectId: pid,
        filename: saved.filename,
        originalName,
        mimeType,
        sizeBytes: buffer.length,
        uploadedBy: request.user.id,
        label: label ?? null,
        uploadedAt: new Date().toISOString(),
      }).returning();

      return reply.status(201).send({ ...doc, url: saved.url });
    },
  });

  // ── GET /api/projects/:projectId/documents ────────────────────────────────
  fastify.get('/api/projects/:projectId/documents', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const pid = parseInt(projectId, 10);
    if (isNaN(pid)) return reply.status(400).send({ error: 'Invalid projectId', code: 'VALIDATION_ERROR' });

    const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, pid)).limit(1);
    if (!project) return reply.status(404).send({ error: 'Project not found', code: 'NOT_FOUND' });

    const docs = await db
      .select()
      .from(projectDocuments)
      .where(eq(projectDocuments.projectId, pid))
      .orderBy(desc(projectDocuments.uploadedAt));

    return reply.send(docs);
  });

  // ── GET /api/documents/:id ────────────────────────────────────────────────
  fastify.get('/api/documents/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const docId = parseInt(id, 10);
    if (isNaN(docId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

    const [doc] = await db.select().from(projectDocuments).where(eq(projectDocuments.id, docId)).limit(1);
    if (!doc) return reply.status(404).send({ error: 'Document not found', code: 'NOT_FOUND' });

    return reply.send(doc);
  });

  // ── GET /api/documents/:id/download ──────────────────────────────────────
  fastify.get('/api/documents/:id/download', async (request, reply) => {
    const { id } = request.params as { id: string };
    const docId = parseInt(id, 10);
    if (isNaN(docId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

    const [doc] = await db.select().from(projectDocuments).where(eq(projectDocuments.id, docId)).limit(1);
    if (!doc) return reply.status(404).send({ error: 'Document not found', code: 'NOT_FOUND' });

    try {
      const storage = getStorage();
      const buffer = await storage.read(doc.filename);

      reply.header('Content-Type', doc.mimeType);
      reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.originalName)}"`);
      reply.header('Content-Length', buffer.length);

      return reply.send(buffer);
    } catch {
      return reply.status(404).send({ error: 'File not found in storage', code: 'STORAGE_ERROR' });
    }
  });

  // ── DELETE /api/documents/:id ─────────────────────────────────────────────
  fastify.delete('/api/documents/:id', {
    preHandler: [requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const docId = parseInt(id, 10);
      if (isNaN(docId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

      const [doc] = await db.select().from(projectDocuments).where(eq(projectDocuments.id, docId)).limit(1);
      if (!doc) return reply.status(404).send({ error: 'Document not found', code: 'NOT_FOUND' });

      // Best-effort delete from storage
      try {
        const storage = getStorage();
        await storage.delete(doc.filename);
      } catch (err) {
        fastify.log.warn(`Could not delete file from storage: ${doc.filename} – ${(err as Error).message}`);
      }

      await db.delete(projectDocuments).where(eq(projectDocuments.id, docId));
      return reply.status(204).send();
    },
  });

  // ── PUT /api/documents/:id/label ──────────────────────────────────────────
  fastify.put('/api/documents/:id/label', {
    preHandler: [requireEstimatorOrAbove],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const docId = parseInt(id, 10);
      if (isNaN(docId)) return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });

      const [doc] = await db.select().from(projectDocuments).where(eq(projectDocuments.id, docId)).limit(1);
      if (!doc) return reply.status(404).send({ error: 'Document not found', code: 'NOT_FOUND' });

      const body = request.body as { label: string | null };
      const [updated] = await db
        .update(projectDocuments)
        .set({ label: body.label ?? null })
        .where(eq(projectDocuments.id, docId))
        .returning();

      return reply.send(updated);
    },
  });
}
