// ─────────────────────────────────────────────
// OpenEstimate Shared Types
// ─────────────────────────────────────────────

// ── Users ─────────────────────────────────────
export type UserRole = 'admin' | 'estimator' | 'viewer';

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  lastLogin: string | null;
}

export interface AuthTokens {
  accessToken: string;
  user: User;
}

// ── Projects ──────────────────────────────────
export type ProjectStatus = 'draft' | 'bidding' | 'submitted' | 'won' | 'lost' | 'archived';

export interface Project {
  id: number;
  name: string;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  siteAddress: string | null;
  description: string | null;
  status: ProjectStatus;
  bidDueDate: string | null;
  startDate: string | null;
  endDate: string | null;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  // Computed / joined
  createdByName?: string;
  activeEstimateId?: number | null;
  activeEstimateTotal?: number | null;
}

export interface ProjectNote {
  id: number;
  projectId: number;
  body: string;
  createdBy: number;
  createdAt: string;
  createdByName?: string;
}

export interface ProjectActivityLog {
  id: number;
  projectId: number;
  userId: number | null;
  action: string;
  detail: string | null;
  timestamp: string;
  userName?: string;
}

export interface ProjectDocument {
  id: number;
  projectId: number;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: number;
  uploadedAt: string;
  label: string | null;
  uploadedByName?: string;
}

// ── Estimates ─────────────────────────────────
export interface Estimate {
  id: number;
  projectId: number;
  name: string;
  version: number;
  isActive: boolean;
  overheadPct: number;
  profitPct: number;
  taxPct: number;
  bondPct: number;
  notes: string | null;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  sections?: EstimateSection[];
}

export interface EstimateSection {
  id: number;
  estimateId: number;
  name: string;
  sortOrder: number;
  color: string | null;
  lineItems?: EstimateLineItem[];
}

export type LineItemUnit =
  | 'EA'
  | 'LF'
  | 'SF'
  | 'SY'
  | 'CY'
  | 'LS'
  | 'HR'
  | 'TON'
  | 'MBF'
  | 'GAL'
  | string;

export interface EstimateLineItem {
  id: number;
  sectionId: number;
  estimateId: number;
  description: string;
  quantity: number;
  unit: LineItemUnit;
  unitMaterialCost: number;
  unitLaborCost: number;
  laborHours: number;
  laborRate: number;
  wasteFactorPct: number;
  notes: string | null;
  costDbItemId: number | null;
  sortOrder: number;
  isAssembly: boolean;
  parentItemId: number | null;
  // Computed
  totalMaterial?: number;
  totalLabor?: number;
  totalCost?: number;
  children?: EstimateLineItem[];
}

export interface EstimateTotals {
  subtotal: number;
  overheadAmt: number;
  profitAmt: number;
  taxAmt: number;
  bondAmt: number;
  grandTotal: number;
}

export interface EstimateVersion {
  id: number;
  estimateId: number;
  versionNumber: number;
  snapshotJson: string;
  savedBy: number;
  savedAt: string;
  savedByName?: string;
}

// ── Cost Database ──────────────────────────────
export interface CostCategory {
  id: number;
  name: string;
  parentId: number | null;
  sortOrder: number;
  children?: CostCategory[];
}

export interface CostItem {
  id: number;
  categoryId: number;
  name: string;
  description: string | null;
  unit: string;
  defaultMaterialCost: number;
  defaultLaborCost: number;
  defaultLaborHours: number;
  lastPriceUpdate: string | null;
  source: string | null;
  notes: string | null;
  categoryName?: string;
  usageCount?: number;
}

export interface CostItemPriceHistory {
  id: number;
  itemId: number;
  materialCost: number;
  laborCost: number;
  recordedAt: string;
  recordedBy: number;
  recordedByName?: string;
}

// ── Takeoff ────────────────────────────────────
export type MeasurementType = 'linear' | 'area' | 'count' | 'volume';

export interface TakeoffSheet {
  id: number;
  projectId: number;
  pdfDocumentId: number;
  name: string;
  scaleValue: number;
  scaleUnit: 'ft' | 'm' | 'in';
  pageNumber: number;
  createdAt: string;
}

export interface TakeoffPoint {
  x: number;
  y: number;
}

export interface TakeoffMeasurement {
  id: number;
  sheetId: number;
  label: string;
  type: MeasurementType;
  pointsJson: TakeoffPoint[];
  calculatedValue: number;
  unit: string;
  linkedLineItemId: number | null;
  color: string;
  depth?: number; // for volume measurements
  createdAt: string;
}

// ── Subcontractors ────────────────────────────
export interface Subcontractor {
  id: number;
  companyName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  trade: string | null;
  notes: string | null;
  isPreferred: boolean;
  createdAt: string;
}

export type SubBidStatus = 'received' | 'awarded' | 'rejected';

export interface SubBid {
  id: number;
  projectId: number;
  estimateSectionId: number | null;
  subcontractorId: number;
  tradeDescription: string;
  bidAmount: number;
  receivedDate: string;
  validUntil: string | null;
  notes: string | null;
  status: SubBidStatus;
  awardedAt: string | null;
  // Joined
  subcontractorName?: string;
  adjustments?: SubBidAdjustment[];
  adjustedTotal?: number;
}

export interface SubBidAdjustment {
  id: number;
  subBidId: number;
  description: string;
  amount: number;
}

// ── Change Orders ──────────────────────────────
export type ChangeOrderStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface ChangeOrder {
  id: number;
  projectId: number;
  estimateId: number;
  number: string;
  title: string;
  description: string | null;
  status: ChangeOrderStatus;
  submittedAt: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  createdBy: number;
  createdAt: string;
  lineItems?: ChangeOrderLineItem[];
  totalCost?: number;
}

export interface ChangeOrderLineItem {
  id: number;
  changeOrderId: number;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
}

// ── Templates ─────────────────────────────────
export interface Template {
  id: number;
  name: string;
  tradeCategory: string | null;
  description: string | null;
  createdBy: number;
  isPublic: boolean;
  createdAt: string;
  sections?: TemplateSection[];
}

export interface TemplateSection {
  id: number;
  templateId: number;
  name: string;
  sortOrder: number;
  color: string | null;
  lineItems?: TemplateLineItem[];
}

export interface TemplateLineItem {
  id: number;
  sectionId: number;
  description: string;
  quantity: number;
  unit: string;
  unitMaterialCost: number;
  unitLaborCost: number;
  laborHours: number;
  laborRate: number;
  wasteFactorPct: number;
  notes: string | null;
  sortOrder: number;
  isAssembly: boolean;
  parentItemId: number | null;
}

// ── Client Portal ──────────────────────────────
export type ShareLinkExpiry = '7d' | '30d' | 'never';

export interface EstimateShareLink {
  id: number;
  estimateId: number;
  token: string;
  expiresAt: string | null;
  isRevoked: boolean;
  createdBy: number;
  createdAt: string;
  clientApprovedAt: string | null;
  clientRejectedAt: string | null;
  clientIp: string | null;
  clientComment: string | null;
}

// ── Notifications ──────────────────────────────
export type NotificationType =
  | 'bid_due_soon'
  | 'change_order_status'
  | 'client_portal_activity'
  | 'project_assigned'
  | 'estimate_version_restored';

export interface Notification {
  id: number;
  userId: number;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

// ── Company Settings ───────────────────────────
export interface CompanySettings {
  id: number;
  logoUrl: string | null;
  companyName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  licenseNumber: string | null;
  defaultOverheadPct: number;
  defaultProfitPct: number;
  defaultTaxPct: number;
  defaultBondPct: number;
  defaultLaborRate: number;
  defaultWasteFactorPct: number;
  currency: string;
  timezone: string;
  fiscalYearStartMonth: number;
  customUnits: string[];
  termsAndConditions: string | null;
  smtpHost: string | null;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string | null;
  smtpFrom: string | null;
  updatedAt: string;
}

// ── Reports ────────────────────────────────────
export interface BidOutcome {
  id: number;
  projectId: number;
  estimateId: number;
  submittedAmount: number;
  competitorLowBid: number | null;
  won: boolean;
  notes: string | null;
  recordedAt: string;
  projectName?: string;
}

// ── API Response Wrappers ──────────────────────
export interface ApiResponse<T> {
  data: T;
}

export interface ApiError {
  error: string;
  code: string;
  details?: unknown;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
