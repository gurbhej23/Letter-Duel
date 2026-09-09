import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSound } from '../context/SoundContext';
import { useSocket } from '../context/SocketContext';
import {
  Trophy,
  Users,
  Swords,
  Crown,
  Zap,
  ArrowLeft,
  Send,
  Lock,
  CheckCircle2,
  Flame,
  Star,
  Sparkles,
  AlertCircle,
  Eye,
  Clock,
  Flag,
  AlertTriangle,
  Timer,
  X
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';

export default function TournamentPage({ onBackToHome, onEnterMatch }) {
  const { user, token } = useAuth();
  const { playClick, playHit, playMiss, playVictory } = useSound();
  const { addToast } = useSocket();

  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState('');
  const [activeRoundTab, setActiveRoundTab] = useState(1); // 1 = Quarters, 2 = Semis, 3 = Final (mobile)
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [showChampionModal, setShowChampionModal] = useState(false);
  const [showForfeitModal, setShowForfeitModal] = useState(false);

  useBodyScrollLock(showChampionModal || showForfeitModal);

  const wsRef = useRef(null);
  const chatEndRef = useRef(null);

  // 1. Initial Load of Active Tournament
  useEffect(() => {
    fetchActiveTournament();
  }, [token]);

  const fetchActiveTournament = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const res = await fetch('/api/tournaments/active', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTournament(data);
        if (data?.status === 'FINISHED' && data?.winner_id) {
          setShowChampionModal(true);
        }
      }
    } catch (e) {
      console.error('Error fetching tournament:', e);
    } finally {
      setLoading(false);
    }
  };

  // 2. Connect Tournament WebSocket
  useEffect(() => {
    if (!tournament?.id || !token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/tournament/${tournament.id}?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = jsonSafeParse(event.data);
        if (!msg) return;

        const { type, data } = msg;

        if (type === 'tournament_sync') {
          setTournament(data);
          if (data?.status === 'FINISHED' && data?.winner_id) {
            setShowChampionModal(true);
            triggerChampionConfetti();
          }
        } else if (type === 'tournament_player_joined') {
          setTournament((prev) => {
            if (!prev) return prev;
            const exists = prev.participants.some((p) => p.user_id === data.player.user_id);
            const updatedParticipants = exists
              ? prev.participants
              : [...prev.participants, { ...data.player, status: 'WAITING', eliminated: false }];
            return {
              ...prev,
              current_players: data.current_players,
              participants: updatedParticipants
            };
          });
          addToast(`⚔️ ${data.player.username} joined the tournament!`, 'primary');
        } else if (type === 'tournament_player_left') {
          setTournament((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              current_players: data.current_players,
              participants: prev.participants.filter((p) => p.user_id !== data.user_id)
            };
          });
        } else if (type === 'tournament_started') {
          setTournament(data.tournament);
          playVictory();
          addToast('🔥 8 Players Reached! The Knockout Tournament has begun!', 'primary');
          triggerChampionConfetti();
        } else if (type === 'tournament_bracket_updated') {
          setTournament(data.tournament);
          addToast('⚡ Tournament Bracket updated!', 'info');
        } else if (type === 'tournament_match_live') {
          setTournament((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              matches: prev.matches.map((m) =>
                m.id === data.match_id ? { ...m, status: 'LIVE' } : m
              )
            };
          });
        } else if (type === 'tournament_match_forfeit') {
          addToast(`⚡ Match #${data.match_number}: ${data.reason}`, 'warning');
          fetchActiveTournament();
        } else if (type === 'tournament_finished') {
          setTournament(data.tournament);
          setShowChampionModal(true);
          playVictory();
          triggerChampionConfetti();
        } else if (type === 'tournament_chat') {
          setChatMessages((prev) => [...prev.slice(-49), data]);
        }
      } catch (err) {
        console.error('Error handling tournament WS packet:', err);
      }
    };

    return () => {
      ws.close();
    };
  }, [tournament?.id, token]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const jsonSafeParse = (str) => {
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  };

  const triggerChampionConfetti = () => {
    confetti({
      particleCount: 100,
      spread: 80,
      origin: { y: 0.6 },
      colors: ['#00f2fe', '#8e2de2', '#ffb300', '#00e676']
    });
  };

  const handleJoinTournament = async () => {
    if (!tournament?.id || !token) return;
    playClick();
    setJoining(true);
    setError('');
    try {
      const res = await fetch(`/api/tournaments/${tournament.id}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to join tournament');
      setTournament(data);
      playHit();
      addToast('🎉 You entered the tournament queue!', 'primary');
    } catch (e) {
      playMiss();
      setError(e.message);
    } finally {
      setJoining(false);
    }
  };

  const handleLeaveTournament = async () => {
    if (!tournament?.id || !token) return;
    playClick();
    setLeaving(true);
    setError('');
    try {
      const res = await fetch(`/api/tournaments/${tournament.id}/leave`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to leave tournament');
      playHit();
      fetchActiveTournament();
      addToast('Left tournament queue.', 'info');
    } catch (e) {
      playMiss();
      setError(e.message);
    } finally {
      setLeaving(false);
    }
  };

  const handleSendChat = (e) => {
    e.preventDefault();
    const clean = chatInput.trim();
    if (!clean || !wsRef.current) return;
    wsRef.current.send(
      JSON.stringify({
        type: 'tournament_chat',
        data: { message: clean }
      })
    );
    setChatInput('');
  };

  // Helper flags
  const isParticipant = Boolean(
    tournament?.participants?.some((p) => p.user_id === user?.id)
  );
  const myParticipant = tournament?.participants?.find((p) => p.user_id === user?.id);
  const isEliminated = Boolean(myParticipant?.eliminated);
  const isChampion = tournament?.status === 'FINISHED' && tournament?.winner_id === user?.id;

  // Find if user has a match that is READY or LIVE right now
  const myActiveMatch = tournament?.matches?.find(
    (m) =>
      (m.player1_id === user?.id || m.player2_id === user?.id) &&
      (m.status === 'READY' || m.status === 'LIVE')
  );

  // Group matches by round for bracket rendering
  const qfMatches = tournament?.matches?.filter((m) => m.round === 1) || [];
  const sfMatches = tournament?.matches?.filter((m) => m.round === 2) || [];
  const finalMatch = tournament?.matches?.find((m) => m.round === 3);

  if (loading) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          <Trophy size={42} color="var(--neon-amber)" style={{ animation: 'spin 3s linear infinite', marginBottom: '14px' }} />
          <div style={{ fontSize: '1.1rem', fontWeight: '700' }}>Loading Tournament Arena...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: 'clamp(12px, 3vw, 24px)', width: '100%' }}>
      {/* Top Bar / Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => { playClick(); onBackToHome(); }}>
            <ArrowLeft size={16} />
            <span>Exit to Main Arena</span>
          </button>

          {/* Forfeit Tournament Action (only for active participants during IN_PROGRESS) */}
          {tournament?.status === 'IN_PROGRESS' && isParticipant && !isEliminated && (
            <button
              className="btn btn-secondary btn-sm"
              style={{
                borderColor: 'rgba(255, 42, 109, 0.4)',
                color: '#ff6b8b',
                background: 'rgba(255, 42, 109, 0.08)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
              onClick={() => {
                playClick();
                setShowForfeitModal(true);
              }}
            >
              <Flag size={14} />
              <span>Forfeit Tournament</span>
            </button>
          )}
        </div>

        {/* User Active Duel Alert Banner */}
        {myActiveMatch && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary glow-cyan btn-3d"
              style={{
                padding: '10px 22px',
                fontSize: '0.96rem',
                fontWeight: '800',
                animation: 'pulseGlow 2s infinite',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
              onClick={() => {
                playClick();
                onEnterMatch(myActiveMatch.room_code);
              }}
            >
              <Swords size={18} />
              <span>YOUR DUEL IS READY! ENTER MATCH</span>
            </button>
            {myActiveMatch.status === 'READY' && myActiveMatch.checkin_deadline && (
              <CountdownChip deadline={myActiveMatch.checkin_deadline} isUserMatch={true} />
            )}
          </div>
        )}
      </div>

      {/* Tournament Hero Header */}
      <div className="glass-panel tournament-hero-panel">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <Trophy size={28} color="#ffb300" />
              <h1
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(1.4rem, 4vw, 2rem)',
                  fontWeight: '900',
                  letterSpacing: '0.5px',
                  background: 'linear-gradient(90deg, var(--neon-cyan), var(--text-primary), #ffb300)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent'
                }}
              >
                {tournament?.name || 'Letter Duel Championship'}
              </h1>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              8-Player Knockout Duel • Single Elimination • Virtual Duel Coins & XP Rewards
            </p>
          </div>

          {/* Status Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-full)',
                fontWeight: '800',
                fontSize: '0.85rem',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                background:
                  tournament?.status === 'WAITING'
                    ? 'rgba(0, 242, 254, 0.15)'
                    : tournament?.status === 'IN_PROGRESS'
                    ? 'rgba(255, 179, 0, 0.2)'
                    : 'rgba(0, 230, 118, 0.2)',
                color:
                  tournament?.status === 'WAITING'
                    ? 'var(--neon-cyan)'
                    : tournament?.status === 'IN_PROGRESS'
                    ? 'var(--neon-amber)'
                    : 'var(--neon-emerald)',
                border: '1px solid currentColor'
              }}
            >
              {tournament?.status === 'WAITING'
                ? `Lobby: ${tournament?.current_players} / ${tournament?.max_players} Players`
                : tournament?.status === 'IN_PROGRESS'
                ? '🔴 Knockout In Progress'
                : '🏆 Tournament Finished'}
            </span>
          </div>
        </div>

        {/* Prize Pool Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '12px',
            marginTop: '20px',
            paddingTop: '16px',
            borderTop: '1px solid var(--border-subtle)'
          }}
        >
          <div className="tournament-prize-chip champion">
            <div style={{ fontSize: '0.74rem', color: 'var(--neon-amber)', fontWeight: '800', textTransform: 'uppercase' }}>🥇 Champion</div>
            <div style={{ fontSize: '1.05rem', fontWeight: '900', marginTop: '2px', color: 'var(--text-primary)' }}>+250 🪙 <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>+500 XP</span></div>
          </div>
          <div className="tournament-prize-chip runner-up">
            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: '800', textTransform: 'uppercase' }}>🥈 Runner-Up</div>
            <div style={{ fontSize: '1.05rem', fontWeight: '900', marginTop: '2px', color: 'var(--text-primary)' }}>+150 🪙 <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>+350 XP</span></div>
          </div>
          <div className="tournament-prize-chip semis">
            <div style={{ fontSize: '0.74rem', color: 'var(--neon-cyan)', fontWeight: '800', textTransform: 'uppercase' }}>🥉 Semi-Finalists</div>
            <div style={{ fontSize: '1.05rem', fontWeight: '900', marginTop: '2px', color: 'var(--text-primary)' }}>+100 🪙 <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>+200 XP</span></div>
          </div>
          <div className="tournament-prize-chip quarters">
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: '800', textTransform: 'uppercase' }}>🎖️ Quarter-Finalists</div>
            <div style={{ fontSize: '1.05rem', fontWeight: '900', marginTop: '2px', color: 'var(--text-primary)' }}>+50 🪙 <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>+100 XP</span></div>
          </div>
        </div>
      </div>

      {error && (
        <div
          style={{
            background: 'rgba(255, 42, 109, 0.15)',
            border: '1px solid rgba(255, 42, 109, 0.4)',
            color: '#ff6b8b',
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}
        >
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* STATE 1: TOURNAMENT LOBBY (WAITING FOR 8 PLAYERS) */}
      {tournament?.status === 'WAITING' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(0, 1.2fr)', gap: '20px' }} className="tourney-lobby-grid">
          {/* Left: 8 Player Slots */}
          <div className="glass-panel" style={{ padding: '24px', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div style={{ fontWeight: '800', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={20} color="var(--neon-cyan)" />
                <span>Duelists Joined ({tournament?.current_players} / {tournament?.max_players})</span>
              </div>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Auto-starts when 8 players join
              </span>
            </div>

            {/* 8 Grid Slots */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px', marginBottom: '24px' }}>
              {Array.from({ length: 8 }).map((_, idx) => {
                const participant = tournament?.participants?.[idx];
                const isMe = participant?.user_id === user?.id;

                return (
                  <div
                    key={idx}
                    style={{
                      background: participant
                        ? isMe
                          ? 'var(--neon-cyan-glow)'
                          : 'var(--bg-surface-elevated)'
                        : 'var(--bg-surface-elevated)',
                      border: participant
                        ? isMe
                          ? '1px solid var(--neon-cyan)'
                          : '1px solid var(--border-subtle)'
                        : '1px dashed var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      minHeight: '68px',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {participant ? (
                      <>
                        <div
                          style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '50%',
                            background: isMe
                              ? 'linear-gradient(135deg, #00f2fe, #8e2de2)'
                              : 'linear-gradient(135deg, #1e2638, #334155)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: '800',
                            fontSize: '0.95rem',
                            flexShrink: 0
                          }}
                        >
                          {participant.username.slice(0, 1).toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: '700', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {participant.username} {isMe && <span style={{ color: 'var(--neon-cyan)', fontSize: '0.75rem' }}>(You)</span>}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Star size={10} color="#ffb300" fill="#ffb300" />
                            <span>Level {participant.level || 1}</span>
                          </div>
                        </div>
                        <CheckCircle2 size={16} color="var(--neon-emerald)" style={{ flexShrink: 0 }} />
                      </>
                    ) : (
                      <div style={{ width: '100%', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                        Slot {idx + 1}: Waiting...
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
              {!isParticipant ? (
                <button
                  className="btn btn-primary glow-cyan btn-3d"
                  style={{ flex: 1, padding: '14px 24px', fontSize: '1.05rem', fontWeight: '800' }}
                  onClick={handleJoinTournament}
                  disabled={joining}
                >
                  <Swords size={20} />
                  <span>{joining ? 'Joining Tournament...' : 'ENTER TOURNAMENT QUEUE'}</span>
                </button>
              ) : (
                <button
                  className="btn btn-secondary"
                  style={{ padding: '12px 24px', fontSize: '0.92rem', color: '#ff6b8b', borderColor: 'rgba(255, 42, 109, 0.4)' }}
                  onClick={handleLeaveTournament}
                  disabled={leaving}
                >
                  <span>{leaving ? 'Leaving...' : 'Leave Tournament Queue'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Right: Tournament Chatbox */}
          <div className="glass-panel" style={{ padding: '20px', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', height: '420px' }}>
            <div style={{ fontWeight: '800', fontSize: '0.95rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={16} color="var(--neon-amber)" />
              <span>Tournament Lobby Chat</span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px', marginBottom: '12px' }}>
              {chatMessages.length === 0 ? (
                <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                  Say hi to your fellow duelists while the bracket fills!
                </div>
              ) : (
                chatMessages.map((c, i) => (
                  <div key={i} style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', fontSize: '0.84rem' }}>
                    <span style={{ fontWeight: '700', color: 'var(--neon-cyan)', marginRight: '6px' }}>{c.sender_username}:</span>
                    <span style={{ color: 'var(--text-primary)' }}>{c.message}</span>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={handleSendChat} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className="input-field"
                placeholder="Send message to lobby..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                maxLength={300}
                style={{ flex: 1, fontSize: '0.88rem', padding: '10px 14px' }}
              />
              <button type="submit" className="btn btn-primary btn-icon" style={{ width: '40px', height: '40px', flexShrink: 0 }}>
                <Send size={16} />
              </button>
            </form>
          </div>
        </div>
      ) : (
        /* STATE 2: KNOCKOUT BRACKET (IN PROGRESS OR FINISHED) */
        <div>
          {/* Mobile Round Selector Tabs */}
          <div className="bracket-mobile-tabs" style={{ display: 'none', gap: '8px', marginBottom: '20px' }}>
            <button
              className={`btn ${activeRoundTab === 1 ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              style={{ flex: 1 }}
              onClick={() => { playClick(); setActiveRoundTab(1); }}
            >
              Quarters (4)
            </button>
            <button
              className={`btn ${activeRoundTab === 2 ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              style={{ flex: 1 }}
              onClick={() => { playClick(); setActiveRoundTab(2); }}
            >
              Semis (2)
            </button>
            <button
              className={`btn ${activeRoundTab === 3 ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              style={{ flex: 1 }}
              onClick={() => { playClick(); setActiveRoundTab(3); }}
            >
              Final 🏆
            </button>
          </div>

          {/* Desktop Knockout Visual Bracket */}
          <div className="knockout-bracket-container">
            {/* Round 1: Quarter Finals */}
            <div className={`bracket-round-col ${activeRoundTab === 1 ? 'active-mobile-col' : ''}`}>
              <div className="bracket-col-header">
                <span style={{ color: 'var(--neon-cyan)' }}>ROUND 1</span>
                <h3>QUARTER FINALS</h3>
              </div>
              <div className="bracket-matches-stack">
                {qfMatches.map((m) => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    currentUserId={user?.id}
                    onEnterMatch={onEnterMatch}
                  />
                ))}
              </div>
            </div>

            {/* Desktop Connector 1: QF -> SF */}
            <div className="bracket-connector-col">
              <svg className="bracket-svg" viewBox="0 0 40 400" preserveAspectRatio="none">
                {/* Branch 1: QF 1 & QF 2 -> SF 1 */}
                <path d="M 0 50 H 20 V 100 H 40" className="bracket-line" />
                <path d="M 0 150 H 20 V 100 H 40" className="bracket-line" />
                {/* Branch 2: QF 3 & QF 4 -> SF 2 */}
                <path d="M 0 250 H 20 V 300 H 40" className="bracket-line" />
                <path d="M 0 350 H 20 V 300 H 40" className="bracket-line" />
              </svg>
            </div>

            {/* Round 2: Semi Finals */}
            <div className={`bracket-round-col ${activeRoundTab === 2 ? 'active-mobile-col' : ''}`}>
              <div className="bracket-col-header">
                <span style={{ color: 'var(--neon-amber)' }}>ROUND 2</span>
                <h3>SEMI FINALS</h3>
              </div>
              <div className="bracket-matches-stack semi-final-stack">
                {sfMatches.map((m) => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    currentUserId={user?.id}
                    onEnterMatch={onEnterMatch}
                  />
                ))}
              </div>
            </div>

            {/* Desktop Connector 2: SF -> Final */}
            <div className="bracket-connector-col">
              <svg className="bracket-svg" viewBox="0 0 40 400" preserveAspectRatio="none">
                {/* SF 1 & SF 2 -> Grand Final */}
                <path d="M 0 100 H 20 V 200 H 40" className="bracket-line" />
                <path d="M 0 300 H 20 V 200 H 40" className="bracket-line" />
              </svg>
            </div>

            {/* Round 3: Grand Final */}
            <div className={`bracket-round-col ${activeRoundTab === 3 ? 'active-mobile-col' : ''}`}>
              <div className="bracket-col-header">
                <span style={{ color: 'var(--neon-emerald)' }}>ROUND 3</span>
                <h3>GRAND FINAL 🏆</h3>
              </div>
              <div className="bracket-matches-stack final-stack">
                {finalMatch && (
                  <MatchCard
                    match={finalMatch}
                    currentUserId={user?.id}
                    onEnterMatch={onEnterMatch}
                    isGrandFinal={true}
                  />
                )}

                {/* Champion Podium Showcase */}
                {tournament?.status === 'FINISHED' && tournament?.winner_username && (
                  <div
                    className="glass-panel card-3d-tilt"
                    style={{
                      marginTop: '20px',
                      padding: '24px',
                      borderRadius: 'var(--radius-lg)',
                      textAlign: 'center',
                      background: 'radial-gradient(circle, rgba(255, 179, 0, 0.2) 0%, var(--bg-surface) 80%)',
                      border: '2px solid #ffb300',
                      boxShadow: '0 0 35px rgba(255, 179, 0, 0.25)'
                    }}
                  >
                    <Crown size={36} color="#ffb300" style={{ marginBottom: '8px', filter: 'drop-shadow(0 0 10px #ffb300)' }} />
                    <div style={{ fontSize: '0.78rem', color: '#ffb300', fontWeight: '800', letterSpacing: '1px', textTransform: 'uppercase' }}>
                      Tournament Champion
                    </div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: '900', margin: '4px 0' }}>
                      {tournament.winner_username}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--neon-emerald)', fontWeight: '800' }}>
                      +250 🪙 • +500 XP • 👑 Crown Title
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Grand Champion Celebration Modal */}
      {showChampionModal && tournament?.status === 'FINISHED' && (
        <div className="modal-overlay">
          <div
            className="modal-content"
            style={{
              maxWidth: '480px',
              textAlign: 'center',
              padding: '36px 24px',
              background: 'radial-gradient(circle, rgba(255, 179, 0, 0.25) 0%, var(--modal-bg) 80%)',
              border: '2px solid #ffb300',
              boxShadow: '0 0 50px rgba(255, 179, 0, 0.35)',
              position: 'relative'
            }}
          >
            <button
              type="button"
              className="btn btn-secondary btn-icon"
              style={{ position: 'absolute', top: '14px', right: '14px', width: '32px', height: '32px' }}
              onClick={() => setShowChampionModal(false)}
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <div style={{ position: 'relative', display: 'inline-block', marginBottom: '14px' }}>
              <Trophy size={68} color="#ffb300" style={{ filter: 'drop-shadow(0 0 20px #ffb300)', animation: 'float3D 4s ease-in-out infinite' }} />
              <Crown size={30} color="#fff" style={{ position: 'absolute', top: '-14px', right: '-8px' }} />
            </div>

            <div style={{ fontSize: '0.85rem', letterSpacing: '2px', textTransform: 'uppercase', color: '#ffb300', fontWeight: '800', marginBottom: '6px' }}>
              ✨ Tournament Complete ✨
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: '900', marginBottom: '8px' }}>
              {tournament.winner_username}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginBottom: '22px' }}>
              Crown Champion of the Letter Duel 8-Player Knockout Arena!
            </p>

            <div style={{ background: 'var(--bg-surface-elevated)', padding: '16px', borderRadius: 'var(--radius-md)', marginBottom: '24px', display: 'flex', justifyContent: 'space-around', border: '1px solid var(--border-subtle)' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Champion Coins</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#ffb300' }}>+250 🪙</div>
              </div>
              <div style={{ width: '1px', background: 'var(--border-subtle)' }} />
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Champion XP</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '900', color: 'var(--neon-cyan)' }}>+500 XP</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                className="btn btn-primary glow-cyan btn-3d"
                style={{ flex: 1 }}
                onClick={() => {
                  playClick();
                  setShowChampionModal(false);
                }}
              >
                View Final Bracket
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  playClick();
                  setShowChampionModal(false);
                  onBackToHome();
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Forfeit Confirmation Modal */}
      {showForfeitModal && (
        <div className="modal-overlay">
          <div
            className="modal-content"
            style={{
              maxWidth: '440px',
              textAlign: 'center',
              padding: '28px 24px',
              background: 'radial-gradient(circle, rgba(255, 42, 109, 0.18) 0%, var(--modal-bg) 80%)',
              border: '1px solid rgba(255, 42, 109, 0.45)',
              boxShadow: '0 0 35px rgba(255, 42, 109, 0.2)'
            }}
          >
            <div style={{ color: '#ff2a6d', marginBottom: '12px' }}>
              <AlertTriangle size={48} style={{ filter: 'drop-shadow(0 0 10px #ff2a6d)' }} />
            </div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: '800', marginBottom: '8px' }}>
              Surrender Tournament Match?
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: '1.5', marginBottom: '22px' }}>
              Are you sure you want to forfeit? Your opponent will automatically be awarded a walkover victory and advance to the next knockout round.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => {
                  playClick();
                  setShowForfeitModal(false);
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                style={{
                  flex: 1,
                  background: 'linear-gradient(135deg, #ff2a6d, #ff5e62)',
                  borderColor: '#ff2a6d',
                  fontWeight: '800'
                }}
                disabled={leaving}
                onClick={async () => {
                  setShowForfeitModal(false);
                  await handleLeaveTournament();
                }}
              >
                {leaving ? 'Surrendering...' : 'Confirm Surrender'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Subcomponent: Live Check-in Countdown Timer Chip
function CountdownChip({ deadline, isUserMatch }) {
  const [secondsRemaining, setSecondsRemaining] = useState(null);

  useEffect(() => {
    if (!deadline) return;

    const calc = () => {
      const isoStr = deadline.endsWith('Z') || deadline.includes('+') ? deadline : `${deadline}Z`;
      const target = new Date(isoStr).getTime();
      const diff = Math.max(0, Math.floor((target - Date.now()) / 1000));
      setSecondsRemaining(diff);
    };

    calc();
    const interval = setInterval(calc, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  if (secondsRemaining === null) return null;

  const mm = Math.floor(secondsRemaining / 60);
  const ss = secondsRemaining % 60;
  const formatted = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  const isUrgent = secondsRemaining <= 15;

  if (secondsRemaining <= 0) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          fontSize: '0.72rem',
          fontWeight: '800',
          padding: '3px 8px',
          borderRadius: 'var(--radius-full)',
          background: 'rgba(255, 42, 109, 0.2)',
          color: '#ff6b8b',
          border: '1px solid #ff2a6d'
        }}
      >
        <AlertTriangle size={11} />
        <span>Advancing by forfeit...</span>
      </span>
    );
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        fontSize: '0.72rem',
        fontWeight: '800',
        padding: '3px 9px',
        borderRadius: 'var(--radius-full)',
        background: isUrgent
          ? 'rgba(255, 42, 109, 0.2)'
          : isUserMatch
          ? 'rgba(255, 179, 0, 0.18)'
          : 'rgba(0, 242, 254, 0.14)',
        color: isUrgent ? '#ff6b8b' : isUserMatch ? 'var(--neon-amber)' : 'var(--neon-cyan)',
        border: `1px solid ${isUrgent ? '#ff2a6d' : isUserMatch ? 'var(--neon-amber)' : 'var(--neon-cyan)'}`,
        boxShadow: isUrgent ? '0 0 10px rgba(255, 42, 109, 0.4)' : 'none',
        animation: isUrgent ? 'pulseGlow 1s infinite' : 'none'
      }}
    >
      <Clock size={11} style={{ animation: isUrgent ? 'spin 2s linear infinite' : 'none' }} />
      <span>{formatted}</span>
      <span style={{ fontSize: '0.64rem', opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {isUrgent ? 'Auto-Forfeit' : 'Check-in'}
      </span>
    </span>
  );
}

// Subcomponent: Polished Knockout Match Card
function MatchCard({ match, currentUserId, onEnterMatch, isGrandFinal = false }) {
  const { playClick } = useSound();

  const isPlayer1 = match.player1_id === currentUserId;
  const isPlayer2 = match.player2_id === currentUserId;
  const isUserInMatch = isPlayer1 || isPlayer2;
  const isLive = match.status === 'LIVE';
  const isReady = match.status === 'READY';
  const isCompleted = match.status === 'COMPLETED';
  const isLocked = match.status === 'LOCKED';

  const roundName =
    match.round === 1
      ? `Quarter Final ${match.match_number}`
      : match.round === 2
      ? `Semi Final ${match.match_number - 4}`
      : 'Grand Championship Final';

  return (
    <div
      className="glass-panel match-bracket-card"
      style={{
        padding: '14px',
        borderRadius: 'var(--radius-md)',
        background: isUserInMatch && (isReady || isLive)
          ? 'linear-gradient(135deg, rgba(0, 242, 254, 0.15), var(--bg-surface))'
          : isCompleted
          ? 'var(--bg-surface-elevated)'
          : 'var(--bg-surface)',
        border: isUserInMatch && (isReady || isLive)
          ? '2px solid var(--neon-cyan)'
          : isGrandFinal
          ? '2px solid rgba(255, 179, 0, 0.45)'
          : '1px solid var(--border-subtle)',
        boxShadow: isUserInMatch && (isReady || isLive)
          ? '0 0 24px rgba(0, 242, 254, 0.3)'
          : '0 4px 14px rgba(0,0,0,0.08)',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between'
      }}
    >
      {/* Match Header: Title & Status / Live Timer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '6px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.72rem', fontWeight: '800', letterSpacing: '0.8px', color: isGrandFinal ? '#ffb300' : 'var(--text-muted)', textTransform: 'uppercase' }}>
          {roundName}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Live Check-in Countdown Timer */}
          {isReady && match.checkin_deadline && (
            <CountdownChip deadline={match.checkin_deadline} isUserMatch={isUserInMatch} />
          )}

          {/* Status Badge */}
          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: '800',
              padding: '3px 8px',
              borderRadius: 'var(--radius-full)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              background: match.is_forfeit
                ? 'rgba(0, 230, 118, 0.15)'
                : isLive
                ? 'rgba(255, 42, 109, 0.2)'
                : isReady
                ? 'rgba(0, 242, 254, 0.15)'
                : isCompleted
                ? 'rgba(0, 230, 118, 0.12)'
                : 'rgba(255, 255, 255, 0.05)',
              color: match.is_forfeit
                ? 'var(--neon-emerald)'
                : isLive
                ? '#ff6b8b'
                : isReady
                ? 'var(--neon-cyan)'
                : isCompleted
                ? 'var(--neon-emerald)'
                : 'var(--text-muted)',
              border: match.is_forfeit
                ? '1px solid rgba(0, 230, 118, 0.4)'
                : isLive
                ? '1px solid #ff2a6d'
                : 'none'
            }}
          >
            {match.is_forfeit
              ? '⚡ Won by Forfeit'
              : isLive
              ? '🔴 LIVE'
              : isReady
              ? 'READY'
              : isCompleted
              ? '✓ COMPLETED'
              : '🔒 WAITING'}
          </span>
        </div>
      </div>

      {/* Player 1 Row */}
      <PlayerSlot
        username={match.player1_username}
        level={match.player1_level}
        isWinner={isCompleted && match.winner_id === match.player1_id}
        isLoser={isCompleted && match.winner_id && match.winner_id !== match.player1_id}
        isMe={isPlayer1}
      />

      {/* VS Separator */}
      <div style={{ display: 'flex', alignItems: 'center', margin: '4px 0', opacity: 0.6 }}>
        <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.08)' }} />
        <span style={{ fontSize: '0.68rem', fontWeight: '900', color: 'var(--text-muted)', padding: '0 8px' }}>VS</span>
        <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.08)' }} />
      </div>

      {/* Player 2 Row */}
      <PlayerSlot
        username={match.player2_username}
        level={match.player2_level}
        isWinner={isCompleted && match.winner_id === match.player2_id}
        isLoser={isCompleted && match.winner_id && match.winner_id !== match.player2_id}
        isMe={isPlayer2}
      />

      {/* Urgent Prompt if user is in a READY match */}
      {isUserInMatch && isReady && (
        <div
          style={{
            marginTop: '8px',
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(255, 179, 0, 0.1)',
            border: '1px solid rgba(255, 179, 0, 0.3)',
            fontSize: '0.74rem',
            color: 'var(--neon-amber)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <Clock size={12} style={{ flexShrink: 0 }} />
          <span>Enter duel now! Check-in expires in 60s.</span>
        </div>
      )}

      {/* Action Area: Enter Duel or Watch */}
      {isUserInMatch && (isReady || isLive) ? (
        <button
          className="btn btn-primary btn-sm glow-cyan btn-3d"
          style={{ width: '100%', marginTop: '10px', fontWeight: '800', fontSize: '0.82rem' }}
          onClick={() => {
            playClick();
            onEnterMatch(match.room_code);
          }}
        >
          <Swords size={14} />
          <span>ENTER DUEL NOW</span>
        </button>
      ) : isLive ? (
        <button
          className="btn btn-secondary btn-sm"
          style={{ width: '100%', marginTop: '10px', fontSize: '0.78rem', color: 'var(--neon-cyan)' }}
          onClick={() => {
            playClick();
            onEnterMatch(match.room_code);
          }}
        >
          <Eye size={13} />
          <span>WATCH DUEL</span>
        </button>
      ) : null}
    </div>
  );
}

function PlayerSlot({ username, level, isWinner, isLoser, isMe }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 10px',
        borderRadius: 'var(--radius-sm)',
        background: isWinner
          ? 'rgba(0, 230, 118, 0.12)'
          : isMe
          ? 'rgba(0, 242, 254, 0.08)'
          : 'rgba(255, 255, 255, 0.03)',
        border: isWinner ? '1px solid rgba(0, 230, 118, 0.4)' : '1px solid transparent',
        opacity: isLoser ? 0.5 : 1
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        <div
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            background: username
              ? isWinner
                ? 'linear-gradient(135deg, #00e676, #00b0ff)'
                : 'linear-gradient(135deg, #00f2fe, #8e2de2)'
              : '#1e2638',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.72rem',
            fontWeight: '800',
            flexShrink: 0
          }}
        >
          {username ? username.slice(0, 1).toUpperCase() : '?'}
        </div>
        <div
          style={{
            fontSize: '0.85rem',
            fontWeight: isWinner ? '800' : '600',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: isWinner ? 'var(--neon-emerald)' : isLoser ? 'var(--text-muted)' : 'inherit',
            textDecoration: isLoser ? 'line-through' : 'none'
          }}
        >
          {username || <span style={{ color: 'var(--text-muted)' }}>Waiting...</span>}
          {isMe && <span style={{ color: 'var(--neon-cyan)', fontSize: '0.72rem', marginLeft: '4px' }}>(You)</span>}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {level && (
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '2px' }}>
            <Star size={10} color="#ffb300" fill="#ffb300" /> {level}
          </span>
        )}
        {isWinner && <Crown size={15} color="#ffb300" style={{ filter: 'drop-shadow(0 0 6px #ffb300)' }} />}
      </div>
    </div>
  );
}
