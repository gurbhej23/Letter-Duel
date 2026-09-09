import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);
const TOKEN_STORAGE_KEY = 'letter_duel_token';

function getStoredToken() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY) || sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw || typeof raw !== 'string') return null;
    const clean = raw.trim();
    if (!clean || clean === 'null' || clean === 'undefined') return null;
    return clean;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(getStoredToken);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      fetchMe(token);
    } else {
      setUser(null);
      setLoading(false);
    }
  }, [token]);

  const fetchMe = async (authToken) => {
    if (!authToken) {
      logout();
      setLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });

      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          console.warn('[Auth] Received non-JSON response for /api/auth/me. Server might be warming up.');
          setLoading(false);
          return;
        }
        const data = await res.json();
        if (data && data.id) {
          setUser(data);
        } else {
          logout();
        }
      } else {
        // Any 401, 403, 404, or non-200 response invalidates current token
        console.warn(`[Auth] /api/auth/me returned status ${res.status}. Resetting session.`);
        logout();
      }
    } catch (e) {
      console.error('[Auth] Failed to verify user profile:', e);
    } finally {
      setLoading(false);
    }
  };

  const login = (authToken, userData, rememberMe = true) => {
    if (!authToken || typeof authToken !== 'string') return;
    const cleanToken = authToken.trim();
    try {
      if (rememberMe) {
        localStorage.setItem(TOKEN_STORAGE_KEY, cleanToken);
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      } else {
        sessionStorage.setItem(TOKEN_STORAGE_KEY, cleanToken);
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    } catch (e) {
      console.warn('[Auth] Storage write failed:', e);
    }
    setToken(cleanToken);
    setUser(userData);
  };

  const logout = () => {
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      // Clean legacy keys if any exist
      localStorage.removeItem('token');
      sessionStorage.removeItem('token');
      localStorage.removeItem('letter_duel_room_code');
      sessionStorage.removeItem('letter_duel_room_code');
      sessionStorage.removeItem('letter_duel_view');
      sessionStorage.removeItem('letter_duel_tournament_open');
    } catch {}
    setToken(null);
    setUser(null);
  };

  const claimDailyBonus = async () => {
    if (!token) return { success: false, message: 'Not logged in' };
    try {
      const res = await fetch('/api/auth/daily-bonus', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache'
        }
      });
      const data = await res.json();
      if (res.ok) {
        setUser(prev => ({
          ...prev,
          coins: data.coins,
          last_daily_bonus: data.last_daily_bonus
        }));
        return { success: true, ...data };
      } else {
        return { success: false, message: data.detail || 'Could not claim daily bonus' };
      }
    } catch (e) {
      return { success: false, message: 'Network error claiming daily bonus' };
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      loading,
      login,
      logout,
      refreshUser: () => token && fetchMe(token),
      claimDailyBonus
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

