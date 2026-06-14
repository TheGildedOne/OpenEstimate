import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderOpen,
  Database,
  Users,
  FileText,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Bell,
  LogOut,
} from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { useLogout, useUnreadCount } from '../../lib/api';
import { Tooltip } from '../ui/Tooltip';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  exact?: boolean;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" />, exact: true },
  { to: '/projects', label: 'Projects', icon: <FolderOpen className="w-5 h-5" /> },
  { to: '/cost-database', label: 'Cost Database', icon: <Database className="w-5 h-5" /> },
  { to: '/subcontractors', label: 'Subcontractors', icon: <Users className="w-5 h-5" /> },
  { to: '/templates', label: 'Templates', icon: <FileText className="w-5 h-5" /> },
  { to: '/reports', label: 'Reports', icon: <BarChart3 className="w-5 h-5" /> },
  { to: '/settings', label: 'Settings', icon: <Settings className="w-5 h-5" />, adminOnly: true },
];

function UserInitials({ name }: { name: string }) {
  const parts = name.trim().split(' ');
  const initials =
    parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : name.slice(0, 2).toUpperCase();
  return <span className="text-xs font-semibold">{initials}</span>;
}

export function Sidebar() {
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useUIStore((s) => s.setSidebarCollapsed);
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const logout = useLogout();
  const { data: unreadData } = useUnreadCount();
  const unreadCount = unreadData?.count ?? 0;

  const handleLogout = async () => {
    try {
      await logout.mutateAsync();
    } catch {
      // ignore
    } finally {
      navigate('/login');
    }
  };

  return (
    <aside
      className={[
        'fixed left-0 top-0 bottom-0 z-40 flex flex-col',
        'bg-white dark:bg-zinc-950 border-r border-gray-200 dark:border-zinc-800',
        'transition-all duration-200 ease-in-out',
        sidebarCollapsed ? 'w-16' : 'w-56',
      ].join(' ')}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 h-14 px-4 border-b border-gray-200 dark:border-zinc-800 shrink-0">
        <div className="shrink-0 w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center">
          <span className="text-white text-xs font-bold">OE</span>
        </div>
        {!sidebarCollapsed && (
          <span className="font-semibold text-gray-900 dark:text-zinc-100 text-sm tracking-tight whitespace-nowrap">
            OpenEstimate
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {NAV_ITEMS.filter((item) => {
          if (item.adminOnly && user?.role !== 'admin') return false;
          return true;
        }).map((item) => (
          <Tooltip
            key={item.to}
            content={item.label}
            position="right"
            disabled={!sidebarCollapsed}
          >
            <NavLink
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium',
                  'transition-colors duration-150',
                  isActive
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-400'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100',
                ].join(' ')
              }
            >
              <span className="shrink-0">{item.icon}</span>
              {!sidebarCollapsed && (
                <span className="truncate">{item.label}</span>
              )}
            </NavLink>
          </Tooltip>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-gray-200 dark:border-zinc-800 p-2 space-y-1">
        {/* Notifications */}
        <Tooltip content="Notifications" position="right" disabled={!sidebarCollapsed}>
          <button
            onClick={() => navigate('/notifications')}
            className={[
              'flex items-center gap-3 w-full px-2.5 py-2 rounded-lg text-sm',
              'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
              'dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100',
              'transition-colors',
            ].join(' ')}
          >
            <span className="shrink-0 relative">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </span>
            {!sidebarCollapsed && <span>Notifications</span>}
          </button>
        </Tooltip>

        {/* User */}
        {user && (
          <div
            className={[
              'flex items-center gap-2.5 px-2.5 py-2 rounded-lg',
              sidebarCollapsed ? 'justify-center' : '',
            ].join(' ')}
          >
            <div className="shrink-0 w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-950 text-brand-700 dark:text-brand-300 flex items-center justify-center">
              <UserInitials name={user.name} />
            </div>
            {!sidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-900 dark:text-zinc-100 truncate">
                  {user.name}
                </p>
                <p className="text-xs text-gray-500 dark:text-zinc-500 truncate capitalize">
                  {user.role}
                </p>
              </div>
            )}
            {!sidebarCollapsed && (
              <Tooltip content="Sign out" position="right">
                <button
                  onClick={handleLogout}
                  className="shrink-0 p-1 rounded text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  aria-label="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </Tooltip>
            )}
          </div>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className={[
          'absolute -right-3 top-1/2 -translate-y-1/2',
          'w-6 h-6 rounded-full shadow-md',
          'bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700',
          'flex items-center justify-center',
          'text-gray-500 dark:text-zinc-400',
          'hover:text-gray-700 dark:hover:text-zinc-200 transition-colors',
          'z-50',
        ].join(' ')}
        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {sidebarCollapsed ? (
          <ChevronRight className="w-3 h-3" />
        ) : (
          <ChevronLeft className="w-3 h-3" />
        )}
      </button>
    </aside>
  );
}
