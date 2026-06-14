import type { FastifyInstance } from 'fastify';
import { db } from '../db/index';
import { costCategories, costItems, costItemPriceHistory, users } from '../db/schema';
import { eq, and, like, sql, desc, asc, isNull, or } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { requireEstimatorOrAbove, requireAdmin } from '../middleware/rbac';

// ─── helpers ──────────────────────────────────────────────────────────────────

interface CategoryNode {
  id: number;
  name: string;
  parentId: number | null;
  sortOrder: number;
  children: CategoryNode[];
}

function buildCategoryTree(
  categories: Array<{ id: number; name: string; parentId: number | null; sortOrder: number }>,
  parentId: number | null = null
): CategoryNode[] {
  return categories
    .filter((c) => c.parentId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => ({
      ...c,
      children: buildCategoryTree(categories, c.id),
    }));
}

// ─── CSV utilities ─────────────────────────────────────────────────────────

function escapeCSV(value: unknown): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): Array<Record<string, string>> {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? '';
    });
    rows.push(row);
  }

  return rows;
}

// ─── plugin ───────────────────────────────────────────────────────────────────

export default async function costDatabaseRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // ── GET /api/cost-db/categories ───────────────────────────────────────────
  fastify.get('/api/cost-db/categories', async (_request, reply) => {
    const allCategories = await db
      .select()
      .from(costCategories)
      .orderBy(asc(costCategories.sortOrder), asc(costCategories.name));

    const tree = buildCategoryTree(allCategories);
    return reply.send({ data: tree });
  });

  // ── POST /api/cost-db/categories ──────────────────────────────────────────
  fastify.post('/api/cost-db/categories', { preHandler: [requireEstimatorOrAbove] }, async (request, reply) => {
    const body = request.body as { name?: string; parentId?: number | null; sortOrder?: number };

    if (!body.name?.trim()) {
      return reply.status(400).send({ error: 'name is required', code: 'VALIDATION_ERROR' });
    }

    if (body.parentId != null) {
      const [parent] = await db.select({ id: costCategories.id }).from(costCategories).where(eq(costCategories.id, body.parentId)).limit(1);
      if (!parent) return reply.status(404).send({ error: 'Parent category not found', code: 'NOT_FOUND' });
    }

    const [category] = await db
      .insert(costCategories)
      .values({
        name: body.name.trim(),
        parentId: body.parentId ?? null,
        sortOrder: body.sortOrder ?? 0,
      })
      .returning();

    return reply.status(201).send({ data: category });
  });

  // ── PUT /api/cost-db/categories/:id ───────────────────────────────────────
  fastify.put('/api/cost-db/categories/:id', { preHandler: [requireEstimatorOrAbove] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const catId = parseInt(id, 10);
    if (isNaN(catId)) return reply.status(400).send({ error: 'Invalid category id', code: 'VALIDATION_ERROR' });

    const [category] = await db.select().from(costCategories).where(eq(costCategories.id, catId)).limit(1);
    if (!category) return reply.status(404).send({ error: 'Category not found', code: 'NOT_FOUND' });

    const body = request.body as Partial<{ name: string; parentId: number | null; sortOrder: number }>;

    // Prevent circular reference
    if (body.parentId != null && body.parentId === catId) {
      return reply.status(400).send({ error: 'Category cannot be its own parent', code: 'VALIDATION_ERROR' });
    }

    const [updated] = await db
      .update(costCategories)
      .set(body as any)
      .where(eq(costCategories.id, catId))
      .returning();

    return reply.send({ data: updated });
  });

  // ── DELETE /api/cost-db/categories/:id ────────────────────────────────────
  fastify.delete('/api/cost-db/categories/:id', { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const catId = parseInt(id, 10);
    if (isNaN(catId)) return reply.status(400).send({ error: 'Invalid category id', code: 'VALIDATION_ERROR' });

    const [category] = await db.select().from(costCategories).where(eq(costCategories.id, catId)).limit(1);
    if (!category) return reply.status(404).send({ error: 'Category not found', code: 'NOT_FOUND' });

    // Check for child categories
    const [{ childCount }] = await db
      .select({ childCount: sql<number>`count(*)` })
      .from(costCategories)
      .where(eq(costCategories.parentId, catId));

    if (Number(childCount) > 0) {
      return reply.status(409).send({ error: 'Cannot delete category with subcategories', code: 'HAS_CHILDREN' });
    }

    // Check for items
    const [{ itemCount }] = await db
      .select({ itemCount: sql<number>`count(*)` })
      .from(costItems)
      .where(eq(costItems.categoryId, catId));

    if (Number(itemCount) > 0) {
      return reply.status(409).send({ error: 'Cannot delete category that contains items', code: 'HAS_ITEMS' });
    }

    await db.delete(costCategories).where(eq(costCategories.id, catId));
    return reply.send({ success: true });
  });

  // ── GET /api/cost-db/items ─────────────────────────────────────────────────
  fastify.get('/api/cost-db/items', async (request, reply) => {
    const query = request.query as {
      categoryId?: string;
      search?: string;
      page?: string;
      pageSize?: string;
      needsPriceUpdate?: string;
    };

    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(query.pageSize ?? '50', 10)));
    const offset = (page - 1) * pageSize;

    const conditions = [];

    if (query.categoryId) {
      const catId = parseInt(query.categoryId, 10);
      if (!isNaN(catId)) conditions.push(eq(costItems.categoryId, catId));
    }

    if (query.search) {
      const pattern = `%${query.search}%`;
      conditions.push(or(like(costItems.name, pattern), like(costItems.description as any, pattern)));
    }

    if (query.needsPriceUpdate === 'true') {
      conditions.push(eq(costItems.needsPriceUpdate, true));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)` })
      .from(costItems)
      .where(whereClause);

    const rows = await db
      .select({
        id: costItems.id,
        categoryId: costItems.categoryId,
        name: costItems.name,
        description: costItems.description,
        unit: costItems.unit,
        defaultMaterialCost: costItems.defaultMaterialCost,
        defaultLaborCost: costItems.defaultLaborCost,
        defaultLaborHours: costItems.defaultLaborHours,
        lastPriceUpdate: costItems.lastPriceUpdate,
        source: costItems.source,
        notes: costItems.notes,
        needsPriceUpdate: costItems.needsPriceUpdate,
        createdAt: costItems.createdAt,
        updatedAt: costItems.updatedAt,
        categoryName: costCategories.name,
      })
      .from(costItems)
      .leftJoin(costCategories, eq(costItems.categoryId, costCategories.id))
      .where(whereClause)
      .orderBy(asc(costItems.name))
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

  // ── GET /api/cost-db/items/:id ─────────────────────────────────────────────
  fastify.get('/api/cost-db/items/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const itemId = parseInt(id, 10);
    if (isNaN(itemId)) return reply.status(400).send({ error: 'Invalid item id', code: 'VALIDATION_ERROR' });

    const [item] = await db
      .select({
        id: costItems.id,
        categoryId: costItems.categoryId,
        name: costItems.name,
        description: costItems.description,
        unit: costItems.unit,
        defaultMaterialCost: costItems.defaultMaterialCost,
        defaultLaborCost: costItems.defaultLaborCost,
        defaultLaborHours: costItems.defaultLaborHours,
        lastPriceUpdate: costItems.lastPriceUpdate,
        source: costItems.source,
        notes: costItems.notes,
        needsPriceUpdate: costItems.needsPriceUpdate,
        createdAt: costItems.createdAt,
        updatedAt: costItems.updatedAt,
        categoryName: costCategories.name,
      })
      .from(costItems)
      .leftJoin(costCategories, eq(costItems.categoryId, costCategories.id))
      .where(eq(costItems.id, itemId))
      .limit(1);

    if (!item) return reply.status(404).send({ error: 'Cost item not found', code: 'NOT_FOUND' });

    // Price history
    const history = await db
      .select({
        id: costItemPriceHistory.id,
        materialCost: costItemPriceHistory.materialCost,
        laborCost: costItemPriceHistory.laborCost,
        recordedAt: costItemPriceHistory.recordedAt,
        recordedBy: costItemPriceHistory.recordedBy,
        recordedByName: users.name,
      })
      .from(costItemPriceHistory)
      .leftJoin(users, eq(costItemPriceHistory.recordedBy, users.id))
      .where(eq(costItemPriceHistory.itemId, itemId))
      .orderBy(desc(costItemPriceHistory.recordedAt))
      .limit(20);

    return reply.send({ data: { ...item, priceHistory: history } });
  });

  // ── POST /api/cost-db/items ────────────────────────────────────────────────
  fastify.post('/api/cost-db/items', { preHandler: [requireEstimatorOrAbove] }, async (request, reply) => {
    const body = request.body as {
      categoryId?: number;
      name?: string;
      description?: string;
      unit?: string;
      defaultMaterialCost?: number;
      defaultLaborCost?: number;
      defaultLaborHours?: number;
      source?: string;
      notes?: string;
    };

    if (!body.categoryId || !body.name?.trim() || !body.unit?.trim()) {
      return reply.status(400).send({ error: 'categoryId, name, and unit are required', code: 'VALIDATION_ERROR' });
    }

    const [category] = await db.select({ id: costCategories.id }).from(costCategories).where(eq(costCategories.id, body.categoryId)).limit(1);
    if (!category) return reply.status(404).send({ error: 'Category not found', code: 'NOT_FOUND' });

    const [item] = await db
      .insert(costItems)
      .values({
        categoryId: body.categoryId,
        name: body.name.trim(),
        description: body.description ?? null,
        unit: body.unit.trim(),
        defaultMaterialCost: body.defaultMaterialCost ?? 0,
        defaultLaborCost: body.defaultLaborCost ?? 0,
        defaultLaborHours: body.defaultLaborHours ?? 0,
        source: body.source ?? null,
        notes: body.notes ?? null,
        lastPriceUpdate: new Date().toISOString().split('T')[0],
      })
      .returning();

    return reply.status(201).send({ data: item });
  });

  // ── PUT /api/cost-db/items/:id ─────────────────────────────────────────────
  fastify.put('/api/cost-db/items/:id', { preHandler: [requireEstimatorOrAbove] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const itemId = parseInt(id, 10);
    if (isNaN(itemId)) return reply.status(400).send({ error: 'Invalid item id', code: 'VALIDATION_ERROR' });

    const [existing] = await db.select().from(costItems).where(eq(costItems.id, itemId)).limit(1);
    if (!existing) return reply.status(404).send({ error: 'Cost item not found', code: 'NOT_FOUND' });

    const body = request.body as Partial<{
      categoryId: number;
      name: string;
      description: string;
      unit: string;
      defaultMaterialCost: number;
      defaultLaborCost: number;
      defaultLaborHours: number;
      source: string;
      notes: string;
      needsPriceUpdate: boolean;
    }>;

    // Record price history if costs changed
    const priceChanged =
      (body.defaultMaterialCost !== undefined && body.defaultMaterialCost !== existing.defaultMaterialCost) ||
      (body.defaultLaborCost !== undefined && body.defaultLaborCost !== existing.defaultLaborCost);

    if (priceChanged) {
      await db.insert(costItemPriceHistory).values({
        itemId,
        materialCost: existing.defaultMaterialCost,
        laborCost: existing.defaultLaborCost,
        recordedAt: new Date().toISOString(),
        recordedBy: request.user.id,
      });
    }

    const updateData: Record<string, unknown> = {
      ...body,
      updatedAt: new Date().toISOString(),
    };

    if (priceChanged) {
      updateData.lastPriceUpdate = new Date().toISOString().split('T')[0];
      updateData.needsPriceUpdate = false;
    }

    const [updated] = await db
      .update(costItems)
      .set(updateData as any)
      .where(eq(costItems.id, itemId))
      .returning();

    return reply.send({ data: updated });
  });

  // ── DELETE /api/cost-db/items/:id ─────────────────────────────────────────
  fastify.delete('/api/cost-db/items/:id', { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const itemId = parseInt(id, 10);
    if (isNaN(itemId)) return reply.status(400).send({ error: 'Invalid item id', code: 'VALIDATION_ERROR' });

    const [existing] = await db.select({ id: costItems.id }).from(costItems).where(eq(costItems.id, itemId)).limit(1);
    if (!existing) return reply.status(404).send({ error: 'Cost item not found', code: 'NOT_FOUND' });

    await db.delete(costItems).where(eq(costItems.id, itemId));
    return reply.send({ success: true });
  });

  // ── POST /api/cost-db/import-csv ──────────────────────────────────────────
  // Parse and preview – does NOT commit to DB
  fastify.post('/api/cost-db/import-csv', { preHandler: [requireEstimatorOrAbove] }, async (request, reply) => {
    const body = request.body as { csv?: string; categoryId?: number };

    if (!body.csv) {
      return reply.status(400).send({ error: 'csv string is required in request body', code: 'VALIDATION_ERROR' });
    }

    const rows = parseCSV(body.csv);

    if (rows.length === 0) {
      return reply.status(400).send({ error: 'CSV contains no data rows', code: 'VALIDATION_ERROR' });
    }

    const preview: Array<Record<string, unknown>> = [];
    const errors: Array<{ row: number; error: string }> = [];

    // Required columns (flexible matching)
    const EXPECTED_COLS = ['name', 'unit', 'default_material_cost'];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      for (const col of EXPECTED_COLS) {
        if (!(col in row)) {
          errors.push({ row: i + 2, error: `Missing required column: ${col}` });
        }
      }

      if (!row.name) {
        errors.push({ row: i + 2, error: 'name is empty' });
        continue;
      }

      const matCost = parseFloat(row.default_material_cost ?? '0');
      const laborCost = parseFloat(row.default_labor_cost ?? '0');
      const laborHours = parseFloat(row.default_labor_hours ?? '0');

      if (isNaN(matCost)) {
        errors.push({ row: i + 2, error: `default_material_cost is not a number: "${row.default_material_cost}"` });
        continue;
      }

      preview.push({
        rowNumber: i + 2,
        name: row.name,
        description: row.description ?? '',
        unit: row.unit ?? 'EA',
        categoryName: row.category ?? row.category_name ?? '',
        defaultMaterialCost: matCost,
        defaultLaborCost: isNaN(laborCost) ? 0 : laborCost,
        defaultLaborHours: isNaN(laborHours) ? 0 : laborHours,
        source: row.source ?? '',
        notes: row.notes ?? '',
      });
    }

    return reply.send({
      data: {
        totalRows: rows.length,
        validRows: preview.length,
        errorCount: errors.length,
        errors: errors.slice(0, 20), // cap error list
        preview: preview.slice(0, 10), // first 10 for UI preview
      },
    });
  });

  // ── POST /api/cost-db/import-csv/commit ───────────────────────────────────
  fastify.post('/api/cost-db/import-csv/commit', { preHandler: [requireEstimatorOrAbove] }, async (request, reply) => {
    const body = request.body as { csv?: string; defaultCategoryId?: number; createCategories?: boolean };

    if (!body.csv) {
      return reply.status(400).send({ error: 'csv string is required', code: 'VALIDATION_ERROR' });
    }

    if (!body.defaultCategoryId) {
      return reply.status(400).send({ error: 'defaultCategoryId is required', code: 'VALIDATION_ERROR' });
    }

    const [defaultCategory] = await db
      .select({ id: costCategories.id })
      .from(costCategories)
      .where(eq(costCategories.id, body.defaultCategoryId))
      .limit(1);

    if (!defaultCategory) {
      return reply.status(404).send({ error: 'Default category not found', code: 'NOT_FOUND' });
    }

    const rows = parseCSV(body.csv);

    let inserted = 0;
    let skipped = 0;
    const errors: Array<{ row: number; error: string }> = [];

    // Cache of category name → id
    const categoryCache = new Map<string, number>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      if (!row.name) {
        errors.push({ row: i + 2, error: 'name is empty' });
        skipped++;
        continue;
      }

      const matCost = parseFloat(row.default_material_cost ?? '0');
      const laborCost = parseFloat(row.default_labor_cost ?? '0');
      const laborHours = parseFloat(row.default_labor_hours ?? '0');

      if (isNaN(matCost)) {
        errors.push({ row: i + 2, error: `Invalid material cost: "${row.default_material_cost}"` });
        skipped++;
        continue;
      }

      // Resolve category
      let categoryId = body.defaultCategoryId;
      const categoryName = row.category ?? row.category_name ?? '';

      if (categoryName) {
        if (categoryCache.has(categoryName)) {
          categoryId = categoryCache.get(categoryName)!;
        } else {
          const [found] = await db
            .select({ id: costCategories.id })
            .from(costCategories)
            .where(like(costCategories.name, categoryName))
            .limit(1);

          if (found) {
            categoryId = found.id;
            categoryCache.set(categoryName, found.id);
          } else if (body.createCategories) {
            const [newCat] = await db
              .insert(costCategories)
              .values({ name: categoryName, parentId: null, sortOrder: 999 })
              .returning();
            categoryId = newCat.id;
            categoryCache.set(categoryName, newCat.id);
          }
        }
      }

      try {
        await db.insert(costItems).values({
          categoryId,
          name: row.name.trim(),
          description: row.description || null,
          unit: row.unit || 'EA',
          defaultMaterialCost: matCost,
          defaultLaborCost: isNaN(laborCost) ? 0 : laborCost,
          defaultLaborHours: isNaN(laborHours) ? 0 : laborHours,
          source: row.source || null,
          notes: row.notes || null,
          lastPriceUpdate: new Date().toISOString().split('T')[0],
        });
        inserted++;
      } catch (err) {
        errors.push({ row: i + 2, error: `Insert failed: ${(err as Error).message}` });
        skipped++;
      }
    }

    return reply.send({
      data: {
        inserted,
        skipped,
        errors: errors.slice(0, 50),
      },
    });
  });

  // ── GET /api/cost-db/export-csv ────────────────────────────────────────────
  fastify.get('/api/cost-db/export-csv', async (_request, reply) => {
    const rows = await db
      .select({
        id: costItems.id,
        name: costItems.name,
        description: costItems.description,
        unit: costItems.unit,
        defaultMaterialCost: costItems.defaultMaterialCost,
        defaultLaborCost: costItems.defaultLaborCost,
        defaultLaborHours: costItems.defaultLaborHours,
        source: costItems.source,
        notes: costItems.notes,
        lastPriceUpdate: costItems.lastPriceUpdate,
        categoryName: costCategories.name,
      })
      .from(costItems)
      .leftJoin(costCategories, eq(costItems.categoryId, costCategories.id))
      .orderBy(asc(costCategories.name), asc(costItems.name));

    const headers = [
      'id',
      'category',
      'name',
      'description',
      'unit',
      'default_material_cost',
      'default_labor_cost',
      'default_labor_hours',
      'source',
      'notes',
      'last_price_update',
    ];

    const csvLines = [headers.join(',')];

    for (const row of rows) {
      csvLines.push(
        [
          row.id,
          escapeCSV(row.categoryName ?? ''),
          escapeCSV(row.name),
          escapeCSV(row.description ?? ''),
          escapeCSV(row.unit),
          row.defaultMaterialCost,
          row.defaultLaborCost,
          row.defaultLaborHours,
          escapeCSV(row.source ?? ''),
          escapeCSV(row.notes ?? ''),
          row.lastPriceUpdate ?? '',
        ].join(',')
      );
    }

    const csv = csvLines.join('\n');
    const filename = `cost-database-${new Date().toISOString().split('T')[0]}.csv`;

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return reply.send(csv);
  });
}
