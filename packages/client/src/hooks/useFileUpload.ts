import { useState, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { ApiError } from '../lib/api';
import type { ProjectDocument } from '@openestimate/shared';

const API_BASE = (import.meta.env.VITE_API_URL as string) || '';

export interface FileUploadState {
  isUploading: boolean;
  progress: number;
  error: string | null;
}

export interface FileUploadControls extends FileUploadState {
  upload: (file: File, projectId: number) => Promise<ProjectDocument>;
  reset: () => void;
}

export function useFileUpload(): FileUploadControls {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setIsUploading(false);
    setProgress(0);
    setError(null);
  }, []);

  const upload = useCallback(
    (file: File, projectId: number): Promise<ProjectDocument> => {
      return new Promise((resolve, reject) => {
        setIsUploading(true);
        setProgress(0);
        setError(null);

        const token = useAuthStore.getState().accessToken;
        const formData = new FormData();
        formData.append('file', file);

        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (evt) => {
          if (evt.lengthComputable) {
            const pct = Math.round((evt.loaded / evt.total) * 100);
            setProgress(pct);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const body = JSON.parse(xhr.responseText);
              const doc: ProjectDocument = body.data ?? body;
              setIsUploading(false);
              setProgress(100);
              resolve(doc);
            } catch {
              const err = 'Invalid response from server';
              setError(err);
              setIsUploading(false);
              reject(new Error(err));
            }
          } else {
            let msg = `Upload failed (${xhr.status})`;
            try {
              const body = JSON.parse(xhr.responseText);
              msg = body.error ?? msg;
            } catch {
              // use default message
            }
            setError(msg);
            setIsUploading(false);
            reject(new ApiError(xhr.status, msg));
          }
        });

        xhr.addEventListener('error', () => {
          const msg = 'Network error during upload';
          setError(msg);
          setIsUploading(false);
          reject(new Error(msg));
        });

        xhr.addEventListener('abort', () => {
          const msg = 'Upload cancelled';
          setError(msg);
          setIsUploading(false);
          reject(new Error(msg));
        });

        xhr.open('POST', `${API_BASE}/api/projects/${projectId}/documents`);
        if (token) {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }
        xhr.send(formData);
      });
    },
    []
  );

  return { isUploading, progress, error, upload, reset };
}
