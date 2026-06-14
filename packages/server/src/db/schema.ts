import {
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ─────────────────────────────────────────────
// Helper: timestamp columns
// ─────────────────────────────────────────────
const timestamps = {
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
};

// ── Users ─────────────────────────────────────
export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role', { enum: ['admin', 'estimator', 'viewer'] })
      .notNull()
      .default('estimator'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    resetToken: text('reset_token'),
    resetTokenExpiry: text('reset_token_expiry'),
    lastLogin: text('last_login'),
    ...timestamps,
  },
  (t) => ({
    emailIdx: uniqueIndex('users_email_idx').on(t.email),
  })
);

// ── Sessions (refresh tokens) ──────────────────
export const sessions = sqliteTable(
  'sessions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: text('expires_at').notNull(),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    tokenHashIdx: uniqueIndex('sessions_token_hash_idx').on(t.tokenHash),
    userIdx: index('sessions_user_idx').on(t.userId),
  })
);

// ── Company Settings ───────────────────────────
export const companySettings = sqliteTable('company_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  logoUrl: text('logo_url'),
  companyName: text('company_name').notNull().default('My Company'),
  address: text('address'),
  phone: text('phone'),
  email: text('email'),
  licenseNumber: text('license_number'),
  defaultOverheadPct: real('default_overhead_pct').notNull().default(15),
  defaultProfitPct: real('default_profit_pct').notNull().default(10),
  defaultTaxPct: real('default_tax_pct').notNull().default(0),
  defaultBondPct: real('default_bond_pct').notNull().default(0),
  defaultLaborRate: real('default_labor_rate').notNull().default(65),
  defaultWasteFactorPct: real('default_waste_factor_pct').notNull().default(5),
  currency: text('currency').notNull().default('USD'),
  timezone: text('timezone').notNull().default('America/New_York'),
  fiscalYearStartMonth: integer('fiscal_year_start_month').notNull().default(1),
  customUnitsJson: text('custom_units_json').notNull().default('[]'),
  termsAndConditions: text('terms_and_conditions'),
  smtpHost: text('smtp_host'),
  smtpPort: integer('smtp_port').notNull().default(587),
  smtpSecure: integer('smtp_secure', { mode: 'boolean' }).notNull().default(false),
  smtpUser: text('smtp_user'),
  smtpPassEncrypted: text('smtp_pass_encrypted'),
  smtpFrom: text('smtp_from'),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ── Projects ──────────────────────────────────
export const projects = sqliteTable(
  'projects',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    clientName: text('client_name').notNull(),
    clientEmail: text('client_email'),
    clientPhone: text('client_phone'),
    siteAddress: text('site_address'),
    description: text('description'),
    status: text('status', {
      enum: ['draft', 'bidding', 'submitted', 'won', 'lost', 'archived'],
    })
      .notNull()
      .default('draft'),
    bidDueDate: text('bid_due_date'),
    startDate: text('start_date'),
    endDate: text('end_date'),
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (t) => ({
    statusIdx: index('projects_status_idx').on(t.status),
    createdByIdx: index('projects_created_by_idx').on(t.createdBy),
    bidDueDateIdx: index('projects_bid_due_date_idx').on(t.bidDueDate),
  })
);

// Many-to-many: project assignees
export const projectAssignees = sqliteTable(
  'project_assignees',
  {
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: uniqueIndex('project_assignees_pk').on(t.projectId, t.userId),
  })
);

// ── Project Documents ──────────────────────────
export const projectDocuments = sqliteTable(
  'project_documents',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    originalName: text('original_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    uploadedBy: integer('uploaded_by')
      .notNull()
      .references(() => users.id),
    label: text('label'),
    uploadedAt: text('uploaded_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    projectIdx: index('project_documents_project_idx').on(t.projectId),
  })
);

// ── Project Notes ──────────────────────────────
export const projectNotes = sqliteTable(
  'project_notes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    projectIdx: index('project_notes_project_idx').on(t.projectId),
  })
);

// ── Project Activity Log ───────────────────────
export const projectActivityLog = sqliteTable(
  'project_activity_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: integer('user_id').references(() => users.id),
    action: text('action').notNull(),
    detail: text('detail'),
    timestamp: text('timestamp')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    projectIdx: index('activity_log_project_idx').on(t.projectId),
    timestampIdx: index('activity_log_timestamp_idx').on(t.timestamp),
  })
);

// ── Estimates ─────────────────────────────────
export const estimates = sqliteTable(
  'estimates',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    version: integer('version').notNull().default(1),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
    overheadPct: real('overhead_pct').notNull().default(15),
    profitPct: real('profit_pct').notNull().default(10),
    taxPct: real('tax_pct').notNull().default(0),
    bondPct: real('bond_pct').notNull().default(0),
    notes: text('notes'),
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (t) => ({
    projectIdx: index('estimates_project_idx').on(t.projectId),
  })
);

// ── Estimate Sections ──────────────────────────
export const estimateSections = sqliteTable(
  'estimate_sections',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    estimateId: integer('estimate_id')
      .notNull()
      .references(() => estimates.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    color: text('color'),
  },
  (t) => ({
    estimateIdx: index('sections_estimate_idx').on(t.estimateId),
  })
);

// ── Estimate Line Items ────────────────────────
export const estimateLineItems = sqliteTable(
  'estimate_line_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sectionId: integer('section_id')
      .notNull()
      .references(() => estimateSections.id, { onDelete: 'cascade' }),
    estimateId: integer('estimate_id')
      .notNull()
      .references(() => estimates.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    quantity: real('quantity').notNull().default(0),
    unit: text('unit').notNull().default('EA'),
    unitMaterialCost: real('unit_material_cost').notNull().default(0),
    unitLaborCost: real('unit_labor_cost').notNull().default(0),
    laborHours: real('labor_hours').notNull().default(0),
    laborRate: real('labor_rate').notNull().default(0),
    wasteFactorPct: real('waste_factor_pct').notNull().default(0),
    notes: text('notes'),
    costDbItemId: integer('cost_db_item_id').references(() => costItems.id),
    sortOrder: integer('sort_order').notNull().default(0),
    isAssembly: integer('is_assembly', { mode: 'boolean' }).notNull().default(false),
    parentItemId: integer('parent_item_id'),
    ...timestamps,
  },
  (t) => ({
    sectionIdx: index('line_items_section_idx').on(t.sectionId),
    estimateIdx: index('line_items_estimate_idx').on(t.estimateId),
    parentIdx: index('line_items_parent_idx').on(t.parentItemId),
  })
);

// ── Estimate Versions ──────────────────────────
export const estimateVersions = sqliteTable(
  'estimate_versions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    estimateId: integer('estimate_id')
      .notNull()
      .references(() => estimates.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    snapshotJson: text('snapshot_json').notNull(),
    savedBy: integer('saved_by')
      .notNull()
      .references(() => users.id),
    savedAt: text('saved_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    estimateIdx: index('estimate_versions_estimate_idx').on(t.estimateId),
  })
);

// ── Cost Database ──────────────────────────────
export const costCategories = sqliteTable(
  'cost_db_categories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    parentId: integer('parent_id'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => ({
    parentIdx: index('cost_categories_parent_idx').on(t.parentId),
  })
);

export const costItems = sqliteTable(
  'cost_db_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    categoryId: integer('category_id')
      .notNull()
      .references(() => costCategories.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    unit: text('unit').notNull(),
    defaultMaterialCost: real('default_material_cost').notNull().default(0),
    defaultLaborCost: real('default_labor_cost').notNull().default(0),
    defaultLaborHours: real('default_labor_hours').notNull().default(0),
    lastPriceUpdate: text('last_price_update'),
    source: text('source'),
    notes: text('notes'),
    needsPriceUpdate: integer('needs_price_update', { mode: 'boolean' }).notNull().default(false),
    ...timestamps,
  },
  (t) => ({
    categoryIdx: index('cost_items_category_idx').on(t.categoryId),
    nameIdx: index('cost_items_name_idx').on(t.name),
  })
);

export const costItemPriceHistory = sqliteTable(
  'cost_db_price_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    itemId: integer('item_id')
      .notNull()
      .references(() => costItems.id, { onDelete: 'cascade' }),
    materialCost: real('material_cost').notNull(),
    laborCost: real('labor_cost').notNull(),
    recordedAt: text('recorded_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    recordedBy: integer('recorded_by')
      .notNull()
      .references(() => users.id),
  },
  (t) => ({
    itemIdx: index('price_history_item_idx').on(t.itemId),
  })
);

// ── Takeoff ────────────────────────────────────
export const takeoffSheets = sqliteTable(
  'takeoff_sheets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    pdfDocumentId: integer('pdf_document_id')
      .notNull()
      .references(() => projectDocuments.id),
    name: text('name').notNull(),
    scaleValue: real('scale_value').notNull().default(1),
    scaleUnit: text('scale_unit', { enum: ['ft', 'm', 'in'] })
      .notNull()
      .default('ft'),
    pageNumber: integer('page_number').notNull().default(1),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    projectIdx: index('takeoff_sheets_project_idx').on(t.projectId),
  })
);

export const takeoffMeasurements = sqliteTable(
  'takeoff_measurements',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sheetId: integer('sheet_id')
      .notNull()
      .references(() => takeoffSheets.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    type: text('type', { enum: ['linear', 'area', 'count', 'volume'] }).notNull(),
    pointsJson: text('points_json').notNull().default('[]'),
    calculatedValue: real('calculated_value').notNull().default(0),
    unit: text('unit').notNull(),
    linkedLineItemId: integer('linked_line_item_id').references(() => estimateLineItems.id),
    color: text('color').notNull().default('#3b82f6'),
    depth: real('depth'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    sheetIdx: index('measurements_sheet_idx').on(t.sheetId),
  })
);

// ── Subcontractors ────────────────────────────
export const subcontractors = sqliteTable('subcontractors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyName: text('company_name').notNull(),
  contactName: text('contact_name'),
  email: text('email'),
  phone: text('phone'),
  trade: text('trade'),
  notes: text('notes'),
  isPreferred: integer('is_preferred', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const subBids = sqliteTable(
  'sub_bids',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    estimateSectionId: integer('estimate_section_id').references(() => estimateSections.id),
    subcontractorId: integer('subcontractor_id')
      .notNull()
      .references(() => subcontractors.id),
    tradeDescription: text('trade_description').notNull(),
    bidAmount: real('bid_amount').notNull(),
    receivedDate: text('received_date').notNull(),
    validUntil: text('valid_until'),
    notes: text('notes'),
    status: text('status', { enum: ['received', 'awarded', 'rejected'] })
      .notNull()
      .default('received'),
    awardedAt: text('awarded_at'),
    ...timestamps,
  },
  (t) => ({
    projectIdx: index('sub_bids_project_idx').on(t.projectId),
    subIdx: index('sub_bids_subcontractor_idx').on(t.subcontractorId),
  })
);

export const subBidAdjustments = sqliteTable('sub_bid_adjustments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  subBidId: integer('sub_bid_id')
    .notNull()
    .references(() => subBids.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  amount: real('amount').notNull(),
});

// ── Change Orders ──────────────────────────────
export const changeOrders = sqliteTable(
  'change_orders',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    estimateId: integer('estimate_id')
      .notNull()
      .references(() => estimates.id),
    number: text('number').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status', { enum: ['draft', 'submitted', 'approved', 'rejected'] })
      .notNull()
      .default('draft'),
    submittedAt: text('submitted_at'),
    approvedAt: text('approved_at'),
    approvedByName: text('approved_by_name'),
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (t) => ({
    projectIdx: index('change_orders_project_idx').on(t.projectId),
  })
);

export const changeOrderLineItems = sqliteTable('change_order_line_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  changeOrderId: integer('change_order_id')
    .notNull()
    .references(() => changeOrders.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  quantity: real('quantity').notNull(),
  unit: text('unit').notNull(),
  unitCost: real('unit_cost').notNull(),
  totalCost: real('total_cost').notNull(),
});

// ── Templates ─────────────────────────────────
export const templates = sqliteTable('templates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  tradeCategory: text('trade_category'),
  description: text('description'),
  createdBy: integer('created_by')
    .notNull()
    .references(() => users.id),
  isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const templateSections = sqliteTable('template_sections', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  templateId: integer('template_id')
    .notNull()
    .references(() => templates.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  color: text('color'),
});

export const templateLineItems = sqliteTable('template_line_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sectionId: integer('section_id')
    .notNull()
    .references(() => templateSections.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  quantity: real('quantity').notNull().default(0),
  unit: text('unit').notNull().default('EA'),
  unitMaterialCost: real('unit_material_cost').notNull().default(0),
  unitLaborCost: real('unit_labor_cost').notNull().default(0),
  laborHours: real('labor_hours').notNull().default(0),
  laborRate: real('labor_rate').notNull().default(0),
  wasteFactorPct: real('waste_factor_pct').notNull().default(0),
  notes: text('notes'),
  sortOrder: integer('sort_order').notNull().default(0),
  isAssembly: integer('is_assembly', { mode: 'boolean' }).notNull().default(false),
  parentItemId: integer('parent_item_id'),
});

// ── Client Portal / Share Links ────────────────
export const estimateShareLinks = sqliteTable(
  'estimate_share_links',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    estimateId: integer('estimate_id')
      .notNull()
      .references(() => estimates.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    expiresAt: text('expires_at'),
    isRevoked: integer('is_revoked', { mode: 'boolean' }).notNull().default(false),
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    clientApprovedAt: text('client_approved_at'),
    clientRejectedAt: text('client_rejected_at'),
    clientIp: text('client_ip'),
    clientComment: text('client_comment'),
  },
  (t) => ({
    tokenIdx: uniqueIndex('share_links_token_idx').on(t.token),
    estimateIdx: index('share_links_estimate_idx').on(t.estimateId),
  })
);

// ── Notifications ──────────────────────────────
export const notifications = sqliteTable(
  'notifications',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    link: text('link'),
    isRead: integer('is_read', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    userIdx: index('notifications_user_idx').on(t.userId),
    readIdx: index('notifications_read_idx').on(t.isRead),
  })
);

export const notificationSettings = sqliteTable('notification_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })
    .unique(),
  bidDueReminderDaysJson: text('bid_due_reminder_days_json').notNull().default('[7,3,1]'),
  emailOnBidDue: integer('email_on_bid_due', { mode: 'boolean' }).notNull().default(true),
  emailOnChangeOrder: integer('email_on_change_order', { mode: 'boolean' }).notNull().default(true),
  inAppEnabled: integer('in_app_enabled', { mode: 'boolean' }).notNull().default(true),
});

// ── Bid Outcomes ───────────────────────────────
export const bidOutcomes = sqliteTable(
  'bid_outcomes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    estimateId: integer('estimate_id')
      .notNull()
      .references(() => estimates.id),
    submittedAmount: real('submitted_amount').notNull(),
    competitorLowBid: real('competitor_low_bid'),
    won: integer('won', { mode: 'boolean' }).notNull(),
    notes: text('notes'),
    recordedAt: text('recorded_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    projectIdx: index('bid_outcomes_project_idx').on(t.projectId),
    recordedAtIdx: index('bid_outcomes_recorded_at_idx').on(t.recordedAt),
  })
);

// ── Type exports ───────────────────────────────
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type CompanySetting = typeof companySettings.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ProjectDocument = typeof projectDocuments.$inferSelect;
export type ProjectNote = typeof projectNotes.$inferSelect;
export type Estimate = typeof estimates.$inferSelect;
export type NewEstimate = typeof estimates.$inferInsert;
export type EstimateSection = typeof estimateSections.$inferSelect;
export type EstimateLineItem = typeof estimateLineItems.$inferSelect;
export type CostCategory = typeof costCategories.$inferSelect;
export type CostItem = typeof costItems.$inferSelect;
export type TakeoffSheet = typeof takeoffSheets.$inferSelect;
export type TakeoffMeasurement = typeof takeoffMeasurements.$inferSelect;
export type Subcontractor = typeof subcontractors.$inferSelect;
export type SubBid = typeof subBids.$inferSelect;
export type ChangeOrder = typeof changeOrders.$inferSelect;
export type Template = typeof templates.$inferSelect;
export type EstimateShareLink = typeof estimateShareLinks.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type BidOutcome = typeof bidOutcomes.$inferSelect;
