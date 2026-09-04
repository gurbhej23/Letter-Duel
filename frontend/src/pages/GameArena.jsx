import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSound } from '../context/SoundContext';
import { useSocket } from '../context/SocketContext';
import { Swords, Trophy, Send, AlertTriangle, RefreshCw, Flag, MessageSquare, Flame, Check, HelpCircle, Clock } from 'lucide-react';

const ALPHABET_ROWS = [
  ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
  ['J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'],
  ['S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z']
];

export default function GameArena({ roomCode, onLeaveGame }) {
  const { user } = useAuth();
  const sound = useSound();
  const { playClick, playKey, playHit, playMiss } = sound;
  const { gameState, sendEvent, chatMessages, typingUser, disconnectTimer } = useSocket();

  const [fullWordInput, setFullWordInput] = useState('');
  const [showFullWordModal, setShowFullWordModal] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [mobileTab, setMobileTab] = useState('arena'); // 'arena' | 'chat'
  const [secondsLeft, setSecondsLeft] = useState(60);
  const chatBottomRef = useRef(null);

  const lastBeepedSecRef = useRef(null);

  // Authoritative server-synchronized countdown timer
  useEffect(() => {
    if (!gameState?.turn_deadline || gameState?.state !== 'PLAYING') {
      setSecondsLeft(60);
      lastBeepedSecRef.current = null;
      return;
    }

    const updateTimer = () => {
      const deadline = new Date(gameState.turn_deadline).getTime();
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
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
    const interval = setInterval(updateTimer, 500); // 500ms check keeps clock perfectly locked without jitter
    return () => clearInterval(interval);
  }, [gameState?.turn_deadline, gameState?.state, gameState?.is_my_turn, sound]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  if (!gameState) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)' }}>
        Loading Game Arena...
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
  const isGameOver = gameState.state === 'GAME_OVER';
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
  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendEvent('chat_message', { message: chatInput.trim() });
    setChatInput('');
    sendEvent('typing', { is_typing: false });
  };

  const handleChatInputChange = (e) => {
    setChatInput(e.target.value);
    sendEvent('typing', { is_typing: e.target.value.length > 0 });
  };

  const handleRematch = () => {
    playClick();
    sendEvent('rematch_request');
  };

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '20px' }}>
      {/* 60s Disconnect Banner */}
      {disconnectTimer !== null && (
        <div style={{
          background: 'linear-gradient(90deg, #ff2a6d 0%, #ff5e62 100%)',
          color: '#fff',
          padding: '12px 20px',
          borderRadius: 'var(--radius-md)',
          textAlign: 'center',
          fontWeight: '700',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          boxShadow: 'var(--shadow-rose)'
        }}>
          <AlertTriangle size={20} />
          <span>Opponent disconnected! Waiting {disconnectTimer}s to reconnect or forfeit victory is yours!</span>
        </div>
      )}

      {/* Top Arena HUD Bar */}
      <div className="glass-panel" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        padding: '12px 20px',
        marginBottom: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="badge badge-cyan">ROOM {roomCode}</span>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Turn #{gameState.turn_number || 1}
          </span>
        </div>

        {/* Dynamic Turn Badge with 60s Countdown Clock */}
        <div className={`turn-banner ${isMyTurn ? 'my-turn' : 'opp-turn'}`} style={{
          margin: 0,
          padding: '8px 18px',
          fontSize: '0.9rem',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            background: secondsLeft <= 10 ? 'rgba(255, 42, 109, 0.2)' : 'rgba(0, 0, 0, 0.25)',
            padding: '3px 8px',
            borderRadius: 'var(--radius-sm)',
            border: secondsLeft <= 10 ? '1px solid var(--neon-rose)' : '1px solid rgba(255,255,255,0.1)',
            color: secondsLeft <= 10 ? 'var(--neon-rose)' : (isMyTurn ? 'var(--neon-cyan)' : 'var(--neon-amber)')
          }}>
            <Clock size={15} color={secondsLeft <= 10 ? "#ff2a6d" : (isMyTurn ? "#00f2fe" : "#ffb300")} />
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: '900', fontSize: '0.95rem' }}>
              {secondsLeft}s
            </span>
          </div>

          <span>{isMyTurn ? 'YOUR TURN TO GUESS' : `OPPONENT'S TURN (${opponent?.username || 'Opponent'})`}</span>
        </div>

        <button 
          className="btn btn-secondary btn-sm"
          onClick={() => { playClick(); onLeaveGame(); }}
        >
          <Flag size={14} color="#ff2a6d" /> Leave Duel
        </button>
      </div>

      {/* Mobile Tab Switcher (< 900px) */}
      <div className="mobile-arena-tabs" style={{ display: 'none', marginBottom: '14px', gap: '8px' }}>
        <button
          className="btn"
          style={{
            flex: 1,
            background: mobileTab === 'arena' ? 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)' : 'var(--bg-surface-elevated)',
            color: mobileTab === 'arena' ? '#03101d' : 'var(--text-secondary)',
            padding: '10px',
            fontSize: '0.9rem'
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
            fontSize: '0.9rem'
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
        <div className={`arena-col-board ${mobileTab !== 'arena' ? 'mobile-hidden' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Opponent's Discovered Letters Card */}
          <div className="glass-panel glow-cyan" style={{ padding: '24px', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #8e2de2, #4a00e0)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: '700'
                }}>
                  {opponent?.username?.slice(0, 1).toUpperCase()}
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: '700', fontSize: '1rem' }}>{opponent?.username}</div>
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
              >
                <Swords size={16} /> Guess Full Word ({me?.word_guess_attempts_left ?? 3} left)
              </button>
            </div>

            {/* Letter Slots */}
            <div className="word-slots">
              {opponentMask.map((char, idx) => (
                <div 
                  key={idx} 
                  className={`letter-slot ${char !== '_' ? 'revealed' : ''}`}
                >
                  {char !== '_' ? char : ''}
                </div>
              ))}
            </div>

            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {isMyTurn ? "Select a letter below to guess against your opponent's word." : "Waiting for opponent's letter guess..."}
            </div>
          </div>

          {/* Virtual Alphabet Keyboard */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-muted)', letterSpacing: '1px' }}>
                ALPHABET KEYBOARD
              </span>
              <div style={{ display: 'flex', gap: '14px', fontSize: '0.75rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#00e676' }} /> Hit (YES)
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#ff2a6d' }} /> Miss (NO)
                </span>
              </div>
            </div>

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
          <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Your Secret Word
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.25rem', fontWeight: '800', color: 'var(--neon-cyan)', letterSpacing: '3px' }}>
                {gameState.my_word}
              </div>
            </div>

            {/* What opponent has discovered of YOUR word */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Opponent's progress:</div>
              <div style={{ display: 'flex', gap: '4px' }}>
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
        <div className={`chat-container glass-panel arena-col-chat ${mobileTab !== 'chat' ? 'mobile-hidden' : ''}`} style={{ height: '620px' }}>
          <div style={{
            padding: '14px 16px',
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
                  <div key={idx} className={`chat-bubble ${isMine ? 'mine' : 'theirs'}`}>
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
            <div ref={chatBottomRef} />
          </div>

          <form onSubmit={handleSendChat} className="chat-input-bar">
            <input
              type="text"
              placeholder="Send message to opponent..."
              className="chat-input"
              value={chatInput}
              onChange={handleChatInputChange}
              maxLength={120}
            />
            <button type="submit" className="btn btn-primary btn-icon" disabled={!chatInput.trim()}>
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>

      {/* Full Word Guess Modal */}
      {showFullWordModal && (
        <div className="modal-overlay" onClick={() => setShowFullWordModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px', textAlign: 'center' }}>
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
              fontSize: '2rem',
              fontWeight: '900',
              color: isWinner ? 'var(--neon-emerald)' : 'var(--neon-rose)',
              marginBottom: '6px'
            }}>
              {isWinner ? '🏆 VICTORY!' : 'GAME OVER'}
            </h2>

            <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', marginBottom: '20px' }}>
              {isWinner ? 'You outwitted your opponent in the Letter Duel!' : `${opponent?.username} conquered the duel.`}
            </p>

            {/* Secret Words Revealed */}
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
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>XP Earned:</span>
                <span style={{ fontWeight: '800', color: 'var(--neon-amber)' }}>
                  {isWinner ? '+100 XP 🌟' : '+25 XP'}
                </span>
              </div>
            </div>

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
