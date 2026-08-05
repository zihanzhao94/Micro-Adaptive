'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Copy, Check, ArrowRight, ArrowLeft, Send } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import styles from '../course/step.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000';

type Invite = {
  course_name: string;
  bot_username: string;
  link: string;
};

export default function InvitePage() {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function loadInvite() {
      try {
        const response = await fetch(`${API_BASE}/course/invite`);
        const body: Invite & { detail?: string } = await response.json().catch(() => ({} as Invite));
        if (!response.ok) throw new Error(body.detail ?? 'Could not generate course invite.');
        setInvite(body);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not generate course invite.');
      }
    }
    loadInvite();
  }, []);

  const handleCopy = () => {
    if (!invite) return;
    navigator.clipboard.writeText(invite.link).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

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
          {message && <div style={{ marginBottom: 16, color: 'var(--danger)', fontSize: 13 }}>{message}</div>}
          {/* Telegram icon badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.2)',
            borderRadius: '20px', padding: '6px 14px', marginBottom: '24px',
          }}>
            <Send size={14} style={{ color: '#25D166' }} />
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#25D166' }}>Telegram Bot Ready</span>
          </div>

          <div className={styles.qrPlaceholder}>
            {invite
              ? <QRCodeSVG value={invite.link} size={168} bgColor="#ffffff" fgColor="#10101f" level="M" includeMargin />
              : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Generating invite...</span>}
          </div>

          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>
            Or share the link directly
          </p>

          <div className={styles.copyRow}>
            <span className={styles.copyLink}>{invite?.link ?? 'Generating course invite...'}</span>
            <button
              id="copyInviteLinkBtn"
              className={`btn btn-sm ${copied ? 'btn-secondary' : 'btn-primary'}`}
              onClick={handleCopy}
              disabled={!invite}
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
              📱 Students scan the QR code or open the link. Telegram starts <strong style={{ color: 'var(--primary-light)' }}>@{invite?.bot_username ?? 'your bot'}</strong> and automatically links them to <strong style={{ color: 'var(--primary-light)' }}>{invite?.course_name ?? 'this course'}</strong>.
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
