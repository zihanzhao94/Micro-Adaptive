'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import styles from '../dashboard.module.css';
import masteryStyles from './mastery.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000';

type MasteryItem = {
  concept: string;
  score: number;
};

type Student = {
  id: string;
  name: string;
  avgMastery: number;
  mastery: MasteryItem[];
};

function getMasteryColor(score: number) {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#f59e0b';
  if (score >= 40) return '#f97316';
  return '#ef4444';
}

function getMasteryLabel(score: number) {
  if (score >= 80) return 'Mastered';
  if (score >= 60) return 'Progressing';
  if (score >= 40) return 'Developing';
  return 'Struggling';
}

function initials(name: string) {
  return name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
}

export default function MasteryPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const loadStudents = async () => {
      try {
        const response = await fetch(`${API_BASE}/students`);
        if (!response.ok) throw new Error('Could not load mastery data.');
        const body: { students: Student[] } = await response.json();
        setStudents(body.students);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not load mastery data.');
      } finally {
        setLoading(false);
      }
    };

    loadStudents();
  }, []);

  const concepts = useMemo(() => {
    return Array.from(new Set(students.flatMap(student => student.mastery.map(item => item.concept))));
  }, [students]);

  const conceptAvgs = useMemo(() => {
    return concepts.map(concept => {
      const scores = students
        .map(student => student.mastery.find(item => item.concept === concept)?.score)
        .filter((score): score is number => typeof score === 'number');

      return {
        concept: concept.replace(' ', '\n'),
        fullConcept: concept,
        avg: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0,
      };
    });
  }, [concepts, students]);

  return (
    <>
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <div className={styles.topBarGreeting}>Class Mastery Overview</div>
          <div className={styles.topBarDate}>{students.length} students</div>
        </div>
      </div>

      <div className={styles.pageContent}>
        {message && (
          <div className="card" style={{ marginBottom: 16, color: 'var(--danger)', fontSize: 13 }}>
            {message}
          </div>
        )}

        <div className="card" style={{ marginBottom: '20px' }}>
          <div className="section-header">
            <div>
              <div className="section-title">Average Mastery by Concept</div>
              <div className="section-subtitle">Class average across all students</div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[{ c: '#10b981', l: 'Mastered' }, { c: '#f59e0b', l: 'Progressing' }, { c: '#f97316', l: 'Developing' }, { c: '#ef4444', l: 'Struggling' }].map(({ c, l }) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-muted)' }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: c }} />
                  {l}
                </div>
              ))}
            </div>
          </div>

          {conceptAvgs.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={conceptAvgs} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="concept" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: 'var(--text-primary)' }}
                  formatter={(v) => [`${Number(v ?? 0)}%`, 'Avg Mastery']}
                />
                <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                  {conceptAvgs.map((entry, i) => (
                    <Cell key={i} fill={getMasteryColor(entry.avg)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              {loading ? 'Loading mastery data...' : 'No mastery data yet.'}
            </div>
          )}
        </div>

        <div className="card">
          <div className="section-header">
            <div>
              <div className="section-title">Individual Student Mastery Heatmap</div>
              <div className="section-subtitle">Click a student to view detailed report</div>
            </div>
          </div>

          {students.length > 0 && concepts.length > 0 ? (
            <div className={masteryStyles.heatmapWrap}>
              <div className={masteryStyles.heatmapHeader}>
                <div className={masteryStyles.heatmapStudentCol} />
                {concepts.map(concept => (
                  <div key={concept} className={masteryStyles.heatmapConceptLabel}>{concept}</div>
                ))}
              </div>

              {students.map(student => (
                <Link
                  key={student.id}
                  href={`/dashboard/student/${student.id}`}
                  id={`student-row-${student.id}`}
                  className={masteryStyles.heatmapRow}
                >
                  <div className={masteryStyles.heatmapStudentName}>
                    <div className={masteryStyles.studentAvatar} style={{ background: getMasteryColor(student.avgMastery) + '22', color: getMasteryColor(student.avgMastery) }}>
                      {initials(student.name)}
                    </div>
                    {student.name}
                  </div>
                  {concepts.map(concept => {
                    const score = student.mastery.find(item => item.concept === concept)?.score ?? 0;
                    return (
                      <div
                        key={concept}
                        className={masteryStyles.heatmapCell}
                        title={`${student.name} · ${concept}: ${score}% (${getMasteryLabel(score)})`}
                        style={{ background: getMasteryColor(score) + '28', borderColor: getMasteryColor(score) + '50' }}
                      >
                        <span style={{ color: getMasteryColor(score), fontWeight: 700, fontSize: 12 }}>{score}%</span>
                      </div>
                    );
                  })}
                  <span className={`badge ${student.avgMastery >= 80 ? 'badge-success' : student.avgMastery >= 60 ? 'badge-warning' : 'badge-danger'}`} style={{ marginLeft: '8px' }}>
                    {student.avgMastery}%
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              {loading ? 'Loading mastery data...' : 'No student mastery data yet.'}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
