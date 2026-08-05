'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, Pencil, Plus, Save, X } from 'lucide-react';
import styles from '../dashboard.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000';

type CourseConcept = { id: string; name: string };

export default function ConceptsPage() {
  const [concepts, setConcepts] = useState<CourseConcept[]>([]);
  const [newConcept, setNewConcept] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function loadConcepts() {
      try {
        const response = await fetch(`${API_BASE}/course/concepts`);
        if (!response.ok) throw new Error('Could not load course concepts.');
        const body: { concepts: CourseConcept[] } = await response.json();
        setConcepts(body.concepts);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not load course concepts.');
      } finally {
        setLoading(false);
      }
    }
    loadConcepts();
  }, []);

  const addConcept = () => {
    const name = newConcept.trim();
    if (!name) return;
    if (concepts.some(concept => concept.name.toLowerCase() === name.toLowerCase())) {
      setMessage('That concept already exists.');
      return;
    }
    setConcepts(previous => [...previous, { id: '', name }]);
    setNewConcept('');
    setMessage('');
  };

  const saveConcepts = async () => {
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/course/concepts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concepts }),
      });
      const body: { concepts?: CourseConcept[]; detail?: string } = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail ?? 'Could not save course concepts.');
      setConcepts(body.concepts ?? concepts);
      setMessage('Course concepts saved. Existing mastery remains attached when a concept is renamed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save course concepts.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <div className={styles.topBarGreeting}>Course Concepts</div>
          <div className={styles.topBarDate}>Define the concepts used for adaptive activities and mastery tracking</div>
        </div>
      </div>

      <div className={styles.pageContent}>
        <div className="card" style={{ maxWidth: 760 }}>
          <div className="section-header">
            <div>
              <div className="section-title">Concept Map</div>
              <div className="section-subtitle">Rename a concept without losing its existing student mastery and activity history.</div>
            </div>
            <button className="btn btn-primary" onClick={saveConcepts} disabled={loading || saving}>
              {saving ? <span style={{ width: 14, height: 14 }} /> : <Save size={14} />} Save changes
            </button>
          </div>

          {message && (
            <div style={{ marginBottom: 14, fontSize: 13, color: message.startsWith('Could not') ? 'var(--danger)' : 'var(--success)' }}>
              {message}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {concepts.map((concept, index) => (
              <div key={concept.id || `${concept.name}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 22, fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>{index + 1}.</span>
                <Pencil size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <input
                  className="form-input"
                  value={concept.name}
                  onChange={event => setConcepts(previous => previous.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))}
                  aria-label={`Concept ${index + 1}`}
                />
                <button className="btn btn-ghost btn-sm" onClick={() => setConcepts(previous => previous.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${concept.name}`}>
                  <X size={14} />
                </button>
              </div>
            ))}
            {!loading && concepts.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No concepts have been confirmed yet.</div>}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <input
              className="form-input"
              value={newConcept}
              placeholder="Add a concept"
              onChange={event => setNewConcept(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addConcept(); } }}
            />
            <button className="btn btn-secondary" onClick={addConcept}><Plus size={14} /> Add</button>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 18, color: 'var(--text-muted)', fontSize: 12 }}>
            <CheckCircle size={14} style={{ color: 'var(--success)' }} />
            Existing activity history is retained for renamed concepts.
          </div>
        </div>
      </div>
    </>
  );
}
