import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSound } from '../context/SoundContext';
import { useSocket } from '../context/SocketContext';
import { Copy, Check, Share2, Users, ArrowLeft, ShieldCheck, Loader2, Link2, Sparkles } from 'lucide-react';

export default function LobbyPage({ roomCode, onLeaveRoom, onOpenFriends }) {
  const { user } = useAuth();
  const { playClick, playHit } = useSound();
  const { gameState, sendEvent, addToast } = useSocket();

  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const inviteUrl = `${window.location.origin}?join=${roomCode}`;

  const handleCopyCode = () => {
    playClick();
    navigator.clipboard.writeText(roomCode);
    setCopiedCode(true);
    addToast(`Room code ${roomCode} copied to clipboard!`, "success");
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleCopyLink = () => {
    playClick();
    navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    addToast(`Invite link copied to clipboard!`, "success");
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleShareInvite = async () => {
    playClick();
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Letter Duel - 1v1 Battle',
          text: `Challenge me to a 1v1 Letter Duel! Room Code: ${roomCode}`,
          url: inviteUrl,
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }
    handleCopyLink();
  };

  const handleReadyToggle = () => {
    playHit();
    sendEvent('player_ready');
  };

  const p1 = gameState?.player1;
  const p2 = gameState?.player2;
  const isP1 = p1 ? p1.id === user?.id : true;
  const myPlayer = isP1 ? p1 : p2;
  const isReady = myPlayer?.is_ready || false;

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', padding: 'clamp(20px, 4vw, 40px) clamp(12px, 3vw, 20px)' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '10px', flexWrap: 'wrap' }}>
        <button 
          className="btn btn-secondary btn-sm"
          onClick={() => { playClick(); onLeaveRoom(); }}
        >
          <ArrowLeft size={16} /> Leave Room
        </button>

        {gameState?.is_private && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => { playClick(); onOpenFriends(); }}
          >
            <Users size={16} color="#00e676" /> Invite Duelist
          </button>
        )}
      </div>

      {/* Main Room Banner: Show code ONLY for private rooms */}
      {gameState?.is_private ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: 'clamp(24px, 4vw, 36px) clamp(14px, 3vw, 20px)', marginBottom: '28px' }}>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '10px', fontWeight: '800' }}>
            PRIVATE DUEL ROOM CODE
          </div>

          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'clamp(8px, 2vw, 16px)',
            background: 'rgba(0, 0, 0, 0.45)',
            border: '2px solid var(--border-glow)',
            padding: 'clamp(10px, 2.5vw, 14px) clamp(14px, 3vw, 28px)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-cyan)',
            marginBottom: '16px',
            maxWidth: '100%'
          }}>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'clamp(1.6rem, 5.5vw, 2.8rem)',
              fontWeight: '900',
              letterSpacing: 'clamp(3px, 1.2vw, 8px)',
              color: 'var(--neon-cyan)'
            }}>
              {roomCode}
            </span>
            <button 
              className="btn btn-secondary btn-icon"
              onClick={handleCopyCode}
              title="Copy Room Code"
              aria-label="Copy Room Code"
            >
              {copiedCode ? <Check size={20} color="#00e676" /> : <Copy size={20} color="#00f2fe" />}
            </button>
          </div>

          {/* Action buttons: Copy Link & Share */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
            <button className="btn btn-secondary btn-sm" onClick={handleCopyLink}>
              {copiedLink ? <Check size={14} color="#00e676" /> : <Link2 size={14} color="#00f2fe" />}
              <span>{copiedLink ? 'Link Copied!' : 'Copy Invite Link'}</span>
            </button>
            <button className="btn btn-secondary btn-sm" onClick={handleShareInvite}>
              <Share2 size={14} color="#ffb300" />
              <span>Share Duel</span>
            </button>
          </div>

          <div style={{ color: 'var(--text-secondary)', fontSize: 'clamp(0.85rem, 2.5vw, 0.92rem)', maxWidth: '480px', margin: '0 auto' }}>
            Share this 6-character code or direct link with your opponent to begin the 1v1 duel.
          </div>
        </div>
      ) : (
        <div className="glass-panel" style={{ textAlign: 'center', padding: 'clamp(24px, 4vw, 36px) clamp(14px, 3vw, 20px)', marginBottom: '28px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(0, 242, 254, 0.1)', border: '1px solid var(--border-glow)', padding: '6px 18px', borderRadius: '20px', marginBottom: '16px' }}>
            <Sparkles size={16} color="var(--neon-cyan)" />
            <span style={{ fontSize: '0.85rem', fontWeight: '800', color: 'var(--neon-cyan)', letterSpacing: '2px', textTransform: 'uppercase' }}>
              1v1 Global Matchmaking
            </span>
          </div>

          <h2 style={{ fontSize: 'clamp(1.5rem, 4.5vw, 2.3rem)', fontWeight: '900', margin: '0 0 10px 0', letterSpacing: '-0.5px' }}>
            Online Duel Arena
          </h2>

          <div style={{ color: 'var(--text-secondary)', fontSize: 'clamp(0.85rem, 2.5vw, 0.96rem)', maxWidth: '520px', margin: '0 auto' }}>
            Opponent matched! Both players must click <strong>READY</strong> to begin secret word selection.
          </div>
        </div>
      )}

      {/* Duelists Cards (Player 1 VS Player 2) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
        gap: '20px',
        alignItems: 'center',
        marginBottom: '32px'
      }}>
        {/* Player 1 Card */}
        <div className={`glass-panel ${p1?.is_ready ? 'glow-cyan' : ''}`} style={{ padding: 'clamp(18px, 3vw, 24px)', textAlign: 'center', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <span className="badge badge-cyan">
              PLAYER 1 {isP1 && '(YOU)'}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.78rem', color: '#00e676', fontWeight: '700' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00e676', display: 'inline-block', boxShadow: '0 0 8px #00e676' }} />
              ONLINE
            </span>
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
            {p1 ? p1.username.slice(0, 1).toUpperCase() : (user ? user.username.slice(0, 1).toUpperCase() : '?')}
          </div>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '6px' }}>
            {p1 ? p1.username : (user ? user.username : 'Player 1')}
          </h3>
          <div>
            <span className={`badge ${p1?.is_ready ? 'badge-emerald' : 'badge-amber'}`}>
              {p1?.is_ready ? 'READY ✓' : 'NOT READY'}
            </span>
          </div>
        </div>

        {/* Player 2 Card */}
        <div className={`glass-panel ${p2?.is_ready ? 'glow-cyan' : ''}`} style={{ padding: 'clamp(18px, 3vw, 24px)', textAlign: 'center', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <span className="badge badge-amber">
              PLAYER 2 {!isP1 && '(YOU)'}
            </span>
            {p2 ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.78rem', color: '#00e676', fontWeight: '700' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00e676', display: 'inline-block', boxShadow: '0 0 8px #00e676' }} />
                ONLINE
              </span>
            ) : (
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                OFFLINE
              </span>
            )}
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
            {p2 ? p2.username.slice(0, 1).toUpperCase() : <Loader2 size={24} className="spin" style={{ animation: 'spin 2s linear infinite' }} color="#64748b" />}
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
          style={{ fontSize: 'clamp(0.95rem, 3.5vw, 1.2rem)', padding: '14px 24px', width: '100%', maxWidth: '460px', minHeight: '48px', whiteSpace: 'normal', lineHeight: 1.3 }}
          onClick={handleReadyToggle}
          disabled={!p2}
        >
          <ShieldCheck size={20} color={isReady ? "#00e676" : "#03101d"} style={{ flexShrink: 0 }} />
          <span>{isReady ? 'READY (WAITING FOR OPPONENT)' : 'I AM READY!'}</span>
        </button>
        {!p2 && (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '10px' }}>
            Waiting for Player 2 to join before duel can begin.
          </div>
        )}
      </div>
    </div>
  );
}
