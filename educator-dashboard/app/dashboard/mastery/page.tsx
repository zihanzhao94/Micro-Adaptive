'use client';
import Link from 'next/link';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import styles from '../dashboard.module.css';
import masteryStyles from './mastery.module.css';

const CONCEPTS = [
  'Linear Regression', 'Gradient Descent', 'Backpropagation', 'Loss Functions',
  'Overfitting', 'Neural Networks', 'Regularization', 'Evaluation Metrics',
];

const STUDENTS = [
  { name: 'Alice T.', scores: [95, 80, 70, 85, 60, 55, 75, 90] },
  { name: 'Bob C.', scores: [70, 65, 50, 60, 80, 40, 55, 70] },
  { name: 'Carol L.', scores: [85, 90, 80, 75, 70, 85, 90, 80] },
  { name: 'David K.', scores: [40, 35, 30, 45, 50, 25, 40, 55] },
  { name: 'Eve M.', scores: [90, 85, 75, 80, 65, 70, 80, 85] },
  { name: 'Frank N.', scores: [60, 55, 45, 50, 70, 35, 60, 65] },
  { name: 'Grace O.', scores: [75, 70, 65, 70, 80, 60, 70, 75] },
  { name: 'Henry P.', scores: [50, 45, 35, 55, 60, 30, 50, 60] },
];

const conceptAvgs = CONCEPTS.map((c, ci) => ({
  concept: c.replace(' ', '\n'),
  avg: Math.round(STUDENTS.reduce((s, st) => s + st.scores[ci], 0) / STUDENTS.length),
}));

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

export default function MasteryPage() {
  return (
    <>
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <div className={styles.topBarGreeting}>Class Mastery Overview</div>
          <div className={styles.topBarDate}>CS5228 · Introduction to ML · 28 students</div>
        </div>
      </div>

      <div className={styles.pageContent}>
        {/* Concept Avg Chart */}
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
        </div>

        {/* Heatmap */}
        <div className="card">
          <div className="section-header">
            <div>
              <div className="section-title">Individual Student Mastery Heatmap</div>
              <div className="section-subtitle">Click a student to view detailed report</div>
            </div>
          </div>

          <div className={masteryStyles.heatmapWrap}>
            {/* Column headers */}
            <div className={masteryStyles.heatmapHeader}>
              <div className={masteryStyles.heatmapStudentCol} />
              {CONCEPTS.map(c => (
                <div key={c} className={masteryStyles.heatmapConceptLabel}>{c}</div>
              ))}
            </div>

            {/* Rows */}
            {STUDENTS.map((student, si) => {
              const avg = Math.round(student.scores.reduce((a, b) => a + b, 0) / student.scores.length);
              return (
                <Link
                  key={student.name}
                  href={`/dashboard/student/${si + 1}`}
                  id={`student-row-${si + 1}`}
                  className={masteryStyles.heatmapRow}
                >
                  <div className={masteryStyles.heatmapStudentName}>
                    <div className={masteryStyles.studentAvatar} style={{ background: getMasteryColor(avg) + '22', color: getMasteryColor(avg) }}>
                      {student.name[0]}
                    </div>
                    {student.name}
                  </div>
                  {student.scores.map((score, ci) => (
                    <div
                      key={ci}
                      className={masteryStyles.heatmapCell}
                      title={`${student.name} · ${CONCEPTS[ci]}: ${score}% (${getMasteryLabel(score)})`}
                      style={{ background: getMasteryColor(score) + '28', borderColor: getMasteryColor(score) + '50' }}
                    >
                      <span style={{ color: getMasteryColor(score), fontWeight: 700, fontSize: 12 }}>{score}%</span>
                    </div>
                  ))}
                  <span className={`badge ${avg >= 80 ? 'badge-success' : avg >= 60 ? 'badge-warning' : 'badge-danger'}`} style={{ marginLeft: '8px' }}>
                    {avg}%
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
