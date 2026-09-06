import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSound } from '../context/SoundContext';
import { useSocket } from '../context/SocketContext';
import { X, Users, UserPlus, Check, Trash2, Send, Search, Copy, Swords, Shield, Flame, CheckCircle2 } from 'lucide-react';

export default function FriendsModal({ isOpen, onClose, currentRoomCode, onChallengeCreated }) {
  const { user, token } = useAuth();
  const sound = useSound();
  const { playClick, playHit, playMiss } = sound;
  const { addToast } = useSocket();

  const [activeTab, setActiveTab] = useState('list'); // 'list', 'requests', 'search'
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [challengingId, setChallengingId] = useState(null);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    if (isOpen && token) {
      loadFriends();
      loadRequests();

      // Poll friends list every 6 seconds while modal is open for live online status updates
      const interval = setInterval(() => {
        loadFriends();
      }, 6000);

      return () => clearInterval(interval);
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

  const handleCopyMyCode = () => {
    playClick();
    if (!user) return;
    const friendCode = `#${user.username}`;
    navigator.clipboard.writeText(friendCode);
    setCopiedCode(true);
    addToast(`Friend code ${friendCode} copied to clipboard!`, "success");
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    const cleanQ = searchQuery.trim();
    if (!cleanQ) return;
    setLoading(true);
    playClick();
    try {
      const res = await fetch(`/api/friends/search?query=${encodeURIComponent(cleanQ)}`, {
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

  const handleChallengeFriend = async (friendUserId, friendUsername) => {
    playClick();
    setChallengingId(friendUserId);
    try {
      let targetCode = currentRoomCode;

      // If not currently in a room, create a private 1v1 duel room
      if (!targetCode) {
        const createRes = await fetch('/api/rooms', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ allow_custom_words: true })
        });
        if (!createRes.ok) throw new Error('Could not create duel room');
        const roomData = await createRes.json();
        targetCode = roomData.room_code;
      }

      // Send duel invitation to friend
      const inviteRes = await fetch(`/api/friends/invite?receiver_id=${friendUserId}&room_code=${targetCode}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (inviteRes.ok) {
        playHit();
        addToast(`Challenge sent to ${friendUsername}! Waiting in Room ${targetCode}...`, "success");
        onClose();
        if (onChallengeCreated) {
          onChallengeCreated(targetCode);
        }
      } else {
        throw new Error('Failed to send challenge invite');
      }
    } catch (err) {
      playMiss();
      addToast(err.message || 'Could not challenge friend', "warning");
    } finally {
      setChallengingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content card-3d-tilt" style={{ maxWidth: '540px' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={24} color="#00e676" />
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem' }}>
              Friends & Rivals
            </h2>
          </div>
          <button 
            className="btn btn-secondary btn-icon" 
            style={{ width: '34px', height: '34px' }}
            onClick={() => { playClick(); onClose(); }}
          >
            <X size={18} />
          </button>
        </div>

        {/* User's Own Friend Code Card */}
        {user && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(0, 242, 254, 0.07)',
            border: '1px solid rgba(0, 242, 254, 0.25)',
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            marginBottom: '16px',
            gap: '10px'
          }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '800' }}>
                YOUR DUELIST CODE
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.05rem', fontWeight: '800', color: 'var(--neon-cyan)' }}>
                #{user.username}
              </div>
            </div>
            <button 
              className="btn btn-secondary btn-sm btn-3d"
              onClick={handleCopyMyCode}
              title="Copy Friend Code"
              style={{ fontSize: '0.82rem', padding: '6px 12px' }}
            >
              {copiedCode ? <Check size={14} color="#00e676" /> : <Copy size={14} color="#00f2fe" />}
              <span>{copiedCode ? 'Copied!' : 'Share Code'}</span>
            </button>
          </div>
        )}

        {/* Tab Switcher */}
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
              fontSize: '0.85rem',
              fontWeight: activeTab === 'list' ? '700' : '500'
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
              fontSize: '0.85rem',
              fontWeight: activeTab === 'requests' ? '700' : '500'
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
              fontSize: '0.85rem',
              fontWeight: activeTab === 'search' ? '700' : '500'
            }}
            onClick={() => { playClick(); setActiveTab('search'); }}
          >
            Add Friend
          </button>
        </div>

        {/* Tab Content */}
        <div style={{ minHeight: '260px' }}>
          {/* TAB 1: FRIENDS LIST */}
          {activeTab === 'list' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {friends.length === 0 ? (
                <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Users size={36} color="var(--text-muted)" style={{ margin: '0 auto 10px auto', opacity: 0.6 }} />
                  <div style={{ fontWeight: '700', marginBottom: '4px' }}>No friends added yet</div>
                  <div style={{ fontSize: '0.85rem' }}>Share your code or search players in the "Add Friend" tab!</div>
                </div>
              ) : (
                friends.map(f => {
                  const isOnline = f.status === 'online';
                  const isInGame = f.status === 'in-game';

                  return (
                    <div 
                      key={f.friendship_id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        background: 'var(--bg-surface)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-subtle)',
                        gap: '10px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                          <div style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '50%',
                            background: isOnline ? 'linear-gradient(135deg, #00e676, #00b0ff)' : 'linear-gradient(135deg, #00f2fe, #8e2de2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: '800',
                            color: '#03101d',
                            boxShadow: isOnline ? '0 0 12px rgba(0, 230, 118, 0.4)' : 'none'
                          }}>
                            {f.user.username.slice(0, 1).toUpperCase()}
                          </div>
                          {/* Live Online Status Dot */}
                          <div style={{
                            position: 'absolute',
                            bottom: -1,
                            right: -1,
                            width: '11px',
                            height: '11px',
                            borderRadius: '50%',
                            background: isOnline ? '#00e676' : (isInGame ? '#ffb300' : '#64748b'),
                            boxShadow: isOnline ? '0 0 8px #00e676' : (isInGame ? '0 0 8px #ffb300' : 'none'),
                            border: '2px solid #141a29'
                          }} />
                        </div>

                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: '800', fontSize: '0.94rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {f.user.username}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem' }}>
                            <span style={{
                              color: isOnline ? '#00e676' : (isInGame ? '#ffb300' : 'var(--text-muted)'),
                              fontWeight: '700',
                              textTransform: 'capitalize'
                            }}>
                              {isOnline ? 'Online' : (isInGame ? 'In Duel' : 'Offline')}
                            </span>
                            <span style={{ color: 'var(--text-muted)' }}>•</span>
                            <span style={{ color: 'var(--neon-amber)' }}>{f.user.xp} XP</span>
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons: Challenge & Remove */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                        <button
                          className="btn btn-primary btn-sm btn-3d"
                          onClick={() => handleChallengeFriend(f.user.id, f.user.username)}
                          disabled={challengingId === f.user.id}
                          title={`Challenge ${f.user.username} to 1v1 duel`}
                          style={{
                            padding: '6px 12px',
                            fontSize: '0.82rem',
                            fontWeight: '800',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px'
                          }}
                        >
                          <Swords size={14} />
                          <span>{challengingId === f.user.id ? 'Inviting...' : 'Challenge'}</span>
                        </button>

                        <button
                          className="btn btn-secondary btn-icon"
                          style={{ width: '34px', height: '34px', minWidth: '34px' }}
                          onClick={() => removeFriend(f.friendship_id)}
                          title="Remove Friend"
                          aria-label="Remove Friend"
                        >
                          <Trash2 size={14} color="#ff2a6d" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 2: FRIEND REQUESTS */}
          {activeTab === 'requests' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {requests.length === 0 ? (
                <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Shield size={36} color="var(--text-muted)" style={{ margin: '0 auto 10px auto', opacity: 0.6 }} />
                  <div style={{ fontWeight: '700' }}>No pending friend requests</div>
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
                    <div>
                      <div style={{ fontWeight: '800', fontSize: '0.94rem' }}>{r.requester.username}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Wants to be duel rivals</div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button 
                        className="btn btn-primary btn-sm btn-3d"
                        onClick={() => acceptRequest(r.id)}
                        style={{ padding: '6px 12px' }}
                      >
                        <Check size={14} /> Accept
                      </button>
                      <button 
                        className="btn btn-secondary btn-sm"
                        onClick={() => rejectRequest(r.id)}
                        style={{ padding: '6px 10px' }}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 3: ADD FRIEND (Search by username or #friendcode) */}
          {activeTab === 'search' && (
            <div>
              <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Enter friend code or username (e.g. #username)..."
                  style={{
                    flex: 1,
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '10px 14px',
                    color: '#fff',
                    outline: 'none',
                    fontSize: '0.92rem'
                  }}
                />
                <button type="submit" className="btn btn-primary btn-3d" disabled={loading} style={{ padding: '10px 16px' }}>
                  <Search size={16} />
                </button>
              </form>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {searchResults.length === 0 && searchQuery && !loading && (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    No duelists matching "{searchQuery}" found. Make sure the code or username is spelled correctly.
                  </div>
                )}

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
                      <div style={{ fontWeight: '800', fontSize: '0.95rem' }}>{u.username}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Friend Code: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--neon-cyan)' }}>#{u.username}</span> • {u.xp} XP
                      </div>
                    </div>
                    <button
                      className="btn btn-primary btn-sm btn-3d"
                      onClick={() => sendFriendRequest(u.username)}
                      style={{ padding: '6px 14px' }}
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
