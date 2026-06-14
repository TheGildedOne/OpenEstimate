import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useUIStore } from '../store/uiStore';
import { Tooltip } from './ui/Tooltip';

export function DarkModeToggle() {
  const isDarkMode = useUIStore((s) => s.isDarkMode);
  const toggleDarkMode = useUIStore((s) => s.toggleDarkMode);

  return (
    <Tooltip content={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'} position="bottom">
      <button
        onClick={toggleDarkMode}
        className={[
          'flex items-center justify-center w-8 h-8 rounded-lg',
          'text-gray-500 dark:text-zinc-400',
          'hover:bg-gray-100 dark:hover:bg-zinc-800',
          'hover:text-gray-700 dark:hover:text-zinc-200',
          'transition-colors',
        ].join(' ')}
        aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-pressed={isDarkMode}
      >
        {isDarkMode ? (
          <Sun className="w-[18px] h-[18px]" />
        ) : (
          <Moon className="w-[18px] h-[18px]" />
        )}
      </button>
    </Tooltip>
  );
}
