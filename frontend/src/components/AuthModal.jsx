import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSound } from '../context/SoundContext';
import { X, Lock, Mail, User, ShieldCheck, Eye, EyeOff, Sparkles, Loader2, AlertCircle, Check } from 'lucide-react';

const AVATAR_OPTIONS = [
  { id: 'avatar-1', label: 'Cyber Knight', icon: '⚔️', gradient: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)' },
  { id: 'avatar-2', label: 'Neon Rogue', icon: '⚡', gradient: 'linear-gradient(135deg, #ff2a6d 0%, #9900ef 100%)' },
  { id: 'avatar-3', label: 'Void Mage', icon: '🔮', gradient: 'linear-gradient(135deg, #8e2de2 0%, #4a00e0 100%)' },
  { id: 'avatar-4', label: 'Shadow Sniper', icon: '🎯', gradient: 'linear-gradient(135deg, #00e676 0%, #00b0ff 100%)' },
  { id: 'avatar-5', label: 'Titan Guard', icon: '🛡️', gradient: 'linear-gradient(135deg, #ffb300 0%, #ff5e62 100%)' },
];

function getPasswordStrength(pass) {
  if (!pass) return { score: 0, label: '', color: '#475569' };
  let score = 0;
  if (pass.length >= 6) score += 1;
  if (pass.length >= 10) score += 1;
  if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) score += 1;
  if (/\d/.test(pass)) score += 1;
  if (/[^A-Za-z0-9]/.test(pass)) score += 1;

  if (score <= 1) return { score: 20, label: 'Weak', color: '#ff2a6d' };
  if (score === 2) return { score: 45, label: 'Fair', color: '#ffb300' };
  if (score <= 4) return { score: 75, label: 'Good', color: '#00f2fe' };
  return { score: 100, label: 'Strong', color: '#00e676' };
}

export default function AuthModal({ isOpen, onClose }) {
  const { login } = useAuth();
  const { playClick, playHit, playMiss } = useSound();

  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('avatar-1');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [ripples, setRipples] = useState([]);

  const handleBtn3DClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const newRipple = { x, y, id: Date.now() };
    setRipples((prev) => [...prev, newRipple]);
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== newRipple.id));
    }, 600);
  };

  if (!isOpen) return null;

  const strength = isRegister ? getPasswordStrength(password) : null;

  const submitAuth = async (uName, uPass, isReg, uEmail, uAvatar) => {
    setLoading(true);
    setError('');
    try {
      const endpoint = isReg ? '/api/auth/register' : '/api/auth/login';
      const body = isReg
        ? { username: uName.trim(), email: uEmail.trim().toLowerCase(), password: uPass, avatar: uAvatar }
        : { username_or_email: uName.trim(), password: uPass, remember_me: rememberMe };

      // Try relative API endpoint first (handled by Vite proxy or production base)
      let res;
      try {
        res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch (fetchErr) {
        // If relative proxy failed during local dev, fallback directly to ports 8000 & 8001
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
          try {
            res = await fetch(`http://127.0.0.1:8000${endpoint}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
          } catch {
            res = await fetch(`http://127.0.0.1:8001${endpoint}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
          }
        } else {
          throw fetchErr;
        }
      }

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
        let msg = data.detail || `Authentication failed (${res.status}).`;
        if (res.status === 401) {
          msg = 'Invalid username/email or password.';
        } else if (res.status === 400 && data.detail) {
          msg = data.detail;
        } else if (res.status === 500) {
          msg = 'Server encountered an error. Please verify backend is running.';
        }
        throw new Error(msg);
      }

      login(data.access_token, data.user, rememberMe);
      playHit();
      onClose();
    } catch (err) {
      playMiss();
      setError(err.message || 'Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    playClick();
    setError('');

    if (isRegister) {
      const trimmedUser = username.trim();
      const trimmedEmail = email.trim();
      if (!trimmedUser || !trimmedEmail || !password || !confirmPassword) {
        setError('Please fill in all registration fields.');
        playMiss();
        return;
      }
      if (trimmedUser.length < 3 || trimmedUser.length > 30) {
        setError('Username must be between 3 and 30 characters.');
        playMiss();
        return;
      }
      if (!/^[a-zA-Z0-9_]+$/.test(trimmedUser)) {
        setError('Username can only contain letters, numbers, and underscores.');
        playMiss();
        return;
      }
      if (!/\S+@\S+\.\S+/.test(trimmedEmail)) {
        setError('Please enter a valid email address.');
        playMiss();
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters.');
        playMiss();
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        playMiss();
        return;
      }
      submitAuth(trimmedUser, password, true, trimmedEmail, selectedAvatar);
    } else {
      if (!username.trim() || !password) {
        setError('Please enter your username/email and password.');
        playMiss();
        return;
      }
      submitAuth(username.trim(), password, false, '', 'avatar-1');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '480px' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #00f2fe 0%, #8e2de2 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 16px rgba(0, 242, 254, 0.4)',
              flexShrink: 0
            }}>
              <ShieldCheck size={22} color="#fff" />
            </div>
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: '800', lineHeight: 1.2 }}>
                {isRegister ? 'Join Letter Duel' : 'Welcome Back'}
              </h2>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                {isRegister ? 'Create your duelist profile to compete' : 'Sign in to duel, rank up & invite friends'}
              </p>
            </div>
          </div>
          <button 
            className="btn btn-secondary btn-icon" 
            style={{ width: '38px', height: '38px', minWidth: '38px', minHeight: '38px' }}
            onClick={() => { playClick(); onClose(); }}
            title="Close"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          background: 'rgba(0, 0, 0, 0.35)',
          padding: '4px',
          borderRadius: 'var(--radius-md)',
          marginBottom: '20px',
          border: '1px solid rgba(255, 255, 255, 0.06)'
        }}>
          <button
            type="button"
            className="btn"
            style={{
              background: !isRegister ? 'linear-gradient(135deg, rgba(0, 242, 254, 0.15) 0%, rgba(142, 45, 226, 0.15) 100%)' : 'transparent',
              color: !isRegister ? '#fff' : 'var(--text-muted)',
              border: !isRegister ? '1px solid rgba(0, 242, 254, 0.4)' : '1px solid transparent',
              boxShadow: !isRegister ? '0 2px 10px rgba(0, 242, 254, 0.2)' : 'none',
              padding: '9px',
              fontWeight: !isRegister ? '700' : '500',
              fontSize: '0.92rem'
            }}
            onClick={() => { playClick(); setIsRegister(false); setError(''); }}
          >
            Sign In
          </button>
          <button
            type="button"
            className="btn"
            style={{
              background: isRegister ? 'linear-gradient(135deg, rgba(0, 242, 254, 0.15) 0%, rgba(142, 45, 226, 0.15) 100%)' : 'transparent',
              color: isRegister ? '#fff' : 'var(--text-muted)',
              border: isRegister ? '1px solid rgba(0, 242, 254, 0.4)' : '1px solid transparent',
              boxShadow: isRegister ? '0 2px 10px rgba(0, 242, 254, 0.2)' : 'none',
              padding: '9px',
              fontWeight: isRegister ? '700' : '500',
              fontSize: '0.92rem'
            }}
            onClick={() => { playClick(); setIsRegister(true); setError(''); }}
          >
            Create Account
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: 'rgba(255, 42, 109, 0.12)',
            border: '1px solid rgba(255, 42, 109, 0.4)',
            color: '#ff6b8b',
            padding: '11px 14px',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.88rem',
            marginBottom: '18px',
            animation: 'shake 0.3s ease'
          }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Avatar Selector during Registration */}
          {isRegister && (
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: '600' }}>
                Choose Duelist Avatar
              </label>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between' }}>
                {AVATAR_OPTIONS.map((av) => {
                  const isSelected = selectedAvatar === av.id;
                  return (
                    <button
                      key={av.id}
                      type="button"
                      onClick={() => { playClick(); setSelectedAvatar(av.id); }}
                      title={av.label}
                      style={{
                        flex: 1,
                        padding: '8px 4px',
                        background: isSelected ? 'rgba(0, 242, 254, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                        border: isSelected ? '2px solid var(--neon-cyan)' : '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '4px',
                        transform: isSelected ? 'scale(1.05)' : 'scale(1)',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <span style={{ fontSize: '1.3rem' }}>{av.icon}</span>
                      <span style={{ fontSize: '0.65rem', color: isSelected ? 'var(--neon-cyan)' : 'var(--text-muted)' }}>
                        {av.label.split(' ')[1]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Username */}
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>
              {isRegister ? 'Username' : 'Username or Email'}
            </label>
            <div style={{ position: 'relative' }}>
              <User size={16} color="#64748b" style={{ position: 'absolute', left: '14px', top: '14px' }} />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={isRegister ? "e.g. CyberKnight" : "Enter username or email"}
                autoComplete={isRegister ? "username" : "username email"}
                style={{
                  width: '100%',
                  padding: '12px 14px 12px 40px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  color: '#fff',
                  outline: 'none',
                  fontSize: '0.92rem',
                  transition: 'border-color 0.2s ease'
                }}
              />
            </div>
          </div>

          {/* Email (Register only) */}
          {isRegister && (
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>
                Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} color="#64748b" style={{ position: 'absolute', left: '14px', top: '14px' }} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="player@example.com"
                  autoComplete="email"
                  style={{
                    width: '100%',
                    padding: '12px 14px 12px 40px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    color: '#fff',
                    outline: 'none',
                    fontSize: '0.92rem'
                  }}
                />
              </div>
            </div>
          )}

          {/* Password */}
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} color="#64748b" style={{ position: 'absolute', left: '14px', top: '14px' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={isRegister ? "new-password" : "current-password"}
                style={{
                  width: '100%',
                  padding: '12px 42px 12px 40px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  color: '#fff',
                  outline: 'none',
                  fontSize: '0.92rem'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '12px',
                  background: 'transparent',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: '4px'
                }}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Password Strength Meter (Register only) */}
            {isRegister && password && (
              <div style={{ marginTop: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Strength</span>
                  <span style={{ color: strength.color, fontWeight: '700' }}>{strength.label}</span>
                </div>
                <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${strength.score}%`,
                    height: '100%',
                    background: strength.color,
                    transition: 'width 0.3s ease, background 0.3s ease'
                  }} />
                </div>
              </div>
            )}
          </div>

          {/* Confirm Password (Register only) */}
          {isRegister && (
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600' }}>
                Confirm Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} color="#64748b" style={{ position: 'absolute', left: '14px', top: '14px' }} />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  style={{
                    width: '100%',
                    padding: '12px 42px 12px 40px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    color: '#fff',
                    outline: 'none',
                    fontSize: '0.92rem'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '12px',
                    background: 'transparent',
                    border: 'none',
                    color: '#64748b',
                    cursor: 'pointer',
                    padding: '4px'
                  }}
                  title={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          )}

          {/* Remember Me */}
          {!isRegister && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  style={{ accentColor: 'var(--neon-cyan)', cursor: 'pointer', width: '16px', height: '16px' }}
                />
                Remember me for 7 days
              </label>
            </div>
          )}

          {/* 3D Interactive Submit Button */}
          <button 
            type="submit" 
            className="btn btn-primary btn-3d" 
            disabled={loading}
            onClick={handleBtn3DClick}
            style={{
              padding: '14px',
              fontSize: '1rem',
              fontWeight: '700',
              marginTop: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              position: 'relative',
              overflow: 'hidden',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {/* Dynamic 3D click ripple elements */}
            {ripples.map((ripple) => (
              <span
                key={ripple.id}
                className="ripple-3d"
                style={{
                  left: `${ripple.x}px`,
                  top: `${ripple.y}px`
                }}
              />
            ))}

            {loading ? (
              <>
                <div className="spinner-3d-wrapper" style={{ width: '22px', height: '22px' }}>
                  <div className="spinner-3d-ring1" />
                  <div className="spinner-3d-ring2" />
                  <div style={{
                    position: 'absolute',
                    inset: '6px',
                    borderRadius: '50%',
                    background: '#00f2fe',
                    boxShadow: '0 0 8px #00f2fe'
                  }} />
                </div>
                <span>{isRegister ? 'Forging Profile in Cyber Matrix...' : 'Authorizing Arena Clearance...'}</span>
              </>
            ) : (
              <>
                <Sparkles size={18} style={{ filter: 'drop-shadow(0 0 6px #00f2fe)' }} />
                <span>{isRegister ? 'Create Account & Enter Arena' : 'Sign In to Arena'}</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
