import React, { useState, useEffect, useRef } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SoundProvider, useSound } from './context/SoundContext';
import { SocketProvider, useSocket } from './context/SocketContext';
import Navbar from './components/Navbar';
import InteractiveBackground from './components/InteractiveBackground';
import LandingPage from './pages/LandingPage';
import LobbyPage from './pages/LobbyPage';
import GameArena from './pages/GameArena';
import TournamentPage from './pages/TournamentPage';
import WordSelectModal from './pages/WordSelectModal';
import AuthModal from './components/AuthModal';
import HowToPlayModal from './components/HowToPlayModal';
import LeaderboardModal from './components/LeaderboardModal';
import FriendsModal from './components/FriendsModal';
import ProfileModal from './components/ProfileModal';
import MatchmakingModal from './components/MatchmakingModal';
import ActiveMatchModal from './components/ActiveMatchModal';
import RankRoadmapModal from './components/RankRoadmapModal';
import ToastContainer from './components/ToastContainer';

function MainApp() {
  const { user, token } = useAuth();
  const sound = useSound();
  const { currentRoomCode, gameState, connectToRoom, disconnect, addToast } = useSocket();

  // Modal open states
  const [authOpen, setAuthOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [rankRoadmapOpen, setRankRoadmapOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [matchmakingOpen, setMatchmakingOpen] = useState(false);
  const [activeMatch, setActiveMatch] = useState(null);
  const [tournamentOpen, setTournamentOpen] = useState(() => {
    return sessionStorage.getItem('letter_duel_tournament_open') === 'true';
  });
  const [incomingChallenge, setIncomingChallenge] = useState(null);
  const [pendingFriendsCount, setPendingFriendsCount] = useState(0);

  const seenInvitesRef = useRef(new Set());
  const seenFriendRequestsRef = useRef(new Set());

  // Check for active match on mount / login if not currently connected
  useEffect(() => {
    if (!token || currentRoomCode) {
      setActiveMatch(null);
      return;
    }

    const checkActiveMatch = async () => {
      try {
        const res = await fetch('/api/game/active', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.active && data.can_rejoin) {
            setActiveMatch(data);
          } else {
            setActiveMatch(null);
          }
        }
      } catch (err) {
        // silent
      }
    };

    checkActiveMatch();
  }, [token, currentRoomCode]);

  const handleOpenTournament = () => {
    sessionStorage.setItem('letter_duel_tournament_open', 'true');
    setTournamentOpen(true);
  };

  const handleCloseTournament = () => {
    sessionStorage.removeItem('letter_duel_tournament_open');
    setTournamentOpen(false);
  };

  // Poll for room invitations and pending friend requests when logged in
  useEffect(() => {
    if (!token) return;

    const pollNotifications = async () => {
      // 1. Poll room invitations (when not in a room)
      if (!currentRoomCode) {
        try {
          const res = await fetch('/api/friends/invites', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const invites = await res.json();
            if (invites && invites.length > 0) {
              const last = invites[invites.length - 1];
              const inviteKey = `${last.sender_username}_${last.room_code}`;
              if (!seenInvitesRef.current.has(inviteKey)) {
                seenInvitesRef.current.add(inviteKey);
                setIncomingChallenge(last);
                try { sound.playVictory(); } catch { }
                addToast(`⚔️ ${last.sender_username} challenged you to a 1v1 duel!`, "primary");
              }
            }
          }
        } catch (e) {
          // silent
        }
      }

      // 2. Poll pending friend requests (for red badge circle and notifications)
      try {
        const reqRes = await fetch('/api/friends/requests/pending', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (reqRes.ok) {
          const pendingList = await reqRes.json();
          if (Array.isArray(pendingList)) {
            setPendingFriendsCount(pendingList.length);

            // Trigger notification for each incoming request
            pendingList.forEach(req => {
              const reqId = req.id;
              if (!seenFriendRequestsRef.current.has(reqId)) {
                seenFriendRequestsRef.current.add(reqId);
                const senderName = req.requester?.username || "A duelist";
                try { sound.playHit(); } catch { }
                addToast(`🔔 ${senderName} sent you a friend request!`, "primary");
              }
            });
          }
        }
      } catch (e) {
        // silent
      }
    };

    pollNotifications();
    const interval = setInterval(pollNotifications, 3500);

    return () => clearInterval(interval);
  }, [token, currentRoomCode, addToast, sound]);

  const handleRoomCreated = (code) => {
    connectToRoom(code);
  };

  const handleRoomJoined = (code) => {
    connectToRoom(code);
  };

  const handleLeave = () => {
    disconnect();
  };

  // Keep track of view preference to avoid flash on refresh
  useEffect(() => {
    if (gameState?.state === 'PLAYING' || gameState?.state === 'GAME_OVER') {
      sessionStorage.setItem('letter_duel_view', 'arena');
    } else if (gameState?.state === 'WAITING' || gameState?.state === 'READY' || gameState?.state === 'WORD_SELECTION') {
      sessionStorage.setItem('letter_duel_view', 'lobby');
    } else if (!currentRoomCode) {
      sessionStorage.removeItem('letter_duel_view');
    }
  }, [gameState?.state, currentRoomCode]);

  // Determine view
  let currentView = 'landing';
  if (user && currentRoomCode) {
    const savedView = sessionStorage.getItem('letter_duel_view');
    if (gameState?.state === 'PLAYING' || gameState?.state === 'GAME_OVER') {
      currentView = 'arena';
    } else if (gameState?.state === 'WAITING' || gameState?.state === 'READY') {
      currentView = 'lobby';
    } else if (savedView === 'arena') {
      currentView = 'arena';
    } else {
      currentView = 'lobby';
    }
  } else if (user && tournamentOpen) {
    currentView = 'tournament';
  }

  const isWordSelectOpen = Boolean(user && currentRoomCode && gameState?.state === 'WORD_SELECTION');
  const anyModalOpen = Boolean(authOpen || tutorialOpen || leaderboardOpen || rankRoadmapOpen || friendsOpen || profileOpen || isWordSelectOpen || matchmakingOpen || activeMatch?.active);
  useEffect(() => {
    if (!anyModalOpen) {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }
  }, [anyModalOpen]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <InteractiveBackground />
      <Navbar
        onOpenAuth={() => setAuthOpen(true)}
        onOpenTutorial={() => setTutorialOpen(true)}
        onOpenLeaderboard={() => setLeaderboardOpen(true)}
        onOpenRankModal={() => setRankRoadmapOpen(true)}
        onOpenFriends={() => setFriendsOpen(true)}
        onOpenProfile={() => setProfileOpen(true)}
        pendingFriendsCount={pendingFriendsCount}
        onOpenTournaments={() => {
          if (!user) {
            setAuthOpen(true);
          } else {
            handleOpenTournament();
          }
        }}
      />

      <main style={{ flex: 1 }}>
        {currentView === 'landing' && (
          <LandingPage
            onOpenAuth={() => setAuthOpen(true)}
            onOpenTutorial={() => setTutorialOpen(true)}
            onOpenLeaderboard={() => setLeaderboardOpen(true)}
            onOpenRankModal={() => setRankRoadmapOpen(true)}
            onOpenMatchmaking={() => setMatchmakingOpen(true)}
            onRoomCreated={handleRoomCreated}
            onRoomJoined={handleRoomJoined}
            onOpenTournaments={() => {
              if (!user) {
                setAuthOpen(true);
              } else {
                handleOpenTournament();
              }
            }}
          />
        )}

        {currentView === 'tournament' && (
          <TournamentPage
            onBackToHome={handleCloseTournament}
            onEnterMatch={(code) => {
              sessionStorage.setItem('letter_duel_tournament_open', 'true');
              connectToRoom(code);
            }}
          />
        )}

        {currentView === 'lobby' && (
          <LobbyPage
            roomCode={currentRoomCode}
            onLeaveRoom={handleLeave}
            onOpenFriends={() => setFriendsOpen(true)}
          />
        )}

        {currentView === 'arena' && (
          <GameArena
            roomCode={currentRoomCode}
            onLeaveGame={handleLeave}
            onOpenRankModal={() => setRankRoadmapOpen(true)}
          />
        )}
      </main>

      {/* Global Modals */}
      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
      <HowToPlayModal isOpen={tutorialOpen} onClose={() => setTutorialOpen(false)} />
      <LeaderboardModal isOpen={leaderboardOpen} onClose={() => setLeaderboardOpen(false)} />
      <RankRoadmapModal isOpen={rankRoadmapOpen} onClose={() => setRankRoadmapOpen(false)} />
      <FriendsModal
        isOpen={friendsOpen}
        onClose={() => setFriendsOpen(false)}
        currentRoomCode={currentRoomCode}
        onRequestsCountChange={setPendingFriendsCount}
        onChallengeCreated={(code) => {
          connectToRoom(code);
        }}
      />
      <ProfileModal 
        isOpen={profileOpen} 
        onClose={() => setProfileOpen(false)} 
        onOpenRankModal={() => {
          setProfileOpen(false);
          setRankRoadmapOpen(true);
        }}
      />
      <WordSelectModal isOpen={isWordSelectOpen} />
      <MatchmakingModal
        isOpen={matchmakingOpen}
        onClose={() => setMatchmakingOpen(false)}
        onMatched={(code) => {
          connectToRoom(code);
        }}
      />
      <ActiveMatchModal
        activeMatch={activeMatch}
        onRejoin={(code) => {
          setActiveMatch(null);
          sessionStorage.setItem('letter_duel_view', 'arena');
          connectToRoom(code);
        }}
        onLeave={async () => {
          setActiveMatch(null);
          try {
            if (token) {
              await fetch('/api/rooms/quickmatch/cancel', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
              });
            }
          } catch (e) {
            // ignore
          }
        }}
      />

      {/* Incoming 1v1 Duel Challenge Dialog */}
      {incomingChallenge && (
        <div className="modal-overlay" style={{ zIndex: 1200, backdropFilter: 'blur(12px)' }}>
          <div className="modal-content" style={{ maxWidth: '420px', textAlign: 'center', border: '2px solid var(--neon-cyan)', boxShadow: 'none' }}>
            <div style={{
              width: '58px',
              height: '58px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #00f2fe, #8e2de2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px auto',
              fontSize: '1.8rem',
              boxShadow: 'none'
            }}>
              ⚔️
            </div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.45rem', fontWeight: '900', marginBottom: '8px' }}>
              1v1 DUEL CHALLENGE!
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '22px', lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--text-primary)', fontSize: '1.05rem' }}>{incomingChallenge.sender_username}</strong> has challenged you to an online 1v1 duel in Room <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--neon-cyan)', fontWeight: '800' }}>{incomingChallenge.room_code}</span>!
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button
                className="btn btn-secondary btn-3d"
                onClick={() => {
                  sound.playClick();
                  setIncomingChallenge(null);
                }}
              >
                Decline
              </button>
              <button
                className="btn btn-primary btn-3d"
                style={{ fontWeight: '800', boxShadow: 'none' }}
                onClick={async () => {
                  sound.playHit();
                  const code = incomingChallenge.room_code;
                  setIncomingChallenge(null);
                  try {
                    await fetch('/api/rooms/join', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                      },
                      body: JSON.stringify({ room_code: code })
                    });
                  } catch (e) {
                    console.warn("Could not pre-join room:", e);
                  }
                  connectToRoom(code);
                }}
              >
                ⚔️ Accept Duel
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SoundProvider>
          <SocketProvider>
            <MainApp />
          </SocketProvider>
        </SoundProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
