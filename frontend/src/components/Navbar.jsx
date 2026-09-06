import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSound } from '../context/SoundContext';
import { useSocket } from '../context/SocketContext';
import { Volume2, VolumeX, Trophy, Users, BookOpen, User, LogOut, Flame, Menu, X } from 'lucide-react';

export default function Navbar({ onOpenAuth, onOpenTutorial, onOpenLeaderboard, onOpenFriends, onOpenProfile }) {
  const { user, logout } = useAuth();
  const { isMuted, toggleMute, playClick } = useSound();
  const { leaveRoom, currentRoomCode } = useSocket();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const drawerRef = useRef(null);

  const handleMute = () => {
    playClick();
    toggleMute();
  };

  const handleLogout = () => {
    playClick();
    setMobileMenuOpen(false);
    if (currentRoomCode) {
      leaveRoom(true); // Forfeit/leave match cleanly
    }
    logout();
  };

  const handleNavAction = (action) => {
    playClick();
    setMobileMenuOpen(false);
    action();
  };

  // Close drawer on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target) && !e.target.closest('.mobile-nav-toggle')) {
        setMobileMenuOpen(false);
      }
    };
    if (mobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [mobileMenuOpen]);

  return (
    <nav style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 'clamp(10px, 2.5vw, 16px) clamp(14px, 3.5vw, 28px)',
      background: 'rgba(12, 16, 26, 0.88)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      width: '100%'
    }}>
      {/* Brand Logo */}
      <div 
        style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', minHeight: '44px' }}
        onClick={() => { playClick(); setMobileMenuOpen(false); window.location.hash = ''; }}
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

      {/* Desktop Navigation Items (Hidden on <= 640px) */}
      <div className="desktop-nav-items">
        {/* Sound Toggle */}
        <button 
          className="btn btn-secondary btn-icon" 
          onClick={handleMute}
          title={isMuted ? "Unmute Sound" : "Mute Sound"}
          aria-label="Sound Toggle"
        >
          {isMuted ? <VolumeX size={18} color="#94a3b8" /> : <Volume2 size={18} color="#00f2fe" />}
        </button>

        {/* How to Play */}
        <button 
          className="btn btn-secondary btn-sm"
          onClick={() => handleNavAction(onOpenTutorial)}
          title="Rules"
        >
          <BookOpen size={16} />
          <span>Rules</span>
        </button>

        {/* Leaderboard */}
        <button 
          className="btn btn-secondary btn-sm"
          onClick={() => handleNavAction(onOpenLeaderboard)}
          title="Ranks"
        >
          <Trophy size={16} color="#ffb300" />
          <span>Ranks</span>
        </button>

        {/* Friends (if logged in) */}
        {user && (
          <button 
            className="btn btn-secondary btn-sm"
            onClick={() => handleNavAction(onOpenFriends)}
            title="Friends"
          >
            <Users size={16} color="#00e676" />
            <span>Friends</span>
          </button>
        )}

        {/* User Profile Pill / Auth */}
        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(255, 255, 255, 0.05)',
                padding: '6px 12px',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                border: '1px solid var(--border-subtle)',
                minHeight: '40px'
              }}
              onClick={() => handleNavAction(onOpenProfile)}
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
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: '700', fontSize: '0.85rem' }}>{user.username}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--neon-amber)' }}>
                  <Flame size={11} fill="currentColor" /> {user.current_streak} • {user.xp} XP
                </div>
              </div>
            </div>

            <button 
              className="btn btn-secondary btn-icon" 
              onClick={handleLogout}
              title="Logout"
              aria-label="Logout"
            >
              <LogOut size={16} color="#ff2a6d" />
            </button>
          </div>
        ) : (
          <button 
            className="btn btn-primary btn-sm btn-3d"
            onClick={() => handleNavAction(onOpenAuth)}
          >
            <User size={16} />
            <span>Login</span>
          </button>
        )}
      </div>

      {/* Mobile Controls (Visible on <= 640px) */}
      <div className="mobile-nav-toggle" style={{ alignItems: 'center', gap: '8px' }}>
        {/* Sound Toggle */}
        <button 
          className="btn btn-secondary btn-icon" 
          onClick={handleMute}
          title={isMuted ? "Unmute Sound" : "Mute Sound"}
          aria-label="Sound Toggle"
          style={{ width: '42px', height: '42px', minWidth: '42px', minHeight: '42px' }}
        >
          {isMuted ? <VolumeX size={18} color="#94a3b8" /> : <Volume2 size={18} color="#00f2fe" />}
        </button>

        {/* Hamburger Menu Button */}
        <button
          className="btn btn-secondary btn-icon"
          onClick={() => { playClick(); setMobileMenuOpen(!mobileMenuOpen); }}
          title={mobileMenuOpen ? "Close Menu" : "Open Menu"}
          aria-label="Toggle Navigation Menu"
          style={{ width: '42px', height: '42px', minWidth: '42px', minHeight: '42px' }}
        >
          {mobileMenuOpen ? <X size={22} color="#00f2fe" /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile Drawer Dropdown */}
      {mobileMenuOpen && (
        <div ref={drawerRef} className="mobile-nav-drawer">
          {user && (
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: 'rgba(255, 255, 255, 0.05)',
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-glow)',
                cursor: 'pointer'
              }}
              onClick={() => handleNavAction(onOpenProfile)}
            >
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #00f2fe, #4facfe)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                color: '#03101d',
                fontSize: '1rem',
                flexShrink: 0
              }}>
                {user.username.slice(0, 1).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '800', fontSize: '1rem' }}>{user.username}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--neon-amber)' }}>
                  <Flame size={13} fill="currentColor" /> {user.current_streak} Win Streak • {user.xp} XP
                </div>
              </div>
            </div>
          )}

          <button className="mobile-nav-item" onClick={() => handleNavAction(onOpenTutorial)}>
            <BookOpen size={20} color="#00f2fe" />
            <span>How to Play & Rules</span>
          </button>

          <button className="mobile-nav-item" onClick={() => handleNavAction(onOpenLeaderboard)}>
            <Trophy size={20} color="#ffb300" />
            <span>Global Duel Rankings</span>
          </button>

          {user && (
            <button className="mobile-nav-item" onClick={() => handleNavAction(onOpenFriends)}>
              <Users size={20} color="#00e676" />
              <span>Friends & Rivals</span>
            </button>
          )}

          {user ? (
            <>
              <button className="mobile-nav-item" onClick={() => handleNavAction(onOpenProfile)}>
                <User size={20} color="#00f2fe" />
                <span>Player Profile & Records</span>
              </button>

              <button 
                className="mobile-nav-item" 
                style={{ color: 'var(--neon-rose)', borderColor: 'rgba(255, 42, 109, 0.25)' }}
                onClick={handleLogout}
              >
                <LogOut size={20} color="#ff2a6d" />
                <span>Sign Out</span>
              </button>
            </>
          ) : (
            <button 
              className="btn btn-primary btn-3d" 
              style={{ width: '100%', minHeight: '48px', fontSize: '1rem' }}
              onClick={() => handleNavAction(onOpenAuth)}
            >
              <User size={18} />
              <span>Sign In / Create Account</span>
            </button>
          )}
        </div>
      )}
    </nav>
  );
}

