import React, { useState, useEffect, useRef } from 'react';
import { useSound } from '../context/SoundContext';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { X, Swords, CheckCircle2 } from 'lucide-react';

export default function MatchmakingModal({ isOpen, onClose, onMatched }) {
  const { token } = useAuth();
  const sound = useSound();
  const { playClick, playMiss } = sound;
  const { gameState, connectToRoom, disconnect } = useSocket();

  const [seconds, setSeconds] = useState(0);
  const [statusText, setStatusText] = useState('Scanning online duelists...');
  const [matched, setMatched] = useState(false);
  const activeRoomCodeRef = useRef(null);
  const matchFoundTriggeredRef = useRef(false);

  // Search timer
  useEffect(() => {
    if (!isOpen) {
      setSeconds(0);
      setMatched(false);
      matchFoundTriggeredRef.current = false;
      activeRoomCodeRef.current = null;
      setStatusText('Scanning online duelists...');
      return;
    }

    const interval = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen]);

  // Dynamic status text updates across 5-10s search window
  useEffect(() => {
    if (!isOpen || matched) return;
    if (seconds === 2) setStatusText('Searching global 1v1 matchmaking pool...');
    if (seconds === 4) setStatusText('Checking available online rivals...');
    if (seconds === 6) setStatusText('Locking onto matched opponent...');
  }, [seconds, isOpen, matched]);

  const handleMatchFound = (code) => {
    if (matchFoundTriggeredRef.current) return;
    matchFoundTriggeredRef.current = true;
    setMatched(true);
    setStatusText('Opponent Found! Initializing duel arena...');
    sound.playVictory();
    setTimeout(() => {
      onMatched(code);
      onClose();
    }, 1200);
  };

  // Start matchmaking request when modal opens
  useEffect(() => {
    if (!isOpen || !token) return;

    let isMounted = true;
    const startTime = Date.now();

    const startMatchmaking = async () => {
      try {
        const res = await fetch('/api/rooms/quickmatch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          }
        });
        if (!res.ok) throw new Error('Matchmaking failed');
        const data = await res.json();

        if (isMounted) {
          activeRoomCodeRef.current = data.room_code;
          connectToRoom(data.room_code);

          if (data.matched) {
            // Real player already matched: hold search animation for realistic 5-6s total
            const elapsedMs = Date.now() - startTime;
            const remainingDelay = Math.max(0, 6000 - elapsedMs);
            setTimeout(() => {
              if (isMounted) handleMatchFound(data.room_code);
            }, remainingDelay);
          }
        }
      } catch (err) {
        console.error('Matchmaking error:', err);
        playMiss();
        if (isMounted) onClose();
      }
    };

    startMatchmaking();

    return () => {
      isMounted = false;
    };
  }, [isOpen, token]);

  // Detect when second player joins the room via WebSocket
  useEffect(() => {
    if (isOpen && gameState?.player1 && gameState?.player2 && !matched && !matchFoundTriggeredRef.current) {
      matchFoundTriggeredRef.current = true;
      const delay = seconds < 5 ? (5 - seconds) * 1000 : 500;
      const timer = setTimeout(() => {
        handleMatchFound(gameState.room_code);
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [isOpen, gameState?.player1, gameState?.player2, matched]);

  // If no human joined after 7 seconds, match with an online challenger
  useEffect(() => {
    if (!isOpen || matched || matchFoundTriggeredRef.current || !token) return;

    if (seconds >= 7 && activeRoomCodeRef.current) {
      matchFoundTriggeredRef.current = true;
      const triggerAutoOpponent = async () => {
        try {
          const res = await fetch('/api/rooms/quickmatch/auto-opponent', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            }
          });
          if (res.ok) {
            const data = await res.json();
            if (data.matched) {
              handleMatchFound(data.room_code);
            }
          }
        } catch (e) {
          console.error("Auto opponent error:", e);
        }
      };

      triggerAutoOpponent();
    }
  }, [seconds, isOpen, matched, token]);

  const handleCancel = async () => {
    playClick();
    matchFoundTriggeredRef.current = true;
    try {
      if (token) {
        await fetch('/api/rooms/quickmatch/cancel', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
      }
    } catch {
      // ignore
    }
    disconnect();
    onClose();
  };

  if (!isOpen) return null;

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="modal-overlay" style={{ backdropFilter: 'blur(16px)' }}>
      <div 
        className="modal-content" 
        style={{ 
          maxWidth: '460px', 
          textAlign: 'center',
          padding: 'clamp(24px, 5vw, 36px) clamp(16px, 4vw, 28px)',
          border: '1px solid var(--border-glow)',
          boxShadow: '0 0 40px rgba(0, 242, 254, 0.25)',
          position: 'relative'
        }}
      >
        {/* Radar Scanner Visual */}
        <div style={{
          position: 'relative',
          width: 'clamp(140px, 40vw, 180px)',
          height: 'clamp(140px, 40vw, 180px)',
          margin: '0 auto 24px auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {/* Outer ring */}
          <div style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: '2px solid rgba(0, 242, 254, 0.25)',
            boxShadow: '0 0 20px rgba(0, 242, 254, 0.15)'
          }} />

          {/* Middle ring */}
          <div style={{
            position: 'absolute',
            inset: '24px',
            borderRadius: '50%',
            border: '1px dashed rgba(0, 242, 254, 0.4)'
          }} />

          {/* Inner ring */}
          <div style={{
            position: 'absolute',
            inset: '48px',
            borderRadius: '50%',
            border: '1px solid rgba(142, 45, 226, 0.4)'
          }} />

          {/* Rotating radar line */}
          {!matched && (
            <div style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background: 'conic-gradient(from 0deg, transparent 70%, rgba(0, 242, 254, 0.4) 100%)',
              animation: 'spin 2.5s linear infinite'
            }} />
          )}

          {/* Center Icon */}
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: matched ? 'linear-gradient(135deg, #00e676, #00b0ff)' : 'linear-gradient(135deg, #00f2fe, #8e2de2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: matched ? '0 0 24px rgba(0, 230, 118, 0.6)' : '0 0 24px rgba(0, 242, 254, 0.5)',
            zIndex: 2,
            transition: 'all 0.4s ease'
          }}>
            {matched ? (
              <CheckCircle2 size={32} color="#03101d" />
            ) : (
              <Swords size={28} color="#03101d" />
            )}
          </div>
        </div>

        {/* Title */}
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.5rem',
          fontWeight: '800',
          marginBottom: '8px',
          color: matched ? '#00e676' : '#fff'
        }}>
          {matched ? 'Opponent Found!' : 'Searching for Online Rival'}
        </h2>

        {/* Status text */}
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginBottom: '20px' }}>
          {statusText}
        </p>

        {/* Search Duration */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(0, 0, 0, 0.35)',
          padding: '6px 18px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          marginBottom: '26px'
        }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Elapsed:
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: '800', color: 'var(--neon-cyan)' }}>
            {formatTime(seconds)}
          </span>
        </div>

        {/* Cancel Button */}
        <div>
          <button
            className="btn btn-secondary"
            onClick={handleCancel}
            disabled={matched}
            style={{
              padding: '12px 32px',
              fontSize: '0.95rem',
              fontWeight: '700',
              opacity: matched ? 0.4 : 1
            }}
          >
            <X size={16} /> Cancel Search
          </button>
        </div>
      </div>
    </div>
  );
}
