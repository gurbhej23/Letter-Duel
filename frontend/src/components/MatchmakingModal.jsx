import React, { useState, useEffect, useRef } from 'react';
import { useSound } from '../context/SoundContext';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { X, Swords, CheckCircle2, Zap, ShieldCheck, Lock, AlertCircle, ArrowLeft } from 'lucide-react';
import { ARENA_TIERS, getTierForFee } from '../utils/arenaTiers';

export default function MatchmakingModal({ isOpen, onClose, onMatched }) {
  const { user, token } = useAuth();
  const sound = useSound();
  const { playClick, playMiss, playVictory } = sound;
  const { gameState, connectToRoom, disconnect, onlineCount } = useSocket();

  const [selectedFee, setSelectedFee] = useState(50);
  const [searching, setSearching] = useState(false);
  const [errorNotice, setErrorNotice] = useState('');
  const [statusText, setStatusText] = useState('Initializing global neural radar...');
  const [matched, setMatched] = useState(false);
  const [matchedOpponent, setMatchedOpponent] = useState(null);
  const [countdown, setCountdown] = useState(3);

  const activeRoomCodeRef = useRef(null);
  const matchedRef = useRef(false);
  const countdownIntervalRef = useRef(null);
  const statusIntervalRef = useRef(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setSearching(false);
      setMatched(false);
      setMatchedOpponent(null);
      setCountdown(3);
      matchedRef.current = false;
      activeRoomCodeRef.current = null;
      setErrorNotice('');
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
        statusIntervalRef.current = null;
      }
      setStatusText('Initializing global neural radar...');
      return;
    }

    matchedRef.current = false;
  }, [isOpen]);

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

  // Start matchmaking for selected tier
  const handleStartSearch = async () => {
    if (!token) return;
    const tier = getTierForFee(selectedFee);
    const userCoins = user?.coins ?? 500;
    const userLevel = user?.level || 1;

    if (userCoins < tier.fee) {
      setErrorNotice(`Insufficient coins (${userCoins} 🪙). Need ${tier.fee} 🪙.`);
      playMiss();
      return;
    }
    if (userLevel < tier.minLevel) {
      setErrorNotice(`Requires Level ${tier.minLevel} to unlock. (Current: Lv. ${userLevel})`);
      playMiss();
      return;
    }

    playClick();
    setErrorNotice('');
    setSearching(true);
    setStatusText(`Scanning pool for ${tier.name} rival (${tier.fee} 🪙)...`);

    const messages = [
      `Scanning global pool for an available duelist in ${tier.name}...`,
      `Searching for rivals with ${tier.fee} coins stake...`,
      `Matching with equal-level online challengers...`,
      `Waiting for an opponent in the ${tier.name}...`
    ];
    let idx = 0;
    statusIntervalRef.current = setInterval(() => {
      idx = (idx + 1) % messages.length;
      setStatusText(messages[idx]);
    }, 3500);

    try {
      const res = await fetch('/api/rooms/quickmatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ entry_fee: tier.fee })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Matchmaking failed');
      }
      const data = await res.json();

      activeRoomCodeRef.current = data.room_code;
      connectToRoom(data.room_code);

      if (data.matched) {
        setTimeout(() => {
          triggerMatchConfirmed(data.room_code, data.opponent);
        }, 1200);
      }
    } catch (err) {
      console.error('Matchmaking error:', err);
      playMiss();
      setErrorNotice(err.message || 'Matchmaking request failed');
      setSearching(false);
    }
  };

  // Detect when second player joins the room via WebSocket in real-time
  useEffect(() => {
    if (isOpen && searching && gameState?.player1 && gameState?.player2 && !matchedRef.current) {
      const opp = gameState.player1.id === user?.id ? gameState.player2 : gameState.player1;
      triggerMatchConfirmed(gameState.room_code, opp);
    }
  }, [isOpen, searching, gameState?.player1, gameState?.player2, user?.id]);

  const handleCancel = async () => {
    playClick();
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);

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
    setSearching(false);
    setMatched(false);
  };

  if (!isOpen) return null;

  const oppName = matchedOpponent?.username || 'Challenger';
  const myName = user?.username || 'Player 1';
  const currentTier = getTierForFee(selectedFee);
  const userCoins = user?.coins ?? 500;
  const userLevel = user?.level || 1;

  return (
    <div className="modal-overlay" style={{ backdropFilter: 'blur(16px)', zIndex: 1100 }} onClick={searching || matched ? undefined : onClose}>
      <div 
        className="modal-content card-3d-tilt" 
        style={{ 
          maxWidth: searching || matched ? '520px' : '560px', 
          textAlign: 'center',
          padding: 'clamp(20px, 4vw, 32px) clamp(16px, 3.5vw, 24px)',
          border: '1px solid var(--border-glow)',
          boxShadow: '0 0 50px rgba(0, 242, 254, 0.3)',
          position: 'relative',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ======================================================== */}
        {/* 1. ARENA TIER SELECTION SCREEN (Choose Stake & Unlock by Level) */}
        {/* ======================================================== */}
        {!searching && !matched ? (
          <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Swords size={22} color="var(--neon-cyan)" />
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', margin: 0 }}>
                  CHOOSE DUEL ARENA
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

            {/* User status info pill */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 14px',
              marginBottom: '16px',
              fontSize: '0.85rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  background: 'linear-gradient(135deg, #8e2de2, #4a00e0)',
                  color: '#fff',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontWeight: '800',
                  fontSize: '0.75rem'
                }}>
                  Lv. {userLevel}
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>{user?.username}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '800', color: '#ffc107' }}>
                <span>🪙</span>
                <span>{userCoins} Coins Balance</span>
              </div>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', marginBottom: '16px', textAlign: 'left' }}>
              Select your match stake tier. Higher stake arenas unlock as you level up!
            </p>

            {/* Error notice */}
            {errorNotice && (
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
                <span>{errorNotice}</span>
              </div>
            )}

            {/* Tiers List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px', maxHeight: '320px', overflowY: 'auto', paddingRight: '4px' }}>
              {ARENA_TIERS.map((tier) => {
                const isLocked = userLevel < tier.minLevel;
                const isAffordable = userCoins >= tier.fee;
                const isSelected = selectedFee === tier.fee;

                return (
                  <div
                    key={tier.fee}
                    onClick={() => {
                      if (isLocked) {
                        playMiss();
                        setErrorNotice(`Requires Level ${tier.minLevel} to unlock. Win duels to level up!`);
                      } else if (!isAffordable) {
                        playMiss();
                        setErrorNotice(`Insufficient coins. You have ${userCoins} 🪙, need ${tier.fee} 🪙.`);
                      } else {
                        playClick();
                        setSelectedFee(tier.fee);
                        setErrorNotice('');
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      borderRadius: 'var(--radius-md)',
                      background: isSelected ? tier.bg : 'rgba(255, 255, 255, 0.03)',
                      border: isSelected ? `2px solid ${tier.color}` : '1px solid rgba(255, 255, 255, 0.08)',
                      boxShadow: isSelected ? `0 0 16px ${tier.color}40` : 'none',
                      cursor: (isLocked || !isAffordable) ? 'not-allowed' : 'pointer',
                      opacity: isLocked ? 0.55 : (!isAffordable ? 0.7 : 1),
                      transition: 'all 0.2s ease',
                      position: 'relative'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left' }}>
                      <span style={{ fontSize: '1.6rem' }}>{tier.icon}</span>
                      <div>
                        <div style={{ fontWeight: '800', fontSize: '0.98rem', color: isSelected ? '#fff' : 'var(--text-primary)' }}>
                          {tier.name}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                          <span style={{ color: '#ffc107', fontWeight: '700' }}>🪙 {tier.fee} Stake</span>
                          <span>•</span>
                          <span style={{ color: '#00e676', fontWeight: '700' }}>🏆 {tier.pot} Pot</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
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
                          <Lock size={12} /> Lv. {tier.minLevel}
                        </span>
                      ) : !isAffordable ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: 'rgba(255, 179, 0, 0.15)',
                          border: '1px solid rgba(255, 179, 0, 0.4)',
                          color: '#ffb300',
                          fontSize: '0.75rem',
                          fontWeight: '800',
                          padding: '3px 8px',
                          borderRadius: '10px'
                        }}>
                          Low Coins
                        </span>
                      ) : isSelected ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
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
                        <span style={{
                          fontSize: '0.75rem',
                          color: 'var(--text-muted)',
                          padding: '3px 8px'
                        }}>
                          Tap to Select
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Action button to launch queue */}
            <button
              className="btn btn-primary glow-cyan btn-3d"
              style={{
                width: '100%',
                padding: '14px',
                fontSize: '1.05rem',
                fontWeight: '800',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
              onClick={handleStartSearch}
              disabled={userLevel < currentTier.minLevel || userCoins < currentTier.fee}
            >
              <Zap size={18} />
              <span>Enter {currentTier.name} (Find Rival)</span>
            </button>
          </div>
        ) : !matched ? (
          /* ======================================================== */
          /* 2. RADAR SCANNING STATE (Matches Sci-Fi Sonar Reference) */
          /* ======================================================== */
          <>
            {/* Arena Tier & Live Online Count Indicator */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: currentTier.bg,
                border: `1px solid ${currentTier.border}`,
                padding: '4px 12px',
                borderRadius: '16px',
                fontSize: '0.8rem',
                fontWeight: '800',
                color: currentTier.color
              }}>
                <span>{currentTier.icon}</span>
                <span>{currentTier.name} • 🪙 {currentTier.fee} Stake</span>
              </div>

              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(0, 230, 118, 0.08)',
                border: '1px solid rgba(0, 230, 118, 0.28)',
                padding: '4px 12px',
                borderRadius: '16px',
                fontSize: '0.8rem',
                fontWeight: '800',
                color: '#00e676'
              }}>
                <span style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: '#00e676',
                  boxShadow: '0 0 6px #00e676'
                }} />
                <span>ONLINE: {onlineCount}</span>
              </div>
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
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginBottom: '24px' }}>
              {statusText}
            </p>

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

            {/* Match Stake / Prize Pot Callout */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: 'linear-gradient(135deg, rgba(255, 179, 0, 0.2), rgba(255, 179, 0, 0.05))',
              border: '1px solid rgba(255, 179, 0, 0.4)',
              borderRadius: '20px',
              padding: '6px 16px',
              color: '#ffc107',
              fontWeight: '800',
              fontSize: '0.9rem',
              margin: '0 auto 12px auto'
            }}>
              <span>🪙</span>
              <span>Match Prize Pot: {currentTier.pot} Coins (Winner takes all!)</span>
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
