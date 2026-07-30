'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Users, TrendingUp, AlertTriangle, Activity } from 'lucide-react';
import styles from './dashboard.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000';

type ConceptMastery = {
  concept: string;
  avg: number;
};

type DashboardSummary = {
  totalStudents: number;
  classAvgMastery: number;
  activeThisWeek: number;
  weakestConcept: ConceptMastery | null;
  conceptMastery: ConceptMastery[];
};

function getMasteryColor(score: number) {
  if (score >= 70) return '#10b981';
  if (score >= 50) return '#f59e0b';
  return '#ef4444';
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const loadSummary = async () => {
      try {
        const response = await fetch(`${API_BASE}/dashboard/summary`);
        if (!response.ok) throw new Error('Could not load dashboard summary.');
        setSummary(await response.json());
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not load dashboard summary.');
      } finally {
        setLoading(false);
      }
    };

    loadSummary();
  }, []);

  const stats = [
    { label: 'Total Students', value: String(summary?.totalStudents ?? 0), icon: Users, iconBg: 'rgba(99,102,241,0.15)', iconColor: '#818cf8' },
    { label: 'Class Avg Mastery', value: `${summary?.classAvgMastery ?? 0}%`, icon: TrendingUp, iconBg: 'rgba(16,185,129,0.15)', iconColor: '#10b981' },
    {
      label: 'Weakest Concept',
      value: summary?.weakestConcept ? `${summary.weakestConcept.concept} ${summary.weakestConcept.avg}%` : 'No data',
      icon: AlertTriangle,
      iconBg: 'rgba(239,68,68,0.15)',
      iconColor: '#ef4444',
    },
    {
      label: 'Active This Week',
      value: `${summary?.activeThisWeek ?? 0} / ${summary?.totalStudents ?? 0}`,
      icon: Activity,
      iconBg: 'rgba(245,158,11,0.15)',
      iconColor: '#f59e0b',
    },
  ];

  return (
    <>
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <div className={styles.topBarGreeting}>Overview</div>
          <div className={styles.topBarDate}>Educator dashboard</div>
        </div>
      </div>

      <div className={styles.pageContent}>
        {message && (
          <div className="card" style={{ marginBottom: 16, color: 'var(--danger)', fontSize: 13 }}>
            {message}
          </div>
        )}

        <div className={styles.statsGrid}>
          {stats.map(stat => (
            <div key={stat.label} className="stat-card">
              <div className={styles.statIcon} style={{ background: stat.iconBg }}>
                <stat.icon size={18} style={{ color: stat.iconColor }} />
              </div>
              <div className={styles.statLabel}>{stat.label}</div>
              <div
                className={styles.statValue}
                style={stat.label === 'Weakest Concept' ? { color: '#ef4444', fontSize: '20px' } : undefined}
              >
                {loading ? 'Loading' : stat.value}
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="section-header" style={{ marginBottom: '20px' }}>
            <div>
              <div className="section-title">Concept Mastery — Class Average</div>
              <div className="section-subtitle">Based on quiz performance across all students</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {(summary?.conceptMastery ?? []).map(item => {
              const color = getMasteryColor(item.avg);
              const isWeak = item.avg < 40;
              return (
                <div key={item.concept}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {item.concept}
                    </span>
                    <span style={{ fontSize: '14px', fontWeight: 700, color, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {item.avg}%
                      {isWeak && <span style={{ color: '#f59e0b', fontSize: '14px' }}>!</span>}
                    </span>
                  </div>
                  <div style={{ height: '12px', background: 'var(--bg-elevated)', borderRadius: '6px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${item.avg}%`,
                      background: color,
                      borderRadius: '6px',
                      transition: 'width 0.8s ease',
                    }} />
                  </div>
                </div>
              );
            })}

            {!loading && !summary?.conceptMastery.length && (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                No student mastery data yet. Students will appear here after they complete quizzes.
              </div>
            )}
          </div>
        </div>

        {summary?.weakestConcept && (
          <div style={{
            marginTop: '16px',
            padding: '14px 18px',
            background: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.25)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Insight: <strong style={{ color: 'var(--text-primary)' }}>{summary.weakestConcept.concept}</strong> is the weakest concept ({summary.weakestConcept.avg}%) — educator should{' '}
              <Link href="/dashboard/intention" style={{ color: 'var(--primary-light)', fontWeight: 600, textDecoration: 'underline' }}>
                update teaching intention
              </Link>{' '}
              to focus on this.
            </span>
          </div>
        )}
      </div>
    </>
  );
}
