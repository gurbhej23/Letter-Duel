import React from 'react';
import { useSound } from '../context/SoundContext';
import { X, BookOpen, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';

export default function HowToPlayModal({ isOpen, onClose }) {
  const { playClick } = useSound();
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '620px' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BookOpen size={24} color="#00f2fe" />
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem' }}>
              How to Play Letter Duel
            </h2>
          </div>
          <button 
            className="btn btn-secondary btn-icon" 
            style={{ width: '38px', height: '38px', minWidth: '38px', minHeight: '38px' }}
            onClick={() => { playClick(); onClose(); }}
            title="Close"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.92rem', lineHeight: '1.5' }}>
          <div style={{ background: 'var(--bg-surface)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontWeight: '700', color: 'var(--neon-cyan)', marginBottom: '4px' }}>
              1. Secret Word Selection
            </div>
            <div>
              Both duelists secretly pick a word between <strong>3 and 20 letters</strong>. Neither player ever sees the other’s raw word—only its total letter count is revealed!
            </div>
          </div>

          <div style={{ background: 'rgba(255, 42, 109, 0.08)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255, 42, 109, 0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '800', color: 'var(--neon-rose)', marginBottom: '6px' }}>
              <AlertCircle size={18} />
              CRITICAL RULE: STRICT TURN SWITCHING
            </div>
            <div>
              Every player guesses exactly <strong>ONE letter per turn</strong>.
              <br />
              After the guess, the turn <strong>ALWAYS switches</strong> to the opponent regardless of whether the answer is <strong>YES</strong> or <strong>NO</strong>!
              <div style={{ marginTop: '8px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <span className="badge badge-rose">YES → Turn Switches</span>
                <span className="badge badge-rose">NO → Turn Switches</span>
                <span className="badge badge-cyan">Never get extra turns</span>
              </div>
            </div>
          </div>

          <div style={{ background: 'var(--bg-surface)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontWeight: '700', color: 'var(--neon-amber)', marginBottom: '8px' }}>
              Turn Example (Bananas vs Apple)
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.84rem', background: '#0a0e17', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div>Player 1 chooses: <strong>BANANAS</strong> (7 letters)</div>
              <div>Player 2 chooses: <strong>APPLE</strong> (5 letters)</div>
              <div style={{ margin: '8px 0', borderBottom: '1px dashed rgba(255,255,255,0.1)' }}></div>
              <div>• <strong>P1</strong> guesses "A" → <strong>YES!</strong> (Slot revealed in APPLE)</div>
              <div style={{ color: 'var(--neon-cyan)' }}>↳ Turn switches immediately to Player 2.</div>
              <div>• <strong>P2</strong> guesses "B" → <strong>YES!</strong> (Slot revealed in BANANAS)</div>
              <div style={{ color: 'var(--neon-cyan)' }}>↳ Turn switches immediately to Player 1.</div>
              <div>• <strong>P1</strong> guesses "Z" → <strong>NO!</strong></div>
              <div style={{ color: 'var(--neon-cyan)' }}>↳ Turn switches immediately to Player 2.</div>
            </div>
          </div>

          <div style={{ background: 'var(--bg-surface)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontWeight: '700', color: 'var(--neon-emerald)', marginBottom: '4px' }}>
              3. Repeated Letters & Winning
            </div>
            <div>
              When you guess a letter, <strong>all occurrences</strong> of that letter are unlocked (e.g. guessing 'A' on <code>BANANAS</code> reveals <code>_ A _ A _ A _</code>).
            </div>
            <div style={{ marginTop: '8px' }}>
              You win by revealing all letters, or by using <strong>Guess Full Word</strong> (max 3 high-stakes attempts per duel!).
            </div>
          </div>

          <div style={{ background: 'rgba(255, 179, 0, 0.08)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255, 179, 0, 0.25)' }}>
            <div style={{ fontWeight: '700', color: 'var(--neon-amber)', marginBottom: '4px' }}>
              4. 30s Turn Timer & 3 Lifelines
            </div>
            <div>
              Every turn has an authoritative <strong>30-second timer</strong>. If the timer runs out before you make a move, you lose <strong>1 lifeline (❤️)</strong> and turn passes. If you run out of all <strong>3 lifelines</strong>, you are disqualified and your opponent wins!
            </div>
          </div>
        </div>

        <button 
          className="btn btn-primary" 
          style={{ width: '100%', marginTop: '20px' }}
          onClick={() => { playClick(); onClose(); }}
        >
          Got it, Ready to Duel!
        </button>
      </div>
    </div>
  );
}
