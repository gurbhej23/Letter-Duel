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
  const [currentRoomCode, setCurrentRoomCode] = useState(() => {
    return localStorage.getItem('letter_duel_room_code') || sessionStorage.getItem('letter_duel_room_code') || null;
  });
  const [gameState, setGameState] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [typingUser, setTypingUser] = useState(null);
  const [disconnectTimer, setDisconnectTimer] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [serverClockOffset, setServerClockOffset] = useState(0);

  const wsRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const intentionalCloseRef = useRef(false);
  const activeRoomRef = useRef(
    localStorage.getItem('letter_duel_room_code') || sessionStorage.getItem('letter_duel_room_code') || null
  );
  const prevTurnPlayerIdRef = useRef(null);

  const addToast = useCallback((message, type = "info") => {
    if (!message) return;
    setToasts(prev => {
      // Deduplicate: do not add if an identical message is already on screen
      if (prev.some(t => t.message === message)) {
        return prev;
      }
      const id = Date.now() + Math.random();
      setTimeout(() => {
        setToasts(curr => curr.filter(t => t.id !== id));
      }, 3500);
      return [...prev.slice(-3), { id, message, type }];
    });
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
    const cleanCode = roomCode.trim().toUpperCase();

    // Guard: Prevent closing and reconnecting if already connected or connecting to this room
    if (activeRoomRef.current === cleanCode && wsRef.current && 
       (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    activeRoomRef.current = cleanCode;
    sessionStorage.setItem('letter_duel_room_code', cleanCode);
    localStorage.setItem('letter_duel_room_code', cleanCode);
    setCurrentRoomCode(cleanCode);

    if (wsRef.current) {
      intentionalCloseRef.current = true;
      wsRef.current.close();
    }

    intentionalCloseRef.current = false;
    const wsUrl = getWsUrl(cleanCode, token);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      reconnectAttempts.current = 0;
      setDisconnectTimer(null);
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const { type, data } = payload;

        if (type === "game_state") {
          setGameState(data);
          
          if (data.server_time) {
            const offset = Date.parse(data.server_time) - Date.now();
            setServerClockOffset(offset);
          }

          // Detect turn switch to current player
          if (data.current_turn_player_id === user?.id && prevTurnPlayerIdRef.current !== user?.id) {
            sound.playTurnChange();
            addToast("It's YOUR turn! Guess a letter or the full word.", "primary");
          }
          prevTurnPlayerIdRef.current = data.current_turn_player_id;
        }
        else if (type === "chat_history") {
          if (Array.isArray(data)) {
            setChatMessages(data);
          }
        }
        else if (type === "player_joined") {
          if (data.player_id && data.player_id !== user?.id) {
            addToast(data.message, "info");
          }
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
          const timedOutUser = data.timed_out_username || "Player";
          const lives = data.lifelines_remaining;
          if (data.game_over) {
            addToast(`⏰ ${timedOutUser} ran out of lifelines (0/3)! Game over.`, "danger");
          } else {
            addToast(`⏰ 60s expired! ${timedOutUser} lost 1 lifeline (${lives}/3 remaining). Turn passed.`, "warning");
          }
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
          if (data.player_id && data.player_id !== user?.id) {
            addToast(data.message, "success");
          }
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
          if (data.message === "Room is full." || data.message === "Room not found.") {
            // Clean local room pointers if rejected
            sessionStorage.removeItem('letter_duel_room_code');
            localStorage.removeItem('letter_duel_room_code');
            sessionStorage.removeItem('letter_duel_view');
            activeRoomRef.current = null;
            setCurrentRoomCode(null);
          }
        }
      } catch (err) {
        console.error("WebSocket message parsing error:", err);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      // Auto-reconnect ONLY if disconnection was unexpected and still in an active room
      if (!intentionalCloseRef.current && activeRoomRef.current && reconnectAttempts.current < 3) {
        reconnectAttempts.current += 1;
        setTimeout(() => {
          if (!intentionalCloseRef.current && activeRoomRef.current) {
            connectToRoom(activeRoomRef.current);
          }
        }, 2000);
      }
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
    };
  }, [token, user?.id, sound, addToast, triggerConfetti]);

  const leaveRoom = useCallback(async (forfeit = false) => {
    const codeToLeave = activeRoomRef.current || currentRoomCode;
    activeRoomRef.current = null;
    sessionStorage.removeItem('letter_duel_room_code');
    localStorage.removeItem('letter_duel_room_code');
    sessionStorage.removeItem('letter_duel_view');

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
    intentionalCloseRef.current = true;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Call REST endpoint to ensure DB room and queue are cleared
    if (token && codeToLeave) {
      try {
        await fetch('/api/rooms/leave', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ room_code: codeToLeave })
        });
      } catch (e) {
        // silent
      }
    }

    setConnected(false);
    setCurrentRoomCode(null);
    setGameState(null);
    setChatMessages([]);
    setDisconnectTimer(null);
  }, [token, currentRoomCode]);

  const disconnect = useCallback(() => {
    leaveRoom(false);
  }, [leaveRoom]);

  // Clean up and leave room immediately on logout (when token becomes null)
  useEffect(() => {
    if (!token && (connected || wsRef.current || currentRoomCode || activeRoomRef.current)) {
      leaveRoom(true);
    }
  }, [token, connected, currentRoomCode, leaveRoom]);

  // Query server for active room and auto-reconnect on mount or page refresh
  useEffect(() => {
    if (!token) return;

    let isMounted = true;
    const checkActiveRoom = async () => {
      try {
        const res = await fetch('/api/rooms/active', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok && isMounted) {
          const data = await res.json();
          if (data.has_active_room && data.room_code) {
            connectToRoom(data.room_code);
            return;
          } else {
            // Server confirmed user has no active match: clean up any stale local keys
            sessionStorage.removeItem('letter_duel_room_code');
            localStorage.removeItem('letter_duel_room_code');
            sessionStorage.removeItem('letter_duel_view');
          }
        }
      } catch {
        // Network error
      }

      if (isMounted) {
        const savedRoom = localStorage.getItem('letter_duel_room_code') || sessionStorage.getItem('letter_duel_room_code');
        if (savedRoom && !connected && !wsRef.current) {
          connectToRoom(savedRoom);
        }
      }
    };

    checkActiveRoom();

    return () => {
      isMounted = false;
    };
  }, [token, connectToRoom]);

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
      serverClockOffset,
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
