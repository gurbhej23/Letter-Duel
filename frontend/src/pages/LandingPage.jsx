import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSound } from '../context/SoundContext';
import { useSocket } from '../context/SocketContext';
import { Swords, PlusCircle, ArrowRightCircle, BookOpen, Trophy, Users, Zap, Shield, Sparkles, X, Lock, AlertCircle } from 'lucide-react';
import { ARENA_TIERS, getTierForFee } from '../utils/arenaTiers';
import { isRankEligible, getRankMeta } from '../utils/rankUtils';

export default function LandingPage({ onOpenAuth, onOpenTutorial, onOpenLeaderboard, onOpenMatchmaking, onRoomCreated, onRoomJoined, onOpenTournaments }) {
  const { user, token } = useAuth();
  const { playClick, playHit, playMiss } = useSound();
  const { onlineCount } = useSocket();

  const [joinCode, setJoinCode] = useState('');
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createFee, setCreateFee] = useState(50);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [topPlayers, setTopPlayers] = useState([]);

  useEffect(() => {
    fetch('/api/leaderboard?limit=3')
      .then(res => {
        if (!res.ok) return [];
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data)) setTopPlayers(data);
      })
      .catch(err => console.error(err));

    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('join');
      if (code && code.trim().length === 6) {
        setJoinCode(code.trim().toUpperCase());
        setShowJoinModal(true);
      }
    } catch {
      // silent
    }
  }, []);

  const handleOpenCreateModal = () => {
    playClick();
    if (!user) {
      onOpenAuth();
      return;
    }
    setCreateError('');
    setShowCreateModal(true);
  };

  const handleCreateRoom = async (feeToUse) => {
    playClick();
    if (!user) {
      onOpenAuth();
      return;
    }

    const tier = getTierForFee(feeToUse);
    const userCoins = user?.coins ?? 100;
    const userRank = user?.rank || 'Bronze III';

    if (userCoins < tier.fee) {
      setCreateError(`Insufficient coins (${userCoins} 🪙). Need ${tier.fee} 🪙.`);
      playMiss();
      return;
    }
    if (!isRankEligible(userRank, tier.minRank)) {
      setCreateError(`Requires ${tier.reqLabel} to enter. (Current: ${userRank})`);
      playMiss();
      return;
    }

    setCreating(true);
    setCreateError('');
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ allow_custom_words: true, entry_fee: tier.fee })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to create room');

      playHit();
      setShowCreateModal(false);
      onRoomCreated(data.room_code);
    } catch (e) {
      playMiss();
      setCreateError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    playClick();
    if (!user) {
      onOpenAuth();
      return;
    }
    const cleanCode = joinCode.trim().toUpperCase();
    if (cleanCode.length !== 6) {
      setJoinError('Room code must be exactly 6 characters.');
      playMiss();
      return;
    }

    setJoining(true);
    setJoinError('');
    try {
      const res = await fetch('/api/rooms/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ room_code: cleanCode })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to join room');

      playHit();
      setShowJoinModal(false);
      onRoomJoined(cleanCode);
    } catch (e) {
      playMiss();
      setJoinError(e.message);
    } finally {
      setJoining(false);
    }
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: 'clamp(20px, 4vw, 40px) clamp(12px, 3vw, 20px)' }}>
      {/* Hero Section */}
      <div style={{
        textAlign: 'center',
        padding: 'clamp(24px, 5vw, 50px) clamp(8px, 2vw, 16px)',
        position: 'relative'
      }}>
        {/* Glow ambient background element */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(380px, 80vw)',
          height: 'min(380px, 80vw)',
          background: 'radial-gradient(circle, rgba(0, 242, 254, 0.15) 0%, rgba(142, 45, 226, 0.1) 50%, transparent 70%)',
          filter: 'blur(50px)',
          zIndex: -1,
          pointerEvents: 'none'
        }} />

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '18px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <div className="badge badge-cyan">
            <Users size={14} /> Real-Time 1v1 Online Multiplayer
          </div>
          <div className="badge" style={{ background: 'rgba(0, 230, 118, 0.1)', border: '1px solid rgba(0, 230, 118, 0.35)', color: '#00e676', display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: '800' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#00e676', boxShadow: '0 0 6px #00e676' }} />
            <span>{onlineCount} Online Now</span>
          </div>
        </div>

        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(2.1rem, 5.5vw, 4.5rem)',
          fontWeight: '900',
          lineHeight: 1.15,
          letterSpacing: '-1px',
          marginBottom: '18px'
        }}>
          OUTSMART YOUR RIVAL.<br />
          <span style={{
            background: 'linear-gradient(90deg, #00f2fe 0%, #4facfe 50%, #8e2de2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            DUEL LETTER BY LETTER.
          </span>
        </h1>

        <p style={{
          fontSize: 'clamp(0.95rem, 2.5vw, 1.15rem)',
          color: 'var(--text-secondary)',
          maxWidth: '640px',
          margin: '0 auto clamp(20px, 4vw, 36px) auto',
          lineHeight: 1.6
        }}>
          Secretly lock your word. Uncover opponent letter slots one turn at a time.
          Every guess switches turns—test your deduction, anticipate blanks, and claim victory.
        </p>

        {/* 3D Floating Decorative Elements */}
        <div style={{
          position: 'absolute',
          top: '15%',
          left: '8%',
          width: '42px',
          height: '42px',
          borderRadius: '10px',
          background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.25), rgba(142, 45, 226, 0.25))',
          border: '1px solid rgba(0, 242, 254, 0.4)',
          boxShadow: '0 0 20px rgba(0, 242, 254, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.2rem',
          animation: 'float3D 5s ease-in-out infinite, rotateCrystal3D 14s linear infinite',
          pointerEvents: 'none',
          opacity: 0.75
        }}>
          ⚔️
        </div>

        <div style={{
          position: 'absolute',
          bottom: '20%',
          right: '8%',
          width: '38px',
          height: '38px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(255, 42, 109, 0.25), rgba(255, 179, 0, 0.25))',
          border: '1px solid rgba(255, 42, 109, 0.4)',
          boxShadow: '0 0 20px rgba(255, 42, 109, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1rem',
          animation: 'float3D 6s ease-in-out infinite reverse, rotateCrystal3D 18s linear infinite reverse',
          pointerEvents: 'none',
          opacity: 0.75
        }}>
          ⚡
        </div>

        {/* Primary Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', marginBottom: '20px' }}>
          <button 
            className="btn btn-primary glow-cyan btn-3d" 
            style={{
              fontSize: 'clamp(1rem, 3vw, 1.25rem)',
              padding: 'clamp(12px, 2.5vw, 16px) clamp(16px, 4vw, 36px)',
              borderRadius: 'var(--radius-lg)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              fontWeight: '800',
              letterSpacing: '0.5px',
              maxWidth: '100%',
              whiteSpace: 'normal',
              textAlign: 'center',
              lineHeight: 1.3,
              width: 'min(460px, 100%)'
            }}
            onClick={() => {
              playClick();
              if (!user) {
                onOpenAuth();
              } else {
                onOpenMatchmaking();
              }
            }}
          >
            <Zap size={22} color="#03101d" fill="#03101d" style={{ flexShrink: 0 }} />
            <span>Global Multiplayer (Quick Match)</span>
          </button>

          <button 
            className="btn btn-3d" 
            style={{
              fontSize: 'clamp(0.95rem, 2.8vw, 1.15rem)',
              padding: 'clamp(12px, 2.5vw, 15px) clamp(16px, 4vw, 32px)',
              borderRadius: 'var(--radius-lg)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              fontWeight: '800',
              letterSpacing: '0.5px',
              maxWidth: '100%',
              whiteSpace: 'normal',
              textAlign: 'center',
              lineHeight: 1.3,
              width: 'min(460px, 100%)',
              background: 'linear-gradient(135deg, #ffb300, #ff8f00)',
              color: '#0a0d14',
              boxShadow: '0 0 25px rgba(255, 179, 0, 0.35)',
              border: 'none'
            }}
            onClick={() => {
              playClick();
              if (!user) {
                onOpenAuth();
              } else {
                onOpenTournaments();
              }
            }}
          >
            <Trophy size={22} color="#0a0d14" fill="#0a0d14" style={{ flexShrink: 0 }} />
            <span>🏆 Tournament Mode (8-Player Knockout)</span>
          </button>
        </div>

        {/* Secondary Private Room Actions */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '700', width: '100%', marginBottom: '4px' }}>
            or play with a friend:
          </span>

          <button
            className="btn btn-secondary"
            style={{ fontSize: '0.92rem', padding: '10px 18px' }}
            onClick={handleOpenCreateModal}
            disabled={creating}
          >
            <PlusCircle size={18} />
            <span>{creating ? 'Creating...' : 'Create Private Room'}</span>
          </button>

          <button
            className="btn btn-secondary"
            style={{ fontSize: '0.92rem', padding: '10px 18px' }}
            onClick={() => { playClick(); setShowJoinModal(true); }}
          >
            <ArrowRightCircle size={18} color="#00f2fe" />
            <span>Join with Code</span>
          </button>

          <button
            className="btn btn-accent"
            style={{ fontSize: '0.92rem', padding: '10px 18px' }}
            onClick={() => { playClick(); onOpenTutorial(); }}
          >
            <BookOpen size={17} />
            <span>How to Play</span>
          </button>
        </div>
      </div>

      {/* Feature Pillars */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
        gap: '20px',
        margin: 'clamp(30px, 6vw, 50px) 0'
      }}>
        <div className="glass-panel card-3d-tilt" style={{ padding: 'clamp(20px, 4vw, 28px)' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            background: 'rgba(0, 242, 254, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px'
          }}>
            <Swords size={24} color="#00f2fe" />
          </div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', marginBottom: '8px' }}>
            Strict Turn Alternation
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.6 }}>
            Every guess immediately shifts turn control—no bonus guesses for hits. Complete tactical parity where each choice carries immense weight.
          </p>
        </div>

        <div className="glass-panel card-3d-tilt" style={{ padding: 'clamp(20px, 4vw, 28px)' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            background: 'rgba(142, 45, 226, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px'
          }}>
            <Shield size={24} color="#8e2de2" />
          </div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', marginBottom: '8px' }}>
            Zero-Knowledge Secrecy
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.6 }}>
            Opponent secret words never leave the authoritative backend. Only confirmed letter positions and word lengths are sent across WebSockets.
          </p>
        </div>

        <div className="glass-panel card-3d-tilt" style={{ padding: 'clamp(20px, 4vw, 28px)' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            background: 'rgba(255, 179, 0, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px'
          }}>
            <Zap size={24} color="#ffb300" />
          </div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', marginBottom: '8px' }}>
            Real-Time Multiplayer
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.6 }}>
            Instant letter reveals, live battle chat, procedural sound effects, 60s disconnect recovery timers, and smooth rematch lobbies.
          </p>
        </div>
      </div>

      {/* Podium Teaser */}
      {topPlayers.length > 0 && (topPlayers[0]?.wins > 0 || topPlayers[0]?.xp > 0) && (
        <div className="glass-panel card-3d-tilt" style={{ padding: 'clamp(16px, 3.5vw, 24px) clamp(16px, 4vw, 32px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <Trophy size={28} color="#ffb300" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: '800', fontSize: '1.05rem' }}>Top Arena Champion: {topPlayers[0]?.username}</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                {topPlayers[0]?.rank ? `${topPlayers[0].rank} • ` : ''}{topPlayers[0]?.wins || 0} Wins • {topPlayers[0]?.current_streak || 0} Streak
              </div>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => { playClick(); onOpenLeaderboard(); }}>
            View Rankings →
          </button>
        </div>
      )}

      {/* Join Room Modal */}
      {showJoinModal && (
        <div className="modal-overlay" onClick={() => setShowJoinModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', marginBottom: '10px' }}>
              Enter Room Code
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '18px' }}>
              Type the 6-character room code sent by your duel opponent.
            </p>

            <form onSubmit={handleJoinRoom}>
              <div style={{ marginBottom: '16px' }}>
                <input 
                  type="text"
                  maxLength={6}
                  placeholder="e.g. DUEL42"
                  value={joinCode}
                  onChange={(e) => {
                    setJoinCode(e.target.value.toUpperCase());
                    setJoinError('');
                  }}
                  autoFocus
                  style={{
                    width: '100%',
                    textAlign: 'center',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '1.4rem',
                    letterSpacing: '4px',
                    fontWeight: '800',
                    textTransform: 'uppercase',
                    padding: '12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-glow)',
                    background: 'var(--bg-surface)',
                    color: 'var(--neon-cyan)',
                    outline: 'none',
                    boxShadow: '0 0 15px rgba(0, 242, 254, 0.2)'
                  }}
                />
              </div>

              {joinError && (
                <div style={{
                  color: '#ff4d6d',
                  fontSize: '0.85rem',
                  marginBottom: '16px',
                  background: 'rgba(255, 42, 109, 0.1)',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid rgba(255, 42, 109, 0.3)'
                }}>
                  {joinError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ flex: 1 }}
                  onClick={() => setShowJoinModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  style={{ flex: 2 }}
                  disabled={joining || joinCode.trim().length !== 6}
                >
                  {joining ? 'Joining...' : 'Enter Duel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Create Private Room Modal with Arena Stake Selection */}
      {showCreateModal && (() => {
        const userRank = user?.rank || 'Bronze III';
        const rankMeta = getRankMeta(userRank);
        const userCoins = user?.coins ?? 100;

        return (
          <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '540px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <PlusCircle size={22} color="var(--neon-cyan)" />
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', margin: 0 }}>
                    Create Private Duel Room
                  </h2>
                </div>
                <button 
                  className="btn btn-secondary btn-icon" 
                  style={{ width: '32px', height: '32px' }}
                  onClick={() => { playClick(); setShowCreateModal(false); }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* User summary (Rank, Coins - NO Level) */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '8px 14px',
                marginBottom: '16px',
                fontSize: '0.85rem',
                flexWrap: 'wrap',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    background: rankMeta.bg,
                    color: rankMeta.color,
                    border: `1px solid ${rankMeta.border}`,
                    padding: '2px 8px',
                    borderRadius: '10px',
                    fontWeight: '800',
                    fontSize: '0.75rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    {rankMeta.badge} {userRank}
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}>{user?.username}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '800', color: '#ffc107' }}>
                  <span>🪙</span>
                  <span>{userCoins} Coins</span>
                </div>
              </div>

              <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', marginBottom: '16px', textAlign: 'left' }}>
                Choose your arena and compete for bigger rewards.
              </p>

              {createError && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(255, 42, 109, 0.12)',
                  border: '1px solid rgba(255, 42, 109, 0.4)',
                  color: '#ff6b8b',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.82rem',
                  marginBottom: '14px'
                }}>
                  <AlertCircle size={16} />
                  <span>{createError}</span>
                </div>
              )}

              {/* Arena Tiers */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px', maxHeight: '280px', overflowY: 'auto' }}>
                {ARENA_TIERS.map((tier) => {
                  const isLocked = !isRankEligible(userRank, tier.minRank);
                  const isAffordable = userCoins >= tier.fee;
                  const isSelected = createFee === tier.fee;

                  return (
                    <div
                      key={tier.fee}
                      onClick={() => {
                        if (isLocked) {
                          playMiss();
                          setCreateError(`Requires ${tier.reqLabel} to enter.`);
                        } else if (!isAffordable) {
                          playMiss();
                          setCreateError(`Insufficient coins. You have ${userCoins} 🪙, need ${tier.fee} 🪙.`);
                        } else {
                          playClick();
                          setCreateFee(tier.fee);
                          setCreateError('');
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 14px',
                        borderRadius: 'var(--radius-md)',
                        background: isSelected ? tier.bg : 'rgba(255, 255, 255, 0.03)',
                        border: isSelected ? `2px solid ${tier.color}` : '1px solid rgba(255, 255, 255, 0.08)',
                        boxShadow: isSelected ? `0 0 16px ${tier.color}40` : 'none',
                        cursor: (isLocked || !isAffordable) ? 'not-allowed' : 'pointer',
                        opacity: isLocked ? 0.55 : (!isAffordable ? 0.7 : 1),
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left' }}>
                        <span style={{ fontSize: '1.5rem' }}>{tier.icon}</span>
                        <div>
                          <div style={{ fontWeight: '800', fontSize: '0.95rem', color: isSelected ? '#fff' : 'var(--text-primary)' }}>
                            {tier.name}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', gap: '8px', marginTop: '2px' }}>
                            <span style={{ color: '#ffc107', fontWeight: '700' }}>🪙 {tier.fee} Entry</span>
                            <span>•</span>
                            <span style={{ color: '#00e676', fontWeight: '700' }}>🏆 {tier.pot} Pot</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        {isLocked ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'rgba(255, 42, 109, 0.15)',
                            border: '1px solid rgba(255, 42, 109, 0.4)',
                            color: '#ff6b8b',
                            fontSize: '0.75rem',
                            fontWeight: '800',
                            padding: '3px 8px',
                            borderRadius: '10px'
                          }}>
                            <Lock size={12} /> {tier.reqLabel}
                          </span>
                        ) : !isAffordable ? (
                          <span style={{
                            fontSize: '0.75rem',
                            color: '#ffb300',
                            fontWeight: '800',
                            background: 'rgba(255, 179, 0, 0.15)',
                            padding: '3px 8px',
                            borderRadius: '10px'
                          }}>
                            Low Coins
                          </span>
                        ) : isSelected ? (
                          <span style={{
                            background: 'rgba(0, 242, 254, 0.18)',
                            border: '1px solid var(--neon-cyan)',
                            color: 'var(--neon-cyan)',
                            fontSize: '0.75rem',
                            fontWeight: '900',
                            padding: '3px 10px',
                            borderRadius: '10px'
                          }}>
                            SELECTED ✓
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Select
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                className="btn btn-primary btn-3d"
                style={{ width: '100%', padding: '14px', fontSize: '1rem', fontWeight: '800' }}
                onClick={() => handleCreateRoom(createFee)}
                disabled={creating || !isRankEligible(userRank, getTierForFee(createFee).minRank) || userCoins < createFee}
              >
                {creating ? 'Creating Room...' : `Create Room (🪙 ${createFee} Stake)`}
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
