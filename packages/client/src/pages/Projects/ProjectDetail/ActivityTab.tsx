import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Activity,
  FolderOpen,
  FileText,
  Upload,
  MessageSquare,
  GitBranch,
  Users,
  Edit3,
  Plus,
  ChevronLeft,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { ProjectActivityLog } from '@openestimate/shared';

// ── Types ─────────────────────────────────────────────────────────────────────

const ACTION_TYPE_MAP: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  project_created: { label: 'Project Created', icon: FolderOpen, color: 'text-blue-500 bg-blue-50 dark:bg-blue-950/30' },
  project_updated: { label: 'Project Updated', icon: Edit3, color: 'text-gray-500 bg-gray-100 dark:bg-gray-800' },
  estimate_created: { label: 'Estimate Created', icon: FileText, color: 'text-purple-500 bg-purple-50 dark:bg-purple-950/30' },
  estimate_updated: { label: 'Estimate Updated', icon: FileText, color: 'text-purple-400 bg-purple-50 dark:bg-purple-950/30' },
  document_uploaded: { label: 'Document Uploaded', icon: Upload, color: 'text-green-500 bg-green-50 dark:bg-green-950/30' },
  document_deleted: { label: 'Document Deleted', icon: Upload, color: 'text-red-400 bg-red-50 dark:bg-red-950/20' },
  note_added: { label: 'Note Added', icon: MessageSquare, color: 'text-yellow-500 bg-yellow-50 dark:bg-yellow-950/30' },
  note_deleted: { label: 'Note Deleted', icon: MessageSquare, color: 'text-yellow-400 bg-yellow-50 dark:bg-yellow-950/20' },
  change_order_created: { label: 'Change Order Created', icon: GitBranch, color: 'text-orange-500 bg-orange-50 dark:bg-orange-950/30' },
  change_order_updated: { label: 'Change Order Updated', icon: GitBranch, color: 'text-orange-400 bg-orange-50 dark:bg-orange-950/30' },
  sub_bid_added: { label: 'Sub Bid Added', icon: Users, color: 'text-teal-500 bg-teal-50 dark:bg-teal-950/30' },
  sub_bid_awarded: { label: 'Sub Bid Awarded', icon: Users, color: 'text-teal-600 bg-teal-50 dark:bg-teal-950/30' },
  status_changed: { label: 'Status Changed', icon: Activity, color: 'text-indigo-500 bg-indigo-50 dark:bg-indigo-950/30' },
  bid_outcome_recorded: { label: 'Bid Outcome Recorded', icon: Activity, color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30' },
};

const ACTION_TYPE_OPTIONS = [
  { value: '', label: 'All Activity' },
  { value: 'project', label: 'Project Changes' },
  { value: 'estimate', label: 'Estimates' },
  { value: 'document', label: 'Documents' },
  { value: 'note', label: 'Notes' },
  { value: 'change_order', label: 'Change Orders' },
  { value: 'sub_bid', label: 'Sub Bids' },
];

// ── API ───────────────────────────────────────────────────────────────────────

interface ActivityResponse {
  data: ProjectActivityLog[];
  total: number;
  page: number;
  totalPages: number;
}

async function fetchActivity(
  projectId: number,
  page: number,
  filter: string
): Promise<ActivityResponse> {
  const q = new URLSearchParams({ page: String(page), pageSize: '25' });
  if (filter) q.set('action', filter);

  const res = await fetch(`/api/projects/${projectId}/activity?${q.toString()}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to load activity');
  const json = await res.json();
  return json.data ?? { data: [], total: 0, page: 1, totalPages: 1 };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getActionMeta(action: string) {
  // Try exact match first
  if (ACTION_TYPE_MAP[action]) return ACTION_TYPE_MAP[action];

  // Fallback: partial match
  for (const key of Object.keys(ACTION_TYPE_MAP)) {
    if (action.includes(key) || key.includes(action)) {
      return ACTION_TYPE_MAP[key];
    }
  }

  // Default
  return {
    label: action.replace(/_/g, ' '),
    icon: Activity,
    color: 'text-gray-500 bg-gray-100 dark:bg-gray-800',
  };
}

// ── Activity Item ─────────────────────────────────────────────────────────────

interface ActivityItemProps {
  log: ProjectActivityLog;
  isLast: boolean;
}

function ActivityItem({ log, isLast }: ActivityItemProps) {
  const meta = getActionMeta(log.action);
  const Icon = meta.icon;

  const initials = (log.userName ?? 'S')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex gap-3 group">
      {/* Timeline line */}
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${meta.color}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        {!isLast && <div className="w-px flex-1 bg-gray-100 dark:bg-gray-800 mt-1" />}
      </div>

      {/* Content */}
      <div className={`flex-1 min-w-0 ${isLast ? '' : 'pb-4'}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-800 dark:text-gray-200">
              {log.userName ? (
                <>
                  <span className="font-semibold">{log.userName}</span>{' '}
                  <span className="text-gray-600 dark:text-gray-400">
                    {log.action.replace(/_/g, ' ')}
                  </span>
                </>
              ) : (
                <span className="text-gray-600 dark:text-gray-400">
                  {log.action.replace(/_/g, ' ')}
                </span>
              )}
            </p>
            {log.detail && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                {log.detail}
              </p>
            )}
          </div>

          <div className="text-right shrink-0">
            <p
              className="text-xs text-gray-400 dark:text-gray-600"
              title={format(new Date(log.timestamp), 'PPpp')}
            >
              {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ActivityTab ───────────────────────────────────────────────────────────────

interface ActivityTabProps {
  projectId: number;
}

export default function ActivityTab({ projectId }: ActivityTabProps) {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['activity', projectId, page, filter],
    queryFn: () => fetchActivity(projectId, page, filter),
    placeholderData: (prev) => prev,
  });

  const logs = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;

  const handleFilterChange = (val: string) => {
    setFilter(val);
    setPage(1);
  };

  return (
    <div className="max-w-2xl space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400">
          <Filter className="w-4 h-4" />
          Filter:
        </div>
        <div className="flex gap-1 flex-wrap">
          {ACTION_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleFilterChange(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === opt.value
                  ? 'bg-orange-500 text-white'
                  : 'text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Activity list */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-800 shrink-0" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-3/4" />
                <div className="h-3 bg-gray-100 dark:bg-gray-800/60 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-600">
          <Activity className="w-12 h-12 mb-3" />
          <p className="text-base font-medium text-gray-600 dark:text-gray-400">No activity yet</p>
          <p className="text-sm mt-1">
            {filter ? 'No activity matches this filter' : 'Activity will appear here as the project progresses'}
          </p>
        </div>
      ) : (
        <>
          <div className={`transition-opacity duration-150 ${isFetching ? 'opacity-60' : 'opacity-100'}`}>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              {logs.map((log, idx) => (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                >
                  <ActivityItem log={log} isLast={idx === logs.length - 1} />
                </motion.div>
              ))}
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {total} total events · Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1 || isFetching}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 text-gray-500 dark:text-gray-400 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-gray-700 dark:text-gray-300 px-2">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages || isFetching}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 text-gray-500 dark:text-gray-400 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
