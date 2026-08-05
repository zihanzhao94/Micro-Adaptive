'use client';
import Link from 'next/link';
import { useState } from 'react';
import { GraduationCap, User, Mail, Building2, Lock, Eye, EyeOff, ArrowRight, Sparkles } from 'lucide-react';
import styles from './auth.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000';

export default function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    institution: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const body: { detail?: string } = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail ?? 'Could not create account.');
      window.location.href = '/setup/course';
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.authPage}>
      {/* Animated background orbs */}
      <div className={styles.bgOrb1} />
      <div className={styles.bgOrb2} />
      <div className={styles.bgOrb3} />

      {/* Setup progress badge */}
      <div className={styles.setupBadge}>
        <span className={styles.setupDot} />
        SETUP FLOW — Step 0 of 6
      </div>

      <div className={styles.authContainer}>
        {/* Logo */}
        <div className={styles.logo}>
          <div className={styles.logoIcon}>
            <GraduationCap size={22} />
          </div>
          <span className={styles.logoText}>Micro-Adaptive</span>
        </div>

        <div className={styles.authCard}>
          <div className={styles.cardHeader}>
            <h1 className={styles.cardTitle}>Create Educator Account</h1>
            <p className={styles.cardSubtitle}>
              Join the AI-powered adaptive learning platform
            </p>
          </div>

          <form onSubmit={handleSubmit} className={styles.form}>
            {message && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{message}</div>}
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <div className={styles.inputWrapper}>
                <User size={16} className={styles.inputIcon} />
                <input
                  id="fullName"
                  type="text"
                  className={`form-input ${styles.inputWithIcon}`}
                  placeholder="Dr. Jane Smith"
                  value={form.fullName}
                  onChange={e => setForm({...form, fullName: e.target.value})}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Institution Email</label>
              <div className={styles.inputWrapper}>
                <Mail size={16} className={styles.inputIcon} />
                <input
                  id="email"
                  type="email"
                  className={`form-input ${styles.inputWithIcon}`}
                  placeholder="jane@nus.edu.sg"
                  value={form.email}
                  onChange={e => setForm({...form, email: e.target.value})}
                  required
                />
              </div>
              <span className="form-hint">
                Use your institution email to verify educator access
              </span>
            </div>

            <div className="form-group">
              <label className="form-label">Institution / Department</label>
              <div className={styles.inputWrapper}>
                <Building2 size={16} className={styles.inputIcon} />
                <input
                  id="institution"
                  type="text"
                  className={`form-input ${styles.inputWithIcon}`}
                  placeholder="NUS School of Computing"
                  value={form.institution}
                  onChange={e => setForm({...form, institution: e.target.value})}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <div className={styles.inputWrapper}>
                <Lock size={16} className={styles.inputIcon} />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className={`form-input ${styles.inputWithIcon} ${styles.inputWithSuffix}`}
                  placeholder="••••••••••"
                  value={form.password}
                  onChange={e => setForm({...form, password: e.target.value})}
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  className={styles.inputSuffix}
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <span className="form-hint">Minimum 8 characters</span>
            </div>

            <div className={styles.verificationBox}>
              <Sparkles size={14} className={styles.verificationIcon} />
              <p>
                Your institution email will be used to verify educator access before you can create courses.
              </p>
            </div>

            <button
              id="createAccountBtn"
              type="submit"
              className={`btn btn-primary btn-full btn-lg ${styles.submitBtn}`}
              disabled={loading}
            >
              {loading ? (
                <span className={styles.spinner} />
              ) : (
                <>
                  Create Account
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <div className={styles.authFooter}>
            <span>Already have an account?</span>
            <Link href="/login" id="loginLink">Login</Link>
          </div>
        </div>

        <div className={styles.nextStep}>
          <span>Next: Create Course</span>
          <ArrowRight size={14} />
        </div>
      </div>
    </div>
  );
}
