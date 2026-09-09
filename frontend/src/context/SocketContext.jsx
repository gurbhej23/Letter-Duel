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
  const [opponentDisconnected, setOpponentDisconnected] = useState(null);
  const [opponentReconnectedNotice, setOpponentReconnectedNotice] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [serverClockOffset, setServerClockOffset] = useState(0);

  const wsRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const intentionalCloseRef = useRef(false);
  const activeRoomRef = useRef(
    localStorage.getItem('letter_duel_room_code') || sessionStorage.getItem('letter_duel_room_code') || null
  );
  const prevTurnPlayerIdRef = useRef(null);
  const prevTurnNumberRef = useRef(null);
  const latestStateVersionRef = useRef(0);

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

  const [onlineCount, setOnlineCount] = useState(1);
  const pingIntervalRef = useRef(null);
  const typingClearTimeoutRef = useRef(null);

  // Initial fetch for online count
  useEffect(() => {
    let isMounted = true;
    fetch('/api/presence/stats')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (isMounted && data && typeof data.online_count === 'number') {
          setOnlineCount(Math.max(1, data.online_count));
        }
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, []);

  const send = useCallback((type, data = {}) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, data }));
    } else {
      console.warn("WebSocket not connected, cannot send:", type, data);
    }
  }, []);

  // Optimistic UI chat message sender
  const sendChatMessage = useCallback((text) => {
    const trimmed = (text || '').trim();
    if (!trimmed || !user) return;

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const optimisticMsg = {
      id: messageId,
      message_id: messageId,
      sender_id: user.id,
      sender_username: user.username,
      sender_avatar: user.avatar,
      message: trimmed.slice(0, 500),
      is_system: false,
      timestamp: new Date().toISOString(),
      pending: true
    };

    // Render immediately on sender UI (Zero delay)
    setChatMessages(prev => [...prev.slice(-99), optimisticMsg]);

    // Transmit over WebSocket with message_id for server broadcast & de-duplication
    send('chat_message', {
      message: trimmed.slice(0, 500),
      message_id: messageId
    });
  }, [user, send]);

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
    prevTurnNumberRef.current = null;
    latestStateVersionRef.current = 0;
    setOpponentDisconnected(null);
    setOpponentReconnectedNotice(null);

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

      // Start periodic 20-second heartbeat ping to keep connection alive & refresh presence
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 20000);
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const { type, data } = payload;

        if (type === "presence_update") {
          if (data && typeof data.online_count === 'number') {
            setOnlineCount(Math.max(1, data.online_count));
          }
        }
        else if (type === "pong") {
          if (data && typeof data.online_count === 'number') {
            setOnlineCount(Math.max(1, data.online_count));
          }
        }
        else if (type === "game_state" || type === "game_state_sync") {
          if (typeof data.state_version === 'number' && data.state_version < latestStateVersionRef.current) {
            return; // Ignore stale out-of-order packet
          }
          if (typeof data.state_version === 'number') {
            latestStateVersionRef.current = data.state_version;
          }

          setGameState(data);
          
          if (data.server_time) {
            const offset = Date.parse(data.server_time) - Date.now();
            setServerClockOffset(offset);
          }

          // Detect REAL turn switch to current player
          // Only fire audio/toast when:
          // 1. prevTurnNumberRef is not null (so NOT on initial load or page reconnect)
          // 2. data.turn_number > prevTurnNumberRef.current
          // 3. current_turn_player_id is this user
          // 4. Game state is PLAYING
          if (
            data.state === "PLAYING" &&
            prevTurnNumberRef.current !== null &&
            typeof data.turn_number === 'number' &&
            data.turn_number > prevTurnNumberRef.current &&
            data.current_turn_player_id === user?.id
          ) {
            sound.playTurnChange();
            addToast("It's YOUR turn! Guess a letter or the full word.", "primary");
          }
          prevTurnPlayerIdRef.current = data.current_turn_player_id;
          if (typeof data.turn_number === 'number') {
            prevTurnNumberRef.current = data.turn_number;
          }
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
            addToast(`⏰ 30s expired! ${timedOutUser} lost 1 lifeline (${lives}/3 remaining). Turn passed.`, "warning");
          }
        }
        else if (type === "game_won") {
          if (data.winner_id === user?.id) {
            sound.playVictory();
            triggerConfetti();
            const coinsWon = data.rewards?.winner_coins_won || 100;
            addToast(`VICTORY! You won +${coinsWon} Coins! 🏆`, "success");
          } else {
            sound.playDefeat();
            addToast("Game Over! Opponent won the duel.", "danger");
          }
          if (data.rewards) {
            setGameState(prev => prev ? { ...prev, rewards: data.rewards } : prev);
          }
        }
        else if (type === "opponent_disconnected") {
          setOpponentDisconnected(data);
          setDisconnectTimer(data.grace_seconds || 60);
          addToast(data.message, "warning");
        }
        else if (type === "opponent_reconnected" || type === "reconnected") {
          setOpponentDisconnected(null);
          setDisconnectTimer(null);
          if (data.player_id && data.player_id !== user?.id) {
            setOpponentReconnectedNotice(data.message || "Opponent reconnected ✓ Game resumed");
            setTimeout(() => {
              setOpponentReconnectedNotice(null);
            }, 4000);
          }
        }
        else if (type === "player_left") {
          addToast(data.message || "Player left the room.", "warning");
        }
        else if (type === "chat_message") {
          // De-duplicate: If message with same message_id exists (optimistic), replace it; otherwise append
          const incomingKey = data.message_id || data.id;
          setChatMessages(prev => {
            const matchIdx = prev.findIndex(m => 
              (incomingKey && (m.message_id === incomingKey || m.id === incomingKey)) ||
              (m.sender_id === data.sender_id && m.message === data.message && m.pending)
            );
            if (matchIdx !== -1) {
              const clone = [...prev];
              clone[matchIdx] = { ...data, pending: false };
              return clone;
            }
            return [...prev.slice(-99), { ...data, pending: false }];
          });
        }
        else if (type === "typing") {
          if (data.is_typing) {
            setTypingUser(data.username);
            if (typingClearTimeoutRef.current) clearTimeout(typingClearTimeoutRef.current);
            typingClearTimeoutRef.current = setTimeout(() => setTypingUser(null), 3000);
          } else {
            setTypingUser(null);
            if (typingClearTimeoutRef.current) clearTimeout(typingClearTimeoutRef.current);
          }
        }
        else if (type === "error") {
          addToast(data.message, "danger");
          if (data.message === "Room is full." || data.message === "Room not found." || data.message?.includes("Unauthorized")) {
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
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
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
      // Give websocket send buffer 50ms before closing socket
      setTimeout(() => {
        if (wsRef.current) {
          try { wsRef.current.close(); } catch {}
          wsRef.current = null;
        }
      }, 50);
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
    setOpponentDisconnected(null);
    setOpponentReconnectedNotice(null);
    prevTurnNumberRef.current = null;
    latestStateVersionRef.current = 0;
  }, [token, currentRoomCode]);

  const disconnect = useCallback(() => {
    leaveRoom(false);
  }, [leaveRoom]);

  const prevTokenRef = useRef(token);

  // Clean up and close WebSocket immediately on logout or user switch
  useEffect(() => {
    if (!token) {
      intentionalCloseRef.current = true;
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      if (wsRef.current) {
        try {
          wsRef.current.close(1000, "User logged out");
        } catch {}
        wsRef.current = null;
      }
      setConnected(false);
      activeRoomRef.current = null;
      setCurrentRoomCode(null);
      setGameState(null);
      setChatMessages([]);
      setDisconnectTimer(null);
      sessionStorage.removeItem('letter_duel_room_code');
      localStorage.removeItem('letter_duel_room_code');
      sessionStorage.removeItem('letter_duel_view');
    } else if (prevTokenRef.current && prevTokenRef.current !== token) {
      // User identity switched: disconnect previous socket cleanly
      intentionalCloseRef.current = true;
      if (wsRef.current) {
        try {
          wsRef.current.close(1000, "User switched");
        } catch {}
        wsRef.current = null;
      }
      setConnected(false);
      activeRoomRef.current = null;
      setCurrentRoomCode(null);
      setGameState(null);
      setChatMessages([]);
    }
    prevTokenRef.current = token;
  }, [token]);

  // Handle mobile app switch / tab hidden-to-visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const storedRoom = activeRoomRef.current || localStorage.getItem('letter_duel_room_code') || sessionStorage.getItem('letter_duel_room_code');
        if (storedRoom && (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED)) {
          connectToRoom(storedRoom);
        } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          send('ping');
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [connectToRoom, send]);

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
      onlineCount,
      disconnectTimer,
      opponentDisconnected,
      opponentReconnectedNotice,
      serverClockOffset,
      toasts,
      connectToRoom,
      disconnect,
      leaveRoom,
      sendEvent,
      sendChatMessage,
      addToast,
      setOpponentDisconnected,
      setOpponentReconnectedNotice
    }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
