'use client';
import { useCallback, useEffect, useState } from 'react';
import { MessageSquareQuote } from 'lucide-react';
import styles from '../dashboard.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000';

interface ConceptCount {
  name: string;
  count: number;
}

interface Confusion {
  studentName: string;
  text: string;
  updatedAt: string;
}

interface ReflectionsResponse {
  week: number | null;
  availableWeeks: number[];
  respondedCount: number;
  totalStudents: number;
  concepts: ConceptCount[];
  confusions: Confusion[];
  note: string;
}

const EMPTY: ReflectionsResponse = {
  week: null, availableWeeks: [], respondedCount: 0, totalStudents: 0,
  concepts: [], confusions: [], note: '',
};

export default function ReflectionsPage() {
  const [data, setData] = useState<ReflectionsResponse>(EMPTY);
  const [week, setWeek] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const load = useCallback(async (requestedWeek: number | null) => {
    setLoading(true);
    try {
      const query = requestedWeek === null ? '' : `?week=${requestedWeek}`;
      const response = await fetch(`${API_BASE}/reflections${query}`);
      if (!response.ok) throw new Error('Could not load reflections.');
      const body: ReflectionsResponse = await response.json();
      setData(body);
      setWeek(body.week);
      setNote(body.note ?? '');
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load reflections.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(null); }, [load]);

  const saveNote = async () => {
    if (data.week === null) return;
    setSavingNote(true);
    try {
      const response = await fetch(`${API_BASE}/reflections/${data.week}/note`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      if (!response.ok) throw new Error('Could not save note.');
      setMessage('Note saved — it goes out with this week’s class digest.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save note.');
    } finally {
      setSavingNote(false);
    }
  };

  const responseRate = data.totalStudents
    ? Math.round((data.respondedCount / data.totalStudents) * 100)
    : 0;
  const topCount = Math.max(1, ...data.concepts.map(c => c.count));

  return (
    <>
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <div className={styles.topBarGreeting}>Weekly Reflections</div>
          <div className={styles.topBarDate}>
            {data.week === null
              ? 'No reflections yet'
              : `Week ${data.week} · ${data.respondedCount}/${data.totalStudents} replied (${responseRate}%)`}
          </div>
        </div>
        {data.availableWeeks.length > 0 && (
          <div className={styles.topBarRight}>
            <select
              id="weekFilter"
              className="form-input"
              style={{ width: 'auto', fontSize: '13px' }}
              value={week ?? ''}
              onChange={e => load(Number(e.target.value))}
            >
              {data.availableWeeks.map(w => <option key={w} value={w}>Week {w}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className={styles.pageContent}>
        {message && <div className="badge badge-danger" style={{ marginBottom: '16px' }}>{message}</div>}

        {!loading && data.week === null && (
          <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
            <MessageSquareQuote size={28} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
            <div style={{ fontSize: '14px', fontWeight: 600 }}>No reflections have come in yet</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
              Once a weekly push goes out and students tap their concepts, their answers appear here.
            </div>
          </div>
        )}

        {data.week !== null && (
          <>
            <div className="card" style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>
                What students thought mattered
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '18px' }}>
                Concepts this week&apos;s material covered, ranked by how many students picked them.
                A zero means it was taught but did not land.
              </div>

              {data.concepts.map(concept => (
                <div key={concept.name} style={{
                  display: 'grid', gridTemplateColumns: '220px 1fr 40px',
                  gap: '12px', alignItems: 'center', marginBottom: '10px',
                }}>
                  <span style={{
                    fontSize: '13px',
                    color: concept.count === 0 ? 'var(--text-muted)' : 'inherit',
                  }}>
                    {concept.name}
                  </span>
                  <div style={{ background: 'var(--bg-elevated)', borderRadius: '4px', height: '10px' }}>
                    <div style={{
                      width: `${(concept.count / topCount) * 100}%`,
                      height: '100%',
                      borderRadius: '4px',
                      background: concept.count === 0 ? 'transparent' : 'var(--primary)',
                      transition: 'width 200ms',
                    }} />
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'right' }}>
                    {concept.count}
                  </span>
                </div>
              ))}
            </div>

            <div className="card">
              <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>
                Still unclear ({data.confusions.length})
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '18px' }}>
                Raw answers, in students&apos; own words — material for the first five minutes of your next lecture.
              </div>

              {data.confusions.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  Nobody reported a confusion this week.
                </div>
              ) : data.confusions.map(confusion => (
                <div
                  key={`${confusion.studentName}-${confusion.updatedAt}`}
                  style={{
                    borderLeft: '2px solid var(--primary)',
                    paddingLeft: '12px',
                    marginBottom: '14px',
                  }}
                >
                  <div style={{ fontSize: '13px', lineHeight: 1.6 }}>{confusion.text}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {confusion.studentName}
                  </div>
                </div>
              ))}
            </div>

            <div className="card" style={{ marginTop: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>
                Add a line for the class (optional)
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>
                24 hours after each push, students get a digest of how the class answered.
                Anything you write here is appended to it. The digest goes out either way.
              </div>
              <textarea
                id="weekNote"
                className="form-input form-textarea"
                rows={2}
                placeholder="e.g. I'll spend the first 5 minutes of Monday's lecture on 3NF vs BCNF."
                value={note}
                onChange={e => setNote(e.target.value)}
              />
              <button
                id="saveNoteBtn"
                className="btn btn-primary btn-sm"
                style={{ marginTop: '12px' }}
                onClick={saveNote}
                disabled={savingNote}
              >
                {savingNote ? 'Saving…' : 'Save note'}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
