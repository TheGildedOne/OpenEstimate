import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface UIPersisted {
  isDarkMode: boolean;
  sidebarCollapsed: boolean;
}

interface UITransient {
  activeToasts: Toast[];
}

interface UIActions {
  toggleDarkMode: () => void;
  setDarkMode: (value: boolean) => void;
  setSidebarCollapsed: (value: boolean) => void;
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showWarning: (message: string) => void;
  showInfo: (message: string) => void;
}

export type UIStore = UIPersisted & UITransient & UIActions;

function applyDarkMode(isDark: boolean) {
  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

let toastIdCounter = 0;

export const useUIStore = create<UIStore>()(
  persist(
    (set, get) => ({
      isDarkMode: false,
      sidebarCollapsed: false,
      activeToasts: [],

      toggleDarkMode: () => {
        const next = !get().isDarkMode;
        applyDarkMode(next);
        set({ isDarkMode: next });
      },

      setDarkMode: (value) => {
        applyDarkMode(value);
        set({ isDarkMode: value });
      },

      setSidebarCollapsed: (value) => {
        set({ sidebarCollapsed: value });
      },

      addToast: (toast) => {
        const id = `toast-${++toastIdCounter}-${Date.now()}`;
        const newToast: Toast = { ...toast, id };
        set((s) => ({ activeToasts: [...s.activeToasts, newToast] }));
        return id;
      },

      removeToast: (id) => {
        set((s) => ({ activeToasts: s.activeToasts.filter((t) => t.id !== id) }));
      },

      showSuccess: (message) => get().addToast({ type: 'success', message }),
      showError: (message) => get().addToast({ type: 'error', message }),
      showWarning: (message) => get().addToast({ type: 'warning', message }),
      showInfo: (message) => get().addToast({ type: 'info', message }),
    }),
    {
      name: 'oe_ui',
      partialize: (state) => ({
        isDarkMode: state.isDarkMode,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyDarkMode(state.isDarkMode);
        }
      },
    }
  )
);
