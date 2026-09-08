import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => {
    return localStorage.getItem('letter_duel_token') || sessionStorage.getItem('letter_duel_token');
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      fetchMe(token);
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchMe = async (authToken) => {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else if (res.status === 401) {
        logout();
      }
    } catch (e) {
      console.error('Failed to fetch user profile:', e);
    } finally {
      setLoading(false);
    }
  };

  const login = (authToken, userData, rememberMe = true) => {
    if (rememberMe) {
      localStorage.setItem('letter_duel_token', authToken);
      sessionStorage.removeItem('letter_duel_token');
    } else {
      sessionStorage.setItem('letter_duel_token', authToken);
      localStorage.removeItem('letter_duel_token');
    }
    setToken(authToken);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('letter_duel_token');
    sessionStorage.removeItem('letter_duel_token');
    setToken(null);
    setUser(null);
  };

  const claimDailyBonus = async () => {
    if (!token) return { success: false, message: 'Not logged in' };
    try {
      const res = await fetch('/api/auth/daily-bonus', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
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
    <AuthContext.Provider value={{ user, token, loading, login, logout, refreshUser: () => token && fetchMe(token), claimDailyBonus }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
