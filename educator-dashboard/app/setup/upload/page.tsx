'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, FileText, X, ArrowRight, ArrowLeft, AlertCircle } from 'lucide-react';
import styles from '../course/step.module.css';

interface UploadedFile {
  name: string;
  size: string;
  type: 'pdf' | 'txt';
  status: 'uploading' | 'ready' | 'error';
  error?: string;
}

interface MaterialResponse {
  filename: string;
  type: 'pdf' | 'txt';
  size_bytes: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000';
const ACCEPTED_EXTENSIONS = ['.pdf', '.txt'];

function formatSize(size: number) {
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function getFileType(name: string): UploadedFile['type'] {
  return name.toLowerCase().endsWith('.txt') ? 'txt' : 'pdf';
}

function materialToUploadedFile(material: MaterialResponse): UploadedFile {
  return {
    name: material.filename,
    size: formatSize(material.size_bytes),
    type: material.type,
    status: 'ready',
  };
}

export default function UploadPage() {
  const router = useRouter();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMaterials, setLoadingMaterials] = useState(true);
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadMaterials() {
      try {
        const response = await fetch(`${API_BASE}/materials`);
        if (!response.ok) throw new Error('Could not load existing materials.');
        const body: { materials: MaterialResponse[] } = await response.json();
        if (!cancelled) {
          setFiles(body.materials.map(materialToUploadedFile));
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : 'Could not load existing materials.');
        }
      } finally {
        if (!cancelled) setLoadingMaterials(false);
      }
    }

    loadMaterials();

    return () => {
      cancelled = true;
    };
  }, []);

  const uploadFile = async (file: File) => {
    const suffix = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
    const type = getFileType(file.name);

    if (!ACCEPTED_EXTENSIONS.includes(suffix)) {
      setFiles(prev => [...prev, {
        name: file.name,
        size: formatSize(file.size),
        type,
        status: 'error',
        error: 'Only PDF and TXT files are supported.',
      }]);
      return;
    }

    setMessage('');
    setFiles(prev => [...prev, {
      name: file.name,
      size: formatSize(file.size),
      type,
      status: 'uploading',
    }]);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE}/materials/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail ?? 'Upload failed.');
      }

      const body: { materials?: MaterialResponse[] } = await response.json();
      if (body.materials) {
        setFiles(body.materials.map(materialToUploadedFile));
      } else {
        setFiles(prev => prev.map(item => (
          item.name === file.name
            ? { ...item, status: 'ready', error: undefined }
            : item
        )));
      }
      setMessage('Course materials uploaded and indexed.');
    } catch (error) {
      setFiles(prev => prev.map(item => (
        item.name === file.name
          ? { ...item, status: 'error', error: error instanceof Error ? error.message : 'Upload failed.' }
          : item
      )));
    }
  };

  const removeFile = async (name: string) => {
    if (!window.confirm(`Delete ${name}? This removes its indexed course content too.`)) return;

    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/materials/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      });
      const body: { materials?: MaterialResponse[]; detail?: string } = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail ?? 'Could not delete material.');
      setFiles((body.materials ?? []).map(materialToUploadedFile));
      setMessage('Course material and indexed content deleted.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not delete material.');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    Array.from(e.dataTransfer.files).forEach(uploadFile);
  };

  const handleContinue = async () => {
    setLoading(true);
    router.push('/setup/concepts');
  };

  return (
    <div className={styles.stepContainer}>
      <div className={styles.stepHeader}>
        <div className={styles.stepIconWrap}>
          <Upload size={24} />
        </div>
        <h1 className={styles.stepTitle}>Upload Course Materials</h1>
        <p className={styles.stepSubtitle}>Upload PDFs and text files. The system will parse and index them for course-grounded tutoring.</p>
      </div>

      <div className="card">
        <div
          className={`${styles.uploadZone} ${dragging ? styles.uploadZoneDragging : ''}`}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.txt"
            multiple
            style={{ display: 'none' }}
            onChange={e => {
              Array.from(e.target.files ?? []).forEach(uploadFile);
              e.currentTarget.value = '';
            }}
          />
          <div className={styles.uploadIcon}>
            <Upload size={26} />
          </div>
          <p className={styles.uploadTitle}>Drop files here or click to browse</p>
          <p className={styles.uploadSubtitle}>Supports PDF course notes and TXT materials</p>
          <div className={styles.uploadTypes}>
            <span className="badge badge-danger"><FileText size={10} /> PDF</span>
            <span className="badge badge-success"><FileText size={10} /> TXT</span>
          </div>
        </div>

        {message && (
          <div className="badge badge-success" style={{ marginTop: '16px' }}>
            {message}
          </div>
        )}

        {loadingMaterials && (
          <div className="badge" style={{ marginTop: '16px' }}>
            Loading existing materials
          </div>
        )}

        {files.length > 0 && (
          <div className={styles.fileList}>
            {files.map(file => (
              <div key={file.name} className={styles.fileItem}>
                <div className={`${styles.fileIcon} ${file.type === 'pdf' ? styles.fileIconPdf : styles.fileIconExcel}`}>
                  {file.type.toUpperCase()}
                </div>
                <div className={styles.fileInfo}>
                  <div className={styles.fileName}>{file.name}</div>
                  <div className={styles.fileSize}>{file.size}</div>
                  {file.status === 'uploading' && (
                    <div className={styles.fileProgress}>
                      <div className={styles.fileProgressFill} style={{ width: '65%' }} />
                    </div>
                  )}
                  {file.status === 'error' && (
                    <div className={styles.fileSize} style={{ color: 'var(--danger)' }}>
                      {file.error}
                    </div>
                  )}
                </div>
                {file.status === 'uploading' && (
                  <span className="badge">Indexing</span>
                )}
                {file.status === 'ready' && (
                  <span className="badge badge-success">Ready</span>
                )}
                {file.status === 'error' && (
                  <span className="badge badge-danger"><AlertCircle size={10} /> Error</span>
                )}
                <button className={styles.fileRemove} onClick={() => removeFile(file.name)} aria-label="Remove file">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className={styles.formActions} style={{ marginTop: '24px', justifyContent: 'space-between' }}>
          <button className="btn btn-secondary" onClick={() => router.push('/setup/course')}>
            <ArrowLeft size={16} /> Back
          </button>
          <button
            id="nextToConceptsBtn"
            className="btn btn-primary btn-lg"
            onClick={handleContinue}
            disabled={loading || files.some(file => file.status === 'uploading')}
          >
            {loading ? <span className={styles.spinner} /> : <>Continue <ArrowRight size={18} /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
