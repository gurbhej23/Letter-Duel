import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useSound } from '../context/SoundContext';
import { useSocket } from '../context/SocketContext';
import { useTheme } from '../context/ThemeContext';
import { Volume2, VolumeX, Trophy, Users, BookOpen, User, LogOut, Flame, Menu, X, AlertTriangle, Loader2, Sun, Moon } from 'lucide-react';
import { getRankMeta } from '../utils/rankUtils';

export default function Navbar({ onOpenAuth, onOpenTutorial, onOpenLeaderboard, onOpenFriends, onOpenProfile, onOpenTournaments }) {
  const { user, logout } = useAuth();
  const { isMuted, toggleMute, playClick } = useSound();
  const { leaveRoom, currentRoomCode, gameState } = useSocket();
  const { theme, toggleTheme, isDark } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const drawerRef = useRef(null);

  const userRank = user?.rank || 'Bronze III';
  const rankMeta = getRankMeta(userRank);

  const isMatchActive = Boolean(
    currentRoomCode && gameState?.state !== 'GAME_OVER'
  );

  const handleMute = () => {
    playClick();
    toggleMute();
  };

  const handleToggleTheme = () => {
    playClick();
    toggleTheme();
  };

  const handleLogoutClick = () => {
    playClick();
    setMobileMenuOpen(false);
    if (isMatchActive) {
      setShowLeaveConfirm(true);
    } else {
      performLogout();
    }
  };

  const handleCancelLeave = () => {
    playClick();
    setShowLeaveConfirm(false);
  };

  const performLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    const wasPlaying = Boolean(currentRoomCode);
    try {
      if (currentRoomCode) {
        await leaveRoom(true); // Forfeit/leave match cleanly on server
      }
    } catch (err) {
      console.warn("Error leaving room on logout:", err);
    } finally {
      sessionStorage.removeItem('letter_duel_room_code');
      localStorage.removeItem('letter_duel_room_code');
      sessionStorage.removeItem('letter_duel_view');
      sessionStorage.removeItem('letter_duel_tournament_open');
      setShowLeaveConfirm(false);
      setIsLoggingOut(false);
      logout();

      // If user signed out while playing a match, redirect to main page then pop open Login modal
      if (wasPlaying && onOpenAuth) {
        setTimeout(() => {
          onOpenAuth();
        }, 280);
      }
    }
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
      background: 'var(--nav-bg)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      borderBottom: '1px solid var(--border-subtle)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      width: '100%',
      transition: 'background 0.25s ease, border-color 0.25s ease'
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
          <div className="nav-brand-title">
            LETTER DUEL
          </div>
          <div className="nav-brand-subtitle">
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
          {isMuted ? <VolumeX size={18} color="#94a3b8" /> : <Volume2 size={18} color="var(--neon-cyan)" />}
        </button>

        {/* Theme Toggle */}
        <button 
          className="btn btn-secondary btn-icon" 
          onClick={handleToggleTheme}
          title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          aria-label="Theme Toggle"
        >
          {isDark ? <Sun size={18} color="#ffb300" /> : <Moon size={18} color="#7c3aed" />}
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
            {/* Coins Balance Chip */}
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'linear-gradient(135deg, rgba(255, 179, 0, 0.18), rgba(255, 179, 0, 0.06))',
                border: '1px solid rgba(255, 179, 0, 0.4)',
                padding: '6px 12px',
                borderRadius: '20px',
                fontSize: '0.85rem',
                fontWeight: '800',
                color: '#ffc107',
                boxShadow: '0 0 12px rgba(255, 179, 0, 0.15)',
                cursor: 'pointer',
                transition: 'transform 0.15s ease'
              }}
              onClick={() => handleNavAction(onOpenProfile)}
              title="Coins Balance (Click to claim Daily Bonus)"
            >
              <span style={{ fontSize: '1rem' }}>🪙</span>
              <span>{user.coins ?? 500}</span>
            </div>

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
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: '700', fontSize: '0.85rem' }}>{user.username}</span>
                  <span style={{
                    background: rankMeta.bg,
                    color: rankMeta.color,
                    border: `1px solid ${rankMeta.border}`,
                    fontSize: '0.68rem',
                    padding: '1px 6px',
                    borderRadius: '8px',
                    fontWeight: '800',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px'
                  }}>
                    {rankMeta.badge} {userRank}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', color: 'var(--neon-amber)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                    <Flame size={11} fill="currentColor" /> {user.current_streak || 0}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>•</span>
                  <span style={{ color: 'var(--neon-cyan)', fontWeight: '700' }}>⚔️ {user.wins || 0}W</span>
                </div>
              </div>
            </div>

            <button 
              className="btn btn-secondary btn-icon" 
              onClick={handleLogoutClick}
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
          {isMuted ? <VolumeX size={18} color="#94a3b8" /> : <Volume2 size={18} color="var(--neon-cyan)" />}
        </button>

        {/* Theme Toggle */}
        <button 
          className="btn btn-secondary btn-icon" 
          onClick={handleToggleTheme}
          title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          aria-label="Theme Toggle"
          style={{ width: '42px', height: '42px', minWidth: '42px', minHeight: '42px' }}
        >
          {isDark ? <Sun size={18} color="#ffb300" /> : <Moon size={18} color="#7c3aed" />}
        </button>

        {/* Hamburger Menu Button */}
        <button
          className="btn btn-secondary btn-icon"
          onClick={() => { playClick(); setMobileMenuOpen(!mobileMenuOpen); }}
          title={mobileMenuOpen ? "Close Menu" : "Open Menu"}
          aria-label="Toggle Navigation Menu"
          style={{ width: '42px', height: '42px', minWidth: '42px', minHeight: '42px' }}
        >
          {mobileMenuOpen ? <X size={22} color="var(--neon-cyan)" /> : <Menu size={22} />}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: '800', fontSize: '1rem' }}>{user.username}</span>
                  <span style={{
                    background: rankMeta.bg,
                    color: rankMeta.color,
                    border: `1px solid ${rankMeta.border}`,
                    fontSize: '0.72rem',
                    padding: '2px 8px',
                    borderRadius: '10px',
                    fontWeight: '800',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    {rankMeta.badge} {userRank}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                  <span style={{
                    background: 'rgba(255, 179, 0, 0.15)',
                    border: '1px solid rgba(255, 179, 0, 0.35)',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '0.75rem',
                    fontWeight: '800',
                    color: '#ffc107',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    🪙 {user.coins ?? 100}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--neon-amber)' }}>
                    <Flame size={12} fill="currentColor" /> {user.current_streak || 0} Streak • <span style={{ color: 'var(--neon-cyan)', fontWeight: '700' }}>⚔️ {user.wins || 0} Wins</span>
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Mobile Theme Switcher Item */}
          <button className="mobile-nav-item" onClick={handleToggleTheme}>
            {isDark ? <Sun size={20} color="#ffb300" /> : <Moon size={20} color="#7c3aed" />}
            <span>{isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}</span>
          </button>

          <button className="mobile-nav-item" onClick={() => handleNavAction(onOpenTutorial)}>
            <BookOpen size={20} color="var(--neon-cyan)" />
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
                onClick={handleLogoutClick}
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

      {/* Leave Match Confirmation Modal Popup (Portaled to body with rich animations) */}
      {showLeaveConfirm && typeof document !== 'undefined' && createPortal(
        <div 
          className="leave-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isLoggingOut) {
              handleCancelLeave();
            }
          }}
        >
          <div className="leave-modal-card card-3d-tilt">
            {/* Pulsing Warning Radar Badge */}
            <div className="leave-warning-badge">
              <AlertTriangle size={34} color="#ff2a6d" />
            </div>

            <h3 className="leave-modal-title">
              Are you sure you want to leave this match?
            </h3>
            
            <p className="leave-modal-desc">
              Signing out while playing will <strong style={{ color: 'var(--neon-rose)' }}>forfeit the match</strong> and it will be recorded as a defeat. Your rival will be awarded the victory.
            </p>

            <div className="leave-modal-actions">
              <button
                type="button"
                className="btn btn-secondary btn-3d"
                onClick={handleCancelLeave}
                disabled={isLoggingOut}
                style={{ fontWeight: '700', padding: '12px 16px', minHeight: '46px' }}
              >
                Stay in Match
              </button>
              
              <button
                type="button"
                className="btn btn-3d-danger"
                style={{
                  fontWeight: '800',
                  padding: '12px 16px',
                  minHeight: '46px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
                onClick={performLogout}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? (
                  <>
                    <Loader2 size={18} style={{ animation: 'spin 0.8s linear infinite' }} />
                    <span>Leaving Match...</span>
                  </>
                ) : (
                  <span>Yes, Leave Match</span>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </nav>
  );
}

