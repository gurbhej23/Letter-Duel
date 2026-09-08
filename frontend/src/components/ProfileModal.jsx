import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSound } from '../context/SoundContext';
import { X, User, Flame, Trophy, Swords, Calendar, Clock } from 'lucide-react';

const AVATARS = ['avatar-1', 'avatar-2', 'avatar-3', 'avatar-4', 'avatar-5', 'avatar-6'];

export default function ProfileModal({ isOpen, onClose }) {
  const { user, token, updateUser, claimDailyBonus } = useAuth();
  const { playClick, playHit } = useSound();

  const [username, setUsername] = useState(user?.username || '');
  const [selectedAvatar, setSelectedAvatar] = useState(user?.avatar || 'avatar-1');
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [claimingDaily, setClaimingDaily] = useState(false);
  const [dailyNotice, setDailyNotice] = useState('');

  const [historyTab, setHistoryTab] = useState('1v1'); // '1v1' or 'tournaments'
  const [tournamentHistory, setTournamentHistory] = useState([]);

  useEffect(() => {
    if (user) {
      setUsername(user.username || '');
      setSelectedAvatar(user.avatar || 'avatar-1');
    }
    if (isOpen && token) {
      fetchHistory();
      fetchTournamentHistory();
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

  const fetchTournamentHistory = async () => {
    try {
      const res = await fetch('/api/tournaments/history', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTournamentHistory(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleClaimDaily = async () => {
    playClick();
    setClaimingDaily(true);
    setDailyNotice('');
    const res = await claimDailyBonus();
    if (res.success) {
      playHit();
      setDailyNotice(`🎉 +${res.bonus_amount || 200} Coins claimed! Balance: ${res.coins} 🪙`);
    } else {
      setDailyNotice(res.message || 'Daily bonus already claimed for today.');
    }
    setClaimingDaily(false);
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
  const userLevel = user.level || 1;
  const userXp = user.xp || 0;
  const currentLevelXp = userXp % 200;
  const xpPercent = Math.min(100, Math.round((currentLevelXp / 200) * 100));

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

        {/* Level & Coins Card */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(142, 45, 226, 0.15) 0%, rgba(0, 242, 254, 0.12) 100%)',
          border: '1px solid rgba(0, 242, 254, 0.25)',
          borderRadius: 'var(--radius-lg)',
          padding: '16px',
          marginBottom: '18px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                background: 'linear-gradient(135deg, #8e2de2, #4a00e0)',
                color: '#fff',
                fontWeight: '900',
                fontSize: '0.9rem',
                padding: '4px 12px',
                borderRadius: '12px',
                boxShadow: '0 0 12px rgba(142, 45, 226, 0.4)'
              }}>
                LEVEL {userLevel}
              </div>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: '600' }}>
                Duelist Rank
              </span>
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(255, 179, 0, 0.18)',
              border: '1px solid rgba(255, 179, 0, 0.4)',
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '1rem',
              fontWeight: '800',
              color: '#ffc107'
            }}>
              <span>🪙</span>
              <span>{user.coins ?? 500} Coins</span>
            </div>
          </div>

          {/* XP Progress Bar */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
              <span>XP Progress to Level {userLevel + 1}</span>
              <span style={{ color: '#00f2fe', fontWeight: '700' }}>{currentLevelXp} / 200 XP ({xpPercent}%)</span>
            </div>
            <div style={{
              width: '100%',
              height: '10px',
              background: 'rgba(255, 255, 255, 0.08)',
              borderRadius: '6px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${xpPercent}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #00f2fe, #8e2de2)',
                borderRadius: '6px',
                transition: 'width 0.4s ease'
              }} />
            </div>
          </div>

          {/* Daily Refill Action */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Claim +200 free coins daily (or immediately if low on coins):
            </span>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleClaimDaily}
              disabled={claimingDaily}
              style={{
                borderColor: 'rgba(255, 179, 0, 0.5)',
                color: '#ffc107',
                fontWeight: '700',
                background: 'rgba(255, 179, 0, 0.1)'
              }}
            >
              {claimingDaily ? 'Claiming...' : '🎁 Claim Daily Bonus'}
            </button>
          </div>
          {dailyNotice && (
            <div style={{ marginTop: '8px', fontSize: '0.82rem', color: dailyNotice.includes('🎉') ? 'var(--neon-emerald)' : 'var(--neon-amber)' }}>
              {dailyNotice}
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 100px), 1fr))',
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

        {/* Match & Tournament History */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className={`btn btn-sm ${historyTab === '1v1' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.78rem', padding: '4px 12px' }}
                onClick={() => { playClick(); setHistoryTab('1v1'); }}
              >
                1v1 Duels
              </button>
              <button
                type="button"
                className={`btn btn-sm ${historyTab === 'tournaments' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.78rem', padding: '4px 12px' }}
                onClick={() => { playClick(); setHistoryTab('tournaments'); }}
              >
                🏆 Tournaments
              </button>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {historyTab === '1v1' ? `${history.length} matches` : `${tournamentHistory.length} tournaments`}
            </span>
          </div>

          <div style={{
            background: 'var(--bg-surface)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            maxHeight: '180px',
            overflowY: 'auto'
          }}>
            {historyTab === '1v1' ? (
              loadingHistory ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading history...</div>
              ) : history.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>No 1v1 duels recorded yet.</div>
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
              )
            ) : (
              tournamentHistory.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>No tournaments completed yet. Enter the arena to compete!</div>
              ) : (
                tournamentHistory.map(th => (
                  <div 
                    key={th.tournament_id}
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
                      <span className={`badge ${th.placement === 1 ? 'badge-emerald' : 'badge-amber'}`}>
                        {th.placement_title}
                      </span>
                      <span style={{ fontWeight: '700' }}>{th.tournament_name}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ffb300', fontWeight: '800', fontSize: '0.82rem' }}>
                      <span>+{th.coins_awarded} 🪙</span>
                      <span style={{ color: 'var(--neon-cyan)' }}>+{th.xp_awarded} XP</span>
                    </div>
                  </div>
                ))
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
