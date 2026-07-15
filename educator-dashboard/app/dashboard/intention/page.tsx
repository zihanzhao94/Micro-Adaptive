'use client';
import { useState } from 'react';
import { Lightbulb, Zap, Save, History, CheckCircle, BarChart3 } from 'lucide-react';
import styles from '../dashboard.module.css';

// ⚠️ Mock data — replace with API when backend ready
const HISTORY = [
  { week: 'Week 3', focus: 'Gradient Descent and Backpropagation', concepts: ['Gradient Descent', 'Chain Rule', 'Loss Functions'] },
  { week: 'Week 2', focus: 'Linear Regression and Overfitting',    concepts: ['Linear Regression', 'Overfitting', 'Regularization'] },
  { week: 'Week 1', focus: 'Introduction to ML concepts',          concepts: ['ML Overview', 'Supervised Learning'] },
];

// Mock concept → class avg mastery
const CONCEPT_MASTERY: Record<string, number> = {
  'Gradient Descent': 67,
  'Chain Rule':       41,
  'Loss Functions':   73,
  'Backpropagation':  54,
  'Overfitting':      62,
  'Neural Networks':  38,
};

// Simple keyword extractor (mock — replace with LLM call when backend ready)
function extractConcepts(text: string): string[] {
  const keywords = Object.keys(CONCEPT_MASTERY);
  return keywords.filter(k => text.toLowerCase().includes(k.toLowerCase()));
}

export default function IntentionPage() {
  const [intention, setIntention] = useState(
    'This week we cover Gradient Descent and Backpropagation. Focus on helping students understand the intuition behind the chain rule, especially those who struggle with the math.'
  );
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [saved, setSaved] = useState(false);
  const [extractedConcepts, setExtractedConcepts] = useState<string[]>(
    ['Gradient Descent', 'Chain Rule', 'Backpropagation']
  );

  const handleSave = async () => {
    // Mock extraction from intention text
    const found = extractConcepts(intention);
    if (found.length > 0) setExtractedConcepts(found);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <>
      {/* Top Bar */}
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <div className={styles.topBarGreeting}>Teaching Intention — Week 4</div>
          <div className={styles.topBarDate}>CS5228 · Updates the AI&apos;s focus and behaviour</div>
        </div>
        <div className={styles.topBarRight}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>
            Educator Weekly 2/3 · Update Intention
          </span>
        </div>
      </div>

      <div className={styles.pageContent}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px', alignItems: 'start' }}>

          {/* ── Left column ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Teaching Intention text */}
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <div style={{ width: 30, height: 30, background: 'rgba(245,158,11,0.15)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Zap size={15} style={{ color: 'var(--warning)' }} />
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    This Week&apos;s Teaching Intention
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    The AI reads this to guide quiz topics, explanation depth, and analogies
                  </div>
                </div>
              </div>
              <textarea
                id="weeklyIntentionText"
                className="form-input form-textarea"
                value={intention}
                onChange={e => setIntention(e.target.value)}
                rows={5}
                placeholder="e.g. Focus on Recursion — students are struggling with base cases. Emphasise the distinction between base case and recursive case. Use real-world analogies where possible."
              />
              <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-muted)' }}>
                💡 Tip: Mention specific concepts, common misconceptions, or preferred analogies. The AI extracts key concepts automatically on save.
              </div>
              <button
                id="saveIntentionBtn"
                className={`btn ${saved ? 'btn-secondary' : 'btn-primary'}`}
                onClick={handleSave}
                style={{ marginTop: '14px', width: '100%', justifyContent: 'center', padding: '12px' }}
              >
                {saved
                  ? <><CheckCircle size={14} /> Saved!</>
                  : <><Save size={14} /> Save Intention</>
                }
              </button>
            </div>

            {/* Focus Concept + Difficulty — side by side like wireframe */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

              {/* Focus Concept (auto-extracted) */}
              <div className="card">
                <div className="section-title" style={{ fontSize: '14px', marginBottom: '12px' }}>Focus Concepts</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {extractedConcepts.length > 0
                    ? extractedConcepts.map(c => {
                        const avg = CONCEPT_MASTERY[c];
                        const color = avg !== undefined
                          ? avg < 50 ? 'var(--danger)' : avg < 70 ? 'var(--warning)' : 'var(--success)'
                          : 'var(--primary-light)';
                        return (
                          <div key={c} style={{ width: '100%' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{c}</span>
                              {avg !== undefined && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <BarChart3 size={11} style={{ color }} />
                                  <span style={{ fontSize: '11px', color, fontWeight: 700 }}>
                                    Class avg: {avg}%
                                    {avg < 50 && ' ⚠️ Needs attention'}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div style={{ height: 5, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: avg ? `${avg}%` : '0%', background: color, borderRadius: 3 }} />
                            </div>
                          </div>
                        );
                      })
                    : <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Save your intention to extract concepts automatically.
                      </span>
                  }
                </div>
              </div>

              {/* Difficulty Setting */}
              <div className="card">
                <div className="section-title" style={{ fontSize: '14px', marginBottom: '4px' }}>Difficulty Setting</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '14px' }}>
                  Controls quiz question complexity for the week
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['easy', 'medium', 'hard'] as const).map(d => (
                    <button
                      key={d}
                      id={`difficulty-${d}`}
                      onClick={() => setDifficulty(d)}
                      style={{
                        flex: 1,
                        padding: '10px 0',
                        fontWeight: 700,
                        fontSize: '13px',
                        textTransform: 'capitalize',
                        borderRadius: 'var(--radius-md)',
                        border: `1px solid ${difficulty === d
                          ? d === 'easy' ? 'var(--success)' : d === 'hard' ? 'var(--danger)' : 'var(--primary)'
                          : 'var(--border)'}`,
                        background: difficulty === d
                          ? d === 'easy' ? 'rgba(16,185,129,0.12)' : d === 'hard' ? 'rgba(239,68,68,0.12)' : 'rgba(99,102,241,0.12)'
                          : 'var(--bg-surface)',
                        color: difficulty === d
                          ? d === 'easy' ? 'var(--success)' : d === 'hard' ? 'var(--danger)' : 'var(--primary-light)'
                          : 'var(--text-secondary)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {d.charAt(0).toUpperCase() + d.slice(1)}
                    </button>
                  ))}
                </div>
                <div style={{ marginTop: '12px', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {difficulty === 'easy'   && '✦ Simpler questions, more hints, conceptual focus'}
                  {difficulty === 'medium' && '✦ Balanced difficulty — application + understanding'}
                  {difficulty === 'hard'   && '✦ Complex multi-step problems, minimal guidance'}
                </div>
              </div>
            </div>
          </div>

          {/* ── Right column: History ── */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <History size={15} style={{ color: 'var(--text-muted)' }} />
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Previous Intentions</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {HISTORY.map((h, i) => (
                <div key={i} style={{
                  padding: '12px', borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px' }}>
                    {h.week}
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '8px' }}>
                    {h.focus}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {h.concepts.map(c => (
                      <span key={c} className="badge badge-info" style={{ fontSize: '9px' }}>{c}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
