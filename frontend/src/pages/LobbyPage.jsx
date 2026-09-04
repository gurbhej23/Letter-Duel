import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSound } from '../context/SoundContext';
import { useSocket } from '../context/SocketContext';
import { Copy, Check, Share2, Users, ArrowLeft, ShieldCheck, Loader2 } from 'lucide-react';

export default function LobbyPage({ roomCode, onLeaveRoom, onOpenFriends }) {
  const { user } = useAuth();
  const { playClick, playHit } = useSound();
  const { gameState, sendEvent, addToast } = useSocket();

  const [copied, setCopied] = useState(false);

  const handleCopyCode = () => {
    playClick();
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    addToast(`Room code ${roomCode} copied to clipboard!`, "success");
    setTimeout(() => setCopied(false), 2500);
  };

  const handleReadyToggle = () => {
    playHit();
    sendEvent('player_ready');
  };

  const p1 = gameState?.player1;
  const p2 = gameState?.player2;
  const isP1 = p1?.id === user?.id;
  const isReady = isP1 ? p1?.is_ready : p2?.is_ready;

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 20px' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <button 
          className="btn btn-secondary btn-sm"
          onClick={() => { playClick(); onLeaveRoom(); }}
        >
          <ArrowLeft size={16} /> Leave Room
        </button>

        <button
          className="btn btn-secondary btn-sm"
          onClick={() => { playClick(); onOpenFriends(); }}
        >
          <Users size={16} color="#00e676" /> Invite Friend
        </button>
      </div>

      {/* Main Room Code Banner */}
      <div className="glass-panel" style={{ textAlign: 'center', padding: '36px 20px', marginBottom: '28px' }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '8px' }}>
          DUEL ROOM CODE
        </div>

        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '16px',
          background: 'rgba(0, 0, 0, 0.4)',
          border: '2px solid var(--border-glow)',
          padding: '14px 28px',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-cyan)',
          marginBottom: '14px'
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'clamp(1.8rem, 6vw, 2.8rem)',
            fontWeight: '900',
            letterSpacing: 'clamp(4px, 1.5vw, 8px)',
            color: 'var(--neon-cyan)'
          }}>
            {roomCode}
          </span>
          <button 
            className="btn btn-secondary btn-icon"
            onClick={handleCopyCode}
            title="Copy Room Code"
          >
            {copied ? <Check size={20} color="#00e676" /> : <Copy size={20} color="#00f2fe" />}
          </button>
        </div>

        <div style={{ color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
          Share this 6-character code with your opponent to begin the duel.
        </div>
      </div>

      {/* Duelists Cards (Player 1 VS Player 2) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '20px',
        marginBottom: '32px'
      }}>
        {/* Player 1 Card */}
        <div className={`glass-panel ${p1?.is_ready ? 'glow-cyan' : ''}`} style={{ padding: '24px', textAlign: 'center' }}>
          <div className="badge badge-cyan" style={{ marginBottom: '14px' }}>
            PLAYER 1 {p1?.id === user?.id && '(YOU)'}
          </div>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #00f2fe, #4facfe)',
            color: '#03101d',
            fontFamily: 'var(--font-display)',
            fontWeight: '800',
            fontSize: '1.6rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px auto'
          }}>
            {p1 ? p1.username.slice(0, 1).toUpperCase() : '?'}
          </div>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '6px' }}>{p1 ? p1.username : 'Connecting...'}</h3>
          <div>
            <span className={`badge ${p1?.is_ready ? 'badge-emerald' : 'badge-amber'}`}>
              {p1?.is_ready ? 'READY ✓' : 'NOT READY'}
            </span>
          </div>
        </div>

        {/* Player 2 Card */}
        <div className={`glass-panel ${p2?.is_ready ? 'glow-cyan' : ''}`} style={{ padding: '24px', textAlign: 'center' }}>
          <div className="badge badge-amber" style={{ marginBottom: '14px' }}>
            PLAYER 2 {p2?.id === user?.id && '(YOU)'}
          </div>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: p2 ? 'linear-gradient(135deg, #8e2de2, #4a00e0)' : 'rgba(255,255,255,0.06)',
            color: '#fff',
            fontFamily: 'var(--font-display)',
            fontWeight: '800',
            fontSize: '1.6rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px auto',
            border: p2 ? 'none' : '2px dashed rgba(255,255,255,0.15)'
          }}>
            {p2 ? p2.username.slice(0, 1).toUpperCase() : <Loader2 size={24} className="animate-spin" color="#64748b" />}
          </div>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '6px' }}>
            {p2 ? p2.username : 'Waiting for opponent...'}
          </h3>
          <div>
            {p2 ? (
              <span className={`badge ${p2.is_ready ? 'badge-emerald' : 'badge-amber'}`}>
                {p2.is_ready ? 'READY ✓' : 'NOT READY'}
              </span>
            ) : (
              <span className="badge badge-amber">WAITING TO JOIN</span>
            )}
          </div>
        </div>
      </div>

      {/* Ready Action Bar */}
      <div style={{ textAlign: 'center' }}>
        <button
          className={`btn ${isReady ? 'btn-secondary' : 'btn-primary'}`}
          style={{ fontSize: 'clamp(0.95rem, 3.5vw, 1.2rem)', padding: '14px 24px', width: '100%', maxWidth: '460px' }}
          onClick={handleReadyToggle}
          disabled={!p1 || !p2}
        >
          <ShieldCheck size={20} color={isReady ? "#00e676" : "#03101d"} style={{ flexShrink: 0 }} />
          <span>{isReady ? 'READY (WAITING FOR OPPONENT)' : 'I AM READY!'}</span>
        </button>
        {(!p1 || !p2) && (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '10px' }}>
            Both players must be in the room to start.
          </div>
        )}
      </div>
    </div>
  );
}
