'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, ArrowRight, ArrowLeft } from 'lucide-react';
import WeeklyPushSettings from '@/components/WeeklyPushSettings';
import styles from '../course/step.module.css';

export default function SchedulePage() {
  const router = useRouter();
  // Materials are tagged by week, so the wizard can't move on without one.
  const [hasWeeks, setHasWeeks] = useState(false);

  return (
    <div className={styles.stepContainer}>
      <div className={styles.stepHeader}>
        <div className={styles.stepIconWrap}>
          <CalendarClock size={24} />
        </div>
        <h1 className={styles.stepTitle}>Set Your Teaching Schedule</h1>
        <p className={styles.stepSubtitle}>
          After each teaching week the bot asks students what mattered most and what confused them.
          Pick when that prompt goes out — usually right after your lecture.
        </p>
      </div>

      <div className="card">
        <WeeklyPushSettings onSaved={s => setHasWeeks(Boolean(s.totalWeeks))} />

        <div className={styles.formActions} style={{ justifyContent: 'space-between' }}>
          <button className="btn btn-secondary" onClick={() => router.push('/setup/course')}>
            <ArrowLeft size={16} /> Back
          </button>
          <button
            id="nextToUploadBtn"
            className="btn btn-primary btn-lg"
            onClick={() => router.push('/setup/upload')}
            disabled={!hasWeeks}
            title={hasWeeks ? undefined : 'Save a schedule with total teaching weeks first'}
          >
            Continue <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
