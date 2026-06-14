import React from 'react';
import type { ProjectStatus } from '@openestimate/shared';

export type BadgeVariant =
  | 'default'
  | 'gray'
  | 'blue'
  | 'purple'
  | 'green'
  | 'red'
  | 'amber'
  | 'stone';

const variantClasses: Record<BadgeVariant, string> = {
  default:
    'bg-gray-100 text-gray-700 dark:bg-zinc-800 dark:text-zinc-300',
  gray:
    'bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400',
  blue:
    'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
  purple:
    'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400',
  green:
    'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
  red:
    'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
  amber:
    'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  stone:
    'bg-stone-100 text-stone-600 dark:bg-stone-900 dark:text-stone-400',
};

const statusToVariant: Record<ProjectStatus, BadgeVariant> = {
  draft: 'gray',
  bidding: 'blue',
  submitted: 'purple',
  won: 'green',
  lost: 'red',
  archived: 'stone',
};

const statusLabels: Record<ProjectStatus, string> = {
  draft: 'Draft',
  bidding: 'Bidding',
  submitted: 'Submitted',
  won: 'Won',
  lost: 'Lost',
  archived: 'Archived',
};

export interface BadgeProps {
  variant?: BadgeVariant;
  status?: ProjectStatus;
  children?: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md';
}

export function Badge({ variant, status, children, className = '', size = 'md' }: BadgeProps) {
  const resolvedVariant: BadgeVariant = status
    ? statusToVariant[status]
    : (variant ?? 'default');

  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-xs px-2.5 py-1';

  return (
    <span
      className={[
        'inline-flex items-center gap-1 font-medium rounded-full leading-none',
        sizeClass,
        variantClasses[resolvedVariant],
        className,
      ].join(' ')}
    >
      {children ?? (status ? statusLabels[status] : null)}
    </span>
  );
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <Badge status={status} />;
}
