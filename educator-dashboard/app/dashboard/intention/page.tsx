'use client';

import { useEffect, useState } from 'react';
import { Zap, Save, History, CheckCircle, BarChart3 } from 'lucide-react';
import styles from '../dashboard.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000';

type IntentionHistory = {
  week: string;
  focus: string;
  concepts: string[];
};

type TeachingIntention = {
  week: string;
  text: string;
  difficulty: 'easy' | 'medium' | 'hard';
  concepts: string[];
  history: IntentionHistory[];
};

type ConceptMastery = {
  concept: string;
  avg: number;
};

export default function IntentionPage() {
  const [intention, setIntention] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [extractedConcepts, setExtractedConcepts] = useState<string[]>([]);
  const [history, setHistory] = useState<IntentionHistory[]>([]);
  const [conceptMastery, setConceptMastery] = useState<Record<string, number>>({});

  useEffect(() => {
    const loadData = async () => {
      try {
        const [intentionResponse, summaryResponse] = await Promise.all([
          fetch(`${API_BASE}/teaching-intention`),
          fetch(`${API_BASE}/dashboard/summary`),
        ]);

        if (!intentionResponse.ok) throw new Error('Could not load teaching intention.');

        const intentionBody: { intention: TeachingIntention } = await intentionResponse.json();
        setIntention(intentionBody.intention.text);
        setDifficulty(intentionBody.intention.difficulty);
        setExtractedConcepts(intentionBody.intention.concepts);
        setHistory(intentionBody.intention.history);

        if (summaryResponse.ok) {
          const summaryBody: { conceptMastery: ConceptMastery[] } = await summaryResponse.json();
          setConceptMastery(Object.fromEntries(
            summaryBody.conceptMastery.map(item => [item.concept, item.avg])
          ));
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not load teaching intention.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleSave = async () => {
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/teaching-intention`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: intention, difficulty }),
      });

      if (!response.ok) throw new Error('Could not save teaching intention.');

      const body: { intention: TeachingIntention } = await response.json();
      setExtractedConcepts(body.intention.concepts);
      setHistory(body.intention.history);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save teaching intention.');
    }
  };

  return (
    <>
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <div className={styles.topBarGreeting}>Teaching Intention</div>
          <div className={styles.topBarDate}>Updates the AI&apos;s focus and behaviour</div>
        </div>
        <div className={styles.topBarRight}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>
            Educator settings
          </span>
        </div>
      </div>

      <div className={styles.pageContent}>
        {message && (
          <div className="card" style={{ marginBottom: 16, color: 'var(--danger)', fontSize: 13 }}>
            {message}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                placeholder="Focus on specific concepts, common misconceptions, or preferred analogies for this week."
              />
              <button
                id="saveIntentionBtn"
                className={`btn ${saved ? 'btn-secondary' : 'btn-primary'}`}
                onClick={handleSave}
                disabled={loading}
                style={{ marginTop: '14px', width: '100%', justifyContent: 'center', padding: '12px' }}
              >
                {saved
                  ? <><CheckCircle size={14} /> Saved!</>
                  : <><Save size={14} /> Save Intention</>
                }
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="card">
                <div className="section-title" style={{ fontSize: '14px', marginBottom: '12px' }}>Focus Concepts</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {extractedConcepts.length > 0
                    ? extractedConcepts.map(concept => {
                      const avg = conceptMastery[concept];
                      const color = avg !== undefined
                        ? avg < 50 ? 'var(--danger)' : avg < 70 ? 'var(--warning)' : 'var(--success)'
                        : 'var(--primary-light)';
                      return (
                        <div key={concept} style={{ width: '100%' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{concept}</span>
                            {avg !== undefined && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <BarChart3 size={11} style={{ color }} />
                                <span style={{ fontSize: '11px', color, fontWeight: 700 }}>
                                  Class avg: {avg}%
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
                      Save an intention that mentions known course concepts to extract focus topics.
                    </span>
                  }
                </div>
              </div>

              <div className="card">
                <div className="section-title" style={{ fontSize: '14px', marginBottom: '4px' }}>Difficulty Setting</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '14px' }}>
                  Controls quiz question complexity for the week
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['easy', 'medium', 'hard'] as const).map(level => (
                    <button
                      key={level}
                      id={`difficulty-${level}`}
                      onClick={() => setDifficulty(level)}
                      style={{
                        flex: 1,
                        padding: '10px 0',
                        fontWeight: 700,
                        fontSize: '13px',
                        textTransform: 'capitalize',
                        borderRadius: 'var(--radius-md)',
                        border: `1px solid ${difficulty === level
                          ? level === 'easy' ? 'var(--success)' : level === 'hard' ? 'var(--danger)' : 'var(--primary)'
                          : 'var(--border)'}`,
                        background: difficulty === level
                          ? level === 'easy' ? 'rgba(16,185,129,0.12)' : level === 'hard' ? 'rgba(239,68,68,0.12)' : 'rgba(99,102,241,0.12)'
                          : 'var(--bg-surface)',
                        color: difficulty === level
                          ? level === 'easy' ? 'var(--success)' : level === 'hard' ? 'var(--danger)' : 'var(--primary-light)'
                          : 'var(--text-secondary)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <History size={15} style={{ color: 'var(--text-muted)' }} />
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Previous Intentions</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {history.map((item, index) => (
                <div key={`${item.week}-${index}`} style={{
                  padding: '12px', borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px' }}>
                    {item.week}
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '8px' }}>
                    {item.focus}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {item.concepts.map(concept => (
                      <span key={concept} className="badge badge-info" style={{ fontSize: '9px' }}>{concept}</span>
                    ))}
                  </div>
                </div>
              ))}
              {!history.length && (
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No previous intentions yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
