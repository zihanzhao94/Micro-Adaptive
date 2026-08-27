'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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

interface StudentOption {
  id: string;
  name: string;
}

interface Finding {
  label: string;
  text: string;
}

interface ClassAnalysis {
  findings: Finding[];
  highlights: string[];
  responded: number;
  tooFew: boolean;
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

function ReflectionsView() {
  const [data, setData] = useState<ReflectionsResponse>(EMPTY);
  const [week, setWeek] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [students, setStudents] = useState<StudentOption[]>([]);
  const router = useRouter();
  const searchParams = useSearchParams();
  // Coming back from a student keeps whichever week was being looked at.
  const initialWeek = searchParams.get('week');

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

  useEffect(() => {
    load(initialWeek === null ? null : Number(initialWeek));
  }, [load, initialWeek]);

  useEffect(() => {
    // Only for the picker — the class analysis on this page never needs it.
    fetch(`${API_BASE}/students`)
      .then(response => (response.ok ? response.json() : { students: [] }))
      .then(body => setStudents(body.students ?? []))
      .catch(() => setStudents([]));
  }, []);

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
        <div className={styles.topBarRight} style={{ display: 'flex', gap: '8px' }}>
          {students.length > 0 && (
            <select
              id="studentFilter"
              className="form-input"
              style={{ width: 'auto', fontSize: '13px' }}
              value=""
              onChange={event => {
                // Carries the chosen week through, so picking a student narrows
                // rather than resetting what the educator was already looking at.
                const suffix = week === null ? '' : `?week=${week}`;
                router.push(`/dashboard/student/${event.target.value}${suffix}`);
              }}
            >
              <option value="">All students</option>
              {students.map(student => (
                <option key={student.id} value={student.id}>{student.name}</option>
              ))}
            </select>
          )}

          {data.availableWeeks.length > 0 && (
            <select
              id="weekFilter"
              className="form-input"
              style={{ width: 'auto', fontSize: '13px' }}
              value={week ?? ''}
              onChange={e => load(Number(e.target.value))}
            >
              {data.availableWeeks.map(w => <option key={w} value={w}>Week {w}</option>)}
            </select>
          )}
        </div>
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
            {data.analysis && (data.analysis.findings.length > 0 || data.analysis.highlights.length > 0 || data.analysis.tooFew) && (
              <div className="card" style={{ marginBottom: '16px', borderLeft: '3px solid var(--primary)' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '10px' }}>
                  This week, in short
                </div>

                {data.analysis.highlights.map(line => (
                  <div key={line} style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    · {line}
                  </div>
                ))}

                {data.analysis.tooFew && (
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.7 }}>
                    {data.analysis.responded === 0
                      ? 'No replies yet this week.'
                      : `Only ${data.analysis.responded} ${data.analysis.responded === 1 ? 'reply' : 'replies'} so far — too few to read as a class pattern. Individual answers are below.`}
                  </div>
                )}

                {data.analysis.findings.map(finding => (
                  <div key={finding.label} style={{ marginTop: '14px' }}>
                    <div style={{
                      fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase',
                      color: 'var(--primary-light)', fontWeight: 700, marginBottom: '4px',
                    }}>
                      {finding.label}
                    </div>
                    <div style={{ fontSize: '13px', lineHeight: 1.7 }}>{finding.text}</div>
                  </div>
                ))}
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
                  Mentioned but not in this week's concepts ({data.unmatched.length})
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


export default function ReflectionsPage() {
  return (
    <Suspense fallback={null}>
      <ReflectionsView />
    </Suspense>
  );
}
