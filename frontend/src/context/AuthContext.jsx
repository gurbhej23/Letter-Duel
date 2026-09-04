import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('letter_duel_token'));
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

  const login = (authToken, userData) => {
    localStorage.setItem('letter_duel_token', authToken);
    setToken(authToken);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('letter_duel_token');
    setToken(null);
    setUser(null);
  };

  const updateUser = (updated) => {
    setUser(prev => ({ ...prev, ...updated }));
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, updateUser, refreshUser: () => token && fetchMe(token) }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
