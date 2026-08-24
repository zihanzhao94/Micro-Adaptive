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

interface UnmatchedItem {
  text: string;
  count: number;
}

interface Misconception {
  studentName: string;
  text: string;
}

interface ClassAnalysis {
  summary: string;
  highlights: string[];
  responded: number;
}

interface ReflectionsResponse {
  week: number | null;
  analysis: ClassAnalysis | null;
  unmatched: UnmatchedItem[];
  misconceptions: Misconception[];
  availableWeeks: number[];
  respondedCount: number;
  totalStudents: number;
  concepts: ConceptCount[];
  confusions: Confusion[];
  note: string;
}

const EMPTY: ReflectionsResponse = {
  week: null, availableWeeks: [], respondedCount: 0, totalStudents: 0,
  concepts: [], confusions: [], unmatched: [], misconceptions: [], analysis: null, note: '',
};

export default function ReflectionsPage() {
  const [data, setData] = useState<ReflectionsResponse>(EMPTY);
  const [week, setWeek] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = useCallback(async (requestedWeek: number | null) => {
    setLoading(true);
    try {
      const query = requestedWeek === null ? '' : `?week=${requestedWeek}`;
      const response = await fetch(`${API_BASE}/reflections${query}`);
      if (!response.ok) throw new Error('Could not load reflections.');
      const body: ReflectionsResponse = await response.json();
      setData(body);
      setWeek(body.week);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load reflections.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(null); }, [load]);

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
              Once a weekly push goes out and students write what they remember, their answers appear here.
            </div>
          </div>
        )}

        {data.week !== null && (
          <>
            {data.analysis && (data.analysis.summary || data.analysis.highlights.length > 0) && (
              <div className="card" style={{ marginBottom: '16px', borderLeft: '3px solid var(--primary)' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '10px' }}>
                  This week, in short
                </div>

                {data.analysis.highlights.map(line => (
                  <div key={line} style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    · {line}
                  </div>
                ))}

                {data.analysis.summary && (
                  <div style={{ fontSize: '13px', lineHeight: 1.7, marginTop: '10px' }}>
                    {data.analysis.summary}
                  </div>
                )}
              </div>
            )}

            <div className="card">
              <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>
                Common uncertainties ({data.confusions.length})
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '18px' }}>
                What students said they were unsure about, in their own words — material for the
                first five minutes of your next lecture.
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

            {data.misconceptions.length > 0 && (
              <div className="card" style={{ marginTop: '16px' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>
                  Possible misconceptions ({data.misconceptions.length})
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '18px' }}>
                  Descriptions that read as incorrect or half-formed. Flagged from a few lines of
                  writing, so treat each as worth a look rather than a finding — a student may
                  simply have been brief.
                </div>

                {data.misconceptions.map((item, index) => (
                  <div
                    key={`${item.studentName}-${index}`}
                    style={{
                      borderLeft: '2px solid var(--warning, #e0a458)',
                      paddingLeft: '12px',
                      marginBottom: '14px',
                    }}
                  >
                    <div style={{ fontSize: '13px', lineHeight: 1.6 }}>“{item.text}”</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {item.studentName}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {data.unmatched.length > 0 && (
              <div className="card" style={{ marginTop: '16px' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>
                  Mentioned but not in your concept list ({data.unmatched.length})
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>
                  Students wrote about these, but they match none of week {data.week}&apos;s
                  concepts. Something several students mention usually means the concept list is
                  missing it; a one-off may be a misconception worth a look.
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {data.unmatched.map(item => (
                    <span
                      key={item.text}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        fontSize: '12px', padding: '4px 9px', borderRadius: '4px',
                        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                      }}
                    >
                      {item.text}
                      {item.count > 1 && (
                        <span style={{ fontSize: '10px', color: 'var(--primary-light)', fontWeight: 700 }}>
                          ×{item.count}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="card" style={{ marginTop: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>
                Concept recall
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '18px' }}>
                How many students named each of this week&apos;s concepts unprompted. Students were
                asked for about three things, so read this as which concepts came to mind most
                readily — not as how well each was understood.
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

          </>
        )}
      </div>
    </>
  );
}
