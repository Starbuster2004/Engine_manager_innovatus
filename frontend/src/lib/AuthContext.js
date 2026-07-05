'use client';
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api, AUTH_ERROR_EVENT_NAME } from '@/lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const checkingRef = useRef(false);

  const checkAuth = useCallback(async () => {
    // Prevent multiple simultaneous auth checks
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      const userData = await api.me();
      setUser(userData);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  // Listen for auth:unauthorized events from the API layer
  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      router.replace('/login');
    };

    window.addEventListener(AUTH_ERROR_EVENT_NAME, handleUnauthorized);
    return () => window.removeEventListener(AUTH_ERROR_EVENT_NAME, handleUnauthorized);
  }, [router]);

  const login = async (username, password) => {
    const res = await api.login(username, password);
    setUser(res.user);
    return res.user;
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // Ignore logout errors — clear state regardless
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
