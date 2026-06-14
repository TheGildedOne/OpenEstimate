import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import {
  Upload,
  FileText,
  Image,
  File,
  X,
  Trash2,
  Edit3,
  Check,
  Loader2,
  Eye,
  AlertTriangle,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Project, ProjectDocument } from '@openestimate/shared';
import { useUIStore } from '@/store/uiStore';

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchDocuments(projectId: number): Promise<ProjectDocument[]> {
  const res = await fetch(`/api/projects/${projectId}/documents`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load documents');
  const json = await res.json();
  return json.data ?? [];
}

async function uploadDocument(projectId: number, file: File, label: string): Promise<ProjectDocument> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('label', label);
  const res = await fetch(`/api/projects/${projectId}/documents`, {
    method: 'POST',
    credentials: 'include',
    body: fd,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(err.error || 'Upload failed');
  }
  const json = await res.json();
  return json.data ?? json;
}

async function deleteDocument(projectId: number, docId: number): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/documents/${docId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to delete document');
}

async function updateDocumentLabel(
  projectId: number,
  docId: number,
  label: string
): Promise<ProjectDocument> {
  const res = await fetch(`/api/projects/${projectId}/documents/${docId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ label }),
  });
  if (!res.ok) throw new Error('Failed to update label');
  const json = await res.json();
  return json.data ?? json;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  if (mimeType.startsWith('image/'))
    return <Image className={className ?? 'w-5 h-5 text-blue-500'} />;
  if (mimeType === 'application/pdf')
    return <FileText className={className ?? 'w-5 h-5 text-red-500'} />;
  return <File className={className ?? 'w-5 h-5 text-gray-500'} />;
}

function getDocumentUrl(projectId: number, docId: number) {
  return `/api/projects/${projectId}/documents/${docId}/download`;
}

// ── Document Preview Modal ────────────────────────────────────────────────────

interface PreviewModalProps {
  doc: ProjectDocument | null;
  projectId: number;
  onClose: () => void;
}

function PreviewModal({ doc, projectId, onClose }: PreviewModalProps) {
  if (!doc) return null;
  const url = getDocumentUrl(projectId, doc.id);
  const isImage = doc.mimeType.startsWith('image/');
  const isPdf = doc.mimeType === 'application/pdf';

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          className="relative w-full max-w-4xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden"
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.92, opacity: 0 }}
          style={{ maxHeight: '90vh' }}
        >
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <FileIcon mimeType={doc.mimeType} />
              <span className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-xs">
                {doc.label || doc.originalName}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={url}
                download={doc.originalName}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Download
              </a>
              <button
                onClick={onClose}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="overflow-auto" style={{ maxHeight: 'calc(90vh - 56px)' }}>
            {isImage && (
              <img
                src={url}
                alt={doc.originalName}
                className="w-full h-auto object-contain"
              />
            )}
            {isPdf && (
              <iframe
                src={`${url}#view=FitH`}
                className="w-full"
                style={{ height: 'calc(90vh - 56px)' }}
                title={doc.originalName}
              />
            )}
            {!isImage && !isPdf && (
              <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400">
                <File className="w-16 h-16 mb-4 text-gray-300 dark:text-gray-700" />
                <p className="text-sm">Preview not available for this file type</p>
                <a
                  href={url}
                  download={doc.originalName}
                  className="mt-3 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Download File
                </a>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Inline Label Editor ───────────────────────────────────────────────────────

interface LabelEditorProps {
  doc: ProjectDocument;
  projectId: number;
  onSaved: (updated: ProjectDocument) => void;
}

function LabelEditor({ doc, projectId, onSaved }: LabelEditorProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(doc.label ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await updateDocumentLabel(projectId, doc.id, value.trim());
      onSaved(updated);
      setEditing(false);
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="group flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
      >
        {doc.label || <span className="italic text-gray-400">Add label</span>}
        <Edit3 className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') {
            setValue(doc.label ?? '');
            setEditing(false);
          }
        }}
        className="text-xs px-2 py-1 rounded border border-orange-400 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500 w-32"
      />
      <button
        onClick={save}
        disabled={saving}
        className="p-1 rounded text-green-500 hover:text-green-600 transition-colors"
      >
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
      </button>
      <button
        onClick={() => {
          setValue(doc.label ?? '');
          setEditing(false);
        }}
        className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── DocumentsTab ──────────────────────────────────────────────────────────────

interface DocumentsTabProps {
  project: Project;
}

export default function DocumentsTab({ project }: DocumentsTabProps) {
  const qc = useQueryClient();
  const { showSuccess, showError } = useUIStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<
    { name: string; progress: boolean }[]
  >([]);
  const [preview, setPreview] = useState<ProjectDocument | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ProjectDocument | null>(null);

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['documents', project.id],
    queryFn: () => fetchDocuments(project.id),
  });

  const deleteMutation = useMutation({
    mutationFn: (doc: ProjectDocument) => deleteDocument(project.id, doc.id),
    onMutate: async (doc) => {
      await qc.cancelQueries({ queryKey: ['documents', project.id] });
      const prev = qc.getQueryData<ProjectDocument[]>(['documents', project.id]);
      qc.setQueryData<ProjectDocument[]>(['documents', project.id], (old = []) =>
        old.filter((d) => d.id !== doc.id)
      );
      return { prev };
    },
    onSuccess: () => {
      showSuccess('Document deleted');
      setConfirmDelete(null);
    },
    onError: (err, _doc, ctx) => {
      showError((err as Error).message);
      if (ctx?.prev) qc.setQueryData(['documents', project.id], ctx.prev);
    },
  });

  const handleLabelSaved = useCallback(
    (updated: ProjectDocument) => {
      qc.setQueryData<ProjectDocument[]>(['documents', project.id], (old = []) =>
        old.map((d) => (d.id === updated.id ? updated : d))
      );
    },
    [qc, project.id]
  );

  const uploadFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    for (const file of arr) {
      setUploadingFiles((prev) => [...prev, { name: file.name, progress: true }]);
      try {
        const doc = await uploadDocument(project.id, file, '');
        qc.setQueryData<ProjectDocument[]>(['documents', project.id], (old = []) => [
          ...old,
          doc,
        ]);
        showSuccess(`${file.name} uploaded`);
      } catch (err) {
        showError(`Failed to upload ${file.name}: ${(err as Error).message}`);
      } finally {
        setUploadingFiles((prev) => prev.filter((f) => f.name !== file.name));
      }
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files.length) {
        uploadFiles(e.dataTransfer.files);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project.id]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      uploadFiles(e.target.files);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Drop zone */}
      <motion.div
        className={`relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
          isDragOver
            ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/20'
            : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'
        }`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        animate={isDragOver ? { scale: 1.01 } : { scale: 1 }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
        <Upload
          className={`w-10 h-10 mx-auto mb-3 transition-colors ${
            isDragOver ? 'text-orange-400' : 'text-gray-300 dark:text-gray-700'
          }`}
        />
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
          Drop files here or{' '}
          <span className="text-orange-500 hover:text-orange-600">browse</span>
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">
          PDF, images, and any other file types
        </p>
      </motion.div>

      {/* Uploading progress */}
      <AnimatePresence>
        {uploadingFiles.map((f) => (
          <motion.div
            key={f.name}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-3 p-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900 rounded-xl text-sm text-orange-700 dark:text-orange-400"
          >
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            <span className="truncate">Uploading {f.name}…</span>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Documents list */}
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-600">
          <FileText className="w-12 h-12 mb-3" />
          <p className="text-base font-medium text-gray-600 dark:text-gray-400">No documents yet</p>
          <p className="text-sm mt-1">Upload files using the drop zone above</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            {documents.length} file{documents.length !== 1 ? 's' : ''}
          </p>
          {documents.map((doc) => (
            <motion.div
              key={doc.id}
              className="flex items-center gap-3 p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 hover:shadow-sm transition-all group"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                <FileIcon mimeType={doc.mimeType} />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {doc.originalName}
                </p>
                <div className="flex items-center gap-3 mt-0.5">
                  <LabelEditor doc={doc} projectId={project.id} onSaved={handleLabelSaved} />
                  <span className="text-xs text-gray-400 dark:text-gray-600">
                    {formatBytes(doc.sizeBytes)}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-600">
                    {doc.uploadedByName ?? 'Unknown'} · {format(new Date(doc.uploadedAt), 'MMM d, yyyy')}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => setPreview(doc)}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  title="Preview"
                >
                  <Eye className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setConfirmDelete(doc)}
                  className="p-2 rounded-lg text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <PreviewModal
          doc={preview}
          projectId={project.id}
          onClose={() => setPreview(null)}
        />
      )}

      {/* Delete confirm */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setConfirmDelete(null)}
            />
            <motion.div
              className="relative w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6"
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  Delete Document
                </h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
                Delete "{confirmDelete.originalName}"? This cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 py-2.5 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteMutation.mutate(confirmDelete)}
                  disabled={deleteMutation.isPending}
                  className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {deleteMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
