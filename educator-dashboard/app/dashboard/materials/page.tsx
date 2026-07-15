'use client';
import { useEffect, useRef, useState } from 'react';
import { Upload, FileText, X, Plus, RefreshCw, AlertCircle } from 'lucide-react';
import styles from '../dashboard.module.css';
import matStyles from './materials.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000';
const ACCEPTED_EXTENSIONS = ['.pdf', '.txt'];

interface MaterialResponse {
  filename: string;
  type: 'pdf' | 'txt';
  size_bytes: number;
}

interface FileItem {
  id: string;
  name: string;
  size: string;
  type: 'pdf' | 'txt';
  uploadedAt: string;
  status: 'indexed' | 'processing' | 'error';
  error?: string;
}

function formatSize(size: number) {
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function getFileType(name: string): FileItem['type'] {
  return name.toLowerCase().endsWith('.txt') ? 'txt' : 'pdf';
}

function materialToFileItem(material: MaterialResponse): FileItem {
  return {
    id: material.filename,
    name: material.filename,
    size: formatSize(material.size_bytes),
    type: material.type,
    uploadedAt: 'Saved',
    status: 'indexed',
  };
}

export default function MaterialsPage() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const removeFile = (id: string) => setFiles(prev => prev.filter(f => f.id !== id));

  const loadMaterials = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/materials`);
      if (!response.ok) throw new Error('Could not load materials.');
      const body: { materials: MaterialResponse[] } = await response.json();
      setFiles(body.materials.map(materialToFileItem));
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load materials.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMaterials();
  }, []);

  const uploadFile = async (file: File) => {
    const suffix = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
    const type = getFileType(file.name);

    if (!ACCEPTED_EXTENSIONS.includes(suffix)) {
      setFiles(prev => [...prev, {
        id: `${file.name}-${Date.now()}`,
        name: file.name,
        size: formatSize(file.size),
        type,
        uploadedAt: 'Just now',
        status: 'error',
        error: 'Only PDF and TXT files are supported.',
      }]);
      return;
    }

    const newFile: FileItem = {
      id: `${file.name}-${Date.now()}`,
      name: file.name,
      size: formatSize(file.size),
      type,
      uploadedAt: 'Just now',
      status: 'processing',
    };
    setFiles(prev => [...prev, newFile]);

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
        setFiles(body.materials.map(materialToFileItem));
      } else {
        setFiles(prev => prev.map(item => (
          item.id === newFile.id ? { ...item, status: 'indexed' } : item
        )));
      }
      setMessage('Material uploaded and indexed.');
    } catch (error) {
      setFiles(prev => prev.map(item => (
        item.id === newFile.id
          ? { ...item, status: 'error', error: error instanceof Error ? error.message : 'Upload failed.' }
          : item
      )));
    }
  };

  const indexedCount = files.filter(f => f.status === 'indexed').length;

  return (
    <>
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <div className={styles.topBarGreeting}>Course Materials</div>
          <div className={styles.topBarDate}>{indexedCount}/{files.length} files indexed</div>
        </div>
        <div className={styles.topBarRight}>
          <button id="uploadMaterialBtn" className="btn btn-primary btn-sm" onClick={() => inputRef.current?.click()}>
            <Plus size={14} /> Upload File
          </button>
          <input ref={inputRef} type="file" accept=".pdf,.txt" multiple style={{ display: 'none' }}
            onChange={e => {
              Array.from(e.target.files ?? []).forEach(uploadFile);
              e.currentTarget.value = '';
            }}
          />
        </div>
      </div>

      <div className={styles.pageContent}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '24px' }}>
          {[
            { label: 'Total Files',      value: files.length.toString() },
            { label: 'Indexed',          value: indexedCount.toString() },
            { label: 'Processing',       value: files.filter(f => f.status === 'processing').length.toString() },
          ].map(s => (
            <div key={s.label} className="stat-card" style={{ padding: '16px 20px' }}>
              <div className={styles.statValue} style={{ fontSize: '22px' }}>{s.value}</div>
              <div className={styles.statLabel}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Drop Zone */}
        <div
          className={`card ${matStyles.dropZone} ${dragging ? matStyles.dropZoneDragging : ''}`}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => {
            e.preventDefault(); setDragging(false);
            Array.from(e.dataTransfer.files).forEach(uploadFile);
          }}
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={22} className={matStyles.dropIcon} />
          <span className={matStyles.dropText}>Drop PDF or TXT files here, or click to upload</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span className="badge badge-danger"><FileText size={10} /> PDF</span>
            <span className="badge badge-success"><FileText size={10} /> TXT</span>
          </div>
        </div>

        {message && (
          <div className="badge" style={{ marginTop: '16px' }}>
            {message}
          </div>
        )}

        {/* File List */}
        <div className="card" style={{ marginTop: '16px', padding: '0', overflow: 'hidden' }}>
          <div className={matStyles.tableHeader}>
            <span>File</span>
            <span>Type</span>
            <span>Uploaded</span>
            <span>Status</span>
            <span></span>
          </div>
          {loading && (
            <div className={matStyles.tableRow}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Loading materials...</span>
            </div>
          )}
          {files.map(file => (
            <div key={file.id} className={matStyles.tableRow}>
              <div className={matStyles.fileNameCell}>
                <div className={`${matStyles.fileTypeIcon} ${file.type === 'pdf' ? matStyles.pdf : matStyles.txt}`}>
                  {file.type.toUpperCase()}
                </div>
                <div>
                  <div className={matStyles.fileName}>{file.name}</div>
                  <div className={matStyles.fileSize}>{file.size}</div>
                  {file.status === 'error' && (
                    <div className={matStyles.fileSize} style={{ color: 'var(--danger)' }}>
                      {file.error}
                    </div>
                  )}
                </div>
              </div>
              <span className={`badge ${file.type === 'pdf' ? 'badge-danger' : 'badge-success'}`}>
                {file.type.toUpperCase()}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{file.uploadedAt}</span>
              <span>
                {file.status === 'indexed'
                  ? <span className="badge badge-success">Indexed</span>
                  : file.status === 'processing'
                    ? <span className="badge badge-warning" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <RefreshCw size={10} style={{ animation: 'spin 1s linear infinite' }} /> Processing
                      </span>
                    : <span className="badge badge-danger" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <AlertCircle size={10} /> Error
                      </span>
                }
              </span>
              <button id={`remove-file-${file.id}`} className={matStyles.removeBtn} onClick={() => removeFile(file.id)} aria-label="Remove">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
