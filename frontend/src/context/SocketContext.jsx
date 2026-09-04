import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useSound } from './SoundContext';
import confetti from 'canvas-confetti';
import { getWsUrl } from '../utils/api';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { token, user } = useAuth();
  const sound = useSound();
  const [connected, setConnected] = useState(false);
  const [currentRoomCode, setCurrentRoomCode] = useState(() => sessionStorage.getItem('letter_duel_room_code') || null);
  const [gameState, setGameState] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [typingUser, setTypingUser] = useState(null);
  const [disconnectTimer, setDisconnectTimer] = useState(null);
  const [toasts, setToasts] = useState([]);

  const wsRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const activeRoomRef = useRef(sessionStorage.getItem('letter_duel_room_code') || null);
  const prevTurnPlayerIdRef = useRef(null);

  const addToast = useCallback((message, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev.slice(-4), { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  const triggerConfetti = useCallback(() => {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#00f2fe', '#8e2de2', '#ffb300', '#00e676']
    });
  }, []);

  const send = useCallback((type, data = {}) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, data }));
    } else {
      console.warn("WebSocket not connected, cannot send:", type, data);
    }
  }, []);

  const connectToRoom = useCallback((roomCode) => {
    if (!roomCode || !token) return;
    activeRoomRef.current = roomCode;
    sessionStorage.setItem('letter_duel_room_code', roomCode);
    setCurrentRoomCode(roomCode);

    if (wsRef.current) {
      wsRef.current.close();
    }

    const wsUrl = getWsUrl(roomCode, token);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      reconnectAttempts.current = 0;
      setDisconnectTimer(null);
      addToast(`Connected to Room ${roomCode}`, "success");
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const { type, data } = payload;

        if (type === "game_state") {
          setGameState(data);
          
          // Detect turn switch to current player
          if (data.current_turn_player_id === user?.id && prevTurnPlayerIdRef.current !== user?.id) {
            sound.playTurnChange();
            addToast("It's YOUR turn! Guess a letter or the full word.", "primary");
          }
          prevTurnPlayerIdRef.current = data.current_turn_player_id;
        }
        else if (type === "player_joined") {
          addToast(data.message, "info");
        }
        else if (type === "game_starting") {
          sound.playCountdown();
          addToast(data.message, "primary");
        }
        else if (type === "guess_result") {
          if (data.result) {
            sound.playHit();
          } else {
            sound.playMiss();
          }
        }
        else if (type === "word_guess_result") {
          if (data.result) {
            sound.playVictory();
            triggerConfetti();
          } else {
            sound.playMiss();
            addToast(`Full word guess failed! ${data.attempts_left} attempts left.`, "warning");
          }
        }
        else if (type === "turn_timeout") {
          sound.playTurnChange();
          addToast(`⏰ 60s expired! Turn passed to ${data.next_turn_username}.`, "warning");
        }
        else if (type === "game_won") {
          if (data.winner_id === user?.id) {
            sound.playVictory();
            triggerConfetti();
            addToast("VICTORY! You won the Letter Duel! 🏆", "success");
          } else {
            sound.playDefeat();
            addToast("Game Over! Opponent won the duel.", "danger");
          }
        }
        else if (type === "opponent_disconnected") {
          addToast(data.message, "warning");
          setDisconnectTimer(data.grace_seconds || 60);
        }
        else if (type === "reconnected") {
          addToast(data.message, "success");
          setDisconnectTimer(null);
        }
        else if (type === "player_left") {
          addToast(data.message || "Player left the room.", "warning");
        }
        else if (type === "chat_message") {
          setChatMessages(prev => [...prev.slice(-99), data]);
        }
        else if (type === "typing") {
          if (data.is_typing) {
            setTypingUser(data.username);
            setTimeout(() => setTypingUser(null), 3000);
          } else {
            setTypingUser(null);
          }
        }
        else if (type === "error") {
          addToast(data.message, "danger");
        }
      } catch (err) {
        console.error("WebSocket message parsing error:", err);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      // Auto-reconnect if unexpectedly closed
      if (activeRoomRef.current && reconnectAttempts.current < 5) {
        reconnectAttempts.current += 1;
        setTimeout(() => {
          if (activeRoomRef.current) {
            connectToRoom(activeRoomRef.current);
          }
        }, 2000);
      }
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
    };
  }, [token, user?.id, sound, addToast, triggerConfetti]);

  const leaveRoom = useCallback((forfeit = false) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({
          type: forfeit ? 'forfeit' : 'leave_room',
          data: { reason: forfeit ? 'FORFEIT_SURRENDER' : 'PLAYER_LEFT' }
        }));
      } catch (e) {
        console.error("Error sending leave/forfeit event:", e);
      }
    }
    activeRoomRef.current = null;
    sessionStorage.removeItem('letter_duel_room_code');
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
    setCurrentRoomCode(null);
    setGameState(null);
    setChatMessages([]);
    setDisconnectTimer(null);
  }, []);

  const disconnect = useCallback(() => {
    leaveRoom(false);
  }, [leaveRoom]);

  // Clean up and leave room immediately on logout (when token becomes null)
  useEffect(() => {
    if (!token && (connected || wsRef.current || currentRoomCode || activeRoomRef.current)) {
      leaveRoom(true);
    }
  }, [token, connected, currentRoomCode, leaveRoom]);

  // Auto-reconnect on mount or page refresh when user token is ready
  useEffect(() => {
    const savedRoom = sessionStorage.getItem('letter_duel_room_code');
    if (savedRoom && token && !connected && !wsRef.current) {
      connectToRoom(savedRoom);
    }
  }, [token, connected, connectToRoom]);

  const sendEvent = useCallback((type, data = {}) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, data }));
    }
  }, []);

  return (
    <SocketContext.Provider value={{
      connected,
      currentRoomCode,
      gameState,
      chatMessages,
      typingUser,
      disconnectTimer,
      toasts,
      connectToRoom,
      disconnect,
      leaveRoom,
      sendEvent,
      addToast
    }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
