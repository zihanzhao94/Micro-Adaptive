'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Tag, AlignLeft, ArrowRight, Calendar, Users, Target, Plus, X } from 'lucide-react';
import styles from './step.module.css';

export default function CreateCoursePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    semester: '',
    classSize: '',
  });
  const [objectives, setObjectives] = useState<string[]>(['', '', '']);

  const updateObjective = (i: number, val: string) => {
    setObjectives(prev => prev.map((o, idx) => idx === i ? val : o));
  };

  const addObjective = () => setObjectives(prev => [...prev, '']);
  const removeObjective = (i: number) => setObjectives(prev => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await new Promise(r => setTimeout(r, 800));
    router.push('/setup/upload');
  };

  return (
    <div className={styles.stepContainer}>
      <div className={styles.stepHeader}>
        <div className={styles.stepIconWrap}>
          <BookOpen size={24} />
        </div>
        <h1 className={styles.stepTitle}>Create Your Course</h1>
        <p className={styles.stepSubtitle}>Set up the basics for your course. Students will enroll via Telegram.</p>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit} className={styles.form}>

          {/* Course Name */}
          <div className="form-group">
            <label className="form-label">Course Name</label>
            <div className={styles.inputWrap}>
              <BookOpen size={15} className={styles.inputIcon} />
              <input
                id="courseName"
                type="text"
                className={`form-input ${styles.inputPadded}`}
                placeholder="e.g. CS101 — Introduction to Python"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
          </div>

          {/* Course Description */}
          <div className="form-group">
            <label className="form-label">Course Description</label>
            <div className={styles.inputWrap}>
              <AlignLeft size={15} className={`${styles.inputIcon} ${styles.inputIconTop}`} />
              <textarea
                id="courseDescription"
                className={`form-input form-textarea ${styles.inputPadded}`}
                placeholder="An introductory course covering Python fundamentals including variables, loops, functions and recursion."
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                rows={4}
              />
            </div>
          </div>

          {/* Semester + Class Size */}
          <div className={styles.row2}>
            <div className="form-group">
              <label className="form-label">Semester</label>
              <div className={styles.inputWrap}>
                <Calendar size={15} className={styles.inputIcon} />
                <input
                  id="semester"
                  type="text"
                  className={`form-input ${styles.inputPadded}`}
                  placeholder="e.g. Semester 2, AY2024/2025"
                  value={form.semester}
                  onChange={e => setForm({ ...form, semester: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Class Size</label>
              <div className={styles.inputWrap}>
                <Users size={15} className={styles.inputIcon} />
                <input
                  id="classSize"
                  type="number"
                  className={`form-input ${styles.inputPadded}`}
                  placeholder="e.g. 32"
                  value={form.classSize}
                  onChange={e => setForm({ ...form, classSize: e.target.value })}
                  min="1"
                />
              </div>
            </div>
          </div>

          {/* Learning Objectives */}
          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Target size={14} style={{ color: 'var(--primary-light)' }} />
              Learning Objectives
            </label>
            <div className={styles.objectivesList}>
              {objectives.map((obj, i) => (
                <div key={i} className={styles.objectiveRow}>
                  <span className={styles.objectiveNum}>{i + 1}.</span>
                  <input
                    id={`objective-${i}`}
                    type="text"
                    className="form-input"
                    placeholder={`e.g. Understand basic Python syntax`}
                    value={obj}
                    onChange={e => updateObjective(i, e.target.value)}
                    style={{ flex: 1 }}
                  />
                  {objectives.length > 1 && (
                    <button
                      type="button"
                      className={styles.removeObjBtn}
                      onClick={() => removeObjective(i)}
                      aria-label="Remove"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                id="addObjectiveBtn"
                className="btn btn-ghost btn-sm"
                onClick={addObjective}
                style={{ alignSelf: 'flex-start', marginTop: '4px' }}
              >
                <Plus size={14} /> Add Objective
              </button>
            </div>
          </div>

          <div className={styles.formActions}>
            <button
              id="nextToUploadBtn"
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={loading}
            >
              {loading ? <span className={styles.spinner} /> : <>Continue <ArrowRight size={18} /></>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
