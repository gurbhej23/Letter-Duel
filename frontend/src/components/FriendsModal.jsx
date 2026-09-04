import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSound } from '../context/SoundContext';
import { useSocket } from '../context/SocketContext';
import { X, Users, UserPlus, Check, Trash2, Send, Search } from 'lucide-react';

export default function FriendsModal({ isOpen, onClose, currentRoomCode }) {
  const { token } = useAuth();
  const { playClick, playHit, playMiss } = useSound();
  const { addToast } = useSocket();

  const [activeTab, setActiveTab] = useState('list'); // 'list', 'requests', 'search'
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && token) {
      loadFriends();
      loadRequests();
    }
  }, [isOpen, token]);

  const loadFriends = async () => {
    try {
      const res = await fetch('/api/friends', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setFriends(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadRequests = async () => {
    try {
      const res = await fetch('/api/friends/requests/pending', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRequests(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLoading(true);
    playClick();
    try {
      const res = await fetch(`/api/friends/search?query=${encodeURIComponent(searchQuery)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const sendFriendRequest = async (username) => {
    playClick();
    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ receiver_username: username })
      });
      if (res.ok) {
        playHit();
        addToast(`Friend request sent to ${username}`, "success");
        setSearchResults(prev => prev.filter(u => u.username !== username));
      } else {
        const err = await res.json();
        playMiss();
        addToast(err.detail || "Could not send request", "warning");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const acceptRequest = async (friendshipId) => {
    playClick();
    try {
      const res = await fetch(`/api/friends/accept/${friendshipId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        playHit();
        addToast("Friend request accepted!", "success");
        loadFriends();
        loadRequests();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const rejectRequest = async (friendshipId) => {
    playClick();
    try {
      const res = await fetch(`/api/friends/reject/${friendshipId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        loadRequests();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const removeFriend = async (friendshipId) => {
    playClick();
    try {
      const res = await fetch(`/api/friends/${friendshipId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setFriends(prev => prev.filter(f => f.friendship_id !== friendshipId));
        addToast("Friend removed", "info");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const inviteToRoom = async (friendUserId, friendUsername) => {
    if (!currentRoomCode) {
      addToast("You must be in a room to invite a friend.", "warning");
      return;
    }
    playClick();
    try {
      const res = await fetch(`/api/friends/invite?receiver_id=${friendUserId}&room_code=${currentRoomCode}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        playHit();
        addToast(`Invited ${friendUsername} to Room ${currentRoomCode}!`, "success");
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={24} color="#00e676" />
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem' }}>
              Friends & Rivals
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

        {/* Tab Buttons */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          background: 'rgba(0, 0, 0, 0.25)',
          padding: '4px',
          borderRadius: 'var(--radius-md)',
          marginBottom: '16px'
        }}>
          <button
            className="btn"
            style={{
              background: activeTab === 'list' ? 'var(--bg-surface-elevated)' : 'transparent',
              color: activeTab === 'list' ? 'var(--neon-cyan)' : 'var(--text-muted)',
              padding: '8px',
              fontSize: '0.85rem'
            }}
            onClick={() => { playClick(); setActiveTab('list'); }}
          >
            Friends ({friends.length})
          </button>
          <button
            className="btn"
            style={{
              background: activeTab === 'requests' ? 'var(--bg-surface-elevated)' : 'transparent',
              color: activeTab === 'requests' ? 'var(--neon-cyan)' : 'var(--text-muted)',
              padding: '8px',
              fontSize: '0.85rem'
            }}
            onClick={() => { playClick(); setActiveTab('requests'); }}
          >
            Requests ({requests.length})
          </button>
          <button
            className="btn"
            style={{
              background: activeTab === 'search' ? 'var(--bg-surface-elevated)' : 'transparent',
              color: activeTab === 'search' ? 'var(--neon-cyan)' : 'var(--text-muted)',
              padding: '8px',
              fontSize: '0.85rem'
            }}
            onClick={() => { playClick(); setActiveTab('search'); }}
          >
            Add Friend
          </button>
        </div>

        {/* Tab Content */}
        <div style={{ minHeight: '260px' }}>
          {activeTab === 'list' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {friends.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No friends added yet. Search players to start a rivalry!
                </div>
              ) : (
                friends.map(f => (
                  <div 
                    key={f.friendship_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      background: 'var(--bg-surface)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-subtle)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ position: 'relative' }}>
                        <div style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #00f2fe, #4facfe)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: '700',
                          color: '#03101d'
                        }}>
                          {f.user.username.slice(0, 1).toUpperCase()}
                        </div>
                        {/* Status dot */}
                        <div style={{
                          position: 'absolute',
                          bottom: 0,
                          right: 0,
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          background: f.status === 'online' ? '#00e676' : (f.status === 'in-game' ? '#ffb300' : '#64748b'),
                          border: '2px solid #141a29'
                        }} />
                      </div>
                      <div>
                        <div style={{ fontWeight: '700', fontSize: '0.92rem' }}>{f.user.username}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                          {f.status} • {f.user.xp} XP
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {currentRoomCode && (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => inviteToRoom(f.user.id, f.user.username)}
                        >
                          <Send size={14} /> Invite
                        </button>
                      )}
                      <button
                        className="btn btn-secondary btn-icon"
                        style={{ width: '32px', height: '32px' }}
                        onClick={() => removeFriend(f.friendship_id)}
                        title="Remove Friend"
                      >
                        <Trash2 size={14} color="#ff2a6d" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'requests' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {requests.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No pending friend requests.
                </div>
              ) : (
                requests.map(r => (
                  <div 
                    key={r.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      background: 'var(--bg-surface)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-subtle)'
                    }}
                  >
                    <div style={{ fontWeight: '700' }}>{r.requester.username}</div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button 
                        className="btn btn-primary btn-sm"
                        onClick={() => acceptRequest(r.id)}
                      >
                        <Check size={14} /> Accept
                      </button>
                      <button 
                        className="btn btn-secondary btn-sm"
                        onClick={() => rejectRequest(r.id)}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'search' && (
            <div>
              <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search duelists by username..."
                  style={{
                    flex: 1,
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '10px 14px',
                    color: '#fff',
                    outline: 'none'
                  }}
                />
                <button type="submit" className="btn btn-secondary" disabled={loading}>
                  <Search size={16} />
                </button>
              </form>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {searchResults.map(u => (
                  <div 
                    key={u.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      background: 'var(--bg-surface)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-subtle)'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '700' }}>{u.username}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.xp} XP • {u.wins} Wins</div>
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => sendFriendRequest(u.username)}
                    >
                      <UserPlus size={14} /> Add Friend
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
