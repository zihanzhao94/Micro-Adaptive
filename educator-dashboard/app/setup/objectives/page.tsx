'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Target, Plus, X, ArrowRight, ArrowLeft } from 'lucide-react';
import styles from '../course/step.module.css';

const DEFAULT_OBJECTIVES = [
  'Understand core concepts and foundational theory',
  'Apply knowledge to solve practical problems',
];

export default function ObjectivesPage() {
  const router = useRouter();
  const [objectives, setObjectives] = useState(DEFAULT_OBJECTIVES);
  const [loading, setLoading] = useState(false);

  const addObjective = () => setObjectives(prev => [...prev, '']);
  const removeObjective = (i: number) => setObjectives(prev => prev.filter((_, idx) => idx !== i));
  const updateObjective = (i: number, val: string) =>
    setObjectives(prev => prev.map((o, idx) => idx === i ? val : o));

  const handleContinue = async () => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 600));
    router.push('/setup/intention');
  };

  return (
    <div className={styles.stepContainer}>
      <div className={styles.stepHeader}>
        <div className={styles.stepIconWrap}>
          <Target size={24} />
        </div>
        <h1 className={styles.stepTitle}>Set Learning Objectives</h1>
        <p className={styles.stepSubtitle}>Define what students should achieve. The AI will align quizzes and feedback to these goals.</p>
      </div>

      <div className="card">
        <div className={styles.form}>
          {objectives.map((obj, i) => (
            <div key={i} className={styles.objectiveItem}>
              <div className={styles.objectiveDot} />
              <input
                id={`objective-${i}`}
                type="text"
                className={styles.objectiveInput}
                placeholder={`Learning objective ${i + 1}...`}
                value={obj}
                onChange={e => updateObjective(i, e.target.value)}
              />
              {objectives.length > 1 && (
                <button className={styles.fileRemove} onClick={() => removeObjective(i)} aria-label="Remove objective">
                  <X size={14} />
                </button>
              )}
            </div>
          ))}

          <button id="addObjectiveBtn" type="button" className={styles.addBtn} onClick={addObjective}>
            <Plus size={16} />
            Add Learning Objective
          </button>

          <div className={styles.formActions} style={{ justifyContent: 'space-between' }}>
            <button className="btn btn-secondary" onClick={() => router.push('/setup/upload')}>
              <ArrowLeft size={16} /> Back
            </button>
            <button id="nextToIntentionBtn" className="btn btn-primary btn-lg" onClick={handleContinue} disabled={loading}>
              {loading ? <span className={styles.spinner} /> : <>Continue <ArrowRight size={18} /></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
