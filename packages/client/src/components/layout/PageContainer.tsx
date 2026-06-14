import React from 'react';
import { useUIStore } from '../../store/uiStore';

export interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  /** Remove default max-width and padding for full-bleed layouts */
  fluid?: boolean;
  /** Optional title rendered inside the container */
  title?: string;
  /** Optional action area beside the title */
  actions?: React.ReactNode;
}

export function PageContainer({
  children,
  className = '',
  fluid = false,
  title,
  actions,
}: PageContainerProps) {
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);

  return (
    <main
      className={[
        'min-h-screen transition-all duration-200',
        sidebarCollapsed ? 'pl-16' : 'pl-56',
        'pt-14', // header height offset
      ].join(' ')}
    >
      <div
        className={[
          fluid ? '' : 'max-w-7xl mx-auto px-4 sm:px-6 py-6',
          className,
        ].join(' ')}
      >
        {(title || actions) && (
          <div className="flex items-center justify-between mb-6">
            {title && (
              <h1 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">{title}</h1>
            )}
            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </div>
        )}

        {children}
      </div>
    </main>
  );
}
