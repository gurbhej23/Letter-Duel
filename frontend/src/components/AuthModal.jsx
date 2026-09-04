import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSound } from '../context/SoundContext';
import { X, Lock, Mail, User, ShieldCheck } from 'lucide-react';

export default function AuthModal({ isOpen, onClose }) {
  const { login } = useAuth();
  const { playClick, playHit, playMiss } = useSound();

  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    playClick();
    setError('');

    if (isRegister) {
      if (!username || !email || !password || !confirmPassword) {
        setError('Please fill in all fields.');
        playMiss();
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        playMiss();
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters.');
        playMiss();
        return;
      }
    } else {
      if (!username || !password) {
        setError('Please enter your username/email and password.');
        playMiss();
        return;
      }
    }

    setLoading(true);
    try {
      const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
      const body = isRegister 
        ? { username, email, password }
        : { username_or_email: username, password, remember_me: rememberMe };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      let data = {};
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          data = await res.json();
        } catch {
          data = {};
        }
      }

      if (!res.ok) {
        throw new Error(data.detail || `Request failed (${res.status}). Verify backend URL is configured.`);
      }

      login(data.access_token, data.user);
      playHit();
      onClose();
    } catch (err) {
      playMiss();
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={24} color="#00f2fe" />
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem' }}>
              {isRegister ? 'Create Player Account' : 'Player Login'}
            </h2>
          </div>
          <button 
            className="btn btn-secondary btn-icon" 
            style={{ width: '32px', height: '32px' }}
            onClick={() => { playClick(); onClose(); }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          background: 'rgba(0, 0, 0, 0.25)',
          padding: '4px',
          borderRadius: 'var(--radius-md)',
          marginBottom: '20px'
        }}>
          <button
            className="btn"
            style={{
              background: !isRegister ? 'var(--bg-surface-elevated)' : 'transparent',
              color: !isRegister ? 'var(--neon-cyan)' : 'var(--text-muted)',
              boxShadow: !isRegister ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
              padding: '8px'
            }}
            onClick={() => { playClick(); setIsRegister(false); setError(''); }}
          >
            Login
          </button>
          <button
            className="btn"
            style={{
              background: isRegister ? 'var(--bg-surface-elevated)' : 'transparent',
              color: isRegister ? 'var(--neon-cyan)' : 'var(--text-muted)',
              boxShadow: isRegister ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
              padding: '8px'
            }}
            onClick={() => { playClick(); setIsRegister(true); setError(''); }}
          >
            Register
          </button>
        </div>

        {error && (
          <div style={{
            background: 'rgba(255, 42, 109, 0.15)',
            border: '1px solid rgba(255, 42, 109, 0.4)',
            color: '#ff6b8b',
            padding: '10px 14px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.88rem',
            marginBottom: '16px'
          }}>
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              {isRegister ? 'Username' : 'Username or Email'}
            </label>
            <div style={{ position: 'relative' }}>
              <User size={16} color="#64748b" style={{ position: 'absolute', left: '14px', top: '14px' }} />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={isRegister ? "e.g. PixelWarrior" : "Enter username or email"}
                style={{
                  width: '100%',
                  padding: '12px 14px 12px 40px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  color: '#fff',
                  outline: 'none',
                  fontSize: '0.95rem'
                }}
              />
            </div>
          </div>

          {isRegister && (
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} color="#64748b" style={{ position: 'absolute', left: '14px', top: '14px' }} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  style={{
                    width: '100%',
                    padding: '12px 14px 12px 40px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    color: '#fff',
                    outline: 'none',
                    fontSize: '0.95rem'
                  }}
                />
              </div>
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} color="#64748b" style={{ position: 'absolute', left: '14px', top: '14px' }} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: '100%',
                  padding: '12px 14px 12px 40px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  color: '#fff',
                  outline: 'none',
                  fontSize: '0.95rem'
                }}
              />
            </div>
          </div>

          {isRegister && (
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Confirm Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} color="#64748b" style={{ position: 'absolute', left: '14px', top: '14px' }} />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{
                    width: '100%',
                    padding: '12px 14px 12px 40px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    color: '#fff',
                    outline: 'none',
                    fontSize: '0.95rem'
                  }}
                />
              </div>
            </div>
          )}

          {!isRegister && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <input
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{ accentColor: 'var(--neon-cyan)', cursor: 'pointer' }}
              />
              <label htmlFor="rememberMe" style={{ cursor: 'pointer' }}>Remember me</label>
            </div>
          )}

          <button 
            type="submit" 
            className="btn btn-primary" 
            disabled={loading}
            style={{ marginTop: '8px' }}
          >
            {loading ? 'Processing...' : (isRegister ? 'Create Account' : 'Sign In')}
          </button>
        </form>
      </div>
    </div>
  );
}
