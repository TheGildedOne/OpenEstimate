import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import type {
  User,
  AuthTokens,
  Project,
  ProjectNote,
  ProjectActivityLog,
  ProjectDocument,
  Estimate,
  EstimateSection,
  EstimateLineItem,
  EstimateTotals,
  EstimateVersion,
  EstimateShareLink,
  CostCategory,
  CostItem,
  TakeoffSheet,
  TakeoffMeasurement,
  Subcontractor,
  SubBid,
  ChangeOrder,
  Template,
  Notification,
  CompanySettings,
  BidOutcome,
  PaginatedResponse,
} from '@openestimate/shared';

// ─── Error class ──────────────────────────────────────────────────────────────

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, message: string, code = 'UNKNOWN', details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// ─── Core fetch ───────────────────────────────────────────────────────────────

const API_BASE = (import.meta.env.VITE_API_URL as string) || '';

let isRefreshing = false;
let refreshQueue: Array<(token: string | null) => void> = [];

async function waitForRefresh(): Promise<string | null> {
  return new Promise((resolve) => {
    refreshQueue.push(resolve);
  });
}

async function performRefresh(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = await res.json();
    const token: string = data.data?.accessToken;
    if (token) {
      useAuthStore.getState().setToken(token);
    }
    return token ?? null;
  } catch {
    return null;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = useAuthStore.getState().accessToken;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers,
  });

  if (res.status === 401) {
    // Try refresh once
    if (!isRefreshing) {
      isRefreshing = true;
      const newToken = await performRefresh();
      isRefreshing = false;
      refreshQueue.forEach((cb) => cb(newToken));
      refreshQueue = [];

      if (!newToken) {
        useAuthStore.getState().clearAuth();
        throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED');
      }

      // Retry with new token
      const retryRes = await fetch(`${API_BASE}${path}`, {
        credentials: 'include',
        ...options,
        headers: { ...headers, Authorization: `Bearer ${newToken}` },
      });

      if (!retryRes.ok) {
        const errBody = await retryRes.json().catch(() => ({}));
        throw new ApiError(
          retryRes.status,
          errBody.error ?? retryRes.statusText,
          errBody.code,
          errBody.details
        );
      }

      const retryData = await retryRes.json();
      return retryData.data ?? retryData;
    } else {
      // Queue behind the in-flight refresh
      const newToken = await waitForRefresh();
      if (!newToken) {
        throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED');
      }
      return apiFetch<T>(path, options);
    }
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      errBody.error ?? res.statusText,
      errBody.code,
      errBody.details
    );
  }

  if (res.status === 204) return undefined as T;

  const body = await res.json();
  return body.data ?? body;
}

// Multipart upload (no Content-Type — browser sets boundary)
export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: formData,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new ApiError(res.status, errBody.error ?? res.statusText, errBody.code, errBody.details);
  }

  const body = await res.json();
  return body.data ?? body;
}

// ─── Query key factories ──────────────────────────────────────────────────────

export const qk = {
  currentUser: () => ['currentUser'] as const,
  sessions: () => ['sessions'] as const,

  projects: (filters?: Record<string, unknown>) => ['projects', filters] as const,
  project: (id: number) => ['project', id] as const,
  projectActivity: (id: number) => ['projectActivity', id] as const,
  projectNotes: (id: number) => ['projectNotes', id] as const,
  dashboard: () => ['dashboard'] as const,

  estimates: (projectId: number) => ['estimates', projectId] as const,
  estimate: (id: number) => ['estimate', id] as const,
  estimateTotals: (id: number) => ['estimateTotals', id] as const,
  versions: (estimateId: number) => ['versions', estimateId] as const,

  sections: (estimateId: number) => ['sections', estimateId] as const,

  costCategories: () => ['costCategories'] as const,
  costItems: (filters?: Record<string, unknown>) => ['costItems', filters] as const,
  costItem: (id: number) => ['costItem', id] as const,

  subcontractors: (filters?: Record<string, unknown>) => ['subcontractors', filters] as const,
  subcontractor: (id: number) => ['subcontractor', id] as const,
  subBids: (projectId: number) => ['subBids', projectId] as const,
  bidLeveling: (projectId: number) => ['bidLeveling', projectId] as const,
  subcontractorAnalytics: (id: number) => ['subcontractorAnalytics', id] as const,

  changeOrders: (projectId: number) => ['changeOrders', projectId] as const,
  changeOrder: (id: number) => ['changeOrder', id] as const,
  contractSummary: (projectId: number) => ['contractSummary', projectId] as const,

  templates: () => ['templates'] as const,
  template: (id: number) => ['template', id] as const,

  documents: (projectId: number) => ['documents', projectId] as const,

  takeoffSheets: (projectId: number) => ['takeoffSheets', projectId] as const,
  takeoffSheet: (id: number) => ['takeoffSheet', id] as const,
  takeoffSummary: (projectId: number) => ['takeoffSummary', projectId] as const,

  shareLinks: (estimateId: number) => ['shareLinks', estimateId] as const,
  portalEstimate: (token: string) => ['portalEstimate', token] as const,

  notifications: () => ['notifications'] as const,
  unreadCount: () => ['unreadCount'] as const,
  notificationSettings: () => ['notificationSettings'] as const,

  bidPerformance: (filters?: Record<string, unknown>) => ['bidPerformance', filters] as const,
  costAnalysis: (filters?: Record<string, unknown>) => ['costAnalysis', filters] as const,
  estimatorProductivity: (filters?: Record<string, unknown>) =>
    ['estimatorProductivity', filters] as const,
  bidOutcomes: () => ['bidOutcomes'] as const,

  companySettings: () => ['companySettings'] as const,
  users: () => ['users'] as const,
};

// ─── Auth ─────────────────────────────────────────────────────────────────────

export function useCurrentUser(options?: Partial<UseQueryOptions<User>>) {
  return useQuery({
    queryKey: qk.currentUser(),
    queryFn: () => apiFetch<User>('/api/auth/me'),
    ...options,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      apiFetch<AuthTokens>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      useAuthStore.getState().setAuth(data.user, data.accessToken);
      qc.invalidateQueries({ queryKey: qk.currentUser() });
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<void>('/api/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      useAuthStore.getState().clearAuth();
      qc.clear();
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (body: { email: string }) =>
      apiFetch<void>('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify(body) }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (body: { token: string; password: string }) =>
      apiFetch<void>('/api/auth/reset-password', { method: 'POST', body: JSON.stringify(body) }),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Pick<User, 'name' | 'email'>>) =>
      apiFetch<User>('/api/auth/profile', { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.currentUser() }),
  });
}

export function useUpdatePassword() {
  return useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      apiFetch<void>('/api/auth/password', { method: 'PATCH', body: JSON.stringify(body) }),
  });
}

export function useSessions() {
  return useQuery({
    queryKey: qk.sessions(),
    queryFn: () => apiFetch<unknown[]>('/api/auth/sessions'),
  });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      apiFetch<void>(`/api/auth/sessions/${sessionId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.sessions() }),
  });
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export function useDashboard() {
  return useQuery({
    queryKey: qk.dashboard(),
    queryFn: () => apiFetch<unknown>('/api/dashboard'),
  });
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export function useProjects(filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: qk.projects(filters),
    queryFn: () => {
      const params = filters
        ? '?' + new URLSearchParams(filters as Record<string, string>).toString()
        : '';
      return apiFetch<Project[]>(`/api/projects${params}`);
    },
  });
}

export function useProject(id: number) {
  return useQuery({
    queryKey: qk.project(id),
    queryFn: () => apiFetch<Project>(`/api/projects/${id}`),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Project>) =>
      apiFetch<Project>('/api/projects', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<Project>) =>
      apiFetch<Project>(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: qk.project(vars.id) });
    },
  });
}

export function useDuplicateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<Project>(`/api/projects/${id}/duplicate`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<void>(`/api/projects/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useProjectActivity(id: number) {
  return useQuery({
    queryKey: qk.projectActivity(id),
    queryFn: () => apiFetch<ProjectActivityLog[]>(`/api/projects/${id}/activity`),
    enabled: !!id,
  });
}

export function useProjectNotes(id: number) {
  return useQuery({
    queryKey: qk.projectNotes(id),
    queryFn: () => apiFetch<ProjectNote[]>(`/api/projects/${id}/notes`),
    enabled: !!id,
  });
}

export function useCreateProjectNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, body }: { projectId: number; body: string }) =>
      apiFetch<ProjectNote>(`/api/projects/${projectId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: qk.projectNotes(vars.projectId) }),
  });
}

export function useDeleteProjectNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, noteId }: { projectId: number; noteId: number }) =>
      apiFetch<void>(`/api/projects/${projectId}/notes/${noteId}`, { method: 'DELETE' }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: qk.projectNotes(vars.projectId) }),
  });
}

// ─── Estimates ────────────────────────────────────────────────────────────────

export function useEstimates(projectId: number) {
  return useQuery({
    queryKey: qk.estimates(projectId),
    queryFn: () => apiFetch<Estimate[]>(`/api/projects/${projectId}/estimates`),
    enabled: !!projectId,
  });
}

export function useEstimate(id: number) {
  return useQuery({
    queryKey: qk.estimate(id),
    queryFn: () => apiFetch<Estimate>(`/api/estimates/${id}`),
    enabled: !!id,
  });
}

export function useCreateEstimate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { projectId: number } & Partial<Estimate>) =>
      apiFetch<Estimate>('/api/estimates', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: qk.estimates(data.projectId) });
    },
  });
}

export function useUpdateEstimate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<Estimate>) =>
      apiFetch<Estimate>(`/api/estimates/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: qk.estimate(data.id) });
      qc.invalidateQueries({ queryKey: qk.estimates(data.projectId) });
    },
  });
}

export function useDeleteEstimate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, projectId }: { id: number; projectId: number }) =>
      apiFetch<void>(`/api/estimates/${id}`, { method: 'DELETE' }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: qk.estimates(vars.projectId) });
    },
  });
}

export function useCloneEstimate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<Estimate>(`/api/estimates/${id}/clone`, { method: 'POST' }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: qk.estimates(data.projectId) });
    },
  });
}

export function useActivateEstimate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<Estimate>(`/api/estimates/${id}/activate`, { method: 'POST' }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: qk.estimates(data.projectId) });
      qc.invalidateQueries({ queryKey: qk.estimate(data.id) });
    },
  });
}

export function useSaveVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (estimateId: number) =>
      apiFetch<EstimateVersion>(`/api/estimates/${estimateId}/versions`, { method: 'POST' }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: qk.versions(data.estimateId) });
    },
  });
}

export function useVersions(estimateId: number) {
  return useQuery({
    queryKey: qk.versions(estimateId),
    queryFn: () => apiFetch<EstimateVersion[]>(`/api/estimates/${estimateId}/versions`),
    enabled: !!estimateId,
  });
}

export function useRestoreVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ estimateId, versionId }: { estimateId: number; versionId: number }) =>
      apiFetch<Estimate>(`/api/estimates/${estimateId}/versions/${versionId}/restore`, {
        method: 'POST',
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: qk.estimate(data.id) });
    },
  });
}

export function useEstimateTotals(estimateId: number) {
  return useQuery({
    queryKey: qk.estimateTotals(estimateId),
    queryFn: () => apiFetch<EstimateTotals>(`/api/estimates/${estimateId}/totals`),
    enabled: !!estimateId,
  });
}

// ─── Sections ─────────────────────────────────────────────────────────────────

export function useCreateSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { estimateId: number } & Partial<EstimateSection>) =>
      apiFetch<EstimateSection>('/api/sections', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: qk.estimate(data.estimateId) });
    },
  });
}

export function useUpdateSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, estimateId, ...body }: { id: number; estimateId: number } & Partial<EstimateSection>) =>
      apiFetch<EstimateSection>(`/api/sections/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: qk.estimate(data.estimateId) });
    },
  });
}

export function useDeleteSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, estimateId }: { id: number; estimateId: number }) =>
      apiFetch<void>(`/api/sections/${id}`, { method: 'DELETE' }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: qk.estimate(vars.estimateId) });
    },
  });
}

export function useReorderSections() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ estimateId, order }: { estimateId: number; order: number[] }) =>
      apiFetch<void>(`/api/estimates/${estimateId}/sections/reorder`, {
        method: 'POST',
        body: JSON.stringify({ order }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: qk.estimate(vars.estimateId) });
    },
  });
}

// ─── Line Items ───────────────────────────────────────────────────────────────

export function useCreateLineItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<EstimateLineItem> & { estimateId: number }) =>
      apiFetch<EstimateLineItem>('/api/line-items', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: qk.estimate(data.estimateId) });
    },
  });
}

export function useUpdateLineItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, estimateId, ...body }: { id: number; estimateId: number } & Partial<EstimateLineItem>) =>
      apiFetch<EstimateLineItem>(`/api/line-items/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: qk.estimate(data.estimateId) });
    },
  });
}

export function useDeleteLineItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, estimateId }: { id: number; estimateId: number }) =>
      apiFetch<void>(`/api/line-items/${id}`, { method: 'DELETE' }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: qk.estimate(vars.estimateId) });
    },
  });
}

export function useBulkUpdateLineItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      estimateId,
      items,
    }: {
      estimateId: number;
      items: Array<{ id: number } & Partial<EstimateLineItem>>;
    }) =>
      apiFetch<EstimateLineItem[]>('/api/line-items/bulk', {
        method: 'PATCH',
        body: JSON.stringify({ items }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: qk.estimate(vars.estimateId) });
    },
  });
}

export function useReorderLineItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      sectionId,
      estimateId,
      order,
    }: {
      sectionId: number;
      estimateId: number;
      order: number[];
    }) =>
      apiFetch<void>(`/api/sections/${sectionId}/line-items/reorder`, {
        method: 'POST',
        body: JSON.stringify({ order }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: qk.estimate(vars.estimateId) });
    },
  });
}

// ─── Cost Database ────────────────────────────────────────────────────────────

export function useCostCategories() {
  return useQuery({
    queryKey: qk.costCategories(),
    queryFn: () => apiFetch<CostCategory[]>('/api/cost-db/categories'),
  });
}

export function useCostItems(filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: qk.costItems(filters),
    queryFn: () => {
      const params = filters
        ? '?' + new URLSearchParams(filters as Record<string, string>).toString()
        : '';
      return apiFetch<PaginatedResponse<CostItem>>(`/api/cost-db/items${params}`);
    },
  });
}

export function useCostItem(id: number) {
  return useQuery({
    queryKey: qk.costItem(id),
    queryFn: () => apiFetch<CostItem>(`/api/cost-db/items/${id}`),
    enabled: !!id,
  });
}

export function useCreateCostCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<CostCategory>) =>
      apiFetch<CostCategory>('/api/cost-db/categories', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.costCategories() }),
  });
}

export function useUpdateCostCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<CostCategory>) =>
      apiFetch<CostCategory>(`/api/cost-db/categories/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.costCategories() }),
  });
}

export function useDeleteCostCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<void>(`/api/cost-db/categories/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.costCategories() }),
  });
}

export function useCreateCostItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<CostItem>) =>
      apiFetch<CostItem>('/api/cost-db/items', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['costItems'] }),
  });
}

export function useUpdateCostItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<CostItem>) =>
      apiFetch<CostItem>(`/api/cost-db/items/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['costItems'] });
      qc.invalidateQueries({ queryKey: qk.costItem(data.id) });
    },
  });
}

export function useDeleteCostItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<void>(`/api/cost-db/items/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['costItems'] }),
  });
}

// ─── Subcontractors ───────────────────────────────────────────────────────────

export function useSubcontractors(filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: qk.subcontractors(filters),
    queryFn: () => {
      const params = filters
        ? '?' + new URLSearchParams(filters as Record<string, string>).toString()
        : '';
      return apiFetch<Subcontractor[]>(`/api/subcontractors${params}`);
    },
  });
}

export function useSubcontractor(id: number) {
  return useQuery({
    queryKey: qk.subcontractor(id),
    queryFn: () => apiFetch<Subcontractor>(`/api/subcontractors/${id}`),
    enabled: !!id,
  });
}

export function useCreateSubcontractor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Subcontractor>) =>
      apiFetch<Subcontractor>('/api/subcontractors', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subcontractors'] }),
  });
}

export function useUpdateSubcontractor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<Subcontractor>) =>
      apiFetch<Subcontractor>(`/api/subcontractors/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['subcontractors'] });
      qc.invalidateQueries({ queryKey: qk.subcontractor(data.id) });
    },
  });
}

export function useDeleteSubcontractor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<void>(`/api/subcontractors/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subcontractors'] }),
  });
}

export function useSubBids(projectId: number) {
  return useQuery({
    queryKey: qk.subBids(projectId),
    queryFn: () => apiFetch<SubBid[]>(`/api/projects/${projectId}/sub-bids`),
    enabled: !!projectId,
  });
}

export function useCreateSubBid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<SubBid> & { projectId: number }) =>
      apiFetch<SubBid>('/api/sub-bids', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (data) => qc.invalidateQueries({ queryKey: qk.subBids(data.projectId) }),
  });
}

export function useUpdateSubBid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<SubBid>) =>
      apiFetch<SubBid>(`/api/sub-bids/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: (data) => qc.invalidateQueries({ queryKey: qk.subBids(data.projectId) }),
  });
}

export function useDeleteSubBid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, projectId }: { id: number; projectId: number }) =>
      apiFetch<void>(`/api/sub-bids/${id}`, { method: 'DELETE' }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: qk.subBids(vars.projectId) }),
  });
}

export function useAwardSubBid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, projectId }: { id: number; projectId: number }) =>
      apiFetch<SubBid>(`/api/sub-bids/${id}/award`, { method: 'POST' }),
    onSuccess: (data) => qc.invalidateQueries({ queryKey: qk.subBids(data.projectId) }),
  });
}

export function useBidLeveling(projectId: number) {
  return useQuery({
    queryKey: qk.bidLeveling(projectId),
    queryFn: () => apiFetch<unknown>(`/api/projects/${projectId}/bid-leveling`),
    enabled: !!projectId,
  });
}

export function useSubcontractorAnalytics(id: number) {
  return useQuery({
    queryKey: qk.subcontractorAnalytics(id),
    queryFn: () => apiFetch<unknown>(`/api/subcontractors/${id}/analytics`),
    enabled: !!id,
  });
}

// ─── Change Orders ────────────────────────────────────────────────────────────

export function useChangeOrders(projectId: number) {
  return useQuery({
    queryKey: qk.changeOrders(projectId),
    queryFn: () => apiFetch<ChangeOrder[]>(`/api/projects/${projectId}/change-orders`),
    enabled: !!projectId,
  });
}

export function useChangeOrder(id: number) {
  return useQuery({
    queryKey: qk.changeOrder(id),
    queryFn: () => apiFetch<ChangeOrder>(`/api/change-orders/${id}`),
    enabled: !!id,
  });
}

export function useCreateChangeOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<ChangeOrder> & { projectId: number }) =>
      apiFetch<ChangeOrder>('/api/change-orders', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (data) => qc.invalidateQueries({ queryKey: qk.changeOrders(data.projectId) }),
  });
}

export function useUpdateChangeOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<ChangeOrder>) =>
      apiFetch<ChangeOrder>(`/api/change-orders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: qk.changeOrders(data.projectId) });
      qc.invalidateQueries({ queryKey: qk.changeOrder(data.id) });
    },
  });
}

export function useDeleteChangeOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, projectId }: { id: number; projectId: number }) =>
      apiFetch<void>(`/api/change-orders/${id}`, { method: 'DELETE' }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: qk.changeOrders(vars.projectId) }),
  });
}

export function useSubmitChangeOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<ChangeOrder>(`/api/change-orders/${id}/submit`, { method: 'POST' }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: qk.changeOrders(data.projectId) });
      qc.invalidateQueries({ queryKey: qk.changeOrder(data.id) });
    },
  });
}

export function useApproveChangeOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<ChangeOrder>(`/api/change-orders/${id}/approve`, { method: 'POST' }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: qk.changeOrders(data.projectId) });
      qc.invalidateQueries({ queryKey: qk.changeOrder(data.id) });
    },
  });
}

export function useRejectChangeOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<ChangeOrder>(`/api/change-orders/${id}/reject`, { method: 'POST' }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: qk.changeOrders(data.projectId) });
      qc.invalidateQueries({ queryKey: qk.changeOrder(data.id) });
    },
  });
}

export function useContractSummary(projectId: number) {
  return useQuery({
    queryKey: qk.contractSummary(projectId),
    queryFn: () => apiFetch<unknown>(`/api/projects/${projectId}/contract-summary`),
    enabled: !!projectId,
  });
}

// ─── Templates ────────────────────────────────────────────────────────────────

export function useTemplates() {
  return useQuery({
    queryKey: qk.templates(),
    queryFn: () => apiFetch<Template[]>('/api/templates'),
  });
}

export function useTemplate(id: number) {
  return useQuery({
    queryKey: qk.template(id),
    queryFn: () => apiFetch<Template>(`/api/templates/${id}`),
    enabled: !!id,
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Template>) =>
      apiFetch<Template>('/api/templates', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.templates() }),
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<Template>) =>
      apiFetch<Template>(`/api/templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: qk.templates() });
      qc.invalidateQueries({ queryKey: qk.template(data.id) });
    },
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<void>(`/api/templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.templates() }),
  });
}

export function useApplyTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ templateId, estimateId }: { templateId: number; estimateId: number }) =>
      apiFetch<Estimate>(`/api/templates/${templateId}/apply`, {
        method: 'POST',
        body: JSON.stringify({ estimateId }),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: qk.estimate(data.id) });
    },
  });
}

export function useCreateTemplateFromEstimate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ estimateId, name }: { estimateId: number; name: string }) =>
      apiFetch<Template>('/api/templates/from-estimate', {
        method: 'POST',
        body: JSON.stringify({ estimateId, name }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.templates() }),
  });
}

// ─── Documents ────────────────────────────────────────────────────────────────

export function useDocuments(projectId: number) {
  return useQuery({
    queryKey: qk.documents(projectId),
    queryFn: () => apiFetch<ProjectDocument[]>(`/api/projects/${projectId}/documents`),
    enabled: !!projectId,
  });
}

export function useUploadDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, file, label }: { projectId: number; file: File; label?: string }) => {
      const fd = new FormData();
      fd.append('file', file);
      if (label) fd.append('label', label);
      return apiUpload<ProjectDocument>(`/api/projects/${projectId}/documents`, fd);
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: qk.documents(data.projectId) });
    },
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, projectId }: { id: number; projectId: number }) =>
      apiFetch<void>(`/api/documents/${id}`, { method: 'DELETE' }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: qk.documents(vars.projectId) }),
  });
}

export function useUpdateDocumentLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, projectId, label }: { id: number; projectId: number; label: string }) =>
      apiFetch<ProjectDocument>(`/api/documents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ label }),
      }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: qk.documents(vars.projectId) }),
  });
}

// ─── Takeoff ──────────────────────────────────────────────────────────────────

export function useTakeoffSheets(projectId: number) {
  return useQuery({
    queryKey: qk.takeoffSheets(projectId),
    queryFn: () => apiFetch<TakeoffSheet[]>(`/api/projects/${projectId}/takeoff-sheets`),
    enabled: !!projectId,
  });
}

export function useTakeoffSheet(id: number) {
  return useQuery({
    queryKey: qk.takeoffSheet(id),
    queryFn: () => apiFetch<TakeoffSheet>(`/api/takeoff-sheets/${id}`),
    enabled: !!id,
  });
}

export function useCreateTakeoffSheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<TakeoffSheet> & { projectId: number }) =>
      apiFetch<TakeoffSheet>('/api/takeoff-sheets', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: qk.takeoffSheets(data.projectId) });
    },
  });
}

export function useUpdateTakeoffSheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<TakeoffSheet>) =>
      apiFetch<TakeoffSheet>(`/api/takeoff-sheets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: qk.takeoffSheet(data.id) });
      qc.invalidateQueries({ queryKey: qk.takeoffSheets(data.projectId) });
    },
  });
}

export function useDeleteTakeoffSheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, projectId }: { id: number; projectId: number }) =>
      apiFetch<void>(`/api/takeoff-sheets/${id}`, { method: 'DELETE' }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: qk.takeoffSheets(vars.projectId) }),
  });
}

export function useCreateMeasurement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<TakeoffMeasurement> & { sheetId: number; projectId: number }) =>
      apiFetch<TakeoffMeasurement>('/api/takeoff-measurements', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: qk.takeoffSheet(data.sheetId) });
      qc.invalidateQueries({ queryKey: qk.takeoffSummary(vars.projectId) });
    },
  });
}

export function useUpdateMeasurement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      projectId,
      ...body
    }: { id: number; projectId: number } & Partial<TakeoffMeasurement>) =>
      apiFetch<TakeoffMeasurement>(`/api/takeoff-measurements/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: qk.takeoffSheet(data.sheetId) });
      qc.invalidateQueries({ queryKey: qk.takeoffSummary(vars.projectId) });
    },
  });
}

export function useDeleteMeasurement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      sheetId,
      projectId,
    }: {
      id: number;
      sheetId: number;
      projectId: number;
    }) => apiFetch<void>(`/api/takeoff-measurements/${id}`, { method: 'DELETE' }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: qk.takeoffSheet(vars.sheetId) });
      qc.invalidateQueries({ queryKey: qk.takeoffSummary(vars.projectId) });
    },
  });
}

export function useTakeoffSummary(projectId: number) {
  return useQuery({
    queryKey: qk.takeoffSummary(projectId),
    queryFn: () => apiFetch<unknown>(`/api/projects/${projectId}/takeoff-summary`),
    enabled: !!projectId,
  });
}

// ─── Client Portal ────────────────────────────────────────────────────────────

export function useShareLinks(estimateId: number) {
  return useQuery({
    queryKey: qk.shareLinks(estimateId),
    queryFn: () => apiFetch<EstimateShareLink[]>(`/api/estimates/${estimateId}/share-links`),
    enabled: !!estimateId,
  });
}

export function useCreateShareLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      estimateId,
      expiresIn,
    }: {
      estimateId: number;
      expiresIn?: string;
    }) =>
      apiFetch<EstimateShareLink>(`/api/estimates/${estimateId}/share-links`, {
        method: 'POST',
        body: JSON.stringify({ expiresIn }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: qk.shareLinks(vars.estimateId) });
    },
  });
}

export function useRevokeShareLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, estimateId }: { id: number; estimateId: number }) =>
      apiFetch<void>(`/api/share-links/${id}/revoke`, { method: 'POST' }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: qk.shareLinks(vars.estimateId) }),
  });
}

export function usePortalEstimate(token: string) {
  return useQuery({
    queryKey: qk.portalEstimate(token),
    queryFn: () => apiFetch<unknown>(`/api/portal/${token}`),
    enabled: !!token,
  });
}

export function usePortalAction() {
  return useMutation({
    mutationFn: ({
      token,
      action,
      comment,
    }: {
      token: string;
      action: 'approve' | 'reject';
      comment?: string;
    }) =>
      apiFetch<void>(`/api/portal/${token}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ comment }),
      }),
  });
}

// ─── Notifications ────────────────────────────────────────────────────────────

export function useNotifications() {
  return useQuery({
    queryKey: qk.notifications(),
    queryFn: () => apiFetch<Notification[]>('/api/notifications'),
    refetchInterval: 30_000,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: qk.unreadCount(),
    queryFn: () => apiFetch<{ count: number }>('/api/notifications/unread-count'),
    refetchInterval: 30_000,
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>('/api/notifications/mark-all-read', { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.notifications() });
      qc.invalidateQueries({ queryKey: qk.unreadCount() });
    },
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<void>(`/api/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.notifications() });
      qc.invalidateQueries({ queryKey: qk.unreadCount() });
    },
  });
}

export function useNotificationSettings() {
  return useQuery({
    queryKey: qk.notificationSettings(),
    queryFn: () => apiFetch<unknown>('/api/notifications/settings'),
  });
}

export function useUpdateNotificationSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, boolean>) =>
      apiFetch<unknown>('/api/notifications/settings', {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notificationSettings() }),
  });
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export function useBidPerformance(filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: qk.bidPerformance(filters),
    queryFn: () => {
      const params = filters
        ? '?' + new URLSearchParams(filters as Record<string, string>).toString()
        : '';
      return apiFetch<unknown>(`/api/reports/bid-performance${params}`);
    },
  });
}

export function useCostAnalysis(filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: qk.costAnalysis(filters),
    queryFn: () => {
      const params = filters
        ? '?' + new URLSearchParams(filters as Record<string, string>).toString()
        : '';
      return apiFetch<unknown>(`/api/reports/cost-analysis${params}`);
    },
  });
}

export function useEstimatorProductivity(filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: qk.estimatorProductivity(filters),
    queryFn: () => {
      const params = filters
        ? '?' + new URLSearchParams(filters as Record<string, string>).toString()
        : '';
      return apiFetch<unknown>(`/api/reports/estimator-productivity${params}`);
    },
  });
}

export function useBidOutcomes() {
  return useQuery({
    queryKey: qk.bidOutcomes(),
    queryFn: () => apiFetch<BidOutcome[]>('/api/reports/bid-outcomes'),
  });
}

export function useCreateBidOutcome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<BidOutcome>) =>
      apiFetch<BidOutcome>('/api/reports/bid-outcomes', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.bidOutcomes() }),
  });
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export function useCompanySettings() {
  return useQuery({
    queryKey: qk.companySettings(),
    queryFn: () => apiFetch<CompanySettings>('/api/settings/company'),
  });
}

export function useUpdateCompanySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<CompanySettings>) =>
      apiFetch<CompanySettings>('/api/settings/company', {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.companySettings() }),
  });
}

export function useUploadLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('logo', file);
      return apiUpload<{ logoUrl: string }>('/api/settings/company/logo', fd);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.companySettings() }),
  });
}

export function useTestSmtp() {
  return useMutation({
    mutationFn: (body: { email: string }) =>
      apiFetch<void>('/api/settings/smtp/test', { method: 'POST', body: JSON.stringify(body) }),
  });
}

export function useUsers() {
  return useQuery({
    queryKey: qk.users(),
    queryFn: () => apiFetch<User[]>('/api/users'),
  });
}

export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; name: string; role: string }) =>
      apiFetch<User>('/api/users/invite', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.users() }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<User>) =>
      apiFetch<User>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.users() }),
  });
}

export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<void>(`/api/users/${id}/deactivate`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.users() }),
  });
}
