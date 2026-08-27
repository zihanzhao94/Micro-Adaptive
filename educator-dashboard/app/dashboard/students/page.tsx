'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, Filter } from 'lucide-react';
import styles from '../dashboard.module.css';
import studentsStyles from './students.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000';

type Student = {
  id: string;
  name: string;
  telegramId: string;
  learningStyle: string;
  weeksAnswered: number;
  confusions: number;
};

// Participation against the weeks taught so far, not a mastery score: nothing
// in the reflection loop grades a student, so the list says how much they have
// taken part, and leaves judging the content to the student's own page.
function participationColor(answered: number, weeksSoFar: number) {
  if (!weeksSoFar) return 'var(--text-muted)';
  const share = answered / weeksSoFar;
  if (share >= 0.75) return 'var(--success)';
  if (share >= 0.4) return 'var(--warning)';
  return 'var(--danger)';
}

function initials(name: string) {
  return name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
}

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'quiet' | 'active'>('all');
  const [weeksSoFar, setWeeksSoFar] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const loadStudents = async () => {
      try {
        const response = await fetch(`${API_BASE}/students`);
        if (!response.ok) throw new Error('Could not load students.');
        const body: { students: Student[] } = await response.json();
        setStudents(body.students);

        // Participation is only meaningful against the weeks already taught —
        // nobody can have answered for a week that hasn't happened.
        const summary = await fetch(`${API_BASE}/dashboard/summary`);
        if (summary.ok) {
          const { currentWeek } = await summary.json();
          setWeeksSoFar(currentWeek ?? 0);
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not load students.');
      } finally {
        setLoading(false);
      }
    };

    loadStudents();
  }, []);

  const filtered = students.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.telegramId.toLowerCase().includes(search.toLowerCase());
    const share = weeksSoFar ? s.weeksAnswered / weeksSoFar : 0;
    const matchFilter = filter === 'all'
      ? true : filter === 'quiet'
        ? share < 0.4 : share >= 0.75;
    return matchSearch && matchFilter;
  });

  const quiet = students.filter(s => !weeksSoFar || s.weeksAnswered / weeksSoFar < 0.4).length;
  const answeredAny = students.filter(s => s.weeksAnswered > 0).length;

  return (
    <>
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <div className={styles.topBarGreeting}>Students</div>
          <div className={styles.topBarDate}>{students.length} enrolled</div>
        </div>
      </div>

      <div className={styles.pageContent}>
        {message && (
          <div className="card" style={{ marginBottom: 16, color: 'var(--danger)', fontSize: 13 }}>
            {message}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '24px' }}>
          {[
            { label: 'Enrolled', value: students.length.toString(), color: 'var(--primary-light)' },
            { label: 'Have reflected', value: answeredAny.toString(), color: 'var(--success)' },
            { label: 'Rarely reply', value: quiet.toString(), color: 'var(--warning)' },
          ].map(s => (
            <div key={s.label} className="stat-card" style={{ padding: '16px 20px' }}>
              <div className={styles.statValue} style={{ fontSize: '22px', color: s.color }}>
                {loading ? 'Loading' : s.value}
              </div>
              <div className={styles.statLabel}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input
              id="studentSearch"
              type="text"
              className="form-input"
              placeholder="Search by name or Telegram ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: '36px' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['all', 'active', 'quiet'] as const).map(f => (
              <button
                key={f}
                id={`filter-${f}`}
                className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilter(f)}
              >
                <Filter size={13} />
                {f === 'all' ? 'All' : f === 'active' ? 'Replies often' : 'Rarely replies'}
              </button>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className={studentsStyles.tableHeader}>
            <span>Student</span>
            <span>Weeks answered</span>
            <span>Flagged</span>
            <span>Style</span>
          </div>

          {filtered.map(student => {
            const colour = participationColor(student.weeksAnswered, weeksSoFar);
            return (
              <Link
                key={student.id}
                href={`/dashboard/student/${student.id}`}
                id={`student-${student.id}`}
                className={studentsStyles.tableRow}
              >
                <div className={studentsStyles.studentCell}>
                  <div className={studentsStyles.avatar} style={{ background: colour + '22', color: colour }}>
                    {initials(student.name)}
                  </div>
                  <div>
                    <div className={studentsStyles.studentName}>{student.name}</div>
                    <div className={studentsStyles.studentSub}>{student.telegramId}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ flex: 1, height: 6, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden', minWidth: 60 }}>
                    <div style={{
                      height: '100%',
                      width: `${weeksSoFar ? (student.weeksAnswered / weeksSoFar) * 100 : 0}%`,
                      background: colour,
                      borderRadius: 3,
                    }} />
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: colour, minWidth: '34px' }}>
                    {student.weeksAnswered}/{weeksSoFar || '—'}
                  </span>
                </div>

                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  {student.confusions}
                </span>

                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{student.learningStyle}</span>
              </Link>
            );
          })}

          {!loading && filtered.length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No students found.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
