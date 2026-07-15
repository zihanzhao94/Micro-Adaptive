import Link from 'next/link';
import { Users, TrendingUp, AlertTriangle, Activity } from 'lucide-react';
import styles from './dashboard.module.css';

// ⚠️ Mock data — replace with API when backend ready
const STATS = [
  { label: 'Total Students',    value: '32',            icon: Users,          iconBg: 'rgba(99,102,241,0.15)',  iconColor: '#818cf8' },
  { label: 'Class Avg Mastery', value: '56%',           icon: TrendingUp,     iconBg: 'rgba(16,185,129,0.15)',  iconColor: '#10b981' },
  { label: 'Weakest Concept',   value: 'Recursion 29%', icon: AlertTriangle,  iconBg: 'rgba(239,68,68,0.15)',   iconColor: '#ef4444' },
  { label: 'Active This Week',  value: '27 / 32',       icon: Activity,       iconBg: 'rgba(245,158,11,0.15)',  iconColor: '#f59e0b' },
];

const CONCEPT_MASTERY = [
  { concept: 'Variables & Types', avg: 75 },
  { concept: 'Loops',             avg: 66 },
  { concept: 'Functions',         avg: 53 },
  { concept: 'Recursion',         avg: 29 },
];

function getMasteryColor(score: number) {
  if (score >= 70) return '#10b981';
  if (score >= 50) return '#f59e0b';
  return '#ef4444';
}

// Find weakest concept for AI insight
const weakest = CONCEPT_MASTERY.reduce((a, b) => a.avg < b.avg ? a : b);

export default function DashboardPage() {
  return (
    <>
      {/* Top Bar */}
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <div className={styles.topBarGreeting}>Overview — CS101 Introduction to Python</div>
          <div className={styles.topBarDate}>Educator Weekly 1/3 · View Overview</div>
        </div>
      </div>

      <div className={styles.pageContent}>
        {/* Stats Row */}
        <div className={styles.statsGrid}>
          {STATS.map(stat => (
            <div key={stat.label} className="stat-card">
              <div className={styles.statIcon} style={{ background: stat.iconBg }}>
                <stat.icon size={18} style={{ color: stat.iconColor }} />
              </div>
              <div className={styles.statLabel}>{stat.label}</div>
              <div
                className={styles.statValue}
                style={stat.label === 'Weakest Concept' ? { color: '#ef4444', fontSize: '20px' } : undefined}
              >
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        {/* Concept Mastery — Class Average */}
        <div className="card">
          <div className="section-header" style={{ marginBottom: '20px' }}>
            <div>
              <div className="section-title">Concept Mastery — Class Average</div>
              <div className="section-subtitle">Based on quiz performance across all students</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {CONCEPT_MASTERY.map(item => {
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
                      {isWeak && <span style={{ color: '#f59e0b', fontSize: '14px' }}>⚠️</span>}
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
          </div>
        </div>

        {/* AI Insight */}
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
          <span style={{ fontSize: '16px' }}>💡</span>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Insight: <strong style={{ color: 'var(--text-primary)' }}>{weakest.concept}</strong> is the weakest concept ({weakest.avg}%) — educator should{' '}
            <Link href="/dashboard/intention" style={{ color: 'var(--primary-light)', fontWeight: 600, textDecoration: 'underline' }}>
              update teaching intention
            </Link>{' '}
            to focus on this.
          </span>
        </div>
      </div>
    </>
  );
}
