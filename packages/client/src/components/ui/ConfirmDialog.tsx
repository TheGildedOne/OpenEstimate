import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { AlertTriangle } from 'lucide-react';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  isDangerous?: boolean;
  isLoading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDangerous = true,
  isLoading = false,
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button
            variant={isDangerous ? 'danger' : 'primary'}
            onClick={handleConfirm}
            isLoading={isLoading}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="flex gap-3">
        {isDangerous && (
          <div className="shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
        )}
        <p className="text-sm text-gray-600 dark:text-zinc-400 leading-relaxed">
          {message}
        </p>
      </div>
    </Modal>
  );
}

// ─── Hook for imperative usage ────────────────────────────────────────────────

interface UseConfirmDialogOptions {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  isDangerous?: boolean;
}

export function useConfirmDialog() {
  const [state, setState] = React.useState<{
    isOpen: boolean;
    options: UseConfirmDialogOptions | null;
    resolve: ((v: boolean) => void) | null;
  }>({ isOpen: false, options: null, resolve: null });

  const confirm = React.useCallback(
    (options: UseConfirmDialogOptions): Promise<boolean> => {
      return new Promise((resolve) => {
        setState({ isOpen: true, options, resolve });
      });
    },
    []
  );

  const close = React.useCallback(() => {
    state.resolve?.(false);
    setState({ isOpen: false, options: null, resolve: null });
  }, [state]);

  const handleConfirm = React.useCallback(() => {
    state.resolve?.(true);
    setState({ isOpen: false, options: null, resolve: null });
  }, [state]);

  const dialog = state.options ? (
    <ConfirmDialog
      isOpen={state.isOpen}
      onClose={close}
      onConfirm={handleConfirm}
      title={state.options.title}
      message={state.options.message}
      confirmLabel={state.options.confirmLabel}
      cancelLabel={state.options.cancelLabel}
      isDangerous={state.options.isDangerous}
    />
  ) : null;

  return { confirm, dialog };
}
