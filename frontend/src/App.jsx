import React, { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SoundProvider } from './context/SoundContext';
import { SocketProvider, useSocket } from './context/SocketContext';
import Navbar from './components/Navbar';
import LandingPage from './pages/LandingPage';
import LobbyPage from './pages/LobbyPage';
import GameArena from './pages/GameArena';
import WordSelectModal from './pages/WordSelectModal';
import AuthModal from './components/AuthModal';
import HowToPlayModal from './components/HowToPlayModal';
import LeaderboardModal from './components/LeaderboardModal';
import FriendsModal from './components/FriendsModal';
import ProfileModal from './components/ProfileModal';
import MatchmakingModal from './components/MatchmakingModal';
import ToastContainer from './components/ToastContainer';

function MainApp() {
  const { user, token } = useAuth();
  const { currentRoomCode, gameState, connectToRoom, disconnect, addToast } = useSocket();

  // Modal open states
  const [authOpen, setAuthOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [matchmakingOpen, setMatchmakingOpen] = useState(false);

  const seenInvitesRef = useRef(new Set());

  // Poll for room invitations if user is logged in and not in a room
  useEffect(() => {
    if (!token || currentRoomCode) return;

    const interval = setInterval(async () => {
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
              addToast(`${last.sender_username} challenged you to Room ${last.room_code}!`, "primary");
            }
          }
        }
      } catch (e) {
        // silent
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [token, currentRoomCode, addToast]);

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
  if (currentRoomCode) {
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
  }

  const isWordSelectOpen = currentRoomCode && gameState?.state === 'WORD_SELECTION';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar
        onOpenAuth={() => setAuthOpen(true)}
        onOpenTutorial={() => setTutorialOpen(true)}
        onOpenLeaderboard={() => setLeaderboardOpen(true)}
        onOpenFriends={() => setFriendsOpen(true)}
        onOpenProfile={() => setProfileOpen(true)}
      />

      <main style={{ flex: 1 }}>
        {currentView === 'landing' && (
          <LandingPage
            onOpenAuth={() => setAuthOpen(true)}
            onOpenTutorial={() => setTutorialOpen(true)}
            onOpenLeaderboard={() => setLeaderboardOpen(true)}
            onOpenMatchmaking={() => setMatchmakingOpen(true)}
            onRoomCreated={handleRoomCreated}
            onRoomJoined={handleRoomJoined}
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
          />
        )}
      </main>

      {/* Global Modals */}
      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
      <HowToPlayModal isOpen={tutorialOpen} onClose={() => setTutorialOpen(false)} />
      <LeaderboardModal isOpen={leaderboardOpen} onClose={() => setLeaderboardOpen(false)} />
      <FriendsModal 
        isOpen={friendsOpen} 
        onClose={() => setFriendsOpen(false)} 
        currentRoomCode={currentRoomCode} 
      />
      <ProfileModal isOpen={profileOpen} onClose={() => setProfileOpen(false)} />
      <WordSelectModal isOpen={isWordSelectOpen} />
      <MatchmakingModal
        isOpen={matchmakingOpen}
        onClose={() => setMatchmakingOpen(false)}
        onMatched={(code) => {
          connectToRoom(code);
        }}
      />

      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SoundProvider>
        <SocketProvider>
          <MainApp />
        </SocketProvider>
      </SoundProvider>
    </AuthProvider>
  );
}
