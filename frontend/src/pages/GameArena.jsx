import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSound } from '../context/SoundContext';
import { useSocket } from '../context/SocketContext';
import { Swords, Trophy, Send, AlertTriangle, RefreshCw, Flag, LogOut, MessageSquare, Flame, Check, HelpCircle, Clock, Heart, Lightbulb, X, UserPlus } from 'lucide-react';
import { getRankMeta, getRankProgress } from '../utils/rankUtils';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';

const ALPHABET_ROWS = [
  ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
  ['J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'],
  ['S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z']
];

export default function GameArena({ roomCode, onLeaveGame, onOpenRankModal }) {
  const { user, token, refreshUser, updateUser } = useAuth();
  const sound = useSound();
  const { playClick, playKey, playHit, playMiss } = sound;
  const { 
    gameState, 
    sendEvent, 
    sendChatMessage, 
    chatMessages, 
    typingUser, 
    disconnectTimer, 
    opponentDisconnected,
    opponentReconnectedNotice,
    serverClockOffset, 
    leaveRoom,
    addToast
  } = useSocket();

  const [fullWordInput, setFullWordInput] = useState('');
  const [showFullWordModal, setShowFullWordModal] = useState(false);
  const [showWaitBanner, setShowWaitBanner] = useState(true);
  const [chatInput, setChatInput] = useState('');
  const [mobileTab, setMobileTab] = useState('arena'); // 'arena' | 'chat'
  const [secondsLeft, setSecondsLeft] = useState(30);
  const chatBottomRef = useRef(null);
  const typingThrottleRef = useRef(null);
  const lastTypingSentRef = useRef(0);

  const lastBeepedSecRef = useRef(null);
  const [friendRequestSent, setFriendRequestSent] = useState(false);
  const [sendingFriendReq, setSendingFriendReq] = useState(false);

  const handleAddOpponentFriend = async () => {
    if (!opponent?.username || !token) return;
    playClick();
    setSendingFriendReq(true);
    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ receiver_username: opponent.username })
      });
      if (res.ok) {
        setFriendRequestSent(true);
        playHit();
        addToast(`Friend request sent to ${opponent.username}! 🤝`, "success");
      } else {
        const data = await res.json();
        addToast(data.detail || 'Could not send friend request', "warning");
      }
    } catch (e) {
      addToast('Network error sending friend request', "warning");
    } finally {
      setSendingFriendReq(false);
    }
  };

  // Lock body scroll when full word modal is open
  useBodyScrollLock(showFullWordModal);

  // Reset showWaitBanner whenever disconnectTimer clears
  useEffect(() => {
    if (disconnectTimer === null && !opponentDisconnected) {
      setShowWaitBanner(true);
    }
  }, [disconnectTimer, opponentDisconnected]);

  // Auto-scroll chat box on new messages or typing indicator
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, typingUser]);

  // Authoritative server-synchronized countdown timer
  // Synchronized via server turn_expires_at and serverClockOffset calibration
  // Completely immune to client clock skew, and seamlessly resumes upon refresh
  useEffect(() => {
    if (gameState?.state !== 'PLAYING') {
      setSecondsLeft(30);
      lastBeepedSecRef.current = null;
      return;
    }

    const updateTimer = () => {
      let remaining = 30;
      if (gameState?.turn_expires_at) {
        const deadline = Date.parse(gameState.turn_expires_at);
        const serverNow = Date.now() + (serverClockOffset || 0);
        remaining = Math.max(0, Math.ceil((deadline - serverNow) / 1000));
      } else if (typeof gameState?.seconds_remaining === 'number') {
        remaining = Math.max(0, gameState.seconds_remaining);
      }
      setSecondsLeft(remaining);

      // Warning audio beep during final 5 seconds of own turn (once per second)
      if (remaining <= 5 && remaining > 0 && gameState?.is_my_turn) {
        if (lastBeepedSecRef.current !== remaining) {
          lastBeepedSecRef.current = remaining;
          sound.playCountdown();
        }
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 250);
    return () => clearInterval(interval);
  }, [
    gameState?.state,
    gameState?.turn_number,
    gameState?.current_turn_player_id,
    gameState?.turn_expires_at,
    gameState?.seconds_remaining,
    gameState?.is_my_turn,
    serverClockOffset,
    sound
  ]);

  // Refresh user balance & level when game ends
  const isGameOver = gameState?.state === 'GAME_OVER';
  useEffect(() => {
    if (isGameOver) {
      if (gameState?.rewards && user && updateUser) {
        const isWin = gameState.winner_id === user.id;
        updateUser({
          rating: isWin ? (gameState.rewards.winner_rating ?? user.rating) : (gameState.rewards.loser_rating ?? user.rating),
          rank: isWin ? (gameState.rewards.winner_rank ?? user.rank) : (gameState.rewards.loser_rank ?? user.rank),
          coins: isWin ? (gameState.rewards.winner_coins ?? user.coins) : (gameState.rewards.loser_coins ?? user.coins),
          wins: isWin ? (user.wins || 0) + 1 : user.wins,
          losses: !isWin ? (user.losses || 0) + 1 : user.losses,
          current_streak: isWin ? (user.current_streak || 0) + 1 : 0
        });
      }
      if (refreshUser) {
        refreshUser();
      }
    }
  }, [isGameOver, gameState?.rewards]);

  if (!gameState) {
    return (
      <div style={{ maxWidth: '480px', margin: '100px auto', textAlign: 'center', padding: '40px 20px' }} className="glass-panel">
        <div style={{ width: '48px', height: '48px', border: '3px solid rgba(0, 242, 254, 0.2)', borderTopColor: 'var(--neon-cyan)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 18px auto' }} />
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', marginBottom: '8px' }}>
          Synchronizing Duel State...
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
          Restoring your active match and turn timer from server.
        </p>
      </div>
    );
  }

  const isP1 = gameState.player1?.id === user?.id;
  const me = isP1 ? gameState.player1 : gameState.player2;
  const opponent = isP1 ? gameState.player2 : gameState.player1;

  const isMyTurn = gameState.is_my_turn;
  const myGuessedLetters = new Set(gameState.my_guessed_letters || []);
  const opponentMask = gameState.opponent_mask || [];
  const myMask = gameState.my_mask || [];
  const isWinner = isGameOver && gameState.winner_id === user?.id;

  // Rematch status
  const hasVotedRematch = gameState.rematch_votes?.includes(user?.id);
  const opponentVotedRematch = gameState.rematch_votes?.includes(opponent?.id);

  // Letter guess handler
  const handleLetterClick = (letter) => {
    if (!isMyTurn || isGameOver || myGuessedLetters.has(letter)) return;
    playKey();
    sendEvent('letter_guess', { letter });
  };

  // Full word guess handler
  const handleFullWordSubmit = (e) => {
    e.preventDefault();
    if (!isMyTurn || isGameOver || !fullWordInput.trim()) return;
    playClick();
    sendEvent('word_guess', { word: fullWordInput.trim().toUpperCase() });
    setFullWordInput('');
    setShowFullWordModal(false);
  };

  // Send chat message
  // Send chat message with instant optimistic UI
  const handleSendChat = (e) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    sendChatMessage(text);
    setChatInput('');
    sendEvent('typing', { is_typing: false });
    if (typingThrottleRef.current) {
      clearTimeout(typingThrottleRef.current);
      typingThrottleRef.current = null;
    }
    lastTypingSentRef.current = 0;
  };

  // Debounced / throttled typing indicator
  const handleChatInputChange = (e) => {
    const val = e.target.value;
    setChatInput(val);

    const now = Date.now();
    if (val.trim().length > 0) {
      // Throttle: only send typing event once every 2 seconds while actively typing
      if (now - lastTypingSentRef.current > 2000) {
        lastTypingSentRef.current = now;
        sendEvent('typing', { is_typing: true });
      }
      // Auto-clear typing indicator after 2.5s of inactivity
      if (typingThrottleRef.current) clearTimeout(typingThrottleRef.current);
      typingThrottleRef.current = setTimeout(() => {
        sendEvent('typing', { is_typing: false });
        lastTypingSentRef.current = 0;
      }, 2500);
    } else {
      if (typingThrottleRef.current) clearTimeout(typingThrottleRef.current);
      sendEvent('typing', { is_typing: false });
      lastTypingSentRef.current = 0;
    }
  };

  const handleRematch = () => {
    playClick();
    sendEvent('rematch_request');
  };

  const renderLifelines = (count = 3, label = "Lives") => {
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }} title={`${count}/3 lifelines remaining (timeout penalty)`}>
        {label && <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: '600' }}>{label}:</span>}
        <div style={{ display: 'inline-flex', gap: '3px', alignItems: 'center' }}>
          {[1, 2, 3].map((num) => {
            const active = num <= count;
            return (
              <Heart
                key={num}
                size={16}
                fill={active ? "#ff2a6d" : "rgba(255, 255, 255, 0.05)"}
                color={active ? "#ff2a6d" : "#475569"}
                style={{
                  filter: active ? "drop-shadow(0 0 6px rgba(255, 42, 109, 0.7))" : "none",
                  transform: active ? "scale(1)" : "scale(0.85)",
                  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
                }}
              />
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: 'clamp(12px, 2.5vw, 20px) clamp(10px, 2vw, 16px)' }}>
      {/* Non-blocking Opponent Disconnected Banner */}
      {(disconnectTimer !== null || opponentDisconnected) && showWaitBanner && (
        <div style={{
          background: 'rgba(255, 179, 0, 0.12)',
          border: '1px solid rgba(255, 179, 0, 0.5)',
          backdropFilter: 'blur(10px)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 18px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          color: '#ffb300',
          boxShadow: '0 0 20px rgba(255, 179, 0, 0.15)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle size={20} color="#ffb300" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: '700', fontSize: '0.92rem' }}>
                Opponent disconnected! Waiting {disconnectTimer ?? 60}s to reconnect...
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                You will automatically win by forfeit if they do not return.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="btn btn-ghost"
              style={{ padding: '6px 14px', fontSize: '0.82rem', borderColor: 'rgba(255, 179, 0, 0.4)', color: '#ffb300' }}
              onClick={() => setShowWaitBanner(false)}
            >
              Wait
            </button>
            <button
              className="btn btn-rose"
              style={{ padding: '6px 14px', fontSize: '0.82rem' }}
              onClick={() => {
                if (window.confirm("Are you sure you want to leave this duel?")) {
                  leaveRoom(true);
                  onLeaveGame?.();
                }
              }}
            >
              <LogOut size={14} /> Leave Game
            </button>
          </div>
        </div>
      )}

      {/* Opponent Reconnected Auto-Dismissing Banner */}
      {opponentReconnectedNotice && (
        <div style={{
          background: 'rgba(0, 230, 118, 0.15)',
          border: '1px solid rgba(0, 230, 118, 0.5)',
          backdropFilter: 'blur(10px)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 18px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          color: '#00e676',
          fontWeight: '700',
          fontSize: '0.92rem',
          boxShadow: '0 0 20px rgba(0, 230, 118, 0.2)',
          animation: 'fadeIn 0.3s ease'
        }}>
          <Check size={20} color="#00e676" style={{ flexShrink: 0 }} />
          <span>{opponentReconnectedNotice}</span>
        </div>
      )}

      {/* Top Arena HUD Bar */}
      <div className="glass-panel" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px',
        padding: 'clamp(10px, 2vw, 14px) clamp(12px, 2.5vw, 20px)',
        marginBottom: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="badge badge-cyan">ROOM {roomCode}</span>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Turn #{gameState.turn_number || 1}
          </span>
        </div>

        {/* Dynamic Turn Badge with 30s Countdown Clock */}
        <div className={`turn-banner ${isMyTurn ? 'my-turn' : 'opp-turn'}`} style={{
          margin: 0,
          padding: '8px 16px',
          fontSize: 'clamp(0.82rem, 2.5vw, 0.92rem)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          flex: '1 1 auto',
          minWidth: '220px'
        }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            background: secondsLeft <= 10 ? 'rgba(255, 42, 109, 0.2)' : 'var(--bg-surface-elevated)',
            padding: '3px 8px',
            borderRadius: 'var(--radius-sm)',
            border: secondsLeft <= 10 ? '1px solid var(--neon-rose)' : '1px solid var(--border-subtle)',
            color: secondsLeft <= 10 ? 'var(--neon-rose)' : (isMyTurn ? 'var(--neon-cyan)' : 'var(--neon-amber)')
          }}>
            <Clock size={15} color={secondsLeft <= 10 ? "#ff2a6d" : (isMyTurn ? "var(--neon-cyan)" : "var(--neon-amber)")} />
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: '900', fontSize: '0.95rem' }}>
              {secondsLeft}s
            </span>
          </div>

          <span>{isMyTurn ? 'YOUR TURN TO GUESS' : `OPPONENT'S TURN (${opponent?.username || 'Opponent'})`}</span>
        </div>

        {/* Lifelines HUD & Leave Action */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: 'var(--bg-surface-elevated)',
            padding: '6px 12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)'
          }}>
            {renderLifelines(me?.lifelines ?? 3, "You")}
            <div style={{ width: '1px', height: '14px', background: 'var(--border-subtle)' }} />
            {renderLifelines(opponent?.lifelines ?? 3, opponent?.username || "Opp")}
          </div>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              playClick();
              if (window.confirm("Are you sure you want to leave the duel?")) {
                leaveRoom(true);
              }
            }}
            title="Leave match and return to menu"
            aria-label="Leave Duel"
          >
            <LogOut size={14} color="#ff2a6d" /> Leave
          </button>
        </div>
      </div>

      {/* Mobile Tab Switcher (< 1024px) */}
      <div className="mobile-arena-tabs" style={{ display: 'none', marginBottom: '14px', gap: '8px' }}>
        <button
          className="btn"
          style={{
            flex: 1,
            background: mobileTab === 'arena' ? 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)' : 'var(--bg-surface-elevated)',
            color: mobileTab === 'arena' ? '#03101d' : 'var(--text-secondary)',
            padding: '10px',
            fontSize: '0.9rem',
            minHeight: '44px'
          }}
          onClick={() => { playClick(); setMobileTab('arena'); }}
        >
          <Swords size={16} /> Duel Board
        </button>
        <button
          className="btn"
          style={{
            flex: 1,
            background: mobileTab === 'chat' ? 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)' : 'var(--bg-surface-elevated)',
            color: mobileTab === 'chat' ? '#03101d' : 'var(--text-secondary)',
            padding: '10px',
            fontSize: '0.9rem',
            minHeight: '44px'
          }}
          onClick={() => { playClick(); setMobileTab('chat'); }}
        >
          <MessageSquare size={16} /> Chat & Log ({chatMessages.length})
        </button>
      </div>

      {/* Main Duel Grid */}
      <div className="duel-arena-grid" style={{
        display: 'grid',
        gridTemplateColumns: '1fr 340px',
        gap: '20px',
        alignItems: 'start'
      }}>
        {/* Left Arena: Opponent Board, Slots, and Keyboard */}
        <div className={`arena-col-board ${mobileTab !== 'arena' ? 'mobile-hidden' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Opponent's Discovered Letters Card */}
          <div className="glass-panel glow-cyan" style={{ padding: 'clamp(16px, 3vw, 24px)', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #8e2de2, #4a00e0)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: '700',
                  flexShrink: 0
                }}>
                  {opponent?.username?.slice(0, 1).toUpperCase()}
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: '700', fontSize: '1rem' }}>{opponent?.username}</span>
                    {renderLifelines(opponent?.lifelines ?? 3, "")}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Target Word: {gameState.opponent_word_length} Letters
                  </div>
                </div>
              </div>

              {/* Full Word Guess Button */}
              <button
                className="btn btn-accent btn-sm"
                onClick={() => { playClick(); setShowFullWordModal(true); }}
                disabled={!isMyTurn || isGameOver || me?.word_guess_attempts_left <= 0}
                style={{ fontSize: 'clamp(0.8rem, 2.2vw, 0.85rem)' }}
              >
                <Swords size={15} /> Guess Full Word ({me?.word_guess_attempts_left ?? 3} left)
              </button>
            </div>

            {/* Letter Slots with Dense Scaling for 9+ Letters */}
            <div className={`word-slots ${opponentMask.length > 8 ? 'dense-slots' : ''}`}>
              {opponentMask.map((char, idx) => (
                <div
                  key={idx}
                  className={`letter-slot ${char !== '_' ? 'revealed' : ''}`}
                >
                  {char !== '_' ? char : ''}
                </div>
              ))}
            </div>

            {/* Clue / Meaning Hint */}
            {gameState?.opponent_hint && (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.12), rgba(142, 45, 226, 0.12))',
                border: '1.5px solid var(--neon-cyan)',
                boxShadow: '0 0 20px rgba(0, 242, 254, 0.18)',
                borderRadius: 'var(--radius-md)',
                padding: '8px 18px',
                margin: '12px auto 14px auto',
                fontSize: 'clamp(0.85rem, 2.5vw, 0.95rem)',
                maxWidth: '96%',
                lineHeight: 1.4
              }}>
                <Lightbulb size={18} color="var(--neon-cyan)" style={{ flexShrink: 0 }} />
                <span style={{
                  fontSize: '0.78rem',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  fontWeight: 900,
                  color: 'var(--neon-cyan)',
                  background: 'rgba(0, 242, 254, 0.15)',
                  padding: '2px 8px',
                  borderRadius: '6px'
                }}>
                  HINT / CLUE:
                </span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
                  "{gameState.opponent_hint}"
                </span>
              </div>
            )}

            <div style={{ fontSize: 'clamp(0.8rem, 2.5vw, 0.85rem)', color: 'var(--text-secondary)' }}>
              {isMyTurn ? "Select a letter below to guess against your opponent's word." : "Waiting for opponent's letter guess..."}
            </div>
          </div>

          {/* Virtual Alphabet Keyboard */}
          <div className="glass-panel" style={{ padding: 'clamp(14px, 2.5vw, 20px)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: '700', color: 'var(--text-muted)', letterSpacing: '1px' }}>
                ALPHABET KEYBOARD
              </span>
              <div style={{ display: 'flex', gap: '12px', fontSize: '0.75rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#00e676' }} /> Hit (YES)
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#ff2a6d' }} /> Miss (NO)
                </span>
              </div>
            </div>

            {/* Single Virtual Keyboard */}
            <div className="keyboard-container">
              {ALPHABET_ROWS.map((row, rIdx) => (
                <div key={rIdx} className="keyboard-row">
                  {row.map((letter) => {
                    const hasGuessed = myGuessedLetters.has(letter);
                    const isHit = hasGuessed && opponentMask.includes(letter);
                    const isMiss = hasGuessed && !isHit;

                    let statusClass = '';
                    if (isHit) statusClass = 'hit';
                    else if (isMiss) statusClass = 'miss';

                    return (
                      <button
                        key={letter}
                        className={`key-btn ${statusClass}`}
                        disabled={!isMyTurn || isGameOver || hasGuessed}
                        onClick={() => handleLetterClick(letter)}
                        aria-label={`Letter ${letter}`}
                      >
                        {letter}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Player's Own Word Tracker (Bottom Mini-HUD) */}
          <div className="glass-panel" style={{ padding: 'clamp(12px, 2.5vw, 16px) clamp(14px, 3vw, 20px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Your Secret Word
                </span>
                {renderLifelines(me?.lifelines ?? 3, "Your Lives")}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(1.1rem, 3.5vw, 1.25rem)', fontWeight: '800', color: 'var(--neon-cyan)', letterSpacing: '3px' }}>
                  {gameState.my_word}
                </div>
                {gameState?.my_hint && (
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    ({gameState.my_hint})
                  </span>
                )}
              </div>
            </div>

            {/* What opponent has discovered of YOUR word */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Opponent's progress:</div>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {myMask.map((char, idx) => (
                  <div
                    key={idx}
                    className="letter-slot opponent-view"
                    style={{
                      background: char !== '_' ? 'rgba(255, 42, 109, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                      borderColor: char !== '_' ? 'var(--neon-rose)' : 'rgba(255, 255, 255, 0.1)',
                      color: char !== '_' ? 'var(--neon-rose)' : 'transparent'
                    }}
                  >
                    {char !== '_' ? char : ''}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar: Real-Time Battle Chat & History Log */}
        <div className={`chat-container glass-panel arena-col-chat ${mobileTab !== 'chat' ? 'mobile-hidden' : ''}`}>
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-subtle)',
            fontWeight: '700',
            fontFamily: 'var(--font-display)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MessageSquare size={16} color="#00f2fe" />
              <span>Battle Log & Chat</span>
            </div>
            {typingUser && (
              <span style={{ fontSize: '0.75rem', color: 'var(--neon-cyan)', fontStyle: 'italic' }}>
                {typingUser} is typing...
              </span>
            )}
          </div>

          <div className="chat-messages">
            {chatMessages.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', margin: 'auto' }}>
                Duel commenced. Send a friendly message or guess letters!
              </div>
            ) : (
              chatMessages.map((msg, idx) => {
                if (msg.is_system) {
                  return (
                    <div key={idx} className="chat-bubble system">
                      ⚡ {msg.message}
                    </div>
                  );
                }
                const isMine = msg.sender_id === user?.id;
                return (
                  <div key={idx} className={`chat-bubble ${isMine ? 'mine' : 'theirs'}`} style={msg.pending ? { opacity: 0.85 } : {}}>
                    {!isMine && (
                      <div style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--neon-cyan)', marginBottom: '2px' }}>
                        {msg.sender_username}
                      </div>
                    )}
                    <div>{msg.message}</div>
                  </div>
                );
              })
            )}
            {typingUser && (
              <div className="chat-bubble theirs" style={{ fontStyle: 'italic', opacity: 0.85, fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <span>{typingUser} is typing...</span>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          <form onSubmit={handleSendChat} className="chat-input-bar">
            <input
              type="text"
              placeholder="Send message..."
              className="chat-input"
              value={chatInput}
              onChange={handleChatInputChange}
              maxLength={120}
            />
            <button type="submit" className="btn btn-primary btn-icon" disabled={!chatInput.trim()} aria-label="Send Chat">
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>

      {/* Full Word Guess Modal */}
      {showFullWordModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px', textAlign: 'center', position: 'relative' }}>
            <button
              type="button"
              className="modal-close-btn"
              onClick={() => setShowFullWordModal(false)}
              aria-label="Close"
              style={{ position: 'absolute', top: '14px', right: '14px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={20} />
            </button>
            <Swords size={36} color="#ffb300" style={{ margin: '0 auto 12px auto' }} />
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', marginBottom: '8px' }}>
              Guess Opponent's Entire Word
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '16px' }}>
              High-risk gamble: Guess correctly to win instantly! If wrong, your turn ends immediately.
            </p>

            <form onSubmit={handleFullWordSubmit}>
              <input
                type="text"
                maxLength={gameState.opponent_word_length}
                value={fullWordInput}
                onChange={(e) => setFullWordInput(e.target.value.toUpperCase())}
                placeholder={`ENTER ${gameState.opponent_word_length}-LETTER WORD`}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: 'var(--bg-surface)',
                  border: '2px solid var(--neon-amber)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--neon-amber)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '1.4rem',
                  fontWeight: '800',
                  textAlign: 'center',
                  letterSpacing: '3px',
                  outline: 'none',
                  marginBottom: '16px'
                }}
                autoFocus
              />

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => setShowFullWordModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-accent"
                  style={{ flex: 2 }}
                  disabled={fullWordInput.length !== gameState.opponent_word_length}
                >
                  Submit Full Word Guess
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Game Over / Victory Modal */}
      {isGameOver && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '520px', textAlign: 'center' }}>
            {isWinner ? (
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #00e676, #00f2fe)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto',
                boxShadow: '0 0 25px rgba(0, 230, 118, 0.4)'
              }}>
                <Trophy size={32} color="#03101d" />
              </div>
            ) : (
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #ff2a6d, #8e2de2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto',
                boxShadow: '0 0 25px rgba(255, 42, 109, 0.4)'
              }}>
                <Swords size={32} color="#fff" />
              </div>
            )}

            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontSize: '2.2rem',
              fontWeight: '900',
              color: isWinner ? 'var(--neon-emerald)' : 'var(--neon-rose)',
              marginBottom: '4px',
              letterSpacing: '1px'
            }}>
              {isWinner ? '🏆 VICTORY' : 'DEFEAT'}
            </h2>

            <div style={{
              fontWeight: '800',
              fontSize: '1.15rem',
              color: isWinner ? '#00e676' : '#ff4d6d',
              marginBottom: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}>
              <span>🪙</span>
              <span>
                {isWinner
                  ? `+${gameState.rewards?.winner_coins_won || gameState.entry_fee || 50} Duel Coins`
                  : `-${gameState.rewards?.loser_coins_lost || gameState.entry_fee || 50} Duel Coins`}
              </span>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '18px' }}>
              {gameState.win_reason?.includes('lifelines') || gameState.win_reason === 'TIMEOUT_DISQUALIFIED'
                ? (isWinner ? `Opponent ran out of lifelines (missed 3 turn timers)!` : `You ran out of lifelines (missed 3 turn timers)!`)
                : (isWinner ? 'You outwitted your opponent in the Letter Duel!' : `${opponent?.username} conquered the duel.`)}
            </p>

            {/* Competitive Rank Progress Animation Box */}
            {(() => {
              const currentRank = isWinner 
                ? (gameState.rewards?.winner_rank || user?.rank || 'Bronze III')
                : (gameState.rewards?.loser_rank || user?.rank || 'Bronze III');
              const newRating = isWinner
                ? (gameState.rewards?.winner_rating ?? user?.rating ?? 825)
                : (gameState.rewards?.loser_rating ?? user?.rating ?? 800);
              const ratingChange = isWinner
                ? (gameState.rewards?.winner_rating_change ?? 25)
                : (gameState.rewards?.loser_rating_change ?? -15);
              const isPromoted = Boolean(gameState.rewards?.winner_rank_up || gameState.rewards?.winner_promoted);
              const isDemoted = Boolean(gameState.rewards?.loser_rank_down);
              const streak = isWinner ? (gameState.rewards?.winner_streak || user?.current_streak || 1) : 0;
              const progress = getRankProgress(newRating);

              return (
                <div style={{
                  background: 'var(--bg-surface-elevated)',
                  border: `1px solid ${isPromoted ? 'var(--neon-emerald)' : (isDemoted ? 'var(--neon-rose)' : progress.meta.border)}`,
                  borderRadius: 'var(--radius-md)',
                  padding: '16px',
                  marginBottom: '16px',
                  textAlign: 'center',
                  animation: 'fadeScaleIn 0.5s ease-out'
                }}>
                  {isPromoted && (
                    <div style={{
                      background: 'linear-gradient(90deg, rgba(0, 230, 118, 0.25), rgba(0, 242, 254, 0.25))',
                      color: 'var(--neon-emerald)',
                      fontWeight: '900',
                      fontSize: '0.9rem',
                      padding: '6px 14px',
                      borderRadius: '20px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginBottom: '12px',
                      letterSpacing: '0.5px',
                      boxShadow: '0 0 16px rgba(0, 230, 118, 0.35)'
                    }}>
                      🎉 RANK PROMOTION! Ascended to {currentRank}!
                    </div>
                  )}

                  {isDemoted && (
                    <div style={{
                      background: 'rgba(255, 42, 109, 0.15)',
                      color: 'var(--neon-rose)',
                      fontWeight: '900',
                      fontSize: '0.85rem',
                      padding: '4px 12px',
                      borderRadius: '20px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginBottom: '12px'
                    }}>
                      ⚠️ Demoted to {currentRank}
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '2rem' }}>{progress.meta.badge}</span>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontWeight: '900', fontSize: '1.1rem', color: progress.meta.color }}>
                          {currentRank}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#fff' }}>{newRating} RP</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontWeight: '900',
                        fontSize: '1.15rem',
                        color: ratingChange > 0 ? 'var(--neon-emerald)' : 'var(--neon-rose)'
                      }}>
                        {ratingChange > 0 ? `+${ratingChange}` : ratingChange} RP
                      </div>
                      {streak > 1 && (
                        <div style={{ fontSize: '0.75rem', color: '#ffb300', fontWeight: '800' }}>
                          🔥 {streak} Win Streak!
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Progress towards next tier */}
                  {!progress.isMaxRank ? (
                    <div style={{ textAlign: 'left', background: 'rgba(0,0,0,0.25)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        <span>Next: <strong style={{ color: progress.nextMeta?.color }}>{progress.nextRank}</strong> ({progress.nextThreshold} RP)</span>
                        <span style={{ fontWeight: 800, color: 'var(--neon-emerald)' }}>{progress.pointsNeeded} RP left (~{progress.estimatedWins} wins)</span>
                      </div>
                      <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${progress.percent}%`, height: '100%', background: progress.meta.gradient || '#00f2fe', borderRadius: '3px', transition: 'width 0.8s ease' }} />
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.78rem', color: '#00e676', fontWeight: 800 }}>
                      🔱 Pinnacle Grandmaster Rank!
                    </div>
                  )}

                  {onOpenRankModal && (
                    <div style={{ marginTop: '8px', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={onOpenRankModal}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--neon-cyan)',
                          fontSize: '0.74rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          padding: 0,
                          textDecoration: 'underline'
                        }}
                      >
                        View Rank Roadmap →
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Secret Words & Rewards Breakdown */}
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
              marginBottom: '20px',
              textAlign: 'left'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>{opponent?.username}'s Secret Word:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: '800', color: 'var(--neon-cyan)' }}>
                  {gameState.opponent_secret_word || 'REVEALED'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Your Secret Word:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: '800', color: '#fff' }}>
                  {gameState.my_word}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Coins Outcome:</span>
                <span style={{
                  fontWeight: '800',
                  color: isWinner ? 'var(--neon-emerald)' : 'var(--neon-rose)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <span>🪙</span>
                  {isWinner
                    ? `+${gameState.rewards?.winner_coins_won || gameState.entry_fee || 50} Won from Rival!`
                    : `-${gameState.rewards?.loser_coins_lost || gameState.entry_fee || 50} Stake Deducted`}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Total Match Pot:</span>
                <span style={{ fontWeight: '800', color: '#ffc107', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>🏆</span> {gameState.rewards?.pot || (gameState.entry_fee || 50) * 2} Coins
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Updated Balance:</span>
                <span style={{ fontWeight: '800', color: '#00f2fe' }}>
                  🪙 {isWinner ? (gameState.rewards?.winner_coins ?? user?.coins) : (gameState.rewards?.loser_coins ?? user?.coins)} Coins
                </span>
              </div>
            </div>

            {/* Add Opponent as Friend Action */}
            {opponent && opponent.id !== 99999 && (
              <div style={{ marginBottom: '14px' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{
                    width: '100%',
                    padding: '8px 14px',
                    fontSize: '0.85rem',
                    fontWeight: '700',
                    borderColor: friendRequestSent ? '#00e676' : 'var(--border-subtle)',
                    color: friendRequestSent ? '#00e676' : 'var(--neon-cyan)',
                    background: friendRequestSent ? 'rgba(0, 230, 118, 0.1)' : 'rgba(0, 242, 254, 0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: 'none'
                  }}
                  disabled={friendRequestSent || sendingFriendReq}
                  onClick={handleAddOpponentFriend}
                >
                  <UserPlus size={16} />
                  <span>
                    {friendRequestSent 
                      ? `✓ Friend Request Sent to ${opponent.username}` 
                      : (sendingFriendReq ? 'Sending Request...' : `Add ${opponent.username} as Friend`)}
                  </span>
                </button>
              </div>
            )}

            {/* Rematch Controls */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => { playClick(); onLeaveGame(); }}
              >
                Return Home
              </button>

              <button
                className={`btn ${hasVotedRematch ? 'btn-secondary' : 'btn-primary'}`}
                style={{ flex: 2 }}
                onClick={handleRematch}
              >
                <RefreshCw size={16} />
                <span>
                  {hasVotedRematch
                    ? (opponentVotedRematch ? 'Rematch Starting...' : 'Rematch Voted (Waiting...)')
                    : (opponentVotedRematch ? 'Accept Rematch!' : 'Request Rematch')}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
