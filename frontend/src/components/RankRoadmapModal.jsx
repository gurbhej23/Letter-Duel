import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useSound } from '../context/SoundContext';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';
import { 
  X, 
  Trophy, 
  Flame, 
  Shield, 
  Zap, 
  CheckCircle2, 
  Lock, 
  ChevronRight, 
  Award, 
  Sparkles,
  Swords
} from 'lucide-react';
import { 
  RANK_THRESHOLDS, 
  RANK_INFO, 
  getRankProgress, 
  getRankMeta, 
  getRankTierIndex 
} from '../utils/rankUtils';

export default function RankRoadmapModal({ isOpen, onClose }) {
  useBodyScrollLock(isOpen);
  const { user } = useAuth();
  const { playClick } = useSound();

  if (!isOpen) return null;

  const currentRating = user?.rating || 800;
  const progress = getRankProgress(currentRating);
  const userRank = progress.currentRank;
  const userTierIdx = getRankTierIndex(userRank);

  // Group thresholds by tier for clean presentation (reverse to display Bronze -> Grandmaster)
  const ascendingThresholds = [...RANK_THRESHOLDS].reverse();

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div 
        className="modal-content" 
        style={{ 
          maxWidth: '680px', 
          maxHeight: '90vh', 
          display: 'flex', 
          flexDirection: 'column',
          padding: '0',
          overflow: 'hidden',
          border: '1px solid var(--border-subtle)'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--bg-surface)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, rgba(255, 179, 0, 0.2), rgba(0, 242, 254, 0.2))',
              border: '1px solid rgba(255, 179, 0, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Trophy size={20} color="#ffb300" />
            </div>
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', margin: 0, fontWeight: 800 }}>
                Competitive Leagues & Ranking
              </h2>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Climb from Bronze III to Grandmaster by winning online duels!
              </p>
            </div>
          </div>
          <button 
            className="btn btn-secondary btn-icon" 
            style={{ width: '32px', height: '32px' }}
            onClick={() => { playClick(); onClose(); }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          
          {/* Active Player Standing Banner */}
          {user && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(14, 22, 38, 0.95), rgba(20, 28, 48, 0.95))',
              border: `1px solid ${progress.meta.border}`,
              borderRadius: 'var(--radius-lg)',
              padding: '18px 20px',
              marginBottom: '20px',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: `0 8px 28px ${progress.meta.glow}`
            }}>
              {/* Subtle background tier badge watermark */}
              <div style={{
                position: 'absolute',
                right: '-10px',
                top: '-15px',
                fontSize: '6.5rem',
                opacity: 0.12,
                pointerEvents: 'none',
                userSelect: 'none'
              }}>
                {progress.meta.badge}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '50%',
                    background: progress.meta.bg,
                    border: `2px solid ${progress.meta.color}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.8rem',
                    boxShadow: `0 0 16px ${progress.meta.glow}`
                  }}>
                    {progress.meta.badge}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 900, fontSize: '1.2rem', color: progress.meta.color }}>
                        {progress.currentRank}
                      </span>
                      <span style={{
                        background: 'rgba(255, 255, 255, 0.08)',
                        color: 'var(--text-secondary)',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '12px'
                      }}>
                        Active Rank
                      </span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      <strong style={{ color: '#fff', fontFamily: 'var(--font-mono)' }}>{progress.rating} RP</strong> (Rating Points)
                    </div>
                  </div>
                </div>

                {/* Next Division Target Pill */}
                <div style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '8px 14px',
                  textAlign: 'right'
                }}>
                  {progress.isMaxRank ? (
                    <div style={{ color: '#00e676', fontWeight: 800, fontSize: '0.85rem' }}>
                      🔱 Maximum Rank Achieved!
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                        Target: <strong style={{ color: progress.nextMeta?.color }}>{progress.nextRank}</strong> ({progress.nextThreshold} RP)
                      </div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--neon-cyan)', marginTop: '2px' }}>
                        {progress.pointsNeeded} RP needed (~{progress.estimatedWins} wins)
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Progress Bar towards Next Rank */}
              {!progress.isMaxRank && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                    <span>Progress to {progress.nextRank}</span>
                    <span style={{ fontWeight: 800, color: 'var(--neon-emerald)' }}>{progress.percent}%</span>
                  </div>
                  <div style={{
                    width: '100%',
                    height: '10px',
                    borderRadius: '5px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    overflow: 'hidden',
                    position: 'relative'
                  }}>
                    <div style={{
                      width: `${progress.percent}%`,
                      height: '10px',
                      borderRadius: '5px',
                      background: progress.meta.gradient || 'linear-gradient(90deg, #00f2fe, #00e676)',
                      boxShadow: `0 0 10px ${progress.meta.color}`,
                      transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)'
                    }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Quick Rules Legend */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '10px',
            marginBottom: '22px'
          }}>
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 12px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--neon-emerald)', fontWeight: 800 }}>⚔️ VICTORY</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 900, fontFamily: 'var(--font-mono)', color: 'var(--neon-emerald)', marginTop: '2px' }}>
                +25 RP
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Base match win</div>
            </div>

            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 12px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '0.75rem', color: '#ffb300', fontWeight: 800 }}>🔥 STREAK (3+)</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 900, fontFamily: 'var(--font-mono)', color: '#ffb300', marginTop: '2px' }}>
                +5 RP
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Extra bonus per win</div>
            </div>

            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 12px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--neon-rose)', fontWeight: 800 }}>🔻 DEFEAT</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 900, fontFamily: 'var(--font-mono)', color: 'var(--neon-rose)', marginTop: '2px' }}>
                -15 RP
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Match loss</div>
            </div>

            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 12px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--neon-cyan)', fontWeight: 800 }}>🛡️ TIER FLOOR</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 900, fontFamily: 'var(--font-mono)', color: 'var(--neon-cyan)', marginTop: '2px' }}>
                800 RP
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Cannot drop below</div>
            </div>
          </div>

          {/* Full Rank Divisions Ladder */}
          <div style={{ marginBottom: '10px' }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              marginBottom: '12px' 
            }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>
                Rank Divisions & Arena Unlocks
              </h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>17 Divisions Total</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {ascendingThresholds.map((t) => {
                const isCurrent = t.rank === userRank;
                const tierIdx = getRankTierIndex(t.rank);
                const isPassed = tierIdx < userTierIdx;
                const isLocked = tierIdx > userTierIdx;
                const meta = getRankMeta(t.rank);

                return (
                  <div
                    key={t.rank}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 16px',
                      borderRadius: 'var(--radius-md)',
                      background: isCurrent 
                        ? 'linear-gradient(90deg, rgba(0, 242, 254, 0.15), rgba(142, 45, 226, 0.12))' 
                        : (isPassed ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.01)'),
                      border: isCurrent 
                        ? `2px solid var(--neon-cyan)` 
                        : (isPassed ? '1px solid rgba(0, 230, 118, 0.2)' : '1px solid var(--border-subtle)'),
                      position: 'relative',
                      boxShadow: isCurrent ? '0 0 16px rgba(0, 242, 254, 0.2)' : 'none',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {/* Left: Badge & Name */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '1.4rem' }}>{meta.badge}</span>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ 
                            fontWeight: 800, 
                            fontSize: '0.95rem', 
                            color: isCurrent ? 'var(--neon-cyan)' : (isPassed ? '#fff' : 'var(--text-secondary)') 
                          }}>
                            {t.rank}
                          </span>

                          {isCurrent && (
                            <span style={{
                              background: 'var(--neon-cyan)',
                              color: '#03101d',
                              fontSize: '0.65rem',
                              fontWeight: 900,
                              padding: '1px 7px',
                              borderRadius: '10px',
                              letterSpacing: '0.5px'
                            }}>
                              YOU ARE HERE 📍
                            </span>
                          )}

                          {isPassed && (
                            <span style={{ color: '#00e676', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '3px' }}>
                              <CheckCircle2 size={12} /> Achieved
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Unlocks: <strong style={{ color: 'var(--text-secondary)' }}>{t.arenaUnlock}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Right: RP Requirement */}
                    <div style={{ textAlign: 'right' }}>
                      <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 800,
                        fontSize: '0.88rem',
                        color: isCurrent ? 'var(--neon-cyan)' : (isPassed ? '#00e676' : 'var(--text-muted)')
                      }}>
                        {t.min}+ RP
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        {t.max === 99999 ? 'No limit' : `${t.min} - ${t.max}`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px',
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <button
            className="btn btn-primary btn-3d"
            style={{ padding: '8px 24px', fontWeight: 800 }}
            onClick={() => { playClick(); onClose(); }}
          >
            Got It! Let's Duel
          </button>
        </div>
      </div>
    </div>
  );
}
