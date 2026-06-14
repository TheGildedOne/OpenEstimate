import { z } from 'zod';

// ── Auth ──────────────────────────────────────
export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  rememberMe: z.boolean().optional(),
});

export const RegisterSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(72),
  role: z.enum(['admin', 'estimator', 'viewer']).default('estimator'),
});

export const UpdatePasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8).max(72),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const ResetPasswordSchema = z.object({
  token: z.string(),
  newPassword: z.string().min(8).max(72),
});

export const UpdateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
});

// ── Projects ──────────────────────────────────
const ProjectStatusEnum = z.enum(['draft', 'bidding', 'submitted', 'won', 'lost', 'archived']);

export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  clientName: z.string().min(1).max(200),
  clientEmail: z.string().email().optional().nullable(),
  clientPhone: z.string().max(50).optional().nullable(),
  siteAddress: z.string().max(500).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  status: ProjectStatusEnum.default('draft'),
  bidDueDate: z.string().datetime({ offset: true }).optional().nullable(),
  startDate: z.string().datetime({ offset: true }).optional().nullable(),
  endDate: z.string().datetime({ offset: true }).optional().nullable(),
});

export const UpdateProjectSchema = CreateProjectSchema.partial();

export const ProjectFilterSchema = z.object({
  status: ProjectStatusEnum.optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt', 'bidDueDate', 'clientName']).default('updatedAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export const CreateProjectNoteSchema = z.object({
  body: z.string().min(1).max(10000),
});

// ── Estimates ─────────────────────────────────
export const CreateEstimateSchema = z.object({
  projectId: z.number().int().positive(),
  name: z.string().min(1).max(200),
  overheadPct: z.number().min(0).max(100).default(15),
  profitPct: z.number().min(0).max(100).default(10),
  taxPct: z.number().min(0).max(100).default(0),
  bondPct: z.number().min(0).max(100).default(0),
  notes: z.string().max(10000).optional().nullable(),
});

export const UpdateEstimateSchema = CreateEstimateSchema.omit({ projectId: true }).partial();

export const CreateSectionSchema = z.object({
  name: z.string().min(1).max(200),
  sortOrder: z.number().int().min(0).default(0),
  color: z.string().max(20).optional().nullable(),
});

export const UpdateSectionSchema = CreateSectionSchema.partial();

const LineItemUnitEnum = z.string().min(1).max(20);

export const CreateLineItemSchema = z.object({
  sectionId: z.number().int().positive(),
  estimateId: z.number().int().positive(),
  description: z.string().min(1).max(500),
  quantity: z.number().min(0).default(0),
  unit: LineItemUnitEnum.default('EA'),
  unitMaterialCost: z.number().min(0).default(0),
  unitLaborCost: z.number().min(0).default(0),
  laborHours: z.number().min(0).default(0),
  laborRate: z.number().min(0).default(0),
  wasteFactorPct: z.number().min(0).max(100).default(0),
  notes: z.string().max(2000).optional().nullable(),
  costDbItemId: z.number().int().positive().optional().nullable(),
  sortOrder: z.number().int().min(0).default(0),
  isAssembly: z.boolean().default(false),
  parentItemId: z.number().int().positive().optional().nullable(),
});

export const UpdateLineItemSchema = CreateLineItemSchema.partial();

export const BulkUpdateLineItemsSchema = z.object({
  items: z.array(
    z.object({
      id: z.number().int().positive(),
      updates: UpdateLineItemSchema,
    })
  ),
});

export const ReorderItemsSchema = z.object({
  items: z.array(
    z.object({
      id: z.number().int().positive(),
      sortOrder: z.number().int().min(0),
    })
  ),
});

// ── Cost Database ──────────────────────────────
export const CreateCostCategorySchema = z.object({
  name: z.string().min(1).max(200),
  parentId: z.number().int().positive().optional().nullable(),
  sortOrder: z.number().int().min(0).default(0),
});

export const CreateCostItemSchema = z.object({
  categoryId: z.number().int().positive(),
  name: z.string().min(1).max(300),
  description: z.string().max(2000).optional().nullable(),
  unit: z.string().min(1).max(20),
  defaultMaterialCost: z.number().min(0).default(0),
  defaultLaborCost: z.number().min(0).default(0),
  defaultLaborHours: z.number().min(0).default(0),
  source: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const UpdateCostItemSchema = CreateCostItemSchema.partial();

// ── Subcontractors ────────────────────────────
export const CreateSubcontractorSchema = z.object({
  companyName: z.string().min(1).max(200),
  contactName: z.string().max(100).optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  trade: z.string().max(100).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  isPreferred: z.boolean().default(false),
});

export const UpdateSubcontractorSchema = CreateSubcontractorSchema.partial();

export const CreateSubBidSchema = z.object({
  projectId: z.number().int().positive(),
  estimateSectionId: z.number().int().positive().optional().nullable(),
  subcontractorId: z.number().int().positive(),
  tradeDescription: z.string().min(1).max(500),
  bidAmount: z.number().min(0),
  receivedDate: z.string().datetime({ offset: true }),
  validUntil: z.string().datetime({ offset: true }).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const UpdateSubBidSchema = CreateSubBidSchema.partial().extend({
  status: z.enum(['received', 'awarded', 'rejected']).optional(),
});

// ── Change Orders ──────────────────────────────
export const CreateChangeOrderSchema = z.object({
  projectId: z.number().int().positive(),
  estimateId: z.number().int().positive(),
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional().nullable(),
  lineItems: z
    .array(
      z.object({
        description: z.string().min(1).max(500),
        quantity: z.number(),
        unit: z.string().min(1).max(20),
        unitCost: z.number(),
      })
    )
    .default([]),
});

export const UpdateChangeOrderSchema = CreateChangeOrderSchema.partial().extend({
  status: z.enum(['draft', 'submitted', 'approved', 'rejected']).optional(),
  approvedByName: z.string().max(100).optional().nullable(),
});

// ── Templates ─────────────────────────────────
export const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  tradeCategory: z.string().max(100).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  isPublic: z.boolean().default(false),
});

export const ApplyTemplateSchema = z.object({
  estimateId: z.number().int().positive(),
  mode: z.enum(['merge', 'replace', 'append']).default('append'),
});

// ── Takeoff ────────────────────────────────────
export const CreateTakeoffSheetSchema = z.object({
  projectId: z.number().int().positive(),
  pdfDocumentId: z.number().int().positive(),
  name: z.string().min(1).max(200),
  scaleValue: z.number().positive().default(1),
  scaleUnit: z.enum(['ft', 'm', 'in']).default('ft'),
  pageNumber: z.number().int().min(1).default(1),
});

export const CreateMeasurementSchema = z.object({
  sheetId: z.number().int().positive(),
  label: z.string().min(1).max(200),
  type: z.enum(['linear', 'area', 'count', 'volume']),
  pointsJson: z.array(z.object({ x: z.number(), y: z.number() })),
  calculatedValue: z.number().min(0),
  unit: z.string().min(1).max(20),
  linkedLineItemId: z.number().int().positive().optional().nullable(),
  color: z.string().max(20).default('#3b82f6'),
  depth: z.number().min(0).optional(),
});

// ── Client Portal ──────────────────────────────
export const CreateShareLinkSchema = z.object({
  estimateId: z.number().int().positive(),
  expiry: z.enum(['7d', '30d', 'never']).default('30d'),
});

export const ClientPortalActionSchema = z.object({
  action: z.enum(['approve', 'reject']),
  comment: z.string().max(2000).optional().nullable(),
});

// ── Company Settings ───────────────────────────
export const UpdateCompanySettingsSchema = z.object({
  companyName: z.string().min(1).max(200).optional(),
  address: z.string().max(500).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().email().optional().nullable(),
  licenseNumber: z.string().max(100).optional().nullable(),
  defaultOverheadPct: z.number().min(0).max(100).optional(),
  defaultProfitPct: z.number().min(0).max(100).optional(),
  defaultTaxPct: z.number().min(0).max(100).optional(),
  defaultBondPct: z.number().min(0).max(100).optional(),
  defaultLaborRate: z.number().min(0).optional(),
  defaultWasteFactorPct: z.number().min(0).max(100).optional(),
  currency: z.string().length(3).optional(),
  timezone: z.string().max(50).optional(),
  fiscalYearStartMonth: z.number().int().min(1).max(12).optional(),
  customUnits: z.array(z.string().max(20)).optional(),
  termsAndConditions: z.string().max(10000).optional().nullable(),
  smtpHost: z.string().max(200).optional().nullable(),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpSecure: z.boolean().optional(),
  smtpUser: z.string().max(200).optional().nullable(),
  smtpPass: z.string().max(200).optional().nullable(),
  smtpFrom: z.string().max(200).optional().nullable(),
});

// ── Notification Settings ──────────────────────
export const UpdateNotificationSettingsSchema = z.object({
  bidDueReminderDays: z.array(z.number().int().min(1).max(30)).optional(),
  emailOnBidDue: z.boolean().optional(),
  emailOnChangeOrder: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
});

// ── Reports ────────────────────────────────────
export const ReportFilterSchema = z.object({
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
  period: z.enum(['monthly', 'quarterly', 'yearly']).default('monthly'),
});

// ── Bid Outcome ────────────────────────────────
export const CreateBidOutcomeSchema = z.object({
  projectId: z.number().int().positive(),
  estimateId: z.number().int().positive(),
  submittedAmount: z.number().min(0),
  competitorLowBid: z.number().min(0).optional().nullable(),
  won: z.boolean(),
  notes: z.string().max(2000).optional().nullable(),
});
