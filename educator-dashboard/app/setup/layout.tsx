'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { GraduationCap, Check } from 'lucide-react';
import styles from './setup.module.css';

const STEPS = [
  { label: 'Create Course',       href: '/setup/course',    step: 1 },
  { label: 'Upload Materials',    href: '/setup/upload',    step: 2 },
  { label: 'Teaching Intention',  href: '/setup/intention', step: 3 },
  { label: 'Invite Students',     href: '/setup/invite',    step: 4 },
  { label: 'Complete',            href: '/setup/complete',  step: 5 },
];

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const currentStep = STEPS.find(s => s.href === pathname)?.step ?? 1;

  return (
    <div className={styles.setupPage}>
      {/* Background */}
      <div className={styles.bgOrb1} />
      <div className={styles.bgOrb2} />

      {/* Top Bar */}
      <header className={styles.header}>
        <Link href="/dashboard" className={styles.headerLogo}>
          <div className={styles.logoIcon}>
            <GraduationCap size={18} />
          </div>
          <span>Micro-Adaptive</span>
        </Link>

        <div className={styles.stepBadge}>
          SETUP FLOW — Step {currentStep} of 5
        </div>

        <Link href="/dashboard" className={styles.skipLink}>Skip setup →</Link>
      </header>

      {/* Progress Bar */}
      <div className={styles.progressBar}>
        <div
          className={styles.progressFill}
          style={{ width: `${(currentStep / 5) * 100}%` }}
        />
      </div>

      {/* Step Indicators */}
      <div className={styles.stepIndicators}>
        {STEPS.map((step) => {
          const isDone = step.step < currentStep;
          const isActive = step.step === currentStep;
          return (
            <div key={step.step} className={styles.stepItem}>
              <div className={`${styles.stepCircle} ${isDone ? styles.stepDone : ''} ${isActive ? styles.stepActive : ''}`}>
                {isDone ? <Check size={12} /> : step.step}
              </div>
              <span className={`${styles.stepLabel} ${isActive ? styles.stepLabelActive : ''}`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Page Content */}
      <main className={styles.setupMain}>
        {children}
      </main>
    </div>
  );
}
