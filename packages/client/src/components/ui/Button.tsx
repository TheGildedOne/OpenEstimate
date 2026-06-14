import React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  as?: 'button' | 'a';
  href?: string;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 focus-visible:ring-brand-500 dark:bg-brand-500 dark:hover:bg-brand-600 dark:active:bg-brand-700',
  secondary:
    'bg-gray-100 text-gray-900 hover:bg-gray-200 active:bg-gray-300 focus-visible:ring-gray-400 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700 dark:active:bg-zinc-600',
  ghost:
    'bg-transparent text-gray-700 hover:bg-gray-100 active:bg-gray-200 focus-visible:ring-gray-400 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:active:bg-zinc-700',
  danger:
    'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 focus-visible:ring-red-500 dark:bg-red-700 dark:hover:bg-red-600',
  outline:
    'border border-gray-300 bg-transparent text-gray-700 hover:bg-gray-50 active:bg-gray-100 focus-visible:ring-gray-400 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:active:bg-zinc-700',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-5 text-base gap-2.5',
};

const iconSizeClasses: Record<ButtonSize, string> = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading;

    const baseClasses = [
      'inline-flex items-center justify-center font-medium rounded-md',
      'transition-colors duration-150',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-950',
      'disabled:opacity-50 disabled:pointer-events-none',
      'select-none',
      variantClasses[variant],
      sizeClasses[size],
      fullWidth ? 'w-full' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        aria-busy={isLoading}
        aria-disabled={isDisabled}
        className={baseClasses}
        {...props}
      >
        {isLoading ? (
          <Loader2 className={`animate-spin ${iconSizeClasses[size]}`} aria-hidden />
        ) : leftIcon ? (
          <span className={`shrink-0 ${iconSizeClasses[size]}`} aria-hidden>
            {leftIcon}
          </span>
        ) : null}

        {children && <span>{children}</span>}

        {!isLoading && rightIcon ? (
          <span className={`shrink-0 ${iconSizeClasses[size]}`} aria-hidden>
            {rightIcon}
          </span>
        ) : null}
      </button>
    );
  }
);

Button.displayName = 'Button';
