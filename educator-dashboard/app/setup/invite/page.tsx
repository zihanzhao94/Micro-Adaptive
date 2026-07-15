'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Copy, Check, ArrowRight, ArrowLeft, Send } from 'lucide-react';
import styles from '../course/step.module.css';

export default function InvitePage() {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const botLink = 'https://t.me/MicroAdaptiveBot?start=course_CS5228_abc123';

  const handleCopy = () => {
    navigator.clipboard.writeText(botLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Generate a simple QR-like visual
  const qrPattern = Array.from({ length: 64 }, (_, i) => {
    // Deterministic "random" pattern for visual
    const x = i % 8, y = Math.floor(i / 8);
    const cornerMask = (x < 2 && y < 2) || (x > 5 && y < 2) || (x < 2 && y > 5);
    return cornerMask || (i * 37 + 13) % 3 === 0;
  });

  return (
    <div className={styles.stepContainer}>
      <div className={styles.stepHeader}>
        <div className={styles.stepIconWrap}>
          <Users size={24} />
        </div>
        <h1 className={styles.stepTitle}>Invite Your Students</h1>
        <p className={styles.stepSubtitle}>Share this link or QR code. Students register via the Telegram bot and are linked to your course.</p>
      </div>

      <div className="card">
        <div className={styles.inviteCard}>
          {/* Telegram icon badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.2)',
            borderRadius: '20px', padding: '6px 14px', marginBottom: '24px',
          }}>
            <Send size={14} style={{ color: '#25D166' }} />
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#25D166' }}>Telegram Bot Ready</span>
          </div>

          {/* QR Code visual */}
          <div className={styles.qrPlaceholder}>
            <div className={styles.qrGrid}>
              {qrPattern.map((filled, i) => (
                <div
                  key={i}
                  className={styles.qrCell}
                  style={{ opacity: filled ? 1 : 0 }}
                />
              ))}
            </div>
          </div>

          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>
            Or share the link directly
          </p>

          <div className={styles.copyRow}>
            <span className={styles.copyLink}>{botLink}</span>
            <button
              id="copyInviteLinkBtn"
              className={`btn btn-sm ${copied ? 'btn-secondary' : 'btn-primary'}`}
              onClick={handleCopy}
            >
              {copied ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy</>}
            </button>
          </div>

          <div style={{
            marginTop: '20px', padding: '14px', background: 'var(--bg-surface)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
            textAlign: 'left',
          }}>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              📱 Students open Telegram → search <strong style={{ color: 'var(--primary-light)' }}>@MicroAdaptiveBot</strong> → click Start → enter the course code, or use the link above.
            </p>
          </div>
        </div>

        <div className={styles.formActions} style={{ justifyContent: 'space-between', marginTop: '8px' }}>
          <button className="btn btn-secondary" onClick={() => router.push('/setup/intention')}>
            <ArrowLeft size={16} /> Back
          </button>
          <button id="nextToCompleteBtn" className="btn btn-primary btn-lg" onClick={() => router.push('/setup/complete')}>
            Finish Setup <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
