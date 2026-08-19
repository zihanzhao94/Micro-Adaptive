'use client';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Pencil } from 'lucide-react';
import WeeklyPushSettings from '@/components/WeeklyPushSettings';
import styles from '../dashboard.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000';

interface ScheduleStatus {
  week: number | null;
  materialCount: number;
  ready: boolean;
  skippedWeek: number | null;
}

interface PromptInfo {
  template: string;
  preview: string;
  week: number;
  concepts: string[];
  isDefault: boolean;
  default: string;
}

export default function SchedulePage() {
  const [status, setStatus] = useState('');
  const [sending, setSending] = useState('');
  const [weekStatus, setWeekStatus] = useState<ScheduleStatus | null>(null);
  const [prompt, setPrompt] = useState<PromptInfo | null>(null);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [promptError, setPromptError] = useState('');

  const loadWeekStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/schedule/status`);
      if (!response.ok) return;
      setWeekStatus(await response.json());
    } catch {
      // The banner is advisory; the settings below still work without it.
    }
  }, []);

  const loadPrompt = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/schedule/prompt`);
      if (!response.ok) return;
      const body: PromptInfo = await response.json();
      setPrompt(body);
      setDraft(body.template);
    } catch {
      // Preview is advisory too.
    }
  }, []);

  useEffect(() => { loadWeekStatus(); loadPrompt(); }, [loadWeekStatus, loadPrompt]);

  const savePrompt = async (value: string) => {
    setSavingPrompt(true);
    setPromptError('');
    try {
      const response = await fetch(`${API_BASE}/schedule/prompt`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: value }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail ?? 'Could not save the wording.');
      setPrompt(body);
      setDraft(body.template);
      setEditing(false);
    } catch (error) {
      setPromptError(error instanceof Error ? error.message : 'Could not save the wording.');
    } finally {
      setSavingPrompt(false);
    }
  };

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
        {weekStatus?.week !== null && weekStatus && !weekStatus.ready && (
          <div
            className="card"
            style={{
              maxWidth: '720px', marginBottom: '16px',
              borderLeft: '3px solid var(--warning, #e0a458)',
              display: 'flex', gap: '12px', alignItems: 'flex-start',
            }}
          >
            <AlertTriangle size={18} style={{ color: 'var(--warning, #e0a458)', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700 }}>
                Week {weekStatus.week} has no materials tagged
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.6 }}>
                This week&apos;s reflection <strong>will not be sent</strong>. The concepts students
                are asked about come from the week&apos;s own slides — without them, students would
                be asked about other weeks&apos; topics and the answers would be meaningless.{' '}
                <a href="/dashboard/materials" style={{ color: 'var(--primary-light)' }}>
                  Upload this week&apos;s materials
                </a>{' '}
                and tag them as Week {weekStatus.week}.
              </div>
            </div>
          </div>
        )}

        {weekStatus?.skippedWeek != null && (
          <div
            className="card"
            style={{
              maxWidth: '720px', marginBottom: '16px',
              borderLeft: '3px solid var(--danger)',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 700 }}>
              Week {weekStatus.skippedWeek}&apos;s reflection was skipped
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              It came due with no materials tagged for that week, so nothing was sent to students.
            </div>
          </div>
        )}

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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700 }}>What students will receive</div>
            {!editing && (
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
                <Pencil size={12} /> Edit wording
              </button>
            )}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>
            The exact message that goes out, with this week&apos;s numbers filled in.
          </div>

          {editing ? (
            <>
              <textarea
                id="promptDraft"
                className="form-input form-textarea"
                rows={4}
                value={draft}
                onChange={event => setDraft(event.target.value)}
                style={{ fontSize: '13px', fontFamily: 'inherit' }}
              />
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                Use <code>{'{week}'}</code> for the week number and <code>{'{max_picks}'}</code> for
                how many concepts a student may choose. Markdown (*bold*) works.
              </div>
              {promptError && (
                <div style={{ fontSize: '11px', color: 'var(--danger)', marginTop: '8px' }}>{promptError}</div>
              )}
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                <button className="btn btn-primary btn-sm" onClick={() => savePrompt(draft)} disabled={savingPrompt}>
                  {savingPrompt ? 'Saving…' : 'Save wording'}
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => { setEditing(false); setDraft(prompt?.template ?? ''); setPromptError(''); }}
                >
                  Cancel
                </button>
                {!prompt?.isDefault && (
                  <button className="btn btn-ghost btn-sm" onClick={() => savePrompt('')} disabled={savingPrompt}>
                    Reset to default
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Rendered the way Telegram will show it, so the educator judges the
                  real thing rather than a template with braces in it. */}
              <div style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: '8px', padding: '12px 14px', fontSize: '13px',
                lineHeight: 1.6, whiteSpace: 'pre-wrap',
              }}>
                {prompt?.preview ?? 'Loading…'}
              </div>

              {prompt && prompt.concepts.length > 0 && (
                <div style={{ marginTop: '10px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    Followed by these tappable options (week {prompt.week}):
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    {prompt.concepts.map(concept => (
                      <span key={concept} style={{
                        fontSize: '11px', padding: '3px 8px', borderRadius: '4px',
                        border: '1px solid var(--border)', color: 'var(--text-muted)',
                      }}>{concept}</span>
                    ))}
                  </div>
                </div>
              )}

              {prompt && prompt.concepts.length === 0 && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px' }}>
                  No concepts are linked to week {prompt.week} yet, so nothing would be sent.
                </div>
              )}

              {prompt && !prompt.isDefault && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px' }}>
                  Using your own wording.
                </div>
              )}
            </>
          )}
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
