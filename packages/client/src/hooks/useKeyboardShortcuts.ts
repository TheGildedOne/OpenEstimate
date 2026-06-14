import { useEffect, useCallback } from 'react';
import { useEstimateStore } from '../store/estimateStore';

interface ShortcutHandlers {
  onSave?: () => void;
  onFocusSearch?: () => void;
  onOpenHelp?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers = {}) {
  const undo = useEstimateStore((s) => s.undo);
  const redo = useEstimateStore((s) => s.redo);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isEditable =
        tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable;

      // ? → open shortcuts help (only when not in an input)
      if (e.key === '?' && !isEditable && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handlers.onOpenHelp?.();
        return;
      }

      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;

      switch (e.key.toLowerCase()) {
        case 'z':
          if (e.shiftKey) {
            // Ctrl+Shift+Z → redo
            e.preventDefault();
            redo();
          } else {
            e.preventDefault();
            undo();
          }
          break;

        case 'y':
          e.preventDefault();
          redo();
          break;

        case 's':
          e.preventDefault();
          handlers.onSave?.();
          break;

        case '/':
          e.preventDefault();
          handlers.onFocusSearch?.();
          break;

        default:
          break;
      }
    },
    [undo, redo, handlers]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

export const KEYBOARD_SHORTCUTS = [
  { keys: ['?'], description: 'Open keyboard shortcuts help' },
  { keys: ['Ctrl', 'Z'], description: 'Undo last action' },
  { keys: ['Ctrl', 'Y'], description: 'Redo last action' },
  { keys: ['Ctrl', 'S'], description: 'Save estimate' },
  { keys: ['Ctrl', '/'], description: 'Focus global search' },
] as const;
