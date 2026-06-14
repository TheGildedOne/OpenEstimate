import React, { useCallback, useState, useRef } from 'react';
import { Upload, X, FileText, AlertCircle } from 'lucide-react';
import { useFileUpload } from '../hooks/useFileUpload';
import type { ProjectDocument } from '@openestimate/shared';

interface FileEntry {
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error';
  progress: number;
  error?: string;
  result?: ProjectDocument;
}

export interface FileUploadProps {
  projectId: number;
  accept?: string;
  maxSizeBytes?: number;
  multiple?: boolean;
  onUploadComplete?: (docs: ProjectDocument[]) => void;
  className?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileUpload({
  projectId,
  accept = '*/*',
  maxSizeBytes = 50 * 1024 * 1024, // 50 MB
  multiple = true,
  onUploadComplete,
  className = '',
}: FileUploadProps) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { upload } = useFileUpload();

  const processFiles = useCallback(
    async (incoming: File[]) => {
      const validated = incoming.filter((f) => {
        if (f.size > maxSizeBytes) return false;
        return true;
      });

      if (validated.length === 0) return;

      // Add entries
      const entries: FileEntry[] = validated.map((file) => ({
        file,
        status: 'pending' as const,
        progress: 0,
      }));

      setFiles((prev) => [...prev, ...entries]);

      // Upload each
      const results: ProjectDocument[] = [];

      for (const entry of entries) {
        setFiles((prev) =>
          prev.map((e) => (e.file === entry.file ? { ...e, status: 'uploading' } : e))
        );

        try {
          const doc = await upload(entry.file, projectId);
          results.push(doc);
          setFiles((prev) =>
            prev.map((e) =>
              e.file === entry.file ? { ...e, status: 'done', progress: 100, result: doc } : e
            )
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Upload failed';
          setFiles((prev) =>
            prev.map((e) =>
              e.file === entry.file ? { ...e, status: 'error', error: msg } : e
            )
          );
        }
      }

      if (results.length > 0) {
        onUploadComplete?.(results);
      }
    },
    [projectId, upload, maxSizeBytes, onUploadComplete]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const dropped = Array.from(e.dataTransfer.files);
      processFiles(multiple ? dropped : dropped.slice(0, 1));
    },
    [processFiles, multiple]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    processFiles(selected);
    // Reset so same file can be re-uploaded
    e.target.value = '';
  };

  const removeFile = (file: File) => {
    setFiles((prev) => prev.filter((e) => e.file !== file));
  };

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
        className={[
          'flex flex-col items-center justify-center gap-2',
          'rounded-xl border-2 border-dashed p-8 cursor-pointer',
          'transition-colors duration-150',
          isDragOver
            ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/20'
            : 'border-gray-300 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900 hover:border-brand-400 hover:bg-brand-50/50 dark:hover:bg-brand-950/10',
        ].join(' ')}
        aria-label="File upload drop zone"
      >
        <Upload
          className={`w-8 h-8 ${isDragOver ? 'text-brand-500' : 'text-gray-400 dark:text-zinc-600'}`}
        />
        <div className="text-center">
          <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">
            Drag &amp; drop files here, or{' '}
            <span className="text-brand-600 dark:text-brand-400">browse</span>
          </p>
          <p className="text-xs text-gray-400 dark:text-zinc-600 mt-0.5">
            Up to {formatBytes(maxSizeBytes)} per file
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="sr-only"
          onChange={handleInputChange}
          aria-hidden
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((entry, idx) => (
            <li
              key={idx}
              className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-zinc-800 p-3"
            >
              {entry.status === 'error' ? (
                <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
              ) : (
                <FileText className="w-5 h-5 shrink-0 text-gray-400 dark:text-zinc-500" />
              )}

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-zinc-100 truncate">
                  {entry.file.name}
                </p>
                <p className="text-xs text-gray-500 dark:text-zinc-500">
                  {formatBytes(entry.file.size)}
                </p>

                {entry.status === 'uploading' && (
                  <div className="mt-1 h-1.5 w-full rounded-full bg-gray-200 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-brand-500 rounded-full transition-all duration-300"
                      style={{ width: `${entry.progress}%` }}
                    />
                  </div>
                )}

                {entry.status === 'done' && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">Uploaded</p>
                )}

                {entry.status === 'error' && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{entry.error}</p>
                )}
              </div>

              {entry.status !== 'uploading' && (
                <button
                  onClick={() => removeFile(entry.file)}
                  className="shrink-0 p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors"
                  aria-label={`Remove ${entry.file.name}`}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
