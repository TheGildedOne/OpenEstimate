import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  X,
} from 'lucide-react';
import { useUIStore, type Toast as ToastType, type ToastType as ToastVariant } from '../../store/uiStore';

const DEFAULT_DURATION = 4000;

const toastConfig: Record<
  ToastVariant,
  { icon: React.ReactNode; containerClass: string; iconClass: string }
> = {
  success: {
    icon: <CheckCircle className="w-5 h-5" />,
    containerClass:
      'bg-white dark:bg-zinc-900 border-green-500',
    iconClass: 'text-green-500',
  },
  error: {
    icon: <XCircle className="w-5 h-5" />,
    containerClass:
      'bg-white dark:bg-zinc-900 border-red-500',
    iconClass: 'text-red-500',
  },
  warning: {
    icon: <AlertTriangle className="w-5 h-5" />,
    containerClass:
      'bg-white dark:bg-zinc-900 border-amber-500',
    iconClass: 'text-amber-500',
  },
  info: {
    icon: <Info className="w-5 h-5" />,
    containerClass:
      'bg-white dark:bg-zinc-900 border-brand-500',
    iconClass: 'text-brand-500',
  },
};

interface ToastItemProps {
  toast: ToastType;
}

function ToastItem({ toast }: ToastItemProps) {
  const removeToast = useUIStore((s) => s.removeToast);
  const config = toastConfig[toast.type];
  const duration = toast.duration ?? DEFAULT_DURATION;

  useEffect(() => {
    const timer = setTimeout(() => {
      removeToast(toast.id);
    }, duration);
    return () => clearTimeout(timer);
  }, [toast.id, duration, removeToast]);

  return (
    <motion.div
      layout
      key={toast.id}
      initial={{ opacity: 0, x: 64, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 64, scale: 0.95 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={[
        'flex items-start gap-3 w-80 max-w-full rounded-lg shadow-lg',
        'border-l-4 px-4 py-3',
        'dark:shadow-black/40',
        config.containerClass,
      ].join(' ')}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <span className={`shrink-0 mt-0.5 ${config.iconClass}`} aria-hidden>
        {config.icon}
      </span>

      <p className="flex-1 text-sm text-gray-800 dark:text-zinc-200 leading-snug">
        {toast.message}
      </p>

      <button
        onClick={() => removeToast(toast.id)}
        className="shrink-0 -mr-1 -mt-0.5 rounded p-1 text-gray-400 hover:text-gray-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
        aria-label="Dismiss notification"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}

export function ToastContainer() {
  const activeToasts = useUIStore((s) => s.activeToasts);

  return createPortal(
    <div
      className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 items-end pointer-events-none"
      aria-label="Notifications"
    >
      <AnimatePresence mode="popLayout">
        {activeToasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastItem toast={toast} />
          </div>
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );
}
