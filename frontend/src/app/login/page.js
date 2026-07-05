'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { Box, Wrench, Star, Diamond, Eye, EyeOff } from 'lucide-react';
import styles from './login.module.css';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(username, password);
      if (user.role === 'operator') router.push('/operator');
      else if (user.role === 'supervisor') router.push('/supervisor');
      else router.push('/manager');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.bgPattern}></div>
      <div className={styles.bgGlow}></div>

      <div className={styles.loginCard}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>
            <Box size={28} strokeWidth={2} />
          </div>
          <h1>EngineTrace</h1>
          <p className={styles.tagline}>Smart Warehouse Management System</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {error && (
            <div className={styles.error}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}

          <div className={styles.field}>
            <label htmlFor="username">Username</label>
            <input
              id="username"
              className="input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              autoComplete="username"
              required
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password">Password</label>
            <div className={styles.passwordWrapper}>
              <input
                id="password"
                className="input"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className={styles.passwordToggle}
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <button type="submit" className={`btn btn-primary ${styles.submitBtn}`} disabled={loading}>
            {loading ? (
              <>
                <span className={styles.spinnerSmall}></span>
                Authenticating...
              </>
            ) : 'Sign In'}
          </button>
        </form>

        <div className={styles.roles}>
          <p>Demo Accounts</p>
          <div className={styles.roleGrid}>
            <button className={styles.roleBtn} onClick={() => { setUsername('operator1'); setPassword('Op3r@tor!2026'); }}>
              <span className={styles.roleBtnIcon} style={{ background: 'var(--accent-blue-soft)', color: 'var(--accent-blue)' }}>
                <Wrench size={14} />
              </span>
              <span>Operator</span>
            </button>
            <button className={styles.roleBtn} onClick={() => { setUsername('supervisor1'); setPassword('Sup3rv!sor2026'); }}>
              <span className={styles.roleBtnIcon} style={{ background: 'var(--accent-orange-soft)', color: 'var(--accent-orange)' }}>
                <Star size={14} />
              </span>
              <span>Supervisor</span>
            </button>
            <button className={styles.roleBtn} onClick={() => { setUsername('manager1'); setPassword('M@nager!2026'); }}>
              <span className={styles.roleBtnIcon} style={{ background: 'var(--accent-purple-soft)', color: 'var(--accent-purple)' }}>
                <Diamond size={14} />
              </span>
              <span>Manager</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
