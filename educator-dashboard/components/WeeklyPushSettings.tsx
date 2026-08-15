'use client';
import { useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export interface CourseSchedule {
  startDate: string | null;
  totalWeeks: number | null;
  pushWeekday: number | null;
  pushTime: string | null;
  pushEnabled: boolean;
}

const EMPTY_SCHEDULE: CourseSchedule = {
  startDate: null, totalWeeks: null, pushWeekday: null, pushTime: null, pushEnabled: false,
};

/**
 * Preview of what the backend will decide, so a mistyped year shows up here
 * instead of silently sending nothing. Mirrors database.current_week_no().
 */
function describeSchedule(s: CourseSchedule): string {
  if (!s.totalWeeks) return 'Set the total teaching weeks — material weeks are built from it.';
  if (!s.startDate) return 'Set a start date to enable weekly pushes.';

  const start = new Date(`${s.startDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return 'Start date is not a valid date.';

  const days = Math.floor((Date.now() - start.getTime()) / 86_400_000);
  if (days < 0) return `Course hasn't started yet — Week 1 begins ${start.toLocaleDateString()}.`;

  const week = Math.floor(days / 7) + 1;
  if (s.totalWeeks && week > s.totalWeeks) {
    return `Course ended after ${s.totalWeeks} weeks (it would now be week ${week}) — nothing will be sent.`;
  }

  const day = s.pushWeekday === null ? WEEKDAYS[(start.getDay() + 6) % 7] : WEEKDAYS[s.pushWeekday];
  const total = s.totalWeeks ? ` of ${s.totalWeeks}` : '';
  const state = s.pushEnabled ? '' : ' (pushes are currently off)';
  return `Currently in week ${week}${total} · sends ${day} at ${s.pushTime || '13:00'}${state}.`;
}

/**
 * Weekly reflection push settings, shared by the setup wizard and the dashboard.
 * Reads and writes /course directly so both callers stay stateless.
 */
export default function WeeklyPushSettings({ onSaved }: { onSaved?: (s: CourseSchedule) => void }) {
  // onSaved lets the setup wizard unblock Continue once a schedule exists.
  const [schedule, setSchedule] = useState<CourseSchedule>(EMPTY_SCHEDULE);
  const [saved, setSaved] = useState<CourseSchedule>(EMPTY_SCHEDULE);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  // Saving can send a real message to every student, so nothing is written
  // until the educator presses Save.
  const dirty = JSON.stringify(schedule) !== JSON.stringify(saved);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch(`${API_BASE}/course`);
        if (!response.ok) throw new Error('Could not load course schedule.');
        const { course } = await response.json();
        const loaded: CourseSchedule = {
          startDate: course.startDate ?? null,
          totalWeeks: course.totalWeeks ?? null,
          pushWeekday: course.pushWeekday ?? null,
          pushTime: course.pushTime ?? null,
          pushEnabled: Boolean(course.pushEnabled),
        };
        setSchedule(loaded);
        setSaved(loaded);
        onSaved?.(loaded);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Could not load course schedule.');
      }
    })();
  }, []);

  const save = async () => {
    const next = schedule;
    setSaving(true);
    setStatus('');
    try {
      // /course requires name + code, so re-send what is already stored
      // alongside the schedule fields being changed.
      const current = (await (await fetch(`${API_BASE}/course`)).json()).course ?? {};
      const response = await fetch(`${API_BASE}/course`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: current.name,
          code: current.code,
          description: current.description ?? '',
          semester: current.year ?? 'Current',
          classSize: current.classSize ?? null,
          objectives: current.objectives ?? [],
          ...next,
        }),
      });
      const body: { detail?: string } = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail ?? 'Could not save schedule.');
      setSaved(next);
      setStatus('Schedule saved.');
      onSaved?.(next);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save schedule.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', marginBottom: '16px' }}>
        <input
          id="pushEnabled"
          type="checkbox"
          checked={schedule.pushEnabled}
          onChange={e => setSchedule({ ...schedule, pushEnabled: e.target.checked })}
        />
        Send a weekly reflection prompt to every enrolled student
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Week 1 starts</label>
          <input
            id="startDate"
            type="date"
            className="form-input"
            value={schedule.startDate ?? ''}
            onChange={e => setSchedule({ ...schedule, startDate: e.target.value || null })}
          />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">
            Total teaching weeks <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <input
            id="totalWeeks"
            type="number"
            min="1"
            max="52"
            className="form-input"
            placeholder="13"
            value={schedule.totalWeeks ?? ''}
            onChange={e => setSchedule({ ...schedule, totalWeeks: e.target.value ? Number(e.target.value) : null })}
          />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Push day</label>
          <select
            id="pushWeekday"
            className="form-input"
            value={schedule.pushWeekday ?? ''}
            onChange={e => setSchedule({ ...schedule, pushWeekday: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">Same weekday as Week 1</option>
            {WEEKDAYS.map((day, i) => <option key={day} value={i}>{day}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Push time</label>
          <input
            id="pushTime"
            type="time"
            className="form-input"
            value={schedule.pushTime ?? ''}
            onChange={e => setSchedule({ ...schedule, pushTime: e.target.value || null })}
          />
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '12px', marginTop: '18px',
      }}>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {describeSchedule(schedule)}
        </div>
        <button
          id="saveScheduleBtn"
          type="button"
          className="btn btn-primary btn-sm"
          onClick={save}
          disabled={saving || !dirty}
        >
          {saving ? 'Saving…' : dirty ? 'Save Schedule' : 'Saved'}
        </button>
      </div>

      {status && (
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>{status}</div>
      )}
    </div>
  );
}
