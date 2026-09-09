import React, { useState, useEffect } from 'react';
import { useSound } from '../context/SoundContext';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';
import { X, Trophy, Flame, Medal, Award } from 'lucide-react';
import { getRankMeta } from '../utils/rankUtils';

export default function LeaderboardModal({ isOpen, onClose }) {
  useBodyScrollLock(isOpen);
  const { playClick } = useSound();
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchLeaderboard();
    }
  }, [isOpen]);

  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/leaderboard');
      if (res.ok) {
        const data = await res.json();
        setLeaders(data);
      }
    } catch (e) {
      console.error('Failed to load leaderboard:', e);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '640px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Trophy size={24} color="#ffb300" />
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem' }}>
              Global Duelists Hall of Fame
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

        {/* Table */}
        <div style={{
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
          overflow: 'hidden'
        }}>
          <div className="leaderboard-row" style={{
            background: 'rgba(0,0,0,0.25)',
            fontSize: '0.74rem',
            fontWeight: '700',
            color: 'var(--text-muted)',
            letterSpacing: '0.8px',
            textTransform: 'uppercase'
          }}>
            <div>#</div>
            <div>Player</div>
            <div style={{ textAlign: 'center' }}>Wins</div>
            <div className="leaderboard-col-winrate" style={{ textAlign: 'center' }}>Win %</div>
            <div style={{ textAlign: 'right' }}>Competitive Rank</div>
          </div>

          <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Loading rankings...
              </div>
            ) : leaders.length === 0 || leaders.every(l => (l.wins === 0 && (!l.player_rank || l.player_rank === 'Bronze III'))) ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No ranked players yet. Be the first to win!
              </div>
            ) : (
              leaders.map((player) => {
                const isGold = player.rank === 1;
                const isSilver = player.rank === 2;
                const isBronze = player.rank === 3;
                const pRank = player.player_rank || 'Bronze III';
                const rankMeta = getRankMeta(pRank);

                return (
                  <div 
                    key={player.user_id}
                    className="leaderboard-row"
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      background: isGold ? 'rgba(255, 179, 0, 0.05)' : 'transparent',
                      fontSize: '0.88rem'
                    }}
                  >
                    {/* Rank */}
                    <div style={{ display: 'flex', alignItems: 'center', fontWeight: '800' }}>
                      {isGold && <Medal size={18} color="#ffb300" />}
                      {isSilver && <Medal size={18} color="#cbd5e1" />}
                      {isBronze && <Medal size={18} color="#d97706" />}
                      {!isGold && !isSilver && !isBronze && player.rank}
                    </div>

                    {/* Player */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
                      <div style={{
                        width: '30px',
                        height: '30px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #00f2fe, #8e2de2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: '700',
                        fontSize: '0.82rem',
                        flexShrink: 0
                      }}>
                        {player.username.slice(0, 1).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0, overflow: 'hidden' }}>
                        <div style={{ fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{player.username}</div>
                        {player.current_streak > 1 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'var(--neon-amber)' }}>
                            <Flame size={11} fill="currentColor" /> {player.current_streak} streak
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Wins */}
                    <div style={{ textAlign: 'center', fontWeight: '700', color: 'var(--neon-emerald)' }}>
                      {player.wins}
                    </div>

                    {/* Win Rate */}
                    <div className="leaderboard-col-winrate" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                      {player.win_rate}%
                    </div>

                    {/* Competitive Rank Badge */}
                    <div style={{ textAlign: 'right' }}>
                      <span style={{
                        background: rankMeta.bg,
                        color: rankMeta.color,
                        border: `1px solid ${rankMeta.border}`,
                        fontSize: '0.74rem',
                        fontWeight: '800',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        {rankMeta.badge} {pRank}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
