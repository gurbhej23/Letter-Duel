import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSound } from '../context/SoundContext';
import { useSocket } from '../context/SocketContext';
import { Lock, EyeOff, CheckCircle2, AlertTriangle } from 'lucide-react';

export default function WordSelectModal({ isOpen }) {
  const { user } = useAuth();
  const { playClick, playHit, playMiss } = useSound();
  const { sendEvent, gameState, addToast } = useSocket();

  const [word, setWord] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const isP1 = gameState?.player1?.id === user?.id;
  const myPlayer = isP1 ? gameState?.player1 : gameState?.player2;
  const opponentPlayer = isP1 ? gameState?.player2 : gameState?.player1;
  const hasLocked = myPlayer?.has_locked_word;

  const handleLockWord = (e) => {
    e.preventDefault();
    playClick();
    const cleanWord = word.trim().toUpperCase();

    if (!cleanWord) {
      setError('Please enter a secret word.');
      playMiss();
      return;
    }
    if (!/^[A-Z]+$/.test(cleanWord)) {
      setError('Only alphabetic letters (A-Z) allowed. No spaces, numbers, or symbols.');
      playMiss();
      return;
    }
    if (cleanWord.length < 5 || cleanWord.length > 15) {
      setError(`Word must be 5 to 15 letters long. (Current: ${cleanWord.length})`);
      playMiss();
      return;
    }

    sendEvent('word_locked', { word: cleanWord });
    playHit();
    addToast('Secret word locked! Waiting for opponent...', 'success');
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '520px', textAlign: 'center' }}>
        <div style={{
          width: '54px',
          height: '54px',
          borderRadius: '14px',
          background: 'rgba(0, 242, 254, 0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px auto',
          boxShadow: '0 0 20px rgba(0, 242, 254, 0.2)'
        }}>
          <Lock size={28} color="#00f2fe" />
        </div>

        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', marginBottom: '8px' }}>
          Choose Your Secret Word
        </h2>

        <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginBottom: '24px' }}>
          Your opponent will only see your word length. Keep it cryptic!
        </p>

        {/* Word Secrecy Banner */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: 'rgba(142, 45, 226, 0.1)',
          border: '1px solid rgba(142, 45, 226, 0.3)',
          padding: '10px 16px',
          borderRadius: 'var(--radius-md)',
          marginBottom: '20px',
          fontSize: '0.85rem',
          textAlign: 'left'
        }}>
          <EyeOff size={20} color="#8e2de2" style={{ flexShrink: 0 }} />
          <span><strong>Zero-Knowledge Security:</strong> The server never reveals your secret word to the opponent's browser.</span>
        </div>

        {hasLocked ? (
          <div style={{ padding: '30px 20px' }}>
            <CheckCircle2 size={48} color="#00e676" style={{ margin: '0 auto 12px auto' }} />
            <h3 style={{ fontSize: '1.3rem', color: '#00e676', marginBottom: '8px' }}>
              Your Secret Word is Locked!
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
              Waiting for <strong>{opponentPlayer?.username || 'Opponent'}</strong> to lock their word...
            </p>
          </div>
        ) : (
          <form onSubmit={handleLockWord}>
            {error && (
              <div style={{
                background: 'rgba(255, 42, 109, 0.15)',
                border: '1px solid rgba(255, 42, 109, 0.4)',
                color: '#ff6b8b',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.88rem',
                marginBottom: '16px'
              }}>
                {error}
              </div>
            )}

            <div style={{ position: 'relative', marginBottom: '8px' }}>
              <input
                type="text"
                maxLength={15}
                value={word}
                onChange={(e) => {
                  setWord(e.target.value.toUpperCase());
                  setError('');
                }}
                placeholder="ENTER SECRET WORD"
                style={{
                  width: '100%',
                  padding: 'clamp(12px, 3vw, 16px) clamp(10px, 2vw, 16px)',
                  background: 'var(--bg-surface)',
                  border: '2px solid var(--border-glow)',
                  borderRadius: 'var(--radius-md)',
                  color: '#fff',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'clamp(1.1rem, 4.5vw, 1.4rem)',
                  fontWeight: '800',
                  textAlign: 'center',
                  letterSpacing: 'clamp(1.5px, 0.8vw, 3px)',
                  outline: 'none'
                }}
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
              <span>Min 5 letters</span>
              <span style={{ color: word.length >= 5 && word.length <= 15 ? 'var(--neon-cyan)' : 'var(--text-muted)', fontWeight: 'bold' }}>
                {word.length} / 15 letters
              </span>
              <span>Max 15 letters</span>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', fontSize: 'clamp(1rem, 3vw, 1.1rem)', padding: '14px', minHeight: '48px' }}
              disabled={word.length < 5}
            >
              <Lock size={18} /> Lock Secret Word
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
