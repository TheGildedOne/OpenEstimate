import React from 'react';

const shimmerClass =
  'animate-pulse bg-gray-200 dark:bg-zinc-800 rounded';

// ─── SkeletonLine ─────────────────────────────────────────────────────────────

export interface SkeletonLineProps {
  width?: string;
  className?: string;
}

export function SkeletonLine({ width = 'w-full', className = '' }: SkeletonLineProps) {
  return (
    <div
      className={`${shimmerClass} h-4 ${width} ${className}`}
      aria-hidden="true"
    />
  );
}

// ─── SkeletonCard ─────────────────────────────────────────────────────────────

export interface SkeletonCardProps {
  className?: string;
  rows?: number;
}

export function SkeletonCard({ className = '', rows = 3 }: SkeletonCardProps) {
  return (
    <div
      className={`rounded-xl border border-gray-200 dark:border-zinc-800 p-5 ${className}`}
      aria-hidden="true"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className={`${shimmerClass} w-10 h-10 rounded-lg`} />
        <div className="flex-1 space-y-2">
          <SkeletonLine width="w-1/2" />
          <SkeletonLine width="w-1/3" className="h-3" />
        </div>
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonLine key={i} width={i % 2 === 0 ? 'w-full' : 'w-4/5'} />
        ))}
      </div>
    </div>
  );
}

// ─── SkeletonTable ────────────────────────────────────────────────────────────

export interface SkeletonTableProps {
  rows?: number;
  cols?: number;
  className?: string;
}

export function SkeletonTable({ rows = 5, cols = 4, className = '' }: SkeletonTableProps) {
  return (
    <div
      className={`rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden ${className}`}
      aria-hidden="true"
    >
      {/* Header */}
      <div className="grid border-b border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900 px-4 py-3 gap-4"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonLine key={i} width="w-3/4" className="h-3" />
        ))}
      </div>

      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div
          key={rowIdx}
          className="grid px-4 py-3 gap-4 border-b border-gray-100 dark:border-zinc-800 last:border-0"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: cols }).map((_, colIdx) => (
            <SkeletonLine
              key={colIdx}
              width={colIdx === 0 ? 'w-full' : colIdx % 3 === 0 ? 'w-1/2' : 'w-3/4'}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Generic Skeleton wrapper ─────────────────────────────────────────────────

export interface SkeletonProps {
  className?: string;
  width?: string;
  height?: string;
}

export function Skeleton({ className = '', width = 'w-full', height = 'h-4' }: SkeletonProps) {
  return (
    <div
      className={`${shimmerClass} ${width} ${height} ${className}`}
      aria-hidden="true"
    />
  );
}
