import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSound } from '../context/SoundContext';
import { Swords, PlusCircle, ArrowRightCircle, Trophy, BookOpen, Flame, Zap, Shield, Sparkles } from 'lucide-react';

export default function LandingPage({ onOpenAuth, onOpenTutorial, onOpenLeaderboard, onRoomCreated, onRoomJoined }) {
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
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 20px' }}>
      {/* Hero Section */}
      <div style={{
        textAlign: 'center',
        padding: '50px 20px',
        position: 'relative'
      }}>
        {/* Glow ambient background element */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '380px',
          height: '380px',
          background: 'radial-gradient(circle, rgba(0, 242, 254, 0.15) 0%, rgba(142, 45, 226, 0.1) 50%, transparent 70%)',
          filter: 'blur(50px)',
          zIndex: -1,
          pointerEvents: 'none'
        }} />

        <div className="badge badge-cyan" style={{ marginBottom: '18px' }}>
          <Sparkles size={14} /> Competitive 1v1 Real-Time Word Guessing
        </div>

        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
          fontWeight: '900',
          lineHeight: 1.1,
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
          fontSize: '1.15rem',
          color: 'var(--text-secondary)',
          maxWidth: '640px',
          margin: '0 auto 36px auto',
          lineHeight: 1.6
        }}>
          Secretly lock your word. Uncover opponent letter slots one turn at a time.
          Every guess switches turns—test your deduction, anticipate blanks, and claim victory.
        </p>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button 
            className="btn btn-primary" 
            style={{ fontSize: '1.1rem', padding: '16px 36px' }}
            onClick={handleCreateRoom}
            disabled={creating}
          >
            <PlusCircle size={22} />
            <span>{creating ? 'Creating Room...' : 'Create Room'}</span>
          </button>

          <button 
            className="btn btn-secondary" 
            style={{ fontSize: '1.1rem', padding: '16px 36px' }}
            onClick={() => { playClick(); setShowJoinModal(true); }}
          >
            <ArrowRightCircle size={22} color="#00f2fe" />
            <span>Join Room</span>
          </button>

          <button 
            className="btn btn-accent" 
            style={{ fontSize: '1.1rem', padding: '16px 32px' }}
            onClick={() => { playClick(); onOpenTutorial(); }}
          >
            <BookOpen size={20} />
            <span>How to Play</span>
          </button>
        </div>
      </div>

      {/* Feature Pillars */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '20px',
        margin: '50px 0'
      }}>
        <div className="glass-panel" style={{ padding: '28px' }}>
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

        <div className="glass-panel" style={{ padding: '28px' }}>
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

        <div className="glass-panel" style={{ padding: '28px' }}>
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
        <div className="glass-panel" style={{ padding: '24px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <Trophy size={28} color="#ffb300" />
            <div>
              <div style={{ fontWeight: '800', fontSize: '1.1rem' }}>Top Arena Champion: {topPlayers[0]?.username}</div>
              <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                {topPlayers[0]?.wins} Wins • {topPlayers[0]?.xp} XP • {topPlayers[0]?.current_streak} Streak
              </div>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => { playClick(); onOpenLeaderboard(); }}>
            View Full Leaderboard →
          </button>
        </div>
      )}

      {/* Join Room Modal */}
      {showJoinModal && (
        <div className="modal-overlay" onClick={() => setShowJoinModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', marginBottom: '12px' }}>
              Enter Room Code
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '18px' }}>
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
                placeholder="e.g. A7K92P"
                style={{
                  width: '100%',
                  padding: '14px',
                  background: 'var(--bg-surface)',
                  border: '2px solid var(--border-glow)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--neon-cyan)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '1.6rem',
                  fontWeight: '800',
                  textAlign: 'center',
                  letterSpacing: '4px',
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
