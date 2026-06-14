import { create } from 'zustand';
import type { User } from '@openestimate/shared';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
}

interface AuthActions {
  setAuth: (user: User, token: string) => void;
  clearAuth: () => void;
  initialize: () => Promise<void>;
  setToken: (token: string | null) => void;
}

export type AuthStore = AuthState & AuthActions;

const USER_STORAGE_KEY = 'oe_user';

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  accessToken: null,
  isLoading: true,

  setAuth: (user, token) => {
    try {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } catch {
      // ignore storage errors
    }
    set({ user, accessToken: token, isLoading: false });
  },

  clearAuth: () => {
    try {
      localStorage.removeItem(USER_STORAGE_KEY);
    } catch {
      // ignore
    }
    set({ user: null, accessToken: null, isLoading: false });
  },

  setToken: (token) => {
    set({ accessToken: token });
  },

  initialize: async () => {
    set({ isLoading: true });
    try {
      const stored = localStorage.getItem(USER_STORAGE_KEY);
      if (!stored) {
        set({ isLoading: false });
        return;
      }
      const user: User = JSON.parse(stored);

      // Try to refresh/validate the session via the refresh endpoint
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        set({
          user: data.data?.user ?? user,
          accessToken: data.data?.accessToken ?? null,
          isLoading: false,
        });
      } else {
        // Refresh failed — clear everything
        localStorage.removeItem(USER_STORAGE_KEY);
        set({ user: null, accessToken: null, isLoading: false });
      }
    } catch {
      // Network error or parse error — clear to be safe
      localStorage.removeItem(USER_STORAGE_KEY);
      set({ user: null, accessToken: null, isLoading: false });
    }
  },
}));
