import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSound } from '../context/SoundContext';
import { Swords, PlusCircle, ArrowRightCircle, Trophy, BookOpen, Flame, Zap, Shield, Sparkles, Users } from 'lucide-react';

export default function LandingPage({ onOpenAuth, onOpenTutorial, onOpenLeaderboard, onOpenMatchmaking, onRoomCreated, onRoomJoined }) {
  const { user, token } = useAuth();
  const { playClick, playHit, playMiss } = useSound();

  const [joinCode, setJoinCode] = useState('');
  const [showJoinModal, setShowJoinModal] = useState(false);
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

  const handleCreateRoom = async () => {
    playClick();
    if (!user) {
      onOpenAuth();
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ allow_custom_words: true })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to create room');

      playHit();
      onRoomCreated(data.room_code);
    } catch (e) {
      playMiss();
      alert(e.message);
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

        <div className="badge badge-cyan" style={{ marginBottom: '18px' }}>
          <Users size={14} /> Real-Time 1v1 Online Multiplayer
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

        {/* Global Multiplayer Primary Button */}
        <div style={{ marginBottom: '20px' }}>
          <button 
            className="btn btn-primary glow-cyan btn-3d" 
            style={{
              fontSize: 'clamp(1rem, 3vw, 1.3rem)',
              padding: 'clamp(14px, 3vw, 18px) clamp(16px, 4vw, 36px)',
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
              lineHeight: 1.3
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
            <Zap size={24} color="#03101d" fill="#03101d" style={{ flexShrink: 0 }} />
            <span>Global Multiplayer (Find Match Online)</span>
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
            onClick={handleCreateRoom}
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
      {topPlayers.length > 0 && (
        <div className="glass-panel card-3d-tilt" style={{ padding: 'clamp(16px, 3.5vw, 24px) clamp(16px, 4vw, 32px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <Trophy size={28} color="#ffb300" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: '800', fontSize: '1.05rem' }}>Top Arena Champion: {topPlayers[0]?.username}</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                {topPlayers[0]?.wins} Wins • {topPlayers[0]?.xp} XP • {topPlayers[0]?.current_streak} Streak
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

            {joinError && (
              <div style={{
                background: 'rgba(255, 42, 109, 0.15)',
                border: '1px solid rgba(255, 42, 109, 0.4)',
                color: '#ff6b8b',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.88rem',
                marginBottom: '14px'
              }}>
                {joinError}
              </div>
            )}

            <form onSubmit={handleJoinRoom}>
              <input
                type="text"
                maxLength={6}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="A7K92P"
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'var(--bg-surface)',
                  border: '2px solid var(--border-glow)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--neon-cyan)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'clamp(1.3rem, 5vw, 1.6rem)',
                  fontWeight: '800',
                  textAlign: 'center',
                  letterSpacing: 'clamp(2px, 1vw, 4px)',
                  outline: 'none',
                  marginBottom: '18px'
                }}
              />

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => { playClick(); setShowJoinModal(false); }}
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
    </div>
  );
}
