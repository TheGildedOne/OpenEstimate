import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Building2, Loader2, X, Mail, Lock } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';

// ── Schemas ──────────────────────────────────────────────────────────────────

const LoginSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
});
type LoginFormData = z.infer<typeof LoginSchema>;

const ForgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email'),
});
type ForgotPasswordFormData = z.infer<typeof ForgotPasswordSchema>;

// ── API helpers (inline since we don't know exact hook signatures) ─────────────

async function loginApi(data: { email: string; password: string; rememberMe?: boolean }) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Login failed' }));
    throw new Error(err.error || 'Invalid email or password');
  }
  return res.json();
}

async function forgotPasswordApi(email: string) {
  const res = await fetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed. Please try again.');
  }
  return res.json();
}

// ── Forgot Password Modal ─────────────────────────────────────────────────────

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function ForgotPasswordModal({ isOpen, onClose }: ForgotPasswordModalProps) {
  const { showSuccess, showError } = useUIStore();
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(ForgotPasswordSchema),
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    try {
      await forgotPasswordApi(data.email);
      setSubmitted(true);
      showSuccess('Password reset email sent. Check your inbox.');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Request failed');
    }
  };

  const handleClose = () => {
    reset();
    setSubmitted(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Reset password
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
              Enter your email and we'll send you a reset link.
            </p>

            {submitted ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-6"
              >
                <div className="w-14 h-14 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-7 h-7 text-green-600 dark:text-green-400" />
                </div>
                <p className="text-gray-700 dark:text-gray-300 font-medium">Check your inbox</p>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                  We've sent a reset link to your email.
                </p>
                <button
                  onClick={handleClose}
                  className="mt-6 w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors"
                >
                  Done
                </button>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Email address
                  </label>
                  <input
                    {...register('email')}
                    type="email"
                    autoComplete="email"
                    placeholder="you@company.com"
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  />
                  {errors.email && (
                    <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Send reset link
                </button>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Login Page ────────────────────────────────────────────────────────────────

export default function Login() {
  const navigate = useNavigate();
  const { showError, setAuth } = useUIStore() as ReturnType<typeof useUIStore> & {
    setAuth?: (user: unknown, token: string) => void;
  };
  const [showPassword, setShowPassword] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  // Import authStore action
  const setAuthStore = React.useMemo(() => {
    try {
      // Dynamic access to avoid circular imports at module level
      const { useAuthStore } = require('@/store/authStore');
      return useAuthStore.getState().setAuth as (user: unknown, token: string) => void;
    } catch {
      return null;
    }
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { rememberMe: false },
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      const result = await loginApi(data);
      const { user, accessToken } = result.data ?? result;

      // Store auth state
      if (setAuthStore) {
        setAuthStore(user, accessToken);
      } else {
        // Fallback: import dynamically
        const { useAuthStore } = await import('@/store/authStore');
        useAuthStore.getState().setAuth(user, accessToken);
      }

      navigate('/dashboard', { replace: true });
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gray-50 dark:bg-gray-950">
      {/* Animated gradient background */}
      <motion.div
        className="absolute inset-0 z-0"
        animate={{
          background: [
            'radial-gradient(ellipse at 20% 50%, rgba(251,146,60,0.12) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(249,115,22,0.08) 0%, transparent 60%), radial-gradient(ellipse at 60% 80%, rgba(234,88,12,0.06) 0%, transparent 60%)',
            'radial-gradient(ellipse at 60% 30%, rgba(251,146,60,0.10) 0%, transparent 60%), radial-gradient(ellipse at 20% 80%, rgba(249,115,22,0.10) 0%, transparent 60%), radial-gradient(ellipse at 90% 60%, rgba(234,88,12,0.08) 0%, transparent 60%)',
            'radial-gradient(ellipse at 40% 70%, rgba(251,146,60,0.12) 0%, transparent 60%), radial-gradient(ellipse at 70% 10%, rgba(249,115,22,0.08) 0%, transparent 60%), radial-gradient(ellipse at 10% 40%, rgba(234,88,12,0.06) 0%, transparent 60%)',
          ],
        }}
        transition={{ duration: 12, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
      />

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 z-0 opacity-[0.03] dark:opacity-[0.05]"
        style={{
          backgroundImage:
            'linear-gradient(#000 1px, transparent 1px), linear-gradient(to right, #000 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <ForgotPasswordModal isOpen={forgotOpen} onClose={() => setForgotOpen(false)} />

      <motion.div
        className="relative z-10 w-full max-w-md px-4"
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        {/* Logo + Title */}
        <div className="text-center mb-8">
          <motion.div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-500 shadow-lg shadow-orange-500/30 mb-4"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 260, damping: 20 }}
          >
            <Building2 className="w-8 h-8 text-white" />
          </motion.div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
            OpenEstimate
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
            Construction estimating, simplified
          </p>
        </div>

        {/* Card */}
        <motion.div
          className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl shadow-gray-200/50 dark:shadow-black/40 border border-gray-100 dark:border-gray-800 p-8"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4 }}
        >
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Sign in</h2>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  id="email"
                  {...register('email')}
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all text-sm"
                />
              </div>
              {errors.email && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-1.5 text-xs text-red-500"
                >
                  {errors.email.message}
                </motion.p>
              )}
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  id="password"
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-1.5 text-xs text-red-500"
                >
                  {errors.password.message}
                </motion.p>
              )}
            </div>

            {/* Remember me + Forgot password */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  {...register('rememberMe')}
                  type="checkbox"
                  className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-orange-500 focus:ring-orange-500 bg-white dark:bg-gray-800"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">Remember me</span>
              </label>
              <button
                type="button"
                onClick={() => setForgotOpen(true)}
                className="text-sm text-orange-500 hover:text-orange-600 font-medium transition-colors"
              >
                Forgot password?
              </button>
            </div>

            {/* Submit */}
            <motion.button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-lg font-semibold text-sm transition-colors flex items-center justify-center gap-2 shadow-md shadow-orange-500/25"
              whileTap={{ scale: 0.98 }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </motion.button>
          </form>
        </motion.div>

        <p className="text-center text-xs text-gray-400 dark:text-gray-600 mt-6">
          &copy; {new Date().getFullYear()} OpenEstimate. All rights reserved.
        </p>
      </motion.div>
    </div>
  );
}
