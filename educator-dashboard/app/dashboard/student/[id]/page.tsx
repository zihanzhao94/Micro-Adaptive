'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import styles from '../../dashboard.module.css';
import studentStyles from './student.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000';

type Student = {
  id: string;
  name: string;
  email: string;
  telegramId: string;
  learningStyle: string;
  interests: string[];
};

type StudentOption = { id: string; name: string };
type ConceptCount = { name: string; count: number };
type Finding = { label: string; text: string };
type StudentConfusion = { week: number; text: string };

type StudentReflections = {
  studentName: string;
  week: number | null;
  answeredWeeks: number[];
  weeksAnswered: number;
  concepts: ConceptCount[];
  neverRecalled: string[];
  confusions: StudentConfusion[];
  analysis: {
    findings: Finding[];
    highlights: string[];
    responded: number;
    tooFew: boolean;
  };
};

function initials(name: string) {
  return name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
}

export default function StudentDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  // Arriving from the reflections page carries the week already being viewed.
  const initialWeek = searchParams.get('week');
  const [student, setStudent] = useState<Student | null>(null);
  const [data, setData] = useState<StudentReflections | null>(null);
  const [week, setWeek] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [students, setStudents] = useState<StudentOption[]>([]);
  const router = useRouter();

  // Null week means the whole term; a number narrows to that week. The endpoint
  // takes the same shape either way, so the page doesn't branch on it.
  const loadReflections = useCallback(async (requestedWeek: number | null) => {
    try {
      const query = requestedWeek === null ? '' : `?week=${requestedWeek}`;
      const response = await fetch(`${API_BASE}/students/${params.id}/reflections${query}`);
      if (!response.ok) throw new Error('Could not load this student\u2019s reflections.');
      setData(await response.json());
      setWeek(requestedWeek);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load reflections.');
    }
  }, [params.id]);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(`${API_BASE}/students/${params.id}`);
        if (!response.ok) throw new Error('Could not load student.');
        const body: { student: Student } = await response.json();
        setStudent(body.student);
        await loadReflections(initialWeek === null ? null : Number(initialWeek));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not load student.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [params.id, loadReflections, initialWeek]);

  useEffect(() => {
    fetch(`${API_BASE}/students`)
      .then(response => (response.ok ? response.json() : { students: [] }))
      .then(body => setStudents(body.students ?? []))
      .catch(() => setStudents([]));
  }, []);

  if (loading) {
    return (
      <div className={styles.pageContent}>
        <div className="card" style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading student...</div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className={styles.pageContent}>
        <Link href="/dashboard/students" id="backToStudentsBtn" className="btn btn-ghost btn-sm">
          <ArrowLeft size={15} /> Back
        </Link>
        <div className="card" style={{ marginTop: 16, color: 'var(--danger)', fontSize: 13 }}>
          {message || 'Student not found.'}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={styles.topBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link href="/dashboard/students" id="backToStudentsBtn" className="btn btn-ghost btn-sm">
            <ArrowLeft size={15} /> Back
          </Link>
          <div>
            <div className={styles.topBarGreeting}>{student.name}</div>
            <div className={styles.topBarDate}>{student.email || 'No email'} · {student.telegramId}</div>
          </div>
        </div>

        <div className={styles.topBarRight} style={{ display: 'flex', gap: '8px' }}>
          {students.length > 0 && (
            <select
              id="studentFilter"
              className="form-input"
              style={{ width: 'auto', fontSize: '13px' }}
              value={params.id}
              onChange={event => {
                const suffix = week === null ? '' : `?week=${week}`;
                router.push(
                  event.target.value === ''
                    ? `/dashboard/reflections${suffix}`
                    : `/dashboard/student/${event.target.value}${suffix}`
                );
              }}
            >
              <option value="">All students</option>
              {students.map(option => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </select>
          )}

          {data && data.answeredWeeks.length > 0 && (
            <select
              id="studentWeekFilter"
              className="form-input"
              style={{ width: 'auto', fontSize: '13px' }}
              value={week ?? ''}
              onChange={event =>
                loadReflections(event.target.value === '' ? null : Number(event.target.value))
              }
            >
              <option value="">All weeks</option>
              {data.answeredWeeks.map(w => <option key={w} value={w}>Week {w}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className={styles.pageContent}>
        <div className={studentStyles.grid}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="card">
              <div className={studentStyles.profileHeader}>
                <div className={studentStyles.profileAvatar}>{initials(student.name)}</div>
                <div>
                  <div className={studentStyles.profileName}>{student.name}</div>
                  <div className={studentStyles.profileMeta}>{student.email || student.telegramId}</div>
                  <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <span className="badge badge-primary">{student.learningStyle}</span>
                    {student.interests.map(interest => (
                      <span key={interest} className="badge badge-info">{interest}</span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="divider" />

              <div className={studentStyles.statsRow}>
                {[
                  { label: 'Weeks answered', value: String(data?.weeksAnswered ?? 0), color: 'var(--primary-light)' },
                  { label: 'Things flagged', value: String(data?.confusions.length ?? 0), color: 'var(--text-secondary)' },
                ].map(stat => (
                  <div key={stat.label} className={studentStyles.statItem}>
                    <div className={studentStyles.statVal} style={{ color: stat.color }}>{stat.value}</div>
                    <div className={studentStyles.statLbl}>{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {data && (data.analysis.findings.length > 0 || data.analysis.tooFew) && (
              <div className="card" style={{ borderLeft: '3px solid var(--primary)' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '10px' }}>
                  {week === null ? 'Across the term' : `Week ${week}`}
                </div>

                {data.analysis.highlights.map(line => (
                  <div key={line} style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    · {line}
                  </div>
                ))}

                {data.analysis.tooFew ? (
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px' }}>
                    This student hasn&apos;t answered a reflection {week === null ? 'yet' : 'that week'}.
                  </div>
                ) : data.analysis.findings.map(finding => (
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
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {data && data.confusions.length > 0 && (
              <div className="card">
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>
                  What they said they were unsure about
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                  In their own words, week by week.
                </div>
                {data.confusions.map(confusion => (
                  <div
                    key={`${confusion.week}-${confusion.text}`}
                    style={{ borderLeft: '2px solid var(--primary)', paddingLeft: '12px', marginBottom: '14px' }}
                  >
                    <div style={{ fontSize: '13px', lineHeight: 1.6 }}>{confusion.text}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Week {confusion.week}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {data && data.concepts.length > 0 && (
              <div className="card">
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>
                  Concepts they recalled
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                  How often each came up across the weeks they answered.
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {data.concepts.map(concept => (
                    <span key={concept.name} style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      fontSize: '12px', padding: '4px 9px', borderRadius: '4px',
                      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                    }}>
                      {concept.name}
                      {concept.count > 1 && (
                        <span style={{ fontSize: '10px', color: 'var(--primary-light)', fontWeight: 700 }}>
                          ×{concept.count}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {data && data.neverRecalled.length > 0 && (
              <div className="card">
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>
                  Not mentioned ({data.neverRecalled.length})
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                  Taught in the weeks this student answered, but never came up in what they wrote.
                  Weeks they skipped are excluded — there is no evidence either way for those.
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {data.neverRecalled.map(name => (
                    <span key={name} style={{
                      fontSize: '12px', padding: '4px 9px', borderRadius: '4px',
                      border: '1px solid var(--border)', color: 'var(--text-muted)',
                    }}>
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
