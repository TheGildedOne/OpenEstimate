import React, { useState } from 'react';
import { Save, Upload, Mail } from 'lucide-react';
import { useCompanySettings, useUpdateCompanySettings, useUploadLogo, useTestSmtp } from '../../lib/api';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { useUIStore } from '../../store/uiStore';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const settingsSchema = z.object({
  companyName: z.string().min(1, 'Required'),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  licenseNumber: z.string().optional(),
  defaultOverheadPct: z.number().min(0).max(100),
  defaultProfitPct: z.number().min(0).max(100),
  defaultTaxPct: z.number().min(0).max(100),
  defaultBondPct: z.number().min(0).max(100),
  defaultLaborRate: z.number().min(0),
  defaultWasteFactorPct: z.number().min(0).max(100),
  currency: z.string().min(1),
  timezone: z.string().min(1),
  smtpHost: z.string().optional(),
  smtpPort: z.number().min(1).max(65535),
  smtpUser: z.string().optional(),
  smtpFrom: z.string().optional(),
  smtpSecure: z.boolean(),
});

type SettingsForm = z.infer<typeof settingsSchema>;

const TABS = ['Company', 'Defaults', 'Email / SMTP', 'Appearance'] as const;
type Tab = typeof TABS[number];

export default function Settings() {
  const [activeTab, setActiveTab] = useState<Tab>('Company');
  const showSuccess = useUIStore((s) => s.showSuccess);
  const showError = useUIStore((s) => s.showError);

  const { data: settings, isLoading } = useCompanySettings();
  const updateSettings = useUpdateCompanySettings();
  const uploadLogo = useUploadLogo();
  const testSmtp = useTestSmtp();

  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    values: settings
      ? {
          companyName: settings.companyName,
          address: settings.address ?? '',
          phone: settings.phone ?? '',
          email: settings.email ?? '',
          licenseNumber: settings.licenseNumber ?? '',
          defaultOverheadPct: settings.defaultOverheadPct,
          defaultProfitPct: settings.defaultProfitPct,
          defaultTaxPct: settings.defaultTaxPct,
          defaultBondPct: settings.defaultBondPct,
          defaultLaborRate: settings.defaultLaborRate,
          defaultWasteFactorPct: settings.defaultWasteFactorPct,
          currency: settings.currency,
          timezone: settings.timezone,
          smtpHost: settings.smtpHost ?? '',
          smtpPort: settings.smtpPort ?? 587,
          smtpUser: settings.smtpUser ?? '',
          smtpFrom: settings.smtpFrom ?? '',
          smtpSecure: settings.smtpSecure ?? false,
        }
      : undefined,
  });

  const handleSave = async (data: SettingsForm) => {
    try {
      await updateSettings.mutateAsync(data);
      showSuccess('Settings saved');
    } catch {
      showError('Failed to save settings');
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadLogo.mutateAsync(file);
      showSuccess('Logo uploaded');
    } catch {
      showError('Failed to upload logo');
    }
  };

  const handleTestSmtp = async () => {
    const email = settings?.email;
    if (!email) return;
    try {
      await testSmtp.mutateAsync({ email });
      showSuccess('Test email sent!');
    } catch {
      showError('SMTP test failed');
    }
  };

  if (isLoading) {
    return (
      <PageContainer title="Settings">
        <SkeletonCard rows={6} />
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Settings">
      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-zinc-800">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={[
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              activeTab === tab
                ? 'border-brand-600 text-brand-600 dark:text-brand-400 dark:border-brand-400'
                : 'border-transparent text-gray-500 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-300',
            ].join(' ')}
          >
            {tab}
          </button>
        ))}
      </div>

      <form onSubmit={form.handleSubmit(handleSave)}>
        {activeTab === 'Company' && (
          <div className="space-y-4 max-w-lg">
            {/* Logo */}
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">Logo</p>
              {settings?.logoUrl && (
                <img
                  src={settings.logoUrl}
                  alt="Company logo"
                  className="h-12 mb-3 rounded object-contain"
                />
              )}
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  leftIcon={<Upload className="w-3.5 h-3.5" />}
                  isLoading={uploadLogo.isPending}
                  onClick={() => document.getElementById('logo-upload')?.click()}
                >
                  Upload Logo
                </Button>
                <input
                  id="logo-upload"
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={handleLogoUpload}
                />
              </label>
            </div>

            <Input
              label="Company Name *"
              {...form.register('companyName')}
              error={form.formState.errors.companyName?.message}
            />
            <Input label="Address" {...form.register('address')} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Phone" {...form.register('phone')} />
              <Input label="Email" type="email" {...form.register('email')} />
            </div>
            <Input label="License Number" {...form.register('licenseNumber')} />
          </div>
        )}

        {activeTab === 'Defaults' && (
          <div className="space-y-4 max-w-lg">
            <p className="text-sm text-gray-500 dark:text-zinc-400">
              These defaults are applied to new estimates. They can be overridden per estimate.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Overhead %"
                type="number"
                step="0.1"
                {...form.register('defaultOverheadPct', { valueAsNumber: true })}
              />
              <Input
                label="Profit %"
                type="number"
                step="0.1"
                {...form.register('defaultProfitPct', { valueAsNumber: true })}
              />
              <Input
                label="Tax %"
                type="number"
                step="0.1"
                {...form.register('defaultTaxPct', { valueAsNumber: true })}
              />
              <Input
                label="Bond %"
                type="number"
                step="0.1"
                {...form.register('defaultBondPct', { valueAsNumber: true })}
              />
              <Input
                label="Labor Rate ($/hr)"
                type="number"
                step="0.01"
                {...form.register('defaultLaborRate', { valueAsNumber: true })}
              />
              <Input
                label="Waste Factor %"
                type="number"
                step="0.1"
                {...form.register('defaultWasteFactorPct', { valueAsNumber: true })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Currency" {...form.register('currency')} />
              <Input label="Timezone" {...form.register('timezone')} />
            </div>
          </div>
        )}

        {activeTab === 'Email / SMTP' && (
          <div className="space-y-4 max-w-lg">
            <p className="text-sm text-gray-500 dark:text-zinc-400">
              Configure SMTP to send notifications and client portal emails.
            </p>
            <Input label="SMTP Host" {...form.register('smtpHost')} />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Port"
                type="number"
                {...form.register('smtpPort', { valueAsNumber: true })}
              />
              <label className="flex items-center gap-2 mt-6 cursor-pointer">
                <input type="checkbox" {...form.register('smtpSecure')} className="rounded" />
                <span className="text-sm text-gray-700 dark:text-zinc-300">Use TLS/SSL</span>
              </label>
            </div>
            <Input label="SMTP Username" {...form.register('smtpUser')} />
            <Input label="From Address" {...form.register('smtpFrom')} />
            <Button
              type="button"
              variant="outline"
              leftIcon={<Mail className="w-4 h-4" />}
              onClick={handleTestSmtp}
              isLoading={testSmtp.isPending}
            >
              Send Test Email
            </Button>
          </div>
        )}

        {activeTab === 'Appearance' && (
          <div className="space-y-4 max-w-lg">
            <p className="text-sm text-gray-500 dark:text-zinc-400">
              Appearance settings are managed per-user. Use the toggle in the header.
            </p>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-zinc-800">
          <Button
            type="submit"
            leftIcon={<Save className="w-4 h-4" />}
            isLoading={updateSettings.isPending}
          >
            Save Settings
          </Button>
        </div>
      </form>
    </PageContainer>
  );
}
