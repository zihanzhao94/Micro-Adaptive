'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, Filter, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import styles from '../dashboard.module.css';
import studentsStyles from './students.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000';

type Student = {
  id: string;
  name: string;
  telegramId: string;
  avgMastery: number;
  quizzesDone: number;
  weeklyActive: number;
  trend: 'up' | 'down' | 'flat';
  learningStyle: string;
};

function getMasteryColor(score: number) {
  if (score >= 75) return 'var(--success)';
  if (score >= 55) return 'var(--warning)';
  return 'var(--danger)';
}

function getMasteryLabel(score: number) {
  if (score >= 75) return { text: 'On Track', cls: 'badge-success' };
  if (score >= 55) return { text: 'Progressing', cls: 'badge-warning' };
  return { text: 'Struggling', cls: 'badge-danger' };
}

function initials(name: string) {
  return name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
}

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'struggling' | 'ontrack'>('all');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const loadStudents = async () => {
      try {
        const response = await fetch(`${API_BASE}/students`);
        if (!response.ok) throw new Error('Could not load students.');
        const body: { students: Student[] } = await response.json();
        setStudents(body.students);
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
    const matchFilter = filter === 'all'
      ? true : filter === 'struggling'
        ? s.avgMastery < 55 : s.avgMastery >= 75;
    return matchSearch && matchFilter;
  });

  const struggling = students.filter(s => s.avgMastery < 55).length;
  const onTrack = students.filter(s => s.avgMastery >= 75).length;

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
            { label: 'Total Enrolled', value: students.length.toString(), color: 'var(--primary-light)' },
            { label: 'On Track (>=75%)', value: onTrack.toString(), color: 'var(--success)' },
            { label: 'Struggling (<55%)', value: struggling.toString(), color: 'var(--danger)' },
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
            {(['all', 'ontrack', 'struggling'] as const).map(f => (
              <button
                key={f}
                id={`filter-${f}`}
                className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilter(f)}
              >
                <Filter size={13} />
                {f === 'all' ? 'All' : f === 'ontrack' ? 'On Track' : 'Struggling'}
              </button>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className={studentsStyles.tableHeader}>
            <span>Student</span>
            <span>Avg Mastery</span>
            <span>Quizzes</span>
            <span>Style</span>
            <span>Active/Week</span>
            <span>Status</span>
          </div>

          {filtered.map(student => {
            const status = getMasteryLabel(student.avgMastery);
            return (
              <Link
                key={student.id}
                href={`/dashboard/student/${student.id}`}
                id={`student-${student.id}`}
                className={studentsStyles.tableRow}
              >
                <div className={studentsStyles.studentCell}>
                  <div className={studentsStyles.avatar} style={{ background: getMasteryColor(student.avgMastery) + '22', color: getMasteryColor(student.avgMastery) }}>
                    {initials(student.name)}
                  </div>
                  <div>
                    <div className={studentsStyles.studentName}>{student.name}</div>
                    <div className={studentsStyles.studentSub}>{student.telegramId}</div>
                  </div>
                </div>

                <div className={studentsStyles.masteryCell}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ flex: 1, height: 6, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden', minWidth: 80 }}>
                      <div style={{ height: '100%', width: `${student.avgMastery}%`, background: getMasteryColor(student.avgMastery), borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: getMasteryColor(student.avgMastery), minWidth: '34px' }}>
                      {student.avgMastery}%
                    </span>
                  </div>
                </div>

                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  {student.quizzesDone}
                </span>

                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{student.learningStyle}</span>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {student.trend === 'up' && <TrendingUp size={13} style={{ color: 'var(--success)' }} />}
                  {student.trend === 'down' && <TrendingDown size={13} style={{ color: 'var(--danger)' }} />}
                  {student.trend === 'flat' && <Minus size={13} style={{ color: 'var(--text-muted)' }} />}
                  <span style={{ fontSize: '12px', color: student.weeklyActive >= 5 ? 'var(--success)' : student.weeklyActive >= 3 ? 'var(--warning)' : 'var(--danger)', fontWeight: 600 }}>
                    {student.weeklyActive}/7
                  </span>
                </div>

                <span className={`badge ${status.cls}`}>{status.text}</span>
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
