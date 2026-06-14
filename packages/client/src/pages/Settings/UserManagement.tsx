import React, { useState } from 'react';
import { Plus, UserX, Shield } from 'lucide-react';
import { useUsers, useInviteUser, useUpdateUser, useDeactivateUser } from '../../lib/api';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { SkeletonTable } from '../../components/ui/Skeleton';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Modal } from '../../components/ui/Modal';
import { useUIStore } from '../../store/uiStore';
import type { User, UserRole } from '@openestimate/shared';
import { format } from 'date-fns';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const inviteSchema = z.object({
  name: z.string().min(1, 'Name required'),
  email: z.string().email('Invalid email'),
  role: z.enum(['admin', 'estimator', 'viewer']),
});

type InviteForm = z.infer<typeof inviteSchema>;

const roleOptions = [
  { value: 'admin', label: 'Admin' },
  { value: 'estimator', label: 'Estimator' },
  { value: 'viewer', label: 'Viewer' },
];

const roleBadge: Record<UserRole, 'red' | 'blue' | 'gray'> = {
  admin: 'red',
  estimator: 'blue',
  viewer: 'gray',
};

export default function UserManagement() {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deactivateUser, setDeactivateUser] = useState<User | null>(null);
  const showSuccess = useUIStore((s) => s.showSuccess);
  const showError = useUIStore((s) => s.showError);

  const { data: users, isLoading } = useUsers();
  const invite = useInviteUser();
  const updateUser = useUpdateUser();
  const deactivate = useDeactivateUser();

  const form = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { name: '', email: '', role: 'estimator' },
  });

  const handleInvite = async (data: InviteForm) => {
    try {
      await invite.mutateAsync(data);
      showSuccess(`Invitation sent to ${data.email}`);
      setInviteOpen(false);
      form.reset();
    } catch {
      showError('Failed to invite user');
    }
  };

  const handleDeactivate = async () => {
    if (!deactivateUser) return;
    try {
      await deactivate.mutateAsync(deactivateUser.id);
      showSuccess('User deactivated');
    } catch {
      showError('Failed to deactivate user');
    } finally {
      setDeactivateUser(null);
    }
  };

  const handleRoleChange = async (userId: number, role: UserRole) => {
    try {
      await updateUser.mutateAsync({ id: userId, role });
      showSuccess('Role updated');
    } catch {
      showError('Failed to update role');
    }
  };

  const userList = users ?? [];

  return (
    <PageContainer
      title="User Management"
      actions={
        <Button onClick={() => setInviteOpen(true)} leftIcon={<Plus className="w-4 h-4" />}>
          Invite User
        </Button>
      }
    >
      {isLoading ? (
        <SkeletonTable rows={5} cols={5} />
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-zinc-400">
                  User
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-zinc-400">
                  Role
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-zinc-400">
                  Status
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-zinc-400">
                  Last Login
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
              {userList.map((user) => (
                <tr
                  key={user.id}
                  className="hover:bg-gray-50 dark:hover:bg-zinc-900/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-zinc-100">{user.name}</p>
                      <p className="text-xs text-gray-500 dark:text-zinc-500">{user.email}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                      className="text-xs border border-gray-200 dark:border-zinc-700 rounded px-2 py-1 bg-white dark:bg-zinc-900 text-gray-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    >
                      {roleOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={user.isActive ? 'green' : 'gray'}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-zinc-400">
                    {user.lastLogin
                      ? format(new Date(user.lastLogin), 'MMM d, yyyy')
                      : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    {user.isActive && (
                      <button
                        onClick={() => setDeactivateUser(user)}
                        className="p-1.5 rounded text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                        title="Deactivate user"
                      >
                        <UserX className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Invite Modal */}
      <Modal
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite User"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={form.handleSubmit(handleInvite)}
              isLoading={invite.isPending}
              leftIcon={<Shield className="w-4 h-4" />}
            >
              Send Invite
            </Button>
          </div>
        }
      >
        <form className="space-y-3">
          <Input
            label="Name *"
            {...form.register('name')}
            error={form.formState.errors.name?.message}
          />
          <Input
            label="Email *"
            type="email"
            {...form.register('email')}
            error={form.formState.errors.email?.message}
          />
          <Select
            label="Role *"
            options={roleOptions}
            {...form.register('role')}
          />
        </form>
      </Modal>

      {/* Deactivate confirm */}
      <ConfirmDialog
        isOpen={!!deactivateUser}
        onClose={() => setDeactivateUser(null)}
        onConfirm={handleDeactivate}
        title="Deactivate User"
        message={`Deactivate ${deactivateUser?.name}'s account? They will no longer be able to log in.`}
        confirmLabel="Deactivate"
        isLoading={deactivate.isPending}
      />
    </PageContainer>
  );
}
