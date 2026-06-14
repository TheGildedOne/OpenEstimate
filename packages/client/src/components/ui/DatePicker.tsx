import React from 'react';
import { Calendar } from 'lucide-react';

export interface DatePickerProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  error?: string;
  helperText?: string;
  containerClassName?: string;
}

export const DatePicker = React.forwardRef<HTMLInputElement, DatePickerProps>(
  (
    { label, error, helperText, containerClassName = '', className = '', id, ...props },
    ref
  ) => {
    const inputId =
      id ?? (label ? `date-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

    const inputClasses = [
      'block w-full rounded-md border bg-white text-gray-900 text-sm',
      'pl-9 pr-3 py-2',
      'transition-colors duration-150',
      'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      'dark:bg-zinc-900 dark:text-zinc-100',
      // Style the date picker chrome
      '[color-scheme:light] dark:[color-scheme:dark]',
      error
        ? 'border-red-500 focus:ring-red-500 dark:border-red-500'
        : 'border-gray-300 dark:border-zinc-700 dark:focus:ring-brand-400',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className={`flex flex-col gap-1 ${containerClassName}`}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-gray-700 dark:text-zinc-300"
          >
            {label}
          </label>
        )}

        <div className="relative flex items-center">
          <span className="absolute left-3 flex items-center text-gray-400 dark:text-zinc-500 pointer-events-none">
            <Calendar className="w-4 h-4" />
          </span>

          <input
            ref={ref}
            type="date"
            id={inputId}
            className={inputClasses}
            aria-invalid={!!error}
            {...props}
          />
        </div>

        {error && (
          <p className="text-xs text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}
        {!error && helperText && (
          <p className="text-xs text-gray-500 dark:text-zinc-500">{helperText}</p>
        )}
      </div>
    );
  }
);

DatePicker.displayName = 'DatePicker';
