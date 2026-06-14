import React, { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2,
  SlidersHorizontal,
  Mail,
  HardDrive,
  Users,
  Upload,
  Eye,
  EyeOff,
  Save,
  Loader2,
  Check,
  X,
  Plus,
  Trash2,
  SendHorizonal,
} from 'lucide-react';
import { useCompanySettings, useUpdateCompanySettings, useTestSmtp, useUploadLogo } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import type { CompanySettings } from '@openestimate/shared';

// ── Tabs ───────────────────────────────────────────────────────────────────────

type SettingsTab = 'company' | 'defaults' | 'email' | 'storage' | 'users';

const TABS: Array<{ key: SettingsTab; label: string; icon: React.ReactNode }> = [
  { key: 'company', label: 'Company', icon: <Building2 className="w-4 h-4" /> },
  { key: 'defaults', label: 'Defaults', icon: <SlidersHorizontal className="w-4 h-4" /> },
  { key: 'email', label: 'Email', icon: <Mail className="w-4 h-4" /> },
  { key: 'storage', label: 'Storage', icon: <HardDrive className="w-4 h-4" /> },
  { key: 'users', label: 'Users', icon: <Users className="w-4 h-4" /> },
];

// ── Form field helpers ─────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}

function Field({ label, required, error, children }: FieldProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

const inputClass = "w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors";
const textareaClass = inputClass + " resize-none";

// ── Save feedback button ───────────────────────────────────────────────────────

interface SaveButtonProps {
  loading: boolean;
  saved?: boolean;
  onClick: () => void;
}

function SaveButton({ loading, saved, onClick }: SaveButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
      {loading ? 'Saving…' : saved ? 'Saved!' : 'Save Changes'}
    </button>
  );
}

// ── Company tab ────────────────────────────────────────────────────────────────

function CompanyTab({ settings }: { settings: CompanySettings }) {
  const update = useUpdateCompanySettings();
  const uploadLogo = useUploadLogo();
  const { showSuccess, showError } = useUIStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState(false);

  const schema = z.object({
    companyName: z.string().min(1, 'Required'),
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email('Invalid email').optional().or(z.literal('')),
    licenseNumber: z.string().optional(),
    website: z.string().optional(),
    termsAndConditions: z.string().optional(),
  });
  type FormData = z.infer<typeof schema>;

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      companyName: settings.companyName,
      address: settings.address ?? '',
      phone: settings.phone ?? '',
      email: settings.email ?? '',
      licenseNumber: settings.licenseNumber ?? '',
      termsAndConditions: settings.termsAndConditions ?? '',
    },
  });

  const onSubmit = async (data: FormData) => {
    try {
      await update.mutateAsync({ ...data, email: data.email || null });
      showSuccess('Company settings saved');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { showError('Failed to save settings'); }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadLogo.mutateAsync(file);
      showSuccess('Logo uploaded');
    } catch { showError('Failed to upload logo'); }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Logo */}
      <div className="flex items-start gap-5">
        <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 overflow-hidden flex items-center justify-center bg-gray-50 dark:bg-gray-800">
          {settings.logoUrl ? (
            <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-contain" />
          ) : (
            <Building2 className="w-8 h-8 text-gray-300" />
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Company Logo</p>
          <p className="text-xs text-gray-400 mb-2">PNG, JPG, SVG up to 2MB</p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploadLogo.isPending}
            className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-60"
          >
            {uploadLogo.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Upload Logo
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Company Name" required error={errors.companyName?.message}>
          <input {...register('companyName')} className={inputClass} />
        </Field>
        <Field label="License Number">
          <input {...register('licenseNumber')} className={inputClass} />
        </Field>
        <Field label="Phone">
          <input {...register('phone')} className={inputClass} />
        </Field>
        <Field label="Email" error={errors.email?.message}>
          <input type="email" {...register('email')} className={inputClass} />
        </Field>
      </div>

      <Field label="Address">
        <textarea {...register('address')} rows={2} className={textareaClass} />
      </Field>

      <Field label="Terms & Conditions">
        <textarea {...register('termsAndConditions')} rows={6} className={textareaClass} placeholder="Enter your terms and conditions text…" />
      </Field>

      <div className="flex justify-end">
        <SaveButton loading={isSubmitting} saved={saved} onClick={handleSubmit(onSubmit)} />
      </div>
    </form>
  );
}

// ── Defaults tab ───────────────────────────────────────────────────────────────

function DefaultsTab({ settings }: { settings: CompanySettings }) {
  const update = useUpdateCompanySettings();
  const { showSuccess, showError } = useUIStore();
  const [saved, setSaved] = useState(false);
  const [customUnits, setCustomUnits] = useState<string[]>(settings.customUnits ?? []);
  const [newUnit, setNewUnit] = useState('');

  const schema = z.object({
    defaultOverheadPct: z.number().min(0).max(100),
    defaultProfitPct: z.number().min(0).max(100),
    defaultTaxPct: z.number().min(0).max(100),
    defaultBondPct: z.number().min(0).max(100),
    defaultLaborRate: z.number().min(0),
    defaultWasteFactorPct: z.number().min(0).max(100),
    currency: z.string().min(1),
    timezone: z.string().min(1),
    fiscalYearStartMonth: z.number().min(1).max(12),
  });
  type FormData = z.infer<typeof schema>;

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      defaultOverheadPct: settings.defaultOverheadPct,
      defaultProfitPct: settings.defaultProfitPct,
      defaultTaxPct: settings.defaultTaxPct,
      defaultBondPct: settings.defaultBondPct,
      defaultLaborRate: settings.defaultLaborRate,
      defaultWasteFactorPct: settings.defaultWasteFactorPct,
      currency: settings.currency,
      timezone: settings.timezone,
      fiscalYearStartMonth: settings.fiscalYearStartMonth,
    },
  });

  const onSubmit = async (data: FormData) => {
    try {
      await update.mutateAsync({ ...data, customUnits });
      showSuccess('Defaults saved');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { showError('Failed to save defaults'); }
  };

  const addUnit = () => {
    const u = newUnit.trim().toUpperCase();
    if (u && !customUnits.includes(u)) { setCustomUnits((prev) => [...prev, u]); }
    setNewUnit('');
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Cost Markup Defaults</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { key: 'defaultOverheadPct', label: 'Overhead %' },
            { key: 'defaultProfitPct', label: 'Profit %' },
            { key: 'defaultTaxPct', label: 'Tax %' },
            { key: 'defaultBondPct', label: 'Bond %' },
          ].map(({ key, label }) => (
            <Field key={key} label={label} error={(errors as Record<string, { message?: string }>)[key]?.message}>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  {...register(key as keyof FormData, { valueAsNumber: true })}
                  className={inputClass + ' pr-8'}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
              </div>
            </Field>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Labor & Waste</h3>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Default Labor Rate ($/hr)">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input type="number" step="0.01" min="0" {...register('defaultLaborRate', { valueAsNumber: true })} className={inputClass + ' pl-7'} />
            </div>
          </Field>
          <Field label="Default Waste Factor %">
            <div className="relative">
              <input type="number" step="0.1" min="0" max="100" {...register('defaultWasteFactorPct', { valueAsNumber: true })} className={inputClass + ' pr-8'} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
            </div>
          </Field>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Regional & Time</h3>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Currency">
            <select {...register('currency')} className={inputClass}>
              <option value="USD">USD</option>
              <option value="CAD">CAD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="AUD">AUD</option>
            </select>
          </Field>
          <Field label="Timezone">
            <select {...register('timezone')} className={inputClass}>
              <option value="America/New_York">Eastern</option>
              <option value="America/Chicago">Central</option>
              <option value="America/Denver">Mountain</option>
              <option value="America/Los_Angeles">Pacific</option>
              <option value="America/Anchorage">Alaska</option>
              <option value="Pacific/Honolulu">Hawaii</option>
              <option value="UTC">UTC</option>
            </select>
          </Field>
          <Field label="Fiscal Year Start">
            <select {...register('fiscalYearStartMonth', { valueAsNumber: true })} className={inputClass}>
              {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      {/* Custom units */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Custom Units</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {customUnits.map((u) => (
            <span key={u} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-xs font-medium">
              {u}
              <button type="button" onClick={() => setCustomUnits((prev) => prev.filter((x) => x !== u))} className="text-orange-400 hover:text-orange-600">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newUnit}
            onChange={(e) => setNewUnit(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addUnit(); } }}
            placeholder="e.g. ACRE"
            className="w-28 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <button type="button" onClick={addUnit} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg">
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <SaveButton loading={isSubmitting} saved={saved} onClick={handleSubmit(onSubmit)} />
      </div>
    </form>
  );
}

// ── Email tab ──────────────────────────────────────────────────────────────────

function EmailTab({ settings }: { settings: CompanySettings }) {
  const update = useUpdateCompanySettings();
  const testSmtp = useTestSmtp();
  const { showSuccess, showError } = useUIStore();
  const [showPass, setShowPass] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);

  const schema = z.object({
    smtpHost: z.string().optional(),
    smtpPort: z.number().int().min(1).max(65535).optional(),
    smtpSecure: z.boolean().optional(),
    smtpUser: z.string().optional(),
    smtpPass: z.string().optional(),
    smtpFrom: z.string().email().optional().or(z.literal('')),
  });
  type FormData = z.infer<typeof schema>;

  const { register, handleSubmit, getValues, formState: { isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      smtpHost: settings.smtpHost ?? '',
      smtpPort: settings.smtpPort ?? 587,
      smtpSecure: settings.smtpSecure ?? false,
      smtpUser: settings.smtpUser ?? '',
      smtpPass: '',
      smtpFrom: settings.smtpFrom ?? '',
    },
  });

  const onSubmit = async (data: FormData) => {
    try {
      await update.mutateAsync(data);
      showSuccess('Email settings saved');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { showError('Failed to save email settings'); }
  };

  const handleTest = async () => {
    if (!testEmail) { showError('Enter a test email address'); return; }
    setTesting(true);
    try {
      await testSmtp.mutateAsync({ email: testEmail });
      showSuccess('Test email sent! Check your inbox.');
    } catch { showError('SMTP test failed. Check your settings.'); }
    finally { setTesting(false); }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 text-sm text-amber-800 dark:text-amber-300">
        Configure SMTP to send estimates and notifications via email. Credentials are stored encrypted.
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="SMTP Host">
          <input {...register('smtpHost')} placeholder="smtp.example.com" className={inputClass} />
        </Field>
        <Field label="SMTP Port">
          <input type="number" {...register('smtpPort', { valueAsNumber: true })} className={inputClass} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="SMTP Username">
          <input {...register('smtpUser')} className={inputClass} />
        </Field>
        <Field label="SMTP Password">
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              {...register('smtpPass')}
              placeholder="(leave blank to keep current)"
              className={inputClass + ' pr-10'}
            />
            <button type="button" onClick={() => setShowPass((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="From Address">
          <input type="email" {...register('smtpFrom')} placeholder="noreply@company.com" className={inputClass} />
        </Field>
        <Field label="Secure (TLS)">
          <label className="flex items-center gap-2 mt-2 cursor-pointer">
            <input type="checkbox" {...register('smtpSecure')} className="w-4 h-4 rounded border-gray-300 accent-orange-500" />
            <span className="text-sm text-gray-700 dark:text-gray-300">Use TLS/SSL</span>
          </label>
        </Field>
      </div>

      {/* Test email */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Send Test Email</h3>
        <div className="flex gap-2">
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="your@email.com"
            className={inputClass}
          />
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg whitespace-nowrap disabled:opacity-60"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <SendHorizonal className="w-4 h-4" />}
            Test
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <SaveButton loading={isSubmitting} saved={saved} onClick={handleSubmit(onSubmit)} />
      </div>
    </form>
  );
}

// ── Storage tab ────────────────────────────────────────────────────────────────

function StorageTab() {
  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Storage Usage</h3>
        <div className="space-y-3">
          {[
            { label: 'Documents', used: 124, total: 1000, color: 'bg-blue-500' },
            { label: 'Logos & Images', used: 8, total: 100, color: 'bg-orange-500' },
            { label: 'Exports & Reports', used: 47, total: 500, color: 'bg-green-500' },
          ].map(({ label, used, total, color }) => (
            <div key={label}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-600 dark:text-gray-400">{label}</span>
                <span className="text-gray-500 font-mono">{used} MB / {total} MB</span>
              </div>
              <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div className={`h-full ${color} rounded-full`} style={{ width: `${(used / total) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-gray-400 text-center">Contact your administrator to increase storage limits.</p>
    </div>
  );
}

// ── Users tab (link to UserManagement) ────────────────────────────────────────

function UsersTab() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
      <Users className="w-12 h-12 mb-3 opacity-30" />
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">User Management is on a dedicated page.</p>
      <a href="/users" className="mt-3 text-sm text-orange-500 hover:underline">Go to User Management →</a>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function Settings() {
  const user = useAuthStore((s) => s.user);
  const [activeTab, setActiveTab] = useState<SettingsTab>('company');
  const { data: settings, isLoading } = useCompanySettings();

  if (user?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 flex-col gap-3">
        <Building2 className="w-12 h-12 opacity-30" />
        <p className="text-base font-medium text-gray-500 dark:text-gray-400">Admin access required</p>
        <p className="text-sm">Contact your administrator to access company settings.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar tabs */}
      <div className="w-52 flex-shrink-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="px-4 py-4 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-base font-semibold text-gray-900 dark:text-white">Settings</h1>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                activeTab === tab.key
                  ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        {isLoading ? (
          <div className="space-y-4 max-w-2xl">
            {[1,2,3,4].map((i) => <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />)}
          </div>
        ) : !settings ? (
          <div className="text-gray-400 text-sm">Failed to load settings</div>
        ) : (
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.15 }}
            className="max-w-2xl"
          >
            {activeTab === 'company' && <CompanyTab settings={settings} />}
            {activeTab === 'defaults' && <DefaultsTab settings={settings} />}
            {activeTab === 'email' && <EmailTab settings={settings} />}
            {activeTab === 'storage' && <StorageTab />}
            {activeTab === 'users' && <UsersTab />}
          </motion.div>
        )}
      </div>
    </div>
  );
}
