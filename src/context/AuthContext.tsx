import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { AcademicYear, User } from '../types';
import {
  ApiError,
  SESSION_PERSISTENCE_CONFIG,
  apiRequest,
  getCachedUser,
  getStoredToken,
  setCachedUser,
  setStoredToken,
} from '../utils/api';

interface RegisterPayload {
  name: string;
  email: string;
  phone: string;
  password: string;
  year: AcademicYear;
  adminCode?: string;
  acceptedTerms: boolean;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  justRegistered: boolean;
  suspensionNotice: string | null;
  clearSuspensionNotice: () => void;
  clearJustRegistered: () => void;
  login: (identifier: string, password: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUserDirect: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const AUTO_REFRESH_INTERVAL_MS = 4 * 60 * 1000;
const FOCUS_REFRESH_THROTTLE_MS = 30 * 1000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initialToken = getStoredToken();
  const initialCachedUser = initialToken ? getCachedUser() : null;

  const [user, setUser] = useState<User | null>(initialCachedUser);
  const [loading, setLoading] = useState<boolean>(!initialCachedUser);
  const [justRegistered, setJustRegistered] = useState<boolean>(false);
  const [suspensionNotice, setSuspensionNotice] = useState<string | null>(null);

  const lastRefreshAtRef = useRef<number>(0);
  const retryTimerRef = useRef<number | null>(null);

  const clearRetryTimer = () => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  };

  const applyAuthenticatedUser = useCallback((nextUser: User, nextToken?: string) => {
    if (nextToken) {
      setStoredToken(nextToken);
    }
    setCachedUser(nextUser);
    setUser(nextUser);
  }, []);

  const clearAuthenticatedSession = useCallback(() => {
    setStoredToken(null);
    setCachedUser(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    lastRefreshAtRef.current = Date.now();
    clearRetryTimer();

    try {
      const data = await apiRequest<{ token?: string; user: User }>('/api/auth/me');
      applyAuthenticatedUser(data.user, data.token);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          // Session explicitly missing, expired, or revoked on the server
          clearAuthenticatedSession();
          return;
        }
        if (err.status === 403 && err.suspended) {
          clearAuthenticatedSession();
          setSuspensionNotice(
            err.message ||
              'تم حظر حسابك مؤقتاً لمخالفة الشروط والأحكام، ولا يمكن الدخول إلا بإذن من الأدمن.'
          );
          return;
        }
      }

      // Transient network / 502 / 503 deployment rollout error:
      // NEVER wipe localStorage or force logout; preserve cached session and retry silently
      if (SESSION_PERSISTENCE_CONFIG.autoRefreshToken && getStoredToken()) {
        retryTimerRef.current = window.setTimeout(() => {
          void refreshUser();
        }, 5000);
      }
    } finally {
      setLoading(false);
    }
  }, [applyAuthenticatedUser, clearAuthenticatedSession]);

  useEffect(() => {
    void refreshUser();
    return () => clearRetryTimer();
  }, [refreshUser]);

  // Smooth auto-refresh on tab focus, network recovery, and periodic interval
  useEffect(() => {
    if (!SESSION_PERSISTENCE_CONFIG.autoRefreshToken) return;

    const maybeSilentRefresh = () => {
      if (document.visibilityState !== 'visible') return;
      if (!getStoredToken() && !user) return;
      if (Date.now() - lastRefreshAtRef.current < FOCUS_REFRESH_THROTTLE_MS) return;
      void refreshUser();
    };

    const handleOnline = () => {
      if (getStoredToken() || user) {
        void refreshUser();
      }
    };

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible' && (getStoredToken() || user)) {
        void refreshUser();
      }
    }, AUTO_REFRESH_INTERVAL_MS);

    document.addEventListener('visibilitychange', maybeSilentRefresh);
    window.addEventListener('online', handleOnline);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', maybeSilentRefresh);
      window.removeEventListener('online', handleOnline);
    };
  }, [refreshUser, user]);

  // Cross-tab synchronization when logging in/out in another tab
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SESSION_PERSISTENCE_CONFIG.storageKey) {
        if (!e.newValue) {
          setCachedUser(null);
          setUser(null);
        } else {
          void refreshUser();
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refreshUser]);

  useEffect(() => {
    const onSuspended = (event: Event) => {
      const custom = event as CustomEvent<string>;
      clearAuthenticatedSession();
      setJustRegistered(false);
      setSuspensionNotice(
        custom.detail ||
          'تم حظر حسابك مؤقتاً لمخالفة الشروط والأحكام، ولا يمكن الدخول إلا بإذن من الأدمن.'
      );
    };
    const onUnauthorized = () => {
      clearRetryTimer();
      clearAuthenticatedSession();
      setJustRegistered(false);
    };
    window.addEventListener('mvia:suspended', onSuspended);
    window.addEventListener('mvia:unauthorized', onUnauthorized);
    return () => {
      window.removeEventListener('mvia:suspended', onSuspended);
      window.removeEventListener('mvia:unauthorized', onUnauthorized);
    };
  }, [clearAuthenticatedSession]);

  const login = useCallback(
    async (identifier: string, password: string) => {
      const data = await apiRequest<{ token: string; user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      });
      setSuspensionNotice(null);
      setJustRegistered(false);
      applyAuthenticatedUser(data.user, data.token);
    },
    [applyAuthenticatedUser]
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      const data = await apiRequest<{ token: string; user: User }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setJustRegistered(true);
      applyAuthenticatedUser(data.user, data.token);
    },
    [applyAuthenticatedUser]
  );

  const logout = useCallback(async () => {
    clearRetryTimer();
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore if session already expired
    } finally {
      setJustRegistered(false);
      clearAuthenticatedSession();
    }
  }, [clearAuthenticatedSession]);

  const setUserDirect = useCallback((nextUser: User) => {
    setCachedUser(nextUser);
    setUser(nextUser);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        justRegistered,
        suspensionNotice,
        clearSuspensionNotice: () => setSuspensionNotice(null),
        clearJustRegistered: () => setJustRegistered(false),
        login,
        register,
        logout,
        refreshUser,
        setUserDirect,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

