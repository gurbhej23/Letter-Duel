import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useSound } from '../context/SoundContext';
import { Volume2, VolumeX, Trophy, Users, BookOpen, User, LogOut, Flame, Sparkles } from 'lucide-react';

export default function Navbar({ onOpenAuth, onOpenTutorial, onOpenLeaderboard, onOpenFriends, onOpenProfile }) {
  const { user, logout } = useAuth();
  const { isMuted, toggleMute, playClick } = useSound();

  const handleMute = () => {
    playClick();
    toggleMute();
  };

  return (
    <nav style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px 28px',
      background: 'rgba(12, 16, 26, 0.85)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
      position: 'sticky',
      top: 0,
      zIndex: 100
    }}>
      {/* Brand Logo */}
      <div 
        style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
        onClick={() => { playClick(); window.location.hash = ''; }}
      >
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '10px',
          background: 'linear-gradient(135deg, #00f2fe 0%, #8e2de2 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 16px rgba(0, 242, 254, 0.4)',
          flexShrink: 0
        }}>
          <span style={{ fontSize: '1.2rem', fontWeight: '900', color: '#fff', fontFamily: 'var(--font-display)' }}>⚔️</span>
        </div>
        <div>
          <div className="nav-brand-title" style={{
            fontFamily: 'var(--font-display)',
            fontWeight: '900',
            fontSize: '1.35rem',
            letterSpacing: '1px',
            background: 'linear-gradient(90deg, #00f2fe, #fff, #8e2de2)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            whiteSpace: 'nowrap'
          }}>
            LETTER DUEL
          </div>
          <div className="nav-brand-subtitle" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
            1v1 Real-Time Arena
          </div>
        </div>
      </div>

      {/* Nav Actions */}
      <div className="nav-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Sound Toggle */}
        <button 
          className="btn btn-secondary btn-icon" 
          onClick={handleMute}
          title={isMuted ? "Unmute Sound" : "Mute Sound"}
        >
          {isMuted ? <VolumeX size={18} color="#94a3b8" /> : <Volume2 size={18} color="#00f2fe" />}
        </button>

        {/* How to Play */}
        <button 
          className="btn btn-secondary btn-sm"
          onClick={() => { playClick(); onOpenTutorial(); }}
          title="Rules"
        >
          <BookOpen size={16} />
          <span className="nav-btn-text">Rules</span>
        </button>

        {/* Leaderboard */}
        <button 
          className="btn btn-secondary btn-sm"
          onClick={() => { playClick(); onOpenLeaderboard(); }}
          title="Ranks"
        >
          <Trophy size={16} color="#ffb300" />
          <span className="nav-btn-text">Ranks</span>
        </button>

        {/* Friends (if logged in) */}
        {user && (
          <button 
            className="btn btn-secondary btn-sm"
            onClick={() => { playClick(); onOpenFriends(); }}
            title="Friends"
          >
            <Users size={16} color="#00e676" />
            <span className="nav-btn-text">Friends</span>
          </button>
        )}

        {/* User Badge / Auth */}
        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(255, 255, 255, 0.05)',
                padding: '6px 10px',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                border: '1px solid var(--border-subtle)'
              }}
              onClick={() => { playClick(); onOpenProfile(); }}
              title="View Profile"
            >
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #00f2fe, #4facfe)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                color: '#03101d',
                fontSize: '0.85rem',
                flexShrink: 0
              }}>
                {user.username.slice(0, 1).toUpperCase()}
              </div>
              <div className="user-badge-details" style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: '700', fontSize: '0.85rem' }}>{user.username}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--neon-amber)' }}>
                  <Flame size={11} fill="currentColor" /> {user.current_streak} • {user.xp} XP
                </div>
              </div>
            </div>

            <button 
              className="btn btn-secondary btn-icon" 
              onClick={() => { playClick(); logout(); }}
              title="Logout"
            >
              <LogOut size={16} color="#ff2a6d" />
            </button>
          </div>
        ) : (
          <button 
            className="btn btn-primary btn-sm"
            onClick={() => { playClick(); onOpenAuth(); }}
          >
            <User size={16} />
            <span className="nav-btn-text">Login</span>
          </button>
        )}
      </div>
    </nav>
  );
}
