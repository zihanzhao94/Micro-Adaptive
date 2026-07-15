'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, CheckCircle, XCircle, Filter } from 'lucide-react';
import styles from '../dashboard.module.css';
import reportStyles from './reports.module.css';

const QUESTIONS = [
  {
    id: 'q1',
    concept: 'Gradient Descent',
    question: 'Which of the following best describes the role of the learning rate in gradient descent?',
    correctRate: 71,
    attempts: 28,
    answers: [
      { student: 'Alice T.', answer: 'Controls step size — correct', correct: true, time: '2m 15s' },
      { student: 'Bob C.',   answer: 'Determines number of epochs',  correct: false, time: '4m 02s' },
      { student: 'Carol L.', answer: 'Controls step size — correct', correct: true, time: '1m 38s' },
      { student: 'David K.', answer: 'Sets the initial weight values', correct: false, time: '5m 10s' },
    ],
  },
  {
    id: 'q2',
    concept: 'Backpropagation',
    question: 'In the chain rule applied to backpropagation, gradients flow in which direction?',
    correctRate: 54,
    attempts: 28,
    answers: [
      { student: 'Alice T.', answer: 'From output layer to input layer', correct: true, time: '3m 05s' },
      { student: 'Bob C.',   answer: 'From input layer to output layer', correct: false, time: '2m 55s' },
      { student: 'Carol L.', answer: 'From output layer to input layer', correct: true, time: '1m 45s' },
    ],
  },
  {
    id: 'q3',
    concept: 'Loss Functions',
    question: 'Which loss function is most appropriate for a multi-class classification problem?',
    correctRate: 82,
    attempts: 27,
    answers: [
      { student: 'Alice T.', answer: 'Cross-Entropy Loss', correct: true,  time: '1m 20s' },
      { student: 'Bob C.',   answer: 'Cross-Entropy Loss', correct: true,  time: '2m 10s' },
      { student: 'David K.', answer: 'Mean Squared Error', correct: false, time: '3m 50s' },
    ],
  },
];

function getRateColor(rate: number) {
  if (rate >= 75) return 'var(--success)';
  if (rate >= 50) return 'var(--warning)';
  return 'var(--danger)';
}

export default function ReportsPage() {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <>
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <div className={styles.topBarGreeting}>Answer Reports</div>
          <div className={styles.topBarDate}>Week 3 Quiz · CS5228 · 28 students</div>
        </div>
        <div className={styles.topBarRight}>
          <button id="filterBtn" className="btn btn-secondary btn-sm">
            <Filter size={14} /> Filter
          </button>
        </div>
      </div>

      <div className={styles.pageContent}>
        {/* Summary row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '24px' }}>
          {[
            { label: 'Questions', value: '3' },
            { label: 'Avg Correct Rate', value: '69%' },
            { label: 'Total Attempts', value: '83' },
          ].map(s => (
            <div key={s.label} className="stat-card" style={{ padding: '16px 20px' }}>
              <div className={styles.statValue} style={{ fontSize: '22px' }}>{s.value}</div>
              <div className={styles.statLabel}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Questions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {QUESTIONS.map(q => (
            <div key={q.id} className="card" style={{ padding: '0', overflow: 'hidden' }}>
              {/* Question header */}
              <button
                id={`expand-${q.id}`}
                className={reportStyles.questionHeader}
                onClick={() => setExpanded(expanded === q.id ? null : q.id)}
              >
                <div className={reportStyles.questionLeft}>
                  <span className="badge badge-primary">{q.concept}</span>
                  <p className={reportStyles.questionText}>{q.question}</p>
                </div>
                <div className={reportStyles.questionRight}>
                  <div className={reportStyles.correctRateWrap}>
                    <div className={reportStyles.correctRateCircle}>
                      <svg viewBox="0 0 36 36" className={reportStyles.rateSvg}>
                        <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border)" strokeWidth="3" />
                        <circle
                          cx="18" cy="18" r="15.9" fill="none"
                          stroke={getRateColor(q.correctRate)} strokeWidth="3"
                          strokeDasharray={`${q.correctRate} ${100 - q.correctRate}`}
                          strokeLinecap="round" strokeDashoffset="25"
                        />
                      </svg>
                      <span className={reportStyles.rateText} style={{ color: getRateColor(q.correctRate) }}>
                        {q.correctRate}%
                      </span>
                    </div>
                    <div className={reportStyles.attemptCount}>{q.attempts} attempts</div>
                  </div>
                  {expanded === q.id
                    ? <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />
                    : <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                  }
                </div>
              </button>

              {/* Expanded answers */}
              {expanded === q.id && (
                <div className={reportStyles.answersWrap}>
                  <div className={reportStyles.answersHeader}>
                    <span>Student</span>
                    <span>Answer</span>
                    <span>Time</span>
                    <span>Result</span>
                  </div>
                  {q.answers.map((ans, i) => (
                    <div key={i} className={reportStyles.answerRow}>
                      <Link href={`/dashboard/student/${i+1}`} id={`answer-student-${i+1}`} className={reportStyles.answerStudent}>
                        {ans.student}
                      </Link>
                      <span className={reportStyles.answerText}>{ans.answer}</span>
                      <span className={reportStyles.answerTime}>{ans.time}</span>
                      <span>
                        {ans.correct
                          ? <CheckCircle size={16} style={{ color: 'var(--success)' }} />
                          : <XCircle size={16} style={{ color: 'var(--danger)' }} />
                        }
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
