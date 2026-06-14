import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle,
  ChevronRight,
  Building2,
  DollarSign,
  Database,
  Rocket,
  Upload,
  X,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { useUpdateCompanySettings, useUploadLogo } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { FileUpload } from '@/components/FileUpload';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const companySchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  licenseNumber: z.string().optional(),
});

const defaultsSchema = z.object({
  defaultOverheadPct: z.number().min(0).max(50),
  defaultProfitPct: z.number().min(0).max(40),
  defaultTaxPct: z.number().min(0).max(15),
  defaultLaborRate: z.number().min(0),
});

type CompanyForm = z.infer<typeof companySchema>;
type DefaultsForm = z.infer<typeof defaultsSchema>;

// ─── Steps ────────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 'company', label: 'Company Info', icon: Building2 },
  { id: 'defaults', label: 'Estimate Defaults', icon: DollarSign },
  { id: 'import', label: 'Cost Database', icon: Database },
  { id: 'ready', label: "You're Ready!", icon: Rocket },
];

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((s, idx) => {
        const Icon = s.icon;
        const isDone = idx < step;
        const isCurrent = idx === step;
        return (
          <React.Fragment key={s.id}>
            <div className="flex flex-col items-center gap-1.5">
              <motion.div
                animate={{
                  backgroundColor: isDone ? '#22c55e' : isCurrent ? '#6366f1' : '#e5e7eb',
                  scale: isCurrent ? 1.1 : 1,
                }}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all"
              >
                {isDone ? (
                  <CheckCircle className="w-5 h-5 text-white" />
                ) : (
                  <Icon className={`w-5 h-5 ${isCurrent ? 'text-white' : 'text-gray-400'}`} />
                )}
              </motion.div>
              <span
                className={`text-xs font-medium hidden sm:block ${
                  isCurrent
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : isDone
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-gray-400 dark:text-zinc-500'
                }`}
              >
                {s.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className="flex-1 mx-2 h-0.5 mt-[-16px] sm:mt-[-20px] rounded overflow-hidden bg-gray-200 dark:bg-zinc-800">
                <motion.div
                  className="h-full bg-green-400"
                  initial={{ width: 0 }}
                  animate={{ width: idx < step ? '100%' : '0%' }}
                  transition={{ duration: 0.4, delay: 0.1 }}
                />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Slider input ─────────────────────────────────────────────────────────────

interface SliderInputProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  helperText?: string;
  onChange: (v: number) => void;
}

function SliderInput({
  label,
  value,
  min,
  max,
  step = 0.5,
  unit = '%',
  helperText,
  onChange,
}: SliderInputProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700 dark:text-zinc-300">{label}</label>
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={(e) => onChange(Math.max(min, Math.min(max, parseFloat(e.target.value) || 0)))}
            className="w-16 text-right rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 text-sm px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <span className="text-sm text-gray-500 dark:text-zinc-400">{unit}</span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 rounded-full appearance-none cursor-pointer bg-gray-200 dark:bg-zinc-700 accent-indigo-600"
      />
      <div className="flex justify-between text-xs text-gray-400 dark:text-zinc-500">
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
      {helperText && <p className="text-xs text-gray-500 dark:text-zinc-400">{helperText}</p>}
    </div>
  );
}

// ─── CSV Import zone ──────────────────────────────────────────────────────────

function ImportZone({
  onFileSelected,
  file,
  onRemove,
}: {
  onFileSelected: (f: File) => void;
  file: File | null;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f && f.name.endsWith('.csv')) {
        onFileSelected(f);
      }
    },
    [onFileSelected]
  );

  return (
    <div>
      {file ? (
        <div className="flex items-center gap-3 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 p-4">
          <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-zinc-100 truncate">
              {file.name}
            </p>
            <p className="text-xs text-gray-500 dark:text-zinc-400">
              {(file.size / 1024).toFixed(1)} KB
            </p>
          </div>
          <button
            onClick={onRemove}
            className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onClick={() => inputRef.current?.click()}
          className={[
            'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-colors',
            isDragOver
              ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/20'
              : 'border-gray-300 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900 hover:border-indigo-300',
          ].join(' ')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') inputRef.current?.click(); }}
        >
          <Upload className={`w-8 h-8 ${isDragOver ? 'text-indigo-500' : 'text-gray-400'}`} />
          <div className="text-center">
            <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">
              Drag & drop your CSV, or{' '}
              <span className="text-indigo-600 dark:text-indigo-400">browse</span>
            </p>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">
              CSV format: description, unit, unitMaterialCost, unitLaborCost
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFileSelected(f);
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Onboarding ───────────────────────────────────────────────────────────────

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [companyData, setCompanyData] = useState<CompanyForm | null>(null);
  const [defaultsData, setDefaultsData] = useState<DefaultsForm>({
    defaultOverheadPct: 15,
    defaultProfitPct: 10,
    defaultTaxPct: 0,
    defaultLaborRate: 75,
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);

  const navigate = useNavigate();
  const updateSettings = useUpdateCompanySettings();
  const uploadLogo = useUploadLogo();

  // ── Step 1: Company ──────────────────────────────────────────────────────────

  const companyForm = useForm<CompanyForm>({
    resolver: zodResolver(companySchema),
    defaultValues: { companyName: '', address: '', phone: '', email: '', licenseNumber: '' },
  });

  const handleCompanySubmit = (data: CompanyForm) => {
    setCompanyData(data);
    setStep(1);
  };

  // ── Step 2: Defaults ─────────────────────────────────────────────────────────

  const handleDefaultsNext = () => {
    setStep(2);
  };

  // ── Step 3: Import ───────────────────────────────────────────────────────────

  const handleImportNext = async () => {
    if (!companyData) return;
    try {
      await updateSettings.mutateAsync({
        companyName: companyData.companyName,
        address: companyData.address,
        phone: companyData.phone,
        email: companyData.email,
        licenseNumber: companyData.licenseNumber,
        defaultOverheadPct: defaultsData.defaultOverheadPct,
        defaultProfitPct: defaultsData.defaultProfitPct,
        defaultTaxPct: defaultsData.defaultTaxPct,
        defaultLaborRate: defaultsData.defaultLaborRate,
      } as Parameters<typeof updateSettings.mutateAsync>[0]);
      if (logoFile) {
        await uploadLogo.mutateAsync(logoFile).catch(() => null);
      }
      if (csvFile) {
        const fd = new FormData();
        fd.append('file', csvFile);
        await fetch('/api/cost-db/import', {
          method: 'POST',
          credentials: 'include',
          body: fd,
        }).catch(() => null);
      }
    } catch {
      // proceed anyway
    }
    setStep(3);
  };

  // ── Step 4: Ready ────────────────────────────────────────────────────────────

  const handleFinish = () => navigate('/');

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-zinc-950 p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100">
            Welcome to <span className="text-indigo-600 dark:text-indigo-400">OpenEstimate</span>
          </h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
            Let's set up your account in a few quick steps.
          </p>
        </div>

        <ProgressBar step={step} />

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.2 }}
            className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 p-8 shadow-sm"
          >
            {/* ── Step 1: Company info ─────────────────────────────────────── */}
            {step === 0 && (
              <form
                onSubmit={companyForm.handleSubmit(handleCompanySubmit)}
                className="space-y-4"
              >
                <div className="mb-4">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">
                    Company Info
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
                    This appears on your estimates and reports.
                  </p>
                </div>

                <Input
                  label="Company Name *"
                  placeholder="Acme Construction LLC"
                  {...companyForm.register('companyName')}
                  error={companyForm.formState.errors.companyName?.message}
                />
                <Input
                  label="Business Address"
                  placeholder="123 Main St, City, State 12345"
                  {...companyForm.register('address')}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Phone"
                    type="tel"
                    placeholder="(555) 000-0000"
                    {...companyForm.register('phone')}
                  />
                  <Input
                    label="Email"
                    type="email"
                    placeholder="contact@company.com"
                    {...companyForm.register('email')}
                  />
                </div>
                <Input
                  label="License Number"
                  placeholder="Optional"
                  {...companyForm.register('licenseNumber')}
                />

                {/* Logo upload */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                    Company Logo (optional)
                  </label>
                  {logoFile ? (
                    <div className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-zinc-700 p-3">
                      <img
                        src={URL.createObjectURL(logoFile)}
                        alt="Logo preview"
                        className="h-10 w-auto object-contain rounded"
                      />
                      <span className="flex-1 text-sm text-gray-700 dark:text-zinc-300 truncate">
                        {logoFile.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => setLogoFile(null)}
                        className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-gray-300 dark:border-zinc-700 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/10 transition-colors">
                      <Upload className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-500 dark:text-zinc-400">
                        Upload PNG, JPG, or SVG
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) setLogoFile(f);
                        }}
                      />
                    </label>
                  )}
                </div>

                <Button
                  type="submit"
                  fullWidth
                  rightIcon={<ChevronRight className="w-4 h-4" />}
                  className="mt-2"
                >
                  Continue
                </Button>
              </form>
            )}

            {/* ── Step 2: Defaults ─────────────────────────────────────────── */}
            {step === 1 && (
              <div className="space-y-5">
                <div className="mb-4">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">
                    Estimate Defaults
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
                    These become your defaults for all new estimates. You can override per-estimate.
                  </p>
                </div>

                <SliderInput
                  label="Overhead %"
                  value={defaultsData.defaultOverheadPct}
                  min={0}
                  max={50}
                  helperText="Covers indirect costs: office, insurance, equipment depreciation"
                  onChange={(v) =>
                    setDefaultsData((d) => ({ ...d, defaultOverheadPct: v }))
                  }
                />

                <SliderInput
                  label="Profit %"
                  value={defaultsData.defaultProfitPct}
                  min={0}
                  max={40}
                  helperText="Your desired profit margin on top of costs + overhead"
                  onChange={(v) =>
                    setDefaultsData((d) => ({ ...d, defaultProfitPct: v }))
                  }
                />

                <SliderInput
                  label="Tax %"
                  value={defaultsData.defaultTaxPct}
                  min={0}
                  max={15}
                  step={0.25}
                  helperText="Sales tax applied to materials (varies by jurisdiction)"
                  onChange={(v) =>
                    setDefaultsData((d) => ({ ...d, defaultTaxPct: v }))
                  }
                />

                <div className="space-y-2">
                  <CurrencyInput
                    label="Default Labor Rate ($/hr)"
                    value={defaultsData.defaultLaborRate}
                    onChange={(v) =>
                      setDefaultsData((d) => ({ ...d, defaultLaborRate: v ?? 0 }))
                    }
                    helperText="Blended labor rate used when no specific rate is set"
                  />
                </div>

                {/* Summary */}
                <div className="rounded-xl bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900 p-4 text-sm text-indigo-800 dark:text-indigo-300">
                  <p className="font-medium mb-1">How your estimate is calculated:</p>
                  <p className="text-xs leading-relaxed">
                    Subtotal → +{defaultsData.defaultOverheadPct}% overhead → +
                    {defaultsData.defaultProfitPct}% profit → +{defaultsData.defaultTaxPct}% tax
                    = Grand Total
                  </p>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button variant="secondary" onClick={() => setStep(0)} className="flex-1">
                    Back
                  </Button>
                  <Button
                    onClick={handleDefaultsNext}
                    rightIcon={<ChevronRight className="w-4 h-4" />}
                    className="flex-1"
                  >
                    Continue
                  </Button>
                </div>
              </div>
            )}

            {/* ── Step 3: Import ────────────────────────────────────────────── */}
            {step === 2 && (
              <div className="space-y-5">
                <div className="mb-4">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">
                    Cost Database
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
                    Import your pricing data or use the built-in database.
                  </p>
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                    Import your own pricing data (CSV)
                  </p>
                  <ImportZone
                    onFileSelected={setCsvFile}
                    file={csvFile}
                    onRemove={() => setCsvFile(null)}
                  />
                  <p className="text-xs text-gray-400 dark:text-zinc-500">
                    CSV columns: <code>description, unit, unitMaterialCost, unitLaborCost</code>
                  </p>
                </div>

                <div className="relative flex items-center gap-3">
                  <div className="flex-1 h-px bg-gray-200 dark:bg-zinc-700" />
                  <span className="text-xs text-gray-400 dark:text-zinc-500 font-medium">OR</span>
                  <div className="flex-1 h-px bg-gray-200 dark:bg-zinc-700" />
                </div>

                <div className="rounded-xl border border-gray-200 dark:border-zinc-800 p-4 bg-gray-50 dark:bg-zinc-800/40">
                  <div className="flex items-start gap-3">
                    <Database className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100 mb-0.5">
                        Pre-loaded Cost Database
                      </p>
                      <p className="text-xs text-gray-500 dark:text-zinc-400">
                        80+ CSI-organized line items with typical material and labor costs to get
                        you started immediately. You can edit any item at any time.
                      </p>
                    </div>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  fullWidth
                  onClick={handleImportNext}
                  isLoading={updateSettings.isPending || uploadLogo.isPending}
                >
                  Skip for now
                </Button>

                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setStep(1)} className="flex-1">
                    Back
                  </Button>
                  <Button
                    onClick={handleImportNext}
                    isLoading={updateSettings.isPending || uploadLogo.isPending}
                    rightIcon={<ChevronRight className="w-4 h-4" />}
                    className="flex-1"
                  >
                    {csvFile ? 'Import & Continue' : 'Use Built-in Database'}
                  </Button>
                </div>
              </div>
            )}

            {/* ── Step 4: Ready ────────────────────────────────────────────── */}
            {step === 3 && (
              <div className="text-center space-y-6">
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.1 }}
                  className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-950/50 flex items-center justify-center mx-auto"
                >
                  <CheckCircle className="w-10 h-10 text-green-500" />
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-zinc-100 mb-2">
                    You're all set!
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-zinc-400">
                    OpenEstimate is ready. Start by creating your first project.
                  </p>
                </motion.div>

                {/* Default credentials */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="rounded-xl bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 p-4 text-left"
                >
                  <p className="text-xs font-semibold text-gray-600 dark:text-zinc-300 mb-2 uppercase tracking-wide">
                    Your default credentials:
                  </p>
                  <div className="font-mono text-sm text-gray-800 dark:text-zinc-200 space-y-1">
                    <p>Email: <span className="font-bold">admin@openestimate.local</span></p>
                    <p>Password: <span className="font-bold">changeme123</span></p>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-4 text-left"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                      Change your password now
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                      The default password is not secure. Update it in Settings &gt; Profile before sharing access.
                    </p>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="space-y-2"
                >
                  <Button onClick={handleFinish} fullWidth size="lg" leftIcon={<Rocket className="w-5 h-5" />}>
                    Go to Dashboard
                  </Button>
                  <button
                    onClick={() => navigate('/settings/profile')}
                    className="flex items-center justify-center gap-1 w-full text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Change password first
                  </button>
                </motion.div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
