import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  separator?: false;
}

export interface ContextMenuSeparator {
  separator: true;
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator;

export interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuEntry[];
}

export function useContextMenu() {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  const openMenu = useCallback(
    (e: React.MouseEvent, items: ContextMenuEntry[]) => {
      e.preventDefault();
      e.stopPropagation();
      setMenu({ x: e.clientX, y: e.clientY, items });
    },
    []
  );

  const closeMenu = useCallback(() => setMenu(null), []);

  return { menu, openMenu, closeMenu };
}

interface ContextMenuProps {
  menu: ContextMenuState | null;
  onClose: () => void;
}

export function ContextMenu({ menu, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleClick = () => onClose();
    window.addEventListener('keydown', handleKey);
    window.addEventListener('click', handleClick);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('click', handleClick);
    };
  }, [menu, onClose]);

  // Adjust position if menu would overflow viewport
  const [pos, setPos] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    if (!menu || !menuRef.current) return;
    const el = menuRef.current;
    const rect = el.getBoundingClientRect();
    let { x, y } = menu;
    if (x + rect.width > window.innerWidth - 8) {
      x = window.innerWidth - rect.width - 8;
    }
    if (y + rect.height > window.innerHeight - 8) {
      y = window.innerHeight - rect.height - 8;
    }
    setPos({ x, y });
  }, [menu]);

  return createPortal(
    <AnimatePresence>
      {menu && (
        <motion.div
          ref={menuRef}
          role="menu"
          className={[
            'fixed z-[9999] min-w-[10rem] py-1 rounded-lg shadow-lg',
            'bg-white dark:bg-zinc-900',
            'border border-gray-200 dark:border-zinc-700',
          ].join(' ')}
          style={{ left: pos.x || menu.x, top: pos.y || menu.y }}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.1 }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.items.map((entry, idx) => {
            if ('separator' in entry && entry.separator) {
              return (
                <div
                  key={idx}
                  role="separator"
                  className="my-1 border-t border-gray-200 dark:border-zinc-700"
                />
              );
            }

            const item = entry as ContextMenuItem;
            return (
              <button
                key={idx}
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  if (!item.disabled) {
                    item.onClick();
                    onClose();
                  }
                }}
                className={[
                  'flex items-center gap-2.5 w-full px-3 py-1.5 text-sm text-left',
                  'transition-colors',
                  item.danger
                    ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30'
                    : 'text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800',
                  item.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
                ].join(' ')}
              >
                {item.icon && (
                  <span className="shrink-0 w-4 h-4 [&>svg]:w-4 [&>svg]:h-4" aria-hidden>
                    {item.icon}
                  </span>
                )}
                <span className="flex-1">{item.label}</span>
                {item.shortcut && (
                  <kbd className="ml-auto text-xs text-gray-400 dark:text-zinc-500">
                    {item.shortcut}
                  </kbd>
                )}
              </button>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
