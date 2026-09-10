import React, { useState, useEffect } from 'react';
import { Swords, RefreshCw, LogOut, Clock, ShieldCheck, Bot } from 'lucide-react';
import { useSound } from '../context/SoundContext';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';

export default function ActiveMatchModal({ activeMatch, onRejoin, onLeave }) {
  const isOpen = Boolean(activeMatch && activeMatch.active);
  useBodyScrollLock(isOpen);
  const sound = useSound();
  const [secondsRemaining, setSecondsRemaining] = useState(activeMatch?.remaining_seconds || 60);
  const [isExpired, setIsExpired] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!activeMatch?.remaining_seconds) return;
    setSecondsRemaining(activeMatch.remaining_seconds);
    setIsExpired(false);

    const interval = setInterval(() => {
      setSecondsRemaining(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setIsExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [activeMatch?.remaining_seconds]);

  if (!activeMatch || !activeMatch.active) return null;

  const handleRejoin = async () => {
    if (isProcessing || isExpired) return;
    setIsProcessing(true);
    sound.playClick();
    try {
      await onRejoin(activeMatch.room_code);
    } catch {
      setIsProcessing(false);
    }
  };

  const handleLeave = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    sound.playClick();
    try {
      await onLeave(activeMatch.room_code);
    } catch {
      setIsProcessing(false);
    }
  };

  const oppName = activeMatch.opponent?.username || (activeMatch.is_bot ? 'BOT' : 'Opponent');
  const isBot = Boolean(activeMatch.is_bot);
  const entryFee = activeMatch.entry_fee || 10;

  return (
    <div 
      className="modal-overlay" 
      style={{ 
        backdropFilter: 'blur(20px)', 
        WebkitBackdropFilter: 'blur(20px)', 
        zIndex: 1200, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        padding: '16px'
      }}
    >
      <div 
        className="modal-content" 
        style={{ 
          maxWidth: '480px', 
          width: '100%',
          textAlign: 'center',
          padding: 'clamp(24px, 5vw, 36px) clamp(20px, 4vw, 28px)',
          border: '1.5px solid var(--border-glow)',
          boxShadow: '0 0 60px rgba(0, 242, 254, 0.35)',
          position: 'relative',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--modal-bg)'
        }}
      >
        {/* Animated Sword Icon */}
        <div style={{
          width: '64px',
          height: '64px',
          margin: '0 auto 16px',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.2), rgba(142, 45, 226, 0.2))',
          border: '1.5px solid var(--neon-cyan)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 24px rgba(0, 242, 254, 0.3)'
        }}>
          <Swords size={32} color="var(--neon-cyan)" />
        </div>

        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.45rem',
          fontWeight: '900',
          letterSpacing: '0.04em',
          margin: '0 0 8px',
          background: 'linear-gradient(135deg, #00f2fe 0%, #a855f7 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>
          YOU HAVE AN ACTIVE DUEL
        </h2>

        <p style={{
          color: 'var(--text-secondary)',
          fontSize: '0.92rem',
          margin: '0 0 20px',
          lineHeight: 1.45
        }}>
          {isExpired 
            ? 'Your previous match reconnect grace period has expired.'
            : 'Your match is still alive on the server waiting for your return.'}
        </p>

        {/* Opponent & Match Summary Card */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '16px',
          marginBottom: '22px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              background: isBot 
                ? 'linear-gradient(135deg, #8e2de2, #4a00e0)'
                : 'linear-gradient(135deg, #00f2fe, #4facfe)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '900',
              color: '#fff',
              fontSize: '1.1rem',
              flexShrink: 0
            }}>
              {isBot ? '🤖' : oppName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: '800', fontSize: '1rem', color: 'var(--text-primary)' }}>
                {oppName}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>Stake: {entryFee} 🪙</span>
                <span>•</span>
                <span>Room: {activeMatch.room_code}</span>
              </div>
            </div>
          </div>

          {/* Grace Countdown */}
          {!isExpired ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: '2px'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                color: secondsRemaining <= 15 ? '#ff2a6d' : 'var(--neon-cyan)',
                fontFamily: 'var(--font-mono)',
                fontWeight: '900',
                fontSize: '1.1rem'
              }}>
                <Clock size={16} />
                <span>{secondsRemaining}s</span>
              </div>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Grace Time</span>
            </div>
          ) : (
            <span style={{ color: '#ff2a6d', fontWeight: '800', fontSize: '0.85rem' }}>Ended</span>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {!isExpired && (
            <button
              className="btn btn-primary btn-3d"
              onClick={handleRejoin}
              disabled={isProcessing}
              style={{
                width: '100%',
                padding: '14px 20px',
                fontSize: '1rem',
                fontWeight: '800',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <RefreshCw size={18} className={isProcessing ? "spin" : ""} />
              <span>{isProcessing ? "Reconnecting..." : "RE-ENTER MATCH"}</span>
            </button>
          )}

          <button
            className="btn btn-secondary"
            onClick={handleLeave}
            disabled={isProcessing}
            style={{
              width: '100%',
              padding: '12px 18px',
              fontSize: '0.9rem',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              color: isExpired ? 'var(--text-primary)' : '#ff2a6d'
            }}
          >
            <LogOut size={16} />
            <span>{isExpired ? "RETURN TO LOBBY" : "LEAVE MATCH (FORFEIT)"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
