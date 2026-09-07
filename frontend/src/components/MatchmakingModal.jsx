import React, { useState, useEffect, useRef } from 'react';
import { useSound } from '../context/SoundContext';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { X, Swords, CheckCircle2, Zap, ShieldCheck } from 'lucide-react';

export default function MatchmakingModal({ isOpen, onClose, onMatched }) {
  const { user, token } = useAuth();
  const sound = useSound();
  const { playClick, playMiss, playVictory } = sound;
  const { gameState, connectToRoom, disconnect, onlineCount } = useSocket();

  const [seconds, setSeconds] = useState(0);
  const [statusText, setStatusText] = useState('Initializing global neural radar...');
  const [matched, setMatched] = useState(false);
  const [matchedOpponent, setMatchedOpponent] = useState(null);
  const [countdown, setCountdown] = useState(3);

  const activeRoomCodeRef = useRef(null);
  const matchedRef = useRef(false);
  const countdownIntervalRef = useRef(null);

  // Reset all state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setSeconds(0);
      setMatched(false);
      setMatchedOpponent(null);
      setCountdown(3);
      matchedRef.current = false;
      activeRoomCodeRef.current = null;
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      setStatusText('Initializing global neural radar...');
      return;
    }

    matchedRef.current = false;
    const interval = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);

    return () => {
      clearInterval(interval);
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [isOpen]);

  // Dynamic status text updates across search window
  useEffect(() => {
    if (!isOpen || matched) return;
    if (seconds === 1) setStatusText('Scanning global pool for an available duelist...');
    if (seconds === 5) setStatusText('Searching for an online opponent...');
    if (seconds === 12) setStatusText('Checking available rivals across servers...');
    if (seconds >= 20) setStatusText('Waiting for an online player to queue...');
  }, [seconds, isOpen, matched]);

  // Handle successful match confirmation & countdown
  const triggerMatchConfirmed = (roomCode, opponentData = null) => {
    if (matchedRef.current) return;
    matchedRef.current = true;
    setMatched(true);
    setStatusText('Rival Located! Deploying into Arena...');

    if (opponentData) {
      setMatchedOpponent(opponentData);
    } else if (gameState?.player1 && gameState?.player2) {
      const opp = gameState.player1.id === user?.id ? gameState.player2 : gameState.player1;
      setMatchedOpponent(opp);
    }

    try {
      playVictory();
    } catch {
      // ignore
    }

    // 3-second visual countdown into match
    let remaining = 3;
    setCountdown(3);
    countdownIntervalRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        setCountdown(remaining);
      } else {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
        onMatched(roomCode);
        onClose();
      }
    }, 800);
  };

  // Start matchmaking request when modal opens
  useEffect(() => {
    if (!isOpen || !token) return;

    let isMounted = true;

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
            // Found real player immediately!
            setTimeout(() => {
              if (isMounted) {
                triggerMatchConfirmed(data.room_code, data.opponent);
              }
            }, 1200);
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

  // Detect when second player joins the room via WebSocket in real-time
  useEffect(() => {
    if (isOpen && gameState?.player1 && gameState?.player2 && !matchedRef.current) {
      const opp = gameState.player1.id === user?.id ? gameState.player2 : gameState.player1;
      triggerMatchConfirmed(gameState.room_code, opp);
    }
  }, [isOpen, gameState?.player1, gameState?.player2, user?.id]);

  const handleCancel = async () => {
    playClick();
    matchedRef.current = true;
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
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

  const oppName = matchedOpponent?.username || 'Challenger';
  const myName = user?.username || 'Player 1';

  return (
    <div className="modal-overlay" style={{ backdropFilter: 'blur(16px)', zIndex: 1100 }}>
      <div 
        className="modal-content card-3d-tilt" 
        style={{ 
          maxWidth: '520px', 
          textAlign: 'center',
          padding: 'clamp(24px, 5vw, 36px) clamp(16px, 4vw, 28px)',
          border: '1px solid var(--border-glow)',
          boxShadow: '0 0 50px rgba(0, 242, 254, 0.3)',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {!matched ? (
          /* ======================================================== */
          /* 1. RADAR SCANNING STATE (Matches Sci-Fi Sonar Reference) */
          /* ======================================================== */
          <>
            {/* Live Real-Time Online Count Indicator */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(0, 230, 118, 0.08)',
              border: '1px solid rgba(0, 230, 118, 0.28)',
              padding: '5px 14px',
              borderRadius: '20px',
              fontSize: '0.8rem',
              fontWeight: '800',
              color: '#00e676',
              marginBottom: '16px',
              boxShadow: '0 0 12px rgba(0, 230, 118, 0.15)'
            }}>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#00e676',
                boxShadow: '0 0 8px #00e676'
              }} />
              <span>ONLINE: {onlineCount}</span>
            </div>

            <div style={{
              perspective: '800px',
              margin: '0 auto 20px auto',
              width: 'fit-content',
              display: 'flex',
              justifyContent: 'center'
            }}>
              <div style={{
                position: 'relative',
                width: 'clamp(160px, 45vw, 200px)',
                height: 'clamp(160px, 45vw, 200px)',
                transformStyle: 'preserve-3d',
                transform: 'rotateX(8deg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {/* Ambient Background Glow */}
                <div style={{
                  position: 'absolute',
                  inset: '-10px',
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(0, 242, 254, 0.18) 0%, transparent 70%)',
                  filter: 'blur(14px)',
                  pointerEvents: 'none'
                }} />

                {/* Expanding Sonar Echo Waves */}
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  border: '2px solid rgba(0, 242, 254, 0.7)',
                  animation: 'radarSonarPing 2.4s cubic-bezier(0.1, 0.8, 0.3, 1) infinite',
                  pointerEvents: 'none'
                }} />
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  border: '2px solid rgba(0, 242, 254, 0.7)',
                  animation: 'radarSonarPing 2.4s cubic-bezier(0.1, 0.8, 0.3, 1) infinite',
                  animationDelay: '1.2s',
                  pointerEvents: 'none'
                }} />

                {/* Outer Ring */}
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  border: '2px solid rgba(0, 242, 254, 0.5)',
                  boxShadow: '0 0 25px rgba(0, 242, 254, 0.3), inset 0 0 15px rgba(0, 242, 254, 0.15)'
                }} />

                {/* Middle Dashed Ring */}
                <div style={{
                  position: 'absolute',
                  inset: '22px',
                  borderRadius: '50%',
                  border: '1.5px dashed rgba(0, 242, 254, 0.45)'
                }} />

                {/* Inner Purple Ring */}
                <div style={{
                  position: 'absolute',
                  inset: '44px',
                  borderRadius: '50%',
                  border: '1.5px solid rgba(142, 45, 226, 0.55)'
                }} />

                {/* Coordinate Crosshairs */}
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: '1px', background: 'rgba(0, 242, 254, 0.15)' }} />
                <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: '1px', background: 'rgba(0, 242, 254, 0.15)' }} />

                {/* Detected Rival Blip Indicators */}
                <div style={{
                  position: 'absolute',
                  top: '24%',
                  left: '68%',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#00f2fe',
                  boxShadow: '0 0 10px #00f2fe',
                  animation: 'radarBlipPing 2s ease-in-out infinite'
                }} />
                <div style={{
                  position: 'absolute',
                  bottom: '28%',
                  left: '26%',
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: '#ff2a6d',
                  boxShadow: '0 0 10px #ff2a6d',
                  animation: 'radarBlipPing 2.5s ease-in-out infinite',
                  animationDelay: '1s'
                }} />

                {/* Rotating Conic Radar Sweep Wedge */}
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  background: 'conic-gradient(from 0deg, rgba(0, 242, 254, 0.38) 0deg, rgba(0, 230, 118, 0.2) 30deg, transparent 65deg, transparent 360deg)',
                  animation: 'radarSweep 2.2s linear infinite',
                  zIndex: 2,
                  pointerEvents: 'none'
                }}>
                  {/* Crisp Glowing Leading Scanning Beam */}
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: '50%',
                    width: '2px',
                    height: '50%',
                    background: 'linear-gradient(to top, rgba(0, 242, 254, 0.2), #00f2fe)',
                    boxShadow: '0 0 10px #00f2fe, 0 0 20px rgba(0, 242, 254, 0.9)'
                  }} />
                </div>

                {/* 3D Elevated Center Icon Hub */}
                <div style={{
                  width: '68px',
                  height: '68px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #00f2fe 0%, #8e2de2 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 3,
                  animation: 'radarCenterPulse 2.8s ease-in-out infinite',
                  border: '2px solid rgba(255, 255, 255, 0.35)',
                  boxShadow: '0 0 25px rgba(0, 242, 254, 0.5)'
                }}>
                  <Swords size={30} color="#03101d" strokeWidth={2.4} />
                </div>
              </div>
            </div>

            {/* Title */}
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(1.3rem, 4vw, 1.6rem)',
              fontWeight: '900',
              marginBottom: '6px',
              letterSpacing: '0.5px'
            }}>
              Searching for Online Rival
            </h2>

            {/* Status text */}
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginBottom: '16px' }}>
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
              marginBottom: '22px'
            }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Search Time:
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: '800', color: 'var(--neon-cyan)' }}>
                {formatTime(seconds)}
              </span>
            </div>

            {/* Cancel Button */}
            <div>
              <button
                className="btn btn-secondary btn-3d"
                onClick={handleCancel}
                style={{
                  padding: '12px 32px',
                  fontSize: '0.95rem',
                  fontWeight: '700'
                }}
              >
                <X size={16} /> Cancel Search
              </button>
            </div>
          </>
        ) : (
          /* ======================================================== */
          /* 2. MATCH FOUND / VS SHOWCASE (Real-World AAA Experience) */
          /* ======================================================== */
          <div style={{ animation: 'fadeScaleIn 0.4s ease-out' }}>
            <div className="badge badge-emerald" style={{ marginBottom: '14px', fontSize: '0.82rem', padding: '6px 16px' }}>
              <CheckCircle2 size={15} /> 1v1 DUEL MATCHED
            </div>

            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(1.5rem, 5vw, 1.9rem)',
              fontWeight: '900',
              letterSpacing: '1px',
              marginBottom: '20px',
              background: 'linear-gradient(90deg, #00e676, #00f2fe, #ffb300)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              RIVAL LOCATED!
            </h2>

            {/* 3D Head-to-Head VS Arena Card */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto 1fr',
              alignItems: 'center',
              gap: '12px',
              background: 'rgba(0, 0, 0, 0.45)',
              border: '2px solid rgba(0, 242, 254, 0.3)',
              borderRadius: 'var(--radius-lg)',
              padding: '20px 14px',
              marginBottom: '24px',
              boxShadow: '0 0 30px rgba(0, 242, 254, 0.2)'
            }}>
              {/* Player 1 (You) */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #00f2fe, #4facfe)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.4rem',
                  fontWeight: '900',
                  color: '#03101d',
                  boxShadow: '0 0 16px rgba(0, 242, 254, 0.5)'
                }}>
                  {myName.slice(0, 1).toUpperCase()}
                </div>
                <div style={{ fontWeight: '800', fontSize: '0.95rem', color: '#fff', wordBreak: 'break-word' }}>
                  {myName}
                </div>
                <span className="badge badge-cyan" style={{ fontSize: '0.7rem' }}>
                  YOU
                </span>
              </div>

              {/* Center VS Badge */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <div style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #ff2a6d, #ffb300)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 20px rgba(255, 42, 109, 0.5)',
                  animation: 'radarCenterPulse 1.5s ease-in-out infinite'
                }}>
                  <Swords size={22} color="#03101d" strokeWidth={2.5} />
                </div>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: '900', fontSize: '1rem', color: '#ffb300', letterSpacing: '1px' }}>
                  VS
                </span>
              </div>

              {/* Player 2 (Opponent) */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #8e2de2, #ff2a6d)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.4rem',
                  fontWeight: '900',
                  color: '#fff',
                  boxShadow: '0 0 16px rgba(255, 42, 109, 0.5)'
                }}>
                  {oppName.slice(0, 1).toUpperCase()}
                </div>
                <div style={{ fontWeight: '800', fontSize: '0.95rem', color: '#fff', wordBreak: 'break-word' }}>
                  {oppName}
                </div>
                <span className="badge badge-emerald" style={{ fontSize: '0.7rem' }}>
                  ONLINE
                </span>
              </div>
            </div>

            {/* Countdown Bar */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px'
            }}>
              <div style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--neon-cyan)' }}>
                Deploying into Duel Arena in <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', color: '#ffb300' }}>{countdown}</span>...
              </div>

              <div style={{
                width: '100%',
                height: '6px',
                background: 'rgba(255, 255, 255, 0.08)',
                borderRadius: '3px',
                overflow: 'hidden'
              }}>
                <div style={{
                  height: '100%',
                  width: `${((4 - countdown) / 3) * 100}%`,
                  background: 'linear-gradient(90deg, #00f2fe, #00e676)',
                  transition: 'width 0.8s linear'
                }} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
