import React, { createContext, useContext, useState } from 'react';
import { soundManager } from '../utils/audio';

const SoundContext = createContext(null);

export function SoundProvider({ children }) {
  const [isMuted, setIsMuted] = useState(soundManager.isMuted);

  const toggleMute = () => {
    const next = soundManager.toggleMute();
    setIsMuted(next);
  };

  const playClick = () => soundManager.playClick();
  const playKey = () => soundManager.playKey();
  const playHit = () => soundManager.playHit();
  const playMiss = () => soundManager.playMiss();
  const playTurnChange = () => soundManager.playTurnChange();
  const playCountdown = () => soundManager.playCountdown();
  const playVictory = () => soundManager.playVictory();
  const playDefeat = () => soundManager.playDefeat();

  return (
    <SoundContext.Provider value={{
      isMuted,
      toggleMute,
      playClick,
      playKey,
      playHit,
      playMiss,
      playTurnChange,
      playCountdown,
      playVictory,
      playDefeat
    }}>
      {children}
    </SoundContext.Provider>
  );
}

export function useSound() {
  return useContext(SoundContext);
}
