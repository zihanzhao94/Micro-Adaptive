'use client';
import { useState } from 'react';
import WeeklyPushSettings from '@/components/WeeklyPushSettings';
import styles from '../dashboard.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000';

export default function SchedulePage() {
  const [status, setStatus] = useState('');
  const [sending, setSending] = useState('');

  const sendNow = async (kind: 'push' | 'digest') => {
    const label = kind === 'push' ? 'reflection prompt' : 'class digest';
    if (!window.confirm(`Send the ${label} to every enrolled student now?`)) return;

    setSending(kind);
    setStatus('');
    try {
      const response = await fetch(`${API_BASE}/schedule/send-now?kind=${kind}`, { method: 'POST' });
      const body: { students?: number; detail?: string } = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail ?? 'Could not queue the send.');
      setStatus(`Queued for ${body.students ?? 0} student(s) — the bot sends within ~30 seconds. Make sure it is running.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not queue the send.');
    } finally {
      setSending('');
    }
  };

  return (
    <>
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <div className={styles.topBarGreeting}>Weekly Push</div>
          <div className={styles.topBarDate}>When students get their reflection prompt</div>
        </div>
      </div>

      <div className={styles.pageContent}>
        <div className="card" style={{ maxWidth: '720px' }}>
          <div style={{ marginBottom: '18px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700 }}>Weekly Reflection Push</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Once per teaching week the bot asks every enrolled student what the three most
              important concepts were, and what they are still confused about. Their answers show
              up in your reports.
            </div>
          </div>

          <WeeklyPushSettings />
        </div>

        <div className="card" style={{ maxWidth: '720px', marginTop: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>Send now</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>
            Sends immediately instead of waiting for the schedule — useful for trying the flow
            end to end. This reaches real students, and still counts as this week&apos;s send.
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              id="sendPushNowBtn"
              className="btn btn-secondary btn-sm"
              onClick={() => sendNow('push')}
              disabled={sending !== ''}
            >
              {sending === 'push' ? 'Queueing…' : 'Send reflection prompt'}
            </button>
            <button
              id="sendDigestNowBtn"
              className="btn btn-secondary btn-sm"
              onClick={() => sendNow('digest')}
              disabled={sending !== ''}
            >
              {sending === 'digest' ? 'Queueing…' : 'Send class digest'}
            </button>
          </div>

          {status && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '12px' }}>{status}</div>
          )}
        </div>

        <div className="card" style={{ maxWidth: '720px', marginTop: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>How weeks are worked out</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.7 }}>
            The teaching week is counted from <strong>Week 1 starts</strong>, so no per-week setup is
            needed. Nothing is sent before that date, or after the total number of teaching weeks has
            passed. Tag your materials with a week on the{' '}
            <a href="/dashboard/materials" style={{ color: 'var(--primary-light)' }}>Course Materials</a> page.
          </div>
        </div>
      </div>
    </>
  );
}
