import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSound } from '../context/SoundContext';
import { X, User, Flame, Trophy, Swords, Calendar, Clock } from 'lucide-react';

const AVATARS = ['avatar-1', 'avatar-2', 'avatar-3', 'avatar-4', 'avatar-5', 'avatar-6'];

export default function ProfileModal({ isOpen, onClose }) {
  const { user, token, updateUser } = useAuth();
  const { playClick, playHit } = useSound();

  const [username, setUsername] = useState(user?.username || '');
  const [selectedAvatar, setSelectedAvatar] = useState(user?.avatar || 'avatar-1');
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (user) {
      setUsername(user.username);
      setSelectedAvatar(user.avatar || 'avatar-1');
    }
    if (isOpen && token) {
      fetchHistory();
    }
  }, [isOpen, user, token]);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/history', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    playClick();
    setSaving(true);
    setNotice('');
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          username: username.trim(),
          avatar: selectedAvatar
        })
      });
      if (res.ok) {
        const updated = await res.json();
        updateUser(updated);
        playHit();
        setNotice('Profile updated successfully!');
      } else {
        const err = await res.json();
        setNotice(err.detail || 'Failed to update profile.');
      }
    } catch (e) {
      setNotice('Network error.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !user) return null;

  const totalGames = user.wins + user.losses;
  const winRate = totalGames > 0 ? Math.round((user.wins / totalGames) * 100) : 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <User size={24} color="#00f2fe" />
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem' }}>
              Player Profile & Records
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

        {/* Stats Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 110px), 1fr))',
          gap: '10px',
          marginBottom: '20px'
        }}>
          <div style={{ background: 'var(--bg-surface)', padding: '12px', borderRadius: 'var(--radius-md)', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Wins</div>
            <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--neon-emerald)' }}>{user.wins}</div>
          </div>
          <div style={{ background: 'var(--bg-surface)', padding: '12px', borderRadius: 'var(--radius-md)', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Win Rate</div>
            <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--neon-cyan)' }}>{winRate}%</div>
          </div>
          <div style={{ background: 'var(--bg-surface)', padding: '12px', borderRadius: 'var(--radius-md)', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Streak</div>
            <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--neon-amber)' }}>{user.current_streak} 🔥</div>
          </div>
          <div style={{ background: 'var(--bg-surface)', padding: '12px', borderRadius: 'var(--radius-md)', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total XP</div>
            <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#a78bfa' }}>{user.xp}</div>
          </div>
        </div>

        {/* Edit Form */}
        <form onSubmit={handleSave} style={{ marginBottom: '22px' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Change Username
              </label>
              <input 
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  color: '#fff',
                  outline: 'none',
                  minHeight: '44px'
                }}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ minHeight: '44px' }}>
              {saving ? 'Saving...' : 'Update'}
            </button>
          </div>
          {notice && (
            <div style={{ marginTop: '8px', fontSize: '0.85rem', color: 'var(--neon-cyan)' }}>
              {notice}
            </div>
          )}
        </form>

        {/* Recent Matches */}
        <div>
          <h3 style={{ fontSize: '1rem', fontFamily: 'var(--font-display)', marginBottom: '10px', color: 'var(--text-secondary)' }}>
            Recent Match History
          </h3>
          <div style={{
            background: 'var(--bg-surface)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            maxHeight: '180px',
            overflowY: 'auto'
          }}>
            {loadingHistory ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading history...</div>
            ) : history.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>No matches recorded yet.</div>
            ) : (
              history.map(m => (
                <div 
                  key={m.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    fontSize: '0.88rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className={`badge ${m.result === 'WIN' ? 'badge-emerald' : 'badge-rose'}`}>
                      {m.result}
                    </span>
                    <span style={{ fontWeight: '700' }}>vs {m.opponent_username}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    <span>{m.guesses_count} guesses</span>
                    <span>{Math.floor(m.duration_seconds / 60)}m {m.duration_seconds % 60}s</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
