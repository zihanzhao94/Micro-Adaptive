'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, TrendingUp } from 'lucide-react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip
} from 'recharts';
import styles from '../../dashboard.module.css';
import studentStyles from './student.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000';

type MasteryItem = {
  concept: string;
  score: number;
};

type HistoryItem = {
  type: string;
  text: string;
  time: string;
};

type Student = {
  id: string;
  name: string;
  email: string;
  telegramId: string;
  learningStyle: string;
  interests: string[];
  avgMastery: number;
  quizzesDone: number;
  mastery: MasteryItem[];
  history: HistoryItem[];
};

function getMasteryColor(score: number) {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#f59e0b';
  return '#ef4444';
}

function initials(name: string) {
  return name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
}

export default function StudentDetailPage() {
  const params = useParams<{ id: string }>();
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const loadStudent = async () => {
      try {
        const response = await fetch(`${API_BASE}/students/${params.id}`);
        if (!response.ok) throw new Error('Could not load student.');
        const body: { student: Student } = await response.json();
        setStudent(body.student);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not load student.');
      } finally {
        setLoading(false);
      }
    };

    loadStudent();
  }, [params.id]);

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
                  { label: 'Avg Mastery', value: `${student.avgMastery}%`, color: getMasteryColor(student.avgMastery) },
                  { label: 'Quizzes Done', value: String(student.quizzesDone), color: 'var(--primary-light)' },
                  { label: 'Student ID', value: student.id, color: 'var(--text-secondary)' },
                ].map(stat => (
                  <div key={stat.label} className={studentStyles.statItem}>
                    <div className={studentStyles.statVal} style={{ color: stat.color }}>{stat.value}</div>
                    <div className={studentStyles.statLbl}>{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="section-header" style={{ marginBottom: '8px' }}>
                <div className="section-title" style={{ fontSize: '15px' }}>Concept Mastery Radar</div>
              </div>
              {student.mastery.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <RadarChart data={student.mastery}>
                    <PolarGrid stroke="var(--border)" />
                    <PolarAngleAxis dataKey="concept" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                    <Radar dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} />
                    <Tooltip
                      contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                      formatter={(v) => [`${Number(v ?? 0)}%`, 'Mastery']}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No mastery data yet.</div>
              )}
            </div>
          </div>

          <div>
            <div className="card" style={{ height: '100%' }}>
              <div className="section-header">
                <div>
                  <div className="section-title">Learning History</div>
                  <div className="section-subtitle">Recent interactions and quiz results</div>
                </div>
              </div>

              <div className={studentStyles.timeline}>
                {student.history.map((item, index) => (
                  <div key={`${item.text}-${index}`} className={studentStyles.timelineItem}>
                    <div className={studentStyles.timelineIcon}>{item.type === 'quiz' ? 'Q' : 'A'}</div>
                    <div className={studentStyles.timelineContent}>
                      <div className={studentStyles.timelineText}>{item.text}</div>
                      <div className={studentStyles.timelineTime}>{item.time}</div>
                    </div>
                  </div>
                ))}
                {student.history.length === 0 && (
                  <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No activity yet.</div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: '16px' }}>
          <div className="section-header">
            <div>
              <div className="section-title">Concept-by-Concept Mastery</div>
              <div className="section-subtitle">Detailed breakdown</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {student.mastery.map(item => (
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
            {student.mastery.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No concept mastery has been recorded yet.</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
