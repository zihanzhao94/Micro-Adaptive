'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileText, Plus, RefreshCw, Sparkles, X } from 'lucide-react';
import styles from '../dashboard.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000';

type CourseConcept = { id: string; name: string };

interface WeekGroup {
  week: number;
  materialCount: number;
  concepts: CourseConcept[];
}

interface ConceptWeeksResponse {
  totalWeeks: number | null;
  weeks: WeekGroup[];
  unassigned: CourseConcept[];
  allConcepts: CourseConcept[];
}

const EMPTY: ConceptWeeksResponse = { totalWeeks: null, weeks: [], unassigned: [], allConcepts: [] };

export default function ConceptsPage() {
  const [data, setData] = useState<ConceptWeeksResponse>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busyWeek, setBusyWeek] = useState<number | null>(null);
  const [adding, setAdding] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/course/concepts/weeks`);
      if (!response.ok) throw new Error('Could not load course concepts.');
      setData(await response.json());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load course concepts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /** Re-read a week's uploaded materials and re-derive its concepts. */
  const reExtract = async (week: number) => {
    setBusyWeek(week);
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/course/concepts/extract-week?week=${week}`, { method: 'POST' });
      const body: { created?: string[]; detail?: string } = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail ?? 'Could not derive concepts.');
      await load();
      setMessage(
        body.created?.length
          ? `Week ${week}: added ${body.created.length} new concept(s).`
          : `Week ${week}: no new concepts — the existing ones already cover it.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not derive concepts.');
    } finally {
      setBusyWeek(null);
    }
  };

  const unlink = async (conceptId: string, week: number) => {
    setData(previous => ({
      ...previous,
      weeks: previous.weeks.map(group =>
        group.week === week
          ? { ...group, concepts: group.concepts.filter(c => c.id !== conceptId) }
          : group
      ),
    }));
    try {
      const response = await fetch(`${API_BASE}/course/concepts/${conceptId}/weeks/${week}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Could not update the week.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update the week.');
      await load();
    }
  };

  const addToWeek = async (week: number, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const response = await fetch(`${API_BASE}/course/concepts/link-week`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week, concepts: [trimmed] }),
      });
      if (!response.ok) throw new Error('Could not add the concept.');
      setNewName('');
      setAdding(null);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not add the concept.');
    }
  };

  return (
    <>
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <div className={styles.topBarGreeting}>Course Concepts</div>
          <div className={styles.topBarDate}>
            What each week covers — these become the options students pick from in that week&apos;s reflection
          </div>
        </div>
      </div>

      <div className={styles.pageContent}>
        {message && (
          <div className="badge" style={{ marginBottom: 16 }}>{message}</div>
        )}

        {!loading && !data.totalWeeks && (
          <div className="card" style={{ maxWidth: 760 }}>
            <div style={{ fontSize: 13 }}>
              Set the total teaching weeks on the{' '}
              <a href="/dashboard/schedule" style={{ color: 'var(--primary-light)' }}>Weekly Push</a> page first —
              concepts are organised by week.
            </div>
          </div>
        )}

        {data.weeks.map(group => (
          <div className="card" key={group.week} style={{ maxWidth: 760, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>Week {group.week}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <FileText size={11} />
                  {group.materialCount} file{group.materialCount === 1 ? '' : 's'}
                </span>
              </div>
              {group.materialCount > 0 && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => reExtract(group.week)}
                  disabled={busyWeek === group.week}
                  title="Re-read this week's materials and derive its concepts again"
                >
                  {busyWeek === group.week
                    ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />
                    : <Sparkles size={12} />}
                  {busyWeek === group.week ? 'Working…' : 'Re-derive'}
                </button>
              )}
            </div>

            {group.concepts.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {group.materialCount === 0
                  ? 'No materials uploaded for this week — no reflection will be sent.'
                  : 'No concepts yet. Use Re-derive, or add one below.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {group.concepts.map(concept => (
                  <span
                    key={concept.id}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      fontSize: 12, padding: '4px 8px', borderRadius: 4,
                      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                    }}
                  >
                    {concept.name}
                    <button
                      onClick={() => unlink(concept.id, group.week)}
                      aria-label={`Remove ${concept.name} from week ${group.week}`}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {adding === group.week ? (
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <input
                  className="form-input"
                  autoFocus
                  value={newName}
                  placeholder="Concept name"
                  onChange={event => setNewName(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') { event.preventDefault(); addToWeek(group.week, newName); }
                    if (event.key === 'Escape') { setAdding(null); setNewName(''); }
                  }}
                  style={{ fontSize: 12 }}
                />
                <button className="btn btn-secondary btn-sm" onClick={() => addToWeek(group.week, newName)}>Add</button>
              </div>
            ) : (
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginTop: 10, fontSize: 11 }}
                onClick={() => { setAdding(group.week); setNewName(''); }}
              >
                <Plus size={11} /> Add concept
              </button>
            )}
          </div>
        ))}

      </div>
    </>
  );
}
