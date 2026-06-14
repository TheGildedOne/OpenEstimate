import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import {
  Plus,
  Trash2,
  MessageSquare,
  Loader2,
  AlertTriangle,
  Send,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Project, ProjectNote } from '@openestimate/shared';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchNotes(projectId: number): Promise<ProjectNote[]> {
  const res = await fetch(`/api/projects/${projectId}/notes`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load notes');
  const json = await res.json();
  return json.data ?? [];
}

async function createNote(projectId: number, body: string): Promise<ProjectNote> {
  const res = await fetch(`/api/projects/${projectId}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ body }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to create note' }));
    throw new Error(err.error);
  }
  const json = await res.json();
  return json.data ?? json;
}

async function deleteNote(projectId: number, noteId: number): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/notes/${noteId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to delete note');
}

// ── Markdown-like inline renderer ────────────────────────────────────────────
// Supports **bold** and *italic*

function renderBody(text: string) {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // **bold**
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const italicMatch = remaining.match(/\*(.+?)\*/);

    const boldIdx = boldMatch ? remaining.indexOf(boldMatch[0]) : Infinity;
    const italicIdx = italicMatch ? remaining.indexOf(italicMatch[0]) : Infinity;

    if (boldIdx === Infinity && italicIdx === Infinity) {
      parts.push(remaining);
      break;
    }

    if (boldIdx <= italicIdx && boldMatch) {
      if (boldIdx > 0) parts.push(remaining.slice(0, boldIdx));
      parts.push(<strong key={key++}>{boldMatch[1]}</strong>);
      remaining = remaining.slice(boldIdx + boldMatch[0].length);
    } else if (italicMatch) {
      if (italicIdx > 0) parts.push(remaining.slice(0, italicIdx));
      parts.push(<em key={key++}>{italicMatch[1]}</em>);
      remaining = remaining.slice(italicIdx + italicMatch[0].length);
    } else {
      parts.push(remaining);
      break;
    }
  }

  return parts;
}

// ── Note Card ─────────────────────────────────────────────────────────────────

interface NoteCardProps {
  note: ProjectNote;
  projectId: number;
  currentUserId: number | null;
  isAdmin: boolean;
  onDeleted: (id: number) => void;
}

function NoteCard({ note, projectId, currentUserId, isAdmin, onDeleted }: NoteCardProps) {
  const { showSuccess, showError } = useUIStore();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canDelete = isAdmin || note.createdBy === currentUserId;

  const deleteMutation = useMutation({
    mutationFn: () => deleteNote(projectId, note.id),
    onSuccess: () => {
      showSuccess('Note deleted');
      onDeleted(note.id);
      setConfirmDelete(false);
    },
    onError: (err) => showError((err as Error).message),
  });

  const initials = (note.createdByName ?? 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <motion.div
      className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 group"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }}
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
          <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">
            {initials}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                {note.createdByName ?? 'Unknown'}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-600">
                {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
              </span>
            </div>

            {canDelete && (
              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                {confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Delete?</span>
                    <button
                      onClick={() => deleteMutation.mutate()}
                      disabled={deleteMutation.isPending}
                      className="text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 transition-colors"
                    >
                      {deleteMutation.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        'Yes'
                      )}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="p-1 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    title="Delete note"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
            {renderBody(note.body)}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ── NotesTab ──────────────────────────────────────────────────────────────────

interface NotesTabProps {
  project: Project;
}

export default function NotesTab({ project }: NotesTabProps) {
  const qc = useQueryClient();
  const { showSuccess, showError } = useUIStore();
  const user = useAuthStore((s) => s.user);

  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['notes', project.id],
    queryFn: () => fetchNotes(project.id),
  });

  const handleAdd = async () => {
    if (!body.trim()) return;
    setSubmitting(true);
    try {
      const note = await createNote(project.id, body.trim());
      qc.setQueryData<ProjectNote[]>(['notes', project.id], (old = []) => [note, ...old]);
      setBody('');
      showSuccess('Note added');
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleted = (noteId: number) => {
    qc.setQueryData<ProjectNote[]>(['notes', project.id], (old = []) =>
      old.filter((n) => n.id !== noteId)
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Add note */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          placeholder="Add a note… (Ctrl+Enter to submit, **bold**, *italic* supported)"
          className="w-full px-0 py-0 text-sm text-gray-900 dark:text-white placeholder-gray-400 bg-transparent focus:outline-none resize-none"
        />
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
          <span className="text-xs text-gray-400 dark:text-gray-600">
            Supports **bold** and *italic*
          </span>
          <button
            onClick={handleAdd}
            disabled={!body.trim() || submitting}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            {submitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            Add Note
          </button>
        </div>
      </div>

      {/* Notes list */}
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-600">
          <MessageSquare className="w-12 h-12 mb-3" />
          <p className="text-base font-medium text-gray-600 dark:text-gray-400">No notes yet</p>
          <p className="text-sm mt-1">Add notes to track important project information</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            {notes.length} note{notes.length !== 1 ? 's' : ''}
          </p>
          <AnimatePresence mode="popLayout">
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                projectId={project.id}
                currentUserId={user?.id ?? null}
                isAdmin={user?.role === 'admin'}
                onDeleted={handleDeleted}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
