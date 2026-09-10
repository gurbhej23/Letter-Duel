import React, { useState, useEffect, useRef } from 'react';
import { useSound } from '../context/SoundContext';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';
import { X, Swords, CheckCircle2, Zap, ShieldCheck, Lock, AlertCircle, ArrowLeft, Trophy, Star, Bot, RefreshCw } from 'lucide-react';
import { ARENA_TIERS, getTierForFee, getRecommendedArena } from '../utils/arenaTiers';
import { isRankEligible, getRankMeta } from '../utils/rankUtils';

export default function MatchmakingModal({ isOpen, onClose, onMatched }) {
  useBodyScrollLock(isOpen);
  const { user, token } = useAuth();
  const sound = useSound();
  const { playClick, playMiss, playVictory } = sound;
  const { gameState, connectToRoom, disconnect, onlineCount } = useSocket();

  const [selectedFee, setSelectedFee] = useState(10);
  const [searching, setSearching] = useState(false);
  const [isRequestInFlight, setIsRequestInFlight] = useState(false);
  const [errorNotice, setErrorNotice] = useState('');
  const [statusText, setStatusText] = useState('Finding a worthy rival...');
  const [matched, setMatched] = useState(false);
  const [matchedOpponent, setMatchedOpponent] = useState(null);
  const [countdown, setCountdown] = useState(3);
  const [botOfferAvailable, setBotOfferAvailable] = useState(false);
  const [selectedBotDifficulty, setSelectedBotDifficulty] = useState('normal');

  const activeRoomCodeRef = useRef(null);
  const matchedRef = useRef(false);
  const countdownIntervalRef = useRef(null);
  const statusIntervalRef = useRef(null);
  const botTimeoutRef = useRef(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setSearching(false);
      setIsRequestInFlight(false);
      setMatched(false);
      setMatchedOpponent(null);
      setCountdown(3);
      setBotOfferAvailable(false);
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
      if (botTimeoutRef.current) {
        clearTimeout(botTimeoutRef.current);
        botTimeoutRef.current = null;
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

  // Launch Duel against authoritative Server Bot
  const handlePlayWithBot = async (diff) => {
    if (!token || isRequestInFlight) return;
    setIsRequestInFlight(true);
    setErrorNotice('');
    const difficultyToUse = diff || selectedBotDifficulty;

    try {
      playClick();
      // If currently searching, stop the interval
      if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
      if (botTimeoutRef.current) clearTimeout(botTimeoutRef.current);

      setSearching(true);
      setStatusText(`Summoning Bot AI (${difficultyToUse.toUpperCase()})...`);

      const res = await fetch('/api/rooms/bot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          entry_fee: selectedFee,
          difficulty: difficultyToUse
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Could not start bot duel');
      }

      const data = await res.json();
      activeRoomCodeRef.current = data.room_code;
      connectToRoom(data.room_code);

      setTimeout(() => {
        triggerMatchConfirmed(data.room_code, data.opponent);
      }, 700);
    } catch (err) {
      console.error('Bot launch error:', err);
      playMiss();
      setErrorNotice(err.message || 'Bot match initialization failed');
      setSearching(false);
    } finally {
      setIsRequestInFlight(false);
    }
  };

  // Start matchmaking for selected tier
  const handleStartSearch = async () => {
    if (!token || isRequestInFlight) return;
    const tier = getTierForFee(selectedFee);
    const userCoins = user?.coins ?? 100;
    const userRank = user?.rank || "Bronze III";

    if (userCoins < tier.fee) {
      setErrorNotice(`Insufficient coins (${userCoins} 🪙). Need ${tier.fee} 🪙.`);
      playMiss();
      return;
    }
    if (!isRankEligible(userRank, tier.minRank)) {
      setErrorNotice(`Reach ${tier.minRank} rank to unlock this arena. (Current: ${userRank})`);
      playMiss();
      return;
    }

    playClick();
    setErrorNotice('');
    setSearching(true);
    setBotOfferAvailable(false);
    setIsRequestInFlight(true);
    setStatusText('Finding a worthy rival...');

    // 5-second timeout to offer playing against BOT
    if (botTimeoutRef.current) clearTimeout(botTimeoutRef.current);
    botTimeoutRef.current = setTimeout(() => {
      setBotOfferAvailable(true);
    }, 5000);

    const messages = [
      'Finding a worthy rival...',
      `Scanning ${tier.name} for available challengers...`,
      'Searching for opponents with similar rank...',
      `Waiting for an opponent in the ${tier.name}...`
    ];
    let idx = 0;
    statusIntervalRef.current = setInterval(() => {
      idx = (idx + 1) % messages.length;
      setStatusText(messages[idx]);
    }, 3200);

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
    } finally {
      setIsRequestInFlight(false);
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
    if (botTimeoutRef.current) clearTimeout(botTimeoutRef.current);

    setBotOfferAvailable(false);
    setIsRequestInFlight(false);
    activeRoomCodeRef.current = null;

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
  const userCoins = user?.coins ?? 100;
  const userRank = user?.rank || 'Bronze III';
  const userWins = user?.wins ?? 0;
  const rankMeta = getRankMeta(userRank);
  const recommendedTier = getRecommendedArena(user);

  return (
    <div className="modal-overlay" style={{ backdropFilter: 'blur(16px)', zIndex: 1100 }}>
      <div 
        className="modal-content" 
        style={{ 
          maxWidth: searching || matched ? '520px' : '560px', 
          textAlign: 'center',
          padding: 'clamp(20px, 4vw, 32px) clamp(16px, 3.5vw, 24px)',
          border: '1px solid var(--border-glow)',
          boxShadow: '0 0 50px rgba(0, 242, 254, 0.3)',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* ======================================================== */}
        {/* 1. ARENA TIER SELECTION SCREEN (Choose Stake & Rank) */}
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

            {/* User summary info pill (Rank, Wins, Coins - NO Level) */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 14px',
              marginBottom: '16px',
              fontSize: '0.85rem',
              flexWrap: 'wrap',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{
                  background: rankMeta.bg,
                  color: rankMeta.color,
                  border: `1px solid ${rankMeta.border}`,
                  padding: '2px 10px',
                  borderRadius: '12px',
                  fontWeight: '800',
                  fontSize: '0.78rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  {rankMeta.badge} {userRank}
                </span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                  ⚔️ {userWins} Wins
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '800', color: '#ffc107' }}>
                <span>🪙</span>
                <span>{userCoins} Coins Balance</span>
              </div>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', marginBottom: '16px', textAlign: 'left' }}>
              Choose your arena and compete for bigger rewards.
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px', maxHeight: '330px', overflowY: 'auto', paddingRight: '4px' }}>
              {ARENA_TIERS.map((tier) => {
                const isLocked = !isRankEligible(userRank, tier.minRank);
                const isAffordable = userCoins >= tier.fee;
                const isSelected = selectedFee === tier.fee;
                const isRecommended = recommendedTier?.fee === tier.fee;

                return (
                  <div
                    key={tier.fee}
                    onClick={() => {
                      if (isLocked) {
                        playMiss();
                        setErrorNotice(`Requires ${tier.reqLabel} to enter. Win duels to raise your rank!`);
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
                      background: isSelected ? tier.bg : 'var(--bg-surface-elevated)',
                      border: isSelected ? `2px solid ${tier.color}` : isRecommended ? '1px solid rgba(255, 179, 0, 0.4)' : '1px solid var(--border-subtle)',
                      boxShadow: 'none',
                      cursor: (isLocked || !isAffordable) ? 'not-allowed' : 'pointer',
                      opacity: isLocked ? 0.55 : (!isAffordable ? 0.7 : 1),
                      transition: 'all 0.2s ease',
                      position: 'relative'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left' }}>
                      <span style={{ fontSize: '1.6rem' }}>{tier.icon}</span>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: '800', fontSize: '0.98rem', color: 'var(--text-primary)' }}>
                            {tier.name}
                          </span>
                          {isRecommended && (
                            <span style={{
                              background: 'linear-gradient(135deg, rgba(255, 179, 0, 0.25), rgba(255, 107, 0, 0.25))',
                              border: '1px solid #ffb300',
                              color: '#ffc107',
                              fontSize: '0.68rem',
                              fontWeight: '900',
                              padding: '1px 6px',
                              borderRadius: '6px',
                              letterSpacing: '0.5px'
                            }}>
                              ⭐ RECOMMENDED
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                          <span style={{ color: '#ffc107', fontWeight: '700' }}>🪙 {tier.fee} Entry</span>
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
                          <Lock size={12} /> {tier.reqLabel}
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
              disabled={!isRankEligible(userRank, currentTier.minRank) || userCoins < currentTier.fee || isRequestInFlight}
            >
              <Zap size={18} />
              <span>Enter {currentTier.name} (Find Rival)</span>
            </button>

            {/* Direct Bot Duel Practice Option */}
            <div style={{
              marginTop: '12px',
              padding: '12px 14px',
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: '800', color: 'var(--neon-cyan)' }}>
                  <Bot size={16} /> Practice Duel vs BOT
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Authoritative Server Bot</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                {['easy', 'normal', 'hard'].map((diff) => (
                  <button
                    key={diff}
                    type="button"
                    className="btn btn-secondary"
                    style={{
                      padding: '8px 4px',
                      fontSize: '0.78rem',
                      fontWeight: '800',
                      textTransform: 'uppercase',
                      borderColor: selectedBotDifficulty === diff ? 'var(--neon-cyan)' : undefined,
                      color: selectedBotDifficulty === diff ? 'var(--neon-cyan)' : undefined
                    }}
                    onClick={() => {
                      setSelectedBotDifficulty(diff);
                      handlePlayWithBot(diff);
                    }}
                    disabled={isRequestInFlight}
                  >
                    {diff === 'easy' ? '🟢 Easy' : diff === 'normal' ? '🟡 Normal' : '🔴 Hard'}
                  </button>
                ))}
              </div>
            </div>
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
              Finding a worthy rival...
            </h2>

            {/* Status text */}
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginBottom: '18px' }}>
              {statusText}
            </p>

            {/* 5-second Bot Matchmaking Offer */}
            {botOfferAvailable && (
              <div style={{
                marginBottom: '20px',
                padding: '14px',
                background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.12), rgba(142, 45, 226, 0.12))',
                border: '1px solid var(--border-glow)',
                borderRadius: 'var(--radius-md)',
                animation: 'fadeScaleIn 0.3s ease-out',
                boxShadow: '0 0 20px rgba(0, 242, 254, 0.2)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '6px' }}>
                  <Bot size={18} color="var(--neon-cyan)" />
                  <span style={{ fontWeight: '800', fontSize: '0.9rem', color: '#fff' }}>
                    Challenger Queue Busy?
                  </span>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 10px 0' }}>
                  Play immediately against our authoritative server AI bot in this arena:
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {['easy', 'normal', 'hard'].map((diff) => (
                    <button
                      key={diff}
                      type="button"
                      className="btn btn-primary"
                      style={{
                        padding: '8px 4px',
                        fontSize: '0.76rem',
                        fontWeight: '800',
                        textTransform: 'uppercase'
                      }}
                      onClick={() => handlePlayWithBot(diff)}
                      disabled={isRequestInFlight}
                    >
                      {diff === 'easy' ? '🟢 Easy' : diff === 'normal' ? '🟡 Normal' : '🔴 Hard'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Cancel Button */}
            <div>
              <button
                className="btn btn-secondary btn-3d"
                onClick={handleCancel}
                style={{
                  padding: '12px 32px',
                  fontSize: '0.95rem',
                  fontWeight: '700',
                  letterSpacing: '0.5px'
                }}
              >
                <X size={16} /> CANCEL SEARCH
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
              background: 'var(--bg-surface-elevated)',
              border: '2px solid var(--border-glow)',
              borderRadius: 'var(--radius-lg)',
              padding: '20px 14px',
              marginBottom: '24px',
              boxShadow: 'none'
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
                <span style={{
                  background: rankMeta.bg,
                  color: rankMeta.color,
                  border: `1px solid ${rankMeta.border}`,
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontSize: '0.72rem',
                  fontWeight: '800',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  {rankMeta.badge} {userRank}
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
                {matchedOpponent?.rank ? (
                  <span style={{
                    background: getRankMeta(matchedOpponent.rank).bg,
                    color: getRankMeta(matchedOpponent.rank).color,
                    border: `1px solid ${getRankMeta(matchedOpponent.rank).border}`,
                    padding: '2px 8px',
                    borderRadius: '10px',
                    fontSize: '0.72rem',
                    fontWeight: '800',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    {getRankMeta(matchedOpponent.rank).badge} {matchedOpponent.rank}
                  </span>
                ) : (
                  <span className="badge badge-emerald" style={{ fontSize: '0.7rem' }}>
                    ONLINE
                  </span>
                )}
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
