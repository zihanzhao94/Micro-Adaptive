'use client';
import Link from 'next/link';
import { useState } from 'react';
import { GraduationCap, Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import styles from '../register/auth.module.css';

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await new Promise(r => setTimeout(r, 1000));
    window.location.href = '/dashboard';
  };

  return (
    <div className={styles.authPage}>
      <div className={styles.bgOrb1} />
      <div className={styles.bgOrb2} />
      <div className={styles.bgOrb3} />

      <div className={styles.authContainer}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>
            <GraduationCap size={22} />
          </div>
          <span className={styles.logoText}>Micro-Adaptive</span>
        </div>

        <div className={styles.authCard}>
          <div className={styles.cardHeader}>
            <h1 className={styles.cardTitle}>Welcome back</h1>
            <p className={styles.cardSubtitle}>Sign in to your educator dashboard</p>
          </div>

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className="form-group">
              <label className="form-label">Institution Email</label>
              <div className={styles.inputWrapper}>
                <Mail size={16} className={styles.inputIcon} />
                <input
                  id="loginEmail"
                  type="email"
                  className={`form-input ${styles.inputWithIcon}`}
                  placeholder="jane@nus.edu.sg"
                  value={form.email}
                  onChange={e => setForm({...form, email: e.target.value})}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <div className={styles.inputWrapper}>
                <Lock size={16} className={styles.inputIcon} />
                <input
                  id="loginPassword"
                  type={showPassword ? 'text' : 'password'}
                  className={`form-input ${styles.inputWithIcon} ${styles.inputWithSuffix}`}
                  placeholder="••••••••••"
                  value={form.password}
                  onChange={e => setForm({...form, password: e.target.value})}
                  required
                />
                <button
                  type="button"
                  className={styles.inputSuffix}
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="Toggle password"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className={styles.rememberRow}>
              <label className={styles.checkboxLabel}>
                <input id="rememberMe" type="checkbox" />
                Remember me
              </label>
              <Link href="#" id="forgotPasswordLink" className={styles.forgotLink}>
                Forgot password?
              </Link>
            </div>

            <button
              id="loginBtn"
              type="submit"
              className={`btn btn-primary btn-full btn-lg ${styles.submitBtn}`}
              disabled={loading}
            >
              {loading ? <span className={styles.spinner} /> : <>Sign In <ArrowRight size={18} /></>}
            </button>
          </form>

          <div className={styles.authFooter}>
            <span>Don&apos;t have an account?</span>
            <Link href="/register" id="registerLink">Create Account</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
