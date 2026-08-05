'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lightbulb, ArrowRight, ArrowLeft, Zap } from 'lucide-react';
import styles from '../course/step.module.css';

const STYLE_OPTIONS = [
  { id: 'socratic', label: 'Socratic Dialogue', desc: 'Guide students with follow-up questions' },
  { id: 'direct',   label: 'Direct Instruction', desc: 'Provide clear explanations and examples' },
  { id: 'analogy',  label: 'Analogy-Based',      desc: 'Use interest-based analogies to explain concepts' },
  { id: 'mixed',    label: 'Mixed Approach',      desc: 'Let AI adapt the style per student' },
];

export default function IntentionPage() {
  const router = useRouter();
  const [intention, setIntention] = useState('');
  const [style, setStyle] = useState('mixed');
  const [focusConcepts, setFocusConcepts] = useState('');
  const [loading, setLoading] = useState(false);

  const handleContinue = async () => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 600));
    router.push('/setup/invite');
  };

  return (
    <div className={styles.stepContainer}>
      <div className={styles.stepHeader}>
        <div className={styles.stepIconWrap}>
          <Lightbulb size={24} />
        </div>
        <h1 className={styles.stepTitle}>Set Weekly Teaching Intention</h1>
        <p className={styles.stepSubtitle}>Guide the AI on what to focus on this week. You can update this anytime from the dashboard.</p>
      </div>

      <div className="card">
        <div className={styles.form}>
          <div className={styles.intentionBox}>
            <div className={styles.intentionLabel}>
              <Zap size={12} /> This Week&apos;s Focus
            </div>
            <textarea
              id="weeklyIntention"
              className="form-input form-textarea"
              placeholder="e.g. This week we cover Gradient Descent and Backpropagation. Focus on helping students understand the intuition, especially those struggling with the chain rule..."
              value={intention}
              onChange={e => setIntention(e.target.value)}
              rows={4}
              style={{ background: 'transparent', border: '1px solid rgba(99,102,241,0.2)' }}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Key Concepts to Focus On</label>
            <input
              id="focusConcepts"
              type="text"
              className="form-input"
              placeholder="e.g. Gradient Descent, Chain Rule, Loss Functions (comma-separated)"
              value={focusConcepts}
              onChange={e => setFocusConcepts(e.target.value)}
            />
            <span className="form-hint">The AI will prioritize these in quizzes and analogies</span>
          </div>

          <div className="form-group">
            <label className="form-label">Teaching Style Preference</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '6px' }}>
              {STYLE_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  id={`style-${opt.id}`}
                  type="button"
                  onClick={() => setStyle(opt.id)}
                  style={{
                    padding: '14px',
                    background: style === opt.id ? 'rgba(99,102,241,0.12)' : 'var(--bg-surface)',
                    border: `1px solid ${style === opt.id ? 'var(--primary)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-md)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 700, color: style === opt.id ? 'var(--primary-light)' : 'var(--text-primary)', marginBottom: '4px' }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    {opt.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.formActions} style={{ justifyContent: 'space-between' }}>
            <button className="btn btn-secondary" onClick={() => router.push('/setup/concepts')}>
              <ArrowLeft size={16} /> Back
            </button>
            <button id="nextToInviteBtn" className="btn btn-primary btn-lg" onClick={handleContinue} disabled={loading}>
              {loading ? <span className={styles.spinner} /> : <>Continue <ArrowRight size={18} /></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
