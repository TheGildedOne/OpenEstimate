import React from 'react';
import { Modal } from './ui/Modal';
import { Keyboard } from 'lucide-react';
import { KEYBOARD_SHORTCUTS } from '../hooks/useKeyboardShortcuts';

interface ShortcutHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutHelp({ isOpen, onClose }: ShortcutHelpProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Keyboard Shortcuts" size="md">
      <div className="space-y-1">
        <p className="text-sm text-gray-500 dark:text-zinc-400 mb-4">
          Use these shortcuts to work faster in OpenEstimate.
        </p>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-zinc-800">
              <th className="text-left pb-2 font-medium text-gray-600 dark:text-zinc-400">
                Shortcut
              </th>
              <th className="text-left pb-2 font-medium text-gray-600 dark:text-zinc-400">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
            {KEYBOARD_SHORTCUTS.map((s, idx) => (
              <tr key={idx}>
                <td className="py-2.5 pr-4">
                  <span className="inline-flex items-center gap-1">
                    {s.keys.map((key, ki) => (
                      <React.Fragment key={ki}>
                        <kbd>{key}</kbd>
                        {ki < s.keys.length - 1 && (
                          <span className="text-gray-400 dark:text-zinc-600">+</span>
                        )}
                      </React.Fragment>
                    ))}
                  </span>
                </td>
                <td className="py-2.5 text-gray-700 dark:text-zinc-300">{s.description}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-zinc-800">
          <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-zinc-600">
            <Keyboard className="w-3.5 h-3.5" />
            <span>Press <kbd>?</kbd> anywhere to toggle this panel</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
