'use client';
import Link from 'next/link';
import { ArrowLeft, TrendingUp } from 'lucide-react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip
} from 'recharts';
import styles from '../../dashboard.module.css';
import studentStyles from './student.module.css';

const MOCK_STUDENT = {
  name: 'Alice Tan',
  email: 'alice.tan@u.nus.edu',
  telegramId: '@alice_tan',
  learningStyle: 'Analogy-Based',
  interests: ['Movies', 'Music', 'Sports'],
  enrolled: 'Aug 12, 2025',
  avgMastery: 78,
  quizzesDone: 12,
  masteryData: [
    { concept: 'Linear Reg.', score: 95 },
    { concept: 'Gradient Desc.', score: 80 },
    { concept: 'Backprop.', score: 70 },
    { concept: 'Loss Functions', score: 85 },
    { concept: 'Overfitting', score: 60 },
    { concept: 'Neural Nets', score: 55 },
  ],
  history: [
    { type: 'quiz',    text: 'Completed Week 3 Quiz — 90% correct',                   time: '5 min ago',   icon: '✅' },
    { type: 'chat',    text: 'Asked: "Can you explain backpropagation intuitively?"',   time: '2 hours ago', icon: '💬' },
    { type: 'quiz',    text: 'Completed Week 2 Quiz — 85% correct',                   time: 'Mon, 9:00 AM', icon: '✅' },
    { type: 'profile', text: 'Updated learning interest to: Movies, Music',            time: 'Sun, 3:12 PM', icon: '🎯' },
    { type: 'chat',    text: 'Asked: "What is the chain rule in simple terms?"',       time: 'Sun, 2:45 PM', icon: '💬' },
  ],
};

function getMasteryColor(score: number) {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#f59e0b';
  return '#ef4444';
}

export default function StudentDetailPage() {
  const s = MOCK_STUDENT;

  return (
    <>
      <div className={styles.topBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link href="/dashboard/students" id="backToStudentsBtn" className="btn btn-ghost btn-sm">
            <ArrowLeft size={15} /> Back
          </Link>
          <div>
            <div className={styles.topBarGreeting}>{s.name}</div>
            <div className={styles.topBarDate}>{s.email} · {s.telegramId}</div>
          </div>
        </div>
      </div>

      <div className={styles.pageContent}>
        <div className={studentStyles.grid}>
          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Profile card */}
            <div className="card">
              <div className={studentStyles.profileHeader}>
                <div className={studentStyles.profileAvatar}>
                  {s.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                  <div className={studentStyles.profileName}>{s.name}</div>
                  <div className={studentStyles.profileMeta}>{s.email}</div>
                  <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <span className="badge badge-primary">{s.learningStyle}</span>
                    {s.interests.map(i => (
                      <span key={i} className="badge badge-info">{i}</span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="divider" />

              <div className={studentStyles.statsRow}>
                {[
                  { label: 'Avg Mastery', value: `${s.avgMastery}%`, color: getMasteryColor(s.avgMastery) },
                  { label: 'Quizzes Done', value: String(s.quizzesDone), color: 'var(--primary-light)' },
                  { label: 'Enrolled', value: s.enrolled, color: 'var(--text-secondary)' },
                ].map(stat => (
                  <div key={stat.label} className={studentStyles.statItem}>
                    <div className={studentStyles.statVal} style={{ color: stat.color }}>{stat.value}</div>
                    <div className={studentStyles.statLbl}>{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Radar chart */}
            <div className="card">
              <div className="section-header" style={{ marginBottom: '8px' }}>
                <div className="section-title" style={{ fontSize: '15px' }}>Concept Mastery Radar</div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={s.masteryData}>
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis dataKey="concept" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                  <Radar dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                    formatter={(v) => [`${Number(v ?? 0)}%`, 'Mastery']}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Right: Activity timeline */}
          <div>
            <div className="card" style={{ height: '100%' }}>
              <div className="section-header">
                <div>
                  <div className="section-title">Learning History</div>
                  <div className="section-subtitle">Recent interactions and quiz results</div>
                </div>
              </div>

              <div className={studentStyles.timeline}>
                {s.history.map((item, i) => (
                  <div key={i} className={studentStyles.timelineItem}>
                    <div className={studentStyles.timelineIcon}>{item.icon}</div>
                    <div className={studentStyles.timelineContent}>
                      <div className={studentStyles.timelineText}>{item.text}</div>
                      <div className={studentStyles.timelineTime}>{item.time}</div>
                    </div>
                  </div>
                ))}
              </div>


            </div>
          </div>
        </div>

        {/* Mastery bars */}
        <div className="card" style={{ marginTop: '16px' }}>
          <div className="section-header">
            <div>
              <div className="section-title">Concept-by-Concept Mastery</div>
              <div className="section-subtitle">Detailed breakdown with trend</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {s.masteryData.map(item => (
              <div key={item.concept}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{item.concept}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <TrendingUp size={12} style={{ color: getMasteryColor(item.score) }} />
                    <span style={{ fontSize: '13px', fontWeight: 700, color: getMasteryColor(item.score) }}>{item.score}%</span>
                  </div>
                </div>
                <div style={{ height: '8px', background: 'var(--bg-elevated)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${item.score}%`,
                    background: getMasteryColor(item.score),
                    borderRadius: '4px',
                    transition: 'width 0.8s ease',
                    boxShadow: `0 0 8px ${getMasteryColor(item.score)}50`,
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
