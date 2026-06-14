import React from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: SelectOption[];
  placeholder?: string;
  containerClassName?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      error,
      helperText,
      options,
      placeholder,
      containerClassName = '',
      className = '',
      id,
      ...props
    },
    ref
  ) => {
    const selectId =
      id ?? (label ? `select-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

    const selectClasses = [
      'block w-full appearance-none rounded-md border bg-white text-gray-900 text-sm',
      'pl-3 pr-8 py-2',
      'transition-colors duration-150',
      'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      'dark:bg-zinc-900 dark:text-zinc-100',
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
            htmlFor={selectId}
            className="block text-sm font-medium text-gray-700 dark:text-zinc-300"
          >
            {label}
          </label>
        )}

        <div className="relative">
          <select ref={ref} id={selectId} className={selectClasses} aria-invalid={!!error} {...props}>
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))}
          </select>

          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500">
            <ChevronDown className="w-4 h-4" />
          </span>
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

Select.displayName = 'Select';
