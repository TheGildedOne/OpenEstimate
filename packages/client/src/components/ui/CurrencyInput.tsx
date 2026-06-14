import React, { useState, useRef, useCallback } from 'react';

export interface CurrencyInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'value' | 'onChange' | 'type'
  > {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  label?: string;
  error?: string;
  helperText?: string;
  currency?: string;
  containerClassName?: string;
  allowNegative?: boolean;
}

function formatDisplay(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function parseInput(raw: string): number | null {
  // Strip everything except digits, dots, dashes
  const cleaned = raw.replace(/[^0-9.\-]/g, '');
  if (!cleaned || cleaned === '-') return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  (
    {
      value,
      onChange,
      label,
      error,
      helperText,
      currency = 'USD',
      containerClassName = '',
      className = '',
      allowNegative = false,
      id,
      onBlur,
      onFocus,
      ...props
    },
    ref
  ) => {
    const inputId = id ?? (label ? `currency-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
    const [isFocused, setIsFocused] = useState(false);
    const [rawText, setRawText] = useState('');
    const internalRef = useRef<HTMLInputElement>(null);

    // Merge refs
    const mergedRef = (node: HTMLInputElement | null) => {
      (internalRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
    };

    const displayValue = isFocused
      ? rawText
      : value != null && !isNaN(value)
      ? formatDisplay(value, currency)
      : '';

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      // Show raw numeric string for editing
      setRawText(value != null && !isNaN(value) ? String(value) : '');
      onFocus?.(e);
      // Select all text on focus
      requestAnimationFrame(() => internalRef.current?.select());
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      const parsed = parseInput(rawText);
      const final = parsed != null && !allowNegative ? Math.abs(parsed) : parsed;
      onChange(final ?? null);
      onBlur?.(e);
    };

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        setRawText(e.target.value);
      },
      []
    );

    const inputClasses = [
      'block w-full rounded-md border bg-white text-gray-900 text-sm',
      'pl-3 pr-3 py-2',
      'transition-colors duration-150',
      'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      'dark:bg-zinc-900 dark:text-zinc-100',
      'text-right font-mono',
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

        <input
          ref={mergedRef}
          id={inputId}
          type="text"
          inputMode="decimal"
          className={inputClasses}
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          aria-invalid={!!error}
          {...props}
        />

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

CurrencyInput.displayName = 'CurrencyInput';
