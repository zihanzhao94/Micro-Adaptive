'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Lightbulb, Plus, Sparkles, X } from 'lucide-react';
import styles from '../course/step.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000';

type CourseConcept = { id: string; name: string };

export default function ConceptsPage() {
  const router = useRouter();
  const [concepts, setConcepts] = useState<CourseConcept[]>([]);
  const [newConcept, setNewConcept] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
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
    const value = newConcept.trim();
    if (!value) return;
    if (concepts.some(concept => concept.name.toLowerCase() === value.toLowerCase())) {
      setMessage('That concept is already in the list.');
      return;
    }
    setConcepts(previous => [...previous, { id: '', name: value }]);
    setNewConcept('');
    setMessage('');
  };

  const generateSuggestions = async () => {
    setGenerating(true);
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/course/concepts/suggestions`, { method: 'POST' });
      const body: { concepts?: string[]; detail?: string } = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail ?? 'Could not generate suggestions.');
      setConcepts((body.concepts ?? []).map(name => ({ id: '', name })));
      setMessage('Suggestions generated. Review them before saving.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not generate suggestions.');
    } finally {
      setGenerating(false);
    }
  };

  const saveAndContinue = async () => {
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
      router.push('/setup/intention');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save course concepts.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.stepContainer}>
      <div className={styles.stepHeader}>
        <div className={styles.stepIconWrap}><Lightbulb size={24} /></div>
        <h1 className={styles.stepTitle}>Confirm Course Concepts</h1>
        <p className={styles.stepSubtitle}>
          Generate a draft from uploaded materials, then edit it. Only the concepts you save become part of the course structure.
        </p>
      </div>

      <div className="card">
        {message && (
          <div style={{ marginBottom: 16, color: message.startsWith('Could not') || message.startsWith('Upload') ? 'var(--danger)' : 'var(--text-secondary)', fontSize: 13 }}>
            {message}
          </div>
        )}

        <div className={styles.form}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div className="form-label">Core concepts</div>
              <div className="form-hint">Keep these broad enough to track student understanding across the course.</div>
            </div>
            <button type="button" className="btn btn-secondary" onClick={generateSuggestions} disabled={generating || loading}>
              {generating ? <span className={styles.spinner} /> : <Sparkles size={15} />}
              Generate suggestions
            </button>
          </div>

          <div className={styles.conceptList}>
            {concepts.map((concept, index) => (
              <div key={concept.id || `${concept.name}-${index}`} className={styles.conceptRow}>
                <span className={styles.objectiveNum}>{index + 1}.</span>
                <input
                  className="form-input"
                  value={concept.name}
                  onChange={event => setConcepts(previous => previous.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))}
                  aria-label={`Course concept ${index + 1}`}
                />
                <button type="button" className={styles.removeObjBtn} onClick={() => setConcepts(previous => previous.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${concept.name}`}>
                  <X size={14} />
                </button>
              </div>
            ))}
            {!loading && concepts.length === 0 && (
              <div className={styles.emptyConcepts}>No confirmed concepts yet. Generate suggestions or add your own.</div>
            )}
          </div>

          <div className={styles.addConceptRow}>
            <input
              className="form-input"
              value={newConcept}
              placeholder="Add a concept, e.g. API Gateway"
              onChange={event => setNewConcept(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addConcept(); } }}
            />
            <button type="button" className="btn btn-ghost" onClick={addConcept}><Plus size={15} /> Add</button>
          </div>

          <div className={styles.formActions} style={{ justifyContent: 'space-between' }}>
            <button className="btn btn-secondary" onClick={() => router.push('/setup/upload')}>
              <ArrowLeft size={16} /> Back
            </button>
            <button className="btn btn-primary btn-lg" onClick={saveAndContinue} disabled={saving || loading}>
              {saving ? <span className={styles.spinner} /> : <>Save concepts <ArrowRight size={18} /></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
