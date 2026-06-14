import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotifications, useUnreadCount, useMarkAllRead, useMarkRead } from '../lib/api';
import { formatDistanceToNow } from 'date-fns';
import type { Notification } from '@openestimate/shared';

function NotificationItem({
  notification,
  onRead,
}: {
  notification: Notification;
  onRead: (id: number, link: string | null) => void;
}) {
  return (
    <button
      onClick={() => onRead(notification.id, notification.link)}
      className={[
        'flex flex-col w-full px-4 py-3 text-left transition-colors',
        'hover:bg-gray-50 dark:hover:bg-zinc-800',
        notification.isRead ? 'opacity-70' : '',
      ].join(' ')}
    >
      <div className="flex items-start gap-2">
        {!notification.isRead && (
          <span className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-500" />
        )}
        <div className={notification.isRead ? '' : 'pl-0'}>
          <p className="text-sm font-medium text-gray-900 dark:text-zinc-100 text-left">
            {notification.title}
          </p>
          <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5 text-left line-clamp-2">
            {notification.body}
          </p>
          <p className="text-xs text-gray-400 dark:text-zinc-600 mt-1">
            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
          </p>
        </div>
      </div>
    </button>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const { data: notifications } = useNotifications();
  const { data: unreadData } = useUnreadCount();
  const markAllRead = useMarkAllRead();
  const markRead = useMarkRead();

  const unreadCount = unreadData?.count ?? 0;
  const items = notifications ?? [];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleRead = async (id: number, link: string | null) => {
    try {
      await markRead.mutateAsync(id);
    } catch {
      // ignore
    }
    if (link) {
      navigate(link);
      setOpen(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={[
          'relative flex items-center justify-center w-8 h-8 rounded-lg',
          'text-gray-500 dark:text-zinc-400',
          'hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-700 dark:hover:text-zinc-200',
          'transition-colors',
        ].join(' ')}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell className="w-4.5 h-4.5 w-[18px] h-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className={[
              'absolute right-0 mt-1 w-80 rounded-xl shadow-xl',
              'bg-white dark:bg-zinc-900',
              'border border-gray-200 dark:border-zinc-700',
              'overflow-hidden z-50',
            ].join(' ')}
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">
                Notifications
                {unreadCount > 0 && (
                  <span className="ml-2 text-xs font-normal text-gray-500 dark:text-zinc-400">
                    {unreadCount} unread
                  </span>
                )}
              </h3>
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  className="flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400 hover:underline"
                  disabled={markAllRead.isPending}
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Mark all read
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 dark:divide-zinc-800">
              {items.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-zinc-400">
                  You're all caught up!
                </div>
              ) : (
                items.slice(0, 20).map((n) => (
                  <NotificationItem key={n.id} notification={n} onRead={handleRead} />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
