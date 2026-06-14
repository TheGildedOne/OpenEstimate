import React, { useEffect, useRef, useState, Suspense, lazy } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  Outlet,
} from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { ToastContainer } from './components/ui/Toast';
import { ShortcutHelp } from './components/ShortcutHelp';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { SkeletonCard } from './components/ui/Skeleton';

// ─── Lazy page imports ────────────────────────────────────────────────────────

const LoginPage = lazy(() => import('./pages/Login'));
const OnboardingPage = lazy(() => import('./pages/Onboarding'));
const DashboardPage = lazy(() => import('./pages/Dashboard'));
const ProjectListPage = lazy(() => import('./pages/Projects/ProjectList'));
const ProjectDetailPage = lazy(() => import('./pages/Projects/ProjectDetail/index'));
const EstimateBuilderPage = lazy(() => import('./pages/EstimateBuilder/index'));
const CostDatabasePage = lazy(() => import('./pages/CostDatabase/index'));
const SubcontractorDirectoryPage = lazy(
  () => import('./pages/Subcontractors/SubcontractorDirectory')
);
const TemplatesPage = lazy(() => import('./pages/Templates/Templates'));
const ReportsPage = lazy(() => import('./pages/Reports/Reports'));
const SettingsPage = lazy(() => import('./pages/Settings/Settings'));
const UserManagementPage = lazy(() => import('./pages/Settings/UserManagement'));
const ClientPortalView = lazy(() => import('./pages/ClientPortal/ClientPortalView'));

// ─── Page suspense fallback ───────────────────────────────────────────────────

function PageLoader() {
  return (
    <div className="p-6 space-y-4">
      <SkeletonCard />
      <SkeletonCard rows={5} />
    </div>
  );
}

// ─── Auth guards ──────────────────────────────────────────────────────────────

function ProtectedRoute() {
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);
  const location = useLocation();

  if (isLoading) return <PageLoader />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
}

function AdminRoute() {
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);

  if (isLoading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/" replace />;
  return <Outlet />;
}

// ─── App shell with keyboard shortcuts ───────────────────────────────────────

function AppShell() {
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const handleSave = () => {
    // Trigger save via custom event — EstimateBuilder listens
    window.dispatchEvent(new CustomEvent('oe:save'));
  };

  const handleFocusSearch = () => {
    searchRef.current?.focus();
    searchRef.current?.select();
  };

  useKeyboardShortcuts({
    onSave: handleSave,
    onFocusSearch: handleFocusSearch,
    onOpenHelp: () => setShortcutHelpOpen((o) => !o),
  });

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <Sidebar />
      <div className="flex flex-col min-h-screen">
        <Header searchRef={searchRef} />
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </div>
      <ShortcutHelp
        isOpen={shortcutHelpOpen}
        onClose={() => setShortcutHelpOpen(false)}
      />
    </div>
  );
}

// ─── App initializer ──────────────────────────────────────────────────────────

function AppInitializer({ children }: { children: React.ReactNode }) {
  const initialize = useAuthStore((s) => s.initialize);
  const isLoading = useAuthStore((s) => s.isLoading);
  // uiStore rehydrates automatically via zustand/middleware persist

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
            <span className="text-white text-sm font-bold">OE</span>
          </div>
          <div className="w-5 h-5 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <AppInitializer>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={
            <Suspense fallback={<PageLoader />}>
              <LoginPage />
            </Suspense>
          } />
          <Route path="/portal/:token" element={
            <Suspense fallback={<PageLoader />}>
              <ClientPortalView />
            </Suspense>
          } />

          {/* Authenticated shell */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              {/* First-time onboarding */}
              <Route path="/onboarding" element={<OnboardingPage />} />

              {/* Main app routes */}
              <Route index element={<DashboardPage />} />
              <Route path="projects" element={<ProjectListPage />} />
              <Route path="projects/:id" element={<ProjectDetailPage />} />
              <Route
                path="projects/:id/estimates/:estimateId"
                element={<EstimateBuilderPage />}
              />
              <Route path="cost-database" element={<CostDatabasePage />} />
              <Route path="subcontractors" element={<SubcontractorDirectoryPage />} />
              <Route path="templates" element={<TemplatesPage />} />
              <Route path="reports" element={<ReportsPage />} />

              {/* Admin-only routes */}
              <Route element={<AdminRoute />}>
                <Route path="settings" element={<SettingsPage />} />
                <Route path="users" element={<UserManagementPage />} />
              </Route>
            </Route>
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        <ToastContainer />
      </AppInitializer>
    </BrowserRouter>
  );
}
