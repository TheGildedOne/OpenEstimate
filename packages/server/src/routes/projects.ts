import type { FastifyInstance } from 'fastify';
import { db } from '../db/index';
import {
  projects,
  estimates,
  estimateSections,
  estimateLineItems,
  projectActivityLog,
  projectNotes,
  users,
} from '../db/schema';
import { eq, and, like, or, desc, asc, sql, inArray } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { requireEstimatorOrAbove } from '../middleware/rbac';

// ─── helpers ──────────────────────────────────────────────────────────────────

async function logActivity(
  projectId: number,
  userId: number,
  action: string,
  detail?: string
) {
  await db.insert(projectActivityLog).values({
    projectId,
    userId,
    action,
    detail: detail ?? null,
    timestamp: new Date().toISOString(),
  });
}

async function getProjectOrFail(
  id: number,
  reply: Parameters<Parameters<FastifyInstance['get']>[1]>[1]
) {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);

  if (!project) {
    reply.status(404).send({ error: 'Project not found', code: 'NOT_FOUND' });
    return null;
  }
  return project;
}

// ─── plugin ───────────────────────────────────────────────────────────────────

export default async function projectRoutes(fastify: FastifyInstance) {
  // All project routes require authentication
  fastify.addHook('preHandler', authenticate);

  // ── GET /api/dashboard ─────────────────────────────────────────────────────
  fastify.get('/api/dashboard', async (_request, reply) => {
    const now = new Date().toISOString();
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Project counts by status
    const allProjects = await db.select({ id: projects.id, status: projects.status }).from(projects);

    const counts: Record<string, number> = {};
    for (const p of allProjects) {
      counts[p.status] = (counts[p.status] ?? 0) + 1;
    }

    // Active bids (bidding + submitted)
    const activeBidProjects = await db
      .select({
        id: projects.id,
        name: projects.name,
        clientName: projects.clientName,
        status: projects.status,
        bidDueDate: projects.bidDueDate,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .where(
        sql`${projects.status} IN ('bidding', 'submitted')`
      )
      .orderBy(asc(projects.bidDueDate))
      .limit(10);

    // Enrich with active estimate totals
    const activeBids = await Promise.all(
      activeBidProjects.map(async (p) => {
        const [activeEst] = await db
          .select({ id: estimates.id, overheadPct: estimates.overheadPct, profitPct: estimates.profitPct, taxPct: estimates.taxPct, bondPct: estimates.bondPct })
          .from(estimates)
          .where(and(eq(estimates.projectId, p.id), eq(estimates.isActive, true)))
          .limit(1);

        let estimateTotal: number | null = null;
        if (activeEst) {
          const lineItems = await db
            .select({
              quantity: estimateLineItems.quantity,
              unitMaterialCost: estimateLineItems.unitMaterialCost,
              unitLaborCost: estimateLineItems.unitLaborCost,
              laborHours: estimateLineItems.laborHours,
              laborRate: estimateLineItems.laborRate,
              wasteFactorPct: estimateLineItems.wasteFactorPct,
            })
            .from(estimateLineItems)
            .where(eq(estimateLineItems.estimateId, activeEst.id));

          let subtotal = 0;
          for (const li of lineItems) {
            const wasteFactor = 1 + li.wasteFactorPct / 100;
            const mat = li.quantity * li.unitMaterialCost * wasteFactor;
            const lab = li.quantity * (li.unitLaborCost + li.laborHours * li.laborRate);
            subtotal += mat + lab;
          }

          const overhead = subtotal * (activeEst.overheadPct / 100);
          const profit = (subtotal + overhead) * (activeEst.profitPct / 100);
          const preTax = subtotal + overhead + profit;
          const tax = preTax * (activeEst.taxPct / 100);
          const bond = (preTax + tax) * (activeEst.bondPct / 100);
          estimateTotal = Math.round((preTax + tax + bond) * 100) / 100;
        }

        return { ...p, activeEstimateId: activeEst?.id ?? null, estimateTotal };
      })
    );

    // Recent activity
    const recentActivity = await db
      .select({
        id: projectActivityLog.id,
        projectId: projectActivityLog.projectId,
        action: projectActivityLog.action,
        detail: projectActivityLog.detail,
        timestamp: projectActivityLog.timestamp,
        projectName: projects.name,
        userName: users.name,
      })
      .from(projectActivityLog)
      .leftJoin(projects, eq(projectActivityLog.projectId, projects.id))
      .leftJoin(users, eq(projectActivityLog.userId, users.id))
      .where(sql`${projectActivityLog.timestamp} > ${thirtyDaysAgo}`)
      .orderBy(desc(projectActivityLog.timestamp))
      .limit(20);

    // Upcoming deadlines
    const upcomingDeadlines = await db
      .select({
        id: projects.id,
        name: projects.name,
        clientName: projects.clientName,
        bidDueDate: projects.bidDueDate,
        status: projects.status,
      })
      .from(projects)
      .where(
        and(
          sql`${projects.bidDueDate} IS NOT NULL`,
          sql`${projects.bidDueDate} > ${now}`,
          sql`${projects.bidDueDate} <= ${thirtyDaysFromNow}`,
          sql`${projects.status} IN ('draft', 'bidding')`
        )
      )
      .orderBy(asc(projects.bidDueDate))
      .limit(10);

    // Win rate (last 90 days)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const closedProjects = allProjects.filter(
      (p) => p.status === 'won' || p.status === 'lost'
    );
    const wonCount = closedProjects.filter((p) => p.status === 'won').length;
    const winRate = closedProjects.length > 0 ? Math.round((wonCount / closedProjects.length) * 100) : 0;

    return reply.send({
      data: {
        kpi: {
          totalProjects: allProjects.length,
          activeBids: (counts['bidding'] ?? 0) + (counts['submitted'] ?? 0),
          wonProjects: counts['won'] ?? 0,
          draftProjects: counts['draft'] ?? 0,
          winRate,
        },
        activeBids,
        recentActivity,
        upcomingDeadlines,
      },
    });
  });

  // ── GET /api/projects ──────────────────────────────────────────────────────
  fastify.get('/api/projects', async (request, reply) => {
    const query = request.query as {
      status?: string;
      search?: string;
      page?: string;
      pageSize?: string;
      sortBy?: string;
      sortDir?: string;
    };

    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? '20', 10)));
    const offset = (page - 1) * pageSize;
    const sortDir = query.sortDir === 'asc' ? 'asc' : 'desc';

    const validSortCols: Record<string, Parameters<typeof asc>[0]> = {
      name: projects.name,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      bidDueDate: projects.bidDueDate,
      clientName: projects.clientName,
    };
    const sortCol = validSortCols[query.sortBy ?? 'updatedAt'] ?? projects.updatedAt;

    // Build WHERE conditions
    const conditions = [];
    if (query.status) conditions.push(eq(projects.status, query.status as any));
    if (query.search) {
      const pattern = `%${query.search}%`;
      conditions.push(
        or(like(projects.name, pattern), like(projects.clientName, pattern), like(projects.siteAddress as any, pattern))
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Count
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)` })
      .from(projects)
      .where(whereClause);

    // Fetch page
    const rows = await db
      .select({
        id: projects.id,
        name: projects.name,
        clientName: projects.clientName,
        clientEmail: projects.clientEmail,
        clientPhone: projects.clientPhone,
        siteAddress: projects.siteAddress,
        status: projects.status,
        bidDueDate: projects.bidDueDate,
        startDate: projects.startDate,
        endDate: projects.endDate,
        createdBy: projects.createdBy,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
        createdByName: users.name,
      })
      .from(projects)
      .leftJoin(users, eq(projects.createdBy, users.id))
      .where(whereClause)
      .orderBy(sortDir === 'asc' ? asc(sortCol) : desc(sortCol))
      .limit(pageSize)
      .offset(offset);

    // Attach active estimate totals
    const enriched = await Promise.all(
      rows.map(async (p) => {
        const [activeEst] = await db
          .select({ id: estimates.id })
          .from(estimates)
          .where(and(eq(estimates.projectId, p.id), eq(estimates.isActive, true)))
          .limit(1);
        return { ...p, activeEstimateId: activeEst?.id ?? null };
      })
    );

    return reply.send({
      data: enriched,
      total: Number(total),
      page,
      pageSize,
      totalPages: Math.ceil(Number(total) / pageSize),
    });
  });

  // ── POST /api/projects ─────────────────────────────────────────────────────
  fastify.post('/api/projects', { preHandler: [requireEstimatorOrAbove] }, async (request, reply) => {
    const body = request.body as {
      name?: string;
      clientName?: string;
      clientEmail?: string;
      clientPhone?: string;
      siteAddress?: string;
      description?: string;
      status?: string;
      bidDueDate?: string;
      startDate?: string;
      endDate?: string;
    };

    if (!body.name?.trim() || !body.clientName?.trim()) {
      return reply.status(400).send({ error: 'name and clientName are required', code: 'VALIDATION_ERROR' });
    }

    const [project] = await db
      .insert(projects)
      .values({
        name: body.name.trim(),
        clientName: body.clientName.trim(),
        clientEmail: body.clientEmail ?? null,
        clientPhone: body.clientPhone ?? null,
        siteAddress: body.siteAddress ?? null,
        description: body.description ?? null,
        status: (body.status as any) ?? 'draft',
        bidDueDate: body.bidDueDate ?? null,
        startDate: body.startDate ?? null,
        endDate: body.endDate ?? null,
        createdBy: request.user.id,
      })
      .returning();

    await logActivity(project.id, request.user.id, 'project_created', `Project "${project.name}" created`);

    return reply.status(201).send({ data: project });
  });

  // ── GET /api/projects/:id ──────────────────────────────────────────────────
  fastify.get('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const projectId = parseInt(id, 10);
    if (isNaN(projectId)) return reply.status(400).send({ error: 'Invalid project id', code: 'VALIDATION_ERROR' });

    const [project] = await db
      .select({
        id: projects.id,
        name: projects.name,
        clientName: projects.clientName,
        clientEmail: projects.clientEmail,
        clientPhone: projects.clientPhone,
        siteAddress: projects.siteAddress,
        description: projects.description,
        status: projects.status,
        bidDueDate: projects.bidDueDate,
        startDate: projects.startDate,
        endDate: projects.endDate,
        createdBy: projects.createdBy,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
        createdByName: users.name,
      })
      .from(projects)
      .leftJoin(users, eq(projects.createdBy, users.id))
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) return reply.status(404).send({ error: 'Project not found', code: 'NOT_FOUND' });

    const projectEstimates = await db
      .select({ id: estimates.id, name: estimates.name, isActive: estimates.isActive, version: estimates.version, createdAt: estimates.createdAt })
      .from(estimates)
      .where(eq(estimates.projectId, projectId))
      .orderBy(desc(estimates.createdAt));

    return reply.send({ data: { ...project, estimates: projectEstimates } });
  });

  // ── PUT /api/projects/:id ──────────────────────────────────────────────────
  fastify.put('/api/projects/:id', { preHandler: [requireEstimatorOrAbove] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const projectId = parseInt(id, 10);
    if (isNaN(projectId)) return reply.status(400).send({ error: 'Invalid project id', code: 'VALIDATION_ERROR' });

    const project = await getProjectOrFail(projectId, reply);
    if (!project) return;

    const body = request.body as Partial<{
      name: string;
      clientName: string;
      clientEmail: string;
      clientPhone: string;
      siteAddress: string;
      description: string;
      status: string;
      bidDueDate: string;
      startDate: string;
      endDate: string;
    }>;

    const prevStatus = project.status;

    const [updated] = await db
      .update(projects)
      .set({
        ...body,
        updatedAt: new Date().toISOString(),
      } as any)
      .where(eq(projects.id, projectId))
      .returning();

    const detail: string[] = [];
    if (body.status && body.status !== prevStatus) detail.push(`status: ${prevStatus} → ${body.status}`);
    if (body.name && body.name !== project.name) detail.push(`name: "${project.name}" → "${body.name}"`);

    await logActivity(projectId, request.user.id, 'project_updated', detail.join(', ') || 'Project updated');

    return reply.send({ data: updated });
  });

  // ── DELETE /api/projects/:id ───────────────────────────────────────────────
  fastify.delete('/api/projects/:id', { preHandler: [requireEstimatorOrAbove] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const projectId = parseInt(id, 10);
    if (isNaN(projectId)) return reply.status(400).send({ error: 'Invalid project id', code: 'VALIDATION_ERROR' });

    const project = await getProjectOrFail(projectId, reply);
    if (!project) return;

    await db.delete(projects).where(eq(projects.id, projectId));

    return reply.send({ success: true });
  });

  // ── POST /api/projects/:id/duplicate ──────────────────────────────────────
  fastify.post('/api/projects/:id/duplicate', { preHandler: [requireEstimatorOrAbove] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const projectId = parseInt(id, 10);
    if (isNaN(projectId)) return reply.status(400).send({ error: 'Invalid project id', code: 'VALIDATION_ERROR' });

    const source = await getProjectOrFail(projectId, reply);
    if (!source) return;

    const body = request.body as { includeEstimates?: boolean; newName?: string };

    const [newProject] = await db
      .insert(projects)
      .values({
        name: body.newName ?? `${source.name} (Copy)`,
        clientName: source.clientName,
        clientEmail: source.clientEmail,
        clientPhone: source.clientPhone,
        siteAddress: source.siteAddress,
        description: source.description,
        status: 'draft',
        bidDueDate: source.bidDueDate,
        startDate: null,
        endDate: null,
        createdBy: request.user.id,
      })
      .returning();

    if (body.includeEstimates !== false) {
      const sourceEstimates = await db.select().from(estimates).where(eq(estimates.projectId, projectId));

      for (const est of sourceEstimates) {
        const [newEst] = await db
          .insert(estimates)
          .values({
            projectId: newProject.id,
            name: est.name,
            version: 1,
            isActive: est.isActive,
            overheadPct: est.overheadPct,
            profitPct: est.profitPct,
            taxPct: est.taxPct,
            bondPct: est.bondPct,
            notes: est.notes,
            createdBy: request.user.id,
          })
          .returning();

        const sections = await db.select().from(estimateSections).where(eq(estimateSections.estimateId, est.id));

        for (const sec of sections) {
          const [newSec] = await db
            .insert(estimateSections)
            .values({ estimateId: newEst.id, name: sec.name, sortOrder: sec.sortOrder, color: sec.color })
            .returning();

          const lineItems = await db.select().from(estimateLineItems).where(eq(estimateLineItems.sectionId, sec.id));

          for (const li of lineItems) {
            await db.insert(estimateLineItems).values({
              sectionId: newSec.id,
              estimateId: newEst.id,
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
              parentItemId: null, // Reset parent relationships
            });
          }
        }
      }
    }

    await logActivity(newProject.id, request.user.id, 'project_created', `Duplicated from project ${projectId}`);

    return reply.status(201).send({ data: newProject });
  });

  // ── POST /api/projects/:id/archive ────────────────────────────────────────
  fastify.post('/api/projects/:id/archive', { preHandler: [requireEstimatorOrAbove] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const projectId = parseInt(id, 10);
    if (isNaN(projectId)) return reply.status(400).send({ error: 'Invalid project id', code: 'VALIDATION_ERROR' });

    const project = await getProjectOrFail(projectId, reply);
    if (!project) return;

    if (project.status === 'archived') {
      return reply.status(400).send({ error: 'Project is already archived', code: 'ALREADY_ARCHIVED' });
    }

    const [updated] = await db
      .update(projects)
      .set({ status: 'archived', updatedAt: new Date().toISOString() })
      .where(eq(projects.id, projectId))
      .returning();

    await logActivity(projectId, request.user.id, 'status_changed', `Archived (was ${project.status})`);

    return reply.send({ data: updated });
  });

  // ── POST /api/projects/:id/restore ────────────────────────────────────────
  fastify.post('/api/projects/:id/restore', { preHandler: [requireEstimatorOrAbove] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const projectId = parseInt(id, 10);
    if (isNaN(projectId)) return reply.status(400).send({ error: 'Invalid project id', code: 'VALIDATION_ERROR' });

    const project = await getProjectOrFail(projectId, reply);
    if (!project) return;

    if (project.status !== 'archived') {
      return reply.status(400).send({ error: 'Project is not archived', code: 'NOT_ARCHIVED' });
    }

    const [updated] = await db
      .update(projects)
      .set({ status: 'draft', updatedAt: new Date().toISOString() })
      .where(eq(projects.id, projectId))
      .returning();

    await logActivity(projectId, request.user.id, 'status_changed', 'Restored from archived to draft');

    return reply.send({ data: updated });
  });

  // ── GET /api/projects/:id/activity ────────────────────────────────────────
  fastify.get('/api/projects/:id/activity', async (request, reply) => {
    const { id } = request.params as { id: string };
    const projectId = parseInt(id, 10);
    if (isNaN(projectId)) return reply.status(400).send({ error: 'Invalid project id', code: 'VALIDATION_ERROR' });

    const project = await getProjectOrFail(projectId, reply);
    if (!project) return;

    const query = request.query as { page?: string; pageSize?: string };
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? '50', 10)));
    const offset = (page - 1) * pageSize;

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)` })
      .from(projectActivityLog)
      .where(eq(projectActivityLog.projectId, projectId));

    const rows = await db
      .select({
        id: projectActivityLog.id,
        action: projectActivityLog.action,
        detail: projectActivityLog.detail,
        timestamp: projectActivityLog.timestamp,
        userId: projectActivityLog.userId,
        userName: users.name,
      })
      .from(projectActivityLog)
      .leftJoin(users, eq(projectActivityLog.userId, users.id))
      .where(eq(projectActivityLog.projectId, projectId))
      .orderBy(desc(projectActivityLog.timestamp))
      .limit(pageSize)
      .offset(offset);

    return reply.send({
      data: rows,
      total: Number(total),
      page,
      pageSize,
      totalPages: Math.ceil(Number(total) / pageSize),
    });
  });

  // ── POST /api/projects/:id/notes ──────────────────────────────────────────
  fastify.post('/api/projects/:id/notes', { preHandler: [requireEstimatorOrAbove] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const projectId = parseInt(id, 10);
    if (isNaN(projectId)) return reply.status(400).send({ error: 'Invalid project id', code: 'VALIDATION_ERROR' });

    const project = await getProjectOrFail(projectId, reply);
    if (!project) return;

    const { body: noteBody } = request.body as { body?: string };

    if (!noteBody?.trim()) {
      return reply.status(400).send({ error: 'Note body is required', code: 'VALIDATION_ERROR' });
    }

    const [note] = await db
      .insert(projectNotes)
      .values({ projectId, body: noteBody.trim(), createdBy: request.user.id })
      .returning();

    await logActivity(projectId, request.user.id, 'note_added', 'Note added');

    return reply.status(201).send({ data: note });
  });

  // ── GET /api/projects/:id/notes ───────────────────────────────────────────
  fastify.get('/api/projects/:id/notes', async (request, reply) => {
    const { id } = request.params as { id: string };
    const projectId = parseInt(id, 10);
    if (isNaN(projectId)) return reply.status(400).send({ error: 'Invalid project id', code: 'VALIDATION_ERROR' });

    const project = await getProjectOrFail(projectId, reply);
    if (!project) return;

    const notes = await db
      .select({
        id: projectNotes.id,
        projectId: projectNotes.projectId,
        body: projectNotes.body,
        createdBy: projectNotes.createdBy,
        createdAt: projectNotes.createdAt,
        createdByName: users.name,
      })
      .from(projectNotes)
      .leftJoin(users, eq(projectNotes.createdBy, users.id))
      .where(eq(projectNotes.projectId, projectId))
      .orderBy(desc(projectNotes.createdAt));

    return reply.send({ data: notes });
  });

  // ── DELETE /api/projects/:id/notes/:noteId ────────────────────────────────
  fastify.delete('/api/projects/:id/notes/:noteId', { preHandler: [requireEstimatorOrAbove] }, async (request, reply) => {
    const { id, noteId } = request.params as { id: string; noteId: string };
    const projectId = parseInt(id, 10);
    const noteIdNum = parseInt(noteId, 10);

    if (isNaN(projectId) || isNaN(noteIdNum)) {
      return reply.status(400).send({ error: 'Invalid id', code: 'VALIDATION_ERROR' });
    }

    const [note] = await db
      .select()
      .from(projectNotes)
      .where(and(eq(projectNotes.id, noteIdNum), eq(projectNotes.projectId, projectId)))
      .limit(1);

    if (!note) return reply.status(404).send({ error: 'Note not found', code: 'NOT_FOUND' });

    // Only the author or an admin can delete
    if (note.createdBy !== request.user.id && request.user.role !== 'admin') {
      return reply.status(403).send({ error: 'Cannot delete another user\'s note', code: 'FORBIDDEN' });
    }

    await db.delete(projectNotes).where(eq(projectNotes.id, noteIdNum));
    await logActivity(projectId, request.user.id, 'note_deleted', `Note ${noteIdNum} deleted`);

    return reply.send({ success: true });
  });
}
