'use client';
import { useEffect, useRef, useState } from 'react';
import { Upload, FileText, X, RefreshCw, AlertCircle } from 'lucide-react';
import styles from '../dashboard.module.css';
import matStyles from './materials.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000';
const ACCEPTED_EXTENSIONS = ['.pdf', '.txt'];

interface MaterialResponse {
  filename: string;
  type: 'pdf' | 'txt';
  size_bytes: number;
  status?: 'indexed' | 'processing' | 'error';
  updated_at?: string;
  week_no?: number | null;
}

interface FileItem {
  id: string;
  name: string;
  size: string;
  type: 'pdf' | 'txt';
  uploadedAt: string;
  status: 'indexed' | 'processing' | 'error';
  week: number | null;
  error?: string;
}

interface CourseConcept {
  id: string;
  name: string;
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
    uploadedAt: material.updated_at ? new Date(material.updated_at).toLocaleString() : 'Saved',
    status: material.status ?? 'indexed',
    week: material.week_no ?? null,
  };
}

// Week 1 first, unscheduled material last.
function byWeek(a: FileItem, b: FileItem) {
  return (a.week ?? Infinity) - (b.week ?? Infinity) || a.name.localeCompare(b.name);
}

function groupByWeek(files: FileItem[]): { week: number | null; files: FileItem[] }[] {
  const groups = new Map<number | null, FileItem[]>();
  for (const file of [...files].sort(byWeek)) {
    const bucket = groups.get(file.week);
    if (bucket) bucket.push(file);
    else groups.set(file.week, [file]);
  }
  return [...groups].map(([week, files]) => ({ week, files }));
}

export default function MaterialsPage() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [uploadWeek, setUploadWeek] = useState<string>('');
  const [totalWeeks, setTotalWeeks] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Week choices come from the course's teaching weeks, set on the Weekly Push page.
  const weekOptions = Array.from({ length: totalWeeks ?? 0 }, (_, i) => i + 1);

  const removeFile = async (file: FileItem) => {
    if (!window.confirm(`Delete ${file.name}? This removes its indexed course content too.`)) return;

    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/materials/${encodeURIComponent(file.name)}`, {
        method: 'DELETE',
      });
      const body: { materials?: MaterialResponse[]; detail?: string } = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail ?? 'Could not delete material.');
      setFiles((body.materials ?? []).map(materialToFileItem));
      setMessage('Material and its indexed content were deleted.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not delete material.');
    }
  };

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

  const loadTotalWeeks = async () => {
    try {
      const response = await fetch(`${API_BASE}/course`);
      if (!response.ok) return;
      const { course } = await response.json();
      setTotalWeeks(course.totalWeeks ?? null);
    } catch {
      // Week tagging just stays unavailable if the course can't be read.
    }
  };

  useEffect(() => {
    loadMaterials();
    loadTotalWeeks();
  }, []);

  const refreshConceptSuggestions = async () => {
    const conceptsResponse = await fetch(`${API_BASE}/course/concepts`);
    const conceptsBody: { concepts?: CourseConcept[]; detail?: string } = await conceptsResponse.json().catch(() => ({}));
    if (!conceptsResponse.ok) throw new Error(conceptsBody.detail ?? 'Could not load current concepts.');

    const suggestionResponse = await fetch(`${API_BASE}/course/concepts/suggestions`, { method: 'POST' });
    const suggestionBody: { concepts?: string[]; detail?: string } = await suggestionResponse.json().catch(() => ({}));
    if (!suggestionResponse.ok) throw new Error(suggestionBody.detail ?? 'Could not generate concept suggestions.');

    const currentConcepts = conceptsBody.concepts ?? [];
    const existing = new Set(currentConcepts.map(concept => concept.name.trim().toLowerCase()));
    const additions = (suggestionBody.concepts ?? [])
      .map(name => name.trim())
      .filter(name => name && !existing.has(name.toLowerCase()));

    if (additions.length === 0) return 0;

    const mergedConcepts = [
      ...currentConcepts,
      ...additions.map(name => ({ id: '', name })),
    ];

    const saveResponse = await fetch(`${API_BASE}/course/concepts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ concepts: mergedConcepts }),
    });
    const saveBody: { detail?: string } = await saveResponse.json().catch(() => ({}));
    if (!saveResponse.ok) throw new Error(saveBody.detail ?? 'Could not save concept suggestions.');

    return additions.length;
  };

  const uploadFile = async (file: File) => {
    const suffix = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
    const type = getFileType(file.name);

    if (!uploadWeek) {
      setMessage(
        totalWeeks
          ? 'Pick the teaching week this material belongs to before uploading.'
          : 'Set the number of teaching weeks on the Weekly Push page before uploading materials.'
      );
      return;
    }

    if (!ACCEPTED_EXTENSIONS.includes(suffix)) {
      setFiles(prev => [...prev, {
        id: `${file.name}-${Date.now()}`,
        name: file.name,
        size: formatSize(file.size),
        type,
        uploadedAt: 'Just now',
        status: 'error',
        week: null,
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
      week: uploadWeek ? Number(uploadWeek) : null,
    };
    setFiles(prev => [...prev, newFile]);

    const formData = new FormData();
    formData.append('file', file);
    if (uploadWeek) formData.append('week', uploadWeek);

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
      try {
        const addedConcepts = await refreshConceptSuggestions();
        setMessage(
          addedConcepts > 0
            ? `Material uploaded and indexed. Added ${addedConcepts} suggested concepts. Review them in Course Concepts.`
            : 'Material uploaded and indexed. Course concepts are already up to date.'
        );
      } catch (conceptError) {
        setMessage(
          `Material uploaded and indexed. Concept suggestions were not updated: ${
            conceptError instanceof Error ? conceptError.message : 'unknown error'
          }`
        );
      }
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
        <input ref={inputRef} type="file" accept=".pdf,.txt" multiple style={{ display: 'none' }}
          onChange={e => {
            Array.from(e.target.files ?? []).forEach(uploadFile);
            e.currentTarget.value = '';
          }}
        />
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
          <span className={matStyles.dropText}>
            {uploadWeek
              ? `Drop PDF or TXT files here to add them to Week ${uploadWeek}`
              : 'Drop PDF or TXT files here, or click to upload'}
          </span>

          {/* Sits inside the drop zone so the week is chosen before the files are picked. */}
          <label
            style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}
            onClick={e => e.stopPropagation()}
          >
            Upload to
            <select
              id="uploadWeek"
              className="form-input"
              style={{ padding: '5px 10px', fontSize: '12px', width: 'auto' }}
              value={uploadWeek}
              onChange={e => setUploadWeek(e.target.value)}
              disabled={!totalWeeks}
            >
              <option value="">{totalWeeks ? 'Select week…' : 'Set teaching weeks first'}</option>
              {weekOptions.map(w => <option key={w} value={w}>Week {w}</option>)}
            </select>
          </label>

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
          {groupByWeek(files).map(group => (
            <div key={group.week ?? 'unscheduled'}>
              <div className={matStyles.weekHeader}>
                <span>{group.week === null ? 'Unscheduled' : `Week ${group.week}`}</span>
                <span className={matStyles.weekCount}>
                  {group.files.length} {group.files.length === 1 ? 'file' : 'files'}
                </span>
              </div>
              {group.files.map(file => (
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
              <button id={`remove-file-${file.id}`} className={matStyles.removeBtn} onClick={() => removeFile(file)} aria-label={`Delete ${file.name}`}>
                <X size={14} />
              </button>
            </div>
              ))}
            </div>
          ))}
          {!loading && files.length === 0 && (
            <div className={matStyles.tableRow}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                No materials yet. Pick a week above, then upload.
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
