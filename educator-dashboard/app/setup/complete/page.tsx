'use client';
import Link from 'next/link';
import { CheckCircle, LayoutDashboard, Users, BookOpen } from 'lucide-react';
import styles from '../course/step.module.css';

export default function CompletePage() {
  return (
    <div className={styles.stepContainer}>
      <div className="card">
        <div className={styles.completeWrap}>
          <div className={styles.completeBadge}>
            <CheckCircle size={40} />
          </div>

          <h1 className={styles.completeTitle}>You&apos;re all set! 🎉</h1>
          <p className={styles.completeSubtitle}>
            Your course is live. The AI is ready to deliver personalized quizzes and adaptive feedback to your students via Telegram.
          </p>

          <div className={styles.completeSummary}>
            <div className={styles.summaryItem}>
              <span className={styles.summaryValue}>2</span>
              <div className={styles.summaryLabel}>Files Indexed</div>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryValue}>3</span>
              <div className={styles.summaryLabel}>Objectives Set</div>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryValue}>0</span>
              <div className={styles.summaryLabel}>Students Enrolled</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link id="goToDashboardBtn" href="/dashboard" className="btn btn-primary btn-lg">
              <LayoutDashboard size={18} />
              Go to Dashboard
            </Link>
            <Link id="inviteMoreBtn" href="/setup/invite" className="btn btn-secondary">
              <Users size={16} />
              Invite Students
            </Link>
            <Link id="addAnotherCourseBtn" href="/setup/course" className="btn btn-ghost">
              <BookOpen size={16} />
              Add Another Course
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
