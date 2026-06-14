import React from 'react';
import { Button, type ButtonProps } from './Button';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: ButtonProps['variant'];
  icon?: React.ReactNode;
}

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center text-center py-16 px-6',
        className,
      ].join(' ')}
    >
      {icon && (
        <div className="mb-4 text-gray-300 dark:text-zinc-600 [&>svg]:w-12 [&>svg]:h-12">
          {icon}
        </div>
      )}

      <h3 className="text-base font-semibold text-gray-900 dark:text-zinc-100 mb-1">
        {title}
      </h3>

      {description && (
        <p className="text-sm text-gray-500 dark:text-zinc-400 max-w-sm mb-6 text-balance">
          {description}
        </p>
      )}

      {action && (
        <Button
          variant={action.variant ?? 'primary'}
          onClick={action.onClick}
          leftIcon={action.icon}
          size="md"
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}
